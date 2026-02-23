/**
 * Seed nested `facilities` data into all 4 local search engine indices.
 *
 * Adds a `facilities` nested field to existing place documents — visitor centres,
 * cafes, car parks, gift shops, etc. Each facility has a `name` and `type`.
 *
 * Pass --clean to remove the old HoldingInstitutions field (one-time migration).
 *
 * For ES/OpenSearch: updates the mapping to add a `nested` type field, then
 * bulk-updates documents via partial _update.
 * For Meilisearch: updates filterable attributes and patches documents.
 * For Typesense: patches documents (already has enable_nested_fields: true).
 *
 * Usage:
 *   bun run scripts/seed-nested-data.ts
 *   bun run scripts/seed-nested-data.ts --clean   # also remove old HoldingInstitutions
 */

const ES_HOST = "http://localhost:9200";
const OS_HOST = "http://localhost:9201";
const MEILI_HOST = "http://localhost:7700";
const TYPESENSE_HOST = "http://localhost:8108";
const MEILI_KEY = process.env.MEILI_MASTER_KEY ?? "dev_meilisearch_key";
const TYPESENSE_KEY = process.env.TYPESENSE_API_KEY ?? "dev_typesense_key";
const INDEX = "craft_search_plugin_labs";
const CLEAN = process.argv.includes("--clean");

// Facility types used across places — gives meaningful facet counts.
// Types: visitor_centre, cafe, parking, shop, toilets, guided_tour, audio_guide, playground, picnic_area

