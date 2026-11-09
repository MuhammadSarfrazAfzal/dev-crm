import { parsePhone, splitPhones, type StoredPhone } from "../phone";
import { normalizeWebsite, parseEmail, splitEmails, websiteDomain } from "../email";
import { normalizeState, resolveCompanyTimeZone, timeZoneForState } from "../us";
import type { Field } from "./columns";
import { findAddress, maskContacts } from "./address";
import { hostOf, isDirectoryHost } from "./directories";
import { EMAIL_RE, PHONE_RE, readDetails } from "./text-records";

export type NormalizedRow = {
  company: string | null;
  contact_name: string | null;
  title: string | null;
  phones: StoredPhone[];
  emails: { address: string; label: string }[];
  website: string | null;
  website_domain: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  time_zone: string | null;
  notes: string | null;
  /** Where the lead was found (a directory, map listing or the shop's site). */
  source: string | null;
  /** Section or metro tag, e.g. "Houston area". */
  area: string | null;
  record_number: string | null;
};

/** Issues that make a row unusable; such rows default to "skip". */
export const BLOCKING_ISSUES = new Set(["missing_company", "no_contact_method"]);

/** Issues that put a row in the preview's "Needs a look" group. */
export const REVIEW_ISSUES = ["needs_split", "weak_name", "missing_company", "no_contact_method", "ocr_low_confidence", "invalid_phone", "invalid_email"];
export const REVIEW_CONFIDENCE = 0.7;

export const ISSUE_LABEL: Record<string, string> = {
  missing_company: "No company name",
  no_contact_method: "No valid phone or email",
  invalid_phone: "A phone number couldn't be read",
  invalid_email: "An email address is invalid",
  invalid_website: "Website ignored",
  unknown_state: "State not recognized",
  state_from_area_code: "State guessed from area code",
  toll_free_only: "Only a toll-free number",
  from_free_text: "Parsed from free text — check it",
  ocr_low_confidence: "Low OCR confidence",
  duplicate_in_file: "Duplicate of an earlier row",
  duplicate_existing: "Already in the CRM",
  website_is_directory: "Listing site moved to source",
  needs_split: "Several businesses may be mixed in this row",
  weak_name: "Company name guessed",
  role_email_only: "Only a generic email (info@…)",
};

// Placeholders some lists print instead of a value.
const PLACEHOLDER_RE = /^(n\/?a|none|unknown|tbd|-+|\?+)$|not (captured|available|listed|provided)|see source/i;

const clean = (v: string | undefined, max = 300) => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s && !PLACEHOLDER_RE.test(s) ? s.slice(0, max) : null;
};

export function normalizeRow(
  values: Partial<Record<Field, string>>,
  opts: { fromText?: boolean; ocrConfidence?: number; structured?: boolean; extraIssues?: string[]; companyConfidence?: number } = {},
): { row: NormalizedRow; issues: string[]; confidence: number } {
  const issues: string[] = [];
  values = splitAddressParts(expandMixed(values));

  const phones: StoredPhone[] = [];
  for (const [field, label] of [["phone", "main"], ["mobile", "mobile"]] as const) {
    for (const raw of splitPhones(values[field])) {
      const p = parsePhone(raw);
      if (p.valid && p.e164) {
        if (!phones.some((x) => x.e164 === p.e164)) phones.push({ e164: p.e164, raw: p.raw, ext: p.ext, label });
      } else if (!issues.includes("invalid_phone")) issues.push("invalid_phone");
    }
  }

  const emails: { address: string; label: string }[] = [];
  for (const raw of splitEmails(values.email)) {
    const e = parseEmail(raw);
    if (e.valid && e.address) {
      if (!emails.some((x) => x.address === e.address)) emails.push({ address: e.address, label: e.role ? "general" : "work" });
    } else if (!issues.includes("invalid_email")) issues.push("invalid_email");
  }
  if (values.email && !splitEmails(values.email).length && !issues.includes("invalid_email")) issues.push("invalid_email");

  let source = clean(values.source);
  let website = values.website ? normalizeWebsite(values.website) : null;
  if (values.website && !website) issues.push("invalid_website");
  // A listing site is where the lead came from, not the shop's own website.
  if (website && isDirectoryHost(website)) {
    source = source ?? hostOf(website);
    website = null;
    issues.push("website_is_directory");
  }

  let state = values.state ? normalizeState(values.state) : null;
  if (values.state && !state) issues.push("unknown_state");
  if (!state) {
    const fromArea = phones.map((p) => parsePhone(p.e164).state).find(Boolean) ?? null;
    if (fromArea) {
      state = fromArea;
      issues.push("state_from_area_code");
    }
  }

  const contactName = clean(values.contact_name) ?? clean([values.first_name, values.last_name].filter(Boolean).join(" "));
  const company = clean(values.company);
  if (!company) issues.push("missing_company");
  if (!phones.length && !emails.length) issues.push("no_contact_method");
  if (phones.length && phones.every((p) => parsePhone(p.e164).tollFree)) issues.push("toll_free_only");
  if (!phones.length && emails.length && emails.every((e) => e.label === "general")) issues.push("role_email_only");
  if (opts.ocrConfidence !== undefined && opts.ocrConfidence < 0.75) issues.push("ocr_low_confidence");
  for (const i of opts.extraIssues ?? []) if (!issues.includes(i)) issues.push(i);

  const postal = clean(values.postal_code)?.match(/^\d{5}(-\d{4})?$/)?.[0] ?? null;

  let confidence = opts.structured ? 0.97 : opts.fromText ? 0.9 * (opts.companyConfidence ?? 1) : 1;
  if (opts.ocrConfidence !== undefined) confidence *= Math.max(0.3, opts.ocrConfidence);
  for (const i of issues) {
    if (BLOCKING_ISSUES.has(i)) confidence -= 0.4;
    else if (i === "needs_split") confidence -= 0.25;
    else if (i === "weak_name") confidence -= 0.1;
    else if (!["from_free_text", "ocr_low_confidence", "state_from_area_code", "website_is_directory"].includes(i)) confidence -= 0.1;
    else if (i === "state_from_area_code") confidence -= 0.02;
  }
  confidence = Math.round(Math.max(0, Math.min(1, confidence)) * 1000) / 1000;

  return {
    row: {
      company,
      contact_name: contactName,
      title: clean(values.title),
      phones,
      emails,
      website,
      website_domain: websiteDomain(website),
      address: clean(values.address),
      city: clean(values.city),
      state,
      postal_code: postal,
      time_zone: resolveCompanyTimeZone({ state, city: clean(values.city), phone: phones[0]?.e164 }).timeZone,
      notes: clean(values.notes, 4000),
      source,
      area: clean(values.area),
      record_number: clean(values.record_number),
    },
    issues,
    confidence,
  };
}

