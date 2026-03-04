/**
 * Unified collect entry point.
 * Runs one or all source collectors with incremental or force mode.
 *
 * CLI:
 *   tsx pipeline/collect.ts                      # run all sources
 *   tsx pipeline/collect.ts --source krogguiden   # run just one
 *   tsx pipeline/collect.ts --force               # force full re-fetch for slow scrapers
 *   tsx pipeline/collect.ts --source svd --force  # force one specific source
 *
 * npm scripts:
 *   npm run pipeline:collect
 *   npm run pipeline:collect --source krogguiden
 *   npm run pipeline:collect --force
 */

import { scrapeKrogguiden } from "./collect/krogguiden.js";
import { scrapeMichelin } from "./collect/michelin.js";
import { scrapeWhiteGuide } from "./collect/whiteguide.js";
import { scrapeSvd } from "./collect/svd.js";
import { scrapeDn } from "./collect/dn.js";
import { scrapeDi } from "./collect/di.js";

// ─── Source registry ─────────────────────────────────────────────

type SourceConfig = {
  name: string;
  fn: (options?: { force?: boolean }) => Promise<unknown>;
  /** Fast APIs always re-fetch; slow scrapers default to incremental */
  fast: boolean;
};

const SOURCES: SourceConfig[] = [
  { name: "krogguiden", fn: scrapeKrogguiden, fast: false },
  { name: "michelin", fn: scrapeMichelin, fast: false },
  { name: "whiteguide", fn: scrapeWhiteGuide, fast: true },
  { name: "svd", fn: scrapeSvd, fast: false },
  { name: "dn", fn: scrapeDn, fast: false },
  { name: "di", fn: scrapeDi, fast: true },
];

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

  const toRun = source
    ? SOURCES.filter((s) => s.name === source)
    : SOURCES;

  const modeLabel = force ? " (--force)" : "";
  console.log(
    `Collecting ${toRun.length} source(s)${modeLabel}...\n`,
  );

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
