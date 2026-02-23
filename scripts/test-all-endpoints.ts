/**
 * Test all API endpoints against a running server.
 *
 * Usage:
 *   bun run scripts/test-all-endpoints.ts            # default handle
 *   bun run scripts/test-all-endpoints.ts --railway   # Railway production
 *   bun run scripts/test-all-endpoints.ts --local     # test all 4 local engines
 *   HANDLE=my_index bun run scripts/test-all-endpoints.ts
 *   BASE_URL=https://custom.host bun run scripts/test-all-endpoints.ts
 */

const RAILWAY_URL = "https://search-api-elysia-production.up.railway.app";

const isRailway = process.argv.includes("--railway");
const isLocal = process.argv.includes("--local");
const BASE =
  process.env.BASE_URL ?? (isRailway ? RAILWAY_URL : "http://localhost:3000");

// Workaround: Bun's fetch doesn't decompress gzip from local Elysia.
const _fetch = globalThis.fetch;
globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) =>
  _fetch(url, {
    ...init,
    headers: { "Accept-Encoding": "identity", ...init?.headers },
  })) as typeof globalThis.fetch;

const LOCAL_HANDLES = [
  "local-es",
  "local-opensearch",
  "local-meilisearch",
  "local-typesense",
];

/** Handles that have field aliases configured (country→placeCountry, region→placeRegion). */
const ALIAS_HANDLES = new Set([
  "local-es", "local-opensearch", "local-meilisearch", "local-typesense",
  "craft_search_plugin_labs",
]);

/** Handles with nestedPath configured (facilities.type → facilityType). */
const NESTED_HANDLES = new Set(["local-es", "local-opensearch"]);

/** Handles that have suggestField configured. */
const SUGGEST_HANDLES = new Set(["local-es", "local-opensearch", "craft_search_plugin_labs"]);

/** Handles that have defaults.highlight configured. */
const HIGHLIGHT_DEFAULT_HANDLES = new Set([
  "local-es", "local-opensearch", "craft_search_plugin_labs",
]);

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err instanceof Error ? err.message : err}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

/** Engine type for a handle (used for engine-specific tests). */
function engineType(handle: string): string {
  if (handle.includes("meilisearch")) return "meilisearch";
  if (handle.includes("opensearch")) return "opensearch";
  if (handle.includes("typesense")) return "typesense";
  return "elasticsearch";
}

function isElasticLike(engine: string): boolean {
  return engine === "elasticsearch" || engine === "opensearch";
}

