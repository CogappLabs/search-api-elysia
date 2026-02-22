export const DEFAULT_ENDPOINT = import.meta.env.DEV
  ? "http://localhost:3000"
  : "https://search-api-elysia-production.up.railway.app";

export interface SearchHit {
  objectID: string;
  _index: string;
  _score: number | null;
  _highlights?: Record<string, string[]>;
  [key: string]: unknown;
}

export interface HistogramBucket {
  key: number;
  count: number;
}

export interface GeoCluster {
  lat: number;
  lng: number;
  count: number;
  key: string;
  hit?: SearchHit | null;
}

export interface SearchResult {
  hits: SearchHit[];
  totalHits: number;
  page: number;
  perPage: number;
  totalPages: number;
  facets?: Record<string, FacetValue[]>;
  histograms?: Record<string, HistogramBucket[]>;
  geoClusters?: GeoCluster[];
  suggestions?: string[];
}

export interface AutocompleteResult {
  hits: SearchHit[];
  totalHits: number;
  facets?: Record<string, FacetValue[]>;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface FacetSearchResult {
  field: string;
  values: FacetValue[];
}

/** Extract the best display string for a hit (first highlight fragment or title/name/objectID). */
export function hitDisplayText(hit: SearchHit): string {
  if (hit._highlights) {
    const first = Object.values(hit._highlights)[0];
    if (first?.[0]) return first[0];
  }
  return (hit.title as string) ?? (hit.name as string) ?? String(hit.objectID);
}

/** Strip HTML tags from a string (for safe text rendering). */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

export async function searchApi<T>(
  endpoint: string,
  index: string,
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal,
  token?: string,
): Promise<T> {
  const url = new URL(`${endpoint}/${index}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { signal, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `${res.status} ${res.statusText}${text ? `: ${text}` : ""}`,
    );
  }
  return res.json();
}
