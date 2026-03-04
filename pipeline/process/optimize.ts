/**
 * Optimize step: generates region-specific frontend JSON files.
 *
 * Filters closed restaurants, removes pipeline-only fields,
 * splits by region, calculates per-region ranks, and strips
 * null/empty values to minimize bundle size.
 *
 * Reads: data/restaurants.json
 * Writes:
 *   - data/restaurants.stockholm.frontend.json
 *   - data/restaurants.gothenburg.frontend.json
 *   - data/restaurants.malmo.frontend.json
 *   - data/restaurants.sweden.frontend.json (rest of Sweden)
 *
 * npm scripts:
 *   npm run pipeline:optimize
 *
 * CLI: tsx pipeline/process/optimize.ts
 */

import { loadJson, saveJson } from "../utils/fetch.js";
import type { PipelineRestaurant } from "../types.js";

// ─── Region definitions ───────────────────────────────────────────

export type Region = "stockholm" | "gothenburg" | "malmo" | "sweden";

/** Metro area centers and radius in km */
const REGIONS: { id: Region; lat: number; lng: number; radiusKm: number }[] = [
  { id: "stockholm", lat: 59.33, lng: 18.07, radiusKm: 50 },
  { id: "gothenburg", lat: 57.71, lng: 11.97, radiusKm: 40 },
  { id: "malmo", lat: 55.60, lng: 13.00, radiusKm: 50 },
];

/**
 * Calculate distance between two coordinates using Haversine formula.
 * Returns distance in kilometers.
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Determine which region a restaurant belongs to based on coordinates.
 */
function getRegion(lat: number | null, lng: number | null): Region {
  if (lat == null || lng == null) return "sweden";

  for (const region of REGIONS) {
    const dist = haversineDistance(lat, lng, region.lat, region.lng);
    if (dist <= region.radiusKm) {
      return region.id;
    }
  }

  return "sweden";
}

// ─── Stripping logic ──────────────────────────────────────────────

/**
 * Strip a restaurant to frontend-optimized format.
 */
function stripRestaurant(r: PipelineRestaurant): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // Required fields (always present)
  out.id = r.id;
  out.name = r.name;
  out.lat = r.lat;
  out.lng = r.lng;

  // Optional string fields — omit if empty
  if (r.address) out.address = r.address;
  if (r.postalCode) out.postalCode = r.postalCode;
  if (r.city) out.city = r.city;
  if (r.region) out.region = r.region;
  if (r.phone) out.phone = r.phone;
  if (r.website) out.website = r.website;
  if (r.priceRange) out.priceRange = r.priceRange;
  if (r.cuisine) out.cuisine = r.cuisine;

  // Hours — omit if empty array
  if (r.hours && r.hours.length > 0) out.hours = r.hours;

  // Ratings — only include non-null values
  const ratings: Record<string, unknown> = {};
  if (r.ratings) {
    for (const [k, v] of Object.entries(r.ratings)) {
      if (v != null) ratings[k] = v;
    }
  }
  out.ratings = ratings;

  // Links — only include non-empty values
  const links: Record<string, unknown> = {};
  if (r.links) {
    for (const [k, v] of Object.entries(r.links)) {
      if (v) links[k] = v;
    }
  }
  out.links = links;

  // Numeric optional fields
  if (r.googleRatingCount) out.googleRatingCount = r.googleRatingCount;
  if (r.bakomScore != null) out.bakomScore = r.bakomScore;
  if (r.bakomRank != null) out.bakomRank = r.bakomRank;

  // Only include businessStatus if not operational (saves space)
  if (r.businessStatus && r.businessStatus !== "OPERATIONAL") {
    out.businessStatus = r.businessStatus;
  }

  return out;
}

/**
 * Calculate ranks for a set of restaurants (mutates in place).
 * Ranks are 1-based, sorted by raw score descending.
 */
function calculateRanks(restaurants: PipelineRestaurant[]): void {
  const withScore = restaurants
    .filter((r) => r.bakomScore != null)
    .sort((a, b) => (b.bakomScoreRaw ?? b.bakomScore ?? 0) - (a.bakomScoreRaw ?? a.bakomScore ?? 0));

  for (let i = 0; i < withScore.length; i++) {
    withScore[i].bakomRank = i + 1;
  }

  // Clear rank for unscored restaurants
  for (const r of restaurants) {
    if (r.bakomScore == null) {
      r.bakomRank = null;
    }
  }
}

/**
 * Generate frontend JSON for a region.
 */
function generateRegionJson(
  restaurants: PipelineRestaurant[],
  regionName: string,
  filename: string
): void {
  // Calculate ranks for this region
  calculateRanks(restaurants);

  const stripped = restaurants.map(stripRestaurant);
  saveJson(filename, stripped);

  const size = JSON.stringify(stripped).length;
  console.log(
    `  ${regionName}: ${restaurants.length} restaurants (${(size / 1024).toFixed(0)}KB)`
  );
}

// ─── Main optimize function ───────────────────────────────────────

export function optimize(): void {
  console.log("=== Optimize (by region) ===\n");

  const restaurants = loadJson<PipelineRestaurant[]>("restaurants.json");
  if (!restaurants) {
    throw new Error(
      "data/restaurants.json not found. Run pipeline:refine first."
    );
  }

  // Filter closed restaurants
  const permClosed = restaurants.filter(
    (r) => r.businessStatus === "CLOSED_PERMANENTLY"
  ).length;
  const tempClosed = restaurants.filter(
    (r) => r.businessStatus === "CLOSED_TEMPORARILY"
  ).length;
  const closedTotal = permClosed + tempClosed;

  const active = restaurants.filter(
    (r) =>
      r.businessStatus !== "CLOSED_PERMANENTLY" &&
      r.businessStatus !== "CLOSED_TEMPORARILY"
  );

  if (closedTotal > 0) {
    const parts: string[] = [];
    if (permClosed > 0) parts.push(`${permClosed} permanently`);
    if (tempClosed > 0) parts.push(`${tempClosed} temporarily`);
    console.log(
      `Filtered ${closedTotal} closed restaurant(s) (${parts.join(", ")}) ` +
        `(${restaurants.length} → ${active.length})\n`
    );
  }

  // Split by region
  const stockholm: PipelineRestaurant[] = [];
  const gothenburg: PipelineRestaurant[] = [];
  const malmo: PipelineRestaurant[] = [];
  const sweden: PipelineRestaurant[] = [];

  for (const r of active) {
    const region = getRegion(r.lat, r.lng);
    switch (region) {
      case "stockholm":
        stockholm.push(r);
        break;
      case "gothenburg":
        gothenburg.push(r);
        break;
      case "malmo":
        malmo.push(r);
        break;
      default:
        sweden.push(r);
    }
  }

  console.log("Generating region files:");

  // Generate per-region files with per-region ranks
  generateRegionJson(stockholm, "Stockholm", "restaurants.stockholm.frontend.json");
  generateRegionJson(gothenburg, "Gothenburg", "restaurants.gothenburg.frontend.json");
  generateRegionJson(malmo, "Malmö", "restaurants.malmo.frontend.json");
  generateRegionJson(sweden, "Rest of Sweden", "restaurants.sweden.frontend.json");

  const total = stockholm.length + gothenburg.length + malmo.length + sweden.length;
  console.log(`\nOptimize complete: ${total} restaurants across 4 regions`);
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("optimize")) {
  try {
    optimize();
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
}
