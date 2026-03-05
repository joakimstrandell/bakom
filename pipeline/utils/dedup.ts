import type { PipelineRestaurant } from "../types.js";

export type DeduplicateOptions = {
  /** Log each individual merge (default: false) */
  logEachMerge?: boolean;
};

export type DeduplicateResult = {
  /** Deduplicated restaurant list */
  restaurants: PipelineRestaurant[];
  /** Number of duplicates removed */
  removedCount: number;
  /** Merged pairs for logging: [secondary.name, primary.name][] */
  mergedPairs: [string, string][];
};

/**
 * Deduplicate restaurants by Google Place ID.
 * Restaurants sharing the same googlePlaceId are merged into a primary.
 * Primary selection: most sources → most ratings → longest name.
 */
export function deduplicateByGooglePlaceId(
  restaurants: PipelineRestaurant[],
  options: DeduplicateOptions = {}
): DeduplicateResult {
  // Group by googlePlaceId
  const byPlaceId = new Map<string, PipelineRestaurant[]>();
  for (const r of restaurants) {
    if (!r.googlePlaceId) continue;
    const group = byPlaceId.get(r.googlePlaceId);
    if (group) group.push(r);
    else byPlaceId.set(r.googlePlaceId, [r]);
  }

  const toRemove = new Set<string>();
  const mergedPairs: [string, string][] = [];

  for (const [, group] of byPlaceId) {
    if (group.length < 2) continue;

    // Sort to pick primary: most sources, most ratings, longest name
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
      // Merge ratings (keep non-null values)
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

      // Merge numeric fields
      if (!primary.googleRatingCount && other.googleRatingCount) {
        primary.googleRatingCount = other.googleRatingCount;
      }

      // Fill missing basic fields from other
      if (!primary.phone && other.phone) primary.phone = other.phone;
      if (!primary.website && other.website) primary.website = other.website;
      if (!primary.cuisine && other.cuisine) primary.cuisine = other.cuisine;
      if (!primary.priceRange && other.priceRange) primary.priceRange = other.priceRange;
      if (primary.hours.length === 0 && other.hours.length > 0) primary.hours = other.hours;
      if (!primary.lat && other.lat) {
        primary.lat = other.lat;
        primary.lng = other.lng;
      }

      mergedPairs.push([other.name, primary.name]);
      toRemove.add(other.id);

      if (options.logEachMerge) {
        console.log(`  Dedup by Google Place ID: merged "${other.name}" → "${primary.name}"`);
      }
    }
  }

  const result =
    toRemove.size > 0 ? restaurants.filter((r) => !toRemove.has(r.id)) : restaurants;

  return {
    restaurants: result,
    removedCount: toRemove.size,
    mergedPairs,
  };
}
