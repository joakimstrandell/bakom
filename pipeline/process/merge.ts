/**
 * Merge step: combines raw data from Krogguiden, Michelin and White Guide
 * into a single unified restaurants.json consumed by the frontend.
 *
 * Preserves existing Google data and coordinates from a previous
 * restaurants.json if it exists — so re-running merge doesn't wipe
 * out enrichment from later pipeline steps.
 *
 * Google is NOT part of merge — it runs after as a refinement step.
 *
 * Output: data/restaurants.json (Restaurant[])
 *
 * CLI: tsx pipeline/process/merge.ts
 */

import { loadJson, loadRawJson, saveJson } from "../utils/fetch.js";
import { normalizeName, findRestaurantMatch } from "../utils/match.js";
import {
  calculateQualityMetrics,
  printQualityReport,
  validateRestaurant,
} from "../utils/validate.js";
import type { Restaurant } from "../../src/types.js";
import type { KrogguidenRaw, MichelinRaw, WhiteGuideRaw, ManualData } from "../types.js";
import { calculateBakomScore } from "../../src/lib/score.js";

// ─── Manual Data Processing ──────────────────────────────────────

/**
 * Load manual data from data/manual.json
 */
function loadManualData(): ManualData | null {
  try {
    const data = loadJson<ManualData>("manual.json");
    return data;
  } catch {
    return null;
  }
}

/**
 * Apply manual additions, merges, and overrides to the restaurant list.
 */
function applyManualData(
  restaurants: Restaurant[],
  manual: ManualData
): { added: number; merged: number; overridden: number } {
  const stats = { added: 0, merged: 0, overridden: 0 };
  const byId = new Map<string, Restaurant>();
  for (const r of restaurants) {
    byId.set(r.id, r);
  }

  // 1. Apply additions (new restaurants not in any source)
  for (const add of manual.additions) {
    if (byId.has(add.id)) {
      console.log(`  Manual: Skipping addition "${add.name}" (ID already exists)`);
      continue;
    }

    const restaurant: Restaurant = {
      id: add.id,
      name: add.name,
      slug: "",
      address: add.address ?? "",
      postalCode: add.postalCode ?? "",
      city: add.city ?? "Stockholm",
      region: "",
      phone: add.phone ?? "",
      website: add.website ?? "",
      priceRange: add.priceRange ?? "",
      cuisine: add.cuisine ?? "",
      image: "",
      hours: [],
      lat: add.lat ?? null,
      lng: add.lng ?? null,
      ratings: {
        krogguiden: null,
        google: null,
        michelin: null,
        whiteguide: null,
      },
      links: add.links ?? {},
      sourceIds: {},
      sources: ["manual"],
    };

    restaurants.push(restaurant);
    byId.set(add.id, restaurant);
    stats.added++;
    console.log(`  Manual: Added "${add.name}"`);
  }

  // 2. Apply merges (combine two entries into one)
  for (const m of manual.merges) {
    const keep = byId.get(m.keep);
    const merge = byId.get(m.merge);

    if (!keep) {
      console.log(`  Manual: Merge failed - keep ID "${m.keep}" not found`);
      continue;
    }
    if (!merge) {
      console.log(`  Manual: Merge failed - merge ID "${m.merge}" not found`);
      continue;
    }

    // Merge sources
    for (const src of merge.sources) {
      if (!keep.sources.includes(src)) {
        keep.sources.push(src);
      }
    }

    // Merge sourceIds
    keep.sourceIds = { ...keep.sourceIds, ...merge.sourceIds };

    // Merge links
    keep.links = { ...keep.links, ...merge.links };

    // Merge ratings (prefer non-null from merged)
    if (merge.ratings.krogguiden && !keep.ratings.krogguiden) {
      keep.ratings.krogguiden = merge.ratings.krogguiden;
    }
    if (merge.ratings.google && !keep.ratings.google) {
      keep.ratings.google = merge.ratings.google;
    }
    if (merge.ratings.michelin && !keep.ratings.michelin) {
      keep.ratings.michelin = merge.ratings.michelin;
    }
    if (merge.ratings.whiteguide && !keep.ratings.whiteguide) {
      keep.ratings.whiteguide = merge.ratings.whiteguide;
    }

    // Optionally prefer specific fields from merged
    if (m.preferFields) {
      for (const field of m.preferFields) {
        if (field in merge && (merge as any)[field]) {
          (keep as any)[field] = (merge as any)[field];
        }
      }
    }

    // Remove the merged entry
    const idx = restaurants.findIndex((r) => r.id === m.merge);
    if (idx !== -1) {
      restaurants.splice(idx, 1);
      byId.delete(m.merge);
    }

    stats.merged++;
    console.log(`  Manual: Merged "${merge.name}" into "${keep.name}"`);
  }

  // 3. Apply overrides (update specific fields)
  for (const o of manual.overrides) {
    const restaurant = byId.get(o.id);
    if (!restaurant) {
      console.log(`  Manual: Override failed - ID "${o.id}" not found`);
      continue;
    }

    for (const [key, value] of Object.entries(o.fields)) {
      (restaurant as any)[key] = value;
    }

    stats.overridden++;
    console.log(`  Manual: Overrode ${Object.keys(o.fields).length} fields on "${restaurant.name}"`);
  }

  return stats;
}

