import { useCallback, useEffect, useRef, useState } from "react";

export const DEFAULT_ENDPOINT = import.meta.env.DEV
  ? "http://localhost:3000"
  : "https://search-api-elysia-production.up.railway.app";

const STORAGE_KEY = "search-api-demo";

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveConfig(cfg: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function useApiConfig() {
  const stored = loadConfig();
  const [endpoint, setEndpoint] = useState(stored.endpoint ?? DEFAULT_ENDPOINT);
  const [index, setIndex] = useState(
    stored.index ?? "craft_search_plugin_labs",
  );
  const [token, setToken] = useState(stored.token ?? "");

  const updateEndpoint = (v: string) => {
    setEndpoint(v);
    saveConfig({ ...loadConfig(), endpoint: v });
  };
  const updateIndex = (v: string) => {
    setIndex(v);
    saveConfig({ ...loadConfig(), index: v });
  };
  const updateToken = (v: string) => {
    setToken(v);
    saveConfig({ ...loadConfig(), token: v });
  };

  const configProps = {
    endpoint,
    index,
    token,
    onEndpointChange: updateEndpoint,
    onIndexChange: updateIndex,
    onTokenChange: updateToken,
  };

  return { endpoint, index, token, configProps };
}

export function useAbortRef() {
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  return useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    return ctrl;
  }, []);
}

export const INPUT_CLASS =
  "rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";

export const BUTTON_CLASS =
  "rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700";

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
