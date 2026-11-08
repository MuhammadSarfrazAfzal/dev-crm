import type { ExtractContext, ExtractResult, Extractor, InputFile } from "./types";
import { delimitedExtractor } from "./extractors/delimited";
import { textExtractor } from "./extractors/text";
import { xlsxExtractor } from "./extractors/xlsx";
import { docxExtractor } from "./extractors/docx";
import { pdfExtractor } from "./extractors/pdf";
import { imageExtractor } from "./extractors/image";
import { makeZipExtractor } from "./extractors/zip";
import { validateFile } from "./sniff";
import { inspectZip } from "./zip-safety";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Runs the right extractor for a validated file. ZIP entries come back through here. */
export async function extractFile(file: InputFile, ctx: ExtractContext): Promise<ExtractResult> {
  if (file.kind === "xlsx" || file.kind === "docx") {
    const check = inspectZip(file.data);
    if (!check.ok) throw new Error(check.reason);
  }
  const extractor = REGISTRY.find((e) => e.kinds.includes(file.kind));
  if (!extractor) throw new Error(`No parser for ${file.kind}`);
  return extractor.extract(file, ctx);
}

const zipExtractor = makeZipExtractor(async (name, data, ctx) => {
  const v = validateFile(name, data, { maxBytes: MAX_UPLOAD_BYTES });
  if (!v.ok) throw new Error(v.reason);
  return extractFile({ name, kind: v.kind, data }, ctx);
});

const REGISTRY: Extractor[] = [delimitedExtractor, textExtractor, xlsxExtractor, docxExtractor, pdfExtractor, imageExtractor, zipExtractor];

export async function extractUpload(file: InputFile, ctx: Omit<ExtractContext, "depth">): Promise<ExtractResult> {
  return extractFile(file, { ...ctx, depth: 0 });
}
