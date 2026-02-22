import type { FieldConfig } from "./types.ts";

export function deriveFromFields(fields?: Record<string, FieldConfig>) {
  const aliases: Record<string, string> = {};
  const boosts: Record<string, number> = {};
  const searchableFields: string[] = [];

  if (!fields) return { aliases, boosts, searchableFields };

  const seenEsFields = new Map<string, string>();
  for (const [name, cfg] of Object.entries(fields)) {
    const esName = cfg.esField ?? name;

    if (cfg.esField) {
      const existing = seenEsFields.get(cfg.esField);
      if (existing) {
        throw new Error(
          `Fields "${existing}" and "${name}" both map to ES field "${cfg.esField}"`,
        );
      }
      seenEsFields.set(cfg.esField, name);
      aliases[name] = cfg.esField;
    }

    if (cfg.weight !== undefined) {
      boosts[esName] = cfg.weight;
    } else if (cfg.searchable) {
      searchableFields.push(esName);
    }
  }

  return { aliases, boosts, searchableFields };
}
