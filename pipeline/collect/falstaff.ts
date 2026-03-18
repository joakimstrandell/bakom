/**
 * Falstaff collector — Swedish restaurant ratings.
 *
 * Falstaff.com is protected by Cloudflare and blocks direct HTTP requests.
 * This collector reads from a scraped `falstaff-raw.json` file produced by
 * the /scrape-falstaff skill (Chrome MCP-based).
 *
 * Raw data format: array of { name, url, score, forks, address, cuisine }
 * Only rated venues (with Falstaff review) are included in the raw file.
 *
 * @see .claude/skills/scrape-falstaff/SKILL.md
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

interface FalstaffSubScore {
  score: number;
  max: number;
}

interface FalstaffRaw {
  name: string;
  url: string;
  score: number | null;
  address: string;
  cuisine: string[];
  forks?: number;
  subScores?: Record<string, FalstaffSubScore>;
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
 * Parse Falstaff address format.
 * Formats: "Street, PostalCode, City" or "Street, PostalCode City, Sweden"
 * Returns { street, city } where city has postal code digits removed.
 */
function parseAddress(address: string): { street: string; city: string } {
  if (!address) return { street: "", city: "" };

  // Strip trailing ", Sweden" or ", Schweden"
  const cleaned = address.replace(/,\s*(Sweden|Schweden)\s*$/i, "");
  const parts = cleaned.split(",").map((p) => p.trim());

  const street = parts[0] || "";
  // City is the last non-postal-code part
  const lastPart = parts[parts.length - 1] || "";
  // Remove leading postal code digits (e.g. "11122" or "114 46 Stockholm")
  const city = lastPart.replace(/^\d[\d\s]*/, "").trim();

  return { street, city };
}

/** Normalize Falstaff sub-scores to 0-10 DimensionalScores.
 *  Restaurants: food(/50), service(/20), wine(/20), style(/10)
 *  Bars: drinks(/50), service(/20), range(/10), style(/20)
 *  Maps to: food, service, drinks, ambiance */
function normalizeSubScores(subs: Record<string, FalstaffSubScore>): import("../types.js").DimensionalScores {
  const result: import("../types.js").DimensionalScores = {};
  if (subs.food) result.food = Math.round((subs.food.score / subs.food.max) * 10 * 10) / 10;
  if (subs.drinks) result.drinks = Math.round((subs.drinks.score / subs.drinks.max) * 10 * 10) / 10;
  if (subs.service) result.service = Math.round((subs.service.score / subs.service.max) * 10 * 10) / 10;
  if (subs.style) result.ambiance = Math.round((subs.style.score / subs.style.max) * 10 * 10) / 10;
  if (subs.wine) result.drinks = Math.round((subs.wine.score / subs.wine.max) * 10 * 10) / 10;
  return result;
}

// ─── Convert to Article ────────────────────────────────────────

function rawToArticle(entry: FalstaffRaw): Article {
  // Use numeric score directly — no fork-to-score conversion
  // (the scraper only includes rated venues, so score should be present)
  const score = entry.score != null && entry.score >= 80 && entry.score <= 100
    ? entry.score
    : undefined;

  const { street, city } = parseAddress(entry.address);

  return {
    id: articleId(entry.url || entry.name),
    sourceId: SOURCE_ID,
    url: entry.url,
    title: entry.name,
    publishedAt: "",
    contentType: "review",
    bodyText: "",

    venueType: entry.url.includes("/bars/") ? "bar" as const : "restaurant" as const,
    venueName: normalizeVenueName(entry.name),
    venueAddress: street || undefined,
    venueCity: city ? normalizeCity(city) : undefined,

    score,
    explicitSubScores: entry.subScores ? normalizeSubScores(entry.subScores) : undefined,
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
    console.log("  No falstaff-raw.json found in .data/ directory.");
    console.log("  Run /scrape-falstaff to scrape data via Chrome MCP first.");
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
