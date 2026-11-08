import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { exportLeads, parseLeadFilters } from "@/server/leads";
import { toCsv } from "@/lib/csv";
import { limits } from "@/lib/rate-limit";
import { PRODUCT_LABEL, EMAIL_STATUS_LABEL, INTEREST_LABEL, LEAD_STATUS_LABEL, OUTCOME_LABEL, HIDDEN_CALL_OUTCOMES, type CallOutcome, type EmailStatus, type InterestLevel, type LeadStatus } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rl = limits.export.check(`export:${user.id}`);
  if (!rl.ok) return NextResponse.json({ error: "Too many exports, try again later" }, { status: 429, headers: { "retry-after": String(rl.retryAfterSeconds) } });

  const filters = parseLeadFilters(Object.fromEntries(request.nextUrl.searchParams));
  const rows = await asUser(user.id, async (tx) => {
    const rows = await exportLeads(tx, user, filters);
    await tx`select app.log_audit('export.leads', 'leads', null, ${tx.json({ count: rows.length, filters: { ...filters, page: undefined } })})`;
    return rows;
  });

  const csv = toCsv(
    ["Company", "Interested in", "Bought", "Contact", "Title", "Phone", "Email", "Website", "Address", "City", "State", "ZIP", "Source", "Area", "Owner", "Status", "Interest", "Call attempts", "Last outcome", "Last call (UTC)", "Next follow-up (UTC)", "Email status", "Suppression"],
    rows.map((r) => [
      r.company_name,
      r.interested_in.map((p) => PRODUCT_LABEL[p]).join("; "),
      r.bought.map((p) => PRODUCT_LABEL[p]).join("; "),
      r.contact_name,
      r.contact_title,
      formatPhone(r.phone),
      r.email,
      r.website,
      r.address,
      r.city,
      r.state,
      r.postal_code,
      r.source,
      r.tags.join("; "),
      r.owner_name ?? "Unassigned",
      LEAD_STATUS_LABEL[r.status as LeadStatus],
      INTEREST_LABEL[r.interest as InterestLevel],
      r.call_attempts,
      r.last_outcome && !HIDDEN_CALL_OUTCOMES.has(r.last_outcome) ? (OUTCOME_LABEL[r.last_outcome as CallOutcome] ?? "") : "",
      r.last_call_at,
      r.next_followup_at,
      EMAIL_STATUS_LABEL[r.email_status as EmailStatus],
      r.suppression,
    ]),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
