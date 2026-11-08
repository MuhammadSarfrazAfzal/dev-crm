"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current";
import { storageAuthFor } from "@/lib/auth/supabase-session";
import { asService, asUser } from "@/lib/db";
import { limits } from "@/lib/rate-limit";
import { storage } from "@/lib/storage";
import { approveImport, ImportError, recompute, sanitizeMapping } from "@/server/imports";

const uuid = z.string().uuid();

export async function updateMapping(form: FormData) {
  const user = await requireUser();
  const id = uuid.parse(form.get("importId"));
  await asUser(user.id, async (tx) => {
    const [imp] = await tx`select headers, status from imports where id = ${id}`;
    if (!imp || imp.status !== "preview") return;
    const input: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (k.startsWith("map:")) input[k.slice(4)] = String(v);
    await recompute(tx, id, sanitizeMapping(imp.headers, input));
  });
  revalidatePath(`/imports/${id}`);
  redirect(`/imports/${id}?msg=mapped`);
}

/** Saves include/skip for the rows on the current page; optionally approves the whole import. */
export async function saveDecisions(form: FormData) {
  const user = await requireUser();
  const id = uuid.parse(form.get("importId"));
  const page = Number(form.get("page")) || 1;
  const visible = form.getAll("rowIds").map(String).filter((v) => uuid.safeParse(v).success);
  const included = new Set(form.getAll("include").map(String));
  const intent = String(form.get("intent") ?? "save");
  if (!limits.write.check(`write:${user.id}`).ok) redirect(`/imports/${id}?page=${page}&msg=slow`);

  let outcome = "saved";
  try {
    await asUser(user.id, async (tx) => {
      const [imp] = await tx`select status, assign_to from imports where id = ${id}`;
      if (!imp || imp.status !== "preview") {
        outcome = "done";
        return;
      }
      if (visible.length) {
        const inc = visible.filter((v) => included.has(v));
        const skip = visible.filter((v) => !included.has(v));
        if (inc.length) await tx`update import_rows set decision = 'include' where import_id = ${id} and id = any(${inc}::uuid[])`;
        if (skip.length) await tx`update import_rows set decision = 'skip' where import_id = ${id} and id = any(${skip}::uuid[])`;
      }
      if (intent === "approve") {
        const owner = user.role === "admin" ? (String(form.get("assignTo") ?? "") || imp.assign_to || user.id) : user.id;
        if (!uuid.safeParse(owner).success) throw new ImportError("Pick who gets these leads.");
        const res = await approveImport(tx, user, id, owner);
        outcome = `approved-${res.created + res.attached}-${res.skipped}`;
      } else if (intent === "reject") {
        await tx`update imports set status = 'rejected' where id = ${id}`;
        await tx`select app.log_audit('import.rejected', 'imports', ${id}, '{}'::jsonb)`;
        outcome = "rejected";
      }
    });
  } catch (err) {
    if (!(err instanceof ImportError)) throw err;
    outcome = "failed";
  }
  revalidatePath(`/imports/${id}`);
  revalidatePath("/leads");
  redirect(`/imports/${id}?page=${page}&msg=${outcome}`);
}

const EDIT_FIELDS = ["company", "contact_name", "phone", "email", "website", "address", "city", "state", "postal_code", "notes"] as const;

function editedValues(form: FormData) {
  const edited: Record<string, string> = {};
  for (const f of EDIT_FIELDS) {
    const v = String(form.get(f) ?? "").trim().slice(0, 500);
    edited[f] = v;
  }
  return edited;
}

/** Saves the user's corrections to one preview row and re-checks the import. */
export async function editImportRow(form: FormData) {
  const user = await requireUser();
  const importId = uuid.parse(form.get("importId"));
  const rowId = uuid.parse(form.get("rowId"));
  await asUser(user.id, async (tx) => {
    const [imp] = await tx`select column_mapping, status from imports where id = ${importId}`;
    if (!imp || imp.status !== "preview") return;
    const [row] = await tx`select raw from import_rows where id = ${rowId} and import_id = ${importId}`;
    if (!row) return;
    const raw = { ...row.raw, edited: editedValues(form) };
    await tx`update import_rows set raw = ${tx.json(raw)}, decision = 'include' where id = ${rowId}`;
    await recompute(tx, importId, imp.column_mapping, { preserveDecisions: true });
  });
  revalidatePath(`/imports/${importId}`);
  redirect(`/imports/${importId}?msg=edited#needs-look`);
}

