import { describe, expect, it } from "bun:test";
import { Elysia, status as httpStatus } from "elysia";
import type { SearchEngine } from "../src/engines/engine.ts";
import { FieldAliasMap } from "../src/field-aliases.ts";
import { indexesRoute } from "../src/routes/indexes.ts";
import { searchApiRoutes } from "../src/routes/search-api.ts";
import type { AppConfig, IndexConfig, SearchOptions } from "../src/types.ts";

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
          _highlights: {},
          title: "Test",
        },
      ],
      totalHits: 1,
      page: options.page ?? 1,
      perPage: options.perPage ?? 20,
      totalPages: 1,
      facets: {},
      suggestions: [],
    }),
    getDocument: async (id) => {
      if (id === "exists") return { objectID: "exists", title: "Found" };
      return null;
    },
    searchFacetValues: async () => [{ value: "painting", count: 42 }],
    getMapping: async () => ({
      test_index: {
        mappings: { properties: { title: { type: "text" } } },
      },
    }),
    rawQuery: async () => ({
      hits: { total: { value: 0 }, hits: [] },
    }),
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
    searchApiRoutes(
      new Map([["test", e]]),
      new Map([["test", c]]),
      aliasMaps,
      boostsMaps,
      searchableFieldsMaps,
    ),
  );
}

describe("GET /indexes", () => {
  const appConfig: AppConfig = {
    port: 3000,
    indexes: {
      collections: mockConfig,
    },
  };

  it("lists configured indexes without internal details", async () => {
    const app = new Elysia().use(indexesRoute(appConfig));
    const res = await app.handle(new Request("http://localhost/indexes"));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.indexes).toEqual([
      { handle: "collections", engine: "elasticsearch" },
    ]);
    expect(body.indexes[0]).not.toHaveProperty("indexName");
  });
});

