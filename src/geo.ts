/** Convert a geotile grid key ("zoom/x/y") to the tile centroid lat/lng. */
export function geotileToLatLng(key: string): { lat: number; lng: number } {
  const parts = key.split("/").map(Number);
  const zoom = parts[0] ?? 0;
  const x = parts[1] ?? 0;
  const y = parts[2] ?? 0;
  const n = 2 ** zoom;
  // Centre of tile: add 0.5 to get the midpoint
  const lng = ((x + 0.5) / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n)));
  const lat = (latRad * 180) / Math.PI;
  return { lat, lng };
}
