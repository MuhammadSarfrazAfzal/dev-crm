"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/current";
import { asUser } from "@/lib/db";
import { limits } from "@/lib/rate-limit";

const AssignSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  owner: z.union([z.literal("none"), z.string().uuid()]),
  back: z.string().max(2000).optional(),
});

/** Admin: give the selected leads to a salesperson (or unassign them). Audited by trigger. */
export async function assignLeads(form: FormData) {
  const admin = await requireAdmin();
  const parsed = AssignSchema.safeParse({
    ids: form.getAll("ids").map(String),
    owner: String(form.get("owner") ?? ""),
    back: String(form.get("back") ?? ""),
  });
  const back = parsed.success && parsed.data.back?.startsWith("/leads") ? parsed.data.back : "/leads";
  const sep = back.includes("?") ? "&" : "?";
  if (!parsed.success) redirect(`${back}${sep}msg=select`);
  if (!limits.write.check(`assign:${admin.id}`).ok) redirect(`${back}${sep}msg=slow`);
  const owner = parsed.data.owner === "none" ? null : parsed.data.owner;
  const count = await asUser(admin.id, async (tx) => {
    if (owner) {
      const [p] = await tx`select id from profiles where id = ${owner} and active`;
      if (!p) return -1;
    }
    const rows = await tx`update leads set owner_id = ${owner} where id = any(${parsed.data.ids}::uuid[]) returning id`;
    // Re-point pending follow-ups so the new owner sees them.
    if (owner) await tx`update followups set assigned_to = ${owner} where lead_id = any(${parsed.data.ids}::uuid[]) and status = 'pending'`;
    return rows.length;
  });
  revalidatePath("/leads");
  redirect(`${back}${sep}msg=${count < 0 ? "badowner" : `assigned-${count}`}`);
}
