export type HoursEntry = {
  days: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday (JS getDay())
  open: string; // "HH:MM"
  close: string; // "HH:MM"
};

export type MichelinDistinction =
  | "selected"
  | "bib_gourmand"
  | "1_star"
  | "2_star"
  | "3_star";

export type WhiteGuideClassification =
  | "recommended"
  | "good_class"
  | "very_good_class"
  | "master_class"
  | "global_master_class";

export type SourceLinks = {
  krogguiden?: string;
  michelin?: string;
  google?: string;
  whiteguide?: string;
  svd?: string;
  dn?: string;
  di?: string;
};

export type SourceIds = {
  krogguiden?: string; // slug from krogguiden.se
  michelin?: string; // URL path from guide.michelin.com
  whiteguide?: number; // placeId from White Guide API
  google?: string; // placeId from Google Places API
  svd?: string; // article ID from svd.se
  dn?: string; // article slug from dn.se
  di?: string; // name slug from DI Weekend
};

export type SourceRatings = {
  krogguiden?: number | null;
  google?: number | null;
  michelin?: MichelinDistinction | null;
  whiteguide?: WhiteGuideClassification | null;
  svd?: number | null; // 1-6 scale
  dn?: boolean | null; // true = reviewed (no numeric rating)
  di?: number | null; // 15-25 scale (totalScore)
};

export type Restaurant = {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  region: string;
  phone: string;
  website: string;
  priceRange: string;
  cuisine: string;
  hours: HoursEntry[];
  lat: number | null;
  lng: number | null;
  ratings: SourceRatings;
  links: SourceLinks;
  googleRatingCount?: number;
  bakomScore?: number | null; // 0–100 (integer for display)
  bakomScoreRaw?: number | null; // 0–100 (decimal for ranking)
  bakomRank?: number | null; // 1-based rank among scored restaurants
  /** Google business status: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" */
  businessStatus?: string;
  // ── Pipeline-only fields (not in frontend JSON) ──
  slug?: string;
  image?: string;
  sourceIds?: SourceIds;
  sources?: string[];
  googlePlaceId?: string;
};
