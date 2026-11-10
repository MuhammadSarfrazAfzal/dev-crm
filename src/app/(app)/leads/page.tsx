import type { Metadata } from "next";
import { now } from "@/lib/clock";
import Link from "next/link";
import { assignLeads } from "@/app/actions/leads";
import { Icon } from "@/components/icons";
import { AssignMenu } from "@/components/AssignMenu";
import { LiveSearch } from "@/components/LiveSearch";
import { Alert, Avatar, Dash, EmptyState, PageHeader, ProductTags } from "@/components/ui";
import { OutcomeBadge, SuppressionBadge } from "@/components/badges";
import { LEAD_STATUS_LABEL, type LeadStatus } from "@/lib/labels";
import { withUserDb } from "@/lib/auth/current";
import { filtersToQuery, importLabels, leadFacets, listLeads, listOwners, parseLeadFilters, PAGE_SIZE, type LeadFilters, type LeadRow, type SortKey } from "@/server/leads";
import { FilterBar } from "@/components/leads/FilterBar";
import { SelectAllCheckbox } from "@/components/table/SelectAllCheckbox";
import { PageJumpFilter } from "@/components/table/PageJumpFilter";
import { Pill, ProductPills, shortAgo, Soft } from "@/components/table/RowBits";
import { RowCountFilter } from "@/components/leads/RowCountFilter";
import { SortMenu } from "@/components/leads/SortMenu";
import { filterGroups } from "./filter-groups";
import { formatPhone } from "@/lib/phone";
import { formatInZone, otherZone, shownZone, zoneAbbreviation, type TimeView } from "@/lib/time";
import { relativeTime } from "@/lib/format";
import { LeadsLiveRefresher } from "./LeadsLiveRefresher";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "Leads" };

