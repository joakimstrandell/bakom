import type { SourceDefinition } from "../../types.js";

export const krogguidenSource: SourceDefinition = {
  id: "krogguiden",
  name: "Krogguiden.se",
  url: "https://www.krogguiden.se",
  prestige: "professional",
  collectionMethod: "scrape_html",
  /** 1-5 aggregate rating (often decimal, e.g. 3.8) */
  ratingScale: { min: 1, max: 5 },
  subScores: null,
  contentTypes: ["review"],
  coverage: ["Stockholm"],
  country: "se",
  enabled: true,
};
