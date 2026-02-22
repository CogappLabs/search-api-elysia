import { Elysia, status, t } from "elysia";
import type { SearchEngine } from "../engines/engine.ts";
import { FieldAliasMap } from "../field-aliases.ts";
import {
  fromSearchResult,
  type InstantSearchRequest,
  toSearchOptions,
} from "../instantsearch.ts";
import { models } from "../models.ts";
import type { IndexConfig } from "../types.ts";

const noAliases = new FieldAliasMap();

const InstantSearchRequestSchema = t.Object({
  requests: t.Array(
    t.Object({
      indexName: t.Optional(t.String()),
      query: t.Optional(t.String()),
      params: t.Optional(
        t.Object({
          query: t.Optional(t.String()),
          page: t.Optional(t.Number()),
          hitsPerPage: t.Optional(t.Number()),
          facets: t.Optional(t.Union([t.Array(t.String()), t.String()])),
          facetFilters: t.Optional(
            t.Array(t.Union([t.String(), t.Array(t.String())])),
          ),
          numericFilters: t.Optional(t.Array(t.String())),
          attributesToRetrieve: t.Optional(t.Array(t.String())),
          highlightPreTag: t.Optional(t.String()),
          highlightPostTag: t.Optional(t.String()),
        }),
      ),
    }),
  ),
});

export function instantSearchRoutes(
  engines: Map<string, SearchEngine>,
  configs: Map<string, IndexConfig>,
  aliasMaps?: Map<string, FieldAliasMap>,
  boostsMaps?: Map<string, Record<string, number>>,
  searchableFieldsMaps?: Map<string, string[]>,
) {
  return new Elysia({ name: "routes.instantsearch" })
    .use(models)
    .resolve(({ params }) => {
      const handle = (params as Record<string, string>).handle ?? "";
      return {
        engine: engines.get(handle),
        indexConfig: configs.get(handle),
        aliasMap: aliasMaps?.get(handle) ?? noAliases,
        configBoosts: boostsMaps?.get(handle) ?? {},
        configSearchableFields: searchableFieldsMaps?.get(handle) ?? [],
      };
    })
    .post(
      "/:handle/instantsearch",
      async ({
        engine,
        indexConfig,
        aliasMap,
        configBoosts,
        configSearchableFields,
        params,
        body,
      }) => {
        if (!engine || !indexConfig) {
          return status(404, {
            error: `Index "${params.handle}" not found`,
          });
        }

        const defaults = indexConfig.defaults ?? {};

        const results = await Promise.all(
          body.requests.map(async (req: InstantSearchRequest) => {
            const start = performance.now();
            const query = req.params?.query ?? req.query ?? "";

            const options = toSearchOptions(req, defaults.facets);

            // Apply config boosts when not overridden by request
            if (configBoosts && Object.keys(configBoosts).length > 0) {
              options.boosts = configBoosts;
            }

            // Apply searchableFields when no boosts
            if (
              !options.boosts &&
              configSearchableFields &&
              configSearchableFields.length > 0
            ) {
              options.searchableFields = configSearchableFields;
            }

            // Inbound alias translation
            if (aliasMap.hasAliases) {
              if (options.facets)
                options.facets = aliasMap.arrayToEs(options.facets);
              if (options.filters)
                options.filters = aliasMap.keysToEs(options.filters);
              if (options.boosts)
                options.boosts = aliasMap.keysToEs(options.boosts);
              if (options.attributesToRetrieve)
                options.attributesToRetrieve = aliasMap.arrayToEs(
                  options.attributesToRetrieve,
                );
            }

            const searchResult = await engine.search(query, options);

            // Outbound alias translation
            if (aliasMap.hasAliases) {
              searchResult.facets = aliasMap.keysFromEs(searchResult.facets);
              for (const hit of searchResult.hits) {
                hit._highlights = aliasMap.keysFromEs(hit._highlights);
              }
            }

            const elapsed = Math.round(performance.now() - start);
            const preTag = req.params?.highlightPreTag ?? "<em>";
            const postTag = req.params?.highlightPostTag ?? "</em>";

            return fromSearchResult(
              searchResult,
              query,
              elapsed,
              preTag,
              postTag,
            );
          }),
        );

        return { results };
      },
      {
        params: t.Object({
          handle: t.String({
            description: "Index handle as configured in config.yaml",
          }),
        }),
        body: InstantSearchRequestSchema,
        response: {
          200: t.Object({
            results: t.Array(
              t.Object({
                hits: t.Array(
                  t.Object(
                    {
                      objectID: t.String(),
                    },
                    { additionalProperties: true },
                  ),
                ),
                nbHits: t.Number(),
                nbPages: t.Number(),
                page: t.Number(),
                hitsPerPage: t.Number(),
                facets: t.Record(t.String(), t.Record(t.String(), t.Number())),
                processingTimeMS: t.Number(),
                query: t.String(),
                exhaustiveNbHits: t.Boolean(),
              }),
            ),
          }),
          404: "error",
        },
        detail: {
          summary: "InstantSearch-compatible multi-query",
          description: [
            "Accepts Algolia's multi-query format for use with InstantSearch.js widgets.",
            "Each request in the `requests` array is processed independently via the configured search engine.",
            "",
            "**Supported params:** `query`, `page`, `hitsPerPage`, `facets`, `facetFilters`, `numericFilters`, `attributesToRetrieve`, `highlightPreTag`/`highlightPostTag`",
          ].join("\n"),
          tags: ["Search"],
        },
      },
    );
}
