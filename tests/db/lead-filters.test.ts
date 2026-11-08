import { beforeAll, describe, expect, it } from "vitest";
import { filtersToQuery, listLeads, parseLeadFilters } from "@/server/leads";
import { tryAsUser, userId } from "./helpers";

let admin: string;
const user = (id: string) => ({ id, email: "admin@example.com", fullName: "Admin", role: "admin" as const, timeZone: "America/Chicago", usTimeZone: "America/Chicago", profileTimeZone: "America/Chicago", view: "usa" as const });
const run = (sp: Record<string, string>) => tryAsUser(admin, (tx) => listLeads(tx, user(admin), parseLeadFilters(sp, { id: admin })));
const all = async (sp: Record<string, string>) => {
  const first = await run(sp);
  const rows = [...first.rows];
  for (let page = 2; page <= first.pages; page++) rows.push(...(await run({ ...sp, page: String(page) })).rows);
  return { total: first.total, rows };
};

beforeAll(async () => {
  admin = await userId("admin@example.com");
});

describe("lead filters", () => {
  it("multi-select is OR within a filter", async () => {
    const fresh = (await run({ status: "new" })).total;
    const working = (await run({ status: "working" })).total;
    expect((await run({ status: "new,working" })).total).toBe(fresh + working);
  });

  it("combines filters with AND", async () => {
    const both = await all({ product: "pos", attempts: "2" });
    expect(both.total).toBeGreaterThan(0);
    expect(both.rows.every((r) => r.interested_in.includes("pos") && r.call_attempts === 2)).toBe(true);
  });

  it("product filters: interested, bought and no interest yet", async () => {
    const total = (await run({})).total;
    const none = await all({ product: "none" });
    expect(none.rows.every((r) => r.interested_in.length === 0)).toBe(true);
    const some = await all({ product: "pos,wholesale" });
    expect(some.rows.every((r) => r.interested_in.length > 0)).toBe(true);
    expect(none.total + some.total).toBe(total);
    const bought = await all({ product: "bought_pos,bought_wholesale" });
    expect(bought.total).toBeGreaterThan(0);
    expect(bought.rows.every((r) => r.bought.length > 0 && r.bought.every((p) => r.interested_in.includes(p)))).toBe(true);
  });

  it("attempts buckets and follow-up buckets partition the leads", async () => {
    const total = (await run({})).total;
    const byAttempts = await Promise.all(["0", "1", "2", "3+"].map((a) => run({ attempts: a })));
    expect(byAttempts.reduce((s, r) => s + r.total, 0)).toBe(total);
    const byFollowup = await Promise.all(["overdue", "today", "upcoming", "none"].map((x) => run({ followup: x })));
    expect(byFollowup.reduce((s, r) => s + r.total, 0)).toBe(total);
  });

  it("deal stage 'none' finds leads without a deal, 'won' finds won deals", async () => {
    const won = await all({ stage: "won" });
    const none = (await run({ stage: "none" })).total;
    expect(won.total).toBeGreaterThan(0);
    expect(none).toBeGreaterThan(0);
    expect((await run({ stage: "won,none" })).total).toBe(won.total + none);
  });

  it("owner none, suppression and state work", async () => {
    const unassigned = await all({ owner: "none" });
    expect(unassigned.rows.every((r) => r.owner_id === null)).toBe(true);
    const dnc = await all({ suppression: "do_not_call,do_not_contact" });
    expect(dnc.rows.every((r) => ["do_not_call", "do_not_contact"].includes(r.suppression))).toBe(true);
    const il = await all({ state: "IL" });
    expect(il.rows.every((r) => r.state === "IL")).toBe(true);
  });

  it("date ranges use the user's own calendar day", async () => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
    expect((await run({ created_from: today, created_to: today })).total).toBe((await run({})).total);
    expect((await run({ created_to: "2020-01-01" })).total).toBe(0);
  });

  it("old dashboard links land on the matching filters", () => {
    const f = parseLeadFilters({ called: "no", interest: "interested", stage: "open" });
    expect(f.attempts).toEqual(["0"]);
    expect(f.interest.sort()).toEqual(["hot", "interested"]);
    expect(f.stage).toContain("negotiation");
    expect(new URLSearchParams(filtersToQuery(f)).get("attempts")).toBe("0");
  });

  it("ignores values that aren't real", () => {
    const f = parseLeadFilters({ status: "new,bogus", product: "pos,x", owner: "not-a-uuid" });
    expect(f.status).toEqual(["new"]);
    expect(f.product).toEqual(["pos"]);
    expect(f.owner).toEqual([]);
  });
});

describe("filter counts", () => {
  it("each option's count equals the leads that option would show", async () => {
    const { leadFacets } = await import("@/server/leads");
    const facets = await tryAsUser(admin, (tx) => leadFacets(tx, user(admin), parseLeadFilters({ product: "pos" }, { id: admin })));
    // Products ignores its own selection, so every product option is offered with its count.
    for (const opt of facets.product) {
      expect((await run({ product: opt.value })).total).toBe(opt.count);
    }
    for (const opt of facets.status) {
      expect((await run({ product: "pos", status: opt.value })).total).toBe(opt.count);
    }
    expect(facets.attempts.reduce((s, o) => s + o.count, 0)).toBe((await run({ product: "pos" })).total);
  });
});
