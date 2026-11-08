import "server-only";
import type { PendingQuery, Row } from "postgres";
import type { Tx } from "@/lib/db";
import type { Product } from "@/lib/labels";
import { startOfLocalDay } from "@/lib/time";

export { PERIODS, periodLabel, periodRange, type Period } from "@/lib/report-period";
import { PERIODS, periodRange, type Period } from "@/lib/report-period";

export type RepRow = {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
  leads: number;
  not_called: number;
  calls: number;
  connects: number;
  interested: number;
  emails_sent: number;
  overdue: number;
  whatsapp_to_send: number;
  deals_won: number;
  won_value_cents: number;
};

const CONNECTED = ["connected", "callback_requested", "agreed", "interested", "not_interested", "do_not_call", "call_hangup"];

/** Activity per salesperson for the period. Admin-only page; RLS still applies. */
export async function repReport(tx: Tx, since: Date): Promise<RepRow[]> {
  return (await tx`
    select p.id, p.full_name, p.role, p.active,
      (select count(*) from leads l where l.owner_id = p.id)::int as leads,
      (select count(*) from leads l where l.owner_id = p.id and l.call_attempts = 0 and l.status not in ('closed', 'unqualified'))::int as not_called,
      (select count(*) from call_activities a join leads l on l.id = a.lead_id
         where a.user_id = p.id and a.occurred_at >= ${since})::int as calls,
      (select count(*) from call_activities a join leads l on l.id = a.lead_id
         where a.user_id = p.id and a.occurred_at >= ${since} and a.outcome::text = any(${CONNECTED}))::int as connects,
      (select count(*) from call_activities a join leads l on l.id = a.lead_id
         where a.user_id = p.id and a.occurred_at >= ${since} and a.outcome::text in ('interested', 'agreed'))::int as interested,
      (select count(*) from email_activities e join leads l on l.id = e.lead_id
         where e.user_id = p.id and e.occurred_at >= ${since} and e.status = 'sent')::int as emails_sent,
      (select count(*) from call_activities a 
        left join lateral (
          select f.status from followups f where f.lead_id = a.lead_id and f.notes ilike '%whatsapp%' order by f.created_at desc limit 1
        ) fo on true
        where a.user_id = p.id and (a.notes ilike '%whatsapp%') and coalesce(fo.status, 'pending') = 'pending')::int as overdue,
      (select count(*) from call_activities a 
        left join lateral (
          select f.status from followups f where f.lead_id = a.lead_id and f.notes ilike '%whatsapp%' order by f.created_at desc limit 1
        ) fo on true
        where a.user_id = p.id and (a.notes ilike '%whatsapp%') and coalesce(fo.status, 'pending') = 'pending')::int as whatsapp_to_send,
      (select count(*) from sales_opportunities o where o.owner_id = p.id and o.stage = 'won' and o.closed_at >= ${since})::int as deals_won,
      (select coalesce(sum(o.value_cents), 0) from sales_opportunities o where o.owner_id = p.id and o.stage = 'won' and o.closed_at >= ${since})::bigint as won_value_cents
    from profiles p
    order by p.active desc, p.role desc, p.full_name`) as unknown as RepRow[];
}

export async function outcomeBreakdown(tx: Tx, since: Date) {
  return tx`select a.outcome, count(*)::int as n from call_activities a join leads l on l.id = a.lead_id
    where a.occurred_at >= ${since}
    group by a.outcome order by n desc` as Promise<{ outcome: string; n: number }[]>;
}

export async function stageBreakdown(tx: Tx) {
  return tx`select o.stage, count(*)::int as n, coalesce(sum(o.value_cents), 0)::bigint as value_cents from sales_opportunities o
    group by o.stage` as Promise<{ stage: string; n: number; value_cents: number }[]>;
}

export async function statusBreakdown(tx: Tx) {
  return tx`select l.status, count(*)::int as n from leads l
    group by l.status` as Promise<{ status: string; n: number }[]>;
}

/** One row per product, plus "both" for deals made for both products (its other columns are null). */
export type ProductRow = { product: Product | "both"; interested: number | null; bought: number | null; calls_interested: number | null; calls_bought: number | null; deals_won: number; won_value_cents: number };

