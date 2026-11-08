import type { Metadata } from "next";
import Link from "next/link";
import { markCallbackDone } from "@/app/actions/lead";
import { OutcomeBadge } from "@/components/badges";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/icons";
import { EmptyState, PageHeader, Segmented } from "@/components/ui";
import { withUserDb } from "@/lib/auth/current";
import { formatPhone } from "@/lib/phone";
import { relativeTime } from "@/lib/format";
import type { CallOutcome } from "@/lib/labels";
import { CallbackLiveRefresher } from "./CallbackLiveRefresher";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "Call back later" };

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
};

export default async function CallbacksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const view = sp.view === "done" ? "done" : "pending";
  const scope = sp.scope === "mine" ? "mine" : "all";

  const { user, rows } = await withUserDb(async (tx, user) => ({
    user,
    rows: (await tx`
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
          coalesce(fo.status::text, 'pending') as status
        from call_activities ca
        join leads l on l.id = ca.lead_id
        join companies c on c.id = l.company_id
        left join contacts ct on ct.id = ca.contact_id or ct.id = l.primary_contact_id
        left join profiles p on p.id = ca.user_id
        left join lateral (
          select f.id, f.status
          from followups f
          where f.lead_id = l.id and f.kind = 'call'
          order by (case when f.status = 'pending' then 0 else 1 end), abs(extract(epoch from (f.created_at - ca.occurred_at))) asc limit 1
        ) fo on true
        where ca.outcome = 'callback_requested'

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
          'callback_requested' as call_outcome,
          fo.notes as call_notes,
          null as call_next_step,
          fo.assigned_to as user_id,
          fo.id as followup_id,
          fo.status::text as status
        from followups fo
        join leads l on l.id = fo.lead_id
        join companies c on c.id = l.company_id
        left join contacts ct on ct.id = l.primary_contact_id
        left join profiles p on p.id = fo.created_by
        where fo.kind = 'call'
          and (fo.notes ilike '%call back%' or fo.notes ilike '%callback%')
          and not exists (
            select 1 from call_activities ca2
            where ca2.lead_id = fo.lead_id and ca2.outcome = 'callback_requested'
              and abs(extract(epoch from (ca2.occurred_at - fo.created_at))) < 180
          )
      )
      select * from combined
      where status = ${view}
        and (${scope === "all" || user.role !== "admin"} or user_id = ${user.id})
      order by call_at desc
      limit 250
    `) as unknown as Row[],
  }));

  const isAdmin = user.role === "admin";

  return (
    <>
      <CallbackLiveRefresher />
      <PageHeader
        title="Call back later"
        subtitle="Live feed of shops that asked to be called back later on logged calls. Quickly call back and keep records updated."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Status"
              items={[
                { href: scope === "mine" ? "/callbacks?scope=mine" : "/callbacks", label: "To call", active: view === "pending" },
                { href: scope === "mine" ? "/callbacks?view=done&scope=mine" : "/callbacks?view=done", label: "Completed", active: view === "done" },
              ]}
            />
            {isAdmin && (
              <Segmented
                label="Whose items"
                items={[
                  { href: view === "done" ? "/callbacks?view=done" : "/callbacks", label: "All team", active: scope === "all" },
                  { href: view === "done" ? "/callbacks?view=done&scope=mine" : "/callbacks?scope=mine", label: "Mine", active: scope === "mine" },
                ]}
              />
            )}
            <a href="/api/callbacks" target="_blank" className="btn-ghost btn-sm text-xs font-mono" title="View JSON feed">
              JSON API
            </a>
          </div>
        }
      />

      <div className="space-y-4">
        {rows.length === 0 ? (
          <EmptyState icon="phone" title={view === "done" ? "No completed callbacks" : "No callbacks waiting to be made"}>
            {view === "done"
              ? "Completed callbacks will appear here once marked done."
              : "When a salesperson logs a call and selects 'Call back later', it immediately appears here in real time."}
          </EmptyState>
        ) : (
          <ul className="card divide-y divide-line">
            {rows.map((r) => {
              const cleanPhone = r.phone ? r.phone.replace(/\D/g, "") : "";

              return (
                <li
                  key={`${r.id}-${r.followup_id ?? "call"}`}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between transition hover:bg-surface-2/40"
                  data-testid="callback-row"
                >
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/leads/${r.lead_id}`}
                        className="text-base font-semibold text-fg hover:text-brand-fg transition"
                      >
                        {r.company_name}
                      </Link>
                      <OutcomeBadge outcome="callback_requested" />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      {r.phone && (
                        <span className="font-semibold text-fg tabular-nums">
                          {formatPhone(r.phone)}
                        </span>
                      )}
                      {(r.city || r.state) && (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="pin" className="size-3 text-subtle" />
                          {[r.city, r.state].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {r.caller_name && (
                        <span className="inline-flex items-center gap-1">
                          <Icon name="user" className="size-3 text-subtle" />
                          Logged by {r.caller_name}
                        </span>
                      )}
                      {r.call_at && (
                        <span className="inline-flex items-center gap-1 font-medium text-fg-2">
                          <Icon name="clock" className="size-3 text-subtle" />
                          {relativeTime(r.call_at)}
                        </span>
                      )}
                    </div>

                    {r.call_notes && (
                      <div className="rounded-lg border border-warning/30 bg-warning-soft/60 px-3 py-2 text-xs text-warning-fg">
                        <span className="font-semibold">Call back details: </span>
                        <span>{r.call_notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                    {r.phone && (
                      <>
                        <a
                          href={`tel:${r.phone}`}
                          className="btn-secondary btn-sm"
                          title="Call from device"
                        >
                          <Icon name="phone" className="size-3.5 text-brand-fg" />
                          Call now
                        </a>
                        <CopyButton
                          text={cleanPhone}
                          label="Copy"
                          className="btn-ghost btn-sm"
                        />
                      </>
                    )}

                    <Link
                      href={`/leads/${r.lead_id}`}
                      className="btn-ghost btn-sm"
                    >
                      Open lead
                    </Link>

                    {view === "pending" ? (
                      <form action={markCallbackDone}>
                        <input type="hidden" name="leadId" value={r.lead_id} />
                        <input type="hidden" name="followupId" value={r.followup_id ?? ""} />
                        <input type="hidden" name="callId" value={r.call_id ?? ""} />
                        <button
                          type="submit"
                          className="btn-primary btn-sm"
                          title="Mark call back as completed"
                        >
                          <Icon name="check" className="size-3.5" />
                          Done
                        </button>
                      </form>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-success-soft px-2.5 py-1 text-xs font-medium text-success-fg">
                        <Icon name="check" className="size-3.5" />
                        Completed
                      </span>
                    )}
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

