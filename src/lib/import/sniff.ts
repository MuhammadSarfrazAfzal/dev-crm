/**
 * Upload validation: the file's extension and its first bytes must agree, and both must
 * be on the allow-list. Nothing is trusted from the browser's Content-Type.
 */

export type FileKind = "csv" | "tsv" | "txt" | "xlsx" | "docx" | "pdf" | "png" | "jpeg" | "webp" | "gif" | "bmp" | "tiff" | "zip";

export const IMAGE_KINDS: FileKind[] = ["png", "jpeg", "webp", "gif", "bmp", "tiff"];

const EXT_KIND: Record<string, FileKind> = {
  csv: "csv", tsv: "tsv", txt: "txt", text: "txt", xlsx: "xlsx", docx: "docx", pdf: "pdf",
  png: "png", jpg: "jpeg", jpeg: "jpeg", webp: "webp", gif: "gif", bmp: "bmp", tif: "tiff", tiff: "tiff", zip: "zip",
};

export const MIME: Record<FileKind, string> = {
  csv: "text/csv", tsv: "text/tab-separated-values", txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf", png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  bmp: "image/bmp", tiff: "image/tiff", zip: "application/zip",
};

export const ACCEPT = Object.keys(EXT_KIND).map((e) => `.${e}`).join(",");

function startsWith(buf: Uint8Array, bytes: number[], offset = 0) {
  return bytes.every((b, i) => buf[offset + i] === b);
}

function looksLikeText(buf: Uint8Array) {
  const sample = buf.subarray(0, 4096);
  if (sample.length === 0) return true;
  let control = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  return control / sample.length < 0.02;
}

/** Detects the real type from magic bytes. Zip-based Office files are told apart by entry names. */
export function sniff(buf: Uint8Array): FileKind | "zip-container" | "text" | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (startsWith(buf, [0x42, 0x4d])) return "bmp";
  if (startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a])) return "tiff";
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) return "zip-container";
  if (looksLikeText(buf)) return "text";
  return null;
}

export type Validation = { ok: true; kind: FileKind; mime: string } | { ok: false; reason: string };

export function validateFile(filename: string, buf: Uint8Array, { maxBytes }: { maxBytes: number }): Validation {
  if (buf.length === 0) return { ok: false, reason: "The file is empty." };
  if (buf.length > maxBytes) return { ok: false, reason: `The file is larger than ${Math.round(maxBytes / 1_048_576)} MB.` };
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const claimed = EXT_KIND[ext];
  if (!claimed) return { ok: false, reason: `".${ext || "?"}" files aren't supported.` };
  const actual = sniff(buf);
  const textKinds: FileKind[] = ["csv", "tsv", "txt"];
  const zipKinds: FileKind[] = ["xlsx", "docx", "zip"];
  const agrees =
    actual === claimed ||
    (actual === "text" && textKinds.includes(claimed)) ||
    (actual === "zip-container" && zipKinds.includes(claimed));
  if (!agrees) return { ok: false, reason: `The file's contents don't match its .${ext} name.` };
  return { ok: true, kind: claimed, mime: MIME[claimed] };
}

/** Filename safe for storage metadata and Content-Disposition. */
export function safeFilename(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const clean = base.normalize("NFKC").replace(/[^\w.\- ()]+/g, "_").replace(/^\.+/, "").slice(0, 120);
  return clean || "file";
}
