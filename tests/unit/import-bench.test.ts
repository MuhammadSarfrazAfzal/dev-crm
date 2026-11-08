import { describe, expect, it } from "vitest";
import { SAMPLES, type Sample } from "../import-bench/corpus";
import { FRESH } from "../import-bench/fresh";
import { HOLDOUT } from "../import-bench/holdout";
import { RESEARCH } from "../import-bench/research";
import { scoreSample, totals } from "../import-bench/score";

/**
 * The messy-input benchmark (`npm run import:bench` prints the full table). These checks
 * keep the import from sliding back: nearly every field read, nothing read wrongly, and
 * no junk rows.
 */
async function score(samples: Sample[]) {
  const results = [];
  for (const s of samples) results.push(await scoreSample(s));
  return totals(results);
}

describe("messy import benchmark", () => {
  it.each([
    ["tuning samples", SAMPLES],
    ["unseen samples", HOLDOUT],
    ["fresh samples", FRESH],
    ["research write-ups", RESEARCH],
  ] as const)("%s: fields read, none wrong, no junk rows", async (_name, samples) => {
    const t = await score(samples as Sample[]);
    expect(t.all.correct / t.all.expected).toBeGreaterThanOrEqual(0.97);
    expect(t.all.wrong).toBe(0);
    expect(t.extraRows).toBe(0);
  });
});
