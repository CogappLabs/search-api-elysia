/**
 * Test all API endpoints against a running server.
 *
 * Usage:
 *   bun run scripts/test-all-endpoints.ts            # local (localhost:3000)
 *   bun run scripts/test-all-endpoints.ts --railway   # Railway production
 *   BASE_URL=https://custom.host bun run scripts/test-all-endpoints.ts
 */

const RAILWAY_URL = "https://search-api-elysia-production.up.railway.app";

const isRailway = process.argv.includes("--railway");
const BASE =
  process.env.BASE_URL ?? (isRailway ? RAILWAY_URL : "http://localhost:3000");
const HANDLE = process.env.HANDLE ?? "craft_search_plugin_labs";

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

console.log(`Testing against ${BASE} with handle "${HANDLE}"\n`);

// --- Health ---
console.log("--- Health ---");
await test("GET /health returns 200", async () => {
  const res = await fetch(`${BASE}/health`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert(body.status === "ok", `Expected status "ok", got "${body.status}"`);
});

// --- Indexes ---
console.log("\n--- Indexes ---");
await test("GET /indexes lists configured indexes", async () => {
  const res = await fetch(`${BASE}/indexes`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert(Array.isArray(body.indexes), "Expected indexes array");
  assert(body.indexes.length > 0, "Expected at least one index");
  const handles = body.indexes.map((i: { handle: string }) => i.handle);
  assert(handles.includes(HANDLE), `Expected "${HANDLE}" in indexes`);
});

// --- Search ---
console.log("\n--- Search ---");
await test("GET /:handle/search basic query", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/search?q=castle`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert(typeof body.totalHits === "number", "Expected totalHits");
  assert(Array.isArray(body.hits), "Expected hits array");
  assert(typeof body.page === "number", "Expected page");
  assert(typeof body.totalPages === "number", "Expected totalPages");
  console.log(`        -> ${body.totalHits} hits`);
});

await test("GET /:handle/search empty query (match_all)", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/search?q=`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert(body.totalHits > 0, "Expected some hits for match_all");
  console.log(`        -> ${body.totalHits} total docs`);
});

await test("GET /:handle/search with pagination", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/search?q=&perPage=2&page=2`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert(body.page === 2, `Expected page 2, got ${body.page}`);
  assert(body.perPage === 2, `Expected perPage 2, got ${body.perPage}`);
});

await test("GET /:handle/search with facets", async () => {
  const res = await fetch(
    `${BASE}/${HANDLE}/search?q=&facets=placeCountry,placeRegion`,
  );
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  // Facet keys may be aliased (e.g. "country" instead of "placeCountry")
  const countryFacet = body.facets.placeCountry ?? body.facets.country;
  const regionFacet = body.facets.placeRegion ?? body.facets.region;
  assert(countryFacet, "Expected country facet (placeCountry or country)");
  assert(Array.isArray(countryFacet), "Expected facet values array");
  console.log(
    `        -> ${countryFacet.length} country values, ${regionFacet?.length ?? 0} region values`,
  );
});

await test("GET /:handle/search with filters", async () => {
  const filters = JSON.stringify({ placeCountry: "Scotland" });
  const res = await fetch(
    `${BASE}/${HANDLE}/search?q=&filters=${encodeURIComponent(filters)}`,
  );
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  console.log(`        -> ${body.totalHits} hits for Scotland`);
});

await test("GET /:handle/search with highlight", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/search?q=castle&highlight=true`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  const hasHighlights = body.hits.some(
    (h: Record<string, unknown>) =>
      Object.keys(h._highlights as Record<string, unknown>).length > 0,
  );
  assert(hasHighlights, "Expected at least one hit with highlights");
});

await test("GET /:handle/search with sort", async () => {
  const sort = JSON.stringify({ "title.keyword": "asc" });
  const res = await fetch(
    `${BASE}/${HANDLE}/search?q=&sort=${encodeURIComponent(sort)}`,
  );
  assert(res.status === 200, `Expected 200, got ${res.status}`);
});

