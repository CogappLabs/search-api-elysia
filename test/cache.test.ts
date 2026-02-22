import { describe, expect, it } from "bun:test";
import { buildSearchCacheKey } from "../src/cache.ts";

describe("buildSearchCacheKey", () => {
  it("produces a deterministic key for the same inputs", () => {
    const key1 = buildSearchCacheKey("my_index", "castle", {
      page: 1,
      perPage: 20,
    });
    const key2 = buildSearchCacheKey("my_index", "castle", {
      page: 1,
      perPage: 20,
    });
    expect(key1).toBe(key2);
  });

  it("starts with search:{handle}:", () => {
    const key = buildSearchCacheKey("my_index", "castle", {});
    expect(key).toStartWith("search:my_index:");
  });

  it("produces different keys for different queries", () => {
    const key1 = buildSearchCacheKey("idx", "castle", { page: 1 });
    const key2 = buildSearchCacheKey("idx", "palace", { page: 1 });
    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different handles", () => {
    const key1 = buildSearchCacheKey("index_a", "castle", {});
    const key2 = buildSearchCacheKey("index_b", "castle", {});
    expect(key1).not.toBe(key2);
  });

  it("produces different keys for different options", () => {
    const key1 = buildSearchCacheKey("idx", "castle", { page: 1 });
    const key2 = buildSearchCacheKey("idx", "castle", { page: 2 });
    expect(key1).not.toBe(key2);
  });

  it("produces the same key regardless of object key order", () => {
    const key1 = buildSearchCacheKey("idx", "castle", {
      page: 1,
      perPage: 10,
      facets: ["country"],
    });
    const key2 = buildSearchCacheKey("idx", "castle", {
      facets: ["country"],
      perPage: 10,
      page: 1,
    });
    expect(key1).toBe(key2);
  });
});

describe("createCache", () => {
  it("returns null when no URL is provided", async () => {
    const { createCache } = await import("../src/cache.ts");
    const cache = createCache(undefined);
    expect(cache).toBeNull();
  });

  it("returns null for empty string URL", async () => {
    const { createCache } = await import("../src/cache.ts");
    const cache = createCache("");
    expect(cache).toBeNull();
  });
});
