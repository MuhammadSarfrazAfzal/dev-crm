"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { forgetProfile, requireUser } from "@/lib/auth/current";
import { signIn } from "@/lib/auth/providers";
import { hashPassword, setAuthPassword } from "@/lib/auth/users";
import { asService, asUser } from "@/lib/db";
import { limits } from "@/lib/rate-limit";
import { cookies } from "next/headers";
import { isValidTimeZone, parseTimeView, TIME_VIEW_COOKIE } from "@/lib/time";
import type { ActionState } from "./lead";

export async function updateProfile(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = z.object({ fullName: z.string().trim().min(1).max(120), timeZone: z.string().refine(isValidTimeZone) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter your name and pick a valid time zone." };
  await asUser(user.id, (tx) => tx`update profiles set full_name = ${parsed.data.fullName}, time_zone = ${parsed.data.timeZone} where id = ${user.id}`);
  forgetProfile(user.id);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved.", savedAt: Date.now() };
}

const PasswordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password.").max(200),
    next: z.string().min(10, "New passwords need at least 10 characters.").max(200),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { message: "The two new passwords don't match." })
  .refine((d) => d.next !== d.current, { message: "Pick a password different from the current one." });

/** Lets a signed-in person change their own password after confirming the current one. */
export async function changePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = PasswordSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  if (!limits.login.check(`password:${user.id}`).ok) return { error: "Too many attempts. Try again later." };
  const check = await signIn(user.email, parsed.data.current);
  if (!check.ok) return { error: check.reason === "unavailable" ? "Can't check your password right now. Try again in a moment." : "Your current password isn't right." };
  const hash = await hashPassword(parsed.data.next);
  await asService(async (tx) => {
    await setAuthPassword(tx, user.id, hash);
    await tx`insert into public.audit_logs (actor_id, action, entity, entity_id) values (${user.id}, 'user.password_changed', 'profiles', ${user.id})`;
  });
  return { ok: true, message: "Password changed. Use the new one next time you sign in.", savedAt: Date.now() };
}

/** Remembers whether this browser shows times in USA or Pakistan time. */
export async function setTimeView(view: string) {
  await requireUser();
  const store = await cookies();
  store.set(TIME_VIEW_COOKIE, parseTimeView(view), { path: "/", maxAge: 365 * 86_400, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
}