/** Per product: shops that want it or bought it now, and what calls and deals in the period added. */
export async function productBreakdown(tx: Tx, since: Date): Promise<ProductRow[]> {
  return (await tx`
    select p::text as product,
      (select count(*) from leads l where p = any(l.interested_in))::int as interested,
      (select count(*) from leads l where p = any(l.bought))::int as bought,
      (select count(*) from call_activities a where a.occurred_at >= ${since} and p = any(a.interested_in))::int as calls_interested,
      (select count(*) from call_activities a where a.occurred_at >= ${since} and p = any(a.bought))::int as calls_bought,
      (select count(*) from sales_opportunities o where o.stage = 'won' and o.closed_at >= ${since} and o.product = p)::int as deals_won,
      (select coalesce(sum(o.value_cents), 0) from sales_opportunities o where o.stage = 'won' and o.closed_at >= ${since} and o.product = p)::bigint as won_value_cents
    from unnest(enum_range(null::product)) p
    union all
    -- Deals made for both products at once.
    select 'both', null, null, null, null,
      (select count(*) from sales_opportunities o where o.stage = 'won' and o.closed_at >= ${since} and o.product is null)::int,
      (select coalesce(sum(o.value_cents), 0) from sales_opportunities o where o.stage = 'won' and o.closed_at >= ${since} and o.product is null)::bigint`) as unknown as ProductRow[];
}

export async function importSummary(tx: Tx, since: Date) {
  // Imports uploaded in the period; leads added counts approvals made in the period.
  const [row] = await tx`select count(*) filter (where created_at >= ${since})::int as imports,
      coalesce(sum(row_count) filter (where created_at >= ${since}), 0)::int as rows,
      coalesce(sum(approved_count) filter (where approved_at >= ${since}), 0)::int as approved,
      count(*) filter (where status = 'preview')::int as waiting
    from imports where created_at >= ${since} or approved_at >= ${since} or status = 'preview'`;
  return row as { imports: number; rows: number; approved: number; waiting: number };
}

// ---------------------------------------------------------------------------
// The detailed report: one set of numbers per person and for the team (or one person)
// ---------------------------------------------------------------------------

const NO_REACH = ["no_answer", "voicemail", "busy", "gatekeeper"];

/** What someone did in the period. The same definitions feed the team totals and each person's row. */
export type Activity = {
  calls: number;
  connects: number;
  interested: number;
  not_interested: number;
  no_reach: number;
  do_not_call: number;
  wrong_number: number;
  talk_seconds: number;
  leads_worked: number;
  followups_scheduled: number;
  followups_done: number;
  overdue: number;
  whatsapp_to_send: number;
  emails_sent: number;
  emails_logged: number;
  emails_to_send: number;
  deals_won: number;
  won_value_cents: number;
  open_deals: number;
  open_value_cents: number;
  leads_owned: number;
  not_called: number;
  leads_added: number;
  pos_interest: number;
  wholesale_interest: number;
  pos_bought: number;
  wholesale_bought: number;
  first_call_at: Date | null;
  last_call_at: Date | null;
};

/** A condition naming whose rows count, e.g. `a.user_id = p.id`. */
type Who = (column: string) => PendingQuery<Row[]>;

