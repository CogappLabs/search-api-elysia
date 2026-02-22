import type { IndexConfig } from "../types.ts";
import { type ElasticCompatClient, ElasticCompatEngine } from "./elastic-compat.ts";
export declare class OpenSearchEngine extends ElasticCompatEngine {
    protected createClient(config: IndexConfig): ElasticCompatClient;
    protected extractBody<T>(response: unknown): T;
    protected isNotFoundError(err: unknown): boolean;
}
