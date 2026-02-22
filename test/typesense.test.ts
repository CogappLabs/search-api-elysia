import { describe, expect, it } from "bun:test";
import type { Client } from "typesense";
import { TypesenseEngine } from "../src/engines/typesense.ts";
import type { IndexConfig } from "../src/types.ts";

const baseConfig: IndexConfig = {
  engine: "typesense",
  host: "http://localhost:8108",
  apiKey: "test-key",
  indexName: "test_collection",
};

// biome-ignore lint/suspicious/noExplicitAny: mock captures raw search params
let lastSearchParams: any;

function createMockClient(overrides?: {
  searchResponse?: Record<string, unknown>;
  getDocumentResponse?: Record<string, unknown>;
  getDocumentError?: Error;
  retrieveResponse?: Record<string, unknown>;
}) {
  lastSearchParams = undefined;

  const mockDocuments = {
    search: async (params: unknown) => {
      lastSearchParams = params;
      return (
        overrides?.searchResponse ?? {
          found: 0,
          hits: [],
          page: 1,
          search_time_ms: 1,
          out_of: 0,
          request_params: { per_page: 20 },
        }
      );
    },
  };

  const mockDocument = (id: string) => ({
    retrieve: async () => {
      if (overrides?.getDocumentError) {
        throw overrides.getDocumentError;
      }
      return overrides?.getDocumentResponse ?? { id, title: "Test" };
    },
  });

  return {
    collections: (_name: string) => ({
      documents: (id?: string) => {
        if (id !== undefined) return mockDocument(id);
        return mockDocuments;
      },
      retrieve: async () =>
        overrides?.retrieveResponse ?? {
          name: "test_collection",
          fields: [],
          num_documents: 0,
        },
    }),
  } as unknown as Client;
}

function createEngine(client: Client, configOverrides?: Partial<IndexConfig>) {
  return new TypesenseEngine({ ...baseConfig, ...configOverrides }, client);
}

describe("TypesenseEngine search", () => {
  it("passes pagination using page/per_page", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("test", { page: 2, perPage: 10 });
    expect(lastSearchParams.page).toBe(2);
    expect(lastSearchParams.per_page).toBe(10);
  });

  it("normalises hits with objectID from id field", async () => {
    const client = createMockClient({
      searchResponse: {
        found: 2,
        hits: [
          {
            document: { id: "42", title: "Castle" },
            text_match: 100,
            highlight: {},
          },
          {
            document: { id: "43", title: "Palace" },
            text_match: 80,
            highlight: {},
          },
        ],
        page: 1,
        search_time_ms: 1,
        out_of: 2,
        request_params: { per_page: 20 },
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("test", {});

    expect(result.hits).toHaveLength(2);
    expect(result.hits[0]?.objectID).toBe("42");
    expect(result.hits[0]?._index).toBe("test_collection");
    expect(result.hits[0]?._score).toBe(100);
    expect((result.hits[0] as Record<string, unknown>).title).toBe("Castle");
    expect(result.hits[1]?._score).toBe(80);
  });

  it("returns correct pagination info", async () => {
    const client = createMockClient({
      searchResponse: {
        found: 100,
        hits: [],
        page: 3,
        search_time_ms: 1,
        out_of: 100,
        request_params: { per_page: 10 },
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
    const result = await engine.search("test", {});
    expect(result.suggestions).toEqual([]);
  });

  it("uses wildcard query_by by default", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("test", {});
    expect(lastSearchParams.query_by).toBe("*");
  });

  it("uses boosts keys as query_by with weights", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("test", { boosts: { title: 10, description: 2 } });
    expect(lastSearchParams.query_by).toBe("title,description");
    expect(lastSearchParams.query_by_weights).toBe("10,2");
  });

  it("uses searchableFields as query_by", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("test", {
      searchableFields: ["title", "description"],
    });
    expect(lastSearchParams.query_by).toBe("title,description");
  });

  it("sends * when query is empty", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {});
    expect(lastSearchParams.q).toBe("*");
  });
});

describe("TypesenseEngine filter generation", () => {
  it("generates string equality filter", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { filters: { category: "painting" } });
    expect(lastSearchParams.filter_by).toBe("category:=`painting`");
  });

  it("generates array OR filter", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      filters: { category: ["painting", "sculpture"] },
    });
    expect(lastSearchParams.filter_by).toBe(
      "category:=[`painting`,`sculpture`]",
    );
  });

  it("generates range filter with min and max", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      filters: { year: { min: 1800, max: 1900 } },
    });
    expect(lastSearchParams.filter_by).toBe("year:>=1800 && year:<=1900");
  });

  it("generates range filter with min only", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { filters: { year: { min: 1800 } } });
    expect(lastSearchParams.filter_by).toBe("year:>=1800");
  });

  it("generates range filter with max only", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { filters: { price: { max: 100 } } });
    expect(lastSearchParams.filter_by).toBe("price:<=100");
  });

  it("generates boolean filter", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { filters: { has_image: true } });
    expect(lastSearchParams.filter_by).toBe("has_image:=true");
  });

  it("escapes backticks in filter values", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { filters: { title: "test`value" } });
    expect(lastSearchParams.filter_by).toBe("title:=`test\\`value`");
  });

  it("combines multiple filters with &&", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      filters: { category: "painting", has_image: true },
    });
    expect(lastSearchParams.filter_by).toContain("category:=`painting`");
    expect(lastSearchParams.filter_by).toContain("has_image:=true");
    expect(lastSearchParams.filter_by).toContain(" && ");
  });
});

