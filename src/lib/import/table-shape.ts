/**
 * Turns the raw grid of a spreadsheet, CSV or Word table into header + rows the way a
 * person reads it: title lines above the header are skipped, a file with no header row
 * gets numbered columns (and keeps its first row as data), and empty columns are dropped.
 */
import type { ExtractedTable } from "./types";

const PHONE = /(?:\+?1[ .-]?)?\(?[2-9]\d{2}\)?[ .-]?[2-9]\d{2}[ .-]?\d{4}\b/;
const EMAIL = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,24}/i;
const URL = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|biz|us|co|shop|store)\b/i;
const STREET = /^\s*\d{1,6}\s+\S+/;

/** A cell that holds data (a phone, email, website or street), never a column title. */
export const isDataCell = (c: string) => PHONE.test(c) || EMAIL.test(c) || URL.test(c) || STREET.test(c);

export function tableFromRows(grid: string[][], source: string): { table: ExtractedTable | null; notes: string[] } {
  const rows = grid.map((r) => r.map((c) => (c ?? "").trim())).filter((r) => r.some(Boolean));
  const notes: string[] = [];
  if (!rows.length) return { table: null, notes };
  const filled = (r: string[]) => r.filter(Boolean).length;

  // The header: the first row near the top with at least two labels, no data in it, and data below.
  let headerAt = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].some(isDataCell)) break;
    // A one-column sheet has one-cell headers ("Lead" above "Shop - 480-555-0408").
    const labels = Math.max(...rows.map((r) => r.filter(Boolean).length)) === 1 ? 1 : 2;
    if (filled(rows[i]) >= labels && rows.slice(i + 1).some((r) => r.some(isDataCell) || (labels === 2 && filled(r) >= 2))) {
      headerAt = i;
      break;
    }
  }
  const width = Math.max(...rows.map((r) => r.length));
  let headers: string[];
  let data: string[][];
  if (headerAt >= 0) {
    if (headerAt > 0) notes.push(`${source}: skipped ${headerAt} title line(s) above the header`);
    headers = Array.from({ length: width }, (_, i) => rows[headerAt][i] || `Column ${i + 1}`);
    data = rows.slice(headerAt + 1);
  } else {
    // No header row: the first row is already a business. Skip leading single-cell titles.
    const first = rows.findIndex((r) => filled(r) >= 2);
    if (first > 0) notes.push(`${source}: skipped ${first} title line(s)`);
    if (first >= 0) notes.push(`${source}: no header row, columns matched by their contents`);
    headers = Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
    data = rows.slice(Math.max(0, first));
  }
  // Drop columns that are empty everywhere (spacer columns in spreadsheets).
  const keep = headers.map((h, i) => !/^Column \d+$/.test(h) || data.some((r) => (r[i] ?? "").trim()));
  const keepIdx = keep.map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
  // Header names must be unique to key a row's cells.
  const seen = new Map<string, number>();
  const names = keepIdx.map((i) => {
    const h = headers[i];
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n > 1 ? `${h} (${n})` : h;
  });
  return {
    table: { source, headers: names, rows: data.map((r) => keepIdx.map((i) => r[i] ?? "")).filter((r) => r.some(Boolean)) },
    notes,
  };
}
