import type { HoursEntry } from "../types";

/**
 * Parse "HH:MM" to minutes since midnight.
 */
function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Check if a restaurant is currently open based on its hours entries.
 * Returns null if no hours data is available (unknown).
 */
export function isOpen(hours: HoursEntry[]): boolean | null {
  if (!hours || hours.length === 0) return null;

  const now = new Date();
  const currentDay = now.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const entry of hours) {
    if (!entry.days.includes(currentDay)) continue;

    const openMin = toMinutes(entry.open);
    const closeMin = toMinutes(entry.close);

    if (closeMin > openMin) {
      // Normal: e.g. 11:00–22:00
      if (currentMinutes >= openMin && currentMinutes < closeMin) {
        return true;
      }
    } else {
      // Overnight: e.g. 17:00–02:00
      // Open from openMin until midnight, or from midnight until closeMin
      if (currentMinutes >= openMin || currentMinutes < closeMin) {
        return true;
      }
    }
  }

  // Also check if we're in the "after midnight" part of yesterday's hours
  const yesterday = (currentDay + 6) % 7; // previous day
  for (const entry of hours) {
    if (!entry.days.includes(yesterday)) continue;

    const openMin = toMinutes(entry.open);
    const closeMin = toMinutes(entry.close);

    // Only applies to overnight hours
    if (closeMin <= openMin && currentMinutes < closeMin) {
      return true;
    }
  }

  return false;
}
