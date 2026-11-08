import { NextResponse } from "next/server";

/**
 * 303 redirect with a relative Location. Absolute URLs built from request.url can carry a
 * different host than the browser used (localhost vs 127.0.0.1), which CSP form-action blocks.
 */
export function seeOther(path: string) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("redirects must be same-site paths");
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}
