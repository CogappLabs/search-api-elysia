import { useCallback, useEffect, useRef, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import type { SearchResult } from "./shared";
import {
  DEFAULT_ENDPOINT,
  hitDisplayText,
  searchApi,
  stripHtml,
} from "./shared";

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

export default function SearchDemo() {
  const stored = loadConfig();
  const [endpoint, setEndpoint] = useState(stored.endpoint ?? DEFAULT_ENDPOINT);
  const [index, setIndex] = useState(
    stored.index ?? "craft_search_plugin_labs",
  );
  const [token, setToken] = useState(stored.token ?? "");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

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

  const doSearch = useCallback(
    (q: string, p: number) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setError("");
      searchApi<SearchResult>(
        endpoint,
        index,
        "search",
        { q, page: String(p), perPage: "10", highlight: "true" },
        ctrl.signal,
        token || undefined,
      )
        .then((data) => {
          setResult(data);
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setError(err.message);
        });
    },
    [endpoint, index, token],
  );

  useEffect(() => {
    const t = setTimeout(() => doSearch(query, page), 300);
    return () => clearTimeout(t);
  }, [query, page, doSearch]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return (
    <div className="not-content mt-8">
      <ApiConfig
        endpoint={endpoint}
        index={index}
        token={token}
        onEndpointChange={updateEndpoint}
        onIndexChange={updateIndex}
        onTokenChange={updateToken}
      />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        placeholder="Search..."
        className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
        >
          {error}
        </p>
      )}
      {result && (
        <>
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
            {result.totalHits} result{result.totalHits !== 1 ? "s" : ""}
            {result.totalPages > 1 &&
              ` · page ${result.page} of ${result.totalPages}`}
          </p>
          <ul className="space-y-2">
            {result.hits.map((hit) => (
              <li
                key={hit.objectID}
                className="rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {stripHtml(hitDisplayText(hit))}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {hit._score?.toFixed(1) ?? "—"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {hit.objectID}
                </p>
              </li>
            ))}
          </ul>
          {result.totalPages > 1 && (
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-gray-600"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= result.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40 dark:border-gray-600"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