await test("GET /:handle/search with boosts", async () => {
  const boosts = JSON.stringify({ title: 10, description: 2 });
  const res = await fetch(
    `${BASE}/${HANDLE}/search?q=castle&boosts=${encodeURIComponent(boosts)}`,
  );
  assert(res.status === 200, `Expected 200, got ${res.status}`);
});

await test("GET /:handle/search with fields", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/search?q=castle&fields=title,uri`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  if (body.hits.length > 0) {
    assert(body.hits[0].title !== undefined, "Expected title field");
  }
});

await test("GET /:handle/search with suggest", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/search?q=casle&suggest=true`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  console.log(`        -> ${body.suggestions.length} suggestions`);
});

await test("GET /:handle/search 404 for unknown index", async () => {
  const res = await fetch(`${BASE}/nonexistent/search?q=test`);
  assert(res.status === 404, `Expected 404, got ${res.status}`);
});

await test("GET /:handle/search 400 for bad sort", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/search?q=test&sort={bad}`);
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

await test("GET /:handle/search with boolean filter", async () => {
  const filters = JSON.stringify({ hasImage: true });
  const res = await fetch(
    `${BASE}/${HANDLE}/search?q=&filters=${encodeURIComponent(filters)}`,
  );
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  console.log(`        -> ${body.totalHits} hits with hasImage=true`);
});

await test("GET /:handle/search with histogram", async () => {
  const histogram = JSON.stringify({ placePopulation: 10000 });
  const res = await fetch(
    `${BASE}/${HANDLE}/search?q=&histogram=${encodeURIComponent(histogram)}`,
  );
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  if (body.histograms?.placePopulation) {
    console.log(
      `        -> ${body.histograms.placePopulation.length} histogram buckets`,
    );
  } else {
    console.log("        -> no histogram buckets (field may not exist)");
  }
});

await test("GET /:handle/search 400 for bad histogram", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/search?q=test&histogram={bad}`);
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

