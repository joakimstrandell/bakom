/**
 * Scraper-specific intermediate types.
 * Each source scraper produces its own raw format.
 * The merge step combines these into the final Restaurant type from src/types.ts.
 */

import type { HoursEntry, MichelinDistinction, WhiteGuideClassification } from "../src/types.js";

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

/** Raw output from the Google Places API scraper */
export type GoogleRaw = {
  source: "google";
  /** The original restaurant name used to search (for matching back) */
  searchName: string;
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number | null;
  ratingCount: number;
  priceLevel: string;
  hours: HoursEntry[];
  lat: number;
  lng: number;
  googleMapsUri: string;
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

/** Raw output from DN Krogkommissionen scraper */
export type DnRaw = {
  source: "dn";
  slug: string;
  name: string;
  url: string;
  publishedAt: string;
};

export type SourceRecord = KrogguidenRaw | GoogleRaw | MichelinRaw | WhiteGuideRaw | SvdRaw | DnRaw;

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

/** Merge instruction: combine two restaurant entries into one */
export type ManualMerge = {
  /** ID of the restaurant to keep (primary) */
  keep: string;
  /** ID of the restaurant to merge into the primary (will be removed) */
  merge: string;
  /** Optional: which fields to prefer from the merged entry */
  preferFields?: string[];
};

/** Override specific fields on an existing restaurant */
export type ManualOverride = {
  /** Restaurant ID to override */
  id: string;
  /** Fields to override (partial Restaurant) */
  fields: Record<string, unknown>;
};

/** Structure of data/manual.json */
export type ManualData = {
  /** New restaurants not in any scraped source */
  additions: ManualAddition[];
  /** Instructions to merge duplicate entries */
  merges: ManualMerge[];
  /** Field overrides for existing restaurants */
  overrides: ManualOverride[];
};
