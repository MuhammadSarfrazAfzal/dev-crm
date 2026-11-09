import type { Metadata } from "next";
import { DeleteButton } from "@/components/DeleteButton";
import { now } from "@/lib/clock";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addNote, logEmail, saveDeal, setFollowupStatus, updateLeadProducts, updateLeadStatus } from "@/app/actions/lead";
import { ActionForm } from "@/components/ActionForm";
import { Dropdown } from "@/components/menu/Dropdown";
import { EmailBadge, InterestBadge, OutcomeBadge, StageBadge, StatusBadge, SuppressionBadge } from "@/components/badges";
import { LogCallForm, type DialNumber } from "@/components/lead/LogCallForm";
import { ScheduleFollowupForm } from "@/components/lead/ScheduleFollowupForm";
import { ScriptsPanel, type ScriptItem } from "@/components/lead/ScriptsPanel";
import { ShopClock } from "@/components/lead/ShopClock";
import { CompanyDetailsCard, ContactsCard } from "@/components/client/ClientPanels";
import { Icon, type IconName } from "@/components/icons";
import { Alert, Badge, Card, DetailList, EmptyState, PageHeader, ProductTags } from "@/components/ui";
import { withUserDb } from "@/lib/auth/current";
import { money, plural, relativeTime } from "@/lib/format";
import { DEAL_STAGES, EMAIL_STATUSES, HIDDEN_CALL_OUTCOMES, EMAIL_STATUS_LABEL, INTEREST_LABEL, INTEREST_LEVELS, LEAD_STATUSES, LEAD_STATUS_LABEL, PRODUCT_LABEL, PRODUCT_SHORT, PRODUCTS, stageLabel, type DealStage, type Product } from "@/lib/labels";
import { isUuid } from "@/lib/params";
import { formatPhone } from "@/lib/phone";
import { formatInZone, otherZone, shownZone } from "@/lib/time";
import { resolveCompanyTimeZone, stateName } from "@/lib/us";
import { getCurrentScripts, getDocuments, getFollowups, getLead, getOpportunities, getTimeline, type TimelineItem } from "@/server/lead-detail";

export const metadata: Metadata = { title: "Lead" };

