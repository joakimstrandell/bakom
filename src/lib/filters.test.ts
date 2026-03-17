import { describe, it, expect } from "vitest";
import { filterRestaurants, DEFAULT_FILTERS, type FilterState } from "./filters";
import type { Restaurant } from "../types";

// ── Test fixtures ───────────────────────────────────────────────

function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "test-1",
    name: "Test Restaurant",
    address: "Testgatan 1",
    postalCode: "111 22",
    city: "Stockholm",
    region: "Södermalm",
    phone: "",
    website: "",
    priceRange: "mellan",
    cuisine: "Svenskt",
    hours: [],
    lat: 59.32,
    lng: 18.07,
    ratings: {
      krogguiden: null,
      google: null,
      michelin: null,
      whiteguide: null,
      svd: null,
      dn: null,
      di: null,
    },
    links: {},
    bakomScore: null,
    ...overrides,
  };
}

const restaurants: Restaurant[] = [
  makeRestaurant({
    id: "sushi-place",
    name: "Sushi Palace",
    address: "Kungsgatan 10",
    region: "Norrmalm",
    cuisine: "Japanskt, Sushi",
    priceRange: "mellan",
    ratings: {
      krogguiden: 4.2,
      google: 4.5,
      michelin: "1_star",
      whiteguide: null,
      svd: 5,
      dn: 4,
      di: 20,
    },
    bakomScore: 85,
  }),
  makeRestaurant({
    id: "pizza-place",
    name: "Pizza Hörnan",
    address: "Hornsgatan 50",
    region: "Södermalm",
    cuisine: "Italienskt, Pizza",
    priceRange: "mellan",
    ratings: {
      krogguiden: 3.5,
      google: 4.0,
      michelin: null,
      whiteguide: "recommended",
      svd: null,
      dn: null,
      di: 15,
    },
    bakomScore: 60,
  }),
  makeRestaurant({
    id: "fine-dining",
    name: "Gastrologik",
    address: "Artillerigatan 14",
    region: "Östermalm",
    cuisine: "Nordiskt, Fine dining",
    priceRange: "lyx",
    ratings: {
      krogguiden: null,
      google: 4.8,
      michelin: "2_star",
      whiteguide: "master_class",
      svd: 6,
      dn: 5,
      di: 24,
    },
    bakomScore: 95,
  }),
  makeRestaurant({
    id: "no-ratings",
    name: "Nystartad Krog",
    address: "Sveavägen 100",
    region: "Vasastan",
    cuisine: "Svenskt",
    priceRange: "budget",
    ratings: {
      krogguiden: null,
      google: null,
      michelin: null,
      whiteguide: null,
      svd: null,
      dn: null,
      di: null,
    },
    bakomScore: null,
  }),
];

function filters(overrides: Partial<FilterState> = {}): FilterState {
  return { ...DEFAULT_FILTERS, ...overrides };
}

// ── No filters (identity) ───────────────────────────────────────

describe("filterRestaurants — no filters", () => {
  it("returns all restaurants when no filters are active", () => {
    const result = filterRestaurants(restaurants, DEFAULT_FILTERS);
    expect(result).toHaveLength(4);
  });
});

// ── Text search ─────────────────────────────────────────────────

