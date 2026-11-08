/**
 * Parser for directory-style documents: repeated blocks such as
 *
 *   011     uBreakiFix - Conroe                         +1 (936) 703-1095
 *           Conroe, TX | 1403 N LOOP 336 W STE B2, Conroe, TX 77304
 *           Business website: ubreakifix.com [open source]
 *
 * Each block starts with an "anchor" line (optional entry number, a name, and a phone set
 * apart by a wide gap) and is followed by detail lines. Section headings between blocks
 * ("Houston area") become a tag on the records that follow, never a company.
 * Used when it explains most of the phone numbers in a text; otherwise the generic
 * free-text parser takes over.
 */
import { US_STATES } from "../us";
import { hostOf, isDirectoryHost, isDirectoryLabel } from "./directories";
import { EMAIL_RE, PHONE_RE } from "./text-records";

export type BlockRecord = Record<string, string>;

export type BlockParse = {
  records: BlockRecord[];
  /** 0–1: how well the block structure explains the text. */
  confidence: number;
  phonesInText: number;
};

const STATE_CODES = US_STATES.map((s) => s.code).join("|");
const PHONE_SRC = PHONE_RE.source;
const ANCHOR_RE = new RegExp(`^\\s*(?:(\\d{1,5})[.):]?\\s+)?(\\S.*?)\\s{3,}(${PHONE_SRC})\\s*$`, "i");
const CITY_PIPE_RE = new RegExp(`^([A-Za-z][A-Za-z .'-]{0,40}),\\s*(${STATE_CODES})\\s*\\|\\s*(.*)$`);
const CITY_LINE_RE = new RegExp(`^(?:(.*?),\\s*)?([A-Za-z][A-Za-z .'-]{0,40}),\\s*(${STATE_CODES})\\.?\\s+(\\d{5})(?:-\\d{4})?$`);
const SOURCE_RE = /^([A-Za-z][A-Za-z /&-]{1,40}):\s*((?:https?:\/\/)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/\S*)?)(?:\s*\[[^\]]*\])?\s*$/i;
const FOOTER_RE = /(\b\d{1,4}\s*\/\s*\d{1,4}\s*$)|(^\s*page\s+\d+(\s+of\s+\d+)?\s*$)/i;
const ZIP_RE = /\b(\d{5})(?:-\d{4})?\s*$/;

function anchorOf(line: string) {
  const m = line.match(ANCHOR_RE);
  if (!m) return null;
  const name = m[2].replace(/\s{2,}/g, " ").trim();
  // A name needs letters and must not itself be contact data.
  if (!/[a-z]{2}/i.test(name) || new RegExp(PHONE_SRC, "i").test(name) || /@/.test(name)) return null;
  return { number: m[1] ?? null, name, phone: m[3].trim() };
}

function isHeading(line: string) {
  const t = line.trim();
  return t.length >= 3 && t.length <= 40 && /[a-z]/i.test(t) && !/\d/.test(t) && !t.includes("|") && !t.includes(":") && !/\s{3,}/.test(t);
}

export function parseRecordBlocks(text: string): BlockParse {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\f/g, "\n").split("\n");
  const phonesInText = (text.match(PHONE_RE) ?? []).length;
  const records: BlockRecord[] = [];
  let current: BlockRecord | null = null;
  let closed = false; // details finished; further lines are between blocks
  let blankSinceAnchor = false;
  let area: string | null = null;
  let detailed = 0;

  const finish = () => {
    if (current) {
      if (current.Address || current.City || current.Source || current.Website) detailed++;
      records.push(current);
    }
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const anchor = anchorOf(raw);
    if (anchor) {
      finish();
      current = { Company: anchor.name, Phone: anchor.phone };
      if (anchor.number) current["Record #"] = anchor.number;
      if (area) current.Area = area;
      closed = false;
      blankSinceAnchor = false;
      continue;
    }
    if (!line) {
      if (current) blankSinceAnchor = true;
      continue;
    }
    if (FOOTER_RE.test(line)) {
      closed = true;
      continue;
    }

    if (current && !closed) {
      const rec: BlockRecord = current;
      const cityPipe = line.match(CITY_PIPE_RE);
      if (cityPipe) {
        rec.City = cityPipe[1].trim();
        rec.State = cityPipe[2];
        const address = cityPipe[3].trim();
        if (address) {
          rec.Address = address;
          const zip = address.match(ZIP_RE);
          if (zip) rec.Zip = zip[1];
        }
        continue;
      }
      const source = line.match(SOURCE_RE);
      if (source) {
        const label = source[1].trim();
        const target = source[2];
        const lower = label.toLowerCase();
        if (/e-?mail/.test(lower)) {
          rec.Email = target;
        } else if (/^(phone|tel|mobile|cell|fax)\b/.test(lower)) {
          // handled below as an extra phone
        } else {
          const host = hostOf(target) ?? target;
          if (/web\s*site|^web$|^url$/.test(lower) && !isDirectoryLabel(label) && !isDirectoryHost(host)) rec.Website = host;
          rec.Source = `${label}: ${host}`;
          closed = true; // the source line ends a block in this layout
        }
        if (!/^(phone|tel|mobile|cell|fax)\b/.test(lower)) continue;
      }
      const emails = line.match(EMAIL_RE);
      if (emails && line.replace(EMAIL_RE, "").replace(/^[A-Za-z -]+:\s*/, "").trim() === "") {
        rec.Email = [rec.Email, ...emails].filter(Boolean).join("; ");
        continue;
      }
      const phones = line.match(PHONE_RE);
      if (phones && line.replace(PHONE_RE, "").replace(/^[A-Za-z -]+:\s*/, "").trim() === "") {
        rec.Phone = [rec.Phone, ...phones].join("; ");
        continue;
      }
      const cityLine = line.match(CITY_LINE_RE);
      if (cityLine) {
        if (cityLine[1]) rec.Address = cityLine[1].trim();
        rec.City = cityLine[2].trim();
        rec.State = cityLine[3];
        rec.Zip = cityLine[4];
        continue;
      }
      // A wrapped company name: directly under the anchor, before any details.
      if (!blankSinceAnchor && !rec.City && !rec.Source && !rec._wrapped) {
        rec.Company = `${rec.Company} ${line}`.replace(/\s+/g, " ");
        rec._wrapped = "1";
        continue;
      }
      if (rec.City || rec.Source) {
        closed = true; // anything else after the details is between blocks
      } else {
        rec.Notes = [rec.Notes, line].filter(Boolean).join(" ");
        continue;
      }
    }
    if (isHeading(line)) area = line;
  }
  finish();

  for (const r of records) delete r._wrapped;
  const anchoredPhones = records.length;
  const coverage = phonesInText ? Math.min(1, anchoredPhones / phonesInText) : 0;
  const detail = records.length ? detailed / records.length : 0;
  const confidence = records.length >= 3 ? Math.round(coverage * (0.5 + 0.5 * detail) * 100) / 100 : 0;
  return { records, confidence, phonesInText };
}
