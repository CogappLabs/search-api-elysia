import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia, status as httpStatus, t } from "elysia";
import { createCache } from "./cache.ts";
import { loadConfig } from "./config.ts";
import type { SearchEngine } from "./engines/engine.ts";
import { createEngine } from "./engines/index.ts";
import { FieldAliasMap } from "./field-aliases.ts";
import { indexesRoute } from "./routes/indexes.ts";
import { searchApiRoutes } from "./routes/search-api.ts";
import type { AppConfig, FieldConfig, IndexConfig } from "./types.ts";

export function deriveFromFields(fields?: Record<string, FieldConfig>) {
  const aliases: Record<string, string> = {};
  const boosts: Record<string, number> = {};
  const searchableFields: string[] = [];

  if (!fields) return { aliases, boosts, searchableFields };

  const seenEsFields = new Map<string, string>();
  for (const [name, cfg] of Object.entries(fields)) {
    const esName = cfg.esField ?? name;

    if (cfg.esField) {
      const existing = seenEsFields.get(cfg.esField);
      if (existing) {
        throw new Error(
          `Fields "${existing}" and "${name}" both map to ES field "${cfg.esField}"`,
        );
      }
      seenEsFields.set(cfg.esField, name);
      aliases[name] = cfg.esField;
    }

    if (cfg.weight !== undefined) {
      boosts[esName] = cfg.weight;
    } else if (cfg.searchable) {
      searchableFields.push(esName);
    }
  }

  return { aliases, boosts, searchableFields };
}

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
  .onBeforeHandle(({ headers, path }) => {
    if (path === "/health" || path === "/openapi" || path === "/openapi/json")
      return;

    const requiredKey = config.apiKey ?? process.env.API_KEY;
    if (!requiredKey) return;

    const auth = headers.authorization ?? "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (provided !== requiredKey) {
      return httpStatus(401, { error: "Unauthorized" });
    }
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
  .listen(config.port);

console.log(`Search API running at http://localhost:${app.server?.port}`);
