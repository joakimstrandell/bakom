import type { SourceDefinition } from "../../types.js";

export const svdReviewSource: SourceDefinition = {
  id: "svd-review",
  name: "SvD Krogguiden",
  url: "https://www.svd.se/krogguiden",
  prestige: "professional",
  collectionMethod: "scrape_json_ld",
  ratingScale: { min: 1, max: 6 },
  subScores: null,
  contentTypes: ["review"],
  coverage: ["stockholm"],
  country: "se",
  enabled: true,
};
