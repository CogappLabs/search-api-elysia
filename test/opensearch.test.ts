import { describe, expect, it } from "bun:test";
import type { ElasticCompatClient } from "../src/engines/elastic-compat.ts";
import { OpenSearchEngine } from "../src/engines/opensearch.ts";
import type { IndexConfig } from "../src/types.ts";

const baseConfig: IndexConfig = {
  engine: "opensearch",
  host: "http://localhost:9200",
  indexName: "test_index",
};

// biome-ignore lint/suspicious/noExplicitAny: mock client captures raw request bodies
let lastSearchBody: any;

function createMockClient() {
  lastSearchBody = undefined;
  return {
    search: async (body: unknown) => {
      lastSearchBody = body;
      return {
        body: {
          hits: {
            total: { value: 2 },
            hits: [
              {
                _id: "1",
                _index: "test_index",
                _score: 1.5,
                _source: { title: "Test" },
              },
            ],
          },
          aggregations: {},
        },
      };
    },
    get: async (_params: { index: string; id: string }) => {
      return {
        body: {
          _id: "1",
          _index: "test_index",
          _source: { title: "Test" },
        },
      };
    },
    indices: {
      getMapping: async (_params: { index: string }) => {
        return {
          body: {
            test_index: {
              mappings: { properties: { title: { type: "text" } } },
            },
          },
        };
      },
    },
  } as unknown as ElasticCompatClient;
}

function createEngine(client: ElasticCompatClient) {
  return new OpenSearchEngine(baseConfig, client);
}

describe("OpenSearchEngine body unwrapping", () => {
  it("unwraps .body from search response", async () => {
    const engine = createEngine(createMockClient());
    const result = await engine.search("test", {});
    expect(result.totalHits).toBe(2);
    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.objectID).toBe("1");
    expect((result.hits[0] as Record<string, unknown>).title).toBe("Test");
  });

  it("unwraps .body from getDocument response", async () => {
    const engine = createEngine(createMockClient());
    const doc = await engine.getDocument("1");
    expect(doc).not.toBeNull();
    expect(doc?.objectID).toBe("1");
    expect(doc?.title).toBe("Test");
  });

  it("unwraps .body from getMapping response", async () => {
    const engine = createEngine(createMockClient());
    const mapping = await engine.getMapping();
    expect(mapping).toHaveProperty("test_index");
  });

  it("passes search body to client correctly", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("castle", {
      boosts: { title: 10 },
    });
    expect(lastSearchBody.query.bool.must[0].multi_match.fields).toEqual([
      "title^10",
    ]);
  });
});

describe("OpenSearchEngine searchFacetValues", () => {
  it("unwraps .body from searchFacetValues response", async () => {
    const client = {
      ...createMockClient(),
      search: async (body: unknown) => {
        lastSearchBody = body;
        return {
          body: {
            aggregations: {
              facet_values: {
                buckets: [
                  { key: "painting", doc_count: 42 },
                  { key: "sculpture", doc_count: 18 },
                ],
              },
            },
          },
        };
      },
    } as unknown as ElasticCompatClient;
    const engine = createEngine(client);
    const result = await engine.searchFacetValues("category", "paint");
    expect(result).toEqual([
      { value: "painting", count: 42 },
      { value: "sculpture", count: 18 },
    ]);
  });
});

describe("OpenSearchEngine rawQuery", () => {
  it("unwraps .body from rawQuery response", async () => {
    const client = {
      ...createMockClient(),
      search: async (body: unknown) => {
        lastSearchBody = body;
        return {
          body: {
            hits: { total: { value: 0 }, hits: [] },
          },
        };
      },
    } as unknown as ElasticCompatClient;
    const engine = createEngine(client);
    const result = await engine.rawQuery({ query: { match_all: {} } });
    expect(result).toHaveProperty("hits");
  });
});

describe("OpenSearchEngine apiKey validation", () => {
  it("throws when apiKey is set without username", () => {
    expect(() => {
      new OpenSearchEngine({
        ...baseConfig,
        apiKey: "some-key",
      });
    }).toThrow("does not support apiKey auth");
  });
});

describe("OpenSearchEngine 404 handling", () => {
  it("returns null for 404 error with statusCode", async () => {
    const client = {
      ...createMockClient(),
      get: async () => {
        const err = new Error("Not Found") as Error & { statusCode: number };
        err.statusCode = 404;
        throw err;
      },
    } as unknown as ElasticCompatClient;
    const engine = createEngine(client);
    const doc = await engine.getDocument("missing");
    expect(doc).toBeNull();
  });

  it("returns null for 404 error with meta.statusCode", async () => {
    const client = {
      ...createMockClient(),
      get: async () => {
        const err = new Error("Not Found") as Error & {
          meta: { statusCode: number };
        };
        err.meta = { statusCode: 404 };
        throw err;
      },
    } as unknown as ElasticCompatClient;
    const engine = createEngine(client);
    const doc = await engine.getDocument("missing");
    expect(doc).toBeNull();
  });
});
