import type { SourceDefinition } from "../../types.js";

export const diSource: SourceDefinition = {
  id: "di",
  name: "DI Weekend",
  url: "https://www.di.se/di-weekend/krogguiden/",
  prestige: "professional",
  collectionMethod: "api",
  /** 0-25 total score (Mat + Miljö + Service) */
  ratingScale: { min: 0, max: 25 },
  subScores: ["food", "ambiance", "service"],
  contentTypes: ["review"],
  coverage: "national",
  country: "se",
  enabled: true,
};