/**
 * Cells that hold more than their column says: a "details" column is read field by field,
 * and a phone column that also lists an email (or the other way round) gives each value to
 * its own field. Values already in their own column always win.
 */
export function expandMixed(values: Partial<Record<Field, string>>): Partial<Record<Field, string>> {
  const out = { ...values };
  const add = (f: Field, v: string | undefined) => {
    if (!v) return;
    const multi = f === "phone" || f === "email" || f === "notes";
    if (!out[f]) out[f] = v;
    else if (multi && !out[f]!.includes(v)) out[f] = `${out[f]}; ${v}`;
  };
  if (values.details) {
    const d = readDetails(values.details);
    add("company", d.Company);
    add("phone", d.Phone);
    add("email", d.Email);
    add("website", d.Website);
    add("contact_name", d.Contact);
    add("address", d.Address);
    add("city", d.City);
    add("state", d.State);
    add("postal_code", d.Zip);
    add("notes", d.Notes);
    delete out.details;
  }
  for (const f of ["phone", "mobile", "email", "website"] as const) {
    const v = out[f];
    if (!v) continue;
    const emails = f === "email" ? [] : v.match(new RegExp(EMAIL_RE.source, "gi")) ?? [];
    const phones = f === "phone" || f === "mobile" ? [] : v.match(new RegExp(PHONE_RE.source, "gi")) ?? [];
    if (!emails.length && !phones.length) continue;
    let rest = v;
    for (const e of emails) rest = rest.replace(e, " ");
    for (const p of phones) rest = rest.replace(p, " ");
    out[f] = rest.replace(/^[\s/;,|]+|[\s/;,|]+$/g, "").replace(/\s*[/|]\s*/g, "; ") || undefined;
    emails.forEach((e) => add("email", e));
    phones.forEach((p) => add("phone", p));
  }
  if (out.website && !/[a-z0-9-]\.[a-z]{2,}/i.test(out.website)) delete out.website;
  return out;
}

/**
 * A whole address in one column ("5200 International Dr, Orlando, FL 32819"), or a city
 * column holding "Orlando, FL", is split into its parts; parts given in their own
 * columns always win.
 */
export function splitAddressParts(values: Partial<Record<Field, string>>): Partial<Record<Field, string>> {
  const out = { ...values };
  for (const field of ["address", "city"] as const) {
    const v = out[field];
    if (!v) continue;
    const found = findAddress(maskContacts(v, [PHONE_RE, EMAIL_RE]));
    if (!found || (!found.state && !found.zip)) continue;
    if (field === "address") {
      // Keep whatever came before the city when no street could be picked out.
      const head = v.slice(0, found.start).replace(/[\s,]+$/, "");
      out.address = found.street ?? (/^\s*\d/.test(head) ? head : found.city || found.state ? undefined : v);
    }
    if (field === "city" && found.city) out.city = found.city;
    if (found.city && (!out.city || field === "address" && !values.city)) out.city = found.city;
    if (found.state && !values.state) out.state = found.state;
    if (found.zip && !values.postal_code) out.postal_code = found.zip;
  }
  return out;
}

/**
 * Keys that identify the same shop within one file: the same phone number, or the same
 * name at the same street address (or in the same city when neither row has an address).
 * Chain stores share names and domains, and thousands of shops share a listing site, so
 * none of those alone make two rows the same business.
 */
export function inFileKeys(row: NormalizedRow): string[] {
  const keys = row.phones.map((p) => `phone:${p.e164}`);
  if (row.company) {
    const name = row.company.toLowerCase().replace(/\b(inc|llc|ltd|co|corp)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    const street = (row.address ?? "").toLowerCase().match(/^\s*(\d+[a-z]?)\s+([a-z0-9]+)/);
    keys.push(`name:${name}|${(row.city ?? "").toLowerCase()}|${row.state ?? ""}|${street ? `${street[1]} ${street[2]}` : ""}`);
  }
  return keys;
}
