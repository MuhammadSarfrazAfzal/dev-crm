"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, type CurrentUser } from "@/lib/auth/current";
import { asUser, DatabaseUnavailableError, type Tx } from "@/lib/db";
import { limits } from "@/lib/rate-limit";
import { nowMs } from "@/lib/clock";
import { CALL_OUTCOMES, DEAL_STAGES, EMAIL_STATUSES, INTEREST_LEVELS, LEAD_STATUSES, PRODUCTS, type Product } from "@/lib/labels";
import { followupQuickPicks, isValidTimeZone, legalWindow, PAKISTAN_TZ, withinLegalWindow, zonedToUtc, formatInZone } from "@/lib/time";
import { parsePhone, splitPhones, type StoredPhone } from "@/lib/phone";
import { normalizeWebsite, parseEmail, splitEmails, websiteDomain } from "@/lib/email";
import { normalizeState, timeZoneForState } from "@/lib/us";
import { isUuid } from "@/lib/params";

/** `savedAt` changes on every success so client forms can reset themselves (used as a React key). */
export type ActionState = { ok?: boolean; error?: string; message?: string; needsConfirm?: boolean; savedAt?: number };

const uuid = z.string().uuid();
const optText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
/** Per product: not discussed (empty), interested, or bought. */
const productChoice = z.enum(["", "interested", "bought"]).optional().default("");
const productsWith = (d: Record<`product_${Product}`, string>, choice: "interested" | "bought") => PRODUCTS.filter((p) => d[`product_${p}`] === choice);

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/do-not-call/.test(msg)) return "This lead is on the do-not-call list. The call can't be logged.";
  if (/do-not-email/.test(msg)) return "This company opted out of email. Don't send it anything.";
  if (/primary contact/.test(msg)) return "That contact doesn't belong to this company.";
  if (/row-level security|permission denied|insufficient_privilege|only an admin/i.test(msg)) return "You don't have access to change this lead.";
  if (err instanceof DatabaseUnavailableError) return "Can't reach the database right now. Nothing was saved; please try again.";
  console.error("lead action failed:", err);
  return "Something went wrong saving that. Please try again.";
}

async function guarded(user: CurrentUser, leadId: string, fn: (tx: Tx) => Promise<ActionState>): Promise<ActionState> {
  if (!limits.write.check(`write:${user.id}`).ok) return { error: "Too many changes in a minute. Slow down a little." };
  try {
    const result = await asUser(user.id, async (tx) => {
      const [lead] = await tx`select id from leads where id = ${leadId}`;
      if (!lead) return { error: "Lead not found." };
      return fn(tx);
    });
    revalidatePath("/leads");
    revalidatePath(`/leads/${leadId}`);
    revalidatePath("/companies");
    revalidatePath("/whatsapp");
    revalidatePath("/callbacks");
    revalidatePath("/followups");
    revalidatePath("/reports");
    revalidatePath("/");
    return result.ok ? { ...result, savedAt: Date.now() } : result;
  } catch (err) {
    return { error: friendly(err) };
  }
}

type FollowupInput = { dueLocal: string; dueTz: string; kind: "call" | "email" | "task"; notes: string | null; confirmOutside: boolean };

/** Validates and converts a follow-up's wall-clock time; returns an error state or the UTC instant. */
async function resolveFollowupTime(tx: Tx, leadId: string, f: FollowupInput): Promise<{ error: ActionState } | { due: Date; leadTz: string }> {
  if (!isValidTimeZone(f.dueTz)) return { error: { error: "Pick a valid time zone for the follow-up." } };
  let due: Date;
  try {
    due = zonedToUtc(f.dueLocal, f.dueTz);
  } catch {
    return { error: { error: "Pick a date and time for the follow-up." } };
  }
  if (due.getTime() < nowMs() - 5 * 60_000) return { error: { error: "The follow-up time is in the past." } };
  if (due.getTime() > nowMs() + 366 * 86_400_000) return { error: { error: "Follow-ups can be at most a year ahead." } };
  const [c] = await tx`select c.time_zone, c.state from leads l join companies c on c.id = l.company_id where l.id = ${leadId}`;
  const leadTz = isValidTimeZone(c?.time_zone) ? c.time_zone : f.dueTz;
  if (f.kind === "call" && !f.confirmOutside && !withinLegalWindow(due, leadTz, c?.state)) {
    return {
      error: {
        needsConfirm: true,
        error: `That's ${formatInZone(due, leadTz)} for the shop, outside ${legalWindow(c?.state).label}. Pick another time or tick "schedule anyway".`,
      },
    };
  }
  return { due, leadTz };
}

