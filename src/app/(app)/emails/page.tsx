import type { Metadata } from "next";
import Link from "next/link";
import { EmailBadge, SuppressionBadge } from "@/components/badges";
import { CopyButton } from "@/components/CopyButton";
import { Icon } from "@/components/icons";
import { Dash, EmptyState, PageHeader, ProductTags, Segmented } from "@/components/ui";
import { withUserDb } from "@/lib/auth/current";
import { relativeTime } from "@/lib/format";
import type { Product } from "@/lib/labels";
import { EmailLiveRefresher } from "./EmailLiveRefresher";
import { EmailMarkSentButton, EmailDraftedButton, EmailReopenButton } from "./EmailActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "Emails to send" };

type Row = {
  lead_id: string;
  interested_in: Product[];
  bought: Product[];
  email_status: string;
  company_name: string;
  city: string | null;
  state: string | null;
  suppression: string;
  owner_name: string | null;
  to_address: string | null;
  requested_at: Date | null;
  contact_name: string | null;
  email_notes: string | null;
  sent_at: Date | null;
  sent_by_name: string | null;
};

/** Leads where someone promised an email: who to write to, and one click once it's sent. Latest requests show at top. */
export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const view = sp.view === "done" ? "done" : "pending";
  const scope = sp.scope === "mine" ? "mine" : "all";

  const { user, rows, counts } = await withUserDb(async (tx, user) => {
    const scopeFilter =
      user.role === "admin"
        ? scope === "mine"
          ? tx`l.owner_id = ${user.id}`
          : tx`true`
        : tx`l.owner_id = ${user.id}`;

    const [countsRow] = await tx`
      select
        count(*) filter (where l.email_status in ('pending', 'drafted') and ${scopeFilter})::int as pending,
        count(*) filter (where l.email_status in ('sent', 'replied') and ${scopeFilter})::int as done
      from leads l
    `;

    const rows = (await tx`
      select 
        l.id as lead_id, 
        l.interested_in::text[] as interested_in, 
        l.bought::text[] as bought, 
        l.email_status, 
        c.name as company_name, 
        c.city,
        c.state,
        c.suppression, 
        p.full_name as owner_name,
        ct.full_name as contact_name,
        coalesce(e.to_address, ct.emails -> 0 ->> 'address', c.emails -> 0 ->> 'address') as to_address, 
        coalesce(e.occurred_at, l.updated_at, l.created_at) as requested_at,
        e.notes as email_notes,
        e.occurred_at as sent_at,
        e_sender.full_name as sent_by_name
      from leads l
      join companies c on c.id = l.company_id
      left join contacts ct on ct.id = l.primary_contact_id
      left join profiles p on p.id = l.owner_id
      left join lateral (
        select to_address, occurred_at, notes, user_id, status 
        from email_activities ea 
        where ea.lead_id = l.id 
        order by occurred_at desc limit 1
      ) e on true
      left join profiles e_sender on e_sender.id = e.user_id
      where (case when ${view} = 'done' then l.email_status in ('sent', 'replied') else l.email_status in ('pending', 'drafted') end)
        and ${scopeFilter}
      order by (case when ${view} = 'done' then coalesce(e.occurred_at, l.updated_at) else coalesce(e.occurred_at, l.updated_at, l.created_at) end) desc nulls last
      limit 250
    `) as unknown as Row[];

    return { user, rows, counts: countsRow as { pending: number; done: number } };
  });

  const isAdmin = user.role === "admin";

  return (
    <>
      <EmailLiveRefresher />
      <PageHeader
        title="Emails to send"
        subtitle={
          view === "done"
            ? "Shops where an email has been sent. Review history or reopen if follow-up is needed."
            : "Shops that asked for an email on a call. Send it from your own mailbox, then mark it here."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Status"
              items={[
                {
                  href: scope === "mine" ? "/emails?scope=mine" : "/emails",
                  label: `To send (${counts?.pending ?? 0})`,
                  active: view === "pending",
                },
                {
                  href: scope === "mine" ? "/emails?view=done&scope=mine" : "/emails?view=done",
                  label: `Completed (${counts?.done ?? 0})`,
                  active: view === "done",
                },
              ]}
            />
            {isAdmin && (
              <Segmented
                label="Whose items"
                items={[
                  {
                    href: view === "done" ? "/emails?view=done" : "/emails",
                    label: "All team",
                    active: scope === "all",
                  },
                  {
                    href: view === "done" ? "/emails?view=done&scope=mine" : "/emails?scope=mine",
                    label: "Mine",
                    active: scope === "mine",
                  },
                ]}
              />
            )}
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon="mail"
          title={view === "done" ? "No completed emails" : "No emails waiting"}
        >
          {view === "done"
            ? "Completed emails will appear here once marked sent."
            : "When a shop asks for pricing or a price list on a call, it shows up here."}
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-line">
          {rows.map((r) => {
            const isOptedOut = r.suppression === "do_not_email" || r.suppression === "do_not_contact";
            return (
              <li
                key={r.lead_id}
                className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center md:justify-between hover:bg-surface-2/40 transition"
                data-testid="email-row"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/leads/${r.lead_id}`}
                      className="font-medium text-fg hover:text-brand-fg"
                    >
                      {r.company_name}
                    </Link>
                    {(r.city || r.state) && (
                      <span className="text-xs text-muted">
                        {[r.city, r.state].filter(Boolean).join(", ")}
                      </span>
                    )}
                    {view === "done" && (
                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-100 dark:bg-emerald-950/80 dark:text-emerald-300 px-2 py-0.5 rounded text-xs font-semibold">
                        <Icon name="check" className="size-3 text-emerald-600" />
                        Sent {r.sent_at ? relativeTime(r.sent_at) : ""}
                        {r.sent_by_name ? ` by ${r.sent_by_name}` : ""}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <ProductTags interested={r.interested_in} bought={r.bought} />
                    <EmailBadge status={r.email_status} />
                    <SuppressionBadge suppression={r.suppression} />
                    {r.contact_name && <span>{r.contact_name}</span>}
                    {isAdmin && r.owner_name && <span>· {r.owner_name}</span>}
                    {view === "pending" && r.requested_at && (
                      <span className="font-medium text-fg-2">
                        · asked {relativeTime(r.requested_at)}
                      </span>
                    )}
                  </div>

                  {r.email_notes && (
                    <div className="mt-1 text-xs text-brand-fg font-medium">
                      {r.email_notes}
                    </div>
                  )}

                  <div className="mt-1.5 flex min-w-0 items-center gap-2 text-sm">
                    <Icon name="mail" className="size-3.5 shrink-0 text-subtle" />
                    {r.to_address ? (
                      <>
                        <a href={`mailto:${r.to_address}`} className="link truncate">
                          {r.to_address}
                        </a>
                        <CopyButton
                          text={r.to_address}
                          label="Copy"
                          className="text-xs font-medium text-brand-fg hover:underline"
                        />
                      </>
                    ) : (
                      <span className="text-muted">
                        No address yet: <Dash /> add one on the lead
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {view === "pending" ? (
                    <>
                      {r.email_status === "pending" && (
                        <EmailDraftedButton leadId={r.lead_id} toAddress={r.to_address} />
                      )}
                      <EmailMarkSentButton
                        leadId={r.lead_id}
                        toAddress={r.to_address}
                        disabled={isOptedOut}
                      />
                    </>
                  ) : (
                    <>
                      <EmailReopenButton leadId={r.lead_id} />
                      <Link href={`/leads/${r.lead_id}`} className="btn-ghost btn-sm">
                        Open lead <Icon name="arrowRight" className="size-3" />
                      </Link>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
