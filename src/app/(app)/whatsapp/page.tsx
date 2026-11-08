import type { Metadata } from "next";
import Link from "next/link";
import { markWhatsAppDone } from "@/app/actions/lead";
import { OutcomeBadge } from "@/components/badges";
import { Icon } from "@/components/icons";
import { EmptyState, PageHeader, Segmented } from "@/components/ui";
import { withUserDb } from "@/lib/auth/current";
import { formatPhone } from "@/lib/phone";
import { relativeTime } from "@/lib/format";
import type { CallOutcome } from "@/lib/labels";
import { WhatsAppLiveRefresher } from "./WhatsAppLiveRefresher";
import { WhatsAppDoneButton, WhatsAppReopenButton } from "./WhatsAppActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "WhatsApp to send" };

type Row = {
  id: string;
  call_id: string | null;
  lead_id: string;
  company_name: string;
  city: string | null;
  state: string | null;
  caller_name: string | null;
  phone: string | null;
  call_at: Date;
  call_outcome: CallOutcome;
  call_notes: string | null;
  call_next_step: string | null;
  user_id: string;
  followup_id: string | null;
  status: string;
  completed_at: Date | null;
  completed_by_name: string | null;
};

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const view = sp.view === "done" ? "done" : "pending";
  const scope = sp.scope === "mine" ? "mine" : "all";

  const { user, rows, counts } = await withUserDb(async (tx, user) => {
    const scopeFilter = tx`${scope === "all" || user.role !== "admin" ? tx`true` : tx`user_id = ${user.id}`}`;
    const [countsRow] = await tx`
      with combined as (
        select 
          ca.id as id,
          ca.user_id,
          coalesce(fo.status::text, 'pending') as status
        from call_activities ca
        join leads l on l.id = ca.lead_id
        left join lateral (
          select f.status
          from followups f
          where f.lead_id = l.id and f.notes ilike '%whatsapp%'
          order by f.created_at desc limit 1
        ) fo on true
        where (ca.notes ilike '%WhatsApp%' or ca.notes ilike '%whatsapp%')

        union all

        select
          fo.id as id,
          fo.created_by as user_id,
          fo.status::text as status
        from followups fo
        join leads l on l.id = fo.lead_id
        where (fo.notes ilike '%whatsapp%' or fo.kind = 'task' and fo.notes ilike '%whatsapp%')
          and not exists (
            select 1 from call_activities ca2
            where ca2.lead_id = fo.lead_id and (ca2.notes ilike '%whatsapp%')
          )
      )
      select 
        count(*) filter (where status = 'pending' and ${scopeFilter})::int as pending,
        count(*) filter (where status = 'done' and ${scopeFilter})::int as done
      from combined
    `;

    const rows = (await tx`
      with combined as (
        select 
          ca.id as id,
          ca.id as call_id,
          l.id as lead_id,
          c.name as company_name,
          c.city,
          c.state,
          p.full_name as caller_name,
          coalesce(ca.phone_e164, c.phones -> 0 ->> 'e164', ct.phones -> 0 ->> 'e164') as phone,
          ca.occurred_at as call_at,
          ca.outcome::text as call_outcome,
          ca.notes as call_notes,
          ca.next_step as call_next_step,
          ca.user_id as user_id,
          fo.id as followup_id,
          coalesce(fo.status::text, 'pending') as status,
          fo.completed_at as completed_at,
          p_done.full_name as completed_by_name
        from call_activities ca
        join leads l on l.id = ca.lead_id
        join companies c on c.id = l.company_id
        left join contacts ct on ct.id = ca.contact_id or ct.id = l.primary_contact_id
        left join profiles p on p.id = ca.user_id
        left join lateral (
          select f.id, f.status, f.completed_at, f.assigned_to, f.created_by
          from followups f
          where f.lead_id = l.id and f.notes ilike '%whatsapp%'
          order by f.created_at desc limit 1
        ) fo on true
        left join profiles p_done on p_done.id = coalesce(fo.assigned_to, fo.created_by)
        where (ca.notes ilike '%WhatsApp%' or ca.notes ilike '%whatsapp%')

        union all

        select
          fo.id as id,
          null as call_id,
          l.id as lead_id,
          c.name as company_name,
          c.city,
          c.state,
          p.full_name as caller_name,
          coalesce(c.phones -> 0 ->> 'e164', ct.phones -> 0 ->> 'e164') as phone,
          fo.created_at as call_at,
          'connected' as call_outcome,
          fo.notes as call_notes,
          null as call_next_step,
          fo.created_by as user_id,
          fo.id as followup_id,
          fo.status::text as status,
          fo.completed_at as completed_at,
          p_done.full_name as completed_by_name
        from followups fo
        join leads l on l.id = fo.lead_id
        join companies c on c.id = l.company_id
        left join contacts ct on ct.id = l.primary_contact_id
        left join profiles p on p.id = fo.created_by
        left join profiles p_done on p_done.id = coalesce(fo.assigned_to, fo.created_by)
        where (fo.notes ilike '%whatsapp%' or fo.kind = 'task' and fo.notes ilike '%whatsapp%')
          and not exists (
            select 1 from call_activities ca2
            where ca2.lead_id = fo.lead_id and (ca2.notes ilike '%whatsapp%')
          )
      )
      select * from combined
      where status = ${view}
        and ${scopeFilter}
      order by (case when ${view} = 'done' then coalesce(completed_at, call_at) else call_at end) desc
      limit 250
    `) as unknown as Row[];

    return { user, rows, counts: countsRow as { pending: number; done: number } };
  });

  const isAdmin = user.role === "admin";

  return (
    <>
      <WhatsAppLiveRefresher />
      <PageHeader
        title="WhatsApp to send"
        subtitle="Live feed of shops requesting WhatsApp details from logged calls. Open WhatsApp directly and mark complete."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Status"
              items={[
                { href: scope === "mine" ? "/whatsapp?scope=mine" : "/whatsapp", label: `To send (${counts?.pending ?? 0})`, active: view === "pending" },
                { href: scope === "mine" ? "/whatsapp?view=done&scope=mine" : "/whatsapp?view=done", label: `Completed (${counts?.done ?? 0})`, active: view === "done" },
              ]}
            />
            {isAdmin && (
              <Segmented
                label="Whose items"
                items={[
                  { href: view === "done" ? "/whatsapp?view=done" : "/whatsapp", label: "All team", active: scope === "all" },
                  { href: view === "done" ? "/whatsapp?view=done&scope=mine" : "/whatsapp?scope=mine", label: "Mine", active: scope === "mine" },
                ]}
              />
            )}
            <a href="/api/whatsapp" target="_blank" className="btn-ghost btn-sm text-xs font-mono" title="View JSON feed">
              JSON API
            </a>
          </div>
        }
      />

      <div className="space-y-4">
        {rows.length === 0 ? (
          <EmptyState icon="whatsapp" title={view === "done" ? "No completed WhatsApp messages" : "No WhatsApp messages waiting to be sent"}>
            {view === "done"
              ? "Completed WhatsApp messages will appear here once marked done."
              : "When a salesperson logs a call and selects 'WhatsApp to send' under Next step, it immediately appears here in real time."}
          </EmptyState>
        ) : (
          <ul className="card divide-y divide-line">
            {rows.map((r) => {
              const cleanPhone = r.phone ? r.phone.replace(/\D/g, "") : "";

              // Extract WhatsApp products note from call notes
              const waLines = r.call_notes
                ? r.call_notes
                    .split("\n")
                    .filter((l) => l.toLowerCase().includes("whatsapp"))
                    .join(" · ")
                : "WhatsApp to send";

              // Other notes
              const otherNotes = r.call_notes
                ? r.call_notes
                    .split("\n")
                    .filter((l) => !l.toLowerCase().includes("whatsapp"))
                    .join(" · ")
                : "";

              return (
                <li
                  key={r.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-surface-2/40 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/leads/${r.lead_id}`}
                        className="font-semibold text-fg hover:text-brand-fg text-base"
                      >
                        {r.company_name}
                      </Link>
                      {(r.city || r.state) && (
                        <span className="text-xs text-muted">
                          {[r.city, r.state].filter(Boolean).join(", ")}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-semibold px-2 py-0.5 rounded-md">
                        <Icon name="whatsapp" className="size-3 text-emerald-600" />
                        {waLines || "WhatsApp to send"}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {view === "done" && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-100 dark:bg-emerald-950/80 dark:text-emerald-300 px-2 py-0.5 rounded text-xs font-semibold">
                          <Icon name="check" className="size-3 text-emerald-600" />
                          Done {r.completed_at ? relativeTime(r.completed_at) : ""}
                          {r.completed_by_name ? ` by ${r.completed_by_name}` : ""}
                        </span>
                      )}
                      {r.call_outcome && <OutcomeBadge outcome={r.call_outcome} />}
                      {r.phone && (
                        <span className="font-semibold text-fg-2 tabular-nums">
                          {formatPhone(r.phone)}
                        </span>
                      )}
                      <span>· called {relativeTime(r.call_at)}</span>
                      {r.caller_name && <span>by {r.caller_name}</span>}
                    </div>

                    {r.call_next_step && (
                      <div className="mt-1.5 text-xs text-success-fg font-medium">
                        Next: {r.call_next_step}
                      </div>
                    )}

                    {otherNotes && (
                      <div className="mt-1 text-xs text-muted italic line-clamp-2">
                        {otherNotes}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {cleanPhone ? (
                      <a
                        href={`https://wa.me/${cleanPhone}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-secondary btn-sm text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 inline-flex items-center gap-1.5 font-medium"
                        title="Open WhatsApp chat"
                      >
                        <Icon name="whatsapp" className="size-4 text-emerald-600" />
                        Send WhatsApp
                      </a>
                    ) : (
                      <span className="text-xs text-subtle">No phone number</span>
                    )}

                    {view === "pending" ? (
                      <WhatsAppDoneButton leadId={r.lead_id} followupId={r.followup_id} callId={r.call_id} />
                    ) : (
                      <WhatsAppReopenButton leadId={r.lead_id} followupId={r.followup_id} />
                    )}

                    <Link href={`/leads/${r.lead_id}`} className="btn-ghost btn-sm">
                      Open lead <Icon name="arrowRight" className="size-3" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

