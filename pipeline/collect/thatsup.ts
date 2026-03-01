/**
 * Thatsup scraper.
 * Fetches restaurant data from thatsup.se via paginated listings + JSON-LD.
 *
 * Output: data/raw/thatsup.json (ThatsupRaw[])
 *
 * CLI: tsx pipeline/collect/thatsup.ts
 */

import * as cheerio from "cheerio";
import { fetchWithRetry, sleep, saveRawJson, loadRawJson } from "../utils/fetch.js";
import type { ThatsupRaw } from "../types.js";
import type { HoursEntry } from "../../src/types.js";

const BASE_URL = "https://thatsup.se";
const LISTING_URL = `${BASE_URL}/stockholm/explore/restaurang/`;
const MAX_PAGES = 15; // Safety limit

/**
 * Fetch all restaurant slugs from paginated listings
 */
async function fetchAllSlugs(): Promise<string[]> {
  console.log("Fetching restaurant slugs from Thatsup...");
  const slugs: Set<string> = new Set();

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = page === 1 ? LISTING_URL : `${LISTING_URL}?page=${page}`;

    try {
      const res = await fetchWithRetry(url);

      // Check for 404 or other non-OK status
      if (!res.ok) {
        console.log(`  Page ${page}: status ${res.status}, stopping pagination`);
        break;
      }

      const html = await res.text();

      // Extract restaurant URLs
      const matches = html.match(/\/stockholm\/restaurang\/[^"]+/g) || [];
      const pageSlugs = matches
        .map((m) => m.replace(/\/stockholm\/restaurang\//, "").replace(/\/$/, ""))
        .filter((s) => s && !s.includes("/"));

      if (pageSlugs.length === 0) {
        console.log(`  Page ${page}: no results, stopping pagination`);
        break;
      }

      const beforeCount = slugs.size;
      pageSlugs.forEach((s) => slugs.add(s));
      console.log(`  Page ${page}: ${slugs.size - beforeCount} new (${slugs.size} total)`);

      await sleep(500);
    } catch (err) {
      // End of pagination (404 or other error)
      console.log(`  Page ${page}: error, stopping pagination`);
      break;
    }
  }

  console.log(`\n  Found ${slugs.size} unique restaurants\n`);
  return [...slugs];
}

/**
 * Parse Thatsup opening hours format to HoursEntry[]
 * Format: ["Su 12:00-21:00", "Mo 11:30-22:00", ...]
 */
function parseOpeningHours(hoursArray: string[][]): HoursEntry[] {
  if (!hoursArray || !Array.isArray(hoursArray)) return [];

  const dayMap: Record<string, number> = {
    Su: 0,
    Mo: 1,
    Tu: 2,
    We: 3,
    Th: 4,
    Fr: 5,
    Sa: 6,
  };

  const entries: HoursEntry[] = [];

  // Flatten nested arrays
  const flat = hoursArray.flat();

  for (const entry of flat) {
    // Parse "Mo 11:30-22:00"
    const match = entry.match(/^(\w{2})\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!match) continue;

    const [, dayCode, open, close] = match;
    const dayNum = dayMap[dayCode];
    if (dayNum === undefined) continue;

    // Check if this time range already exists
    const existing = entries.find((e) => e.open === open && e.close === close);
    if (existing) {
      if (!existing.days.includes(dayNum)) {
        existing.days.push(dayNum);
      }
    } else {
      entries.push({ days: [dayNum], open, close });
    }
  }

  // Sort days within each entry
  entries.forEach((e) => e.days.sort((a, b) => a - b));

  return entries;
}

/**
 * Parse JSON-LD from restaurant page
 */
function parseJsonLd(html: string): Partial<ThatsupRaw> | null {
  const $ = cheerio.load(html);

  let restaurantData: any = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = $(el).html();
      if (!json) return;
      const parsed = JSON.parse(json);

      // Look for @graph with Restaurant type
      if (parsed["@graph"]) {
        for (const item of parsed["@graph"]) {
          if (item["@type"] === "Restaurant") {
            restaurantData = item;
            break;
          }
        }
      } else if (parsed["@type"] === "Restaurant") {
        restaurantData = parsed;
      }
    } catch {}
  });

  if (!restaurantData) return null;

  const address = restaurantData.address || {};
  const geo = restaurantData.geo || {};
  const rating = restaurantData.aggregateRating || {};

  return {
    name: restaurantData.name || "",
    address: address.streetAddress || "",
    postalCode: address.postalCode || "",
    city: address.addressLocality || "",
    phone: restaurantData.telephone || "",
    website: Array.isArray(restaurantData.sameAs)
      ? restaurantData.sameAs[0] || ""
      : restaurantData.sameAs || "",
    cuisine: Array.isArray(restaurantData.servesCuisine)
      ? restaurantData.servesCuisine
      : restaurantData.servesCuisine
        ? [restaurantData.servesCuisine]
        : [],
    priceRange: restaurantData.priceRange || "",
    rating: rating.ratingValue ?? null,
    reviewCount: rating.reviewCount ?? 0,
    hours: parseOpeningHours(restaurantData.openingHours),
    lat: geo.latitude ?? null,
    lng: geo.longitude ?? null,
  };
}

