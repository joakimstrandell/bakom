import { describe, it, expect } from "vitest";
import {
  levenshteinDistance,
  similarityRatio,
  extractStreetComponents,
  addressSimilarity,
  findBestMatch,
  type MatchCandidate,
} from "./fuzzy";
import { normalizeName, normalizeAddress, findRestaurantMatch } from "./match";

// ─── levenshteinDistance ──────────────────────────────────────────

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("foo", "foo")).toBe(0);
  });

  it("returns length of other string when one is empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });

  it("counts single character substitution", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
  });

  it("counts insertion and deletion", () => {
    expect(levenshteinDistance("abc", "abcd")).toBe(1);
    expect(levenshteinDistance("abcd", "abc")).toBe(1);
  });

  it("is symmetric", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(
      levenshteinDistance("sitting", "kitten")
    );
  });

  it("handles Swedish characters", () => {
    expect(levenshteinDistance("kök", "kok")).toBe(1);
    expect(levenshteinDistance("café", "cafe")).toBe(1);
  });
});

// ─── similarityRatio ─────────────────────────────────────────────

describe("similarityRatio", () => {
  it("returns 1.0 for identical strings", () => {
    expect(similarityRatio("frantzén", "frantzén")).toBe(1.0);
  });

  it("returns 0.0 when one string is empty", () => {
    expect(similarityRatio("", "abc")).toBe(0.0);
  });

  it("returns high ratio for similar names", () => {
    expect(similarityRatio("bistro bisou", "bistro bisous")).toBeGreaterThan(
      0.9
    );
  });

  it("returns low ratio for different names", () => {
    expect(similarityRatio("frantzén", "mcdonalds")).toBeLessThan(0.3);
  });
});

// ─── extractStreetComponents ─────────────────────────────────────

describe("extractStreetComponents", () => {
  it("extracts street name and number", () => {
    const { street, number } = extractStreetComponents("Kungsgatan 25");
    expect(street).toBe("kungsgatan");
    expect(number).toBe("25");
  });

  it("handles letter suffixes", () => {
    const { street, number } = extractStreetComponents("Artillerigatan 56B");
    expect(street).toBe("artillerigatan");
    expect(number).toBe("56b");
  });

  it("handles address with city suffix", () => {
    const { street, number } = extractStreetComponents(
      "Hornsgatan 78, Stockholm"
    );
    expect(street).toBe("hornsgatan");
    expect(number).toBe("78");
  });

  it("handles address without number", () => {
    const { street, number } = extractStreetComponents("Strandvägen");
    expect(street).toBe("strandvägen");
    expect(number).toBe("");
  });
});

// ─── addressSimilarity ──────────────────────────────────────────

describe("addressSimilarity", () => {
  it("returns 1.0 for identical addresses", () => {
    expect(addressSimilarity("Kungsgatan 25", "Kungsgatan 25")).toBe(1.0);
  });

  it("high similarity for same street, different number", () => {
    const sim = addressSimilarity("Kungsgatan 25", "Kungsgatan 30");
    expect(sim).toBeGreaterThan(0.6);
    expect(sim).toBeLessThan(1.0);
  });

  it("low similarity for different streets", () => {
    const sim = addressSimilarity("Kungsgatan 25", "Sveavägen 10");
    expect(sim).toBeLessThan(0.5);
  });
});

// ─── normalizeName ───────────────────────────────────────────────

describe("normalizeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeName("  Frantzén  ")).toBe("frantzén");
  });

  it("strips common restaurant prefixes", () => {
    expect(normalizeName("Restaurang Lilla Ego")).toBe("lilla ego");
    expect(normalizeName("Bistro Bisou")).toBe("bisou");
    expect(normalizeName("Café Pascal")).toBe("pascal");
  });

  it("strips common restaurant suffixes", () => {
    expect(normalizeName("Elies Kök & Bar")).toBe("elies kök");
    expect(normalizeName("Nordic Grill")).toBe("nordic");
  });

  it("removes apostrophes and special chars", () => {
    expect(normalizeName("Franky's")).toBe("frankys");
    expect(normalizeName("PA&Co")).toBe("paco");
  });

  it("normalizes whitespace", () => {
    expect(normalizeName("Adam  /  Albin")).toBe("adam albin");
  });

  it("keeps Swedish characters", () => {
    expect(normalizeName("Ångbåtsbryggan")).toBe("ångbåtsbryggan");
    expect(normalizeName("Röda Huset")).toBe("röda huset");
  });
});

