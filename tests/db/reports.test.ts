import { describe, expect, it } from "vitest";
import { startOfLocalDay } from "@/lib/time";
import { loadReport, periodRange } from "@/server/reports";
import { db, tryAsUser, userId } from "./helpers";

const TZ = "America/Chicago";

describe("reports", () => {
  it("Today starts at midnight USA time, not 24 hours ago", () => {
    const now = new Date("2026-10-27T20:00:00Z"); // 3:00 PM in Chicago
    expect(periodRange("today", TZ, now).since.toISOString()).toBe("2026-10-27T05:00:00.000Z");
    expect(periodRange("7d", TZ, now).since.toISOString()).toBe("2026-10-21T05:00:00.000Z");
    expect(periodRange("all", TZ, now).since.getTime()).toBe(0);
  });

  it("numbers match the underlying calls, follow-ups and deals for each period", async () => {
    const admin = await userId("admin@example.com");
    const sam = await userId("sam@example.com");
    const [lead] = await db.sql`select l.id from leads l join companies c on c.id = l.company_id where l.owner_id = ${sam} and c.suppression = 'none' limit 1`;
    const out = await tryAsUser(admin, async (tx) => {
      const midnight = startOfLocalDay(TZ);
      // Just after midnight today, and just before it (yesterday), plus a deal won today with no owner.
      await tx`insert into call_activities (lead_id, user_id, outcome, occurred_at) values (${lead.id}, ${admin}, 'agreed', ${new Date(midnight.getTime() + 60_000)})`;
      await tx`insert into call_activities (lead_id, user_id, outcome, occurred_at) values (${lead.id}, ${admin}, 'no_answer', ${new Date(midnight.getTime() - 60_000)})`;
      await tx`insert into sales_opportunities (lead_id, product, owner_id, title, stage, value_cents) values (${lead.id}, null, null, 'Both, no owner', 'won', 123400)`;
      const reports = Object.fromEntries(await Promise.all((["today", "7d", "30d", "all"] as const).map(async (p) => [p, await loadReport(tx, p, TZ, { details: true })])));
      const raw = Object.fromEntries(await Promise.all((["today", "7d", "30d", "all"] as const).map(async (p) => {
        const since = reports[p].range.since;
        const [r] = await tx`select (select count(*)::int from call_activities where occurred_at >= ${since}) as calls,
          (select count(*)::int from sales_opportunities where stage = 'won' and closed_at >= ${since}) as won,
          (select coalesce(sum(value_cents), 0)::bigint from sales_opportunities where stage = 'won' and closed_at >= ${since}) as value`;
        return [p, r];
      })));
      return { reports, raw, midnight };
    });
    for (const p of ["today", "7d", "30d", "all"] as const) {
      const r = out.reports[p];
      expect(r.totals.calls).toBe(out.raw[p].calls);
      expect(r.calls.length).toBe(out.raw[p].calls);
      expect(r.outcomes.reduce((s: number, o: { n: number }) => s + o.n, 0)).toBe(out.raw[p].calls);
      expect(r.totals.deals_won).toBe(out.raw[p].won);
      expect(r.totals.won_value_cents).toBe(Number(out.raw[p].value));
      expect(r.deals.length).toBe(out.raw[p].won);
      // Product rows (including "both") add up to the team's deals won.
      expect(r.products.reduce((s: number, x: { deals_won: number }) => s + x.deals_won, 0)).toBe(out.raw[p].won);
    }
    // Today has the call after midnight and the deal, but not the one just before midnight.
    expect(out.reports.today.calls.every((c: { occurred_at: Date }) => new Date(c.occurred_at) >= out.midnight)).toBe(true);
    expect(out.reports["7d"].totals.calls).toBeGreaterThan(out.reports.today.totals.calls);
    expect(out.reports.today.deals.some((d: { title: string }) => d.title === "Both, no owner")).toBe(true);
  });
});
