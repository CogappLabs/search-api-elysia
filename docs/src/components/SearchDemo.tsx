import { useCallback, useEffect, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import type { SearchResult } from "./shared";
import { INPUT_CLASS, searchApi, useAbortRef, useApiConfig } from "./shared";
import { ErrorAlert, HitListItem } from "./shared-ui";

export default function SearchDemo() {
  const { endpoint, index, token, configProps } = useApiConfig();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState("");
  const newController = useAbortRef();

  const doSearch = useCallback(
    (q: string, p: number) => {
      const ctrl = newController();
      setError("");
      searchApi<SearchResult>(
        endpoint,
        index,
        "search",
        { q, page: String(p), perPage: "10", highlight: "true" },
        ctrl.signal,
        token || undefined,
      )
        .then((data) => setResult(data))
        .catch((err) => {
          if (err.name === "AbortError") return;
          setError(err.message);
        });
    },
    [endpoint, index, token, newController],
  );

  useEffect(() => {
    const t = setTimeout(() => doSearch(query, page), 300);
    return () => clearTimeout(t);
  }, [query, page, doSearch]);

  return (
    <div className="not-content mt-8">
      <ApiConfig {...configProps} />
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
        placeholder="Search..."
        className={`mb-4 w-full ${INPUT_CLASS}`}
      />
      <ErrorAlert error={error} />
      {result && (
        <>
          <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
            {result.totalHits} result{result.totalHits !== 1 ? "s" : ""}
            {result.totalPages > 1 &&
              ` \u00b7 page ${result.page} of ${result.totalPages}`}
          </p>
          <ul className="space-y-2">
            {result.hits.map((hit) => (
              <HitListItem key={hit.objectID} hit={hit} />
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
