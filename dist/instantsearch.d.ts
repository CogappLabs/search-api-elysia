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
export declare function parseFacetFilters(facetFilters: (string | string[])[]): Record<string, string | string[]>;
/**
 * Parse Algolia `numericFilters` format into our RangeFilter format.
 *
 * Input: `["price>=10","price<=100"]`
 * Supported operators: `>=`, `<=`, `>`, `<`
 * Multiple constraints on the same field merge into one RangeFilter.
 *
 * Output: `{ price: { min: 10, max: 100 } }`
 */
export declare function parseNumericFilters(numericFilters: string[]): Record<string, RangeFilter>;
/**
 * Convert an InstantSearch request's params into our SearchOptions format.
 */
export declare function toSearchOptions(req: InstantSearchRequest, defaultFacets?: string[]): SearchOptions;
/**
 * Convert our `_highlights` format (`<mark>` tags) into Algolia's `_highlightResult` format.
 *
 * - Replaces `<mark>` / `</mark>` with the specified pre/post tags (default `<em>` / `</em>`)
 * - Sets `matchLevel: "full"` if there was a highlight, `"none"` otherwise
 * - Joins multiple fragments with ` ... `
 */
export declare function convertHighlights(highlights: Record<string, string[]>, preTag?: string, postTag?: string): Record<string, HighlightResultField>;
/**
 * Convert our facets format `{field: [{value, count}]}` to Algolia's `{field: {value: count}}`.
 */
export declare function convertFacets(facets: Record<string, {
    value: string;
    count: number;
}[]>): Record<string, Record<string, number>>;
/**
 * Convert our SearchResult into an Algolia-format result object.
 */
export declare function fromSearchResult(searchResult: SearchResult, query: string, processingTimeMS: number, preTag?: string, postTag?: string): AlgoliaResult;