/** Adds another business found in a row's text (splitting a mixed row in two). */
export async function addImportRow(form: FormData) {
  const user = await requireUser();
  const importId = uuid.parse(form.get("importId"));
  const fromRow = uuid.parse(form.get("rowId"));
  await asUser(user.id, async (tx) => {
    const [imp] = await tx`select column_mapping, status from imports where id = ${importId}`;
    if (!imp || imp.status !== "preview") return;
    const [src] = await tx`select source_ref, raw from import_rows where id = ${fromRow} and import_id = ${importId}`;
    if (!src) return;
    const [{ next }] = await tx`select coalesce(max(row_index), 0) + 1 as next from import_rows where import_id = ${importId}`;
    const raw = { cells: {}, from_text: true, parser: "manual-split", snippet: src.raw.snippet, edited: editedValues(form) };
    await tx`insert into import_rows (import_id, row_index, source_ref, raw) values (${importId}, ${next}, ${`${src.source_ref ?? ""} (split)`.slice(0, 300)}, ${tx.json(raw)})`;
    await tx`update imports set row_count = row_count + 1 where id = ${importId}`;
    await recompute(tx, importId, imp.column_mapping, { preserveDecisions: true });
  });
  revalidatePath(`/imports/${importId}`);
  redirect(`/imports/${importId}?msg=split#needs-look`);
}

export type DeleteImportResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes an imported document and its staging rows from the CRM.
 * Data generated from the import (leads, companies, contacts) is STRICTLY preserved;
 * their import_id is simply detached so nothing is lost.
 */
export async function deleteImport(importId: string): Promise<DeleteImportResult> {
  const user = await requireUser();
  if (!uuid.safeParse(importId).success) return { ok: false, error: "Invalid import ID." };

  if (!limits.write.check(`delete-import:${user.id}`).ok) {
    return { ok: false, error: "Too many changes in a minute. Try again shortly." };
  }

  try {
    const { storageKeys } = await asService(async (tx) => {
      const [imp] = await tx`select id, uploaded_by, original_filename from public.imports where id = ${importId}`;
      if (!imp) throw new Error("Import document not found.");

      if (user.role !== "admin" && imp.uploaded_by !== user.id) {
        throw new Error("Only an admin or the person who uploaded this import can delete it.");
      }

      // Collect storage keys for files uploaded with this import
      const docs = await tx`select storage_key from public.documents where import_id = ${importId}`;
      const storageKeys = docs.map((d) => d.storage_key).filter(Boolean) as string[];

      // PRESERVE all leads, contacts, and companies created from this import:
      await tx`update public.leads set import_id = null where import_id = ${importId}`;
      await tx`update public.contacts set import_id = null where import_id = ${importId}`;
      await tx`update public.companies set import_id = null where import_id = ${importId}`;
      try {
        await tx`update public.research_requests set import_id = null where import_id = ${importId}`;
      } catch {}

      // Delete staging rows, document metadata, and import record
      await tx`delete from public.import_rows where import_id = ${importId}`;
      await tx`delete from public.documents where import_id = ${importId}`;
      await tx`delete from public.imports where id = ${importId}`;

      await tx`insert into public.audit_logs (actor_id, action, entity, entity_id, details)
        values (${user.id}, 'import.deleted', 'imports', ${importId}, ${tx.json({ filename: imp.original_filename })})`;

      return { storageKeys };
    });

    if (storageKeys.length) {
      const auth = await storageAuthFor(user.id).catch(() => undefined);
      await Promise.all(
        storageKeys.map((k) =>
          storage.remove(k, auth).catch((err) => console.error("Could not remove file", k, err instanceof Error ? err.message : err))
        )
      );
    }

    revalidatePath("/imports");
    revalidatePath("/leads");
    revalidatePath("/companies");
    return { ok: true };
  } catch (err) {
    console.error("deleteImport error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Could not delete import document." };
  }
}
