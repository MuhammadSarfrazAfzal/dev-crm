import Link from "next/link";
import { now } from "@/lib/clock";
import { Alert, Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { ProductPills } from "@/components/table/RowBits";
import { withUserDb } from "@/lib/auth/current";
import { getDueFollowups, getMetrics, getNextToCall, getRecentCalls } from "@/server/dashboard";
import { formatInZone, shownZone } from "@/lib/time";
import { relativeTime } from "@/lib/format";
import { OutcomeBadge } from "@/components/badges";
import { CallTimeCell } from "@/components/CallTimeCell";
import { formatPhone } from "@/lib/phone";
import { Icon } from "@/components/icons";
import { WhatsAppLiveRefresher } from "./whatsapp/WhatsAppLiveRefresher";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const data = await withUserDb(async (tx, user) => {
    const [metrics, due, next, recent] = await Promise.all([getMetrics(tx, user), getDueFollowups(tx, user), getNextToCall(tx), getRecentCalls(tx)]);
    return { user, metrics, due, next, recent };
  });
  const { user, metrics: m } = data;
  const isAdmin = user.role === "admin";

  return (
    <>
      <WhatsAppLiveRefresher />
      <PageHeader
        title={`Good ${greeting(user.timeZone)}, ${user.fullName.split(" ")[0]}`}
        subtitle={isAdmin ? "Team overview: every shop is offered 8staros POS and wholesale" : "Your leads, calls and follow-ups"}
      />
      {sp.denied && <div className="mb-4"><Alert tone="red">That page is for admins only.</Alert></div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <Stat icon="leads" label="Total leads" value={m.totalLeads} href="/leads" hint={isAdmin && m.unassigned ? `${m.unassigned} unassigned` : undefined} />
        <Stat icon="phone" label="Not called" value={m.notCalled} href={`/leads?attempts=0&status=new,working,nurturing,qualified&suppression=none,do_not_email`} tone="sky" hint="Callable, no attempts yet" />
        <Stat icon="history" label="Call attempts" value={m.callAttempts} hint={`${m.callsToday} today`} tone="slate" />
        <Stat icon="whatsapp" label="WhatsApp to send" value={m.whatsappToSend} href="/whatsapp" tone="green" hint="Messages waiting to be sent" />
        <Stat icon="star" label="Interested" value={m.interested} href={`/leads?interest=interested,hot&status=new,working,nurturing,qualified,unqualified`} tone="green" hint="Interested or hot" />
        <Stat icon="mail" label="Email pending" value={m.emailPending} href="/emails" tone="violet" hint="Promised, not yet sent" />
        <Stat icon="handshake" label="Deals won" value={m.dealsWon} href="/leads?stage=won" tone="brand" />
        <Stat icon="tag" label="Want 8staros POS" value={m.products.pos.interested} href="/leads?product=pos" tone="violet" hint={`${m.products.pos.bought} bought`} />
        <Stat icon="tag" label="Want wholesale" value={m.products.wholesale.interested} href="/leads?product=wholesale" tone="amber" hint={`${m.products.wholesale.bought} bought`} />
        <Link href="/imports/new" className="group flex flex-col justify-center rounded-xl border border-dashed border-brand-line bg-brand-soft/40 p-4 text-sm transition hover:bg-brand-soft">
          <span className="flex items-center gap-1.5 font-semibold text-brand-fg"><Icon name="upload" className="size-4" /> Import leads <Icon name="arrowRight" className="size-3.5 transition group-hover:translate-x-0.5" /></span>
          <span className="mt-1 text-xs text-muted">CSV, Excel, PDF, Word, images, ZIP or pasted text</span>
        </Link>
      </div>

      <div className="mt-6">
        <Card
          icon="phone"
          title="Next to call"
          description="Leads nobody has called yet, oldest first. Local time is the shop's."
          bodyClassName="p-0"
          actions={<Link href={`/leads?attempts=0&status=new,working,nurturing,qualified&suppression=none,do_not_email`} className="link text-xs">All uncalled</Link>}
        >
          {data.next.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="leads" title="No new leads waiting" action={<Link href="/imports/new" className="btn-secondary btn-sm">Import a list</Link>}>{isAdmin ? "Import a list of shops to start calling." : "Import a list or ask an admin to assign you some."}</EmptyState>
            </div>
          ) : (
            <>
              {/* Phones: one tidy card per lead */}
              <ul className="divide-y divide-line md:hidden" data-testid="next-to-call-cards">
                {data.next.map((l) => (
                  <li key={l.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/leads/${l.id}`} className="font-medium text-fg">{l.company_name}</Link>
                        <div className="mt-0.5 text-xs text-muted">{[l.city, l.state].filter(Boolean).join(", ") || "Location unknown"}{isAdmin && l.owner_name ? ` · ${l.owner_name}` : ""}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="tabular-nums">{formatPhone(l.phone) || <span className="text-subtle">No phone</span>}</span>
                      <CallTimeCell timeZone={l.time_zone} state={l.state} />
                    </div>
                    <Link href={`/leads/${l.id}`} className="btn-secondary btn-sm mt-3 w-full">Open lead <Icon name="arrowRight" className="size-3.5" /></Link>
                  </li>
                ))}
              </ul>

              {/* Tablets and up: table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="table-base [&_td]:align-middle" data-testid="next-to-call">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>City / state</th>
                      <th>Their time</th>
                      <th>Phone</th>
                      {isAdmin && <th>Owner</th>}
                      <th className="text-right"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.next.map((l) => (
                      <tr key={l.id} className="hover:bg-surface-2/60">
                        <td className="font-medium"><Link href={`/leads/${l.id}`} className="text-fg hover:text-brand-fg">{l.company_name}</Link></td>
                        <td className="whitespace-nowrap">{[l.city, l.state].filter(Boolean).join(", ") || <span className="text-subtle">—</span>}</td>
                        <td><CallTimeCell timeZone={l.time_zone} state={l.state} /></td>
                        <td className="whitespace-nowrap tabular-nums">{formatPhone(l.phone) || <span className="text-subtle">—</span>}</td>
                        {isAdmin && <td className="whitespace-nowrap">{l.owner_name ?? <span className="text-warning-fg">Unassigned</span>}</td>}
                        <td className="text-right"><Link href={`/leads/${l.id}`} className="btn-secondary btn-sm">Open <Icon name="arrowRight" className="size-3.5" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card
          icon="clock"
          title="WhatsApp to send"
          description={user.view === "pk" ? "Times in Pakistan time." : "Times in the shop's own USA time."}
          bodyClassName="p-0"
          actions={<Link href="/whatsapp" className="link text-xs">All WhatsApp to send</Link>}
        >
          {data.due.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="check" title="All caught up">Nothing is due today.</EmptyState>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-line md:hidden" data-testid="due-cards">
                {data.due.map((f) => {
                  const overdue = new Date(f.due_at) < now();
                  return (
                    <li key={f.id} className="px-4 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/leads/${f.lead_id}`} className="font-medium text-fg">{f.company_name}</Link>
                          <div className="mt-0.5 text-xs text-muted"><span className="capitalize">{f.kind}</span>{isAdmin && f.owner_name ? ` · ${f.owner_name}` : ""}</div>
                        </div>
                        <span className="flex shrink-0 gap-1"><ProductPills interested={f.interested_in} bought={f.bought} /></span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className={overdue ? "font-medium text-danger-fg" : "text-fg-2"}>{formatInZone(f.due_at, shownZone(user.view, f.shop_tz ?? f.time_zone, user.usTimeZone), { weekday: undefined, month: undefined, day: undefined })}</span>
                        <Badge tone={overdue ? "red" : "amber"} dot>{overdue ? `Overdue ${relativeTime(f.due_at)}` : relativeTime(f.due_at)}</Badge>
                      </div>
                      <Link href={`/leads/${f.lead_id}`} className="btn-secondary btn-sm mt-3 w-full">Open lead <Icon name="arrowRight" className="size-3.5" /></Link>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="table-base [&_td]:align-middle" data-testid="due-today">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Wants</th>
                      <th>Kind</th>
                      <th>Due ({user.view === "pk" ? "Pakistan time" : "shop time"})</th>
                      <th>Status</th>
                      {isAdmin && <th>Owner</th>}
                      <th className="text-right"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.due.map((f) => {
                      const overdue = new Date(f.due_at) < now();
                      return (
                        <tr key={f.id} className="hover:bg-surface-2/60">
                          <td className="font-medium"><Link href={`/leads/${f.lead_id}`} className="text-fg hover:text-brand-fg">{f.company_name}</Link></td>
                          <td><span className="flex gap-1"><ProductPills interested={f.interested_in} bought={f.bought} /></span>{!f.interested_in.length && !f.bought.length && <span className="text-subtle">—</span>}</td>
                          <td className="capitalize">{f.kind}</td>
                          <td className={`whitespace-nowrap ${overdue ? "font-medium text-danger-fg" : ""}`}>{formatInZone(f.due_at, shownZone(user.view, f.shop_tz ?? f.time_zone, user.usTimeZone), { weekday: undefined, month: undefined, day: undefined })}</td>
                          <td><Badge tone={overdue ? "red" : "amber"} dot>{overdue ? `Overdue ${relativeTime(f.due_at)}` : relativeTime(f.due_at)}</Badge></td>
                          {isAdmin && <td className="whitespace-nowrap">{f.owner_name ?? <span className="text-subtle">—</span>}</td>}
                          <td className="text-right"><Link href={`/leads/${f.lead_id}`} className="btn-secondary btn-sm">Open <Icon name="arrowRight" className="size-3.5" /></Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card icon="history" title="Recent calls" description="The latest calls logged by the team." bodyClassName="p-0">
          {data.recent.length === 0 ? (
            <div className="p-5">
              <EmptyState icon="phone" title="No calls logged yet" />
            </div>
          ) : (
            <>
              <ul className="divide-y divide-line md:hidden" data-testid="recent-cards">
                {data.recent.map((c) => (
                  <li key={c.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <Link href={`/leads/${c.lead_id}`} className="min-w-0 font-medium text-fg">{c.company_name}</Link>
                      <OutcomeBadge outcome={c.outcome} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{relativeTime(c.occurred_at)}{c.user_name ? ` · ${c.user_name}` : ""}</div>
                    {c.notes && <p className="mt-1.5 line-clamp-2 text-sm text-fg-2">{c.notes}</p>}
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="table-base [&_td]:align-middle" data-testid="recent-calls">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Company</th>
                      <th>Outcome</th>
                      <th>By</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-2/60">
                        <td className="whitespace-nowrap text-muted" title={new Date(c.occurred_at).toLocaleString("en-US")}>{relativeTime(c.occurred_at)}</td>
                        <td className="font-medium"><Link href={`/leads/${c.lead_id}`} className="text-fg hover:text-brand-fg">{c.company_name}</Link></td>
                        <td className="whitespace-nowrap"><OutcomeBadge outcome={c.outcome} /></td>
                        <td className="whitespace-nowrap">{c.user_name ?? <span className="text-subtle">—</span>}</td>
                        <td className="max-w-md truncate text-muted" title={c.notes ?? ""}>{c.notes ?? <span className="text-subtle">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now()));
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}
