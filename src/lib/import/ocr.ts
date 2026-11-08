import fs from "node:fs";
import path from "node:path";
import type { ExtractedText } from "./types";

/**
 * Local OCR with tesseract.js and the English model shipped in @tesseract.js-data/eng.
 * No network: langPath points at the installed package.
 */
const OCR_TIMEOUT_MS = 90_000;

// Resolved from the project root rather than require.resolve, which bundlers rewrite.
function langPath() {
  const dir = process.env.OCR_LANG_PATH ?? path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
  if (!fs.existsSync(path.join(dir, "eng.traineddata.gz"))) throw new Error(`OCR language data not found in ${dir}`);
  return dir;
}

type Worker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;
let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker, OEM }) =>
      createWorker("eng", OEM.LSTM_ONLY, {
        langPath: langPath(),
        cacheMethod: "none",
        gzip: true,
        // Report worker errors through the promise instead of crashing the process.
        errorHandler: (err: unknown) => console.error("OCR worker error:", err),
      }),
    );
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
}

/** OCRs one image. Calls are serialized through one worker to keep memory bounded. */
export async function ocrImage(image: Uint8Array, source: string): Promise<ExtractedText> {
  const run = queue.then(async () => {
    const worker = await getWorker();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("OCR took too long")), OCR_TIMEOUT_MS);
    });
    const { data } = await Promise.race([worker.recognize(Buffer.from(image)), timeout])
      .catch(async (err) => {
        // A stuck or broken worker is thrown away; the next call starts a fresh one.
        await shutdownOcr().catch(() => undefined);
        throw err;
      })
      .finally(() => clearTimeout(timer));
    return { source, text: data.text, ocrConfidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)) };
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function shutdownOcr() {
  if (workerPromise) {
    const w = await workerPromise;
    workerPromise = null;
    await w.terminate();
  }
}
