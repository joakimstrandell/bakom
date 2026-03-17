import type { SourceDefinition } from "../../types.js";

export const dnReviewSource: SourceDefinition = {
  id: "dn-review",
  name: "DN Krogkommissionen",
  url: "https://www.dn.se/kultur/krogkommissionen/",
  prestige: "professional",
  collectionMethod: "browser",
  ratingScale: { min: 0, max: 5 },
  subScores: [],
  contentTypes: ["review", "mentioned", "listing"],
  coverage: ["stockholm"],
  country: "se",
  enabled: true,
};

export const dnNewsSource: SourceDefinition = {
  id: "dn-news",
  name: "DN Restaurangnyheter",
  url: "https://www.dn.se",
  prestige: "professional",
  collectionMethod: "browser",
  ratingScale: null,
  subScores: null,
  contentTypes: ["news"],
  coverage: "national",
  country: "se",
  enabled: false, // Enable when we have a news discovery strategy
};
