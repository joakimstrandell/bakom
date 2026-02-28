/**
 * Bakom Score — aggregated restaurant rating (0–10).
 *
 * Combines ratings from four sources with different weights:
 *   Michelin:    0.35  (most prestigious, strict assessment)
 *   White Guide: 0.25  (expert assessment, Swedish context)
 *   Krogguiden:  0.25  (professional reviewers)
 *   Google:      0.15  (crowd ratings, lowest weight)
 *
 * Only present sources are weighted. Additional adjustments:
 *   - Google ratings scaled by confidence (review count)
 *   - Source diversity factor: single-source ratings are dampened
 *   - Michelin star floors: starred restaurants guaranteed minimum score
 */

import type {
  MichelinDistinction,
  WhiteGuideClassification,
  SourceRatings,
} from "../types";

// ─── Normalization to 0–10 ──────────────────────────────────────

const MICHELIN_SCORES: Record<MichelinDistinction, number> = {
  selected: 6,
  bib_gourmand: 7,
  "1_star": 8.5,
  "2_star": 9.5,
  "3_star": 10,
};

const WHITEGUIDE_SCORES: Record<WhiteGuideClassification, number> = {
  recommended: 5,
  good_class: 6,
  very_good_class: 7.5,
  master_class: 9,
  global_master_class: 10,
};

/** Michelin star floors — starred restaurants always rank at the top */
const MICHELIN_FLOORS: Partial<Record<MichelinDistinction, number>> = {
  "1_star": 8.0,
  "2_star": 9.0,
  "3_star": 10.0,
};

/** Normalize a 1–5 numeric rating to 0–10 */
function normalizeNumeric(rating: number): number {
  return (rating - 1) * 2.5;
}

// ─── Weights ────────────────────────────────────────────────────

const WEIGHTS = {
  michelin: 0.35,
  whiteguide: 0.25,
  krogguiden: 0.25,
  google: 0.15,
} as const;

// ─── Score calculation ──────────────────────────────────────────

export type ScoreInput = {
  ratings: SourceRatings;
  googleRatingCount?: number;
};

/**
 * Calculate the Bakom Score for a restaurant.
 * Returns a number 0–10, or null if no ratings exist.
 */
export function calculateBakomScore(input: ScoreInput): number | null {
  const { ratings, googleRatingCount } = input;

  let weightedSum = 0;
  let totalWeight = 0;
  let sourceCount = 0;

  // Michelin
  if (ratings.michelin) {
    const score = MICHELIN_SCORES[ratings.michelin];
    weightedSum += WEIGHTS.michelin * score;
    totalWeight += WEIGHTS.michelin;
    sourceCount++;
  }

  // White Guide
  if (ratings.whiteguide) {
    const score = WHITEGUIDE_SCORES[ratings.whiteguide];
    weightedSum += WEIGHTS.whiteguide * score;
    totalWeight += WEIGHTS.whiteguide;
    sourceCount++;
  }

  // Krogguiden (1–5 numeric)
  if (ratings.krogguiden != null && ratings.krogguiden > 0) {
    const score = normalizeNumeric(ratings.krogguiden);
    weightedSum += WEIGHTS.krogguiden * score;
    totalWeight += WEIGHTS.krogguiden;
    sourceCount++;
  }

  // Google (1–5 numeric with confidence adjustment)
  if (ratings.google != null && ratings.google > 0) {
    const score = normalizeNumeric(ratings.google);
    // Confidence: ramps from 0.5 → 1.0 as ratingCount goes 0 → 100
    const confidence = Math.min(1, (googleRatingCount ?? 0) / 100);
    const effectiveWeight = WEIGHTS.google * (0.5 + 0.5 * confidence);
    weightedSum += effectiveWeight * score;
    totalWeight += effectiveWeight;
    sourceCount++;
  }

  if (totalWeight === 0) return null;

  let score = weightedSum / totalWeight;

  // Source diversity: single-source ratings get dampened (less confidence)
  // 1 source → 0.88, 2 sources → 0.95, 3+ sources → 1.0
  const diversityFactor =
    sourceCount === 1 ? 0.88 : sourceCount === 2 ? 0.95 : 1.0;
  score *= diversityFactor;

  // Michelin star floors — starred restaurants are always guaranteed
  // a minimum score regardless of other factors
  const floor = ratings.michelin
    ? MICHELIN_FLOORS[ratings.michelin] ?? 0
    : 0;
  score = Math.max(score, floor);

  return Math.round(score * 10) / 10;
}
