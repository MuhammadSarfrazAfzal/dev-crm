import { Badge, type Tone } from "./ui";
import {
  EMAIL_STATUS_LABEL, INTEREST_LABEL, LEAD_STATUS_LABEL, OUTCOME_LABEL, SUPPRESSION_LABEL, stageLabel,
  HIDDEN_CALL_OUTCOMES,
  type CallOutcome, type DealStage, type EmailStatus, type Product, type InterestLevel, type LeadStatus,
} from "@/lib/labels";

const OUTCOME_TONE: Record<CallOutcome, Tone> = {
  no_answer: "slate", busy: "slate", wrong_number: "red", connected: "brand",
  callback_requested: "amber", interested: "green", not_interested: "slate",
  call_hangup: "red",
};
export const OutcomeBadge = ({ outcome }: { outcome: string | null }) => {
  if (!outcome || HIDDEN_CALL_OUTCOMES.has(outcome)) {
    return <span className="text-xs text-subtle">Not called</span>;
  }
  const label = OUTCOME_LABEL[outcome as CallOutcome];
  if (!label) return <span className="text-xs text-subtle">Not called</span>;
  return <Badge tone={OUTCOME_TONE[outcome as CallOutcome] ?? "slate"}>{label}</Badge>;
};

const INTEREST_TONE: Record<InterestLevel, Tone> = { unknown: "slate", not_interested: "slate", curious: "sky", interested: "green", hot: "red" };
export const InterestBadge = ({ interest }: { interest: string }) => <Badge tone={INTEREST_TONE[interest as InterestLevel]}>{INTEREST_LABEL[interest as InterestLevel]}</Badge>;

const EMAIL_TONE: Record<EmailStatus, Tone> = { not_needed: "slate", pending: "violet", drafted: "violet", sent: "sky", replied: "green", bounced: "red", opted_out: "red" };
export const EmailBadge = ({ status }: { status: string }) => <Badge tone={EMAIL_TONE[status as EmailStatus]}>{EMAIL_STATUS_LABEL[status as EmailStatus]}</Badge>;

const STAGE_TONE: Record<DealStage, Tone> = { prospect: "slate", qualified: "sky", proposal: "brand", trial: "violet", negotiation: "amber", won: "green", lost: "red" };
export const StageBadge = ({ stage, product }: { stage: string; product?: Product | null }) => <Badge tone={STAGE_TONE[stage as DealStage]}>{stageLabel(stage as DealStage, product)}</Badge>;

const STATUS_TONE: Record<LeadStatus, Tone> = { new: "sky", working: "brand", nurturing: "violet", qualified: "green", unqualified: "slate", closed: "slate" };
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status as LeadStatus]}>{LEAD_STATUS_LABEL[status as LeadStatus]}</Badge>;

export const SuppressionBadge = ({ suppression }: { suppression: string }) =>
  suppression === "none" ? null : <Badge tone="red">{SUPPRESSION_LABEL[suppression as keyof typeof SUPPRESSION_LABEL]}</Badge>;