describe("GET /:handle/search", () => {
  it("returns search results", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/search?q=hello"),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.hits).toHaveLength(1);
    expect(body.hits[0].objectID).toBe("1");
  });

  it("includes _index in search hits", async () => {
    const engine = createMockEngine({
      search: async (_q, opts) => ({
        hits: [
          {
            objectID: "1",
            _index: "my_index",
            _score: 1.0,
            _highlights: {},
            title: "Test",
          },
        ],
        totalHits: 1,
        page: opts.page ?? 1,
        perPage: opts.perPage ?? 20,
        totalPages: 1,
        facets: {},
        suggestions: [],
      }),
    });
    const app = createTestApp(engine);
    const res = await app.handle(
      new Request("http://localhost/test/search?q=hello"),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.hits[0]._index).toBe("my_index");
  });

  it("returns 404 for unknown index", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/unknown/search?q=test"),
    );
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toContain("not found");
  });

  it("returns 400 for invalid sort JSON", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/search?q=test&sort={bad}"),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("sort");
  });

  it("returns 400 for invalid sort values", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request(
        'http://localhost/test/search?q=test&sort={"title":"sideways"}',
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid filters JSON", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/search?q=test&filters=not-json"),
    );
    expect(res.status).toBe(400);
  });

  it("accepts boolean filter values", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request(
        'http://localhost/test/search?q=test&filters={"has_image":true}',
      ),
    );
    expect(res.status).toBe(200);
  });

  it("clamps page to minimum of 1", async () => {
    let capturedPage = 0;
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedPage = opts.page ?? 1;
        return {
          hits: [],
          totalHits: 0,
          page: capturedPage,
          perPage: opts.perPage ?? 20,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine);

    await app.handle(new Request("http://localhost/test/search?q=test&page=0"));
    expect(capturedPage).toBe(1);

    await app.handle(
      new Request("http://localhost/test/search?q=test&page=-5"),
    );
    expect(capturedPage).toBe(1);
  });

  it("caps perPage at 100", async () => {
    let capturedPerPage = 0;
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedPerPage = opts.perPage ?? 20;
        return {
          hits: [],
          totalHits: 0,
          page: 1,
          perPage: capturedPerPage,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine);

    await app.handle(
      new Request("http://localhost/test/search?q=test&perPage=500"),
    );
    expect(capturedPerPage).toBe(100);
  });

  it("uses index defaults for facets and highlight", async () => {
    let capturedOptions: SearchOptions = {};
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedOptions = opts;
        return {
          hits: [],
          totalHits: 0,
          page: 1,
          perPage: 10,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine);

    await app.handle(new Request("http://localhost/test/search?q=test"));
    expect(capturedOptions.facets).toEqual(["category"]);
    expect(capturedOptions.highlight).toBe(true);
    expect(capturedOptions.perPage).toBe(10);
  });

  it("passes boosts query param to engine", async () => {
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

    await app.handle(
      new Request(
        'http://localhost/test/search?q=test&boosts={"title":10,"description":2}',
      ),
    );
    expect(capturedOptions.boosts).toEqual({ title: 10, description: 2 });
  });

  it("falls back to derived boosts from fields config", async () => {
    let capturedOptions: SearchOptions = {};
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedOptions = opts;
        return {
          hits: [],
          totalHits: 0,
          page: 1,
          perPage: 10,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine, undefined, undefined, { title: 5 });

    await app.handle(new Request("http://localhost/test/search?q=test"));
    expect(capturedOptions.boosts).toEqual({ title: 5 });
  });

  it("query boosts override derived boosts", async () => {
    let capturedOptions: SearchOptions = {};
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedOptions = opts;
        return {
          hits: [],
          totalHits: 0,
          page: 1,
          perPage: 10,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine, undefined, undefined, { title: 5 });

    await app.handle(
      new Request('http://localhost/test/search?q=test&boosts={"title":10}'),
    );
    expect(capturedOptions.boosts).toEqual({ title: 10 });
  });

  it("passes derived searchableFields to engine", async () => {
    let capturedOptions: SearchOptions = {};
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedOptions = opts;
        return {
          hits: [],
          totalHits: 0,
          page: 1,
          perPage: 10,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine, undefined, undefined, {}, [
      "title",
      "description",
    ]);

    await app.handle(new Request("http://localhost/test/search?q=test"));
    expect(capturedOptions.searchableFields).toEqual(["title", "description"]);
    expect(capturedOptions.boosts).toBeUndefined();
  });

  it("does not pass searchableFields when boosts are present", async () => {
    let capturedOptions: SearchOptions = {};
    const engine = createMockEngine({
      search: async (_q, opts) => {
        capturedOptions = opts;
        return {
          hits: [],
          totalHits: 0,
          page: 1,
          perPage: 10,
          totalPages: 0,
          facets: {},
          suggestions: [],
        };
      },
    });
    const app = createTestApp(engine, undefined, undefined, { title: 5 }, [
      "title",
      "description",
    ]);

    await app.handle(new Request("http://localhost/test/search?q=test"));
    expect(capturedOptions.boosts).toEqual({ title: 5 });
    expect(capturedOptions.searchableFields).toBeUndefined();
  });

  it("passes histogram query param to engine", async () => {
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

    await app.handle(
      new Request(
        'http://localhost/test/search?q=test&histogram={"population":1000}',
      ),
    );
    expect(capturedOptions.histogram).toEqual({ population: 1000 });
  });

  it("returns 400 for invalid histogram JSON", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/search?q=test&histogram={bad}"),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("histogram");
  });

  it("returns 400 for invalid histogram values", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request(
        'http://localhost/test/search?q=test&histogram={"pop":"big"}',
      ),
    );
    expect(res.status).toBe(400);
  });

  it("passes geoGrid query param to engine", async () => {
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

    const geoGrid = JSON.stringify({
      field: "coordinates",
      precision: 6,
      bounds: {
        top_left: { lat: 60, lon: -5 },
        bottom_right: { lat: 48, lon: 3 },
      },
    });
    await app.handle(
      new Request(
        `http://localhost/test/search?q=test&geoGrid=${encodeURIComponent(geoGrid)}`,
      ),
    );
    expect(capturedOptions.geoGrid).toBeDefined();
    expect(capturedOptions.geoGrid?.field).toBe("coordinates");
    expect(capturedOptions.geoGrid?.precision).toBe(6);
  });

  it("returns 400 for invalid geoGrid JSON", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/search?q=test&geoGrid={bad}"),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("geoGrid");
  });

  it("returns 400 for geoGrid missing required fields", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request(
        'http://localhost/test/search?q=test&geoGrid={"field":"coords"}',
      ),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for zero histogram interval", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request('http://localhost/test/search?q=test&histogram={"pop":0}'),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid boosts JSON", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/search?q=test&boosts={bad}"),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("boosts");
  });

  it("returns 400 for invalid boosts values", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request(
        'http://localhost/test/search?q=test&boosts={"title":"high"}',
      ),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /:handle/autocomplete", () => {
  it("returns hits and totalHits", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/autocomplete?q=hello"),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.hits).toBeDefined();
    expect(body.totalHits).toBeDefined();
    expect(body.page).toBeUndefined();
  });

  it("returns 404 for unknown index", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/unknown/autocomplete?q=test"),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /:handle/documents/:id", () => {
  it("returns a document by ID", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/documents/exists"),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.objectID).toBe("exists");
    expect(body.title).toBe("Found");
  });

  it("returns 404 for missing document", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/documents/missing"),
    );
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toContain("not found");
  });

  it("returns 404 for unknown index", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/unknown/documents/1"),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /:handle/mapping", () => {
  it("returns mapping data", async () => {
    const app = createTestApp();
    const res = await app.handle(new Request("http://localhost/test/mapping"));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.test_index).toBeDefined();
    expect(body.test_index.mappings.properties.title.type).toBe("text");
  });

  it("returns 404 for unknown handle", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/unknown/mapping"),
    );
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toContain("not found");
  });
});