/**
 * Generate a deterministic ID from name + address.
 */
function generateId(name: string, address: string): string {
  return `${name} ${address}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Main merge function ─────────────────────────────────────────

export async function merge(): Promise<Restaurant[]> {
  console.log("=== Merging Sources ===\n");

  const krogguiden = loadRawJson<KrogguidenRaw[]>("krogguiden.json");
  const michelin = loadRawJson<MichelinRaw[]>("michelin.json");
  const whiteguide = loadRawJson<WhiteGuideRaw[]>("whiteguide.json");

  if (!krogguiden) {
    throw new Error("data/raw/krogguiden.json not found. Run scrape:krogguiden first.");
  }

  // Load existing restaurants.json to preserve Google/geocode data
  const existing = loadJson<Restaurant[]>("restaurants.json") ?? [];
  const existingById = new Map<string, Restaurant>();
  for (const r of existing) {
    existingById.set(r.id, r);
  }
  if (existing.length > 0) {
    console.log(`  Existing restaurants.json: ${existing.length} (preserving enrichment data)`);
  }

  console.log(`  Krogguiden: ${krogguiden.length} restaurants`);
  console.log(`  Michelin: ${michelin?.length ?? 0} restaurants`);
  console.log(`  White Guide: ${whiteguide?.length ?? 0} restaurants`);

  // Build Michelin lookup by normalized name
  const michelinByName = new Map<string, MichelinRaw>();
  if (michelin) {
    for (const m of michelin) {
      michelinByName.set(normalizeName(m.name), m);
    }
  }

  // Build White Guide lookup by normalized name
  const wgByName = new Map<string, WhiteGuideRaw>();
  if (whiteguide) {
    for (const w of whiteguide) {
      wgByName.set(normalizeName(w.name), w);
    }
  }

  const restaurants: Restaurant[] = [];
  const matchedMichelinNames = new Set<string>();
  const matchedWgNames = new Set<string>();
  let michelinMatches = 0;
  let wgMatches = 0;
  let fuzzyMatches = 0;
  let preserved = 0;

  // Process Krogguiden records as the base
  for (const kg of krogguiden) {
    // Use fuzzy matching with address proximity
    const michelinMatch = findRestaurantMatch(
      kg.name,
      kg.address,
      michelinByName,
      (item) => item.address,
      0.85
    );
    const wgMatch = findRestaurantMatch(
      kg.name,
      kg.address,
      wgByName,
      (item) => item.address,
      0.85
    );

    const m = michelinMatch?.item;
    const w = wgMatch?.item;

    // Log fuzzy matches (not exact)
    if (michelinMatch && michelinMatch.result.nameSimilarity < 1.0) {
      console.log(
        `  Fuzzy: "${kg.name}" -> Michelin "${m?.name}" (${(michelinMatch.result.nameSimilarity * 100).toFixed(0)}%)`
      );
      fuzzyMatches++;
    }
    if (wgMatch && wgMatch.result.nameSimilarity < 1.0) {
      console.log(
        `  Fuzzy: "${kg.name}" -> WG "${w?.name}" (${(wgMatch.result.nameSimilarity * 100).toFixed(0)}%)`
      );
      fuzzyMatches++;
    }

    if (michelinMatch) {
      michelinMatches++;
      matchedMichelinNames.add(normalizeName(michelinMatch.item.name));
    }
    if (wgMatch) {
      wgMatches++;
      matchedWgNames.add(normalizeName(wgMatch.item.name));
    }

    const id = generateId(kg.name, kg.address);
    const prev = existingById.get(id);

    const sources: string[] = ["krogguiden"];
    if (m) sources.push("michelin");
    if (w) sources.push("whiteguide");
    if (prev?.sources.includes("google")) sources.push("google");

    const restaurant: Restaurant = {
      id,
      name: kg.name,
      slug: kg.slug,
      address: prev?.googlePlaceId ? prev.address : kg.address,
      postalCode: kg.postalCode,
      city: kg.city,
      region: kg.region,
      phone: prev?.googlePlaceId ? prev.phone : kg.phone,
      website: prev?.googlePlaceId ? prev.website : kg.website,
      priceRange: kg.priceRange,
      cuisine: kg.cuisine || (m?.cuisine ?? ""),
      image: kg.image,
      hours: prev?.googlePlaceId && prev.hours.length > 0 ? prev.hours : kg.hours,
      lat: prev?.lat ?? w?.lat ?? null,
      lng: prev?.lng ?? w?.lng ?? null,
      ratings: {
        krogguiden: kg.rating,
        google: prev?.ratings.google ?? null,
        michelin: m?.distinction ?? null,
        whiteguide: w?.classification ?? null,
      },
      links: {
        krogguiden: kg.url,
        michelin: m?.url,
        google: prev?.links.google,
        whiteguide: w?.url,
      },
      sourceIds: {
        krogguiden: kg.slug,
        michelin: m?.url,
        whiteguide: w?.placeId,
        google: prev?.sourceIds?.google ?? prev?.googlePlaceId,
      },
      sources,
    };

    // Preserve Google-specific fields
    if (prev?.googlePlaceId) {
      restaurant.googlePlaceId = prev.googlePlaceId;
      restaurant.googleRatingCount = prev.googleRatingCount;
      preserved++;
    }

    restaurants.push(restaurant);
  }

  // Add Michelin-only restaurants (not in Krogguiden)
  if (michelin) {
    for (const mich of michelin) {
      const norm = normalizeName(mich.name);
      if (matchedMichelinNames.has(norm)) continue;

      const id = generateId(mich.name, mich.address);
      const prev = existingById.get(id);

      // Fuzzy match against White Guide
      const wgMatch = findRestaurantMatch(
        mich.name,
        mich.address,
        wgByName,
        (item) => item.address,
        0.85
      );
      const w = wgMatch?.item;

      if (wgMatch) {
        wgMatches++;
        matchedWgNames.add(normalizeName(wgMatch.item.name));
        if (wgMatch.result.nameSimilarity < 1.0) {
          console.log(
            `  Fuzzy: Michelin "${mich.name}" -> WG "${w?.name}" (${(wgMatch.result.nameSimilarity * 100).toFixed(0)}%)`
          );
          fuzzyMatches++;
        }
      }

      const sources: string[] = ["michelin"];
      if (wgMatch) sources.push("whiteguide");
      if (prev?.sources.includes("google")) sources.push("google");

      const restaurant: Restaurant = {
        id,
        name: mich.name,
        slug: "",
        address: prev?.googlePlaceId ? prev.address : mich.address,
        postalCode: "",
        city: mich.city,
        region: "",
        phone: prev?.phone ?? "",
        website: prev?.website ?? "",
        priceRange: mich.priceRange,
        cuisine: mich.cuisine,
        image: "",
        hours: prev?.hours ?? [],
        lat: prev?.lat ?? w?.lat ?? null,
        lng: prev?.lng ?? w?.lng ?? null,
        ratings: {
          krogguiden: null,
          google: prev?.ratings.google ?? null,
          michelin: mich.distinction,
          whiteguide: w?.classification ?? null,
        },
        links: {
          michelin: mich.url,
          google: prev?.links.google,
          whiteguide: w?.url,
        },
        sourceIds: {
          michelin: mich.url,
          whiteguide: w?.placeId,
          google: prev?.sourceIds?.google ?? prev?.googlePlaceId,
        },
        sources,
      };

      if (prev?.googlePlaceId) {
        restaurant.googlePlaceId = prev.googlePlaceId;
        restaurant.googleRatingCount = prev.googleRatingCount;
        preserved++;
      }

      restaurants.push(restaurant);
    }
  }

  // Add White Guide-only restaurants (not in Krogguiden or Michelin)
  if (whiteguide) {
    for (const w of whiteguide) {
      const norm = normalizeName(w.name);
      if (matchedWgNames.has(norm)) continue;

      const id = generateId(w.name, w.address);
      const prev = existingById.get(id);

      const sources: string[] = ["whiteguide"];
      if (prev?.sources.includes("google")) sources.push("google");

      const restaurant: Restaurant = {
        id,
        name: w.name,
        slug: "",
        address: prev?.googlePlaceId ? prev.address : w.address,
        postalCode: "",
        city: w.city,
        region: "",
        phone: prev?.phone ?? "",
        website: prev?.website ?? "",
        priceRange: "",
        cuisine: w.tags.slice(0, 3).join(", "),
        image: "",
        hours: prev?.hours ?? [],
        lat: prev?.lat ?? w.lat,
        lng: prev?.lng ?? w.lng,
        ratings: {
          krogguiden: null,
          google: prev?.ratings.google ?? null,
          michelin: null,
          whiteguide: w.classification,
        },
        links: {
          google: prev?.links.google,
          whiteguide: w.url,
        },
        sourceIds: {
          whiteguide: w.placeId,
          google: prev?.sourceIds?.google ?? prev?.googlePlaceId,
        },
        sources,
      };

      if (prev?.googlePlaceId) {
        restaurant.googlePlaceId = prev.googlePlaceId;
        restaurant.googleRatingCount = prev.googleRatingCount;
        preserved++;
      }

      restaurants.push(restaurant);
    }
  }

  // Apply manual data (additions, merges, overrides)
  const manual = loadManualData();
  let manualStats = { added: 0, merged: 0, overridden: 0 };
  if (manual) {
    const hasManual =
      manual.additions.length > 0 ||
      manual.merges.length > 0 ||
      manual.overrides.length > 0;

    if (hasManual) {
      console.log(`\nApplying manual data...`);
      manualStats = applyManualData(restaurants, manual);
    }
  }

  // Calculate Bakom Score for all restaurants
  for (const r of restaurants) {
    r.bakomScore = calculateBakomScore({
      ratings: r.ratings,
      googleRatingCount: r.googleRatingCount,
    });
  }

  // Validate all restaurants
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const r of restaurants) {
    const result = validateRestaurant(r, "merged");
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (errors.length > 0) {
    console.log(`\nValidation Errors (${errors.length}):`);
    errors.slice(0, 10).forEach((e) => console.log(`  ${e}`));
    if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
  }

  if (warnings.length > 0) {
    console.log(`\nValidation Warnings (${warnings.length}):`);
    warnings.slice(0, 10).forEach((w) => console.log(`  ${w}`));
    if (warnings.length > 10)
      console.log(`  ... and ${warnings.length - 10} more`);
  }

  // Save merged data
  saveJson("restaurants.json", restaurants);

  const withCoords = restaurants.filter((r) => r.lat && r.lng).length;
  const withHours = restaurants.filter((r) => r.hours.length > 0).length;
  const withMichelin = restaurants.filter((r) => r.ratings.michelin).length;
  const withWg = restaurants.filter((r) => r.ratings.whiteguide).length;

  console.log(`\nMerge complete: ${restaurants.length} restaurants`);
  console.log(`  Michelin matches: ${michelinMatches} (${fuzzyMatches} fuzzy)`);
  console.log(`  White Guide matches: ${wgMatches}`);
  console.log(`  Michelin-only: ${michelin ? michelin.length - michelinMatches : 0}`);
  console.log(`  White Guide-only: ${whiteguide ? whiteguide.length - wgMatches : 0}`);
  console.log(`  Preserved enrichment: ${preserved}`);
  if (manualStats.added || manualStats.merged || manualStats.overridden) {
    console.log(`  Manual: ${manualStats.added} added, ${manualStats.merged} merged, ${manualStats.overridden} overridden`);
  }
  console.log(`  With coordinates: ${withCoords}`);
  console.log(`  With hours: ${withHours}`);
  console.log(`  With Michelin distinction: ${withMichelin}`);
  console.log(`  With White Guide classification: ${withWg}`);

  const withScore = restaurants.filter((r) => r.bakomScore != null);
  if (withScore.length > 0) {
    const scores = withScore.map((r) => r.bakomScore!);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`  With Bakom Score: ${withScore.length} (avg ${avg.toFixed(1)}, max ${Math.max(...scores).toFixed(1)})`);
  }

  // Print quality report
  const metrics = calculateQualityMetrics(restaurants);
  printQualityReport(metrics, "Merged Restaurants");

  return restaurants;
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("merge")) {
  merge().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
