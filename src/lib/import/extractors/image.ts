import type { Extractor } from "../types";

export const imageExtractor: Extractor = {
  name: "tesseract",
  kinds: ["png", "jpeg", "webp", "gif", "bmp", "tiff"],
  async extract(file, ctx) {
    const text = await ctx.ocr(file.data, file.name);
    const notes = [`${file.name}: read with OCR (confidence ${Math.round((text.ocrConfidence ?? 0) * 100)}%)`];
    return { tables: [], texts: text.text.trim() ? [text] : [], notes, parsers: ["tesseract-ocr"] };
  },
};
