/**
 * Restaurant name and address normalization for cross-source matching.
 */

import {
  findBestMatch,
  type MatchCandidate,
  type MatchResult,
} from "./fuzzy.js";

export type { MatchResult };

/**
 * Normalize a restaurant name for matching across sources.
 * Strips common prefixes/suffixes and normalizes whitespace.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /^(restaurang|restaurant|ristorante|trattoria|brasserie|bistro|café|cafe)\s+/i,
      ""
    )
    .replace(
      /\s+(restaurang|restaurant|bar|grill|kitchen|kök|& bar|& grill)$/i,
      ""
    )
    .replace(/[''´`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "") // keep only letters, numbers, spaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalize a street address for matching.
 */
export function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .replace(/,\s*/g, " ")
    .replace(/\b(stockholm|sweden|sverige)\b/gi, "")
    .trim();
}

/**
 * Find a restaurant match using fuzzy matching with address proximity.
 * Deterministic: same input always produces same output.
 *
 * @param name - Restaurant name to match
 * @param address - Optional address for better matching
 * @param candidates - Map of normalized names to items
 * @param getAddress - Optional function to extract address from item
 * @param threshold - Minimum name similarity (default 0.85)
 * @returns Matched item or null
 */
export function findRestaurantMatch<T>(
  name: string,
  address: string | undefined,
  candidates: Map<string, T>,
  getAddress?: (item: T) => string | undefined,
  threshold = 0.85
): { item: T; result: MatchResult<T> } | null {
  const normalizedName = normalizeName(name);
  const normalizedAddr = address ? normalizeAddress(address) : undefined;

  // First try exact match (fast path)
  const exact = candidates.get(normalizedName);
  if (exact) {
    return {
      item: exact,
      result: {
        item: exact,
        nameSimilarity: 1.0,
        addressSimilarity: 1.0,
        combinedScore: 1.0,
      },
    };
  }

  // Build candidate list for fuzzy matching
  const candidateList: MatchCandidate<T>[] = [];
  for (const [normName, item] of candidates) {
    candidateList.push({
      item,
      normalizedName: normName,
      address: getAddress
        ? normalizeAddress(getAddress(item) ?? "")
        : undefined,
    });
  }

  // Find best fuzzy match
  const result = findBestMatch(
    normalizedName,
    normalizedAddr,
    candidateList,
    threshold
  );

  return result ? { item: result.item, result } : null;
}
