/** Guide Michelin collector — restaurants + hotels. @see docs/pipeline.md */

import { createHash } from "crypto";
import * as cheerio from "cheerio";
import { fetchWithRetry, sleep } from "../utils/fetch.js";
import { saveArticles, loadArticles } from "../utils/save.js";
import { normalizeVenueName, normalizeCity } from "../utils/normalize.js";
import type { Article, VenueType } from "../types.js";

// ─── Config ─────────────────────────────────────────────────────

const MICHELIN_BASE = "https://guide.michelin.com";
const RESTAURANTS_URL = `${MICHELIN_BASE}/se/en/selection/sweden/restaurants`;
const HOTELS_URL = `${MICHELIN_BASE}/se/en/hotels-stays/sweden`;
const HOTELS_PARAMS = "?nA=1&nC=0&nR=1";

// ─── Types ──────────────────────────────────────────────────────

type MichelinDistinction =
  | "selected"
  | "bib_gourmand"
  | "1_star"
  | "2_star"
  | "3_star"
  | "1_key"
  | "2_key"
  | "3_key";

interface MichelinEntry {
  name: string;
  address: string;
  city: string;
  distinction: MichelinDistinction;
  cuisine: string;
  priceRange: string;
  url: string;
  venueType: VenueType;
  lat?: number;
  lng?: number;
  guestScore?: number;
}

// ─── Helpers ────────────────────────────────────────────────────

function articleId(url: string): string {
  return createHash("sha256")
    .update(`michelin:${url}`)
    .digest("hex")
    .slice(0, 16);
}

function now(): string {
  return new Date().toISOString();
}

/** Map Michelin distinction to a numeric score (0-3 scale).
 *  Stars and Keys both map to the same scale. */
function distinctionToScore(d: MichelinDistinction): number {
  switch (d) {
    case "selected":
      return 0;
    case "bib_gourmand":
      return 0.5;
    case "1_star":
    case "1_key":
      return 1;
    case "2_star":
    case "2_key":
      return 2;
    case "3_star":
    case "3_key":
      return 3;
  }
}

/** Parse restaurant distinction from card's distinction icons */
function parseRestaurantDistinction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $card: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
): MichelinDistinction {
  const imgs = $card.find("img");
  let starCount = 0;
  let isBib = false;

  imgs.each((_, img) => {
    const src = $(img).attr("src") || $(img).attr("data-src") || "";
    if (src.includes("1star")) {
      starCount++;
    } else if (src.includes("bib-gourmand")) {
      isBib = true;
    }
  });

  if (starCount >= 3) return "3_star";
  if (starCount === 2) return "2_star";
  if (starCount === 1) return "1_star";
  if (isBib) return "bib_gourmand";
  return "selected";
}

/** Parse hotel distinction (Michelin Keys) from card icons */
function parseHotelDistinction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $card: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI,
): MichelinDistinction {
  const imgs = $card.find("img");
  let keyCount = 0;

  imgs.each((_, img) => {
    const src = $(img).attr("src") || $(img).attr("data-src") || "";
    const cls = $(img).attr("class") || "";
    if (src.includes("key") || cls.includes("michelin-award")) {
      keyCount++;
    }
  });

  if (keyCount >= 3) return "3_key";
  if (keyCount === 2) return "2_key";
  if (keyCount === 1) return "1_key";
  return "selected";
}

/** Extract city from Michelin address format.
 *  Format: "Street, City, PostalCode, Sweden"
 *  Some have venue prefix: "Hotel Name, Street, City, PostalCode, Sweden"
 *  We find the part right before the postal code. */
function extractCity(address: string): string {
  // Strip trailing ", Sweden"
  const withoutCountry = address.replace(/,\s*Sweden\s*$/i, "").trim();
  const parts = withoutCountry.split(",").map((p) => p.trim());

  if (parts.length < 2) return "";

  // The last part should be the postal code, the one before it is the city
  const lastPart = parts[parts.length - 1];
  const isPostalCode = /^\d{3}\s*\d{2}$/.test(lastPart);

  if (isPostalCode && parts.length >= 3) {
    return parts[parts.length - 2];
  }

  // No postal code — last part is the city (e.g., "Street, District, Stockholm")
  return parts[parts.length - 1];
}

/** Clean Michelin address: strip ", Sweden", postal code, and city.
 *  Keep just the street (and optional venue/hotel prefix). */
