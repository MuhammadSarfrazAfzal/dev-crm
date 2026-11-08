/**
 * Layout-aware text from a PDF page: glyph runs are grouped into lines by their baseline
 * and ordered left to right, and wide horizontal gaps become runs of spaces. Columns
 * (e.g. a phone number printed at the right edge) stay on the same line, separated by
 * at least three spaces, the way `pdftotext -layout` prints them.
 */
type TextItem = { str: string; transform: number[]; width: number; height: number };

export type PdfPageLike = { getTextContent(): Promise<{ items: unknown[] }> };

export async function pageLayoutText(page: PdfPageLike): Promise<string> {
  const content = await page.getTextContent();
  const items = (content.items as TextItem[]).filter((i) => typeof i.str === "string" && i.str.length > 0 && Array.isArray(i.transform));
  if (!items.some((i) => i.str.trim())) return "";
  const left = Math.min(...items.filter((i) => i.str.trim()).map((i) => i.transform[4]));

  // Group by baseline (y), allowing for small jitter between runs on the same line.
  const sorted = [...items].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  const lines: { y: number; height: number; items: TextItem[] }[] = [];
  for (const item of sorted) {
    const y = item.transform[5];
    const h = Math.abs(item.transform[3]) || item.height || 10;
    const line = lines.find((l) => Math.abs(l.y - y) <= Math.max(2, Math.min(h, l.height) * 0.4));
    if (line) line.items.push(item);
    else lines.push({ y, height: h, items: [item] });
  }
  lines.sort((a, b) => b.y - a.y);

  const out: string[] = [];
  let prevY: number | null = null;
  let prevHeight = 12;
  for (const line of lines) {
    // Keep paragraph breaks: a vertical jump bigger than ~1.8 lines becomes a blank line.
    if (prevY !== null && prevY - line.y > Math.max(prevHeight, line.height) * 1.8) out.push("");
    line.items.sort((a, b) => a.transform[4] - b.transform[4]);
    const first = line.items.find((i) => i.str.trim());
    if (!first) continue;
    // Indented lines (continuations, details under a numbered entry) keep an indent.
    let text = first.transform[4] - left > 10 ? "        " : "";
    let cursor: number | null = null;
    for (const item of line.items) {
      const x = item.transform[4];
      const size = Math.abs(item.transform[0]) || line.height;
      const width = item.width || item.str.length * size * 0.5;
      if (!item.str.trim()) {
        // Whitespace runs carry the gap width; a wide one separates columns.
        if (cursor !== null) text += width > size * 1.5 ? "    " : text.endsWith(" ") ? "" : " ";
        cursor = x + width;
        continue;
      }
      if (cursor !== null) {
        const gap = x - cursor;
        if (gap > size * 1.5) text += text.endsWith("    ") ? "" : "    ";
        else if (gap > size * 0.15 && !text.endsWith(" ")) text += " ";
      }
      text += item.str;
      cursor = x + width;
    }
    out.push(text.replace(/\s+$/, ""));
    prevY = line.y;
    prevHeight = line.height;
  }
  return out.join("\n");
}
