/**
 * Guide Michelin scraper for Stockholm restaurants.
 * Scrapes the listing page at guide.michelin.com for all Michelin-listed
 * restaurants: Selected (Good Cooking), Bib Gourmand, and 1-3 stars.
 *
 * Output: data/raw/michelin.json (MichelinRaw[])
 *
 * CLI: tsx pipeline/collect/michelin.ts
 */

import * as cheerio from "cheerio";
import { fetchWithRetry, sleep, saveRawJson } from "../utils/fetch.js";
import type { MichelinRaw } from "../types.js";
import type { MichelinDistinction } from "../../src/types.js";

const MICHELIN_BASE = "https://guide.michelin.com";
const LISTING_URL = `${MICHELIN_BASE}/se/en/stockholm-region/restaurants`;

/**
 * Determine the Michelin distinction from the card's distinction icons.
 * Stars are individual <img> elements with "1star" in the src.
 * Bib Gourmand has "bib-gourmand" in the src.
 * Restaurants without icons are "Selected Restaurants" (Good Cooking).
 */
function parseDistinction($card: cheerio.Cheerio<any>, $: cheerio.CheerioAPI): MichelinDistinction {
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
 * Scrape all Michelin-listed restaurants from the Stockholm listing page.
 * The page shows all ~41 restaurants without needing pagination.
 */
async function scrapeListingPage(url: string): Promise<MichelinRaw[]> {
  console.log(`Fetching ${url}`);
  const res = await fetchWithRetry(url);
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
    const city = location.split(",")[0]?.trim() || "Stockholm";

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
    const fullUrl = href.startsWith("http")
      ? href
      : `${MICHELIN_BASE}${href}`;

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
async function enrichFromDetailPage(
  restaurant: MichelinRaw
): Promise<MichelinRaw> {
  try {
    const res = await fetchWithRetry(restaurant.url);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Try to get address from the detail page
    const addressEl = $(".restaurant-details__heading--address").first();
    if (addressEl.length) {
      const detailAddress = addressEl.text().trim();
      if (detailAddress) {
        restaurant.address = detailAddress;
      }
    }

    // Try to get cuisine from detail page if missing
    if (!restaurant.cuisine) {
      const cuisineEl = $(".restaurant-details__heading-price").first();
      const text = cuisineEl.text().trim();
      const match = text.match(/·\s*(.+)/);
      if (match) {
        restaurant.cuisine = match[1].trim();
      }
    }

    // Try to parse price from detail page if missing
    if (!restaurant.priceRange) {
      const priceEl = $(".restaurant-details__heading-price").first();
      const text = priceEl.text().trim();
      const priceMatch = text.match(/^[€$]+/);
      if (priceMatch) {
        restaurant.priceRange = priceMatch[0];
      }
    }
  } catch (err) {
    console.log(`  Failed to enrich ${restaurant.name}: ${err}`);
  }

  return restaurant;
}

// ─── Main scraper function ───────────────────────────────────────

export async function scrapeMichelin(): Promise<MichelinRaw[]> {
  console.log("=== Michelin Guide Scraper ===\n");

  // Scrape the main listing page (all restaurants fit on one page)
  let restaurants = await scrapeListingPage(LISTING_URL);
  console.log(`Found ${restaurants.length} Michelin-listed restaurants\n`);

  // Check for additional pages if there are pagination links
  // (Currently Stockholm has ~41 restaurants, all on one page)

  // Enrich each restaurant with detail page data
  console.log("Enriching with detail page data...\n");
  for (let i = 0; i < restaurants.length; i++) {
    const r = restaurants[i];
    process.stdout.write(
      `[${i + 1}/${restaurants.length}] ${r.name} (${r.distinction})...`
    );

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
  scrapeMichelin().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
