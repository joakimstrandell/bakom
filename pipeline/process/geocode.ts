/**
 * Geocode restaurants that are still missing coordinates.
 * This is mainly for restaurants where Google Places didn't return results.
 * Uses OpenStreetMap Nominatim (1 request/second rate limit).
 *
 * Reads and updates: data/restaurants.json
 *
 * CLI: tsx pipeline/process/geocode.ts
 */

import { sleep, loadJson, saveJson } from "../utils/fetch.js";
import { geocodeAddress } from "../utils/geocode.js";
import type { Restaurant } from "../../src/types.js";

export async function geocodeAll(): Promise<void> {
  const restaurants = loadJson<Restaurant[]>("restaurants.json");
  if (!restaurants) {
    throw new Error("data/restaurants.json not found. Run scrape:merge first.");
  }

  console.log(`=== Geocoding ${restaurants.length} restaurants ===\n`);

  let geocoded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < restaurants.length; i++) {
    const r = restaurants[i];

    // Skip if already has coordinates
    if (r.lat && r.lng) {
      skipped++;
      continue;
    }

    // Skip if no address
    if (!r.address) {
      console.log(
        `[${i + 1}/${restaurants.length}] ${r.name} — no address, skipping`
      );
      failed++;
      continue;
    }

    console.log(
      `[${i + 1}/${restaurants.length}] ${r.name} — ${r.address}`
    );
    const coords = await geocodeAddress(r.address, r.postalCode, r.city);

    if (coords) {
      r.lat = coords.lat;
      r.lng = coords.lng;
      geocoded++;
    } else {
      failed++;
    }

    // Nominatim rate limit: max 1 req/sec
    await sleep(1100);

    // Save progress every 50 restaurants
    if (i % 50 === 49) {
      saveJson("restaurants.json", restaurants);
      console.log(`  [progress saved — ${geocoded} geocoded so far]`);
    }
  }

  // Final save
  saveJson("restaurants.json", restaurants);

  console.log(`\nGeocoding complete:`);
  console.log(`  Geocoded: ${geocoded}`);
  console.log(`  Already had coords: ${skipped}`);
  console.log(`  Failed: ${failed}`);
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("geocode")) {
  geocodeAll().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