describe("filterRestaurants — text search", () => {
  it("filters by name", () => {
    const result = filterRestaurants(restaurants, filters({ searchQuery: "sushi" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sushi-place");
  });

  it("filters by address", () => {
    const result = filterRestaurants(restaurants, filters({ searchQuery: "hornsgatan" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pizza-place");
  });

  it("filters by region", () => {
    const result = filterRestaurants(restaurants, filters({ searchQuery: "östermalm" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("fine-dining");
  });

  it("filters by cuisine", () => {
    const result = filterRestaurants(restaurants, filters({ searchQuery: "pizza" }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pizza-place");
  });

  it("is case-insensitive", () => {
    const result = filterRestaurants(restaurants, filters({ searchQuery: "SUSHI" }));
    expect(result).toHaveLength(1);
  });

  it("trims whitespace", () => {
    const result = filterRestaurants(restaurants, filters({ searchQuery: "  sushi  " }));
    expect(result).toHaveLength(1);
  });

  it("returns empty for non-matching query", () => {
    const result = filterRestaurants(restaurants, filters({ searchQuery: "tacos" }));
    expect(result).toHaveLength(0);
  });
});

// ── Cuisine filter ──────────────────────────────────────────────

describe("filterRestaurants — cuisine", () => {
  it("filters by single cuisine", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedCuisines: new Set(["Japanskt"]) })
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sushi-place");
  });

  it("matches any cuisine in comma-separated list", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedCuisines: new Set(["Pizza"]) })
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pizza-place");
  });

  it("filters by multiple cuisines (OR logic)", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedCuisines: new Set(["Japanskt", "Fine dining"]) })
    );
    expect(result).toHaveLength(2);
  });

  it("excludes restaurants with undefined cuisine", () => {
    const withUndefined = [
      ...restaurants,
      makeRestaurant({ id: "no-cuisine", cuisine: undefined as unknown as string }),
    ];
    const result = filterRestaurants(
      withUndefined,
      filters({ selectedCuisines: new Set(["Svenskt"]) })
    );
    expect(result.find((r) => r.id === "no-cuisine")).toBeUndefined();
  });

  it("returns restaurants with matching cuisine among many", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedCuisines: new Set(["Svenskt"]) })
    );
    expect(result).toHaveLength(1); // Only "Nystartad Krog" has "Svenskt"
    expect(result[0].id).toBe("no-ratings");
  });
});

// ── Price filter ────────────────────────────────────────────────

describe("filterRestaurants — price", () => {
  it("filters by single price", () => {
    const result = filterRestaurants(restaurants, filters({ selectedPrices: new Set(["lyx"]) }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("fine-dining");
  });

  it("filters by multiple prices (OR)", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedPrices: new Set(["budget", "mellan"]) })
    );
    expect(result).toHaveLength(3); // Sushi (mellan) + Pizza (mellan) + Nystartad (budget)
  });
});

// ── Range filters ───────────────────────────────────────────────

describe("filterRestaurants — range filters", () => {
  it("filters by minimum bakom score", () => {
    const result = filterRestaurants(restaurants, filters({ bakomScore: { min: 70, max: 100 } }));
    expect(result).toHaveLength(2); // sushi (85) + fine-dining (95)
  });

  it("filters by maximum bakom score", () => {
    const result = filterRestaurants(restaurants, filters({ bakomScore: { min: 0, max: 70 } }));
    expect(result).toHaveLength(1); // pizza (60)
    expect(result[0].id).toBe("pizza-place");
  });

  it("filters by bakom score range", () => {
    const result = filterRestaurants(restaurants, filters({ bakomScore: { min: 60, max: 90 } }));
    expect(result).toHaveLength(2); // pizza (60) + sushi (85)
  });

  it("excludes null scores when range is active", () => {
    const result = filterRestaurants(restaurants, filters({ bakomScore: { min: 10, max: 100 } }));
    // no-ratings has null bakomScore → excluded
    expect(result.find((r) => r.id === "no-ratings")).toBeUndefined();
  });

  it("filters by krogguiden range", () => {
    const result = filterRestaurants(restaurants, filters({ krogguiden: { min: 4, max: 5 } }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sushi-place"); // 4.2
  });

  it("filters by google range", () => {
    const result = filterRestaurants(restaurants, filters({ google: { min: 4.5, max: 5 } }));
    expect(result).toHaveLength(2); // sushi (4.5) + fine-dining (4.8)
  });

  it("filters by svd range", () => {
    const result = filterRestaurants(restaurants, filters({ svd: { min: 5, max: 6 } }));
    expect(result).toHaveLength(2); // sushi (5) + fine-dining (6)
  });

  it("filters by di range", () => {
    const result = filterRestaurants(restaurants, filters({ di: { min: 18, max: 22 } }));
    expect(result).toHaveLength(1); // sushi (20)
    expect(result[0].id).toBe("sushi-place");
  });

  it("default range (full bounds) does not filter", () => {
    const result = filterRestaurants(restaurants, filters({ bakomScore: { min: 0, max: 100 } }));
    expect(result).toHaveLength(4); // All restaurants pass
  });
});

// ── Michelin multi-select ──────────────────────────────────────

describe("filterRestaurants — michelin multi-select", () => {
  it("filters by single michelin distinction", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedMichelin: new Set(["1_star"]) })
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sushi-place");
  });

  it("filters by multiple michelin distinctions (OR)", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedMichelin: new Set(["1_star", "2_star"]) })
    );
    expect(result).toHaveLength(2); // sushi + fine-dining
  });

  it("returns empty when no restaurants match", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedMichelin: new Set(["3_star"]) })
    );
    expect(result).toHaveLength(0);
  });

  it("excludes restaurants without michelin when filter is active", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedMichelin: new Set(["selected", "bib_gourmand"]) })
    );
    expect(result).toHaveLength(0); // No restaurants have selected or bib_gourmand
  });
});

