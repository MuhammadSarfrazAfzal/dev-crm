import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rate-limit";
import { signSession, verifySession } from "@/lib/auth/session";

describe("rate limiter", () => {
  it("allows up to the limit, then blocks until the window passes", () => {
    const rl = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect([1, 2, 3].map(() => rl.check("k", 0).ok)).toEqual([true, true, true]);
    const blocked = rl.check("k", 500);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(rl.check("other", 500).ok).toBe(true);
    expect(rl.check("k", 1001).ok).toBe(true);
  });
  it("resets a key", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
    rl.check("k", 0);
    rl.reset("k");
    expect(rl.check("k", 1).ok).toBe(true);
  });
});

describe("session tokens", () => {
  it("round-trips a user id and rejects tampering", async () => {
    const id = "6f1c1f1e-1111-4222-8333-444455556666";
    const token = await signSession(id);
    expect(await verifySession(token)).toBe(id);
    const [h, p, s] = token.split(".");
    expect(await verifySession(`${h}.${p}.${s.slice(0, -2)}xx`)).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("garbage")).toBeNull();
  });
});
