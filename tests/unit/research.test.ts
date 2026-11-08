import { describe, expect, it } from "vitest";
import { applyMapping, suggestMapping } from "@/lib/import/columns";
import { normalizeRow } from "@/lib/import/normalize";
import { resultsToTable, RESEARCH_HEADERS } from "@/lib/research/handoff";
import { getResearchProvider, ProviderNotConnectedError, RESEARCH_PROVIDERS } from "@/lib/research/providers";

describe("research providers", () => {
  it("all ship disabled and refuse to run", async () => {
    expect(RESEARCH_PROVIDERS.length).toBeGreaterThanOrEqual(3);
    for (const p of RESEARCH_PROVIDERS) {
      expect(p.enabled).toBe(false);
      await expect(p.run({ mode: "area", query: "phone repair", location: "Houston, TX", fields: ["phones"], maxResults: 5 })).rejects.toBeInstanceOf(ProviderNotConnectedError);
    }
    expect(getResearchProvider("openai-codex")?.label).toBe("Codex");
    expect(getResearchProvider("nope")).toBeUndefined();
  });
});

describe("research results handoff", () => {
  const table = resultsToTable([
    { company: "Example Phone Repair", contactName: "Jordan Lee", title: "Owner", phones: ["(713) 555-0142", "713-555-0143"], emails: ["Owner@Example.com"],
      address: "100 Main St", city: "Houston", state: "Texas", postalCode: "77002", website: "https://example.com", socials: ["facebook.com/example"], sourceUrl: "https://example.com/contact" },
    { company: "  " },
  ]);

  it("drops rows without a name and keeps every field in its own column", () => {
    expect(table.headers).toEqual([...RESEARCH_HEADERS]);
    expect(table.rows).toHaveLength(1);
  });

  it("maps onto CRM fields like a spreadsheet would", () => {
    const mapping = suggestMapping(table.headers);
    expect(mapping).toMatchObject({ Company: "company", Contact: "contact_name", Title: "title", Phone: "phone", Email: "email", Website: "website",
      Address: "address", City: "city", State: "state", ZIP: "postal_code", Source: "source", Notes: "notes" });
    const cells = Object.fromEntries(table.headers.map((h, i) => [h, table.rows[0][i]]));
    const { row } = normalizeRow(applyMapping(cells, mapping));
    expect(row.phones.map((p) => p.e164)).toEqual(["+17135550142", "+17135550143"]);
    expect(row.emails.map((e) => e.address)).toEqual(["owner@example.com"]);
    expect(row).toMatchObject({ company: "Example Phone Repair", contact_name: "Jordan Lee", state: "TX", postal_code: "77002", city: "Houston" });
  });
});
