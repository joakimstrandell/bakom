/**
 * Region definitions for frontend data loading.
 * Must match the regions defined in pipeline/process/optimize.ts
 */

export type Region = "stockholm" | "gothenburg" | "malmo" | "sweden";

export type RegionConfig = {
  id: Region;
  label: string;
  shortLabel: string;
  center: [number, number]; // [lat, lng]
  zoom: number;
};

export const REGIONS: RegionConfig[] = [
  { id: "stockholm", label: "Stockholm", shortLabel: "Sthlm", center: [59.33, 18.07], zoom: 12 },
  { id: "gothenburg", label: "Göteborg", shortLabel: "Gbg", center: [57.71, 11.97], zoom: 12 },
  { id: "malmo", label: "Malmö", shortLabel: "Malmö", center: [55.60, 13.00], zoom: 12 },
  { id: "sweden", label: "Övriga Sverige", shortLabel: "Sverige", center: [62.5, 17.5], zoom: 5 },
];

export const DEFAULT_REGION: Region = "stockholm";

export function getRegionConfig(region: Region): RegionConfig {
  return REGIONS.find((r) => r.id === region) ?? REGIONS[0];
}

/**
 * Get the data file path for a region.
 */
export function getRegionDataPath(region: Region): string {
  return `/data/restaurants.${region}.frontend.json`;
}
