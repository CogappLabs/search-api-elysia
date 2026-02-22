import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import type { SearchEngine } from "../src/engines/engine.ts";
import { FieldAliasMap } from "../src/field-aliases.ts";
import {
  convertFacets,
  convertHighlights,
  fromSearchResult,
  parseFacetFilters,
  parseNumericFilters,
  toSearchOptions,
} from "../src/instantsearch.ts";
import { instantSearchRoutes } from "../src/routes/instantsearch.ts";
import type { IndexConfig, SearchOptions, SearchResult } from "../src/types.ts";

// biome-ignore lint/suspicious/noExplicitAny: test helper for response body assertions
async function json(res: Response): Promise<any> {
  return res.json();
}

function createMockEngine(overrides?: Partial<SearchEngine>): SearchEngine {
  return {
    search: async (_query, options) => ({
      hits: [
        {
          objectID: "1",
          _index: "test_index",
          _score: 1.0,
          _highlights: { title: ["<mark>Test</mark> result"] },
          title: "Test result",
        },
      ],
      totalHits: 1,
      page: options.page ?? 1,
      perPage: options.perPage ?? 20,
      totalPages: 1,
      facets: {},
      suggestions: [],
    }),
    getDocument: async () => null,
    searchFacetValues: async () => [],
    getMapping: async () => ({}),
    rawQuery: async () => ({}),
    ...overrides,
  };
}

const mockConfig: IndexConfig = {
  engine: "elasticsearch",
  host: "http://localhost:9200",
  indexName: "test_index",
  defaults: { perPage: 10, facets: ["category"], highlight: true },
};

function createTestApp(
  engine?: SearchEngine,
  config?: IndexConfig,
  aliasMap?: FieldAliasMap,
  boosts?: Record<string, number>,
  searchableFields?: string[],
) {
  const e = engine ?? createMockEngine();
  const c = config ?? mockConfig;
  const aliasMaps = aliasMap ? new Map([["test", aliasMap]]) : undefined;
  const boostsMaps = boosts ? new Map([["test", boosts]]) : undefined;
  const searchableFieldsMaps = searchableFields
    ? new Map([["test", searchableFields]])
    : undefined;
  return new Elysia().use(
    instantSearchRoutes(
      new Map([["test", e]]),
      new Map([["test", c]]),
      aliasMaps,
      boostsMaps,
      searchableFieldsMaps,
    ),
  );
}

