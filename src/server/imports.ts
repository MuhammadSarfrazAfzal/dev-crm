import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { asService, asUser, type Tx } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current";
import { extractUpload, MAX_UPLOAD_BYTES } from "@/lib/import/extract";
import { ocrImage } from "@/lib/import/ocr";
import { safeFilename, validateFile, type FileKind } from "@/lib/import/sniff";
import { applyMapping, suggestMapping, type Field, FIELDS } from "@/lib/import/columns";
import { BLOCKING_ISSUES, inFileKeys, type NormalizedRow } from "@/lib/import/normalize";
import { buildRawRows, extractPaste, normalizeRaw, type RawRow } from "@/lib/import/rows";

export type { RawRow };
import type { ExtractedTable, ExtractResult } from "@/lib/import/types";
import { storage, type StorageAuth } from "@/lib/storage";

export const MAX_PASTE_CHARS = 500_000;

/** Rows per bulk statement when writing import results. */
const BATCH = 500;

const SOURCE_TYPE: Record<FileKind, string> = {
  csv: "csv", tsv: "csv", txt: "txt", xlsx: "xlsx", docx: "docx", pdf: "pdf", zip: "zip",
  png: "image", jpeg: "image", webp: "image", gif: "image", bmp: "image", tiff: "image",
};

export class ImportError extends Error {}

type CreateInput = {
  user: CurrentUser;
  assignTo: string | null;
  file?: { name: string; data: Uint8Array };
  text?: string;
  /** Rows a research provider returned, already shaped like a spreadsheet. */
  research?: ExtractedTable;
  /** Lets the storage adapter act as the user (Supabase Storage). */
  storageAuth?: StorageAuth;
};

/** Validates, stores and parses an upload or paste, then saves preview rows. Nothing touches leads yet. */
export async function createImport({ user, assignTo, file, text, research, storageAuth }: CreateInput): Promise<string> {
  let extracted: ExtractResult;
  let sourceType: string;
  let stored: { key: string; filename: string; mime: string; size: number; sha256: string } | null = null;

  if (file) {
    const v = validateFile(file.name, file.data, { maxBytes: MAX_UPLOAD_BYTES });
    if (!v.ok) throw new ImportError(v.reason);
    sourceType = SOURCE_TYPE[v.kind];
    const sha256 = createHash("sha256").update(file.data).digest("hex");
    try {
      extracted = await extractUpload({ name: safeFilename(file.name), kind: v.kind, data: file.data }, { ocr: ocrImage });
    } catch (err) {
      throw new ImportError(`We couldn't read that file: ${err instanceof Error ? err.message : "unknown error"}`);
    }
    const key = await storage.put(file.data, v.kind === "jpeg" ? "jpg" : v.kind, storageAuth);
    stored = { key, filename: safeFilename(file.name), mime: v.mime, size: file.data.length, sha256 };
  } else if (research) {
    sourceType = "research";
    extracted = { tables: [research], texts: [], notes: [], parsers: ["research"] };
  } else {
    const body = (text ?? "").trim();
    if (!body) throw new ImportError("Paste some text first.");
    if (body.length > MAX_PASTE_CHARS) throw new ImportError("That's too much text for one paste. Split it up or upload a file.");
    sourceType = "paste";
    extracted = extractPaste(body);
  }

  const { rows, notes } = await buildRawRows(extracted);
  if (rows.length === 0) throw new ImportError(["No businesses or contact details found in that input.", ...extracted.notes].join(" "));
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r.raw.cells)))];
  const mapping = suggestMapping(headers, rows.map((r) => r.raw.cells));

  return asUser(user.id, async (tx) => {
    if (stored) {
      const [dupe] = await tx`select id from imports where sha256 = ${stored.sha256} and status <> 'rejected' limit 1`;
      if (dupe) notes.unshift("This exact file was imported before — check for duplicates.");
    }
    const [imp] = await tx`insert into imports (uploaded_by, source_type, original_filename, storage_key, mime_type,
        size_bytes, sha256, parser, column_mapping, headers, notes, row_count, assign_to)
      values (${user.id}, ${sourceType}, ${stored?.filename ?? null}, ${stored?.key ?? null}, ${stored?.mime ?? null},
        ${stored?.size ?? null}, ${stored?.sha256 ?? null}, ${extracted.parsers.join(", ")}, ${tx.json(mapping)}, ${headers},
        ${[...extracted.notes, ...notes].slice(0, 200)}, ${rows.length}, ${assignTo})
      returning id`;
    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500).map((r, j) => ({
        import_id: imp.id,
        row_index: i + j + 1,
        source_ref: r.source.slice(0, 300),
        raw: tx.json(r.raw as never),
      }));
      await tx`insert into import_rows ${tx(batch as unknown as Record<string, unknown>[], "import_id", "row_index", "source_ref", "raw")}`;
    }
    if (stored) {
      await tx`insert into documents (import_id, storage_key, filename, mime_type, size_bytes, uploaded_by)
        values (${imp.id}, ${stored.key}, ${stored.filename}, ${stored.mime}, ${stored.size}, ${user.id})`;
    }
    await recompute(tx, imp.id, mapping);
    await tx`select app.log_audit('import.created', 'imports', ${imp.id},
      ${tx.json({ source_type: sourceType, filename: stored?.filename ?? null, rows: rows.length, parsers: extracted.parsers })})`;
    return imp.id as string;
  });
}

