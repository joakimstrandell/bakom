/**
 * Bakom Score — aggregated restaurant rating (0–10).
 *
 * Combines ratings from multiple sources with different weights:
 *   Michelin:    0.28  (most prestigious, strict assessment)
 *   White Guide: 0.20  (expert assessment, Swedish context)
 *   SvD:         0.16  (professional critic, 1–6 scale)
 *   Krogguiden:  0.16  (professional reviewers)
 *   Google:      0.10  (crowd ratings)
 *   Thatsup:     0.10  (crowd ratings, Stockholm-focused)
 *
 * DN has no numeric rating (boolean only) — contributes to source
 * diversity but not to the weighted average.
 *
 * Only present sources are weighted. Additional adjustments:
 *   - Google/Thatsup: Bayesian dampening pulls scores toward a prior (7.0)
 *     when review count is low — prevents inflated scores from few reviews
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

/** Normalize a 1–5 expert rating (Krogguiden) to 0–10 */
function normalize1to5(rating: number): number {
  return (rating - 1) * 2.5;
}

/**
 * Normalize a 1–5 crowd rating (Google/Thatsup) to 0–10.
 * More conservative than expert scale — maps 1→1, 5→9.
 * Reflects that crowd ratings cluster around 3.5–4.8 and
 * a 4.6 should be "very good" (~8) not "near perfect" (~9).
 */
function normalizeCrowd1to5(rating: number): number {
  return (rating - 1) * 2.0 + 1.0;
}

/** Normalize a 1–6 numeric rating (SvD scale) to 0–10 */
function normalize1to6(rating: number): number {
  return ((rating - 1) / 5) * 10;
}

/**
 * Bayesian dampening for crowd-sourced ratings.
 * With few reviews, the score is pulled toward CROWD_PRIOR (neutral-good).
 * With many reviews (≥100), the raw score is used as-is.
 */
const CROWD_PRIOR = 7.0;

function bayesianDampen(rawScore: number, reviewCount: number): number {
  const confidence = Math.min(1, reviewCount / 100);
  return confidence * rawScore + (1 - confidence) * CROWD_PRIOR;
}

// ─── Weights ────────────────────────────────────────────────────

const WEIGHTS = {
  michelin: 0.28,
  whiteguide: 0.20,
  svd: 0.16,
  krogguiden: 0.16,
  google: 0.10,
  thatsup: 0.10,
} as const;

// ─── Score calculation ──────────────────────────────────────────

export type ScoreInput = {
  ratings: SourceRatings;
  googleRatingCount?: number;
  thatsupRatingCount?: number;
};

type SourceEntry = { weight: number; score: number };

/**
 * Collect all available source scores and weights for a restaurant.
 * DN is boolean-only (no numeric rating) so it's tracked separately
 * via the dnReviewed flag for diversity counting.
 */
function collectSources(input: ScoreInput): {
  entries: SourceEntry[];
  extraDiversitySources: number;
} {
  const { ratings, googleRatingCount } = input;
  const entries: SourceEntry[] = [];
  let extraDiversitySources = 0;

  if (ratings.michelin) {
    entries.push({
      weight: WEIGHTS.michelin,
      score: MICHELIN_SCORES[ratings.michelin],
    });
  }

  if (ratings.whiteguide) {
    entries.push({
      weight: WEIGHTS.whiteguide,
      score: WHITEGUIDE_SCORES[ratings.whiteguide],
    });
  }

  if (ratings.svd != null && ratings.svd > 0) {
    entries.push({
      weight: WEIGHTS.svd,
      score: normalize1to6(ratings.svd),
    });
  }

  if (ratings.krogguiden != null && ratings.krogguiden > 0) {
    entries.push({
      weight: WEIGHTS.krogguiden,
      score: normalize1to5(ratings.krogguiden),
    });
  }

  if (ratings.google != null && ratings.google > 0) {
    const count = googleRatingCount ?? 0;
    entries.push({
      weight: WEIGHTS.google,
      score: bayesianDampen(normalizeCrowd1to5(ratings.google), count),
    });
  }

  if (ratings.thatsup != null && ratings.thatsup > 0) {
    const count = input.thatsupRatingCount ?? 0;
    entries.push({
      weight: WEIGHTS.thatsup,
      score: bayesianDampen(normalizeCrowd1to5(ratings.thatsup), count),
    });
  }

  // DN has no numeric rating — count it for diversity only
  if (ratings.dn) {
    extraDiversitySources = 1;
  }

  return { entries, extraDiversitySources };
}

/**
 * Compute the weighted average for a subset of sources, with diversity dampening.
 * extraDiversity counts non-numeric sources (DN) that still contribute to diversity.
 */
function computeScore(
  sources: SourceEntry[],
  extraDiversity: number = 0,
): number {
  if (sources.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of sources) {
    weightedSum += s.weight * s.score;
    totalWeight += s.weight;
  }

  let score = weightedSum / totalWeight;

  // Source diversity dampening (includes extra non-numeric sources like DN)
  const n = sources.length + extraDiversity;
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
  const { entries: sources, extraDiversitySources } = collectSources(input);
  if (sources.length === 0) return null;

  // Full score with all sources
  let score = computeScore(sources, extraDiversitySources);

  // Monotonicity: check each "leave-one-out" subset.
  // If removing a source yields a higher score, that source was dragging
  // the average down — use the higher score instead.
  if (sources.length >= 2) {
    for (let i = 0; i < sources.length; i++) {
      const subset = sources.filter((_, j) => j !== i);
      const subScore = computeScore(subset, extraDiversitySources);
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
