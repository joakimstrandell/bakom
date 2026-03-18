import type { Restaurant } from "../types";
import i18n from "../i18n";

const SITE_NAME = "Bakom";
const BASE_URL = "https://bakom.se";

type HeadConfig = {
  meta: Array<Record<string, string>>;
  links: Array<Record<string, string>>;
};

type VenueType = "restaurant" | "bar" | "fika" | "hotel";

const PREFIX_MAP: Record<VenueType, string> = {
  restaurant: "r",
  bar: "b",
  fika: "f",
  hotel: "h",
};

/** Generate SEO head config for the homepage */
export function homeHead(): HeadConfig {
  const t = i18n.t.bind(i18n);
  const title = SITE_NAME;
  const description = t("seo.home_description", {
    defaultValue: "Upptäck och jämför Sveriges bästa restauranger — betyg från Michelin, White Guide, Google och mer, samlade på ett ställe.",
  });

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: BASE_URL },
      { property: "og:site_name", content: SITE_NAME },
    ],
    links: [{ rel: "canonical", href: BASE_URL }],
  };
}

const LISTING_DEFAULTS: Record<string, { title: string; description: string }> = {
  bars: {
    title: "Barer",
    description: "Upptäck och jämför Sveriges bästa barer — betyg från Michelin, White Guide, Google och mer.",
  },
  fika: {
    title: "Fika",
    description: "Upptäck och jämför Sveriges bästa caféer, bagerier och konditorier — betyg samlade på ett ställe.",
  },
  hotels: {
    title: "Hotell",
    description: "Upptäck och jämför Sveriges bästa hotell — betyg från Michelin, White Guide och mer.",
  },
};

/** Generate SEO head config for a listing page (bars, fika, hotels) */
export function listingHead(type: "bars" | "fika" | "hotels"): HeadConfig {
  const defaults = LISTING_DEFAULTS[type];
  const title = `${defaults.title} | ${SITE_NAME}`;
  const description = defaults.description;

  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: SITE_NAME },
    ],
    // No canonical/og:url — listing routes are also layouts for /:id child routes
    links: [],
  };
}

/** Generate SEO head config for a venue detail page */
export function venueHead(venue: Restaurant | undefined, type: VenueType): HeadConfig {
  if (!venue) {
    return { meta: [{ title: SITE_NAME }], links: [] };
  }

  const prefix = PREFIX_MAP[type];
  const url = `${BASE_URL}/${prefix}/${venue.id}`;

  const title = `${venue.name} | ${SITE_NAME}`;

  // Build description from available data
  const parts: string[] = [];
  if (venue.cuisine) parts.push(venue.cuisine);
  if (venue.address && venue.city) parts.push(`${venue.address}, ${venue.city}`);
  else if (venue.city) parts.push(venue.city);
  if (venue.bakomScore != null) parts.push(`Bakom-poäng: ${venue.bakomScore}/100`);
  if (venue.bakomRank != null) parts.push(`#${venue.bakomRank} i Sverige`);

  const description = parts.join(" · ");

  const meta: Array<Record<string, string>> = [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: type === "restaurant" ? "restaurant" : "website" },
    { property: "og:url", content: url },
    { property: "og:site_name", content: SITE_NAME },
  ];

  return {
    meta,
    links: [{ rel: "canonical", href: url }],
  };
}
