/** Krogguiden.se collector. @see docs/collect.md */

import * as cheerio from "cheerio";
import {
  fetchWithRetry,
  sleep,
  KROGGUIDEN_BASE_URL,
  saveRawJson,
  loadRawJson,
} from "../utils/fetch.js";
import { batchProcess } from "../utils/concurrency.js";
import { parseHoursFromHtml } from "../utils/hours.js";
import type { KrogguidenRaw } from "../types.js";

// ─── Slug fetching ───────────────────────────────────────────────

async function fetchAllSlugs(): Promise<string[]> {
  const slugs = new Set<string>();

  // Primary: AJAX pagination (most reliable, gets all 598+ restaurants)
  console.log("Fetching slugs via AJAX pagination...");
  for (let page = 1; page <= 55; page++) {
    try {
      const res = await fetchWithRetry(`${KROGGUIDEN_BASE_URL}/ajax/getMoreListRestaurants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `page=${page}&sortOption=2`,
      });
      const html = await res.text();
      if (html.includes("Hoppsan") || !html.trim()) break;

      const $ = cheerio.load(html);
      $('a[href*="/restauranger/view/"]').each((_, el) => {
        const href = $(el).attr("href");
        if (href) {
          const match = href.match(/\/restauranger\/view\/(.+)/);
          if (match) slugs.add(match[1]);
        }
      });

      const numPages = $("[data-numpages]").attr("data-numpages");
      if (page % 10 === 0 || page === 1) {
        console.log(`  Page ${page}/${numPages || "?"} — ${slugs.size} slugs so far`);
      }
      if (numPages && page >= parseInt(numPages)) break;

      await sleep(500);
    } catch (err) {
      console.log(`  AJAX page ${page} error:`, err);
      break;
    }
  }
  console.log(`Found ${slugs.size} slugs from AJAX pagination`);

  // Secondary: search endpoint for any we missed
  console.log("Checking search endpoint for additional slugs...");
  await sleep(2000);
  try {
    const searchRes = await fetchWithRetry(`${KROGGUIDEN_BASE_URL}/p/search/search?freeText=`);
    const searchHtml = await searchRes.text();
    const $search = cheerio.load(searchHtml);
    let added = 0;
    $search('a[href*="/restauranger/view/"]').each((_, el) => {
      const href = $search(el).attr("href");
      if (href) {
        const match = href.match(/\/restauranger\/view\/(.+)/);
        if (match && !slugs.has(match[1])) {
          slugs.add(match[1]);
          added++;
        }
      }
    });
    if (added > 0) console.log(`  Added ${added} new slugs from search`);
  } catch {
    console.log("  Search endpoint unavailable, skipping");
  }

  console.log(`Total unique slugs: ${slugs.size}`);
  return [...slugs];
}

// ─── JSON-LD parsing ─────────────────────────────────────────────

function parseJsonLd(html: string): Partial<KrogguidenRaw> | null {
  const $ = cheerio.load(html);
  let restaurantData: Record<string, unknown> | null = null;
  let ratingValue: string | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = $(el).html();
      if (!json) return;
      const parsed = JSON.parse(json);

      const items = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];

      for (const item of items) {
        if (item["@type"] === "Review" && item.itemReviewed) {
          const reviewed = item.itemReviewed;
          if (
            ["Restaurant", "FoodEstablishment", "LocalBusiness", "BarOrPub"].includes(
              reviewed["@type"]
            )
          ) {
            restaurantData = reviewed;
          }
        }
        if (item["@type"] === "AggregateRating") {
          ratingValue = item.ratingValue;
        }
        if (
          ["Restaurant", "FoodEstablishment", "LocalBusiness", "BarOrPub"].includes(item["@type"])
        ) {
          restaurantData = item;
        }
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  });

  if (!restaurantData) return null;

  const address = restaurantData.address || {};
  const image = restaurantData.image;
  const imageUrl = typeof image === "string" ? image : image?.url || "";

  return {
    name: restaurantData.name || "",
    address: address.streetAddress || "",
    postalCode: (address.postalCode || "").replace(/\s/g, "").trim(),
    city: address.addressLocality || "",
    region: address.addressRegion || "",
    phone: restaurantData.telephone || "",
    website: restaurantData.url || "",
    priceRange: restaurantData.priceRange || "",
    cuisine: (restaurantData.servesCuisine || "").replace(/,\s*$/, ""),
    image: imageUrl,
    rating: ratingValue ? parseFloat(ratingValue) : null,
  };
}

// ─── Detail scraping (JSON-LD + HTML hours in one pass) ──────────

async function scrapeRestaurantDetail(slug: string): Promise<KrogguidenRaw | null> {
  try {
    const res = await fetchWithRetry(`${KROGGUIDEN_BASE_URL}/restauranger/view/${slug}`);
    const html = await res.text();
    const parsed = parseJsonLd(html);

    // Parse hours from HTML in the same pass (avoids a second HTTP request)
    const hours = parseHoursFromHtml(html);

    if (parsed?.name) {
      // Skip entries without a real address — these are usually
      // non-restaurant pages (wines, events, hotels without detail)
      const addr = (parsed.address || "").trim();
      if (!addr) {
        console.log(`  Skipping "${parsed.name}" (no address)`);
        return null;
      }

      return {
        source: "krogguiden",
        slug,
        name: parsed.name,
        address: addr,
        postalCode: parsed.postalCode || "",
        city: parsed.city || "",
        region: parsed.region || "",
        phone: parsed.phone || "",
        website: parsed.website || "",
        priceRange: parsed.priceRange || "",
        cuisine: parsed.cuisine || "",
        image: parsed.image || "",
        rating: parsed.rating ?? null,
        hours,
        url: `${KROGGUIDEN_BASE_URL}/restauranger/view/${slug}`,
      };
    }

    // No JSON-LD found — skip (fallback without structured data
    // produces low-quality entries with no address or metadata)
    return null;
  } catch (err) {
    console.log(`  Failed to scrape ${slug}: ${err}`);
    return null;
  }
}

// ─── Main scraper function ───────────────────────────────────────

export async function scrapeKrogguiden(
  options: { force?: boolean } = {}
): Promise<KrogguidenRaw[]> {
  const force = options.force ?? false;
  console.log("=== Krogguiden Scraper ===\n");

  // Load existing raw data (already scraped restaurants)
  const existing = loadRawJson<KrogguidenRaw[]>("krogguiden.json") ?? [];
  const existingSlugs = new Set(existing.map((r) => r.slug));

  if (existing.length > 0 && !force) {
    console.log(`Loaded ${existing.length} existing restaurants from krogguiden.json`);
  }

  // Check for cached slugs
  const cachedSlugs = loadRawJson<string[]>("krogguiden-slugs.json");
  let slugs: string[];

  if (cachedSlugs) {
    slugs = cachedSlugs;
    console.log(`Loaded ${slugs.length} slugs from cache`);
  } else {
    slugs = await fetchAllSlugs();
    saveRawJson("krogguiden-slugs.json", slugs);
    console.log(`Saved ${slugs.length} slugs`);
  }

  // Determine which slugs need scraping
  let toScrape: string[];
  if (force) {
    toScrape = slugs;
    console.log(`\n--force: Scraping ALL ${toScrape.length} restaurants\n`);
  } else {
    toScrape = slugs.filter((s) => !existingSlugs.has(s));
    console.log(`\nNew slugs to scrape: ${toScrape.length}`);
    console.log(`Already scraped: ${existingSlugs.size}`);
    console.log(`Total slugs: ${slugs.length}\n`);
  }

  if (toScrape.length === 0) {
    console.log("All restaurants already scraped. Nothing to do.");
    console.log("Use --force to re-scrape everything.\n");
    return existing;
  }

  // Start with existing data (unless force, then start fresh)
  const restaurants: KrogguidenRaw[] = force ? [] : [...existing];

  // Process in parallel with concurrency limits
  // 3 concurrent requests with 2s minimum delay = ~1.5 req/s (respectful rate)
  await batchProcess(
    toScrape,
    async (slug, index) => {
      const restaurant = await scrapeRestaurantDetail(slug);
      if (restaurant) {
        restaurants.push(restaurant);
        const hoursInfo = restaurant.hours.length > 0 ? ` (${restaurant.hours.length} hours)` : "";
        console.log(`[${index + 1}/${toScrape.length}] ${restaurant.name}${hoursInfo}`);
      } else {
        console.log(`[${index + 1}/${toScrape.length}] ${slug} FAILED`);
      }
      return restaurant;
    },
    {
      concurrency: 3,
      minDelay: 2000, // 2s between request starts
      saveInterval: 50,
      onSave: () => {
        saveRawJson("krogguiden.json", restaurants);
        console.log(`  [saved progress: ${restaurants.length} restaurants]`);
      },
    }
  );

  // Final save
  saveRawJson("krogguiden.json", restaurants);

  const newCount = force ? restaurants.length : toScrape.length;
  console.log(`\nKrogguiden scrape complete:`);
  console.log(`  New: ${newCount}`);
  console.log(`  Total: ${restaurants.length}`);
  const withHours = restaurants.filter((r) => r.hours.length > 0).length;
  console.log(`  With hours: ${withHours}`);
  console.log(`  Without hours: ${restaurants.length - withHours}`);

  return restaurants;
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("krogguiden")) {
  scrapeKrogguiden({ force: process.argv.includes("--force") }).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
