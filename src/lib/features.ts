/**
 * Parts of the CRM that are built but switched off for now. Flip one to `true` to bring it
 * back; nothing else needs to change.
 */
export const FEATURES = {
  /** The Research agent page (Data › Research agent). Off: leads come in through Import. */
  researchAgent: false,
} as const;
