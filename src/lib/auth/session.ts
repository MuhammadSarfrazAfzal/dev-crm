/** Signed session cookie (HS256). Holds only the user id; the profile is re-read per request. */
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "crm_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

const DEV_SECRET = "dev-only-secret-change-me-dev-only-secret-change-me";

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set (32+ characters) in production");
    return new TextEncoder().encode(DEV_SECRET);
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .setAudience("sales-crm")
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"], audience: "sales-crm" });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
