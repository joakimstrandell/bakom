/**
 * White Guide API scraper.
 * Fetches Stockholm restaurant data from the White Guide admin API.
 *
 * Output: data/raw/whiteguide.json (WhiteGuideRaw[])
 *
 * CLI: tsx pipeline/collect/whiteguide.ts
 */

import { fetchWithRetry, saveRawJson } from "../utils/fetch.js";
import type { WhiteGuideRaw } from "../types.js";
import type { WhiteGuideClassification } from "../../src/types.js";

const API_URL = "https://admin.whiteguide.com/api/search/detailed";

const RELEASE_IDS = [93, 59, 60, 58, 98, 181];
const STOCKHOLM_CITY_ID = 11;
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

export async function scrapeWhiteGuide(): Promise<WhiteGuideRaw[]> {
  console.log("=== White Guide Scraper ===\n");

  // Build query string
  const params = new URLSearchParams();
  params.set("search[query]", "");
  params.set("type", "restaurant");
  params.set(`search[channel_ids][]`, String(SWEDEN_CHANNEL_ID));
  params.set(`search[city_ids][]`, String(STOCKHOLM_CITY_ID));
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

  // Filter to Stockholm restaurants and map to our type
  const restaurants: WhiteGuideRaw[] = [];
  const seen = new Set<number>();

  for (const item of data) {
    const placeId = item.place_id;

    // Skip duplicates (same restaurant can appear in multiple releases)
    if (seen.has(placeId)) continue;
    seen.add(placeId);

    // Extra safety: filter to Stockholm
    const address = item.address ?? "";
    if (!address.toLowerCase().includes("stockholm")) continue;

    const scores = item.detailed?.scores_totals ?? {};
    const classification = mapClassification(
      item.classification_total_label ?? "REKOMMENDERAD"
    );

    restaurants.push({
      source: "whiteguide",
      placeId,
      name: item.place_title ?? item.title ?? "",
      address,
      city: "Stockholm",
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

  console.log(`\nWhite Guide scrape complete: ${restaurants.length} Stockholm restaurants`);
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