const MESSAGES: Record<string, { tone: "green" | "red"; text: string }> = {
  select: { tone: "red", text: "Pick at least one lead and an owner." },
  badowner: { tone: "red", text: "That owner is not an active user." },
  slow: { tone: "red", text: "Too many changes at once. Wait a minute." },
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { user, f, result, owners, facets, imports } = await withUserDb(async (tx, user) => {
    const f = parseLeadFilters(sp, user);
    const [result, owners, facets, imports] = await Promise.all([listLeads(tx, user, f), user.role === "admin" ? listOwners(tx) : [], leadFacets(tx, user, f), importLabels(tx)]);
    return { user, f, result, owners, facets, imports };
  });
  const isAdmin = user.role === "admin";
  const query = filtersToQuery(f);
  const back = `/leads${query ? `?${query}` : ""}`;
  const msgKey = typeof sp.msg === "string" ? sp.msg : undefined;
  const msg = msgKey?.startsWith("assigned-")
    ? { tone: "green" as const, text: `Reassigned ${msgKey.slice(9)} lead(s).` }
    : msgKey ? MESSAGES[msgKey] : undefined;
  const pageSize = f.limit ?? PAGE_SIZE;
  const from = result.total === 0 ? 0 : (f.page - 1) * pageSize + 1;
  const to = Math.min(result.total, f.page * pageSize);
  const groups = filterGroups({ f, facets, owners, imports, isAdmin, userId: user.id });

  return (
    <>
      <LeadsLiveRefresher />
      <PageHeader
        title="Leads"
        subtitle={isAdmin ? "All discovery leads for POS development services" : "Leads assigned to you"}
        actions={
          <>
            <a href={`/api/export/leads${query ? `?${query}` : ""}`} className="btn-secondary"><Icon name="download" /> Export CSV</a>
            <Link href="/imports/new" className="btn-primary"><Icon name="upload" /> Import leads</Link>
          </>
        }
      />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

      <div className="mb-4">
        <FilterBar
          groups={groups}
          dates={{ created_from: f.created_from, created_to: f.created_to, contacted_from: f.contacted_from, contacted_to: f.contacted_to }}
          callable={f.callable === "now"}
          search={
            <form method="get" className="flex gap-2" role="search">
              <LiveSearch defaultValue={f.q ?? ""} placeholder="Search shop, city, contact, phone or email" label="Search leads" />
              <button className="btn-primary" type="submit">Search</button>
              {/* Keep the active filters when the Search button submits. */}
              {Object.entries(Object.fromEntries(new URLSearchParams(filtersToQuery(f, { q: undefined, page: undefined })))).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            </form>
          }
        />
      </div>

      <form action={assignLeads}>
        <input type="hidden" name="back" value={back} />
        <div className="card overflow-clip">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm text-muted">
            <span className="tabular-nums">{result.total ? <><span className="font-medium text-fg">{from}–{to}</span> of {result.total} leads</> : "No leads"}</span>
            <div className="flex items-center gap-2 sm:gap-3">
              <RowCountFilter current={pageSize} total={result.total} />
              {isAdmin && result.total > 0 && (
                <AssignMenu owners={owners} />
              )}
            </div>
          </div>
          {result.rows.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="leads" title="No leads match" action={<Link href="/imports/new" className="btn-secondary">Import a list</Link>}>
                Try clearing a filter, or import a list of shops to call.
              </EmptyState>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 md:hidden">
                <span className="text-xs text-muted">Sort</span>
                <div className="flex-1"><SortMenu /></div>
              </div>
              {/* Phones: one card per lead */}
              <ul className="divide-y divide-line md:hidden">
                {result.rows.map((l) => (
                  <li key={l.id} className="flex gap-3 px-4 py-3.5">
                    {isAdmin && <input type="checkbox" name="ids" value={l.id} aria-label={`Select ${l.company_name}`} className="mt-1 size-4 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <Link href={`/leads/${l.id}${query ? `?${query}` : ""}`} className="font-medium text-fg">{l.company_name}</Link>
                      <div className="mt-0.5 text-xs text-muted">{[l.contact_name, [l.city, l.state].filter(Boolean).join(", "), `added ${relativeTime(l.created_at)}`].filter(Boolean).join(" · ") || "No contact or location"}</div>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex items-center gap-2 tabular-nums"><Icon name="phone" className="size-3.5 text-subtle" />{formatPhone(l.phone) || <Dash />}</div>
                        <div className="flex min-w-0 items-center gap-2"><Icon name="mail" className="size-3.5 shrink-0 text-subtle" /><span className="truncate">{l.email ?? <Dash />}</span></div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <ProductTags interested={l.interested_in} bought={l.bought} />
                        <OutcomeBadge outcome={l.last_outcome} />
                        <SuppressionBadge suppression={l.suppression} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Tablets and up: a fixed-layout table that always fits the width (no sideways scroll). */}
              <div className="hidden md:block">
                <table className="w-full table-fixed text-sm" data-testid="leads-table">
                  <colgroup>
                    {isAdmin && <col className="w-11" />}
                    <col />
                    <col className="hidden w-[10rem] 2xl:table-column" />
                    <col className="hidden w-[9rem] lg:table-column" />
                    <col className="hidden w-[12rem] xl:table-column" />
                    <col className="w-[9rem]" />
                    <col className="w-[9.5rem]" />
                    <col className="w-[9rem]" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-xs font-medium text-muted [&>th]:sticky [&>th]:top-[53px] [&>th]:z-10 [&>th]:border-b [&>th]:border-line [&>th]:bg-surface-2/95 [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium [&>th]:backdrop-blur lg:[&>th]:top-0">
                      {isAdmin && <th className="w-11 px-3 py-2.5"><SelectAllCheckbox name="ids" /></th>}
                      <SortTh f={f} sortKey="company">Company</SortTh>
                      <th className="hidden 2xl:table-cell">Contact</th>
                      <th className="hidden lg:table-cell">Phone</th>
                      <th className="hidden xl:table-cell">Email</th>
                      <SortTh f={f} sortKey="last_call" firstDir="desc">Last call</SortTh>
                      <SortTh f={f} sortKey="next">Next follow-up</SortTh>
                      <SortTh f={f} sortKey="owner">Assigned</SortTh>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {result.rows.map((l) => <LeadTr key={l.id} l={l} isAdmin={isAdmin} view={user.view} usTz={user.usTimeZone} query={query} />)}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {result.pages > 1 && (
            <nav className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" aria-label="Pagination">
              {f.page > 1 ? <Link className="btn-secondary btn-sm" href={`/leads?${filtersToQuery(f, { page: f.page - 1 })}`}><Icon name="chevronLeft" className="size-3.5" /> Previous</Link> : <span />}
              <PageJumpFilter
                page={f.page}
                pages={result.pages}
                totalRows={result.total}
              />
              {f.page < result.pages ? <Link className="btn-secondary btn-sm" href={`/leads?${filtersToQuery(f, { page: f.page + 1 })}`}>Next <Icon name="chevronRight" className="size-3.5" /></Link> : <span />}
            </nav>
          )}
        </div>
      </form>
    </>
  );
}

function LeadTr({ l, isAdmin, view, usTz, query }: { l: LeadRow; isAdmin: boolean; view: TimeView; usTz: string; query?: string }) {
  const zone = shownZone(view, l.time_zone, usTz);
  const other = otherZone(view, l.time_zone, usTz);
  const overdue = !!l.next_followup_at && new Date(l.next_followup_at) < now();
  const place = [l.city, l.state].filter(Boolean).join(", ");
  return (
    <tr className="group align-middle transition-colors hover:bg-surface-2/70 [&>td]:px-3 [&>td]:py-2.5">
      {isAdmin && (
        <td>
          <input type="checkbox" name="ids" value={l.id} aria-label={`Select ${l.company_name}`} className="size-4 align-middle" />
        </td>
      )}
      <td className="min-w-0">
        <Link href={`/leads/${l.id}${query ? `?${query}` : ""}`} className="block truncate font-semibold text-fg hover:text-brand-fg" title={l.company_name}>{l.company_name}</Link>
        {/* City and the short pills keep their size; only the area name gives way when space is tight. */}
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-muted">
          <span className="shrink-0">{place || "Location unknown"}</span>
          <span className="shrink-0 text-subtle" aria-hidden>·</span>
          <span className="shrink-0 text-subtle" title={`Added on ${new Date(l.created_at).toLocaleString()}`}>
            added {relativeTime(l.created_at)}
          </span>
          <ProductPills interested={l.interested_in} bought={l.bought} />
          {l.status !== "new" && <Pill tone="sky">{LEAD_STATUS_LABEL[l.status as LeadStatus]}</Pill>}
          {l.suppression !== "none" && <Pill tone="red">{l.suppression === "do_not_email" ? "No email" : "Do not call"}</Pill>}
          {l.tags[0] && <Pill title={l.tags[0]} shrink>{l.tags[0].replace(/\s+area$/i, "")}</Pill>}
        </div>
      </td>
      <td className="hidden min-w-0 2xl:table-cell">
        {l.contact_name ? (
          <>
            <div className="truncate text-fg-2" title={l.contact_name}>{l.contact_name}</div>
            {l.contact_title && <div className="truncate text-xs text-muted" title={l.contact_title}>{l.contact_title}</div>}
          </>
        ) : <Soft />}
      </td>
      <td className="hidden truncate tabular-nums text-fg-2 lg:table-cell">{formatPhone(l.phone) || <Soft />}</td>
      <td className="hidden min-w-0 xl:table-cell" data-testid="lead-email">
        {l.email ? (
          <a href={`mailto:${l.email}`} className="block truncate text-fg-2 hover:text-brand-fg" title={l.email}>{l.email}</a>
        ) : <Soft />}
        {l.email_count > 1 && <div className="text-xs text-muted">+{l.email_count - 1} more</div>}
      </td>
      <td className="min-w-0">
        {l.last_outcome ? (
          <>
            <OutcomeBadge outcome={l.last_outcome} />
            {l.last_call_at && <div className="mt-0.5 truncate text-xs text-muted" title={`${relativeTime(l.last_call_at)} · ${l.call_attempts} call${l.call_attempts === 1 ? "" : "s"}`}>{shortAgo(l.last_call_at)} · {l.call_attempts} call{l.call_attempts === 1 ? "" : "s"}</div>}
          </>
        ) : <Pill>Not called</Pill>}
      </td>
      <td className="min-w-0">
        {l.next_followup_at ? (
          <>
            <div className={`truncate tabular-nums ${overdue ? "font-medium text-danger-fg" : "text-fg-2"}`} title={`${formatInZone(l.next_followup_at, zone)} · ${other.label}: ${formatInZone(l.next_followup_at, other.zone)}`}>
              {formatInZone(l.next_followup_at, zone, { weekday: undefined, timeZoneName: undefined })}
            </div>
            <div className={`truncate text-xs ${overdue ? "text-danger-fg" : "text-muted"}`}>
              {zoneAbbreviation(new Date(l.next_followup_at), zone)} · {overdue ? `overdue ${shortAgo(l.next_followup_at)}` : shortAgo(l.next_followup_at)}
            </div>
          </>
        ) : <Soft />}
      </td>
      <td className="min-w-0" data-testid="lead-assigned">
        {l.owner_name ? (
          <span className="flex min-w-0 items-center gap-2" title={l.owner_name}>
            <Avatar name={l.owner_name} className="size-6 shrink-0 text-[10px]" />
            <span className="truncate font-medium text-fg-2">{l.owner_name}</span>
          </span>
        ) : (
          <span className="text-subtle">-</span>
        )}
      </td>
    </tr>
  );
}

/** A column header that sorts by its column; clicking again reverses the order. */
function SortTh({ f, sortKey, firstDir = "asc", className, children }: { f: LeadFilters; sortKey: SortKey; firstDir?: "asc" | "desc"; className?: string; children: React.ReactNode }) {
  const current = f.sort === sortKey;
  const dir = current ? (f.dir ?? (sortKey === "last_call" ? "desc" : "asc")) : undefined;
  const nextDir = current ? (dir === "asc" ? "desc" : "asc") : firstDir;
  const href = `/leads?${filtersToQuery(f, { sort: sortKey, dir: nextDir === "asc" ? undefined : nextDir, page: undefined })}`;
  return (
    <th className={className} aria-sort={current ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={href} scroll={false} className={`inline-flex items-center gap-1 hover:text-fg ${current ? "text-fg" : ""}`} data-testid={`sort-${sortKey}`}>
        {children}
        <Icon name="chevronDown" className={`size-3 ${current ? (dir === "asc" ? "rotate-180" : "") : "opacity-30"}`} />
      </Link>
    </th>
  );
}
