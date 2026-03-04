/**
 * Google Places API enrichment.
 * Enriches restaurants with Google Places data: address, phone, website,
 * hours, rating, coordinates, placeId, and Google Maps link.
 *
 * Skips restaurants that already have a googlePlaceId (already enriched).
 *
 * Requires: GOOGLE_PLACES_API_KEY environment variable.
 *
 * CLI: tsx pipeline/collect/google.ts
 */

import { sleep, loadJson, saveJson } from "../utils/fetch.js";
import { parseGoogleHours } from "../utils/hours.js";
import type { PipelineRestaurant } from "../types.js";

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
  "places.priceLevel",
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
 * Search for a restaurant via Google Places Text Search API.
 * Uses location bias based on the restaurant's city.
 */
const API_TIMEOUT = 15000; // 15s timeout for API calls

async function searchPlace(
  name: string,
  city: string
): Promise<{
  placeId: string;
  address: string;
  phone: string;
  website: string;
  rating: number | null;
  ratingCount: number;
  hours: PipelineRestaurant["hours"];
  lat: number;
  lng: number;
  googleMapsUri: string;
  businessStatus: string;
} | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

  const locationBias = getLocationBias(city);

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
          textQuery: `${name}, ${city}, Sweden`,
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
      address: place.formattedAddress ?? "",
      phone: place.nationalPhoneNumber ?? "",
      website: place.websiteUri ?? "",
      rating: place.rating ?? null,
      ratingCount: place.userRatingCount ?? 0,
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

// ─── Enrichment function ─────────────────────────────────────────

/**
 * Enrich restaurants with Google Places data.
 * Mutates the restaurants array in place.
 *
 * @param restaurants - Array of restaurants to enrich
 * @param options.saveProgress - Optional callback to save intermediate progress
 * @returns Stats: how many enriched vs not found
 */
export async function enrichWithGoogle(
  restaurants: PipelineRestaurant[],
  options?: { saveProgress?: () => void; force?: boolean }
): Promise<{ enriched: number; notFound: number }> {
  if (!API_KEY) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY environment variable is required.\n" +
        "Set it with: export GOOGLE_PLACES_API_KEY=your_key_here"
    );
  }

  const force = options?.force ?? false;
  console.log(`=== Google Places Enrichment${force ? " (--force)" : ""} ===\n`);

  // With --force, re-enrich all restaurants. Otherwise only those without googlePlaceId.
  const needsEnrichment = force
    ? restaurants
    : restaurants.filter((r) => !r.googlePlaceId);
  const alreadyEnriched = restaurants.length - needsEnrichment.length;

  console.log(`  Total restaurants: ${restaurants.length}`);
  if (!force) {
    console.log(`  Already enriched (has googlePlaceId): ${alreadyEnriched}`);
  }
  console.log(`  ${force ? "Will re-enrich" : "Needs enrichment"}: ${needsEnrichment.length}\n`);

  if (needsEnrichment.length === 0) {
    console.log("All restaurants already have Google data. Nothing to do.");
    return { enriched: 0, notFound: 0 };
  }

  let enriched = 0;
  let notFound = 0;

  for (let i = 0; i < needsEnrichment.length; i++) {
    const r = needsEnrichment[i];
    process.stdout.write(
      `[${i + 1}/${needsEnrichment.length}] ${r.name}...`
    );

    try {
      const result = await searchPlace(r.name, r.city || "Sweden");

      if (result) {
        // Update restaurant with Google data
        // Google is preferred for address, phone, website, hours, coordinates
        if (result.address) r.address = result.address;
        if (result.phone) r.phone = result.phone;
        if (result.website) r.website = result.website;
        if (result.hours.length > 0) r.hours = result.hours;
        // Always overwrite coords — Google is more accurate than geocode
        r.lat = result.lat;
        r.lng = result.lng;

        // Always set Google-specific fields
        r.googlePlaceId = result.placeId;
        r.googleRatingCount = result.ratingCount;
        r.ratings.google = result.rating;
        r.links.google = result.googleMapsUri;
        r.sourceIds = { ...r.sourceIds, google: result.placeId };
        r.businessStatus = result.businessStatus;

        // Add "google" to sources if not already there
        if (!r.sources.includes("google")) {
          r.sources.push("google");
        }

        enriched++;
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
      options?.saveProgress?.();
      console.log(`  [progress saved — ${enriched} enriched so far]\n`);
    }
  }

  console.log(`\nGoogle Places enrichment complete:`);
  console.log(`  Enriched: ${enriched}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Previously enriched: ${alreadyEnriched}`);
  console.log(`  Total with Google data: ${alreadyEnriched + enriched}`);

  return { enriched, notFound };
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("google")) {
  (async () => {
    const restaurants = loadJson<PipelineRestaurant[]>("restaurants.json");
    if (!restaurants) {
      throw new Error("data/restaurants.json not found. Run pipeline:merge first.");
    }

    await enrichWithGoogle(restaurants, {
      saveProgress: () => saveJson("restaurants.json", restaurants),
    });

    saveJson("restaurants.json", restaurants);
  })().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
