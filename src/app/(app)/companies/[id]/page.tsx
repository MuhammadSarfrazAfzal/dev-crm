import type { Metadata } from "next";
import { DeleteButton } from "@/components/DeleteButton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyDetailsCard, ContactsCard } from "@/components/client/ClientPanels";
import { InterestBadge, OutcomeBadge, StatusBadge } from "@/components/badges";
import { Icon } from "@/components/icons";
import { Card, Dash, EmptyState, PageHeader, ProductTags } from "@/components/ui";
import { ProductPills } from "@/components/table/RowBits";
import { withUserDb } from "@/lib/auth/current";
import { plural, relativeTime } from "@/lib/format";
import { isUuid } from "@/lib/params";
import { formatInZone, shownZone } from "@/lib/time";
import { resolveCompanyTimeZone, stateName } from "@/lib/us";
import { getCompany } from "@/server/companies";

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const data = await withUserDb(async (tx, user) => ({ user, detail: await getCompany(tx, id) }));
  if (!data.detail) notFound();
  const { user, detail } = data;
  const { company: c, contacts, leads, calls, documents } = detail;
  const editLeadId = leads[0]?.id ?? null;
  const { timeZone: tz } = resolveCompanyTimeZone({ timeZone: c.time_zone, state: c.state, city: c.city });
  const noCall = c.suppression === "do_not_call" || c.suppression === "do_not_contact";

  const fromUrl = typeof sp.from === "string" ? sp.from : undefined;
  let backHref = "/companies";
  let backLabel = "Companies";

  if (fromUrl) {
    backHref = fromUrl;
    backLabel = "Back";
  } else {
    const backEntries: [string, string][] = [];
    for (const [k, v] of Object.entries(sp)) {
      if (k === "from" || v === undefined || v === "") continue;
      backEntries.push([k, Array.isArray(v) ? v.join(",") : v]);
    }
    const backQuery = new URLSearchParams(backEntries).toString();
    backHref = `/companies${backQuery ? `?${backQuery}` : ""}`;
    const pageNum = sp.page ? Number(sp.page) : undefined;
    backLabel = pageNum && pageNum > 1 ? `Companies (Page ${pageNum})` : "Companies";
  }

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: backLabel }}
        eyebrow="Company"
        title={c.name}
        actions={user.role === "admin" ? <DeleteButton kind="companies" ids={[c.id]} name={c.name} after="/companies" testId="delete-company" /> : undefined}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1"><Icon name="pin" className="size-3.5" />{[c.city, c.state && stateName(c.state)].filter(Boolean).join(", ") || "Location unknown"}</span>
            <span className="inline-flex items-center gap-1"><Icon name="users" className="size-3.5" />{plural(contacts.length, "contact")}</span>
            <span className="inline-flex items-center gap-1"><Icon name="calendar" className="size-3.5" />Added {relativeTime(c.created_at)}</span>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card title="Lead" icon="leads" description="POS Development Service lead details and status.">
            {leads.length === 0 ? <p className="text-sm text-muted">No leads for this company.</p> : (
              <ul className="grid gap-3">
                {leads.map((l) => (
                  <li key={l.id} className="rounded-xl border border-line p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-fg">Owner: {l.owner_name ?? "unassigned"}</div>
                        <div className="text-xs text-muted">{l.interested_in.length || l.bought.length ? "Wants:" : "No product interest yet"}</div>
                      </div>
                      <span className="flex flex-wrap justify-end gap-1"><ProductTags interested={l.interested_in} bought={l.bought} /></span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      <StatusBadge status={l.status} />
                      {l.interest !== "unknown" && <InterestBadge interest={l.interest} />}
                      <OutcomeBadge outcome={l.last_outcome} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div><dt className="text-muted">Calls</dt><dd className="font-medium text-fg tabular-nums">{l.call_attempts}</dd></div>
                      <div><dt className="text-muted">Next follow-up</dt><dd className="font-medium text-fg">{l.next_followup_at ? formatInZone(l.next_followup_at, shownZone(user.view, c.time_zone, user.usTimeZone)) : "None"}</dd></div>
                    </dl>
                    <Link href={`/leads/${l.id}?from=${encodeURIComponent(`/companies/${c.id}`)}`} className="btn-secondary btn-sm mt-4 w-full sm:w-auto">
                      Open lead <Icon name="arrowRight" className="size-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent calls" icon="history">
            {calls.length === 0 ? <EmptyState icon="phone" title="No calls yet">Calls logged on this company show up here.</EmptyState> : (
              <div className="-m-5 overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>When</th><th>Outcome</th><th>Products</th><th>Next step / notes</th><th>By</th></tr></thead>
                  <tbody>
                    {calls.map((a) => (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap text-muted">{relativeTime(a.occurred_at)}</td>
                        <td><OutcomeBadge outcome={a.outcome} /></td>
                        <td><span className="flex gap-1"><ProductPills interested={a.interested_in} bought={a.bought} /></span>{!a.interested_in.length && !a.bought.length && <Dash />}</td>
                        <td className="max-w-md">
                          {a.next_step && <div className="text-xs font-medium text-success-fg">Next: {a.next_step}</div>}
                          <div className="truncate text-muted" title={a.notes ?? ""}>{a.notes ?? <Dash />}</div>
                        </td>
                        <td className="whitespace-nowrap">{a.user_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <CompanyDetailsCard company={c} editLeadId={editLeadId} />
          <ContactsCard contacts={contacts} primaryId={contacts.find((ct) => ct.is_primary)?.id} editLeadId={editLeadId} companyBlocked={noCall} />
          <Card title={`Documents (${documents.length})`} icon="file">
            {documents.length === 0 ? <p className="text-sm text-muted">No documents. Attach files from a lead page.</p> : (
              <ul className="space-y-1.5 text-sm">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <a href={`/api/files/${d.id}`} className="link flex min-w-0 items-center gap-1.5"><Icon name="file" className="size-3.5 shrink-0" /><span className="truncate">{d.filename}</span></a>
                    <span className="shrink-0 text-xs text-subtle">{d.from_import ? "import source" : relativeTime(d.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
