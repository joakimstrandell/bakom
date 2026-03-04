/**
 * Full data pipeline: runs all steps in sequence.
 *
 * Pipeline: collect → merge → refine → optimize
 *
 * CLI: tsx pipeline/run.ts
 */

import { scrapeKrogguiden } from "./collect/krogguiden.js";
import { scrapeMichelin } from "./collect/michelin.js";
import { scrapeWhiteGuide } from "./collect/whiteguide.js";
import { scrapeSvd } from "./collect/svd.js";
import { scrapeDn } from "./collect/dn.js";
import { scrapeDi } from "./collect/di.js";
import { merge } from "./process/merge.js";
import { refine } from "./process/refine.js";
import { optimize } from "./process/optimize.js";

async function main() {
  const start = Date.now();
  console.log("╔══════════════════════════════════════╗");
  console.log("║   Stockholm Restaurant Pipeline      ║");
  console.log("╚══════════════════════════════════════╝\n");

  // ── Collect ────────────────────────────────────────────────────

  console.log("━━━ Step 1/9: Krogguiden ━━━\n");
  await scrapeKrogguiden();

  console.log("\n━━━ Step 2/9: Michelin Guide ━━━\n");
  await scrapeMichelin();

  console.log("\n━━━ Step 3/9: White Guide ━━━\n");
  await scrapeWhiteGuide();

  console.log("\n━━━ Step 4/9: SvD Krogguiden ━━━\n");
  await scrapeSvd();

  console.log("\n━━━ Step 5/9: DN Krogkommissionen ━━━\n");
  await scrapeDn();

  console.log("\n━━━ Step 6/9: DI Weekend ━━━\n");
  await scrapeDi();

  // ── Merge ──────────────────────────────────────────────────────

  console.log("\n━━━ Step 7/9: Merge ━━━\n");
  await merge();

  // ── Refine ─────────────────────────────────────────────────────

  console.log("\n━━━ Step 8/9: Refine ━━━\n");
  await refine();

  // ── Optimize ───────────────────────────────────────────────────

  console.log("\n━━━ Step 9/9: Optimize ━━━\n");
  optimize();

  const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
  console.log(`\n✅ Pipeline complete in ${elapsed} minutes`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