const facilityData: Record<string, { name: string; type: string }[]> = {
  // ── Scotland ──────────────────────────────────────────────────────
  "516": [
    // Callanish Stones
    { name: "Callanish Visitor Centre", type: "visitor_centre" },
    { name: "Stones Cafe", type: "cafe" },
    { name: "Callanish Car Park", type: "parking" },
    { name: "Visitor Centre Shop", type: "shop" },
  ],
  "502": [
    // Glencoe
    { name: "Glencoe Visitor Centre", type: "visitor_centre" },
    { name: "Glencoe Cafe", type: "cafe" },
    { name: "Main Car Park", type: "parking" },
    { name: "Picnic Area", type: "picnic_area" },
  ],
  "500": [
    // St Andrews
    { name: "St Andrews Museum", type: "visitor_centre" },
    { name: "Castle Gift Shop", type: "shop" },
    { name: "Public Toilets", type: "toilets" },
    { name: "Town Centre Parking", type: "parking" },
  ],
  "498": [
    // Stirling Castle
    { name: "Castle Exhibition", type: "visitor_centre" },
    { name: "Unicorn Cafe", type: "cafe" },
    { name: "Castle Gift Shop", type: "shop" },
    { name: "Castle Esplanade Car Park", type: "parking" },
    { name: "Audio Guide", type: "audio_guide" },
    { name: "Guided Tours", type: "guided_tour" },
  ],
  "496": [
    // Isle of Skye
    { name: "Portree Car Park", type: "parking" },
    { name: "Fairy Pools Picnic Area", type: "picnic_area" },
  ],
  "494": [
    // Loch Ness
    { name: "Loch Ness Centre", type: "visitor_centre" },
    { name: "Nessie Gift Shop", type: "shop" },
    { name: "Drumnadrochit Parking", type: "parking" },
    { name: "Lochside Cafe", type: "cafe" },
  ],
  "492": [
    // Edinburgh Castle
    { name: "Crown Jewels Exhibition", type: "visitor_centre" },
    { name: "Redcoat Cafe", type: "cafe" },
    { name: "Castle Gift Shop", type: "shop" },
    { name: "Audio Guide", type: "audio_guide" },
    { name: "Guided Tours", type: "guided_tour" },
    { name: "Toilets", type: "toilets" },
  ],
  // ── England ───────────────────────────────────────────────────────
  "488": [
    // York Minster
    { name: "Undercroft Museum", type: "visitor_centre" },
    { name: "Minster Gift Shop", type: "shop" },
    { name: "Guided Tours", type: "guided_tour" },
    { name: "Toilets", type: "toilets" },
  ],
  "486": [
    // Stratford-upon-Avon
    { name: "Shakespeare Visitor Centre", type: "visitor_centre" },
    { name: "Stratford Gift Shop", type: "shop" },
    { name: "Riverside Cafe", type: "cafe" },
    { name: "Town Centre Parking", type: "parking" },
    { name: "Guided Tours", type: "guided_tour" },
  ],
  "484": [
    // Brighton Pavilion
    { name: "Pavilion Gift Shop", type: "shop" },
    { name: "Audio Guide", type: "audio_guide" },
    { name: "Pavilion Cafe", type: "cafe" },
    { name: "Toilets", type: "toilets" },
  ],
  "482": [
    // Hadrian's Wall
    { name: "Housesteads Visitor Centre", type: "visitor_centre" },
    { name: "Wall Cafe", type: "cafe" },
    { name: "Housesteads Car Park", type: "parking" },
    { name: "Picnic Area", type: "picnic_area" },
    { name: "Toilets", type: "toilets" },
  ],
  "480": [
    // Durham Cathedral
    { name: "Cathedral Shop", type: "shop" },
    { name: "Undercroft Cafe", type: "cafe" },
    { name: "Guided Tours", type: "guided_tour" },
    { name: "Toilets", type: "toilets" },
  ],
  "478": [
    // Lake Windermere
    { name: "Brockhole Visitor Centre", type: "visitor_centre" },
    { name: "Lakeside Cafe", type: "cafe" },
    { name: "Brockhole Car Park", type: "parking" },
    { name: "Adventure Playground", type: "playground" },
    { name: "Picnic Area", type: "picnic_area" },
  ],
  "476": [
    // Canterbury Cathedral
    { name: "Cathedral Welcome Centre", type: "visitor_centre" },
    { name: "Cathedral Gift Shop", type: "shop" },
    { name: "Audio Guide", type: "audio_guide" },
    { name: "Guided Tours", type: "guided_tour" },
    { name: "Toilets", type: "toilets" },
  ],
  "474": [
    // Roman Baths
    { name: "Roman Baths Museum", type: "visitor_centre" },
    { name: "Pump Room Restaurant", type: "cafe" },
    { name: "Roman Baths Gift Shop", type: "shop" },
    { name: "Audio Guide", type: "audio_guide" },
  ],
  "472": [
    // Stonehenge
    { name: "Stonehenge Visitor Centre", type: "visitor_centre" },
    { name: "Stonehenge Cafe", type: "cafe" },
    { name: "Stonehenge Gift Shop", type: "shop" },
    { name: "Main Car Park", type: "parking" },
    { name: "Audio Guide", type: "audio_guide" },
    { name: "Toilets", type: "toilets" },
    { name: "Picnic Area", type: "picnic_area" },
  ],
  "470": [
    // Buckingham Palace
    { name: "State Rooms Exhibition", type: "visitor_centre" },
    { name: "Palace Gift Shop", type: "shop" },
    { name: "Garden Cafe", type: "cafe" },
    { name: "Audio Guide", type: "audio_guide" },
  ],
  "468": [
    // Tower of London
    { name: "Crown Jewels Exhibition", type: "visitor_centre" },
    { name: "Tower Cafe", type: "cafe" },
    { name: "Raven Gift Shop", type: "shop" },
    { name: "Yeoman Warder Tours", type: "guided_tour" },
    { name: "Audio Guide", type: "audio_guide" },
    { name: "Toilets", type: "toilets" },
  ],
  "629": [
    // Tintagel Castle
    { name: "Tintagel Visitor Centre", type: "visitor_centre" },
    { name: "Castle Car Park", type: "parking" },
    { name: "Beach Cafe", type: "cafe" },
    { name: "Toilets", type: "toilets" },
  ],
  "490": [
    // Bodiam Castle
    { name: "Castle Tea Room", type: "cafe" },
    { name: "Bodiam Gift Shop", type: "shop" },
    { name: "Castle Car Park", type: "parking" },
    { name: "Picnic Area", type: "picnic_area" },
    { name: "Adventure Playground", type: "playground" },
  ],
  // ── Wales ─────────────────────────────────────────────────────────
  "510": [
    // Brecon Beacons
    { name: "Mountain Centre", type: "visitor_centre" },
    { name: "Mountain Cafe", type: "cafe" },
    { name: "Storey Arms Car Park", type: "parking" },
    { name: "Picnic Area", type: "picnic_area" },
  ],
  "509": [
    // Pembrokeshire Coast
    { name: "Pembrokeshire Visitor Centre", type: "visitor_centre" },
    { name: "Coastal Car Park", type: "parking" },
    { name: "Picnic Area", type: "picnic_area" },
    { name: "Toilets", type: "toilets" },
  ],
  "508": [
    // Conwy Castle
    { name: "Castle Exhibition", type: "visitor_centre" },
    { name: "Castle Gift Shop", type: "shop" },
    { name: "Audio Guide", type: "audio_guide" },
    { name: "Town Car Park", type: "parking" },
    { name: "Toilets", type: "toilets" },
  ],
  "506": [
    // Snowdon
    { name: "Hafod Eryri Summit Cafe", type: "cafe" },
    { name: "Pen-y-Pass Car Park", type: "parking" },
    { name: "Toilets", type: "toilets" },
  ],
  "504": [
    // Caernarfon Castle
    { name: "Castle Exhibition", type: "visitor_centre" },
    { name: "Castle Gift Shop", type: "shop" },
    { name: "Guided Tours", type: "guided_tour" },
    { name: "Castle Car Park", type: "parking" },
    { name: "Toilets", type: "toilets" },
  ],
  // ── Northern Ireland ──────────────────────────────────────────────
  "515": [
    // Dunluce Castle
    { name: "Dunluce Visitor Centre", type: "visitor_centre" },
    { name: "Castle Car Park", type: "parking" },
    { name: "Toilets", type: "toilets" },
  ],
  "514": [
    // Dark Hedges
    { name: "Hedges Car Park", type: "parking" },
  ],
  "513": [
    // Carrick-a-Rede Rope Bridge
    { name: "Rope Bridge Tea Room", type: "cafe" },
    { name: "Rope Bridge Gift Shop", type: "shop" },
    { name: "Visitor Car Park", type: "parking" },
    { name: "Toilets", type: "toilets" },
  ],
  "512": [
    // Titanic Belfast
    { name: "Titanic Exhibition", type: "visitor_centre" },
    { name: "Titanic Cafe", type: "cafe" },
    { name: "Titanic Gift Shop", type: "shop" },
    { name: "Audio Guide", type: "audio_guide" },
    { name: "Guided Tours", type: "guided_tour" },
    { name: "Titanic Car Park", type: "parking" },
  ],
  "511": [
    // Giant's Causeway
    { name: "Giant's Causeway Visitor Centre", type: "visitor_centre" },
    { name: "Causeway Cafe", type: "cafe" },
    { name: "Causeway Gift Shop", type: "shop" },
    { name: "Main Car Park", type: "parking" },
    { name: "Audio Guide", type: "audio_guide" },
    { name: "Toilets", type: "toilets" },
  ],
};

