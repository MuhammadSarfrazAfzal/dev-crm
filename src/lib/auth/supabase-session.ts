import "server-only";
/**
 * Supabase Auth tokens for the signed-in user. The access and refresh tokens are kept in
 * one encrypted, httpOnly cookie (JWE, A256GCM, key derived from SESSION_SECRET), so the
 * browser never sees the refresh token. The server uses the access token for Supabase
 * Storage and hands a short-lived copy to the browser for Realtime.
 */
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { EncryptJWT, jwtDecrypt } from "jose";
import { supabaseConfig } from "@/lib/supabase/config";
import { SESSION_TTL_SECONDS } from "./session";

export const SUPABASE_COOKIE = "crm_sb";

export type SupabaseTokens = { accessToken: string; refreshToken: string; expiresAt: number; userId: string };

function key() {
  const secret = process.env.SESSION_SECRET || "dev-only-secret-change-me-dev-only-secret-change-me";
  return createHash("sha256").update(`supabase-tokens:${secret}`).digest();
}

export async function sealTokens(t: SupabaseTokens) {
  return new EncryptJWT({ t }).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuedAt().setExpirationTime(`${SESSION_TTL_SECONDS}s`).encrypt(key());
}

export async function openTokens(value: string | undefined): Promise<SupabaseTokens | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtDecrypt(value, key());
    return (payload.t as SupabaseTokens) ?? null;
  } catch {
    return null;
  }
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; expires_at?: number; user?: { id?: string } };

export function tokensFrom(body: TokenResponse): SupabaseTokens | null {
  if (!body.access_token || !body.refresh_token || !body.user?.id) return null;
  const expiresAt = body.expires_at ?? Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600);
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt, userId: body.user.id };
}

async function refresh(t: SupabaseTokens): Promise<SupabaseTokens | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  const res = await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: cfg.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: t.refreshToken }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return tokensFrom((await res.json()) as TokenResponse);
}

export async function storeTokens(t: SupabaseTokens) {
  const store = await cookies();
  store.set(SUPABASE_COOKIE, await sealTokens(t), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * A valid access token for the user, refreshed when it has under a minute left. Only call
 * from route handlers and server actions: a refresh rewrites the cookie.
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  const store = await cookies();
  let t = await openTokens(store.get(SUPABASE_COOKIE)?.value);
  if (!t || t.userId !== userId) return null;
  if (t.expiresAt - 60 < Date.now() / 1000) {
    t = await refresh(t);
    if (!t) return null;
    await storeTokens(t);
  }
  return t.accessToken;
}

/** The current token with its expiry, for the browser's Realtime connection. */
export async function getRealtimeToken(userId: string): Promise<{ accessToken: string; expiresAt: number } | null> {
  const accessToken = await getAccessToken(userId);
  if (!accessToken) return null;
  const t = await openTokens((await cookies()).get(SUPABASE_COOKIE)?.value);
  return t ? { accessToken, expiresAt: t.expiresAt } : null;
}

export async function clearTokens() {
  const store = await cookies();
  const t = await openTokens(store.get(SUPABASE_COOKIE)?.value);
  store.delete(SUPABASE_COOKIE);
  const cfg = supabaseConfig();
  if (t && cfg) {
    // Revoke the refresh token; failure only means it expires on its own.
    await fetch(`${cfg.url}/auth/v1/logout`, { method: "POST", headers: { apikey: cfg.anonKey, authorization: `Bearer ${t.accessToken}` } }).catch(() => {});
  }
}

/** What the storage adapter needs to act as this user (route handlers and server actions only). */
export async function storageAuthFor(userId: string) {
  return process.env.STORAGE_PROVIDER === "supabase" ? { accessToken: await getAccessToken(userId) } : {};
}
