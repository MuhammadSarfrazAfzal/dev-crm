import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { countLeads, parseLeadFilters } from "@/server/leads";

/** Lead count for the filters in the query string, under RLS; used by the filter panel. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const f = parseLeadFilters(Object.fromEntries(request.nextUrl.searchParams), user);
  const total = await asUser(user.id, (tx) => countLeads(tx, user, f));
  return NextResponse.json({ total }, { headers: { "cache-control": "no-store" } });
}