await test("GET /:handle/search 400 for zero histogram interval", async () => {
  const histogram = JSON.stringify({ population: 0 });
  const res = await fetch(
    `${BASE}/${HANDLE}/search?q=test&histogram=${encodeURIComponent(histogram)}`,
  );
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

await test("GET /:handle/search with geoGrid", async () => {
  const geoGrid = JSON.stringify({
    field: "placeCoordinates",
    precision: 4,
    bounds: {
      top_left: { lat: 60, lon: -10 },
      bottom_right: { lat: 48, lon: 5 },
    },
  });
  const res = await fetch(
    `${BASE}/${HANDLE}/search?q=&geoGrid=${encodeURIComponent(geoGrid)}`,
  );
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  if (body.geoClusters) {
    console.log(`        -> ${body.geoClusters.length} geo clusters`);
    if (body.geoClusters.length > 0) {
      const c = body.geoClusters[0];
      console.log(
        `        -> first cluster: ${c.count} docs at (${c.lat.toFixed(2)}, ${c.lng.toFixed(2)})`,
      );
    }
  } else {
    console.log(
      "        -> no geo clusters (field may not exist or no docs in bounds)",
    );
  }
});

await test("GET /:handle/search 400 for bad geoGrid", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/search?q=test&geoGrid={bad}`);
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

await test("GET /:handle/search 400 for incomplete geoGrid", async () => {
  const geoGrid = JSON.stringify({ field: "coords" });
  const res = await fetch(
    `${BASE}/${HANDLE}/search?q=test&geoGrid=${encodeURIComponent(geoGrid)}`,
  );
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

// --- Autocomplete ---
console.log("\n--- Autocomplete ---");
await test("GET /:handle/autocomplete", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/autocomplete?q=cas`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert(Array.isArray(body.hits), "Expected hits array");
  assert(typeof body.totalHits === "number", "Expected totalHits");
  assert(body.page === undefined, "Should not have page field");
  console.log(`        -> ${body.hits.length} suggestions`);
});

// --- Documents ---
console.log("\n--- Documents ---");
// First, get a real document ID from search
let docId: string | null = null;
{
  const res = await fetch(`${BASE}/${HANDLE}/search?q=&perPage=1`);
  if (res.ok) {
    const body = await res.json();
    if (body.hits.length > 0) docId = body.hits[0].objectID;
  }
}

await test("GET /:handle/documents/:id returns document", async () => {
  assert(docId !== null, "No document ID found from search");
  const res = await fetch(`${BASE}/${HANDLE}/documents/${docId}`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert(body.objectID === docId, `Expected objectID "${docId}"`);
  console.log(`        -> doc ${docId}: "${body.title ?? "(no title)"}"`);
});

await test("GET /:handle/documents/:id 404 for missing doc", async () => {
  const res = await fetch(
    `${BASE}/${HANDLE}/documents/nonexistent_doc_id_999999`,
  );
  assert(res.status === 404, `Expected 404, got ${res.status}`);
});

// --- Facets ---
console.log("\n--- Facets ---");
await test("GET /:handle/facets/:field returns values", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/facets/placeCountry`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert(body.field === "placeCountry", "Expected field name");
  assert(Array.isArray(body.values), "Expected values array");
  console.log(`        -> ${body.values.length} country values`);
});

await test("GET /:handle/facets/:field with query filter", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/facets/placeCountry?q=sc`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  console.log(`        -> ${body.values.length} values matching "sc"`);
});

await test("GET /:handle/facets/:field with filters", async () => {
  const filters = JSON.stringify({ placeCountry: "Scotland" });
  const res = await fetch(
    `${BASE}/${HANDLE}/facets/placeRegion?filters=${encodeURIComponent(filters)}`,
  );
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  console.log(`        -> ${body.values.length} regions within Scotland`);
});

// --- Mapping (new) ---
console.log("\n--- Mapping ---");
await test("GET /:handle/mapping returns mapping", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/mapping`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  const keys = Object.keys(body);
  assert(keys.length > 0, "Expected at least one index in mapping");
  console.log(`        -> indexes: ${keys.join(", ")}`);
});

await test("GET /:handle/mapping 404 for unknown handle", async () => {
  const res = await fetch(`${BASE}/nonexistent/mapping`);
  assert(res.status === 404, `Expected 404, got ${res.status}`);
});

// --- Raw Query (new) ---
console.log("\n--- Raw Query ---");
await test("POST /:handle/query with match_all", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: { match_all: {} }, size: 2 }),
  });
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert(body.hits !== undefined, "Expected hits in response");
  assert(Array.isArray(body.hits.hits), "Expected hits.hits array");
  console.log(
    `        -> ${body.hits.total?.value ?? body.hits.total} total, ${body.hits.hits.length} returned`,
  );
});

await test("POST /:handle/query with custom DSL", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: "castle",
                fields: ["title^10", "description"],
              },
            },
          ],
        },
      },
      size: 3,
      _source: ["title", "placeCountry"],
    }),
  });
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  console.log(`        -> ${body.hits.hits.length} hits for custom DSL query`);
});

await test("POST /:handle/query with aggregations", async () => {
  const res = await fetch(`${BASE}/${HANDLE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: { match_all: {} },
      size: 0,
      aggs: {
        countries: { terms: { field: "placeCountry", size: 5 } },
      },
    }),
  });
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert(body.aggregations?.countries, "Expected countries aggregation");
  console.log(
    `        -> ${body.aggregations.countries.buckets.length} country buckets`,
  );
});

await test("POST /:handle/query 404 for unknown handle", async () => {
  const res = await fetch(`${BASE}/nonexistent/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: { match_all: {} } }),
  });
  assert(res.status === 404, `Expected 404, got ${res.status}`);
});

// --- Summary ---
console.log(`\n${"=".repeat(40)}`);
console.log(
  `Results: ${passed} passed, ${failed} failed, ${passed + failed} total`,
);
process.exit(failed > 0 ? 1 : 0);
