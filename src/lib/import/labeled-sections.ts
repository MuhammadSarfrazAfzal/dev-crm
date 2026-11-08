/**
 * Parser for numbered, labelled write-ups such as a research agent's or a colleague's
 * notes:
 *
 *   1. Virtual Zone LLC
 *
 *   Phone: (305) 599-0778
 *   yellowpages
 *   Email: marketing@virtualzoneusa.com. Their Facebook page also lists (786) 502-6263.
 *   Address: 2470 NW 102nd Place Suite 106, Doral, FL. Yelp lists 2350 NW 102nd Pl instead.
 *   Contact: Maria Lara, the founder, who launched the business in 2009.
 *   Why a fit: a large wholesale distributor of cell phones.
 *
 * Each numbered heading starts one business and everything up to the next heading belongs
 * to it, blank lines included. The heading is the company; every phone and email in the
 * entry is kept, sentences included; the first labelled address is the address and the
 * rest goes to notes. Lone source-site words ("yellowpages", "bbb", "+2") are skipped.
 */
import { findAddress, maskContacts } from "./address";
import { EMAIL_RE, PHONE_RE } from "./text-records";

export type SectionRecord = Record<string, string>;

const HAS_PHONE = new RegExp(PHONE_RE.source, "i");
const HAS_EMAIL = new RegExp(EMAIL_RE.source, "i");

const HEADING_RE = /^\s*(?:#{1,4}\s*)?(?:\*\*)?\s*(?:#?\d{1,3}[.)]|\(\d{1,3}\))\s+(.+?)\s*(?:\*\*)?\s*$/;
const LABEL_RE = /^\s*(?:[-*•]\s*)?(?:\*\*)?([A-Za-z][A-Za-z /&'-]{1,30}?)(?:\*\*)?\s*:\s*(?:\*\*)?\s*(.*)$/;
type Kind = "phone" | "email" | "address" | "contact" | "website" | "notes" | "title" | "other";
const LABELS: [Kind, RegExp][] = [
  ["phone", /^(phone|phones|tel|telephone|mobile|cell|whatsapp|main line|number)$/i],
  ["email", /^(e-?mails?|mail)$/i],
  ["address", /^(address|addresses|location|hq|headquarters|street address|office)$/i],
  ["contact", /^(contact|contacts|owner|decision maker|key contact|person|people|founder|ceo|manager)$/i],
  ["title", /^(title|role|position)$/i],
  ["website", /^(website|site|web|url|homepage)$/i],
  ["notes", /^(why a fit|why|fit|notes?|summary|about|description|details|reason|comments?|what they do|products)$/i],
];
/** A line that is only a source-site word or a "+2"-style counter. */
const SOURCE_WORD_RE = /^\s*(?:[a-z0-9][a-z0-9.-]{1,40}|\+\d{1,3}|[A-Z]{2,5})\s*$/;
const NO_NAME_RE = /^(no|none|n\/a|not found|unknown)\b|no (owner|contact|name)/i;
const ALIAS_RE = /\s*\((?:also (?:listed|known) as|aka|a\.k\.a\.|formerly|dba|d\/b\/a|trading as)\s+([^)]+)\)\s*$/i;
const TITLE_WORDS = /\b(founder|co-founder|owner|co-owner|president|vice president|vp|ceo|cfo|coo|cto|director|manager|general manager|gm|partner|buyer|purchasing manager|sales manager|principal)\b/i;

function kindOf(label: string): Kind {
  for (const [kind, re] of LABELS) if (re.test(label.trim())) return kind;
  return "other";
}

/** "Maria Lara, the founder, who launched…" → name and title, the rest to notes. */
function readContact(value: string): { name?: string; title?: string; rest?: string } {
  const v = value.trim().replace(/\.$/, "");
  if (!v || NO_NAME_RE.test(v)) return {};
  const m = v.match(/^([A-Z][a-zA-Z'’-]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-zA-Z'’-]+){0,2})\b(.*)$/);
  if (!m) return { rest: value.trim() };
  const after = m[2].replace(/^[\s,;(–—-]+/, "");
  // "listed as CEO and President", "the founder", "(Owner)".
  const t = after.match(/^(?:listed as |the |our |is the |is |as )?([^,.;()]*?\b(?:founder|co-founder|owner|co-owner|president|vice president|vp|ceo|cfo|coo|cto|director|manager|partner|buyer|principal)\b[^,.;()]*)/i);
  const title = t && TITLE_WORDS.test(t[1]) ? t[1].replace(/^(listed as|the|our)\s+/i, "").trim() : undefined;
  const rest = (t ? after.slice(t[0].length) : after).replace(/^[\s,;).–—-]+/, "").trim();
  return {
    name: m[1].trim(),
    title: title ? title.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, "and").replace(/\bCeo\b/g, "CEO").replace(/\bVp\b/g, "VP") : undefined,
    rest: rest || undefined,
  };
}

