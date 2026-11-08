import "server-only";
import type { Tx } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { endOfLocalDay, startOfLocalDay } from "@/lib/time";
import type { Product } from "@/lib/labels";

export type DashboardMetrics = {
  totalLeads: number;
  notCalled: number;
  callAttempts: number;
  callsToday: number;
  callbacksDue: number;
  whatsappToSend: number;
  overdue: number;
  interested: number;
  emailPending: number;
  dealsWon: number;
  unassigned: number;
  /** Shops interested in / that bought each product. */
  products: Record<Product, { interested: number; bought: number }>;
};

/** Headline numbers. RLS scopes them: a salesperson sees their own book, an admin the team's. */
export async function getMetrics(tx: Tx, user: CurrentUser): Promise<DashboardMetrics> {
  const endOfToday = endOfLocalDay(user.timeZone);
  const startOfToday = startOfLocalDay(user.timeZone);
  const [row] = await tx`
    with l as (select * from leads),
    wa as (
      select ca.id, coalesce(fo.status::text, 'pending') as status
      from call_activities ca
      join l on l.id = ca.lead_id
      left join lateral (
        select f.status from followups f where f.lead_id = l.id and f.notes ilike '%whatsapp%' order by f.created_at desc limit 1
      ) fo on true
      where (ca.notes ilike '%whatsapp%')
      union all
      select fo.id, fo.status::text as status
      from followups fo
      join l on l.id = fo.lead_id
      where (fo.notes ilike '%whatsapp%')
        and not exists (
          select 1 from call_activities ca2
          where ca2.lead_id = fo.lead_id and (ca2.notes ilike '%whatsapp%')
            and abs(extract(epoch from (ca2.occurred_at - fo.created_at))) < 180
        )
    )
    select
      (select count(*) from l)::int as total_leads,
      (select count(*) from l join companies c on c.id = l.company_id
         where l.call_attempts = 0 and l.status not in ('closed', 'unqualified')
           and c.suppression not in ('do_not_call', 'do_not_contact'))::int as not_called,
      (select count(*) from call_activities a join l on l.id = a.lead_id)::int as call_attempts,
      (select count(*) from call_activities a join l on l.id = a.lead_id where a.occurred_at >= ${startOfToday})::int as calls_today,
      (select count(*) from wa where status = 'pending')::int as callbacks_due,
      (select count(*) from wa where status = 'pending')::int as whatsapp_to_send,
      (select count(*) from followups f join l on l.id = f.lead_id where f.status = 'pending' and f.due_at < now())::int as overdue,
      (select count(*) from l where l.interest in ('interested', 'hot') and l.status <> 'closed')::int as interested,
      (select count(*) from l where l.email_status in ('pending', 'drafted'))::int as email_pending,
      (select count(*) from sales_opportunities o join l on l.id = o.lead_id where o.stage = 'won')::int as deals_won,
      (select count(*) from l where l.owner_id is null)::int as unassigned,
      (select count(*) from l where 'pos' = any(l.interested_in))::int as pos_interested,
      (select count(*) from l where 'pos' = any(l.bought))::int as pos_bought,
      (select count(*) from l where 'wholesale' = any(l.interested_in))::int as wholesale_interested,
      (select count(*) from l where 'wholesale' = any(l.bought))::int as wholesale_bought`;
  return {
    totalLeads: row.total_leads,
    notCalled: row.not_called,
    callAttempts: row.call_attempts,
    callsToday: row.calls_today,
    callbacksDue: row.whatsapp_to_send ?? row.callbacks_due,
    whatsappToSend: row.whatsapp_to_send ?? row.callbacks_due,
    overdue: row.overdue,
    interested: row.interested,
    emailPending: row.email_pending,
    dealsWon: row.deals_won,
    unassigned: row.unassigned,
    products: {
      pos: { interested: row.pos_interested, bought: row.pos_bought },
      wholesale: { interested: row.wholesale_interested, bought: row.wholesale_bought },
    },
  };
}

export type DueFollowup = {
  id: string;
  lead_id: string;
  company_name: string;
  interested_in: Product[];
  bought: Product[];
  kind: "call" | "email" | "task";
  due_at: Date;
  time_zone: string;
  /** The shop's own zone; due times are shown in it. */
  shop_tz: string | null;
  notes: string | null;
  owner_name: string | null;
};

export async function getDueFollowups(tx: Tx, user: CurrentUser, limit = 8): Promise<DueFollowup[]> {
  return (await tx`
    with combined as (
      select 
        ca.id,
        l.id as lead_id,
        c.name as company_name,
        l.interested_in::text[] as interested_in,
        l.bought::text[] as bought,
        'task'::text as kind,
        ca.occurred_at as due_at,
        c.time_zone,
        c.time_zone as shop_tz,
        ca.notes,
        p.full_name as owner_name,
        coalesce(fo.status::text, 'pending') as status,
        ca.user_id
      from call_activities ca
      join leads l on l.id = ca.lead_id
      join companies c on c.id = l.company_id
      left join profiles p on p.id = ca.user_id
      left join lateral (
        select f.status from followups f where f.lead_id = l.id and f.notes ilike '%whatsapp%' order by f.created_at desc limit 1
      ) fo on true
      where (ca.notes ilike '%whatsapp%')

      union all

      select
        fo.id,
        l.id as lead_id,
        c.name as company_name,
        l.interested_in::text[] as interested_in,
        l.bought::text[] as bought,
        fo.kind::text as kind,
        fo.created_at as due_at,
        c.time_zone,
        c.time_zone as shop_tz,
        fo.notes,
        p.full_name as owner_name,
        fo.status::text as status,
        fo.created_by as user_id
      from followups fo
      join leads l on l.id = fo.lead_id
      join companies c on c.id = l.company_id
      left join profiles p on p.id = fo.created_by
      where (fo.notes ilike '%whatsapp%')
        and not exists (
          select 1 from call_activities ca2
          where ca2.lead_id = fo.lead_id and (ca2.notes ilike '%whatsapp%')
            and abs(extract(epoch from (ca2.occurred_at - fo.created_at))) < 180
        )
    )
    select id, lead_id, company_name, interested_in, bought, kind, due_at, time_zone, shop_tz, notes, owner_name
    from combined
    where status = 'pending'
    order by due_at desc
    limit ${limit}`) as unknown as DueFollowup[];
}

export async function getNextToCall(tx: Tx, limit = 8) {
  return tx`
    select l.id, l.interested_in::text[] as interested_in, l.bought::text[] as bought, c.name as company_name, c.city, c.state, c.time_zone, l.created_at,
      coalesce(ct.phones -> 0 ->> 'e164', c.phones -> 0 ->> 'e164') as phone, p.full_name as owner_name
    from leads l join companies c on c.id = l.company_id
    left join contacts ct on ct.id = l.primary_contact_id
    left join profiles p on p.id = l.owner_id
    where l.call_attempts = 0 and l.status = 'new' and l.owner_id is not null
      and c.suppression not in ('do_not_call', 'do_not_contact')
    order by l.created_at desc, c.name
    limit ${limit}`;
}

export async function getRecentCalls(tx: Tx, limit = 8) {
  return tx`
    select a.id, a.lead_id, a.outcome, a.occurred_at, a.notes, c.name as company_name, p.full_name as user_name, l.interested_in::text[] as interested_in, l.bought::text[] as bought
    from call_activities a
    join leads l on l.id = a.lead_id
    join companies c on c.id = l.company_id
    left join profiles p on p.id = a.user_id
    order by a.occurred_at desc
    limit ${limit}`;
}
