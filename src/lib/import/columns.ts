/** Matching spreadsheet headers to CRM fields. */
import { US_STATES } from "../us";

export const FIELDS = [
  "company", "contact_name", "first_name", "last_name", "title", "phone", "mobile", "email", "website",
  "address", "city", "state", "postal_code", "source", "area", "record_number", "notes", "details", "ignore",
] as const;
export type Field = (typeof FIELDS)[number];

export const FIELD_LABEL: Record<Field, string> = {
  company: "Company name", contact_name: "Contact name", first_name: "First name", last_name: "Last name", title: "Job title",
  phone: "Phone", mobile: "Mobile phone", email: "Email", website: "Website", address: "Street address", city: "City",
  state: "State", postal_code: "ZIP code", source: "Found on (source)", area: "Area / tag", record_number: "Record number",
  notes: "Notes", details: "Mixed details (read automatically)", ignore: "— Ignore —",
};

// Ordered strongest first; headers are compared after lower-casing and stripping punctuation.
const SYNONYMS: [Field, string[]][] = [
  ["company", ["company", "company name", "business", "business name", "shop", "shop name", "store", "store name", "account", "account name", "organization", "organisation", "dba", "legal name", "merchant", "retailer", "customer"]],
  ["first_name", ["first name", "firstname", "first", "given name"]],
  ["last_name", ["last name", "lastname", "last", "surname", "family name"]],
  ["contact_name", ["contact", "contact name", "contact person", "owner", "owner name", "manager", "full name", "person", "decision maker", "person in charge", "point of contact", "poc", "name"]],
  ["title", ["title", "job title", "position", "role"]],
  ["mobile", ["mobile", "mobile phone", "mobile number", "cell", "cell phone", "cellphone", "whatsapp"]],
  ["phone", ["phone", "phone number", "telephone", "tel", "main phone", "business phone", "office phone", "work phone", "phone 1", "phone 2", "phone1", "phone2", "number", "contact number", "landline"]],
  ["email", ["email", "e mail", "email address", "mail", "work email", "business email", "email 1", "email 2"]],
  ["website", ["website", "web", "web site", "url", "site", "domain", "homepage"]],
  ["address", ["address", "street", "street address", "address 1", "address line 1", "addr", "location", "full address", "mailing address", "physical address"]],
  ["city", ["city", "town", "locality"]],
  ["state", ["state", "st", "province", "state code"]],
  ["postal_code", ["zip", "zip code", "zipcode", "postal code", "postcode", "postal"]],
  ["source", ["source", "lead source", "listing", "listing source", "found on", "directory", "source url"]],
  ["area", ["area", "metro", "metro area", "region", "market", "territory", "tag", "tags", "section", "group"]],
  ["record_number", ["record", "record #", "record no", "no", "entry", "entry no", "id", "ref", "reference"]],
  ["notes", ["notes", "note", "comments", "comment", "description", "remarks", "category", "industry"]],
  ["details", ["details", "contact info", "contact information", "contact details", "info", "information", "contacts"]],
];

