import { tableFromRows } from "../table-shape";
import type { ExtractedTable, Extractor } from "../types";
import { decodeText, parseDelimited } from "./delimited";

/** A text file that is really a table (tabs or consistent commas) is treated as one. */
export function looksTabular(text: string): "\t" | "," | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  if (lines.length < 2) return null;
  for (const d of ["\t", ","] as const) {
    const counts = lines.map((l) => l.split(d).length - 1);
    if (counts[0] >= 2 && counts.every((c) => c === counts[0])) return d;
  }
  return null;
}

/**
 * A table copied out of a PDF or a web page, with runs of spaces between columns:
 * every line splits into the same number of columns.
 */
function spaceColumns(text: string): string[][] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  const rows = lines.map((l) => l.trim().split(/\s{2,}|\t/));
  const width = rows[0].length;
  return width >= 2 && rows.every((r) => r.length === width) ? rows : null;
}

/** Text that is really a table (tabs, consistent commas, or space-aligned columns), else null. */
export function tableFromText(text: string, source: string): ExtractedTable | null {
  const delimiter = looksTabular(text);
  if (delimiter) return parseDelimited(text, source, delimiter);
  const grid = spaceColumns(text);
  return grid ? tableFromRows(grid, source).table : null;
}

export const textExtractor: Extractor = {
  name: "text",
  kinds: ["txt"],
  async extract(file) {
    const text = decodeText(file.data);
    const table = tableFromText(text, file.name);
    if (table) return { tables: [table], texts: [], notes: [], parsers: ["text-table"] };
    return { tables: [], texts: [{ source: file.name, text }], notes: [], parsers: ["text"] };
  },
};
