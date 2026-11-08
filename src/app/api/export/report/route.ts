import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { limits } from "@/lib/rate-limit";
import { PERIODS, periodRange, repReport, type Period } from "@/server/reports";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  if (!limits.export.check(`export:${user.id}`).ok) return NextResponse.json({ error: "Too many exports" }, { status: 429 });
  const sp = request.nextUrl.searchParams;
  const period: Period = (sp.get("period") ?? "") in PERIODS ? (sp.get("period") as Period) : "7d";
  const rows = await asUser(user.id, async (tx) => {
    const rows = await repReport(tx, periodRange(period, user.usTimeZone).since);
    await tx`select app.log_audit('export.report', 'reports', null, ${tx.json({ period, count: rows.length })})`;
    return rows;
  });
  const csv = toCsv(
    ["Person", "Role", "Active", "Leads", "Not called", "Calls", "Connects", "Interested", "Emails sent", "Pending WhatsApp", "Deals won", "Won value (USD)"],
    rows.map((r) => [r.full_name, r.role, r.active ? "yes" : "no", r.leads, r.not_called, r.calls, r.connects, r.interested, r.emails_sent, r.overdue, r.deals_won, (Number(r.won_value_cents) / 100).toFixed(2)]),
  );
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="sales-report-${period}.csv"`, "cache-control": "no-store" },
  });
}