function activitySelect(tx: Tx, since: Date, who: Who) {
  const calls = (extra = tx``) => tx`from call_activities a where a.occurred_at >= ${since} and ${who("a.user_id")} ${extra}`;
  return tx`
    (select count(*) ${calls()})::int as calls,
    (select count(*) ${calls(tx`and a.outcome::text = any(${CONNECTED})`)})::int as connects,
    (select count(*) ${calls(tx`and a.outcome::text in ('interested', 'agreed')`)})::int as interested,
    (select count(*) ${calls(tx`and a.outcome = 'not_interested'`)})::int as not_interested,
    (select count(*) ${calls(tx`and a.outcome::text = any(${NO_REACH})`)})::int as no_reach,
    (select count(*) ${calls(tx`and a.outcome = 'do_not_call'`)})::int as do_not_call,
    (select count(*) ${calls(tx`and a.outcome = 'wrong_number'`)})::int as wrong_number,
    (select coalesce(sum(a.duration_seconds), 0) ${calls()})::int as talk_seconds,
    (select count(distinct a.lead_id) ${calls()})::int as leads_worked,
    (select count(*) ${calls(tx`and 'pos' = any(a.interested_in)`)})::int as pos_interest,
    (select count(*) ${calls(tx`and 'wholesale' = any(a.interested_in)`)})::int as wholesale_interest,
    (select count(*) ${calls(tx`and 'pos' = any(a.bought)`)})::int as pos_bought,
    (select count(*) ${calls(tx`and 'wholesale' = any(a.bought)`)})::int as wholesale_bought,
    (select min(a.occurred_at) ${calls()}) as first_call_at,
    (select max(a.occurred_at) ${calls()}) as last_call_at,
    (select count(*) from call_activities a where a.occurred_at >= ${since} and (a.notes ilike '%whatsapp%') and ${who("a.user_id")})::int as followups_scheduled,
    (select count(*) from followups f where f.notes ilike '%whatsapp%' and f.status = 'done' and coalesce(f.completed_at, f.created_at) >= ${since} and (${who("f.assigned_to")} or ${who("f.created_by")}))::int as followups_done,
        (with combined as (
      select ca.id, coalesce(fo.status::text, 'pending') as status, ca.user_id
      from call_activities ca
      join leads l on l.id = ca.lead_id
      left join lateral (
        select f.status from followups f where f.lead_id = l.id and f.notes ilike '%whatsapp%' order by f.created_at desc limit 1
      ) fo on true
      where (ca.notes ilike '%whatsapp%')
      union all
      select fo.id, fo.status::text as status, fo.created_by as user_id
      from followups fo
      join leads l on l.id = fo.lead_id
      where (fo.notes ilike '%whatsapp%')
        and not exists (
          select 1 from call_activities ca2
          where ca2.lead_id = fo.lead_id and (ca2.notes ilike '%whatsapp%')
            and abs(extract(epoch from (ca2.occurred_at - fo.created_at))) < 180
        )
    )
    select count(*) from combined where status = 'pending' and ${who("user_id")})::int as overdue,
    (with combined as (
      select ca.id, coalesce(fo.status::text, 'pending') as status, ca.user_id
      from call_activities ca
      join leads l on l.id = ca.lead_id
      left join lateral (
        select f.status from followups f where f.lead_id = l.id and f.notes ilike '%whatsapp%' order by f.created_at desc limit 1
      ) fo on true
      where (ca.notes ilike '%whatsapp%')
      union all
      select fo.id, fo.status::text as status, fo.created_by as user_id
      from followups fo
      join leads l on l.id = fo.lead_id
      where (fo.notes ilike '%whatsapp%')
        and not exists (
          select 1 from call_activities ca2
          where ca2.lead_id = fo.lead_id and (ca2.notes ilike '%whatsapp%')
            and abs(extract(epoch from (ca2.occurred_at - fo.created_at))) < 180
        )
    )
    select count(*) from combined where status = 'pending' and ${who("user_id")})::int as whatsapp_to_send,
    (select count(*) from email_activities e where e.occurred_at >= ${since} and e.status = 'sent' and ${who("e.user_id")})::int as emails_sent,
    (select count(*) from email_activities e where e.occurred_at >= ${since} and ${who("e.user_id")})::int as emails_logged,
    (select count(*) from leads l where l.email_status in ('pending', 'drafted') and ${who("l.owner_id")})::int as emails_to_send,
    (select count(*) from sales_opportunities o where o.stage = 'won' and o.closed_at >= ${since} and ${who("o.owner_id")})::int as deals_won,
    (select coalesce(sum(o.value_cents), 0) from sales_opportunities o where o.stage = 'won' and o.closed_at >= ${since} and ${who("o.owner_id")})::bigint as won_value_cents,
    (select count(*) from sales_opportunities o where o.stage not in ('won', 'lost') and ${who("o.owner_id")})::int as open_deals,
    (select coalesce(sum(o.value_cents), 0) from sales_opportunities o where o.stage not in ('won', 'lost') and ${who("o.owner_id")})::bigint as open_value_cents,
    (select count(*) from leads l where ${who("l.owner_id")})::int as leads_owned,
    (select count(*) from leads l where l.call_attempts = 0 and l.status not in ('closed', 'unqualified') and ${who("l.owner_id")})::int as not_called,
    (select count(*) from leads l where l.created_at >= ${since} and ${who("l.owner_id")})::int as leads_added`;
}

