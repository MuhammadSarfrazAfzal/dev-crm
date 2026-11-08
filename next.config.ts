import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Supabase Realtime connects from the browser; allow only this project's origin.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
})();
const realtime = supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, "ws")}` : "";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${realtime}${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // The e2e suite runs its own server next to the dev server, so it needs its own build dir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Parsers and OCR load native/wasm assets from node_modules at runtime.
  serverExternalPackages: ["tesseract.js", "@tesseract.js-data/eng", "exceljs", "mammoth", "unpdf", "@napi-rs/canvas", "postgres", "bcryptjs", "fflate"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
    proxyClientMaxBodySize: "30mb",
  },
  poweredByHeader: false,
  agentRules: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