// ── White Guide multi-select ───────────────────────────────────

describe("filterRestaurants — white guide multi-select", () => {
  it("filters by single white guide classification", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedWhiteGuide: new Set(["recommended"]) })
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pizza-place");
  });

  it("filters by multiple white guide classifications (OR)", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedWhiteGuide: new Set(["recommended", "master_class"]) })
    );
    expect(result).toHaveLength(2); // pizza + fine-dining
  });

  it("excludes restaurants without white guide when filter is active", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ selectedWhiteGuide: new Set(["global_master_class"]) })
    );
    expect(result).toHaveLength(0);
  });
});

// ── DN range ──────────────────────────────────────────────────

describe("filterRestaurants — DN range", () => {
  it("filters by dn range", () => {
    const result = filterRestaurants(restaurants, filters({ dn: { min: 4, max: 5 } }));
    expect(result).toHaveLength(2); // sushi (4) + fine-dining (5)
  });

  it("default range does not filter", () => {
    const result = filterRestaurants(restaurants, filters({ dn: { min: 0, max: 5 } }));
    expect(result).toHaveLength(4);
  });

  it("excludes null when range is active", () => {
    const result = filterRestaurants(restaurants, filters({ dn: { min: 1, max: 5 } }));
    // pizza (null) and no-ratings (null) excluded
    expect(result).toHaveLength(2);
  });
});

// ── Combined filters ────────────────────────────────────────────

describe("filterRestaurants — combined filters", () => {
  it("combines text search + price", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ searchQuery: "pizza", selectedPrices: new Set(["mellan"]) })
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pizza-place");
  });

  it("combining text search + wrong price returns empty", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ searchQuery: "pizza", selectedPrices: new Set(["lyx"]) })
    );
    expect(result).toHaveLength(0);
  });

  it("combines cuisine + minimum score", () => {
    const result = filterRestaurants(
      restaurants,
      filters({
        selectedCuisines: new Set(["Svenskt"]),
        bakomScore: { min: 50, max: 100 },
      })
    );
    // Only "Nystartad Krog" (Svenskt, null score → excluded), no matches
    expect(result).toHaveLength(0);
  });

  it("combines google + michelin filters", () => {
    const result = filterRestaurants(
      restaurants,
      filters({ google: { min: 4.5, max: 5 }, selectedMichelin: new Set(["1_star", "2_star"]) })
    );
    expect(result).toHaveLength(2); // sushi + fine-dining both pass
  });

  it("combines range + multi-select + dn range", () => {
    const result = filterRestaurants(
      restaurants,
      filters({
        bakomScore: { min: 80, max: 100 },
        selectedMichelin: new Set(["1_star", "2_star"]),
        dn: { min: 3, max: 5 },
      })
    );
    expect(result).toHaveLength(2); // sushi (85, 1_star, dn:4) + fine-dining (95, 2_star, dn:5)
  });

  it("excludes when one filter doesn't match", () => {
    const result = filterRestaurants(
      restaurants,
      filters({
        bakomScore: { min: 90, max: 100 }, // Only fine-dining passes
        selectedMichelin: new Set(["1_star"]), // Only sushi passes
      })
    );
    expect(result).toHaveLength(0); // No overlap
  });
});
