# Search API

A unified REST search interface over Elasticsearch indexes, built with [Bun](https://bun.sh) and [Elysia](https://elysiajs.com).

**[Documentation](https://cogapplabs.github.io/search-api-elysia/)**

## Features

- Search, autocomplete, facets, documents, histograms, and geo grid endpoints
- Unified field configuration (boost weights, searchable fields, field aliases)
- YAML-driven config with environment variable interpolation
- Bearer token authentication and CORS
- Multi-index search support

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
```