const toActivity = (r: Record<string, unknown>): Activity =>
  ({ ...r, whatsapp_to_send: Number(r.whatsapp_to_send ?? r.overdue ?? 0), emails_to_send: Number(r.emails_to_send ?? 0), won_value_cents: Number(r.won_value_cents), open_value_cents: Number(r.open_value_cents) }) as unknown as Activity;

/** The team's numbers, or one person's when `rep` is given. */
export async function activityTotals(tx: Tx, since: Date, rep: string | null): Promise<Activity> {
  const who = (col: string) => (rep ? tx`${tx.unsafe(col)} = ${rep}` : tx`true`);
  const [row] = await tx`select ${activitySelect(tx, since, who)}`;
  return toActivity(row);
}

export type PersonActivity = Activity & { id: string; full_name: string; role: string; active: boolean };

/** Every person's numbers for the period, most calls first. */
export async function activityByPerson(tx: Tx, since: Date, rep: string | null): Promise<PersonActivity[]> {
  const who = (col: string) => tx`${tx.unsafe(col)} = p.id`;
  const rows = await tx`select p.id, p.full_name, p.role, p.active, ${activitySelect(tx, since, who)}
    from profiles p where ${rep ? tx`p.id = ${rep}` : tx`true`}`;
  return rows.map((r) => toActivity(r) as PersonActivity).sort((a, b) => b.calls - a.calls || b.deals_won - a.deals_won || a.full_name.localeCompare(b.full_name));
}

export type Bucket = { label: string; calls: number; connects: number };

/** Calls over the period in USA time: by hour for Today, by day for 7 and 30 days, by month for all time. */
export async function activitySeries(tx: Tx, period: Period, range: { since: Date; until: Date }, timeZone: string, rep: string | null): Promise<{ unit: "hour" | "day" | "month"; buckets: Bucket[] }> {
  let unit: "hour" | "day" | "month" = period === "today" ? "hour" : period === "all" ? "month" : "day";
  if (period === "all") {
    // All time with only a few weeks of calls reads better day by day, from the first call.
    const [first] = await tx`select min(a.occurred_at) as at from call_activities a where ${rep ? tx`a.user_id = ${rep}` : tx`true`}`;
    if (first?.at && range.until.getTime() - new Date(first.at).getTime() < 62 * 86_400_000) {
      unit = "day";
      range = { since: startOfLocalDay(timeZone, new Date(first.at)), until: range.until };
    }
  }
  const rows = await tx`select to_char(date_trunc(${unit}, a.occurred_at at time zone ${timeZone}), 'YYYY-MM-DD"T"HH24') as k,
      count(*)::int as calls, count(*) filter (where a.outcome::text = any(${CONNECTED}))::int as connects
    from call_activities a where a.occurred_at >= ${range.since} and ${rep ? tx`a.user_id = ${rep}` : tx`true`}
    group by 1 order by 1`;
  const byKey = new Map(rows.map((r) => [r.k as string, r]));
  const keyOf = (d: Date) => {
    const w = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d);
    const g = (t: string) => w.find((x) => x.type === t)!.value;
    return unit === "hour" ? `${g("year")}-${g("month")}-${g("day")}T${g("hour")}` : unit === "day" ? `${g("year")}-${g("month")}-${g("day")}T00` : `${g("year")}-${g("month")}-01T00`;
  };
  const out: Bucket[] = [];
  if (unit === "month") {
    // From the first call (at most 24 months back) to now.
    const first = rows[0]?.k as string | undefined;
    if (!first) return { unit, buckets: [] };
    const [fy, fm] = first.split("-").map(Number);
    const nowKey = keyOf(range.until);
    let [y, m] = [fy, fm];
    const [ny, nm] = nowKey.split("-").map(Number);
    if ((ny - y) * 12 + (nm - m) > 23) [y, m] = [ny - 2 + (nm === 12 ? 1 : 0), (nm % 12) + 1];
    while (y < ny || (y === ny && m <= nm)) {
      const k = `${y}-${String(m).padStart(2, "0")}-01T00`;
      const r = byKey.get(k);
      out.push({ label: new Date(Date.UTC(y, m - 1, 15)).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }), calls: r?.calls ?? 0, connects: r?.connects ?? 0 });
      m++;
      if (m > 12) [y, m] = [y + 1, 1];
    }
    return { unit, buckets: out };
  }
  const step = unit === "hour" ? 3_600_000 : 86_400_000;
  const seen = new Set<string>();
  for (let t = range.since.getTime(); t <= range.until.getTime() + step; t += step) {
    const d = new Date(Math.min(t, range.until.getTime()));
    const k = keyOf(d);
    if (seen.has(k)) continue;
    seen.add(k);
    const r = byKey.get(k);
    const label = unit === "hour"
      ? new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric" }).format(d)
      : new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(d);
    out.push({ label, calls: r?.calls ?? 0, connects: r?.connects ?? 0 });
  }
  return { unit, buckets: out };
}

