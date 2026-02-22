import { type Index, MeiliSearch } from "meilisearch";
import type {
  FacetSearchOptions,
  FacetValue,
  IndexConfig,
  RangeFilter,
  SearchHit,
  SearchOptions,
  SearchResult,
} from "../types.ts";
import type { SearchEngine } from "./engine.ts";

export class MeilisearchEngine implements SearchEngine {
  private index: Index;

  constructor(config: IndexConfig, client?: MeiliSearch) {
    const meili =
      client ??
      new MeiliSearch({
        host: config.host,
        apiKey: config.apiKey,
      });
    if (Array.isArray(config.indexName) && config.indexName.length > 1) {
      throw new Error(
        "Meilisearch engine does not support multi-index search. Configure separate index handles instead.",
      );
    }
    const indexName = Array.isArray(config.indexName)
      ? (config.indexName[0] as string)
      : config.indexName;
    this.index = meili.index(indexName);
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult> {
    const page = options.page ?? 1;
    const perPage = options.perPage ?? 20;

    // Build filter strings
    const filterStrings: string[] = [];
    if (options.filters) {
      for (const [field, value] of Object.entries(options.filters)) {
        filterStrings.push(buildMeilisearchFilter(field, value));
      }
    }

    // Build sort
    const sort: string[] = [];
    if (options.sort) {
      for (const [field, order] of Object.entries(options.sort)) {
        sort.push(`${field}:${order}`);
      }
    }

    // Build highlight fields
    let attributesToHighlight: string[] | undefined;
    if (options.highlight) {
      attributesToHighlight = Array.isArray(options.highlight)
        ? options.highlight
        : ["*"];
    }

    const response = await this.index.search(query || "", {
      page,
      hitsPerPage: perPage,
      ...(filterStrings.length > 0 ? { filter: filterStrings } : {}),
      ...(sort.length > 0 ? { sort } : {}),
      ...(options.facets ? { facets: options.facets } : {}),
      ...(attributesToHighlight
        ? {
            attributesToHighlight,
            highlightPreTag: "<mark>",
            highlightPostTag: "</mark>",
          }
        : {}),
      ...(options.attributesToRetrieve
        ? { attributesToRetrieve: options.attributesToRetrieve }
        : {}),
    });

    // Normalise hits
    const hits: SearchHit[] = [];
    for (const hit of response.hits) {
      const { _formatted, _matchesPosition, _rankingScore, ...source } =
        hit as Record<string, unknown>;
      const highlights: Record<string, string[]> = {};
      if (_formatted && typeof _formatted === "object") {
        for (const [field, value] of Object.entries(
          _formatted as Record<string, unknown>,
        )) {
          if (typeof value === "string" && value.includes("<mark>")) {
            highlights[field] = [value];
          }
        }
      }
      hits.push({
        ...source,
        objectID: String((source.id as string | number | undefined) ?? ""),
        _index: this.index.uid,
        _score: typeof _rankingScore === "number" ? _rankingScore : null,
        _highlights: highlights,
      });
    }

    // Normalise facets from facetDistribution
    const facets: Record<string, FacetValue[]> = {};
    if (response.facetDistribution) {
      for (const [field, distribution] of Object.entries(
        response.facetDistribution,
      )) {
        facets[field] = Object.entries(distribution).map(([value, count]) => ({
          value,
          count,
        }));
      }
    }

    const totalHits = response.totalHits ?? 0;
    const totalPages = response.totalPages ?? Math.ceil(totalHits / perPage);

    return {
      hits,
      totalHits,
      page,
      perPage,
      totalPages,
      facets,
      suggestions: [],
    };
  }

  async getDocument(id: string): Promise<Record<string, unknown> | null> {
    try {
      const doc = await this.index.getDocument(id);
      const source = doc as Record<string, unknown>;
      return {
        ...source,
        objectID: String(source.id ?? id),
        _index: this.index.uid,
      };
    } catch (err: unknown) {
      const cause = (err as { cause?: { code?: string } }).cause;
      if (cause?.code === "document_not_found") {
        return null;
      }
      // Also check HTTP status on the response
      const response = (err as { response?: { status?: number } }).response;
      if (response?.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async searchFacetValues(
    field: string,
    query: string,
    options?: FacetSearchOptions,
  ): Promise<FacetValue[]> {
    const maxValues = options?.maxValues ?? 20;

    // Build filter strings from options.filters
    const filterStrings: string[] = [];
    if (options?.filters) {
      for (const [f, value] of Object.entries(options.filters)) {
        if (Array.isArray(value)) {
          const orClauses = value.map(
            (v) => `${f} = "${escapeFilterValue(v)}"`,
          );
          filterStrings.push(`(${orClauses.join(" OR ")})`);
        } else {
          filterStrings.push(`${f} = "${escapeFilterValue(value)}"`);
        }
      }
    }

    const response = await this.index.searchForFacetValues({
      facetName: field,
      facetQuery: query,
      ...(filterStrings.length > 0 ? { filter: filterStrings } : {}),
    });

    return response.facetHits.slice(0, maxValues).map((hit) => ({
      value: hit.value,
      count: hit.count,
    }));
  }

  async getMapping(): Promise<Record<string, unknown>> {
    const settings = await this.index.getSettings();
    return settings as unknown as Record<string, unknown>;
  }

  async rawQuery(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { q, ...rest } = body;
    const response = await this.index.search((q as string) ?? "", rest);
    return response as unknown as Record<string, unknown>;
  }
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

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildMeilisearchFilter(
  field: string,
  value: string | string[] | boolean | RangeFilter,
): string {
  if (isRangeFilter(value)) {
    const parts: string[] = [];
    if (value.min !== undefined) parts.push(`${field} >= ${value.min}`);
    if (value.max !== undefined) parts.push(`${field} <= ${value.max}`);
    return parts.join(" AND ");
  }
  if (Array.isArray(value)) {
    const orClauses = value.map((v) => `${field} = "${escapeFilterValue(v)}"`);
    return `(${orClauses.join(" OR ")})`;
  }
  if (typeof value === "boolean") {
    return `${field} = ${value}`;
  }
  return `${field} = "${escapeFilterValue(value)}"`;
}
