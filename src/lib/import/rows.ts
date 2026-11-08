/**
 * From extracted tables and texts to one raw row per business, and from a raw row to a
 * normalized lead. Pure (no database), so the server, the tests and the import benchmark
 * all run the same steps.
 */
import { getAiExtractor } from "./ai";
import { applyMapping, type Field } from "./columns";
import { tableFromText } from "./extractors/text";
import { normalizeRow } from "./normalize";
import { parseLabeledSections } from "./labeled-sections";
import { parseRecordBlocks } from "./record-blocks";
import { recordsFromText } from "./text-records";
import type { ExtractResult } from "./types";

export const MAX_ROWS = 5000;

/** What we keep per extracted row: the original cells plus where they came from. */
export type RawRow = {
  cells: Record<string, string>;
  from_text?: boolean;
  ocr_confidence?: number;
  /** "record-blocks" for directory-style layouts, "free-text" for the generic segmenter. */
  parser?: string;
  /** Original text the row was cut from, shown in the preview for rows that need a look. */
  snippet?: string;
  issues?: string[];
  field_confidence?: Record<string, number>;
  /** Values the user typed in the preview; they win over the mapped cells. */
  edited?: Partial<Record<Field, string>>;
};

/** Above this, the record-block structure explains the text well enough to trust it. */
const BLOCK_CONFIDENCE = 0.7;

/** Pasted text: a table when it is clearly one, otherwise free text. */
export function extractPaste(body: string): ExtractResult {
  const table = tableFromText(body, "pasted text");
  return table
    ? { tables: [table], texts: [], notes: [], parsers: ["paste-table"] }
    : { tables: [], texts: [{ source: "pasted text", text: body }], notes: [], parsers: ["paste-text"] };
}

export async function buildRawRows(extracted: ExtractResult) {
  const rows: { source: string; raw: RawRow }[] = [];
  const notes: string[] = [];
  for (const table of extracted.tables) {
    table.rows.forEach((cells, i) => {
      const record: Record<string, string> = {};
      table.headers.forEach((h, j) => (record[h] = cells[j] ?? ""));
      if (Object.values(record).some((v) => v.trim())) rows.push({ source: `${table.source} › row ${i + 2}`, raw: { cells: record } });
    });
  }
  const ai = getAiExtractor();
  for (const t of extracted.texts) {
    if (ai.enabled) {
      const records = await ai.extractRecords([t]);
      records.forEach((cells, i) => rows.push({ source: `${t.source} › record ${i + 1}`, raw: { cells, from_text: true, parser: `ai:${ai.name}` } }));
      continue;
    }
    const sections = parseLabeledSections(t.text);
    if (sections.records.length) {
      notes.push(`${t.source}: read as ${sections.records.length} numbered, labelled entries`);
      sections.records.forEach((cells, i) => rows.push({ source: `${t.source} › entry ${i + 1}`, raw: { cells, parser: "labeled-sections", ocr_confidence: t.ocrConfidence } }));
      continue;
    }
    const blocks = parseRecordBlocks(t.text);
    if (blocks.confidence >= BLOCK_CONFIDENCE) {
      notes.push(`${t.source}: read as a directory of ${blocks.records.length} entries (structure confidence ${Math.round(blocks.confidence * 100)}%)`);
      blocks.records.forEach((cells, i) =>
        rows.push({
          source: `${t.source} › ${cells["Record #"] ? `entry ${cells["Record #"]}` : `record ${i + 1}`}`,
          raw: { cells, parser: "record-blocks", ocr_confidence: t.ocrConfidence },
        }),
      );
      continue;
    }
    recordsFromText(t.text).forEach((r, i) =>
      rows.push({
        source: `${t.source} › record ${i + 1}`,
        raw: {
          cells: r.cells,
          from_text: true,
          ocr_confidence: t.ocrConfidence,
          parser: "free-text",
          snippet: r.snippet,
          issues: r.issues,
          field_confidence: r.fieldConfidence,
        },
      }),
    );
  }
  if (rows.length > MAX_ROWS) {
    notes.push(`Only the first ${MAX_ROWS} of ${rows.length} rows were kept. Split the file to import the rest.`);
    rows.length = MAX_ROWS;
  }
  return { rows, notes };
}

/** One raw row through the column mapping and normalization, as the preview shows it. */
export function normalizeRaw(raw: RawRow, mapping: Record<string, Field>) {
  return normalizeRow({ ...applyMapping(raw.cells, mapping), ...(raw.edited ?? {}) }, {
    fromText: raw.from_text,
    structured: raw.parser === "record-blocks" || raw.parser === "labeled-sections",
    ocrConfidence: raw.ocr_confidence,
    // Once a person has fixed the row, the parser's doubts no longer apply.
    extraIssues: raw.edited ? [] : raw.issues,
    companyConfidence: raw.edited ? 1 : raw.field_confidence?.company,
  });
}