export type CallDetail = {
  occurred_at: Date; company: string; city: string | null; state: string | null; outcome: string; user_name: string | null;
  next_step: string | null; notes: string | null; interested_in: string[]; bought: string[]; duration_seconds: number | null; lead_id: string;
};
export type DealDetail = { closed_at: Date; company: string; title: string; product: string | null; value_cents: number | null; owner_name: string | null; lead_id: string };
export type FollowupDetail = { created_at: Date; due_at: Date; company: string; kind: string; status: string; notes: string | null; created_by_name: string | null; assigned_name: string | null; shop_tz: string | null; lead_id: string; phone: string | null };

/** Every call in the period, newest first (capped). */
export async function callDetails(tx: Tx, since: Date, rep: string | null, limit = 2000): Promise<CallDetail[]> {
  return (await tx`select a.occurred_at, c.name as company, c.city, c.state, a.outcome::text as outcome, p.full_name as user_name,
      a.next_step, a.notes, a.interested_in::text[] as interested_in, a.bought::text[] as bought, a.duration_seconds, l.id as lead_id
    from call_activities a join leads l on l.id = a.lead_id join companies c on c.id = l.company_id left join profiles p on p.id = a.user_id
    where a.occurred_at >= ${since} and ${rep ? tx`a.user_id = ${rep}` : tx`true`}
    order by a.occurred_at desc limit ${limit}`) as unknown as CallDetail[];
}

export async function dealsWon(tx: Tx, since: Date, rep: string | null): Promise<DealDetail[]> {
  return (await tx`select o.closed_at, c.name as company, o.title, o.product::text as product, o.value_cents, p.full_name as owner_name, l.id as lead_id
    from sales_opportunities o join leads l on l.id = o.lead_id join companies c on c.id = l.company_id left join profiles p on p.id = o.owner_id
    where o.stage = 'won' and o.closed_at >= ${since} and ${rep ? tx`o.owner_id = ${rep}` : tx`true`}
    order by o.closed_at desc`) as unknown as DealDetail[];
}

