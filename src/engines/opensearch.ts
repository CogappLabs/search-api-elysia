import { Client } from "@opensearch-project/opensearch";
import type { IndexConfig } from "../types.ts";
import {
  type ElasticCompatClient,
  ElasticCompatEngine,
} from "./elastic-compat.ts";

/** Top-level params the OpenSearch v3 client accepts outside of `body`. */
const TOP_LEVEL_PARAMS = new Set([
  "index",
  "routing",
  "preference",
  "scroll",
  "search_type",
  "rest_total_hits_as_int",
  "allow_partial_search_results",
  "ccs_minimize_roundtrips",
  "request_cache",
  "typed_keys",
]);

/**
 * Wrap an OpenSearch v3 Client so that `search(params)` automatically nests
 * body-level keys (query, aggs, highlight, …) under `body`, matching the v3
 * API shape while keeping the flat-params interface used by ElasticCompatEngine.
 */
function wrapClient(client: Client): ElasticCompatClient {
  return {
    search: (params: Record<string, unknown>) => {
      const topLevel: Record<string, unknown> = {};
      const body: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(params)) {
        if (TOP_LEVEL_PARAMS.has(key)) {
          topLevel[key] = value;
        } else {
          body[key] = value;
        }
      }
      return client.search({ ...topLevel, body } as Parameters<
        typeof client.search
      >[0]);
    },
    get: (params: { index: string; id: string }) => client.get(params),
    indices: {
      getMapping: (params: { index: string }) =>
        client.indices.getMapping(params),
    },
  } as ElasticCompatClient;
}

export class OpenSearchEngine extends ElasticCompatEngine {
  protected createClient(config: IndexConfig): ElasticCompatClient {
    if (config.apiKey && !config.username) {
      throw new Error(
        "OpenSearch engine does not support apiKey auth; use username/password",
      );
    }
    const auth = config.username
      ? { username: config.username, password: config.password ?? "" }
      : undefined;
    return wrapClient(
      new Client({
        node: config.host,
        ...(auth ? { auth } : {}),
      }),
    );
  }

  protected extractBody<T>(response: unknown): T {
    // OpenSearch client wraps response data in .body
    return (response as { body: T }).body;
  }

  protected isNotFoundError(err: unknown): boolean {
    const e = err as {
      statusCode?: number;
      meta?: { statusCode?: number };
    };
    return e.statusCode === 404 || e.meta?.statusCode === 404;
  }
}
