import { beforeAll, describe, expect, it } from "vitest";
import { db, tryAsUser, userId } from "./helpers";

let admin: string, sam: string, riley: string;
let samLead: { id: string; company_id: string };
let rileyLead: { id: string; company_id: string };

beforeAll(async () => {
  admin = await userId("admin@example.com");
  sam = await userId("sam@example.com");
  riley = await userId("riley@example.com");
  [samLead] = await db.sql`select l.id, l.company_id from leads l join companies c on c.id = l.company_id
    where owner_id = ${sam} and c.suppression = 'none' limit 1`;
  [rileyLead] = await db.sql`select l.id, l.company_id from leads l join companies c on c.id = l.company_id
    where owner_id = ${riley} and c.suppression = 'none' limit 1`;
});

describe("leads visibility", () => {
  it("salespeople see only their own leads", async () => {
    const rows = await tryAsUser(sam, (tx) => tx`select owner_id from leads`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.owner_id === sam)).toBe(true);
  });

  it("admins see every lead, including unassigned ones", async () => {
    const [{ n }] = await db.sql`select count(*)::int as n from leads`;
    const rows = await tryAsUser(admin, (tx) => tx`select owner_id from leads`);
    expect(rows.length).toBe(n);
    expect(rows.some((r) => r.owner_id === null)).toBe(true);
  });

  it("a salesperson cannot read another rep's lead, company or activity", async () => {
    const out = await tryAsUser(sam, async (tx) => ({
      lead: await tx`select id from leads where id = ${rileyLead.id}`,
      calls: await tx`select id from call_activities where lead_id = ${rileyLead.id}`,
      company: await tx`select id from companies where id = ${rileyLead.company_id}
        and not exists (select 1 from leads where company_id = ${rileyLead.company_id} and owner_id = ${sam})`,
    }));
    expect(out.lead).toHaveLength(0);
    expect(out.calls).toHaveLength(0);
    expect(out.company).toHaveLength(0);
  });

  it("a salesperson cannot reassign a lead", async () => {
    await expect(
      tryAsUser(sam, (tx) => tx`update leads set owner_id = ${riley} where id = ${samLead.id}`),
    ).rejects.toThrow(/only an admin can reassign/);
  });

  it("a salesperson cannot take another rep's lead by updating it", async () => {
    const res = await tryAsUser(sam, (tx) => tx`update leads set status = 'qualified' where id = ${rileyLead.id} returning id`);
    expect(res).toHaveLength(0);
  });

  it("a salesperson cannot create a lead owned by someone else", async () => {
    await expect(
      tryAsUser(sam, async (tx) => {
        const [c] = await tx`insert into companies (name, created_by) values ('RLS Test Shop', ${sam}) returning id`;
        return tx`insert into leads (company_id, owner_id) values (${c.id}, ${riley})`;
      }),
    ).rejects.toThrow(/row-level security/);
  });

  it("an admin can reassign, and it is audited", async () => {
    const audit = await tryAsUser(admin, async (tx) => {
      await tx`update leads set owner_id = ${riley} where id = ${samLead.id}`;
      return tx`select actor_id, details from audit_logs where entity_id = ${samLead.id} and action = 'lead.assigned'`;
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_id).toBe(admin);
  });

  it("salespeople cannot fake lead counters", async () => {
    const [row] = await tryAsUser(sam, (tx) => tx`update leads set call_attempts = 99 where id = ${samLead.id} returning call_attempts`);
    expect(row.call_attempts).not.toBe(99);
  });
});

