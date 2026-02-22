import { describe, expect, it } from "bun:test";
import { geotileToLatLng } from "../src/geo.ts";

describe("geotileToLatLng", () => {
  it("converts zoom 0 tile to world center", () => {
    const result = geotileToLatLng("0/0/0");
    expect(result.lat).toBeCloseTo(0, 0);
    expect(result.lng).toBeCloseTo(0, 0);
  });

  it("converts a known tile at zoom 1", () => {
    // Tile 1/0/0 = top-left quadrant
    const result = geotileToLatLng("1/0/0");
    expect(result.lng).toBeCloseTo(-90, 0);
    expect(result.lat).toBeGreaterThan(0);
  });

  it("converts a known tile at zoom 6", () => {
    // Tile 6/31/21 is roughly over the UK
    const result = geotileToLatLng("6/31/21");
    expect(result.lat).toBeGreaterThan(50);
    expect(result.lat).toBeLessThan(56);
    expect(result.lng).toBeGreaterThan(-6);
    expect(result.lng).toBeLessThan(0);
  });

  it("returns different coordinates for different tiles", () => {
    const a = geotileToLatLng("6/31/21");
    const b = geotileToLatLng("6/32/22");
    expect(a.lat).not.toBeCloseTo(b.lat, 1);
    expect(a.lng).not.toBeCloseTo(b.lng, 1);
  });
});