/** Follow-ups scheduled in the period (by the person, when one is chosen), newest first. */
/** WhatsApp to send records logged in the period (by the person, when one is chosen), newest first. */
export async function followupDetails(tx: Tx, since: Date, rep: string | null, limit = 1000): Promise<FollowupDetail[]> {
  return (await tx`
    with combined as (
      select 
        ca.id as id,
        l.id as lead_id,
        c.name as company,
        c.time_zone as shop_tz,
        p.full_name as created_by_name,
        p.full_name as assigned_name,
        coalesce(ca.phone_e164, c.phones -> 0 ->> 'e164', ct.phones -> 0 ->> 'e164') as phone,
        ca.occurred_at as created_at,
        ca.occurred_at as due_at,
        'whatsapp' as kind,
        ca.outcome::text as call_outcome,
        ca.notes,
        ca.user_id,
        fo.id as followup_id,
        coalesce(fo.status::text, 'pending') as status
      from call_activities ca
      join leads l on l.id = ca.lead_id
      join companies c on c.id = l.company_id
      left join contacts ct on ct.id = ca.contact_id or ct.id = l.primary_contact_id
      left join profiles p on p.id = ca.user_id
      left join lateral (
        select f.id, f.status
        from followups f
        where f.lead_id = l.id and f.notes ilike '%whatsapp%'
        order by f.created_at desc limit 1
      ) fo on true
      where (ca.notes ilike '%WhatsApp%' or ca.notes ilike '%whatsapp%')

      union all

      select
        fo.id as id,
        l.id as lead_id,
        c.name as company,
        c.time_zone as shop_tz,
        p.full_name as created_by_name,
        p.full_name as assigned_name,
        coalesce(c.phones -> 0 ->> 'e164', ct.phones -> 0 ->> 'e164') as phone,
        fo.created_at as created_at,
        fo.due_at as due_at,
        'whatsapp' as kind,
        'connected' as call_outcome,
        fo.notes,
        fo.created_by as user_id,
        fo.id as followup_id,
        fo.status::text as status
      from followups fo
      join leads l on l.id = fo.lead_id
      join companies c on c.id = l.company_id
      left join contacts ct on ct.id = l.primary_contact_id
      left join profiles p on p.id = fo.created_by
      where (fo.notes ilike '%whatsapp%' or fo.kind = 'task' and fo.notes ilike '%whatsapp%')
        and not exists (
          select 1 from call_activities ca2
          where ca2.lead_id = fo.lead_id and (ca2.notes ilike '%whatsapp%')
            and abs(extract(epoch from (ca2.occurred_at - fo.created_at))) < 180
        )
    )
    select 
      created_at, 
      due_at, 
      company, 
      kind, 
      status, 
      notes,
      created_by_name, 
      assigned_name, 
      shop_tz, 
      lead_id,
      phone
    from combined
    where created_at >= ${since} and ${rep ? tx`user_id = ${rep}` : tx`true`}
    order by created_at desc limit ${limit}`) as unknown as FollowupDetail[];
}

export type Report = Awaited<ReturnType<typeof loadReport>>;

/**
 * Everything the Reports page shows for a period (and optionally one person). The PDF is
 * built from the same object, so the page and the PDF always agree.
 */
export async function loadReport(tx: Tx, period: Period, timeZone: string, { rep = null as string | null, details = false } = {}) {
  const range = periodRange(period, timeZone);
  const since = range.since;
  const owner = rep ? tx`and l.owner_id = ${rep}` : tx``;
  const [totals, people, series, products, outcomes, stages, statuses, imports, calls, deals, followups] = await Promise.all([
    activityTotals(tx, since, rep),
    activityByPerson(tx, since, rep),
    activitySeries(tx, period, range, timeZone, rep),
    productBreakdown(tx, since),
    tx`select a.outcome::text as outcome, count(*)::int as n from call_activities a where a.occurred_at >= ${since} and ${rep ? tx`a.user_id = ${rep}` : tx`true`} group by 1 order by 2 desc` as unknown as Promise<{ outcome: string; n: number }[]>,
    tx`select o.stage::text as stage, count(*)::int as n, coalesce(sum(o.value_cents), 0)::bigint as value_cents from sales_opportunities o where ${rep ? tx`o.owner_id = ${rep}` : tx`true`} group by 1` as unknown as Promise<{ stage: string; n: number; value_cents: number }[]>,
    tx`select l.status::text as status, count(*)::int as n from leads l where true ${owner} group by 1` as unknown as Promise<{ status: string; n: number }[]>,
    importSummary(tx, since),
    callDetails(tx, since, rep, details ? 2000 : 100),
    dealsWon(tx, since, rep),
    followupDetails(tx, since, rep, details ? 1000 : 50),
  ]);
  return { period, range, timeZone, rep, totals, people, series, products, outcomes, stages, statuses, imports, calls, deals, followups };
}
