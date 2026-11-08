import type { Metadata } from "next";
import Link from "next/link";
import { LiveSearch } from "@/components/LiveSearch";
import { UrlDropdown } from "@/components/UrlDropdown";
import { RowCountFilter } from "@/components/leads/RowCountFilter";
import { PageJumpFilter } from "@/components/table/PageJumpFilter";
import { Icon, type IconName } from "@/components/icons";
import { PageHeader, Stat, cn } from "@/components/ui";
import { shortAgo } from "@/components/table/RowBits";
import { requireAdmin } from "@/lib/auth/current";
import { asUser, type Tx } from "@/lib/db";
import { formatInZone } from "@/lib/time";
import { AuditTable } from "@/components/audit/AuditTable";
import type { AuditLogItem } from "@/components/audit/AuditDetailsModal";

export const metadata: Metadata = { title: "Audit Log" };

const DEFAULT_PAGE_SIZE = 50;

const CATEGORIES: { id: string; label: string; icon: IconName }[] = [
  { id: "all", label: "All Activity", icon: "history" },
  { id: "security", label: "Security & Team", icon: "shield" },
  { id: "import", label: "Imports", icon: "upload" },
  { id: "export", label: "Exports", icon: "download" },
  { id: "delete", label: "Deletions", icon: "trash" },
  { id: "data", label: "Data & Files", icon: "file" },
];

function qs(
  base: Record<string, string | number | undefined>,
  overrides: Record<string, string | number | undefined> = {}
) {
  const merged = { ...base, ...overrides };
  const entries: [string, string][] = [];
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === "" || (k === "page" && Number(v) === 1)) continue;
    if ((k === "rows" || k === "limit") && Number(v) === DEFAULT_PAGE_SIZE) continue;
    entries.push([k, String(v)]);
  }
  const s = new URLSearchParams(entries).toString();
  return s ? `?${s}` : "";
}

