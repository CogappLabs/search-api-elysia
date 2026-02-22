import { useCallback, useEffect, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import { INPUT_CLASS, searchApi, useAbortRef, useApiConfig } from "./shared";
import { ErrorAlert } from "./shared-ui";

interface HistogramBucket {
  key: number;
  count: number;
}

interface HistogramResult {
  totalHits: number;
  histograms?: Record<string, HistogramBucket[]>;
}

export default function HistogramDemo() {
  const { endpoint, index, token, configProps } = useApiConfig();
  const [field, setField] = useState("placePopulation");
  const [interval, setInterval] = useState("100000");
  const [query, setQuery] = useState("");
  const [buckets, setBuckets] = useState<HistogramBucket[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [error, setError] = useState("");
  const newController = useAbortRef();

  const fetchHistogram = useCallback(() => {
    const num = Number(interval);
    if (!field || Number.isNaN(num) || num < 1) return;

    const ctrl = newController();
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
  }, [endpoint, index, token, query, field, interval, newController]);

  useEffect(() => {
    const t = setTimeout(() => fetchHistogram(), 400);
    return () => clearTimeout(t);
  }, [fetchHistogram]);

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="not-content mt-8">
      <ApiConfig {...configProps} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <input
          type="text"
          value={field}
          onChange={(e) => setField(e.target.value)}
          placeholder="Field name"
          className={INPUT_CLASS}
        />
        <input
          type="number"
          value={interval}
          onChange={(e) => setInterval(e.target.value)}
          placeholder="Interval"
          min="1"
          className={INPUT_CLASS}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by query (optional)"
          className={INPUT_CLASS}
        />
      </div>
      <ErrorAlert error={error} />
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
        {buckets.length} bucket{buckets.length !== 1 ? "s" : ""} &middot;{" "}
        {totalHits} total document{totalHits !== 1 ? "s" : ""}
      </p>
      {buckets.length > 0 && (
        <div className="space-y-1">
          {buckets.map((bucket) => (
            <div key={bucket.key} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-right tabular-nums text-gray-600 dark:text-gray-300">
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
              <span className="w-12 shrink-0 tabular-nums text-gray-600 dark:text-gray-300">
                {bucket.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
