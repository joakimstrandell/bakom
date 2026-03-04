/**
 * Refine step: enriches merged restaurant data with external sources,
 * calculates Bakom Score, and validates.
 *
 * Processing order:
 *   1. Google Places enrichment (if API key set)
 *   2. Geocode missing coordinates (OSM Nominatim)
 *   3. Deduplicate by ID and Google Place ID
 *   4. Calculate Bakom Score
 *   5. Validate
 *
 * Note: permanently closed restaurants are kept in restaurants.json
 * so enrichment data survives merge re-runs. They are filtered out
 * in the optimize step (restaurants.frontend.json).
 *
 * Reads & updates: data/restaurants.json
 *
 * npm scripts:
 *   npm run pipeline:refine
 *   npm run pipeline:refine --force   # re-enrich all with Google
 *
 * CLI: tsx pipeline/process/refine.ts [--force]
 */

import { loadJson, saveJson } from "../utils/fetch.js";
import { enrichWithGoogle } from "../collect/google.js";
import { geocodeRestaurants } from "./geocode.js";
import { calculateBakomScore } from "../../src/lib/score.js";
import {
  calculateQualityMetrics,
  printQualityReport,
  validateRestaurant,
} from "../utils/validate.js";
import type { PipelineRestaurant } from "../types.js";

// ─── Main refine function ────────────────────────────────────────