/** First sentence of a value; the rest is extra detail for the notes. */
function splitSentence(value: string): [string, string] {
  // A sentence ends at ". " followed by a capital, but not after a one- or two-letter
  // abbreviation like "St." or "FL." that is followed by a ZIP.
  const m = value.match(/^(.*?[.!?])\s+(?=[A-Z][a-z])/);
  return m ? [m[1].trim(), value.slice(m[0].length).trim()] : [value.trim(), ""];
}

export function parseLabeledSections(text: string): { records: SectionRecord[]; confidence: number } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sections: { heading: string; body: string[] }[] = [];
  for (const raw of lines) {
    const h = raw.match(HEADING_RE);
    // A heading is a short name, not a sentence and not a labelled line.
    if (h && (HAS_PHONE.test(h[1]) || HAS_EMAIL.test(h[1]))) return { records: [], confidence: 0 }; // one-line entries: not this layout
    if (h && h[1].length <= 120 && !LABEL_RE.test(h[1]) && h[1].split(/\s+/).length <= 14) {
      sections.push({ heading: h[1].replace(/\*\*/g, "").trim(), body: [] });
      continue;
    }
    if (sections.length) sections[sections.length - 1].body.push(raw);
  }
  if (!sections.length) return { records: [], confidence: 0 };

  let labelled = 0;
  const records: SectionRecord[] = [];
  for (const s of sections) {
    const rec: SectionRecord = {};
    const notes: string[] = [];
    const alias = s.heading.match(ALIAS_RE);
    rec.Company = s.heading.replace(ALIAS_RE, "").trim();
    if (alias) notes.push(`Also listed as ${alias[1].trim()}`);
    const phones: string[] = [];
    const emails: string[] = [];
    let labels = 0;
    for (const raw of s.body) {
      const line = raw.trim();
      if (!line || SOURCE_WORD_RE.test(line)) continue;
      for (const p of line.match(new RegExp(PHONE_RE.source, "gi")) ?? []) if (!phones.includes(p.trim())) phones.push(p.trim());
      for (const e of line.match(new RegExp(EMAIL_RE.source, "gi")) ?? []) if (!emails.includes(e.toLowerCase())) emails.push(e.toLowerCase());
      const m = line.match(LABEL_RE);
      const kind = m ? kindOf(m[1]) : "other";
      if (!m || kind === "other") {
        // Unlabelled lines that only repeat the listing ("Virtual Zone - Doral, FL 33172") are skipped.
        continue;
      }
      labels++;
      const value = m[2].trim();
      if (kind === "phone" || kind === "email") {
        const [, extra] = splitSentence(value);
        if (extra) notes.push(extra);
      } else if (kind === "address") {
        if (rec.Address || rec.City) {
          notes.push(`Also listed at: ${value}`);
          continue;
        }
        const masked = maskContacts(value, [PHONE_RE, EMAIL_RE]);
        const found = findAddress(masked);
        if (found && (found.street || found.city)) {
          if (found.street) rec.Address = found.street;
          if (found.city) rec.City = found.city;
          if (found.state) rec.State = found.state;
          if (found.zip) rec.Zip = found.zip;
          const extra = value.slice(found.end).replace(/^[\s.,;]+/, "").trim();
          if (extra) notes.push(extra);
        } else rec.Address = value.replace(/\.$/, "");
      } else if (kind === "contact") {
        const c = readContact(value);
        if (c.name) rec.Contact = c.name;
        if (c.title) rec.Title = c.title;
        if (c.rest) notes.push(c.rest.replace(/^who\s+/i, "").replace(/^./, (x) => x.toUpperCase()));
      } else if (kind === "title") {
        rec.Title = value.replace(/\.$/, "");
      } else if (kind === "website") {
        const site = value.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/i);
        if (site) rec.Website = site[0].replace(/[.,;]$/, "");
      } else if (kind === "notes") {
        notes.push(`${m[1].trim()}: ${value}`);
      }
    }
    if (phones.length) rec.Phone = phones.join("; ");
    if (emails.length) rec.Email = emails.join("; ");
    if (notes.length) rec.Notes = notes.join(" · ");
    if (labels >= 2 && (phones.length || emails.length)) labelled++;
    records.push(rec);
  }
  const confidence = labelled / sections.length;
  return { records: confidence >= 0.6 && records.length >= 1 ? records : [], confidence };
}
