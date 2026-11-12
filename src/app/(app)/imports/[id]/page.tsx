import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addImportRow, editImportRow, saveDecisions, updateMapping } from "@/app/actions/imports";
import { DeleteImportButton } from "@/components/DeleteImportButton";
import { SubmitButton } from "@/components/SubmitButton";
import { PageJumpFilter } from "@/components/table/PageJumpFilter";
import { Dropdown } from "@/components/menu/Dropdown";
import { Icon, type IconName } from "@/components/icons";
import { Alert, Badge, Card, Dash, EmptyState, PageHeader, Segmented, Stat } from "@/components/ui";
import { withUserDb } from "@/lib/auth/current";
import { relativeTime } from "@/lib/format";
import { FIELD_LABEL, FIELDS } from "@/lib/import/columns";
import { BLOCKING_ISSUES, ISSUE_LABEL, REVIEW_CONFIDENCE, REVIEW_ISSUES, type NormalizedRow } from "@/lib/import/normalize";
import { isUuid } from "@/lib/params";
import { formatPhone } from "@/lib/phone";
import type { RawRow } from "@/server/imports";
import { listOwners } from "@/server/leads";

export const metadata: Metadata = { title: "Import preview" };

const ROWS_PER_PAGE = 100;

export default async function ImportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const show = sp.show === "review" || sp.show === "skipped" || sp.show === "duplicates" ? sp.show : "all";
  const page = Math.max(1, Number(sp.page) || 1);

  const data = await withUserDb(async (tx, user) => {
    const [imp] = await tx`select i.*, p.full_name as uploader, a.full_name as assignee
      from imports i left join profiles p on p.id = i.uploaded_by left join profiles a on a.id = i.assign_to where i.id = ${id}`;
    if (!imp) return null;
    const filter =
      show === "review" ? tx`and (confidence < ${REVIEW_CONFIDENCE} or issues && ${REVIEW_ISSUES}::text[])` :
      show === "duplicates" ? tx`and (duplicate_of_company is not null or duplicate_of_lead is not null or duplicate_in_file is not null or issues && array['duplicate_existing','duplicate_in_file']::text[])` :
      show === "skipped" ? tx`and decision = 'skip'` : tx``;
    const [[stats], [{ n }], rows, samples, needsLook, [doc], owners] = await Promise.all([
      tx`select
        count(*)::int as total,
        count(*) filter (where decision = 'include')::int as included,
        count(*) filter (where decision = 'skip')::int as skipped,
        count(*) filter (where duplicate_of_company is not null or duplicate_of_lead is not null or duplicate_in_file is not null or issues && array['duplicate_existing','duplicate_in_file']::text[])::int as duplicates,
        count(*) filter (where confidence < ${REVIEW_CONFIDENCE} or issues && ${REVIEW_ISSUES}::text[])::int as review,
        count(*) filter (where issues && array['missing_company','no_contact_method'])::int as blocked,
        count(*) filter (where jsonb_array_length(coalesce(normalized -> 'phones', '[]')) > 0)::int as with_phone,
        count(*) filter (where jsonb_array_length(coalesce(normalized -> 'emails', '[]')) > 0)::int as with_email,
        count(*) filter (where normalized ->> 'contact_name' is not null)::int as with_contact,
        count(*) filter (where normalized ->> 'address' is not null)::int as with_address,
        count(*) filter (where normalized ->> 'website' is not null)::int as with_website
      from import_rows where import_id = ${id}`,
      tx`select count(*)::int as n from import_rows where import_id = ${id} ${filter}`,
      tx`select id, row_index, source_ref, raw, normalized, issues, confidence, duplicate_of_company, duplicate_of_lead,
        duplicate_in_file, decision, lead_id
      from import_rows where import_id = ${id} ${filter} order by row_index limit ${ROWS_PER_PAGE} offset ${(page - 1) * ROWS_PER_PAGE}`,
      tx`select raw from import_rows where import_id = ${id} order by row_index limit 5`,
      imp.status === "preview"
        ? tx`select id, row_index, raw, normalized, issues, confidence from import_rows
          where import_id = ${id} and (confidence < ${REVIEW_CONFIDENCE} or issues && ${REVIEW_ISSUES}::text[]
            -- fixed rows that were mixed stay here so the other business can still be added
            or (raw ? 'edited' and coalesce(raw -> 'issues', '[]'::jsonb) ? 'needs_split'))
          order by row_index limit 50`
        : [],
      tx`select id, filename from documents where import_id = ${id} limit 1`,
      user.role === "admin" ? listOwners(tx) : [],
    ]);
    return { user, imp, stats, rows, count: n as number, samples: samples.map((s) => (s.raw as RawRow).cells), doc, owners, needsLook };
  });
  if (!data) notFound();
  const { user, imp, stats, rows, count, samples, doc, owners, needsLook } = data;
  const editable = imp.status === "preview";
  const mapping = imp.column_mapping as Record<string, string>;
  const pages = Math.max(1, Math.ceil(count / ROWS_PER_PAGE));
  const msg = sp.msg;
  const qs = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams(Object.entries({ show: show === "all" ? undefined : show, page: page > 1 ? page : undefined, ...o }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <PageHeader
        back={{ href: "/imports", label: "Imports" }}
        title={imp.original_filename ?? (imp.source_type === "research" ? "Research results" : "Pasted text")}
        subtitle={<>Uploaded by {imp.uploader} {relativeTime(imp.created_at)} · read with {imp.parser}</>}
        actions={
          <div className="flex items-center gap-2">
            {doc ? <a href={`/api/files/${doc.id}`} className="btn-secondary"><Icon name="file" /> Original file</a> : null}
            {(user.role === "admin" || user.id === imp.uploaded_by) && (
              <DeleteImportButton
                importId={imp.id}
                filename={imp.original_filename ?? (imp.source_type === "research" ? "Research results" : "Import document")}
                variant="button"
                after="/imports"
              />
            )}
          </div>
        }
      />

      <div className="mb-4 space-y-3">
        {msg === "mapped" && <Alert tone="green">Columns re-matched. Rows were checked again.</Alert>}
        {msg === "saved" && <Alert tone="green">Selection saved.</Alert>}
        {msg === "edited" && <Alert tone="green">Row updated and checked again.</Alert>}
        {msg === "split" && <Alert tone="green">Added the other business as a new row.</Alert>}
        {msg === "rejected" && <Alert tone="sky">Import discarded. Nothing was added.</Alert>}
        {msg === "failed" && <Alert tone="red">The import couldn&apos;t be approved. Check the owner and try again.</Alert>}
        {msg?.startsWith("approved-") && (
          <Alert tone="green" title="Import approved">
            {msg.split("-")[1]} lead(s) added{Number(msg.split("-")[2]) ? `, ${msg.split("-")[2]} included row(s) skipped (duplicates or missing details)` : ""}. <Link href="/leads?sort=recent" className="font-medium underline">Go to leads</Link>
          </Alert>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Badge tone={editable ? "amber" : imp.status === "approved" ? "green" : "slate"} dot>{editable ? "Waiting for your approval" : imp.status === "approved" ? "Approved" : imp.status}</Badge>
        {imp.assignee && <Badge>Leads go to {imp.assignee}</Badge>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Rows found" value={stats.total} icon="file" />
        <Stat label={editable ? "Will import" : "Imported"} value={editable ? stats.included : imp.approved_count} tone="green" icon="check" />
        <Stat label="Needs a look" value={stats.review} tone="amber" hint="Unclear or guessed rows" href={`/imports/${imp.id}?show=review#needs-look`} icon="alert" />
        <Stat label="Already Added" value={stats.duplicates} tone="red" hint="Cannot be added" href={`/imports/${imp.id}${qs({ show: "duplicates", page: undefined })}`} icon="ban" />
        <Stat label="Unusable" value={stats.blocked} tone="slate" hint="No name or contact" icon="ban" />
      </div>

      <Card title="What was found" description="How many rows have each kind of detail. Empty cells in the table mean the file didn't include that detail." className="mb-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {([
            ["Phone", stats.with_phone, "phone"],
            ["Email", stats.with_email, "mail"],
            ["Contact name", stats.with_contact, "user"],
            ["Street address", stats.with_address, "pin"],
            ["Website", stats.with_website, "globe"],
          ] as const).map(([label, n, icon]) => (
            <Coverage key={label} label={label} icon={icon} n={n} total={stats.total} />
          ))}
        </div>
        {stats.total > 0 && stats.with_email === 0 && (
          <p className="mt-4 flex items-start gap-2 text-xs text-muted">
            <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
            This file has no email addresses in it, so the Email column is empty. Emails are picked up automatically when a file lists them.
          </p>
        )}
      </Card>

      {(imp.notes as string[]).length > 0 && (
        <details className="card mb-6 px-5 py-3.5 text-sm" open={(imp.notes as string[]).length <= 4}>
          <summary className="cursor-pointer font-medium text-fg">Notes from reading the file ({(imp.notes as string[]).length})</summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 [overflow-wrap:anywhere] text-muted">{(imp.notes as string[]).map((n, i) => <li key={i}>{n}</li>)}</ul>
        </details>
      )}

      {editable && (
        <details className="card mb-6" open={stats.total > 0 && Object.values(mapping).every((v) => v === "ignore")}>
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-5 py-3.5">
            <span>
              <span className="block text-sm font-semibold text-fg">Match columns</span>
              <span className="block text-xs text-muted">Which CRM field each column of the file fills. Change one if it was matched wrong.</span>
            </span>
            <Icon name="chevronDown" className="size-4 text-muted" />
          </summary>
          <form action={updateMapping} className="space-y-4 border-t border-line p-5">
            <input type="hidden" name="importId" value={imp.id} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(imp.headers as string[]).map((h) => (
                <div key={h} className="rounded-lg border border-line bg-surface-2 p-3">
                  <label className="mb-1.5 block truncate text-sm font-medium text-fg" htmlFor={`map-${h}`} title={h}>{h}</label>
                  <Dropdown id={`map-${h}`} name={`map:${h}`} defaultValue={mapping[h] ?? "ignore"} className="py-1.5" options={FIELDS.map((f) => ({ value: f, label: FIELD_LABEL[f] }))} />
                  <div className="mt-1.5 truncate text-xs text-muted" title={samples.map((s) => s[h]).filter(Boolean).join(" · ")}>
                    e.g. {samples.map((s) => s[h]).filter(Boolean).slice(0, 2).join(" · ") || "—"}
                  </div>
                </div>
              ))}
            </div>
            <SubmitButton pendingText="Re-checking…" className="btn-secondary">Apply column matching</SubmitButton>
          </form>
        </details>
      )}

      {editable && needsLook.length > 0 && (
        <Card id="needs-look" icon="alert" title={`Needs a look (${needsLook.length}${needsLook.length === 50 ? "+" : ""})`} description="Rows cut from text that couldn't be split cleanly or with a guessed name. Fix the fields, or add the second business as its own row." className="mb-6">
          <ul className="space-y-4">
            {needsLook.map((r) => {
              const n = r.normalized as NormalizedRow;
              const raw = r.raw as RawRow;
              const issues = r.issues as string[];
              return (
                <li key={r.id} className="grid gap-4 rounded-lg border border-warning-line bg-warning-soft/40 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]" data-testid="needs-look-row">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1 text-xs text-muted">
                      Row {r.row_index}
                      {raw.edited && <Badge tone="green">Fixed</Badge>}
                      {issues.map((i) => <Badge key={i} tone={BLOCKING_ISSUES.has(i) ? "red" : "amber"}>{ISSUE_LABEL[i] ?? i}</Badge>)}
                    </div>
                    <pre className="max-h-48 overflow-auto rounded-md bg-surface p-2.5 font-mono text-xs whitespace-pre-wrap text-fg-2 ring-1 ring-line">
                      {raw.snippet ?? Object.entries(raw.cells).map(([k, v]) => `${k}: ${v}`).join("\n")}
                    </pre>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <RowFields id={`e-${r.id}`} importId={imp.id} rowId={r.id} n={n} action={editImportRow} label="Save fixes" />
                    {(raw.snippet || issues.includes("needs_split")) && (
                      <details open={!!raw.edited && (raw.issues ?? []).includes("needs_split")}>
                        <summary className="cursor-pointer text-xs font-medium text-brand-fg">Add another business from this text</summary>
                        <div className="mt-2"><RowFields id={`a-${r.id}`} importId={imp.id} rowId={r.id} action={addImportRow} label="Add as new row" /></div>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <form action={saveDecisions}>
        <input type="hidden" name="importId" value={imp.id} />
        <input type="hidden" name="page" value={page} />
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <Segmented
              label="Rows to show"
              items={(["all", "duplicates", "review", "skipped"] as const).map((sh) => ({
                href: `/imports/${imp.id}${qs({ show: sh === "all" ? undefined : sh, page: undefined })}`,
                label: sh === "all" ? "All rows" : sh === "duplicates" ? `Already added (${stats.duplicates})` : sh === "review" ? "Needs a look" : "Skipped",
                active: show === sh,
              }))}
            />
            <span className="text-sm text-muted">{count} row{count === 1 ? "" : "s"}</span>
          </div>
          {rows.length === 0 ? <div className="p-5"><EmptyState icon="file" title="No rows here" /></div> : (
            <div className="overflow-x-auto">
              <table className="table-base" data-testid="import-rows">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 w-10">{editable ? "Add" : "Lead"}</th>
                    <th>#</th>
                    <th className="min-w-52">Company</th>
                    <th>Contact</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th className="min-w-48">Address</th>
                    <th>City</th>
                    <th>State</th>
                    <th>ZIP</th>
                    <th>Website</th>
                    <th>Source</th>
                    <th>Area</th>
                    <th className="min-w-44">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const n = r.normalized as NormalizedRow;
                    const issues = r.issues as string[];
                    const fc = ((r.raw as RawRow).edited ? {} : (r.raw as RawRow).field_confidence) ?? {};
                    const unsure = (k: string) => (fc[k] !== undefined && fc[k] < 0.75 ? <span className="ml-1 text-warning-fg" title="Guessed — check it">?</span> : null);
                    const blocked = issues.some((i) => BLOCKING_ISSUES.has(i));
                    const isExistingDuplicate = Boolean(r.duplicate_of_company || r.duplicate_of_lead || issues.includes("duplicate_existing"));
                    const isFileDuplicate = Boolean(r.duplicate_in_file !== null || issues.includes("duplicate_in_file"));
                    const isDuplicate = isExistingDuplicate || isFileDuplicate;
                    const cannotAdd = blocked || isDuplicate;
                    const conf = Number(r.confidence);
                    const skipped = r.decision === "skip" || cannotAdd;
                    return (
                      <tr key={r.id} className={cannotAdd ? "bg-red-500/[0.03] text-muted hover:bg-red-500/[0.07]" : skipped ? "bg-surface-2 text-muted" : "hover:bg-surface-2/60"}>
                        <td className={`sticky left-0 z-10 ${cannotAdd ? "bg-red-500/[0.04]" : skipped ? "bg-surface-2" : "bg-surface"}`}>
                          <input type="hidden" name="rowIds" value={r.id} />
                          {editable ? (
                            isExistingDuplicate ? (
                              <div className="flex flex-col items-start gap-1 py-1">
                                <span className="inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger-fg ring-1 ring-red-500/30 whitespace-nowrap" title="Already added in CRM — cannot be added again">
                                  <Icon name="ban" className="size-3 shrink-0" />
                                  <span>Already added</span>
                                </span>
                                {r.duplicate_of_lead && (
                                  <Link href={`/leads/${r.duplicate_of_lead}`} target="_blank" className="text-[10px] text-brand-fg underline hover:text-brand whitespace-nowrap" title="Open existing lead in new tab">
                                    View lead
                                  </Link>
                                )}
                              </div>
                            ) : isFileDuplicate ? (
                              <div className="flex flex-col items-start gap-1 py-1">
                                <span className="inline-flex items-center gap-1 rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-500 dark:text-violet-400 ring-1 ring-violet-500/30 whitespace-nowrap" title={`Duplicate of row ${r.duplicate_in_file}`}>
                                  <Icon name="copy" className="size-3 shrink-0" />
                                  <span>Duplicate</span>
                                </span>
                              </div>
                            ) : blocked ? (
                              <div className="flex items-center py-1 text-muted" title="Missing company name or contact method">
                                <Icon name="ban" className="size-4 text-danger-fg" />
                              </div>
                            ) : (
                              <input type="checkbox" name="include" value={r.id} defaultChecked={r.decision === "include"} aria-label={`Import row ${r.row_index}`} className="mt-0.5 size-4" />
                            )
                          ) : r.lead_id ? (
                            <Link href={`/leads/${r.lead_id}`} className="link text-xs">Open</Link>
                          ) : <span className="text-xs">skipped</span>}
                        </td>
                        <td className="text-xs text-subtle tabular-nums" title={r.source_ref ?? ""}>{n.record_number ?? r.row_index}</td>
                        <td className="font-medium text-fg">{n.company ?? <span className="text-danger-fg">missing</span>}{unsure("company")}</td>
                        <td className="whitespace-nowrap">{n.contact_name ?? <Dash />}{unsure("contact")}{n.title && <div className="text-xs text-muted">{n.title}</div>}</td>
                        <td className="whitespace-nowrap tabular-nums">{n.phones.length ? n.phones.map((p) => <div key={p.e164}>{formatPhone(p.e164, p.ext)}</div>) : <Dash />}</td>
                        <td className="whitespace-nowrap" data-testid="import-email">{n.emails.length ? n.emails.map((e) => <div key={e.address}>{e.address}</div>) : <Dash />}</td>
                        <td>{n.address ?? <Dash />}</td>
                        <td className="whitespace-nowrap">{n.city ?? <Dash />}</td>
                        <td>{n.state ?? <Dash />}</td>
                        <td className="tabular-nums">{n.postal_code ?? <Dash />}</td>
                        <td className="whitespace-nowrap">{n.website_domain ?? <Dash />}</td>
                        <td className="max-w-44 truncate text-xs text-muted" title={n.source ?? ""}>{n.source ? n.source.replace(/^[^:]+:\s*/, "") : <Dash />}</td>
                        <td className="whitespace-nowrap">{n.area ? <Badge tone="sky">{n.area}</Badge> : <Dash />}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            <Badge tone={conf >= 0.85 ? "green" : conf >= REVIEW_CONFIDENCE ? "amber" : "red"} title="Confidence">{Math.round(conf * 100)}%</Badge>
                            {issues.map((i) => (
                              <Badge key={i} tone={BLOCKING_ISSUES.has(i) ? "red" : i === "duplicate_existing" ? "red" : i.startsWith("duplicate") ? "violet" : "amber"}>
                                {i === "duplicate_in_file" ? `Same as row ${r.duplicate_in_file}` : i === "duplicate_existing" ? (r.duplicate_of_lead ? "Already in CRM (Lead exists)" : "Already added in CRM") : ISSUE_LABEL[i] ?? i}
                              </Badge>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <nav className="flex items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm" aria-label="Pagination">
              {page > 1 ? <Link className="btn-secondary btn-sm" href={`/imports/${imp.id}${qs({ page: page - 1 })}`}><Icon name="chevronLeft" className="size-3.5" /> Previous</Link> : <span />}
              <PageJumpFilter
                page={page}
                pages={pages}
                note="Save your selection before changing page"
              />
              {page < pages ? <Link className="btn-secondary btn-sm" href={`/imports/${imp.id}${qs({ page: page + 1 })}`}>Next <Icon name="chevronRight" className="size-3.5" /></Link> : <span />}
            </nav>
          )}
        </div>

        {editable && (
          <div className="card sticky bottom-3 z-20 mt-4 flex flex-col gap-3 px-4 py-3 shadow-pop md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted">
              {user.role === "admin" ? (
                <>
                  <label className="whitespace-nowrap" htmlFor="assign">Leads go to</label>
                  <div className="w-48"><Dropdown id="assign" name="assignTo" defaultValue={imp.assign_to ?? user.id} className="py-1.5" options={owners.map((o) => ({ value: o.id, label: o.full_name }))} /></div>
                </>
              ) : (
                <span>Approved rows become leads assigned to you.</span>
              )}
              <span className="text-xs text-danger-fg font-medium flex items-center gap-1.5" title="Duplicate leads and shops already in the CRM cannot be imported.">
                <Icon name="ban" className="size-3.5 shrink-0" />
                Leads already in CRM cannot be added and are automatically skipped.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="intent" value="reject" pendingText="Working…" className="btn-danger">Discard</SubmitButton>
              <SubmitButton name="intent" value="save" pendingText="Saving…" className="btn-secondary">Save selection</SubmitButton>
              <SubmitButton name="intent" value="approve" pendingText="Importing…" className="btn-primary">Approve and import {stats.included}</SubmitButton>
            </div>
          </div>
        )}
      </form>
    </>
  );
}

function Coverage({ label, icon, n, total }: { label: string; icon: IconName; n: number; total: number }) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-fg-2"><Icon name={icon} className="size-3.5 text-muted" />{label}</span>
        <span className="text-muted tabular-nums">{n} / {total}</span>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-surface-3" aria-hidden>
        <div className={`h-1.5 rounded-full ${pct === 0 ? "" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RowFields({ id, importId, rowId, n, action, label }: { id: string; importId: string; rowId: string; n?: NormalizedRow; action: (form: FormData) => Promise<void>; label: string }) {
  const f = (name: string, text: string, value: string | null | undefined, cls = "") => (
    <div className={cls}>
      <label className="label" htmlFor={`${id}-${name}`}>{text}</label>
      <input id={`${id}-${name}`} name={name} defaultValue={value ?? ""} className="input py-1.5" />
    </div>
  );
  return (
    <form action={action} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <input type="hidden" name="importId" value={importId} />
      <input type="hidden" name="rowId" value={rowId} />
      {f("company", "Company", n?.company, "col-span-2")}
      {f("contact_name", "Contact", n?.contact_name, "col-span-2")}
      {f("phone", "Phone(s)", n?.phones.map((p) => formatPhone(p.e164, p.ext)).join("; "), "col-span-2")}
      {f("email", "Email(s)", n?.emails.map((e) => e.address).join("; "), "col-span-2")}
      {f("address", "Street", n?.address, "col-span-2")}
      {f("city", "City", n?.city)}
      {f("state", "State", n?.state)}
      {f("postal_code", "ZIP", n?.postal_code)}
      {f("website", "Website", n?.website)}
      <div className="col-span-2 flex items-end sm:col-span-2">
        <input type="hidden" name="notes" value={n?.notes ?? ""} />
        <SubmitButton pendingText="Saving…" className="btn-secondary py-1.5">{label}</SubmitButton>
      </div>
    </form>
  );
}
