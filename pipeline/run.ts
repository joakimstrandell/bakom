/**
 * Full data pipeline: runs all steps in sequence.
 *
 * Pipeline: krogguiden → michelin → whiteguide → merge → google (refine) → geocode
 *
 * CLI: tsx pipeline/run.ts
 */

import { scrapeKrogguiden } from "./collect/krogguiden.js";
import { scrapeMichelin } from "./collect/michelin.js";
import { scrapeWhiteGuide } from "./collect/whiteguide.js";
import { refineWithGoogle } from "./collect/google.js";
import { merge } from "./process/merge.js";
import { geocodeAll } from "./process/geocode.js";

async function main() {
  const start = Date.now();
  console.log("╔══════════════════════════════════════╗");
  console.log("║   Stockholm Restaurant Scraper       ║");
  console.log("╚══════════════════════════════════════╝\n");

  // Step 1: Scrape Krogguiden
  console.log("━━━ Step 1/6: Krogguiden ━━━\n");
  await scrapeKrogguiden();

  // Step 2: Scrape Michelin Guide
  console.log("\n━━━ Step 2/6: Michelin Guide ━━━\n");
  await scrapeMichelin();

  // Step 3: Scrape White Guide
  console.log("\n━━━ Step 3/6: White Guide ━━━\n");
  await scrapeWhiteGuide();

  // Step 4: Merge all sources
  console.log("\n━━━ Step 4/6: Merge ━━━\n");
  await merge();

  // Step 5: Refine with Google Places API
  console.log("\n━━━ Step 5/6: Google Places (refine) ━━━\n");
  try {
    await refineWithGoogle();
  } catch (err) {
    if ((err as Error).message?.includes("GOOGLE_PLACES_API_KEY")) {
      console.log("⚠️  Skipping Google Places (no API key set)");
      console.log("   Set GOOGLE_PLACES_API_KEY to enable this step.\n");
    } else {
      throw err;
    }
  }

  // Step 6: Geocode missing coordinates
  console.log("\n━━━ Step 6/6: Geocode ━━━\n");
  await geocodeAll();

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Pipeline complete in ${elapsed} minutes`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
