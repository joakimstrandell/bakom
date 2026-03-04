import type { Restaurant } from "../types";

/** Helper to get the best numeric rating for a restaurant */
export function bestNumericRating(r: Restaurant): number | null {
  return r.ratings.google ?? r.ratings.krogguiden ?? null;
}
