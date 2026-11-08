"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { forgetProfile, requireAdmin } from "@/lib/auth/current";
import { hashPassword, insertAuthUser, setAuthPassword } from "@/lib/auth/users";
import { asService, asUser } from "@/lib/db";
import { isValidTimeZone } from "@/lib/time";
import type { ActionState } from "./lead";

const password = z.string().min(10, "Passwords need at least 10 characters.").max(200);

const CreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "salesperson"]),
  timeZone: z.string().refine(isValidTimeZone),
  password,
});

export async function createUser(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = CreateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  const hash = await hashPassword(d.password);
  try {
    await asService(async (tx) => {
      const id = await insertAuthUser(tx, { email: d.email, passwordHash: hash, fullName: d.fullName });
      await tx`insert into public.profiles (id, email, full_name, role, time_zone) values (${id}, ${d.email}, ${d.fullName}, ${d.role}, ${d.timeZone})`;
      await tx`insert into public.audit_logs (actor_id, action, entity, entity_id, details) values (${admin.id}, 'user.created', 'profiles', ${id}, ${tx.json({ email: d.email, role: d.role })})`;
    });
  } catch (err) {
    if (err instanceof Error && /unique|duplicate/i.test(err.message)) return { error: "A user with that email already exists." };
    throw err;
  }
  revalidatePath("/team");
  return { ok: true, message: `Created ${d.email}. Share the temporary password privately.`, savedAt: Date.now() };
}

const UpdateSchema = z.object({ userId: z.string().uuid(), role: z.enum(["admin", "salesperson"]), active: z.enum(["true", "false"]) });

export async function updateUser(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = UpdateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid change." };
  const d = parsed.data;
  if (d.userId === admin.id && (d.role !== "admin" || d.active !== "true")) return { error: "You can't demote or deactivate yourself." };
  await asUser(admin.id, (tx) => tx`update profiles set role = ${d.role}, active = ${d.active === "true"} where id = ${d.userId}`);
  forgetProfile(d.userId);
  revalidatePath("/team");
  return { ok: true, message: "Saved." };
}

export async function resetPassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = z.object({ userId: z.string().uuid(), password }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the password." };
  const hash = await hashPassword(parsed.data.password);
  await asService(async (tx) => {
    await setAuthPassword(tx, parsed.data.userId, hash);
    await tx`insert into public.audit_logs (actor_id, action, entity, entity_id) values (${admin.id}, 'user.password_reset', 'profiles', ${parsed.data.userId})`;
  });
  return { ok: true, message: "Password changed.", savedAt: Date.now() };
}

const DeleteUserSchema = z.object({
  userId: z.string().uuid("Invalid user ID."),
});

export async function deleteUser(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = DeleteUserSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Invalid user." };
  const { userId } = parsed.data;

  if (userId === admin.id) {
    return { error: "You cannot delete your own account." };
  }

  try {
    await asService(async (tx) => {
      const [user] = await tx`select id, email, full_name, role from public.profiles where id = ${userId}`;
      if (!user) throw new Error("User not found.");

      // Reassign or clear references so no foreign key constraint is violated
      await tx`update public.companies set created_by = null where created_by = ${userId}`;
      await tx`update public.contacts set created_by = null where created_by = ${userId}`;
      await tx`update public.leads set created_by = null where created_by = ${userId}`;
      await tx`update public.leads set owner_id = null where owner_id = ${userId}`;
      await tx`update public.scripts set created_by = null where created_by = ${userId}`;
      await tx`update public.documents set uploaded_by = null where uploaded_by = ${userId}`;
      await tx`update public.imports set assign_to = null where assign_to = ${userId}`;
      await tx`update public.imports set approved_by = null where approved_by = ${userId}`;
      await tx`update public.followups set created_by = null where created_by = ${userId}`;
      await tx`update public.sales_opportunities set owner_id = null where owner_id = ${userId}`;

      try {
        await tx`update public.research_requests set created_by = ${admin.id} where created_by = ${userId}`;
      } catch {}

      await tx`update public.followups set assigned_to = ${admin.id} where assigned_to = ${userId}`;
      await tx`update public.call_activities set user_id = ${admin.id} where user_id = ${userId}`;
      await tx`update public.email_activities set user_id = ${admin.id} where user_id = ${userId}`;
      await tx`update public.notes set user_id = ${admin.id} where user_id = ${userId}`;
      await tx`update public.imports set uploaded_by = ${admin.id} where uploaded_by = ${userId}`;

      // Delete from profiles and auth
      await tx`delete from public.profiles where id = ${userId}`;
      try {
        await tx`delete from auth.identities where user_id = ${userId}`;
      } catch {}
      try {
        await tx`delete from auth.users where id = ${userId}`;
      } catch {}

      await tx`insert into public.audit_logs (actor_id, action, entity, entity_id, details)
        values (${admin.id}, 'user.deleted', 'profiles', ${userId}, ${tx.json({ email: user.email, name: user.full_name, role: user.role })})`;
    });
  } catch (err) {
    console.error("deleteUser failed:", err);
    return { error: err instanceof Error ? err.message : "Could not delete user. Try again later." };
  }

  forgetProfile(userId);
  revalidatePath("/team");
  revalidatePath("/leads");
  return { ok: true, message: "User deleted." };
}
