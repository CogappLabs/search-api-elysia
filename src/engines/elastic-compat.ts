import { geotileToLatLng } from "../geo.ts";
import type {
  FacetSearchOptions,
  FacetValue,
  GeoCluster,
  IndexConfig,
  RangeFilter,
  SearchHit,
  SearchOptions,
  SearchResult,
} from "../types.ts";
import type { SearchEngine } from "./engine.ts";

/**
 * Minimal duck type for Elasticsearch/OpenSearch clients.
 * Avoids importing both client libraries — subclasses provide the concrete client.
 */
export interface ElasticCompatClient {
  search(params: Record<string, unknown>): Promise<unknown>;
  get(params: { index: string; id: string }): Promise<unknown>;
  indices: {
    getMapping(params: { index: string }): Promise<unknown>;
  };
}

/**
 * Shared base class for Elasticsearch and OpenSearch engines.
 * Both use an identical query DSL — subclasses only differ in client
 * construction and response unwrapping.
 */
export abstract class ElasticCompatEngine implements SearchEngine {
  protected client: ElasticCompatClient;
  protected indexName: string;
  protected suggestField: string | undefined;
  private mappingCache: Record<string, unknown> | null = null;

  constructor(config: IndexConfig, client?: ElasticCompatClient) {
    this.client = client ?? this.createClient(config);
    this.indexName = Array.isArray(config.indexName)
      ? config.indexName.join(",")
      : config.indexName;
    this.suggestField = config.defaults?.suggestField;
  }

  /** Create the engine-specific client instance. */
  protected abstract createClient(config: IndexConfig): ElasticCompatClient;

  /** Unwrap the response body. ES v8 returns body directly; OpenSearch wraps in .body. */
  protected abstract extractBody<T>(response: unknown): T;

  /** Check if an error represents a 404 (different shapes per client). */
  protected abstract isNotFoundError(err: unknown): boolean;

