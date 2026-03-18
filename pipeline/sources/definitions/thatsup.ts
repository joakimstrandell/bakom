import type { SourceDefinition } from "../../types.js";

export const thatsupSource: SourceDefinition = {
  id: "thatsup",
  name: "Thatsup",
  url: "https://thatsup.se",
  prestige: "enthusiast",
  collectionMethod: "scrape_json_ld",
  /** 0-5 star user ratings */
  ratingScale: { min: 0, max: 5 },
  subScores: null,
  contentTypes: ["listing"],
  coverage: "national",
  country: "se",
  enabled: true,
};
