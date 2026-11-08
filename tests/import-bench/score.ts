/**
 * Runs each sample through the real import steps (extract → rows → column mapping →
 * normalize, exactly as the preview shows them) and counts, field by field, what came out
 * right, what was missed and what was wrong.
 */
import { suggestMapping } from "@/lib/import/columns";
import { extractUpload } from "@/lib/import/extract";
import type { NormalizedRow } from "@/lib/import/normalize";
import { buildRawRows, extractPaste, normalizeRaw } from "@/lib/import/rows";
import { validateFile } from "@/lib/import/sniff";
import { parsePhone } from "@/lib/phone";
import { normalizeState } from "@/lib/us";
import type { Expected, Sample } from "./corpus";

export const FIELDS = ["company", "contact", "phone", "email", "website", "address", "city", "state", "zip"] as const;
export type BenchField = (typeof FIELDS)[number];
export type Tally = { expected: number; correct: number; missed: number; wrong: number };
export type SampleResult = {
  name: string;
  rows: number;
  expectedRows: number;
  extraRows: number;
  fields: Record<BenchField, Tally>;
  problems: string[];
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const e164 = (p: string) => parsePhone(p).e164 ?? p;
const domain = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];

export async function rowsFor(sample: Sample): Promise<NormalizedRow[]> {
  let extracted;
  if (sample.kind === "paste") extracted = extractPaste(sample.text);
  else {
    const data = await sample.file();
    const name = `sample.${sample.kind}`;
    const v = validateFile(name, data, { maxBytes: 20 * 1024 * 1024 });
    if (!v.ok) throw new Error(`${sample.name}: ${v.reason}`);
    extracted = await extractUpload({ name, kind: v.kind, data }, { ocr: async () => ({ source: name, text: "" }) });
  }
  const { rows } = await buildRawRows(extracted);
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r.raw.cells)))];
  const mapping = suggestMapping(headers, rows.map((r) => r.raw.cells));
  return rows.map((r) => normalizeRaw(r.raw, mapping).row);
}

function matchRow(exp: Expected, rows: NormalizedRow[], used: Set<number>) {
  const phones = (exp.phones ?? []).map(e164);
  const emails = (exp.emails ?? []).map((e) => e.toLowerCase());
  let best = -1;
  let bestScore = 0;
  rows.forEach((r, i) => {
    if (used.has(i)) return;
    let score = 0;
    if (r.phones.some((p) => phones.includes(p.e164))) score += 2;
    if (r.emails.some((e) => emails.includes(e.address))) score += 2;
    if (norm(r.company) && norm(r.company) === norm(exp.company)) score += 3;
    if (score > bestScore) [best, bestScore] = [i, score];
  });
  return best;
}

export async function scoreSample(sample: Sample): Promise<SampleResult> {
  const rows = await rowsFor(sample);
  const fields = Object.fromEntries(FIELDS.map((f) => [f, { expected: 0, correct: 0, missed: 0, wrong: 0 }])) as Record<BenchField, Tally>;
  const problems: string[] = [];
  const used = new Set<number>();
  for (const exp of sample.expected) {
    const i = matchRow(exp, rows, used);
    if (i >= 0) used.add(i);
    const row = i >= 0 ? rows[i] : null;
    const check = (field: BenchField, want: string | undefined, got: string | null | undefined, same: (a: string, b: string) => boolean) => {
      if (want === undefined) return;
      const t = fields[field];
      t.expected++;
      if (!got) {
        t.missed++;
        problems.push(`${exp.company}: ${field} missed (want "${want}")`);
      } else if (!same(want, got)) {
        t.wrong++;
        problems.push(`${exp.company}: ${field} wrong (want "${want}", got "${got}")`);
      } else t.correct++;
    };
    check("company", exp.company, row?.company, (a, b) => norm(a) === norm(b));
    check("contact", exp.contact, row?.contact_name, (a, b) => norm(a) === norm(b));
    for (const p of exp.phones ?? []) {
      check("phone", p, row?.phones.some((x) => x.e164 === e164(p)) ? p : row?.phones.length ? row.phones.map((x) => x.e164).join(", ") : null, (a, b) => a === b);
    }
    for (const e of exp.emails ?? []) {
      check("email", e, row?.emails.some((x) => x.address === e.toLowerCase()) ? e : row?.emails.length ? row.emails.map((x) => x.address).join(", ") : null, (a, b) => a === b);
    }
    check("website", exp.website, row?.website, (a, b) => domain(a) === domain(b));
    check("address", exp.address, row?.address, (a, b) => norm(a) === norm(b));
    check("city", exp.city, row?.city, (a, b) => norm(a) === norm(b));
    check("state", exp.state, row?.state, (a, b) => normalizeState(a) === b);
    check("zip", exp.zip, row?.postal_code, (a, b) => a === b);
  }
  const extra = rows.filter((_, i) => !used.has(i));
  for (const r of extra) problems.push(`extra row: "${r.company ?? "?"}" ${r.phones.map((p) => p.e164).join(" ")}`);
  return { name: sample.name, rows: rows.length, expectedRows: sample.expected.length, extraRows: extra.length, fields, problems };
}

export function totals(results: SampleResult[]) {
  const t = Object.fromEntries(FIELDS.map((f) => [f, { expected: 0, correct: 0, missed: 0, wrong: 0 }])) as Record<BenchField, Tally>;
  for (const r of results) for (const f of FIELDS) for (const k of ["expected", "correct", "missed", "wrong"] as const) t[f][k] += r.fields[f][k];
  const all = FIELDS.reduce((a, f) => ({ expected: a.expected + t[f].expected, correct: a.correct + t[f].correct, missed: a.missed + t[f].missed, wrong: a.wrong + t[f].wrong }), { expected: 0, correct: 0, missed: 0, wrong: 0 });
  const extraRows = results.reduce((s, r) => s + r.extraRows, 0);
  return { byField: t, all, extraRows };
}
