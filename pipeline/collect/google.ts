/** Google Places API collector. @see docs/collect.md */

import { sleep, loadJson, saveRawJson, loadRawJson } from "../utils/fetch.js";
import { parseGoogleHours } from "../utils/hours.js";
import type { PipelineRestaurant, GoogleRaw } from "../types.js";

/** Structure of data/google-overrides.json */
type GoogleOverrides = {
  overrides: Record<string, string>;
};

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.regularOpeningHours",
  "places.rating",
  "places.userRatingCount",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.primaryType",
  "places.googleMapsUri",
  "places.location",
  "places.businessStatus",
].join(",");

/**
 * Approximate coordinates for major Swedish cities (for location bias).
 */
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  stockholm: { lat: 59.33, lng: 18.07 },
  göteborg: { lat: 57.71, lng: 11.97 },
  gothenburg: { lat: 57.71, lng: 11.97 },
  malmö: { lat: 55.60, lng: 13.00 },
  malmo: { lat: 55.60, lng: 13.00 },
  uppsala: { lat: 59.86, lng: 17.64 },
  linköping: { lat: 58.41, lng: 15.62 },
  örebro: { lat: 59.27, lng: 15.21 },
  västerås: { lat: 59.61, lng: 16.55 },
  helsingborg: { lat: 56.05, lng: 12.69 },
  norrköping: { lat: 58.59, lng: 16.18 },
  jönköping: { lat: 57.78, lng: 14.16 },
  lund: { lat: 55.70, lng: 13.19 },
  umeå: { lat: 63.83, lng: 20.26 },
  gävle: { lat: 60.67, lng: 17.14 },
  borås: { lat: 57.72, lng: 12.94 },
  södertälje: { lat: 59.20, lng: 17.63 },
  eskilstuna: { lat: 59.37, lng: 16.51 },
  halmstad: { lat: 56.67, lng: 12.86 },
  växjö: { lat: 56.88, lng: 14.81 },
  karlstad: { lat: 59.40, lng: 13.50 },
  sundsvall: { lat: 62.39, lng: 17.31 },
};

/**
 * Get location bias for a city (returns Sweden center if city not found).
 */
function getLocationBias(city: string): { latitude: number; longitude: number } {
  const normalized = city.toLowerCase().trim();
  const coords = CITY_COORDS[normalized];
  if (coords) {
    return { latitude: coords.lat, longitude: coords.lng };
  }
  // Default to Sweden center (covers whole country reasonably)
  return { latitude: 62.0, longitude: 15.0 };
}

/**
 * Load Google search overrides from data/google-overrides.json.
 * Returns a map of restaurant name → custom search query.
 */
function loadGoogleOverrides(): Map<string, string> {
  try {
    const data = loadJson<GoogleOverrides>("google-overrides.json");
    if (data?.overrides) {
      return new Map(Object.entries(data.overrides));
    }
  } catch {
    // File doesn't exist or is invalid — no overrides
  }
  return new Map();
}


/**
 * Search for a restaurant via Google Places Text Search API.
 * @param name - Restaurant name
 * @param city - City for location bias
 * @param customQuery - Optional custom search query (from google-overrides.json)
 */
const API_TIMEOUT = 15000; // 15s timeout for API calls

