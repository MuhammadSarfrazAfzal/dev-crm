/** Display names for enums. Call outcomes, deal stages and email statuses stay separate. */

/** What we sell. Every shop is offered both; a lead records which it wants or bought. */
export const PRODUCTS = ["pos", "wholesale"] as const;
export type Product = (typeof PRODUCTS)[number];
export const PRODUCT_LABEL: Record<Product, string> = { pos: "8staros POS", wholesale: "Wholesale phones & accessories" };
export const PRODUCT_SHORT: Record<Product, string> = { pos: "8staros POS", wholesale: "Wholesale" };

export const CALL_OUTCOMES = [
  "agreed", "interested", "connected", "callback_requested",
  "not_interested", "call_hangup",
  "no_answer", "busy", "wrong_number",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const HIDDEN_CALL_OUTCOMES = new Set<string>(["do_not_call", "voicemail", "gatekeeper"]);

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  agreed: "Agreed to Meeting / Demo",
  interested: "Interested in POS Service",
  connected: "Discovery in progress",
  callback_requested: "Call back later",
  not_interested: "Not interested",
  call_hangup: "Customer hung up",
  no_answer: "No answer",
  busy: "Line busy",
  wrong_number: "Wrong number",
};

/** Outcomes where the rep actually talked to someone at the shop. */
export const REACHED_OUTCOMES: readonly CallOutcome[] = ["agreed", "interested", "connected", "callback_requested", "not_interested", "call_hangup"];

/** Common next steps after a positive call; the rep can also type their own. */
export const NEXT_STEPS: string[] = [
  "Meeting with Founder to close deal",
  "Live POS Services Demo",
  "Send meeting link on WhatsApp",
  "Send calendar invite via Email",
  "Send custom POS proposal & quote",
  "Follow up on WhatsApp",
];

export const INTEREST_LEVELS = ["unknown", "not_interested", "curious", "interested", "hot"] as const;
export type InterestLevel = (typeof INTEREST_LEVELS)[number];
export const INTEREST_LABEL: Record<InterestLevel, string> = {
  unknown: "Unknown",
  not_interested: "Not interested",
  curious: "Curious",
  interested: "Interested",
  hot: "Hot",
};

export const EMAIL_STATUSES = ["not_needed", "pending", "drafted", "sent", "replied", "bounced", "opted_out"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];
export const EMAIL_STATUS_LABEL: Record<EmailStatus, string> = {
  not_needed: "Not needed",
  pending: "To send",
  drafted: "Drafted",
  sent: "Sent",
  replied: "Replied",
  bounced: "Bounced",
  opted_out: "Opted out",
};

export const DEAL_STAGES = ["prospect", "qualified", "proposal", "trial", "negotiation", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];
const STAGE_LABEL_BASE: Record<DealStage, string> = {
  prospect: "Prospect",
  qualified: "Qualified",
  proposal: "Proposal",
  trial: "Trial",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};
export function stageLabel(stage: DealStage, product?: Product | null): string {
  if (product === "pos") return ({ proposal: "Demo booked", trial: "Free trial" } as Partial<Record<DealStage, string>>)[stage] ?? STAGE_LABEL_BASE[stage];
  if (product === "wholesale") return ({ proposal: "Price list sent", trial: "Sample order" } as Partial<Record<DealStage, string>>)[stage] ?? STAGE_LABEL_BASE[stage];
  return STAGE_LABEL_BASE[stage];
}

export const LEAD_STATUSES = ["new", "working", "nurturing", "qualified", "unqualified", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  working: "Working",
  nurturing: "Nurturing",
  qualified: "Qualified",
  unqualified: "Unqualified",
  closed: "Closed",
};

export const SUPPRESSION_LABEL = {
  none: "OK to contact",
  do_not_call: "Do not call",
  do_not_email: "Do not email",
  do_not_contact: "Do not contact",
} as const;

export const SCRIPT_TYPES = ["opening", "gatekeeper", "voicemail", "objection", "closing", "follow_up_email"] as const;
export type ScriptType = (typeof SCRIPT_TYPES)[number];
export const SCRIPT_TYPE_LABEL: Record<ScriptType, string> = {
  opening: "Opening",
  gatekeeper: "Gatekeeper",
  voicemail: "Voicemail",
  objection: "Objection handling",
  closing: "Closing",
  follow_up_email: "Follow-up email",
};