describe("POST /:handle/query", () => {
  it("returns raw response", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: { match_all: {} } }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.hits).toBeDefined();
  });

  it("returns 404 for unknown handle", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/unknown/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: { match_all: {} } }),
      }),
    );
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toContain("not found");
  });
});

describe("GET /:handle/facets/:field", () => {
  it("returns facet values", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/facets/category"),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.field).toBe("category");
    expect(body.values).toEqual([{ value: "painting", count: 42 }]);
  });

  it("returns 404 for unknown index", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/unknown/facets/category"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid filters JSON", async () => {
    const app = createTestApp();
    const res = await app.handle(
      new Request("http://localhost/test/facets/category?filters=bad"),
    );
    expect(res.status).toBe(400);
  });

  it("translates alias field name to ES field in facets route", async () => {
    let capturedField = "";
    const engine = createMockEngine({
      searchFacetValues: async (field) => {
        capturedField = field;
        return [{ value: "Scotland", count: 10 }];
      },
    });
    const aliasMap = new FieldAliasMap({ country: "placeCountry" });
    const app = createTestApp(engine, undefined, aliasMap);

    const res = await app.handle(
      new Request("http://localhost/test/facets/country"),
    );
    expect(res.status).toBe(200);
    const body = await json(res);
    // Engine received ES field name
    expect(capturedField).toBe("placeCountry");
    // Response returns the alias
    expect(body.field).toBe("country");
  });
});

