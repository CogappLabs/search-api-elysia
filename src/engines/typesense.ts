import { Client } from "typesense";
import type { DocumentSchema } from "typesense/lib/Typesense/Documents";
import type { SearchParams } from "typesense/lib/Typesense/Types";
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

type TsDoc = DocumentSchema;
type TsSearchParams = SearchParams<TsDoc, string>;

interface HighlightSnippet {
  snippet?: string;
  matched_tokens?: string[];
}

interface LegacyHighlight {
  field?: string;
  snippet?: string;
}

interface FacetCount {
  value: string;
  count: number;
  highlighted?: string;
}

interface FacetGroup {
  field_name: string;
  counts: FacetCount[];
  sampled?: boolean;
  stats?: Record<string, number>;
}

export class TypesenseEngine implements SearchEngine {
  private client: Client;
  private collectionName: string;
  private dateFields: Set<string>;

  constructor(config: IndexConfig, client?: Client) {
    if (Array.isArray(config.indexName) && config.indexName.length > 1) {
      throw new Error(
        "Typesense engine does not support multi-index search. Configure separate index handles instead.",
      );
    }
    this.collectionName = Array.isArray(config.indexName)
      ? (config.indexName[0] as string)
      : config.indexName;
    this.dateFields = new Set(config.dateFields ?? []);

    if (client) {
      this.client = client;
    } else {
      const url = new URL(config.host);
      this.client = new Client({
        apiKey: config.apiKey ?? "",
        nodes: [
          {
            host: url.hostname,
            port: Number(url.port) || (url.protocol === "https:" ? 443 : 80),
            protocol: url.protocol.replace(":", ""),
          },
        ],
        connectionTimeoutSeconds: 5,
      });
    }
  }

  async search(query: string, options: SearchOptions): Promise<SearchResult> {
    const page = options.page ?? 1;
    const perPage = options.perPage ?? 20;

    // Build filter_by string
    const filterClauses: string[] = [];
    if (options.filters) {
      for (const [field, value] of Object.entries(options.filters)) {
        filterClauses.push(buildTypesenseFilter(field, value));
      }
    }

    // Build sort_by string
    const sortParts: string[] = [];
    if (options.sort) {
      for (const [field, order] of Object.entries(options.sort)) {
        sortParts.push(`${field}:${order}`);
      }
    }

    // Build highlight_fields
    let highlightFields: string | undefined;
    if (options.highlight) {
      highlightFields = Array.isArray(options.highlight)
        ? options.highlight.join(",")
        : undefined; // true → default (all query_by fields)
    }

    // Build query_by from boosts/searchableFields
    let queryBy = "*";
    if (options.boosts) {
      queryBy = Object.keys(options.boosts).join(",");
    } else if (options.searchableFields) {
      queryBy = options.searchableFields.join(",");
    }

    const searchParams: TsSearchParams = {
      q: query || "*",
      query_by: queryBy,
      page,
      per_page: perPage,
      ...(filterClauses.length > 0
        ? { filter_by: filterClauses.join(" && ") }
        : {}),
      ...(sortParts.length > 0 ? { sort_by: sortParts.join(",") } : {}),
      ...(options.facets?.length ? { facet_by: options.facets.join(",") } : {}),
      ...(highlightFields !== undefined
        ? { highlight_fields: highlightFields }
        : {}),
      ...(options.highlight
        ? { highlight_start_tag: "<mark>", highlight_end_tag: "</mark>" }
        : {}),
      ...(options.attributesToRetrieve
        ? { include_fields: options.attributesToRetrieve.join(",") }
        : {}),
      ...(options.boosts
        ? { query_by_weights: Object.values(options.boosts).join(",") }
        : {}),
    };

    const response = await this.client
      .collections<TsDoc>(this.collectionName)
      .documents()
      .search(searchParams);

    // Normalise hits
    const hits: SearchHit[] = [];
    for (const hit of response.hits ?? []) {
      const doc = (hit.document ?? {}) as Record<string, unknown>;
      const highlights = extractHighlights({ ...hit });

      this.normalizeDateFields(doc);
      hits.push({
        ...doc,
        objectID: String(doc.id ?? ""),
        _index: this.collectionName,
        _score: hit.text_match ?? null,
        _highlights: highlights,
      });
    }

    // Normalise facets from facet_counts
    const facets = normaliseFacetCounts(
      response.facet_counts as FacetGroup[] | undefined,
    );

    const totalHits = response.found ?? 0;
    const totalPages = Math.ceil(totalHits / perPage);

    return {
      hits,
      totalHits,
      page: response.page ?? page,
      perPage,
      totalPages,
      facets,
      suggestions: [],
    };
  }

