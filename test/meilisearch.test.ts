import { describe, expect, it } from "bun:test";
import type { MeiliSearch } from "meilisearch";
import { MeilisearchEngine } from "../src/engines/meilisearch.ts";
import type { IndexConfig } from "../src/types.ts";

const baseConfig: IndexConfig = {
  engine: "meilisearch",
  host: "http://localhost:7700",
  indexName: "test_index",
};

// biome-ignore lint/suspicious/noExplicitAny: mock captures raw search params
let lastSearchParams: any;
// biome-ignore lint/suspicious/noExplicitAny: mock captures facet search params
let lastFacetSearchParams: any;

function createMockClient(overrides?: {
  searchResponse?: Record<string, unknown>;
  getDocumentResponse?: Record<string, unknown>;
  getDocumentError?: Error;
  facetSearchResponse?: Record<string, unknown>;
}) {
  lastSearchParams = undefined;
  lastFacetSearchParams = undefined;

  const mockIndex = {
    uid: "test_index",
    search: async (_query: string, params: unknown) => {
      lastSearchParams = params;
      return (
        overrides?.searchResponse ?? {
          hits: [],
          totalHits: 0,
          page: 1,
          hitsPerPage: 20,
          totalPages: 0,
          processingTimeMs: 1,
          query: "",
        }
      );
    },
    getDocument: async (_id: string) => {
      if (overrides?.getDocumentError) {
        throw overrides.getDocumentError;
      }
      return overrides?.getDocumentResponse ?? { id: "1", title: "Test" };
    },
    getSettings: async () => ({
      searchableAttributes: ["*"],
      filterableAttributes: [],
    }),
    searchForFacetValues: async (params: unknown) => {
      lastFacetSearchParams = params;
      return (
        overrides?.facetSearchResponse ?? {
          facetHits: [],
          facetQuery: "",
          processingTimeMs: 1,
        }
      );
    },
  };

  return {
    index: (_uid: string) => mockIndex,
  } as unknown as MeiliSearch;
}

function createEngine(
  client: MeiliSearch,
  configOverrides?: Partial<IndexConfig>,
) {
  return new MeilisearchEngine({ ...baseConfig, ...configOverrides }, client);
}

describe("MeilisearchEngine search", () => {
  it("passes pagination using page/hitsPerPage", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("test", { page: 2, perPage: 10 });
    expect(lastSearchParams.page).toBe(2);
    expect(lastSearchParams.hitsPerPage).toBe(10);
  });

  it("normalises hits with objectID from id field", async () => {
    const client = createMockClient({
      searchResponse: {
        hits: [
          { id: "42", title: "Castle", _rankingScore: 0.9 },
          { id: "43", title: "Palace" },
        ],
        totalHits: 2,
        page: 1,
        hitsPerPage: 20,
        totalPages: 1,
        processingTimeMs: 1,
        query: "test",
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("test", {});

    expect(result.hits).toHaveLength(2);
    expect(result.hits[0]?.objectID).toBe("42");
    expect(result.hits[0]?._index).toBe("test_index");
    expect(result.hits[0]?._score).toBe(0.9);
    expect((result.hits[0] as Record<string, unknown>).title).toBe("Castle");
    expect(result.hits[1]?._score).toBeNull();
  });

  it("returns correct pagination info", async () => {
    const client = createMockClient({
      searchResponse: {
        hits: [],
        totalHits: 100,
        page: 3,
        hitsPerPage: 10,
        totalPages: 10,
        processingTimeMs: 1,
        query: "",
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("", { page: 3, perPage: 10 });
    expect(result.totalHits).toBe(100);
    expect(result.page).toBe(3);
    expect(result.perPage).toBe(10);
    expect(result.totalPages).toBe(10);
  });

  it("always returns empty suggestions", async () => {
    const engine = createEngine(createMockClient());
    const result = await engine.search("test", { suggest: true });
    expect(result.suggestions).toEqual([]);
  });
});

describe("MeilisearchEngine filter generation", () => {
  it("generates string equality filter", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { filters: { category: "painting" } });
    expect(lastSearchParams.filter).toEqual(['category = "painting"']);
  });

  it("generates array OR filter", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      filters: { category: ["painting", "sculpture"] },
    });
    expect(lastSearchParams.filter).toEqual([
      '(category = "painting" OR category = "sculpture")',
    ]);
  });

  it("generates range filter with min and max", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      filters: { year: { min: 1800, max: 1900 } },
    });
    expect(lastSearchParams.filter).toEqual(["year >= 1800 AND year <= 1900"]);
  });

  it("generates range filter with min only", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { filters: { year: { min: 1800 } } });
    expect(lastSearchParams.filter).toEqual(["year >= 1800"]);
  });

  it("generates range filter with max only", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { filters: { price: { max: 100 } } });
    expect(lastSearchParams.filter).toEqual(["price <= 100"]);
  });

  it("generates boolean filter", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { filters: { has_image: true } });
    expect(lastSearchParams.filter).toEqual(["has_image = true"]);
  });

  it("escapes quotes in filter values", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { filters: { title: 'O"Brien' } });
    expect(lastSearchParams.filter).toEqual(['title = "O\\"Brien"']);
  });

  it("combines multiple filters", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      filters: { category: "painting", year: { min: 1800 } },
    });
    expect(lastSearchParams.filter).toHaveLength(2);
    expect(lastSearchParams.filter).toContain('category = "painting"');
    expect(lastSearchParams.filter).toContain("year >= 1800");
  });
});

