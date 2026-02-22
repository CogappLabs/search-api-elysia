import { useCallback, useEffect, useRef, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import { searchApi } from "./shared";

interface HistogramBucket {
  key: number;
  count: number;
}

interface HistogramResult {
  totalHits: number;
  histograms?: Record<string, HistogramBucket[]>;
}

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

export default function HistogramDemo() {
  const stored = loadConfig();
  const [endpoint, setEndpoint] = useState(
    stored.endpoint ?? "http://localhost:3000",
  );
  const [index, setIndex] = useState(
    stored.index ?? "craft_search_plugin_labs",
  );
  const [token, setToken] = useState(stored.token ?? "");
  const [field, setField] = useState("placePopulation");
  const [interval, setInterval] = useState("100000");
  const [query, setQuery] = useState("");
  const [buckets, setBuckets] = useState<HistogramBucket[]>([]);
  const [totalHits, setTotalHits] = useState(0);
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

  const fetchHistogram = useCallback(() => {
    const num = Number(interval);
    if (!field || Number.isNaN(num) || num < 1) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError("");

    const histogramParam = JSON.stringify({ [field]: num });

    searchApi<HistogramResult>(
      endpoint,
      index,
      "search",
      { q: query, histogram: histogramParam, perPage: "1" },
      ctrl.signal,
      token || undefined,
    )
      .then((data) => {
        setTotalHits(data.totalHits);
        const fieldBuckets = data.histograms?.[field] ?? [];
        setBuckets(fieldBuckets);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
      });
  }, [endpoint, index, token, query, field, interval]);

  useEffect(() => {
    const t = setTimeout(() => fetchHistogram(), 400);
    return () => clearTimeout(t);
  }, [fetchHistogram]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

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
      <div className="mb-4 grid grid-cols-3 gap-3">
        <input
          type="text"
          value={field}
          onChange={(e) => setField(e.target.value)}
          placeholder="Field name"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <input
          type="number"
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          placeholder="Interval"
          min="1"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by query (optional)"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      {error && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}
      <p className="mb-3 text-sm text-gray-500">
        {buckets.length} bucket{buckets.length !== 1 ? "s" : ""} &middot;{" "}
        {totalHits} total document{totalHits !== 1 ? "s" : ""}
      </p>
      {buckets.length > 0 && (
        <div className="space-y-1">
          {buckets.map((bucket) => (
            <div key={bucket.key} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-right tabular-nums text-gray-500">
                {bucket.key.toLocaleString()}
              </span>
              <div className="flex-1">
                <div
                  className="h-5 rounded bg-blue-500 dark:bg-blue-400"
                  style={{
                    width: `${(bucket.count / maxCount) * 100}%`,
                    minWidth: bucket.count > 0 ? "2px" : "0",
                  }}
                />
              </div>
              <span className="w-12 shrink-0 tabular-nums text-gray-500">
                {bucket.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
