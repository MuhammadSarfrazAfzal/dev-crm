/**
 * Optional AI structured extraction. Phase 1 ships only the disabled implementation:
 * no provider, no keys, no network calls. A real provider would implement the same
 * interface and must keep the human preview/approval step.
 */
import type { ExtractedText } from "./types";

export type AiRecord = Record<string, string>;

export interface AiExtractor {
  readonly enabled: boolean;
  readonly name: string;
  extractRecords(texts: ExtractedText[]): Promise<AiRecord[]>;
}

export const disabledAiExtractor: AiExtractor = {
  enabled: false,
  name: "none",
  async extractRecords() {
    return [];
  },
};

export function getAiExtractor(): AiExtractor {
  // AI_PROVIDER is read so configuration is visible, but no provider exists in Phase 1.
  return disabledAiExtractor;
}
