/**
 * Auth providers. `local` checks bcrypt hashes in the auth.users shim (same column as
 * Supabase); `supabase` asks Supabase Auth's password grant endpoint. Both return the
 * auth.users id, which is also the profiles id.
 */
import bcrypt from "bcryptjs";
import { asService } from "@/lib/db";
import { supabaseConfig } from "@/lib/supabase/config";
import { tokensFrom, type SupabaseTokens } from "./supabase-session";

export type AuthResult = { ok: true; userId: string; tokens?: SupabaseTokens } | { ok: false; reason: "invalid" | "inactive" | "unavailable" };

// Compared against when the email is unknown, so timing doesn't reveal which emails exist.
const DUMMY_HASH = "$2b$10$CwTycUXWue0Thq9StjUM0uJ8DPLKXt1FYlwYpaW3nB2J1vNnB0k1S";

async function localSignIn(email: string, password: string): Promise<AuthResult> {
  const rows = await asService(
    (tx) => tx`select u.id, u.encrypted_password, p.active
      from auth.users u join public.profiles p on p.id = u.id
      where lower(u.email) = lower(${email})`,
  );
  const row = rows[0];
  const ok = await bcrypt.compare(password, row?.encrypted_password ?? DUMMY_HASH);
  if (!row || !ok) return { ok: false, reason: "invalid" };
  if (!row.active) return { ok: false, reason: "inactive" };
  await asService((tx) => tx`update auth.users set last_sign_in_at = now() where id = ${row.id}`);
  return { ok: true, userId: row.id };
}

async function supabaseSignIn(email: string, password: string): Promise<AuthResult> {
  const cfg = supabaseConfig();
  if (!cfg) return { ok: false, reason: "unavailable" };
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: cfg.anonKey, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (res.status >= 500) return { ok: false, reason: "unavailable" };
  if (!res.ok) return { ok: false, reason: "invalid" };
  const tokens = tokensFrom(await res.json());
  if (!tokens) return { ok: false, reason: "invalid" };
  const [profile] = await asService((tx) => tx`select active from public.profiles where id = ${tokens.userId}`);
  if (!profile?.active) return { ok: false, reason: "inactive" };
  return { ok: true, userId: tokens.userId, tokens };
}

export function signIn(email: string, password: string): Promise<AuthResult> {
  return process.env.AUTH_PROVIDER === "supabase" ? supabaseSignIn(email, password) : localSignIn(email, password);
}
