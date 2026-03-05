/**
 * Region definitions for frontend filtering.
 * Must match metroRegion values from pipeline/process/optimize.ts
 */

// Metro regions assigned to each restaurant in the pipeline
export type MetroRegion = "stockholm" | "gothenburg" | "malmo" | "sweden";

// Filter options (includes "all" for showing everything)
export type RegionFilter = MetroRegion | "all";

export type RegionConfig = {
  id: RegionFilter;
  label: string;
  shortLabel: string;
  center: [number, number]; // [lat, lng]
  zoom: number;
};

export const REGIONS: RegionConfig[] = [
  { id: "all", label: "Sverige", shortLabel: "Sverige", center: [62.0, 15.0], zoom: 5 },
  { id: "stockholm", label: "Stockholm", shortLabel: "Sthlm", center: [59.33, 18.07], zoom: 12 },
  { id: "gothenburg", label: "Göteborg", shortLabel: "Gbg", center: [57.71, 11.97], zoom: 12 },
  { id: "malmo", label: "Malmö", shortLabel: "Malmö", center: [55.6, 13.0], zoom: 12 },
];

export const DEFAULT_REGION: RegionFilter = "all";

export function getRegionConfig(region: RegionFilter): RegionConfig {
  return REGIONS.find((r) => r.id === region) ?? REGIONS[0];
}

/** Get display label for a metro region */
export function getMetroRegionLabel(region: MetroRegion): string {
  switch (region) {
    case "stockholm":
      return "Stockholm";
    case "gothenburg":
      return "Göteborg";
    case "malmo":
      return "Malmö";
    case "sweden":
      return "Sverige";
  }
}
