import { Client } from "typesense";
import type { FacetSearchOptions, FacetValue, IndexConfig, SearchOptions, SearchResult } from "../types.ts";
import type { SearchEngine } from "./engine.ts";
export declare class TypesenseEngine implements SearchEngine {
    private client;
    private collectionName;
    private dateFields;
    constructor(config: IndexConfig, client?: Client);
    search(query: string, options: SearchOptions): Promise<SearchResult>;
    getDocument(id: string): Promise<Record<string, unknown> | null>;
    searchFacetValues(field: string, query: string, options?: FacetSearchOptions): Promise<FacetValue[]>;
    getMapping(): Promise<Record<string, unknown>>;
    private normalizeDateFields;
    rawQuery(body: Record<string, unknown>): Promise<Record<string, unknown>>;
}
