import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { asService } from "@/lib/db";

export const dynamic = "force-dynamic";

let cachedV = 0;
let lastCheckTime = 0;
const CACHE_TTL_MS = 3000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const now = Date.now();
  if (now - lastCheckTime < CACHE_TTL_MS) {
    return NextResponse.json(
      { v: cachedV },
      { headers: { "cache-control": "no-store, no-cache, must-revalidate" } }
    );
  }

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
    cachedV = v;
    lastCheckTime = now;

    return NextResponse.json(
      { v },
      { headers: { "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate" } }
    );
  } catch (err) {
    // Return last known cached value or 0 on error, never Date.now(), to prevent infinite router.refresh loops
    return NextResponse.json(
      { v: cachedV },
      { headers: { "cache-control": "no-store" } }
    );
  }
}
