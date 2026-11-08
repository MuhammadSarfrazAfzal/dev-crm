/**
 * Messy-import benchmark: runs every sample in tests/import-bench through the real import
 * steps and prints, per field, how many values came out right, were missed or were wrong.
 * "Samples" is the set the parser was tuned on; "unseen" was written afterwards and never
 * tuned against.
 *
 *   npm run import:bench            summary tables
 *   npm run import:bench -- -v      plus every miss, mistake and extra row
 */
import { SAMPLES, type Sample } from "../tests/import-bench/corpus";
import { FRESH } from "../tests/import-bench/fresh";
import { HOLDOUT } from "../tests/import-bench/holdout";
import { RESEARCH } from "../tests/import-bench/research";
import { FIELDS, scoreSample, totals, type SampleResult } from "../tests/import-bench/score";

const verbose = process.argv.includes("-v");

async function run(title: string, samples: Sample[]) {
  console.log(`\n== ${title} ==`);
  const results: SampleResult[] = [];
  for (const s of samples) {
    const r = await scoreSample(s);
    results.push(r);
    const ok = FIELDS.reduce((a, f) => a + r.fields[f].correct, 0);
    const all = FIELDS.reduce((a, f) => a + r.fields[f].expected, 0);
    console.log(`${String(ok).padStart(3)}/${String(all).padEnd(3)} rows ${r.rows}/${r.expectedRows}  ${r.name}`);
    if (verbose) for (const p of r.problems) console.log(`          - ${p}`);
  }
  const t = totals(results);
  console.log("\nfield      correct  missed  wrong  of");
  for (const f of FIELDS) {
    const x = t.byField[f];
    console.log(`${f.padEnd(10)} ${String(x.correct).padStart(7)} ${String(x.missed).padStart(7)} ${String(x.wrong).padStart(6)} ${String(x.expected).padStart(4)}`);
  }
  console.log(`${"all".padEnd(10)} ${String(t.all.correct).padStart(7)} ${String(t.all.missed).padStart(7)} ${String(t.all.wrong).padStart(6)} ${String(t.all.expected).padStart(4)}`);
  console.log(`\n${Math.round((t.all.correct / t.all.expected) * 1000) / 10}% of fields right · ${t.all.missed} missed · ${t.all.wrong} wrong · ${t.extraRows} extra rows`);
}

await run(`Samples (${SAMPLES.length})`, SAMPLES);
await run(`Unseen samples (${HOLDOUT.length})`, HOLDOUT);
await run(`Fresh samples, never tuned on (${FRESH.length})`, FRESH);
await run(`Research-style write-ups (${RESEARCH.length})`, RESEARCH);