  async search(query: string, options: SearchOptions): Promise<SearchResult> {
    const page = options.page ?? 1;
    const perPage = options.perPage ?? 20;
    const from = (page - 1) * perPage;

    const must: Record<string, unknown>[] = [];
    const filter: Record<string, unknown>[] = [];

    // Text query
    if (query.trim()) {
      const fields = options.boosts
        ? Object.entries(options.boosts).map(
            ([field, weight]) => `${field}^${weight}`,
          )
        : (options.searchableFields ?? ["*"]);
      must.push({
        multi_match: {
          query,
          type: "bool_prefix",
          fields,
        },
      });
    } else {
      must.push({ match_all: {} });
    }

    // Partition filters into facet-overlapping vs non-facet
    const facetSet = new Set(options.facets ?? []);
    const facetFilterMap = new Map<string, Record<string, unknown>[]>();
    const nonFacetFilters: Record<string, unknown>[] = [];

    if (options.filters) {
      for (const [field, value] of Object.entries(options.filters)) {
        const clause = buildFilterClause(field, value);
        if (facetSet.has(field)) {
          const existing = facetFilterMap.get(field) ?? [];
          existing.push(clause);
          facetFilterMap.set(field, existing);
        } else {
          nonFacetFilters.push(clause);
        }
      }
    }

    const hasFacetFilters = facetFilterMap.size > 0;

    // Main query filter: all filters when no facet overlap, only non-facet filters otherwise
    if (hasFacetFilters) {
      filter.push(...nonFacetFilters);
    } else if (options.filters) {
      for (const [field, value] of Object.entries(options.filters)) {
        filter.push(buildFilterClause(field, value));
      }
    }

    // post_filter: all facet filter clauses combined (applied after aggregations)
    const allFacetClauses: Record<string, unknown>[] = [];
    for (const clauses of facetFilterMap.values()) {
      allFacetClauses.push(...clauses);
    }
    const postFilter: Record<string, unknown> | undefined =
      allFacetClauses.length > 0
        ? { bool: { filter: allFacetClauses } }
        : undefined;

    // Geo bounding box filter
    if (options.geoGrid) {
      filter.push({
        geo_bounding_box: {
          [options.geoGrid.field]: {
            top_left: options.geoGrid.bounds.top_left,
            bottom_right: options.geoGrid.bounds.bottom_right,
          },
        },
      });
    }

    // Sort — resolve text fields to .keyword sub-fields
    const sort: Record<string, unknown>[] = [];
    if (options.sort) {
      const mapping = await this.ensureMapping();
      for (const [field, order] of Object.entries(options.sort)) {
        const resolved = resolveSortField(field, mapping);
        sort.push({ [resolved]: { order } });
      }
    }

    // Highlight
    let highlight: Record<string, unknown> | undefined;
    if (options.highlight) {
      const fields: Record<string, Record<string, never>> = {};
      if (Array.isArray(options.highlight)) {
        for (const f of options.highlight) {
          fields[f] = {};
        }
      } else {
        fields["*"] = {};
      }
      highlight = {
        fields,
        pre_tags: ["<mark>"],
        post_tags: ["</mark>"],
      };
    }

    // Aggregations (facets) — wrap with exclusion filters when facet filters overlap
    const aggs: Record<string, Record<string, unknown>> = {};
    if (options.facets) {
      for (const facet of options.facets) {
        const termsAgg = { terms: { field: facet, size: 100 } };

        if (hasFacetFilters) {
          // Collect all facet filter clauses EXCEPT this facet's own
          const otherClauses: Record<string, unknown>[] = [];
          for (const [field, clauses] of facetFilterMap) {
            if (field !== facet) {
              otherClauses.push(...clauses);
            }
          }

          if (otherClauses.length > 0) {
            aggs[facet] = {
              filter: { bool: { filter: otherClauses } },
              aggs: { [facet]: termsAgg },
            };
          } else {
            // No other facet filters — use plain terms agg
            aggs[facet] = termsAgg;
          }
        } else {
          aggs[facet] = termsAgg;
        }
      }
    }

    // Histogram aggregations
    if (options.histogram) {
      for (const [field, interval] of Object.entries(options.histogram)) {
        aggs[`__histogram_${field}`] = {
          histogram: { field, interval, min_doc_count: 1 },
        };
      }
    }

    // Geo grid aggregation
    if (options.geoGrid) {
      aggs.__geo_grid = {
        geotile_grid: {
          field: options.geoGrid.field,
          precision: options.geoGrid.precision,
          bounds: options.geoGrid.bounds,
        },
        aggs: {
          sample: {
            top_hits: { size: 1 },
          },
        },
      };
    }

    // Suggest (requires a configured suggestField — _all was removed in ES 7)
    const suggest:
      | {
          text: string;
          phrase_suggestion: {
            phrase: {
              field: string;
              size: number;
              gram_size: number;
              direct_generator: { field: string; suggest_mode: string }[];
            };
          };
        }
      | undefined =
      options.suggest && query.trim() && this.suggestField
        ? {
            text: query,
            phrase_suggestion: {
              phrase: {
                field: this.suggestField,
                size: 3,
                gram_size: 3,
                direct_generator: [
                  { field: this.suggestField, suggest_mode: "popular" },
                ],
              },
            },
          }
        : undefined;

    const body: Record<string, unknown> = {
      index: this.indexName,
      from,
      size: perPage,
      query: {
        bool: {
          must,
          ...(filter.length > 0 ? { filter } : {}),
        },
      },
      ...(postFilter ? { post_filter: postFilter } : {}),
      ...(sort.length > 0 ? { sort } : {}),
      ...(highlight ? { highlight } : {}),
      ...(Object.keys(aggs).length > 0 ? { aggs } : {}),
      ...(suggest ? { suggest } : {}),
      ...(options.attributesToRetrieve
        ? { _source: options.attributesToRetrieve }
        : {}),
    };

    const rawResponse = await this.client.search(body);
    const response = this.extractBody<{
      hits?: {
        total?: number | { value: number };
        hits?: Array<{
          _id?: string;
          _index?: string;
          _score?: number | null;
          _source?: Record<string, unknown>;
          highlight?: Record<string, string[]>;
        }>;
      };
      aggregations?: Record<string, unknown>;
      suggest?: Record<string, Array<{ options?: Array<{ text?: string }> }>>;
    }>(rawResponse);

    // Normalise hits
    const hits: SearchHit[] = [];
    if (response.hits?.hits) {
      for (const hit of response.hits.hits) {
        const source = hit._source ?? {};
        const highlights: Record<string, string[]> = {};
        if (hit.highlight) {
          for (const [field, fragments] of Object.entries(hit.highlight)) {
            highlights[field] = fragments;
          }
        }
        hits.push({
          objectID: hit._id ?? "",
          _index: hit._index ?? "",
          _score: hit._score ?? null,
          _highlights: highlights,
          ...source,
        });
      }
    }

    // Total hits
    const totalHitsValue = response.hits?.total;
    const totalHits =
      typeof totalHitsValue === "number"
        ? totalHitsValue
        : (totalHitsValue?.value ?? 0);

    // Normalise facets — handle both plain {buckets} and wrapped {doc_count, [name]: {buckets}} shapes
    const facets: Record<string, FacetValue[]> = {};
    if (response.aggregations) {
      for (const [name, agg] of Object.entries(response.aggregations)) {
        if (name.startsWith("__histogram_") || name === "__geo_grid") continue;
        const buckets = extractBuckets(name, agg);
        if (buckets) {
          facets[name] = buckets.map((b) => ({
            value: String(b.key),
            count: b.doc_count,
          }));
        }
      }
    }

    // Normalise histogram aggregations
    let histograms:
      | Record<string, { key: number; count: number }[]>
      | undefined;
    if (response.aggregations && options.histogram) {
      histograms = {};
      for (const field of Object.keys(options.histogram)) {
        const agg = response.aggregations[`__histogram_${field}`] as
          | { buckets?: Array<{ key: number; doc_count: number }> }
          | undefined;
        if (agg?.buckets) {
          histograms[field] = agg.buckets.map((b) => ({
            key: b.key,
            count: b.doc_count,
          }));
        }
      }
    }

    // Normalise geo clusters
    let geoClusters: GeoCluster[] | undefined;
    if (response.aggregations && options.geoGrid) {
      const geoAgg = response.aggregations.__geo_grid as
        | {
            buckets?: Array<{
              key: string;
              doc_count: number;
              sample?: { hits?: { hits?: Array<Record<string, unknown>> } };
            }>;
          }
        | undefined;
      if (geoAgg?.buckets) {
        geoClusters = geoAgg.buckets.map((b) => {
          const coords = geotileToLatLng(b.key);
          const sampleHit = b.sample?.hits?.hits?.[0];
          let hit: SearchHit | null = null;
          if (sampleHit) {
            const source =
              (sampleHit._source as Record<string, unknown> | undefined) ?? {};
            const highlights: Record<string, string[]> = {};
            if (sampleHit.highlight) {
              for (const [field, fragments] of Object.entries(
                sampleHit.highlight as Record<string, string[]>,
              )) {
                highlights[field] = fragments;
              }
            }
            hit = {
              objectID: (sampleHit._id as string) ?? "",
              _index: (sampleHit._index as string) ?? "",
              _score: (sampleHit._score as number) ?? null,
              _highlights: highlights,
              ...source,
            };
          }
          return {
            lat: coords.lat,
            lng: coords.lng,
            count: b.doc_count,
            key: b.key,
            hit,
          };
        });
      }
    }

    // Normalise suggestions
    const suggestions: string[] = [];
    if (response.suggest) {
      for (const entries of Object.values(response.suggest)) {
        if (Array.isArray(entries)) {
          for (const entry of entries) {
            if (entry.options && Array.isArray(entry.options)) {
              for (const opt of entry.options) {
                if (typeof opt.text === "string") {
                  suggestions.push(opt.text);
                }
              }
            }
          }
        }
      }
    }

    return {
      hits,
      totalHits,
      page,
      perPage,
      totalPages: Math.ceil(totalHits / perPage),
      facets,
      ...(histograms ? { histograms } : {}),
      ...(geoClusters ? { geoClusters } : {}),
      suggestions,
    };
  }