describe("activity history is append-only", () => {
  it("a salesperson can log a call on their own lead and counters update", async () => {
    const out = await tryAsUser(sam, async (tx) => {
      const [before] = await tx`select call_attempts from leads where id = ${samLead.id}`;
      await tx`insert into call_activities (lead_id, user_id, outcome, notes) values (${samLead.id}, ${sam}, 'voicemail', 'left message')`;
      const [after] = await tx`select call_attempts, last_outcome from leads where id = ${samLead.id}`;
      return { before, after };
    });
    expect(out.after.call_attempts).toBe(out.before.call_attempts + 1);
    expect(out.after.last_outcome).toBe("voicemail");
  });

  it("cannot log a call as someone else or on someone else's lead", async () => {
    await expect(
      tryAsUser(sam, (tx) => tx`insert into call_activities (lead_id, user_id, outcome) values (${samLead.id}, ${riley}, 'busy')`),
    ).rejects.toThrow(/row-level security/);
    await expect(
      tryAsUser(sam, (tx) => tx`insert into call_activities (lead_id, user_id, outcome) values (${rileyLead.id}, ${sam}, 'busy')`),
    ).rejects.toThrow(/row-level security/);
  });

  // No UPDATE/DELETE policy exists, so RLS filters every row out; the trigger is a
  // second wall for any path that has a policy or bypasses RLS without being a service.
  const changed = (p: Promise<readonly unknown[]>) => p.then((rows) => rows.length, () => 0);

  it("nobody can edit or delete call history, admins included", async () => {
    const [call] = await db.sql`select id, notes from call_activities limit 1`;
    for (const who of [sam, admin]) {
      expect(await changed(tryAsUser(who, (tx) => tx`update call_activities set notes = 'edited' where id = ${call.id} returning id`))).toBe(0);
      expect(await changed(tryAsUser(who, (tx) => tx`delete from call_activities where id = ${call.id} returning id`))).toBe(0);
    }
    const [after] = await db.sql`select notes from call_activities where id = ${call.id}`;
    expect(after.notes).toBe(call.notes);
  });

  it("notes and email logs are append-only too", async () => {
    expect(await changed(tryAsUser(admin, (tx) => tx`update email_activities set status = 'sent' returning id`))).toBe(0);
    expect(await changed(tryAsUser(admin, (tx) => tx`delete from notes returning id`))).toBe(0);
  });

  it("the immutability trigger blocks a role that has an update policy", async () => {
    await expect(
      db.sql.begin(async (tx) => {
        await tx`create temp table t_probe as select 1`; // keep the transaction non-empty
        await tx.unsafe("create policy probe_update on public.call_activities for update to authenticated using (true)");
        await tx.unsafe("set local role authenticated");
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: admin })}, true)`;
        await tx`update call_activities set notes = 'edited'`;
      }),
    ).rejects.toThrow(/append-only/);
  });
});

describe("suppression", () => {
  it("refuses a call log on a do-not-call company", async () => {
    const [dnc] = await db.sql`select l.id, l.owner_id from leads l join companies c on c.id = l.company_id
      where c.suppression = 'do_not_call' and l.owner_id is not null limit 1`;
    await expect(
      tryAsUser(dnc.owner_id, (tx) => tx`insert into call_activities (lead_id, user_id, outcome) values (${dnc.id}, ${dnc.owner_id}, 'busy')`),
    ).rejects.toThrow(/do-not-call/);
  });

  it("a do_not_call outcome suppresses the company and cancels call follow-ups", async () => {
    const out = await tryAsUser(sam, async (tx) => {
      await tx`insert into followups (lead_id, assigned_to, due_at, time_zone) values (${samLead.id}, ${sam}, now() + interval '1 day', 'America/Chicago')`;
      await tx`insert into call_activities (lead_id, user_id, outcome) values (${samLead.id}, ${sam}, 'do_not_call')`;
      const [company] = await tx`select suppression from companies where id = ${samLead.company_id}`;
      const pending = await tx`select id from followups where lead_id = ${samLead.id} and status = 'pending' and kind = 'call'`;
      const [lead] = await tx`select status, next_followup_at from leads where id = ${samLead.id}`;
      return { company, pending, lead };
    });
    expect(out.company.suppression).toBe("do_not_call");
    expect(out.pending).toHaveLength(0);
    expect(out.lead.status).toBe("unqualified");
    expect(out.lead.next_followup_at).toBeNull();
  });

  it("refuses a sent email to an opted-out company", async () => {
    await expect(
      tryAsUser(sam, async (tx) => {
        await tx`update companies set suppression = 'do_not_email' where id = ${samLead.company_id}`;
        return tx`insert into email_activities (lead_id, user_id, status) values (${samLead.id}, ${sam}, 'sent')`;
      }),
    ).rejects.toThrow(/do-not-email/);
  });

  it("a lead's primary contact must be at the same company", async () => {
    const [other] = await db.sql`select id from contacts where company_id <> ${samLead.company_id} limit 1`;
    await expect(tryAsUser(admin, (tx) => tx`update leads set primary_contact_id = ${other.id} where id = ${samLead.id}`)).rejects.toThrow(/primary contact/);
  });

  it("an email opt-out suppresses email", async () => {
    const out = await tryAsUser(sam, async (tx) => {
      await tx`insert into email_activities (lead_id, user_id, status) values (${samLead.id}, ${sam}, 'opted_out')`;
      const [company] = await tx`select suppression from companies where id = ${samLead.company_id}`;
      const [lead] = await tx`select email_status from leads where id = ${samLead.id}`;
      return { company, lead };
    });
    expect(out.company.suppression).toBe("do_not_email");
    expect(out.lead.email_status).toBe("opted_out");
  });
});

describe("profiles, scripts, imports and audit", () => {
  it("a salesperson cannot promote themselves", async () => {
    await expect(tryAsUser(sam, (tx) => tx`update profiles set role = 'admin' where id = ${sam}`)).rejects.toThrow(/only an admin/);
  });

  it("a salesperson can update their own time zone but not someone else's profile", async () => {
    const own = await tryAsUser(sam, (tx) => tx`update profiles set time_zone = 'America/Denver' where id = ${sam} returning id`);
    expect(own).toHaveLength(1);
    const other = await tryAsUser(sam, (tx) => tx`update profiles set full_name = 'x' where id = ${riley} returning id`);
    expect(other).toHaveLength(0);
  });

  it("salespeople read scripts but cannot publish them; admins can, with versioning", async () => {
    const read = await tryAsUser(sam, (tx) => tx`select id from scripts`);
    expect(read.length).toBeGreaterThan(0);
    await expect(
      tryAsUser(sam, (tx) => tx`select app.publish_script('pos-opening', 'pos', 'opening', 't', 'b')`),
    ).rejects.toThrow(/only an admin/);
    const versions = await tryAsUser(admin, async (tx) => {
      await tx`select app.publish_script('pos-opening', 'pos', 'opening', 'New title', 'New body')`;
      return tx`select version, is_current from scripts where script_key = 'pos-opening' order by version`;
    });
    expect(versions.map((v) => [v.version, v.is_current])).toEqual([[1, false], [2, true]]);
  });

  it("imports are private to the uploader and admins", async () => {
    const [imp] = await db.sql`insert into imports (uploaded_by, source_type) values (${sam}, 'csv') returning id`;
    try {
      expect(await tryAsUser(riley, (tx) => tx`select id from imports where id = ${imp.id}`)).toHaveLength(0);
      expect(await tryAsUser(sam, (tx) => tx`select id from imports where id = ${imp.id}`)).toHaveLength(1);
      expect(await tryAsUser(admin, (tx) => tx`select id from imports where id = ${imp.id}`)).toHaveLength(1);
    } finally {
      await db.sql`delete from imports where id = ${imp.id}`;
    }
  });

  it("only admins read the audit log and nobody writes it directly", async () => {
    expect(await tryAsUser(sam, (tx) => tx`select id from audit_logs`)).toHaveLength(0);
    expect((await tryAsUser(admin, (tx) => tx`select id from audit_logs`)).length).toBeGreaterThan(0);
    await expect(
      tryAsUser(admin, (tx) => tx`insert into audit_logs (action, entity) values ('fake', 'x')`),
    ).rejects.toThrow(/row-level security/);
  });

  it("anon can read nothing", async () => {
    await expect(
      db.sql.begin(async (tx) => {
        await tx.unsafe("set local role anon");
        return tx`select id from leads`;
      }),
    ).rejects.toThrow(/permission denied/);
  });

  it("deactivated users lose access", async () => {
    const rows = await db.sql.begin(async (tx) => {
      await tx`update profiles set active = false where id = ${riley}`;
      await tx.unsafe("set local role authenticated");
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: riley, role: "authenticated" })}, true)`;
      const r = await tx`select id from leads`;
      throw Object.assign(new Error("rollback"), { rows: r });
    }).catch((e) => e.rows);
    expect(rows).toHaveLength(0);
  });
});
