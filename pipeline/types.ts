/**
 * Scraper-specific intermediate types.
 * Each source scraper produces its own raw format.
 * The merge step combines these into the final Restaurant type from src/types.ts.
 */

import type {
  HoursEntry,
  MichelinDistinction,
  WhiteGuideClassification,
  Restaurant,
  SourceIds,
} from "../src/types.js";

/**
 * Pipeline-internal Restaurant type where pipeline-only fields are guaranteed present.
 * The base Restaurant type has these as optional since they're stripped from the frontend JSON.
 */
export type PipelineRestaurant = Restaurant & {
  slug: string;
  image: string;
  sourceIds: SourceIds;
  sources: string[];
  googlePlaceId?: string;
};

/** Raw output from the Krogguiden scraper */
export type KrogguidenRaw = {
  source: "krogguiden";
  slug: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  region: string;
  phone: string;
  website: string;
  priceRange: string;
  cuisine: string;
  image: string;
  rating: number | null;
  hours: HoursEntry[];
  url: string;
};

/** Raw output from the Google Places API collector */
export type GoogleRaw = {
  source: "google";
  /** The restaurant ID from restaurants.json (for matching back) */
  restaurantId: string;
  /** The original restaurant name used to search */
  searchName: string;
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number | null;
  ratingCount: number;
  primaryType: string;
  hours: HoursEntry[];
  lat: number;
  lng: number;
  googleMapsUri: string;
  businessStatus: string;
};

/** Raw output from the Michelin Guide scraper */
export type MichelinRaw = {
  source: "michelin";
  name: string;
  address: string;
  city: string;
  distinction: MichelinDistinction;
  cuisine: string;
  priceRange: string;
  url: string;
};

/** Raw output from the White Guide API */
export type WhiteGuideRaw = {
  source: "whiteguide";
  placeId: number;
  name: string;
  address: string;
  city: string;
  classification: WhiteGuideClassification;
  totalScore: number;
  foodScore: number;
  drinkScore: number;
  serviceScore: number;
  environmentScore: number;
  tags: string[];
  lat: number | null;
  lng: number | null;
  url: string;
};

/** Raw output from SvD Krogguiden scraper */
export type SvdRaw = {
  source: "svd";
  articleId: string;
  name: string;
  address: string;
  cuisine: string;
  rating: number; // 1-6 scale
  url: string;
  publishedAt: string;
};

/** Raw output from DN Krogkommissionen scraper (via Chrome MCP — paywall requires login) */
export type DnRaw = {
  source: "dn";
  slug: string;
  name: string | null;
  heading: string;
  url: string;
  publishedAt: string;
  score: number | null; // 0-5 scale (null for snabbtestet/list articles)
  address: string | null;
  priceClass: string | null; // "Budget" | "Mellan" | "Lyx"
  website: string | null;
  contact: string | null;
  hours: string | null;
};

/** Raw output from DI Weekend krogguide */
export type DiRaw = {
  source: "di";
  name: string;
  address: string;
  city: string;
  totalScore: number; // 15–24 (Mat + Miljö + Service, max 25)
  foodScore: number; // 9–15
  environmentScore: number; // 3–5
  serviceScore: number; // 2–5
  priceClass: string; // "Lågt" | "Medel" | "Högt" | "Mycket högt"
  url: string;
  publishedAt: string;
  lat: number | null;
  lng: number | null;
};

export type SourceRecord =
  | KrogguidenRaw
  | GoogleRaw
  | MichelinRaw
  | WhiteGuideRaw
  | SvdRaw
  | DnRaw
  | DiRaw;

// ─── Manual Data Types ────────────────────────────────────────────

/** Manually added restaurant (not in any scraped source) */
export type ManualAddition = {
  /** Unique ID for this manual entry */
  id: string;
  name: string;
  address?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  website?: string;
  priceRange?: string;
  cuisine?: string;
  lat?: number;
  lng?: number;
  /** Optional links to sources added later */
  links?: {
    krogguiden?: string;
    michelin?: string;
    whiteguide?: string;
    google?: string;
  };
};

/** Structure of data/manual.json */
export type ManualData = {
  /** New restaurants not in any scraped source */
  additions: ManualAddition[];
};
