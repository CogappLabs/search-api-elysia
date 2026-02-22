/** Bump to instantly invalidate all cached keys. */
export declare const CACHE_VERSION = "v1";
export interface Cache {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
    flush(): Promise<void>;
    readonly isConnected: boolean;
}
export declare function createCache(redisUrl?: string): Cache | null;
/**
 * Build a deterministic cache key from search parameters.
 * Sorts object keys at all levels to ensure identical queries produce identical keys.
 */
export declare function buildSearchCacheKey(handle: string, q: string, options: Record<string, unknown>): string;
