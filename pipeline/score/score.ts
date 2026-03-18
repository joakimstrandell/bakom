/** Score — compute Bakom Score (0–100) and ranks. @see docs/pipeline.md */

import { saveData, loadData } from "../utils/save.js";
import type { EnrichedVenue } from "../refine/google.js";
import type {
  MichelinRating,
  WhiteguideRating,
  NumericRating,
} from "../merge/venue.js";

// ─── Scored venue type ──────────────────────────────────────────

export type ScoredVenue = EnrichedVenue & {
  /** Per-source normalized ratings (0–10 internal scale) */
  normalizedRatings: Record<string, number>;
  /** Display score: integer 0–100 */
  bakomScore: number;
  /** Raw score: decimal 0–100 for fine-grained ranking */
  bakomScoreRaw: number;
  /** National rank (1 = best in Sweden) */
  rankNational: number;
  /** Metro region rank (1 = best in Stockholm/Göteborg/Malmö). Null for "sweden" region. */
  rankRegion: number | null;
};

// ─── Weights (from pipeline1 — proven calibration) ──────────────

const WEIGHTS: Record<string, number> = {
  michelin: 0.28,
  whiteguide: 0.2,
  svd: 0.16,
  di: 0.16,
  krogguiden: 0.16,
  falstaff: 0.14,
  dn: 0.14,
  google: 0.1,
};

// ─── Michelin normalization (fixed mapping to 0–10) ─────────────

const MICHELIN_SCORES: Record<string, number> = {
  selected: 7.5,
  bib_gourmand: 8.0,
  "1_star": 9.0,
  "2_star": 9.5,
  "3_star": 10.0,
  // Keys (hotels) — equivalent to their star counterparts
  "1_key": 9.0,
  "2_key": 9.5,
  "3_key": 10.0,
};

const MICHELIN_STARRED = ["1_star", "2_star", "3_star", "1_key", "2_key", "3_key"];

function normalizeMichelin(r: MichelinRating): number | null {
  return MICHELIN_SCORES[r.distinction] ?? null;
}

// ─── White Guide normalization (fixed mapping to 0–10) ──────────

const WG_SCORES: Record<string, number> = {
  "GOD NIVÅ": 6.5,
  "REKOMMENDERAD": 7.0,
  "REKOMMENDERAT": 7.0,
  "GOD KLASS": 7.5,
  "MYCKET GOD KLASS": 8.0,
  "MYCKET GOD NIVÅ": 8.5,
  "MÄSTARKLASS": 9.0,
  "EXCEPTIONELL NIVÅ": 9.5,
  "GLOBAL MÄSTARKLASS": 9.5,
  "GLOBAL EXCEPTIONELL NIVÅ": 10.0,
  "Not So White Guide": 5.0,
};

function normalizeWhiteguide(r: WhiteguideRating): number | null {
  if (!r.classification) return null;
  return WG_SCORES[r.classification.toUpperCase()] ?? null;
}

// ─── Numeric rating normalization ───────────────────────────────

/** Krogguiden: 1–5 → 0–10 */
function normalize1to5(score: number): number {
  return (score / 5) * 10;
}

/** SvD: 1–6 → 0–10 */
function normalize1to6(score: number): number {
  return (score / 6) * 10;
}

/** DI Weekend: 0–25 → 0–10 */
function normalize0to25(score: number): number {
  return (score / 25) * 10;
}

/** DN: 0–5 → 0–10 */
function normalize0to5(score: number): number {
  return (score / 5) * 10;
}

/** Falstaff: 0–100 → 0–10 */
function normalize0to100(score: number): number {
  return (score / 100) * 10;
}

function normalizeNumericBySource(
  sourceId: string,
  r: NumericRating,
): number | null {
  if (r.score == null) return null;
  switch (sourceId) {
    case "krogguiden":
      return normalize1to5(r.score);
    case "svd":
      return normalize1to6(r.score);
    case "di":
      return normalize0to25(r.score);
    case "dn":
      return normalize0to5(r.score);
    case "falstaff":
      return normalize0to100(r.score);
    default:
      return null;
  }
}

// ─── Time decay for editorial scores ────────────────────────────

/** Reviews older than this are at full weight. Beyond this, weight decays. */
const DECAY_THRESHOLD_YEARS = 3;
/** Each year beyond the threshold reduces weight by this factor */
const DECAY_PER_YEAR = 0.15;
/** Minimum weight multiplier (floor) */
const DECAY_FLOOR = 0.4;

/**
 * Compute a weight multiplier based on review age.
 * - ≤3 years old: 1.0 (full weight)
 * - 4 years old: 0.85
 * - 5 years old: 0.70
 * - 6 years old: 0.55
 * - 7+ years old: 0.40 (floor)
 * - No date: 1.0 (benefit of the doubt)
 */
