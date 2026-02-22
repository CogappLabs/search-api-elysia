import { Elysia } from "elysia";
import type { FieldConfig } from "./types.ts";
export declare function deriveFromFields(fields?: Record<string, FieldConfig>): {
    aliases: Record<string, string>;
    boosts: Record<string, number>;
    searchableFields: string[];
};
declare const app: Elysia<"", {
    decorator: {};
    store: {};
    derive: {};
    resolve: {};
}, {
    typebox: {};
    error: {};
} & {
    typebox: {};
    error: {};
} & {
    typebox: {};
    error: {};
} & {
    typebox: {};
    error: {};
} & {
    typebox: {
        readonly error: import("@sinclair/typebox").TObject<{
            error: import("@sinclair/typebox").TString;
        }>;
    };
    error: {};
}, {
    schema: {};
    standaloneSchema: {};
    macro: {};
    macroFn: {};
    parser: {};
    response: {};
} & {
    schema: {};
    standaloneSchema: {};
    macro: {};
    macroFn: {};
    parser: {};
    response: {};
} & {
    schema: {};
    standaloneSchema: {};
    macro: {};
    macroFn: {};
    parser: {};
    response: {};
} & {
    schema: {};
    standaloneSchema: {};
    macro: {};
    macroFn: {};
    parser: {};
    response: {};
}, {
    health: {
        get: {
            body: unknown;
            params: {};
            query: unknown;
            headers: unknown;
            response: {
                200: {
                    cache: string;
                    status: string;
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
} & {
    cache: {
        clear: {
            post: {
                body: unknown;
                params: {};
                query: unknown;
                headers: unknown;
                response: {
                    200: {
                        message?: string | undefined;
                        cleared: boolean;
                    };
                    401: {
                        readonly error: "Unauthorized";
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
    indexes: {
        get: {
            body: unknown;
            params: {};
            query: unknown;
            headers: unknown;
            response: {
                200: {
                    indexes: {
                        engine: string;
                        handle: string;
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
} & {
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
} & {
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
    resolve: {};
    schema: {};
    standaloneSchema: {};
    response: {
        200: {
            error: string;
        };
    } & {
        401: {
            readonly error: "Unauthorized";
        };
    };
} & {
    derive: {};
    resolve: {};
    schema: {};
    standaloneSchema: {};
    response: {};
}>;
export type App = typeof app;
export {};
