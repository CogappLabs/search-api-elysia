import { describe, expect, it } from "bun:test";
import type { Client } from "@elastic/elasticsearch";
import { ElasticsearchEngine } from "../src/engines/elasticsearch.ts";
import type { IndexConfig } from "../src/types.ts";

// biome-ignore lint/suspicious/noExplicitAny: mock client captures raw ES request bodies
let lastSearchBody: any;

function createMockClient(
  aggregations?: Record<string, unknown>,
  mappingProperties?: Record<string, unknown>,
) {
  lastSearchBody = undefined;
  return {
    search: async (body: unknown) => {
      lastSearchBody = body;
      return {
        hits: {
          total: { value: 0 },
          hits: [],
        },
        aggregations: aggregations ?? {},
      };
    },
    indices: {
      getMapping: async () => ({
        test_index: {
          mappings: {
            properties: mappingProperties ?? {
              title: { type: "text" },
            },
          },
        },
      }),
    },
  } as unknown as Client;
}

const baseConfig: IndexConfig = {
  engine: "elasticsearch",
  host: "http://localhost:9200",
  indexName: "test_index",
};

function createEngine(client: Client, configOverrides?: Partial<IndexConfig>) {
  return new ElasticsearchEngine({ ...baseConfig, ...configOverrides }, client);
}

// biome-ignore lint/suspicious/noExplicitAny: mock client captures raw ES request bodies
let lastGetMappingArgs: any;
// biome-ignore lint/suspicious/noExplicitAny: mock client captures raw ES request bodies
let lastRawQueryBody: any;

function createMockClientFull() {
  lastSearchBody = undefined;
  lastGetMappingArgs = undefined;
  lastRawQueryBody = undefined;
  return {
    search: async (body: unknown) => {
      lastRawQueryBody = body;
      return {
        hits: { total: { value: 0 }, hits: [] },
      };
    },
    indices: {
      getMapping: async (args: unknown) => {
        lastGetMappingArgs = args;
        return {
          test_index: {
            mappings: { properties: { title: { type: "text" } } },
          },
        };
      },
    },
  } as unknown as Client;
}

describe("ElasticsearchEngine getMapping", () => {
  it("calls client.indices.getMapping with correct index", async () => {
    const client = createMockClientFull();
    const engine = createEngine(client);
    const result = await engine.getMapping();
    expect(lastGetMappingArgs).toEqual({ index: "test_index" });
    expect(result).toHaveProperty("test_index");
  });
});

describe("ElasticsearchEngine rawQuery", () => {
  it("calls client.search with merged index and body", async () => {
    const client = createMockClientFull();
    const engine = createEngine(client);
    const queryBody = { query: { match_all: {} }, size: 5 };
    await engine.rawQuery(queryBody);
    expect(lastRawQueryBody).toEqual({
      index: "test_index",
      query: { match_all: {} },
      size: 5,
    });
  });
});

describe("ElasticsearchEngine boosts", () => {
  it("applies boosts to multi_match fields", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("castle", {
      boosts: { title: 10, description: 2 },
    });
    expect(lastSearchBody.query.bool.must[0].multi_match.fields).toEqual([
      "title^10",
      "description^2",
    ]);
  });

  it("uses wildcard fields when no boosts", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("castle", {});
    expect(lastSearchBody.query.bool.must[0].multi_match.fields).toEqual(["*"]);
  });

  it("does not apply boosts for empty query (match_all)", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { boosts: { title: 10 } });
    expect(lastSearchBody.query.bool.must[0]).toEqual({ match_all: {} });
  });

  it("uses searchableFields when no boosts are provided", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("castle", {
      searchableFields: ["title", "description"],
    });
    expect(lastSearchBody.query.bool.must[0].multi_match.fields).toEqual([
      "title",
      "description",
    ]);
  });

  it("boosts take priority over searchableFields", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("castle", {
      boosts: { title: 10 },
      searchableFields: ["title", "description"],
    });
    expect(lastSearchBody.query.bool.must[0].multi_match.fields).toEqual([
      "title^10",
    ]);
  });

  it("falls back to wildcard when neither boosts nor searchableFields", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("castle", {});
    expect(lastSearchBody.query.bool.must[0].multi_match.fields).toEqual(["*"]);
  });
});

