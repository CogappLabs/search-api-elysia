import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { serverTiming } from "@elysiajs/server-timing";
import { Elysia, status as httpStatus, t } from "elysia";
import { createCache } from "./cache.ts";
import { loadConfig } from "./config.ts";
import type { SearchEngine } from "./engines/engine.ts";
import { createEngine } from "./engines/index.ts";
import { FieldAliasMap } from "./field-aliases.ts";
import { deriveFromFields } from "./fields.ts";

export { deriveFromFields } from "./fields.ts";

import { indexesRoute } from "./routes/indexes.ts";
import { instantSearchRoutes } from "./routes/instantsearch.ts";
import { searchApiRoutes } from "./routes/search-api.ts";
import type { AppConfig, IndexConfig } from "./types.ts";

let config: AppConfig;
try {
  config = loadConfig();
} catch (err) {
  console.error(err instanceof Error ? err.message : "Failed to load config");
  process.exit(1);
}

const cache = createCache(process.env.REDIS_URL);
if (cache) {
  console.log("Redis cache connected");
} else {
  console.log("Redis cache disabled (no REDIS_URL)");
}

const engines = new Map<string, SearchEngine>();
const configs = new Map<string, IndexConfig>();
const aliasMaps = new Map<string, FieldAliasMap>();
const boostsMaps = new Map<string, Record<string, number>>();
const searchableFieldsMaps = new Map<string, string[]>();

for (const [handle, indexConfig] of Object.entries(config.indexes)) {
  const { aliases, boosts, searchableFields } = deriveFromFields(
    indexConfig.fields,
  );
  engines.set(handle, createEngine(indexConfig));
  configs.set(handle, indexConfig);
  aliasMaps.set(handle, new FieldAliasMap(aliases));
  boostsMaps.set(handle, boosts);
  searchableFieldsMaps.set(handle, searchableFields);
  console.log(
    `Registered index: ${handle} (${indexConfig.engine} → ${indexConfig.indexName})`,
  );
}

const app = new Elysia()
  .use(serverTiming())
  .use(
    openapi({
      documentation: {
        info: {
          title: "Search API",
          version: "1.0.0",
          description:
            "Unified search interface over external search engine indexes",
        },
      },
    }),
  )
  .use(
    cors({
      origin: config.corsOrigins === "*" ? true : (config.corsOrigins ?? false),
    }),
  )
  .mapResponse(({ response, headers, set }) => {
    if (process.env.NODE_ENV !== "production") return;
    const accept = headers["accept-encoding"] ?? "";
    if (!accept.includes("gzip")) return;
    if (response instanceof Response) return;

    const text =
      typeof response === "object"
        ? JSON.stringify(response)
        : String(response ?? "");

    set.headers["Content-Encoding"] = "gzip";
    set.headers["Content-Type"] = "application/json; charset=utf-8";

    return new Response(Bun.gzipSync(new TextEncoder().encode(text)));
  })
  .onError(({ error, set }) => {
    console.error(error);
    set.status = 500;
    return {
      error: "message" in error ? error.message : "Internal server error",
    };
  })
  .get(
    "/health",
    () => ({
      status: "ok",
      cache: cache ? (cache.isConnected ? "connected" : "error") : "disabled",
    }),
    {
      response: {
        200: t.Object({ status: t.String(), cache: t.String() }),
      },
      detail: { summary: "Health check", tags: ["System"] },
    },
  )
  .guard({
    beforeHandle({ headers }) {
      const requiredKey = config.apiKey ?? process.env.API_KEY;
      if (!requiredKey) return;

      const auth = headers.authorization ?? "";
      const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (provided !== requiredKey) {
        return httpStatus(401, { error: "Unauthorized" });
      }
    },
  })
  .post(
    "/cache/clear",
    async () => {
      if (!cache) {
        return { cleared: false, message: "No cache configured" };
      }
      await cache.flush();
      return { cleared: true };
    },
    {
      response: {
        200: t.Object({
          cleared: t.Boolean(),
          message: t.Optional(t.String()),
        }),
      },
      detail: {
        summary: "Clear cache",
        description:
          "Flushes all cached search and mapping responses from Redis. Protected by bearer token auth.",
        tags: ["System"],
      },
    },
  )
  .use(indexesRoute(config))
  .use(
    searchApiRoutes(
      engines,
      configs,
      aliasMaps,
      boostsMaps,
      searchableFieldsMaps,
      cache,
    ),
  )
  .use(
    instantSearchRoutes(
      engines,
      configs,
      aliasMaps,
      boostsMaps,
      searchableFieldsMaps,
    ),
  )
  .listen(config.port);

console.log(`Search API running at http://localhost:${app.server?.port}`);

// Graceful shutdown
let isShuttingDown = false;

function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received, shutting down gracefully...`);
  app.stop();
  console.log("Server stopped");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export type App = typeof app;
