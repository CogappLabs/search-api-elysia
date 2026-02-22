# Search API

[![Deploy docs to GitHub Pages](https://github.com/CogappLabs/search-api-elysia/actions/workflows/docs.yml/badge.svg)](https://github.com/CogappLabs/search-api-elysia/actions/workflows/docs.yml)

A unified REST search interface over Elasticsearch, OpenSearch, and Meilisearch indexes, built with [Bun](https://bun.sh) and [Elysia](https://elysiajs.com).

**[Documentation](https://cogapplabs.github.io/search-api-elysia/)**

## Why an API layer?

Talking directly to Elasticsearch from a frontend means every project needs to learn the query DSL, handle auth, and deal with engine-specific response formats. A thin API layer solves this:

- **Common interface across projects** — define an index in YAML and every project gets the same REST endpoints with the same response shapes.
- **No search-engine expertise required** — frontend developers call simple query-string endpoints instead of constructing Elasticsearch JSON queries.
- **Easy frontend wiring** — returns flat, predictable JSON designed for UI consumption. Works with InstantSearch.js, React, or a plain `fetch` call.
- **Security** — credentials stay server-side; clients never touch the search engine directly.
- **Swap engines without changing clients** — migrating from Elasticsearch to Meilisearch is a config change, not a rewrite.

## Features

- Multiple search engine backends: Elasticsearch, OpenSearch, Meilisearch
- Search, autocomplete, facets, documents, histograms, and geo grid endpoints
- Unified field configuration (boost weights, searchable fields, field aliases)
- YAML-driven config with environment variable interpolation
- Bearer token authentication and CORS
- Multi-index search support (Elasticsearch, OpenSearch)

## Quick start

```bash
cp config.example.yaml config.yaml   # edit with your Elasticsearch details
bun install
bun run dev
```

See the [Getting Started](https://cogapplabs.github.io/search-api-elysia/guides/getting-started/) guide for full setup instructions.

## Development

```bash
bun test                                    # run tests
bunx @biomejs/biome check src/ test/        # lint
bunx tsc --noEmit                           # type check
bun run docs:dev                            # run docs site locally
bun run docs:build                          # build docs for production
```

## CORS

CORS is disabled by default. Add `corsOrigins` to your `config.yaml` to allow cross-origin requests:

```yaml
# Allow all origins
corsOrigins: "*"

# Or allow specific origins
corsOrigins:
  - http://localhost:4321
  - https://example.com
```
