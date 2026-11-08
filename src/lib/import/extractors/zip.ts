import type { ExtractContext, ExtractResult, Extractor } from "../types";
import { mergeResults } from "../types";
import { safeFilename, validateFile } from "../sniff";
import { ignoredEntry, inspectZip, unzipEntries, ZIP_LIMITS } from "../zip-safety";

/** Unpacks one level of a zip and runs each supported file through its own extractor. */
export function makeZipExtractor(extractOne: (name: string, data: Uint8Array, ctx: ExtractContext) => Promise<ExtractResult>): Extractor {
  return {
    name: "zip",
    kinds: ["zip"],
    async extract(file, ctx) {
      if (ctx.depth > 0) return { tables: [], texts: [], notes: [`${file.name}: nested archives are skipped`], parsers: [] };
      const check = inspectZip(file.data);
      if (!check.ok) throw new Error(check.reason);
      const notes: string[] = [];
      const wanted = new Set<string>();
      for (const e of check.entries) {
        if (ignoredEntry(e.name)) continue;
        wanted.add(e.name);
      }
      const files = unzipEntries(file.data, wanted);
      const results: ExtractResult[] = [];
      for (const [name, data] of Object.entries(files)) {
        // Entry names are only used as labels; nothing is written to disk.
        const label = `${safeFilename(file.name)} › ${safeFilename(name)}`;
        const v = validateFile(name, data, { maxBytes: ZIP_LIMITS.maxEntryBytes });
        if (!v.ok) {
          notes.push(`${label}: skipped (${v.reason})`);
          continue;
        }
        if (v.kind === "zip") {
          notes.push(`${label}: nested archive skipped`);
          continue;
        }
        try {
          results.push(await extractOne(label, data, { ...ctx, depth: ctx.depth + 1 }));
        } catch (err) {
          notes.push(`${label}: could not be read (${err instanceof Error ? err.message : "error"})`);
        }
      }
      const merged = mergeResults(results);
      return { ...merged, notes: [...notes, ...merged.notes], parsers: ["zip", ...merged.parsers] };
    },
  };
}