function cleanMichelinAddress(raw: string, city: string): string {
  // Strip trailing ", Sweden"
  let addr = raw.replace(/,\s*Sweden\s*$/i, "").trim();

  // Strip trailing postal code: ", 111 22" or ", 11122"
  addr = addr.replace(/,\s*\d{3}\s*\d{2}\s*$/, "").trim();

  // Strip trailing city name (already captured in venueCity)
  if (city) {
    const cityPattern = new RegExp(
      `,\\s*${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
      "i",
    );
    addr = addr.replace(cityPattern, "").trim();
  }

  return addr;
}

/** Map € symbols to price range labels */
function mapMichelinPrice(euroSymbols: string): string {
  const count = (euroSymbols.match(/€/g) || []).length;
  if (count <= 1) return "budget";
  if (count === 2) return "mellan";
  return "lyx"; // €€€ or €€€€
}

// ─── Restaurant Listing Scraper ─────────────────────────────────

async function scrapeRestaurantPage(
  url: string,
): Promise<MichelinEntry[] | null> {
  const res = await fetchWithRetry(url, { allowStatus: [404] });

  if (res.status === 404) return null;

  const html = await res.text();
  const $ = cheerio.load(html);
  const entries: MichelinEntry[] = [];

  $(".card__menu").each((_, card) => {
    const $card = $(card);

    const titleEl = $card.find(".card__menu-content--title a").first();
    const name = titleEl.text().trim();
    const href = titleEl.attr("href") || "";

    if (!name) return;

    const distinction = parseRestaurantDistinction($card, $);
    const location = $card.find(".card__menu-footer--location").text().trim();
    const city = location.split(",")[0]?.trim() || "";

    const cuisineText = $card.find(".card__menu-footer--price").text().trim();
    const cuisineMatch = cuisineText.match(/[€$]+\s*·?\s*(.*)/);
    const cuisine = cuisineMatch?.[1]?.trim() || "";
    const priceMatch = cuisineText.match(/^[€$]+/);
    const priceRange = priceMatch?.[0] || "";

    const address = $card.attr("data-dtm-address") || "";
    const fullUrl = href.startsWith("http") ? href : `${MICHELIN_BASE}${href}`;

    entries.push({
      name,
      address,
      city,
      distinction,
      cuisine,
      priceRange,
      url: fullUrl,
      venueType: "restaurant",
    });
  });

  return entries;
}

// ─── Hotel Listing Scraper ──────────────────────────────────────

async function scrapeHotelPage(url: string): Promise<MichelinEntry[]> {
  const res = await fetchWithRetry(url, { allowStatus: [404] });

  if (res.status === 404) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  const entries: MichelinEntry[] = [];

  $(".card__menu").each((_, card) => {
    const $card = $(card);

    const titleEl = $card.find(".card__menu-content--title a").first();
    const name = titleEl.text().trim();
    const href = titleEl.attr("href") || "";

    if (!name) return;

    const distinction = parseHotelDistinction($card, $);

    // Hotels use data attributes for city and coordinates
    const city =
      ($card.attr("data-dtm-city") as string) ||
      $card
        .find(".card__menu-footer--location")
        .text()
        .trim()
        .split(",")[0]
        ?.trim() ||
      "";
    const lat = parseFloat($card.attr("data-lat") || "") || undefined;
    const lng = parseFloat($card.attr("data-lng") || "") || undefined;

    // Guest score from footer
    const scoreText = $card.find(".card__menu-footer--score").text().trim();
    const scoreMatch = scoreText.match(/(\d+\.?\d*)/);
    const guestScore = scoreMatch ? parseFloat(scoreMatch[1]) : undefined;

    const fullUrl = href.startsWith("http") ? href : `${MICHELIN_BASE}${href}`;

    entries.push({
      name,
      address: "", // Hotels don't have data-dtm-address, enriched from detail page
      city,
      distinction,
      cuisine: "", // Hotels don't have cuisine
      priceRange: "",
      url: fullUrl,
      venueType: "hotel",
      lat,
      lng,
      guestScore,
    });
  });

  return entries;
}

// ─── Detail Page Enrichment ─────────────────────────────────────

async function enrichFromDetailPage(
  entry: MichelinEntry,
): Promise<MichelinEntry> {
  try {
    const res = await fetchWithRetry(entry.url);
    const html = await res.text();
    const $ = cheerio.load(html);

    $(".data-sheet__block--text").each((_, el) => {
      const text = $(el).text().trim();

      // Address contains "Sweden" at the end
      if (text.match(/Sweden\s*$/i)) {
        entry.address = text;
        // City is extracted later by extractCity() in entryToArticle —
        // don't overwrite entry.city here (hotels already have it from data-dtm-city)
      }

      // Price and cuisine: "€€ · Contemporary, International" (restaurants only)
      if (entry.venueType === "restaurant") {
        const priceMatch = text.match(/^([€$]+)\s*[·•-]\s*(.+)$/);
        if (priceMatch) {
          entry.priceRange = priceMatch[1];
          entry.cuisine = priceMatch[2].trim();
        }
      }
    });

    if (entry.venueType === "restaurant") {
      $(".restaurant-details__heading-price, .data-sheet__heading").each(
        (_, el) => {
          const text = $(el).text().trim();
          const match = text.match(/^([€$]+)\s*[·•-]\s*(.+)$/);
          if (match && !entry.priceRange) {
            entry.priceRange = match[1];
            entry.cuisine = match[2].trim();
          }
        },
      );
    }
  } catch (err) {
    console.log(`    → Failed to enrich ${entry.name}: ${err}`);
  }

  return entry;
}

// ─── Convert to Article ────────────────────────────────────────

function entryToArticle(entry: MichelinEntry): Article {
  const rawCity = extractCity(entry.address) || entry.city;
  const city = normalizeCity(rawCity);
  const addr = entry.address
    ? cleanMichelinAddress(entry.address, rawCity)
    : undefined;

  const article: Article = {
    id: articleId(entry.url),
    sourceId: "michelin",
    url: entry.url,
    title: entry.name,
    publishedAt: "", // Michelin doesn't expose publish dates
    contentType: "review",
    bodyText: "",
    venueType: entry.venueType,
    venueName: normalizeVenueName(entry.name),
    venueAddress: addr || undefined,
    venueCity: city || undefined,
    score: distinctionToScore(entry.distinction),
    cuisine: entry.cuisine
      ? entry.cuisine
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : undefined,
    priceRange: entry.priceRange
      ? mapMichelinPrice(entry.priceRange)
      : undefined,
    tags: [entry.distinction],
    lat: entry.lat ?? undefined,
    lng: entry.lng ?? undefined,
    collectedAt: now(),
    enrichedAt: now(),
  };

  return article;
}

// ─── Main Collector ─────────────────────────────────────────────

export async function collectMichelin(): Promise<Article[]> {
  console.log("\n=== Guide Michelin ===\n");

  const allEntries: MichelinEntry[] = [];
  const seenUrls = new Set<string>();

  // ── Restaurants ──
  console.log("  Scraping restaurant listings...");
  let page = 1;

  while (true) {
    const url =
      page === 1 ? RESTAURANTS_URL : `${RESTAURANTS_URL}/page/${page}`;
    const pageEntries = await scrapeRestaurantPage(url);

    if (pageEntries === null || pageEntries.length === 0) break;

    for (const entry of pageEntries) {
      if (!seenUrls.has(entry.url)) {
        seenUrls.add(entry.url);
        allEntries.push(entry);
      }
    }

    console.log(
      `    Page ${page}: ${pageEntries.length} restaurants (${allEntries.length} total)`,
    );
    page++;
    await sleep(1000);
  }

  const restaurantCount = allEntries.length;
  console.log(`  Found ${restaurantCount} restaurants\n`);

  // ── Hotels ──
  console.log("  Scraping hotel listings...");
  const hotelEntries = await scrapeHotelPage(
    `${HOTELS_URL}${HOTELS_PARAMS}`,
  );

  for (const entry of hotelEntries) {
    if (!seenUrls.has(entry.url)) {
      seenUrls.add(entry.url);
      allEntries.push(entry);
    }
  }

  const hotelCount = allEntries.length - restaurantCount;
  console.log(`  Found ${hotelCount} hotels\n`);

  if (allEntries.length === 0) {
    console.log("  Nothing found. Loading existing data...");
    return loadArticles<Article[]>("michelin.json") ?? [];
  }

  // ── Enrich all with detail pages ──
  console.log("  Enriching with detail pages...");
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    console.log(
      `  [${i + 1}/${allEntries.length}] ${entry.name} (${entry.distinction}, ${entry.venueType})`,
    );
    allEntries[i] = await enrichFromDetailPage(entry);
    await sleep(2000);
  }

  // Filter out non-Swedish entries (hotels on the Sweden page sometimes
  // include international "recommended" properties with no Swedish address)
  const beforeFilter = allEntries.length;
  const filtered = allEntries.filter((e) => {
    if (e.venueType === "hotel" && !e.address && !e.city) {
      console.log(`    Dropping non-Swedish hotel: ${e.name}`);
      return false;
    }
    return true;
  });

  if (filtered.length < beforeFilter) {
    console.log(
      `  Filtered ${beforeFilter - filtered.length} non-Swedish entries`,
    );
  }

  // Convert to Articles
  const articles = filtered.map(entryToArticle);

  // Stats
  const actualHotelCount = filtered.filter(
    (e) => e.venueType === "hotel",
  ).length;
  const byDistinction = new Map<string, number>();
  for (const a of articles) {
    const d = a.tags?.[0] || "unknown";
    byDistinction.set(d, (byDistinction.get(d) ?? 0) + 1);
  }

  saveArticles("michelin.json", articles);
  console.log(`\n  Total: ${articles.length} (${restaurantCount} restaurants, ${actualHotelCount} hotels)`);
  for (const [d, count] of byDistinction) {
    console.log(`    ${d}: ${count}`);
  }

  return articles;
}

// ─── Import from Pipeline 1 ────────────────────────────────────

/** Import existing Michelin data from pipeline 1's data/raw/michelin.json.
 *  Only contains restaurants (pipeline 1 didn't collect hotels). */
export async function importFromPipeline1(
  rawPath: string,
): Promise<Article[]> {
  const { readFileSync } = await import("fs");
  const raw = JSON.parse(readFileSync(rawPath, "utf-8")) as Array<{
    name: string;
    address: string;
    city: string;
    distinction: MichelinDistinction;
    cuisine: string;
    priceRange: string;
    url: string;
  }>;

  console.log(`  Importing ${raw.length} restaurants from pipeline 1...`);

  const articles = raw.map((entry) =>
    entryToArticle({ ...entry, venueType: "restaurant" }),
  );

  saveArticles("michelin.json", articles);
  console.log(`  Saved ${articles.length} Michelin articles`);

  return articles;
}
