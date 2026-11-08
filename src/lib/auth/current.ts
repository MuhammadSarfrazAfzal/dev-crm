import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { asUser, type Tx } from "@/lib/db";
import { syncServerClock } from "@/server/clock";
import { DEFAULT_US_TZ, isUsTimeZone, PAKISTAN_TZ, parseTimeView, TIME_VIEW_COOKIE, type TimeView } from "@/lib/time";
import { SESSION_COOKIE, verifySession } from "./session";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "salesperson";
  /**
   * The zone for "today", greetings and times not tied to a shop: the user's USA zone in
   * the USA view, Pakistan time in the Pakistan view.
   */
  timeZone: string;
  /** The user's USA zone from Settings (Central when none is set). */
  usTimeZone: string;
  /** The zone saved in Settings, as is. */
  profileTimeZone: string;
  view: TimeView;
};

type Profile = Omit<CurrentUser, "timeZone" | "usTimeZone" | "view">;

// Profiles are re-read at most every few seconds per server process; that saves a database
// round trip on most requests. RLS checks `active` on every query anyway, so a deactivated
// user loses data access immediately; only the app shell may lag by these seconds.
const PROFILE_TTL_MS = 15_000;
const profiles = new Map<string, { user: Profile | null; at: number }>();

export function forgetProfile(userId: string) {
  profiles.delete(userId);
}

/** The signed-in, active user for this request, or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const [store] = await Promise.all([cookies(), syncServerClock()]);
  const userId = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const hit = profiles.get(userId);
  let profile: Profile | null;
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) profile = hit.user;
  else {
    const [row] = await asUser(
      userId,
      (tx) => tx`select id, email, full_name, role, time_zone from public.profiles where id = ${userId} and active`,
    );
    profile = row ? { id: row.id, email: row.email, fullName: row.full_name, role: row.role, profileTimeZone: row.time_zone } : null;
    profiles.set(userId, { user: profile, at: Date.now() });
  }
  if (!profile) return null;
  const view = parseTimeView(store.get(TIME_VIEW_COOKIE)?.value);
  const usTimeZone = isUsTimeZone(profile.profileTimeZone) ? profile.profileTimeZone : DEFAULT_US_TZ;
  return { ...profile, usTimeZone, view, timeZone: view === "pk" ? PAKISTAN_TZ : usTimeZone };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/?denied=1");
  return user;
}

/** Runs queries as the signed-in user, under RLS. */
export async function withUserDb<T>(fn: (tx: Tx, user: CurrentUser) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return asUser(user.id, (tx) => fn(tx, user));
}
