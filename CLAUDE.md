# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun test                          # run all tests
bun test test/config.test.ts      # run a single test file
bun test --watch                  # run tests in watch mode
bunx @biomejs/biome check src/ test/   # lint (biome)
bunx tsc --noEmit                 # type check
```

After significant changes, run both: `bunx @biomejs/biome check src/ test/ && bunx tsc --noEmit`

```bash
bun run docs:dev                  # run docs site locally (Astro)
bun run docs:build                # build docs for production
```

## Overview

Bun + Elysia search API that provides a unified REST interface over external search engine indexes (currently Elasticsearch). Configuration is YAML-driven — each configured index gets its own set of routes under `/:handle/`.

## Architecture

**Engine abstraction** (`src/engines/`): `SearchEngine` interface in `engine.ts` defines `search()`, `getDocument()`, `searchFacetValues()`, `getMapping()`, and `rawQuery()`. `ElasticsearchEngine` implements it. New engines are registered in the factory map in `engines/index.ts`. See `docs/src/content/docs/guides/adding-an-engine.mdx` for the full guide.

**Routes as Elysia plugins** (`src/routes/`): Route files export factory functions that accept runtime dependencies (engine map, config map, alias maps, boosts maps, searchable fields maps) and return Elysia plugin instances. `search-api.ts` has the main endpoints (search, autocomplete, documents, facets). `indexes.ts` lists configured indexes.

**Config loading** (`src/config.ts`): Reads `config.yaml`, interpolates `${ENV_VAR}` references, validates against TypeBox schemas. Copy `config.example.yaml` to get started. JSON schema at `schemas/config.schema.json` provides editor autocompletion (VS Code picks this up via `.vscode/settings.json`).

**Unified fields config** (`fields` in config.yaml): Field weights, searchability, and aliases are all defined under a single `fields` key per index. At startup, `deriveFromFields()` in `src/index.ts` splits this into three derived maps:
- `aliases` — fields with `esField` (fed to `FieldAliasMap`)
- `boosts` — fields with `weight` (keyed by ES field name, passed to routes)
- `searchableFields` — fields with `searchable: true` but no `weight` (ES field names)

These derived maps are passed to `searchApiRoutes()` alongside the engine and config maps. The `weight` property implies searchable — setting both `weight` and `searchable` on a field will only use `weight`.

**Validation** (`src/validation.ts`): `parseJsonParam()` helper parses JSON query string params (sort, filters, boosts, histogram, geoGrid) and validates them against TypeBox schemas, returning typed data or error messages.

**Geo utilities** (`src/geo.ts`): `geotileToLatLng()` converts ES geotile grid keys (`zoom/x/y`) to lat/lng centroids via Web Mercator tile math.

**Field aliases** (`src/field-aliases.ts`): `FieldAliasMap` class provides bidirectional alias↔ES field name translation. Used at the route layer — inbound params are translated to ES names before the engine call, outbound response keys are translated back. Zero-overhead passthrough when no aliases are configured. Duplicate `esField` targets are rejected at startup.

**Request flow**: `src/index.ts` loads config → calls `deriveFromFields()` per index → creates engine instances, `FieldAliasMap` instances, and derived boost/searchable maps → mounts routes → applies bearer token auth (optional), CORS, and error handling as Elysia middleware.

**CORS**: Controlled via `corsOrigins` in config. When omitted, CORS is disabled (`false`). Set `"*"` to allow all origins, or an array for specific origins. Docs demos need CORS enabled for the docs dev server origin.

## Conventions

- Biome for linting/formatting with **2-space indentation**
- TypeBox schemas (via Elysia's `t`) for both config validation and OpenAPI response types
- Tests use `bun:test` with mock engines — routes are tested by constructing Elysia apps with `app.handle(new Request(...))`, no HTTP server needed
- All shared types live in `src/types.ts`
- Scripts for ad-hoc testing go in `scripts/`
- Docs site is Astro + Starlight in `docs/` — deployed to GitHub Pages via `.github/workflows/docs.yml`
- Docs use `base: "/search-api-elysia"` — use relative links in mdx content, `import.meta.env.BASE_URL` in React components
- Interactive demos in `docs/src/components/` require a running API with CORS enabled for the docs origin
