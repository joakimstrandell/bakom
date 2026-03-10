import { useReducer, useMemo } from "react";
import type { Restaurant, MichelinDistinction, WhiteGuideClassification } from "../types";
import {
  filterRestaurants,
  DEFAULT_FILTERS,
  type FilterState,
  type Range,
  type AvailabilityFilter,
} from "../lib/filters";
import type { MealType } from "../lib/isOpen";

// ─── Action Types ────────────────────────────────────────────────

export type RangeFilterKey = "bakomScore" | "krogguiden" | "google" | "svd" | "di" | "dn";

export type FilterAction =
  | { type: "TOGGLE_CUISINE"; payload: string }
  | { type: "TOGGLE_PRICE"; payload: string }
  | { type: "SET_SEARCH"; payload: string }
  | { type: "SET_RANGE"; payload: { key: RangeFilterKey; range: Range } }
  | { type: "TOGGLE_MICHELIN"; payload: MichelinDistinction }
  | { type: "TOGGLE_WHITEGUIDE"; payload: WhiteGuideClassification }
  | { type: "TOGGLE_MEAL"; payload: MealType }
  | { type: "TOGGLE_AVAILABILITY"; payload: AvailabilityFilter }
  | { type: "CLEAR_ALL" };

// ─── Reducer ─────────────────────────────────────────────────────

function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) {
    next.delete(item);
  } else {
    next.add(item);
  }
  return next;
}

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "TOGGLE_CUISINE":
      return {
        ...state,
        selectedCuisines: toggleSetItem(state.selectedCuisines, action.payload),
      };

    case "TOGGLE_PRICE":
      return {
        ...state,
        selectedPrices: toggleSetItem(state.selectedPrices, action.payload),
      };

    case "SET_SEARCH":
      return {
        ...state,
        searchQuery: action.payload,
      };

    case "SET_RANGE":
      return {
        ...state,
        [action.payload.key]: action.payload.range,
      };

    case "TOGGLE_MICHELIN":
      return {
        ...state,
        selectedMichelin: toggleSetItem(state.selectedMichelin, action.payload),
      };

    case "TOGGLE_WHITEGUIDE":
      return {
        ...state,
        selectedWhiteGuide: toggleSetItem(state.selectedWhiteGuide, action.payload),
      };

    case "TOGGLE_MEAL":
      return {
        ...state,
        selectedMeals: toggleSetItem(state.selectedMeals, action.payload),
      };

    case "TOGGLE_AVAILABILITY":
      return {
        ...state,
        selectedAvailability: toggleSetItem(state.selectedAvailability, action.payload),
      };

    case "CLEAR_ALL":
      return {
        ...DEFAULT_FILTERS,
        // Create fresh Set instances with explicit types
        selectedCuisines: new Set<string>(),
        selectedPrices: new Set<string>(),
        selectedMichelin: new Set<MichelinDistinction>(),
        selectedWhiteGuide: new Set<WhiteGuideClassification>(),
        selectedMeals: new Set<MealType>(),
        selectedAvailability: new Set<AvailabilityFilter>(),
      };

    default:
      return state;
  }
}

// ─── Default Range Bounds (for checking if filter is active) ────

const RANGE_DEFAULTS: Record<RangeFilterKey, { min: number; max: number }> = {
  bakomScore: { min: 0, max: 100 },
  krogguiden: { min: 0, max: 5 },
  google: { min: 0, max: 5 },
  svd: { min: 0, max: 6 },
  di: { min: 0, max: 25 },
  dn: { min: 0, max: 5 },
};

function isRangeActive(range: Range, key: RangeFilterKey): boolean {
  const defaults = RANGE_DEFAULTS[key];
  return range.min > defaults.min || range.max < defaults.max;
}

// ─── Hook ────────────────────────────────────────────────────────

export function useFilters(restaurants: Restaurant[]) {
  const [state, dispatch] = useReducer(filterReducer, {
    ...DEFAULT_FILTERS,
    // Create fresh Set instances with explicit types
    selectedCuisines: new Set<string>(),
    selectedPrices: new Set<string>(),
    selectedMichelin: new Set<MichelinDistinction>(),
    selectedWhiteGuide: new Set<WhiteGuideClassification>(),
    selectedMeals: new Set<MealType>(),
    selectedAvailability: new Set<AvailabilityFilter>(),
  });

  // Filter restaurants based on current state
  const filtered = useMemo(() => filterRestaurants(restaurants, state), [restaurants, state]);

  // Count active filters for badge display
  const activeFilterCount = useMemo(() => {
    let count = state.selectedCuisines.size + state.selectedPrices.size;

    // Check each range filter
    for (const key of Object.keys(RANGE_DEFAULTS) as RangeFilterKey[]) {
      if (isRangeActive(state[key], key)) {
        count++;
      }
    }

    count += state.selectedMichelin.size;
    count += state.selectedWhiteGuide.size;
    count += state.selectedMeals.size;
    count += state.selectedAvailability.size;

    return count;
  }, [state]);

  // Check if any filters are active (for showing clear button)
  const hasActiveFilters = activeFilterCount > 0 || state.searchQuery.length > 0;

  return {
    state,
    dispatch,
    filtered,
    activeFilterCount,
    hasActiveFilters,
  };
}

export type { FilterState, Range };
