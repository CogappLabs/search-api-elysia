import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.ts";
import { deriveFromFields } from "../src/index.ts";

function writeTempConfig(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "search-api-test-"));
  const path = join(dir, "config.yaml");
  writeFileSync(path, content);
  return path;
}

describe("loadConfig", () => {
  it("loads a valid config file", () => {
    const path = writeTempConfig(`
port: 4000
indexes:
  test:
    engine: elasticsearch
    host: https://example.com
    indexName: my_index
`);
    const config = loadConfig(path);
    expect(config.port).toBe(4000);
    expect(config.indexes.test?.engine).toBe("elasticsearch");
    expect(config.indexes.test?.indexName).toBe("my_index");
  });

  it("uses default port when not specified", () => {
    const path = writeTempConfig(`
indexes:
  test:
    engine: elasticsearch
    host: https://example.com
    indexName: my_index
`);
    const config = loadConfig(path);
    expect(config.port).toBe(3000);
  });

  it("throws for missing config file", () => {
    expect(() => loadConfig("/nonexistent/config.yaml")).toThrow(
      "Config file not found",
    );
  });

  it("throws for invalid engine type", () => {
    const path = writeTempConfig(`
indexes:
  test:
    engine: solr
    host: https://example.com
    indexName: my_index
`);
    expect(() => loadConfig(path)).toThrow();
  });

  it("throws for missing required fields", () => {
    const path = writeTempConfig(`
indexes:
  test:
    engine: elasticsearch
`);
    expect(() => loadConfig(path)).toThrow();
  });

  it("interpolates environment variables", () => {
    process.env.TEST_ES_HOST = "https://from-env.example.com";
    const path = writeTempConfig(`
indexes:
  test:
    engine: elasticsearch
    host: \${TEST_ES_HOST}
    indexName: my_index
`);
    const config = loadConfig(path);
    expect(config.indexes.test?.host).toBe("https://from-env.example.com");
    delete process.env.TEST_ES_HOST;
  });

  it("throws for missing environment variable", () => {
    delete process.env.MISSING_VAR_FOR_TEST;
    const path = writeTempConfig(`
indexes:
  test:
    engine: elasticsearch
    host: \${MISSING_VAR_FOR_TEST}
    indexName: my_index
`);
    expect(() => loadConfig(path)).toThrow("MISSING_VAR_FOR_TEST");
  });

  it("parses optional defaults", () => {
    const path = writeTempConfig(`
indexes:
  test:
    engine: elasticsearch
    host: https://example.com
    indexName: my_index
    defaults:
      perPage: 25
      facets:
        - category
        - period
      highlight: true
      suggestField: title
`);
    const config = loadConfig(path);
    const defaults = config.indexes.test?.defaults;
    expect(defaults?.perPage).toBe(25);
    expect(defaults?.facets).toEqual(["category", "period"]);
    expect(defaults?.highlight).toBe(true);
    expect(defaults?.suggestField).toBe("title");
  });

  it("parses fields config with weight, searchable, and esField", () => {
    const path = writeTempConfig(`
indexes:
  test:
    engine: elasticsearch
    host: https://example.com
    indexName: my_index
    fields:
      title:
        weight: 10
      description:
        weight: 2
        searchable: true
      country:
        esField: placeCountry
`);
    const config = loadConfig(path);
    expect(config.indexes.test?.fields).toEqual({
      title: { weight: 10 },
      description: { weight: 2, searchable: true },
      country: { esField: "placeCountry" },
    });
  });

  it("accepts an array of index names", () => {
    const path = writeTempConfig(`
indexes:
  test:
    engine: elasticsearch
    host: https://example.com
    indexName:
      - index_a
      - index_b
`);
    const config = loadConfig(path);
    expect(config.indexes.test?.indexName).toEqual(["index_a", "index_b"]);
  });

  it("accepts a single string index name", () => {
    const path = writeTempConfig(`
indexes:
  test:
    engine: elasticsearch
    host: https://example.com
    indexName: my_index
`);
    const config = loadConfig(path);
    expect(config.indexes.test?.indexName).toBe("my_index");
  });

  it("parses fields with esField aliases", () => {
    const path = writeTempConfig(`
indexes:
  test:
    engine: elasticsearch
    host: https://example.com
    indexName: my_index
    fields:
      country:
        esField: placeCountry
      region:
        esField: placeRegion
`);
    const config = loadConfig(path);
    expect(config.indexes.test?.fields?.country).toEqual({
      esField: "placeCountry",
    });
    expect(config.indexes.test?.fields?.region).toEqual({
      esField: "placeRegion",
    });
  });

  it("rejects negative weight in fields config", () => {
    const path = writeTempConfig(`
indexes:
  test:
    engine: elasticsearch
    host: https://example.com
    indexName: my_index
    fields:
      title:
        weight: -1
`);
    expect(() => loadConfig(path)).toThrow();
  });

  it("rejects zero weight in fields config", () => {
    const path = writeTempConfig(`
indexes:
  test:
    engine: elasticsearch
    host: https://example.com
    indexName: my_index
    fields:
      title:
        weight: 0
`);
    expect(() => loadConfig(path)).toThrow();
  });

  it("parses optional apiKey and corsOrigins", () => {
    const path = writeTempConfig(`
apiKey: my-secret
corsOrigins:
  - https://example.com
indexes:
  test:
    engine: elasticsearch
    host: https://example.com
    indexName: my_index
`);
    const config = loadConfig(path);
    expect(config.apiKey).toBe("my-secret");
    expect(config.corsOrigins).toEqual(["https://example.com"]);
  });
});

describe("deriveFromFields", () => {
  it("returns empty maps when no fields provided", () => {
    const result = deriveFromFields(undefined);
    expect(result.aliases).toEqual({});
    expect(result.boosts).toEqual({});
    expect(result.searchableFields).toEqual([]);
  });

  it("derives aliases from esField entries", () => {
    const result = deriveFromFields({
      country: { esField: "placeCountry" },
      region: { esField: "placeRegion" },
    });
    expect(result.aliases).toEqual({
      country: "placeCountry",
      region: "placeRegion",
    });
  });

  it("derives boosts from weight entries using ES field names", () => {
    const result = deriveFromFields({
      title: { weight: 10 },
      country: { esField: "placeCountry", weight: 3 },
    });
    expect(result.boosts).toEqual({ title: 10, placeCountry: 3 });
  });

  it("derives searchableFields from searchable entries without weight", () => {
    const result = deriveFromFields({
      description: { searchable: true },
      title: { weight: 10 },
    });
    expect(result.searchableFields).toEqual(["description"]);
    expect(result.boosts).toEqual({ title: 10 });
  });

  it("weight takes priority over searchable", () => {
    const result = deriveFromFields({
      title: { weight: 5, searchable: true },
    });
    expect(result.boosts).toEqual({ title: 5 });
    expect(result.searchableFields).toEqual([]);
  });

  it("throws when two fields map to the same esField", () => {
    expect(() =>
      deriveFromFields({
        country: { esField: "placeCountry" },
        nation: { esField: "placeCountry" },
      }),
    ).toThrow('both map to ES field "placeCountry"');
  });
});