async function searchPlace(
  name: string,
  city: string,
  customQuery?: string
): Promise<Omit<GoogleRaw, "source" | "restaurantId" | "searchName"> | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  const locationBias = getLocationBias(city);
  // Use custom query if provided, otherwise default format
  const textQuery = customQuery ?? `${name}, ${city}, Sweden`;

  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": API_KEY!,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        body: JSON.stringify({
          textQuery,
          locationBias: {
            circle: {
              center: locationBias,
              radius: 50000.0, // 50km radius
            },
          },
          languageCode: "sv",
        }),
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      const error = await res.text();
      console.log(`  API error ${res.status}: ${error.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;

    return {
      placeId: place.id,
      name: place.displayName?.text ?? "",
      address: place.formattedAddress ?? "",
      phone: place.nationalPhoneNumber ?? "",
      website: place.websiteUri ?? "",
      rating: place.rating ?? null,
      ratingCount: place.userRatingCount ?? 0,
      primaryType: place.primaryType ?? "",
      hours: parseGoogleHours(place.regularOpeningHours),
      lat: place.location?.latitude ?? 0,
      lng: place.location?.longitude ?? 0,
      googleMapsUri: place.googleMapsUri ?? "",
      businessStatus: place.businessStatus ?? "OPERATIONAL",
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      console.log(`  Timeout after ${API_TIMEOUT}ms`);
      return null;
    }
    throw err;
  }
}

// ─── Collector function ─────────────────────────────────────────

/**
 * Collect Google Places data for all restaurants.
 * Saves results to data/raw/google.json.
 *
 * @param options.force - Re-fetch all restaurants, not just missing ones
 */
export async function collectGoogle(
  options: { force?: boolean } = {}
): Promise<GoogleRaw[]> {
  if (!API_KEY) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY environment variable is required.\n" +
        "Set it with: export GOOGLE_PLACES_API_KEY=your_key_here"
    );
  }

  const force = options.force ?? false;
  console.log(`=== Google Places Collector${force ? " (--force)" : ""} ===\n`);

  // Load restaurants to know what to fetch
  const restaurants = loadJson<PipelineRestaurant[]>("restaurants.json");
  if (!restaurants) {
    throw new Error("data/restaurants.json not found. Run pipeline:merge first.");
  }

  // Load existing Google data (incremental mode)
  const existing = loadRawJson<GoogleRaw[]>("google.json") ?? [];
  const existingById = new Map<string, GoogleRaw>();
  for (const g of existing) {
    existingById.set(g.restaurantId, g);
  }

  // Load Google search overrides
  const overrides = loadGoogleOverrides();
  if (overrides.size > 0) {
    console.log(`  Google overrides loaded: ${overrides.size}`);
  }

  console.log(`  Total restaurants: ${restaurants.length}`);
  console.log(`  Existing Google data: ${existing.length}`);

  // Determine what needs fetching
  // Include restaurants with empty primaryType (need retry with "restaurant" prefix)
  const needsFetch = force
    ? restaurants
    : restaurants.filter((r) => {
        const existing = existingById.get(r.id);
        if (!existing) return true; // Not fetched yet
        if (!existing.primaryType) return true; // Empty primaryType, needs retry
        return false;
      });

  console.log(`  ${force ? "Will re-fetch" : "Needs fetching"}: ${needsFetch.length}\n`);

  if (needsFetch.length === 0) {
    console.log("All restaurants already have Google data. Nothing to fetch.");
    return existing;
  }

  // Start with existing data (will be updated/added to)
  const results = force ? [] : [...existing];
  const resultsById = force ? new Map<string, GoogleRaw>() : new Map(existingById);

  let fetched = 0;
  let notFound = 0;
  let ambiguous = 0;
  const ambiguousNames: string[] = [];

  for (let i = 0; i < needsFetch.length; i++) {
    const r = needsFetch[i];
    const customQuery = overrides.get(r.name);
    const usingOverride = !!customQuery;

    process.stdout.write(`[${i + 1}/${needsFetch.length}] ${r.name}${usingOverride ? " (override)" : ""}...`);

    try {
      let result = await searchPlace(r.name, r.city || "Sweden", customQuery);

      // If no primaryType, retry with "restaurant" prefix (helps with location-based names)
      if (result && !result.primaryType && !usingOverride) {
        process.stdout.write(` (retry with "restaurant")...`);
        await sleep(200);
        const retryResult = await searchPlace(r.name, r.city || "Sweden", `restaurant ${r.name}, ${r.city || "Sweden"}`);
        if (retryResult && retryResult.primaryType) {
          result = retryResult;
        }
      }

      if (result) {
        // Skip results with no primaryType (not a recognized place type)
        // These are likely street addresses or landmarks, not restaurants
        if (!result.primaryType && !usingOverride) {
          ambiguous++;
          ambiguousNames.push(r.name);
          process.stdout.write(` ⚠ skipped (no primaryType)\n`);
          // Remove from results so we don't retry every run
          if (resultsById.has(r.id)) {
            const idx = results.findIndex((g) => g.restaurantId === r.id);
            if (idx >= 0) results.splice(idx, 1);
            resultsById.delete(r.id);
          }
          notFound++;
          continue;
        }

        const googleRaw: GoogleRaw = {
          source: "google",
          restaurantId: r.id,
          searchName: r.name,
          ...result,
        };

        // Update or add to results
        if (resultsById.has(r.id)) {
          const idx = results.findIndex((g) => g.restaurantId === r.id);
          if (idx >= 0) results[idx] = googleRaw;
        } else {
          results.push(googleRaw);
        }
        resultsById.set(r.id, googleRaw);

        fetched++;
        const statusTag = result.businessStatus !== "OPERATIONAL"
          ? ` [${result.businessStatus}]`
          : "";
        process.stdout.write(` ✓ (${result.rating ?? "no rating"})${statusTag}\n`);
      } else {
        notFound++;
        process.stdout.write(` not found\n`);
      }
    } catch (err) {
      notFound++;
      process.stdout.write(` ERROR: ${err}\n`);
    }

    // Small delay to be nice to the API
    await sleep(200);

    // Save progress every 100 restaurants
    if (i % 100 === 99) {
      saveRawJson("google.json", results);
      console.log(`  [progress saved — ${fetched} fetched so far]\n`);
    }
  }

  // Save final results
  saveRawJson("google.json", results);

  console.log(`\nGoogle Places collection complete:`);
  console.log(`  Fetched: ${fetched}`);
  console.log(`  Not found: ${notFound}`);
  if (ambiguous > 0) {
    console.log(`  Skipped (no primaryType): ${ambiguous}`);
    console.log(`\n  ⚠ Skipped restaurants (no primaryType after retry):`);
    for (const name of ambiguousNames.slice(0, 10)) {
      console.log(`    - ${name}`);
    }
    if (ambiguousNames.length > 10) {
      console.log(`    ... and ${ambiguousNames.length - 10} more`);
    }
    console.log(`\n  To include these, add overrides to data/google-overrides.json`);
  }
  console.log(`  Total in google.json: ${results.length}`);

  return results;
}

// ─── Apply function (for refine step) ───────────────────────────

/**
 * Format Google primaryType to a readable cuisine string.
 * E.g., "italian_restaurant" → "Italian", "japanese_restaurant" → "Japanese"
 */
function formatGoogleType(type: string): string {
  const cleaned = type
    .replace(/_restaurant$/, "")
    .replace(/_/g, " ");

  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Strip country suffix from Google's formattedAddress.
 * E.g., "Karlavägen 28, 114 31 Stockholm, Sverige" → "Karlavägen 28, 114 31 Stockholm"
 */
function stripCountrySuffix(address: string): string {
  return address
    .replace(/,\s*Sverige$/i, "")
    .replace(/,\s*Sweden$/i, "")
    .replace(/,\s*Danmark$/i, "")
    .replace(/,\s*Denmark$/i, "");
}

/**
 * Check if a Google result is in Sweden.
 * Uses both coordinates and address to catch edge cases (e.g., Copenhagen
 * has similar longitude to southern Sweden).
 */
function isInSweden(lat: number, lng: number, address: string): boolean {
  const addr = address.toLowerCase();

  // Explicitly exclude non-Swedish addresses
  if (addr.includes("københavn") || addr.includes("copenhagen") ||
      addr.includes("danmark") || addr.includes("denmark") ||
      addr.includes("oslo") || addr.includes("norge") || addr.includes("norway")) {
    return false;
  }

  // Sweden bounding box: lat 55.3-69.1, lng 10.9-24.2
  // But this isn't enough since Copenhagen is within this range
  return lat >= 55.3 && lat <= 69.1 && lng >= 10.9 && lng <= 24.2;
}

/**
 * Apply Google Places data from raw file to restaurants.
 * Used by the refine step.
 */
export function applyGoogleData(restaurants: PipelineRestaurant[]): {
  applied: number;
  missing: number;
  skippedNonSweden: number;
} {
  const googleData = loadRawJson<GoogleRaw[]>("google.json");
  if (!googleData || googleData.length === 0) {
    console.log("  No Google data found in data/raw/google.json");
    return { applied: 0, missing: restaurants.length, skippedNonSweden: 0 };
  }

  // Build lookup by restaurant ID
  const googleById = new Map<string, GoogleRaw>();
  for (const g of googleData) {
    googleById.set(g.restaurantId, g);
  }

  let applied = 0;
  let missing = 0;

  let skippedNonSweden = 0;

  for (const r of restaurants) {
    const g = googleById.get(r.id);

    if (!g) {
      missing++;
      continue;
    }

    // Skip non-Swedish matches (Google matched wrong country)
    if (!isInSweden(g.lat, g.lng, g.address)) {
      console.log(`  Skipping non-Swedish match: "${r.name}" → ${g.address}`);
      skippedNonSweden++;
      missing++;
      continue;
    }

    // Apply Google data to restaurant
    if (g.address) {
      // Strip country suffix and set address
      r.address = stripCountrySuffix(g.address);
      // Google's formattedAddress includes postal code and city
      r.postalCode = "";
    }
    if (g.phone) r.phone = g.phone;
    if (g.website) r.website = g.website;
    if (g.hours.length > 0) r.hours = g.hours;

    // Always overwrite coords — Google is more accurate
    r.lat = g.lat;
    r.lng = g.lng;

    // Set Google-specific fields
    r.googlePlaceId = g.placeId;
    r.googleRatingCount = g.ratingCount;
    r.ratings.google = g.rating;
    r.links.google = g.googleMapsUri;
    r.sourceIds = { ...r.sourceIds, google: g.placeId };
    r.businessStatus = g.businessStatus;

    // Use Google primaryType as cuisine fallback
    if (!r.cuisine && g.primaryType) {
      r.cuisine = formatGoogleType(g.primaryType);
    }

    // Add "google" to sources
    if (!r.sources.includes("google")) {
      r.sources.push("google");
    }

    applied++;
  }

  if (skippedNonSweden > 0) {
    console.log(`  Skipped ${skippedNonSweden} non-Swedish matches`);
  }

  return { applied, missing, skippedNonSweden };
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("google")) {
  const force = process.argv.includes("--force");
  collectGoogle({ force }).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
