import type { RangeFilter, SearchOptions, SearchResult } from "./types.ts";

/** A single request within the InstantSearch multi-query body. */
export interface InstantSearchRequest {
  indexName?: string;
  query?: string;
  params?: {
    query?: string;
    page?: number;
    hitsPerPage?: number;
    facets?: string[] | string;
    facetFilters?: (string | string[])[];
    numericFilters?: string[];
    attributesToRetrieve?: string[];
    highlightPreTag?: string;
    highlightPostTag?: string;
  };
}

/** Algolia-format highlight result for a single field. */
export interface HighlightResultField {
  value: string;
  matchLevel: "full" | "none";
}

/** A single hit in Algolia response format. */
export interface AlgoliaHit {
  objectID: string;
  _highlightResult?: Record<string, HighlightResultField>;
  [key: string]: unknown;
}

/** A single result in Algolia response format. */
export interface AlgoliaResult {
  hits: AlgoliaHit[];
  nbHits: number;
  nbPages: number;
  page: number;
  hitsPerPage: number;
  facets: Record<string, Record<string, number>>;
  processingTimeMS: number;
  query: string;
  exhaustiveNbHits: boolean;
}

/**
 * Parse Algolia `facetFilters` format into our filters format.
 *
 * Input: `[["category:A","category:B"], "brand:X"]`
 * - Outer array items are ANDed
 * - Inner array items are ORed (same field, multiple values)
 * - Split on first `:`
 * - Skip negated entries (leading `-`) in V1
 *
 * Output: `{ category: ["A","B"], brand: "X" }`
 */
export function parseFacetFilters(
  facetFilters: (string | string[])[],
): Record<string, string | string[]> {
  const result: Record<string, string[]> = {};

  for (const entry of facetFilters) {
    const items = Array.isArray(entry) ? entry : [entry];
    for (const item of items) {
      if (item.startsWith("-")) continue;
      const colonIdx = item.indexOf(":");
      if (colonIdx === -1) continue;
      const field = item.slice(0, colonIdx);
      const value = item.slice(colonIdx + 1);
      if (!result[field]) result[field] = [];
      result[field].push(value);
    }
  }

  // Collapse single-value arrays to plain strings
  const collapsed: Record<string, string | string[]> = {};
  for (const [field, values] of Object.entries(result)) {
    collapsed[field] = values.length === 1 ? (values[0] as string) : values;
  }
  return collapsed;
}

/**
 * Parse Algolia `numericFilters` format into our RangeFilter format.
 *
 * Input: `["price>=10","price<=100"]`
 * Supported operators: `>=`, `<=`, `>`, `<`
 * Multiple constraints on the same field merge into one RangeFilter.
 *
 * Output: `{ price: { min: 10, max: 100 } }`
 */
export function parseNumericFilters(
  numericFilters: string[],
): Record<string, RangeFilter> {
  const result: Record<string, RangeFilter> = {};

  for (const filter of numericFilters) {
    // Try two-char operators first, then single-char
    const match = filter.match(/^(.+?)(>=|<=|>|<)(.+)$/);
    if (!match) continue;

    const field = match[1];
    const op = match[2];
    const rawValue = match[3];
    if (!field || !op || !rawValue) continue;

    const value = Number(rawValue);
    if (Number.isNaN(value)) continue;

    if (!result[field]) result[field] = {};

    const entry = result[field] as RangeFilter;
    if (op === ">=" || op === ">") {
      entry.min = value;
    } else if (op === "<=" || op === "<") {
      entry.max = value;
    }
  }

  return result;
}

/**
 * Convert an InstantSearch request's params into our SearchOptions format.
 */
export function toSearchOptions(
  req: InstantSearchRequest,
  defaultFacets?: string[],
): SearchOptions {
  const params = req.params ?? {};
  const options: SearchOptions = {
    page: (params.page ?? 0) + 1, // 0-indexed → 1-indexed
    perPage: Math.max(params.hitsPerPage ?? 20, 1),
    highlight: true,
  };

  // Facets
  if (params.facets) {
    const facetList = Array.isArray(params.facets)
      ? params.facets
      : [params.facets];
    if (facetList.length === 1 && facetList[0] === "*") {
      if (defaultFacets && defaultFacets.length > 0) {
        options.facets = defaultFacets;
      }
    } else {
      options.facets = facetList;
    }
  }

  // Filters from facetFilters and numericFilters
  const filters: Record<string, string | string[] | boolean | RangeFilter> = {};
  if (params.facetFilters) {
    Object.assign(filters, parseFacetFilters(params.facetFilters));
  }
  if (params.numericFilters) {
    Object.assign(filters, parseNumericFilters(params.numericFilters));
  }
  if (Object.keys(filters).length > 0) {
    options.filters = filters;
  }

  if (params.attributesToRetrieve) {
    options.attributesToRetrieve = params.attributesToRetrieve;
  }

  return options;
}

/**
 * Convert our `_highlights` format (`<mark>` tags) into Algolia's `_highlightResult` format.
 *
 * - Replaces `<mark>` / `</mark>` with the specified pre/post tags (default `<em>` / `</em>`)
 * - Sets `matchLevel: "full"` if there was a highlight, `"none"` otherwise
 * - Joins multiple fragments with ` ... `
 */
export function convertHighlights(
  highlights: Record<string, string[]>,
  preTag = "<em>",
  postTag = "</em>",
): Record<string, HighlightResultField> {
  const result: Record<string, HighlightResultField> = {};
  for (const [field, fragments] of Object.entries(highlights)) {
    if (fragments.length === 0) {
      result[field] = { value: "", matchLevel: "none" };
      continue;
    }
    const joined = fragments.join(" ... ");
    const converted = joined
      .replaceAll("<mark>", preTag)
      .replaceAll("</mark>", postTag);
    result[field] = { value: converted, matchLevel: "full" };
  }
  return result;
}

/**
 * Convert our facets format `{field: [{value, count}]}` to Algolia's `{field: {value: count}}`.
 */
export function convertFacets(
  facets: Record<string, { value: string; count: number }[]>,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  for (const [field, values] of Object.entries(facets)) {
    result[field] = {};
    for (const { value, count } of values) {
      result[field][value] = count;
    }
  }
  return result;
}

/**
 * Convert our SearchResult into an Algolia-format result object.
 */
export function fromSearchResult(
  searchResult: SearchResult,
  query: string,
  processingTimeMS: number,
  preTag = "<em>",
  postTag = "</em>",
): AlgoliaResult {
  const hits: AlgoliaHit[] = searchResult.hits.map((hit) => {
    const { _highlights, _index, _score, ...fields } = hit;
    const algoliaHit: AlgoliaHit = {
      ...fields,
      objectID: hit.objectID,
    };
    if (_highlights && Object.keys(_highlights).length > 0) {
      algoliaHit._highlightResult = convertHighlights(
        _highlights,
        preTag,
        postTag,
      );
    }
    return algoliaHit;
  });

  return {
    hits,
    nbHits: searchResult.totalHits,
    nbPages: searchResult.totalPages,
    page: searchResult.page - 1, // 1-indexed → 0-indexed
    hitsPerPage: searchResult.perPage,
    facets: convertFacets(searchResult.facets),
    processingTimeMS,
    query,
    exhaustiveNbHits: true,
  };
}
