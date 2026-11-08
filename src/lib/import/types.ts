import type { FileKind } from "./sniff";

/** A table found in a file: header row plus data rows, all as text. */
export type ExtractedTable = { source: string; headers: string[]; rows: string[][] };

/** Free text found in a file (document body, OCR output, pasted text). */
export type ExtractedText = { source: string; text: string; ocrConfidence?: number };

export type ExtractResult = {
  tables: ExtractedTable[];
  texts: ExtractedText[];
  /** Human-readable notes: skipped zip entries, OCR used, pages without text… */
  notes: string[];
  parsers: string[];
};

export type InputFile = { name: string; kind: FileKind; data: Uint8Array };

/** One parser per file family. New formats plug in by adding an extractor to the registry. */
export interface Extractor {
  name: string;
  kinds: FileKind[];
  extract(file: InputFile, ctx: ExtractContext): Promise<ExtractResult>;
}

export type ExtractContext = {
  /** Runs OCR on an image buffer; injected so tests and callers can swap engines. */
  ocr: (image: Uint8Array, source: string) => Promise<ExtractedText>;
  depth: number;
};

export function emptyResult(): ExtractResult {
  return { tables: [], texts: [], notes: [], parsers: [] };
}

export function mergeResults(results: ExtractResult[]): ExtractResult {
  return {
    tables: results.flatMap((r) => r.tables),
    texts: results.flatMap((r) => r.texts),
    notes: results.flatMap((r) => r.notes),
    parsers: [...new Set(results.flatMap((r) => r.parsers))],
  };
}
