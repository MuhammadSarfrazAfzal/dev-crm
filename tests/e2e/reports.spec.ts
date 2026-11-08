import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { getDocumentProxy } from "unpdf";
import { localDatabaseUrl } from "../../scripts/dbtools";
import { periodRange } from "../../src/lib/report-period";

const DB_URL = process.env.E2E_DATABASE_URL ?? localDatabaseUrl("salescrm_e2e");

async function pdfText(buf: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    text += `${content.items.map((x) => ("str" in x ? x.str : "")).join(" ")}\n`;
  }
  return { text, pages: pdf.numPages };
}

test("reports: each period's numbers match the data, on the page and in the PDF", async ({ page }) => {
  const sql = postgres(DB_URL, { max: 1, onnotice: () => {} });
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@example.com");
    await page.getByLabel("Password").fill("Admin123!demo");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Total leads")).toBeVisible();
    for (const period of ["today", "7d", "30d", "all"] as const) {
      const since = periodRange(period, "America/Chicago").since;
      const [raw] = await sql`select (select count(*)::int from call_activities where occurred_at >= ${since}) as calls,
        (select count(*)::int from followups where created_at >= ${since}) as followups,
        (select count(*)::int from sales_opportunities where stage = 'won' and closed_at >= ${since}) as won`;
      await page.goto(`/reports?period=${period}`);
      const kpis = page.getByTestId("report-kpis");
      await expect(kpis.getByText("Calls made").locator("..").locator("..")).toContainText(String(raw.calls));
      await expect(kpis.getByText("Whatsapp Message Sent").locator("..").locator("..")).toBeVisible();
      await expect(kpis.getByText("Emails sent").locator("..").locator("..")).toBeVisible();

      const res = await page.request.get(`/api/export/report/pdf?period=${period}`);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("application/pdf");
      expect(res.headers()["content-disposition"]).toContain(`sales-report-${period}-`);
      const { text } = await pdfText(Buffer.from(await res.body()));
      expect(text).toContain("Sales report");
      expect(text).toMatch(new RegExp(`Calls made\\s+${raw.calls}\\b`));
      expect(text).toContain("Whatsapp Message Sent");
      expect(text).toContain("USA time");
      expect(text).not.toContain("No deals won in this period");
    }

    // One person's report: the page and the PDF are about that person only.
    const [sam] = await sql`select id from profiles where email = 'sam@example.com'`;
    const [own] = await sql`select count(*)::int as calls from call_activities where user_id = ${sam.id}`;
    await page.goto(`/reports?period=all&rep=${sam.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Sam Rivera");
    await expect(page.getByTestId("report-kpis").getByText("Calls made").locator("..").locator("..")).toContainText(String(own.calls));
    const res = await page.request.get(`/api/export/report/pdf?period=all&rep=${sam.id}`);
    const { text } = await pdfText(Buffer.from(await res.body()));
    expect(text).toContain("Sam Rivera");
    expect(text).toMatch(new RegExp(`Calls made\\s+${own.calls}\\b`));
  } finally {
    await sql.end();
  }
});
