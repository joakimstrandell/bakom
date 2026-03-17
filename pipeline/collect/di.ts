/** DI Weekend krogguide collector. @see docs/pipeline.md */

import { createHash } from "crypto";
import { fetchWithRetry } from "../utils/fetch.js";
import { saveArticles } from "../utils/save.js";
import {
  normalizeVenueName,
  normalizeAddress,
  normalizeCity,
  normalizePriceRange,
} from "../utils/normalize.js";
import type { Article, DimensionalScores } from "../types.js";

// ─── Config ─────────────────────────────────────────────────────

const API_URL = "https://www.di.se/pang-ms/widgets/RestaurantGuide/";
const SOURCE_ID = "di";

// ─── Sub-score max values (for normalizing to 0-10) ─────────────

const MAX_FOOD = 15;
const MAX_ENVIRONMENT = 5;
const MAX_SERVICE = 5;

// ─── Parsing ────────────────────────────────────────────────────

interface DiEntry {
  name: string;
  address: string;
  city: string;
  totalScore: number;
  foodScore: number;
  environmentScore: number;
  serviceScore: number;
  priceClass: string;
  url: string;
  publishedAt: string;
  lat: number | null;
  lng: number | null;
}

/** Parse the DI API cols/rows format into structured entries. */
function parseResponse(data: {
  cols: string[];
  rows: (string | null)[][];
}): DiEntry[] {
  const { cols, rows } = data;

  // Build column index map
  const colIndex: Record<string, number> = {};
  cols.forEach((col, i) => {
    if (col) colIndex[col] = i;
  });

  const entries: DiEntry[] = [];

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

    // Prefer retest URL/date, fallback to original
    const url =
      row[colIndex["Länk test-artikel omtest"]] ||
      row[colIndex["Länk test-artikel"]] ||
      "";
    const publishedAt =
      row[colIndex["Datum omtest"]] || row[colIndex["Datum"]] || "";

    entries.push({
      name,
      address: row[colIndex["Adress"]]?.trim() || "",
      city: row[colIndex["Ort"]]?.trim() || "",
      totalScore,
      foodScore,
      environmentScore,
      serviceScore,
      priceClass: row[colIndex["Prisklass"]]?.trim() || "",
      url,
      publishedAt,
      lat,
      lng,
    });
  }

  return entries;
}

// ─── Convert to Article ────────────────────────────────────────

function makeId(url: string, name: string): string {
  const input = url || `${SOURCE_ID}:${name}`;
  return createHash("sha256")
    .update(`${SOURCE_ID}:${input}`)
    .digest("hex")
    .slice(0, 12);
}

/** Normalize sub-scores to 0-10 scale. */
function buildSubScores(entry: DiEntry): DimensionalScores {
  const scores: DimensionalScores = {};

  if (entry.foodScore > 0) {
    scores.food = Math.round((entry.foodScore / MAX_FOOD) * 10 * 10) / 10;
  }
  if (entry.environmentScore > 0) {
    scores.ambiance =
      Math.round((entry.environmentScore / MAX_ENVIRONMENT) * 10 * 10) / 10;
  }
  if (entry.serviceScore > 0) {
    scores.service =
      Math.round((entry.serviceScore / MAX_SERVICE) * 10 * 10) / 10;
  }

  return scores;
}

function entryToArticle(entry: DiEntry): Article {
  const subScores = buildSubScores(entry);

  return {
    id: makeId(entry.url, entry.name),
    sourceId: SOURCE_ID,
    url: entry.url,
    title: `DI Weekend: ${entry.name}`,
    publishedAt: entry.publishedAt,
    contentType: "review",
    bodyText: "",

    venueType: "restaurant",
    venueName: normalizeVenueName(entry.name),
    venueAddress: normalizeAddress(entry.address),
    venueCity: normalizeCity(entry.city),

    score: entry.totalScore,
    explicitSubScores:
      Object.keys(subScores).length > 0 ? subScores : undefined,

    priceRange: normalizePriceRange(entry.priceClass),
    lat: entry.lat,
    lng: entry.lng,

    collectedAt: new Date().toISOString(),
  };
}

// ─── Main collector ────────────────────────────────────────────

export async function collectDi(): Promise<Article[]> {
  console.log("=== DI Weekend ===\n");

  console.log("  Fetching API...");
  const res = await fetchWithRetry(API_URL);
  const data = await res.json();

  if (!data?.cols || !data?.rows) {
    throw new Error("Unexpected API response format (missing cols/rows)");
  }

  const entries = parseResponse(data);
  console.log(`  Parsed ${entries.length} restaurants`);

  // Convert to articles
  const articles = entries.map(entryToArticle);

  // Stats
  const cities: Record<string, number> = {};
  for (const a of articles) {
    const c = a.venueCity || "(none)";
    cities[c] = (cities[c] || 0) + 1;
  }

  const scores = entries.map((e) => e.totalScore);
  console.log(
    `  Score range: ${Math.min(...scores)}–${Math.max(...scores)} / 25`,
  );
  console.log(
    `  Cities: ${Object.entries(cities)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => `${c} (${n})`)
      .join(", ")}`,
  );

  // Price breakdown
  const prices: Record<string, number> = {};
  for (const a of articles) {
    const p = a.priceRange || "(none)";
    prices[p] = (prices[p] || 0) + 1;
  }
  console.log(
    `  Prices: ${Object.entries(prices)
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => `${p} (${n})`)
      .join(", ")}`,
  );

  saveArticles("di.json", articles);

  return articles;
}