function where(
  tx: Tx,
  { q, action, category }: { q?: string; action?: string | null; category?: string }
) {
  const parts = [tx`true`];

  if (action) {
    parts.push(tx`a.action = ${action}`);
  }

  if (category && category !== "all") {
    if (category === "security") {
      parts.push(tx`(a.action like 'user.%' or a.action like 'auth.%')`);
    } else if (category === "import") {
      parts.push(tx`a.action like 'import.%'`);
    } else if (category === "export") {
      parts.push(tx`a.action like 'export.%'`);
    } else if (category === "delete") {
      parts.push(tx`(a.action like '%.deleted' or a.action like '%.rejected')`);
    } else if (category === "data") {
      parts.push(
        tx`(a.action like 'document.%' or a.action like 'research.%' or a.action like 'lead.%' or a.action like 'company.%')`
      );
    }
  }

  if (q && q.trim()) {
    const like = `%${q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    parts.push(tx`(
      coalesce(p.full_name, 'system') ilike ${like}
      or a.action ilike ${like}
      or coalesce(a.entity, '') ilike ${like}
      or coalesce(a.details::text, '') ilike ${like}
    )`);
  }

  return parts.reduce((acc, p) => tx`${acc} and ${p}`);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const rawRows = Number(sp.rows || sp.limit || sp.size);
  const pageSize = rawRows && rawRows > 0 ? Math.min(1000, Math.max(1, Math.round(rawRows))) : DEFAULT_PAGE_SIZE;
  const q = sp.q?.trim() || undefined;
  const action = sp.action && /^[a-z_.]{1,60}$/.test(sp.action) ? sp.action : null;
  const category = sp.category && ["security", "import", "export", "delete", "data"].includes(sp.category) ? sp.category : "all";

  const { rows, actions, total, stats } = await asUser(admin.id, async (tx) => {
    const w = where(tx, { q, action, category });

    // Execute queries sequentially inside the reserved transaction connection
    const rows = await tx`select a.id, a.action, a.entity, a.entity_id, a.details, a.created_at, p.full_name as actor
      from audit_logs a left join profiles p on p.id = a.actor_id
      where ${w}
      order by a.created_at desc, a.id desc
      limit ${pageSize} offset ${(page - 1) * pageSize}`;

    const actionsResult = await tx`select distinct action from audit_logs order by action`;

    const totalResult = await tx`select count(*)::int as n from audit_logs a left join profiles p on p.id = a.actor_id where ${w}`;

    const statsResult = await tx`select
      count(*)::int as total_events,
      count(*) filter (where a.created_at >= now() - interval '24 hours')::int as last_24h,
      count(*) filter (where a.action like 'user.%' or a.action like 'auth.%' or a.action like '%.deleted' or a.action like '%.rejected')::int as security_events,
      count(distinct a.actor_id)::int as active_actors
      from audit_logs a`;

    return {
      rows,
      actions: actionsResult.map((r) => r.action as string),
      total: (totalResult[0]?.n as number) ?? 0,
      stats: (statsResult[0] as {
        total_events: number;
        last_24h: number;
        security_events: number;
        active_actors: number;
      }) ?? {
        total_events: 0,
        last_24h: 0,
        security_events: 0,
        active_actors: 0,
      },
    };
  });

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const queryParams: Record<string, string | number | undefined> = {
    q,
    action: action ?? undefined,
    category: category === "all" ? undefined : category,
    rows: pageSize !== DEFAULT_PAGE_SIZE ? pageSize : undefined,
  };

  const items: AuditLogItem[] = rows.map((r) => {
    const createdAt = r.created_at instanceof Date ? r.created_at : new Date(r.created_at);
    return {
      id: r.id,
      action: r.action,
      entity: r.entity,
      entity_id: r.entity_id,
      details: (typeof r.details === "object" && r.details !== null ? r.details : null) as Record<string, unknown> | null,
      created_at: createdAt.toISOString(),
      actor: r.actor,
      formatted_time: formatInZone(createdAt, admin.timeZone),
      relative_time: shortAgo(createdAt),
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Security & Governance"
        title="Audit Log"
        subtitle="Comprehensive, tamper-evident activity trail for compliance, security, and administrative oversight."
        actions={
          <Link href="/audit" className="btn-secondary btn-sm gap-1.5" title="Refresh audit log">
            <Icon name="refresh" className="size-3.5" /> Refresh
          </Link>
        }
      />

      {/* KPI Stats Overview */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Total Events"
          value={stats.total_events}
          tone="brand"
          icon="history"
          hint="All recorded activity"
        />
        <Stat
          label="Last 24 Hours"
          value={stats.last_24h}
          tone="green"
          icon="clock"
          hint="Recent system activity"
        />
        <Stat
          label="Security & Access"
          value={stats.security_events}
          tone="amber"
          icon="shield"
          hint="Auth, users & deletions"
        />
        <Stat
          label="Active Actors"
          value={stats.active_actors}
          tone="sky"
          icon="users"
          hint="Distinct team members"
        />
      </div>

      {/* Category Tabs */}
      <div className="mb-4 overflow-x-auto pb-1">
        <div className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface-2/60 p-1 text-xs">
          {CATEGORIES.map((cat) => {
            const active = category === cat.id;
            const href = `/audit${qs(queryParams, { category: cat.id === "all" ? undefined : cat.id, page: 1 })}`;
            return (
              <Link
                key={cat.id}
                href={href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition whitespace-nowrap",
                  active
                    ? "bg-surface text-fg shadow-card ring-1 ring-line font-semibold"
                    : "text-muted hover:text-fg hover:bg-surface/50"
                )}
              >
                <Icon name={cat.icon} className="size-3.5" />
                <span>{cat.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Search and Action Dropdown */}
      <div className="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center">
        <form method="get" className="flex min-w-0 flex-1 gap-2" role="search">
          <LiveSearch
            defaultValue={q ?? ""}
            placeholder="Search actor, action, entity, or payload details..."
            label="Search audit logs"
          />
          <button type="submit" className="btn-primary">Search</button>
          {action && <input type="hidden" name="action" value={action} />}
          {category !== "all" && <input type="hidden" name="category" value={category} />}
          {pageSize !== DEFAULT_PAGE_SIZE && <input type="hidden" name="rows" value={pageSize} />}
        </form>
        <div className="flex items-center gap-2">
          <div className="w-56 min-w-0">
            <UrlDropdown
              param="action"
              ariaLabel="Filter by specific action"
              options={[
                { value: "", label: "All actions" },
                ...actions.map((a: string) => ({ value: a, label: a })),
              ]}
            />
          </div>
          {(q || action || category !== "all" || pageSize !== DEFAULT_PAGE_SIZE) && (
            <Link href="/audit" className="btn-ghost btn-sm px-2.5 text-muted hover:text-fg">
              Clear
            </Link>
          )}
        </div>
      </div>

      {/* Main Audit Card */}
      <div className="card overflow-clip">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm text-muted">
          <span className="tabular-nums">
            {total > 0 ? (
              <>
                <span className="font-medium text-fg">{from}–{to}</span> of {total} audit records
              </>
            ) : (
              "No audit records"
            )}
          </span>
          <div className="flex items-center gap-2 sm:gap-3">
            <RowCountFilter current={pageSize} total={total} defaultCount={DEFAULT_PAGE_SIZE} />
          </div>
        </div>

        <AuditTable logs={items} />

        {pages > 1 && (
          <nav className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" aria-label="Pagination">
            {page > 1 ? (
              <Link className="btn-secondary btn-sm" href={`/audit${qs(queryParams, { page: page - 1 })}`}>
                <Icon name="chevronLeft" className="size-3.5" /> Previous
              </Link>
            ) : (
              <span />
            )}
            <PageJumpFilter
              page={page}
              pages={pages}
              totalRows={total}
            />
            {page < pages ? (
              <Link className="btn-secondary btn-sm" href={`/audit${qs(queryParams, { page: page + 1 })}`}>
                Next <Icon name="chevronRight" className="size-3.5" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </>
  );
}
