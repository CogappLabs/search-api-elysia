import { Elysia, status, t } from "elysia";
import { buildSearchCacheKey, CACHE_VERSION, type Cache } from "../cache.ts";
import type { SearchEngine } from "../engines/engine.ts";
import { FieldAliasMap } from "../field-aliases.ts";
import type { IndexConfig, SearchOptions, SearchResult } from "../types.ts";
import {
  BoostsSchema,
  FacetFiltersSchema,
  FiltersSchema,
  GeoGridSchema,
  HistogramSchema,
  parseJsonParam,
  SortSchema,
} from "../validation.ts";

const MAX_PER_PAGE = 100;

const ErrorResponse = t.Object({ error: t.String() });

const SearchHitSchema = t.Object(
  {
    objectID: t.String({ description: "Unique document identifier" }),
    _index: t.String({
      description: "Source index name (useful for multi-index searches)",
    }),
    _score: t.Union([t.Number(), t.Null()], {
      description: "Relevance score (null for non-scored queries)",
    }),
    _highlights: t.Record(t.String(), t.Array(t.String()), {
      description:
        "Highlighted fragments keyed by field name, with <mark> tags around matches",
    }),
  },
  {
    additionalProperties: true,
    description:
      "A search hit containing the document fields plus metadata (_index, _score, _highlights)",
  },
);

const FacetValueSchema = t.Object(
  {
    value: t.String({ description: "The facet value" }),
    count: t.Number({
      description: "Number of documents matching this value",
    }),
  },
  { description: "A single facet value with its document count" },
);

const HistogramBucketSchema = t.Object(
  {
    key: t.Number({ description: "Bucket lower bound" }),
    count: t.Number({ description: "Number of documents in this bucket" }),
  },
  { description: "A single histogram bucket" },
);

const GeoClusterSchema = t.Object(
  {
    lat: t.Number({ description: "Cluster centroid latitude" }),
    lng: t.Number({ description: "Cluster centroid longitude" }),
    count: t.Number({ description: "Number of documents in this cluster" }),
    key: t.String({ description: "Geotile grid key (zoom/x/y)" }),
    hit: t.Optional(
      t.Union([SearchHitSchema, t.Null()], {
        description: "Sample document from this cluster",
      }),
    ),
  },
  { description: "A geo cluster representing grouped documents on a tile" },
);

const SearchResultSchema = t.Object(
  {
    hits: t.Array(SearchHitSchema),
    totalHits: t.Number({
      description: "Total number of matching documents",
    }),
    page: t.Number({ description: "Current page number (1-based)" }),
    perPage: t.Number({ description: "Results per page" }),
    totalPages: t.Number({ description: "Total number of pages" }),
    facets: t.Record(t.String(), t.Array(FacetValueSchema), {
      description:
        "Facet aggregations keyed by field name, each containing value/count pairs",
    }),
    histograms: t.Optional(
      t.Record(t.String(), t.Array(HistogramBucketSchema), {
        description:
          "Histogram aggregations keyed by field name, each containing key/count bucket pairs",
      }),
    ),
    geoClusters: t.Optional(
      t.Array(GeoClusterSchema, {
        description:
          "Geo tile grid clusters with centroid coordinates and sample hits",
      }),
    ),
    suggestions: t.Array(t.String(), {
      description: "Spelling/phrase suggestions (requires suggestField config)",
    }),
  },
  {
    description:
      "Paginated search results with facets, histograms, geo clusters, and suggestions",
  },
);

const noAliases = new FieldAliasMap();

