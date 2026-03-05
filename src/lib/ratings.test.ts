import { describe, it, expect } from "vitest";
import { bestNumericRating } from "./ratings";
import type { Restaurant } from "../types";

function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "test",
    name: "Test",
    address: "",
    postalCode: "",
    city: "",
    region: "",
    phone: "",
    website: "",
    priceRange: "",
    cuisine: "",
    hours: [],
    lat: null,
    lng: null,
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
    ...overrides,
  };
}

describe("bestNumericRating", () => {
  it("returns google rating when both exist", () => {
    const r = makeRestaurant({
      ratings: {
        google: 4.5,
        krogguiden: 3.8,
        michelin: null,
        whiteguide: null,
        svd: null,
        dn: null,
      },
    });
    expect(bestNumericRating(r)).toBe(4.5);
  });

  it("returns krogguiden when google is null", () => {
    const r = makeRestaurant({
      ratings: {
        google: null,
        krogguiden: 3.8,
        michelin: null,
        whiteguide: null,
        svd: null,
        dn: null,
      },
    });
    expect(bestNumericRating(r)).toBe(3.8);
  });

  it("returns null when neither exists", () => {
    const r = makeRestaurant();
    expect(bestNumericRating(r)).toBeNull();
  });

  it("returns google even when 0 (nullish coalescing safe)", () => {
    const r = makeRestaurant({
      ratings: {
        google: 0,
        krogguiden: 3.0,
        michelin: null,
        whiteguide: null,
        svd: null,
        dn: null,
      },
    });
    // ?? only skips null/undefined, so 0 is returned
    expect(bestNumericRating(r)).toBe(0);
  });

  it("prefers google over krogguiden (google is first)", () => {
    const r = makeRestaurant({
      ratings: {
        google: 3.0,
        krogguiden: 5.0,
        michelin: null,
        whiteguide: null,
        svd: null,
        dn: null,
      },
    });
    expect(bestNumericRating(r)).toBe(3.0);
  });
});