const norm = (h: string) => h.toLowerCase().replace(/[_\-./#:()]+/g, " ").replace(/\s+/g, " ").trim();

function fieldFor(header: string): Field | null {
  const h = norm(header);
  for (const [field, words] of SYNONYMS) if (words.includes(h)) return field;
  // Looser contains-match for headers like "Primary Phone (work)" or "Owner Email".
  if (/\bemail\b|\be mail\b/.test(h)) return "email";
  if (/\b(mobile|cell)\b/.test(h)) return "mobile";
  if (/\b(phone|tel|telephone)\b/.test(h)) return "phone";
  if (/\b(website|url)\b/.test(h)) return "website";
  if (/\b(zip|postal)\b/.test(h)) return "postal_code";
  if (/\b(company|business|store|shop)\b/.test(h)) return "company";
  if (/\b(owner|manager|contact person|decision maker)\b/.test(h)) return "contact_name";
  return null;
}

const SINGLE: Field[] = ["company", "contact_name", "first_name", "last_name", "title", "website", "address", "city", "state", "postal_code", "source", "area", "record_number"];

const PHONE = /^(?:\+?1[ .-]?)?\(?[2-9]\d{2}\)?[ .-]?[2-9]\d{2}[ .-]?\d{4}(?:\s*(?:x|ext\.?)\s*\d+)?$/i;
const PHONE_IN = /(?:\+?1[ .-]?)?\(?[2-9]\d{2}\)?[ .-]?[2-9]\d{2}[ .-]?\d{4}\b/;
const EMAIL = /^[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i;
const EMAIL_IN = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,24}/i;
const URL = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?$/i;
const STATE = new RegExp(`^(?:${US_STATES.map((s) => s.code).join("|")}|${US_STATES.map((s) => s.name).join("|")})$`, "i");
const ZIP = /^\d{5}(?:-\d{4})?$/;
const STREET = /^\d{1,6}\s+[A-Za-z0-9]/;
const CITY = /^[A-Za-z][A-Za-z .'-]{1,30}$/;

/** What a column holds, judged from its values: used when the header says nothing useful. */
function fieldFromValues(values: string[]): Field | null {
  const v = values.map((x) => (x ?? "").trim()).filter(Boolean);
  if (!v.length) return null;
  const share = (test: (x: string) => boolean) => v.filter(test).length / v.length;
  const split = (x: string) => x.split(/\s*[;,/]\s*/).filter(Boolean);
  if (share((x) => split(x).every((p) => PHONE.test(p))) >= 0.8) return "phone";
  if (share((x) => split(x).every((p) => EMAIL.test(p))) >= 0.8) return "email";
  if (share((x) => URL.test(x) && !EMAIL_IN.test(x)) >= 0.8) return "website";
  if (share((x) => STATE.test(x)) >= 0.8) return "state";
  if (share((x) => ZIP.test(x)) >= 0.8) return "postal_code";
  // Several kinds of contact data in one cell ("704-555-0220 qcw@example.com").
  if (share((x) => (PHONE_IN.test(x) ? 1 : 0) + (EMAIL_IN.test(x) ? 1 : 0) + (STREET.test(x) ? 1 : 0) >= 1 && !PHONE.test(x) && !EMAIL.test(x)) >= 0.5) return "details";
  if (share((x) => STREET.test(x)) >= 0.8) return "address";
  return null;
}

/**
 * Suggests a field per header. Single-value fields are used once; the next match becomes
 * notes or contact. Headers that say nothing ("Column 3", "Info") are matched by what
 * their values look like when sample rows are given.
 */
export function suggestMapping(headers: string[], samples: Record<string, string>[] = []): Record<string, Field> {
  const mapping: Record<string, Field> = {};
  const used = new Set<Field>();
  for (const header of headers) {
    let field = fieldFor(header) ?? "ignore";
    if (SINGLE.includes(field) && used.has(field)) {
      field = field === "company" && !used.has("contact_name") ? "contact_name" : "notes";
    }
    used.add(field);
    mapping[header] = field;
  }
  // Columns the header didn't explain: judge them by their values.
  if (samples.length) {
    const values = (h: string) => samples.slice(0, 200).map((r) => r[h] ?? "");
    for (const h of headers) {
      const field = fieldFromValues(values(h));
      // A "Contact" column full of phone numbers holds phone numbers, whatever its name says.
      if (field && ["phone", "email", "details"].includes(field) && (["contact_name", "ignore"].includes(mapping[h]) || /^column \d+$/i.test(h))) {
        used.delete(mapping[h]);
        mapping[h] = field;
        used.add(field);
        continue;
      }
      if (mapping[h] !== "ignore" && mapping[h] !== "notes") continue;
      if (mapping[h] === "notes" && !/^column \d+$/i.test(h)) continue;
      if (field && !(SINGLE.includes(field) && used.has(field))) {
        mapping[h] = field;
        used.add(field);
      }
    }
    // Plain words left over: the first unmatched text column is the business, and a short
    // place name next to a state column is the city.
    for (const [i, h] of headers.entries()) {
      if (mapping[h] !== "ignore") continue;
      const v = values(h).filter((x) => x.trim());
      if (!v.length || !v.every((x) => /[a-z]{2}/i.test(x) && !PHONE_IN.test(x) && !EMAIL_IN.test(x))) continue;
      if (!used.has("company")) {
        mapping[h] = "company";
        used.add("company");
      } else if (!used.has("city") && mapping[headers[i + 1]] === "state" && v.every((x) => CITY.test(x))) {
        mapping[h] = "city";
        used.add("city");
      }
    }
  }
  // A lone "Name" column with no company column is almost always the business.
  if (!used.has("company")) {
    const nameHeader = headers.find((h) => mapping[h] === "contact_name" && norm(h) === "name");
    if (nameHeader) mapping[nameHeader] = "company";
  }
  return mapping;
}

/** Collects one row's values per field using a mapping. Multi-value fields are joined with "; ". */
export function applyMapping(raw: Record<string, string>, mapping: Record<string, Field>): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = mapping[header] ?? "ignore";
    const v = (value ?? "").trim();
    if (field === "ignore" || !v) continue;
    out[field] = out[field] ? `${out[field]}; ${v}` : v;
  }
  return out;
}
