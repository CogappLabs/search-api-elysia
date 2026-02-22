import { Marker, Overlay, Map as PigeonMap, ZoomControl } from "pigeon-maps";
import { useCallback, useEffect, useState } from "react";
import { ApiConfig } from "./ApiConfig";
import type { SearchHit, SearchResult } from "./shared";
import { INPUT_CLASS, searchApi, useAbortRef, useApiConfig } from "./shared";
import { ErrorAlert } from "./shared-ui";

const GEO_FIELD = "placeCoordinates";
const DEFAULT_CENTER: [number, number] = [54.0, -2.0];
const DEFAULT_ZOOM = 6;

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
  const { endpoint, index, token, configProps } = useApiConfig();
  const [query, setQuery] = useState("");
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [error, setError] = useState("");
  const [selectedHit, setSelectedHit] = useState<SearchHit | null>(null);
  const newController = useAbortRef();

  const fetchHits = useCallback(() => {
    const ctrl = newController();
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
  }, [endpoint, index, token, query, newController]);

  useEffect(() => {
    const t = setTimeout(() => fetchHits(), 300);
    return () => clearTimeout(t);
  }, [fetchHits]);

  const pins = hits
    .map((hit) => ({ hit, coords: getCoords(hit) }))
    .filter(
      (p): p is { hit: SearchHit; coords: [number, number] } =>
        p.coords !== null,
    );

  const selectedCoords = selectedHit ? getCoords(selectedHit) : null;

  return (
    <div className="not-content mt-8">
      <ApiConfig {...configProps} />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by search query..."
        className={`mb-4 w-full ${INPUT_CLASS}`}
      />
      <ErrorAlert error={error} />
      <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
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
