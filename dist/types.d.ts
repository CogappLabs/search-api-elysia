export interface SearchHit {
    objectID: string;
    _index: string;
    _score: number | null;
    _highlights: Record<string, string[]>;
    [key: string]: unknown;
}
export interface FacetValue {
    value: string;
    count: number;
}
export interface HistogramBucket {
    key: number;
    count: number;
}
export interface SearchResult {
    hits: SearchHit[];
    totalHits: number;
    page: number;
    perPage: number;
    totalPages: number;
    facets: Record<string, FacetValue[]>;
    histograms?: Record<string, HistogramBucket[]>;
    geoClusters?: GeoCluster[];
    suggestions: string[];
}
export interface RangeFilter {
    min?: number;
    max?: number;
}
export interface GeoPoint {
    lat: number;
    lon: number;
}
export interface GeoGridOptions {
    field: string;
    precision: number;
    bounds: {
        top_left: GeoPoint;
        bottom_right: GeoPoint;
    };
}
export interface GeoCluster {
    lat: number;
    lng: number;
    count: number;
    key: string;
    hit?: SearchHit | null;
}
export interface SearchOptions {
    page?: number;
    perPage?: number;
    sort?: Record<string, "asc" | "desc">;
    facets?: string[];
    filters?: Record<string, string | string[] | boolean | RangeFilter>;
    highlight?: boolean | string[];
    attributesToRetrieve?: string[];
    suggest?: boolean;
    boosts?: Record<string, number>;
    searchableFields?: string[];
    histogram?: Record<string, number>;
    geoGrid?: GeoGridOptions;
}
export interface FacetSearchOptions {
    maxValues?: number;
    filters?: Record<string, string | string[]>;
}
export interface FieldConfig {
    weight?: number;
    searchable?: boolean;
    esField?: string;
}
export interface IndexDefaults {
    perPage?: number;
    facets?: string[];
    highlight?: boolean;
    suggestField?: string;
}
export interface IndexConfig {
    engine: string;
    host: string;
    apiKey?: string;
    username?: string;
    password?: string;
    indexName: string | string[];
    defaults?: IndexDefaults;
    fields?: Record<string, FieldConfig>;
}
export interface AppConfig {
    port: number;
    apiKey?: string;
    corsOrigins?: string | string[];
    indexes: Record<string, IndexConfig>;
}