const DOC_MESSAGES: Record<string, { tone: "green" | "red"; text: string }> = {
  uploaded: { tone: "green", text: "Document attached." },
  rejected: { tone: "red", text: "That file type isn't allowed or doesn't match its name (PDF, Word, Excel, CSV, text or images up to 10 MB)." },
  ratelimited: { tone: "red", text: "Too many uploads. Try again later." },
  missing: { tone: "red", text: "Choose a file to attach." },
};

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const docMsg = typeof sp.doc === "string" ? sp.doc : undefined;
  if (!isUuid(id)) notFound();
  const data = await withUserDb(async (tx, user) => {
    const lead = await getLead(tx, id);
    if (!lead) return null;
    const [timeline, followups, deals, documents, scripts] = await Promise.all([
      getTimeline(tx, id),
      getFollowups(tx, id),
      getOpportunities(tx, id),
      getDocuments(tx, id, lead.company.id, lead.import_id),
      getCurrentScripts(tx) as unknown as Promise<ScriptItem[]>,
    ]);
    return { user, lead, timeline, followups, deals, documents, scripts };
  });
  if (!data) notFound();
  const { user, lead, timeline, followups, deals, documents, scripts } = data;
  const c = lead.company;
  const companyNoCall = c.suppression === "do_not_call" || c.suppression === "do_not_contact";

  const fromUrl = typeof sp.from === "string" ? sp.from : undefined;
  let backHref = "/leads";
  let backLabel = "Leads";

  if (fromUrl) {
    backHref = fromUrl;
    backLabel = fromUrl.includes("/companies") ? "Company" : "Back";
  } else {
    const backEntries: [string, string][] = [];
    for (const [k, v] of Object.entries(sp)) {
      if (k === "doc" || k === "from" || v === undefined || v === "") continue;
      backEntries.push([k, Array.isArray(v) ? v.join(",") : v]);
    }
    const backQuery = new URLSearchParams(backEntries).toString();
    backHref = `/leads${backQuery ? `?${backQuery}` : ""}`;
    const pageNum = sp.page ? Number(sp.page) : undefined;
    backLabel = pageNum && pageNum > 1 ? `Leads (Page ${pageNum})` : "Leads";
  }

  const numbers: DialNumber[] = [
    ...lead.contacts.flatMap((ct) =>
      ct.phones.map((p) => ({
        e164: p.e164,
        ext: p.ext,
        label: [ct.full_name, ct.title, p.label].filter(Boolean).join(" · ") || "Contact",
        contactId: ct.id,
        blocked: companyNoCall || ct.suppression === "do_not_call" || ct.suppression === "do_not_contact",
      })),
    ),
    ...c.phones.map((p) => ({ e164: p.e164, ext: p.ext, label: `${c.name} · ${p.label ?? "main line"}`, contactId: null, blocked: companyNoCall })),
  ];
  const primaryPhone = numbers.find((n) => !n.blocked);

  // Automatically resolve the exact local time zone from company state, city or area code
  const { timeZone: tz, state: resolvedState } = resolveCompanyTimeZone({
    timeZone: c.time_zone,
    state: c.state,
    city: c.city,
    phone: primaryPhone?.e164 ?? c.phones[0]?.e164,
  });

  const displayState = resolvedState ?? c.state;
  const location = [c.city, displayState && stateName(displayState)].filter(Boolean).join(", ");
  const clockLabel = [c.city, displayState && stateName(displayState)].filter(Boolean).join(", ") || (displayState ? stateName(displayState) : "at the shop");

  const emails = [...lead.contacts.flatMap((ct) => ct.emails.map((e) => e.address)), ...c.emails.map((e) => e.address)];
  const primary = lead.contacts.find((ct) => ct.id === lead.primary_contact_id) ?? lead.contacts[0];
  const pendingFollowups = followups.filter((f) => f.status === "pending");
  const hasPendingCall = pendingFollowups.some((f) => f.kind === "call");
  const scriptVars = { rep_name: user.fullName, contact_name: primary?.full_name?.split(" ")[0] ?? "there", company: c.name };

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: backLabel }}
        title={c.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1"><Icon name="pin" className="size-3.5" />{location || "Location unknown"}</span>
            <span className="inline-flex items-center gap-1"><Icon name="user" className="size-3.5" />{lead.owner_name ?? <span className="text-warning-fg">Unassigned</span>}</span>
            <span className="inline-flex items-center gap-1"><Icon name="phone" className="size-3.5" />{plural(lead.call_attempts, "call attempt")}</span>
            <Link href={`/companies/${c.id}?from=${encodeURIComponent(backHref)}`} className="link inline-flex items-center gap-1"><Icon name="companies" className="size-3.5" />Company page</Link>
          </span>
        }
        actions={<div className="w-full sm:w-80"><ShopClock timeZone={tz} state={displayState} locationLabel={clockLabel} /></div>}
      />

      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-1.5">
        <ProductTags interested={lead.interested_in} bought={lead.bought} />
        <StatusBadge status={lead.status} />
        {lead.interest !== "unknown" && <InterestBadge interest={lead.interest} />}
        {lead.last_outcome && <OutcomeBadge outcome={lead.last_outcome} />}
        {lead.email_status !== "not_needed" && <EmailBadge status={lead.email_status} />}
        <SuppressionBadge suppression={c.suppression} />
        {c.tags.map((t) => <Badge key={t} tone="sky">{t}</Badge>)}
      </div>

      {/* Quick contact strip: the main number and email at a glance. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickFact icon="phone" label="Main phone">{primaryPhone ? <span className="tabular-nums">{formatPhone(primaryPhone.e164, primaryPhone.ext)}</span> : null}</QuickFact>
        <QuickFact icon="mail" label="Email">{emails[0] ? <a href={`mailto:${emails[0]}`} className="link block truncate" title={emails[0]}>{emails[0]}</a> : null}</QuickFact>
        <QuickFact icon="user" label="Contact">{primary?.full_name ? <>{primary.full_name}{primary.title && <span className="text-muted"> · {primary.title}</span>}</> : null}</QuickFact>
        <QuickFact icon="calendar" label="Next follow-up">
          {pendingFollowups[0] ? <span className={new Date(pendingFollowups[0].due_at) < now() ? "text-danger-fg" : ""}>{formatInZone(pendingFollowups[0].due_at, shownZone(user.view, tz, user.usTimeZone))}</span> : null}
        </QuickFact>
      </div>

      {companyNoCall && (
        <div className="mb-6">
          <Alert tone="red" title="Do not call">
            {c.suppression_reason ?? "This shop is on the internal do-not-call list."} Calls can&apos;t be logged.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card title="Log a call" icon="phone" description="Record what happened right after you hang up." bodyClassName="p-0">
            <LogCallForm
              leadId={lead.id}
              interested={lead.interested_in}
              bought={lead.bought}
              numbers={numbers}
              emails={emails}
              leadTz={tz}
              leadState={displayState}
              view={user.view}
              usTz={user.usTimeZone}
              hasPendingCallFollowup={hasPendingCall}
              emailRequired={lead.email_required}
              callBlocked={companyNoCall}
              backHref={backHref}
              backLabel={backLabel}
            />
          </Card>

          <Card title="Scripts" description="POS Development Service discovery & closing pitch scripts." icon="script" actions={<Link href="/scripts" className="link text-xs">Library</Link>}>
            <ScriptsPanel scripts={scripts} vars={scriptVars} />
          </Card>

          <Card title="Activity" icon="history" description="Calls, emails and notes are permanent records and can't be edited or deleted.">
            <ActionForm action={addNote} submitLabel="Add note" submitClassName="btn-secondary btn-sm" className="mb-6 space-y-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <textarea name="body" rows={2} required maxLength={10000} className="input" placeholder="Add a note about this shop…" aria-label="Note" />
            </ActionForm>
            {timeline.length === 0 ? <EmptyState icon="history" title="No activity yet">Calls, emails and notes will show up here.</EmptyState> : (
              <ol className="relative space-y-5 border-l border-line pl-6" data-testid="timeline">
                {timeline.map((t) => <TimelineEntry key={`${t.kind}-${t.id}`} item={t} leadTz={shownZone(user.view, tz, user.usTimeZone)} />)}
              </ol>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card title="Deal" icon="handshake">
              {deals.map((d) => (
                <details key={d.id} className="mb-3 rounded-lg border border-line p-3" open={deals.length === 1}>
                  <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-fg">{d.title}</span>
                    <span className="flex items-center gap-1.5"><StageBadge stage={d.stage} product={d.product} /><span className="text-xs text-muted">{money(d.value_cents)}</span></span>
                  </summary>
                  <div className="mt-3"><DealFields leadId={lead.id} deal={d} /></div>
                </details>
              ))}
              <details open={deals.length === 0}>
                <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-fg"><Icon name="plus" className="size-3.5" /> {deals.length ? "Add another deal" : "Create a deal"}</summary>
                <div className="mt-3"><DealFields leadId={lead.id} /></div>
              </details>
            </Card>

            <Card title="Email to send" icon="mail" description="Emails to send from your mailbox. Log each step here.">
              <ActionForm action={logEmail} submitLabel="Log email step" submitClassName="btn-secondary btn-sm">
                <input type="hidden" name="leadId" value={lead.id} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="label" htmlFor="em-status">Status</label>
                    <Dropdown id="em-status" name="status" defaultValue={lead.email_status === "not_needed" ? "pending" : lead.email_status} options={EMAIL_STATUSES.filter((st) => st !== "not_needed").map((st) => ({ value: st, label: EMAIL_STATUS_LABEL[st] }))} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="label" htmlFor="em-to">To</label>
                    <input id="em-to" name="to" list="em-list" defaultValue={emails[0] ?? ""} className="input" />
                    <datalist id="em-list">{emails.map((e) => <option key={e} value={e} />)}</datalist>
                  </div>
                </div>
                <input name="subject" maxLength={300} className="input" placeholder="Subject (optional)" aria-label="Subject" />
                <input name="notes" maxLength={10000} className="input" placeholder="Notes (optional)" aria-label="Email notes" />
              </ActionForm>
            </Card>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <CompanyDetailsCard company={c} editLeadId={lead.id} />
          <ContactsCard contacts={lead.contacts} primaryId={lead.primary_contact_id} editLeadId={lead.id} companyBlocked={companyNoCall} />

          <Card title="WhatsApp to send" icon="whatsapp" description="WhatsApp messages & follow-ups to send">
            {pendingFollowups.length === 0 ? <p className="mb-3 text-sm text-muted">Nothing scheduled.</p> : (
              <ul className="mb-4 space-y-2">
                {pendingFollowups.map((f) => {
                  const overdue = new Date(f.due_at) < now();
                  const isWhatsApp = f.notes?.toLowerCase().includes("whatsapp");
                  const cleanPhone = primaryPhone?.e164?.replace(/\D/g, "") || numbers[0]?.e164?.replace(/\D/g, "");
                  return (
                    <li key={f.id} className={`rounded-lg border p-3 text-sm ${overdue ? "border-danger-line bg-danger-soft/40" : isWhatsApp ? "border-emerald-500/30 bg-emerald-500/5" : "border-line"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className={overdue ? "font-medium text-danger-fg" : "font-medium text-fg flex items-center gap-1.5"}>
                            {isWhatsApp ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold text-xs bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-400 px-2 py-0.5 rounded">
                                <Icon name="whatsapp" className="size-3" /> WhatsApp to send
                              </span>
                            ) : (
                              <span className="capitalize">{f.kind}</span>
                            )}
                            <span className="text-xs text-muted">· {formatInZone(f.due_at, shownZone(user.view, tz ?? f.time_zone, user.usTimeZone))}</span>
                          </div>
                          {f.notes && <div className="mt-1 text-xs text-fg-2 font-medium">{f.notes}</div>}
                          <div className="mt-1 text-xs text-subtle">{f.assigned_name} · {overdue ? `overdue ${relativeTime(f.due_at)}` : relativeTime(f.due_at)}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {isWhatsApp && cleanPhone && (
                            <a
                              href={`https://wa.me/${cleanPhone}`}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-secondary px-2 py-1 text-xs text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 inline-flex items-center gap-1"
                              title="Open WhatsApp chat"
                            >
                              <Icon name="whatsapp" className="size-3" />
                              Send
                            </a>
                          )}
                          <FollowupButton leadId={lead.id} id={f.id} status="done" label="Done" />
                          <FollowupButton leadId={lead.id} id={f.id} status="cancelled" label="Cancel" />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <details>
              <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-brand-fg"><Icon name="plus" className="size-3.5" /> Schedule WhatsApp / follow-up</summary>
              <div className="mt-3"><ScheduleFollowupForm leadId={lead.id} leadTz={tz} leadState={displayState} view={user.view} usTz={user.usTimeZone} /></div>
            </details>
          </Card>

          <Card title="Products" icon="tag" description="Every shop is offered both. Calls add to this; fix it here if it's wrong.">
            <ActionForm action={updateLeadProducts} submitLabel="Save" reset={false} submitClassName="btn-secondary btn-sm">
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="grid grid-cols-2 gap-3" data-testid="lead-products">
                {PRODUCTS.map((p) => (
                  <div key={p}>
                    <label className="label" htmlFor={`lead-product-${p}`}>{PRODUCT_SHORT[p]}</label>
                    <Dropdown
                      id={`lead-product-${p}`}
                      name={`product_${p}`}
                      defaultValue={productState(lead, p)}
                      options={[{ value: "", label: "Not yet" }, { value: "interested", label: "Interested" }, { value: "bought", label: "Bought" }]}
                    />
                  </div>
                ))}
              </div>
            </ActionForm>
          </Card>

          <Card title="Lead status" icon="filter">
            <ActionForm action={updateLeadStatus} submitLabel="Save" reset={false} submitClassName="btn-secondary btn-sm">
              <input type="hidden" name="leadId" value={lead.id} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="lead-status">Status</label>
                  <Dropdown id="lead-status" name="status" defaultValue={lead.status} options={LEAD_STATUSES.map((st) => ({ value: st, label: LEAD_STATUS_LABEL[st] }))} />
                </div>
                <div>
                  <label className="label" htmlFor="lead-interest">Interest</label>
                  <Dropdown id="lead-interest" name="interest" defaultValue={lead.interest} options={INTEREST_LEVELS.map((st) => ({ value: st, label: INTEREST_LABEL[st] }))} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-fg-2">
                <input type="checkbox" name="emailRequired" defaultChecked={lead.email_required} className="size-4" /> Email required
              </label>
            </ActionForm>
            <div className="mt-4 border-t border-line pt-3">
              <DetailList
                items={[
                  { label: "Source", value: lead.import_id ? <Link className="link break-all" href={`/imports/${lead.import_id}`}>{lead.import_filename ?? "Import"}</Link> : lead.source ?? "Manual" },
                  { label: "Added", value: relativeTime(lead.created_at) },
                ]}
              />
            </div>
          </Card>

          <Card title={`Documents (${documents.length})`} icon="file" id="documents">
            {docMsg && DOC_MESSAGES[docMsg] && <div className="mb-3"><Alert tone={DOC_MESSAGES[docMsg].tone}>{DOC_MESSAGES[docMsg].text}</Alert></div>}
            {documents.length > 0 && (
              <ul className="mb-3 space-y-1.5 text-sm">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <a href={`/api/files/${d.id}`} className="link flex min-w-0 items-center gap-1.5"><Icon name="file" className="size-3.5 shrink-0" /><span className="truncate">{d.filename}</span></a>
                    <span className="shrink-0 text-xs text-subtle">{d.from_import ? "import source" : relativeTime(d.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <form action="/api/documents" method="post" encType="multipart/form-data" className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="file" name="file" required aria-label="Document" accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif" className="min-w-0 text-sm text-muted file:mr-2 file:rounded-md file:border-0 file:bg-surface-3 file:px-2.5 file:py-1.5 file:text-sm file:text-fg-2" />
              <button type="submit" className="btn-secondary btn-sm">Attach</button>
            </form>
          </Card>

          {user.role === "admin" && (
            <Card title="Delete this lead" icon="trash" description="When the work with this shop is finished. Removes the shop with its calls, follow-ups, emails, deals, notes, contacts and files.">
              <DeleteButton kind="leads" ids={[lead.id]} name={c.name} after="/leads" testId="delete-lead" />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function QuickFact({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="card flex min-w-0 items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
      <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-muted sm:flex"><Icon name={icon} /></span>
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className="truncate text-sm font-medium text-fg">{children ?? <span className="font-normal text-subtle">Not listed</span>}</div>
      </div>
    </div>
  );
}

function FollowupButton({ leadId, id, status, label }: { leadId: string; id: string; status: string; label: string }) {
  return (
    <form action={setFollowupStatus}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="followupId" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={status === "done" ? "btn-secondary px-2 py-1 text-xs" : "btn-ghost px-2 py-1 text-xs"}>{label}</button>
    </form>
  );
}

function productState(lead: { interested_in: Product[]; bought: Product[] }, p: Product) {
  return lead.bought.includes(p) ? "bought" : lead.interested_in.includes(p) ? "interested" : "";
}

function DealFields({ leadId, deal }: { leadId: string; deal?: { id: string; product: Product | null; title: string; stage: string; value_cents: number | null; expected_close_on: string | Date | null } }) {
  const close = deal?.expected_close_on ? new Date(deal.expected_close_on).toISOString().slice(0, 10) : "";
  return (
    <ActionForm action={saveDeal} submitLabel={deal ? "Update deal" : "Create deal"} reset={!deal} submitClassName="btn-secondary">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="opportunityId" value={deal?.id ?? ""} />
      <input name="title" required maxLength={200} defaultValue={deal?.title ?? ""} placeholder="e.g. POS subscription, first stock order" className="input" aria-label="Deal title" />
      <Dropdown name="product" defaultValue={deal?.product ?? ""} ariaLabel="Deal product" options={[{ value: "", label: "Both products" }, ...PRODUCTS.map((p) => ({ value: p, label: PRODUCT_LABEL[p] }))]} />
      <div className="grid grid-cols-2 gap-2">
        <Dropdown name="stage" defaultValue={deal?.stage ?? "prospect"} ariaLabel="Deal stage" options={DEAL_STAGES.map((s) => ({ value: s, label: stageLabel(s as DealStage, deal?.product) }))} />
        <input name="value" type="number" min={0} step="1" defaultValue={deal?.value_cents != null ? deal.value_cents / 100 : ""} placeholder="Value $" className="input" aria-label="Deal value in dollars" />
      </div>
      <input name="expectedClose" type="date" defaultValue={close} className="input" aria-label="Expected close date" />
    </ActionForm>
  );
}

const KIND_STYLE: Record<TimelineItem["kind"], { icon: IconName; cls: string }> = {
  call: { icon: "phone", cls: "bg-brand-soft text-brand-fg" },
  email: { icon: "mail", cls: "bg-accent-soft text-accent-fg" },
  note: { icon: "note", cls: "bg-surface-3 text-fg-2" },
  followup: { icon: "calendar", cls: "bg-warning-soft text-warning-fg" },
  audit: { icon: "history", cls: "bg-surface-3 text-subtle" },
};

function TimelineEntry({ item: t, leadTz }: { item: TimelineItem; leadTz: string }) {
  const style = KIND_STYLE[t.kind];
  let title: React.ReactNode = t.title;
  let detail: React.ReactNode = null;
  let nextStep: string | null = null;
  const m = t.meta as Record<string, string | null>;
  if (t.kind === "call") {
    const isHidden = !t.title || HIDDEN_CALL_OUTCOMES.has(t.title);
    title = <span className="inline-flex flex-wrap items-center gap-1.5">Call {!isHidden && <OutcomeBadge outcome={t.title} />}</span>;
    nextStep = m.next_step;
    const products = (key: string) => ((t.meta[key] as Product[] | undefined) ?? []).map((p) => PRODUCT_SHORT[p]).join(" and ");
    detail = [
      m.phone && formatPhone(m.phone),
      m.interest && `interest: ${INTEREST_LABEL[m.interest as keyof typeof INTEREST_LABEL]}`,
      products("interested_in") && `interested in ${products("interested_in")}`,
      products("bought") && `bought ${products("bought")}`,
      m.duration && `${Math.round(Number(m.duration) / 60)} min`,
    ].filter(Boolean).join(" · ");
  } else if (t.kind === "email") {
    title = <span className="inline-flex flex-wrap items-center gap-1.5">Email <EmailBadge status={t.title} /></span>;
    detail = [m.to, m.subject].filter(Boolean).join(" · ");
  } else if (t.kind === "note") {
    title = "Note";
  } else if (t.kind === "followup") {
    title = <>Follow-up ({t.title}) for {m.due_at ? formatInZone(m.due_at, leadTz) : "?"}</>;
    detail = m.status === "pending" ? "Pending" : `${m.status === "done" ? "Done" : "Cancelled"}${m.completed_at ? ` ${relativeTime(m.completed_at)}` : ""}`;
  } else if (t.title === "lead.assigned") {
    title = "Lead reassigned";
  } else if (t.title === "opportunity.stage") {
    title = <>Deal stage → {stageLabel(m.to as DealStage)}</>;
  } else if (t.title === "document.uploaded") {
    title = <>Document attached{m.filename ? `: ${m.filename}` : ""}</>;
  }
  return (
    <li className="relative">
      <span className={`absolute -top-0.5 -left-[37px] flex size-6 items-center justify-center rounded-full ring-4 ring-surface ${style.cls}`} aria-hidden>
        <Icon name={style.icon} className="size-3" />
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <div className="text-sm font-medium text-fg">{title}</div>
        <time className="text-xs text-subtle" dateTime={new Date(t.at).toISOString()} title={new Date(t.at).toISOString()}>
          {relativeTime(t.at)}{t.user_name ? ` · ${t.user_name}` : ""}
        </time>
      </div>
      {nextStep && <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-xs font-medium text-success-fg"><Icon name="arrowRight" className="size-3" /> Next step: {nextStep}</div>}
      {detail && <div className="mt-0.5 text-xs text-muted">{detail}</div>}
      {t.body && <p className="mt-1.5 rounded-lg bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap text-fg-2">{t.body}</p>}
    </li>
  );
}