/** "Wed, Oct 28, 10:00 AM CDT (Wed, Oct 28, 8:00 PM PKT in Pakistan)": the shop's time first. */
async function bothClocks(tx: Tx, leadId: string, at: Date) {
  const [c] = await tx`select c.time_zone from leads l join companies c on c.id = l.company_id where l.id = ${leadId}`;
  const shop = isValidTimeZone(c?.time_zone) ? c.time_zone : "America/Chicago";
  return `${formatInZone(at, shop)} (${formatInZone(at, PAKISTAN_TZ)} in Pakistan)`;
}

async function insertFollowup(tx: Tx, user: CurrentUser, leadId: string, f: FollowupInput, due: Date) {
  const [lead] = await tx`select owner_id from leads where id = ${leadId}`;
  const assignee = user.role === "admin" && lead.owner_id ? lead.owner_id : user.id;
  await tx`insert into followups (lead_id, assigned_to, created_by, kind, due_at, time_zone, notes)
    values (${leadId}, ${assignee}, ${user.id}, ${f.kind}, ${due}, ${f.dueTz}, ${f.notes})`;
}

// ---------------------------------------------------------------------------
// Log a call (the salesperson workflow)
// ---------------------------------------------------------------------------

const LogCallSchema = z.object({
  leadId: uuid,
  contactId: z.union([uuid, z.literal("")]).optional().transform((v) => v || null),
  phone: optText(32),
  outcome: z.enum(CALL_OUTCOMES),
  interest: z.union([z.enum(INTEREST_LEVELS), z.literal("")]).optional().transform((v) => v || null),
  notes: optText(10_000),
  nextStep: optText(300),
  reason: optText(100),
  hangupExplanation: optText(500),
  durationMinutes: z.union([z.coerce.number().min(0).max(600), z.literal("")]).optional(),
  emailRequired: checkbox,
  emailTo: optText(254),
  completeFollowups: checkbox,
  scheduleFollowup: checkbox,
  dueLocal: z.string().optional().default(""),
  dueTz: z.string().optional().default(""),
  followupKind: z.enum(["call", "email", "task"]).default("call"),
  followupNotes: optText(5000),
  confirmOutside: checkbox,
  product_pos: productChoice,
  product_wholesale: productChoice,
  pos_send_email: checkbox,
  pos_send_whatsapp: checkbox,
  wholesale_send_email: checkbox,
  wholesale_send_whatsapp: checkbox,
});

