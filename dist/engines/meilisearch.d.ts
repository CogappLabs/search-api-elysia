import { MeiliSearch } from "meilisearch";
import type { FacetSearchOptions, FacetValue, IndexConfig, SearchOptions, SearchResult } from "../types.ts";
import type { SearchEngine } from "./engine.ts";
export declare class MeilisearchEngine implements SearchEngine {
    private index;
    constructor(config: IndexConfig, client?: MeiliSearch);
    search(query: string, options: SearchOptions): Promise<SearchResult>;
    getDocument(id: string): Promise<Record<string, unknown> | null>;
    searchFacetValues(field: string, query: string, options?: FacetSearchOptions): Promise<FacetValue[]>;
    getMapping(): Promise<Record<string, unknown>>;
    rawQuery(body: Record<string, unknown>): Promise<Record<string, unknown>>;
}
