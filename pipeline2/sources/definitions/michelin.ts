import type { SourceDefinition } from "../../types.js";

export const michelinSource: SourceDefinition = {
  id: "michelin",
  name: "Guide Michelin",
  url: "https://guide.michelin.com/se/en",
  prestige: "prestige",
  collectionMethod: "scrape_html",
  /** 0 = Selected, 0.5 = Bib Gourmand, 1-3 = Stars */
  ratingScale: { min: 0, max: 3 },
  subScores: null,
  contentTypes: ["review"],
  coverage: "national",
  country: "se",
  enabled: true,
};
