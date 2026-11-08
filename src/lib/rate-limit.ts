/**
 * In-memory sliding-window rate limiter. Good for a single server process; swap for a
 * shared store (e.g. Postgres or Redis) when running more than one instance.
 */
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();

  function check(key: string, now = Date.now()): RateLimitResult {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil((windowMs - (now - recent[0])) / 1000) };
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
    return { ok: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
  }

  function reset(key: string) {
    hits.delete(key);
  }

  return { check, reset };
}

const g = globalThis as unknown as { __crmLimits?: Record<string, ReturnType<typeof createRateLimiter>> };

/** Process-wide limiters, kept across hot reloads in development. */
export const limits = (g.__crmLimits ??= {
  // LOGIN_RATE_LIMIT only exists for the browser tests, which sign in many times from one address.
  login: createRateLimiter({ limit: Number(process.env.LOGIN_RATE_LIMIT) || 10, windowMs: 15 * 60_000 }),
  upload: createRateLimiter({ limit: 30, windowMs: 60 * 60_000 }),
  export: createRateLimiter({ limit: 20, windowMs: 60 * 60_000 }),
  write: createRateLimiter({ limit: 300, windowMs: 60_000 }),
});
