/** Phone parsing for North American (NANP) numbers, the CRM's primary market. */
import { stateForAreaCode } from "./us";

export type ParsedPhone = {
  raw: string;
  valid: boolean;
  /** +1XXXXXXXXXX for NANP, +<digits> for other countries; null when unusable. */
  e164: string | null;
  ext: string | null;
  areaCode: string | null;
  state: string | null;
  tollFree: boolean;
  international: boolean;
  reason?: "empty" | "too_short" | "too_long" | "invalid_area_code" | "invalid_exchange" | "letters";
};

const TOLL_FREE = new Set(["800", "833", "844", "855", "866", "877", "888"]);
const EXT_RE = /\s*(?:ext\.?|extension|x|#)\s*(\d{1,6})\s*$/i;

export function parsePhone(input: string | null | undefined): ParsedPhone {
  const raw = (input ?? "").trim();
  const base: ParsedPhone = {
    raw, valid: false, e164: null, ext: null, areaCode: null, state: null, tollFree: false, international: false,
  };
  if (!raw) return { ...base, reason: "empty" };

  let body = raw.replace(/^tel:/i, "");
  const extMatch = body.match(EXT_RE);
  if (extMatch) {
    base.ext = extMatch[1];
    body = body.slice(0, extMatch.index);
  }
  if (/[a-wyz]/i.test(body)) return { ...base, reason: "letters" };

  const plus = body.trim().startsWith("+");
  let digits = body.replace(/\D/g, "");
  if (plus && !digits.startsWith("1")) {
    if (digits.length < 8) return { ...base, reason: "too_short" };
    if (digits.length > 15) return { ...base, reason: "too_long" };
    return { ...base, valid: true, e164: `+${digits}`, international: true };
  }
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length < 10) return { ...base, reason: "too_short" };
  if (digits.length > 10) return { ...base, reason: "too_long" };

  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  if (!/^[2-9]\d\d$/.test(area) || /^[2-9]11$/.test(area)) return { ...base, areaCode: area, reason: "invalid_area_code" };
  if (!/^[2-9]\d\d$/.test(exchange) || /^[2-9]11$/.test(exchange)) return { ...base, areaCode: area, reason: "invalid_exchange" };

  return {
    ...base,
    valid: true,
    e164: `+1${digits}`,
    areaCode: area,
    state: stateForAreaCode(area),
    tollFree: TOLL_FREE.has(area),
  };
}

/** "(312) 555-0142 ext. 4" for NANP numbers; other numbers are returned as stored. */
export function formatPhone(e164: string | null | undefined, ext?: string | null): string {
  if (!e164) return "";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  const main = m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
  return ext ? `${main} ext. ${ext}` : main;
}

/** Splits a cell like "312-555-0101 / 312-555-0102; mobile 773.555.0199" into numbers. */
export function splitPhones(input: string | null | undefined): string[] {
  if (!input) return [];
  return input
    .split(/\s*(?:[;,|/\n]|\bor\b|\band\b)\s*/i)
    .map((s) => s.replace(/^(?:tel|phone|ph|mobile|mob|cell|office|main|fax)\s*[:.]?\s*/i, "").trim())
    .filter((s) => /\d{3}/.test(s));
}

export type StoredPhone = { e164: string; raw: string; ext?: string | null; label?: string | null };

export function toStoredPhone(raw: string, label?: string | null): StoredPhone | null {
  const p = parsePhone(raw);
  if (!p.valid || !p.e164) return null;
  return { e164: p.e164, raw: p.raw, ext: p.ext, label: label ?? null };
}