function timeDecayMultiplier(publishedAt?: string): number {
  if (!publishedAt) return 1.0;
  const pubDate = new Date(publishedAt);
  if (isNaN(pubDate.getTime())) return 1.0;

  const now = new Date();
  const ageYears = (now.getTime() - pubDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

  if (ageYears <= DECAY_THRESHOLD_YEARS) return 1.0;

  const yearsOver = ageYears - DECAY_THRESHOLD_YEARS;
  const multiplier = 1.0 - yearsOver * DECAY_PER_YEAR;
  return Math.max(DECAY_FLOOR, multiplier);
}

// ─── Google rating normalization (Bayesian dampening) ───────────

const CROWD_PRIOR = 7.0;

function normalizeGoogle(venue: EnrichedVenue): number | null {
  if (venue.googleRating == null || !venue.googleRatingCount) return null;

  const raw = (venue.googleRating / 5) * 10;
  // Bayesian dampening — pull toward neutral-good prior with few reviews
  // Low review counts get very low confidence (7 reviews → 0.07), so
  // the prior dominates. No hard minimum needed.
  const confidence = Math.min(1, venue.googleRatingCount / 100);
  return confidence * raw + (1 - confidence) * CROWD_PRIOR;
}

// ─── Prestige & perfection thresholds ───────────────────────────

const PRESTIGE_CEILINGS = {
  none: 8.0, // No Michelin AND no White Guide → max 80
  basic: 9.5, // Has WG OR Michelin selected/bib → max 95
  // Michelin 1★+ → no ceiling
} as const;

const PERFECTION_THRESHOLD = 9.5;

// ─── Diversity dampening ────────────────────────────────────────

function diversityFactor(sourceCount: number): number {
  if (sourceCount === 1) return 0.88;
  if (sourceCount === 2) return 0.95;
  return 1.0;
}

// ─── Score calculation ──────────────────────────────────────────

type SourceEntry = { source: string; weight: number; score: number };

function collectSources(venue: EnrichedVenue): {
  entries: SourceEntry[];
  allScores: number[];
} {
  const { ratings } = venue;
  const entries: SourceEntry[] = [];
  const allScores: number[] = [];

  if (ratings.michelin) {
    const s = normalizeMichelin(ratings.michelin);
    if (s != null) {
      entries.push({ source: "michelin", weight: WEIGHTS.michelin, score: s });
      allScores.push(s);
    }
  }

  if (ratings.whiteguide) {
    const s = normalizeWhiteguide(ratings.whiteguide);
    if (s != null) {
      entries.push({
        source: "whiteguide",
        weight: WEIGHTS.whiteguide,
        score: s,
      });
      allScores.push(s);
    }
  }

  for (const sourceId of ["svd", "di", "krogguiden", "falstaff", "dn"] as const) {
    const r = ratings[sourceId];
    if (r) {
      const s = normalizeNumericBySource(sourceId, r);
      if (s != null) {
        const decay = timeDecayMultiplier(r.publishedAt);
        entries.push({
          source: sourceId,
          weight: WEIGHTS[sourceId] * decay,
          score: s,
        });
        allScores.push(s);
      }
    }
  }

  const google = normalizeGoogle(venue);
  if (google != null) {
    entries.push({ source: "google", weight: WEIGHTS.google, score: google });
    allScores.push(google);
  }

  return { entries, allScores };
}

function computeScore(venue: EnrichedVenue): {
  normalizedRatings: Record<string, number>;
  bakomScore: number;
  bakomScoreRaw: number;
} {
  const { entries, allScores } = collectSources(venue);
  const { ratings } = venue;

  if (entries.length === 0) {
    return { normalizedRatings: {}, bakomScore: 0, bakomScoreRaw: 0 };
  }

  // Build normalized ratings map
  const normalizedRatings: Record<string, number> = {};
  for (const e of entries) {
    normalizedRatings[e.source] = Math.round(e.score * 100) / 100;
  }

  // Weighted average — all sources included
  let weightedSum = 0;
  let totalWeight = 0;
  for (const e of entries) {
    weightedSum += e.weight * e.score;
    totalWeight += e.weight;
  }
  let score = weightedSum / totalWeight;

  // Diversity dampening
  score *= diversityFactor(entries.length);

  // Prestige ceiling
  const hasMichelinStars =
    ratings.michelin && MICHELIN_STARRED.includes(ratings.michelin.distinction);
  const hasMichelin = !!ratings.michelin;
  const hasWhiteGuide = !!ratings.whiteguide;

  if (!hasMichelinStars) {
    if (!hasMichelin && !hasWhiteGuide) {
      score = Math.min(score, PRESTIGE_CEILINGS.none);
    } else {
      score = Math.min(score, PRESTIGE_CEILINGS.basic);
    }
  }

  // Convert to 0–100
  const bakomScoreRaw = score * 10;
  let bakomScore = Math.round(bakomScoreRaw);

  // Perfection requirement — 100 needs Michelin 1★+ AND all sources ≥ 9.5
  if (bakomScore >= 100) {
    const allPerfect = allScores.every((s) => s >= PERFECTION_THRESHOLD);
    if (!hasMichelinStars || !allPerfect) {
      bakomScore = 99;
    }
  }

  // Clamp
  bakomScore = Math.max(0, Math.min(100, bakomScore));

  return { normalizedRatings, bakomScore, bakomScoreRaw };
}

// ─── Assign ranks ───────────────────────────────────────────────

const RANKED_METRO_REGIONS = ["stockholm", "gothenburg", "malmo"];

function assignRanks(venues: ScoredVenue[]): void {
  // Rank separately per category
  for (const category of ["restaurant", "bar", "fika", "hotel"] as const) {
    const inCategory = venues.filter(
      (v) => v.bakomScore > 0 && v.category === category,
    );

    // National rank within category
    inCategory.sort((a, b) => b.bakomScoreRaw - a.bakomScoreRaw);
    for (let i = 0; i < inCategory.length; i++) {
      inCategory[i].rankNational = i + 1;
    }

    // Metro region ranks within category
    const byRegion = new Map<string, ScoredVenue[]>();
    for (const v of inCategory) {
      const region = v.metroRegion || "sweden";
      if (!RANKED_METRO_REGIONS.includes(region)) continue;
      const list = byRegion.get(region);
      if (list) list.push(v);
      else byRegion.set(region, [v]);
    }

    for (const regionVenues of byRegion.values()) {
      regionVenues.sort((a, b) => b.bakomScoreRaw - a.bakomScoreRaw);
      for (let i = 0; i < regionVenues.length; i++) {
        regionVenues[i].rankRegion = i + 1;
      }
    }
  }
}

// ─── Main score function ────────────────────────────────────────

export async function scoreAll(): Promise<ScoredVenue[]> {
  console.log("=== Score ===\n");

  // Load refined venues
  type RefinedData = { sourceHash: string; venues: EnrichedVenue[] };
  const refined = loadData<RefinedData>("venues-refined.json");
  if (!refined || refined.venues.length === 0) {
    throw new Error(
      "pipeline/.data/venues-refined.json not found. Run pipeline:refine first.",
    );
  }

  const venues = refined.venues;
  console.log(`  Loaded ${venues.length} venues`);

  // Score each venue
  const scored: ScoredVenue[] = venues.map((v) => {
    const { normalizedRatings, bakomScore, bakomScoreRaw } = computeScore(v);
    return {
      ...v,
      normalizedRatings,
      bakomScore,
      bakomScoreRaw,
      rankNational: 0,
      rankRegion: null,
    };
  });

  // Assign ranks
  assignRanks(scored);

  // Save
  saveData("venues-scored.json", scored);

  // ─── Stats ──────────────────────────────────────────────────

  const withScore = scored.filter((v) => v.bakomScore > 0);
  const avgScore =
    withScore.reduce((s, v) => s + v.bakomScore, 0) / withScore.length;

  // Score distribution
  const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
  const distribution = buckets.map((min) => {
    const max = min + 10;
    const count = scored.filter(
      (v) => v.bakomScore >= min && v.bakomScore < max,
    ).length;
    return { range: `${min}–${max}`, count };
  });
  const perfect = scored.filter((v) => v.bakomScore === 100).length;

  console.log(`\n  === Score Results ===`);
  console.log(`  Scored: ${withScore.length}/${scored.length}`);
  console.log(`  Average: ${avgScore.toFixed(1)}`);
  console.log(`\n  Score distribution:`);
  for (const { range, count } of distribution) {
    if (count > 0) {
      const bar = "█".repeat(Math.ceil(count / 10));
      console.log(
        `    ${range.padStart(6)}: ${String(count).padStart(4)} ${bar}`,
      );
    }
  }
  if (perfect > 0) console.log(`       100: ${String(perfect).padStart(4)}`);

  // Top 20
  console.log(`\n  Top 20:`);
  const top = scored
    .filter((v) => v.bakomScore > 0)
    .sort((a, b) => b.bakomScoreRaw - a.bakomScoreRaw)
    .slice(0, 20);
  for (const v of top) {
    const sources = Object.keys(v.normalizedRatings).join(", ");
    console.log(
      `    #${String(v.rankNational).padStart(3)} ${String(v.bakomScore).padStart(3)}  ${v.name} (${v.city}) [${sources}]`,
    );
  }

  // Metro region leaderboard
  const regionLabels: Record<string, string> = {
    stockholm: "Stockholm",
    gothenburg: "Göteborg",
    malmo: "Malmö",
    sweden: "Övriga",
  };
  const byRegionList = new Map<string, ScoredVenue[]>();
  for (const v of scored) {
    const region = v.metroRegion || "sweden";
    const list = byRegionList.get(region);
    if (list) list.push(v);
    else byRegionList.set(region, [v]);
  }

  console.log(`\n  Metro regions:`);
  for (const regionId of ["stockholm", "gothenburg", "malmo", "sweden"]) {
    const cvs = byRegionList.get(regionId) || [];
    const withS = cvs.filter((v) => v.bakomScore > 0);
    if (withS.length === 0) continue;
    const avg = withS.reduce((s, v) => s + v.bakomScore, 0) / withS.length;
    const best = [...cvs].sort((a, b) => b.bakomScoreRaw - a.bakomScoreRaw)[0];
    console.log(
      `    ${(regionLabels[regionId] || regionId).padEnd(12)} ${String(cvs.length).padStart(4)} venues  avg ${avg.toFixed(1)}  #1: ${best.name}`,
    );
  }

  return scored;
}
