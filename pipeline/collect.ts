/**
 * Unified collect entry point.
 * Runs one or all source collectors with incremental or force mode.
 *
 * Pre-merge sources (run without --source): krogguiden, michelin, whiteguide, svd, dn, di
 * Post-merge sources (must specify --source): google
 *
 * CLI:
 *   tsx pipeline/collect.ts                        # run all pre-merge sources
 *   tsx pipeline/collect.ts --source krogguiden    # run just one
 *   tsx pipeline/collect.ts --source google        # run Google (requires restaurants.json)
 *   tsx pipeline/collect.ts --force                # force full re-fetch for slow scrapers
 *   tsx pipeline/collect.ts --source svd --force   # force one specific source
 *
 * npm scripts:
 *   npm run pipeline:collect
 *   npm run pipeline:collect --source krogguiden
 *   npm run pipeline:collect --source google --force
 */

import { scrapeKrogguiden } from "./collect/krogguiden.js";
import { scrapeMichelin } from "./collect/michelin.js";
import { scrapeWhiteGuide } from "./collect/whiteguide.js";
import { scrapeSvd } from "./collect/svd.js";
import { scrapeDn } from "./collect/dn.js";
import { scrapeDi } from "./collect/di.js";
import { collectGoogle } from "./collect/google.js";

// ─── Source registry ─────────────────────────────────────────────

type SourceConfig = {
  name: string;
  fn: (options?: { force?: boolean }) => Promise<unknown>;
  /** Fast APIs always re-fetch; slow scrapers default to incremental */
  fast: boolean;
  /** If true, this source requires restaurants.json (must run after merge) */
  postMerge?: boolean;
};

/** Pre-merge sources: scrape external data → raw/*.json */
const PRE_MERGE_SOURCES: SourceConfig[] = [
  { name: "krogguiden", fn: scrapeKrogguiden, fast: false },
  { name: "michelin", fn: scrapeMichelin, fast: false },
  { name: "whiteguide", fn: scrapeWhiteGuide, fast: true },
  { name: "svd", fn: scrapeSvd, fast: false },
  { name: "dn", fn: scrapeDn, fast: false },
  { name: "di", fn: scrapeDi, fast: true },
];

/** Post-merge sources: enrich based on restaurants.json */
const POST_MERGE_SOURCES: SourceConfig[] = [
  { name: "google", fn: collectGoogle, fast: false, postMerge: true },
];

const SOURCES: SourceConfig[] = [...PRE_MERGE_SOURCES, ...POST_MERGE_SOURCES];

// ─── CLI argument parsing ────────────────────────────────────────

function parseArgs(): { source?: string; force: boolean } {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  const source = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;
  const force = args.includes("--force");
  return { source, force };
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const { source, force } = parseArgs();

  // Validate --source argument
  if (source) {
    const valid = SOURCES.find((s) => s.name === source);
    if (!valid) {
      const names = SOURCES.map((s) => s.name).join(", ");
      console.error(`Unknown source "${source}". Valid sources: ${names}`);
      process.exit(1);
    }
  }

  // When running all sources, only run pre-merge sources
  // (post-merge sources like "google" require restaurants.json)
  const toRun = source
    ? SOURCES.filter((s) => s.name === source)
    : PRE_MERGE_SOURCES;

  const modeLabel = force ? " (--force)" : "";
  console.log(
    `Collecting ${toRun.length} source(s)${modeLabel}...\n`,
  );

  // Check if user is trying to run a post-merge source
  const selectedSource = source ? SOURCES.find((s) => s.name === source) : null;
  if (selectedSource?.postMerge) {
    console.log(
      `Note: "${source}" requires data/restaurants.json (run after merge)\n`
    );
  }

  for (const config of toRun) {
    const start = Date.now();

    // Fast APIs always re-fetch. Slow scrapers respect --force.
    const shouldForce = force || config.fast;
    await config.fn({ force: shouldForce });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n--- ${config.name} done (${elapsed}s) ---\n`);
  }

  console.log("Collection complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
