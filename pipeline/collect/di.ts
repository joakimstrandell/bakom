/** DI Weekend krogguide scraper. @see docs/collect.md */

import { fetchWithRetry, saveRawJson } from "../utils/fetch.js";
import type { DiRaw } from "../types.js";

const API_URL = "https://www.di.se/pang-ms/widgets/RestaurantGuide/";

/**
 * Parse the DI API response (cols/rows format) into DiRaw objects.
 */
function parseResponse(data: { cols: string[]; rows: (string | null)[][] }): DiRaw[] {
  const { cols, rows } = data;

  // Build column index map
  const colIndex: Record<string, number> = {};
  cols.forEach((col, i) => {
    if (col) colIndex[col] = i;
  });

  const restaurants: DiRaw[] = [];

  for (const row of rows) {
    const name = row[colIndex["Restaurang"]]?.trim();
    const totalStr = row[colIndex["Totalpoäng"]];

    if (!name || !totalStr) continue;

    const totalScore = parseInt(totalStr, 10);
    if (isNaN(totalScore)) continue;

    const foodScore = parseInt(row[colIndex["Mat"]] ?? "", 10) || 0;
    const environmentScore = parseInt(row[colIndex["Miljö"]] ?? "", 10) || 0;
    const serviceScore = parseInt(row[colIndex["Service"]] ?? "", 10) || 0;

    // Parse coordinates: "59.329, 18.070" format
    let lat: number | null = null;
    let lng: number | null = null;
    const coordStr = row[colIndex["Kordinater"]];
    if (coordStr) {
      const parts = coordStr.split(",").map((s) => parseFloat(s.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        lat = parts[0];
        lng = parts[1];
      }
    }

    // Use retest article URL if available, otherwise original
    const url =
      row[colIndex["Länk test-artikel omtest"]] ||
      row[colIndex["Länk test-artikel"]] ||
      "";

    restaurants.push({
      source: "di",
      name,
      address: row[colIndex["Adress"]]?.trim() || "",
      city: row[colIndex["Ort"]]?.trim() || "",
      totalScore,
      foodScore,
      environmentScore,
      serviceScore,
      priceClass: row[colIndex["Prisklass"]]?.trim() || "",
      url,
      publishedAt: row[colIndex["Datum omtest"]] || row[colIndex["Datum"]] || "",
      lat,
      lng,
    });
  }

  return restaurants;
}

// ─── Main scraper function ───────────────────────────────────────

export async function scrapeDi(
  _options: { force?: boolean } = {},
): Promise<DiRaw[]> {
  console.log("=== DI Weekend Krogguide Scraper ===\n");

  const res = await fetchWithRetry(API_URL);
  const data = await res.json();

  if (!data?.cols || !data?.rows) {
    throw new Error("Unexpected API response format (missing cols/rows)");
  }

  const restaurants = parseResponse(data);

  // Stats
  const cities: Record<string, number> = {};
  for (const r of restaurants) {
    cities[r.city] = (cities[r.city] || 0) + 1;
  }

  console.log(`  Total: ${restaurants.length} restaurants`);
  console.log(`  Cities: ${Object.entries(cities).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (${n})`).join(", ")}`);

  const scores = restaurants.map((r) => r.totalScore);
  console.log(`  Score range: ${Math.min(...scores)}–${Math.max(...scores)} / 25`);

  saveRawJson("di.json", restaurants);
  console.log(`\nSaved ${restaurants.length} restaurants to data/raw/di.json`);

  return restaurants;
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("di")) {
  scrapeDi().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
