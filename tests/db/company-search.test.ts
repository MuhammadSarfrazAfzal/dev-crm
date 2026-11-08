import { beforeAll, describe, expect, it } from "vitest";
import { listCompanies, parseCompanyFilters } from "@/server/companies";
import { tryAsUser, userId } from "./helpers";

let admin: string;
const search = (sp: Record<string, string>) => tryAsUser(admin, (tx) => listCompanies(tx, parseCompanyFilters(sp)));

beforeAll(async () => {
  admin = await userId("admin@example.com");
});

describe("company search", () => {
  it("is case-insensitive on names and cities", async () => {
    const a = await search({ q: "METRO" });
    expect(a.total).toBeGreaterThan(0);
    expect((await search({ q: "metro" })).total).toBe(a.total);
    expect((await search({ q: "CHICAGO" })).total).toBe((await search({ q: "chicago" })).total);
  });

  it("finds phones from three digits, with or without punctuation", async () => {
    const plain = await search({ q: "312" });
    expect(plain.total).toBeGreaterThan(0);
    expect((await search({ q: "(312)" })).total).toBe(plain.total);
  });

  it("combines search with state", async () => {
    const il = await search({ q: "metro", state: "IL" });
    expect(il.rows.every((r) => r.state === "IL")).toBe(true);
  });
});
