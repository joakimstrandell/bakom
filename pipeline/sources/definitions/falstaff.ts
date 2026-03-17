import type { SourceDefinition } from "../../types.js";

export const falstaffSource: SourceDefinition = {
  id: "falstaff",
  name: "Falstaff",
  url: "https://www.falstaff.com",
  prestige: "professional",
  collectionMethod: "scrape_json_ld",
  /** 0-100 point scale */
  ratingScale: { min: 0, max: 100 },
  subScores: null,
  contentTypes: ["review"],
  coverage: "national",
  country: "se",
  enabled: true,
};