describe("Field alias translation", () => {
  const aliasMap = new FieldAliasMap({
    country: "placeCountry",
    region: "placeRegion",
  });

  it("translates inbound filter aliases to ES field names", async () => {
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
    const app = createTestApp(engine, undefined, aliasMap);

    await app.handle(
      new Request(
        'http://localhost/test/search?q=test&filters={"country":"Scotland"}',
      ),
    );
    expect(capturedOptions.filters).toEqual({ placeCountry: "Scotland" });
  });

  it("translates inbound facet aliases to ES field names", async () => {
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
    const app = createTestApp(engine, undefined, aliasMap);

    await app.handle(
      new Request("http://localhost/test/search?q=test&facets=country,region"),
    );
    expect(capturedOptions.facets).toEqual(["placeCountry", "placeRegion"]);
  });

  it("translates inbound sort aliases to ES field names", async () => {
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
    const app = createTestApp(engine, undefined, aliasMap);

    await app.handle(
      new Request('http://localhost/test/search?q=test&sort={"country":"asc"}'),
    );
    expect(capturedOptions.sort).toEqual({ placeCountry: "asc" });
  });

  it("translates outbound facet keys from ES to aliases", async () => {
    const engine = createMockEngine({
      search: async () => ({
        hits: [],
        totalHits: 0,
        page: 1,
        perPage: 20,
        totalPages: 0,
        facets: {
          placeCountry: [{ value: "Scotland", count: 10 }],
        },
        suggestions: [],
      }),
    });
    const app = createTestApp(engine, undefined, aliasMap);

    const res = await app.handle(
      new Request("http://localhost/test/search?q=test&facets=country"),
    );
    const body = await json(res);
    expect(body.facets.country).toBeDefined();
    expect(body.facets.placeCountry).toBeUndefined();
  });

  it("translates outbound highlight keys from ES to aliases", async () => {
    const engine = createMockEngine({
      search: async () => ({
        hits: [
          {
            objectID: "1",
            _index: "test_index",
            _score: 1.0,
            _highlights: {
              placeCountry: ["<mark>Scotland</mark>"],
            },
          },
        ],
        totalHits: 1,
        page: 1,
        perPage: 20,
        totalPages: 1,
        facets: {},
        suggestions: [],
      }),
    });
    const app = createTestApp(engine, undefined, aliasMap);

    const res = await app.handle(
      new Request("http://localhost/test/search?q=test"),
    );
    const body = await json(res);
    expect(body.hits[0]._highlights.country).toEqual(["<mark>Scotland</mark>"]);
    expect(body.hits[0]._highlights.placeCountry).toBeUndefined();
  });
});

describe("Auth middleware", () => {
  function createAuthApp(apiKey: string) {
    const engine = createMockEngine();
    const app = new Elysia()
      .onBeforeHandle(({ headers, path }) => {
        if (
          path === "/health" ||
          path === "/openapi" ||
          path === "/openapi/json"
        )
          return;
        const auth = headers.authorization ?? "";
        const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (provided !== apiKey) {
          return httpStatus(401, { error: "Unauthorized" });
        }
      })
      .get("/health", () => ({ status: "ok" }))
      .use(
        searchApiRoutes(
          new Map([["test", engine]]),
          new Map([["test", mockConfig]]),
        ),
      );
    return app;
  }

  it("returns 401 without a bearer token", async () => {
    const app = createAuthApp("secret-key");
    const res = await app.handle(
      new Request("http://localhost/test/search?q=test"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong bearer token", async () => {
    const app = createAuthApp("secret-key");
    const res = await app.handle(
      new Request("http://localhost/test/search?q=test", {
        headers: { Authorization: "Bearer wrong-key" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("allows request with correct bearer token", async () => {
    const app = createAuthApp("secret-key");
    const res = await app.handle(
      new Request("http://localhost/test/search?q=test", {
        headers: { Authorization: "Bearer secret-key" },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("skips auth for /health endpoint", async () => {
    const app = createAuthApp("secret-key");
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
  });

  it("rejects token embedded mid-string (not prefixed with Bearer)", async () => {
    const app = createAuthApp("secret-key");
    const res = await app.handle(
      new Request("http://localhost/test/search?q=test", {
        headers: { Authorization: "Token Bearer secret-key" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