describe("ElasticsearchEngine boolean filters", () => {
  it("produces a term clause for boolean filter", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      filters: { has_image: true },
    });
    expect(lastSearchBody.query.bool.filter).toEqual([
      { term: { has_image: true } },
    ]);
  });

  it("produces a term clause for false boolean filter", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      filters: { has_image: false },
    });
    expect(lastSearchBody.query.bool.filter).toEqual([
      { term: { has_image: false } },
    ]);
  });
});

describe("ElasticsearchEngine aggregation exclusion", () => {
  it("uses no post_filter when filters don't overlap facets", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      facets: ["category"],
      filters: { year: { min: 1800 } },
    });
    expect(lastSearchBody.post_filter).toBeUndefined();
    // year filter should be in main query
    expect(lastSearchBody.query.bool.filter).toEqual([
      { range: { year: { gte: 1800 } } },
    ]);
  });

  it("uses no post_filter when there are no filters", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { facets: ["category"] });
    expect(lastSearchBody.post_filter).toBeUndefined();
  });

  it("adds post_filter and wrapped aggs when filters overlap facets", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      facets: ["category", "period"],
      filters: { category: "painting" },
    });

    // post_filter should contain the facet filter
    expect(lastSearchBody.post_filter).toEqual({
      bool: { filter: [{ term: { category: "painting" } }] },
    });

    // category agg should NOT be wrapped (no other facet filters to apply)
    expect(lastSearchBody.aggs.category).toEqual({
      terms: { field: "category", size: 100 },
    });

    // period agg should be wrapped with the category filter
    expect(lastSearchBody.aggs.period).toEqual({
      filter: {
        bool: { filter: [{ term: { category: "painting" } }] },
      },
      aggs: {
        period: { terms: { field: "period", size: 100 } },
      },
    });

    // Main query should have no filter (no non-facet filters)
    expect(lastSearchBody.query.bool.filter).toBeUndefined();
  });

  it("wraps facet aggs with other facet filters when multiple facets are filtered", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      facets: ["category", "period"],
      filters: { category: "painting", period: "modern" },
    });

    // post_filter should have both facet filters
    expect(lastSearchBody.post_filter).toEqual({
      bool: {
        filter: [
          { term: { category: "painting" } },
          { term: { period: "modern" } },
        ],
      },
    });

    // category agg wrapped with period filter (exclude own)
    expect(lastSearchBody.aggs.category).toEqual({
      filter: { bool: { filter: [{ term: { period: "modern" } }] } },
      aggs: {
        category: { terms: { field: "category", size: 100 } },
      },
    });

    // period agg wrapped with category filter (exclude own)
    expect(lastSearchBody.aggs.period).toEqual({
      filter: {
        bool: { filter: [{ term: { category: "painting" } }] },
      },
      aggs: {
        period: { terms: { field: "period", size: 100 } },
      },
    });
  });

  it("partitions mixed facet/non-facet filters correctly", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      facets: ["category"],
      filters: {
        category: "painting",
        year: { min: 1800, max: 1900 },
      },
    });

    // Non-facet filter stays in main query
    expect(lastSearchBody.query.bool.filter).toEqual([
      { range: { year: { gte: 1800, lte: 1900 } } },
    ]);

    // Facet filter goes to post_filter
    expect(lastSearchBody.post_filter).toEqual({
      bool: { filter: [{ term: { category: "painting" } }] },
    });

    // category agg is plain (no other facet filters)
    expect(lastSearchBody.aggs.category).toEqual({
      terms: { field: "category", size: 100 },
    });
  });

  it("handles array filter values on faceted fields", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      facets: ["category", "period"],
      filters: {
        category: ["painting", "sculpture"],
        period: "modern",
      },
    });

    expect(lastSearchBody.post_filter).toEqual({
      bool: {
        filter: [
          { terms: { category: ["painting", "sculpture"] } },
          { term: { period: "modern" } },
        ],
      },
    });

    expect(lastSearchBody.aggs.category).toEqual({
      filter: { bool: { filter: [{ term: { period: "modern" } }] } },
      aggs: {
        category: { terms: { field: "category", size: 100 } },
      },
    });
  });
});

