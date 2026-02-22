import { useCallback, useEffect, useRef, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import type { AutocompleteResult, SearchHit } from "./shared";
import { searchApi } from "./shared";

const STORAGE_KEY = "search-api-demo";
const FACET_FIELDS = "placeCountry,placeRegion";
const FACET_LABELS: Record<string, string> = {
  placeCountry: "Country",
  placeRegion: "Region",
};

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

type Option =
  | { type: "facet"; field: string; value: string; count: number }
  | { type: "hit"; hit: SearchHit };

export default function AutocompleteDemo() {
  const stored = loadConfig();
  const [endpoint, setEndpoint] = useState(
    stored.endpoint ?? "http://localhost:3000",
  );
  const [index, setIndex] = useState(
    stored.index ?? "craft_search_plugin_labs",
  );
  const [token, setToken] = useState(stored.token ?? "");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [error, setError] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
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

  const doAutocomplete = useCallback(
    (q: string) => {
      if (q.length < 2) {
        setOptions([]);
        setTotalHits(0);
        setShowDropdown(false);
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setError("");

      searchApi<AutocompleteResult>(
        endpoint,
        index,
        "autocomplete",
        { q, perPage: "5", facets: FACET_FIELDS },
        ctrl.signal,
        token || undefined,
      )
        .then((data) => {
          const opts: Option[] = [];
          if (data.facets) {
            for (const [field, values] of Object.entries(data.facets)) {
              for (const fv of values) {
                opts.push({
                  type: "facet",
                  field,
                  value: fv.value,
                  count: fv.count,
                });
              }
            }
          }
          for (const hit of data.hits) {
            opts.push({ type: "hit", hit });
          }
          setOptions(opts);
          setTotalHits(data.totalHits);
          setActiveIndex(-1);
          setShowDropdown(opts.length > 0);
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setError(err.message);
          setShowDropdown(false);
        });
    },
    [endpoint, index, token],
  );

  useEffect(() => {
    const t = setTimeout(() => doAutocomplete(query), 150);
    return () => clearTimeout(t);
  }, [query, doAutocomplete]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const hitLabel = (hit: SearchHit) =>
    (hit.title as string) ?? (hit.name as string) ?? hit.objectID;

  // Determine where section headers should appear
  const renderItems = () => {
    const elements: React.ReactNode[] = [];
    let lastFacetField: string | null = null;
    let hitsLabelRendered = false;
    const hasFacets = options.some((o) => o.type === "facet");

    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const isActive = i === activeIndex;
      const activeClass = isActive ? "bg-gray-100 dark:bg-gray-700" : "";

      if (opt.type === "facet") {
        if (opt.field !== lastFacetField) {
          lastFacetField = opt.field;
          elements.push(
            <div
              key={`label-${opt.field}`}
              className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400"
            >
              {FACET_LABELS[opt.field] ?? opt.field}
            </div>,
          );
        }
        elements.push(
          <div
            key={`facet-${opt.field}-${opt.value}`}
            className={`flex items-center justify-between px-4 py-1.5 text-sm cursor-pointer ${activeClass}`}
          >
            <span className="text-gray-700 dark:text-gray-300">
              {opt.value}
            </span>
            <span className="text-xs text-gray-400">{opt.count}</span>
          </div>,
        );
      } else {
        if (!hitsLabelRendered) {
          hitsLabelRendered = true;
          if (hasFacets) {
            elements.push(
              <div
                key="divider"
                className="border-t border-gray-200 dark:border-gray-700"
              />,
            );
          }
          elements.push(
            <div
              key="hits-label"
              className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400"
            >
              Results
            </div>,
          );
        }
        elements.push(
          <div
            key={`hit-${opt.hit.objectID}`}
            className={`flex items-baseline justify-between px-4 py-2 text-sm cursor-pointer ${activeClass}`}
          >
            <span className="text-gray-900 dark:text-gray-100">
              {hitLabel(opt.hit)}
            </span>
            <span className="text-xs text-gray-400">
              {opt.hit._score?.toFixed(1) ?? "—"}
            </span>
          </div>,
        );
      }
    }

    if (totalHits > options.filter((o) => o.type === "hit").length) {
      const hitCount = options.filter((o) => o.type === "hit").length;
      elements.push(
        <div
          key="footer"
          className="border-t border-gray-200 px-4 py-2 text-center text-xs text-gray-400 dark:border-gray-700"
        >
          + {totalHits - hitCount} more results
        </div>,
      );
    }

    return elements;
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
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => options.length > 0 && setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          onKeyDown={onKeyDown}
          placeholder="Start typing (min 2 chars)..."
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        {showDropdown && options.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {renderItems()}
          </div>
        )}
      </div>
      {error && (
        <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
