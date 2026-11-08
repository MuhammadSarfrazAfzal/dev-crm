import type { FilterGroup } from "@/components/leads/FilterBar";
import { CALL_OUTCOMES, DEAL_STAGES, EMAIL_STATUSES, INTEREST_LEVELS, LEAD_STATUSES, EMAIL_STATUS_LABEL, INTEREST_LABEL, LEAD_STATUS_LABEL, OUTCOME_LABEL, stageLabel, SUPPRESSION_LABEL, HIDDEN_CALL_OUTCOMES, type CallOutcome, type DealStage, type EmailStatus, type InterestLevel, type LeadStatus } from "@/lib/labels";
import { ATTEMPT_BUCKETS, FOLLOWUP_BUCKETS, PRODUCT_FILTERS, SUPPRESSIONS, type LeadFacets, type LeadFilters, type MultiKey } from "@/server/leads";
import { stateName } from "@/lib/us";

const ATTEMPTS: Record<string, string> = { "0": "Not called yet", "1": "1 call", "2": "2 calls", "3+": "3 or more" };
const PRODUCT: Record<string, string> = {
  pos: "Interested in 8staros POS",
  wholesale: "Interested in wholesale",
  bought_pos: "Bought 8staros POS",
  bought_wholesale: "Bought wholesale",
  none: "No product interest yet",
};
const FOLLOWUP: Record<string, string> = { overdue: "Overdue", today: "Due today", upcoming: "Upcoming", none: "No follow-up" };

/**
 * Builds the filter menus in the order of the table's columns, with readable labels and
 * the count of leads each option would show.
 */
export function filterGroups({ f, facets, owners, imports, isAdmin, userId }: {
  f: LeadFilters;
  facets: LeadFacets;
  owners: { id: string; full_name: string; role?: string }[];
  imports: Record<string, string>;
  isAdmin: boolean;
  userId: string;
}): FilterGroup[] {
  const adminOwners = owners.filter((o) => o.role === "admin");
  const salespersonOwners = owners.filter((o) => o.role === "salesperson");

  const ownerLabel = (id: string) => (id === "none" ? "Unassigned" : id === userId ? `${owners.find((o) => o.id === id)?.full_name ?? "Me"} (me)` : owners.find((o) => o.id === id)?.full_name ?? "Someone else");
  const label: Record<MultiKey, (v: string) => string> = {
    product: (v) => PRODUCT[v] ?? v,
    status: (v) => LEAD_STATUS_LABEL[v as LeadStatus] ?? v,
    area: (v) => v,
    city: (v) => v,
    state: (v) => `${stateName(v) ?? v} (${v})`,
    tz: (v) => v.replace(/_/g, " "),
    suppression: (v) => SUPPRESSION_LABEL[v as keyof typeof SUPPRESSION_LABEL] ?? v,
    outcome: (v) => (v === "none" || HIDDEN_CALL_OUTCOMES.has(v) ? "Not called yet" : OUTCOME_LABEL[v as CallOutcome] ?? v),
    attempts: (v) => ATTEMPTS[v] ?? v,
    followup: (v) => FOLLOWUP[v] ?? v,
    owner: ownerLabel,
    salesperson: ownerLabel,
    interest: (v) => INTEREST_LABEL[v as InterestLevel] ?? v,
    stage: (v) => (v === "none" ? "No deal" : stageLabel(v as DealStage)),
    email: (v) => EMAIL_STATUS_LABEL[v as EmailStatus] ?? v,
    import: (v) => (v === "manual" ? "Added by hand" : imports[v] ?? "Import"),
  };
  const order: [MultiKey, string, boolean?][] = [
    ["status", "Status"],
    ["product", "Products"],
    ["area", "Area", true],
    ["city", "City", true],
    ["state", "State", true],
    ["tz", "Time zone"],
    ["suppression", "Contact permission"],
    ["outcome", "Last call"],
    ["attempts", "Calls"],
    ["followup", "Follow-up"],
    ["owner", "Owner", true],
    ["salesperson", "Salesperson", true],
    ["interest", "Interest"],
    ["stage", "Deal stage"],
    ["email", "Email"],
    ["import", "Import", true],
  ];
  // Fixed sets are always listed (0 when no lead has them); data-driven ones show what exists.
  const fixed: Partial<Record<MultiKey, readonly string[]>> = {
    product: PRODUCT_FILTERS, status: LEAD_STATUSES, suppression: SUPPRESSIONS, outcome: ["none", ...CALL_OUTCOMES], attempts: ATTEMPT_BUCKETS,
    followup: FOLLOWUP_BUCKETS, interest: INTEREST_LEVELS, stage: [...DEAL_STAGES, "none"], email: EMAIL_STATUSES,
  };
  const options = (key: MultiKey) => {
    const counts = new Map(facets[key]?.map((o) => [o.value, o.count]) ?? []);
    if (key === "owner") {
      // In the owner filter, only admin assign lead has to show + Unassigned
      const adminValues = ["none", ...adminOwners.map((o) => o.id)];
      return adminValues.map((v) => ({ value: v, label: label.owner(v), count: counts.get(v) ?? 0 }));
    }
    if (key === "salesperson") {
      // Filter of salesperson where can filter the lead assign to the salesperson by their name
      const spValues = salespersonOwners.map((o) => o.id);
      return spValues.map((v) => ({ value: v, label: label.salesperson(v), count: counts.get(v) ?? 0 }));
    }
    const values = fixed[key] ?? facets[key].map((o) => o.value);
    return values.map((v) => ({ value: v, label: label[key](v), count: counts.get(v) ?? 0 }));
  };
  return order
    .filter(([key]) => (key !== "owner" && key !== "salesperson") || isAdmin)
    .map(([key, title, searchable]) => ({
      key,
      label: title,
      searchable,
      selected: f[key],
      options: options(key),
    }));
}
