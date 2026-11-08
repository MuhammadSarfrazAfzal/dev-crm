import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

const { openTokens, sealTokens, tokensFrom } = await import("@/lib/auth/supabase-session");

describe("Supabase session cookie", () => {
  const t = { accessToken: "a.b.c", refreshToken: "r-123", expiresAt: 2_000_000_000, userId: "0d54f94b-7247-43c9-a375-954df7931db8" };

  it("round-trips the tokens encrypted, never in clear text", async () => {
    const sealed = await sealTokens(t);
    expect(sealed).not.toContain("r-123");
    expect(await openTokens(sealed)).toEqual(t);
  });

  it("rejects a tampered or missing cookie", async () => {
    const sealed = await sealTokens(t);
    expect(await openTokens(`${sealed.slice(0, -4)}AAAA`)).toBeNull();
    expect(await openTokens(undefined)).toBeNull();
  });

  it("reads Supabase Auth token responses", () => {
    expect(tokensFrom({ access_token: "x", refresh_token: "y", expires_at: 123, user: { id: "u" } })).toEqual({ accessToken: "x", refreshToken: "y", expiresAt: 123, userId: "u" });
    expect(tokensFrom({ access_token: "x" })).toBeNull();
  });
});
