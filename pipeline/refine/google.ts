/** Refine — Google Places API enrichment. @see docs/pipeline.md */

import { createHash } from "crypto";
import { saveData, loadData } from "../utils/save.js";
import type { Venue } from "../merge/venue.js";

// ─── Config ─────────────────────────────────────────────────────

const API_TIMEOUT = 15000;
const DELAY_MS = 200;
const SAVE_INTERVAL = 100;

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.primaryType",
  "places.googleMapsUri",
  "places.location",
  "places.businessStatus",
  "places.regularOpeningHours",
].join(",");

// ─── Google enrichment fields added to Venue ────────────────────

export type MetroRegion = "stockholm" | "gothenburg" | "malmo" | "sweden";
export type VenueCategory = "restaurant" | "hotel" | "exclude";

/** Opening hours entry — same shape as frontend HoursEntry */
export type PipelineHoursEntry = {
  days: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday
  open: string;   // "HH:MM"
  close: string;  // "HH:MM"
};

export type GoogleEnrichment = {
  googlePlaceId?: string;
  googleRating?: number | null;
  googleRatingCount?: number;
  googleMapsUri?: string;
  googlePrimaryType?: string;
  businessStatus?: string;
  hours?: PipelineHoursEntry[];
  website?: string;
  phone?: string;
  metroRegion?: MetroRegion;
  category?: VenueCategory;
};

export type EnrichedVenue = Venue & GoogleEnrichment;

/** Wrapper stored in venues-refined.json — includes source hash for staleness detection */
type RefinedData = {
  sourceHash: string;
  venues: EnrichedVenue[];
};

// ─── City location biases ───────────────────────────────────────

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  stockholm: { lat: 59.33, lng: 18.07 },
  göteborg: { lat: 57.71, lng: 11.97 },
  malmö: { lat: 55.6, lng: 13.0 },
  uppsala: { lat: 59.86, lng: 17.64 },
  linköping: { lat: 58.41, lng: 15.62 },
  örebro: { lat: 59.27, lng: 15.21 },
  västerås: { lat: 59.61, lng: 16.55 },
  helsingborg: { lat: 56.05, lng: 12.69 },
  norrköping: { lat: 58.59, lng: 16.18 },
  jönköping: { lat: 57.78, lng: 14.16 },
  lund: { lat: 55.7, lng: 13.19 },
  umeå: { lat: 63.83, lng: 20.26 },
  gävle: { lat: 60.67, lng: 17.14 },
  borås: { lat: 57.72, lng: 12.94 },
  halmstad: { lat: 56.67, lng: 12.86 },
  växjö: { lat: 56.88, lng: 14.81 },
  karlstad: { lat: 59.4, lng: 13.5 },
  sundsvall: { lat: 62.39, lng: 17.31 },
  visby: { lat: 57.64, lng: 18.3 },
  åre: { lat: 63.4, lng: 13.08 },
  kalmar: { lat: 56.66, lng: 16.36 },
  luleå: { lat: 65.58, lng: 22.15 },
  kiruna: { lat: 67.86, lng: 20.23 },
  falkenberg: { lat: 56.9, lng: 12.49 },
  borgholm: { lat: 56.88, lng: 16.66 },
};

function getLocationBias(city: string): { latitude: number; longitude: number } {
  const coords = CITY_COORDS[city.toLowerCase().trim()];
  if (coords) return { latitude: coords.lat, longitude: coords.lng };
  return { latitude: 62.0, longitude: 15.0 }; // Sweden center
}

// ─── Sweden validation ──────────────────────────────────────────

function isInSweden(lat: number, lng: number, address: string): boolean {
  const addr = address.toLowerCase();
  if (
    addr.includes("københavn") || addr.includes("copenhagen") ||
    addr.includes("danmark") || addr.includes("denmark") ||
    addr.includes("oslo") || addr.includes("norge") || addr.includes("norway")
  ) {
    return false;
  }
  return lat >= 55.3 && lat <= 69.1 && lng >= 10.9 && lng <= 24.2;
}

