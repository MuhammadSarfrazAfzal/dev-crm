import { NextResponse } from "next/server";
import { nowMs } from "@/lib/clock";
import { syncServerClock } from "@/server/clock";

export const dynamic = "force-dynamic";

/** The trusted current time (UTC milliseconds), so browsers don't rely on the PC's clock. */
export async function GET() {
  await syncServerClock();
  return NextResponse.json({ now: nowMs() }, { headers: { "cache-control": "no-store" } });
}
