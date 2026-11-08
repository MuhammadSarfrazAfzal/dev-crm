import Script from "next/script";

/**
 * Server-rendered: hands the page the server's current time before any script runs, so
 * the browser's first render already uses the trusted clock instead of the PC's.
 */
export function ClockSeed({ serverNow }: { serverNow: number }) {
  return (
    <Script
      id="clock-seed"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `window.__crmClockSkew=${Math.round(serverNow)}-Date.now()`,
      }}
    />
  );
}
