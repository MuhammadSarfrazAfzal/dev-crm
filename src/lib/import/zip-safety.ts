import { unzipSync } from "fflate";

export const ZIP_LIMITS = {
  maxEntries: 200,
  maxEntryBytes: 20 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  maxRatio: 100,
};

export type ZipEntryInfo = { name: string; size: number; originalSize: number };

/**
 * Reads the zip directory without inflating anything and refuses archives that look
 * like zip bombs (too many entries, too large once unpacked, extreme compression ratio).
 */
export function inspectZip(data: Uint8Array, limits = ZIP_LIMITS): { ok: true; entries: ZipEntryInfo[] } | { ok: false; reason: string } {
  const entries: ZipEntryInfo[] = [];
  try {
    unzipSync(data, {
      filter(file) {
        entries.push({ name: file.name, size: file.size, originalSize: file.originalSize });
        return false;
      },
    });
  } catch {
    return { ok: false, reason: "The archive is damaged or encrypted." };
  }
  const files = entries.filter((e) => !e.name.endsWith("/"));
  if (files.length > limits.maxEntries) return { ok: false, reason: `The archive has more than ${limits.maxEntries} files.` };
  const total = files.reduce((s, e) => s + e.originalSize, 0);
  if (total > limits.maxTotalBytes) return { ok: false, reason: "The archive is too large once unpacked." };
  for (const e of files) {
    if (e.originalSize > limits.maxEntryBytes) return { ok: false, reason: `${e.name} is too large once unpacked.` };
    if (e.size > 0 && e.originalSize / e.size > limits.maxRatio && e.originalSize > 1024 * 1024) {
      return { ok: false, reason: `${e.name} is compressed suspiciously well (possible zip bomb).` };
    }
  }
  return { ok: true, entries: files };
}

/** True for entries we never look at: folders, macOS metadata, hidden files. */
export function ignoredEntry(name: string) {
  const base = name.split("/").pop() ?? "";
  return name.endsWith("/") || name.startsWith("__MACOSX/") || base.startsWith(".") || base === "Thumbs.db";
}

export function unzipEntries(data: Uint8Array, names: Set<string>): Record<string, Uint8Array> {
  return unzipSync(data, { filter: (f) => names.has(f.name) });
}
