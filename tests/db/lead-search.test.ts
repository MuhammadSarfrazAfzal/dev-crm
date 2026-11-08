import { beforeAll, describe, expect, it } from "vitest";
import { listLeads, parseLeadFilters } from "@/server/leads";
import { tryAsUser, userId } from "./helpers";

let admin: string;
const user = (id: string) => ({ id, email: "admin@example.com", fullName: "Admin", role: "admin" as const, timeZone: "America/Chicago", usTimeZone: "America/Chicago", profileTimeZone: "America/Chicago", view: "usa" as const });
const search = (q: string) => tryAsUser(admin, (tx) => listLeads(tx, user(admin), parseLeadFilters({ q })));

beforeAll(async () => {
  admin = await userId("admin@example.com");
});

describe("lead search", () => {
  it("matches any part of the name, case-insensitively", async () => {
    const upper = await search("METRO");
    const lower = await search("metro");
    expect(upper.total).toBeGreaterThan(0);
    expect(lower.total).toBe(upper.total);
    expect(upper.rows.every((r) => /metro/i.test(`${r.company_name} ${r.contact_name ?? ""} ${r.city ?? ""} ${r.email ?? ""}`))).toBe(true);
  });

  it("finds phones from three digits, with or without punctuation", async () => {
    const plain = await search("312");
    const punct = await search("(312)");
    expect(plain.total).toBeGreaterThan(0);
    expect(punct.total).toBe(plain.total);
    expect(plain.rows.some((r) => r.phone?.includes("312"))).toBe(true);
  });

  it("finds emails and cities", async () => {
    expect((await search("example.com")).total).toBeGreaterThan(0);
    expect((await search("chicago")).total).toBeGreaterThan(0);
  });
});
