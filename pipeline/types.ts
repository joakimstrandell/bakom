/** Pipeline types — article-centric data model. @see docs/pipeline.md */

// ─── Venue & Content Types ──────────────────────────────────────

export type VenueType = "restaurant" | "bar" | "cafe" | "hotel";

export type ContentType =
  | "review" // Single venue, scored (editorial article or guide entry)
  | "mentioned" // Single venue, no score (news about a venue, snabbtestet, etc.)
  | "news" // General industry news, editorial, opinion
  | "listing"; // Multi-venue article (lists, roundups, tips)

// ─── Source Definition ──────────────────────────────────────────

export type SourcePrestige = "prestige" | "professional" | "enthusiast";

export type CollectionMethod =
  | "scrape_html"
  | "scrape_json_ld"
  | "api"
  | "rss"
  | "browser"
  | "manual";

export type SourceDefinition = {
  id: string;
  name: string;
  url: string;
  prestige: SourcePrestige;
  collectionMethod: CollectionMethod;
  /** Rating scale if this source gives explicit ratings (null if no ratings) */
  ratingScale: { min: number; max: number } | null;
  /** Dimensional sub-scores this source provides explicitly */
  subScores: DimensionKey[] | null;
  /** Content types this source produces */
  contentTypes: ContentType[];
  /** Geographic coverage */
  coverage: "national" | string[];
  /** Country code */
  country: "se" | "no" | "dk" | "fi";
  enabled: boolean;
};

// ─── Dimensional Scores ─────────────────────────────────────────

export type DimensionKey = "food" | "service" | "ambiance" | "value" | "drinks";

/** Explicit sub-scores from a source, normalized to 0-10 */
export type DimensionalScores = Partial<Record<DimensionKey, number>>;

// ─── Sub-Article (venues within listing articles) ───────────────

export type SubArticle = {
  venueName: string;
  venueAddress?: string;
  venueCity?: string;
  score?: number;
  priceRange?: string;
  bodyText?: string;
};

// ─── Article ────────────────────────────────────────────────────

export type Article = {
  /** Unique ID (hash of sourceId + url) */
  id: string;
  sourceId: string;
  url: string;
  title: string;
  author?: string;
  publishedAt: string;
  contentType: ContentType;
  bodyText: string;

  // ── Venue info ──
  venueType?: VenueType;
  venueName: string;
  venueAddress?: string;
  venueCity?: string;

  // ── Ratings ──
  /** Explicit rating in the source's native scale (see SourceDefinition.ratingScale) */
  score?: number;
  /** Explicit dimensional sub-scores (already normalized to 0-10) */
  explicitSubScores?: DimensionalScores;

  // ── Sub-articles (for listings) ──
  subArticles?: SubArticle[];

  // ── Structured data ──
  cuisine?: string[];
  priceRange?: string;
  tags?: string[];
  lat?: number | null;
  lng?: number | null;

  // ── Crowd data ──
  /** Number of user reviews (Thatsup, Google, etc.) */
  reviewCount?: number;

  // ── Metadata ──
  collectedAt: string;
  enrichedAt?: string;
};
