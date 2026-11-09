import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current";
import { getRealtimeToken } from "@/lib/auth/supabase-session";
import { supabaseConfig, usesSupabaseAuth } from "@/lib/supabase/config";

/**
 * How the browser should listen for live changes. With Supabase: the project URL, the
 * public anon key and an access token (or anon key).
 * Otherwise the local event stream at /api/live.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const cfg = supabaseConfig();
  if (cfg) {
    const t = usesSupabaseAuth() ? await getRealtimeToken(user.id) : null;
    const clientPublicKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.SUPABASE_PUBLISHABLE_KEY ??
      cfg.anonKey;
    return NextResponse.json(
      {
        mode: "supabase",
        url: cfg.url,
        anonKey: clientPublicKey,
        accessToken: t?.accessToken ?? clientPublicKey,
        expiresAt: t?.expiresAt ?? Math.floor(Date.now() / 1000) + 86400,
      },
      { headers: { "cache-control": "no-store" } }
    );
  }
  return NextResponse.json({ mode: "local" }, { headers: { "cache-control": "no-store" } });
}
