"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth/providers";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/auth/session";
import { clearTokens, storeTokens } from "@/lib/auth/supabase-session";
import { asService, DatabaseUnavailableError } from "@/lib/db";
import { limits } from "@/lib/rate-limit";

export type LoginState = { error?: string; email?: string };

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(form));
  const email = String(form.get("email") ?? "");
  if (!parsed.success) return { error: "Enter your email and password.", email };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const byIp = limits.login.check(`ip:${ip}`);
  const byEmail = limits.login.check(`email:${parsed.data.email}`);
  if (!byIp.ok || !byEmail.ok) {
    const wait = Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds);
    return { error: `Too many sign-in attempts. Try again in ${Math.ceil(wait / 60)} min.`, email };
  }

  let result: Awaited<ReturnType<typeof signIn>>;
  try {
    result = await signIn(parsed.data.email, parsed.data.password);
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) return { error: "Can't reach the database right now. Please try again in a moment.", email };
    throw err;
  }
  if (!result.ok) {
    await asService((tx) => tx`insert into public.audit_logs (action, entity, details)
      values ('auth.login_failed', 'auth', ${tx.json({ email: parsed.data.email, reason: result.reason, ip })})`);
    return {
      error: result.reason === "inactive" ? "This account is deactivated. Ask an admin." : result.reason === "unavailable" ? "Sign-in is unavailable right now." : "Wrong email or password.",
      email,
    };
  }

  limits.login.reset(`email:${parsed.data.email}`);
  await asService((tx) => tx`insert into public.audit_logs (actor_id, action, entity, entity_id, details)
    values (${result.userId}, 'auth.login', 'auth', ${result.userId}, ${tx.json({ ip })})`);

  if (result.tokens) await storeTokens(result.tokens);
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(result.userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect(safeNext(parsed.data.next));
}

export async function logout() {
  await clearTokens();
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