  async getDocument(id: string): Promise<Record<string, unknown> | null> {
    if (this.indexName.includes(",")) {
      // Multi-index: client.get only accepts a single index, use search with ids query
      const rawResponse = await this.client.search({
        index: this.indexName,
        query: { ids: { values: [id] } },
        size: 1,
      });
      const response = this.extractBody<{
        hits?: {
          hits?: Array<{
            _id?: string;
            _index?: string;
            _source?: Record<string, unknown>;
          }>;
        };
      }>(rawResponse);
      const hit = response.hits?.hits?.[0];
      if (!hit) return null;
      return {
        objectID: hit._id,
        _index: hit._index,
        ...(hit._source ?? {}),
      };
    }

    try {
      const rawResponse = await this.client.get({
        index: this.indexName,
        id,
      });
      const response = this.extractBody<{
        _id?: string;
        _index?: string;
        _source?: Record<string, unknown>;
      }>(rawResponse);
      return {
        objectID: response._id,
        _index: response._index,
        ...(response._source ?? {}),
      };
    } catch (err: unknown) {
      if (this.isNotFoundError(err)) {
        return null;
      }
      throw err;
    }
  }

  async getMapping(): Promise<Record<string, unknown>> {
    return this.ensureMapping();
  }

  private async ensureMapping(): Promise<Record<string, unknown>> {
    if (!this.mappingCache) {
      const rawResponse = await this.client.indices.getMapping({
        index: this.indexName,
      });
      this.mappingCache =
        this.extractBody<Record<string, unknown>>(rawResponse);
    }
    return this.mappingCache;
  }

