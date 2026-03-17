import type { SourceDefinition } from "../../types.js";

export const whiteguideReviewSource: SourceDefinition = {
  id: "whiteguide-review",
  name: "White Guide",
  url: "https://whiteguide.com",
  prestige: "prestige",
  collectionMethod: "api",
  ratingScale: null, // Uses classification levels, not numeric ratings
  subScores: ["food", "service", "ambiance", "drinks"],
  contentTypes: ["review"],
  coverage: "national",
  country: "se",
  enabled: true,
};

export const whiteguideNewsSource: SourceDefinition = {
  id: "whiteguide-news",
  name: "White Guide Nyheter",
  url: "https://whiteguide.com/se/sv/news",
  prestige: "prestige",
  collectionMethod: "scrape_html",
  ratingScale: null,
  subScores: [],
  contentTypes: ["news"],
  coverage: "national",
  country: "se",
  enabled: true,
};