let passed = 0;
let failed = 0;

function ok(label: string) {
  passed++;
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
}

function fail(label: string, err: unknown) {
  failed++;
  console.log(`  \x1b[31m✗\x1b[0m ${label}: ${err}`);
}

// ── Elasticsearch / OpenSearch ──────────────────────────────────────────

async function seedElasticCompat(host: string, label: string) {
  console.log(`\n${label} (${host})`);

  // Clean old HoldingInstitutions field if --clean
  if (CLEAN) {
    try {
      const res = await fetch(`${host}/${INDEX}/_update_by_query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: {
            source: "ctx._source.remove('HoldingInstitutions')",
            lang: "painless",
          },
          query: { exists: { field: "HoldingInstitutions" } },
        }),
      });
      if (res.ok) ok("removed old HoldingInstitutions field");
      else fail("remove HoldingInstitutions", `${res.status}: ${await res.text()}`);
    } catch (e) {
      fail("remove HoldingInstitutions", e);
    }
  }

  // 1. Update mapping to add facilities as nested type
  try {
    const res = await fetch(`${host}/${INDEX}/_mapping`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: {
          facilities: {
            type: "nested",
            properties: {
              name: {
                type: "text",
                fields: { keyword: { type: "keyword", ignore_above: 256 } },
              },
              type: { type: "keyword" },
            },
          },
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (!body.includes("already exists")) {
        fail("update mapping", `${res.status}: ${body}`);
        return;
      }
    }
    ok("update mapping → nested facilities");
  } catch (e) {
    fail("update mapping", e);
    return;
  }

  // 2. Bulk update documents with facilities
  let updated = 0;
  for (const [id, facilities] of Object.entries(facilityData)) {
    try {
      const res = await fetch(`${host}/${INDEX}/_update/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc: { facilities },
        }),
      });
      if (!res.ok) {
        fail(`update doc ${id}`, `${res.status}: ${await res.text()}`);
      } else {
        updated++;
      }
    } catch (e) {
      fail(`update doc ${id}`, e);
    }
  }
  ok(`updated ${updated}/${Object.keys(facilityData).length} documents`);

  // 3. Refresh index
  try {
    await fetch(`${host}/${INDEX}/_refresh`, { method: "POST" });
    ok("refresh index");
  } catch (e) {
    fail("refresh index", e);
  }
}

