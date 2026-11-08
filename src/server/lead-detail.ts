import "server-only";
import type { Tx } from "@/lib/db";
import type { Product } from "@/lib/labels";
import type { StoredPhone } from "@/lib/phone";

export type StoredEmail = { address: string; label?: string | null };

export type LeadDetail = {
  id: string;
  interested_in: Product[];
  bought: Product[];
  status: string;
  interest: string;
  email_required: boolean;
  email_status: string;
  call_attempts: number;
  last_call_at: Date | null;
  last_outcome: string | null;
  next_followup_at: Date | null;
  owner_id: string | null;
  owner_name: string | null;
  primary_contact_id: string | null;
  source: string | null;
  import_id: string | null;
  import_filename: string | null;
  created_at: Date;
  company: {
    id: string;
    name: string;
    website: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    time_zone: string | null;
    phones: StoredPhone[];
    emails: StoredEmail[];
    suppression: string;
    suppression_reason: string | null;
    notes: string | null;
    source: string | null;
    tags: string[];
  };
  contacts: {
    id: string;
    full_name: string | null;
    title: string | null;
    phones: StoredPhone[];
    emails: StoredEmail[];
    is_primary: boolean;
    suppression: string;
  }[];
};

export async function getLead(tx: Tx, id: string): Promise<LeadDetail | null> {
  const [l] = await tx`
    select l.*, l.interested_in::text[] as interested_in, l.bought::text[] as bought, p.full_name as owner_name, i.original_filename as import_filename,
      to_jsonb(c) - 'phone_keys' - 'name_key' as company
    from leads l
    join companies c on c.id = l.company_id
    left join profiles p on p.id = l.owner_id
    left join imports i on i.id = l.import_id
    where l.id = ${id}`;
  if (!l) return null;
  const contacts = await tx`
    select id, full_name, title, phones, emails, is_primary, suppression
    from contacts where company_id = ${l.company_id}
    order by (id = ${l.primary_contact_id}) desc, is_primary desc, created_at`;
  return { ...(l as unknown as LeadDetail), contacts: contacts as unknown as LeadDetail["contacts"] };
}

export type TimelineItem = {
  kind: "call" | "email" | "note" | "followup" | "audit";
  id: string;
  at: Date;
  user_name: string | null;
  title: string;
  body: string | null;
  meta: Record<string, unknown>;
};

/** Everything that happened on the lead, newest first. Built from the append-only logs. */
export async function getTimeline(tx: Tx, leadId: string): Promise<TimelineItem[]> {
  const rows = await tx`
    select 'call' as kind, a.id::text, a.occurred_at as at, p.full_name as user_name, a.outcome::text as title, a.notes as body,
      jsonb_build_object('phone', a.phone_e164, 'interest', a.interest, 'duration', a.duration_seconds, 'next_step', a.next_step,
        'interested_in', a.interested_in, 'bought', a.bought) as meta
    from call_activities a left join profiles p on p.id = a.user_id where a.lead_id = ${leadId}
    union all
    select 'email', e.id::text, e.occurred_at, p.full_name, e.status::text, e.notes,
      jsonb_build_object('to', e.to_address, 'subject', e.subject)
    from email_activities e left join profiles p on p.id = e.user_id where e.lead_id = ${leadId}
    union all
    select 'note', n.id::text, n.created_at, p.full_name, 'note', n.body, '{}'::jsonb
    from notes n left join profiles p on p.id = n.user_id where n.lead_id = ${leadId}
    union all
    select 'followup', f.id::text, f.created_at, p.full_name, f.kind::text, f.notes,
      jsonb_build_object('due_at', f.due_at, 'time_zone', f.time_zone, 'status', f.status, 'completed_at', f.completed_at)
    from followups f left join profiles p on p.id = f.created_by where f.lead_id = ${leadId}
    union all
    select 'audit', a.id::text, a.created_at, p.full_name, a.action, null, a.details
    from audit_logs a left join profiles p on p.id = a.actor_id
    where (a.entity = 'leads' and a.entity_id = ${leadId})
       or (a.entity = 'sales_opportunities' and a.details ->> 'lead_id' = ${leadId})
    order by at desc
    limit 200`;
  return rows as unknown as TimelineItem[];
}

export async function getFollowups(tx: Tx, leadId: string) {
  return tx`
    select f.id, f.kind, f.due_at, f.time_zone, f.status, f.notes, f.completed_at, p.full_name as assigned_name
    from followups f left join profiles p on p.id = f.assigned_to
    where f.lead_id = ${leadId}
    order by (f.status = 'pending') desc, f.due_at
    limit 50`;
}

export type Opportunity = { id: string; product: Product | null; title: string; stage: string; value_cents: number | null; expected_close_on: Date | null; closed_at: Date | null; updated_at: Date };

export async function getOpportunities(tx: Tx, leadId: string): Promise<Opportunity[]> {
  return (await tx`select id, product::text as product, title, stage, value_cents, expected_close_on, closed_at, updated_at
    from sales_opportunities where lead_id = ${leadId} order by created_at`) as unknown as Opportunity[];
}

export async function getDocuments(tx: Tx, leadId: string, companyId: string, importId: string | null) {
  return tx`
    select d.id, d.filename, d.mime_type, d.size_bytes, d.created_at, p.full_name as uploaded_by_name,
      (d.import_id is not null) as from_import
    from documents d left join profiles p on p.id = d.uploaded_by
    where d.lead_id = ${leadId} or d.company_id = ${companyId} or (${importId}::uuid is not null and d.import_id = ${importId}::uuid)
    order by d.created_at desc`;
}

/** Every current script, for both products, in call order (shared ones first within a step). */
export async function getCurrentScripts(tx: Tx) {
  return tx`select id, script_key, version, script_type, product::text as product, title, body from scripts
    where is_current
    order by array_position(array['opening','gatekeeper','voicemail','objection','closing','follow_up_email']::script_type[], script_type),
      product nulls first, title`;
}
