import { useCallback, useMemo, useRef, useState } from "react";
import {
  ClearRefinements,
  CurrentRefinements,
  Highlight,
  Hits,
  HitsPerPage,
  InstantSearch,
  Pagination,
  RefinementList,
  SearchBox,
  Stats,
} from "react-instantsearch";
import { ApiConfig } from "./ApiConfig";
import { DEFAULT_ENDPOINT } from "./shared";

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

const EMPTY_RESULT = {
  hits: [],
  nbHits: 0,
  nbPages: 0,
  page: 0,
  hitsPerPage: 20,
  facets: {},
  processingTimeMS: 0,
  query: "",
  exhaustiveNbHits: true,
};

function createSearchClient(
  endpoint: string,
  index: string,
  token: string | undefined,
  onError: (msg: string) => void,
) {
  return {
    search(
      requests: Array<{
        indexName: string;
        params: Record<string, unknown>;
      }>,
    ) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      return fetch(`${endpoint}/${index}/instantsearch`, {
        method: "POST",
        headers,
        body: JSON.stringify({ requests }),
      })
        .then((res) => {
          if (!res.ok) {
            return res.text().then((text) => {
              const msg = `${res.status} ${res.statusText}${text ? `: ${text}` : ""}`;
              onError(msg);
              return { results: requests.map(() => EMPTY_RESULT) };
            });
          }
          onError("");
          return res.json();
        })
        .catch((err) => {
          onError(err.message || "Network error");
          return { results: requests.map(() => EMPTY_RESULT) };
        });
    },
  };
}

function Hit({ hit }: { hit: Record<string, unknown> }) {
  const title =
    (hit.title as string) ?? (hit.name as string) ?? String(hit.objectID);

  const description =
    (hit.placeDescription as string) ??
    (hit.description as string) ??
    (hit.body as string) ??
    "";

  const hasHighlight =
    hit._highlightResult &&
    typeof hit._highlightResult === "object" &&
    "title" in (hit._highlightResult as Record<string, unknown>);

  return (
    <article className="rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800/50">
      <p className="font-medium text-gray-900 dark:text-gray-100">
        {hasHighlight ? (
          <Highlight attribute="title" hit={hit as never} />
        ) : (
          title
        )}
      </p>
      {description && (
        <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
          {description}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {hit.objectID as string}
      </p>
    </article>
  );
}

export default function InstantSearchDemo() {
  const stored = loadConfig();
  const [endpoint, setEndpoint] = useState(stored.endpoint ?? DEFAULT_ENDPOINT);
  const [index, setIndex] = useState(
    stored.index ?? "craft_search_plugin_labs",
  );
  const [token, setToken] = useState(stored.token ?? "");
  const [facetField, setFacetField] = useState(stored.facetField ?? "country");
  const [error, setError] = useState("");

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

  const errorRef = useRef(setError);
  errorRef.current = setError;

  const onError = useCallback((msg: string) => {
    errorRef.current(msg);
  }, []);

  const searchClient = useMemo(
    () => createSearchClient(endpoint, index, token || undefined, onError),
    [endpoint, index, token, onError],
  );

  const facetHeadingId = "facet-heading";
  const labelHitsPerPage = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const apply = () => {
      const select = node.querySelector("select");
      if (select) {
        select.setAttribute("aria-label", "Results per page");
        return true;
      }
      return false;
    };
    if (apply()) return;
    // Widget may render async — observe for the select to appear
    const observer = new MutationObserver(() => {
      if (apply()) observer.disconnect();
    });
    observer.observe(node, { childList: true, subtree: true });
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

      <div className="mb-4">
        <label className="flex flex-col gap-1 text-xs text-gray-700 dark:text-gray-300">
          <span>
            Facet field (optional, e.g.{" "}
            <code className="rounded bg-gray-200 px-1 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              country
            </code>
            )
          </span>
          <input
            type="text"
            value={facetField}
            onChange={(e) => setFacetField(e.target.value)}
            placeholder="e.g. country"
            className="w-64 rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <InstantSearch searchClient={searchClient as never} indexName={index}>
        <SearchBox
          placeholder="Search..."
          classNames={{
            root: "mb-4",
            form: "relative",
            input:
              "w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-blue-500 dark:focus:ring-blue-500",
            submit: "absolute top-1/2 right-3 -translate-y-1/2 text-gray-500",
            submitIcon: "w-4 h-4",
            reset: "hidden",
            loadingIndicator: "hidden",
          }}
        />

        <div className="mb-3 flex items-center justify-between">
          <Stats
            classNames={{
              root: "text-sm text-gray-600 dark:text-gray-300",
            }}
          />
          <div ref={labelHitsPerPage}>
            <HitsPerPage
              items={[
                { label: "10 per page", value: 10, default: true },
                { label: "20 per page", value: 20 },
                { label: "50 per page", value: 50 },
              ]}
              classNames={{
                root: "",
                select:
                  "rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300",
              }}
            />
          </div>
        </div>

        {facetField && (
          <div className="mb-3 flex items-center gap-3">
            <CurrentRefinements
              classNames={{
                root: "flex-1",
                list: "flex flex-wrap gap-1.5",
                item: "flex flex-wrap items-center gap-1",
                label: "text-xs text-gray-600 dark:text-gray-300",
                category:
                  "inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                delete:
                  "ml-0.5 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200",
              }}
            />
            <ClearRefinements
              classNames={{
                root: "",
                button:
                  "rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100",
                disabledButton: "hidden",
              }}
              translations={{ resetButtonText: "Clear all" }}
            />
          </div>
        )}

        <div className={facetField ? "flex gap-6" : ""}>
          {facetField && (
            <nav aria-labelledby={facetHeadingId} className="w-48 shrink-0">
              <h3
                id={facetHeadingId}
                className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {facetField}
              </h3>
              <RefinementList
                attribute={facetField}
                classNames={{
                  root: "text-sm",
                  list: "space-y-1",
                  item: "flex items-center gap-2",
                  selectedItem: "font-semibold",
                  label: "flex items-center gap-2 cursor-pointer",
                  checkbox:
                    "rounded border-gray-300 focus:ring-2 focus:ring-blue-400 dark:border-gray-600",
                  labelText: "text-gray-700 dark:text-gray-300",
                  count:
                    "ml-auto rounded-full bg-gray-200 px-1.5 py-0.5 text-xs tabular-nums text-gray-600 dark:bg-gray-700 dark:text-gray-300",
                }}
              />
            </nav>
          )}

          <div className="min-w-0 flex-1">
            <Hits
              hitComponent={Hit}
              classNames={{
                root: "",
                list: "space-y-2",
                item: "list-none",
              }}
            />

            <Pagination
              classNames={{
                root: "mt-6",
                list: "flex items-center gap-1",
                item: "",
                selectedItem:
                  "[&>a]:bg-blue-500 [&>a]:text-white [&>a]:border-blue-500 [&>a]:font-semibold",
                disabledItem: "opacity-40 pointer-events-none",
                link: "block rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700",
              }}
            />
          </div>
        </div>
      </InstantSearch>
    </div>
  );
}
