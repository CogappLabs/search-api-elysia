import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { t } from "elysia";

const RangeFilterSchema = t.Object({
  min: t.Optional(t.Number()),
  max: t.Optional(t.Number()),
});

export const SortSchema = t.Record(
  t.String(),
  t.Union([t.Literal("asc"), t.Literal("desc")]),
);

export const FiltersSchema = t.Record(
  t.String(),
  t.Union([t.String(), t.Array(t.String()), t.Boolean(), RangeFilterSchema]),
);

export const FacetFiltersSchema = t.Record(
  t.String(),
  t.Union([t.String(), t.Array(t.String())]),
);

export const BoostsSchema = t.Record(t.String(), t.Number({ minimum: 0 }));

export const HistogramSchema = t.Record(t.String(), t.Number({ minimum: 1 }));

const GeoPointSchema = t.Object({
  lat: t.Number(),
  lon: t.Number(),
});

export const GeoGridSchema = t.Object({
  field: t.String(),
  precision: t.Integer({ minimum: 1, maximum: 29 }),
  bounds: t.Object({
    top_left: GeoPointSchema,
    bottom_right: GeoPointSchema,
  }),
});

/** Parse a JSON query param, returning the parsed value or an error message. */
export function parseJsonParam<T extends TSchema>(
  raw: string,
  schema: T,
  paramName: string,
): { data: Static<T> } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: `Invalid JSON in '${paramName}' parameter` };
  }
  if (!Value.Check(schema, parsed)) {
    const errors = [...Value.Errors(schema, parsed)];
    const message =
      errors.length > 0
        ? errors.map((e) => e.message).join("; ")
        : "validation failed";
    return { error: `Invalid '${paramName}' format: ${message}` };
  }
  return { data: parsed as Static<T> };
}
