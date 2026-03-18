/**
 * Thatsup collector — Swedish restaurant/bar/café user ratings.
 *
 * Scrapes JSON-LD structured data directly from thatsup.se listing pages.
 * No browser/Chrome MCP needed — the site serves server-rendered HTML.
 *
 * Data: name, address, coordinates, rating (0-5), review count, cuisine, price range.
 * Pagination: ?page=N with 100 items per page, sorted by rating.
 *
 * Note: Thatsup listing pages return mixed venue types in the JSON-LD @graph
 * (e.g. bars and cafés appear on restaurant pages). We use the ItemList to
 * determine pagination boundaries and the @type field for actual venue type.
 *
 * @see docs/pipeline.md
 */

import { createHash } from "crypto";
import { fetchWithRetry, sleep } from "../utils/fetch.js";
import { saveArticles } from "../utils/save.js";
import {
  normalizeVenueName,
  normalizeCity,
  normalizePriceRange,
} from "../utils/normalize.js";
import type { Article, VenueType } from "../types.js";

// ─── Config ─────────────────────────────────────────────────────

const SOURCE_ID = "thatsup";
const OUT_FILE = "thatsup.json";
const BASE_URL = "https://thatsup.se";
const DELAY_MS = 300;

const CITIES = [
  "sverige", // national — catches venues in smaller towns
  "stockholm",
  "goteborg",
  "malmo",
  "uppsala",
  "gotland",
  "are",
  "boras",
  "vasteras",
  "halmstad",
  "vaxjo",
  "jonkoping",
  "helsingborg",
  "linkoping",
  "norrkoping",
  "orebro",
  "umea",
];

const CATEGORIES: { slug: string; fallbackType: VenueType }[] = [
  { slug: "restaurang", fallbackType: "restaurant" },
  { slug: "bar", fallbackType: "bar" },
  { slug: "cafe", fallbackType: "cafe" },
  { slug: "hotell/hotell", fallbackType: "hotel" },
];

// ─── Types ──────────────────────────────────────────────────────

interface ThatsupJsonLdVenue {
  "@id"?: string;
  "@type"?: string;
  name?: string;
  url?: string;
  address?: {
    streetAddress?: string;
    postalCode?: string;
    addressLocality?: string;
  };
  geo?: {
    latitude?: number;
    longitude?: number;
  };
  aggregateRating?: {
    ratingValue?: number;
    reviewCount?: number;
  };
  servesCuisine?: string[];
  priceRange?: string;
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

/** Map @type to venueType */
function resolveVenueType(
  jsonLdType: string | undefined,
  fallbackType: VenueType,
): VenueType {
  switch (jsonLdType) {
    case "Restaurant":
      return "restaurant";
    case "BarOrPub":
      return "bar";
    case "CafeOrCoffeeShop":
      return "cafe";
    case "Hotel":
      return "hotel";
    default:
      return fallbackType;
  }
}

/** Extract venues from JSON-LD @graph, filtered by ItemList membership.
 *  Returns { venues, itemListCount } where itemListCount is the raw
 *  number of items in the ItemList (used for pagination). */
function extractFromPage(html: string): {
  venues: ThatsupJsonLdVenue[];
  itemListCount: number;
} {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);

      if (data["@graph"] && Array.isArray(data["@graph"])) {
        const graph = data["@graph"] as Record<string, unknown>[];

        // Find ItemList to get the listed venue @ids
        const itemList = graph.find(
          (n) => n["@type"] === "ItemList",
        ) as { itemListElement?: Array<{ item?: { "@id"?: string } }> } | undefined;

        const itemIds = new Set(
          itemList?.itemListElement
            ?.map((e) => e.item?.["@id"])
            .filter(Boolean) ?? [],
        );

        const itemListCount = itemIds.size;

        // Get venue nodes that are in the ItemList
        const venueTypes = new Set([
          "Restaurant",
          "BarOrPub",
          "CafeOrCoffeeShop",
          "Hotel",
          "FoodEstablishment",
          "LocalBusiness",
        ]);

        const venues = graph.filter(
          (node) =>
            typeof node["@type"] === "string" &&
            venueTypes.has(node["@type"]) &&
            (itemIds.size === 0 || itemIds.has(node["@id"] as string)),
        ) as unknown as ThatsupJsonLdVenue[];

        return { venues, itemListCount };
      }
    } catch {
      // Skip invalid JSON
    }
  }
  return { venues: [], itemListCount: 0 };
}

