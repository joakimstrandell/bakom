/** Merge — combines articles from all sources into unified Venues. @see docs/pipeline.md */

import { loadArticles, saveData } from "../utils/save.js";
import type { Article, SubArticle, VenueType } from "../types.js";
import type {
  Venue,
  VenueRatings,
  SourceReference,
  MichelinRating,
  WhiteguideRating,
  NumericRating,
} from "./venue.js";
import {
  normalizeName,
  VenueIndex,
  generateUniqueSlug,
} from "./match.js";

// ─── Config ─────────────────────────────────────────────────────

const NAME_THRESHOLD = 0.85;
const NAME_THRESHOLD_NO_ADDR = 0.90; // Stricter when no address to confirm

// ─── Internal working venue ─────────────────────────────────────

type WorkingVenue = {
  name: string;
  address: string;
  city: string;
  venueType: VenueType;
  lat: number | null;
  lng: number | null;
  priceRange: string;
  ratings: VenueRatings;
  sources: SourceReference[];
  /** Track which source IDs contributed */
  sourceIds: Set<string>;
  /** Names seen across sources (for best-name picking) */
  namesBySource: Map<string, string>;
};

// ─── Helpers ────────────────────────────────────────────────────

function createEmptyVenue(
  name: string,
  address: string,
  city: string,
  venueType: VenueType,
): WorkingVenue {
  return {
    name,
    address,
    city,
    venueType,
    lat: null,
    lng: null,
    priceRange: "",
    ratings: {},
    sources: [],
    sourceIds: new Set(),
    namesBySource: new Map(),
  };
}

/** Pick the best name: prefer Michelin > White Guide > others. */
function pickBestName(namesBySource: Map<string, string>): string {
  const priority = ["michelin", "whiteguide-review", "dn-review", "svd-review", "di", "krogguiden"];
  for (const src of priority) {
    const name = namesBySource.get(src);
    if (name) return name;
  }
  // Fallback: first available
  for (const name of namesBySource.values()) {
    if (name) return name;
  }
  return "";
}

function addSource(
  venue: WorkingVenue,
  sourceId: string,
  article: { id: string; url: string; contentType: string; publishedAt?: string },
): void {
  venue.sourceIds.add(sourceId);
  // Find existing source reference or create new
  const existing = venue.sources.find((s) => s.sourceId === sourceId);
  if (existing) {
    if (!existing.articleIds.includes(article.id)) {
      existing.articleIds.push(article.id);
    }
  } else {
    venue.sources.push({
      sourceId,
      url: article.url,
      articleIds: [article.id],
      contentType: article.contentType as SourceReference["contentType"],
      publishedAt: article.publishedAt || undefined,
    });
  }
}

// ─── Source Processors ──────────────────────────────────────────

function processWhiteGuide(
  articles: Article[],
  venues: WorkingVenue[],
  index: VenueIndex,
): { matched: number; created: number } {
  let matched = 0;
  let created = 0;

  for (const a of articles) {
    if (!a.venueName) continue;

    const normalized = normalizeName(a.venueName);

    // Try exact match first
    const exactMatches = index.findExact(normalized);
    let venueIdx = exactMatches.length > 0 ? exactMatches[0] : -1;

    if (venueIdx === -1) {
      // Fuzzy match scoped to city
      const fuzzy = index.findFuzzy(
        normalized,
        a.venueAddress,
        a.venueCity,
        NAME_THRESHOLD,
      );
      if (fuzzy) venueIdx = fuzzy.venueIndex;
    }

    if (venueIdx >= 0) {
      // Merge into existing
      const venue = venues[venueIdx];
      matched++;
      // WG has best coords
      if (a.lat && a.lng && !venue.lat) {
        venue.lat = a.lat;
        venue.lng = a.lng;
      }
      // WG has best address/city
      if (a.venueAddress && !venue.address) venue.address = a.venueAddress;
      if (a.venueCity && !venue.city) venue.city = a.venueCity;
      if (a.venueType && venue.venueType === "restaurant") {
        venue.venueType = a.venueType;
      }
    } else {
      // Create new venue
      venueIdx = venues.length;
      const venue = createEmptyVenue(
        a.venueName,
        a.venueAddress || "",
        a.venueCity || "",
        a.venueType || "restaurant",
      );
      venue.lat = a.lat ?? null;
      venue.lng = a.lng ?? null;
      venues.push(venue);
      index.add({
        index: venueIdx,
        normalizedName: normalized,
        address: a.venueAddress,
        city: a.venueCity,
      });
      created++;
    }

    const venue = venues[venueIdx];
    venue.namesBySource.set("whiteguide-review", a.venueName);
    addSource(venue, "whiteguide-review", a);

    // WG rating (classification from tags)
    if (!venue.ratings.whiteguide) {
      const wgRating: WhiteguideRating = {
        venueType: a.venueType,
      };
      // WG tags contain classification
      if (a.tags && a.tags.length > 0) {
        wgRating.classification = a.tags[0];
      }
      if (a.explicitSubScores) {
        wgRating.subScores = a.explicitSubScores;
      }
      venue.ratings.whiteguide = wgRating;
    }

    if (a.priceRange && !venue.priceRange) venue.priceRange = a.priceRange;
  }

  return { matched, created };
}

