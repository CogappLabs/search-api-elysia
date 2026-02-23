import type { FieldConfig } from "./types.ts";

export function deriveFromFields(fields?: Record<string, FieldConfig>) {
  const aliases: Record<string, string> = {};
  const boosts: Record<string, number> = {};
  const searchableFields: string[] = [];

  if (!fields) return { aliases, boosts, searchableFields };

  const seenEsFields = new Map<string, string>();
  for (const [name, cfg] of Object.entries(fields)) {
    const esName = cfg.field ?? name;

    if (cfg.field) {
      const existing = seenEsFields.get(cfg.field);
      if (existing) {
        throw new Error(
          `Fields "${existing}" and "${name}" both map to ES field "${cfg.field}"`,
        );
      }
      seenEsFields.set(cfg.field, name);
      aliases[name] = cfg.field;
    }

    if (cfg.weight !== undefined) {
      boosts[esName] = cfg.weight;
    } else if (cfg.searchable) {
      searchableFields.push(esName);
    }
  }

  return { aliases, boosts, searchableFields };
}
