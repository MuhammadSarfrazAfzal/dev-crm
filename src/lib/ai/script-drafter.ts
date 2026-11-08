/**
 * Optional AI script drafting. Phase 1 ships only the disabled implementation: no
 * provider, no keys, no network calls. A future provider implements the same interface
 * and its output is always a draft an admin edits and publishes by hand.
 */
import type { Product, ScriptType } from "../labels";

export type DraftRequest = { product: Product | null; scriptType: ScriptType; brief: string; currentBody?: string };

export interface ScriptDrafter {
  readonly enabled: boolean;
  readonly reason: string;
  draft(req: DraftRequest): Promise<string | null>;
}

export const disabledScriptDrafter: ScriptDrafter = {
  enabled: false,
  reason: "AI drafting is turned off. No AI provider is configured in Phase 1.",
  async draft() {
    return null;
  },
};

export function getScriptDrafter(): ScriptDrafter {
  return disabledScriptDrafter;
}