function processSimpleSource(
  articles: Article[],
  sourceId: string,
  venues: WorkingVenue[],
  index: VenueIndex,
  ratingKey: keyof VenueRatings,
  ratingScale: [number, number],
  opts: { nameThreshold?: number } = {},
): { matched: number; created: number; fuzzy: number } {
  let matched = 0;
  let created = 0;
  let fuzzy = 0;
  const threshold = opts.nameThreshold ?? NAME_THRESHOLD;

  for (const a of articles) {
    if (!a.venueName) continue;
    if (a.contentType === "listing" || a.contentType === "news") continue;

    const normalized = normalizeName(a.venueName);

    // Try exact match
    const exactMatches = index.findExact(normalized);
    let venueIdx = -1;

    if (exactMatches.length > 0) {
      // If multiple exact matches, pick by city or address
      if (exactMatches.length === 1) {
        venueIdx = exactMatches[0];
      } else {
        // Pick best among exact matches
        const city = a.venueCity?.toLowerCase();
        for (const idx of exactMatches) {
          if (city && venues[idx].city.toLowerCase() === city) {
            venueIdx = idx;
            break;
          }
        }
        if (venueIdx === -1) venueIdx = exactMatches[0];
      }
    }

    if (venueIdx === -1) {
      const hasAddr = Boolean(a.venueAddress);
      const fuzzyThreshold = hasAddr ? threshold : Math.max(threshold, NAME_THRESHOLD_NO_ADDR);
      const result = index.findFuzzy(
        normalized,
        a.venueAddress,
        a.venueCity,
        fuzzyThreshold,
      );
      if (result) {
        venueIdx = result.venueIndex;
        if (result.nameSimilarity < 1.0) fuzzy++;
      }
    }

    if (venueIdx >= 0) {
      matched++;
    } else {
      // Create new venue
      if (!a.venueAddress && !a.venueCity) {
        // Skip entries with no address AND no city — too ambiguous to create
        continue;
      }
      venueIdx = venues.length;
      venues.push(
        createEmptyVenue(
          a.venueName,
          a.venueAddress || "",
          a.venueCity || "",
          a.venueType || "restaurant",
        ),
      );
      index.add({
        index: venueIdx,
        normalizedName: normalized,
        address: a.venueAddress,
        city: a.venueCity,
      });
      created++;
    }

    const venue = venues[venueIdx];
    venue.namesBySource.set(sourceId, a.venueName);
    addSource(venue, sourceId, a);

    // Set rating if not yet set for this source
    if (!venue.ratings[ratingKey] && a.score && a.score > 0) {
      const rating: NumericRating = {
        score: a.score,
        scale: ratingScale,
      };
      if (a.explicitSubScores) {
        rating.subScores = a.explicitSubScores;
      }
      if (a.publishedAt) {
        rating.publishedAt = a.publishedAt;
      }
      if (a.reviewCount) {
        rating.reviewCount = a.reviewCount;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (venue.ratings as any)[ratingKey] = rating;
    }

    // Fill in missing data
    if (a.lat && a.lng && !venue.lat) {
      venue.lat = a.lat;
      venue.lng = a.lng;
    }
    if (a.venueAddress && !venue.address) venue.address = a.venueAddress;
    if (a.venueCity && !venue.city) venue.city = a.venueCity;
    if (a.priceRange && !venue.priceRange) venue.priceRange = a.priceRange;
    if (a.venueType && venue.venueType === "restaurant" && a.venueType !== "restaurant") {
      venue.venueType = a.venueType;
    }
  }

  return { matched, created, fuzzy };
}

function processMichelin(
  articles: Article[],
  venues: WorkingVenue[],
  index: VenueIndex,
): { matched: number; created: number; fuzzy: number } {
  let matched = 0;
  let created = 0;
  let fuzzy = 0;

  for (const a of articles) {
    if (!a.venueName) continue;

    const normalized = normalizeName(a.venueName);

    const exactMatches = index.findExact(normalized);
    let venueIdx = -1;

    if (exactMatches.length > 0) {
      if (exactMatches.length === 1) {
        venueIdx = exactMatches[0];
      } else {
        const city = a.venueCity?.toLowerCase();
        for (const idx of exactMatches) {
          if (city && venues[idx].city.toLowerCase() === city) {
            venueIdx = idx;
            break;
          }
        }
        if (venueIdx === -1) venueIdx = exactMatches[0];
      }
    }

    if (venueIdx === -1) {
      const result = index.findFuzzy(
        normalized,
        a.venueAddress,
        a.venueCity,
        NAME_THRESHOLD,
      );
      if (result) {
        venueIdx = result.venueIndex;
        if (result.nameSimilarity < 1.0) fuzzy++;
      }
    }

    if (venueIdx >= 0) {
      matched++;
    } else {
      venueIdx = venues.length;
      venues.push(
        createEmptyVenue(
          a.venueName,
          a.venueAddress || "",
          a.venueCity || "",
          a.venueType || "restaurant",
        ),
      );
      index.add({
        index: venueIdx,
        normalizedName: normalized,
        address: a.venueAddress,
        city: a.venueCity,
      });
      created++;
    }

    const venue = venues[venueIdx];
    venue.namesBySource.set("michelin", a.venueName);
    addSource(venue, "michelin", a);

    // Michelin rating from tags
    if (!venue.ratings.michelin && a.tags && a.tags.length > 0) {
      const distinction = a.tags[0]; // e.g., "1_star", "bib_gourmand", "1_key"
      venue.ratings.michelin = {
        distinction,
        score: a.score ?? 0,
      } satisfies MichelinRating;
    }

    // Michelin hotels/restaurants have good data
    if (a.lat && a.lng && !venue.lat) {
      venue.lat = a.lat;
      venue.lng = a.lng;
    }
    if (a.venueAddress && !venue.address) venue.address = a.venueAddress;
    if (a.venueCity && !venue.city) venue.city = a.venueCity;
    if (a.priceRange && !venue.priceRange) venue.priceRange = a.priceRange;
    if (a.venueType === "hotel") venue.venueType = "hotel";
  }

  return { matched, created, fuzzy };
}

/** Process DN listing sub-articles as individual venue matches. */
function processDnSubArticles(
  articles: Article[],
  venues: WorkingVenue[],
  index: VenueIndex,
): { matched: number; created: number } {
  let matched = 0;
  let created = 0;

  for (const a of articles) {
    if (!a.subArticles || a.subArticles.length === 0) continue;

    for (const sub of a.subArticles) {
      if (!sub.venueName) continue;

      const normalized = normalizeName(sub.venueName);

      const exactMatches = index.findExact(normalized);
      let venueIdx = exactMatches.length > 0 ? exactMatches[0] : -1;

      if (venueIdx === -1) {
        const result = index.findFuzzy(
          normalized,
          sub.venueAddress,
          sub.venueCity || a.venueCity,
          NAME_THRESHOLD,
        );
        if (result) venueIdx = result.venueIndex;
      }

      if (venueIdx >= 0) {
        matched++;
      } else {
        if (!sub.venueAddress && !sub.venueCity && !a.venueCity) continue;
        venueIdx = venues.length;
        venues.push(
          createEmptyVenue(
            sub.venueName,
            sub.venueAddress || "",
            sub.venueCity || a.venueCity || "",
            "restaurant",
          ),
        );
        index.add({
          index: venueIdx,
          normalizedName: normalized,
          address: sub.venueAddress,
          city: sub.venueCity || a.venueCity,
        });
        created++;
      }

      const venue = venues[venueIdx];
      addSource(venue, "dn-review", a);

      // DN sub-article scores are also on 1-5 scale
      if (!venue.ratings.dn && sub.score && sub.score > 0) {
        venue.ratings.dn = {
          score: sub.score,
          scale: [1, 5],
          ...(a.publishedAt ? { publishedAt: a.publishedAt } : {}),
        };
      }
      if (sub.venueAddress && !venue.address) venue.address = sub.venueAddress;
      if (sub.venueCity && !venue.city) venue.city = sub.venueCity;
      if (sub.priceRange && !venue.priceRange) venue.priceRange = sub.priceRange;
    }
  }

  return { matched, created };
}

// ─── Main Merge ─────────────────────────────────────────────────

export async function mergeAll(): Promise<Venue[]> {
  console.log("=== Merge ===\n");

  // Load all article files
  const wgReviews = loadArticles<Article[]>("whiteguide-review.json") ?? [];
  const kgArticles = loadArticles<Article[]>("krogguiden.json") ?? [];
  const michelinArticles = loadArticles<Article[]>("michelin.json") ?? [];
  const diArticles = loadArticles<Article[]>("di.json") ?? [];
  const dnArticles = loadArticles<Article[]>("dn-review.json") ?? [];
  const svdArticles = loadArticles<Article[]>("svd-review.json") ?? [];
  const falstaffArticles = loadArticles<Article[]>("falstaff.json") ?? [];
  const thatsupArticles = loadArticles<Article[]>("thatsup.json") ?? [];

  console.log(`  Sources loaded:`);
  console.log(`    White Guide:  ${wgReviews.length} reviews`);
  console.log(`    Krogguiden:   ${kgArticles.length} articles`);
  console.log(`    Michelin:     ${michelinArticles.length} articles`);
  console.log(`    DI Weekend:   ${diArticles.length} articles`);
  console.log(`    DN:           ${dnArticles.length} articles`);
  console.log(`    SvD:          ${svdArticles.length} articles`);
  console.log(`    Falstaff:     ${falstaffArticles.length} articles`);
  console.log(`    Thatsup:      ${thatsupArticles.length} articles`);

  const venues: WorkingVenue[] = [];
  const index = new VenueIndex();

  // 1. White Guide as base — best structural data
  console.log("\n  [1/8] White Guide (base)...");
  const wgResult = processWhiteGuide(wgReviews, venues, index);
  console.log(`    Created ${wgResult.created} venues, matched ${wgResult.matched} to existing`);

  // 2. Krogguiden
  console.log("  [2/8] Krogguiden...");
  const kgResult = processSimpleSource(
    kgArticles, "krogguiden", venues, index, "krogguiden", [1, 5],
  );
  console.log(`    Matched ${kgResult.matched}, created ${kgResult.created}, fuzzy ${kgResult.fuzzy}`);

  // 3. Michelin
  console.log("  [3/8] Michelin...");
  const michResult = processMichelin(michelinArticles, venues, index);
  console.log(`    Matched ${michResult.matched}, created ${michResult.created}, fuzzy ${michResult.fuzzy}`);

  // 4. DI Weekend
  console.log("  [4/8] DI Weekend...");
  const diResult = processSimpleSource(
    diArticles, "di", venues, index, "di", [0, 25],
  );
  console.log(`    Matched ${diResult.matched}, created ${diResult.created}, fuzzy ${diResult.fuzzy}`);

  // 5. DN — reviews + sub-articles
  console.log("  [5/8] DN...");
  const dnResult = processSimpleSource(
    dnArticles, "dn-review", venues, index, "dn", [1, 5],
  );
  const dnSubResult = processDnSubArticles(dnArticles, venues, index);
  console.log(`    Reviews: matched ${dnResult.matched}, created ${dnResult.created}, fuzzy ${dnResult.fuzzy}`);
  console.log(`    Sub-articles: matched ${dnSubResult.matched}, created ${dnSubResult.created}`);

  // 6. SvD — no city data, stricter matching
  console.log("  [6/8] SvD...");
  const svdResult = processSimpleSource(
    svdArticles, "svd-review", venues, index, "svd", [1, 6],
    { nameThreshold: NAME_THRESHOLD_NO_ADDR },
  );
  console.log(`    Matched ${svdResult.matched}, created ${svdResult.created}, fuzzy ${svdResult.fuzzy}`);

  // 7. Falstaff — 0-100 point scale
  console.log("  [7/8] Falstaff...");
  const falstaffResult = processSimpleSource(
    falstaffArticles, "falstaff", venues, index, "falstaff", [0, 100],
  );
  console.log(`    Matched ${falstaffResult.matched}, created ${falstaffResult.created}, fuzzy ${falstaffResult.fuzzy}`);

  // 8. Thatsup — 0-5 star user ratings
  console.log("  [8/8] Thatsup...");
  const thatsupResult = processSimpleSource(
    thatsupArticles, "thatsup", venues, index, "thatsup", [0, 5],
  );
  console.log(`    Matched ${thatsupResult.matched}, created ${thatsupResult.created}, fuzzy ${thatsupResult.fuzzy}`);

  // ── Finalize venues ──

  console.log("\n  Finalizing...");

  const usedSlugs = new Set<string>();
  const now = new Date().toISOString();

  const finalVenues: Venue[] = venues.map((wv) => {
    const bestName = pickBestName(wv.namesBySource) || wv.name;

    return {
      id: generateUniqueSlug(bestName, wv.city, usedSlugs),
      name: bestName,
      address: wv.address,
      city: wv.city,
      venueType: wv.venueType,
      lat: wv.lat,
      lng: wv.lng,
      priceRange: wv.priceRange,
      ratings: wv.ratings,
      sources: wv.sources,
      sourceCount: wv.sourceIds.size,
      mergedAt: now,
    };
  });

  // ── Stats ──

  const bySourceCount = new Map<number, number>();
  const byCity = new Map<string, number>();
  const byType = new Map<string, number>();
  const withCoords = finalVenues.filter((v) => v.lat && v.lng).length;

  for (const v of finalVenues) {
    bySourceCount.set(v.sourceCount, (bySourceCount.get(v.sourceCount) ?? 0) + 1);
    const city = v.city || "(none)";
    byCity.set(city, (byCity.get(city) ?? 0) + 1);
    byType.set(v.venueType, (byType.get(v.venueType) ?? 0) + 1);
  }

  console.log(`\n  === Merge Results ===`);
  console.log(`  Total venues: ${finalVenues.length}`);
  console.log(`  With coordinates: ${withCoords}`);
  console.log(`\n  By source count:`);
  for (const [count, n] of [...bySourceCount.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    ${count} source${count > 1 ? "s" : ""}: ${n} venues`);
  }
  console.log(`\n  By type:`);
  for (const [type, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${n}`);
  }
  console.log(`\n  Top cities:`);
  for (const [city, n] of [...byCity.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`    ${city}: ${n}`);
  }

  // Rating coverage
  const ratingKeys: (keyof VenueRatings)[] = ["michelin", "whiteguide", "svd", "dn", "di", "krogguiden", "falstaff", "thatsup"];
  console.log(`\n  Rating coverage:`);
  for (const key of ratingKeys) {
    const count = finalVenues.filter((v) => v.ratings[key]).length;
    console.log(`    ${key}: ${count} venues`);
  }

  // Save
  saveData("venues-merged.json", finalVenues);

  return finalVenues;
}