/** Run the full test suite against a single handle. */
async function testHandle(handle: string) {
  const engine = engineType(handle);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testing handle: ${handle} (${engine})`);
  console.log(`${"=".repeat(60)}`);

  // ── Search ──────────────────────────────────────────────────────

  console.log("\n--- Search ---");
  await test(`[${handle}] basic query`, async () => {
    const res = await fetch(`${BASE}/${handle}/search?q=castle`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(typeof body.totalHits === "number", "Expected totalHits");
    assert(Array.isArray(body.hits), "Expected hits array");
    console.log(`        -> ${body.totalHits} hits`);
  });

  await test(`[${handle}] empty query (match_all)`, async () => {
    const res = await fetch(`${BASE}/${handle}/search?q=`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.totalHits > 0, "Expected some hits for match_all");
    console.log(`        -> ${body.totalHits} total docs`);
  });

  await test(`[${handle}] pagination`, async () => {
    const res = await fetch(`${BASE}/${handle}/search?q=&perPage=2&page=2`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.page === 2, `Expected page 2, got ${body.page}`);
    assert(body.perPage === 2, `Expected perPage 2, got ${body.perPage}`);
  });

  await test(`[${handle}] valid sort`, async () => {
    // postDate is sortable in all engines (stored as int64 in Typesense)
    const sort = JSON.stringify({ postDate: "desc" });
    const res = await fetch(
      `${BASE}/${handle}/search?q=&sort=${encodeURIComponent(sort)}`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.hits.length > 0, "Expected sorted results");
  });

  await test(`[${handle}] facets`, async () => {
    const res = await fetch(
      `${BASE}/${handle}/search?q=&facets=placeCountry,placeRegion`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    const countryFacet = body.facets.placeCountry ?? body.facets.country;
    assert(countryFacet, "Expected country facet");
    assert(Array.isArray(countryFacet), "Expected facet values array");
    console.log(`        -> ${countryFacet.length} country values`);
  });

  // ── Filters ─────────────────────────────────────────────────────

  console.log("\n--- Filters ---");
  await test(`[${handle}] string filter`, async () => {
    const filters = JSON.stringify({ placeCountry: "Scotland" });
    const res = await fetch(
      `${BASE}/${handle}/search?q=&filters=${encodeURIComponent(filters)}`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.totalHits > 0, "Expected results for Scotland filter");
    console.log(`        -> ${body.totalHits} hits for Scotland`);
  });

  await test(`[${handle}] array filter (multi-value)`, async () => {
    const filters = JSON.stringify({
      placeCountry: ["Scotland", "England"],
    });
    const res = await fetch(
      `${BASE}/${handle}/search?q=&filters=${encodeURIComponent(filters)}`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.totalHits > 0, "Expected results for Scotland|England filter");
    console.log(
      `        -> ${body.totalHits} hits for Scotland or England`,
    );
  });

  await test(`[${handle}] boolean filter`, async () => {
    const filters = JSON.stringify({ has_image: true });
    const res = await fetch(
      `${BASE}/${handle}/search?q=&filters=${encodeURIComponent(filters)}`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    console.log(`        -> ${body.totalHits} hits with has_image=true`);
  });

  // Range filters use numeric fields — placeHeroImage is numeric in all engines
  await test(`[${handle}] range filter`, async () => {
    const filters = JSON.stringify({ placeHeroImage: { min: 1, max: 9999 } });
    const res = await fetch(
      `${BASE}/${handle}/search?q=&filters=${encodeURIComponent(filters)}`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    console.log(`        -> ${body.totalHits} hits in range`);
  });

  // ── Highlight ───────────────────────────────────────────────────

  console.log("\n--- Highlight ---");
  await test(`[${handle}] highlight=true`, async () => {
    const res = await fetch(
      `${BASE}/${handle}/search?q=castle&highlight=true`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    const hasHighlights = body.hits.some(
      (h: Record<string, unknown>) =>
        Object.keys(h._highlights as Record<string, unknown>).length > 0,
    );
    assert(hasHighlights, "Expected at least one hit with highlights");
  });

  // Typesense always returns highlights; skip the "no highlights" assertion for it
  if (engine !== "typesense") {
    await test(`[${handle}] highlight=false`, async () => {
      const res = await fetch(
        `${BASE}/${handle}/search?q=castle&highlight=false`,
      );
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      if (body.hits.length > 0) {
        const allEmpty = body.hits.every(
          (h: Record<string, unknown>) =>
            Object.keys(h._highlights as Record<string, unknown>).length === 0,
        );
        assert(allEmpty, "Expected no highlights when highlight=false");
      }
    });
  }

  // ── Boosts & Fields ─────────────────────────────────────────────

  console.log("\n--- Boosts & Fields ---");
  await test(`[${handle}] boosts`, async () => {
    const boosts = JSON.stringify({ title: 10, placeDescription: 2 });
    const res = await fetch(
      `${BASE}/${handle}/search?q=castle&boosts=${encodeURIComponent(boosts)}`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test(`[${handle}] fields (attributesToRetrieve)`, async () => {
    const res = await fetch(
      `${BASE}/${handle}/search?q=castle&fields=title,uri`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    if (body.hits.length > 0) {
      assert(body.hits[0].title !== undefined, "Expected title field");
    }
  });

  // ── Suggest (ES/OpenSearch with suggestField only) ──────────────

  if (SUGGEST_HANDLES.has(handle)) {
    console.log("\n--- Suggest ---");
    await test(`[${handle}] suggest=true`, async () => {
      const res = await fetch(
        `${BASE}/${handle}/search?q=casle&suggest=true`,
      );
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(
        Array.isArray(body.suggestions),
        "Expected suggestions array in response",
      );
      console.log(
        `        -> ${body.suggestions.length} suggestion(s): ${body.suggestions.join(", ") || "(none)"}`,
      );
    });
  }

  // ── Histogram (ES/OpenSearch only) ──────────────────────────────

  if (isElasticLike(engine)) {
    console.log("\n--- Histogram ---");
    await test(`[${handle}] histogram aggregation`, async () => {
      const histogram = JSON.stringify({ placeHeroImage: 100 });
      const res = await fetch(
        `${BASE}/${handle}/search?q=&histogram=${encodeURIComponent(histogram)}`,
      );
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.histograms !== undefined, "Expected histograms in response");
      assert(
        body.histograms.placeHeroImage !== undefined,
        "Expected placeHeroImage histogram",
      );
      assert(
        Array.isArray(body.histograms.placeHeroImage),
        "Expected histogram buckets array",
      );
      if (body.histograms.placeHeroImage.length > 0) {
        assert(
          typeof body.histograms.placeHeroImage[0].key === "number",
          "Expected bucket key to be a number",
        );
        assert(
          typeof body.histograms.placeHeroImage[0].count === "number",
          "Expected bucket count to be a number",
        );
      }
      console.log(
        `        -> ${body.histograms.placeHeroImage.length} buckets`,
      );
    });
  }

  // ── Geo Grid (ES/OpenSearch only) ───────────────────────────────

  if (isElasticLike(engine)) {
    console.log("\n--- Geo Grid ---");
    await test(`[${handle}] geoGrid clustering`, async () => {
      const geoGrid = JSON.stringify({
        field: "placeCoordinates",
        precision: 4,
        bounds: {
          top_left: { lat: 60, lon: -8 },
          bottom_right: { lat: 49, lon: 2 },
        },
      });
      const res = await fetch(
        `${BASE}/${handle}/search?q=&geoGrid=${encodeURIComponent(geoGrid)}`,
      );
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(
        body.geoClusters !== undefined,
        "Expected geoClusters in response",
      );
      assert(Array.isArray(body.geoClusters), "Expected geoClusters array");
      if (body.geoClusters.length > 0) {
        const cluster = body.geoClusters[0];
        assert(typeof cluster.lat === "number", "Expected lat");
        assert(typeof cluster.lng === "number", "Expected lng");
        assert(typeof cluster.count === "number", "Expected count");
        assert(typeof cluster.key === "string", "Expected key");
      }
      console.log(`        -> ${body.geoClusters.length} clusters`);
    });
  }

  // ── Documents ───────────────────────────────────────────────────

  console.log("\n--- Documents ---");
  let docId: string | null = null;
  {
    const res = await fetch(`${BASE}/${handle}/search?q=&perPage=1`);
    if (res.ok) {
      const body = await res.json();
      if (body.hits.length > 0) docId = body.hits[0].objectID;
    }
  }

  await test(`[${handle}] get document by ID`, async () => {
    assert(docId !== null, "No document ID found from search");
    const res = await fetch(`${BASE}/${handle}/documents/${docId}`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.objectID === docId, `Expected objectID "${docId}"`);
    console.log(`        -> doc ${docId}: "${body.title ?? "(no title)"}"`);
  });

  await test(`[${handle}] 404 for missing document`, async () => {
    const res = await fetch(
      `${BASE}/${handle}/documents/nonexistent_doc_id_999999`,
    );
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  // ── Facets Endpoint ─────────────────────────────────────────────

  console.log("\n--- Facets Endpoint ---");
  await test(`[${handle}] facet values`, async () => {
    const res = await fetch(`${BASE}/${handle}/facets/placeCountry`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.field === "placeCountry", "Expected field name");
    assert(Array.isArray(body.values), "Expected values array");
    console.log(`        -> ${body.values.length} country values`);
  });

  await test(`[${handle}] facet values with query`, async () => {
    const res = await fetch(`${BASE}/${handle}/facets/placeCountry?q=sc`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    console.log(`        -> ${body.values.length} values matching "sc"`);
  });

  await test(`[${handle}] facet maxValues`, async () => {
    const res = await fetch(
      `${BASE}/${handle}/facets/placeCountry?maxValues=2`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(
      body.values.length <= 2,
      `Expected at most 2 values, got ${body.values.length}`,
    );
    console.log(`        -> ${body.values.length} values (max 2)`);
  });

  await test(`[${handle}] facet with filters`, async () => {
    const filters = JSON.stringify({ placeCountry: "Scotland" });
    const res = await fetch(
      `${BASE}/${handle}/facets/placeRegion?filters=${encodeURIComponent(filters)}`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.field === "placeRegion", "Expected field placeRegion");
    console.log(
      `        -> ${body.values.length} regions within Scotland`,
    );
  });

  // ── Mapping ─────────────────────────────────────────────────────

  console.log("\n--- Mapping ---");
  await test(`[${handle}] get mapping`, async () => {
    const res = await fetch(`${BASE}/${handle}/mapping`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    const keys = Object.keys(body);
    assert(keys.length > 0, "Expected non-empty mapping response");
  });

  // ── Raw Query (all engines) ─────────────────────────────────────

  console.log("\n--- Raw Query ---");
  if (isElasticLike(engine)) {
    await test(`[${handle}] raw ES DSL query`, async () => {
      const res = await fetch(`${BASE}/${handle}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: { match_all: {} }, size: 2 }),
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.hits !== undefined, "Expected hits in response");
      console.log(
        `        -> ${body.hits.total?.value ?? body.hits.total} total`,
      );
    });
  } else if (engine === "meilisearch") {
    await test(`[${handle}] raw Meilisearch query`, async () => {
      const res = await fetch(`${BASE}/${handle}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: "", limit: 2 }),
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.hits !== undefined, "Expected hits in response");
      console.log(`        -> ${body.estimatedTotalHits ?? body.totalHits ?? "?"} total`);
    });
  } else if (engine === "typesense") {
    await test(`[${handle}] raw Typesense query`, async () => {
      const res = await fetch(`${BASE}/${handle}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: "*", query_by: "*", per_page: 2 }),
      });
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.found !== undefined, "Expected found in response");
      console.log(`        -> ${body.found} total`);
    });
  }

  // ── Autocomplete ────────────────────────────────────────────────

  console.log("\n--- Autocomplete ---");
  await test(`[${handle}] autocomplete basic`, async () => {
    const res = await fetch(`${BASE}/${handle}/autocomplete?q=cas`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(typeof body.totalHits === "number", "Expected totalHits");
    assert(Array.isArray(body.hits), "Expected hits array");
    console.log(`        -> ${body.totalHits} hits for "cas"`);
  });

  await test(`[${handle}] autocomplete with perPage`, async () => {
    const res = await fetch(
      `${BASE}/${handle}/autocomplete?q=cas&perPage=3`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(
      body.hits.length <= 3,
      `Expected at most 3 hits, got ${body.hits.length}`,
    );
  });

  await test(`[${handle}] autocomplete with facets`, async () => {
    const res = await fetch(
      `${BASE}/${handle}/autocomplete?q=sc&facets=placeCountry`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    // facets is optional — only present when there are matches
    if (body.facets) {
      assert(
        body.facets.placeCountry !== undefined,
        "Expected placeCountry facet",
      );
      assert(
        Array.isArray(body.facets.placeCountry),
        "Expected facet values array",
      );
      console.log(
        `        -> ${body.facets.placeCountry.length} country facet matches`,
      );
    } else {
      console.log(`        -> no facet matches`);
    }
  });

  await test(`[${handle}] autocomplete with maxFacetsPerField`, async () => {
    const res = await fetch(
      `${BASE}/${handle}/autocomplete?q=&facets=placeCountry&maxFacetsPerField=2`,
    );
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    if (body.facets?.placeCountry) {
      assert(
        body.facets.placeCountry.length <= 2,
        `Expected at most 2 facet values, got ${body.facets.placeCountry.length}`,
      );
      console.log(
        `        -> ${body.facets.placeCountry.length} values (max 2)`,
      );
    }
  });

  // ── InstantSearch ───────────────────────────────────────────────

  console.log("\n--- InstantSearch ---");
  await test(`[${handle}] instantsearch basic query`, async () => {
    const res = await fetch(`${BASE}/${handle}/instantsearch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{ params: { query: "castle", hitsPerPage: 5 } }],
      }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.results !== undefined, "Expected results array");
    assert(body.results.length === 1, "Expected 1 result");
    const r = body.results[0];
    assert(typeof r.nbHits === "number", "Expected nbHits");
    assert(typeof r.nbPages === "number", "Expected nbPages");
    assert(typeof r.page === "number", "Expected page");
    assert(typeof r.hitsPerPage === "number", "Expected hitsPerPage");
    assert(r.query === "castle", 'Expected query "castle"');
    assert(typeof r.processingTimeMS === "number", "Expected processingTimeMS");
    console.log(`        -> ${r.nbHits} hits, ${r.nbPages} pages`);
  });

  await test(`[${handle}] instantsearch with facets`, async () => {
    const res = await fetch(`${BASE}/${handle}/instantsearch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            params: {
              query: "",
              facets: ["placeCountry"],
              hitsPerPage: 1,
            },
          },
        ],
      }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    const r = body.results[0];
    assert(r.facets !== undefined, "Expected facets");
    // InstantSearch facets format: {"placeCountry":{"Scotland":7,"England":15}}
    const countryFacet =
      r.facets.placeCountry ?? r.facets.country;
    assert(countryFacet !== undefined, "Expected country facet");
    assert(typeof countryFacet === "object", "Expected facet object");
    console.log(
      `        -> ${Object.keys(countryFacet).length} country facet values`,
    );
  });

  await test(`[${handle}] instantsearch multi-query`, async () => {
    const res = await fetch(`${BASE}/${handle}/instantsearch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          { params: { query: "castle", hitsPerPage: 2 } },
          { params: { query: "stones", hitsPerPage: 2 } },
        ],
      }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(body.results.length === 2, "Expected 2 results for multi-query");
    assert(body.results[0].query === "castle", 'Expected first query "castle"');
    assert(
      body.results[1].query === "stones",
      'Expected second query "stones"',
    );
  });

  await test(`[${handle}] instantsearch facetFilters`, async () => {
    const res = await fetch(`${BASE}/${handle}/instantsearch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            params: {
              query: "",
              facetFilters: [["placeCountry:Scotland"]],
              hitsPerPage: 5,
            },
          },
        ],
      }),
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    const r = body.results[0];
    assert(r.nbHits > 0, "Expected hits for Scotland facetFilter");
    console.log(`        -> ${r.nbHits} hits for Scotland facetFilter`);
  });

  // ── Field Aliases (handles with fields config only) ─────────────

  if (ALIAS_HANDLES.has(handle)) {
    console.log("\n--- Field Aliases ---");
    await test(`[${handle}] filter via alias (country→placeCountry)`, async () => {
      const filters = JSON.stringify({ country: "Scotland" });
      const res = await fetch(
        `${BASE}/${handle}/search?q=&filters=${encodeURIComponent(filters)}`,
      );
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.totalHits > 0, "Expected results using alias filter");
      console.log(`        -> ${body.totalHits} hits via alias "country"`);
    });

    await test(`[${handle}] facets via alias`, async () => {
      const res = await fetch(
        `${BASE}/${handle}/search?q=&facets=country,region`,
      );
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      // Outbound translation: response should use alias names
      assert(
        body.facets.country !== undefined,
        "Expected 'country' key in facets (alias translation)",
      );
      console.log(
        `        -> ${body.facets.country.length} values via alias "country"`,
      );
    });

    await test(`[${handle}] facet endpoint via alias`, async () => {
      const res = await fetch(`${BASE}/${handle}/facets/country`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(
        body.field === "country",
        `Expected field "country", got "${body.field}"`,
      );
      assert(body.values.length > 0, "Expected values via alias");
    });

    // Sort via alias — only ES/OpenSearch (Meili/Typesense don't have placeCountry as sortable)
    if (isElasticLike(engine)) {
      await test(`[${handle}] sort via alias`, async () => {
        const sort = JSON.stringify({ country: "asc" });
        const res = await fetch(
          `${BASE}/${handle}/search?q=&sort=${encodeURIComponent(sort)}`,
        );
        assert(res.status === 200, `Expected 200, got ${res.status}`);
      });
    }
  }

  // ── Nested Facilities (ES/OpenSearch with nestedPath) ──────────

  if (NESTED_HANDLES.has(handle)) {
    console.log("\n--- Nested Facilities ---");
    await test(`[${handle}] facets on nested field via alias`, async () => {
      const res = await fetch(
        `${BASE}/${handle}/search?q=&facets=facilityType`,
      );
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(
        body.facets.facilityType !== undefined,
        "Expected facilityType facet",
      );
      assert(
        body.facets.facilityType.length > 0,
        "Expected facility type values",
      );
      const types = body.facets.facilityType.map(
        (f: { value: string }) => f.value,
      );
      console.log(`        -> ${types.length} facility types: ${types.join(", ")}`);
    });

    await test(`[${handle}] filter on nested field via alias`, async () => {
      const filters = JSON.stringify({ facilityType: "cafe" });
      const res = await fetch(
        `${BASE}/${handle}/search?q=&filters=${encodeURIComponent(filters)}`,
      );
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.totalHits > 0, "Expected results for cafe filter");
      console.log(
        `        -> ${body.totalHits} places with a cafe`,
      );
    });

    await test(`[${handle}] disjunctive nested facet + filter`, async () => {
      const filters = JSON.stringify({ facilityType: "cafe" });
      const res = await fetch(
        `${BASE}/${handle}/search?q=&facets=facilityType&filters=${encodeURIComponent(filters)}`,
      );
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(
        body.facets.facilityType !== undefined,
        "Expected facilityType facet with disjunctive counts",
      );
      // Disjunctive: should show ALL facility types, not just "cafe"
      const types = body.facets.facilityType.map(
        (f: { value: string }) => f.value,
      );
      assert(
        types.length > 1,
        `Expected disjunctive counts (multiple types), got: ${types.join(", ")}`,
      );
      console.log(
        `        -> disjunctive: ${types.length} types shown while filtering "cafe"`,
      );
    });

    await test(`[${handle}] facet endpoint on nested field`, async () => {
      const res = await fetch(`${BASE}/${handle}/facets/facilityType`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(
        body.field === "facilityType",
        `Expected field "facilityType", got "${body.field}"`,
      );
      assert(body.values.length > 0, "Expected facility type values");
      console.log(
        `        -> ${body.values.length} facility types via facet endpoint`,
      );
    });

    await test(`[${handle}] nested filter + non-nested facet`, async () => {
      const filters = JSON.stringify({ facilityType: "guided_tour" });
      const res = await fetch(
        `${BASE}/${handle}/search?q=&facets=country&filters=${encodeURIComponent(filters)}`,
      );
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      assert(body.totalHits > 0, "Expected results for guided_tour filter");
      const countryFacet = body.facets.country;
      assert(countryFacet !== undefined, "Expected country facet");
      console.log(
        `        -> ${body.totalHits} places with guided tours across ${countryFacet.length} countries`,
      );
    });
  }

  // ── Defaults (handles with defaults config) ─────────────────────

  if (HIGHLIGHT_DEFAULT_HANDLES.has(handle)) {
    console.log("\n--- Defaults ---");
    await test(`[${handle}] default highlight applied`, async () => {
      // Don't pass highlight param — should use config default (true)
      const res = await fetch(`${BASE}/${handle}/search?q=castle`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      const hasHighlights = body.hits.some(
        (h: Record<string, unknown>) =>
          Object.keys(h._highlights as Record<string, unknown>).length > 0,
      );
      assert(
        hasHighlights,
        "Expected highlights from default config (defaults.highlight: true)",
      );
    });

    await test(`[${handle}] default facets applied`, async () => {
      // Don't pass facets param — should use config defaults
      const res = await fetch(`${BASE}/${handle}/search?q=`);
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      const body = await res.json();
      const facetKeys = Object.keys(body.facets);
      assert(
        facetKeys.length > 0,
        "Expected facets from default config (defaults.facets)",
      );
      console.log(`        -> default facets: ${facetKeys.join(", ")}`);
    });
  }
}