/** Convert a single JSON-LD venue to Article */
function venueToArticle(
  venue: ThatsupJsonLdVenue,
  fallbackType: VenueType,
): Article | null {
  const url = venue.url || venue["@id"];
  if (!venue.name || !url) return null;
  if (!venue.aggregateRating?.ratingValue) return null;

  const venueType = resolveVenueType(venue["@type"], fallbackType);
  const city = venue.address?.addressLocality || "";

  return {
    id: articleId(url),
    sourceId: SOURCE_ID,
    url,
    title: venue.name,
    publishedAt: "",
    contentType: "review",
    bodyText: "",

    venueType,
    venueName: normalizeVenueName(venue.name),
    venueAddress: venue.address?.streetAddress || undefined,
    venueCity: city ? normalizeCity(city) : undefined,

    score: venue.aggregateRating.ratingValue,
    reviewCount: venue.aggregateRating.reviewCount || undefined,
    cuisine: venue.servesCuisine?.length ? venue.servesCuisine : undefined,
    priceRange: normalizePriceRange(venue.priceRange || ""),

    lat: venue.geo?.latitude ?? null,
    lng: venue.geo?.longitude ?? null,

    collectedAt: now(),
  };
}

// ─── Main Collector ─────────────────────────────────────────────

export async function collectThatsup(): Promise<Article[]> {
  console.log("\n=== Thatsup ===\n");

  const seenUrls = new Set<string>();
  const articles: Article[] = [];
  let totalFetches = 0;

  for (const { slug, fallbackType } of CATEGORIES) {
    let categoryNew = 0;

    for (const city of CITIES) {
      let page = 0;

      while (true) {
        const url = `${BASE_URL}/${city}/explore/${slug}/?page=${page}&sort=rating`;
        const res = await fetchWithRetry(url, { allowStatus: [404] });
        totalFetches++;

        if (res.status === 404) break;

        const html = await res.text();
        const { venues, itemListCount } = extractFromPage(html);

        if (itemListCount === 0) break;

        for (const venue of venues) {
          const venueUrl = venue.url || venue["@id"];
          if (!venueUrl || seenUrls.has(venueUrl)) continue;
          seenUrls.add(venueUrl);

          const article = venueToArticle(venue, fallbackType);
          if (article) {
            articles.push(article);
            categoryNew++;
          }
        }

        // Paginate based on ItemList count, not deduped venue count
        if (itemListCount < 100) break;

        page++;
        await sleep(DELAY_MS);
      }

      await sleep(DELAY_MS);
    }

    console.log(`  ${slug}: ${categoryNew} new unique venues`);
  }

  // Stats
  const cities: Record<string, number> = {};
  const types: Record<string, number> = {};
  for (const a of articles) {
    const c = a.venueCity || "(none)";
    cities[c] = (cities[c] || 0) + 1;
    const t = a.venueType || "unknown";
    types[t] = (types[t] || 0) + 1;
  }

  saveArticles(OUT_FILE, articles);
  console.log(`\n  Total: ${articles.length} venues (${totalFetches} pages fetched)`);
  console.log(
    `  Types: ${Object.entries(types)
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t} (${n})`)
      .join(", ")}`,
  );
  console.log(
    `  Cities: ${Object.entries(cities)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([c, n]) => `${c} (${n})`)
      .join(", ")}`,
  );

  return articles;
}
