"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { storageAuthFor } from "@/lib/auth/supabase-session";
import { asUser, DatabaseUnavailableError } from "@/lib/db";
import { limits } from "@/lib/rate-limit";
import { storage } from "@/lib/storage";

export type DeleteResult = { ok: true; deleted: number } | { ok: false; error: string };

const Schema = z.object({ kind: z.enum(["leads", "companies"]), ids: z.array(z.string().uuid()).min(1).max(1000) });

/**
 * Deletes shops for good: each lead takes its company with it (and the company its lead),
 * along with contacts, calls, follow-ups, emails, deals, notes and attached files. Admins
 * only, enforced by the database; every shop gets an audit entry.
 */
export async function deleteRecords(input: { kind: "leads" | "companies"; ids: string[] }): Promise<DeleteResult> {
  const user = await requireUser();
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nothing selected." };
  if (user.role !== "admin") return { ok: false, error: "Only an admin can delete leads." };
  if (!limits.write.check(`delete:${user.id}`).ok) return { ok: false, error: "Too many changes in a minute. Try again shortly." };
  const { kind, ids } = parsed.data;
  try {
    const removed = await asUser(user.id, async (tx) => {
      const companyIds =
        kind === "companies"
          ? ids
          : (await tx`select distinct company_id from leads where id = any(${ids}::uuid[])`).map((r) => r.company_id as string);
      if (!companyIds.length) return [];
      return tx`select company_id, storage_keys from app.delete_companies(${companyIds}::uuid[])`;
    });
    // Files go after the rows are gone; a file that can't be removed is only logged.
    const keys = removed.flatMap((r) => (r.storage_keys as string[]) ?? []);
    if (keys.length) {
      const auth = await storageAuthFor(user.id).catch(() => undefined);
      await Promise.all(keys.map((k) => storage.remove(k, auth).catch((err) => console.error("could not remove file", k, err instanceof Error ? err.message : err))));
    }
    for (const p of ["/leads", "/companies", "/followups", "/emails", "/reports", "/"]) revalidatePath(p);
    return { ok: true, deleted: removed.length };
  } catch (err) {
    if (err instanceof DatabaseUnavailableError) return { ok: false, error: "Can't reach the database right now. Nothing was deleted." };
    if (/only an admin/.test(err instanceof Error ? err.message : "")) return { ok: false, error: "Only an admin can delete leads." };
    console.error("delete failed:", err);
    return { ok: false, error: "Something went wrong. Nothing was deleted." };
  }
}