// ── Global tests (run once) ─────────────────────────────────────────

async function testGlobal(handle: string) {
  console.log(`\nTesting against ${BASE}\n`);

  console.log("--- Health ---");
  await test("GET /health returns 200", async () => {
    const res = await fetch(`${BASE}/health`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(
      body.status === "ok",
      `Expected status "ok", got "${body.status}"`,
    );
  });

  console.log("\n--- Indexes ---");
  await test("GET /indexes lists configured indexes", async () => {
    const res = await fetch(`${BASE}/indexes`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert(Array.isArray(body.indexes), "Expected indexes array");
    assert(body.indexes.length > 0, "Expected at least one index");
    const handles = body.indexes.map((i: { handle: string }) => i.handle);
    console.log(`        -> ${handles.join(", ")}`);
    assert(handles.includes(handle), `Expected "${handle}" in indexes`);
  });

  console.log("\n--- Error handling ---");
  await test("404 for unknown index", async () => {
    const res = await fetch(`${BASE}/nonexistent/search?q=test`);
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  await test("400 for bad sort", async () => {
    const res = await fetch(`${BASE}/${handle}/search?q=test&sort={bad}`);
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("400 for bad filters", async () => {
    const res = await fetch(
      `${BASE}/${handle}/search?q=test&filters=not-json`,
    );
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("400 for bad boosts", async () => {
    const res = await fetch(
      `${BASE}/${handle}/search?q=test&boosts=not-json`,
    );
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });
}

// ── Main ──────────────────────────────────────────────────────────────

if (isLocal) {
  await testGlobal(LOCAL_HANDLES[0] as string);
  for (const handle of LOCAL_HANDLES) {
    await testHandle(handle);
  }
} else {
  const handle = process.env.HANDLE ?? "craft_search_plugin_labs";
  await testGlobal(handle);
  await testHandle(handle);
}

console.log(`\n${"=".repeat(60)}`);
console.log(
  `Results: ${passed} passed, ${failed} failed, ${passed + failed} total`,
);
process.exit(failed > 0 ? 1 : 0);
