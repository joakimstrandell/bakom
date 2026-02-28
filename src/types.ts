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
};

export type SourceIds = {
  krogguiden?: string; // slug from krogguiden.se
  michelin?: string; // URL path from guide.michelin.com
  whiteguide?: number; // placeId from White Guide API
  google?: string; // placeId from Google Places API
};

export type SourceRatings = {
  krogguiden?: number | null;
  google?: number | null;
  michelin?: MichelinDistinction | null;
  whiteguide?: WhiteGuideClassification | null;
};

export type Restaurant = {
  id: string;
  name: string;
  slug: string;
  address: string;
  postalCode: string;
  city: string;
  region: string;
  phone: string;
  website: string;
  priceRange: string;
  cuisine: string;
  image: string;
  hours: HoursEntry[];
  lat: number | null;
  lng: number | null;
  ratings: SourceRatings;
  links: SourceLinks;
  sourceIds: SourceIds;
  sources: string[];
  googlePlaceId?: string;
  googleRatingCount?: number;
  bakomScore?: number | null;
};