  async getDocument(id: string): Promise<Record<string, unknown> | null> {
    try {
      const doc = (await this.client
        .collections(this.collectionName)
        .documents(id)
        .retrieve()) as Record<string, unknown>;
      this.normalizeDateFields(doc);
      return {
        ...doc,
        objectID: String(doc.id ?? id),
        _index: this.collectionName,
      };
    } catch (err: unknown) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  async searchFacetValues(
    field: string,
    query: string,
    options?: FacetSearchOptions,
  ): Promise<FacetValue[]> {
    const maxValues = options?.maxValues ?? 20;

    // Build filter_by from options.filters
    const filterClauses: string[] = [];
    if (options?.filters) {
      for (const [f, value] of Object.entries(options.filters)) {
        if (Array.isArray(value)) {
          const escaped = value
            .map((v) => `\`${escapeFilterValue(v)}\``)
            .join(",");
          filterClauses.push(`${f}:=[${escaped}]`);
        } else {
          filterClauses.push(`${f}:=\`${escapeFilterValue(value)}\``);
        }
      }
    }

    const searchParams: TsSearchParams = {
      q: "*",
      query_by: "*",
      facet_by: field,
      per_page: 0,
      max_facet_values: Math.max(maxValues, 100),
      ...(query ? { facet_query: `${field}:${query}` } : {}),
      ...(filterClauses.length > 0
        ? { filter_by: filterClauses.join(" && ") }
        : {}),
    };

    const response = await this.client
      .collections<TsDoc>(this.collectionName)
      .documents()
      .search(searchParams);

    // Extract matching facet values
    for (const facetGroup of (response.facet_counts ?? []) as FacetGroup[]) {
      if (facetGroup.field_name === field) {
        return (facetGroup.counts ?? []).slice(0, maxValues).map((item) => ({
          value: String(item.value ?? ""),
          count: item.count ?? 0,
        }));
      }
    }

    return [];
  }

  async getMapping(): Promise<Record<string, unknown>> {
    const collection = await this.client
      .collections(this.collectionName)
      .retrieve();
    return collection as unknown as Record<string, unknown>;
  }

  private normalizeDateFields(doc: Record<string, unknown>): void {
    for (const field of this.dateFields) {
      const val = doc[field];
      if (typeof val === "number") {
        doc[field] = new Date(val * 1000).toISOString();
      }
    }
  }

  async rawQuery(
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { q, ...rest } = body;
    const searchParams: TsSearchParams = {
      q: (q as string) ?? "*",
      query_by: (rest.query_by as string) ?? "*",
      ...rest,
    };
    const response = await this.client
      .collections<TsDoc>(this.collectionName)
      .documents()
      .search(searchParams);
    return response as unknown as Record<string, unknown>;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function extractHighlights(
  hit: Record<string, unknown>,
): Record<string, string[]> {
  const highlights: Record<string, string[]> = {};

  // v26+ object format: { field: { snippet: 'text', matched_tokens: [...] } }
  const highlightObj = hit.highlight;
  if (highlightObj && typeof highlightObj === "object") {
    for (const [field, data] of Object.entries(
      highlightObj as Record<string, unknown>,
    )) {
      if (data && typeof data === "object" && "snippet" in data) {
        const snippet = (data as HighlightSnippet).snippet;
        if (snippet) highlights[field] = [snippet];
      } else if (typeof data === "string" && data.includes("<mark>")) {
        highlights[field] = [data];
      }
    }
  }

  // Legacy array format: [{ field: 'title', snippet: 'text' }]
  if (Object.keys(highlights).length === 0) {
    const legacyHighlights = hit.highlights;
    if (Array.isArray(legacyHighlights)) {
      for (const hl of legacyHighlights as LegacyHighlight[]) {
        if (hl.field && hl.snippet) {
          highlights[hl.field] = [hl.snippet];
        }
      }
    }
  }

  return highlights;
}

function normaliseFacetCounts(
  facetCounts: FacetGroup[] | undefined,
): Record<string, FacetValue[]> {
  const facets: Record<string, FacetValue[]> = {};
  for (const group of facetCounts ?? []) {
    const field = group.field_name;
    if (!field) continue;
    facets[field] = (group.counts ?? []).map((item) => ({
      value: String(item.value ?? ""),
      count: item.count ?? 0,
    }));
  }
  return facets;
}

function isNotFoundError(err: unknown): boolean {
  if (err && typeof err === "object") {
    if (
      "httpStatus" in err &&
      (err as { httpStatus: number }).httpStatus === 404
    )
      return true;
    if (
      err.constructor?.name === "ObjectNotFound" ||
      err.constructor?.name === "ObjectUnprocessable"
    )
      return true;
  }
  return false;
}

function escapeFilterValue(value: string): string {
  return value.replace(/`/g, "\\`");
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

function buildTypesenseFilter(
  field: string,
  value: string | string[] | boolean | RangeFilter,
): string {
  if (isRangeFilter(value)) {
    const parts: string[] = [];
    if (value.min !== undefined) parts.push(`${field}:>=${value.min}`);
    if (value.max !== undefined) parts.push(`${field}:<=${value.max}`);
    return parts.join(" && ");
  }
  if (Array.isArray(value)) {
    const escaped = value.map((v) => `\`${escapeFilterValue(v)}\``).join(",");
    return `${field}:=[${escaped}]`;
  }
  if (typeof value === "boolean") {
    return `${field}:=${value}`;
  }
  return `${field}:=\`${escapeFilterValue(value)}\``;
}
