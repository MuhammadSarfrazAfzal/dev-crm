import type { Metadata } from "next";
import Link from "next/link";
import { OutcomeBadge } from "@/components/badges";
import { BarList } from "@/components/BarList";
import { Icon } from "@/components/icons";
import { ActivityChart } from "@/components/reports/ActivityChart";
import { ProductPills } from "@/components/table/RowBits";
import { UrlDropdown } from "@/components/UrlDropdown";
import { Card, EmptyState, PageHeader, Segmented, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { duration, money, percent, plural } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { DEAL_STAGES, LEAD_STATUSES, LEAD_STATUS_LABEL, OUTCOME_LABEL, HIDDEN_CALL_OUTCOMES, PRODUCT_LABEL, PRODUCT_SHORT, stageLabel, type CallOutcome, type DealStage, type LeadStatus, type Product } from "@/lib/labels";
import { isUuid } from "@/lib/params";
import { formatInZone } from "@/lib/time";
import { listOwners } from "@/server/leads";
import { loadReport, PERIODS, periodLabel, type Activity, type Period } from "@/server/reports";
import { WhatsAppLiveRefresher } from "@/app/(app)/whatsapp/WhatsAppLiveRefresher";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const period: Period = sp.period && sp.period in PERIODS ? (sp.period as Period) : "7d";
  const rep = isUuid(sp.rep) ? sp.rep : null;
  // The page shows the latest calls and follow-ups; "Show all" (and the PDF) lists every one.
  const all = sp.log === "all";
  const tz = admin.usTimeZone;
  const { data, people } = await asUser(admin.id, async (tx) => {
    const [data, people] = await Promise.all([loadReport(tx, period, tz, { rep, details: all }), listOwners(tx)]);
    return { data, people };
  });
  const t = data.totals;
  const person = rep ? data.people[0] : null;
  const q = (o: Record<string, string | undefined>) => new URLSearchParams(Object.entries({ period, rep: rep ?? undefined, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  const when = (d: Date | string) => formatInZone(d, tz, { weekday: undefined });
  const calls = all ? data.calls : data.calls.slice(0, 25);
  const followups = all ? data.followups : data.followups.slice(0, 10);
  const showAll = (n: number, total: number) =>
    total > n ? <Link href={`/reports?${q({ log: "all" })}#call-log`} className="link text-xs" scroll={false}>Show all {total}</Link> : null;

  return (
    <>
      <WhatsAppLiveRefresher />
      <PageHeader
        title={person ? `Report · ${person.full_name}` : "Reports"}
        subtitle={`${periodLabel(period, data.range, tz)} · USA time`}
        back={person ? { href: `/reports?${q({ rep: undefined })}`, label: "Team report" } : undefined}
        actions={
          <a href={`/api/export/report/pdf?${q({})}`} className="btn-primary" data-testid="report-pdf">
            <Icon name="download" className="size-4" /> Download PDF
          </a>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Segmented label="Period" items={(Object.keys(PERIODS) as Period[]).map((p) => ({ href: `/reports?${q({ period: p })}`, label: PERIODS[p], active: p === period }))} />
        <div className="w-56">
          <UrlDropdown param="rep" ariaLabel="Salesperson" testId="report-rep" options={[{ value: "", label: "Whole team" }, ...people.map((p) => ({ value: p.id, label: p.full_name }))]} />
        </div>
        <a href={`/api/export/report?${q({})}`} className="btn-ghost btn-sm ml-auto"><Icon name="download" className="size-3.5" /> CSV</a>
      </div>

      <Kpis t={t} />

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card title="Calls over time" description={`Per ${data.series.unit}, USA time`}>
          <ActivityChart buckets={data.series.buckets} unit={data.series.unit} />
        </Card>
        <Card title="Call results" description="Calls in this period">
          <BarList rows={data.outcomes.filter((o) => !HIDDEN_CALL_OUTCOMES.has(o.outcome)).map((o) => ({ label: OUTCOME_LABEL[o.outcome as CallOutcome] ?? o.outcome, value: o.n }))} emptyText="No calls in this period." />
        </Card>
      </div>

      {!rep && (
        <Card title="By salesperson" description="What each person did in this period. Click a name for their full report." className="mb-6" bodyClassName="p-0">
          {data.people.length === 0 ? <div className="p-5"><EmptyState>No users.</EmptyState></div> : (
            <div className="overflow-x-auto">
              <table className="table-base text-[13px] [&_td]:align-middle [&_th]:align-bottom [&_th]:leading-tight [&_th]:whitespace-normal" data-testid="report-people">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th className="text-right">Calls</th>
                    <th className="text-right">Conver&shy;sations</th>
                    <th className="text-right">Interested</th>
                    <th className="text-right">No answer</th>
                    <th className="text-right">Not<br />interested</th>
                    <th className="text-right">WhatsApp sent<br />/ to send</th>
                    <th className="text-right">WhatsApp<br />pending</th>
                    <th className="text-right">Emails sent</th>
                    <th className="text-right">Deals won</th>
                    <th className="text-right">Shops called</th>
                    <th>Last call</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {data.people.map((r) => (
                    <tr key={r.id} className={r.active ? "hover:bg-surface-2/60" : "text-subtle"}>
                      <td className="whitespace-nowrap">
                        <Link href={`/reports?${q({ rep: r.id })}`} className="font-medium text-fg hover:text-brand-fg">{r.full_name}</Link>
                        {!r.active && " (inactive)"}
                        {r.role === "admin" && <span className="ml-1 text-xs text-subtle">admin</span>}
                      </td>
                      <td className="text-right font-medium">{r.calls}</td>
                      <td className="text-right">{r.connects} <span className="text-xs text-subtle">{percent(r.connects, r.calls)}</span></td>
                      <td className="text-right">{r.interested}</td>
                      <td className="text-right">{r.no_reach}</td>
                      <td className="text-right">{r.not_interested}</td>
                      <td className="text-right">{r.followups_done} <span className="text-xs text-subtle">/ {r.followups_scheduled}</span></td>
                      <td className={`text-right ${r.overdue ? "font-medium text-amber-500" : ""}`}>{r.overdue}</td>
                      <td className="text-right">{r.emails_sent}</td>
                      <td className="text-right">{r.deals_won}{r.won_value_cents ? <span className="ml-1 text-xs text-subtle">{money(r.won_value_cents)}</span> : null}</td>
                      <td className="text-right">{r.leads_worked}</td>
                      <td className="whitespace-nowrap text-xs text-muted">{r.last_call_at ? when(r.last_call_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Products" description="Calls in this period that showed interest or a sale">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-muted"><tr><th className="pb-2 text-left font-medium">Product</th><th className="pb-2 pl-3 text-right font-medium">Interest</th><th className="pb-2 pl-3 text-right font-medium">Sale</th><th className="pb-2 pl-3 text-right font-medium">Deals won</th></tr></thead>
            <tbody className="divide-y divide-line">
              {(["pos", "wholesale"] as Product[]).map((p) => {
                const row = data.products.find((x) => x.product === p);
                return (
                  <tr key={p}>
                    <td className="py-1.5">{PRODUCT_LABEL[p]}</td>
                    <td className="py-1.5 text-right">{p === "pos" ? t.pos_interest : t.wholesale_interest}</td>
                    <td className="py-1.5 text-right">{p === "pos" ? t.pos_bought : t.wholesale_bought}</td>
                    <td className="py-1.5 text-right">{rep ? "—" : row?.deals_won ?? 0}</td>
                  </tr>
                );
              })}
              {!rep && (
                <tr>
                  <td className="py-1.5 text-muted">Deals for both</td>
                  <td className="py-1.5 text-right text-subtle">—</td>
                  <td className="py-1.5 text-right text-subtle">—</td>
                  <td className="py-1.5 text-right">{data.products.find((x) => x.product === "both")?.deals_won ?? 0}</td>
                </tr>
              )}
            </tbody>
          </table>
          {!rep && (
            <p className="mt-3 text-xs text-muted">
              Shops interested now: {data.products.filter((x) => x.product !== "both").map((x) => `${PRODUCT_SHORT[x.product as Product]} ${x.interested}`).join(" · ")}
              {" "}· bought: {data.products.filter((x) => x.product !== "both").map((x) => `${PRODUCT_SHORT[x.product as Product]} ${x.bought}`).join(" · ")}
            </p>
          )}
        </Card>
        <Card title="Deals by stage" description={rep ? "Their deals, as of now" : "All deals, as of now"}>
          <BarList
            rows={DEAL_STAGES.map((s) => {
              const row = data.stages.find((x) => x.stage === s);
              return { label: stageLabel(s as DealStage), value: row?.n ?? 0, hint: row?.value_cents ? money(Number(row.value_cents)) : undefined };
            })}
            emptyText="No deals yet."
          />
        </Card>
        <Card title="Leads by status" description={rep ? "Their leads, as of now" : "All leads, as of now"}>
          <BarList rows={LEAD_STATUSES.map((s) => ({ label: LEAD_STATUS_LABEL[s as LeadStatus], value: data.statuses.find((x) => x.status === s)?.n ?? 0 }))} emptyText="No leads yet." />
        </Card>
      </div>

      <Card id="call-log" title="Call log" description={`${plural(t.calls, "call")} in this period${t.calls > calls.length ? ` · latest ${calls.length} shown; the PDF lists them all` : ""}`} actions={showAll(calls.length, t.calls)} className="mb-6" bodyClassName="p-0">
        {calls.length === 0 ? <div className="p-5"><EmptyState icon="phone">No calls in this period.</EmptyState></div> : (
          <div className="overflow-x-auto">
            <table className="table-base [&_td]:align-top" data-testid="report-calls">
              <thead><tr><th>When</th><th>Shop</th><th>Result</th>{!rep && <th>By</th>}<th>Next step / notes</th><th>Products</th></tr></thead>
              <tbody>
                {calls.map((c, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap text-muted tabular-nums">{when(c.occurred_at)}</td>
                    <td className="min-w-40"><Link href={`/leads/${c.lead_id}`} className="font-medium text-fg hover:text-brand-fg">{c.company}</Link><div className="text-xs text-muted">{[c.city, c.state].filter(Boolean).join(", ")}</div></td>
                    <td className="whitespace-nowrap"><OutcomeBadge outcome={c.outcome} />{c.duration_seconds ? <div className="mt-0.5 text-xs text-muted">{duration(c.duration_seconds)}</div> : null}</td>
                    {!rep && <td className="whitespace-nowrap">{c.user_name ?? "—"}</td>}
                    <td className="max-w-md">
                      {c.next_step && <div className="text-xs font-medium text-success-fg">Next: {c.next_step}</div>}
                      {c.notes ? <div className="line-clamp-2 text-xs text-muted" title={c.notes}>{c.notes}</div> : !c.next_step && <span className="text-subtle">—</span>}
                    </td>
                    <td><span className="flex flex-wrap gap-1"><ProductPills interested={c.interested_in} bought={c.bought} /></span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="WhatsApp to send" description={`${plural(t.followups_scheduled, "WhatsApp")} to send in this period`} actions={showAll(followups.length, t.followups_scheduled)} bodyClassName="p-0">
          {followups.length === 0 ? <div className="p-5"><EmptyState icon="whatsapp">None in this period.</EmptyState></div> : (
            <ul className="divide-y divide-line text-sm">
              {followups.map((f, i) => {
                const isPending = f.status === "pending";
                return (
                  <li key={i} className="flex items-start justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/leads/${f.lead_id}`} className="font-medium text-fg hover:text-brand-fg">{f.company}</Link>
                        {f.phone && <span className="text-xs text-muted tabular-nums">{formatPhone(f.phone)}</span>}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {!rep && f.created_by_name ? `by ${f.created_by_name} · ` : ""}
                        {f.notes || "WhatsApp to send"}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2 text-right text-xs">
                      <div className="text-right">
                        <div className="tabular-nums text-fg-2">{when(f.created_at)}</div>
                        <div className={isPending ? "text-amber-500 font-medium" : f.status === "done" ? "text-success-fg" : "text-muted"}>
                          {f.status === "pending" ? "Pending" : f.status === "done" ? "Done" : "Cancelled"}
                        </div>
                      </div>
                      {f.phone && isPending && (
                        <a
                          href={`https://wa.me/${f.phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost btn-sm text-success-fg hover:bg-success/10 flex items-center gap-1 py-1 px-2"
                          title="Open WhatsApp chat"
                        >
                          <Icon name="whatsapp" className="size-3.5" />
                          Send
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Deals won" description={`${plural(t.deals_won, "deal")} · ${money(t.won_value_cents)}`} bodyClassName="p-0">
          {data.deals.length === 0 ? <div className="p-5"><EmptyState icon="handshake">No deals won in this period.</EmptyState></div> : (
            <ul className="divide-y divide-line text-sm">
              {data.deals.map((d, i) => (
                <li key={i} className="flex items-start justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/leads/${d.lead_id}`} className="font-medium text-fg hover:text-brand-fg">{d.company}</Link>
                    <div className="truncate text-xs text-muted">{d.title} · {d.product ? PRODUCT_SHORT[d.product as Product] : "Both products"}{!rep && d.owner_name ? ` · ${d.owner_name}` : ""}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs"><div className="font-medium text-fg tabular-nums">{money(d.value_cents)}</div><div className="text-muted">{when(d.closed_at)}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Kpis({ t }: { t: Activity }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" data-testid="report-kpis">
      <Stat icon="phone" label="Calls made" value={t.calls} hint={t.talk_seconds > 0 ? `${plural(t.leads_worked, "shop")} · ${duration(t.talk_seconds)} talk time` : `${plural(t.leads_worked, "unique shop")} contacted`} />
      <Stat icon="users" label="Conversations" value={t.connects} hint={`${percent(t.connects, t.calls)} of calls reached someone`} tone="brand" />
      <Stat icon="star" label="Interested" value={t.interested} hint={`${t.not_interested} not interested · ${t.no_reach} no answer`} tone="green" />
      <Stat icon="whatsapp" label="Whatsapp Message Sent" value={t.followups_done} hint={`${t.whatsapp_to_send} ready in WhatsApp to send`} tone="green" />
      <Stat icon="clock" label="Pending WhatsApp" value={t.whatsapp_to_send} hint="As of now" tone={t.whatsapp_to_send ? "amber" : "slate"} />
      <Stat icon="mail" label="Emails sent" value={t.emails_sent} hint={`${t.emails_to_send} ready in Emails to send`} tone="sky" />
      <Stat icon="leads" label="Leads added" value={t.leads_added} hint={`${t.leads_owned} owned in total`} />
    </div>
  );
}
