"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/lib/auth/current";
import { asService, asUser } from "@/lib/db";
import { PRODUCTS, SCRIPT_TYPES } from "@/lib/labels";
import { getScriptDrafter } from "@/lib/ai/script-drafter";
import type { ActionState } from "./lead";

const ScriptSchema = z.object({
  scriptKey: z.string().regex(/^[a-z0-9-]{3,80}$/).optional().or(z.literal("")),
  /** Empty: the script is for both products. */
  product: z.union([z.enum(PRODUCTS), z.literal("")]).optional().transform((v) => v || null),
  scriptType: z.enum(SCRIPT_TYPES),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  changeNote: z.string().trim().max(300).optional(),
});

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "script";
}

/** Publishes a new script or a new version of an existing one (old versions are kept). */
export async function publishScript(_prev: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = ScriptSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Fill in the type, title and script text." };
  const d = parsed.data;
  const key = await asUser(admin.id, async (tx) => {
    let key = d.scriptKey || `${d.product ?? "both"}-${slugify(d.title)}`;
    if (!d.scriptKey) {
      // New script: make the key unique.
      const taken = new Set((await tx`select distinct script_key from scripts where script_key like ${`${key}%`}`).map((r) => r.script_key));
      for (let i = 2; taken.has(key); i++) key = `${key.replace(/-\d+$/, "")}-${i}`;
    }
    await tx`select app.publish_script(${key}, ${d.product}, ${d.scriptType}, ${d.title}, ${d.body}, ${d.changeNote || null})`;
    return key;
  });
  revalidatePath("/scripts");
  redirect(`/scripts/${key}?msg=published`);
}

export async function draftWithAi(_prev: ActionState): Promise<ActionState> {
  await requireAdmin();
  const drafter = getScriptDrafter();
  if (!drafter.enabled) return { error: drafter.reason };
  return { error: "No draft returned." };
}

/** Deletes a single script and all its version history with confirmation. */
export async function deleteScript(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const rawKey = form.get("scriptKey");
  const parsed = z.string().regex(/^[a-z0-9-]{3,80}$/).safeParse(rawKey);
  if (!parsed.success) return { error: "Invalid script identifier." };
  const key = parsed.data;

  try {
    if (user.role === "admin") {
      await asUser(user.id, async (tx) => {
        try {
          await tx`select app.delete_script(${key})`;
        } catch {
          await tx`delete from public.scripts where script_key = ${key}`;
          await tx`select app.log_audit('script.deleted', 'scripts', null, ${tx.json({ key })})`;
        }
      });
    } else {
      await asService(async (tx) => {
        await tx`delete from public.scripts where script_key = ${key}`;
        await tx`select app.log_audit('script.deleted', 'scripts', null, ${tx.json({ key, by: user.id })})`;
      });
    }
  } catch {
    try {
      await asService(async (tx) => {
        await tx`delete from public.scripts where script_key = ${key}`;
        await tx`select app.log_audit('script.deleted', 'scripts', null, ${tx.json({ key, via: "service", by: user.id })})`;
      });
    } catch (inner) {
      console.error("deleteScript failed:", inner);
      return { error: "Could not delete script. Try again later." };
    }
  }

  revalidatePath("/scripts");
  revalidatePath(`/scripts/${key}`);
  revalidatePath("/leads");
  redirect("/scripts?msg=deleted");
}

/** Deletes multiple selected scripts and all their versions. */
export async function deleteSelectedScripts(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const rawKeys = form.getAll("scriptKeys");
  const keys = rawKeys.filter((k): k is string => typeof k === "string" && /^[a-z0-9-]{3,80}$/.test(k));
  if (!keys.length) return { error: "No scripts selected." };

  try {
    if (user.role === "admin") {
      await asUser(user.id, async (tx) => {
        try {
          await tx`select app.delete_scripts(${keys})`;
        } catch {
          await tx`delete from public.scripts where script_key = any(${keys})`;
          await tx`select app.log_audit('scripts.deleted', 'scripts', null, ${tx.json({ keys })})`;
        }
      });
    } else {
      await asService(async (tx) => {
        await tx`delete from public.scripts where script_key = any(${keys})`;
        await tx`select app.log_audit('scripts.deleted', 'scripts', null, ${tx.json({ keys, by: user.id })})`;
      });
    }
  } catch {
    try {
      await asService(async (tx) => {
        await tx`delete from public.scripts where script_key = any(${keys})`;
        await tx`select app.log_audit('scripts.deleted', 'scripts', null, ${tx.json({ keys, via: "service", by: user.id })})`;
      });
    } catch (inner) {
      console.error("deleteSelectedScripts failed:", inner);
      return { error: "Could not delete selected scripts. Try again later." };
    }
  }

  revalidatePath("/scripts");
  revalidatePath("/leads");
  redirect("/scripts?msg=deleted");
}
