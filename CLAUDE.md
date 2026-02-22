# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                          # run all tests (scoped to test/ via bunfig.toml)
bun test test/config.test.ts      # run a single test file
bun test --watch                  # run tests in watch mode
bunx playwright test              # run Playwright e2e tests (in e2e/)
bunx @biomejs/biome check src/ test/   # lint (biome)
bunx tsc --noEmit                 # type check
bun run build:types               # generate .d.ts declarations to dist/
```

After significant changes, run both: `bunx @biomejs/biome check src/ test/ && bunx tsc --noEmit`

```bash
bun run docs:dev                  # run docs site locally (Astro)
bun run docs:build                # build docs for production
```

```bash
railway service search-api-elysia # link Railway CLI to the service
railway logs                      # view deployment logs
railway status                    # check project/environment/service
```

## Overview

Bun + Elysia search API that provides a unified REST interface over external search engine indexes (Elasticsearch, OpenSearch, and Meilisearch). Configuration is YAML-driven — each configured index gets its own set of routes under `/:handle/`.

## Architecture

**Engine abstraction** (`src/engines/`): `SearchEngine` interface in `engine.ts` defines `search()`, `getDocument()`, `searchFacetValues()`, `getMapping()`, and `rawQuery()`. Three engines are implemented:

- `ElasticsearchEngine` and `OpenSearchEngine` both extend `ElasticCompatEngine` (shared base class in `elastic-compat.ts`) — identical query DSL, subclasses only differ in client construction and response unwrapping (ES v8 returns body directly, OpenSearch wraps in `.body`).
- `MeilisearchEngine` implements `SearchEngine` directly — fundamentally different API (string-based filters, `facetDistribution` for facets, `_formatted` for highlights). Does not support histogram, geoGrid, or suggest (returns empty defaults). Boosts/searchableFields are managed at Meilisearch index level, not per-query. Multi-index arrays are rejected at construction time.

New engines are registered in the factory map in `engines/index.ts`. See `docs/src/content/docs/guides/adding-an-engine.mdx` for the full guide.

**Routes as Elysia plugins** (`src/routes/`): Route files export factory functions that accept runtime dependencies (engine map, config map, alias maps, boosts maps, searchable fields maps) and return Elysia plugin instances. `search-api.ts` has the main endpoints (search, autocomplete, documents, facets). `indexes.ts` lists configured indexes.

**Config loading** (`src/config.ts`): Reads `config.yaml`, interpolates `${ENV_VAR}` references, validates against TypeBox schemas. Copy `config.example.yaml` to get started. JSON schema at `schemas/config.schema.json` provides editor autocompletion (VS Code picks this up via `.vscode/settings.json`).

**Unified fields config** (`fields` in config.yaml): Field weights, searchability, and aliases are all defined under a single `fields` key per index. At startup, `deriveFromFields()` in `src/index.ts` splits this into three derived maps:
- `aliases` — fields with `esField` (fed to `FieldAliasMap`)
- `boosts` — fields with `weight` (keyed by ES field name, passed to routes)
- `searchableFields` — fields with `searchable: true` but no `weight` (ES field names)

These derived maps are passed to `searchApiRoutes()` alongside the engine and config maps. The `weight` property implies searchable — setting both `weight` and `searchable` on a field will only use `weight`.

**Validation** (`src/validation.ts`): `parseJsonParam()` helper parses JSON query string params (sort, filters, boosts, histogram, geoGrid) and validates them against TypeBox schemas, returning typed data or error messages.

**Geo utilities** (`src/geo.ts`): `geotileToLatLng()` converts ES geotile grid keys (`zoom/x/y`) to lat/lng centroids via Web Mercator tile math.

**Field aliases** (`src/field-aliases.ts`): `FieldAliasMap` class provides bidirectional alias↔field name translation. Used at the route layer — inbound params are translated before the engine call, outbound response keys are translated back. Zero-overhead passthrough when no aliases are configured. Duplicate `esField` targets are rejected at startup. The `esField` config key name is ES-specific but the alias mechanism works identically for all engines.

**Request flow**: `src/index.ts` loads config → calls `deriveFromFields()` per index → creates engine instances, `FieldAliasMap` instances, and derived boost/searchable maps → mounts routes → applies bearer token auth (optional), CORS, and error handling as Elysia middleware.

**CORS**: Controlled via `corsOrigins` in config. When omitted, CORS is disabled (`false`). Set `"*"` to allow all origins, or an array for specific origins. Docs demos need CORS enabled for the docs dev server origin.

**Eden Treaty client** (`src/index.ts`): Exports `type App = typeof app` so external TypeScript projects can get a fully typed client via `@elysiajs/eden`. Declarations are generated to `dist/` by `bun run build:types` (runs `tsc -p tsconfig.build.json`). The lefthook pre-commit hook regenerates and stages `dist/` automatically. Consumers install via `bun add github:CogappLabs/search-api-elysia @elysiajs/eden` and import as `search-api-bun`. Requires `moduleResolution: "bundler"` (not `nodenext` — the `.d.ts` files contain `.ts` extension imports).

**Deployment**: Railway deploys from `main` automatically. Uses `bun install --frozen-lockfile` so `bun.lock` must be committed and in sync with `package.json`. After changing dependencies, always run `bun install` and commit the updated lockfile.

## Conventions

- Biome for linting/formatting with **2-space indentation**
- TypeBox schemas (via Elysia's `t`) for both config validation and OpenAPI response types
- Tests use `bun:test` with mock engines — routes are tested by constructing Elysia apps with `app.handle(new Request(...))`, no HTTP server needed
- All shared types live in `src/types.ts`
- Scripts for ad-hoc testing go in `scripts/`
- Docs site is Astro + Starlight in `docs/` — deployed to GitHub Pages via `.github/workflows/docs.yml`
- Docs use `base: "/search-api-elysia"` — use relative links in mdx content, `import.meta.env.BASE_URL` in React components
- Interactive demos in `docs/src/components/` require a running API with CORS enabled for the docs origin