export function searchApiRoutes(
  engines: Map<string, SearchEngine>,
  configs: Map<string, IndexConfig>,
  aliasMaps?: Map<string, FieldAliasMap>,
  boostsMaps?: Map<string, Record<string, number>>,
  searchableFieldsMaps?: Map<string, string[]>,
  cache?: Cache | null,
) {
  return new Elysia({ name: "routes.search-api" })
    .resolve(({ params }) => {
      const handle = (params as Record<string, string>).handle ?? "";
      return {
        engine: engines.get(handle),
        indexConfig: configs.get(handle),
        aliasMap: aliasMaps?.get(handle) ?? noAliases,
        configBoosts: boostsMaps?.get(handle) ?? {},
        configSearchableFields: searchableFieldsMaps?.get(handle) ?? [],
      };
    })
    .get(
      "/:handle/search",
      async ({
        engine,
        indexConfig,
        aliasMap,
        configBoosts,
        configSearchableFields,
        params,
        query,
        set,
      }) => {
        if (!engine || !indexConfig) {
          return status(404, {
            error: `Index "${params.handle}" not found`,
          });
        }

        const defaults = indexConfig.defaults ?? {};
        const page = Math.max(1, Math.floor(query.page ?? 1));
        const perPage = Math.min(
          MAX_PER_PAGE,
          Math.max(1, Math.floor(query.perPage ?? defaults.perPage ?? 20)),
        );

        const options: SearchOptions = { page, perPage };

        if (query.sort) {
          const result = parseJsonParam(query.sort, SortSchema, "sort");
          if ("error" in result) return status(400, { error: result.error });
          options.sort = result.data;
        }

        if (query.facets) {
          options.facets = query.facets.split(",");
        } else if (defaults.facets) {
          options.facets = defaults.facets;
        }

        if (query.filters) {
          const result = parseJsonParam(
            query.filters,
            FiltersSchema,
            "filters",
          );
          if ("error" in result) return status(400, { error: result.error });
          options.filters = result.data;
        }

        if (query.highlight !== undefined) {
          options.highlight = query.highlight === "true";
        } else if (defaults.highlight !== undefined) {
          options.highlight = defaults.highlight;
        }

        if (query.fields) {
          options.attributesToRetrieve = query.fields.split(",");
        }

        if (query.suggest !== undefined) {
          options.suggest = query.suggest === "true";
        }

        if (query.boosts) {
          const result = parseJsonParam(query.boosts, BoostsSchema, "boosts");
          if ("error" in result) return status(400, { error: result.error });
          options.boosts = result.data;
        } else if (configBoosts && Object.keys(configBoosts).length > 0) {
          options.boosts = configBoosts;
        }

        if (
          !options.boosts &&
          configSearchableFields &&
          configSearchableFields.length > 0
        ) {
          options.searchableFields = configSearchableFields;
        }

        if (query.histogram) {
          const result = parseJsonParam(
            query.histogram,
            HistogramSchema,
            "histogram",
          );
          if ("error" in result) return status(400, { error: result.error });
          options.histogram = result.data;
        }

        if (query.geoGrid) {
          const result = parseJsonParam(
            query.geoGrid,
            GeoGridSchema,
            "geoGrid",
          );
          if ("error" in result) return status(400, { error: result.error });
          options.geoGrid = result.data;
        }

        // Inbound alias translation
        if (aliasMap.hasAliases) {
          if (options.sort) options.sort = aliasMap.keysToEs(options.sort);
          if (options.facets)
            options.facets = aliasMap.arrayToEs(options.facets);
          if (options.filters)
            options.filters = aliasMap.keysToEs(options.filters);
          if (options.boosts)
            options.boosts = aliasMap.keysToEs(options.boosts);
          if (Array.isArray(options.highlight))
            options.highlight = aliasMap.arrayToEs(options.highlight);
          if (options.attributesToRetrieve)
            options.attributesToRetrieve = aliasMap.arrayToEs(
              options.attributesToRetrieve,
            );
          if (options.histogram)
            options.histogram = aliasMap.keysToEs(options.histogram);
          if (options.geoGrid)
            options.geoGrid = {
              ...options.geoGrid,
              field: aliasMap.toEs(options.geoGrid.field),
            };
        }

        // Check cache
        const cacheKey = cache
          ? buildSearchCacheKey(
              params.handle,
              query.q ?? "",
              options as unknown as Record<string, unknown>,
            )
          : null;
        if (cache && cacheKey) {
          const cached = await cache.get<SearchResult>(cacheKey);
          if (cached) return cached;
        }

        const searchResult = await engine.search(query.q ?? "", options);

        // Outbound alias translation
        if (aliasMap.hasAliases) {
          searchResult.facets = aliasMap.keysFromEs(searchResult.facets);
          if (searchResult.histograms)
            searchResult.histograms = aliasMap.keysFromEs(
              searchResult.histograms,
            );
          for (const hit of searchResult.hits) {
            hit._highlights = aliasMap.keysFromEs(hit._highlights);
          }
          if (searchResult.geoClusters) {
            for (const cluster of searchResult.geoClusters) {
              if (cluster.hit) {
                cluster.hit._highlights = aliasMap.keysFromEs(
                  cluster.hit._highlights,
                );
              }
            }
          }
        }

        // Store in cache (fire-and-forget)
        if (cache && cacheKey) {
          cache.set(cacheKey, searchResult, 60);
        }

        set.headers["Cache-Control"] =
          "public, max-age=10, stale-while-revalidate=50";
        return searchResult;
      },
      {
        params: t.Object({
          handle: t.String({
            description: "Index handle as configured in config.yaml",
            examples: ["craft_search_plugin_labs"],
          }),
        }),
        query: t.Object({
          q: t.Optional(
            t.String({
              description:
                "Search query text. Empty string returns all documents.",
              examples: ["castle", "standing stones"],
            }),
          ),
          page: t.Optional(
            t.Numeric({
              description: "Page number (1-based, default: 1)",
              examples: [1, 2],
            }),
          ),
          perPage: t.Optional(
            t.Numeric({
              description:
                "Results per page (1-100, default: 20 or index default)",
              examples: [10, 20],
            }),
          ),
          sort: t.Optional(
            t.String({
              description: 'JSON object mapping field names to "asc" or "desc"',
              examples: ['{"postDate":"desc"}', '{"title":"asc"}'],
            }),
          ),
          facets: t.Optional(
            t.String({
              description:
                "Comma-separated list of fields to aggregate as facets",
              examples: ["placeCountry,placeRegion"],
            }),
          ),
          filters: t.Optional(
            t.String({
              description:
                "JSON object of field filters. Values can be a string, array of strings, boolean, or range {min,max}.",
              examples: [
                '{"placeCountry":"Scotland"}',
                '{"placeCountry":["Scotland","Wales"]}',
                '{"placePopulation":{"min":10000,"max":500000}}',
                '{"hasImage":true}',
              ],
            }),
          ),
          highlight: t.Optional(
            t.String({
              description:
                'Set to "true" to return highlighted fragments with <mark> tags',
              examples: ["true", "false"],
            }),
          ),
          fields: t.Optional(
            t.String({
              description:
                "Comma-separated list of fields to return (default: all)",
              examples: ["title,uri,placeCountry"],
            }),
          ),
          suggest: t.Optional(
            t.String({
              description:
                'Set to "true" to enable phrase suggestions (requires suggestField in config)',
              examples: ["true"],
            }),
          ),
          boosts: t.Optional(
            t.String({
              description:
                "JSON object mapping field names to numeric boost weights for relevance scoring",
              examples: ['{"title":10,"description":2}'],
            }),
          ),
          histogram: t.Optional(
            t.String({
              description:
                "JSON object mapping field names to histogram interval sizes (minimum 1)",
              examples: ['{"population":1000,"elevation":100}'],
            }),
          ),
          geoGrid: t.Optional(
            t.String({
              description:
                "JSON object with field, precision (1-29), and bounds for geo tile grid clustering",
              examples: [
                '{"field":"coordinates","precision":6,"bounds":{"top_left":{"lat":60,"lon":-5},"bottom_right":{"lat":48,"lon":3}}}',
              ],
            }),
          ),
        }),
        response: {
          200: SearchResultSchema,
          400: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Search an index",
          description: [
            "Full-text search with pagination, facets, filters, sort, highlight, histogram, and geo clustering support.",
            "",
            "All field-name parameters (sort, facets, filters, boosts, fields, histogram, geoGrid.field) support field aliases when configured.",
            "",
            "**Examples:**",
            "- `GET /:handle/search?q=castle` — basic text search",
            "- `GET /:handle/search?q=castle&highlight=true` — with highlighted fragments",
            "- `GET /:handle/search?q=&facets=placeCountry,placeRegion` — all documents with facet counts",
            '- `GET /:handle/search?q=&filters={"placeCountry":"Scotland"}` — filtered by country',
            '- `GET /:handle/search?q=&filters={"hasImage":true}` — boolean toggle filter',
            '- `GET /:handle/search?q=&sort={"postDate":"desc"}&perPage=5` — sorted, paginated',
            '- `GET /:handle/search?q=&filters={"placeCountry":["Scotland","Wales"]}&facets=placeRegion` — multi-value filter with facets',
            '- `GET /:handle/search?q=&histogram={"population":1000}` — numeric histogram buckets',
            '- `GET /:handle/search?q=&geoGrid={"field":"coordinates","precision":6,"bounds":{"top_left":{"lat":60,"lon":-5},"bottom_right":{"lat":48,"lon":3}}}` — geo tile clustering',
          ].join("\n"),
          tags: ["Search"],
        },
      },
    )
    .get(
      "/:handle/autocomplete",
      async ({ engine, indexConfig, aliasMap, params, query }) => {
        if (!engine || !indexConfig) {
          return status(404, {
            error: `Index "${params.handle}" not found`,
          });
        }

        const q = query.q ?? "";
        const perPage = Math.min(
          20,
          Math.max(1, Math.floor(query.perPage ?? 5)),
        );
        const maxFacets = Math.min(
          20,
          Math.max(1, Math.floor(query.maxFacetsPerField ?? 4)),
        );

        const hitsPromise = engine.search(q, {
          page: 1,
          perPage,
          highlight: false,
        });

        let facetFields: string[] = [];
        if (query.facets) {
          facetFields = query.facets.split(",");
        }

        const facetPromises = facetFields.map((field) => {
          const esField = aliasMap.toEs(field);
          return engine
            .searchFacetValues(esField, q, { maxValues: maxFacets })
            .then((values) => ({ field, values }));
        });

        const [result, ...facetResults] = await Promise.all([
          hitsPromise,
          ...facetPromises,
        ]);

        const facets: Record<string, { value: string; count: number }[]> = {};
        for (const fr of facetResults) {
          if (fr.values.length > 0) {
            facets[fr.field] = fr.values;
          }
        }

        return {
          hits: result.hits,
          totalHits: result.totalHits,
          ...(Object.keys(facets).length > 0 && { facets }),
        };
      },
      {
        params: t.Object({
          handle: t.String({
            description: "Index handle",
            examples: ["craft_search_plugin_labs"],
          }),
        }),
        query: t.Object({
          q: t.Optional(
            t.String({
              description: "Autocomplete query prefix",
              examples: ["ston", "cas"],
            }),
          ),
          perPage: t.Optional(
            t.Numeric({
              description:
                "Maximum number of suggestions to return (1-20, default: 5)",
              examples: [5, 10],
            }),
          ),
          facets: t.Optional(
            t.String({
              description:
                "Comma-separated list of facet fields to search values by name",
              examples: ["placeCountry,placeRegion"],
            }),
          ),
          maxFacetsPerField: t.Optional(
            t.Numeric({
              description: "Maximum facet values per field (1-20, default: 4)",
              examples: [4, 8],
            }),
          ),
        }),
        response: {
          200: t.Object(
            {
              hits: t.Array(SearchHitSchema),
              totalHits: t.Number({
                description: "Total number of matching documents",
              }),
              facets: t.Optional(
                t.Record(t.String(), t.Array(FacetValueSchema), {
                  description:
                    "Facet values matching the query by name, keyed by field",
                }),
              ),
            },
            {
              description:
                "Autocomplete response with document hits and facet value matches",
            },
          ),
          404: ErrorResponse,
        },
        detail: {
          summary: "Autocomplete search",
          description: [
            "Combined autocomplete: searches document titles AND facet value names in a single request.",
            "When `facets` is provided, each field's values are searched by name (substring match), not aggregated from matching documents.",
            "",
            "**Examples:**",
            "- `GET /:handle/autocomplete?q=ston` — document hits only",
            "- `GET /:handle/autocomplete?q=england&facets=placeCountry,placeRegion` — hits + facet values whose names match 'england'",
            "- `GET /:handle/autocomplete?q=sc&facets=placeCountry&maxFacetsPerField=8` — more facet suggestions",
          ].join("\n"),
          tags: ["Search"],
        },
      },
    )
    .get(
      "/:handle/documents/:id",
      async ({ engine, params }) => {
        if (!engine) {
          return status(404, {
            error: `Index "${params.handle}" not found`,
          });
        }

        const doc = await engine.getDocument(params.id);
        if (!doc) {
          return status(404, { error: "Document not found" });
        }

        return doc;
      },
      {
        params: t.Object({
          handle: t.String({
            description: "Index handle",
            examples: ["craft_search_plugin_labs"],
          }),
          id: t.String({
            description: "Document ID (objectID)",
            examples: ["498", "515"],
          }),
        }),
        response: {
          200: t.Record(t.String(), t.Unknown(), {
            description: "The full document with all indexed fields",
          }),
          404: ErrorResponse,
        },
        detail: {
          summary: "Get a document",
          description: [
            "Retrieve a single document by its ID. Returns all indexed fields.",
            "",
            "**Examples:**",
            "- `GET /craft_search_plugin_labs/documents/498` — fetch Stirling Castle",
            "- `GET /craft_search_plugin_labs/documents/515` — fetch Dunluce Castle",
          ].join("\n"),
          tags: ["Documents"],
        },
      },
    )
    .get(
      "/:handle/mapping",
      async ({ engine, params, set }) => {
        if (!engine) {
          return status(404, {
            error: `Index "${params.handle}" not found`,
          });
        }

        const mappingCacheKey = `${CACHE_VERSION}:mapping:${params.handle}`;
        if (cache) {
          const cached =
            await cache.get<Record<string, unknown>>(mappingCacheKey);
          if (cached) {
            set.headers["Cache-Control"] =
              "public, max-age=300, stale-while-revalidate=3300";
            return cached;
          }
        }

        const mapping = await engine.getMapping();

        if (cache) {
          cache.set(mappingCacheKey, mapping, 3600);
        }

        set.headers["Cache-Control"] =
          "public, max-age=300, stale-while-revalidate=3300";
        return mapping;
      },
      {
        params: t.Object({
          handle: t.String({
            description: "Index handle",
            examples: ["craft_search_plugin_labs"],
          }),
        }),
        response: {
          200: t.Record(t.String(), t.Unknown(), {
            description:
              "Elasticsearch index mapping showing field names, types, and analyzers",
          }),
          404: ErrorResponse,
        },
        detail: {
          summary: "Get index mapping",
          description:
            "Returns the Elasticsearch mapping for the configured index. Useful for discovering available fields, types, and analyzers.",
          tags: ["Schema"],
        },
      },
    )
    .post(
      "/:handle/query",
      async ({ engine, params, body }) => {
        if (!engine) {
          return status(404, {
            error: `Index "${params.handle}" not found`,
          });
        }

        return await engine.rawQuery(body);
      },
      {
        params: t.Object({
          handle: t.String({
            description: "Index handle",
            examples: ["craft_search_plugin_labs"],
          }),
        }),
        body: t.Record(t.String(), t.Unknown(), {
          description: "Raw Elasticsearch query DSL body",
        }),
        response: {
          200: t.Record(t.String(), t.Unknown(), {
            description: "Raw Elasticsearch search response",
          }),
          404: ErrorResponse,
        },
        detail: {
          summary: "Raw query",
          description:
            "Forwards a raw Elasticsearch query DSL body to the configured index. Returns the raw ES response.",
          tags: ["Advanced"],
        },
      },
    )
    .get(
      "/:handle/facets/:field",
      async ({ engine, aliasMap, params, query }) => {
        if (!engine) {
          return status(404, {
            error: `Index "${params.handle}" not found`,
          });
        }

        const maxValues = Math.min(
          100,
          Math.max(1, Math.floor(query.maxValues ?? 20)),
        );

        let filters: Record<string, string | string[]> | undefined;
        if (query.filters) {
          const result = parseJsonParam(
            query.filters,
            FacetFiltersSchema,
            "filters",
          );
          if ("error" in result) return status(400, { error: result.error });
          filters = aliasMap.hasAliases
            ? aliasMap.keysToEs(result.data)
            : result.data;
        }

        const esField = aliasMap.toEs(params.field);
        const values = await engine.searchFacetValues(esField, query.q ?? "", {
          maxValues,
          ...(filters ? { filters } : {}),
        });

        return { field: params.field, values };
      },
      {
        params: t.Object({
          handle: t.String({
            description: "Index handle",
            examples: ["craft_search_plugin_labs"],
          }),
          field: t.String({
            description: "Facet field name to search within",
            examples: ["placeCountry", "placeRegion"],
          }),
        }),
        query: t.Object({
          q: t.Optional(
            t.String({
              description:
                "Text to filter facet values (case-insensitive substring match)",
              examples: ["sc", "london"],
            }),
          ),
          maxValues: t.Optional(
            t.Numeric({
              description:
                "Maximum number of facet values to return (1-100, default: 20)",
              examples: [10, 50],
            }),
          ),
          filters: t.Optional(
            t.String({
              description:
                "JSON object of filters to narrow the facet context. Values can be a string or array of strings.",
              examples: ['{"placeCountry":"Scotland"}'],
            }),
          ),
        }),
        response: {
          200: t.Object(
            {
              field: t.String({ description: "The facet field name" }),
              values: t.Array(FacetValueSchema),
            },
            {
              description:
                "Matching facet values with document counts, filtered by the optional query",
            },
          ),
          400: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Search facet values",
          description: [
            "Search within a facet field's values. Useful for building typeahead facet filters.",
            "",
            "The `:field` param and filter keys support field aliases when configured.",
            "",
            "**Examples:**",
            "- `GET /:handle/facets/placeCountry` — list all country values with counts",
            "- `GET /:handle/facets/placeCountry?q=sc` — countries matching 'sc' (Scotland)",
            "- `GET /:handle/facets/placeRegion?maxValues=5` — top 5 regions",
            '- `GET /:handle/facets/placeRegion?filters={"placeCountry":"Scotland"}` — regions within Scotland only',
          ].join("\n"),
          tags: ["Facets"],
        },
      },
    );
}
