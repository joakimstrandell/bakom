/** Guide Michelin scraper. @see docs/collect.md */

import * as cheerio from "cheerio";
import { fetchWithRetry, sleep, saveRawJson, loadRawJson } from "../utils/fetch.js";
import type { MichelinRaw } from "../types.js";
import type { MichelinDistinction } from "../../src/types.js";

const MICHELIN_BASE = "https://guide.michelin.com";
const SWEDEN_URL = `${MICHELIN_BASE}/se/en/selection/sweden/restaurants`;

/**
 * Determine the Michelin distinction from the card's distinction icons.
 * Stars are individual <img> elements with "1star" in the src.
 * Bib Gourmand has "bib-gourmand" in the src.
 * Restaurants without icons are "Selected Restaurants" (Good Cooking).
 */
function parseDistinction(
  $card: cheerio.Cheerio<cheerio.Element>,
  $: cheerio.CheerioAPI
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

  // No distinction icon = Selected Restaurant (Good Cooking)
  return "selected";
}

/**
 * Scrape all Michelin-listed restaurants from a listing page.
 * Returns null if the page doesn't exist (404).
 */
async function scrapeListingPage(url: string): Promise<MichelinRaw[] | null> {
  console.log(`Fetching ${url}`);

  const res = await fetchWithRetry(url, { allowStatus: [404] });

  // 404 means no more pages
  if (res.status === 404) {
    console.log(`  No more pages (404)\n`);
    return null;
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const restaurants: MichelinRaw[] = [];

  // Each restaurant card
  $(".card__menu").each((_, card) => {
    const $card = $(card);

    // Name from the title link
    const titleEl = $card.find(".card__menu-content--title a").first();
    const name = titleEl.text().trim();
    const href = titleEl.attr("href") || "";

    if (!name) return;

    // Distinction (stars, Bib Gourmand, or Selected)
    const distinction = parseDistinction($card, $);

    // Location/city from the card
    const location = $card.find(".card__menu-footer--location").text().trim();
    const city = location.split(",")[0]?.trim() || "";

    // Cuisine
    const cuisine = $card.find(".card__menu-footer--price").text().trim();
    // Sometimes the format is "€€€€ · Cuisine Type" or separate elements
    const cuisineMatch = cuisine.match(/[€$]+\s*·?\s*(.*)/);
    const cuisineText = cuisineMatch?.[1]?.trim() || "";

    // Price range
    const priceMatch = cuisine.match(/^[€$]+/);
    const priceRange = priceMatch?.[0] || "";

    // Address from data attributes
    const address = $card.attr("data-dtm-address") || "";

    // Build full URL
    const fullUrl = href.startsWith("http") ? href : `${MICHELIN_BASE}${href}`;

    restaurants.push({
      source: "michelin",
      name,
      address,
      city,
      distinction,
      cuisine: cuisineText,
      priceRange,
      url: fullUrl,
    });
  });

  return restaurants;
}

/**
 * Scrape detail pages to get more accurate address and cuisine data.
 */
async function enrichFromDetailPage(restaurant: MichelinRaw): Promise<MichelinRaw> {
  try {
    const res = await fetchWithRetry(restaurant.url);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract data from .data-sheet__block--text elements
    $(".data-sheet__block--text").each((_, el) => {
      const text = $(el).text().trim();

      // Address contains "Sweden" at the end
      if (text.match(/Sweden\s*$/i)) {
        restaurant.address = text;
        // Extract city from address (format: "Street, City, Postal, Sweden")
        const parts = text.split(",").map((p) => p.trim());
        if (parts.length >= 3) {
          restaurant.city = parts[1]; // City is typically second part
        }
      }

      // Price and cuisine format: "€€ · Contemporary, International"
      // Use a more flexible regex to handle different separators
      const priceMatch = text.match(/^([€$]+)\s*[·•-]\s*(.+)$/);
      if (priceMatch) {
        restaurant.priceRange = priceMatch[1];
        restaurant.cuisine = priceMatch[2].trim();
      }
    });

    // Also check the header area for price/cuisine (shown under restaurant name)
    // Format: "€€ · Contemporary, International"
    $(".restaurant-details__heading-price, .data-sheet__heading").each((_, el) => {
      const text = $(el).text().trim();
      const match = text.match(/^([€$]+)\s*[·•-]\s*(.+)$/);
      if (match && !restaurant.priceRange) {
        restaurant.priceRange = match[1];
        restaurant.cuisine = match[2].trim();
      }
    });
  } catch (err) {
    console.log(`  Failed to enrich ${restaurant.name}: ${err}`);
  }

  return restaurant;
}

// ─── Main scraper function ───────────────────────────────────────

export async function scrapeMichelin(options: { force?: boolean } = {}): Promise<MichelinRaw[]> {
  console.log("=== Michelin Guide Scraper (All Sweden) ===\n");

  // In incremental mode, skip scraping if data already exists
  if (!options.force) {
    const existing = loadRawJson<MichelinRaw[]>("michelin.json");
    if (existing && existing.length > 0) {
      console.log(
        `Loaded ${existing.length} existing restaurants from michelin.json (use --force to re-scrape)`
      );
      return existing;
    }
  }

  // Scrape all Swedish restaurants (with pagination)
  const restaurants: MichelinRaw[] = [];
  const seenUrls = new Set<string>();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = page === 1 ? SWEDEN_URL : `${SWEDEN_URL}/page/${page}`;
    const pageRestaurants = await scrapeListingPage(url);

    // null means 404 (no more pages)
    if (pageRestaurants === null || pageRestaurants.length === 0) {
      hasMore = false;
      break;
    }

    // Deduplicate
    for (const r of pageRestaurants) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        restaurants.push(r);
      }
    }

    console.log(
      `  Page ${page}: ${pageRestaurants.length} restaurants (${restaurants.length} total)\n`
    );
    page++;
    await sleep(1000);
  }

  console.log(`Found ${restaurants.length} Michelin-listed restaurants in Sweden\n`);

  // Enrich each restaurant with detail page data
  console.log("Enriching with detail page data...\n");
  for (let i = 0; i < restaurants.length; i++) {
    const r = restaurants[i];
    process.stdout.write(`[${i + 1}/${restaurants.length}] ${r.name} (${r.distinction})...`);

    restaurants[i] = await enrichFromDetailPage(r);
    process.stdout.write(` ✓\n`);

    await sleep(2000); // Be nice to Michelin's servers
  }

  // Save results
  saveRawJson("michelin.json", restaurants);

  console.log(`\nMichelin scrape complete: ${restaurants.length} restaurants`);
  const byDistinction = restaurants.reduce(
    (acc, r) => {
      acc[r.distinction] = (acc[r.distinction] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  for (const [distinction, count] of Object.entries(byDistinction)) {
    console.log(`  ${distinction}: ${count}`);
  }

  return restaurants;
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("michelin")) {
  scrapeMichelin({ force: process.argv.includes("--force") }).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