  async rawQuery(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const rawResponse = await this.client.search({
      index: this.indexName,
      ...body,
    });
    return this.extractBody<Record<string, unknown>>(rawResponse);
  }

  async searchFacetValues(
    field: string,
    query: string,
    options?: FacetSearchOptions,
  ): Promise<FacetValue[]> {
    const maxValues = options?.maxValues ?? 20;

    // Build filter clauses from options.filters
    const filter: Record<string, unknown>[] = [];
    if (options?.filters) {
      for (const [f, value] of Object.entries(options.filters)) {
        if (Array.isArray(value)) {
          filter.push({ terms: { [f]: value } });
        } else {
          filter.push({ term: { [f]: value } });
        }
      }
    }

    const body: Record<string, unknown> = {
      index: this.indexName,
      size: 0,
      ...(filter.length > 0
        ? { query: { bool: { filter } } }
        : { query: { match_all: {} } }),
      aggs: {
        facet_values: {
          terms: {
            field: field,
            size: maxValues,
            ...(query.trim()
              ? { include: `.*${caseInsensitiveRegex(query)}.*` }
              : {}),
          },
        },
      },
    };

    const rawResponse = await this.client.search(body);
    const response = this.extractBody<{
      aggregations?: {
        facet_values?: {
          buckets?: Array<{ key: string; doc_count: number }>;
        };
      };
    }>(rawResponse);

    const agg = response.aggregations?.facet_values;
    if (!agg?.buckets) return [];

    return agg.buckets.map((b) => ({
      value: String(b.key),
      count: b.doc_count,
    }));
  }
}

/**
 * Resolve a sort field name: if the field is type `text` with a `.keyword`
 * sub-field in the mapping, return `field.keyword`; otherwise return as-is.
 */
function resolveSortField(
  field: string,
  mapping: Record<string, unknown>,
): string {
  // Walk into the first index's mappings.properties
  for (const indexMapping of Object.values(mapping)) {
    const props = (indexMapping as Record<string, unknown>)?.mappings as
      | Record<string, unknown>
      | undefined;
    const properties = props?.properties as Record<string, unknown> | undefined;
    if (!properties) continue;

    const fieldMapping = properties[field] as
      | Record<string, unknown>
      | undefined;
    if (!fieldMapping) continue;

    if (fieldMapping.type === "text") {
      const subFields = fieldMapping.fields as
        | Record<string, unknown>
        | undefined;
      if (subFields?.keyword) {
        return `${field}.keyword`;
      }
    }
    return field;
  }
  return field;
}

function isRangeFilter(
  value: string | string[] | boolean | RangeFilter,
): value is RangeFilter {
  return (
    typeof value === "object" &&
    !Array.isArray(value) &&
    ("min" in value || "max" in value)
  );
}

function buildFilterClause(
  field: string,
  value: string | string[] | boolean | RangeFilter,
): Record<string, unknown> {
  if (isRangeFilter(value)) {
    const range: Record<string, number> = {};
    if (value.min !== undefined) range.gte = value.min;
    if (value.max !== undefined) range.lte = value.max;
    return { range: { [field]: range } };
  }
  if (Array.isArray(value)) {
    return { terms: { [field]: value } };
  }
  return { term: { [field]: value } };
}

type AggBucket = { key: string; doc_count: number };

/** Extract buckets from a plain or wrapped (filter) aggregation response. */
function extractBuckets(name: string, agg: unknown): AggBucket[] | undefined {
  const obj = agg as Record<string, unknown>;
  // Plain shape: { buckets: [...] }
  if (Array.isArray(obj.buckets)) {
    return obj.buckets as AggBucket[];
  }
  // Wrapped shape: { doc_count: N, [name]: { buckets: [...] } }
  const nested = obj[name] as Record<string, unknown> | undefined;
  if (nested && Array.isArray(nested.buckets)) {
    return nested.buckets as AggBucket[];
  }
  return undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Convert each letter to a character class [aA] for case-insensitive ES regex. */
function caseInsensitiveRegex(str: string): string {
  return escapeRegex(str).replace(/[a-zA-Z]/g, (c) => {
    const lower = c.toLowerCase();
    const upper = c.toUpperCase();
    return lower === upper ? c : `[${lower}${upper}]`;
  });
}
