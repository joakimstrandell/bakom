import { describe, it, expect } from "vitest";
import { calculateBakomScore, type ScoreInput } from "./score";

// ─── Helpers ─────────────────────────────────────────────────────

/** Build a ScoreInput with only the fields you care about */
function input(
  overrides: Partial<ScoreInput["ratings"]> & {
    googleRatingCount?: number;
    links?: { krogguiden?: string };
  } = {}
): ScoreInput {
  const { googleRatingCount, links, ...ratings } = overrides;
  return {
    ratings: {
      krogguiden: null,
      google: null,
      michelin: null,
      whiteguide: null,
      svd: null,
      dn: null,
      di: null,
      ...ratings,
    },
    googleRatingCount,
    links,
  };
}

function score(overrides: Parameters<typeof input>[0]): number | null {
  const result = calculateBakomScore(input(overrides));
  return result?.score ?? null;
}

// ─── Basic behavior ──────────────────────────────────────────────

describe("calculateBakomScore", () => {
  it("returns null when no ratings exist", () => {
    expect(score({})).toBeNull();
  });

  it("returns an integer between 0 and 100", () => {
    const s = score({ krogguiden: 3.5 });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
    expect(Number.isInteger(s)).toBe(true);
  });

  // ─── Normalization ───────────────────────────────────────────

  describe("normalization (score/max)", () => {
    it("Krogguiden 1-5 maps correctly", () => {
      // 1.0/5 → internal 2.0, single-source = 2.0 * 0.88 = 1.76, *10 = 17.6 → 18
      const s1 = score({ krogguiden: 1.0 });
      expect(s1).toBe(18);

      // 5.0/5 → internal 10.0, single-source = 10.0 * 0.88 = 8.8
      // BUT no prestige sources → capped at 8.0, *10 = 80
      const s5 = score({ krogguiden: 5.0 });
      expect(s5).toBe(80);
    });

    it("Google 5/5 with full confidence capped by prestige ceiling", () => {
      // Google 5.0/5 → internal 10.0, with 200 reviews (full confidence)
      // single-source = 10.0 * 0.88 = 8.8, capped at 8.0 (no prestige) → 80
      const g5 = score({ google: 5.0, googleRatingCount: 200 });
      expect(g5).toBe(80);
    });

    it("SvD 1-6 maps correctly", () => {
      // 6/6 → internal 10.0, single-source = 10.0 * 0.88 = 8.8, capped at 8.0 → 80
      const s6 = score({ svd: 6 });
      expect(s6).toBe(80);

      // 3/6 → internal 5.0, single-source = 5.0 * 0.88 = 4.4, *10 = 44
      const s3 = score({ svd: 3 });
      expect(s3).toBe(44);
    });

    it("DI 0-25 maps correctly", () => {
      // 25/25 → internal 10.0, single-source = 10.0 * 0.88 = 8.8, capped at 8.0 → 80
      const s25 = score({ di: 25 });
      expect(s25).toBe(80);

      // 20/25 → internal 8.0, single-source = 8.0 * 0.88 = 7.04, *10 = 70
      const s20 = score({ di: 20 });
      expect(s20).toBe(70);

      // 15/25 → internal 6.0, single-source = 6.0 * 0.88 = 5.28, *10 = 53
      const s15 = score({ di: 15 });
      expect(s15).toBe(53);
    });

    it("DN 0-5 maps correctly", () => {
      // 5/5 → internal 10.0, single-source = 10.0 * 0.88 = 8.8, capped at 8.0 → 80
      const s5 = score({ dn: 5 });
      expect(s5).toBe(80);

      // 3/5 → internal 6.0, single-source = 6.0 * 0.88 = 5.28, *10 = 53
      const s3 = score({ dn: 3 });
      expect(s3).toBe(53);
    });
  });

  // ─── Bayesian dampening ──────────────────────────────────────

  describe("Bayesian dampening", () => {
    it("few reviews pull score toward prior (visible with non-Google source)", () => {
      // Use Krogguiden + Google to avoid Google-only ceiling masking the effect
      const fewReviews = score({ krogguiden: 4.0, google: 5.0, googleRatingCount: 3 })!;
      const manyReviews = score({ krogguiden: 4.0, google: 5.0, googleRatingCount: 200 })!;
      expect(fewReviews).toBeLessThan(manyReviews);
    });

    it("100+ reviews = full confidence (no dampening)", () => {
      const s100 = score({ google: 4.5, googleRatingCount: 100 });
      const s200 = score({ google: 4.5, googleRatingCount: 200 });
      expect(s100).toBe(s200);
    });

    it("crowd-only restaurant with few reviews cannot reach 80+", () => {
      const s = score({ google: 5.0, googleRatingCount: 3 });
      expect(s).toBeLessThan(80);
    });
  });

  // ─── Diversity dampening ─────────────────────────────────────

  describe("diversity dampening", () => {
    it("single source gets 0.88 factor", () => {
      // Krogguiden 4.0/5 → internal 8.0 * 0.88 = 7.04, *10 = 70
      const s = score({ krogguiden: 4.0 });
      expect(s).toBe(70);
    });

    it("two sources get 0.95 factor", () => {
      const single = score({ krogguiden: 4.0 })!;
      const dual = score({ krogguiden: 4.0, svd: 5 })!; // SvD 5/6 = 8.33
      expect(dual).toBeGreaterThan(single);
    });

    it("three+ sources get no dampening", () => {
      const s = score({
        krogguiden: 4.0,
        whiteguide: "good_class",
        svd: 4,
      });
      // All three at roughly similar scores, no dampening
      expect(s).not.toBeNull();
      expect(s).toBeGreaterThan(60);
    });

    it("DN counts as a numeric source for diversity and score", () => {
      const withoutDn = score({ krogguiden: 4.0 })!; // 1 source, 0.88 factor
      const withDn = score({ krogguiden: 4.0, dn: 4 })!; // 2 sources, 0.95 factor
      expect(withDn).toBeGreaterThan(withoutDn);
    });
  });

  // ─── Prestige ceiling ────────────────────────────────────────

  describe("prestige ceiling", () => {
    it("no prestige sources caps at 80", () => {
      // Perfect scores from non-prestige sources
      const s = score({ krogguiden: 5.0, google: 5.0, googleRatingCount: 500 });
      expect(s).toBeLessThanOrEqual(80);
    });

    it("White Guide allows up to 95", () => {
      const s = score({ whiteguide: "global_master_class", krogguiden: 5.0 });
      expect(s).toBeLessThanOrEqual(95);
      expect(s).toBeGreaterThan(80);
    });

    it("Michelin selected/bib allows up to 95", () => {
      const s = score({ michelin: "bib_gourmand", krogguiden: 5.0 });
      expect(s).toBeLessThanOrEqual(95);
    });

    it("Michelin 1★+ has no ceiling", () => {
      // With perfect scores and 3★, should reach 100
      const s = score({
        michelin: "3_star",
        whiteguide: "global_master_class",
        krogguiden: 5.0,
      });
      expect(s).toBe(100);
    });

    it("selected has no floor", () => {
      const s = score({ michelin: "selected" });
      // selected = internal 6.5 * 0.88 = 5.72, *10 = 57
      expect(s).toBe(57);
    });
  });

  // ─── Perfection requirement ─────────────────────────────────

  describe("perfection requirement", () => {
    it("100 requires all sources ≥ 9.5", () => {
      // All perfect scores
      const perfect = score({
        michelin: "3_star",
        whiteguide: "global_master_class",
        krogguiden: 5.0,
        google: 5.0,
        googleRatingCount: 500,
      });
      expect(perfect).toBe(100);

      // One imperfect source (Krogguiden 4.5/5 = 9.0 < 9.5)
      const imperfect = score({
        michelin: "3_star",
        whiteguide: "global_master_class",
        krogguiden: 4.5,
        google: 5.0,
        googleRatingCount: 500,
      });
      expect(imperfect).toBeLessThanOrEqual(99);
    });

    it("100 requires Michelin 1★+", () => {
      // Perfect scores but only White Guide (no Michelin stars)
      const s = score({
        whiteguide: "global_master_class",
        krogguiden: 5.0,
      });
      expect(s).toBeLessThanOrEqual(95); // capped by prestige ceiling
    });
  });

  // ─── Visited but no score ceiling ──────────────────────────

  describe("visited but no score ceiling", () => {
    it("caps at 70 when Krogguiden visited but no score", () => {
      // Google 4.8 would normally get 85, but capped at 70
      const s = score({
        google: 4.8,
        googleRatingCount: 200,
        links: { krogguiden: "https://krogguiden.se/some-restaurant" },
      });
      expect(s).toBeLessThanOrEqual(70);
    });

    it("does not cap when Krogguiden has a score", () => {
      const s = score({
        krogguiden: 4.0,
        google: 4.5,
        googleRatingCount: 200,
        links: { krogguiden: "https://krogguiden.se/some-restaurant" },
      });
      // Should not be capped at 70 since there's an actual score
      expect(s).toBeGreaterThan(70);
    });

    it("does not cap when no Krogguiden link", () => {
      // Restaurant not in Krogguiden at all — no visited-no-score ceiling
      // Google 4.8/5 → 9.6, single-source = 9.6 * 0.88 = 8.448, capped at 8.0 (no prestige) → 80
      const s = score({ google: 4.8, googleRatingCount: 200 });
      expect(s).toBe(80);
    });
  });

  // ─── Low scores drag down average ───────────────────────────

  describe("low scores matter", () => {
    it("adding a bad source lowers the score", () => {
      const base = score({ krogguiden: 4.5, whiteguide: "very_good_class" })!;
      const withBadGoogle = score({
        krogguiden: 4.5,
        whiteguide: "very_good_class",
        google: 2.0,
        googleRatingCount: 100,
      })!;
      // Bad source should drag down the average
      expect(withBadGoogle).toBeLessThan(base);
    });
  });

  // ─── Ranking sanity ──────────────────────────────────────────

  describe("ranking sanity", () => {
    it("Michelin-starred > crowd-only (same Google rating)", () => {
      // Both have Google 4.5, but one also has Michelin 1-star
      const michelin = score({
        michelin: "1_star",
        google: 4.5,
        googleRatingCount: 500,
      })!;
      const crowd = score({ google: 4.5, googleRatingCount: 500 })!;
      expect(michelin).toBeGreaterThan(crowd);
    });

    it("multi-source expert > single-source crowd", () => {
      const expert = score({
        whiteguide: "good_class",
        krogguiden: 3.8,
        google: 4.0,
        googleRatingCount: 700,
      })!;
      const crowd = score({
        google: 4.0,
        googleRatingCount: 600,
      })!;
      // Multi-source with experts should beat single-source crowd at same Google rating
      expect(expert).toBeGreaterThan(crowd);
    });

    it("Frantzén-like with perfect scores = 100", () => {
      const s = score({
        michelin: "3_star",
        whiteguide: "global_master_class",
        krogguiden: 5.0,
        google: 5.0,
        googleRatingCount: 1000,
      });
      expect(s).toBe(100);
    });

    it("Frantzén-like with imperfect scores < 100", () => {
      // Real Frantzén has Krogguiden 4.4/5 = 8.8 < 9.5
      const s = score({
        michelin: "3_star",
        whiteguide: "global_master_class",
        krogguiden: 4.4,
        google: 4.8,
        googleRatingCount: 700,
      });
      expect(s).toBeLessThan(100);
    });

    it("higher Google rating = higher score (with editorial source to avoid ceiling)", () => {
      const low = score({ krogguiden: 3.5, google: 3.5, googleRatingCount: 200 })!;
      const mid = score({ krogguiden: 3.5, google: 4.0, googleRatingCount: 200 })!;
      const high = score({ krogguiden: 3.5, google: 4.5, googleRatingCount: 200 })!;
      expect(high).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(low);
    });
  });
});