describe("MeilisearchEngine sort translation", () => {
  it("translates sort to Meilisearch format", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { sort: { year: "desc", title: "asc" } });
    expect(lastSearchParams.sort).toEqual(["year:desc", "title:asc"]);
  });

  it("omits sort when not specified", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("test", {});
    expect(lastSearchParams.sort).toBeUndefined();
  });
});

describe("MeilisearchEngine highlight conversion", () => {
  it("extracts highlights from _formatted with <mark> tags", async () => {
    const client = createMockClient({
      searchResponse: {
        hits: [
          {
            id: "1",
            title: "Castle of Glass",
            _formatted: {
              title: "<mark>Castle</mark> of Glass",
              description: "No highlights here",
            },
          },
        ],
        totalHits: 1,
        page: 1,
        hitsPerPage: 20,
        totalPages: 1,
        processingTimeMs: 1,
        query: "castle",
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("castle", { highlight: true });

    expect(result.hits[0]?._highlights).toEqual({
      title: ["<mark>Castle</mark> of Glass"],
    });
  });

  it("passes highlight fields to Meilisearch", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("test", { highlight: ["title", "description"] });
    expect(lastSearchParams.attributesToHighlight).toEqual([
      "title",
      "description",
    ]);
    expect(lastSearchParams.highlightPreTag).toBe("<mark>");
    expect(lastSearchParams.highlightPostTag).toBe("</mark>");
  });

  it("passes wildcard highlight for boolean true", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("test", { highlight: true });
    expect(lastSearchParams.attributesToHighlight).toEqual(["*"]);
  });
});

describe("MeilisearchEngine facet normalization", () => {
  it("normalises facetDistribution to FacetValue[]", async () => {
    const client = createMockClient({
      searchResponse: {
        hits: [],
        totalHits: 100,
        page: 1,
        hitsPerPage: 20,
        totalPages: 5,
        processingTimeMs: 1,
        query: "",
        facetDistribution: {
          category: { painting: 42, sculpture: 18 },
          period: { modern: 30, ancient: 10 },
        },
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("", {
      facets: ["category", "period"],
    });

    expect(result.facets.category).toEqual([
      { value: "painting", count: 42 },
      { value: "sculpture", count: 18 },
    ]);
    expect(result.facets.period).toEqual([
      { value: "modern", count: 30 },
      { value: "ancient", count: 10 },
    ]);
  });

  it("returns empty facets when no facetDistribution", async () => {
    const engine = createEngine(createMockClient());
    const result = await engine.search("", {});
    expect(result.facets).toEqual({});
  });

  it("passes facet fields to Meilisearch", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { facets: ["category", "period"] });
    expect(lastSearchParams.facets).toEqual(["category", "period"]);
  });
});

describe("MeilisearchEngine getDocument", () => {
  it("returns document with objectID", async () => {
    const client = createMockClient({
      getDocumentResponse: { id: "42", title: "Castle" },
    });
    const engine = createEngine(client);
    const doc = await engine.getDocument("42");
    expect(doc).not.toBeNull();
    expect(doc?.objectID).toBe("42");
    expect(doc?.title).toBe("Castle");
    expect(doc?._index).toBe("test_index");
  });

  it("returns null for document_not_found error", async () => {
    const err = new Error("Document not found") as Error & {
      cause: { code: string };
    };
    err.cause = { code: "document_not_found" };
    const client = createMockClient({ getDocumentError: err });
    const engine = createEngine(client);
    const doc = await engine.getDocument("missing");
    expect(doc).toBeNull();
  });

  it("returns null for 404 response status", async () => {
    const err = new Error("Not Found") as Error & {
      response: { status: number };
    };
    err.response = { status: 404 };
    const client = createMockClient({ getDocumentError: err });
    const engine = createEngine(client);
    const doc = await engine.getDocument("missing");
    expect(doc).toBeNull();
  });

  it("throws for other errors", async () => {
    const err = new Error("Server Error") as Error & {
      response: { status: number };
    };
    err.response = { status: 500 };
    const client = createMockClient({ getDocumentError: err });
    const engine = createEngine(client);
    await expect(engine.getDocument("fail")).rejects.toThrow("Server Error");
  });
});

describe("MeilisearchEngine searchFacetValues", () => {
  it("calls searchForFacetValues with correct params", async () => {
    const client = createMockClient({
      facetSearchResponse: {
        facetHits: [
          { value: "painting", count: 42 },
          { value: "sculpture", count: 18 },
        ],
        facetQuery: "paint",
        processingTimeMs: 1,
      },
    });
    const engine = createEngine(client);
    const result = await engine.searchFacetValues("category", "paint");

    expect(lastFacetSearchParams.facetName).toBe("category");
    expect(lastFacetSearchParams.facetQuery).toBe("paint");
    expect(result).toEqual([
      { value: "painting", count: 42 },
      { value: "sculpture", count: 18 },
    ]);
  });

  it("respects maxValues option", async () => {
    const facetHits = Array.from({ length: 30 }, (_, i) => ({
      value: `item_${i}`,
      count: 30 - i,
    }));
    const client = createMockClient({
      facetSearchResponse: {
        facetHits,
        facetQuery: "",
        processingTimeMs: 1,
      },
    });
    const engine = createEngine(client);
    const result = await engine.searchFacetValues("category", "", {
      maxValues: 5,
    });
    expect(result).toHaveLength(5);
  });

  it("passes filters to facet search", async () => {
    const client = createMockClient({
      facetSearchResponse: {
        facetHits: [],
        facetQuery: "",
        processingTimeMs: 1,
      },
    });
    const engine = createEngine(client);
    await engine.searchFacetValues("category", "", {
      filters: { period: "modern" },
    });
    expect(lastFacetSearchParams.filter).toEqual(['period = "modern"']);
  });
});

describe("MeilisearchEngine metadata precedence", () => {
  it("objectID is not overwritten by source fields", async () => {
    const client = createMockClient({
      searchResponse: {
        hits: [{ id: 42, title: "Test", _index: "wrong", _score: 999 }],
        totalHits: 1,
        page: 1,
        hitsPerPage: 20,
        totalPages: 1,
        processingTimeMs: 1,
        query: "",
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("", {});
    // objectID should be the stringified id, not overwritten
    expect(result.hits[0]?.objectID).toBe("42");
    // _index should be the engine's index uid, not the source field
    expect(result.hits[0]?._index).toBe("test_index");
  });
});

describe("MeilisearchEngine multi-index validation", () => {
  it("throws when indexName is an array with multiple entries", () => {
    expect(() => {
      createEngine(createMockClient(), {
        indexName: ["index_a", "index_b"],
      });
    }).toThrow("does not support multi-index search");
  });

  it("accepts a single-element array", () => {
    expect(() => {
      createEngine(createMockClient(), {
        indexName: ["single_index"],
      });
    }).not.toThrow();
  });
});

describe("MeilisearchEngine unsupported features", () => {
  it("does not include histograms in response", async () => {
    const engine = createEngine(createMockClient());
    const result = await engine.search("", { histogram: { year: 100 } });
    expect(result.histograms).toBeUndefined();
  });

  it("does not include geoClusters in response", async () => {
    const engine = createEngine(createMockClient());
    const result = await engine.search("", {
      geoGrid: {
        field: "coords",
        precision: 6,
        bounds: {
          top_left: { lat: 60, lon: -5 },
          bottom_right: { lat: 48, lon: 3 },
        },
      },
    });
    expect(result.geoClusters).toBeUndefined();
  });
});
