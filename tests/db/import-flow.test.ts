import { beforeAll, describe, expect, it } from "vitest";
import { testUrl } from "./global-setup";
import { db, userId } from "./helpers";
import type { CurrentUser } from "@/lib/auth/current";

// The app's db module reads DATABASE_URL when first imported, so point it at the test db first.
process.env.DATABASE_URL = testUrl();
process.env.UPLOAD_DIR = ".local/test-uploads";
const { createImport, approveImport, ImportError } = await import("@/server/imports");
const appDb = await import("@/lib/db");

let sam: CurrentUser;
let riley: CurrentUser;

beforeAll(async () => {
  sam = { id: await userId("sam@example.com"), email: "sam@example.com", fullName: "Sam Rivera", role: "salesperson", timeZone: "America/New_York", usTimeZone: "America/New_York", profileTimeZone: "America/New_York", view: "usa" };
  riley = { id: await userId("riley@example.com"), email: "riley@example.com", fullName: "Riley Chen", role: "salesperson", timeZone: "America/Los_Angeles", usTimeZone: "America/Los_Angeles", profileTimeZone: "America/Los_Angeles", view: "usa" };
});

describe("import pipeline against the database", () => {
  it("previews pasted text, flags duplicates and approves only new shops", async () => {
    const [rileyCompany] = await db.sql`select c.name, c.phones -> 0 ->> 'e164' as phone from leads l join companies c on c.id = l.company_id
      where l.owner_id = ${riley.id} and c.suppression = 'none' limit 1`;
    const text = [
      "Ridge Mobile Repair - Denver, CO - (720) 555-0190 - owner@ridge.example.com",
      "Pine Street Phones | Portland, OR | 503-555-0191",
      `${rileyCompany.name} | ${rileyCompany.phone}`,
      "Pine Street Phones | Portland, OR | 503-555-0191",
    ].join("\n");

    const importId = await createImport({ user: sam, assignTo: sam.id, text });
    const rows = await db.sql`select row_index, normalized, issues, decision, duplicate_of_company, duplicate_of_lead
      from import_rows where import_id = ${importId} order by row_index`;
    expect(rows).toHaveLength(4);
    expect(rows[0].decision).toBe("include");
    expect(rows[0].normalized.time_zone).toBe("America/Denver");
    expect(rows[2].issues).toContain("duplicate_existing");
    expect(rows[2].decision).toBe("skip");
    expect(rows[3].issues).toContain("duplicate_in_file");

    // Nothing is created before approval.
    const [{ n: before }] = await db.sql`select count(*)::int as n from leads where import_id = ${importId}`;
    expect(before).toBe(0);

    // Sam forces the duplicate in; it still can't be attached to Riley's shop.
    await db.sql`update import_rows set decision = 'include' where import_id = ${importId} and row_index = 3`;
    const result = await appDb.asUser(sam.id, (tx) => approveImport(tx, sam, importId, sam.id));
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);

    const leads = await db.sql`select l.owner_id, l.import_id, c.import_id as company_import from leads l join companies c on c.id = l.company_id where l.import_id = ${importId}`;
    expect(leads).toHaveLength(2);
    expect(leads.every((l) => l.owner_id === sam.id && l.company_import === importId)).toBe(true);
    const [imp] = await db.sql`select status, approved_count, approved_by from imports where id = ${importId}`;
    expect(imp).toMatchObject({ status: "approved", approved_count: 2, approved_by: sam.id });
    const audit = await db.sql`select action from audit_logs where entity_id = ${importId} order by id`;
    expect(audit.map((a) => a.action)).toEqual(["import.created", "import.approved"]);

    await expect(appDb.asUser(sam.id, (tx) => approveImport(tx, sam, importId, sam.id))).rejects.toBeInstanceOf(ImportError);
    // Another rep can't see the import at all.
    await expect(appDb.asUser(riley.id, (tx) => approveImport(tx, riley, importId, riley.id))).rejects.toThrow(/not found/i);
  });

  it("rejects unusable input with a clear message", async () => {
    await expect(createImport({ user: sam, assignTo: sam.id, text: "hello there" })).rejects.toThrow(/No businesses/);
    await expect(createImport({ user: sam, assignTo: sam.id, file: { name: "x.png", data: new TextEncoder().encode("nope") } })).rejects.toThrow(/match/);
  });
});