function postInstantSearch(
  // biome-ignore lint/suspicious/noExplicitAny: Elysia generic types vary across plugin boundaries
  app: any,
  handle: string,
  body: unknown,
): Promise<Response> {
  return app.handle(
    new Request(`http://localhost/${handle}/instantsearch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

// ---- Unit tests: translation functions ----

describe("parseFacetFilters", () => {
  it("parses simple string entries", () => {
    const result = parseFacetFilters(["brand:Nike", "color:Red"]);
    expect(result).toEqual({ brand: "Nike", color: "Red" });
  });

  it("parses OR groups (inner arrays) into arrays", () => {
    const result = parseFacetFilters([
      ["category:Shoes", "category:Boots"],
      "brand:Nike",
    ]);
    expect(result).toEqual({
      category: ["Shoes", "Boots"],
      brand: "Nike",
    });
  });

  it("skips negated entries", () => {
    const result = parseFacetFilters(["brand:Nike", "-color:Red"]);
    expect(result).toEqual({ brand: "Nike" });
  });

  it("handles values containing colons", () => {
    const result = parseFacetFilters(["url:https://example.com"]);
    expect(result).toEqual({ url: "https://example.com" });
  });

  it("returns empty object for empty input", () => {
    expect(parseFacetFilters([])).toEqual({});
  });

  it("skips entries without colons", () => {
    const result = parseFacetFilters(["invalid", "brand:Nike"]);
    expect(result).toEqual({ brand: "Nike" });
  });
});

describe("parseNumericFilters", () => {
  it("parses >= and <= into min/max", () => {
    const result = parseNumericFilters(["price>=10", "price<=100"]);
    expect(result).toEqual({ price: { min: 10, max: 100 } });
  });

  it("parses > and < operators", () => {
    const result = parseNumericFilters(["rating>3", "rating<5"]);
    expect(result).toEqual({ rating: { min: 3, max: 5 } });
  });

  it("handles multiple fields", () => {
    const result = parseNumericFilters(["price>=10", "stock<=50"]);
    expect(result).toEqual({
      price: { min: 10 },
      stock: { max: 50 },
    });
  });

  it("returns empty object for empty input", () => {
    expect(parseNumericFilters([])).toEqual({});
  });

  it("skips invalid entries", () => {
    const result = parseNumericFilters(["invalid", "price>=10"]);
    expect(result).toEqual({ price: { min: 10 } });
  });

  it("handles decimal values", () => {
    const result = parseNumericFilters(["price>=9.99"]);
    expect(result).toEqual({ price: { min: 9.99 } });
  });
});

describe("convertHighlights", () => {
  it("converts <mark> to <em> by default", () => {
    const result = convertHighlights({
      title: ["<mark>Test</mark> result"],
    });
    expect(result).toEqual({
      title: { value: "<em>Test</em> result", matchLevel: "full" },
    });
  });

  it("uses custom pre/post tags", () => {
    const result = convertHighlights(
      { title: ["<mark>Test</mark>"] },
      "<strong>",
      "</strong>",
    );
    expect(result).toEqual({
      title: { value: "<strong>Test</strong>", matchLevel: "full" },
    });
  });

  it("joins multiple fragments with ...", () => {
    const result = convertHighlights({
      body: ["first <mark>match</mark>", "second <mark>match</mark>"],
    });
    expect(result.body?.value).toBe(
      "first <em>match</em> ... second <em>match</em>",
    );
    expect(result.body?.matchLevel).toBe("full");
  });

  it("returns matchLevel none for empty fragments", () => {
    const result = convertHighlights({ title: [] });
    expect(result).toEqual({
      title: { value: "", matchLevel: "none" },
    });
  });
});

describe("convertFacets", () => {
  it("converts value/count array to value:count object", () => {
    const result = convertFacets({
      category: [
        { value: "Shoes", count: 10 },
        { value: "Boots", count: 5 },
      ],
    });
    expect(result).toEqual({
      category: { Shoes: 10, Boots: 5 },
    });
  });

  it("handles empty facet arrays", () => {
    const result = convertFacets({ category: [] });
    expect(result).toEqual({ category: {} });
  });

  it("handles multiple fields", () => {
    const result = convertFacets({
      category: [{ value: "Shoes", count: 10 }],
      brand: [{ value: "Nike", count: 7 }],
    });
    expect(result).toEqual({
      category: { Shoes: 10 },
      brand: { Nike: 7 },
    });
  });
});

describe("toSearchOptions", () => {
  it("converts page from 0-indexed to 1-indexed", () => {
    const options = toSearchOptions({ params: { page: 0 } });
    expect(options.page).toBe(1);

    const options2 = toSearchOptions({ params: { page: 2 } });
    expect(options2.page).toBe(3);
  });

  it("defaults page to 1 when not provided", () => {
    const options = toSearchOptions({});
    expect(options.page).toBe(1);
  });

  it("defaults hitsPerPage to 20", () => {
    const options = toSearchOptions({});
    expect(options.perPage).toBe(20);
  });

  it("clamps hitsPerPage 0 to 1", () => {
    const options = toSearchOptions({ params: { hitsPerPage: 0 } });
    expect(options.perPage).toBe(1);
  });

  it("sets highlight to true", () => {
    const options = toSearchOptions({});
    expect(options.highlight).toBe(true);
  });

  it("passes facets through", () => {
    const options = toSearchOptions({
      params: { facets: ["category", "brand"] },
    });
    expect(options.facets).toEqual(["category", "brand"]);
  });

  it("uses default facets when facets is ['*']", () => {
    const options = toSearchOptions({ params: { facets: ["*"] } }, [
      "category",
      "brand",
    ]);
    expect(options.facets).toEqual(["category", "brand"]);
  });

  it("does not set facets for ['*'] when no defaults", () => {
    const options = toSearchOptions({ params: { facets: ["*"] } });
    expect(options.facets).toBeUndefined();
  });

  it("converts facetFilters to filters", () => {
    const options = toSearchOptions({
      params: { facetFilters: ["brand:Nike"] },
    });
    expect(options.filters).toEqual({ brand: "Nike" });
  });

  it("converts numericFilters to filters", () => {
    const options = toSearchOptions({
      params: { numericFilters: ["price>=10"] },
    });
    expect(options.filters).toEqual({ price: { min: 10 } });
  });

  it("merges facetFilters and numericFilters", () => {
    const options = toSearchOptions({
      params: {
        facetFilters: ["brand:Nike"],
        numericFilters: ["price>=10"],
      },
    });
    expect(options.filters).toEqual({
      brand: "Nike",
      price: { min: 10 },
    });
  });

  it("passes attributesToRetrieve through", () => {
    const options = toSearchOptions({
      params: { attributesToRetrieve: ["title", "url"] },
    });
    expect(options.attributesToRetrieve).toEqual(["title", "url"]);
  });

  it("handles string facets param", () => {
    const options = toSearchOptions({ params: { facets: "category" } });
    expect(options.facets).toEqual(["category"]);
  });
});

describe("fromSearchResult", () => {
  const searchResult: SearchResult = {
    hits: [
      {
        objectID: "1",
        _index: "test_index",
        _score: 1.5,
        _highlights: { title: ["<mark>Hello</mark>"] },
        title: "Hello World",
        url: "/hello",
      },
    ],
    totalHits: 42,
    page: 2,
    perPage: 10,
    totalPages: 5,
    facets: {
      category: [
        { value: "A", count: 20 },
        { value: "B", count: 22 },
      ],
    },
    suggestions: [],
  };

  it("converts page from 1-indexed to 0-indexed", () => {
    const result = fromSearchResult(searchResult, "test", 5);
    expect(result.page).toBe(1);
  });

  it("maps totalHits to nbHits", () => {
    const result = fromSearchResult(searchResult, "test", 5);
    expect(result.nbHits).toBe(42);
  });

  it("maps totalPages to nbPages", () => {
    const result = fromSearchResult(searchResult, "test", 5);
    expect(result.nbPages).toBe(5);
  });

  it("maps perPage to hitsPerPage", () => {
    const result = fromSearchResult(searchResult, "test", 5);
    expect(result.hitsPerPage).toBe(10);
  });

  it("echoes back query", () => {
    const result = fromSearchResult(searchResult, "my query", 5);
    expect(result.query).toBe("my query");
  });

  it("sets exhaustiveNbHits to true", () => {
    const result = fromSearchResult(searchResult, "test", 5);
    expect(result.exhaustiveNbHits).toBe(true);
  });

  it("includes processingTimeMS", () => {
    const result = fromSearchResult(searchResult, "test", 42);
    expect(result.processingTimeMS).toBe(42);
  });

  it("strips _highlights, _index, _score from hits", () => {
    const result = fromSearchResult(searchResult, "test", 5);
    const hit = result.hits[0];
    expect(hit?._index).toBeUndefined();
    expect(hit?._score).toBeUndefined();
    expect(hit?.title).toBe("Hello World");
    expect(hit?.url).toBe("/hello");
    expect(hit?.objectID).toBe("1");
  });

  it("converts highlights to _highlightResult", () => {
    const result = fromSearchResult(searchResult, "test", 5);
    expect(result.hits[0]?._highlightResult).toEqual({
      title: { value: "<em>Hello</em>", matchLevel: "full" },
    });
  });

  it("converts facets to Algolia format", () => {
    const result = fromSearchResult(searchResult, "test", 5);
    expect(result.facets).toEqual({
      category: { A: 20, B: 22 },
    });
  });
});

// ---- Integration tests: route ----

describe("POST /:handle/instantsearch", () => {
  it("returns Algolia-format results for a basic query", async () => {
    const app = createTestApp();
    const res = await postInstantSearch(app, "test", {
      requests: [{ query: "hello", params: { page: 0, hitsPerPage: 10 } }],
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].nbHits).toBe(1);
    expect(body.results[0].page).toBe(0);
    expect(body.results[0].hitsPerPage).toBe(10);
    expect(body.results[0].hits[0].objectID).toBe("1");
    expect(body.results[0].query).toBe("hello");
    expect(body.results[0].exhaustiveNbHits).toBe(true);
    expect(typeof body.results[0].processingTimeMS).toBe("number");
  });

  it("reads query from params.query (InstantSearch.js format)", async () => {
    let capturedQuery = "";
    const engine = createMockEngine({
      search: async (query, opts) => {
        capturedQuery = query;
        return {
          hits: [],
          totalHits: 0,
          page: opts.page ?? 1,
          perPage: opts.perPage ?? 20,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine);
    const res = await postInstantSearch(app, "test", {
      requests: [{ indexName: "test", params: { query: "stones" } }],
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(capturedQuery).toBe("stones");
    expect(body.results[0].query).toBe("stones");
  });

  it("prefers params.query over top-level query", async () => {
    let capturedQuery = "";
    const engine = createMockEngine({
      search: async (query, opts) => {
        capturedQuery = query;
        return {
          hits: [],
          totalHits: 0,
          page: opts.page ?? 1,
          perPage: opts.perPage ?? 20,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine);
    await postInstantSearch(app, "test", {
      requests: [{ query: "top-level", params: { query: "inside-params" } }],
    });
    expect(capturedQuery).toBe("inside-params");
  });

  it("handles multiple requests in parallel", async () => {
    let callCount = 0;
    const engine = createMockEngine({
      search: async (query, options) => {
        callCount++;
        return {
          hits: [
            {
              objectID: String(callCount),
              _index: "test",
              _score: 1,
              _highlights: {},
              title: query,
            },
          ],
          totalHits: 1,
          page: options.page ?? 1,
          perPage: options.perPage ?? 20,
          totalPages: 1,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine);
    const res = await postInstantSearch(app, "test", {
      requests: [{ query: "first" }, { query: "second" }],
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.results).toHaveLength(2);
    expect(callCount).toBe(2);
  });

  it("returns 404 for unknown handle", async () => {
    const app = createTestApp();
    const res = await postInstantSearch(app, "unknown", {
      requests: [{ query: "test" }],
    });
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toContain("not found");
  });

  it("converts highlights from <mark> to <em> by default", async () => {
    const app = createTestApp();
    const res = await postInstantSearch(app, "test", {
      requests: [{ query: "test" }],
    });
    const body = await json(res);
    const hr = body.results[0].hits[0]._highlightResult;
    expect(hr.title.value).toBe("<em>Test</em> result");
    expect(hr.title.matchLevel).toBe("full");
  });

  it("uses custom highlight tags", async () => {
    const app = createTestApp();
    const res = await postInstantSearch(app, "test", {
      requests: [
        {
          query: "test",
          params: {
            highlightPreTag: "<b>",
            highlightPostTag: "</b>",
          },
        },
      ],
    });
    const body = await json(res);
    expect(body.results[0].hits[0]._highlightResult.title.value).toBe(
      "<b>Test</b> result",
    );
  });

  it("converts facets to Algolia format", async () => {
    const engine = createMockEngine({
      search: async (_q, _opts) => ({
        hits: [],
        totalHits: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
        facets: {
          category: [
            { value: "A", count: 10 },
            { value: "B", count: 5 },
          ],
        },
        suggestions: [],
      }),
    });
    const app = createTestApp(engine);
    const res = await postInstantSearch(app, "test", {
      requests: [{ query: "", params: { facets: ["category"] } }],
    });
    const body = await json(res);
    expect(body.results[0].facets).toEqual({
      category: { A: 10, B: 5 },
    });
  });

  it("applies field aliases inbound and outbound", async () => {
    let capturedOptions: SearchOptions = {};
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedOptions = opts;
        return {
          hits: [
            {
              objectID: "1",
              _index: "test",
              _score: 1,
              _highlights: { placeCountry: ["<mark>Scotland</mark>"] },
              title: "Test",
            },
          ],
          totalHits: 1,
          page: opts.page ?? 1,
          perPage: opts.perPage ?? 20,
          totalPages: 1,
          facets: {
            placeCountry: [{ value: "Scotland", count: 10 }],
          },
          suggestions: [],
        };
      },
    });
    const aliasMap = new FieldAliasMap({ country: "placeCountry" });
    const app = createTestApp(engine, undefined, aliasMap);

    const res = await postInstantSearch(app, "test", {
      requests: [
        {
          query: "test",
          params: {
            facets: ["country"],
            facetFilters: ["country:Scotland"],
          },
        },
      ],
    });
    const body = await json(res);

    // Inbound: alias → ES field name
    expect(capturedOptions.facets).toEqual(["placeCountry"]);
    expect(capturedOptions.filters).toEqual({ placeCountry: "Scotland" });

    // Outbound: ES field name → alias
    expect(body.results[0].facets.country).toBeDefined();
    expect(body.results[0].facets.placeCountry).toBeUndefined();
    expect(body.results[0].hits[0]._highlightResult.country).toBeDefined();
    expect(
      body.results[0].hits[0]._highlightResult.placeCountry,
    ).toBeUndefined();
  });

  it("applies config boosts", async () => {
    let capturedOptions: SearchOptions = {};
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedOptions = opts;
        return {
          hits: [],
          totalHits: 0,
          page: 1,
          perPage: 20,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine, undefined, undefined, {
      title: 10,
      description: 2,
    });

    await postInstantSearch(app, "test", {
      requests: [{ query: "test" }],
    });
    expect(capturedOptions.boosts).toEqual({ title: 10, description: 2 });
  });

  it("applies config searchableFields when no boosts", async () => {
    let capturedOptions: SearchOptions = {};
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedOptions = opts;
        return {
          hits: [],
          totalHits: 0,
          page: 1,
          perPage: 20,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine, undefined, undefined, {}, [
      "title",
      "body",
    ]);

    await postInstantSearch(app, "test", {
      requests: [{ query: "test" }],
    });
    expect(capturedOptions.searchableFields).toEqual(["title", "body"]);
    expect(capturedOptions.boosts).toBeUndefined();
  });

  it("uses default facets for facets: ['*']", async () => {
    let capturedOptions: SearchOptions = {};
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedOptions = opts;
        return {
          hits: [],
          totalHits: 0,
          page: 1,
          perPage: 20,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine);

    await postInstantSearch(app, "test", {
      requests: [{ query: "", params: { facets: ["*"] } }],
    });
    expect(capturedOptions.facets).toEqual(["category"]);
  });

  it("converts 0-indexed page to 1-indexed for engine", async () => {
    let capturedOptions: SearchOptions = {};
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedOptions = opts;
        return {
          hits: [],
          totalHits: 0,
          page: opts.page ?? 1,
          perPage: 20,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine);

    const res = await postInstantSearch(app, "test", {
      requests: [{ query: "test", params: { page: 3 } }],
    });
    const body = await json(res);
    // Engine receives 1-indexed
    expect(capturedOptions.page).toBe(4);
    // Response returns 0-indexed
    expect(body.results[0].page).toBe(3);
  });

  it("passes facetFilters and numericFilters as engine filters", async () => {
    let capturedOptions: SearchOptions = {};
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedOptions = opts;
        return {
          hits: [],
          totalHits: 0,
          page: 1,
          perPage: 20,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine);

    await postInstantSearch(app, "test", {
      requests: [
        {
          query: "test",
          params: {
            facetFilters: [["category:A", "category:B"], "brand:X"],
            numericFilters: ["price>=10", "price<=100"],
          },
        },
      ],
    });
    expect(capturedOptions.filters).toEqual({
      category: ["A", "B"],
      brand: "X",
      price: { min: 10, max: 100 },
    });
  });

  it("handles empty requests array", async () => {
    const app = createTestApp();
    const res = await postInstantSearch(app, "test", { requests: [] });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.results).toEqual([]);
  });
});
