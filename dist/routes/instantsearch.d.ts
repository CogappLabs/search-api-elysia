import { Elysia } from "elysia";
import type { SearchEngine } from "../engines/engine.ts";
import { FieldAliasMap } from "../field-aliases.ts";
import type { IndexConfig } from "../types.ts";
export declare function instantSearchRoutes(engines: Map<string, SearchEngine>, configs: Map<string, IndexConfig>, aliasMaps?: Map<string, FieldAliasMap>, boostsMaps?: Map<string, Record<string, number>>, searchableFieldsMaps?: Map<string, string[]>): Elysia<"", {
    decorator: {};
    store: {};
    derive: {};
    resolve: {};
}, {
    typebox: {};
    error: {};
}, {
    schema: {};
    standaloneSchema: {};
    macro: {};
    macroFn: {};
    parser: {};
    response: {};
}, {
    ":handle": {
        instantsearch: {
            post: {
                body: {
                    requests: {
                        params?: {
                            facets?: string | string[] | undefined;
                            query?: string | undefined;
                            page?: number | undefined;
                            highlightPreTag?: string | undefined;
                            highlightPostTag?: string | undefined;
                            attributesToRetrieve?: string[] | undefined;
                            hitsPerPage?: number | undefined;
                            facetFilters?: (string | string[])[] | undefined;
                            numericFilters?: string[] | undefined;
                        } | undefined;
                        indexName?: string | undefined;
                        query?: string | undefined;
                    }[];
                };
                params: {
                    handle: string;
                };
                query: unknown;
                headers: unknown;
                response: {
                    404: {
                        error: string;
                    };
                    200: {
                        results: {
                            facets: {
                                [x: string]: {
                                    [x: string]: number;
                                };
                            };
                            query: string;
                            hits: {
                                objectID: string;
                            }[];
                            page: number;
                            hitsPerPage: number;
                            nbHits: number;
                            nbPages: number;
                            processingTimeMS: number;
                            exhaustiveNbHits: boolean;
                        }[];
                    };
                    422: {
                        type: "validation";
                        on: string;
                        summary?: string;
                        message?: string;
                        found?: unknown;
                        property?: string;
                        expected?: string;
                    };
                };
            };
        };
    };
}, {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
    response: {};
}, {
    derive: {};
    resolve: {
        readonly engine: SearchEngine | undefined;
        readonly indexConfig: IndexConfig | undefined;
        readonly aliasMap: FieldAliasMap;
        readonly configBoosts: Record<string, number>;
        readonly configSearchableFields: string[];
    };
    schema: {};
    standaloneSchema: {};
    response: import("elysia").ExtractErrorFromHandle<{
        readonly engine: SearchEngine | undefined;
        readonly indexConfig: IndexConfig | undefined;
        readonly aliasMap: FieldAliasMap;
        readonly configBoosts: Record<string, number>;
        readonly configSearchableFields: string[];
    }>;
}>;