describe("ElasticsearchEngine histogram aggregations", () => {
  it("builds histogram aggregation in ES body", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {
      histogram: { population: 1000 },
    });
    expect(lastSearchBody.aggs.__histogram_population).toEqual({
      histogram: { field: "population", interval: 1000, min_doc_count: 1 },
    });
  });

  it("normalizes histogram response", async () => {
    const client = createMockClient({
      __histogram_population: {
        buckets: [
          { key: 0, doc_count: 5 },
          { key: 1000, doc_count: 12 },
          { key: 2000, doc_count: 3 },
        ],
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("", {
      histogram: { population: 1000 },
    });
    expect(result.histograms).toEqual({
      population: [
        { key: 0, count: 5 },
        { key: 1000, count: 12 },
        { key: 2000, count: 3 },
      ],
    });
  });

  it("does not include histogram aggs when not requested", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {});
    expect(lastSearchBody.aggs).toBeUndefined();
  });

  it("excludes histogram aggs from facets normalization", async () => {
    const client = createMockClient({
      category: {
        buckets: [{ key: "painting", doc_count: 42 }],
      },
      __histogram_population: {
        buckets: [{ key: 0, doc_count: 5 }],
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("", {
      facets: ["category"],
      histogram: { population: 1000 },
    });
    expect(result.facets.category).toBeDefined();
    expect(result.facets.__histogram_population).toBeUndefined();
  });
});

describe("ElasticsearchEngine geo grid", () => {
  const geoGridOptions = {
    field: "coordinates",
    precision: 6,
    bounds: {
      top_left: { lat: 60, lon: -5 },
      bottom_right: { lat: 48, lon: 3 },
    },
  };

  it("adds geo_bounding_box filter and geotile_grid agg when geoGrid is set", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", { geoGrid: geoGridOptions });

    // Should have geo_bounding_box in filter
    expect(lastSearchBody.query.bool.filter).toEqual([
      {
        geo_bounding_box: {
          coordinates: {
            top_left: { lat: 60, lon: -5 },
            bottom_right: { lat: 48, lon: 3 },
          },
        },
      },
    ]);

    // Should have geotile_grid aggregation
    expect(lastSearchBody.aggs.__geo_grid).toBeDefined();
    expect(lastSearchBody.aggs.__geo_grid.geotile_grid).toEqual({
      field: "coordinates",
      precision: 6,
      bounds: geoGridOptions.bounds,
    });
    expect(lastSearchBody.aggs.__geo_grid.aggs.sample).toEqual({
      top_hits: { size: 1 },
    });
  });

  it("omits geo filter and agg when geoGrid is not set", async () => {
    const engine = createEngine(createMockClient());
    await engine.search("", {});
    expect(lastSearchBody.query.bool.filter).toBeUndefined();
    expect(lastSearchBody.aggs).toBeUndefined();
  });

  it("normalizes geo cluster response with sample hits", async () => {
    const client = createMockClient({
      __geo_grid: {
        buckets: [
          {
            key: "6/31/21",
            doc_count: 5,
            sample: {
              hits: {
                hits: [
                  {
                    _id: "42",
                    _index: "places",
                    _score: 1.0,
                    _source: { title: "London" },
                  },
                ],
              },
            },
          },
        ],
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("", { geoGrid: geoGridOptions });

    expect(result.geoClusters).toBeDefined();
    expect(result.geoClusters).toHaveLength(1);
    const cluster = result.geoClusters?.[0];
    expect(cluster).toBeDefined();
    expect(cluster?.key).toBe("6/31/21");
    expect(cluster?.count).toBe(5);
    expect(cluster?.lat).toBeGreaterThan(50);
    expect(cluster?.lng).toBeGreaterThan(-6);
    expect(cluster?.hit).toBeDefined();
    expect(cluster?.hit?.objectID).toBe("42");
    expect((cluster?.hit as Record<string, unknown>)?.title).toBe("London");
  });
});

describe("ElasticsearchEngine sort field resolution", () => {
  it("appends .keyword when sorting on a text field with keyword sub-field", async () => {
    const client = createMockClient(undefined, {
      title: {
        type: "text",
        fields: { keyword: { type: "keyword", ignore_above: 256 } },
      },
    });
    const engine = createEngine(client);
    await engine.search("", { sort: { title: "asc" } });
    expect(lastSearchBody.sort).toEqual([
      { "title.keyword": { order: "asc" } },
    ]);
  });

  it("does not append .keyword for a keyword field", async () => {
    const client = createMockClient(undefined, {
      status: { type: "keyword" },
    });
    const engine = createEngine(client);
    await engine.search("", { sort: { status: "asc" } });
    expect(lastSearchBody.sort).toEqual([{ status: { order: "asc" } }]);
  });

  it("does not append .keyword for a numeric field", async () => {
    const client = createMockClient(undefined, {
      price: { type: "float" },
    });
    const engine = createEngine(client);
    await engine.search("", { sort: { price: "desc" } });
    expect(lastSearchBody.sort).toEqual([{ price: { order: "desc" } }]);
  });

  it("does not append .keyword for a text field without keyword sub-field", async () => {
    const client = createMockClient(undefined, {
      description: { type: "text" },
    });
    const engine = createEngine(client);
    await engine.search("", { sort: { description: "asc" } });
    expect(lastSearchBody.sort).toEqual([{ description: { order: "asc" } }]);
  });

  it("caches the mapping across multiple search calls", async () => {
    let getMappingCalls = 0;
    const client = {
      search: async (body: unknown) => {
        lastSearchBody = body;
        return { hits: { total: { value: 0 }, hits: [] }, aggregations: {} };
      },
      indices: {
        getMapping: async () => {
          getMappingCalls++;
          return {
            test_index: {
              mappings: {
                properties: {
                  title: {
                    type: "text",
                    fields: { keyword: { type: "keyword" } },
                  },
                },
              },
            },
          };
        },
      },
    } as unknown as Client;
    const engine = createEngine(client);
    await engine.search("", { sort: { title: "asc" } });
    await engine.search("", { sort: { title: "desc" } });
    expect(getMappingCalls).toBe(1);
  });
});

describe("ElasticsearchEngine disjunctive faceting pattern", () => {
  it("searchFacetValues applies filters to narrow facet context", async () => {
    const engine = createEngine(createMockClient());
    await engine.searchFacetValues("category", "", {
      filters: { period: "modern" },
    });
    expect(lastSearchBody.query.bool.filter).toEqual([
      { term: { period: "modern" } },
    ]);
    expect(lastSearchBody.aggs.facet_values).toEqual({
      terms: { field: "category", size: 20 },
    });
  });

  it("searchFacetValues with no filters returns unscoped counts", async () => {
    const engine = createEngine(createMockClient());
    await engine.searchFacetValues("category", "");
    expect(lastSearchBody.query).toEqual({ match_all: {} });
  });

  it("searchFacetValues wraps array filter values as terms query", async () => {
    const engine = createEngine(createMockClient());
    await engine.searchFacetValues("category", "", {
      filters: { period: ["modern", "classical"] },
    });
    expect(lastSearchBody.query.bool.filter).toEqual([
      { terms: { period: ["modern", "classical"] } },
    ]);
  });
});

describe("ElasticsearchEngine nested aggregations", () => {
  const nestedConfig: Partial<IndexConfig> = {
    fields: {
      facilityName: {
        field: "facilities.name.keyword",
        nestedPath: "facilities",
      },
    },
  };

  it("wraps aggregation in nested", async () => {
    const engine = createEngine(createMockClient(), nestedConfig);
    await engine.search("", {
      facets: ["facilities.name.keyword"],
    });
    expect(lastSearchBody.aggs["facilities.name.keyword"]).toEqual({
      nested: { path: "facilities" },
      aggs: {
        "facilities.name.keyword": {
          terms: { field: "facilities.name.keyword", size: 100 },
        },
      },
    });
  });

  it("wraps filter in nested query", async () => {
    const engine = createEngine(createMockClient(), nestedConfig);
    await engine.search("", {
      filters: { "facilities.name.keyword": "Main Cafe" },
    });
    expect(lastSearchBody.query.bool.filter).toEqual([
      {
        nested: {
          path: "facilities",
          query: {
            term: { "facilities.name.keyword": "Main Cafe" },
          },
        },
      },
    ]);
  });

  it("does not wrap non-nested fields", async () => {
    const engine = createEngine(createMockClient(), nestedConfig);
    await engine.search("", {
      facets: ["category"],
      filters: { period: "modern" },
    });
    // Non-nested filter is plain
    expect(lastSearchBody.query.bool.filter).toEqual([
      { term: { period: "modern" } },
    ]);
    // Non-nested facet is plain
    expect(lastSearchBody.aggs.category).toEqual({
      terms: { field: "category", size: 100 },
    });
  });

  it("filter + nested agg wrapping preserves correct nesting order", async () => {
    const engine = createEngine(createMockClient(), nestedConfig);
    await engine.search("", {
      facets: ["facilities.name.keyword", "category"],
      filters: { category: "painting" },
    });

    // Nested facet should be wrapped with the category filter, then nested inside
    expect(lastSearchBody.aggs["facilities.name.keyword"]).toEqual({
      filter: {
        bool: { filter: [{ term: { category: "painting" } }] },
      },
      aggs: {
        "facilities.name.keyword": {
          nested: { path: "facilities" },
          aggs: {
            "facilities.name.keyword": {
              terms: {
                field: "facilities.name.keyword",
                size: 100,
              },
            },
          },
        },
      },
    });
  });

  it("nested filter in post_filter", async () => {
    const engine = createEngine(createMockClient(), nestedConfig);
    await engine.search("", {
      facets: ["facilities.name.keyword"],
      filters: { "facilities.name.keyword": "Main Cafe" },
    });
    expect(lastSearchBody.post_filter).toEqual({
      bool: {
        filter: [
          {
            nested: {
              path: "facilities",
              query: {
                term: {
                  "facilities.name.keyword": "Main Cafe",
                },
              },
            },
          },
        ],
      },
    });
  });

  it("extractBuckets handles filter+nested 3-level nesting", async () => {
    const client = createMockClient({
      "facilities.name.keyword": {
        doc_count: 100,
        "facilities.name.keyword": {
          doc_count: 80,
          "facilities.name.keyword": {
            buckets: [
              { key: "Main Cafe", doc_count: 42 },
              { key: "Car Park", doc_count: 18 },
            ],
          },
        },
      },
    });
    const engine = createEngine(client, nestedConfig);
    const result = await engine.search("", {
      facets: ["facilities.name.keyword"],
      filters: {
        "facilities.name.keyword": "Main Cafe",
        category: "painting",
      },
    });
    expect(result.facets["facilities.name.keyword"]).toEqual([
      { value: "Main Cafe", count: 42 },
      { value: "Car Park", count: 18 },
    ]);
  });

  it("searchFacetValues wraps nested agg", async () => {
    const engine = createEngine(createMockClient(), nestedConfig);
    await engine.searchFacetValues("facilities.name.keyword", "");
    expect(lastSearchBody.aggs.facet_values).toEqual({
      nested: { path: "facilities" },
      aggs: {
        facet_values: {
          terms: {
            field: "facilities.name.keyword",
            size: 20,
          },
        },
      },
    });
  });

  it("searchFacetValues wraps nested filter", async () => {
    const engine = createEngine(createMockClient(), nestedConfig);
    await engine.searchFacetValues("category", "", {
      filters: { "facilities.name.keyword": "Main Cafe" },
    });
    expect(lastSearchBody.query.bool.filter).toEqual([
      {
        nested: {
          path: "facilities",
          query: {
            term: {
              "facilities.name.keyword": "Main Cafe",
            },
          },
        },
      },
    ]);
  });

  it("searchFacetValues extracts nested response from deeper path", async () => {
    const client = createMockClient({
      facet_values: {
        doc_count: 80,
        facet_values: {
          buckets: [
            { key: "Main Cafe", doc_count: 42 },
            { key: "Car Park", doc_count: 18 },
          ],
        },
      },
    });
    const engine = createEngine(client, nestedConfig);
    const result = await engine.searchFacetValues(
      "facilities.name.keyword",
      "",
    );
    expect(result).toEqual([
      { value: "Main Cafe", count: 42 },
      { value: "Car Park", count: 18 },
    ]);
  });
});

describe("ElasticsearchEngine facet response normalization", () => {
  it("normalizes plain aggregation response", async () => {
    const client = createMockClient({
      category: {
        buckets: [
          { key: "painting", doc_count: 42 },
          { key: "sculpture", doc_count: 18 },
        ],
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("", { facets: ["category"] });
    expect(result.facets.category).toEqual([
      { value: "painting", count: 42 },
      { value: "sculpture", count: 18 },
    ]);
  });

  it("normalizes wrapped aggregation response", async () => {
    const client = createMockClient({
      category: {
        doc_count: 100,
        category: {
          buckets: [
            { key: "painting", doc_count: 42 },
            { key: "sculpture", doc_count: 18 },
          ],
        },
      },
    });
    const engine = createEngine(client);
    const result = await engine.search("", {
      facets: ["category"],
      filters: { category: "painting", period: "modern" },
    });
    expect(result.facets.category).toEqual([
      { value: "painting", count: 42 },
      { value: "sculpture", count: 18 },
    ]);
  });

  it("returns empty facets when no aggregations in response", async () => {
    const client = createMockClient();
    const engine = createEngine(client);
    const result = await engine.search("", { facets: ["category"] });
    expect(result.facets).toEqual({});
  });
});
