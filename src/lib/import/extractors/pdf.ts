import { getDocumentProxy, renderPageAsImage } from "unpdf";
import type { ExtractedText, Extractor } from "../types";
import { pageLayoutText } from "../pdf-layout";

const MAX_PAGES = 300;
const MAX_OCR_PAGES = 20;

/**
 * Layout-aware text layer first (columns kept apart, like `pdftotext -layout`); pages with
 * no text (scans) are rendered and OCR'd locally. Text pages are joined into one text so a
 * record or section heading that crosses a page break stays together.
 */
export const pdfExtractor: Extractor = {
  name: "unpdf",
  kinds: ["pdf"],
  async extract(file, ctx) {
    const pdf = await getDocumentProxy(new Uint8Array(file.data));
    const pageCount = Math.min(pdf.numPages, MAX_PAGES);
    const textPages: string[] = [];
    const ocrTexts: ExtractedText[] = [];
    const notes: string[] = [];
    const parsers = ["unpdf-layout"];
    let ocrPages = 0;
    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const text = await pageLayoutText(page);
      if (text.replace(/\s/g, "").length >= 20) {
        textPages.push(text);
        continue;
      }
      const source = `${file.name} › page ${i}`;
      if (ocrPages >= MAX_OCR_PAGES) {
        notes.push(`${source}: no text layer; OCR limit reached`);
        continue;
      }
      ocrPages++;
      try {
        const png = await renderPageAsImage(pdf, i, { scale: 2, canvasImport: () => import("@napi-rs/canvas") });
        ocrTexts.push(await ctx.ocr(new Uint8Array(png), source));
        notes.push(`${source}: scanned page, read with OCR`);
        if (!parsers.includes("tesseract-ocr")) parsers.push("tesseract-ocr");
      } catch (err) {
        notes.push(`${source}: OCR failed (${err instanceof Error ? err.message : "error"})`);
      }
    }
    if (pdf.numPages > MAX_PAGES) notes.push(`Only the first ${MAX_PAGES} of ${pdf.numPages} pages were read`);
    notes.unshift(`${file.name}: ${pdf.numPages} page(s) read`);
    const texts: ExtractedText[] = textPages.length ? [{ source: file.name, text: textPages.join("\n\n\f\n") }] : [];
    return { tables: [], texts: [...texts, ...ocrTexts], notes, parsers };
  },
};
