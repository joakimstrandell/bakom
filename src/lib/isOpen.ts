import type { HoursEntry } from "../types";

/**
 * Parse "HH:MM" to minutes since midnight.
 */
function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Meal time boundaries (in minutes from midnight)
const BREAKFAST_END = 10 * 60; // 10:00 - must open by this time
const LUNCH_START = 11 * 60; // 11:00
const LUNCH_END = 14 * 60; // 14:00
const DINNER_START = 17 * 60; // 17:00

export type MealType = "breakfast" | "lunch" | "dinner";

/**
 * Check if an hours entry overlaps with a time range.
 */
function overlapsTimeRange(entry: HoursEntry, rangeStart: number, rangeEnd: number): boolean {
  const openMin = toMinutes(entry.open);
  const closeMin = toMinutes(entry.close);

  // Handle overnight hours (e.g., 17:00-02:00)
  if (closeMin <= openMin) {
    // Opens before midnight - check if overlaps with range
    return openMin < rangeEnd || closeMin > rangeStart;
  }

  // Normal hours - check overlap
  return openMin < rangeEnd && closeMin > rangeStart;
}

/**
 * Check if restaurant serves a specific meal type on any day.
 */
export function servesMeal(hours: HoursEntry[], meal: MealType): boolean {
  if (!hours || hours.length === 0) return false;

  for (const entry of hours) {
    const openMin = toMinutes(entry.open);
    const closeMin = toMinutes(entry.close);

    switch (meal) {
      case "breakfast":
        // Opens at or before 10:00
        if (openMin <= BREAKFAST_END) return true;
        break;
      case "lunch":
        // Is open during 11:00-14:00 window
        if (overlapsTimeRange(entry, LUNCH_START, LUNCH_END)) return true;
        break;
      case "dinner":
        // Is open during/after 17:00
        if (closeMin <= openMin) {
          // Overnight - always serves dinner
          return true;
        }
        if (closeMin > DINNER_START) return true;
        break;
    }
  }

  return false;
}

/**
 * Check if restaurant is open on a specific day (0=Sunday, 6=Saturday).
 */
export function isOpenOnDay(hours: HoursEntry[], day: number): boolean {
  if (!hours || hours.length === 0) return false;
  return hours.some((entry) => entry.days.includes(day));
}

/**
 * Check if restaurant opens today.
 */
export function opensToday(hours: HoursEntry[]): boolean {
  const today = new Date().getDay();
  return isOpenOnDay(hours, today);
}

/**
 * Get the next opening time for a restaurant.
 * Returns { day: number, time: string } or null if no hours data.
 */
export function getNextOpenTime(hours: HoursEntry[]): { day: number; time: string } | null {
  if (!hours || hours.length === 0) return null;

  const now = new Date();
  const currentDay = now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Check next 7 days
  for (let offset = 0; offset < 7; offset++) {
    const checkDay = (currentDay + offset) % 7;

    for (const entry of hours) {
      if (!entry.days.includes(checkDay)) continue;

      const openMin = toMinutes(entry.open);

      // If today, only consider times after now
      if (offset === 0 && openMin <= currentMinutes) continue;

      return { day: checkDay, time: entry.open };
    }
  }

  return null;
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