// ─── normalizeAddress ────────────────────────────────────────────

describe("normalizeAddress", () => {
  it("lowercases and strips city suffixes", () => {
    expect(normalizeAddress("Kungsgatan 25, Stockholm")).toBe("kungsgatan 25");
  });

  it("strips trailing dots and collapses whitespace", () => {
    expect(normalizeAddress("Sveavägen  10.")).toBe("sveavägen 10");
  });
});

// ─── findRestaurantMatch ─────────────────────────────────────────

describe("findRestaurantMatch", () => {
  const restaurants = [
    { name: "Frantzén", address: "Klara Norra Kyrkogata 26" },
    { name: "Adam/Albin", address: "Rådmansgatan 16" },
    { name: "Bistro Bisous", address: "Artillerigatan 56" },
    { name: "Pelikan", address: "Blekingegatan 40" },
  ];

  const candidates = new Map<string, (typeof restaurants)[number]>();
  for (const r of restaurants) {
    candidates.set(normalizeName(r.name), r);
  }
  const getAddr = (r: (typeof restaurants)[number]) => r.address;

  it("finds exact match", () => {
    const result = findRestaurantMatch("Frantzén", undefined, candidates);
    expect(result).not.toBeNull();
    expect(result!.item.name).toBe("Frantzén");
    expect(result!.result.nameSimilarity).toBe(1.0);
  });

  it("finds fuzzy match for slight spelling difference", () => {
    // After normalization, "Bistro Bisou" → "bisou" and "Bistro Bisous" → "bisous"
    // Similarity is 0.833, so we need a threshold ≤ 0.83 for this to match
    const result = findRestaurantMatch(
      "Bistro Bisou",
      "Artillerigatan 56",
      candidates,
      getAddr,
      0.8
    );
    expect(result).not.toBeNull();
    expect(result!.item.name).toBe("Bistro Bisous");
  });

  it("returns null when no match above threshold", () => {
    const result = findRestaurantMatch(
      "McDonald's",
      undefined,
      candidates,
      undefined,
      0.85
    );
    expect(result).toBeNull();
  });

  it("handles prefix stripping for match", () => {
    // "Restaurang Pelikan" should match "Pelikan" after normalization
    const result = findRestaurantMatch(
      "Restaurang Pelikan",
      undefined,
      candidates
    );
    expect(result).not.toBeNull();
    expect(result!.item.name).toBe("Pelikan");
  });
});

// ─── findBestMatch ───────────────────────────────────────────────

describe("findBestMatch", () => {
  it("prefers higher name similarity", () => {
    const candidates: MatchCandidate<string>[] = [
      { item: "A", normalizedName: "restaurant abc" },
      { item: "B", normalizedName: "restaurant abcd" },
    ];
    const result = findBestMatch("restaurant abc", undefined, candidates, 0.8);
    expect(result).not.toBeNull();
    expect(result!.item).toBe("A");
  });

  it("uses address as tiebreaker", () => {
    const candidates: MatchCandidate<string>[] = [
      {
        item: "Wrong location",
        normalizedName: "sushi bar",
        address: "sveavägen 10",
      },
      {
        item: "Right location",
        normalizedName: "sushi bar",
        address: "kungsgatan 25",
      },
    ];
    const result = findBestMatch(
      "sushi bar",
      "kungsgatan 25",
      candidates,
      0.85
    );
    expect(result).not.toBeNull();
    expect(result!.item).toBe("Right location");
  });

  it("returns null when all below threshold", () => {
    const candidates: MatchCandidate<string>[] = [
      { item: "X", normalizedName: "completely different name" },
    ];
    const result = findBestMatch("frantzén", undefined, candidates, 0.85);
    expect(result).toBeNull();
  });
});
