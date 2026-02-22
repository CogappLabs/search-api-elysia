import { useCallback, useRef, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import { searchApi } from "./shared";

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

export default function MappingDemo() {
  const stored = loadConfig();
  const [endpoint, setEndpoint] = useState(
    stored.endpoint ?? "http://localhost:3000",
  );
  const [index, setIndex] = useState(
    stored.index ?? "craft_search_plugin_labs",
  );
  const [token, setToken] = useState(stored.token ?? "");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
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

  const fetchMapping = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError("");
    searchApi<Record<string, unknown>>(
      endpoint,
      index,
      "mapping",
      {},
      ctrl.signal,
      token || undefined,
    )
      .then((data) => setResult(data))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
        setResult(null);
      });
  }, [endpoint, index, token]);

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
      <button
        type="button"
        onClick={fetchMapping}
        className="mb-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        Fetch mapping
      </button>
      {error && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}
      {result && (
        <pre className="max-h-96 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
