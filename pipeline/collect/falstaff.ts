/**
 * Falstaff collector — Swedish restaurant ratings.
 *
 * Falstaff.com is protected by Cloudflare and blocks direct HTTP requests (403).
 * This collector reads from a cached `falstaff-raw.json` file that is scraped
 * separately via a Chrome-based browser scraper.
 *
 * Raw data format: array of { name, url, score, address, cuisine, forks }
 *
 * @see docs/pipeline.md
 */

import { createHash } from "crypto";
import { saveArticles, loadData } from "../utils/save.js";
import { normalizeVenueName, normalizeCity } from "../utils/normalize.js";
import type { Article } from "../types.js";

// ─── Config ─────────────────────────────────────────────────────

const SOURCE_ID = "falstaff";
const RAW_FILE = "falstaff-raw.json";
const OUT_FILE = "falstaff.json";

// ─── Types ──────────────────────────────────────────────────────

interface FalstaffRaw {
  name: string;
  url: string;
  score: number | null;
  address: string;
  cuisine: string[];
  forks?: number;
}

// ─── Helpers ────────────────────────────────────────────────────

function articleId(url: string): string {
  return createHash("sha256")
    .update(`${SOURCE_ID}:${url}`)
    .digest("hex")
    .slice(0, 16);
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Convert fork rating (0-4) to an estimated score (55-95).
 * 4 forks = 95, 3 forks = 85, 2 forks = 75, 1 fork = 65, 0 forks = 55
 */
function forksToScore(forks: number): number {
  return 55 + forks * 10;
}

/**
 * Parse Falstaff address format: "Street Address, PostalCode City, Sweden"
 * Returns { street, city } where city has postal code digits removed.
 */
function parseAddress(address: string): { street: string; city: string } {
  if (!address) return { street: "", city: "" };

  const parts = address.split(",").map((p) => p.trim());

  const street = parts[0] || "";
  let city = "";

  // City is the last part before "Sweden" (or the last part if no country)
  if (parts.length >= 3) {
    // "Street, PostalCode City, Sweden"
    const cityPart = parts[parts.length - 2];
    // Remove leading postal code digits (e.g. "114 46 Stockholm" -> "Stockholm")
    city = cityPart.replace(/^\d[\d\s]*/, "").trim();
  } else if (parts.length === 2) {
    // "Street, PostalCode City" or "Street, City"
    const cityPart = parts[1];
    city = cityPart.replace(/^\d[\d\s]*/, "").trim();
  }

  return { street, city };
}

// ─── Convert to Article ────────────────────────────────────────

function rawToArticle(entry: FalstaffRaw): Article {
  // Determine score: use numeric score if available, otherwise convert forks
  let score: number | undefined;
  if (entry.score != null && entry.score >= 80 && entry.score <= 100) {
    score = entry.score;
  } else if (entry.forks != null) {
    score = forksToScore(entry.forks);
  }

  const { street, city } = parseAddress(entry.address);

  return {
    id: articleId(entry.url || entry.name),
    sourceId: SOURCE_ID,
    url: entry.url,
    title: entry.name,
    publishedAt: "",
    contentType: "review",
    bodyText: "",

    venueType: "restaurant",
    venueName: normalizeVenueName(entry.name),
    venueAddress: street || undefined,
    venueCity: city ? normalizeCity(city) : undefined,

    score,
    cuisine: entry.cuisine.length > 0 ? entry.cuisine : undefined,

    collectedAt: now(),
  };
}

// ─── Main Collector ─────────────────────────────────────────────

export async function collectFalstaff(): Promise<Article[]> {
  console.log("\n=== Falstaff ===\n");

  // Load cached raw data (scraped via Chrome browser due to Cloudflare protection)
  const rawData = loadData<FalstaffRaw[]>(RAW_FILE);

  if (!rawData) {
    console.log(
      "  No falstaff-raw.json found in .data/ directory.",
    );
    console.log(
      "  Run the Chrome-based scraper to populate this file first.",
    );
    return [];
  }

  console.log(`  Loaded ${rawData.length} entries from ${RAW_FILE}`);

  // Convert to articles
  const articles = rawData.map(rawToArticle);

  // Stats
  const withScore = articles.filter((a) => a.score != null).length;
  const cities: Record<string, number> = {};
  for (const a of articles) {
    const c = a.venueCity || "(none)";
    cities[c] = (cities[c] || 0) + 1;
  }

  saveArticles(OUT_FILE, articles);
  console.log(`\n  Total: ${articles.length} restaurants`);
  console.log(`  With score: ${withScore}`);
  console.log(
    `  Cities: ${Object.entries(cities)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([c, n]) => `${c} (${n})`)
      .join(", ")}`,
  );

  return articles;
}
