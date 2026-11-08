/**
 * Turns unstructured text (pasted lists, notes, email signatures, Word documents, OCR of
 * screenshots or scans) into one row per business. Every phone and email is an anchor; the
 * nearest name, address and city lines are attached to it, and blank lines, bullets,
 * numbering and repeated line patterns mark where one business ends and the next begins.
 * Rows that can't be split cleanly are flagged and keep the original snippet so the user
 * can fix them in the preview. Nothing is saved without approval.
 */
import { US_STATES } from "../us";
import { findAddress, maskContacts } from "./address";

// Separators never include newlines, and a leading "1" must not be the tail of another number.
export const PHONE_RE = /(?<![\d])(?:\+?1[ \t.-]?)?\(?[2-9]\d{2}\)?[ \t.-]?[2-9]\d{2}[ \t.-]?\d{4}\b(?:[ \t]*(?:x|ext\.?|extension)[ \t]*\d{1,6})?/gi;
export const EMAIL_RE = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|biz|info|us|co|shop|store|io|tech|mobi|example)(?:\/[^\s,;]*)?/gi;
const STATE_NAMES = US_STATES.map((s) => s.name).join("|");
const CITY_STATE_RE = new RegExp(`([A-Za-z][A-Za-z .'-]{1,40}),\\s*(${US_STATES.map((s) => s.code).join("|")}|${STATE_NAMES})\\b\\.?(?:\\s+(\\d{5})(?:-\\d{4})?)?`);
// "Plano TX 75074" without a comma: only trusted when a ZIP follows.
const CITY_STATE_ZIP_RE = new RegExp(`([A-Za-z][A-Za-z .'-]{1,40}?)\\s+(${US_STATES.map((s) => s.code).join("|")})\\s+(\\d{5})(?:-\\d{4})?\\b`);
// The verb in any case, the name capitalized: "ask for Dana", "Spoke with Lee Park".
const ASK_FOR_RE = /\b(?:[Aa]sk for|[Ss]peak (?:to|with)|[Ss]poke (?:to|with)|[Tt]alked (?:to|with))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/;
const STREET_RE = /^\s*\d{1,6}\s+[A-Za-z0-9 .'#-]+\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|highway|fwy|freeway|loop|suite|ste|plaza|sq|square|cir|circle|trl|trail)\b/i;
const LABEL_RE = /^\s*(company name|business name|shop name|store name|company|business|biz|shop|store|name|contact person|person in charge|contact|owner|manager|buyer|phone|ph#?|tel\.?(?:\s*no\.?)?|telephone|number|mobile|cell|fax|email|e-mail|e|mail|website|web|url|address|addr|location|loc|city|state|zip|notes?)\s*[:\-–]\s*(.+)$/i;
const INLINE_LABEL_RE = /(?:^|\s)(name|company|business|number|phone|tel|mobile|cell|mail|e-?mail|address|addr|website|web|contact|owner|city|state|zip)\s*:/gi;
const COMPANY_LABELS = new Set(["company name", "business name", "shop name", "store name", "company", "business", "biz", "shop", "store"]);
const CONTACT_LABELS = new Set(["contact person", "person in charge", "contact", "owner", "manager", "buyer"]);
/** "owner Ray Ortiz", "manager: Lina Park", "guy named Carlos", "spoke to Jenny Tran". */
const CONTACT_RE = /\b(?:(?:[Rr]un|[Oo]wned|[Mm]anaged) by|[Oo]wner|[Mm]anager|[Mm]gr|GM|[Bb]uyer|[Cc]ontact(?: [Pp]erson)?|[Pp]erson in charge|[Aa]sk for|[Ss]peak (?:to|with)|[Ss]poke (?:to|with)|[Tt]alked (?:to|with)|[Nn]amed)(?:\s+is)?\s*[:\-–]?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/;
/** Words that are labels or listing chrome, never a business name on their own. */
const JUNK_NAME = /^(?:ph#?|phone|tel\.?(?:\s*no\.?)?|telephone|mobile|cell|fax|e|email|e-mail|mail|web|website|url|site|loc|location|addr|address|store|office|main|direct|owner|manager|contact|directions|website directions|reviews?|call|text|open|closed|price list)$/i;
/** Map listing chrome: ratings, opening hours, buttons. */
const LISTING_CHROME = /^(?:\d(?:\.\d)?\s*\(\d[\d,]*(?:\s+reviews?)?\)|\(?\d[\d,]*\s+reviews?\)?|(?:open|closed|opens|closes)\b.*|website|directions|call|share|save|nearby|send to phone|\${1,4})$/i;
/** A sentence-case category such as "Cell phone store" or "Mobile phone repair shop". */
const CATEGORY_RE = /^[A-Z][a-z]+(?:\s+[a-z]+)+\s+(?:store|shop|service|services|center|retailer|supplier|wholesaler|dealer)$/;
// Bullets and list numbers ("1.", "2)", "(3)", "#4"). Short numbers only, so "(520) 555-0131" is never a bullet.
const BULLET_RE = /^\s*(?:[-*•·▪◦‣–—]|\d{1,3}[.)\]]|\(\d{1,2}\)|#\d{1,4}\b)\s+/;
const CLOSING_RE = /^(best( regards)?|kind regards|regards|thanks|thank you|thx|sincerely|cheers|sent from my \w+|--+|__+)[,.!]*$/i;
const BUSINESS_WORDS = /\b(repair|repairs|wireless|cell(ular)?|phones?|mobile|electronics?|tech|solutions|services?|store|shop|outlet|center|centre|depot|supply|wholesale|inc|llc|ltd|co|corp|company|group|gadgets?|devices?|fix|clinic|lab|labs|hub|zone|world|plus|pro|express|market|mart)\b/i;
const PERSON_RE = /^[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'-]+$/;
const FAX_RE = /\bfax\b/i;

export type FieldConfidence = Partial<Record<"company" | "contact" | "phone" | "email" | "city" | "address", number>>;
export type TextRecord = { cells: Record<string, string>; snippet: string; issues: string[]; fieldConfidence: FieldConfidence };

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const hasContact = (line: string) => count(line, PHONE_RE) > 0 || count(line, EMAIL_RE) > 0;

function stripBullet(line: string) {
  return new RegExp(`^\\s*${PHONE_RE.source}`, "i").test(line) ? line : line.replace(BULLET_RE, "");
}

function cleanName(s: string) {
  return stripBullet(s)
    .replace(PHONE_RE, " ")
    .replace(EMAIL_RE, " ")
    .replace(URL_RE, " ")
    // Leftover labels: "Tel:" at the end, or "/ fax" after a separator. A bare trailing
    // word stays, so "Harbor Mobile" keeps its name.
    .replace(/\s*[/|,;]\s*(tel|phone|ph|mobile|cell|fax|email|e-mail|web|website)\s*[:.]?\s*$/i, "")
    .replace(/\b(tel|phone|ph|mobile|cell|fax|email|e-mail|web|website)\s*[:.]\s*$/i, "")
    .replace(/[\s,;|•·–—-]+$/g, "")
    .replace(/^[\s|•·*\-–—]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * "Speedway Cell Fix fixes it same day" → "Speedway Cell Fix": a capitalised run followed by
 * ordinary words is the name. Short joining words ("of", "&") may sit inside the run.
 */
function leadingTitleRun(name: string) {
  const words = name.split(/\s+/);
  const cap = (w: string) => /^[A-Z0-9&]/.test(w) || /^[a-z][A-Z]/.test(w);
  let n = 0;
  while (n < words.length && (cap(words[n]) || (/^(of|and|the|n'|de|la)$/i.test(words[n]) && n + 1 < words.length && cap(words[n + 1])))) n++;
  return n >= 2 && n < words.length && /^[a-z]/.test(words[n]) ? words.slice(0, n).join(" ") : name;
}

function looksLikeName(line: string) {
  const t = stripBullet(line).trim();
  if (!t || hasContact(t) || STREET_RE.test(t) || CITY_STATE_RE.test(t) || count(t, URL_RE) > 0 || CLOSING_RE.test(t)) return false;
  if (findAddress(t)?.street) return false; // "401 Broadway"
  const label = t.match(LABEL_RE);
  if (label && !["company", "business", "shop", "store", "name"].includes(label[1].toLowerCase())) return false;
  return /[a-z]{2}/i.test(t) && (t.match(/\d/g) ?? []).length <= 4 && t.length <= 80;
}

/**
 * Splits one line that lists several businesses ("Metro Wireless 312-555-0101, Quick Fix
 * 713-555-0102") at each phone that has its own name text in front of it. Phones joined
 * only by labels or separators ("Tel 312-555-0101 / Fax 312-555-0102") stay together.
 */
function splitLineByPhones(line: string): string[] {
  const matches = [...line.matchAll(new RegExp(PHONE_RE.source, "gi"))];
  if (matches.length < 2) return [line];
  const parts: string[] = [];
  let start = 0;
  for (let i = 1; i < matches.length; i++) {
    const prevEnd = matches[i - 1].index! + matches[i - 1][0].length;
    const between = line.slice(prevEnd, matches[i].index);
    const words = between.replace(/\b(tel|phone|ph|mobile|cell|fax|office|main|direct|or|and|alt|ext)\b/gi, "").replace(EMAIL_RE, "").replace(/[^a-z]/gi, "");
    if (words.length >= 3) {
      // Cut after the separator that follows the previous phone (and any email after it).
      const cut = prevEnd + (between.search(/[,;|]|\s{2,}/) >= 0 ? between.search(/[,;|]|\s{2,}/) + 1 : 0);
      const emailAfter = between.match(EMAIL_RE);
      const cutAt = emailAfter ? Math.max(cut, prevEnd + between.indexOf(emailAfter[0]) + emailAfter[0].length) : cut;
      parts.push(line.slice(start, cutAt));
      start = cutAt;
    }
  }
  parts.push(line.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** "A 312-555-0101 a@x.com; B 773-555-0102" → one piece per business when each piece has its own contact. */
function splitLineBySemicolons(line: string): string[] {
  const parts = line.split(/\s*;\s*/).filter((p) => p.trim());
  return parts.length >= 2 && parts.filter(hasContact).length >= 2 && parts.every((p) => hasContact(p) || !looksLikeName(p)) ? parts : [line];
}

/** The words left on a line once contacts, labels, addresses and people are taken out. */
function nameText(line: string) {
  const masked = maskContacts(stripBullet(line), [PHONE_RE, EMAIL_RE, URL_RE]);
  const addr = findAddress(masked);
  const rest = addr ? masked.slice(0, addr.start) + " " + masked.slice(addr.end) : masked;
  return rest
    .replace(LABEL_RE, (m, key: string, value: string) => (COMPANY_LABELS.has(key.toLowerCase()) || key.toLowerCase() === "name" ? value : ""))
    .replace(new RegExp(CONTACT_RE.source, "g"), " ")
    .split(/[|,;·•\t]|\s[–—-]\s|\s{2,}/)
    .map((p) => p.replace(/[^A-Za-z0-9&' .-]/g, " ").replace(/\s+/g, " ").trim())
    .filter((p) => p && /[a-z]{3}/i.test(p) && !JUNK_NAME.test(p) && !LISTING_CHROME.test(p))
    .join(" ");
}

/** Paragraphs → candidate chunks, one per business where the structure allows it. */
function segment(text: string): string[] {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    // Labels run together on one line ("Name: X Number: Y Mail: Z") each start a line.
    .replace(/^.*$/gm, (line) =>
      (line.match(INLINE_LABEL_RE) ?? []).length >= 2 ? line.replace(INLINE_LABEL_RE, (m, _l, offset: number) => (offset > 0 ? `\n${m.trimStart()}` : m)) : line,
    )
    .replace(/\f/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    // Chat exports: "[10/20, 3:14 PM] Ali: …" and "10/20/26, 3:14 PM - Ali: …".
    .replace(/^\[[^\]\n]{1,40}\]\s*[^:\n]{1,30}:\s*/gm, "")
    .replace(/^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?\s+-\s+[^:\n]{1,30}:\s*/gm, "");
  const paragraphs = normalized.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const para of paragraphs) {
    // A line naming several businesses with their own phones becomes several lines.
    const lines = para.split("\n").filter((l) => l.trim()).flatMap(splitLineBySemicolons).flatMap(splitLineByPhones);
    // 1) Bulleted or numbered items each start a business; a heading above the list is dropped.
    const bulleted = lines.filter((l) => BULLET_RE.test(l)).length;
    if (bulleted >= 2) {
      const firstBullet = lines.findIndex((l) => BULLET_RE.test(l));
      const header = lines.slice(0, firstBullet);
      if (header.some(hasContact)) chunks.push(header.join("\n"));
      let cur: string[] = [];
      for (const l of lines.slice(firstBullet)) {
        // A new item: the next bullet, or an unbulleted line with its own name and phone/email
        // after an item that already has contact details.
        const ownBusiness = !BULLET_RE.test(l) && hasContact(l) && cur.some(hasContact) && cleanName(l).replace(ASK_FOR_RE, "").trim().length > 3;
        if ((BULLET_RE.test(l) || ownBusiness) && cur.length) {
          chunks.push(cur.join("\n"));
          cur = [];
        }
        cur.push(l);
      }
      if (cur.length) chunks.push(cur.join("\n"));
      continue;
    }
    // 2) A list with one business per line: most lines carry their own phone/email and a name.
    const contactLines = lines.filter((l) => hasContact(l));
    const perLine = contactLines.length >= 2 && contactLines.length >= lines.length * 0.6 && contactLines.every((l) => cleanName(l).length > 2);
    if (perLine) {
      for (const l of lines) chunks.push(...splitLineByPhones(l));
      continue;
    }
    // 3) Stacked blocks without blank lines. A new business starts at a line that carries its
    //    own name and contact details, or at a name line once the current business already
    //    has both a name and contact details. Fields can come in any order before that.
    let cur: string[] = [];
    let seenContact = false;
    let seenName = false;
    for (const l of lines) {
      const contact = hasContact(l);
      const named = contact ? nameText(l).length >= 3 : looksLikeName(l) && !LISTING_CHROME.test(stripBullet(l).trim()) && !CLOSING_RE.test(l.trim());
      if (cur.length && ((contact && named && seenContact) || (!contact && named && seenContact && seenName) || (contact && named && !seenContact && !cur.some((x) => STREET_RE.test(x) || CITY_STATE_RE.test(x))))) {
        chunks.push(cur.join("\n"));
        cur = [];
        seenContact = false;
        seenName = false;
      }
      cur.push(l);
      if (contact) seenContact = true;
      if (named) seenName = true;
    }
    if (cur.length) chunks.push(cur.join("\n"));
  }
  return chunks;
}

function recordFromChunk(chunk: string, { requireContact = true }: { requireContact?: boolean } = {}): TextRecord | null {
  const cells: Record<string, string> = {};
  const fc: FieldConfidence = {};
  const issues: string[] = [];
  const lines = chunk.split("\n").map((l) => stripBullet(l).trim()).filter((l) => l && !CLOSING_RE.test(l) && !LISTING_CHROME.test(l));
  for (const line of lines) {
    const m = line.match(LABEL_RE);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (COMPANY_LABELS.has(key) || (key === "name" && !cells.Company)) {
      const name = cleanName(value) || value;
      if (!JUNK_NAME.test(name)) {
        cells.Company = name;
        fc.company = 1;
      }
    } else if (CONTACT_LABELS.has(key) || key === "name") {
      let person = cleanName(value).replace(/[.,;]+$/, "");
      // "Contact: John at Valley Mobile" names the person and the shop.
      const at = person.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:at|from|with|of)\s+([A-Z0-9].+)$/);
      if (at) {
        person = at[1];
        if (!cells.Company) {
          cells.Company = at[2].split(/,|\s[-–|]\s/)[0].trim();
          fc.company = 0.9;
        }
      }
      if (person) {
        cells.Contact = person;
        fc.contact = 1;
      }
    } else if (key.startsWith("note")) {
      cells.Notes = value;
    }
  }

  // Phones: fax numbers are noted but not dialled.
  const phones: string[] = [];
  const faxes: string[] = [];
  for (const line of lines) {
    const found = [...line.matchAll(new RegExp(PHONE_RE.source, "gi"))];
    for (const f of found) {
      const before = line.slice(Math.max(0, f.index! - 12), f.index);
      (FAX_RE.test(before) ? faxes : phones).push(f[0].trim());
    }
  }
  const uniquePhones = [...new Set(phones)];
  if (uniquePhones.length) {
    cells.Phone = uniquePhones.join("; ");
    fc.phone = 1;
  }
  if (faxes.length) cells.Notes = [cells.Notes, `Fax: ${[...new Set(faxes)].join(", ")}`].filter(Boolean).join(" · ");

  const text = lines.join("\n");
  const emails = [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
  if (emails.length) {
    cells.Email = emails.join("; ");
    fc.email = 1;
  }
  // Emails are blanked first, so whatever looks like a site here was written as one.
  const sites: string[] = text.replace(EMAIL_RE, " ").match(URL_RE) ?? [];
  if (sites.length) cells.Website = sites[0];

  // Address: street, city, state and ZIP wherever they sit, with or without commas.
  const masked = maskContacts(text, [PHONE_RE, EMAIL_RE, URL_RE]);
  const addr = findAddress(masked);
  let nameSource = text;
  if (addr) {
    if (addr.street) {
      cells.Address = addr.street.replace(/^(?:address|addr|loc|location)\s*[:\-–]\s*/i, "");
      fc.address = 0.9;
    }
    if (addr.city) cells.City = addr.city;
    if (addr.state) cells.State = addr.state;
    if (addr.zip) cells.Zip = addr.zip;
    if (addr.city || addr.state) fc.city = 0.9;
    nameSource = text.slice(0, addr.start) + " | " + text.slice(addr.end);
    // A second address-like run (city line under a street line) shouldn't become the name.
    const again = findAddress(maskContacts(nameSource, [PHONE_RE, EMAIL_RE, URL_RE]));
    if (again && (again.street === addr.street || again.city === addr.city)) nameSource = nameSource.slice(0, again.start) + " | " + nameSource.slice(again.end);
  }

  // Contact person: a label, "owner Ray Ortiz", "ask for Dana", "guy named Carlos", a "First Last" line.
  const said = text.match(CONTACT_RE);
  if (!cells.Contact && said) {
    const words = said[1].split(" ");
    cells.Contact = words.length > 1 && BUSINESS_WORDS.test(words[1]) ? words[0] : said[1];
    fc.contact = 0.8;
  }
  const nameLines = nameSource.split("\n").map((l) => l.trim()).filter((l) => {
    const m = l.match(LABEL_RE);
    return l && !(m && !COMPANY_LABELS.has(m[1].toLowerCase()) && m[1].toLowerCase() !== "name");
  });
  if (!cells.Contact) {
    const person = nameLines.find((l) => PERSON_RE.test(l.split(/,|\s[-–|]\s/)[0].trim()) && !BUSINESS_WORDS.test(l.split(/,|\s[-–|]\s/)[0]));
    if (person) {
      cells.Contact = person.split(/,|\s[-–|]\s/)[0].trim();
      fc.contact = 0.8;
    }
  }

  if (!cells.Company) {
    // Prefer a piece that sounds like a business; drop people, labels, listing chrome and prose.
    const candidates: { name: string; score: number }[] = [];
    nameLines.forEach((line, lineIndex) => {
      const pieces = line
        .replace(new RegExp(CONTACT_RE.source, "g"), " | ")
        .replace(LABEL_RE, (m, key: string, value: string) => (COMPANY_LABELS.has(key.toLowerCase()) || key.toLowerCase() === "name" ? value : " | "))
        .split(/\s[|•·–—]\s|\s-\s|\s--\s|\t|,\s|\s{3,}|\||·|•|;|\bat\s(?=[A-Z])|\bfrom\s(?=[A-Z])|[.!?](?:\s+|$)|\b(?:owner|manager|contact|ask for|speak (?:to|with)|call (?:her|him|them)?)\b/i);
      for (const part of pieces) {
        if (!part) continue;
        let name = cleanName(part)
          .replace(/^(?:also|and|then|try|plus|called|visited|stopped by|went to|met with|met|emailed|texted|spoke (?:to|with)|talked (?:to|with))\s+/i, "")
          .replace(/^(?:also|and|then)\s+/i, "")
          .replace(/^(?:new lead|another one|another|new|lead|fyi|ok)\b[\s:.-]*/i, "")
          .replace(/\(\s*\)/g, " ")
          .replace(/^[\s)]+|[\s(]+$/g, "")
          // "Pixel Fix in Garland today", "Theta Cellular after 2pm".
          .replace(/\s+(?:in|at)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:today|yesterday|this (?:morning|afternoon|week))\b.*$/, "")
          .replace(/\s+(?:today|yesterday)\b.*$/i, "")
          .replace(/\s+(?:after|before|around|until|from|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b.*$/i, "")
          .replace(/[\s-]+$/, "")
          .replace(/(?:\s+(?:at|on|in|from|by|of|is|are|and|with|located|-))+$/i, "")
          .trim();
        name = leadingTitleRun(name);
        if (!name || !/[a-z]{2}/i.test(name) || name.length > 80 || STREET_RE.test(name) || JUNK_NAME.test(name) || LISTING_CHROME.test(name)) continue;
        if (name === cells.Contact || name === cells.Address || name === cells.City) continue;
        if (/^(owner|manager|ceo|founder|president|buyer|sales|director|general manager|gm|guy|she|he|they)\b/i.test(name)) continue;
        if (/\b(?:said|says|wants|asked|number is|is at|email him|email her|call back)\b/i.test(name)) continue;
        const score =
          (BUSINESS_WORDS.test(name) ? 2 : 0) +
          (lineIndex === 0 ? 1 : 0) +
          (PERSON_RE.test(name) && !BUSINESS_WORDS.test(name) ? -2 : 0) +
          (CATEGORY_RE.test(name) ? -4 : 0) +
          (/^[A-Z0-9][\w&'.-]*(?:\s+[A-Z0-9&][\w&'.-]*)+$/.test(name) ? 1 : 0);
        candidates.push({ name, score });
      }
    });
    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0]) {
      cells.Company = candidates[0].name;
      fc.company = candidates[0].score >= 2 ? 0.9 : candidates[0].score >= 1 ? 0.75 : 0.55;
    } else if (emails.length) {
      // Last resort: the email domain ("metro-wireless.example.com" → "Metro Wireless").
      const domain = emails[0].split("@")[1].split(".")[0];
      if (!/^(gmail|yahoo|hotmail|outlook|aol|icloud|live|msn)$/.test(domain)) {
        cells.Company = domain.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        fc.company = 0.4;
      }
    }
  }
  if ((fc.company ?? 0) < 0.75) issues.push("weak_name");

  // Phones on separate lines are only kept together when labeled (Tel / Cell / Office …);
  // otherwise they may belong to different businesses and the row needs a look.
  const LABELED = /^\s*(tel|phone|ph|mobile|cell|office|main|direct|work|home|alt|fax|whatsapp)\b/i;
  const phoneLines = lines.filter((l) => count(l, PHONE_RE) > 0 && !FAX_RE.test(l));
  const unlabeled = phoneLines.filter((l) => !LABELED.test(l)).length;
  if (uniquePhones.length >= 3 || (phoneLines.length >= 2 && unlabeled >= 2)) issues.push("needs_split");

  if (requireContact && !cells.Phone && !cells.Email) return null; // prose, not a lead
  return { cells, snippet: chunk.trim().slice(0, 600), issues, fieldConfidence: fc };
}

export function recordsFromText(text: string): TextRecord[] {
  return segment(text).map((c) => recordFromChunk(c)).filter((r): r is TextRecord => r !== null);
}

/**
 * Reads one cell that mixes several fields ("Tel 615 555 0241 · 1100 16th Ave S Nashville
 * TN 37212 · ask for Beth") into separate fields, including a business name in case
 * the row has no column for it.
 */
export function readDetails(text: string): Record<string, string> {
  const r = recordFromChunk(text.replace(/\s*[·•|]\s*/g, "\n").trim(), { requireContact: false });
  if (!r) return {};
  // The caller keeps a business name from its own column; this one is a fallback.
  return r.cells;
}
