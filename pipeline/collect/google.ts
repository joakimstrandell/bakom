/**
 * Google Places API refinement step.
 * Reads data/restaurants.json (post-merge) and enriches each restaurant
 * with Google Places data: address, phone, website, hours, rating,
 * coordinates, placeId, and Google Maps link.
 *
 * Skips restaurants that already have a googlePlaceId (already enriched).
 *
 * Requires: GOOGLE_PLACES_API_KEY environment variable.
 *
 * Reads & updates: data/restaurants.json
 *
 * CLI: tsx pipeline/collect/google.ts
 */

import { sleep, loadJson, saveJson } from "../utils/fetch.js";
import { parseGoogleHours } from "../utils/hours.js";
import type { Restaurant } from "../../src/types.js";

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
].join(",");

/**
 * Search for a restaurant via Google Places Text Search API.
 * Uses location bias around Stockholm to improve match accuracy.
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
  hours: Restaurant["hours"];
  lat: number;
  lng: number;
  googleMapsUri: string;
} | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

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
          textQuery: `${name}, ${city}`,
          locationBias: {
            circle: {
              center: { latitude: 59.33, longitude: 18.07 },
              radius: 30000.0, // 30km around Stockholm center
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

// ─── Main refinement function ─────────────────────────────────────

export async function refineWithGoogle(): Promise<void> {
  if (!API_KEY) {
    throw new Error(
      "GOOGLE_PLACES_API_KEY environment variable is required.\n" +
        "Set it with: export GOOGLE_PLACES_API_KEY=your_key_here"
    );
  }

  console.log("=== Google Places Refinement ===\n");

  const restaurants = loadJson<Restaurant[]>("restaurants.json");
  if (!restaurants) {
    throw new Error(
      "data/restaurants.json not found. Run scrape:merge first."
    );
  }

  // Split into already-enriched and needs-enrichment
  const needsEnrichment = restaurants.filter((r) => !r.googlePlaceId);
  const alreadyEnriched = restaurants.length - needsEnrichment.length;

  console.log(`  Total restaurants: ${restaurants.length}`);
  console.log(`  Already enriched (has googlePlaceId): ${alreadyEnriched}`);
  console.log(`  Needs enrichment: ${needsEnrichment.length}\n`);

  if (needsEnrichment.length === 0) {
    console.log("All restaurants already have Google data. Nothing to do.");
    return;
  }

  let enriched = 0;
  let notFound = 0;

  for (let i = 0; i < needsEnrichment.length; i++) {
    const r = needsEnrichment[i];
    process.stdout.write(
      `[${i + 1}/${needsEnrichment.length}] ${r.name}...`
    );

    try {
      const result = await searchPlace(r.name, r.city || "Stockholm");

      if (result) {
        // Update restaurant with Google data
        // Google is preferred for address, phone, website, hours, coordinates
        if (result.address) r.address = result.address;
        if (result.phone) r.phone = result.phone;
        if (result.website) r.website = result.website;
        if (result.hours.length > 0) r.hours = result.hours;
        if (result.lat && result.lng) {
          r.lat = result.lat;
          r.lng = result.lng;
        }

        // Always set Google-specific fields
        r.googlePlaceId = result.placeId;
        r.googleRatingCount = result.ratingCount;
        r.ratings.google = result.rating;
        r.links.google = result.googleMapsUri;
        r.sourceIds = { ...r.sourceIds, google: result.placeId };

        // Add "google" to sources if not already there
        if (!r.sources.includes("google")) {
          r.sources.push("google");
        }

        enriched++;
        process.stdout.write(` ✓ (${result.rating ?? "no rating"})\n`);
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
      saveJson("restaurants.json", restaurants);
      console.log(`  [progress saved — ${enriched} enriched so far]\n`);
    }
  }

  // Final save
  saveJson("restaurants.json", restaurants);

  console.log(`\nGoogle Places refinement complete:`);
  console.log(`  Enriched: ${enriched}`);
  console.log(`  Not found: ${notFound}`);
  console.log(`  Previously enriched: ${alreadyEnriched}`);
  console.log(`  Total with Google data: ${alreadyEnriched + enriched}`);
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("google")) {
  refineWithGoogle().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
