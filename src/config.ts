import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Value } from "@sinclair/typebox/value";
import { t } from "elysia";
import { parse } from "yaml";
import type { AppConfig } from "./types.ts";

const IndexDefaultsSchema = t.Object({
  perPage: t.Optional(t.Number({ minimum: 1 })),
  facets: t.Optional(t.Array(t.String())),
  highlight: t.Optional(t.Boolean()),
  suggestField: t.Optional(t.String()),
});

const FieldConfigSchema = t.Object({
  weight: t.Optional(t.Number({ exclusiveMinimum: 0 })),
  searchable: t.Optional(t.Boolean()),
  esField: t.Optional(t.String()),
});

const IndexConfigSchema = t.Object({
  engine: t.Union([
    t.Literal("elasticsearch"),
    t.Literal("opensearch"),
    t.Literal("meilisearch"),
  ]),
  host: t.String(),
  apiKey: t.Optional(t.String()),
  username: t.Optional(t.String()),
  password: t.Optional(t.String()),
  indexName: t.Union([t.String(), t.Array(t.String())]),
  defaults: t.Optional(IndexDefaultsSchema),
  fields: t.Optional(t.Record(t.String(), FieldConfigSchema)),
});

const AppConfigSchema = t.Object({
  port: t.Number({ default: 3000, minimum: 1 }),
  apiKey: t.Optional(t.String()),
  corsOrigins: t.Optional(t.Union([t.String(), t.Array(t.String())])),
  indexes: t.Record(t.String(), IndexConfigSchema),
});

/** Replace ${VAR_NAME} with process.env.VAR_NAME */
function interpolateEnvVars(text: string): string {
  return text.replace(/\$\{([^}]+)}/g, (_, varName: string) => {
    const value = process.env[varName];
    if (value === undefined) {
      throw new Error(
        `Environment variable "${varName}" is not set (referenced in config)`,
      );
    }
    return value;
  });
}

export function loadConfig(configPath?: string): AppConfig {
  const filePath = resolve(configPath ?? "config.yaml");

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    throw new Error(
      `Config file not found: ${filePath}\nCopy config.example.yaml to config.yaml and fill in your values.`,
    );
  }

  const interpolated = interpolateEnvVars(raw);
  const parsed: unknown = parse(interpolated);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Config must be a YAML object");
  }

  // Apply defaults (e.g. port: 3000)
  Value.Default(AppConfigSchema, parsed);

  if (!Value.Check(AppConfigSchema, parsed)) {
    const errors = [...Value.Errors(AppConfigSchema, parsed)];
    const formatted = errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(`Invalid config:\n${formatted}`);
  }

  return parsed as AppConfig;
}
