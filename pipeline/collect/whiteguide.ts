/** White Guide API scraper. @see docs/collect.md */

import { fetchWithRetry, saveRawJson } from "../utils/fetch.js";
import type { WhiteGuideRaw } from "../types.js";
import type { WhiteGuideClassification } from "../../src/types.js";

const API_URL = "https://admin.whiteguide.com/api/search/detailed";

const RELEASE_IDS = [93, 59, 60, 58, 98, 181];
const SWEDEN_CHANNEL_ID = 3;

/**
 * Map the Swedish classification label to our enum.
 */
function mapClassification(
  label: string
): WhiteGuideClassification {
  const normalized = label.toUpperCase().trim();
  if (normalized.includes("GLOBAL")) return "global_master_class";
  if (normalized.includes("MÄSTAR")) return "master_class";
  if (normalized.includes("MYCKET")) return "very_good_class";
  if (normalized.includes("GOD KLASS")) return "good_class";
  return "recommended";
}

// ─── Main scraper function ───────────────────────────────────────

export async function scrapeWhiteGuide(
  _options: { force?: boolean } = {},
): Promise<WhiteGuideRaw[]> {
  console.log("=== White Guide Scraper (All Sweden) ===\n");

  // Build query string - no city filter to get all Swedish restaurants
  const params = new URLSearchParams();
  params.set("search[query]", "");
  params.set("type", "restaurant");
  params.set(`search[channel_ids][]`, String(SWEDEN_CHANNEL_ID));
  params.set("locale", "sv");
  params.set("search[tags_and]", "true");

  // URLSearchParams doesn't handle duplicate keys well, build manually
  const releaseParams = RELEASE_IDS.map(
    (id) => `search[release_ids][]=${id}`
  ).join("&");

  const url = `${API_URL}?${params.toString()}&${releaseParams}`;

  console.log("Fetching from White Guide API...");

  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });

  const data: any[] = await res.json();
  console.log(`  API returned ${data.length} results`);

  // Map to our type (no city filter - include all Swedish restaurants)
  const restaurants: WhiteGuideRaw[] = [];
  const seen = new Set<number>();

  for (const item of data) {
    const placeId = item.place_id;

    // Skip duplicates (same restaurant can appear in multiple releases)
    if (seen.has(placeId)) continue;
    seen.add(placeId);

    const address = item.address ?? "";
    const scores = item.detailed?.scores_totals ?? {};
    const classification = mapClassification(
      item.classification_total_label ?? "REKOMMENDERAD"
    );

    // Extract city from address (format: "Street, PostalCode City")
    const cityMatch = address.match(/\d{3}\s?\d{2}\s+(.+?)$/);
    const city = cityMatch?.[1]?.trim() || "";

    restaurants.push({
      source: "whiteguide",
      placeId,
      name: item.place_title ?? item.title ?? "",
      address,
      city,
      classification,
      totalScore: scores.total ?? 0,
      foodScore: scores.food ?? 0,
      drinkScore: scores.drink ?? 0,
      serviceScore: scores.service ?? 0,
      environmentScore: scores.environment ?? 0,
      tags: item.detailed?.tag_names ?? [],
      lat: item.detailed?.lat ?? null,
      lng: item.detailed?.lng ?? null,
      url: `https://whiteguide.com/se/sv/restaurants/${placeId}`,
    });
  }

  // Save
  saveRawJson("whiteguide.json", restaurants);

  // Stats
  const byClass = new Map<string, number>();
  for (const r of restaurants) {
    byClass.set(r.classification, (byClass.get(r.classification) ?? 0) + 1);
  }

  console.log(`\nWhite Guide scrape complete: ${restaurants.length} Swedish restaurants`);
  for (const [cls, count] of [...byClass.entries()].sort()) {
    console.log(`  ${cls}: ${count}`);
  }

  return restaurants;
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("whiteguide")) {
  scrapeWhiteGuide().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
