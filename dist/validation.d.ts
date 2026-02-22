import type { Static, TSchema } from "@sinclair/typebox";
export declare const SortSchema: import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString, import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TLiteral<"asc">, import("@sinclair/typebox").TLiteral<"desc">]>>;
export declare const FiltersSchema: import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString, import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>, import("@sinclair/typebox").TBoolean, import("@sinclair/typebox").TObject<{
    min: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
    max: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TNumber>;
}>]>>;
export declare const FacetFiltersSchema: import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString, import("@sinclair/typebox").TUnion<[import("@sinclair/typebox").TString, import("@sinclair/typebox").TArray<import("@sinclair/typebox").TString>]>>;
export declare const BoostsSchema: import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString, import("@sinclair/typebox").TNumber>;
export declare const HistogramSchema: import("@sinclair/typebox").TRecord<import("@sinclair/typebox").TString, import("@sinclair/typebox").TNumber>;
export declare const GeoGridSchema: import("@sinclair/typebox").TObject<{
    field: import("@sinclair/typebox").TString;
    precision: import("@sinclair/typebox").TInteger;
    bounds: import("@sinclair/typebox").TObject<{
        top_left: import("@sinclair/typebox").TObject<{
            lat: import("@sinclair/typebox").TNumber;
            lon: import("@sinclair/typebox").TNumber;
        }>;
        bottom_right: import("@sinclair/typebox").TObject<{
            lat: import("@sinclair/typebox").TNumber;
            lon: import("@sinclair/typebox").TNumber;
        }>;
    }>;
}>;
/** Parse a JSON query param, returning the parsed value or an error message. */
export declare function parseJsonParam<T extends TSchema>(raw: string, schema: T, paramName: string): {
    data: Static<T>;
} | {
    error: string;
};
