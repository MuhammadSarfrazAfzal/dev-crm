import mammoth from "mammoth";
import { tableFromRows } from "../table-shape";
import type { ExtractedTable, Extractor } from "../types";

const decodeEntities = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const stripTags = (s: string) => decodeEntities(s.replace(/<br\s*\/?>/gi, " ").replace(/<\/p>\s*<p>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

/** Pulls tables out of mammoth's HTML; the rest of the document becomes free text. */
export function tablesFromHtml(html: string, source: string): { tables: ExtractedTable[]; rest: string } {
  const tables: ExtractedTable[] = [];
  const rest = html.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml) => {
    const rows = [...tableHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((tr) => [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripTags(m[1])));
    const nonEmpty = rows.filter((r) => r.some(Boolean));
    if (nonEmpty.length >= 2) {
      const { table } = tableFromRows(nonEmpty, `${source} › table ${tables.length + 1}`);
      if (table) tables.push(table);
    }
    return "\n";
  });
  const text = decodeEntities(rest.replace(/<\/(p|h\d|li)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/\n{3,}/g, "\n\n").trim();
  return { tables, rest: text };
}

export const docxExtractor: Extractor = {
  name: "mammoth",
  kinds: ["docx"],
  async extract(file) {
    const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(file.data) });
    const { tables, rest } = tablesFromHtml(html, file.name);
    return { tables, texts: rest ? [{ source: file.name, text: rest }] : [], notes: [], parsers: ["mammoth"] };
  },
};
