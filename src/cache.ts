import { RedisClient } from "bun";

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  flush(): Promise<void>;
  readonly isConnected: boolean;
}

export function createCache(redisUrl?: string): Cache | null {
  if (!redisUrl) return null;

  const client = new RedisClient(redisUrl);
  let connected = true;

  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = await client.get(key);
        if (raw === null) return null;
        return JSON.parse(raw) as T;
      } catch (err) {
        console.error("[cache] get error:", err);
        connected = false;
        return null;
      }
    },

    async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
      try {
        await client.set(key, JSON.stringify(value));
        await client.expire(key, ttlSeconds);
        connected = true;
      } catch (err) {
        console.error("[cache] set error:", err);
        connected = false;
      }
    },

    async flush(): Promise<void> {
      try {
        await client.send("FLUSHDB", []);
        connected = true;
      } catch (err) {
        console.error("[cache] flush error:", err);
        connected = false;
      }
    },

    get isConnected() {
      return connected;
    },
  };
}

/**
 * Build a deterministic cache key from search parameters.
 * Sorts object keys to ensure identical queries produce identical keys.
 */
export function buildSearchCacheKey(
  handle: string,
  q: string,
  options: Record<string, unknown>,
): string {
  const canonical = JSON.stringify(
    { q, ...options },
    Object.keys({ q, ...options }).sort(),
  );
  const hash = new Bun.CryptoHasher("sha256").update(canonical).digest("hex");
  return `search:${handle}:${hash}`;
}
