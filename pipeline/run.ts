/**
 * Full data pipeline: runs all steps in sequence.
 *
 * Pipeline: collect → merge → google → refine → optimize
 *
 * Google Places requires GOOGLE_PLACES_API_KEY environment variable.
 * If not set, Google collection is skipped with a warning.
 *
 * CLI: tsx pipeline/run.ts
 */

import { scrapeKrogguiden } from "./collect/krogguiden.js";
import { scrapeMichelin } from "./collect/michelin.js";
import { scrapeWhiteGuide } from "./collect/whiteguide.js";
import { scrapeSvd } from "./collect/svd.js";
import { scrapeDn } from "./collect/dn.js";
import { scrapeDi } from "./collect/di.js";
import { collectGoogle } from "./collect/google.js";
import { merge } from "./process/merge.js";
import { refine } from "./process/refine.js";
import { optimize } from "./process/optimize.js";

async function main() {
  const start = Date.now();
  console.log("╔══════════════════════════════════════╗");
  console.log("║   Stockholm Restaurant Pipeline      ║");
  console.log("╚══════════════════════════════════════╝\n");

  // ── Collect ────────────────────────────────────────────────────

  console.log("━━━ Step 1/10: Krogguiden ━━━\n");
  await scrapeKrogguiden();

  console.log("\n━━━ Step 2/10: Michelin Guide ━━━\n");
  await scrapeMichelin();

  console.log("\n━━━ Step 3/10: White Guide ━━━\n");
  await scrapeWhiteGuide();

  console.log("\n━━━ Step 4/10: SvD Krogguiden ━━━\n");
  await scrapeSvd();

  console.log("\n━━━ Step 5/10: DN Krogkommissionen ━━━\n");
  await scrapeDn();

  console.log("\n━━━ Step 6/10: DI Weekend ━━━\n");
  await scrapeDi();

  // ── Merge ──────────────────────────────────────────────────────

  console.log("\n━━━ Step 7/10: Merge ━━━\n");
  await merge();

  // ── Google Places (post-merge) ─────────────────────────────────

  console.log("\n━━━ Step 8/10: Google Places ━━━\n");
  if (process.env.GOOGLE_PLACES_API_KEY) {
    await collectGoogle();
  } else {
    console.log("⚠️  Skipping Google Places (no GOOGLE_PLACES_API_KEY set)\n");
    console.log("  Set it with: export GOOGLE_PLACES_API_KEY=your_key_here\n");
  }

  // ── Refine ─────────────────────────────────────────────────────

  console.log("\n━━━ Step 9/10: Refine ━━━\n");
  await refine();

  // ── Optimize ───────────────────────────────────────────────────

  console.log("\n━━━ Step 10/10: Optimize ━━━\n");
  optimize();

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Pipeline complete in ${elapsed} minutes`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
