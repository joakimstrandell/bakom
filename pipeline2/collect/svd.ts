/** SvD Krogguiden collector.
 *
 * Discovery via paginated API at svd.se/api/topic-backfill/story/krogguiden.
 * Each article page has public JSON-LD with @type "Review" containing
 * restaurant name, address, rating (1-6), and publish date.
 * No browser/login required — all structured data is publicly accessible.
 */

import { createHash } from "crypto";
import * as cheerio from "cheerio";
import { fetchWithRetry, sleep } from "../utils/fetch.js";
import { saveArticles, loadArticles } from "../utils/save.js";
import { normalizeAddress, normalizeVenueName, normalizePriceRange } from "../utils/normalize.js";
import type { Article } from "../types.js";

// ─── Config ─────────────────────────────────────────────────────

const API_URL = "https://www.svd.se/api/topic-backfill/story/krogguiden";
const PAGE_SIZE = 50;

// ─── Helpers ────────────────────────────────────────────────────

function articleId(url: string): string {
  return createHash("sha256")
    .update(`svd-review:${url}`)
    .digest("hex")
    .slice(0, 16);
}

function now(): string {
  return new Date().toISOString();
}


// ─── Discovery ──────────────────────────────────────────────────

async function discoverArticleUrls(): Promise<string[]> {
  console.log("  Discovering articles via API...");
  const urls: string[] = [];
  let offset = 0;

  while (true) {
    const res = await fetchWithRetry(
      `${API_URL}?limit=${PAGE_SIZE}&offset=${offset}&variant=grid`,
    );
    const html = await res.text();

    const matches = html.match(/svd\.se\/a\/[^"<>\s]+/g) || [];
    const pageUrls = matches
      .map((m) => `https://www.${m}`)
      .filter((url) => url.includes("recension") || url.includes("krog"));

    if (pageUrls.length === 0) break;

    const unique = [...new Set(pageUrls)];
    urls.push(...unique);
    offset += PAGE_SIZE;
    console.log(`    Page ${offset / PAGE_SIZE}: ${urls.length} URLs so far`);
    await sleep(500);
  }

  const deduped = [...new Set(urls)];
  console.log(`  Discovered ${deduped.length} review URLs`);
  return deduped;
}

// ─── JSON-LD Parsing ────────────────────────────────────────────

interface ParsedReview {
  name: string;
  address: string;
  priceRange: string;
  score: number | null;
  publishedAt: string;
}

function parseJsonLd(html: string): ParsedReview | null {
  const $ = cheerio.load(html);

  let reviewData: Record<string, unknown> | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = $(el).html();
      if (!json) return;
      const parsed = JSON.parse(json);
      if (parsed["@type"] === "Review" && parsed.itemReviewed) {
        reviewData = parsed;
      }
    } catch {
      // Invalid JSON-LD
    }
  });

  if (!reviewData) return null;

  const restaurant = (reviewData as Record<string, unknown>)
    .itemReviewed as Record<string, unknown>;
  const rating = (reviewData as Record<string, unknown>)
    .reviewRating as Record<string, unknown>;

  if (!restaurant || restaurant["@type"] !== "Restaurant") return null;

  return {
    name: normalizeVenueName((restaurant.name as string) || ""),
    address: normalizeAddress((restaurant.address as string) || ""),
    priceRange: normalizePriceRange((restaurant.servesCuisine as string) || ""),
    score: (rating?.ratingValue as number) ?? null,
    publishedAt:
      ((reviewData as Record<string, unknown>).datePublished as string) || "",
  };
}

// ─── Main Collector ─────────────────────────────────────────────

export async function collectSvdReviews(): Promise<Article[]> {
  console.log("\n=== SvD Krogguiden ===\n");

  // Load existing to avoid re-scraping
  const existing = loadArticles<Article[]>("svd-review.json") ?? [];
  const existingUrls = new Set(existing.map((a) => a.url));

  if (existing.length > 0) {
    console.log(`  Existing: ${existing.length} articles`);
  }

  // Discover all article URLs
  const allUrls = await discoverArticleUrls();

  // Filter to new articles only
  const newUrls = allUrls.filter((url) => !existingUrls.has(url));
  console.log(`  New articles to scrape: ${newUrls.length}`);

  if (newUrls.length === 0) {
    console.log("  Nothing new to scrape.");
    return existing;
  }

  const articles: Article[] = [...existing];
  let scraped = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < newUrls.length; i++) {
    const url = newUrls[i];
    console.log(`  [${i + 1}/${newUrls.length}] ${url.split("/").pop()?.slice(0, 50)}`);

    try {
      const res = await fetchWithRetry(url);
      const html = await res.text();
      const parsed = parseJsonLd(html);

      if (parsed?.name) {
        articles.push({
          id: articleId(url),
          sourceId: "svd-review",
          url,
          title: parsed.name,
          publishedAt: parsed.publishedAt,
          contentType: "review",
          bodyText: "",
          venueName: parsed.name,
          venueAddress: parsed.address || undefined,
          score: parsed.score ?? undefined,
          priceRange: parsed.priceRange || undefined,
          collectedAt: now(),
          enrichedAt: now(),
        });
        scraped++;
      } else {
        // Save non-review articles too so they aren't re-scraped on next run.
        // Extract title from og:title meta tag.
        const $ = cheerio.load(html);
        const ogTitle =
          $('meta[property="og:title"]').attr("content") || "";
        const publishedAt =
          $('meta[property="article:published_time"]').attr("content") || "";
        const isReview = url.includes("recension");

        articles.push({
          id: articleId(url),
          sourceId: "svd-review",
          url,
          title: ogTitle || url.split("/").pop()?.replace(/-/g, " ") || "",
          publishedAt,
          contentType: isReview ? "review" : "listing",
          bodyText: "",
          venueName: "",
          collectedAt: now(),
          // No enrichedAt — these may benefit from Chrome MCP enrichment later
        });
        skipped++;
        console.log(`    → No JSON-LD (saved as ${isReview ? "review" : "listing"})`);
      }
    } catch (err) {
      console.log(`    → Error: ${err}`);
      failed++;
    }

    await sleep(1500);

    // Save progress every 25 articles
    if ((i + 1) % 25 === 0) {
      saveArticles("svd-review.json", articles);
      console.log(`    [saved progress: ${articles.length} articles]`);
    }
  }

  saveArticles("svd-review.json", articles);
  console.log(`\n  Total SvD articles: ${articles.length}`);
  console.log(`    New with JSON-LD: ${scraped}`);
  console.log(`    New without JSON-LD: ${skipped}`);
  console.log(`    Failed: ${failed}`);

  return articles;
}
