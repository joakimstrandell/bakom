/** Venue — the unified record produced by the merge step.
 *
 * One Venue per physical place, with per-source ratings and links.
 */

import type { VenueType, DimensionalScores, ContentType } from "../types.js";

// ─── Source Reference ──────────────────────────────────────────

/** A reference from a venue back to a specific source article. */
export type SourceReference = {
  sourceId: string;
  url: string;
  /** Article IDs that mention this venue (review, listing sub-article, etc.) */
  articleIds: string[];
  contentType: ContentType;
  publishedAt?: string;
};

// ─── Per-Source Ratings ────────────────────────────────────────

export type MichelinRating = {
  distinction: string; // selected, bib_gourmand, 1_star, 2_star, 3_star, 1_key, 2_key, 3_key
  score: number; // 0-3 numeric mapping
};

export type WhiteguideRating = {
  classification?: string;
  venueType?: VenueType;
  subScores?: DimensionalScores;
};

export type NumericRating = {
  score: number;
  scale: [number, number]; // [min, max]
  subScores?: DimensionalScores;
  /** ISO date string of the review/article */
  publishedAt?: string;
  /** Number of user reviews (crowd-sourced sources) */
  reviewCount?: number;
};

export type VenueRatings = {
  michelin?: MichelinRating;
  whiteguide?: WhiteguideRating;
  svd?: NumericRating;
  dn?: NumericRating;
  di?: NumericRating;
  krogguiden?: NumericRating;
  falstaff?: NumericRating;
  thatsup?: NumericRating;
};

// ─── Quotes ───────────────────────────────────────────────────

/** An editorial quote/text from a specific source about a venue. */
export type VenueQuote = {
  sourceId: string;
  text: string;
  publishedAt?: string;
  url: string;
};

// ─── Venue ─────────────────────────────────────────────────────

export type Venue = {
  /** URL-safe slug: "frantzen-stockholm" */
  id: string;
  /** Best name across sources */
  name: string;
  /** Best street address */
  address: string;
  /** Normalized city */
  city: string;

  venueType: VenueType;

  lat: number | null;
  lng: number | null;

  priceRange: string; // budget | mellan | lyx | ""

  /** Per-source ratings in their native scales */
  ratings: VenueRatings;

  /** Per-source links and article references */
  sources: SourceReference[];

  /** How many distinct sources mention this venue */
  sourceCount: number;

  /** Editorial quotes/text from sources */
  quotes?: VenueQuote[];

  mergedAt: string;
};
