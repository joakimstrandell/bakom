/**
 * Shared opening hours parsing utilities.
 * Handles Krogguiden HTML format and Google Places API format.
 */

import * as cheerio from "cheerio";
import type { HoursEntry } from "../../src/types.js";

// Swedish day abbreviations → JS Date.getDay() values (0=Sunday)
const DAY_MAP: Record<string, number> = {
  sön: 0,
  mån: 1,
  tis: 2,
  ons: 3,
  tor: 4,
  fre: 5,
  lör: 6,
};

const DAY_ORDER = ["mån", "tis", "ons", "tor", "fre", "lör", "sön"];

/**
 * Expand a day range like "mån–fre" into [1,2,3,4,5]
 * or a single day like "sön" into [0]
 */
export function expandDayRange(text: string): number[] {
  const cleaned = text.toLowerCase().trim();

  // Single day
  if (DAY_MAP[cleaned] !== undefined) {
    return [DAY_MAP[cleaned]];
  }

  // Range: "mån–fre" or "mån-fre"
  const rangeMatch = cleaned.match(/^(\w+)\s*[–-]\s*(\w+)$/);
  if (rangeMatch) {
    const startDay = rangeMatch[1];
    const endDay = rangeMatch[2];
    const startIdx = DAY_ORDER.indexOf(startDay);
    const endIdx = DAY_ORDER.indexOf(endDay);

    if (startIdx === -1 || endIdx === -1) return [];

    const days: number[] = [];
    if (startIdx <= endIdx) {
      for (let i = startIdx; i <= endIdx; i++) {
        days.push(DAY_MAP[DAY_ORDER[i]]);
      }
    } else {
      // Wrapping range like "fre–mån"
      for (let i = startIdx; i < DAY_ORDER.length; i++) {
        days.push(DAY_MAP[DAY_ORDER[i]]);
      }
      for (let i = 0; i <= endIdx; i++) {
        days.push(DAY_MAP[DAY_ORDER[i]]);
      }
    }
    return days;
  }

  return [];
}

/**
 * Parse opening hours from Krogguiden HTML.
 * Looks for div.left (day names) + div.right (time ranges) pairs.
 */
export function parseHoursFromHtml(html: string): HoursEntry[] {
  const $ = cheerio.load(html);
  const entries: HoursEntry[] = [];

  const leftDivs = $("div.left");
  const rightDivs = $("div.right");

  const count = Math.min(leftDivs.length, rightDivs.length);

  for (let i = 0; i < count; i++) {
    const leftText = $(leftDivs[i]).text().trim();
    const rightText = $(rightDivs[i]).text().trim();

    if (!leftText || !rightText) continue;

    // Parse time "11:30 – 02:00" or "11:30 - 02:00"
    const timeMatch = rightText.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
    if (!timeMatch) continue;

    const days = expandDayRange(leftText);
    if (days.length === 0) continue;

    entries.push({
      days,
      open: timeMatch[1],
      close: timeMatch[2],
    });
  }

  // Deduplicate: Krogguiden HTML contains hours twice (desktop + mobile)
  return deduplicateHours(entries);
}

/**
 * Remove duplicate HoursEntry objects.
 * Krogguiden HTML renders hours twice (desktop + mobile views),
 * so parseHoursFromHtml picks up each entry twice.
 */
function deduplicateHours(entries: HoursEntry[]): HoursEntry[] {
  const seen = new Set<string>();
  const result: HoursEntry[] = [];
  for (const entry of entries) {
    const key = `${entry.days.join(",")}_${entry.open}_${entry.close}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(entry);
    }
  }
  return result;
}

/**
 * Parse opening hours from Google Places API regularOpeningHours format.
 * Google uses periods with { open: { day, hour, minute }, close: { day, hour, minute } }
 * where day 0=Sunday, same as JS getDay().
 */
export function parseGoogleHours(openingHours?: {
  periods?: Array<{
    open: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }>;
}): HoursEntry[] {
  if (!openingHours?.periods) return [];

  return openingHours.periods
    .filter((p) => p.close) // skip 24-hour markers without close
    .map((p) => ({
      days: [p.open.day],
      open: `${String(p.open.hour).padStart(2, "0")}:${String(p.open.minute).padStart(2, "0")}`,
      close: `${String(p.close!.hour).padStart(2, "0")}:${String(p.close!.minute).padStart(2, "0")}`,
    }));
}
