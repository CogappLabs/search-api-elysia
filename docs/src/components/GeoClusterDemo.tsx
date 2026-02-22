import { Marker, Overlay, Map as PigeonMap, ZoomControl } from "pigeon-maps";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import type { SearchHit, SearchResult } from "./shared";
import { searchApi } from "./shared";

const STORAGE_KEY = "search-api-demo";
const GEO_FIELD = "placeCoordinates";
const DEFAULT_CENTER: [number, number] = [54.0, -2.0];
const DEFAULT_ZOOM = 6;

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

function getCoords(hit: SearchHit): [number, number] | null {
  const val = hit[GEO_FIELD];
  if (!val) return null;
  if (
    typeof val === "object" &&
    "lat" in (val as Record<string, unknown>) &&
    "lon" in (val as Record<string, unknown>)
  ) {
    const obj = val as { lat: number; lon: number };
    return [obj.lat, obj.lon];
  }
  if (typeof val === "string") {
    const [lat, lon] = val.split(",").map(Number);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) return [lat, lon];
  }
  return null;
}

export default function GeoClusterDemo() {
  const stored = loadConfig();
  const [endpoint, setEndpoint] = useState(
    stored.endpoint ?? "https://search-api-elysia-production.up.railway.app",
  );
  const [index, setIndex] = useState(
    stored.index ?? "craft_search_plugin_labs",
  );
  const [token, setToken] = useState(stored.token ?? "");
  const [query, setQuery] = useState("");
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [error, setError] = useState("");
  const [selectedHit, setSelectedHit] = useState<SearchHit | null>(null);
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

  const fetchHits = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError("");

    searchApi<SearchResult>(
      endpoint,
      index,
      "search",
      { q: query, perPage: "200" },
      ctrl.signal,
      token || undefined,
    )
      .then((data) => {
        setHits(data.hits);
        setTotalHits(data.totalHits);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message);
      });
  }, [endpoint, index, token, query]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchHits(), 300);
  }, [fetchHits]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const pins = hits
    .map((hit) => ({ hit, coords: getCoords(hit) }))
    .filter(
      (p): p is { hit: SearchHit; coords: [number, number] } =>
        p.coords !== null,
    );

  const selectedCoords = selectedHit ? getCoords(selectedHit) : null;

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
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by search query..."
        className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
      {error && (
        <p className="mb-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}
      <p className="mb-2 text-sm text-gray-500">
        {pins.length} pin{pins.length !== 1 ? "s" : ""} &middot; {totalHits}{" "}
        total result{totalHits !== 1 ? "s" : ""}
      </p>
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <PigeonMap
          center={center}
          zoom={zoom}
          minZoom={3}
          maxZoom={18}
          height={400}
          onBoundsChanged={({ center: c, zoom: z }) => {
            setCenter(c);
            setZoom(z);
          }}
          onClick={() => setSelectedHit(null)}
        >
          <ZoomControl />
          {pins.map(({ hit, coords }) => (
            <Marker
              key={hit.objectID}
              anchor={coords}
              color="#3b82f6"
              width={32}
              onClick={() =>
                setSelectedHit(
                  selectedHit?.objectID === hit.objectID ? null : hit,
                )
              }
            />
          ))}
          {selectedHit && selectedCoords && (
            <Overlay anchor={selectedCoords} offset={[110, 40]}>
              <div className="w-56 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {(selectedHit.title as string) ?? selectedHit.objectID}
                </p>
              </div>
            </Overlay>
          )}
        </PigeonMap>
      </div>
    </div>
  );
}
