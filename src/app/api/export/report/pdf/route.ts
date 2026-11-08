import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { isUuid } from "@/lib/params";
import { limits } from "@/lib/rate-limit";
import { reportPdf } from "@/server/report-pdf";
import { loadReport, PERIODS, type Period } from "@/server/reports";

export const dynamic = "force-dynamic";

/** The Reports page for the chosen period (and person) as a PDF to share. Admins only. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  if (!limits.export.check(`export:${user.id}`).ok) return NextResponse.json({ error: "Too many exports" }, { status: 429 });
  const sp = request.nextUrl.searchParams;
  const period: Period = (sp.get("period") ?? "") in PERIODS ? (sp.get("period") as Period) : "7d";
  const rep = isUuid(sp.get("rep")) ? sp.get("rep") : null;
  const { report, repName } = await asUser(user.id, async (tx) => {
    const report = await loadReport(tx, period, user.usTimeZone, { rep, details: true });
    await tx`select app.log_audit('export.report_pdf', 'reports', null, ${tx.json({ period, rep })})`;
    return { report, repName: rep ? report.people[0]?.full_name ?? "Unknown" : null };
  });
  const pdf = await reportPdf(report, { preparedFor: user.fullName, repName });
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: user.usTimeZone }).format(report.range.until);
  const who = repName ? `-${repName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="sales-report-${period}${who}-${day}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
