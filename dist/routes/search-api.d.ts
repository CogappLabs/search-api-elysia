import { Elysia } from "elysia";
import { type Cache } from "../cache.ts";
import type { SearchEngine } from "../engines/engine.ts";
import { FieldAliasMap } from "../field-aliases.ts";
import type { IndexConfig } from "../types.ts";
export declare function searchApiRoutes(engines: Map<string, SearchEngine>, configs: Map<string, IndexConfig>, aliasMaps?: Map<string, FieldAliasMap>, boostsMaps?: Map<string, Record<string, number>>, searchableFieldsMaps?: Map<string, string[]>, cache?: Cache | null): Elysia<"", {
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
        search: {
            get: {
                body: unknown;
                params: {
                    handle: string;
                };
                query: {
                    perPage?: number | undefined;
                    facets?: string | undefined;
                    highlight?: string | undefined;
                    fields?: string | undefined;
                    sort?: string | undefined;
                    histogram?: string | undefined;
                    suggest?: string | undefined;
                    page?: number | undefined;
                    filters?: string | undefined;
                    q?: string | undefined;
                    boosts?: string | undefined;
                    geoGrid?: string | undefined;
                };
                headers: unknown;
                response: {
                    404: {
                        error: string;
                    };
                    200: {
                        histograms?: {} | undefined;
                        geoClusters?: {
                            hit?: {
                                objectID: string;
                                _index: string;
                                _score: number | null;
                                _highlights: {
                                    [x: string]: string[];
                                };
                            } | null | undefined;
                            key: string;
                            count: number;
                            lat: number;
                            lng: number;
                        }[] | undefined;
                        perPage: number;
                        facets: {
                            [x: string]: {
                                value: string;
                                count: number;
                            }[];
                        };
                        hits: {
                            objectID: string;
                            _index: string;
                            _score: number | null;
                            _highlights: {
                                [x: string]: string[];
                            };
                        }[];
                        totalHits: number;
                        page: number;
                        suggestions: string[];
                        totalPages: number;
                    };
                    400: {
                        error: string;
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
} & {
    ":handle": {
        autocomplete: {
            get: {
                body: unknown;
                params: {
                    handle: string;
                };
                query: {
                    perPage?: number | undefined;
                    facets?: string | undefined;
                    q?: string | undefined;
                    maxFacetsPerField?: number | undefined;
                };
                headers: unknown;
                response: {
                    404: {
                        error: string;
                    };
                    200: {
                        facets?: {} | undefined;
                        hits: {
                            objectID: string;
                            _index: string;
                            _score: number | null;
                            _highlights: {
                                [x: string]: string[];
                            };
                        }[];
                        totalHits: number;
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
} & {
    ":handle": {
        documents: {
            ":id": {
                get: {
                    body: unknown;
                    params: {
                        id: string;
                        handle: string;
                    };
                    query: unknown;
                    headers: unknown;
                    response: {
                        404: {
                            error: string;
                        };
                        200: {
                            [x: string]: unknown;
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
    };
} & {
    ":handle": {
        mapping: {
            get: {
                body: unknown;
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
                        [x: string]: unknown;
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
} & {
    ":handle": {
        query: {
            post: {
                body: {
                    [x: string]: unknown;
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
                        [x: string]: unknown;
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
} & {
    ":handle": {
        facets: {
            ":field": {
                get: {
                    body: unknown;
                    params: {
                        field: string;
                        handle: string;
                    };
                    query: {
                        filters?: string | undefined;
                        q?: string | undefined;
                        maxValues?: number | undefined;
                    };
                    headers: unknown;
                    response: {
                        404: {
                            error: string;
                        };
                        200: {
                            values: {
                                value: string;
                                count: number;
                            }[];
                            field: string;
                        };
                        400: {
                            error: string;
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