// ─── Metro region assignment ────────────────────────────────────

const METRO_REGIONS: { id: MetroRegion; lat: number; lng: number; radiusKm: number }[] = [
  { id: "stockholm", lat: 59.33, lng: 18.07, radiusKm: 50 },
  { id: "gothenburg", lat: 57.71, lng: 11.97, radiusKm: 40 },
  { id: "malmo", lat: 55.6, lng: 13.0, radiusKm: 50 },
];

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function assignMetroRegion(lat: number | null, lng: number | null): MetroRegion {
  if (lat == null || lng == null) return "sweden";
  for (const region of METRO_REGIONS) {
    if (haversineDistance(lat, lng, region.lat, region.lng) <= region.radiusKm) {
      return region.id;
    }
  }
  return "sweden";
}

// ─── Address utilities ──────────────────────────────────────────

function stripCountrySuffix(address: string): string {
  return address
    .replace(/,\s*Sverige$/i, "")
    .replace(/,\s*Sweden$/i, "")
    .trim();
}

/** Extract city from Google's formatted address.
 *  Format: "Street, PostalCode City, Sverige" → "City" */
function extractCityFromGoogleAddress(address: string): string {
  const clean = stripCountrySuffix(address);
  const parts = clean.split(",").map((p) => p.trim());
  if (parts.length < 2) return "";
  // Last part after stripping country is "PostalCode City"
  const lastPart = parts[parts.length - 1];
  // Strip postal code (Swedish: "111 22")
  const withoutPostal = lastPart.replace(/^\d{3}\s*\d{2}\s*/, "").trim();
  return withoutPostal;
}

// ─── API call ───────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlaceResult = Record<string, any>;