// ── Meilisearch ─────────────────────────────────────────────────────────

async function seedMeilisearch() {
  console.log(`\nMeilisearch (${MEILI_HOST})`);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${MEILI_KEY}`,
  };

  // 1. Update filterable attributes to include facilities fields
  try {
    // Get current filterable attributes first
    const current = await fetch(
      `${MEILI_HOST}/indexes/${INDEX}/settings/filterable-attributes`,
      { headers },
    );
    const attrs: string[] = current.ok ? await current.json() : [];
    const newAttrs = new Set(attrs);
    // Remove old HoldingInstitutions if --clean
    if (CLEAN) {
      newAttrs.delete("HoldingInstitutions.name");
      newAttrs.delete("HoldingInstitutions.role");
    }
    newAttrs.add("facilities.name");
    newAttrs.add("facilities.type");

    const res = await fetch(
      `${MEILI_HOST}/indexes/${INDEX}/settings/filterable-attributes`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify([...newAttrs]),
      },
    );
    if (!res.ok) {
      fail("update filterable attributes", `${res.status}: ${await res.text()}`);
    } else {
      ok("update filterable attributes → added facilities");
    }
  } catch (e) {
    fail("update filterable attributes", e);
  }

  // 2. Patch documents with facilities
  // Meilisearch primary key is `id`, not `objectID`
  const docs = Object.entries(facilityData).map(([id, facilities]) => ({
    id,
    facilities,
  }));

  try {
    const res = await fetch(`${MEILI_HOST}/indexes/${INDEX}/documents`, {
      method: "PUT",
      headers,
      body: JSON.stringify(docs),
    });
    if (!res.ok) {
      fail("update documents", `${res.status}: ${await res.text()}`);
    } else {
      ok(`updated ${docs.length} documents`);
    }
  } catch (e) {
    fail("update documents", e);
  }

  // 3. Wait for tasks to complete
  await new Promise((r) => setTimeout(r, 2000));
  ok("waited for indexing");
}

// ── Typesense ───────────────────────────────────────────────────────────

async function seedTypesense() {
  console.log(`\nTypesense (${TYPESENSE_HOST})`);
  const headers = {
    "Content-Type": "application/json",
    "X-TYPESENSE-API-KEY": TYPESENSE_KEY,
  };

  let updated = 0;
  for (const [id, facilities] of Object.entries(facilityData)) {
    try {
      const res = await fetch(
        `${TYPESENSE_HOST}/collections/${INDEX}/documents/${id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ facilities }),
        },
      );
      if (!res.ok) {
        fail(`update doc ${id}`, `${res.status}: ${await res.text()}`);
      } else {
        updated++;
      }
    } catch (e) {
      fail(`update doc ${id}`, e);
    }
  }
  ok(`updated ${updated}/${Object.keys(facilityData).length} documents`);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding facilities nested data to all local indices...");
  if (CLEAN) console.log("(--clean: will also remove old HoldingInstitutions field)");

  await seedElasticCompat(ES_HOST, "Elasticsearch");
  await seedElasticCompat(OS_HOST, "OpenSearch");
  await seedMeilisearch();
  await seedTypesense();

  console.log(
    `\nDone: ${passed} passed, ${failed} failed out of ${passed + failed} operations.`,
  );
  if (failed > 0) process.exit(1);
}

main();
