/**
 * Optimize step: generates frontend JSON with region tags.
 *
 * Filters closed restaurants, removes pipeline-only fields,
 * assigns region based on coordinates, calculates global ranks,
 * and strips null/empty values to minimize bundle size.
 *
 * Reads: data/restaurants.json
 * Writes: data/restaurants.frontend.json
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
function stripRestaurant(
  r: PipelineRestaurant,
  metroRegion: Region,
  regionalRank: number | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  // Required fields (always present)
  out.id = r.id;
  out.name = r.name;
  out.lat = r.lat;
  out.lng = r.lng;
  out.metroRegion = metroRegion;

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
  if (regionalRank != null) out.bakomRankRegion = regionalRank;

  // Only include businessStatus if not operational (saves space)
  if (r.businessStatus && r.businessStatus !== "OPERATIONAL") {
    out.businessStatus = r.businessStatus;
  }

  return out;
}

/**
 * Calculate global ranks for all restaurants (mutates in place).
 * Ranks are 1-based, sorted by raw score descending.
 */
function calculateGlobalRanks(restaurants: PipelineRestaurant[]): void {
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

/** City regions that get regional rankings (excludes "sweden") */
const CITY_REGIONS: Region[] = ["stockholm", "gothenburg", "malmo"];

/**
 * Calculate regional ranks for city regions only.
 * Restaurants outside the 3 cities don't get a regional rank.
 * Returns a map of restaurant ID to regional rank.
 */
function calculateRegionalRanks(
  restaurants: PipelineRestaurant[],
  getRegionFn: (r: PipelineRestaurant) => Region
): Map<string, number> {
  const byRegion: Record<string, PipelineRestaurant[]> = {
    stockholm: [],
    gothenburg: [],
    malmo: [],
  };

  // Group by region (only city regions)
  for (const r of restaurants) {
    const region = getRegionFn(r);
    if (region !== "sweden") {
      byRegion[region].push(r);
    }
  }

  // Calculate ranks per city region
  const rankMap = new Map<string, number>();

  for (const region of CITY_REGIONS) {
    const regionRestaurants = byRegion[region]
      .filter((r) => r.bakomScore != null)
      .sort((a, b) => (b.bakomScoreRaw ?? b.bakomScore ?? 0) - (a.bakomScoreRaw ?? a.bakomScore ?? 0));

    for (let i = 0; i < regionRestaurants.length; i++) {
      rankMap.set(regionRestaurants[i].id, i + 1);
    }
  }

  return rankMap;
}


// ─── Non-Swedish address detection ───────────────────────────────

/** Cities/terms that indicate non-Swedish addresses */
const NON_SWEDISH_PATTERNS = [
  /\bKøbenhavn\b/i,
  /\bCopenhagen\b/i,
  /\bOslo\b/i,
  /\bHelsinki\b/i,
  /\bDenmark\b/i,
  /\bDanmark\b/i,
  /\bNorway\b/i,
  /\bNorge\b/i,
  /\bFinland\b/i,
];

function isNonSwedishAddress(address: string): boolean {
  return NON_SWEDISH_PATTERNS.some((pattern) => pattern.test(address));
}

// ─── Main optimize function ───────────────────────────────────────

export function optimize(): void {
  console.log("=== Optimize ===\n");

  const restaurants = loadJson<PipelineRestaurant[]>("restaurants.json");
  if (!restaurants) {
    throw new Error(
      "data/restaurants.json not found. Run pipeline:refine first."
    );
  }

  // Filter non-Swedish restaurants
  const nonSwedish = restaurants.filter((r) => isNonSwedishAddress(r.address));
  if (nonSwedish.length > 0) {
    console.log(`Filtered ${nonSwedish.length} non-Swedish restaurant(s):`);
    for (const r of nonSwedish) {
      console.log(`  - ${r.name} (${r.address})`);
    }
    console.log("");
  }

  // Filter closed restaurants
  const afterNonSwedish = restaurants.filter((r) => !isNonSwedishAddress(r.address));
  const permClosed = afterNonSwedish.filter(
    (r) => r.businessStatus === "CLOSED_PERMANENTLY"
  ).length;
  const tempClosed = afterNonSwedish.filter(
    (r) => r.businessStatus === "CLOSED_TEMPORARILY"
  ).length;
  const closedTotal = permClosed + tempClosed;

  const active = afterNonSwedish.filter(
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

  // Calculate global ranks
  calculateGlobalRanks(active);

  // Calculate regional ranks
  const regionalRanks = calculateRegionalRanks(active, (r) => getRegion(r.lat, r.lng));

  // Count by region
  const regionCounts: Record<Region, number> = {
    stockholm: 0,
    gothenburg: 0,
    malmo: 0,
    sweden: 0,
  };

  // Strip and add region to each restaurant
  const stripped = active.map((r) => {
    const region = getRegion(r.lat, r.lng);
    regionCounts[region]++;
    return stripRestaurant(r, region, regionalRanks.get(r.id));
  });

  // Save single file
  saveJson("restaurants.frontend.json", stripped);

  const size = JSON.stringify(stripped).length;
  console.log(`Generated restaurants.frontend.json (${(size / 1024).toFixed(0)}KB)`);
  console.log(`  Stockholm: ${regionCounts.stockholm}`);
  console.log(`  Göteborg: ${regionCounts.gothenburg}`);
  console.log(`  Malmö: ${regionCounts.malmo}`);
  console.log(`  Övriga: ${regionCounts.sweden}`);
  console.log(`\nOptimize complete: ${active.length} restaurants`);
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
