/** DN Krogkommissionen scraper. @see docs/collect.md */

import * as cheerio from "cheerio";
import { fetchWithRetry, sleep, saveRawJson, loadRawJson } from "../utils/fetch.js";
import type { DnRaw } from "../types.js";

const RSS_URL = "https://www.dn.se/rss/om/krogkommissionen/";

/**
 * Parse RSS feed to get article URLs
 */
async function fetchArticleUrls(): Promise<string[]> {
  console.log("Fetching DN Krogkommissionen RSS feed...");
  const res = await fetchWithRetry(RSS_URL);
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const urls: string[] = [];
  $("item link").each((_, el) => {
    const url = $(el).text().trim();
    // Only include kultur section articles (individual reviews)
    if (url.includes("/kultur/") && !url.includes("?page=")) {
      urls.push(url);
    }
  });

  console.log(`  Found ${urls.length} articles`);
  return urls;
}

/**
 * Extract restaurant name from title.
 * Patterns:
 * - "Agrikultur: Nyöppnad krog visar..." → "Agrikultur"
 * - "Bistro Tartine: Mer målgruppstänk..." → "Bistro Tartine"
 * - "Tre nya krogar på Söder" → null (list article, not single review)
 */
function extractRestaurantName(title: string): string | null {
  // Skip list/summary articles
  const skipPatterns = [
    /^tre\s/i,
    /^hostens/i,
    /^så\s(bra|var)/i,
    /^från\s/i,
    /tips\s+för/i,
    /lyxiga\s+krogupplevelser/i,
    /heta\s+krognyheter/i,
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(title)) return null;
  }

  // Extract name before colon
  const colonMatch = title.match(/^([^:]+):/);
  if (colonMatch) {
    const name = colonMatch[1].trim();
    // Validate it's a restaurant name (not a generic phrase)
    if (name.length > 2 && name.length < 50 && !name.toLowerCase().startsWith("krog")) {
      return name;
    }
  }

  return null;
}

/**
 * Extract slug from URL
 */
function extractSlug(url: string): string {
  const match = url.match(/\/kultur\/([^/]+)\/?$/);
  return match ? match[1] : "";
}

/**
 * Scrape a single article page for metadata
 */
async function scrapeArticle(url: string): Promise<DnRaw | null> {
  try {
    const res = await fetchWithRetry(url);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Get title from og:title
    const title = $('meta[property="og:title"]').attr("content") || "";
    const publishedAt = $('meta[property="article:published_time"]').attr("content") || "";

    const name = extractRestaurantName(title);
    if (!name) return null;

    return {
      source: "dn",
      slug: extractSlug(url),
      name,
      heading: title,
      url,
      publishedAt,
      score: null,
      address: null,
      priceClass: null,
      website: null,
      contact: null,
      hours: null,
    };
  } catch (err) {
    console.log(`  Failed to scrape ${url}: ${err}`);
    return null;
  }
}

// ─── Main scraper function ───────────────────────────────────────

export async function scrapeDn(options: { force?: boolean } = {}): Promise<DnRaw[]> {
  console.log("=== DN Krogkommissionen Scraper ===\n");

  // Load existing data to avoid re-scraping (skip when --force)
  const existing = options.force ? [] : (loadRawJson<DnRaw[]>("dn.json") ?? []);
  const existingSlugs = new Set(existing.map((r) => r.slug));

  if (existing.length > 0) {
    console.log(`Loaded ${existing.length} existing reviews from dn.json`);
  }

  // Fetch article URLs from RSS
  const urls = await fetchArticleUrls();

  // Filter to new articles
  const newUrls = urls.filter((url) => !existingSlugs.has(extractSlug(url)));
  console.log(`\nNew articles to scrape: ${newUrls.length}`);
  console.log(`Already scraped: ${existingSlugs.size}\n`);

  if (newUrls.length === 0) {
    console.log("All articles already scraped. Nothing to do.");
    return existing;
  }

  const reviews: DnRaw[] = [...existing];
  let skipped = 0;

  for (let i = 0; i < newUrls.length; i++) {
    const url = newUrls[i];
    process.stdout.write(`[${i + 1}/${newUrls.length}] `);

    const review = await scrapeArticle(url);
    if (review) {
      reviews.push(review);
      console.log(`${review.name}`);
    } else {
      // Skipped (list article or parse failure)
      skipped++;
      console.log(`SKIPPED: ${extractSlug(url)}`);
    }

    // Rate limit
    await sleep(1500);

    // Save progress every 20 articles
    if (i % 20 === 19) {
      saveRawJson("dn.json", reviews);
      console.log(`  [saved progress: ${reviews.length} reviews]`);
    }
  }

  // Final save
  saveRawJson("dn.json", reviews);

  console.log(`\nDN scrape complete: ${reviews.length} reviews`);
  console.log(`  New: ${newUrls.length - skipped}`);
  console.log(`  Skipped (list articles): ${skipped}`);
  console.log(`  Previously scraped: ${existing.length}`);

  return reviews;
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("dn")) {
  scrapeDn({ force: process.argv.includes("--force") }).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
