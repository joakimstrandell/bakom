/**
 * Fuzzy string matching utilities for cross-source restaurant matching.
 * Pure TypeScript implementation, no external dependencies.
 */

/**
 * Calculate Levenshtein distance between two strings.
 * Uses Wagner-Fischer algorithm with O(min(m,n)) space optimization.
 */
export function levenshteinDistance(a: string, b: string): number {
  // Ensure a is the shorter string for space optimization
  if (a.length > b.length) [a, b] = [b, a];

  const m = a.length;
  const n = b.length;

  // Single row optimization
  let prev = new Array(m + 1).fill(0).map((_, i) => i);
  let curr = new Array(m + 1).fill(0);

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1, // deletion
        curr[i - 1] + 1, // insertion
        prev[i - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[m];
}

/**
 * Calculate similarity ratio (0-1) between two strings.
 * 1.0 = identical, 0.0 = completely different
 */
export function similarityRatio(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const distance = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);

  return 1 - distance / maxLen;
}

/**
 * Extract street name and number from an address for comparison.
 */
export function extractStreetComponents(address: string): {
  street: string;
  number: string;
} {
  const normalized = address
    .toLowerCase()
    .replace(/,.*$/, "") // Remove city/country suffix
    .replace(/\s+/g, " ")
    .trim();

  // Match Swedish address pattern: "Streetname 123" or "Streetname 123A"
  const match = normalized.match(/^(.+?)\s+(\d+\s*[a-z]?)$/i);

  if (match) {
    return {
      street: match[1].trim(),
      number: match[2].trim(),
    };
  }

  return { street: normalized, number: "" };
}

/**
 * Calculate address similarity score (0-1).
 * Weighs street name match higher than street number.
 */
export function addressSimilarity(addr1: string, addr2: string): number {
  const c1 = extractStreetComponents(addr1);
  const c2 = extractStreetComponents(addr2);

  const streetSim = similarityRatio(c1.street, c2.street);
  const numberMatch = c1.number === c2.number ? 1.0 : 0.0;

  // Street name is more important (70%) than exact number (30%)
  return streetSim * 0.7 + numberMatch * 0.3;
}

export interface MatchCandidate<T> {
  item: T;
  normalizedName: string;
  address?: string;
}

export interface MatchResult<T> {
  item: T;
  nameSimilarity: number;
  addressSimilarity: number;
  combinedScore: number;
}

/**
 * Find the best matching candidate using fuzzy name matching
 * with address as a tiebreaker/confirmation.
 *
 * @param name - Normalized name to search for
 * @param address - Optional address for confirmation
 * @param candidates - Array of candidates to search
 * @param threshold - Minimum name similarity (default 0.85)
 * @returns Best match or null if none above threshold
 */
export function findBestMatch<T>(
  name: string,
  address: string | undefined,
  candidates: MatchCandidate<T>[],
  threshold = 0.85
): MatchResult<T> | null {
  let bestMatch: MatchResult<T> | null = null;

  for (const candidate of candidates) {
    const nameSim = similarityRatio(name, candidate.normalizedName);

    // Skip if name similarity below threshold
    if (nameSim < threshold) continue;

    // Calculate address similarity if both have addresses
    let addrSim = 0;
    if (address && candidate.address) {
      addrSim = addressSimilarity(address, candidate.address);
    }

    // Combined score: 80% name, 20% address
    const combined = nameSim * 0.8 + addrSim * 0.2;

    if (!bestMatch || combined > bestMatch.combinedScore) {
      bestMatch = {
        item: candidate.item,
        nameSimilarity: nameSim,
        addressSimilarity: addrSim,
        combinedScore: combined,
      };
    }
  }

  return bestMatch;
}