/**
 * Re-normalizes every row with the current mapping and re-checks duplicates. Decisions
 * reset to the defaults: include unless the row is blocked or a duplicate.
 */
export async function recompute(
  tx: Tx,
  importId: string,
  mapping: Record<string, Field>,
  { preserveDecisions = false }: { preserveDecisions?: boolean } = {},
) {
  const rows = await tx`select id, row_index, raw, decision from import_rows where import_id = ${importId} order by row_index`;
  const previous = new Map(rows.map((r) => [r.id as string, r.decision as string]));
  const normalized = rows.map((r) => {
    const raw = r.raw as RawRow;
    const n = normalizeRaw(raw, mapping);
    return { id: r.id as string, index: r.row_index as number, ...n };
  });

  // Duplicates against the whole CRM are checked with the service role so a salesperson is
  // warned about shops other reps already own; only ids are used, never their details.
  const existing = await findExisting(normalized.map((n) => n.row));

  const seen = new Map<string, number>();
  const updates = normalized.map((n) => {
    const issues = [...n.issues];
    let dupInFile: number | null = null;
    for (const key of inFileKeys(n.row)) {
      if (seen.has(key)) {
        dupInFile = seen.get(key)!;
        break;
      }
    }
    if (dupInFile === null) for (const key of inFileKeys(n.row)) seen.set(key, n.index);
    else issues.push("duplicate_in_file");
    const match = existing(n.row);
    if (match) issues.push("duplicate_existing");
    const blocked = issues.some((i) => BLOCKING_ISSUES.has(i));
    const auto = blocked || dupInFile !== null || match?.leadId ? "skip" : "include";
    const decision = blocked ? "skip" : preserveDecisions ? (previous.get(n.id) ?? auto) : auto;
    return {
      id: n.id,
      normalized: n.row,
      issues,
      confidence: match ? Math.max(0, n.confidence - 0.1) : n.confidence,
      duplicate_of_company: match?.companyId ?? null,
      duplicate_of_lead: match?.leadId ?? null,
      duplicate_in_file: dupInFile,
      decision,
    };
  });

  // One statement per chunk instead of one per row: each round trip counts on a remote database.
  const writes = [];
  for (let i = 0; i < updates.length; i += BATCH) {
    writes.push(tx`update import_rows r set normalized = u.normalized, issues = u.issues, confidence = u.confidence,
        duplicate_of_company = u.duplicate_of_company, duplicate_of_lead = u.duplicate_of_lead,
        duplicate_in_file = u.duplicate_in_file, decision = u.decision
      from jsonb_to_recordset(${tx.json(updates.slice(i, i + BATCH) as never)}) as u(id uuid, normalized jsonb, issues text[], confidence numeric,
        duplicate_of_company uuid, duplicate_of_lead uuid, duplicate_in_file integer, decision public.row_decision)
      where r.id = u.id and r.import_id = ${importId}`);
  }
  writes.push(tx`update imports set column_mapping = ${tx.json(mapping)} where id = ${importId}`);
  await Promise.all(writes);
}

