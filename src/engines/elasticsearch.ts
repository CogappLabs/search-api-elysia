import { Client } from "@elastic/elasticsearch";
import { HttpConnection } from "@elastic/transport";
import type { IndexConfig } from "../types.ts";
import {
  type ElasticCompatClient,
  ElasticCompatEngine,
} from "./elastic-compat.ts";

export class ElasticsearchEngine extends ElasticCompatEngine {
  constructor(config: IndexConfig, client?: Client) {
    super(config, client as ElasticCompatClient | undefined);
  }

  protected createClient(config: IndexConfig): ElasticCompatClient {
    const auth = config.apiKey
      ? { apiKey: config.apiKey }
      : config.username
        ? { username: config.username, password: config.password ?? "" }
        : undefined;
    return new Client({
      node: config.host,
      ...(auth ? { auth } : {}),
      Connection: HttpConnection,
    }) as unknown as ElasticCompatClient;
  }

  protected extractBody<T>(response: unknown): T {
    // ES v8 client returns the body directly
    return response as T;
  }

  protected isNotFoundError(err: unknown): boolean {
    return (err as { statusCode?: number }).statusCode === 404;
  }
}
