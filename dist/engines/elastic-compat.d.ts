import type { FacetSearchOptions, FacetValue, IndexConfig, SearchOptions, SearchResult } from "../types.ts";
import type { SearchEngine } from "./engine.ts";
/**
 * Minimal duck type for Elasticsearch/OpenSearch clients.
 * Avoids importing both client libraries — subclasses provide the concrete client.
 */
export interface ElasticCompatClient {
    search(params: Record<string, unknown>): Promise<unknown>;
    get(params: {
        index: string;
        id: string;
    }): Promise<unknown>;
    indices: {
        getMapping(params: {
            index: string;
        }): Promise<unknown>;
    };
}
/**
 * Shared base class for Elasticsearch and OpenSearch engines.
 * Both use an identical query DSL — subclasses only differ in client
 * construction and response unwrapping.
 */
export declare abstract class ElasticCompatEngine implements SearchEngine {
    protected client: ElasticCompatClient;
    protected indexName: string;
    protected suggestField: string | undefined;
    protected nestedPaths: Map<string, string>;
    private mappingCache;
    constructor(config: IndexConfig, client?: ElasticCompatClient);
    /** Create the engine-specific client instance. */
    protected abstract createClient(config: IndexConfig): ElasticCompatClient;
    /** Unwrap the response body. ES v8 returns body directly; OpenSearch wraps in .body. */
    protected abstract extractBody<T>(response: unknown): T;
    /** Check if an error represents a 404 (different shapes per client). */
    protected abstract isNotFoundError(err: unknown): boolean;
    private wrapNestedIfNeeded;
    search(query: string, options: SearchOptions): Promise<SearchResult>;
    getDocument(id: string): Promise<Record<string, unknown> | null>;
    getMapping(): Promise<Record<string, unknown>>;
    private ensureMapping;
    rawQuery(body: Record<string, unknown>): Promise<Record<string, unknown>>;
    searchFacetValues(field: string, query: string, options?: FacetSearchOptions): Promise<FacetValue[]>;
}
