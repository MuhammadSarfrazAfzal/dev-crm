import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { asService } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const [row] = await asService(async (tx) => {
      return await tx`
        SELECT
          greatest(
            (select coalesce(max(occurred_at), '1970-01-01'::timestamptz) from call_activities),
            (select coalesce(max(created_at), '1970-01-01'::timestamptz) from leads),
            (select coalesce(max(coalesce(completed_at, created_at)), '1970-01-01'::timestamptz) from followups),
            (select coalesce(max(occurred_at), '1970-01-01'::timestamptz) from email_activities),
            (select coalesce(max(created_at), '1970-01-01'::timestamptz) from companies)
          ) as v;
      `;
    });

    const v = row?.v ? new Date(row.v).getTime() : 0;
    return NextResponse.json(
      { v },
      { headers: { "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate" } }
    );
  } catch (err) {
    return NextResponse.json(
      { v: Date.now() },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
