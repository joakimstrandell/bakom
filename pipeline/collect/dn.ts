/** DN Krogkommissionen collector. @see docs/pipeline.md */

import { createHash } from "crypto";
import * as cheerio from "cheerio";
import { fetchWithRetry, sleep } from "../utils/fetch.js";
import { saveArticles, loadArticles } from "../utils/save.js";
import { normalizeVenueName, normalizePriceRange } from "../utils/normalize.js";
import type { Article } from "../types.js";

// ─── Config ─────────────────────────────────────────────────────

const RSS_URL = "https://www.dn.se/rss/om/krogkommissionen/";
const CUTOFF_DATE = "2025-01-01T00:00:00.000Z";

// ─── Helpers ────────────────────────────────────────────────────

function articleId(url: string): string {
  return createHash("sha256")
    .update(`dn-review:${url}`)
    .digest("hex")
    .slice(0, 16);
}

function now(): string {
  return new Date().toISOString();
}

/** Try to extract a single restaurant name from DN title.
 *  Pattern: "Restaurangnamn: Rubriktext" → "Restaurangnamn"
 *  Returns null for multi-venue, editorial, or news titles. */
function extractRestaurantName(title: string): string | null {
  // These colon-prefixes are NOT restaurant names
  const falseNamePatterns = [
    /^krogkommissionen/i,
    /^elin\s+peters/i,
    /^studio\s+dn/i,
    /^kk\s+tipsar/i,
    /^veckans/i,
  ];

  // Extract name before colon
  const colonMatch = title.match(/^([^:]+):/);
  if (!colonMatch) return null;

  const name = colonMatch[1].trim();

  // Validate: must be reasonable length
  if (name.length <= 2 || name.length >= 50) return null;

  // Check against false-name patterns
  for (const pattern of falseNamePatterns) {
    if (pattern.test(name)) return null;
  }

  return name;
}

/** Strip HTML and decode entities */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&aring;/g, "å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Aring;/g, "Å")
    .replace(/&ndash;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── RSS Discovery ──────────────────────────────────────────────

interface RssItem {
  url: string;
  title: string;
  pubDate: string;
  description: string;
}

async function fetchRssArticles(): Promise<RssItem[]> {
  console.log("  Fetching RSS feed...");
  const res = await fetchWithRetry(RSS_URL);
  const xml = await res.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const items: RssItem[] = [];

  $("item").each((_, el) => {
    const url = $(el).find("link").text().trim();
    const title = $(el).find("title").text().trim();
    const pubDate = $(el).find("pubDate").text().trim();
    const description = $(el).find("description").text().trim();

    if (url && url.includes("/kultur/")) {
      items.push({ url, title, pubDate, description });
    }
  });

  console.log(`  RSS: ${items.length} articles`);
  return items;
}

// ─── Public Metadata Scraping ───────────────────────────────────

async function scrapePublicMetadata(url: string): Promise<Partial<Article>> {
  const res = await fetchWithRetry(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const ogTitle =
    $('meta[property="og:title"]').attr("content") || "";
  const publishedAt =
    $('meta[property="article:published_time"]').attr("content") || "";
  const description =
    $('meta[property="og:description"]').attr("content") || "";

  return {
    title: ogTitle,
    publishedAt,
    bodyText: stripHtml(description), // Just the ingress without login
  };
}

// ─── Main Collector ─────────────────────────────────────────────

export async function collectDnReviews(): Promise<Article[]> {
  console.log("\n=== DN Krogkommissionen ===\n");

  // Load existing to avoid re-scraping
  const existing = loadArticles<Article[]>("dn-review.json") ?? [];
  const existingUrls = new Set(existing.map((a) => a.url));

  if (existing.length > 0) {
    console.log(`  Existing: ${existing.length} articles`);
  }

  // Discover articles via RSS
  const rssItems = await fetchRssArticles();

  // Filter to new articles within date range
  const newItems = rssItems.filter((item) => {
    if (existingUrls.has(item.url)) return false;
    // Parse RSS date format: "Fri, 13 Mar 2026 15:15:17 +0100"
    const date = new Date(item.pubDate);
    if (date.toISOString() < CUTOFF_DATE) return false;
    return true;
  });

  console.log(`  New articles: ${newItems.length}`);

  if (newItems.length === 0) {
    console.log("  Nothing new to scrape.");
    return existing;
  }

  const articles: Article[] = [...existing];
  let reviewCount = 0;
  let listingCount = 0;

  for (let i = 0; i < newItems.length; i++) {
    const item = newItems[i];
    const restaurantName = extractRestaurantName(item.title);
    const isReview = restaurantName !== null;
    const contentType = isReview ? "review" : "listing";

    console.log(
      `  [${i + 1}/${newItems.length}] ${item.title.slice(0, 60)}`,
    );
    if (!isReview) console.log(`    → listing (multi-venue / editorial)`);

    // Scrape public metadata
    const meta = await scrapePublicMetadata(item.url);

    articles.push({
      id: articleId(item.url),
      sourceId: "dn-review",
      url: item.url,
      title: meta.title || item.title,
      publishedAt: meta.publishedAt || new Date(item.pubDate).toISOString(),
      contentType,
      bodyText: meta.bodyText || stripHtml(item.description),
      venueName: restaurantName ? normalizeVenueName(restaurantName) : "",
      // These fields require Chrome MCP enrichment (paywall content):
      // score, venueAddress, venueCity, priceRange, subArticles
      collectedAt: now(),
    });

    if (isReview) reviewCount++;
    else listingCount++;

    await sleep(1500);
  }

  saveArticles("dn-review.json", articles);
  console.log(`\n  Total DN articles: ${articles.length}`);
  console.log(`    Reviews: ${reviewCount} new (${articles.filter((a) => a.contentType === "review").length} total)`);
  console.log(`    Listings: ${listingCount} new (${articles.filter((a) => a.contentType === "listing").length} total)`);

  return articles;
}
