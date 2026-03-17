import type { Restaurant, MichelinDistinction, WhiteGuideClassification } from "../types";
import { isOpen, opensToday, servesMeal, type MealType } from "./isOpen";

// Range type for interval filters
export type Range = { min: number; max: number };

export type AvailabilityFilter = "openNow" | "opensToday";

export type FilterState = {
  searchQuery: string;
  selectedCuisines: Set<string>;
  selectedPrices: Set<string>;
  // Range sliders (min-max intervals)
  bakomScore: Range; // 0-100
  krogguiden: Range; // 0-5 (0.1 step)
  google: Range; // 0-5 (0.1 step)
  svd: Range; // 0-6
  di: Range; // 0-25
  falstaff: Range; // 0-100
  dn: Range; // 0-5
  // Multi-select (show restaurants with ANY of selected distinctions)
  selectedMichelin: Set<MichelinDistinction>;
  selectedWhiteGuide: Set<WhiteGuideClassification>;
  // Meal type and availability filters
  selectedMeals: Set<MealType>;
  selectedAvailability: Set<AvailabilityFilter>;
};

export const DEFAULT_FILTERS: FilterState = {
  searchQuery: "",
  selectedCuisines: new Set(),
  selectedPrices: new Set(),
  bakomScore: { min: 0, max: 100 },
  krogguiden: { min: 0, max: 5 },
  google: { min: 0, max: 5 },
  svd: { min: 0, max: 6 },
  di: { min: 0, max: 25 },
  falstaff: { min: 0, max: 100 },
  dn: { min: 0, max: 5 },
  selectedMichelin: new Set(),
  selectedWhiteGuide: new Set(),
  selectedMeals: new Set(),
  selectedAvailability: new Set(),
};

/** Check if a range filter is active (not at default bounds) */
export function isRangeActive(range: Range, defaultMin: number, defaultMax: number): boolean {
  return range.min > defaultMin || range.max < defaultMax;
}

/** Check if a value falls within a range */
function inRange(
  value: number | null | undefined,
  range: Range,
  defaultMin: number,
  defaultMax: number
): boolean {
  // If range is at defaults, don't filter
  if (!isRangeActive(range, defaultMin, defaultMax)) return true;
  // If value is null/undefined, exclude when filter is active
  if (value == null) return false;
  return value >= range.min && value <= range.max;
}

/**
 * Filter a list of restaurants by the given filter state.
 * Pure function — no side effects, easily testable.
 */
export function filterRestaurants(restaurants: Restaurant[], filters: FilterState): Restaurant[] {
  const query = filters.searchQuery.toLowerCase().trim();

  return restaurants.filter((r) => {
    // Text search
    if (query) {
      const searchable = `${r.name} ${r.address} ${r.region} ${r.cuisine}`.toLowerCase();
      if (!searchable.includes(query)) return false;
    }

    // Cuisine
    if (filters.selectedCuisines.size > 0) {
      if (!r.cuisine) return false;
      const cuisines = r.cuisine
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!cuisines.some((c) => filters.selectedCuisines.has(c))) return false;
    }

    // Price
    if (filters.selectedPrices.size > 0) {
      if (!r.priceRange || !filters.selectedPrices.has(r.priceRange)) return false;
    }

    // Bakom Score range (0-100)
    if (!inRange(r.bakomScore, filters.bakomScore, 0, 100)) return false;

    // Krogguiden range (0-5)
    if (!inRange(r.ratings.krogguiden, filters.krogguiden, 0, 5)) return false;

    // Google range (0-5)
    if (!inRange(r.ratings.google, filters.google, 0, 5)) return false;

    // SvD range (0-6)
    if (!inRange(r.ratings.svd, filters.svd, 0, 6)) return false;

    // DI range (0-25)
    if (!inRange(r.ratings.di, filters.di, 0, 25)) return false;

    // Falstaff range (0-100)
    if (!inRange(r.ratings.falstaff, filters.falstaff, 0, 100)) return false;

    // DN range (0-5)
    if (!inRange(r.ratings.dn, filters.dn, 0, 5)) return false;

    // Michelin multi-select: restaurant must have one of the selected distinctions
    if (filters.selectedMichelin.size > 0) {
      if (!r.ratings.michelin || !filters.selectedMichelin.has(r.ratings.michelin)) return false;
    }

    // White Guide multi-select: restaurant must have one of the selected classifications
    if (filters.selectedWhiteGuide.size > 0) {
      if (!r.ratings.whiteguide || !filters.selectedWhiteGuide.has(r.ratings.whiteguide))
        return false;
    }

    // Meal type filter: restaurant must serve ALL selected meal types
    if (filters.selectedMeals.size > 0) {
      for (const meal of filters.selectedMeals) {
        if (!servesMeal(r.hours ?? [], meal)) return false;
      }
    }

    // Availability filter: must match ALL selected availability options
    if (filters.selectedAvailability.size > 0) {
      if (filters.selectedAvailability.has("openNow")) {
        const open = isOpen(r.hours ?? []);
        if (open !== true) return false;
      }
      if (filters.selectedAvailability.has("opensToday")) {
        if (!opensToday(r.hours ?? [])) return false;
      }
    }

    return true;
  });
}
