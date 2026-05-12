/** Krogguiden.se collector. @see docs/pipeline.md */

import { createHash } from "crypto";
import * as cheerio from "cheerio";
import { fetchWithRetry, sleep } from "../utils/fetch.js";
import { saveArticles, loadArticles } from "../utils/save.js";
import {
  normalizeVenueName,
  normalizeAddress,
  normalizeCity,
  normalizePriceRange,
} from "../utils/normalize.js";
import type { Article } from "../types.js";

// ─── Config ─────────────────────────────────────────────────────

const BASE_URL = "https://www.krogguiden.se";
const SOURCE_ID = "krogguiden";
const CONCURRENCY = 3;
const MIN_DELAY_MS = 2000;
const MAX_PAGES = 60;
const SAVE_INTERVAL = 50;

// Site self-promo entries that appear in the venue list URL space
const EXCLUDE_SLUGS = new Set(["annonsera-pa-krogguiden"]);

// ─── Types ──────────────────────────────────────────────────────

interface KrogguidenEntry {
  slug: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  region: string;
  priceRange: string;
  cuisine: string;
  image: string;
  rating: number | null;
  url: string;
}

// ─── Phase 1: Discover slugs via AJAX pagination ────────────────

async function fetchAllSlugs(): Promise<string[]> {
  const slugs = new Set<string>();

  console.log("  Fetching slugs via AJAX pagination...");
  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const res = await fetchWithRetry(
        `${BASE_URL}/ajax/getMoreListRestaurants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `page=${page}&sortOption=2`,
        },
      );
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
        console.log(
          `    Page ${page}/${numPages || "?"} — ${slugs.size} slugs`,
        );
      }
      if (numPages && page >= parseInt(numPages)) break;

      await sleep(500);
    } catch (err) {
      console.log(`    AJAX page ${page} error: ${err}`);
      break;
    }
  }

  // Secondary: search endpoint for any we missed
  console.log("  Checking search endpoint...");
  await sleep(2000);
  try {
    const searchRes = await fetchWithRetry(
      `${BASE_URL}/p/search/search?freeText=`,
    );
    const html = await searchRes.text();
    const $ = cheerio.load(html);
    let added = 0;
    $('a[href*="/restauranger/view/"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        const match = href.match(/\/restauranger\/view\/(.+)/);
        if (match && !slugs.has(match[1])) {
          slugs.add(match[1]);
          added++;
        }
      }
    });
    if (added > 0) console.log(`    Added ${added} slugs from search`);
  } catch {
    console.log("    Search endpoint unavailable, skipping");
  }

  console.log(`  Found ${slugs.size} total slugs`);
  return [...slugs];
}

// ─── Phase 2: Scrape detail pages via JSON-LD ───────────────────

function parseJsonLd(
  html: string,
): Partial<KrogguidenEntry> | null {
  const $ = cheerio.load(html);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let restaurantData: Record<string, any> | null = null;
  let ratingValue: string | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = $(el).html();
      if (!json) return;
      const parsed = JSON.parse(json);

      const items = Array.isArray(parsed)
        ? parsed
        : parsed["@graph"]
          ? parsed["@graph"]
          : [parsed];

      for (const item of items) {
        if (item["@type"] === "Review" && item.itemReviewed) {
          const reviewed = item.itemReviewed;
          if (
            [
              "Restaurant",
              "FoodEstablishment",
              "LocalBusiness",
              "BarOrPub",
            ].includes(reviewed["@type"])
          ) {
            restaurantData = reviewed;
          }
        }
        if (item["@type"] === "AggregateRating") {
          ratingValue = item.ratingValue;
        }
        if (
          [
            "Restaurant",
            "FoodEstablishment",
            "LocalBusiness",
            "BarOrPub",
          ].includes(item["@type"])
        ) {
          restaurantData = item;
        }
      }
    } catch {
      // Invalid JSON-LD
    }
  });

  if (!restaurantData) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rd = restaurantData as Record<string, any>;
  const address = rd.address || {};
  const image = rd.image;
  const imageUrl =
    typeof image === "string" ? image : image?.url || "";

  return {
    name: rd.name || "",
    address: address.streetAddress || "",
    postalCode: (address.postalCode || "").replace(/\s/g, "").trim(),
    city: address.addressLocality || "",
    region: address.addressRegion || "",
    priceRange: rd.priceRange || "",
    cuisine: (rd.servesCuisine || "").replace(/,\s*$/, ""),
    image: imageUrl,
    rating: ratingValue ? parseFloat(ratingValue) : null,
  };
}

async function scrapeDetail(
  slug: string,
): Promise<KrogguidenEntry | null> {
  try {
    const url = `${BASE_URL}/restauranger/view/${slug}`;
    const res = await fetchWithRetry(url);
    const html = await res.text();
    const parsed = parseJsonLd(html);

    if (!parsed?.name) return null;

    // Skip entries without address (non-restaurant pages)
    const addr = (parsed.address || "").trim();
    if (!addr) return null;

    return {
      slug,
      name: parsed.name,
      address: addr,
      postalCode: parsed.postalCode || "",
      city: parsed.city || "",
      region: parsed.region || "",
      priceRange: parsed.priceRange || "",
      cuisine: parsed.cuisine || "",
      image: parsed.image || "",
      rating: parsed.rating ?? null,
      url,
    };
  } catch (err) {
    console.log(`    Failed to scrape ${slug}: ${err}`);
    return null;
  }
}

// ─── Concurrency-limited parallel processing ───────────────────

async function parallelScrape(
  slugs: string[],
  onEntry: (entry: KrogguidenEntry) => void,
): Promise<void> {
  let nextIndex = 0;
  let lastStartTime = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (nextIndex < slugs.length) {
      const index = nextIndex++;

      // Enforce minimum delay between starts
      const now = Date.now();
      const elapsed = now - lastStartTime;
      if (elapsed < MIN_DELAY_MS) {
        await sleep(MIN_DELAY_MS - elapsed);
      }
      lastStartTime = Date.now();

      const slug = slugs[index];
      const entry = await scrapeDetail(slug);
      completed++;

      if (entry) {
        onEntry(entry);
        if (completed % 25 === 0 || completed === slugs.length) {
          console.log(
            `    [${completed}/${slugs.length}] ${entry.name}`,
          );
        }
      } else {
        if (completed % 25 === 0) {
          console.log(
            `    [${completed}/${slugs.length}] ${slug} — skipped`,
          );
        }
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY, slugs.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
}

// ─── Convert to Article ────────────────────────────────────────

function makeId(slug: string): string {
  return createHash("sha256")
    .update(`${SOURCE_ID}:${slug}`)
    .digest("hex")
    .slice(0, 12);
}

function entryToArticle(entry: KrogguidenEntry): Article {
  const cuisine = entry.cuisine
    ? entry.cuisine
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : undefined;

  return {
    id: makeId(entry.slug),
    sourceId: SOURCE_ID,
    url: entry.url,
    title: entry.name,
    publishedAt: "",
    contentType: "review",
    bodyText: "",

    venueType: "restaurant",
    venueName: normalizeVenueName(entry.name),
    venueAddress: normalizeAddress(entry.address),
    venueCity: normalizeCity(entry.city),

    score: entry.rating && entry.rating > 0 ? entry.rating : undefined,
    priceRange: normalizePriceRange(entry.priceRange),
    cuisine,
    tags: entry.region ? [entry.region] : undefined,

    collectedAt: new Date().toISOString(),
  };
}

// ─── Import from pipeline1 ─────────────────────────────────────

/** Import existing Krogguiden data from pipeline1's data/raw/krogguiden.json. */
export async function importFromPipeline1(): Promise<Article[]> {
  const { readFileSync } = await import("fs");
  const { join, dirname } = await import("path");
  const { fileURLToPath } = await import("url");

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const rawPath = join(__dirname, "..", "..", "data", "raw", "krogguiden.json");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = JSON.parse(readFileSync(rawPath, "utf-8"));

  console.log(`  Importing ${raw.length} restaurants from pipeline 1...`);

  const articles: Article[] = [];
  for (const r of raw) {
    if (!r.name || !r.address) continue;

    const entry: KrogguidenEntry = {
      slug: r.slug,
      name: r.name,
      address: r.address,
      postalCode: r.postalCode || "",
      city: r.city || "",
      region: r.region || "",
      priceRange: r.priceRange || "",
      cuisine: r.cuisine || "",
      image: r.image || "",
      rating: r.rating,
      url: r.url || `${BASE_URL}/restauranger/view/${r.slug}`,
    };

    articles.push(entryToArticle(entry));
  }

  saveArticles("krogguiden.json", articles);
  console.log(`  Saved ${articles.length} Krogguiden articles`);
  return articles;
}

// ─── Main collector ────────────────────────────────────────────

export async function collectKrogguiden(
  options: { force?: boolean } = {},
): Promise<Article[]> {
  console.log("=== Krogguiden.se ===\n");

  // Load existing articles for incremental mode
  const existing = loadArticles<Article[]>("krogguiden.json") ?? [];
  const existingSlugs = new Set(
    existing.map((a) => {
      const match = a.url.match(/\/restauranger\/view\/(.+)/);
      return match ? match[1] : "";
    }),
  );

  if (existing.length > 0 && !options.force) {
    console.log(`  Loaded ${existing.length} existing articles`);
  }

  // Phase 1: Discover slugs
  const slugs = (await fetchAllSlugs()).filter((s) => !EXCLUDE_SLUGS.has(s));

  // Determine which to scrape
  let toScrape: string[];
  if (options.force) {
    toScrape = slugs;
    console.log(`\n  --force: scraping ALL ${toScrape.length} restaurants\n`);
  } else {
    toScrape = slugs.filter((s) => !existingSlugs.has(s));
    console.log(`\n  New: ${toScrape.length}, existing: ${existingSlugs.size}`);
  }

  if (toScrape.length === 0) {
    console.log("  All restaurants already scraped. Use --force to re-scrape.");
    return existing;
  }

  // Phase 2: Scrape detail pages
  console.log(`\n  Scraping ${toScrape.length} detail pages...`);
  const articles = options.force ? [] : [...existing];
  let scraped = 0;

  await parallelScrape(toScrape, (entry) => {
    articles.push(entryToArticle(entry));
    scraped++;

    // Periodic save
    if (scraped % SAVE_INTERVAL === 0) {
      saveArticles("krogguiden.json", articles);
    }
  });

  // Final save
  saveArticles("krogguiden.json", articles);

  // Stats
  const withScore = articles.filter((a) => a.score && a.score > 0).length;
  const cities: Record<string, number> = {};
  for (const a of articles) {
    const c = a.venueCity || "(none)";
    cities[c] = (cities[c] || 0) + 1;
  }
  const prices: Record<string, number> = {};
  for (const a of articles) {
    const p = a.priceRange || "(none)";
    prices[p] = (prices[p] || 0) + 1;
  }

  console.log(`\n  Total: ${articles.length} restaurants (${scraped} new)`);
  console.log(`  With score: ${withScore}`);
  console.log(
    `  Cities: ${Object.entries(cities)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} (${n})`)
      .join(", ")}`,
  );
  console.log(
    `  Prices: ${Object.entries(prices)
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => `${p} (${n})`)
      .join(", ")}`,
  );

  return articles;
}
