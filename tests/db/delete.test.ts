import { describe, expect, it } from "vitest";
import { db, tryAsUser, userId } from "./helpers";

describe("deleting leads", () => {
  it("an admin deletes a shop with everything attached, and it is audited", async () => {
    const admin = await userId("admin@example.com");
    const out = await tryAsUser(admin, async (tx) => {
      // A busy lead: calls, follow-ups, emails, deals, notes, contacts and a document.
      const [lead] = await tx`select l.id, l.company_id from leads l where exists (select 1 from call_activities a where a.lead_id = l.id)
        and exists (select 1 from followups f where f.lead_id = l.id) order by l.call_attempts desc limit 1`;
      await tx`insert into notes (lead_id, user_id, body) values (${lead.id}, ${admin}, 'to be deleted')`;
      await tx`insert into documents (lead_id, storage_key, filename, uploaded_by) values (${lead.id}, ${"00000000-0000-4000-8000-000000000000.pdf"}, 'x.pdf', ${admin})`;
      const count = async () => {
        const [c] = await tx`select
          (select count(*)::int from companies where id = ${lead.company_id}) as companies,
          (select count(*)::int from leads where company_id = ${lead.company_id}) as leads,
          (select count(*)::int from contacts where company_id = ${lead.company_id}) as contacts,
          (select count(*)::int from call_activities where lead_id = ${lead.id}) as calls,
          (select count(*)::int from followups where lead_id = ${lead.id}) as followups,
          (select count(*)::int from notes where lead_id = ${lead.id}) as notes,
          (select count(*)::int from documents where lead_id = ${lead.id}) as documents,
          (select count(*)::int from sales_opportunities where lead_id = ${lead.id}) as deals,
          (select count(*)::int from email_activities where lead_id = ${lead.id}) as emails`;
        return c;
      };
      const before = await count();
      const res = await tx`select company_id, storage_keys from app.delete_companies(${[lead.company_id]}::uuid[])`;
      const after = await count();
      const [audit] = await tx`select action, details from audit_logs where entity_id = ${lead.company_id} and action = 'company.deleted'`;
      return { before, after, res, audit };
    });
    expect(out.before.calls).toBeGreaterThan(0);
    expect(out.before.followups).toBeGreaterThan(0);
    expect(Object.values(out.after).every((n) => n === 0)).toBe(true);
    expect(out.res[0].storage_keys).toEqual(["00000000-0000-4000-8000-000000000000.pdf"]);
    expect(out.audit.details.calls).toBe(out.before.calls);
    expect(out.audit.details.followups).toBe(out.before.followups);
  });

  it("a salesperson cannot delete, not even their own leads", async () => {
    const sam = await userId("sam@example.com");
    const [lead] = await db.sql`select l.company_id from leads l where l.owner_id = ${sam} limit 1`;
    await expect(tryAsUser(sam, (tx) => tx`select * from app.delete_companies(${[lead.company_id]}::uuid[])`)).rejects.toThrow(/only an admin/);
    await expect(tryAsUser(sam, (tx) => tx`delete from leads where company_id = ${lead.company_id} returning id`)).resolves.toHaveLength(0);
  });
});
