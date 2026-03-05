/** Refine step: applies Google data, deduplicates, calculates scores. @see docs/refine.md */

import { loadJson, saveJson } from "../utils/fetch.js";
import { applyGoogleData } from "../collect/google.js";
import { calculateBakomScore } from "../../src/lib/score.js";
import {
  calculateQualityMetrics,
  printQualityReport,
  validateRestaurant,
} from "../utils/validate.js";
import { deduplicateByGooglePlaceId } from "../utils/dedup.js";
import type { PipelineRestaurant } from "../types.js";

// ─── Main refine function ────────────────────────────────────────

export async function refine(): Promise<PipelineRestaurant[]> {
  console.log("=== Refine ===\n");

  const restaurants = loadJson<PipelineRestaurant[]>("restaurants.json");
  if (!restaurants) {
    throw new Error("data/restaurants.json not found. Run pipeline:merge first.");
  }

  console.log(`Loaded ${restaurants.length} restaurants\n`);

  const save = () => saveJson("restaurants.json", restaurants);

  // ── 1. Apply Google Places data ────────────────────────────────
  // Google data is collected separately via pipeline:collect --source google
  // Here we just apply the raw data from data/raw/google.json

  const googleResult = applyGoogleData(restaurants);
  if (googleResult.applied > 0) {
    console.log(
      `Google Places: applied to ${googleResult.applied} restaurants` +
        (googleResult.missing > 0 ? `, ${googleResult.missing} missing` : "") +
        (googleResult.skippedNonSweden > 0
          ? `, ${googleResult.skippedNonSweden} non-Swedish skipped`
          : "")
    );
    save();
    console.log("");
  } else if (googleResult.missing > 0) {
    console.log(
      `Google Places: no data applied (${googleResult.missing} restaurants missing from google.json)\n` +
        `  Run: npm run pipeline:collect --source google\n`
    );
  }

  // ── 2. Geocode missing coordinates ───────────────────────────
  // NOTE: Geocoding is disabled - coordinates come from Google Places data.
  // To geocode missing restaurants, run: npm run pipeline:geocode
  const needsGeocode = restaurants.filter((r) => !r.lat || !r.lng).length;
  if (needsGeocode > 0) {
    console.log(`${needsGeocode} restaurants missing coordinates (run pipeline:geocode to fix)\n`);
  } else {
    console.log("All restaurants have coordinates.\n");
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
  const dedupResult = deduplicateByGooglePlaceId(deduped, { logEachMerge: true });
  if (dedupResult.removedCount > 0) {
    deduped = dedupResult.restaurants;
  }

  if (beforeDedup !== deduped.length) {
    console.log(`Deduplicated: ${beforeDedup} → ${deduped.length}\n`);
  }

  // Log closed restaurants (filtered out in optimize step)
  const permClosed = deduped.filter((r) => r.businessStatus === "CLOSED_PERMANENTLY").length;
  const tempClosed = deduped.filter((r) => r.businessStatus === "CLOSED_TEMPORARILY").length;
  if (permClosed + tempClosed > 0) {
    const parts: string[] = [];
    if (permClosed > 0) parts.push(`${permClosed} permanently`);
    if (tempClosed > 0) parts.push(`${tempClosed} temporarily`);
    console.log(`Closed: ${parts.join(", ")} (will be excluded from frontend JSON)\n`);
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
    if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
    console.log("");
  }

  if (warnings.length > 0) {
    console.log(`Validation Warnings (${warnings.length}):`);
    warnings.slice(0, 10).forEach((w) => console.log(`  ${w}`));
    if (warnings.length > 10) console.log(`  ... and ${warnings.length - 10} more`);
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
  refine().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
