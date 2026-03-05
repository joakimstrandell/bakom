/** Unified collect entry point. @see docs/collect.md */

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

function parseArgs(): { source?: string; skip: string[]; force: boolean } {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  const source = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;
  const skipIdx = args.indexOf("--skip");
  const skip = skipIdx !== -1 ? (args[skipIdx + 1]?.split(",") ?? []) : [];
  const force = args.includes("--force");
  return { source, skip, force };
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  const { source, skip, force } = parseArgs();

  // Validate --source argument
  if (source) {
    const valid = SOURCES.find((s) => s.name === source);
    if (!valid) {
      const names = SOURCES.map((s) => s.name).join(", ");
      console.error(`Unknown source "${source}". Valid sources: ${names}`);
      process.exit(1);
    }
  }

  // Validate --skip argument
  for (const s of skip) {
    if (!SOURCES.find((src) => src.name === s)) {
      const names = SOURCES.map((src) => src.name).join(", ");
      console.error(`Unknown source to skip "${s}". Valid sources: ${names}`);
      process.exit(1);
    }
  }

  // When running all sources, only run pre-merge sources
  // (post-merge sources like "google" require restaurants.json)
  let toRun = source ? SOURCES.filter((s) => s.name === source) : PRE_MERGE_SOURCES;

  // Apply --skip filter
  if (skip.length > 0) {
    toRun = toRun.filter((s) => !skip.includes(s.name));
  }

  const modeLabel = force ? " (--force)" : "";
  const skipLabel = skip.length > 0 ? ` (skipping: ${skip.join(", ")})` : "";
  console.log(`Collecting ${toRun.length} source(s)${modeLabel}${skipLabel}...\n`);

  // Check if user is trying to run a post-merge source
  const selectedSource = source ? SOURCES.find((s) => s.name === source) : null;
  if (selectedSource?.postMerge) {
    console.log(`Note: "${source}" requires data/restaurants.json (run after merge)\n`);
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
