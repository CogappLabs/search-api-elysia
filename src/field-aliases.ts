/** Bidirectional alias ↔ ES field name mapping with zero-overhead passthrough when empty. */
export class FieldAliasMap {
  private aliasToEs: Map<string, string>;
  private esFromAlias: Map<string, string>;
  readonly hasAliases: boolean;

  constructor(aliases?: Record<string, string>) {
    this.aliasToEs = new Map(Object.entries(aliases ?? {}));
    this.esFromAlias = new Map(
      Object.entries(aliases ?? {}).map(([alias, es]) => [es, alias]),
    );
    this.hasAliases = this.aliasToEs.size > 0;
  }

  /** Convert an alias to its ES field name (passthrough if not an alias). */
  toEs(alias: string): string {
    return this.aliasToEs.get(alias) ?? alias;
  }

  /** Convert an ES field name back to its alias (passthrough if not mapped). */
  fromEs(esField: string): string {
    return this.esFromAlias.get(esField) ?? esField;
  }

  /** Translate all keys of a Record from aliases to ES field names. */
  keysToEs<T>(record: Record<string, T>): Record<string, T> {
    if (!this.hasAliases) return record;
    const result: Record<string, T> = {};
    for (const [key, value] of Object.entries(record)) {
      result[this.toEs(key)] = value;
    }
    return result;
  }

  /** Translate all keys of a Record from ES field names to aliases. */
  keysFromEs<T>(record: Record<string, T>): Record<string, T> {
    if (!this.hasAliases) return record;
    const result: Record<string, T> = {};
    for (const [key, value] of Object.entries(record)) {
      result[this.fromEs(key)] = value;
    }
    return result;
  }

  /** Translate an array of alias field names to ES field names. */
  arrayToEs(fields: string[]): string[] {
    if (!this.hasAliases) return fields;
    return fields.map((f) => this.toEs(f));
  }

  /** Translate an array of ES field names to aliases. */
  arrayFromEs(fields: string[]): string[] {
    if (!this.hasAliases) return fields;
    return fields.map((f) => this.fromEs(f));
  }
}
