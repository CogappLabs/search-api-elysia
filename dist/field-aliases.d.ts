/** Bidirectional alias ↔ ES field name mapping with zero-overhead passthrough when empty. */
export declare class FieldAliasMap {
    private aliasToEs;
    private esFromAlias;
    readonly hasAliases: boolean;
    constructor(aliases?: Record<string, string>);
    /** Convert an alias to its ES field name (passthrough if not an alias). */
    toEs(alias: string): string;
    /** Convert an ES field name back to its alias (passthrough if not mapped). */
    fromEs(esField: string): string;
    /** Translate all keys of a Record from aliases to ES field names. */
    keysToEs<T>(record: Record<string, T>): Record<string, T>;
    /** Translate all keys of a Record from ES field names to aliases. */
    keysFromEs<T>(record: Record<string, T>): Record<string, T>;
    /** Translate an array of alias field names to ES field names. */
    arrayToEs(fields: string[]): string[];
    /** Translate an array of ES field names to aliases. */
    arrayFromEs(fields: string[]): string[];
}
