/**
 * Turns research results into the same kind of table an uploaded spreadsheet produces,
 * so they go through column matching, normalization, duplicate checks and the approval
 * step exactly like a file import.
 */
import type { ExtractedTable } from "../import/types";
import type { ResearchResult } from "./types";

export const RESEARCH_HEADERS = ["Company", "Contact", "Title", "Phone", "Email", "Website", "Address", "City", "State", "ZIP", "Source", "Notes"] as const;

export function resultsToTable(results: ResearchResult[], source = "research agent"): ExtractedTable {
  const join = (v: string[] | undefined) => (v ?? []).map((s) => s.trim()).filter(Boolean).join("; ");
  return {
    source,
    headers: [...RESEARCH_HEADERS],
    rows: results
      .filter((r) => r.company?.trim())
      .map((r) => [
        r.company.trim(),
        r.contactName ?? "",
        r.title ?? "",
        join(r.phones),
        join(r.emails),
        r.website ?? "",
        r.address ?? "",
        r.city ?? "",
        r.state ?? "",
        r.postalCode ?? "",
        r.sourceUrl ?? "",
        r.socials?.length ? `Social: ${join(r.socials)}` : "",
      ]),
  };
}