export async function logCall(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = LogCallSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Choose a call outcome." };
  const d = parsed.data;
  const phone = d.phone ? parsePhone(d.phone).e164 : null;
  let emailTo: string | null = null;
  if (d.emailRequired && d.emailTo) {
    const e = parseEmail(d.emailTo);
    if (!e.valid) return { error: "That email address doesn't look right." };
    emailTo = e.address;
  }

    const emailProducts: string[] = [];
  if (d.pos_send_email) emailProducts.push("8staros POS");
  if (d.wholesale_send_email) emailProducts.push("Wholesale phones & accessories");
  const sendEmail = emailProducts.length > 0 || d.emailRequired;

  const waProducts: string[] = [];
  if (d.pos_send_whatsapp) waProducts.push("8staros POS");
  if (d.wholesale_send_whatsapp) waProducts.push("Wholesale phones & accessories");
  const sendWhatsApp = waProducts.length > 0;

  const details: string[] = [];
  if (emailProducts.length) details.push(`Email to send: ${emailProducts.join(" · ")}`);
  if (waProducts.length) details.push(`WhatsApp to send: ${waProducts.join(" · ")}`);
  const notes = [details.join("\n"), d.reason ? `Reason: ${d.reason}` : null, d.hangupExplanation ? `Hang up: ${d.hangupExplanation}` : null, d.notes].filter(Boolean).join("\n") || null;
  const nextStep = ["interested", "connected"].includes(d.outcome) ? d.nextStep : null;
  const talked = ["interested", "connected", "callback_requested"].includes(d.outcome);
  const interestedIn = talked ? productsWith(d, "interested") : [];
  const bought = talked ? productsWith(d, "bought") : [];

  return guarded(user, d.leadId, async (tx) => {
    // Check the follow-up first so a bad time doesn't leave a half-saved call.
    let followupDue: Date | null = null;
    const fu: FollowupInput = { dueLocal: d.dueLocal, dueTz: d.dueTz, kind: d.followupKind, notes: d.followupNotes, confirmOutside: d.confirmOutside };
    const wantsFollowup = d.scheduleFollowup && d.outcome !== "wrong_number" && !!d.dueTz && !!d.dueLocal;
    if (wantsFollowup) {
      const r = await resolveFollowupTime(tx, d.leadId, fu);
      if ("error" in r) return r.error;
      followupDue = r.due;
    }

    const duration = typeof d.durationMinutes === "number" ? Math.round(d.durationMinutes * 60) : null;
    await tx`insert into call_activities (lead_id, contact_id, user_id, phone_e164, outcome, interest, notes, next_step, duration_seconds, interested_in, bought)
      values (${d.leadId}, ${d.contactId}, ${user.id}, ${phone}, ${d.outcome}, ${d.interest}, ${notes}, ${nextStep}, ${duration},
        ${interestedIn}::product[], ${bought}::product[])`;

    if (d.completeFollowups) {
      await tx`update followups set status = 'done', completed_at = now() where lead_id = ${d.leadId} and status = 'pending' and kind = 'call'`;
    }

    if (d.outcome === "callback_requested") {
      const [lead] = await tx`select owner_id from leads where id = ${d.leadId}`;
      const [co] = await tx`select c.time_zone from leads l join companies c on c.id = l.company_id where l.id = ${d.leadId}`;
      const cbTz = (co?.time_zone && isValidTimeZone(co.time_zone)) ? co.time_zone : (user.timeZone || "America/New_York");
      const cbNote = d.notes ? `Call back later: ${d.notes}` : "Call back later requested on call";
      await tx`insert into followups (lead_id, assigned_to, created_by, kind, due_at, time_zone, status, notes)
        values (${d.leadId}, ${lead?.owner_id || user.id}, ${user.id}, 'call', now(), ${cbTz}, 'pending', ${cbNote})`;
    }

    const emailProducts: string[] = [];
    if (d.pos_send_email) emailProducts.push("8staros POS");
    if (d.wholesale_send_email) emailProducts.push("Wholesale phones & accessories");
    const sendEmail = emailProducts.length > 0 || d.emailRequired;

    const waProducts: string[] = [];
    if (d.pos_send_whatsapp) waProducts.push("8staros POS");
    if (d.wholesale_send_whatsapp) waProducts.push("Wholesale phones & accessories");
    const sendWhatsApp = waProducts.length > 0;

    if (sendEmail) {
      let targetEmail = emailTo;
      if (!targetEmail) {
        const [co] = await tx`select coalesce(c.emails -> 0 ->> 'address', (select ct.emails -> 0 ->> 'address' from contacts ct where ct.company_id = c.id and jsonb_array_length(ct.emails) > 0 limit 1)) as email from leads l join companies c on c.id = l.company_id where l.id = ${d.leadId}`;
        targetEmail = co?.email ?? null;
      }
      const note = emailProducts.length
        ? `Email to send: ${emailProducts.join(", ")}`
        : "Email requested on call";
      await tx`insert into email_activities (lead_id, user_id, to_address, status, notes)
        values (${d.leadId}, ${user.id}, ${targetEmail}, 'pending', ${note})`;
      await tx`update leads set email_status = 'pending', email_required = true where id = ${d.leadId}`;
    }

    if (sendWhatsApp) {
      const waNote = `WhatsApp to send: ${waProducts.join(", ")}`;
      const waDue = new Date();
      await tx`insert into followups (lead_id, assigned_to, created_by, kind, due_at, time_zone, status, notes)
        values (${d.leadId}, ${user.id}, ${user.id}, 'task', ${waDue}, ${user.timeZone || 'America/New_York'}, 'pending', ${waNote})`;
    }
    if (followupDue) await insertFollowup(tx, user, d.leadId, fu, followupDue);
    const when = followupDue ? ` Next follow-up ${await bothClocks(tx, d.leadId, followupDue)}.` : "";
    return { ok: true, message: `Call saved.${when}` };
  });
}

