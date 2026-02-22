import { Client } from "@opensearch-project/opensearch";
import type { IndexConfig } from "../types.ts";
import {
  type ElasticCompatClient,
  ElasticCompatEngine,
} from "./elastic-compat.ts";

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
    return new Client({
      node: config.host,
      ...(auth ? { auth } : {}),
    }) as unknown as ElasticCompatClient;
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
