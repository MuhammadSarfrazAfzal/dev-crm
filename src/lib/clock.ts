/**
 * The app's idea of "now". Neither the computer's clock nor the browser's can be trusted
 * (a PC set to the wrong time or zone would move every follow-up), so on the server "now"
 * is corrected to the database's clock, and in the browser to the server's. Use `now()`
 * instead of `new Date()` wherever the current time matters.
 */
// In the browser, ClockSeed has already put the server's offset on the page.
let skewMs = typeof window !== "undefined" ? Number((window as unknown as { __crmClockSkew?: number }).__crmClockSkew) || 0 : 0;

/** The current instant, corrected to the trusted clock. */
export function now(): Date {
  return new Date(Date.now() + skewMs);
}

export function nowMs(): number {
  return Date.now() + skewMs;
}

/** How far this machine's clock is behind the trusted one, in milliseconds. */
export function clockSkew() {
  return skewMs;
}

export function setClockSkew(ms: number) {
  skewMs = Number.isFinite(ms) ? Math.round(ms) : 0;
}
