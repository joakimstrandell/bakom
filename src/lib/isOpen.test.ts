import { describe, it, expect, vi, afterEach } from "vitest";
import { isOpen } from "./isOpen";
import type { HoursEntry } from "../types";

// Helper: create a Date for a specific weekday + time
// day: 0=Sun, 1=Mon, ..., 6=Sat
function fakeNow(day: number, hour: number, minute: number): Date {
  // Use a known base: 2025-01-06 is a Monday (day=1)
  // Monday=6, Tuesday=7, ..., Sunday=12
  const baseMonday = new Date(2025, 0, 6, hour, minute, 0, 0);
  const offset = (day - 1 + 7) % 7; // days from Monday
  baseMonday.setDate(6 + offset);
  return baseMonday;
}

function setTime(day: number, hour: number, minute: number) {
  vi.useFakeTimers();
  vi.setSystemTime(fakeNow(day, hour, minute));
}

afterEach(() => {
  vi.useRealTimers();
});

// ── Null / empty cases ──────────────────────────────────────────
describe("isOpen — null/empty handling", () => {
  it("returns null for undefined hours", () => {
    expect(isOpen(undefined as unknown as HoursEntry[])).toBeNull();
  });

  it("returns null for empty hours array", () => {
    expect(isOpen([])).toBeNull();
  });

  it("returns null for null hours", () => {
    expect(isOpen(null as unknown as HoursEntry[])).toBeNull();
  });
});

// ── Normal (same-day) hours ─────────────────────────────────────
describe("isOpen — normal hours", () => {
  const weekdayLunch: HoursEntry[] = [{ days: [1, 2, 3, 4, 5], open: "11:00", close: "14:00" }];

  it("returns true when within opening hours", () => {
    setTime(1, 12, 0); // Monday 12:00
    expect(isOpen(weekdayLunch)).toBe(true);
  });

  it("returns true at exact opening time", () => {
    setTime(2, 11, 0); // Tuesday 11:00
    expect(isOpen(weekdayLunch)).toBe(true);
  });

  it("returns false at exact closing time", () => {
    setTime(3, 14, 0); // Wednesday 14:00
    expect(isOpen(weekdayLunch)).toBe(false);
  });

  it("returns false before opening", () => {
    setTime(4, 10, 59); // Thursday 10:59
    expect(isOpen(weekdayLunch)).toBe(false);
  });

  it("returns false on a non-listed day", () => {
    setTime(0, 12, 0); // Sunday 12:00
    expect(isOpen(weekdayLunch)).toBe(false);
  });

  it("returns false on Saturday for weekday-only hours", () => {
    setTime(6, 12, 0); // Saturday 12:00
    expect(isOpen(weekdayLunch)).toBe(false);
  });
});

// ── Multiple time slots in one day ──────────────────────────────
describe("isOpen — multiple time slots", () => {
  const splitDay: HoursEntry[] = [
    { days: [1, 2, 3, 4, 5], open: "11:00", close: "14:00" },
    { days: [1, 2, 3, 4, 5], open: "17:00", close: "22:00" },
  ];

  it("returns true during lunch slot", () => {
    setTime(1, 12, 30);
    expect(isOpen(splitDay)).toBe(true);
  });

  it("returns true during dinner slot", () => {
    setTime(1, 19, 0);
    expect(isOpen(splitDay)).toBe(true);
  });

  it("returns false between slots", () => {
    setTime(1, 15, 0);
    expect(isOpen(splitDay)).toBe(false);
  });
});

// ── Overnight hours (e.g. bar 17:00–02:00) ──────────────────────
describe("isOpen — overnight hours", () => {
  const barHours: HoursEntry[] = [
    { days: [5, 6], open: "17:00", close: "02:00" }, // Fri-Sat evenings
  ];

  it("returns true during evening of opening day", () => {
    setTime(5, 23, 30); // Friday 23:30
    expect(isOpen(barHours)).toBe(true);
  });

  it("returns true at opening time", () => {
    setTime(6, 17, 0); // Saturday 17:00
    expect(isOpen(barHours)).toBe(true);
  });

  it("returns true after midnight (yesterday's carry-over)", () => {
    setTime(0, 1, 0); // Sunday 01:00 (Saturday's hours carry over)
    expect(isOpen(barHours)).toBe(true);
  });

  it("returns false after the overnight close", () => {
    setTime(0, 2, 30); // Sunday 02:30 (past Saturday's 02:00 close)
    expect(isOpen(barHours)).toBe(false);
  });

  it("returns false before opening on listed day", () => {
    setTime(5, 16, 0); // Friday 16:00
    expect(isOpen(barHours)).toBe(false);
  });

  it("returns false on non-listed overnight day", () => {
    setTime(4, 1, 0); // Thursday 01:00 (Wednesday not listed)
    expect(isOpen(barHours)).toBe(false);
  });
});

// ── Midnight edge cases ─────────────────────────────────────────
describe("isOpen — midnight edge cases", () => {
  it("handles close at exactly midnight (00:00 = next day)", () => {
    const hours: HoursEntry[] = [{ days: [1], open: "18:00", close: "00:00" }];
    // close=00:00 < open=18:00 → treated as overnight
    setTime(1, 23, 59); // Monday 23:59
    expect(isOpen(hours)).toBe(true);
  });

  it("handles open at midnight", () => {
    const hours: HoursEntry[] = [{ days: [6], open: "00:00", close: "06:00" }];
    setTime(6, 3, 0); // Saturday 03:00
    expect(isOpen(hours)).toBe(true);
  });
});

// ── Weekend-only restaurant ─────────────────────────────────────
describe("isOpen — weekend-only", () => {
  const weekend: HoursEntry[] = [{ days: [6, 0], open: "10:00", close: "16:00" }];

  it("open on Saturday", () => {
    setTime(6, 12, 0);
    expect(isOpen(weekend)).toBe(true);
  });

  it("open on Sunday", () => {
    setTime(0, 10, 0);
    expect(isOpen(weekend)).toBe(true);
  });

  it("closed on Wednesday", () => {
    setTime(3, 12, 0);
    expect(isOpen(weekend)).toBe(false);
  });
});

// ── Full-week restaurant ────────────────────────────────────────
describe("isOpen — full week coverage", () => {
  const allWeek: HoursEntry[] = [
    { days: [1, 2, 3, 4, 5], open: "11:00", close: "22:00" },
    { days: [6, 0], open: "12:00", close: "20:00" },
  ];

  it("weekday mid-day", () => {
    setTime(3, 15, 0); // Wednesday 15:00
    expect(isOpen(allWeek)).toBe(true);
  });

  it("weekend afternoon", () => {
    setTime(6, 15, 0); // Saturday 15:00
    expect(isOpen(allWeek)).toBe(true);
  });

  it("before weekend opening", () => {
    setTime(0, 11, 0); // Sunday 11:00
    expect(isOpen(allWeek)).toBe(false);
  });
});
