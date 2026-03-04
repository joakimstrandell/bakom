/**
 * Shared color utilities for Bakom Score visualization.
 * Used by Map markers, RestaurantDetail, and RestaurantList.
 */

/**
 * Multi-stop color gradient for Bakom Score 0–100.
 * Aligned with prestige tiers: red → orange → yellow → green
 * Each stop: [score, hue, saturation%, lightness%]
 *
 * Note: 100 is special-cased to gold in scoreColor()
 */
export const SCORE_COLOR_STOPS: [number, number, number, number][] = [
  //  score  hue   sat%  light%
  [0, 0, 70, 45], // Red — basic
  [50, 25, 85, 50], // Orange — good
  [70, 45, 85, 48], // Yellow-orange — very good
  [85, 75, 65, 42], // Yellow-green — excellent
  [94, 120, 55, 36], // Green — elite
  [100, 140, 50, 30], // Deep green — perfect (gradient endpoint)
];

/**
 * Interpolate a color from the score gradient.
 * @param score - Bakom Score (0-100)
 * @param lightnessOffset - Optional offset to make color darker/lighter
 */
export function interpolateScoreColor(
  score: number,
  lightnessOffset: number = 0
): string {
  const s = Math.max(0, Math.min(100, score));

  // Find the two stops we're between
  let i = 0;
  while (i < SCORE_COLOR_STOPS.length - 2 && SCORE_COLOR_STOPS[i + 1][0] < s)
    i++;

  const [s0, h0, sat0, l0] = SCORE_COLOR_STOPS[i];
  const [s1, h1, sat1, l1] = SCORE_COLOR_STOPS[i + 1];

  const t = s1 === s0 ? 0 : (s - s0) / (s1 - s0);
  const hue = Math.round(h0 + t * (h1 - h0));
  const sat = Math.round(sat0 + t * (sat1 - sat0));
  const light = Math.round(l0 + t * (l1 - l0)) + lightnessOffset;

  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/**
 * Get the fill color for a score.
 * Perfect 100 gets special gold color.
 */
export function scoreColor(score: number): string {
  if (score >= 100) {
    return "hsl(43, 80%, 50%)"; // Gold for perfection
  }
  return interpolateScoreColor(score, 0);
}

/**
 * Get the stroke color for a score (darker than fill).
 */
export function scoreStrokeColor(score: number): string {
  return interpolateScoreColor(score, -10);
}
