/**
 * Geocoding utility using OpenStreetMap Nominatim.
 */

import { sleep } from "./fetch.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/**
 * Geocode a single address via Nominatim with a fallback strategy.
 * First tries full address + postal code + city, then falls back to address + city.
 */
export async function geocodeAddress(
  address: string,
  postalCode: string | undefined,
  city: string
): Promise<{ lat: number; lng: number } | null> {
  const query = [address, postalCode, city, "Sweden"].filter(Boolean).join(", ");

  const params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    countrycodes: "se",
  });

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        "User-Agent": "KrogguidenMap/1.0 (hobby project; Stockholm restaurants)",
      },
    });

    if (!res.ok) {
      console.log(`  Geocode HTTP ${res.status} for "${query}"`);
      return null;
    }

    const data = await res.json();
    if (data.length === 0) {
      // Fallback: try with just address + city
      const fallbackQuery = [address, city || "Stockholm"].join(", ");
      const fallbackParams = new URLSearchParams({
        q: fallbackQuery,
        format: "json",
        limit: "1",
        countrycodes: "se",
      });

      await sleep(1100); // respect Nominatim rate limit

      const fallbackRes = await fetch(`${NOMINATIM_URL}?${fallbackParams}`, {
        headers: {
          "User-Agent": "KrogguidenMap/1.0 (hobby project; Stockholm restaurants)",
        },
      });
      const fallbackData = await fallbackRes.json();
      if (fallbackData.length === 0) {
        console.log(`  No results for "${query}"`);
        return null;
      }
      return {
        lat: parseFloat(fallbackData[0].lat),
        lng: parseFloat(fallbackData[0].lon),
      };
    }

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
  } catch (err) {
    console.log(`  Geocode error for "${query}":`, err);
    return null;
  }
}
