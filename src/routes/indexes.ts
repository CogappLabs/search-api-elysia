import { Elysia, t } from "elysia";
import type { AppConfig } from "../types.ts";

export function indexesRoute(config: AppConfig) {
  return new Elysia({ name: "routes.indexes" }).get(
    "/indexes",
    () => {
      const indexes = Object.entries(config.indexes).map(
        ([handle, indexConfig]) => ({
          handle,
          engine: indexConfig.engine,
        }),
      );
      return { indexes };
    },
    {
      response: {
        200: t.Object(
          {
            indexes: t.Array(
              t.Object({
                handle: t.String({
                  description: "URL-safe handle used in API paths",
                  examples: ["craft_search_plugin_labs"],
                }),
                engine: t.String({
                  description: "Search engine type",
                  examples: ["elasticsearch"],
                }),
              }),
            ),
          },
          {
            description: "List of configured indexes with their engine types",
          },
        ),
      },
      detail: {
        summary: "List indexes",
        description: [
          "List all configured search index handles and their engine types. Use the handle value in other API paths.",
          "",
          "**Example:**",
          "- `GET /indexes` — returns all configured indexes",
        ].join("\n"),
        tags: ["Indexes"],
      },
    },
  );
}
