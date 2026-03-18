/** Refine CLI entry point. @see docs/pipeline.md */

import { refineWithGoogle, categorizeVenue, type EnrichedVenue } from "./google.js";
import { saveData, loadData } from "../utils/save.js";

type RefinedData = { sourceHash: string; venues: EnrichedVenue[] };

async function main() {
  const args = process.argv.slice(2);
  const recategorize = args.includes("--recategorize");
  const force = args.includes("--force");
  const backfill = args.includes("--backfill");

  const idIndex = args.indexOf("--id");
  const targetId = idIndex !== -1 ? args[idIndex + 1] : undefined;

  if (recategorize) {
    // Re-run categorization only — no Google API calls
    const refined = loadData<RefinedData>("venues-refined.json");
    if (!refined) throw new Error("venues-refined.json not found. Run pipeline:refine first.");

    const counts: Record<string, number> = {};
    for (const v of refined.venues) {
      v.category = categorizeVenue(v);
      counts[v.category || "unknown"] = (counts[v.category || "unknown"] || 0) + 1;
    }

    saveData("venues-refined.json", refined);
    console.log("=== Recategorize ===\n");
    console.log("  Categories:");
    for (const [cat, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cat}: ${n}`);
    }
    console.log(`\n  Done — ${refined.venues.length} venues recategorized`);
    return;
  }

  const start = Date.now();
  const venues = await refineWithGoogle({ force, targetId, backfill });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n  Done in ${elapsed}s — ${venues.length} venues`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
