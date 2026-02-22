import type {
  FacetSearchOptions,
  FacetValue,
  SearchOptions,
  SearchResult,
} from "../types.ts";

export interface SearchEngine {
  search(query: string, options: SearchOptions): Promise<SearchResult>;
  getDocument(id: string): Promise<Record<string, unknown> | null>;
  searchFacetValues(
    field: string,
    query: string,
    options?: FacetSearchOptions,
  ): Promise<FacetValue[]>;
  getMapping(): Promise<Record<string, unknown>>;
  rawQuery(body: Record<string, unknown>): Promise<Record<string, unknown>>;
}