export async function refine(
  options: { force?: boolean } = {}
): Promise<PipelineRestaurant[]> {
  const force = options.force ?? false;
  console.log(`=== Refine${force ? " (--force)" : ""} ===\n`);

  const restaurants = loadJson<PipelineRestaurant[]>("restaurants.json");
  if (!restaurants) {
    throw new Error(
      "data/restaurants.json not found. Run pipeline:merge first."
    );
  }

  console.log(`Loaded ${restaurants.length} restaurants\n`);

  const save = () => saveJson("restaurants.json", restaurants);

  // ── 1. Google Places enrichment ──────────────────────────────

  if (process.env.GOOGLE_PLACES_API_KEY) {
    await enrichWithGoogle(restaurants, { saveProgress: save, force });
    save();
    console.log("");
  } else {
    console.log(
      "⚠️  Skipping Google Places (no GOOGLE_PLACES_API_KEY set)\n"
    );
  }

  // ── 2. Geocode missing coordinates ───────────────────────────

  const needsGeocode = restaurants.filter((r) => !r.lat || !r.lng).length;
  if (needsGeocode > 0) {
    await geocodeRestaurants(restaurants, { saveProgress: save });
    save();
    console.log("");
  } else {
    console.log("All restaurants have coordinates. Skipping geocode.\n");
  }

  // ── 3. Deduplicate ──────────────────────────────────────────

  // 3a. Deduplicate by exact ID
  const seenIds = new Set<string>();
  const beforeDedup = restaurants.length;
  let deduped: PipelineRestaurant[] = [];

  for (const r of restaurants) {
    if (!seenIds.has(r.id)) {
      seenIds.add(r.id);
      deduped.push(r);
    }
  }

  const idDupes = beforeDedup - deduped.length;
  if (idDupes > 0) {
    console.log(`  Dedup by ID: removed ${idDupes} exact duplicates`);
  }

  // 3b. Deduplicate by Google Place ID — same physical location = same restaurant
  //     Catches cases like "Operakällaren" vs "Operakällarens Matsal" that
  //     have different names/IDs but resolve to the same Google Place.
  {
    const byPlaceId = new Map<string, PipelineRestaurant[]>();
    for (const r of deduped) {
      if (!r.googlePlaceId) continue;
      const group = byPlaceId.get(r.googlePlaceId);
      if (group) group.push(r);
      else byPlaceId.set(r.googlePlaceId, [r]);
    }

    const toRemove = new Set<string>();
    let placeIdDupes = 0;

    for (const [, group] of byPlaceId) {
      if (group.length < 2) continue;

      // Pick primary: most sources, then most ratings, then longest name
      group.sort((a, b) => {
        const aSources = a.sources.length;
        const bSources = b.sources.length;
        if (aSources !== bSources) return bSources - aSources;
        const aRatings = Object.values(a.ratings).filter((v) => v != null).length;
        const bRatings = Object.values(b.ratings).filter((v) => v != null).length;
        if (aRatings !== bRatings) return bRatings - aRatings;
        return b.name.length - a.name.length;
      });

      const primary = group[0];

      for (const other of group.slice(1)) {
        // Merge ratings (keep non-null values from other)
        for (const [key, val] of Object.entries(other.ratings)) {
          if (val != null && (primary.ratings as Record<string, unknown>)[key] == null) {
            (primary.ratings as Record<string, unknown>)[key] = val;
          }
        }

        // Merge links
        for (const [key, val] of Object.entries(other.links)) {
          if (val && !(primary.links as Record<string, string | undefined>)[key]) {
            (primary.links as Record<string, string | undefined>)[key] = val;
          }
        }

        // Merge sourceIds
        for (const [key, val] of Object.entries(other.sourceIds)) {
          if (val != null && !(primary.sourceIds as Record<string, unknown>)[key]) {
            (primary.sourceIds as Record<string, unknown>)[key] = val;
          }
        }

        // Merge sources array
        for (const src of other.sources) {
          if (!primary.sources.includes(src)) {
            primary.sources.push(src);
          }
        }

        // Fill missing basic fields
        if (!primary.phone && other.phone) primary.phone = other.phone;
        if (!primary.website && other.website) primary.website = other.website;
        if (!primary.cuisine && other.cuisine) primary.cuisine = other.cuisine;
        if (!primary.priceRange && other.priceRange) primary.priceRange = other.priceRange;
        if (primary.hours.length === 0 && other.hours.length > 0) primary.hours = other.hours;

        console.log(`  Dedup by Google Place ID: merged "${other.name}" → "${primary.name}"`);
        toRemove.add(other.id);
        placeIdDupes++;
      }
    }

    if (placeIdDupes > 0) {
      deduped = deduped.filter((r) => !toRemove.has(r.id));
    }
  }

  if (beforeDedup !== deduped.length) {
    console.log(
      `Deduplicated: ${beforeDedup} → ${deduped.length}\n`
    );
  }

  // Log closed restaurants (filtered out in optimize step)
  const permClosed = deduped.filter(
    (r) => r.businessStatus === "CLOSED_PERMANENTLY"
  ).length;
  const tempClosed = deduped.filter(
    (r) => r.businessStatus === "CLOSED_TEMPORARILY"
  ).length;
  if (permClosed + tempClosed > 0) {
    const parts: string[] = [];
    if (permClosed > 0) parts.push(`${permClosed} permanently`);
    if (tempClosed > 0) parts.push(`${tempClosed} temporarily`);
    console.log(
      `Closed: ${parts.join(", ")} (will be excluded from frontend JSON)\n`
    );
  }

  // ── 4. Calculate Bakom Score ─────────────────────────────────

  for (const r of deduped) {
    const result = calculateBakomScore({
      ratings: r.ratings,
      googleRatingCount: r.googleRatingCount,
      links: r.links,
    });
    if (result) {
      r.bakomScore = result.score;
      r.bakomScoreRaw = result.scoreRaw;
    } else {
      r.bakomScore = null;
      r.bakomScoreRaw = null;
    }
  }

  // ── 5. Calculate Ranks ────────────────────────────────────────

  // Sort by raw score (descending) for fine-grained ranking
  const withScore = deduped
    .filter((r) => r.bakomScoreRaw != null)
    .sort((a, b) => (b.bakomScoreRaw ?? 0) - (a.bakomScoreRaw ?? 0));

  // Assign ranks (1-based)
  for (let i = 0; i < withScore.length; i++) {
    withScore[i].bakomRank = i + 1;
  }

  // Clear rank for unscored restaurants
  for (const r of deduped) {
    if (r.bakomScore == null) {
      r.bakomRank = null;
    }
  }

  if (withScore.length > 0) {
    const scores = withScore.map((r) => r.bakomScore!);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(
      `Bakom Score: ${withScore.length} scored ` +
        `(avg ${avg.toFixed(1)}, max ${Math.max(...scores)})\n`
    );
  }

  // ── 6. Validate ──────────────────────────────────────────────

  const errors: string[] = [];
  const warnings: string[] = [];

  for (const r of deduped) {
    const result = validateRestaurant(r, "refine");
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (errors.length > 0) {
    console.log(`Validation Errors (${errors.length}):`);
    errors.slice(0, 10).forEach((e) => console.log(`  ${e}`));
    if (errors.length > 10)
      console.log(`  ... and ${errors.length - 10} more`);
    console.log("");
  }

  if (warnings.length > 0) {
    console.log(`Validation Warnings (${warnings.length}):`);
    warnings.slice(0, 10).forEach((w) => console.log(`  ${w}`));
    if (warnings.length > 10)
      console.log(`  ... and ${warnings.length - 10} more`);
    console.log("");
  }

  // ── Save ─────────────────────────────────────────────────────

  saveJson("restaurants.json", deduped);

  // Quality report
  const metrics = calculateQualityMetrics(deduped);
  printQualityReport(metrics, "Refined Restaurants");

  console.log(`\nRefine complete: ${deduped.length} restaurants`);

  return deduped;
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("refine")) {
  const force = process.argv.includes("--force");
  refine({ force }).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