/**
 * Scrape a single restaurant page
 */
async function scrapeRestaurant(slug: string): Promise<ThatsupRaw | null> {
  try {
    const url = `${BASE_URL}/stockholm/restaurang/${slug}/`;
    const res = await fetchWithRetry(url);
    const html = await res.text();
    const parsed = parseJsonLd(html);

    if (!parsed?.name) return null;

    return {
      source: "thatsup",
      slug,
      name: parsed.name,
      address: parsed.address || "",
      postalCode: parsed.postalCode || "",
      city: parsed.city || "",
      phone: parsed.phone || "",
      website: parsed.website || "",
      cuisine: parsed.cuisine || [],
      priceRange: parsed.priceRange || "",
      rating: parsed.rating ?? null,
      reviewCount: parsed.reviewCount ?? 0,
      hours: parsed.hours || [],
      lat: parsed.lat ?? null,
      lng: parsed.lng ?? null,
      url,
    };
  } catch (err) {
    console.log(`  Failed to scrape ${slug}: ${err}`);
    return null;
  }
}

// ─── Main scraper function ───────────────────────────────────────

export async function scrapeThatsup(): Promise<ThatsupRaw[]> {
  console.log("=== Thatsup Scraper ===\n");

  // Load existing data to avoid re-scraping
  const existing = loadRawJson<ThatsupRaw[]>("thatsup.json") ?? [];
  const existingSlugs = new Set(existing.map((r) => r.slug));

  if (existing.length > 0) {
    console.log(`Loaded ${existing.length} existing restaurants from thatsup.json`);
  }

  // Fetch all slugs
  const slugs = await fetchAllSlugs();

  // Filter to new slugs
  const newSlugs = slugs.filter((slug) => !existingSlugs.has(slug));
  console.log(`New restaurants to scrape: ${newSlugs.length}`);
  console.log(`Already scraped: ${existingSlugs.size}\n`);

  if (newSlugs.length === 0) {
    console.log("All restaurants already scraped. Nothing to do.");
    return existing;
  }

  const restaurants: ThatsupRaw[] = [...existing];

  for (let i = 0; i < newSlugs.length; i++) {
    const slug = newSlugs[i];
    process.stdout.write(`[${i + 1}/${newSlugs.length}] `);

    const restaurant = await scrapeRestaurant(slug);
    if (restaurant) {
      restaurants.push(restaurant);
      const ratingStr = restaurant.rating ? `${restaurant.rating}/5` : "no rating";
      console.log(`${restaurant.name} (${ratingStr})`);
    } else {
      console.log(`FAILED: ${slug}`);
    }

    // Rate limit
    await sleep(1000);

    // Save progress every 50 restaurants
    if (i % 50 === 49) {
      saveRawJson("thatsup.json", restaurants);
      console.log(`  [saved progress: ${restaurants.length} restaurants]`);
    }
  }

  // Final save
  saveRawJson("thatsup.json", restaurants);

  console.log(`\nThatsup scrape complete: ${restaurants.length} restaurants`);
  console.log(`  New: ${newSlugs.length}`);
  console.log(`  Previously scraped: ${existing.length}`);

  // Stats by rating
  const withRating = restaurants.filter((r) => r.rating !== null);
  const avgRating = withRating.length > 0
    ? (withRating.reduce((sum, r) => sum + (r.rating || 0), 0) / withRating.length).toFixed(2)
    : "N/A";
  console.log(`\nRating stats:`);
  console.log(`  With rating: ${withRating.length}`);
  console.log(`  Average rating: ${avgRating}`);

  return restaurants;
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("thatsup")) {
  scrapeThatsup().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