async function findExisting(rows: NormalizedRow[]) {
  const phones = [...new Set(rows.flatMap((r) => r.phones.map((p) => p.e164)).filter(Boolean))];
  const emails = [...new Set(rows.flatMap((r) => r.emails.map((e) => e.address.toLowerCase().trim())).filter(Boolean))];
  const names = [...new Set(rows.map((r) => r.company).filter(Boolean) as string[])];

  if (phones.length === 0 && emails.length === 0 && names.length === 0) {
    return (_row: NormalizedRow) => null;
  }

  const found = await asService(
    (tx) => tx`
      with keys as (
        select app.name_key(n) as k from unnest(${names}::text[]) n where n is not null and trim(n) <> ''
      ),
      ct_matches as (
        select ct.company_id
        from contacts ct
        where (${phones}::text[] <> '{}' and ct.phone_keys && ${phones}::text[])
           or (${emails}::text[] <> '{}' and exists (
                select 1 from jsonb_array_elements(case when jsonb_typeof(ct.emails) = 'array' then ct.emails else '[]'::jsonb end) em
                where lower(trim(coalesce(em ->> 'address', ''))) = any(${emails}::text[])
              ))
      )
      select c.id, c.name, c.name_key, c.state, c.city,
        coalesce(c.phone_keys, '{}') as phone_keys,
        (
          select coalesce(array_agg(distinct k), '{}')
          from (
            select unnest(c.phone_keys) as k
            union
            select unnest(ct.phone_keys) as k from contacts ct where ct.company_id = c.id
          ) s
          where k is not null
        ) as all_phone_keys,
        (
          select coalesce(array_agg(distinct lower(trim(em ->> 'address'))), '{}')
          from (
            select em from jsonb_array_elements(case when jsonb_typeof(c.emails) = 'array' then c.emails else '[]'::jsonb end) em
            union all
            select em from contacts ct, jsonb_array_elements(case when jsonb_typeof(ct.emails) = 'array' then ct.emails else '[]'::jsonb end) em
            where ct.company_id = c.id
          ) ems(em)
          where coalesce(em ->> 'address', '') <> ''
        ) as all_email_keys,
        (select l.id from leads l where l.company_id = c.id limit 1) as lead_id
      from companies c
      where (${phones}::text[] <> '{}' and c.phone_keys && ${phones}::text[])
         or (${names}::text[] <> '{}' and c.name_key in (select k from keys where k is not null and length(k) > 0))
         or (${emails}::text[] <> '{}' and exists (
              select 1 from jsonb_array_elements(case when jsonb_typeof(c.emails) = 'array' then c.emails else '[]'::jsonb end) em
              where lower(trim(coalesce(em ->> 'address', ''))) = any(${emails}::text[])
            ))
         or c.id in (select company_id from ct_matches)`,
  );

  const nameKey = (s: string) =>
    s.toLowerCase().replace(/\b(inc|llc|l\.l\.c|ltd|co|corp|corporation|company)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();

  return (row: NormalizedRow): { companyId: string; leadId: string | null } | null => {
    const rowPhones = row.phones.map((p) => p.e164).filter(Boolean);
    const rowEmails = row.emails.map((e) => e.address.toLowerCase().trim()).filter(Boolean);
    const rowNameKey = row.company ? nameKey(row.company) : null;
    const rowState = row.state ? row.state.toUpperCase() : null;
    const rowCity = row.city ? row.city.toLowerCase().trim() : null;

    const hit = found.find((c) => {
      const companyPhones = ((c.all_phone_keys as string[]) || (c.phone_keys as string[]) || []).filter(Boolean);
      const companyEmails = ((c.all_email_keys as string[]) || []).filter(Boolean);
      const cState = c.state ? String(c.state).toUpperCase() : null;
      const cCity = c.city ? String(c.city).toLowerCase().trim() : null;

      // 1. Exact phone match (e164 or last 10 digits)
      if (rowPhones.some((p) => companyPhones.includes(p))) return true;
      const rowDigits = rowPhones.map((p) => p.replace(/\D/g, "").slice(-10)).filter((d) => d.length === 10);
      const compDigits = companyPhones.map((p) => p.replace(/\D/g, "").slice(-10)).filter((d) => d.length === 10);
      if (rowDigits.some((d) => compDigits.includes(d))) return true;

      // 2. Email match
      if (rowEmails.some((e) => companyEmails.includes(e))) return true;

      // 3. Company name match (same name and compatible state/city)
      if (rowNameKey && c.name_key === rowNameKey) {
        if (rowState && cState && rowState !== cState) return false;
        if (rowCity && cCity && rowCity !== cCity) return false;
        return true;
      }

      return false;
    });

    return hit ? { companyId: hit.id, leadId: hit.lead_id } : null;
  };
}

export function sanitizeMapping(headers: string[], input: Record<string, string>): Record<string, Field> {
  const out: Record<string, Field> = {};
  for (const h of headers) {
    const v = input[h];
    out[h] = (FIELDS as readonly string[]).includes(v) ? (v as Field) : "ignore";
  }
  return out;
}

export type ApproveResult = { created: number; attached: number; skipped: number; reasons: Record<string, number> };

/**
 * Writes the approved rows as companies, contacts and leads in one transaction, as the user
 * (RLS applies). Ids are generated here so everything goes in as a few bulk statements.
 */
export async function approveImport(tx: Tx, user: CurrentUser, importId: string, ownerId: string): Promise<ApproveResult> {
  const [imp] = await tx`select id, status from imports where id = ${importId} for update`;
  if (!imp) throw new ImportError("Import not found.");
  if (imp.status !== "preview") throw new ImportError("This import was already processed.");
  const rows = await tx`select id, row_index, normalized, issues, duplicate_of_company, duplicate_of_lead, duplicate_in_file
    from import_rows where import_id = ${importId} and decision = 'include' order by row_index`;
  const result: ApproveResult = { created: 0, attached: 0, skipped: 0, reasons: {} };
  const skip = (why: string) => {
    result.skipped++;
    result.reasons[why] = (result.reasons[why] ?? 0) + 1;
  };

  // Existing companies some rows matched: which ones this user can see, and which already have a lead here.
  const matched = [...new Set(rows.map((r) => r.duplicate_of_company as string | null).filter(Boolean))] as string[];
  const [visible, withLead] = matched.length
    ? await Promise.all([
        tx`select id from companies where id = any(${matched}::uuid[])`,
        tx`select id, company_id from leads where company_id = any(${matched}::uuid[])`,
      ])
    : [[], []];
  const visibleIds = new Set(visible.map((r) => r.id as string));
  const companyToLead = new Map<string, string>(withLead.map((r) => [r.company_id as string, r.id as string]));

  const companies: Record<string, unknown>[] = [];
  const companiesToUpdate: { id: string; address?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; website?: string | null; website_domain?: string | null; time_zone?: string | null }[] = [];
  const contacts: Record<string, unknown>[] = [];
  const leadsToInsert: Record<string, unknown>[] = [];
  const leadsToUpdate: { id: string; contact_id: string | null }[] = [];
  const links: { id: string; lead_id: string }[] = [];
  for (const r of rows) {
    const n = r.normalized as NormalizedRow;
    const issues = r.issues as string[];
    if (issues.some((i) => BLOCKING_ISSUES.has(i)) || !n.company) {
      skip("missing company or contact details");
      continue;
    }

    let companyId: string;
    let isAttached = false;
    if (r.duplicate_of_company) {
      if (user.role !== "admin" && !visibleIds.has(r.duplicate_of_company)) {
        skip("shop belongs to another rep (ask an admin)");
        continue;
      }
      companyId = r.duplicate_of_company;
      isAttached = true;
      companiesToUpdate.push({
        id: companyId,
        address: n.address,
        city: n.city,
        state: n.state,
        postal_code: n.postal_code,
        website: n.website,
        website_domain: n.website_domain,
        time_zone: n.time_zone,
      });
    } else {
      companyId = randomUUID();
      companies.push({
        id: companyId, name: n.company, website: n.website, website_domain: n.website_domain, address: n.address, city: n.city,
        state: n.state, postal_code: n.postal_code, time_zone: n.time_zone, phones: n.contact_name ? [] : n.phones,
        emails: n.contact_name ? [] : n.emails, notes: n.notes, source: n.source ?? null, tags: n.area ? [n.area] : [],
      });
    }

    let contactId: string | null = null;
    if (n.contact_name) {
      contactId = randomUUID();
      contacts.push({ id: contactId, company_id: companyId, full_name: n.contact_name, title: n.title, phones: n.phones, emails: n.emails });
    }

    const existingLeadId = (r.duplicate_of_lead as string | null) ?? companyToLead.get(companyId) ?? null;
    if (existingLeadId) {
      leadsToUpdate.push({ id: existingLeadId, contact_id: contactId });
      links.push({ id: r.id, lead_id: existingLeadId });
      result.attached++;
    } else {
      const leadId = randomUUID();
      leadsToInsert.push({ id: leadId, company_id: companyId, primary_contact_id: contactId });
      companyToLead.set(companyId, leadId);
      links.push({ id: r.id, lead_id: leadId });
      if (isAttached) result.attached++;
      else result.created++;
    }
  }

  const chunks = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / BATCH) }, (_, i) => xs.slice(i * BATCH, (i + 1) * BATCH));
  // Order matters (contacts and leads reference companies), so each table waits for the previous one.
  for (const c of chunks(companies)) {
    await tx`insert into companies (id, name, website, website_domain, address, city, state, postal_code, time_zone, phones, emails, notes,
        source, tags, import_id, created_by)
      select x.id, x.name, x.website, x.website_domain, x.address, x.city, x.state, x.postal_code, x.time_zone, x.phones, x.emails, x.notes,
        x.source, x.tags, ${importId}, ${user.id}
      from jsonb_to_recordset(${tx.json(c as never)}) as x(id uuid, name text, website text, website_domain text, address text, city text,
        state text, postal_code text, time_zone text, phones jsonb, emails jsonb, notes text, source text, tags text[])`;
  }
  const uniqueCompaniesToUpdate = Array.from(new Map(companiesToUpdate.map((c) => [c.id, c])).values());
  for (const c of chunks(uniqueCompaniesToUpdate)) {
    await tx`update companies comp
      set address = coalesce(comp.address, x.address),
          city = coalesce(comp.city, x.city),
          state = coalesce(comp.state, x.state),
          postal_code = coalesce(comp.postal_code, x.postal_code),
          website = coalesce(comp.website, x.website),
          website_domain = coalesce(comp.website_domain, x.website_domain),
          time_zone = coalesce(comp.time_zone, x.time_zone),
          updated_at = now()
      from jsonb_to_recordset(${tx.json(c as never)}) as x(id uuid, address text, city text, state text, postal_code text,
        website text, website_domain text, time_zone text)
      where comp.id = x.id`;
  }
  for (const c of chunks(contacts)) {
    await tx`insert into contacts (id, company_id, full_name, title, phones, emails, is_primary, import_id, created_by)
      select x.id, x.company_id, x.full_name, x.title, x.phones, x.emails, true, ${importId}, ${user.id}
      from jsonb_to_recordset(${tx.json(c as never)}) as x(id uuid, company_id uuid, full_name text, title text, phones jsonb, emails jsonb)`;
  }
  for (const c of chunks(leadsToInsert)) {
    await tx`insert into leads (id, company_id, primary_contact_id, owner_id, source, import_id, created_by)
      select x.id, x.company_id, x.primary_contact_id, ${ownerId}, 'import', ${importId}, ${user.id}
      from jsonb_to_recordset(${tx.json(c as never)}) as x(id uuid, company_id uuid, primary_contact_id uuid)`;
  }
  const uniqueLeadsToUpdate = Array.from(new Map(leadsToUpdate.map((l) => [l.id, l])).values());
  for (const c of chunks(uniqueLeadsToUpdate)) {
    await tx`update leads l
      set owner_id = ${ownerId},
          import_id = ${importId},
          primary_contact_id = coalesce(x.contact_id, l.primary_contact_id),
          updated_at = now()
      from jsonb_to_recordset(${tx.json(c as never)}) as x(id uuid, contact_id uuid)
      where l.id = x.id`;
  }
  await Promise.all(
    chunks(links).map((c) => tx`update import_rows r set lead_id = x.lead_id
      from jsonb_to_recordset(${tx.json(c as never)}) as x(id uuid, lead_id uuid) where r.id = x.id and r.import_id = ${importId}`),
  );

  const [{ total_skipped }] = await tx`select count(*)::int as total_skipped from import_rows where import_id = ${importId} and decision = 'skip'`;
  await Promise.all([
    tx`update imports set status = 'approved', approved_by = ${user.id}, approved_at = now(), assign_to = ${ownerId},
      approved_count = ${result.created + result.attached}, skipped_count = ${result.skipped + total_skipped}
      where id = ${importId}`,
    tx`select app.log_audit('import.approved', 'imports', ${importId}, ${tx.json({ ...result, owner_id: ownerId })})`,
  ]);
  return result;
}
