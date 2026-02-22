import { useCallback, useEffect, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import type { FacetValue, SearchResult } from "./shared";
import { INPUT_CLASS, searchApi, useAbortRef, useApiConfig } from "./shared";
import { ErrorAlert, HitListItem } from "./shared-ui";

export default function FacetSearchDemo() {
  const { endpoint, index, token, configProps } = useApiConfig();
  const [query, setQuery] = useState("");
  const [facetField, setFacetField] = useState("country");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<SearchResult | null>(null);
  const [facetValues, setFacetValues] = useState<FacetValue[]>([]);
  const [error, setError] = useState("");
  const newController = useAbortRef();

  const doSearch = useCallback(
    (q: string, field: string, sel: Set<string>) => {
      const ctrl = newController();
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
    [endpoint, index, token, newController],
  );

  useEffect(() => {
    const t = setTimeout(() => doSearch(query, facetField, selected), 300);
    return () => clearTimeout(t);
  }, [query, facetField, selected, doSearch]);

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
      <ApiConfig {...configProps} />
      <div className="mb-4 flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className={`flex-1 ${INPUT_CLASS}`}
        />
        <input
          type="text"
          value={facetField}
          onChange={(e) => {
            setFacetField(e.target.value);
            setSelected(new Set());
          }}
          placeholder="Facet field"
          className={`w-40 ${INPUT_CLASS}`}
        />
      </div>
      <ErrorAlert error={error} />
      {result && (
        <div className="flex gap-6">
          {facetValues.length > 0 && (
            <div className="w-48 shrink-0">
              <h3 className="mb-2 text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">
                {facetField}
              </h3>
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
                      <span className="ml-auto text-xs text-gray-600 dark:text-gray-400">
                        {fv.count}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">
              {result.totalHits} result{result.totalHits !== 1 ? "s" : ""}
            </p>
            <ul className="space-y-2">
              {result.hits.map((hit) => (
                <HitListItem key={hit.objectID} hit={hit} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
