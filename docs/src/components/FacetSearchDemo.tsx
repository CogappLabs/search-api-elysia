import { useCallback, useEffect, useRef, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import type { FacetValue, SearchResult } from "./shared";
import { hitDisplayText, searchApi, stripHtml } from "./shared";

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

export default function FacetSearchDemo() {
  const stored = loadConfig();
  const [endpoint, setEndpoint] = useState(
    stored.endpoint ?? "http://localhost:3000",
  );
  const [index, setIndex] = useState(
    stored.index ?? "craft_search_plugin_labs",
  );
  const [token, setToken] = useState(stored.token ?? "");
  const [query, setQuery] = useState("");
  const [facetField, setFacetField] = useState("placeCountry");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<SearchResult | null>(null);
  const [facetValues, setFacetValues] = useState<FacetValue[]>([]);
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
    (q: string, field: string, sel: Set<string>) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setError("");

      const params: Record<string, string> = {
        q,
        perPage: "10",
        highlight: "true",
      };
      if (field) params.facets = field;
      if (sel.size > 0 && field) {
        params.filters = JSON.stringify({ [field]: [...sel] });
      }

      searchApi<SearchResult>(
        endpoint,
        index,
        "search",
        params,
        ctrl.signal,
        token || undefined,
      )
        .then((data) => {
          setResult(data);
          if (data.facets && field && data.facets[field]) {
            setFacetValues(data.facets[field]);
          } else {
            setFacetValues([]);
          }
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setError(err.message);
        });
    },
    [endpoint, index, token],
  );

  useEffect(() => {
    const t = setTimeout(() => doSearch(query, facetField, selected), 300);
    return () => clearTimeout(t);
  }, [query, facetField, selected, doSearch]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const toggleFacet = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

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
      <div className="mb-4 flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <input
          type="text"
          value={facetField}
          onChange={(e) => {
            setFacetField(e.target.value);
            setSelected(new Set());
          }}
          placeholder="Facet field"
          className="w-40 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      {error && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}
      {result && (
        <div className="flex gap-6">
          {facetValues.length > 0 && (
            <div className="w-48 shrink-0">
              <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                {facetField}
              </h4>
              <ul className="space-y-1">
                {facetValues.map((fv) => (
                  <li key={fv.value}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={selected.has(fv.value)}
                        onChange={() => toggleFacet(fv.value)}
                        className="rounded"
                      />
                      <span className="truncate">{fv.value}</span>
                      <span className="ml-auto text-xs text-gray-400">
                        {fv.count}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="mb-3 text-sm text-gray-500">
              {result.totalHits} result{result.totalHits !== 1 ? "s" : ""}
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
                    <span className="shrink-0 text-xs text-gray-400">
                      {hit._score?.toFixed(1) ?? "—"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{hit.objectID}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
