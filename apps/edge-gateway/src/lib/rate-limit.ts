export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;

  public constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  public async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = this.now();
    const existing = this.buckets.get(key);
    const bucket =
      existing === undefined || existing.resetAt <= now
        ? { count: 0, resetAt: now + windowSeconds * 1000 }
        : existing;

    bucket.count += 1;
    this.buckets.set(key, bucket);

    if (this.buckets.size > 5_000) {
      for (const [candidate, value] of this.buckets) {
        if (value.resetAt <= now) {
          this.buckets.delete(candidate);
        }
      }
    }

    return {
      allowed: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
    };
  }
}

interface UpstashPipelineResult {
  result?: number | string | null;
  error?: string;
}

export class UpstashRateLimiter implements RateLimiter {
  private readonly fallback = new MemoryRateLimiter();
  private readonly url: string;
  private readonly token: string;

  public constructor(url: string, token: string) {
    this.url = url.replace(/\/$/, "");
    this.token = token;
  }

  public async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    try {
      const response = await fetch(`${this.url}/pipeline`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", key],
          ["EXPIRE", key, windowSeconds, "NX"],
        ]),
        signal: AbortSignal.timeout(1_500),
      });

      if (!response.ok) {
        return this.fallback.consume(key, limit, windowSeconds);
      }

      const results = (await response.json()) as UpstashPipelineResult[];
      const count = Number(results[0]?.result ?? 0);
      if (!Number.isFinite(count)) {
        return this.fallback.consume(key, limit, windowSeconds);
      }

      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        resetAt: Date.now() + windowSeconds * 1000,
      };
    } catch {
      return this.fallback.consume(key, limit, windowSeconds);
    }
  }
}

export function createRateLimiter(input: {
  upstashUrl?: string;
  upstashToken?: string;
}): RateLimiter {
  if (input.upstashUrl !== undefined && input.upstashToken !== undefined) {
    return new UpstashRateLimiter(input.upstashUrl, input.upstashToken);
  }
  return new MemoryRateLimiter();
}
