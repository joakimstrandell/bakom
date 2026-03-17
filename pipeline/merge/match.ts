/** Fuzzy name/address matching for venue deduplication. @see docs/pipeline.md */

// ─── Levenshtein Distance ──────────────────────────────────────

/** Wagner-Fischer with O(min(m,n)) space. */
function levenshteinDistance(a: string, b: string): number {
  if (a.length > b.length) [a, b] = [b, a];
  const m = a.length;
  const n = b.length;

  let prev = new Array(m + 1).fill(0).map((_, i) => i);
  const curr = new Array(m + 1).fill(0);

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost);
    }
    [prev] = [[...curr]];
  }

  return prev[m];
}

/** Similarity 0-1 (1 = identical). */
export function similarityRatio(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a.length || !b.length) return 0.0;
  const d = levenshteinDistance(a, b);
  return 1 - d / Math.max(a.length, b.length);
}

// ─── Name Normalization ────────────────────────────────────────

const PREFIX_RE =
  /^(restaurang|restaurant|ristorante|trattoria|brasserie|bistro|café|cafe|hotell?|hotel)\s+/i;
const SUFFIX_RE =
  /\s+(restaurang|restaurant|bar|grill|kitchen|kök|& bar|& grill|& restaurang)$/i;

/** Normalize a venue name for matching — strip prefixes/suffixes, punctuation. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(PREFIX_RE, "")
    .replace(SUFFIX_RE, "")
    .replace(/[''´`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Address Matching ──────────────────────────────────────────

/** Normalize a street address for comparison. */
function normalizeAddr(address: string): string {
  return address
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .replace(/,\s*/g, " ")
    .replace(/\b(stockholm|göteborg|malmö|sweden|sverige)\b/gi, "")
    .trim();
}

function extractStreetComponents(address: string): {
  street: string;
  number: string;
} {
  const normalized = address
    .toLowerCase()
    .replace(/,.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(/^(.+?)\s+(\d+\s*[a-z]?)$/i);
  if (match) return { street: match[1].trim(), number: match[2].trim() };
  return { street: normalized, number: "" };
}

/** Address similarity 0-1. Street name weighted 70%, number 30%. */
function addressSimilarity(addr1: string, addr2: string): number {
  const c1 = extractStreetComponents(normalizeAddr(addr1));
  const c2 = extractStreetComponents(normalizeAddr(addr2));
  const streetSim = similarityRatio(c1.street, c2.street);
  const numberMatch = c1.number === c2.number ? 1.0 : 0.0;
  return streetSim * 0.7 + numberMatch * 0.3;
}

// ─── Match Result ──────────────────────────────────────────────

export type MatchResult = {
  venueIndex: number;
  nameSimilarity: number;
  addressSimilarity: number;
  combinedScore: number;
};

// ─── Venue Index (for matching) ────────────────────────────────

export type MatchCandidate = {
  index: number;
  normalizedName: string;
  address?: string;
  city?: string;
};

/**
 * Index of venues for fast matching.
 * Supports exact lookup by normalized name, then fuzzy fallback.
 */
export class VenueIndex {
  private byExactName = new Map<string, number[]>();
  private byCity = new Map<string, number[]>();
  private all: MatchCandidate[] = [];

  add(candidate: MatchCandidate): void {
    this.all.push(candidate);

    // Exact name index
    const existing = this.byExactName.get(candidate.normalizedName);
    if (existing) {
      existing.push(candidate.index);
    } else {
      this.byExactName.set(candidate.normalizedName, [candidate.index]);
    }

    // City index
    if (candidate.city) {
      const cityLower = candidate.city.toLowerCase();
      const cityList = this.byCity.get(cityLower);
      if (cityList) {
        cityList.push(candidate.index);
      } else {
        this.byCity.set(cityLower, [candidate.index]);
      }
    }
  }

  /** Try exact name match first. Returns indices. */
  findExact(normalizedName: string): number[] {
    return this.byExactName.get(normalizedName) ?? [];
  }

  /**
   * Find best fuzzy match.
   *
   * @param name - Normalized name to search for
   * @param address - Optional address for confirmation
   * @param city - Optional city to scope the search
   * @param nameThreshold - Minimum name similarity (default 0.85)
   */
  findFuzzy(
    name: string,
    address?: string,
    city?: string,
    nameThreshold = 0.85,
  ): MatchResult | null {
    // Scope candidates: if city provided, search same-city first
    let candidates = this.all;
    if (city) {
      const cityLower = city.toLowerCase();
      const cityIndices = this.byCity.get(cityLower);
      if (cityIndices && cityIndices.length > 0) {
        candidates = cityIndices.map((i) => this.all.find((c) => c.index === i)!);
      }
    }

    let best: MatchResult | null = null;

    for (const candidate of candidates) {
      const nameSim = similarityRatio(name, candidate.normalizedName);
      if (nameSim < nameThreshold) continue;

      let addrSim = 0;
      if (address && candidate.address) {
        addrSim = addressSimilarity(address, candidate.address);
      }

      // Combined: 80% name, 20% address
      const combined = nameSim * 0.8 + addrSim * 0.2;

      if (!best || combined > best.combinedScore) {
        best = {
          venueIndex: candidate.index,
          nameSimilarity: nameSim,
          addressSimilarity: addrSim,
          combinedScore: combined,
        };
      }
    }

    // If we scoped to city and found nothing, try all candidates
    if (!best && city) {
      return this.findFuzzy(name, address, undefined, nameThreshold);
    }

    return best;
  }

  get size(): number {
    return this.all.length;
  }
}

// ─── Slug Generation ───────────────────────────────────────────

const TRANSLITERATE_MAP: Record<string, string> = {
  å: "a", ä: "a", ö: "o", Å: "A", Ä: "A", Ö: "O",
  é: "e", è: "e", ê: "e", ë: "e", É: "E", È: "E", Ê: "E", Ë: "E",
  á: "a", à: "a", â: "a", ã: "a", Á: "A", À: "A", Â: "A", Ã: "A",
  í: "i", ì: "i", î: "i", ï: "i", Í: "I", Ì: "I", Î: "I", Ï: "I",
  ó: "o", ò: "o", ô: "o", õ: "o", Ó: "O", Ò: "O", Ô: "O", Õ: "O",
  ú: "u", ù: "u", û: "u", ü: "u", Ú: "U", Ù: "U", Û: "U", Ü: "U",
  ý: "y", ÿ: "y", Ý: "Y", ñ: "n", Ñ: "N", ç: "c", Ç: "C",
  ø: "o", Ø: "O", æ: "ae", Æ: "AE", ß: "ss",
};

function transliterate(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[^\x00-\x7F]/g, (c) => TRANSLITERATE_MAP[c] || c);
}

export function slugify(text: string): string {
  return transliterate(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate unique slugs for a list of name+city pairs.
 * First occurrence: "frantzen-stockholm". Subsequent: "frantzen-stockholm-2".
 */
export function generateUniqueSlug(
  name: string,
  city: string,
  usedSlugs: Set<string>,
): string {
  const base = slugify(`${name} ${city || "sweden"}`);
  let slug = base;
  let counter = 2;
  while (usedSlugs.has(slug)) {
    slug = `${base}-${counter}`;
    counter++;
  }
  usedSlugs.add(slug);
  return slug;
}
