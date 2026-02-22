import type { FieldConfig } from "./types.ts";
export declare function deriveFromFields(fields?: Record<string, FieldConfig>): {
    aliases: Record<string, string>;
    boosts: Record<string, number>;
    searchableFields: string[];
};
