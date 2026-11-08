/**
 * Finds a US address inside messy text and splits it into street, city, state and ZIP.
 *
 *   "1200 W Madison St Chicago IL 60607"         street ends at its suffix (St), city follows
 *   "2700 McKinney Ave Dallas, TX 75204"
 *   "3150 N Broadway, Chicago, IL 60657"         commas separate the parts
 *   "Loc: 2900 Peachtree Rd NE Atlanta GA 30305" directions and suites stay with the street
 *   "QUICK FIX CELLULAR | DALLAS TX 75201"       a city and state without a street
 *   "Cell phone store · 2301 S Lamar Blvd"       a street on its own
 *
 * Callers blank out phones, emails and websites first (see maskContacts) so their digits
 * never look like house numbers. Only text that is really there is returned.
 */
import { US_STATES } from "../us";

export type FoundAddress = { street?: string; city?: string; state?: string; zip?: string; start: number; end: number };

const CODES = US_STATES.map((s) => s.code).join("|");
const NAMES = US_STATES.map((s) => s.name.replace(/ /g, "\\s+")).join("|");
// A state, optionally followed by a ZIP. Codes must be upper case ("in" and "or" are words).
const STATE_RE = new RegExp(`(?<![A-Za-z])(?:(${CODES})|(${NAMES}))\\.?(?![A-Za-z])(?:,?\\s+(\\d{5})(?:-\\d{4})?(?!\\d))?`, "g");
const SUFFIX = /^(st|street|ave|av|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|ct|court|pl|place|pkwy|parkway|hwy|highway|fwy|freeway|expy|expressway|loop|plaza|sq|square|cir|circle|trl|trail|ter|terrace|pike|broadway|frontage)\.?,?$/i;
const ROUTE = /^(highway|hwy|loop|route|rte|fm|sh|us|interstate)\.?$/i;
const DIRECTION = /^(n|s|e|w|ne|nw|se|sw|north|south|east|west)\.?,?$/i;
const UNIT = /^(suite|ste|unit|apt|bldg|building|room|rm|fl|floor)\.?$/i;
const HOUSE = /^\d{1,6}[A-Za-z]?$/;
const CITY_WORD = /^[A-Za-z][A-Za-z.'-]*$/;
/** Characters that separate parts of a listing: commas, pipes, dots, dashes, new lines. */
const SEP = /\s*(?:,|\||·|•|\n|\t|\s[–—-]\s|\s{3,}|;)\s*/;

/** Replaces phones, emails and websites with a separator so only words and addresses remain. */
export function maskContacts(text: string, patterns: RegExp[]) {
  let out = text;
  for (const re of patterns) out = out.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`), (m) => ` |${" ".repeat(Math.max(0, m.length - 2))}`);
  return out;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const tidy = (s: string) => s.replace(/^[\s,.:;|·•–—-]+|[\s,.:;|·•–—-]+$/g, "").replace(/\s+/g, " ").trim();

/** The street in a run of words: from a house number to its suffix, plus direction and suite. */
function streetIn(text: string, needSuffix: boolean): { street: string; rest: string; at: number } | null {
  const toks = [...text.matchAll(/\S+/g)];
  for (let i = 0; i < toks.length; i++) {
    if (!HOUSE.test(toks[i][0].replace(/,$/, ""))) continue;
    if (i > 0 && /[#$]$/.test(toks[i - 1][0])) continue;
    // The last suffix after the number (so "Festival Plaza Dr" keeps "Dr").
    let end = -1;
    for (let j = i + 1; j < toks.length && j <= i + 8; j++) {
      const t = toks[j][0];
      if (SUFFIX.test(t)) end = j;
      if (/,$/.test(t) && end >= 0) break;
      if (!/^[A-Za-z0-9.'#-]+,?$/.test(t)) break;
    }
    if (end < 0) {
      if (needSuffix) continue;
      end = Math.min(toks.length - 1, i + 3);
    }
    let k = end + 1;
    const open = () => k < toks.length && !/,$/.test(toks[k - 1][0]);
    // Route numbers: "Highway 35 Byp", "LOOP 336 W", "FM 1960".
    if (ROUTE.test(toks[end][0]) && open() && /^\d+[A-Za-z]?,?$/.test(toks[k][0])) {
      k++;
      if (open() && /^(byp|bypass|bus|business|spur|loop)\.?,?$/i.test(toks[k][0])) k++;
    }
    // Trailing direction ("Rd NE", "Ave S") and unit ("Suite 2600", "#1360", "Rd A").
    if (open() && DIRECTION.test(toks[k][0])) k++;
    if (open() && UNIT.test(toks[k][0].replace(/,$/, "")) && k + 1 < toks.length) k += 2;
    else if (open() && /^#\w+,?$/.test(toks[k][0])) k++;
    else if (open() && (/^[A-Z]\d{0,3},$/.test(toks[k][0]) || (k === toks.length - 1 && /^[A-Z]\d{0,3}$/.test(toks[k][0])))) k++;
    const last = toks[k - 1];
    const startIdx = toks[i].index!;
    const endIdx = last.index! + last[0].length;
    return { street: tidy(text.slice(startIdx, endIdx)), rest: text.slice(endIdx), at: startIdx };
  }
  return null;
}

/** The first address in the text (masked as by maskContacts). */
export function findAddress(text: string): FoundAddress | null {
  for (const m of text.matchAll(STATE_RE)) {
    const code = m[1] ?? US_STATES.find((s) => s.name.toLowerCase() === m[2]!.replace(/\s+/g, " ").toLowerCase())?.code;
    if (!code) continue;
    const zip = m[3];
    const before = text.slice(0, m.index);
    const sepBefore = /(?:,|\n)\s*$/.test(before) || /,\s*[A-Za-z][A-Za-z .'-]*$/.test(before);
    // A bare two-letter code needs a comma, a ZIP or a street to be trusted as a state.
    // "NE" after "Rd" is a direction, not Nebraska.
    if (m[1] && SUFFIX.test(words(before).pop() ?? "")) continue;
    const segs = before.replace(/[\s,|·•;\t–—-]+$/, "").split(SEP);
    const lastSeg = segs[segs.length - 1] ?? "";
    const prevSeg = segs[segs.length - 2] ?? "";
    let street: string | undefined;
    let city: string | undefined;
    let start = m.index!;

    const inLast = streetIn(lastSeg, true);
    if (inLast) {
      // "2700 McKinney Ave Dallas" → street, then the city words.
      street = inLast.street;
      city = tidy(inLast.rest) || undefined;
    } else {
      const cw = words(lastSeg);
      const cityWords: string[] = [];
      for (let i = cw.length - 1; i >= 0 && cityWords.length < 4; i--) {
        if (!CITY_WORD.test(cw[i]) || /^(ask|for|at|in|the|and|tel|phone|email|loc|location|addr|address|is|of)$/i.test(cw[i])) break;
        cityWords.unshift(cw[i]);
      }
      // "Shop Name Dallas TX" with nothing between them: only the last word is surely the city.
      if (cityWords.length && cityWords.length === cw.length) city = cityWords.join(" ");
      else if (cityWords.length) city = cityWords[cityWords.length - 1];
      // "11930 Barker Cypress Rd, Suite 400, Cypress TX": the suite sits in its own part.
      if (UNIT.test(words(prevSeg)[0]?.replace(/\.$/, "") ?? "") || /^#?\w{1,6}$/.test(prevSeg.trim()) && /\d/.test(prevSeg)) {
        const s = streetIn(segs[segs.length - 3] ?? "", false);
        if (s && HOUSE.test(words(segs[segs.length - 3] ?? "")[0] ?? "")) street = `${s.street}, ${tidy(prevSeg)}`;
      } else {
        const s = streetIn(prevSeg, !HOUSE.test(words(prevSeg)[0] ?? ""));
        if (s) street = s.street;
        else {
          // "10465 NW 29th Terrace, Doral, Miami, FL": a neighbourhood between street and city.
          const k = segs.length - 3;
          const s2 = k >= 0 ? streetIn(segs[k], false) : null;
          if (s2 && HOUSE.test(words(segs[k])[0] ?? "") && CITY_WORD.test(prevSeg.trim().split(/\s+/)[0] ?? "") && words(prevSeg).length <= 3) street = `${s2.street}, ${tidy(prevSeg)}`;
        }
      }
    }
    const anchor = street ?? city;
    if (anchor) {
      const at = before.lastIndexOf(anchor.split(" ")[0]);
      if (at >= 0) start = at;
    }
    if (!m[1] && !zip && !sepBefore) continue; // "Georgia" in prose
    if (m[1] && !zip && !sepBefore && !street) {
      // "DALLAS TX" without ZIP or comma: only after a separator such as a masked phone.
      if (!/[|·•\t–—-]\s*[A-Za-z .'-]+$/.test(before)) continue;
    }
    if (city && (city.length < 2 || !/[a-z]{2}/i.test(city))) city = undefined;
    return { street, city, state: code, zip, start: Math.max(0, start), end: m.index! + m[0].length };
  }
  // No state: a street with a suffix on its own.
  for (const seg of text.split(SEP)) {
    const s = streetIn(seg, true);
    if (s) {
      const at = text.indexOf(seg) + s.at;
      return { street: s.street, start: at, end: at + s.street.length };
    }
  }
  return null;
}
