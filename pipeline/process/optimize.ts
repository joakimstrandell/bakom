/** Optimize step: generates frontend JSON with region tags. @see docs/optimize.md */

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
  const normalizedCuisine = normalizeCuisine(r.cuisine || "");
  if (normalizedCuisine) out.cuisine = normalizedCuisine;

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

// ─── Cuisine extraction ───────────────────────────────────────────

/** Terms that are not actual cuisines (generic types, classifications) */
const NON_CUISINE_TERMS = new Set([
  // Venue types
  "Restaurant", "Hotel", "Bar", "Cafe", "Cafeteria", "Coffee Shop",
  "Bakery", "Ice Cream Shop", "Store", "Event Venue", "Wine Bar",
  "Pub", "Inn", "Cocktail Bar", "Night Club", "Market", "Museum",
  "Art Museum", "Train Station", "Church", "University", "Castle",
  "Lake", "Island", "Garden", "Garden Center", "Visitor Center",
  "Winery", "Pastry Shop", "Coffee Roastery", "Clothing Store",
  "Food Store", "Food Court", "Buffet", "Hair Salon",

  // Services
  "Service", "Catering Service", "Consultant", "Association Or Organization",

  // Price/quality classifications
  "Mellanklass", "Lyx", "Budget",

  // Other non-cuisine terms
  "not so white guide", "other",
]);

/** Map variations to canonical names */
const CUISINE_CANONICAL: Record<string, string> = {
  // Asian cuisines → "Asien"
  "Japanese": "Asien",
  "Sushi": "Asien",
  "Korean": "Asien",
  "Vietnamese": "Asien",
  "Asian": "Asien",
  "Asian Fusion": "Asien",
  "Indian": "Asien",
  "Thai": "Asien",
  "Chinese": "Asien",
  "Ramen": "Asien",
  "Japanese Izakaya": "Asien",
  "Indonesian": "Asien",
  "Bangladeshi": "Asien",

  // Italian cuisines → "Italien"
  "Italian": "Italien",
  "Pizza": "Italien",
  "Italian-American": "Italien",

  // French cuisines → "Frankrike"
  "French": "Frankrike",
  "Classic French": "Frankrike",
  "Bistro": "Frankrike",

  // Swedish/Nordic → "Klassiskt"
  "Swedish": "Klassiskt",
  "Scandinavian": "Klassiskt",
  "traditionellt svenskt": "Klassiskt",
  "traditionellt  svenskt": "Klassiskt",
  "Farm to table": "Klassiskt",

  // American cuisines → "Amerika"
  "Hamburger": "Amerika",
  "Barbecue": "Amerika",
  "Hot Dog": "Amerika",
  "Fast Food": "Amerika",
  "Bar And Grill": "Amerika",
  "Southwestern Us": "Amerika",

  // Spanish/Mediterranean → "Spanien"
  "Mediterranean Cuisine": "Spanien",
  "Mediterranean": "Spanien",
  "Tapas": "Spanien",

  // Seafood → "Fokus på fisk"
  "Seafood": "Fokus på fisk",

  // Meat-focused → "Fokus på kött"
  "Steak House": "Fokus på kött",
  "Grills": "Fokus på kött",

  // Latin American → "Latinamerika"
  "Peruvian": "Latinamerika",

  // Middle Eastern → "Mellanöstern"
  "Lebanese": "Mellanöstern",
  "Falafel": "Mellanöstern",

  // Mexican → "Mexikanskt"
  "Mexican": "Mexikanskt",

  // Vegan/Vegetarian → "Veganskt"
  "Vegetarian": "Veganskt",
  "Vegan": "Veganskt",

  // Modern/Creative → "Crossover"
  "Modern Cuisine": "Crossover",
  "Fusion": "Crossover",
  "Creative": "Crossover",
  "Contemporary": "Crossover",
  "Seasonal Cuisine": "Crossover",
  "European": "Crossover",
  "Fine Dining": "Crossover",
  "Gastropub": "Crossover",
  "Brunch": "Crossover",
  "Small eats": "Crossover",
};

/**
 * Normalize a cuisine string to canonical Swedish names.
 * Returns comma-separated canonical names, or empty string if all terms are filtered.
 */
function normalizeCuisine(cuisine: string): string {
  if (!cuisine) return "";

  const tokens = cuisine.split(",").map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const token of tokens) {
    // Skip non-cuisine terms
    if (NON_CUISINE_TERMS.has(token)) continue;

    // Map to canonical name if applicable
    const canonical = CUISINE_CANONICAL[token] || token;

    if (!seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }

  return result.join(",");
}

/**
 * Extract unique cuisine values from restaurants.
 * Returns array of { key, count } sorted by count descending.
 */
function extractCuisines(restaurants: PipelineRestaurant[]): { key: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const r of restaurants) {
    const normalized = normalizeCuisine(r.cuisine || "");
    if (!normalized) continue;

    const tokens = normalized.split(",");
    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  // Convert to array and sort by count
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .filter((c) => c.count >= 3) // Only include cuisines with 3+ restaurants
    .sort((a, b) => b.count - a.count);
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

  // Save restaurants file
  saveJson("restaurants.frontend.json", stripped);

  // Extract and save cuisine metadata
  const cuisines = extractCuisines(active);
  saveJson("cuisines.json", cuisines);

  const size = JSON.stringify(stripped).length;
  console.log(`Generated restaurants.frontend.json (${(size / 1024).toFixed(0)}KB)`);
  console.log(`  Stockholm: ${regionCounts.stockholm}`);
  console.log(`  Göteborg: ${regionCounts.gothenburg}`);
  console.log(`  Malmö: ${regionCounts.malmo}`);
  console.log(`  Övriga: ${regionCounts.sweden}`);
  console.log(`\nGenerated cuisines.json (${cuisines.length} cuisines)`);
  console.log(`  Top 5: ${cuisines.slice(0, 5).map((c) => `${c.key} (${c.count})`).join(", ")}`);
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
