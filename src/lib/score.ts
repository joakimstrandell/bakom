/** Bakom Score — aggregated restaurant rating (0–100). @see docs/score.md */

import type {
  MichelinDistinction,
  WhiteGuideClassification,
  SourceRatings,
} from "../types";

// ─── Normalization to 0–10 ──────────────────────────────────────

const MICHELIN_SCORES: Record<MichelinDistinction, number> = {
  selected: 6.5,
  bib_gourmand: 8,
  "1_star": 9,
  "2_star": 9.5,
  "3_star": 10,
};

// WG scores calibrated so prestige sources always lift scores above non-prestige:
//   recommended ≈ K:3.8, good_class ≈ K:4.0, very_good_class ≈ K:4.4
const WHITEGUIDE_SCORES: Record<WhiteGuideClassification, number> = {
  recommended: 7,
  good_class: 7.5,
  very_good_class: 8.5,
  master_class: 9,
  global_master_class: 10,
};

// ─── Prestige & Perfection thresholds ────────────────────────────

/** Minimum normalized score (0–10) required from ALL sources to achieve 100 */
const PERFECTION_THRESHOLD = 9.5;

/** Prestige ceiling levels (internal 0–10 scale) */
const PRESTIGE_CEILINGS = {
  none: 8.0, // No Michelin AND no White Guide → max 80
  basic: 9.5, // Has White Guide OR Michelin selected/bib → max 95
  // Michelin 1★+ → no ceiling
} as const;

/** Cap for "visited but no score" — Krogguiden link exists but no rating */
const VISITED_NO_SCORE_CEILING = 7.0; // max 70

/** Michelin distinctions that grant unlimited ceiling */
const MICHELIN_STARRED: MichelinDistinction[] = ["1_star", "2_star", "3_star"];

/** Normalize a 1–5 rating (Krogguiden) to 0–10: score/max */
function normalize1to5(rating: number): number {
  return (rating / 5) * 10;
}

/** Normalize a 1–5 crowd rating (Google) to 0–10: score/max, then Bayesian dampened */
function normalizeCrowd1to5(rating: number): number {
  return (rating / 5) * 10;
}

/** Normalize a 1–6 numeric rating (SvD scale) to 0–10: score/max */
function normalize1to6(rating: number): number {
  return (rating / 6) * 10;
}

/** Normalize a 0–25 total score (DI Weekend scale) to 0–10 */
function normalize0to25(rating: number): number {
  return (rating / 25) * 10;
}

/** Normalize a 0–5 rating (DN scale) to 0–10: score/max */
function normalize0to5(rating: number): number {
  return (rating / 5) * 10;
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
  di: 0.16,
  dn: 0.14,
  google: 0.10,
} as const;

// ─── Score calculation ──────────────────────────────────────────

export type ScoreInput = {
  ratings: SourceRatings;
  googleRatingCount?: number;
  /** Links to source pages (used to detect "visited but no score" cases) */
  links?: {
    krogguiden?: string;
  };
};

type SourceEntry = { weight: number; score: number };

/**
 * Collect all available source scores and weights for a restaurant.
 * Also returns all normalized scores for the perfection check.
 */
function collectSources(input: ScoreInput): {
  entries: SourceEntry[];
  allNormalizedScores: number[];
} {
  const { ratings, googleRatingCount } = input;
  const entries: SourceEntry[] = [];
  const allNormalizedScores: number[] = [];

  if (ratings.michelin) {
    const score = MICHELIN_SCORES[ratings.michelin];
    entries.push({ weight: WEIGHTS.michelin, score });
    allNormalizedScores.push(score);
  }

  if (ratings.whiteguide) {
    const score = WHITEGUIDE_SCORES[ratings.whiteguide];
    entries.push({ weight: WEIGHTS.whiteguide, score });
    allNormalizedScores.push(score);
  }

  if (ratings.svd != null && ratings.svd > 0) {
    const score = normalize1to6(ratings.svd);
    entries.push({ weight: WEIGHTS.svd, score });
    allNormalizedScores.push(score);
  }

  if (ratings.krogguiden != null && ratings.krogguiden > 0) {
    const score = normalize1to5(ratings.krogguiden);
    entries.push({ weight: WEIGHTS.krogguiden, score });
    allNormalizedScores.push(score);
  }

  if (ratings.di != null && ratings.di > 0) {
    const score = normalize0to25(ratings.di);
    entries.push({ weight: WEIGHTS.di, score });
    allNormalizedScores.push(score);
  }

  if (ratings.dn != null && ratings.dn > 0) {
    const score = normalize0to5(ratings.dn);
    entries.push({ weight: WEIGHTS.dn, score });
    allNormalizedScores.push(score);
  }

  if (ratings.google != null && ratings.google > 0) {
    const count = googleRatingCount ?? 0;
    const score = bayesianDampen(normalizeCrowd1to5(ratings.google), count);
    entries.push({ weight: WEIGHTS.google, score });
    allNormalizedScores.push(score);
  }

  return { entries, allNormalizedScores };
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

export type BakomScoreResult = {
  /** Display score: integer 0–100 */
  score: number;
  /** Raw score: decimal 0–100 for fine-grained ranking */
  scoreRaw: number;
};

/**
 * Calculate the Bakom Score for a restaurant.
 * Returns both display score (integer) and raw score (decimal), or null if no ratings exist.
 */
export function calculateBakomScore(input: ScoreInput): BakomScoreResult | null {
  const { entries: sources, allNormalizedScores } = collectSources(input);
  if (sources.length === 0) return null;

  const { ratings, links } = input;

  // Compute weighted average with diversity dampening
  let score = computeScore(sources);

  // "Visited but no score" ceiling — Krogguiden reviewed but didn't rate
  // This suggests the restaurant wasn't good enough to earn a score
  const krogguidenVisitedNoScore =
    links?.krogguiden && (ratings.krogguiden == null || ratings.krogguiden === 0);
  if (krogguidenVisitedNoScore) {
    score = Math.min(score, VISITED_NO_SCORE_CEILING);
  }

  // Prestige ceiling — restaurants without expert sources are capped
  const hasMichelinStars =
    ratings.michelin && MICHELIN_STARRED.includes(ratings.michelin);
  const hasMichelin = !!ratings.michelin;
  const hasWhiteGuide = !!ratings.whiteguide;

  if (!hasMichelinStars) {
    if (!hasMichelin && !hasWhiteGuide) {
      // No prestige sources at all → cap at 85
      score = Math.min(score, PRESTIGE_CEILINGS.none);
    } else {
      // Has White Guide OR Michelin selected/bib → cap at 95
      score = Math.min(score, PRESTIGE_CEILINGS.basic);
    }
  }

  // Convert from internal 0–10 scale to output 0–100 scale
  const scoreRaw = score * 10;
  let finalScore = Math.round(scoreRaw);

  // Perfection requirement — 100 requires all sources ≥ 9.5
  // and must have Michelin 1★+
  if (finalScore >= 100) {
    const allPerfect = allNormalizedScores.every(
      (s) => s >= PERFECTION_THRESHOLD,
    );
    if (!hasMichelinStars || !allPerfect) {
      finalScore = 99;
    }
  }

  return { score: finalScore, scoreRaw };
}
