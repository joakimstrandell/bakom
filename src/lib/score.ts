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
 *   - Monotonicity guarantee: adding a source never lowers the score
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

// WG scores calibrated to Krogguiden equivalents:
//   recommended ≈ K:3.6, good_class ≈ K:3.8, very_good_class ≈ K:4.2
const WHITEGUIDE_SCORES: Record<WhiteGuideClassification, number> = {
  recommended: 6.5,
  good_class: 7,
  very_good_class: 8,
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

type SourceEntry = { weight: number; score: number };

/**
 * Collect all available source scores and weights for a restaurant.
 */
function collectSources(input: ScoreInput): SourceEntry[] {
  const { ratings, googleRatingCount } = input;
  const sources: SourceEntry[] = [];

  if (ratings.michelin) {
    sources.push({
      weight: WEIGHTS.michelin,
      score: MICHELIN_SCORES[ratings.michelin],
    });
  }

  if (ratings.whiteguide) {
    sources.push({
      weight: WEIGHTS.whiteguide,
      score: WHITEGUIDE_SCORES[ratings.whiteguide],
    });
  }

  if (ratings.krogguiden != null && ratings.krogguiden > 0) {
    sources.push({
      weight: WEIGHTS.krogguiden,
      score: normalizeNumeric(ratings.krogguiden),
    });
  }

  if (ratings.google != null && ratings.google > 0) {
    const confidence = Math.min(1, (googleRatingCount ?? 0) / 100);
    sources.push({
      weight: WEIGHTS.google * (0.5 + 0.5 * confidence),
      score: normalizeNumeric(ratings.google),
    });
  }

  return sources;
}

/**
 * Compute the weighted average for a subset of sources, with diversity dampening.
 */
function computeScore(sources: SourceEntry[]): number {
  if (sources.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of sources) {
    weightedSum += s.weight * s.score;
    totalWeight += s.weight;
  }

  let score = weightedSum / totalWeight;

  // Source diversity dampening
  const n = sources.length;
  const diversityFactor = n === 1 ? 0.88 : n === 2 ? 0.95 : 1.0;
  score *= diversityFactor;

  return score;
}

/**
 * Calculate the Bakom Score for a restaurant.
 * Returns a number 0–10, or null if no ratings exist.
 *
 * Includes a monotonicity guarantee: adding a source can never
 * lower the score. We compute the score for every possible subset
 * (removing one source at a time) and take the maximum.
 */
export function calculateBakomScore(input: ScoreInput): number | null {
  const sources = collectSources(input);
  if (sources.length === 0) return null;

  // Full score with all sources
  let score = computeScore(sources);

  // Monotonicity: check each "leave-one-out" subset.
  // If removing a source yields a higher score, that source was dragging
  // the average down — use the higher score instead.
  if (sources.length >= 2) {
    for (let i = 0; i < sources.length; i++) {
      const subset = sources.filter((_, j) => j !== i);
      const subScore = computeScore(subset);
      if (subScore > score) score = subScore;
    }
  }

  // Michelin star floors — starred restaurants are always guaranteed
  // a minimum score regardless of other factors
  const { ratings } = input;
  const floor = ratings.michelin
    ? MICHELIN_FLOORS[ratings.michelin] ?? 0
    : 0;
  score = Math.max(score, floor);

  return Math.round(score * 10) / 10;
}
