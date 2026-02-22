import { describe, expect, it } from "bun:test";
import type { Client } from "@elastic/elasticsearch";
import { ElasticsearchEngine } from "../src/engines/elasticsearch.ts";
import type { IndexConfig } from "../src/types.ts";

// biome-ignore lint/suspicious/noExplicitAny: mock client captures raw ES request bodies
let lastSearchBody: any;

function createMockClient(aggregations?: Record<string, unknown>) {
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