async function searchPlace(
  apiKey: string,
  query: string,
  city: string,
): Promise<PlaceResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        locationBias: {
          circle: {
            center: getLocationBias(city),
            radius: 50000.0,
          },
        },
        languageCode: "sv",
      }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const error = await res.text();
      console.log(`    API error ${res.status}: ${error.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    return data.places?.[0] ?? null;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      console.log(`    Timeout after ${API_TIMEOUT}ms`);
      return null;
    }
    throw err;
  }
}

// ─── Food-related Google types ──────────────────────────────────

const FOOD_TYPES = new Set([
  "restaurant", "cafe", "cafeteria", "coffee_shop", "coffee_roastery",
  "bakery", "pastry_shop", "bar", "wine_bar", "cocktail_bar", "pub",
  "brewpub", "bar_and_grill", "bistro", "gastropub", "fine_dining_restaurant",
  "hotel", "resort_hotel", "inn", "lodging", "hostel",
  "ice_cream_shop", "chocolate_shop", "dessert_shop", "sandwich_shop", "bagel_shop",
  // Cuisine-specific
  "italian_restaurant", "french_restaurant", "japanese_restaurant", "sushi_restaurant",
  "chinese_restaurant", "thai_restaurant", "indian_restaurant", "mexican_restaurant",
  "korean_restaurant", "vietnamese_restaurant", "lebanese_restaurant", "persian_restaurant",
  "spanish_restaurant", "greek_restaurant", "turkish_restaurant", "mediterranean_restaurant",
  "scandinavian_restaurant", "european_restaurant", "asian_restaurant", "asian_fusion_restaurant",
  "seafood_restaurant", "steak_house", "hamburger_restaurant", "pizza_restaurant",
  "ramen_restaurant", "tapas_restaurant", "falafel_restaurant", "brunch_restaurant",
  "vegan_restaurant", "vegetarian_restaurant", "brazilian_restaurant", "dim_sum_restaurant",
  "barbecue_restaurant", "bangladeshi_restaurant", "czech_restaurant", "austrian_restaurant",
  "german_restaurant", "peruvian_restaurant", "caribbean_restaurant", "hawaiian_restaurant",
  "danish_restaurant", "ukrainian_restaurant", "south_american_restaurant", "cajun_restaurant",
  "fusion_restaurant", "american_restaurant", "family_restaurant", "fast_food_restaurant",
  "hot_dog_restaurant", "chicken_restaurant", "chinese_noodle_restaurant",
  "japanese_izakaya_restaurant", "basque_restaurant", "southwestern_us_restaurant",
  "indonesian_restaurant", "afghan_restaurant", "ethiopian_restaurant",
]);

function isFoodType(type: string | undefined): boolean {
  return !!type && FOOD_TYPES.has(type);
}

// ─── Venue categorization ───────────────────────────────────────

const HOTEL_TYPES = new Set([
  "hotel", "resort_hotel", "inn", "lodging", "hostel",
]);

function categorizeVenue(venue: EnrichedVenue): VenueCategory {
  const gType = venue.googlePrimaryType || "";

  if (HOTEL_TYPES.has(gType)) return "hotel";
  if (venue.venueType === "hotel" && (!gType || HOTEL_TYPES.has(gType))) return "hotel";

  // Non-food types that survived the retry → exclude
  if (gType && !FOOD_TYPES.has(gType)) return "exclude";

  return "restaurant";
}

// ─── Parse Google opening hours ─────────────────────────────────

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Convert Google Places regularOpeningHours.periods into HoursEntry[].
 * Google format: { open: { day, hour, minute }, close: { day, hour, minute } }
 * where day 0=Sunday matching JS getDay().
 *
 * We group periods with the same open/close times into a single entry
 * with multiple days, producing a compact representation.
 */
function parseGoogleHours(openingHours: PlaceResult | undefined): PipelineHoursEntry[] {
  if (!openingHours?.periods) return [];

  const periods = openingHours.periods as Array<{
    open?: { day?: number; hour?: number; minute?: number };
    close?: { day?: number; hour?: number; minute?: number };
  }>;

  // Group by open-close time pair
  const byTime = new Map<string, number[]>();

  for (const period of periods) {
    if (period.open?.day == null || period.open?.hour == null) continue;

    const openTime = `${pad2(period.open.hour)}:${pad2(period.open.minute ?? 0)}`;

    // If no close, it's 24 hours — use 23:59
    let closeTime: string;
    if (!period.close || period.close.hour == null) {
      closeTime = "23:59";
    } else {
      closeTime = `${pad2(period.close.hour)}:${pad2(period.close.minute ?? 0)}`;
    }

    // Skip entries where open == close (24h marker from some APIs)
    if (openTime === closeTime && openTime === "00:00") {
      closeTime = "23:59";
    }

    const key = `${openTime}-${closeTime}`;
    const existing = byTime.get(key);
    if (existing) {
      existing.push(period.open.day);
    } else {
      byTime.set(key, [period.open.day]);
    }
  }

  const entries: PipelineHoursEntry[] = [];
  for (const [key, days] of byTime) {
    const [open, close] = key.split("-");
    entries.push({ days: days.sort((a, b) => a - b), open, close });
  }

  return entries;
}

// ─── Enrich a single venue ──────────────────────────────────────

async function enrichVenue(
  apiKey: string,
  venue: EnrichedVenue,
): Promise<boolean> {
  const city = venue.city || "Sweden";
  const query = `${venue.name}, ${city}, Sweden`;

  let place = await searchPlace(apiKey, query, city);

  // Retry with "Restaurant" prefix if no primaryType or non-food type
  if (place && !isFoodType(place.primaryType)) {
    await sleep(DELAY_MS);
    const prefix = venue.venueType === "bar" ? "Bar" : "Restaurant";
    const retryQuery = `${prefix} ${venue.name}, ${city}, Sweden`;
    const retryPlace = await searchPlace(apiKey, retryQuery, city);
    if (retryPlace && isFoodType(retryPlace.primaryType)) place = retryPlace;
  }

  if (!place) return false;

  const lat = place.location?.latitude ?? 0;
  const lng = place.location?.longitude ?? 0;
  const address = place.formattedAddress ?? "";

  // Skip non-Swedish matches
  if (!isInSweden(lat, lng, address)) {
    console.log(`    Skipped (not in Sweden): ${address}`);
    return false;
  }

  // Apply enrichment
  venue.googlePlaceId = place.id;
  venue.googleRating = place.rating ?? null;
  venue.googleRatingCount = place.userRatingCount ?? 0;
  venue.googleMapsUri = place.googleMapsUri ?? "";
  venue.googlePrimaryType = place.primaryType ?? "";
  venue.businessStatus = place.businessStatus ?? "OPERATIONAL";

  // Parse opening hours
  const hours = parseGoogleHours(place.regularOpeningHours);
  if (hours.length > 0) venue.hours = hours;

  // Website and phone
  if (place.websiteUri) venue.website = place.websiteUri;
  if (place.nationalPhoneNumber) venue.phone = place.nationalPhoneNumber;

  // Always overwrite coordinates — Google is most accurate
  venue.lat = lat;
  venue.lng = lng;

  // Backfill missing city from Google address
  if (!venue.city) {
    const googleCity = extractCityFromGoogleAddress(address);
    if (googleCity) venue.city = googleCity;
  }

  return true;
}

// ─── Dedup pass ─────────────────────────────────────────────────

function deduplicateByPlaceId(venues: EnrichedVenue[]): {
  deduped: EnrichedVenue[];
  mergedCount: number;
} {
  const byPlaceId = new Map<string, number[]>();

  for (let i = 0; i < venues.length; i++) {
    const pid = venues[i].googlePlaceId;
    if (!pid) continue;
    const existing = byPlaceId.get(pid);
    if (existing) {
      existing.push(i);
    } else {
      byPlaceId.set(pid, [i]);
    }
  }

  const toMerge = new Set<number>();
  let mergedCount = 0;

  for (const [placeId, indices] of byPlaceId) {
    if (indices.length < 2) continue;

    // Keep the venue with the most sources; merge others into it
    const sorted = indices.sort(
      (a, b) => venues[b].sourceCount - venues[a].sourceCount,
    );
    const keeper = sorted[0];
    const keperVenue = venues[keeper];

    for (let k = 1; k < sorted.length; k++) {
      const donor = venues[sorted[k]];
      console.log(
        `    Dedup: "${donor.name}" → "${keperVenue.name}" (placeId: ${placeId})`,
      );

      // Merge sources
      for (const src of donor.sources) {
        const existing = keperVenue.sources.find((s) => s.sourceId === src.sourceId);
        if (existing) {
          for (const aid of src.articleIds) {
            if (!existing.articleIds.includes(aid)) {
              existing.articleIds.push(aid);
            }
          }
        } else {
          keperVenue.sources.push(src);
        }
      }

      // Merge ratings
      for (const [key, value] of Object.entries(donor.ratings)) {
        if (value && !(keperVenue.ratings as Record<string, unknown>)[key]) {
          (keperVenue.ratings as Record<string, unknown>)[key] = value;
        }
      }

      // Update source count
      const srcIds = new Set(keperVenue.sources.map((s) => s.sourceId));
      keperVenue.sourceCount = srcIds.size;

      // Fill missing fields
      if (!keperVenue.address && donor.address) keperVenue.address = donor.address;
      if (!keperVenue.city && donor.city) keperVenue.city = donor.city;
      if (!keperVenue.priceRange && donor.priceRange) keperVenue.priceRange = donor.priceRange;

      toMerge.add(sorted[k]);
      mergedCount++;
    }
  }

  const deduped = venues.filter((_, i) => !toMerge.has(i));
  return { deduped, mergedCount };
}

// ─── Main refine function ───────────────────────────────────────

export async function refineWithGoogle(
  options: { force?: boolean; targetId?: string } = {},
): Promise<EnrichedVenue[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY environment variable is required.\n" +
        "Set it with: export GOOGLE_PLACES_API_KEY=your_key_here",
    );
  }

  console.log("=== Refine (Google Places) ===\n");

  // Load merge output and compute its hash
  const mergeRaw = loadData<Venue[]>("venues.json");
  if (!mergeRaw || mergeRaw.length === 0) {
    throw new Error("pipeline/.data/venues.json not found. Run pipeline:merge first.");
  }
  const sourceHash = createHash("sha256")
    .update(JSON.stringify(mergeRaw))
    .digest("hex")
    .slice(0, 16);

  // Build venue list — start from fresh merge, carry over existing Google data
  let venues: EnrichedVenue[] = mergeRaw as EnrichedVenue[];
  const existing = loadData<RefinedData>("venues-refined.json");

  if (existing && !options.force) {
    if (existing.sourceHash === sourceHash) {
      // Merge output unchanged — use refined data as-is (resume)
      console.log(`  Resuming from venues-refined.json (source hash: ${sourceHash})`);
      venues = existing.venues;
    } else {
      // Merge output changed — carry over Google data for venues that still exist
      const enrichedById = new Map<string, EnrichedVenue>();
      for (const v of existing.venues) {
        if (v.googlePlaceId) enrichedById.set(v.id, v);
      }
      let carried = 0;
      for (const v of venues) {
        const prev = enrichedById.get(v.id);
        if (prev?.googlePlaceId) {
          Object.assign(v, {
            googlePlaceId: prev.googlePlaceId,
            googleRating: prev.googleRating,
            googleRatingCount: prev.googleRatingCount,
            googleMapsUri: prev.googleMapsUri,
            googlePrimaryType: prev.googlePrimaryType,
            businessStatus: prev.businessStatus,
            hours: prev.hours,
            website: prev.website,
            phone: prev.phone,
            lat: prev.lat,
            lng: prev.lng,
          });
          if (!v.city && prev.city) v.city = prev.city;
          carried++;
        }
      }
      console.log(`  Merge output changed (${existing.sourceHash} → ${sourceHash})`);
      console.log(`  Carried over Google data for ${carried}/${existing.venues.length} existing venues`);
    }
  }

  console.log(`  Total venues: ${venues.length}`);

  // Determine what needs enrichment
  let needsEnrich: EnrichedVenue[];
  if (options.targetId) {
    // Target a specific venue by ID — always re-fetch
    needsEnrich = venues.filter((v) => v.id === options.targetId);
    if (needsEnrich.length === 0) {
      throw new Error(`Venue not found: ${options.targetId}`);
    }
  } else if (options.force) {
    needsEnrich = venues;
  } else {
    needsEnrich = venues.filter((v) => !v.googlePlaceId);
  }

  console.log(
    `  Already enriched: ${venues.length - needsEnrich.length}`,
  );
  console.log(
    `  ${options.force ? "Will re-fetch" : "Needs enrichment"}: ${needsEnrich.length}\n`,
  );

  let enriched = 0;
  let notFound = 0;

  if (needsEnrich.length === 0) {
    console.log("  All venues already have Google data.\n");
  }

  for (let i = 0; i < needsEnrich.length; i++) {
    const venue = needsEnrich[i];

    process.stdout.write(
      `  [${i + 1}/${needsEnrich.length}] ${venue.name}...`,
    );

    try {
      const success = await enrichVenue(apiKey, venue);
      if (success) {
        enriched++;
        const status =
          venue.businessStatus !== "OPERATIONAL"
            ? ` [${venue.businessStatus}]`
            : "";
        process.stdout.write(
          ` ✓ ${venue.googlePrimaryType || "?"} (${venue.googleRating ?? "-"})${status}\n`,
        );
      } else {
        notFound++;
        process.stdout.write(` not found\n`);
      }
    } catch (err) {
      notFound++;
      process.stdout.write(` ERROR: ${err}\n`);
    }

    await sleep(DELAY_MS);

    // Save progress
    if ((i + 1) % SAVE_INTERVAL === 0) {
      saveData("venues-refined.json", { sourceHash, venues } satisfies RefinedData);
      console.log(`  [progress saved — ${enriched} enriched so far]\n`);
    }
  }

  // Dedup pass
  console.log("\n  Deduplicating by Google Place ID...");
  const { deduped, mergedCount } = deduplicateByPlaceId(venues);

  // Cleanup pass — remove venues we can't verify or that aren't in Sweden
  const beforeCleanup = deduped.length;
  const removed: { name: string; reason: string }[] = [];

  const cleaned = deduped.filter((v) => {
    // Remove venues without Google data (can't verify existence)
    if (!v.googlePlaceId) {
      removed.push({ name: v.name, reason: "no Google data" });
      return false;
    }
    // Remove non-Swedish venues (coords outside Sweden bounding box)
    if (v.lat && v.lng && !isInSweden(v.lat, v.lng, v.city || "")) {
      removed.push({ name: v.name, reason: `not in Sweden (${v.city || "unknown"})` });
      return false;
    }
    // Remove closed venues
    if (v.businessStatus === "CLOSED_PERMANENTLY" || v.businessStatus === "CLOSED_TEMPORARILY") {
      removed.push({ name: v.name, reason: v.businessStatus.toLowerCase().replace("_", " ") });
      return false;
    }
    return true;
  });

  if (removed.length > 0) {
    console.log(`\n  Cleanup: removed ${removed.length} venues:`);
    for (const r of removed) {
      console.log(`    - ${r.name} (${r.reason})`);
    }
  }

  // Assign metro regions and categories
  for (const v of cleaned) {
    v.metroRegion = assignMetroRegion(v.lat, v.lng);
    v.category = categorizeVenue(v);
  }

  // Save
  saveData("venues-refined.json", { sourceHash, venues: cleaned } satisfies RefinedData);

  // Stats
  const withCoords = cleaned.filter((v) => v.lat && v.lng).length;

  // Primary type breakdown
  const byType = new Map<string, number>();
  for (const v of cleaned) {
    if (v.googlePrimaryType) {
      byType.set(v.googlePrimaryType, (byType.get(v.googlePrimaryType) ?? 0) + 1);
    }
  }

  console.log(`\n  === Refine Results ===`);
  console.log(`  Enriched: ${enriched}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Dedup merges: ${mergedCount}`);
  console.log(`  Removed (cleanup): ${removed.length}`);
  console.log(`  Final venues: ${cleaned.length}`);
  console.log(`  With coordinates: ${withCoords}`);

  // Metro region breakdown
  const regionCounts: Record<MetroRegion, number> = { stockholm: 0, gothenburg: 0, malmo: 0, sweden: 0 };
  for (const v of cleaned) {
    regionCounts[v.metroRegion || "sweden"]++;
  }
  // Category breakdown
  const catCounts = { restaurant: 0, hotel: 0, exclude: 0 };
  for (const v of cleaned) catCounts[v.category || "restaurant"]++;
  console.log(`\n  Categories:`);
  console.log(`    Restaurants: ${catCounts.restaurant}`);
  console.log(`    Hotels:      ${catCounts.hotel}`);
  console.log(`    Excluded:    ${catCounts.exclude}`);

  console.log(`\n  Metro regions:`);
  console.log(`    Stockholm:  ${regionCounts.stockholm}`);
  console.log(`    Göteborg:   ${regionCounts.gothenburg}`);
  console.log(`    Malmö:      ${regionCounts.malmo}`);
  console.log(`    Övriga:     ${regionCounts.sweden}`);
  console.log(`\n  Top Google types:`);
  for (const [type, n] of [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`    ${type}: ${n}`);
  }

  return cleaned;
}
