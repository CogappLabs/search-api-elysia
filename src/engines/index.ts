import type { IndexConfig } from "../types.ts";
import { ElasticsearchEngine } from "./elasticsearch.ts";
import type { SearchEngine } from "./engine.ts";
import { MeilisearchEngine } from "./meilisearch.ts";
import { OpenSearchEngine } from "./opensearch.ts";

const engineFactories: Record<string, (config: IndexConfig) => SearchEngine> = {
  elasticsearch: (config) => new ElasticsearchEngine(config),
  opensearch: (config) => new OpenSearchEngine(config),
  meilisearch: (config) => new MeilisearchEngine(config),
};

export function createEngine(config: IndexConfig): SearchEngine {
  const factory = engineFactories[config.engine];
  if (!factory) {
    throw new Error(`Unknown engine type: ${config.engine}`);
  }
  return factory(config);
}
