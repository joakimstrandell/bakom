/**
 * Find potential duplicate restaurants in restaurants.json
 */

import { loadJson } from "./utils/fetch.js";
import { similarityRatio } from "./utils/fuzzy.js";
import { normalizeName } from "./utils/match.js";
import type { Restaurant } from "../src/types.js";

// CLI: tsx pipeline/find-duplicates.ts

const data = loadJson<Restaurant[]>("restaurants.json");
if (!data) {
  console.error("Could not load restaurants.json");
  process.exit(1);
}

// Build list of normalized names with their original entries
const entries = data.map((r, i) => ({
  index: i,
  name: r.name,
  normalized: normalizeName(r.name),
  address: r.address,
  sources: r.sources,
}));

// Find potential duplicates (similarity > 0.8)
const duplicates: {
  a: string;
  b: string;
  similarity: string;
  addrA: string;
  addrB: string;
  sourcesA: string[];
  sourcesB: string[];
}[] = [];

for (let i = 0; i < entries.length; i++) {
  for (let j = i + 1; j < entries.length; j++) {
    const sim = similarityRatio(entries[i].normalized, entries[j].normalized);
    if (sim > 0.8) {
      duplicates.push({
        a: entries[i].name,
        b: entries[j].name,
        similarity: (sim * 100).toFixed(0) + "%",
        addrA: entries[i].address?.slice(0, 35) || "(no addr)",
        addrB: entries[j].address?.slice(0, 35) || "(no addr)",
        sourcesA: entries[i].sources,
        sourcesB: entries[j].sources,
      });
    }
  }
}

console.log("Potential duplicates (name similarity > 80%):\n");
duplicates.sort((a, b) => parseFloat(b.similarity) - parseFloat(a.similarity));

for (const d of duplicates) {
  console.log(`[${d.similarity}] "${d.a}" vs "${d.b}"`);
  console.log(`        ${d.addrA} [${d.sourcesA.join(", ")}]`);
  console.log(`        ${d.addrB} [${d.sourcesB.join(", ")}]`);
  console.log();
}

console.log(`Total potential duplicates found: ${duplicates.length}`);