describe("TypesenseEngine sort translation", () => {
  it("translates sort to Typesense sort_by format", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { sort: { year: "desc", title: "asc" } });
    expect(lastSearchParams.sort_by).toBe("year:desc,title:asc");
  });

  it("omits sort_by when not specified", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("test", {});
    expect(lastSearchParams.sort_by).toBeUndefined();
  });
});

describe("TypesenseEngine highlight conversion", () => {
  it("extracts highlights from highlight object (v26+ format)", async () => {
    const client = createMockClient({
      searchResponse: {
        found: 1,
        hits: [
          {
            document: { id: "1", title: "Castle of Glass" },
            text_match: 100,
            highlight: {
              title: {
                snippet: "<mark>Castle</mark> of Glass",
                matched_tokens: ["Castle"],
              },
            },
          },
        ],
        page: 1,
        search_time_ms: 1,
        out_of: 1,
        request_params: { per_page: 20 },
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("castle", { highlight: true });

    expect(result.hits[0]?._highlights).toEqual({
      title: ["<mark>Castle</mark> of Glass"],
    });
  });

  it("extracts highlights from legacy highlights array", async () => {
    const client = createMockClient({
      searchResponse: {
        found: 1,
        hits: [
          {
            document: { id: "1", title: "Castle of Glass" },
            text_match: 100,
            highlight: {},
            highlights: [
              { field: "title", snippet: "<mark>Castle</mark> of Glass" },
            ],
          },
        ],
        page: 1,
        search_time_ms: 1,
        out_of: 1,
        request_params: { per_page: 20 },
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("castle", { highlight: true });

    expect(result.hits[0]?._highlights).toEqual({
      title: ["<mark>Castle</mark> of Glass"],
    });
  });

  it("passes highlight params to Typesense", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("test", { highlight: ["title", "description"] });
    expect(lastSearchParams.highlight_fields).toBe("title,description");
    expect(lastSearchParams.highlight_start_tag).toBe("<mark>");
    expect(lastSearchParams.highlight_end_tag).toBe("</mark>");
  });

  it("omits highlight_fields for boolean true (uses defaults)", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("test", { highlight: true });
    expect(lastSearchParams.highlight_fields).toBeUndefined();
    expect(lastSearchParams.highlight_start_tag).toBe("<mark>");
  });
});

describe("TypesenseEngine facet normalization", () => {
  it("normalises facet_counts to FacetValue[]", async () => {
    const client = createMockClient({
      searchResponse: {
        found: 100,
        hits: [],
        page: 1,
        search_time_ms: 1,
        out_of: 100,
        request_params: { per_page: 20 },
        facet_counts: [
          {
            field_name: "category",
            counts: [
              { value: "painting", count: 42, highlighted: "painting" },
              { value: "sculpture", count: 18, highlighted: "sculpture" },
            ],
            sampled: false,
            stats: {},
          },
          {
            field_name: "period",
            counts: [
              { value: "modern", count: 30, highlighted: "modern" },
              { value: "ancient", count: 10, highlighted: "ancient" },
            ],
            sampled: false,
            stats: {},
          },
        ],
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

  it("returns empty facets when no facet_counts", async () => {
    const engine = createEngine(createMockClient());
    const result = await engine.search("", {});
    expect(result.facets).toEqual({});
  });

  it("passes facet_by to Typesense", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { facets: ["category", "period"] });
    expect(lastSearchParams.facet_by).toBe("category,period");
  });
});

describe("TypesenseEngine getDocument", () => {
  it("returns document with objectID", async () => {
    const client = createMockClient({
      getDocumentResponse: { id: "42", title: "Castle" },
    });
    const engine = createEngine(client);
    const doc = await engine.getDocument("42");
    expect(doc).not.toBeNull();
    expect(doc?.objectID).toBe("42");
    expect(doc?.title).toBe("Castle");
    expect(doc?._index).toBe("test_collection");
  });

  it("returns null for 404 error", async () => {
    const err = new Error("Not Found") as Error & { httpStatus: number };
    err.httpStatus = 404;
    const client = createMockClient({ getDocumentError: err });
    const engine = createEngine(client);
    const doc = await engine.getDocument("missing");
    expect(doc).toBeNull();
  });

  it("throws for other errors", async () => {
    const err = new Error("Server Error") as Error & { httpStatus: number };
    err.httpStatus = 500;
    const client = createMockClient({ getDocumentError: err });
    const engine = createEngine(client);
    await expect(engine.getDocument("fail")).rejects.toThrow("Server Error");
  });
});

describe("TypesenseEngine multi-index validation", () => {
  it("throws when indexName is an array with multiple entries", () => {
    expect(() => {
      createEngine(createMockClient(), {
        indexName: ["coll_a", "coll_b"],
      });
    }).toThrow("does not support multi-index search");
  });

  it("accepts a single-element array", () => {
    expect(() => {
      createEngine(createMockClient(), {
        indexName: ["single_collection"],
      });
    }).not.toThrow();
  });
});

describe("TypesenseEngine getMapping", () => {
  it("returns collection schema", async () => {
    const client = createMockClient({
      retrieveResponse: {
        name: "test_collection",
        fields: [{ name: "title", type: "string", facet: false }],
        num_documents: 10,
      },
    });
    const engine = createEngine(client);
    const mapping = await engine.getMapping();
    expect(mapping.name).toBe("test_collection");
    expect((mapping.fields as unknown[]).length).toBe(1);
  });
});

describe("TypesenseEngine rawQuery", () => {
  it("passes query params through to Typesense", async () => {
    const engine = createEngine(createMockClient());
    await engine.rawQuery({ q: "test", per_page: 5 });
    expect(lastSearchParams.q).toBe("test");
    expect(lastSearchParams.per_page).toBe(5);
    expect(lastSearchParams.query_by).toBe("*");
  });
});