// ---------------------------------------------------------------------------
// Follow-ups
// ---------------------------------------------------------------------------

const FollowupSchema = z.object({
  leadId: uuid,
  dueLocal: z.string().min(1),
  dueTz: z.string().min(1),
  kind: z.enum(["call", "email", "task"]).default("call"),
  notes: optText(5000),
  confirmOutside: checkbox,
});

export async function scheduleFollowup(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = FollowupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Pick a date and time." };
  const d = parsed.data;
  return guarded(user, d.leadId, async (tx) => {
    const fu: FollowupInput = { dueLocal: d.dueLocal, dueTz: d.dueTz, kind: d.kind, notes: d.notes, confirmOutside: d.confirmOutside };
    const r = await resolveFollowupTime(tx, d.leadId, fu);
    if ("error" in r) return r.error;
    await insertFollowup(tx, user, d.leadId, fu, r.due);
    return { ok: true, message: "Follow-up scheduled." };
  });
}

export async function setFollowupStatus(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ leadId: uuid, followupId: uuid, status: z.enum(["done", "cancelled", "pending"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { leadId, followupId, status } = parsed.data;
  await guarded(user, leadId, async (tx) => {
    await tx`update followups set status = ${status} where id = ${followupId} and lead_id = ${leadId}`;
    return { ok: true };
  });
  revalidatePath("/followups");
}

/** Moves a pending follow-up to a quick-pick time in the shop's zone (from the follow-ups list). */
export async function rescheduleFollowup(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({ leadId: uuid, followupId: uuid, pick: z.enum(["2h", "tomorrow-10", "tomorrow-2pm", "3d", "1w"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { leadId, followupId, pick } = parsed.data;
  await guarded(user, leadId, async (tx) => {
    const [c] = await tx`select c.time_zone from leads l join companies c on c.id = l.company_id where l.id = ${leadId}`;
    const tz = isValidTimeZone(c?.time_zone) ? c.time_zone : user.timeZone;
    const at = followupQuickPicks(tz).find((p) => p.key === pick)!.at;
    await tx`update followups set due_at = ${at}, time_zone = ${tz} where id = ${followupId} and lead_id = ${leadId} and status = 'pending'`;
    return { ok: true };
  });
  revalidatePath("/followups");
}

// ---------------------------------------------------------------------------
// Notes, email log, lead status
// ---------------------------------------------------------------------------

export async function addNote(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ leadId: uuid, body: z.string().trim().min(1).max(10_000) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Write something first." };
  return guarded(user, parsed.data.leadId, async (tx) => {
    await tx`insert into notes (lead_id, user_id, body) values (${parsed.data.leadId}, ${user.id}, ${parsed.data.body})`;
    return { ok: true, message: "Note added." };
  });
}

const EmailSchema = z.object({
  leadId: uuid,
  status: z.enum(EMAIL_STATUSES).refine((s) => s !== "not_needed"),
  to: optText(254),
  subject: optText(300),
  notes: optText(10_000),
});

export async function logEmail(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = EmailSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Pick an email status." };
  const d = parsed.data;
  let to: string | null = null;
  if (d.to) {
    const e = parseEmail(d.to);
    if (!e.valid) return { error: "That email address doesn't look right." };
    to = e.address;
  }
  return guarded(user, d.leadId, async (tx) => {
    const [c] = await tx`select c.suppression from leads l join companies c on c.id = l.company_id where l.id = ${d.leadId}`;
    if (["do_not_email", "do_not_contact"].includes(c.suppression) && ["drafted", "sent"].includes(d.status)) {
      return { error: "This company opted out of email. Don't send it anything." };
    }
    await tx`insert into email_activities (lead_id, user_id, to_address, status, subject, notes)
      values (${d.leadId}, ${user.id}, ${to}, ${d.status}, ${d.subject}, ${d.notes})`;
    return { ok: true, message: "Email status logged." };
  });
}

/** One-click "sent" or "drafted" from the emails worklist. */
export async function markEmail(form: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = z.object({ leadId: uuid, status: z.enum(["sent", "drafted"]), to: optText(254) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const d = parsed.data;
  const to = d.to && parseEmail(d.to).valid ? parseEmail(d.to).address : null;
  await guarded(user, d.leadId, async (tx) => {
    const [c] = await tx`select c.suppression from leads l join companies c on c.id = l.company_id where l.id = ${d.leadId}`;
    if (["do_not_email", "do_not_contact"].includes(c.suppression)) return { error: "opted out" };
    await tx`insert into email_activities (lead_id, user_id, to_address, status, notes)
      values (${d.leadId}, ${user.id}, ${to}, ${d.status}, 'Marked from the emails list')`;
    return { ok: true };
  });
  revalidatePath("/emails");
  revalidatePath("/reports");
  revalidatePath("/");
}

/** Move an email lead back to "pending" (To send) from the completed list. */
export async function reopenEmail(form: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = z.object({ leadId: uuid }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const d = parsed.data;
  await guarded(user, d.leadId, async (tx) => {
    await tx`insert into email_activities (lead_id, user_id, status, notes)
      values (${d.leadId}, ${user.id}, 'pending', 'Reopened from completed emails list')`;
    return { ok: true };
  });
  revalidatePath("/emails");
  revalidatePath("/reports");
  revalidatePath("/");
}

export async function updateLeadStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z
    .object({ leadId: uuid, status: z.enum(LEAD_STATUSES), interest: z.enum(INTEREST_LEVELS), emailRequired: checkbox })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid status." };
  const d = parsed.data;
  return guarded(user, d.leadId, async (tx) => {
    await tx`update leads set status = ${d.status}, interest = ${d.interest}, email_required = ${d.emailRequired},
      email_status = case when ${d.emailRequired} then email_status when email_status in ('pending', 'drafted') then 'not_needed' else email_status end
      where id = ${d.leadId}`;
    return { ok: true, message: "Lead updated." };
  });
}

/** Corrects which products the shop wants or has bought (calls only ever add to these). */
export async function updateLeadProducts(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ leadId: uuid, product_pos: productChoice, product_wholesale: productChoice }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid choice." };
  const d = parsed.data;
  const bought = productsWith(d, "bought");
  const interested = [...productsWith(d, "interested"), ...bought];
  return guarded(user, d.leadId, async (tx) => {
    await tx`update leads set interested_in = ${interested}::product[], bought = ${bought}::product[] where id = ${d.leadId}`;
    return { ok: true, message: "Products updated." };
  });
}

// ---------------------------------------------------------------------------
// Deal (sales opportunity)
// ---------------------------------------------------------------------------

const DealSchema = z.object({
  leadId: uuid,
  opportunityId: z.union([uuid, z.literal("")]).optional().transform((v) => v || null),
  title: z.string().trim().min(1).max(200),
  stage: z.enum(DEAL_STAGES),
  product: z.union([z.enum(PRODUCTS), z.literal("")]).optional().transform((v) => v || null),
  value: z.union([z.coerce.number().min(0).max(100_000_000), z.literal("")]).optional(),
  expectedClose: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional().transform((v) => v || null),
});

export async function saveDeal(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = DealSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Give the deal a title and stage." };
  const d = parsed.data;
  const cents = typeof d.value === "number" ? Math.round(d.value * 100) : null;
  return guarded(user, d.leadId, async (tx) => {
    if (d.opportunityId) {
      const rows = await tx`update sales_opportunities set title = ${d.title}, stage = ${d.stage}, product = ${d.product}, value_cents = ${cents},
        expected_close_on = ${d.expectedClose} where id = ${d.opportunityId} and lead_id = ${d.leadId} returning id`;
      if (!rows.length) return { error: "Deal not found." };
    } else {
      const [lead] = await tx`select owner_id from leads where id = ${d.leadId}`;
      await tx`insert into sales_opportunities (lead_id, product, owner_id, title, stage, value_cents, expected_close_on)
        values (${d.leadId}, ${d.product}, ${lead.owner_id ?? user.id}, ${d.title}, ${d.stage}, ${cents}, ${d.expectedClose})`;
    }
    return { ok: true, message: "Deal saved." };
  });
}

// ---------------------------------------------------------------------------
// Company and contacts
// ---------------------------------------------------------------------------

function parsePhoneList(text: string | null, label: string): { phones: StoredPhone[]; bad: string[] } {
  const phones: StoredPhone[] = [];
  const bad: string[] = [];
  for (const raw of splitPhones(text)) {
    const p = parsePhone(raw);
    if (p.valid && p.e164) {
      if (!phones.some((x) => x.e164 === p.e164)) phones.push({ e164: p.e164, raw: p.raw, ext: p.ext, label });
    } else bad.push(raw);
  }
  return { phones, bad };
}

function parseEmailList(text: string | null, label: string) {
  const emails: { address: string; label: string }[] = [];
  const bad: string[] = [];
  for (const raw of splitEmails(text)) {
    const e = parseEmail(raw);
    if (e.valid && e.address) {
      if (!emails.some((x) => x.address === e.address)) emails.push({ address: e.address, label });
    } else bad.push(raw);
  }
  return { emails, bad };
}

const SUPPRESSION_FLAGS: Record<string, string[]> = { none: [], do_not_call: ["call"], do_not_email: ["email"], do_not_contact: ["call", "email"] };
function liftsSuppression(from: string, to: string) {
  return SUPPRESSION_FLAGS[from].some((flag) => !SUPPRESSION_FLAGS[to].includes(flag));
}

const CompanySchema = z.object({
  leadId: uuid,
  name: z.string().trim().min(1).max(200),
  website: optText(300),
  address: optText(300),
  city: optText(100),
  state: optText(40),
  postalCode: optText(20),
  timeZone: optText(64),
  phones: optText(1000),
  emails: optText(2000),
  suppression: z.enum(["none", "do_not_call", "do_not_email", "do_not_contact"]),
  suppressionReason: optText(300),
  notes: optText(5000),
});

export async function updateCompany(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = CompanySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Company name is required." };
  const d = parsed.data;
  const state = d.state ? normalizeState(d.state) : null;
  if (d.state && !state) return { error: `"${d.state}" isn't a US state.` };
  const tz = d.timeZone && isValidTimeZone(d.timeZone) ? d.timeZone : timeZoneForState(state);
  const phones = parsePhoneList(d.phones, "main");
  const emails = parseEmailList(d.emails, "general");
  if (phones.bad.length) return { error: `Can't read phone number: ${phones.bad.join(", ")}` };
  if (emails.bad.length) return { error: `Can't read email: ${emails.bad.join(", ")}` };
  const website = d.website ? normalizeWebsite(d.website) : null;
  if (d.website && !website) return { error: "The website must be an http(s) address." };

  return guarded(user, d.leadId, async (tx) => {
    const [lead] = await tx`select company_id from leads where id = ${d.leadId}`;
    const [current] = await tx`select suppression from companies where id = ${lead.company_id}`;
    // Lifting a suppression is an admin decision; adding one is open to everyone.
    if (liftsSuppression(current.suppression, d.suppression) && user.role !== "admin") {
      return { error: "Only an admin can lift a do-not-call or do-not-email status." };
    }
    await tx`update companies set name = ${d.name}, website = ${website}, website_domain = ${websiteDomain(website)},
      address = ${d.address}, city = ${d.city}, state = ${state}, postal_code = ${d.postalCode}, time_zone = ${tz},
      phones = ${tx.json(phones.phones)}, emails = ${tx.json(emails.emails)},
      suppression = ${d.suppression}, suppression_reason = ${d.suppression === "none" ? null : d.suppressionReason}, notes = ${d.notes}
      where id = ${lead.company_id}`;
    return { ok: true, message: "Company saved." };
  });
}

const ContactSchema = z.object({
  leadId: uuid,
  contactId: z.union([uuid, z.literal("")]).optional().transform((v) => v || null),
  fullName: optText(200),
  title: optText(120),
  phones: optText(1000),
  emails: optText(2000),
  makePrimary: checkbox,
  suppression: z.enum(["none", "do_not_call", "do_not_email", "do_not_contact"]).default("none"),
});

export async function saveContact(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = ContactSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Check the contact details." };
  const d = parsed.data;
  const phones = parsePhoneList(d.phones, "direct");
  const emails = parseEmailList(d.emails, "work");
  if (phones.bad.length) return { error: `Can't read phone number: ${phones.bad.join(", ")}` };
  if (emails.bad.length) return { error: `Can't read email: ${emails.bad.join(", ")}` };
  if (!d.fullName && !phones.phones.length && !emails.emails.length) return { error: "Add a name, phone or email." };

  return guarded(user, d.leadId, async (tx) => {
    const [lead] = await tx`select company_id from leads where id = ${d.leadId}`;
    let contactId = d.contactId;
    if (contactId) {
      const [existing] = await tx`select suppression from contacts where id = ${contactId}`;
      if (existing && liftsSuppression(existing.suppression, d.suppression) && user.role !== "admin") {
        return { error: "Only an admin can lift a contact's do-not-call or do-not-email status." };
      }
      const rows = await tx`update contacts set full_name = ${d.fullName}, title = ${d.title}, phones = ${tx.json(phones.phones)},
        emails = ${tx.json(emails.emails)}, suppression = ${d.suppression}
        where id = ${contactId} and company_id = ${lead.company_id} returning id`;
      if (!rows.length) return { error: "Contact not found." };
    } else {
      const [row] = await tx`insert into contacts (company_id, full_name, title, phones, emails, suppression, created_by)
        values (${lead.company_id}, ${d.fullName}, ${d.title}, ${tx.json(phones.phones)}, ${tx.json(emails.emails)}, ${d.suppression}, ${user.id})
        returning id`;
      contactId = row.id;
    }
    if (d.makePrimary) await tx`update leads set primary_contact_id = ${contactId} where id = ${d.leadId}`;
    return { ok: true, message: "Contact saved." };
  });
}

export async function markWhatsAppDone(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    leadId: uuid,
    followupId: z.string().optional(),
    callId: z.string().optional(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { leadId, followupId } = parsed.data;

  await guarded(user, leadId, async (tx) => {
    let updated = 0;
    if (followupId && isUuid(followupId)) {
      const res = await tx`update followups set status = 'done', completed_at = now() where id = ${followupId}`;
      updated += res.count;
    }
    const res2 = await tx`update followups set status = 'done', completed_at = now()
      where lead_id = ${leadId} and status = 'pending' and (notes ilike '%whatsapp%' or kind = 'task')`;
    updated += res2.count;

    if (updated === 0) {
      const [lead] = await tx`select owner_id from leads where id = ${leadId}`;
      const [co] = await tx`select c.time_zone from leads l join companies c on c.id = l.company_id where l.id = ${leadId}`;
      const tz = co?.time_zone || user.timeZone || "America/New_York";
      await tx`insert into followups (lead_id, assigned_to, created_by, kind, due_at, time_zone, status, completed_at, notes)
        values (${leadId}, ${lead?.owner_id || user.id}, ${user.id}, 'task', now(), ${tz}, 'done', now(), 'WhatsApp sent')`;
    }
    return { ok: true };
  });

  revalidatePath("/leads");
  revalidatePath("/whatsapp");
  revalidatePath("/followups");
  revalidatePath("/reports");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/");
}

export async function reopenWhatsApp(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    leadId: uuid,
    followupId: z.string().optional(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { leadId, followupId } = parsed.data;

  await guarded(user, leadId, async (tx) => {
    if (followupId && isUuid(followupId)) {
      await tx`update followups set status = 'pending', completed_at = null where id = ${followupId}`;
    }
    await tx`update followups set status = 'pending', completed_at = null
      where lead_id = ${leadId} and (notes ilike '%whatsapp%' or kind = 'task')`;
    return { ok: true };
  });

  revalidatePath("/leads");
  revalidatePath("/whatsapp");
  revalidatePath("/followups");
  revalidatePath("/reports");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/");
}

export async function markCallbackDone(form: FormData) {
  const user = await requireUser();
  const parsed = z.object({
    leadId: uuid,
    followupId: z.string().optional(),
    callId: z.string().optional(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const { leadId, followupId } = parsed.data;

  await guarded(user, leadId, async (tx) => {
    if (followupId && isUuid(followupId)) {
      await tx`update followups set status = 'done', completed_at = now() where id = ${followupId}`;
    } else {
      await tx`update followups set status = 'done', completed_at = now()
        where lead_id = ${leadId} and status = 'pending' and kind = 'call'`;
    }
    return { ok: true };
  });

  revalidatePath("/leads");
  revalidatePath("/callbacks");
  revalidatePath("/followups");
  revalidatePath("/reports");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/");
}
