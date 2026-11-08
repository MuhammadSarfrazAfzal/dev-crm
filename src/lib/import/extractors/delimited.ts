import Papa from "papaparse";
import { tableFromRows } from "../table-shape";
import type { Extractor, ExtractedTable } from "../types";

export function decodeText(data: Uint8Array): string {
  // Strip a UTF-8 BOM; fall back to Windows-1252 when the bytes aren't valid UTF-8.
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(data);
  }
}

/** Parses CSV/TSV text into a table; title lines are skipped and a missing header is allowed. */
export function parseDelimitedWithNotes(text: string, source: string, delimiter?: string) {
  const parsed = Papa.parse<string[]>(text.trim(), { delimiter: delimiter ?? "", skipEmptyLines: "greedy" });
  return tableFromRows(parsed.data, source);
}

export function parseDelimited(text: string, source: string, delimiter?: string): ExtractedTable | null {
  return parseDelimitedWithNotes(text, source, delimiter).table;
}

export const delimitedExtractor: Extractor = {
  name: "papaparse",
  kinds: ["csv", "tsv"],
  async extract(file) {
    const { table, notes } = parseDelimitedWithNotes(decodeText(file.data), file.name, file.kind === "tsv" ? "\t" : undefined);
    return { tables: table ? [table] : [], texts: [], notes: table ? notes : [`${file.name}: no rows found`], parsers: ["papaparse"] };
  },
};
