/** What the research agent can be asked to look up, and what a result row looks like. */

export const RESEARCH_FIELDS = ["phones", "emails", "contacts", "addresses", "websites", "socials"] as const;
export type ResearchField = (typeof RESEARCH_FIELDS)[number];

export const RESEARCH_FIELD_LABEL: Record<ResearchField, { label: string; hint: string }> = {
  phones: { label: "Phone numbers", hint: "Main line, mobile, WhatsApp" },
  emails: { label: "Email addresses", hint: "Owner, sales or general inbox" },
  contacts: { label: "Contact names", hint: "Owner or manager, with job title" },
  addresses: { label: "Street addresses", hint: "Street, city, state and ZIP" },
  websites: { label: "Website", hint: "The shop's own site, not listing pages" },
  socials: { label: "Social profiles", hint: "Facebook, Instagram, Google listing" },
};

export const RESEARCH_MODES = ["website", "company", "area"] as const;
export type ResearchMode = (typeof RESEARCH_MODES)[number];

export type ResearchTarget = {
  mode: ResearchMode;
  /** A URL for "website", a business name for "company", a category for "area". */
  query: string;
  /** City / state / metro, used by "company" and "area". */
  location: string | null;
  fields: ResearchField[];
  maxResults: number;
};

/** One business found by a provider. Every field is optional except the name. */
export type ResearchResult = {
  company: string;
  contactName?: string | null;
  title?: string | null;
  phones?: string[];
  emails?: string[];
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  website?: string | null;
  socials?: string[];
  /** The page the details were read from. */
  sourceUrl?: string | null;
};
