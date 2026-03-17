/** pipeline2 collect — CLI entry point.
 *
 * Usage: npx tsx pipeline2/collect/index.ts [--source <id>] [--force] [--skip-normalize]
 */

import { collectWhiteGuideEntries, collectWhiteGuideNews } from "./whiteguide.js";
import { collectDnReviews } from "./dn.js";
import { collectSvdReviews } from "./svd.js";
import { collectMichelin } from "./michelin.js";
import { collectDi } from "./di.js";
import { collectKrogguiden } from "./krogguiden.js";
import { getSources, getSourceIds } from "../sources/registry.js";
import { loadArticles, saveArticles } from "../utils/save.js";
import {
  normalizeAddress,
  normalizeVenueName,
  normalizePriceRange,
  normalizeCity,
  isCityHeader,
} from "../utils/normalize.js";
import type { Article, SubArticle } from "../types.js";

// ─── Source collector registry ──────────────────────────────────

type Collector = (options: { force?: boolean }) => Promise<unknown>;

const COLLECTORS: Record<string, Collector> = {
  "whiteguide-review": async () => collectWhiteGuideEntries(),
  "whiteguide-news": async () => collectWhiteGuideNews(),
  "dn-review": async () => collectDnReviews(),
  "svd-review": async () => collectSvdReviews(),
  michelin: async () => collectMichelin(),
  di: async () => collectDi(),
  krogguiden: async ({ force }) => collectKrogguiden({ force }),
};

// ─── Re-normalize existing data ─────────────────────────────────

/** Normalize a single article's fields in-place */
function normalizeArticle(a: Article): Article {
  if (a.venueName) a.venueName = normalizeVenueName(a.venueName);
  if (a.venueAddress) a.venueAddress = normalizeAddress(a.venueAddress);
  if (a.venueCity) a.venueCity = normalizeCity(a.venueCity);
  if (a.priceRange) a.priceRange = normalizePriceRange(a.priceRange);

  // Normalize sub-articles (DN listings)
  if (a.subArticles) {
    a.subArticles = a.subArticles
      .filter((sub: SubArticle) => !isCityHeader(sub.venueName))
      .map((sub: SubArticle) => ({
        ...sub,
        venueName: normalizeVenueName(sub.venueName),
        venueAddress: sub.venueAddress
          ? normalizeAddress(sub.venueAddress)
          : undefined,
        venueCity: sub.venueCity
          ? normalizeCity(sub.venueCity)
          : undefined,
        priceRange: sub.priceRange
          ? normalizePriceRange(sub.priceRange)
          : undefined,
      }));
  }

  return a;
}

/** Data files that contain articles */
const DATA_FILES = [
  "svd-review.json",
  "dn-review.json",
  "whiteguide-review.json",
  "whiteguide-news.json",
  "michelin.json",
  "di.json",
  "krogguiden.json",
];

async function runNormalize() {
  console.log("pipeline2: re-normalizing existing data...\n");

  for (const file of DATA_FILES) {
    const articles = loadArticles<Article[]>(file);
    if (!articles || articles.length === 0) {
      console.log(`  ${file}: no data, skipping`);
      continue;
    }

    let changes = 0;
    for (const a of articles) {
      const before = JSON.stringify(a);
      normalizeArticle(a);
      if (JSON.stringify(a) !== before) changes++;
    }

    if (changes > 0) {
      saveArticles(file, articles);
      console.log(`  ${file}: normalized ${changes}/${articles.length} articles`);
    } else {
      console.log(`  ${file}: ${articles.length} articles, no changes needed`);
    }
  }

  console.log("\nNormalization complete.");
}

// ─── CLI ────────────────────────────────────────────────────────

function parseArgs(): { source?: string; force: boolean; skipNormalize: boolean } {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  const source = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;
  const force = args.includes("--force");
  const skipNormalize = args.includes("--skip-normalize");
  return { source, force, skipNormalize };
}

async function main() {
  const { source, force, skipNormalize } = parseArgs();
  const validIds = getSourceIds();

  if (source && !validIds.includes(source)) {
    console.error(`Unknown source "${source}". Valid: ${validIds.join(", ")}`);
    process.exit(1);
  }

  const toRun = source ? [source] : getSources().map((s) => s.id);

  console.log(`pipeline2: collecting ${toRun.length} source(s)...\n`);

  for (const id of toRun) {
    const collector = COLLECTORS[id];
    if (!collector) {
      console.log(`  No collector for "${id}", skipping`);
      continue;
    }

    const start = Date.now();
    await collector({ force });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n--- ${id} done (${elapsed}s) ---\n`);
  }

  // Normalize all data after collection (default behavior)
  if (!skipNormalize) {
    await runNormalize();
  }

  console.log("Collection complete.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
