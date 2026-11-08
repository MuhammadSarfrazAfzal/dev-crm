/** Email address checks used by imports and forms. Syntax only; nothing is sent. */

export type ParsedEmail = { raw: string; address: string | null; valid: boolean; reason?: string; role: boolean };

// Practical subset of RFC 5322: one @, a dotted domain with a 2+ letter TLD.
const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/;
const ROLE_PREFIXES = new Set(["info", "sales", "support", "contact", "admin", "office", "hello", "service", "help", "orders"]);

export function parseEmail(input: string | null | undefined): ParsedEmail {
  const raw = (input ?? "").trim();
  if (!raw) return { raw, address: null, valid: false, reason: "empty", role: false };
  const address = raw.replace(/^mailto:/i, "").replace(/^<|>$/g, "").trim().toLowerCase();
  if (address.length > 254) return { raw, address: null, valid: false, reason: "too_long", role: false };
  if (!EMAIL_RE.test(address) || address.includes("..") || address.split("@")[0].length > 64) {
    return { raw, address: null, valid: false, reason: "invalid_format", role: false };
  }
  return { raw, address, valid: true, role: ROLE_PREFIXES.has(address.split("@")[0]) };
}

export function splitEmails(input: string | null | undefined): string[] {
  if (!input) return [];
  return input.split(/[\s;,|/]+/).map((s) => s.trim()).filter((s) => s.includes("@"));
}

/** Lower-case host without "www.", from a URL or bare domain; null if it doesn't look like one. */
export function websiteDomain(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** A safe http(s) URL for a website cell, or null. Other schemes (javascript:, ftp:) are refused. */
export function normalizeWebsite(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw || !websiteDomain(raw)) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
