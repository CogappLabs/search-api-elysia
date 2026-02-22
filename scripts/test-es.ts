/**
 * Diagnose ES connectivity — tests both native fetch and the ES client.
 * Usage: bun run scripts/test-es.ts
 */
const host = process.env.ELASTICSEARCH_URL;
const username = process.env.ELASTICSEARCH_USERNAME;
const password = process.env.ELASTICSEARCH_PASSWORD;

console.log("Host:", host);
console.log("Username:", username ? `${username.slice(0, 3)}...` : "(empty)");
console.log("Password:", password ? "***" : "(empty)");
console.log();

// Test 1: native fetch
console.log("--- Test 1: native fetch ---");
try {
  const headers: Record<string, string> = {};
  if (username) {
    headers.Authorization = `Basic ${btoa(`${username}:${password}`)}`;
  }
  const res = await fetch(`${host}/_cat/indices?v`, { headers });
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
} catch (err) {
  console.error("Fetch error:", err);
}

// Test 2: ES client
console.log("\n--- Test 2: ES client ---");
try {
  const { Client } = await import("@elastic/elasticsearch");
  const auth = username ? { username, password: password ?? "" } : undefined;
  const client = new Client({ node: host, ...(auth ? { auth } : {}) });
  const info = await client.info();
  console.log("Cluster:", info.cluster_name, "Version:", info.version.number);
} catch (err) {
  console.error("ES client error:", err);
}
