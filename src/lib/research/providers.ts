/**
 * Research providers: an agent (Codex/OpenAI, Claude, Gemini or a custom endpoint) that
 * browses the public web and returns ResearchResult rows. This is the adapter interface
 * only. Every provider ships disabled: no keys are read, no network calls are made, and
 * `run` refuses. Connecting one later means implementing `run` and flipping `enabled`
 * from server-side configuration; results still go through the import preview.
 */
import type { ResearchResult, ResearchTarget } from "./types";

export type ProviderId = "openai-codex" | "anthropic-claude" | "google-gemini" | "custom";

export interface ResearchProvider {
  readonly id: ProviderId;
  readonly label: string;
  readonly vendor: string;
  readonly description: string;
  readonly enabled: boolean;
  run(target: ResearchTarget): Promise<ResearchResult[]>;
}

export class ProviderNotConnectedError extends Error {
  constructor(label: string) {
    super(`${label} is not connected yet.`);
  }
}

function disabled(id: ProviderId, label: string, vendor: string, description: string): ResearchProvider {
  return {
    id,
    label,
    vendor,
    description,
    enabled: false,
    async run() {
      throw new ProviderNotConnectedError(label);
    },
  };
}

export const RESEARCH_PROVIDERS: readonly ResearchProvider[] = [
  disabled("openai-codex", "Codex", "OpenAI", "OpenAI's agent with web browsing. Good at reading many listing pages in one run."),
  disabled("anthropic-claude", "Claude", "Anthropic", "Claude with web search and fetch. Careful extraction with the source of every value."),
  disabled("google-gemini", "Gemini", "Google", "Gemini with Google Search grounding. Strong on map and business listings."),
  disabled("custom", "Custom agent", "Your own", "Any agent or scraper that returns the same result format over HTTPS."),
];

export function getResearchProvider(id: string): ResearchProvider | undefined {
  return RESEARCH_PROVIDERS.find((p) => p.id === id);
}

export const isProviderId = (v: string): v is ProviderId => RESEARCH_PROVIDERS.some((p) => p.id === v);
