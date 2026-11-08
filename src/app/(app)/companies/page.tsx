import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { LiveSearch } from "@/components/LiveSearch";
import { UrlDropdown } from "@/components/UrlDropdown";
import { OutcomeBadge } from "@/components/badges";
import { CompanySelectionBar } from "@/components/companies/CompanySelectionBar";
import { RowCountFilter } from "@/components/leads/RowCountFilter";
import { Pill, ProductPills, shortAgo, Soft } from "@/components/table/RowBits";
import { SelectAllCheckbox } from "@/components/table/SelectAllCheckbox";
import { PageJumpFilter } from "@/components/table/PageJumpFilter";
import { EmptyState, PageHeader } from "@/components/ui";
import { withUserDb } from "@/lib/auth/current";
import { formatPhone } from "@/lib/phone";
import { US_STATES } from "@/lib/us";
import { COMPANY_PAGE_SIZE, listCompanies, parseCompanyFilters, type CompanyFilters, type CompanyRow } from "@/server/companies";
import { listAreas } from "@/server/leads";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "Companies" };

function qs(f: CompanyFilters, o: Partial<Record<keyof CompanyFilters, string | number | undefined>> = {}) {
  const merged = { ...f, ...o };
  const entries: [string, string][] = [];
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === "" || (k === "page" && v === 1)) continue;
    if (k === "limit" || k === "rows") {
      const num = Number(v);
      if (num && num !== COMPANY_PAGE_SIZE) entries.push(["rows", String(num)]);
      continue;
    }
    entries.push([k, String(v)]);
  }
  const s = new URLSearchParams(entries).toString();
  return s ? `?${s}` : "";
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const f = parseCompanyFilters(await searchParams);
  const { user, result, areas } = await withUserDb(async (tx, user) => {
    const [result, areas] = await Promise.all([listCompanies(tx, f), listAreas(tx)]);
    return { user, result, areas };
  });
  const isAdmin = user.role === "admin";
  const pageSize = f.limit ?? COMPANY_PAGE_SIZE;
  const from = result.total === 0 ? 0 : (f.page - 1) * pageSize + 1;
  const to = Math.min(result.total, f.page * pageSize);
  const query = qs(f);

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle={user.role === "admin" ? "Every business in the CRM, with its contacts and details" : "Businesses you work with, with their contacts and details"}
        actions={<Link href="/imports/new" className="btn-primary"><Icon name="upload" /> Import leads</Link>}
      />

      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <form method="get" className="flex min-w-0 flex-1 gap-2" role="search">
          <LiveSearch defaultValue={f.q ?? ""} placeholder="Search name, city, street, contact, phone or email" label="Search companies" />
          <button type="submit" className="btn-primary">Search</button>
          {f.state && <input type="hidden" name="state" value={f.state} />}
          {f.area && <input type="hidden" name="area" value={f.area} />}
          {f.limit && f.limit !== COMPANY_PAGE_SIZE && <input type="hidden" name="rows" value={f.limit} />}
        </form>
        <div className="flex items-center gap-2">
          <div className="w-40 shrink-0"><UrlDropdown param="state" ariaLabel="State" testId="company-state" options={[{ value: "", label: "All states" }, ...US_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))]} /></div>
          {areas.length > 0 && (
            <div className="w-52 min-w-0"><UrlDropdown param="area" ariaLabel="Area" testId="company-area" options={[{ value: "", label: "All areas" }, ...areas.map((a) => ({ value: a, label: a }))]} /></div>
          )}
          {(f.q || f.state || f.area) && <Link href="/companies" className="btn-ghost btn-sm px-2">Clear</Link>}
        </div>
      </div>

      <form>
        <div className="card overflow-clip">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm text-muted">
            <span className="tabular-nums">
              {result.total ? <><span className="font-medium text-fg">{from}–{to}</span> of {result.total} companies</> : "No companies"}
            </span>
            <div className="flex items-center gap-2 sm:gap-3">
              <RowCountFilter current={pageSize} total={result.total} defaultCount={COMPANY_PAGE_SIZE} />
              {isAdmin && result.total > 0 && <CompanySelectionBar />}
            </div>
          </div>
          {result.rows.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="companies" title="No companies found" action={<Link href="/imports/new" className="btn-secondary">Import a list</Link>}>
                Companies appear here when you import a list.
              </EmptyState>
            </div>
          ) : (
            <>
              {/* Phones: one card per company */}
              <ul className="divide-y divide-line md:hidden">
                {result.rows.map((c) => (
                  <li key={c.id} className="flex gap-3 px-4 py-3.5">
                    {isAdmin && (
                      <input
                        type="checkbox"
                        name="ids"
                        value={c.id}
                        aria-label={`Select ${c.name}`}
                        className="mt-1 size-4 shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <Link href={`/companies/${c.id}${query}`} className="min-w-0 truncate font-semibold text-fg">{c.name}</Link>
                        <span className="flex shrink-0 gap-1"><ProductPills interested={c.interested_in} bought={c.bought} /></span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted">{[c.city, c.state].filter(Boolean).join(", ") || "Location unknown"}</div>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex items-center gap-2 tabular-nums text-fg-2"><Icon name="phone" className="size-3.5 text-subtle" />{formatPhone(c.phone) || <Soft />}</div>
                        <div className="flex min-w-0 items-center gap-2 text-fg-2"><Icon name="mail" className="size-3.5 shrink-0 text-subtle" /><span className="truncate">{c.email ?? <Soft />}</span></div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Tablets and up: a fixed-layout table that always fits the width. */}
              <div className="hidden md:block">
                <table className="w-full table-fixed text-sm" data-testid="companies-table">
                  <colgroup>
                    {isAdmin && <col className="w-11" />}
                    <col />
                    <col className="hidden w-[9.5rem] lg:table-column" />
                    <col className="hidden w-[13rem] xl:table-column" />
                    <col className="hidden w-[9rem] 2xl:table-column" />
                    <col className="hidden w-[13rem] min-[1700px]:table-column" />
                    <col className="w-[8rem]" />
                    <col className="w-[9.5rem]" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-xs font-medium text-muted [&>th]:sticky [&>th]:top-[53px] [&>th]:z-10 [&>th]:border-b [&>th]:border-line [&>th]:bg-surface-2/95 [&>th]:px-3 [&>th]:py-2.5 [&>th]:font-medium [&>th]:backdrop-blur lg:[&>th]:top-0">
                      {isAdmin && (
                        <th className="w-11 px-3 py-2.5">
                          <SelectAllCheckbox name="ids" />
                        </th>
                      )}
                      <th>Company</th>
                      <th className="hidden lg:table-cell">Phone</th>
                      <th className="hidden xl:table-cell">Email</th>
                      <th className="hidden 2xl:table-cell">Contacts</th>
                      <th className="hidden min-[1700px]:table-cell">Address</th>
                      <th>Products</th>
                      <th>Last call</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">{result.rows.map((c) => <CompanyTr key={c.id} c={c} isAdmin={isAdmin} query={query} />)}</tbody>
                </table>
              </div>
            </>
          )}
          {result.pages > 1 && (
            <nav className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" aria-label="Pagination">
              {f.page > 1 ? <Link className="btn-secondary btn-sm" href={`/companies${qs(f, { page: f.page - 1 })}`}><Icon name="chevronLeft" className="size-3.5" /> Previous</Link> : <span />}
              <PageJumpFilter
                page={f.page}
                pages={result.pages}
                totalRows={result.total}
              />
              {f.page < result.pages ? <Link className="btn-secondary btn-sm" href={`/companies${qs(f, { page: f.page + 1 })}`}>Next <Icon name="chevronRight" className="size-3.5" /></Link> : <span />}
            </nav>
          )}
        </div>
      </form>
    </>
  );
}

function CompanyTr({ c, isAdmin, query = "" }: { c: CompanyRow; isAdmin: boolean; query?: string }) {
  const place = [c.city, c.state].filter(Boolean).join(", ");
  return (
    <tr className="group align-middle transition-colors hover:bg-surface-2/70 [&>td]:px-3 [&>td]:py-2.5">
      {isAdmin && (
        <td className="w-11 px-3 py-2.5">
          <input
            type="checkbox"
            name="ids"
            value={c.id}
            aria-label={`Select ${c.name}`}
            className="size-4 align-middle"
          />
        </td>
      )}
      <td className="min-w-0">
        <Link href={`/companies/${c.id}${query}`} className="block truncate font-semibold text-fg hover:text-brand-fg" title={c.name}>{c.name}</Link>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-muted">
          <span className="shrink-0">{place || "Location unknown"}</span>
          {c.suppression !== "none" && <Pill tone="red">{c.suppression === "do_not_email" ? "No email" : "Do not call"}</Pill>}
          {c.website_domain && <span className="min-w-0 truncate text-subtle" title={c.website_domain}>{c.website_domain}</span>}
          {c.tags[0] && <Pill title={c.tags[0]} shrink>{c.tags[0].replace(/\s+area$/i, "")}</Pill>}
        </div>
      </td>
      <td className="hidden truncate tabular-nums text-fg-2 lg:table-cell">
        {formatPhone(c.phone) || <Soft />}
        {c.phone_count > 1 && <span className="ml-1 text-xs text-muted">+{c.phone_count - 1}</span>}
      </td>
      <td className="hidden min-w-0 xl:table-cell">
        {c.email ? <a href={`mailto:${c.email}`} className="block truncate text-fg-2 hover:text-brand-fg" title={c.email}>{c.email}</a> : <Soft />}
        {c.email_count > 1 && <div className="text-xs text-muted">+{c.email_count - 1} more</div>}
      </td>
      <td className="hidden min-w-0 2xl:table-cell">
        {c.contact_count ? (
          <span className="flex min-w-0 items-center gap-1 text-fg-2">
            <span className="truncate" title={c.primary_contact ?? undefined}>{c.primary_contact?.split(" ")[0] ?? "Unnamed"}</span>
            {c.contact_count > 1 && <span className="shrink-0 text-xs text-muted">+{c.contact_count - 1}</span>}
          </span>
        ) : <Soft />}
      </td>
      <td className="hidden min-w-0 min-[1700px]:table-cell">
        {c.address ? <span className="block truncate text-fg-2" title={c.address}>{c.address}</span> : <Soft />}
      </td>
      <td>
        <span className="flex flex-wrap gap-1">
          {c.interested_in.length || c.bought.length ? <ProductPills interested={c.interested_in} bought={c.bought} /> : <span className="text-xs text-subtle">Not yet</span>}
        </span>
      </td>
      <td className="min-w-0">
        {c.last_outcome ? (
          <>
            <OutcomeBadge outcome={c.last_outcome} />
            {c.last_call_at && <div className="mt-0.5 truncate text-xs text-muted">{shortAgo(c.last_call_at)}</div>}
          </>
        ) : <Pill>Not called</Pill>}
      </td>
    </tr>
  );
}
