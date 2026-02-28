/**
 * SvD (Svenska Dagbladet) Krogguiden scraper.
 * Fetches restaurant reviews from svd.se/story/krogguiden via RSS feed.
 * Each review page contains JSON-LD with Restaurant schema.
 *
 * Output: data/raw/svd.json (SvdRaw[])
 *
 * CLI: tsx pipeline/collect/svd.ts
 */

import * as cheerio from "cheerio";
import { fetchWithRetry, sleep, saveRawJson, loadRawJson } from "../utils/fetch.js";
import type { SvdRaw } from "../types.js";

const RSS_URL = "https://www.svd.se/feed/articles/story/krogguiden.rss";

/**
 * Parse RSS feed to get article URLs
 */
async function fetchArticleUrls(): Promise<string[]> {
  console.log("Fetching SvD Krogguiden RSS feed...");
  const res = await fetchWithRetry(RSS_URL);
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const urls: string[] = [];
  $("item link").each((_, el) => {
    const url = $(el).text().trim();
    // Only include review articles (recension)
    if (url.includes("/a/") && url.includes("recension")) {
      urls.push(url);
    }
  });

  console.log(`  Found ${urls.length} review articles`);
  return urls;
}

/**
 * Parse JSON-LD from article page to extract restaurant data
 */
function parseJsonLd(html: string): Partial<SvdRaw> | null {
  const $ = cheerio.load(html);

  let reviewData: any = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = $(el).html();
      if (!json) return;
      const parsed = JSON.parse(json);

      // Look for Review type with itemReviewed
      if (parsed["@type"] === "Review" && parsed.itemReviewed) {
        reviewData = parsed;
      }
    } catch {}
  });

  if (!reviewData || !reviewData.itemReviewed) return null;

  const restaurant = reviewData.itemReviewed;
  const rating = reviewData.reviewRating;

  // Only include Restaurant type
  if (restaurant["@type"] !== "Restaurant") return null;

  return {
    name: restaurant.name || "",
    address: restaurant.address || "",
    cuisine: restaurant.servesCuisine || "",
    rating: rating?.ratingValue ?? null,
    publishedAt: reviewData.datePublished || "",
  };
}

/**
 * Extract article ID from URL
 */
function extractArticleId(url: string): string {
  const match = url.match(/\/a\/([^/]+)\//);
  return match ? match[1] : "";
}

/**
 * Scrape a single review article
 */
async function scrapeArticle(url: string): Promise<SvdRaw | null> {
  try {
    const res = await fetchWithRetry(url);
    const html = await res.text();
    const parsed = parseJsonLd(html);

    if (!parsed?.name) return null;

    return {
      source: "svd",
      articleId: extractArticleId(url),
      name: parsed.name,
      address: parsed.address || "",
      cuisine: parsed.cuisine || "",
      rating: parsed.rating ?? 0,
      url,
      publishedAt: parsed.publishedAt || "",
    };
  } catch (err) {
    console.log(`  Failed to scrape ${url}: ${err}`);
    return null;
  }
}

// ─── Main scraper function ───────────────────────────────────────

export async function scrapeSvd(): Promise<SvdRaw[]> {
  console.log("=== SvD Krogguiden Scraper ===\n");

  // Load existing data to avoid re-scraping
  const existing = loadRawJson<SvdRaw[]>("svd.json") ?? [];
  const existingIds = new Set(existing.map((r) => r.articleId));

  if (existing.length > 0) {
    console.log(`Loaded ${existing.length} existing reviews from svd.json`);
  }

  // Fetch article URLs from RSS
  const urls = await fetchArticleUrls();

  // Filter to new articles
  const newUrls = urls.filter((url) => !existingIds.has(extractArticleId(url)));
  console.log(`\nNew articles to scrape: ${newUrls.length}`);
  console.log(`Already scraped: ${existingIds.size}\n`);

  if (newUrls.length === 0) {
    console.log("All articles already scraped. Nothing to do.");
    return existing;
  }

  const reviews: SvdRaw[] = [...existing];

  for (let i = 0; i < newUrls.length; i++) {
    const url = newUrls[i];
    process.stdout.write(`[${i + 1}/${newUrls.length}] `);

    const review = await scrapeArticle(url);
    if (review) {
      reviews.push(review);
      console.log(`${review.name} (${review.rating}/6)`);
    } else {
      console.log(`FAILED: ${url}`);
    }

    // Rate limit
    await sleep(2000);

    // Save progress every 20 articles
    if (i % 20 === 19) {
      saveRawJson("svd.json", reviews);
      console.log(`  [saved progress: ${reviews.length} reviews]`);
    }
  }

  // Final save
  saveRawJson("svd.json", reviews);

  console.log(`\nSvD scrape complete: ${reviews.length} reviews`);
  console.log(`  New: ${newUrls.length}`);
  console.log(`  Previously scraped: ${existing.length}`);

  // Stats by rating
  const byRating = new Map<number, number>();
  for (const r of reviews) {
    if (r.rating) {
      byRating.set(r.rating, (byRating.get(r.rating) ?? 0) + 1);
    }
  }
  console.log("\nRating distribution:");
  for (const rating of [1, 2, 3, 4, 5, 6]) {
    const count = byRating.get(rating) ?? 0;
    if (count > 0) {
      console.log(`  ${rating}/6: ${count}`);
    }
  }

  return reviews;
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("svd")) {
  scrapeSvd().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
