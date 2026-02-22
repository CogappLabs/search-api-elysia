import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import {
  BoostsSchema,
  FacetFiltersSchema,
  FiltersSchema,
  HistogramSchema,
  parseJsonParam,
  SortSchema,
} from "../src/validation.ts";

describe("parseJsonParam", () => {
  it("returns parsed data for valid JSON matching schema", () => {
    const result = parseJsonParam('{"title":"asc"}', SortSchema, "sort");
    expect(result).toEqual({ data: { title: "asc" } });
  });

  it("returns error for invalid JSON", () => {
    const result = parseJsonParam("{bad json", SortSchema, "sort");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Invalid JSON");
      expect(result.error).toContain("sort");
    }
  });

  it("returns error for valid JSON that fails schema validation", () => {
    const result = parseJsonParam('{"title":"sideways"}', SortSchema, "sort");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("sort");
    }
  });
});

describe("SortSchema", () => {
  it("accepts valid sort values", () => {
    expect(Value.Check(SortSchema, { title: "asc" })).toBe(true);
    expect(Value.Check(SortSchema, { date: "desc" })).toBe(true);
    expect(Value.Check(SortSchema, { title: "asc", date: "desc" })).toBe(true);
  });

  it("rejects invalid sort directions", () => {
    expect(Value.Check(SortSchema, { title: "up" })).toBe(false);
  });
});

describe("FiltersSchema", () => {
  it("accepts string filter values", () => {
    expect(Value.Check(FiltersSchema, { category: "painting" })).toBe(true);
  });

  it("accepts array filter values", () => {
    expect(
      Value.Check(FiltersSchema, { category: ["painting", "sculpture"] }),
    ).toBe(true);
  });

  it("accepts range filter values", () => {
    expect(Value.Check(FiltersSchema, { year: { min: 1800, max: 1900 } })).toBe(
      true,
    );
  });

  it("accepts partial range filters", () => {
    expect(Value.Check(FiltersSchema, { year: { min: 1800 } })).toBe(true);
  });

  it("accepts boolean filter values", () => {
    expect(Value.Check(FiltersSchema, { has_image: true })).toBe(true);
    expect(Value.Check(FiltersSchema, { has_image: false })).toBe(true);
  });

  it("accepts mixed filter types including booleans", () => {
    expect(
      Value.Check(FiltersSchema, {
        category: "painting",
        has_image: true,
        year: { min: 1800 },
      }),
    ).toBe(true);
  });
});

describe("BoostsSchema", () => {
  it("accepts valid boost values", () => {
    expect(Value.Check(BoostsSchema, { title: 10 })).toBe(true);
    expect(Value.Check(BoostsSchema, { title: 10, description: 2 })).toBe(true);
    expect(Value.Check(BoostsSchema, { title: 0 })).toBe(true);
    expect(Value.Check(BoostsSchema, { title: 1.5 })).toBe(true);
  });

  it("rejects non-numeric values", () => {
    expect(Value.Check(BoostsSchema, { title: "high" })).toBe(false);
  });

  it("rejects negative values", () => {
    expect(Value.Check(BoostsSchema, { title: -1 })).toBe(false);
  });
});

describe("HistogramSchema", () => {
  it("accepts valid histogram values", () => {
    expect(Value.Check(HistogramSchema, { population: 1000 })).toBe(true);
    expect(
      Value.Check(HistogramSchema, { population: 1000, elevation: 100 }),
    ).toBe(true);
    expect(Value.Check(HistogramSchema, { year: 1 })).toBe(true);
  });

  it("rejects non-numeric values", () => {
    expect(Value.Check(HistogramSchema, { population: "big" })).toBe(false);
  });

  it("rejects zero or negative intervals", () => {
    expect(Value.Check(HistogramSchema, { population: 0 })).toBe(false);
    expect(Value.Check(HistogramSchema, { population: -10 })).toBe(false);
  });
});

describe("FacetFiltersSchema", () => {
  it("accepts string and array values", () => {
    expect(
      Value.Check(FacetFiltersSchema, {
        category: "painting",
        period: ["modern", "renaissance"],
      }),
    ).toBe(true);
  });

  it("rejects range filters", () => {
    expect(Value.Check(FacetFiltersSchema, { year: { min: 1800 } })).toBe(
      false,
    );
  });
});
