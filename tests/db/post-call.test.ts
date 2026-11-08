import { beforeAll, describe, expect, it } from "vitest";
import { db, tryAsUser, userId } from "./helpers";

let sam: string, riley: string;
let lead: { id: string };

beforeAll(async () => {
  sam = await userId("sam@example.com");
  riley = await userId("riley@example.com");
  [lead] = await db.sql`select l.id from leads l join companies c on c.id = l.company_id
    where l.owner_id = ${sam} and c.suppression = 'none' and l.status in ('new', 'working') limit 1`;
});

describe("post-call outcomes", () => {
  it("an agreed call qualifies the lead, marks it hot and keeps the next step in the log", async () => {
    const out = await tryAsUser(sam, async (tx) => {
      await tx`insert into call_activities (lead_id, user_id, outcome, next_step, notes) values (${lead.id}, ${sam}, 'agreed', 'Book a demo', 'Said yes')`;
      const [l] = await tx`select status, interest, last_outcome from leads where id = ${lead.id}`;
      const [c] = await tx`select next_step from call_activities where lead_id = ${lead.id} order by created_at desc limit 1`;
      return { l, c };
    });
    expect(out.l).toMatchObject({ status: "qualified", interest: "hot", last_outcome: "agreed" });
    expect(out.c.next_step).toBe("Book a demo");
  });

  it("the next step can't be changed afterwards", async () => {
    const after = await tryAsUser(sam, async (tx) => {
      const [c] = await tx`insert into call_activities (lead_id, user_id, outcome, next_step) values (${lead.id}, ${sam}, 'interested', 'Send pricing') returning id`;
      const updated = await tx`update call_activities set next_step = 'Something else' where id = ${c.id} returning id`;
      const [row] = await tx`select next_step from call_activities where id = ${c.id}`;
      return { updated: updated.length, next_step: row.next_step };
    });
    expect(after).toEqual({ updated: 0, next_step: "Send pricing" });
  });
});

describe("products on a lead", () => {
  const products = (tx: Parameters<Parameters<typeof tryAsUser>[1]>[0], id: string) =>
    tx`select interested_in::text[] as interested_in, bought::text[] as bought from leads where id = ${id}`.then((r) => r[0]);

  it("a company has one lead, offered both products", async () => {
    const [{ n }] = await db.sql`select count(*)::int as n from (select company_id from leads group by company_id having count(*) > 1) x`;
    expect(n).toBe(0);
  });

  it("calls add what the shop wants and bought; bought counts as interested", async () => {
    const out = await tryAsUser(sam, async (tx) => {
      await tx`update leads set interested_in = '{}', bought = '{}' where id = ${lead.id}`;
      await tx`insert into call_activities (lead_id, user_id, outcome, interested_in) values (${lead.id}, ${sam}, 'interested', '{wholesale}')`;
      const first = await products(tx, lead.id);
      await tx`insert into call_activities (lead_id, user_id, outcome, interested_in, bought) values (${lead.id}, ${sam}, 'agreed', '{wholesale}', '{pos}')`;
      return { first, second: await products(tx, lead.id) };
    });
    expect(out.first).toEqual({ interested_in: ["wholesale"], bought: [] });
    expect(out.second).toEqual({ interested_in: ["pos", "wholesale"], bought: ["pos"] });
  });

  it("the rep can correct them, and a won deal marks its product bought", async () => {
    const out = await tryAsUser(sam, async (tx) => {
      await tx`update leads set interested_in = '{pos,pos}', bought = '{}' where id = ${lead.id}`;
      const corrected = await products(tx, lead.id);
      await tx`insert into sales_opportunities (lead_id, product, owner_id, title, stage) values (${lead.id}, 'wholesale', ${sam}, 'First order', 'won')`;
      const won = await products(tx, lead.id);
      await tx`insert into sales_opportunities (lead_id, product, owner_id, title, stage) values (${lead.id}, null, ${sam}, 'Both', 'won')`;
      return { corrected, won, both: await products(tx, lead.id) };
    });
    expect(out.corrected).toEqual({ interested_in: ["pos"], bought: [] });
    expect(out.won).toEqual({ interested_in: ["pos", "wholesale"], bought: ["wholesale"] });
    expect(out.both).toEqual({ interested_in: ["pos", "wholesale"], bought: ["pos", "wholesale"] });
  });

  it("a second lead for the same company is refused", async () => {
    const [l] = await db.sql`select company_id from leads where id = ${lead.id}`;
    await expect(tryAsUser(sam, (tx) => tx`insert into leads (company_id, owner_id) values (${l.company_id}, ${sam})`)).rejects.toThrow(/duplicate key|unique/);
  });
});

describe("research requests", () => {
  it("are private to the person who saved them", async () => {
    const out = await tryAsUser(sam, async (tx) => {
      await tx`insert into research_requests (created_by, provider, mode, query, location, fields)
        values (${sam}, 'anthropic-claude', 'area', 'Phone repair', 'Austin, TX', ${["phones", "emails"]})`;
      return tx`select status from research_requests`;
    });
    expect(out.map((r) => r.status)).toEqual(["waiting_for_provider"]);
    const rileySees = await tryAsUser(riley, (tx) => tx`select id from research_requests`);
    expect(rileySees).toHaveLength(0);
  });

  it("cannot be saved for someone else", async () => {
    await expect(
      tryAsUser(sam, (tx) => tx`insert into research_requests (created_by, provider, mode, query) values (${riley}, 'custom', 'company', 'X')`),
    ).rejects.toThrow(/row-level security/);
  });
});
