import { Client } from "@elastic/elasticsearch";
import type { IndexConfig } from "../types.ts";
import { type ElasticCompatClient, ElasticCompatEngine } from "./elastic-compat.ts";
export declare class ElasticsearchEngine extends ElasticCompatEngine {
    constructor(config: IndexConfig, client?: Client);
    protected createClient(config: IndexConfig): ElasticCompatClient;
    protected extractBody<T>(response: unknown): T;
    protected isNotFoundError(err: unknown): boolean;
}
