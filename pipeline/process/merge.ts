/** Merge step: combines raw data into unified restaurants.json. @see docs/merge.md */

import { loadJson, loadRawJson, saveJson } from "../utils/fetch.js";
import { normalizeName, findRestaurantMatch } from "../utils/match.js";
import {
  calculateQualityMetrics,
  printQualityReport,
  validateRestaurant,
} from "../utils/validate.js";
import { deduplicateByGooglePlaceId } from "../utils/dedup.js";
import type {
  KrogguidenRaw,
  MichelinRaw,
  WhiteGuideRaw,
  SvdRaw,
  DnRaw,
  DiRaw,
  ManualData,
  PipelineRestaurant,
} from "../types.js";

/** Valid price ranges — anything outside this set is treated as empty */
const VALID_PRICES = new Set(["$", "$$", "$$$", "$$$$"]);

/** Sanitize a priceRange value — drop bogus values like $$$$$ */
function sanitizePrice(price: string | undefined | null): string {
  if (!price) return "";
  return VALID_PRICES.has(price) ? price : "";
}

/** White Guide descriptor tags that should NOT be used as cuisine */
const WG_TAG_PATTERNS = [
  // Descriptor tags
  "stark personlighet",
  "se och synas",
  "wow",
  "fab",
  "excellent",
  "premium",
  "star",
  "premi",
  // Repeated tags (White Guide pollution)
  "stort dryckesfokus",
  "maffig miljö",
  "kvarterskrog",
  "naturnära",
  "nynordiskt",
  "nyöppnat",
  "sommarkrog",
  "säkert kort",
  "take away",
  "mat och kultur",
  "mest på sommaren",
  "fokus på fisk",
  "fokus på grönt",
  "fokus på kött",
  "äta ensam",
  "äta och handla",
  "talk of the town",
  "udda koncept",
  "tête à tête",
  "måndagsöppet",
  "söndagsöppet",
  "parkering",
  "parking",
  "uteservering",
  "vegetariska rätter",
  "öppet för lunch",
  "nyligen testat",
  "newly opened",
];

/** Sanitize cuisine — remove White Guide tag pollution */
function sanitizeCuisine(cuisine: string | undefined | null): string {
  if (!cuisine) return "";
  const lower = cuisine.toLowerCase();

  // If cuisine contains any WG tag pattern, it's polluted
  if (WG_TAG_PATTERNS.some((tag) => lower.includes(tag))) {
    return "";
  }

  // Detect repeated value pattern: "X, X" or "X, X, X" (White Guide tag pollution)
  const parts = cuisine.split(", ");
  if (parts.length >= 2 && parts[0] === parts[1]) {
    return "";
  }

  return cuisine;
}

/**
 * Check if a restaurant entry has enough data to be useful.
 * Rejects entries without an address (unless they have Google data
 * from a previous enrichment run that already resolved them).
 */
function hasMinimumData(name: string, address: string, googlePlaceId?: string): boolean {
  // Already Google-enriched — keep it
  if (googlePlaceId) return true;
  // Must have a non-empty address
  if (!address.trim()) return false;
  return true;
}

// ─── Manual Data Processing ──────────────────────────────────────

/**
 * Load manual data from data/manual.json
 */
function loadManualData(): ManualData | null {
  try {
    const data = loadJson<ManualData>("manual.json");
    return data;
  } catch {
    return null;
  }
}

/**
 * Apply manual additions to the restaurant list.
 */
function applyManualData(restaurants: PipelineRestaurant[], manual: ManualData): number {
  const byId = new Map<string, PipelineRestaurant>();
  for (const r of restaurants) {
    byId.set(r.id, r);
  }

  let added = 0;

  for (const add of manual.additions) {
    if (byId.has(add.id)) {
      console.log(`  Manual: Skipping "${add.name}" (ID already exists)`);
      continue;
    }

    const restaurant: PipelineRestaurant = {
      id: add.id,
      name: add.name,
      slug: "",
      address: add.address ?? "",
      postalCode: add.postalCode ?? "",
      city: add.city ?? "",
      region: "",
      phone: add.phone ?? "",
      website: add.website ?? "",
      priceRange: sanitizePrice(add.priceRange),
      cuisine: add.cuisine ?? "",
      image: "",
      hours: [],
      lat: add.lat ?? null,
      lng: add.lng ?? null,
      ratings: {
        krogguiden: null,
        google: null,
        michelin: null,
        whiteguide: null,
      },
      links: add.links ?? {},
      sourceIds: {},
      sources: ["manual"],
    };

    restaurants.push(restaurant);
    byId.set(add.id, restaurant);
    added++;
    console.log(`  Manual: Added "${add.name}"`);
  }

  return added;
}

/**
 * Transliterate Swedish/Nordic characters to ASCII.
 */
function transliterate(str: string): string {
  const map: Record<string, string> = {
    å: "a",
    ä: "a",
    ö: "o",
    Å: "A",
    Ä: "A",
    Ö: "O",
    é: "e",
    è: "e",
    ê: "e",
    ë: "e",
    É: "E",
    È: "E",
    Ê: "E",
    Ë: "E",
    á: "a",
    à: "a",
    â: "a",
    ã: "a",
    Á: "A",
    À: "A",
    Â: "A",
    Ã: "A",
    í: "i",
    ì: "i",
    î: "i",
    ï: "i",
    Í: "I",
    Ì: "I",
    Î: "I",
    Ï: "I",
    ó: "o",
    ò: "o",
    ô: "o",
    õ: "o",
    Ó: "O",
    Ò: "O",
    Ô: "O",
    Õ: "O",
    ú: "u",
    ù: "u",
    û: "u",
    ü: "u",
    Ú: "U",
    Ù: "U",
    Û: "U",
    Ü: "U",
    ý: "y",
    ÿ: "y",
    Ý: "Y",
    ñ: "n",
    Ñ: "N",
    ç: "c",
    Ç: "C",
    ø: "o",
    Ø: "O",
    æ: "ae",
    Æ: "AE",
    ß: "ss",
  };
  // eslint-disable-next-line no-control-regex
  return str.replace(/[^\x00-\x7F]/g, (char) => map[char] || char);
}

/**
 * Create a URL-safe slug from text.
 */
function slugify(text: string): string {
  return transliterate(text)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate a deterministic ID from name + address (for internal merge uniqueness).
 */
function generateId(name: string, address: string): string {
  return slugify(`${name} ${address}`);
}

/**
 * Generate clean URL slugs from name + city, with numbers for duplicates.
 */
function generateSlugs(restaurants: PipelineRestaurant[]): void {
  const slugCounts = new Map<string, number>();

  for (const r of restaurants) {
    const baseSlug = slugify(`${r.name} ${r.city}`);
    const count = slugCounts.get(baseSlug) || 0;
    slugCounts.set(baseSlug, count + 1);

    // First occurrence: no suffix. Subsequent: add -2, -3, etc.
    r.id = count === 0 ? baseSlug : `${baseSlug}-${count + 1}`;
  }
}

// ─── Main merge function ─────────────────────────────────────────

export async function merge(): Promise<PipelineRestaurant[]> {
  console.log("=== Merging Sources ===\n");

  const krogguiden = loadRawJson<KrogguidenRaw[]>("krogguiden.json");
  const michelin = loadRawJson<MichelinRaw[]>("michelin.json");
  const whiteguide = loadRawJson<WhiteGuideRaw[]>("whiteguide.json");

  if (!krogguiden) {
    throw new Error("data/raw/krogguiden.json not found. Run scrape:krogguiden first.");
  }

  // Load existing restaurants.json to preserve Google/geocode data
  const existing = loadJson<PipelineRestaurant[]>("restaurants.json") ?? [];
  const existingById = new Map<string, PipelineRestaurant>();
  for (const r of existing) {
    existingById.set(r.id, r);
  }
  if (existing.length > 0) {
    console.log(`  Existing restaurants.json: ${existing.length} (preserving enrichment data)`);
  }

  console.log(`  Krogguiden: ${krogguiden.length} restaurants`);
  console.log(`  Michelin: ${michelin?.length ?? 0} restaurants`);
  console.log(`  White Guide: ${whiteguide?.length ?? 0} restaurants`);

  // Build Michelin lookup by normalized name
  const michelinByName = new Map<string, MichelinRaw>();
  if (michelin) {
    for (const m of michelin) {
      michelinByName.set(normalizeName(m.name), m);
    }
  }

  // Build White Guide lookup by normalized name
  const wgByName = new Map<string, WhiteGuideRaw>();
  if (whiteguide) {
    for (const w of whiteguide) {
      wgByName.set(normalizeName(w.name), w);
    }
  }

  let restaurants: PipelineRestaurant[] = [];
  const matchedMichelinNames = new Set<string>();
  const matchedWgNames = new Set<string>();
  let michelinMatches = 0;
  let wgMatches = 0;
  let fuzzyMatches = 0;
  let preserved = 0;
  let skippedNoData = 0;

  // Process Krogguiden records as the base
  for (const kg of krogguiden) {
    const kgId = generateId(kg.name, kg.address);
    if (!hasMinimumData(kg.name, kg.address, existingById.get(kgId)?.googlePlaceId)) {
      skippedNoData++;
      continue;
    }
    // Use fuzzy matching with address proximity
    const michelinMatch = findRestaurantMatch(
      kg.name,
      kg.address,
      michelinByName,
      (item) => item.address,
      0.85
    );
    const wgMatch = findRestaurantMatch(
      kg.name,
      kg.address,
      wgByName,
      (item) => item.address,
      0.85
    );

    const m = michelinMatch?.item;
    const w = wgMatch?.item;

    // Log fuzzy matches (not exact)
    if (michelinMatch && michelinMatch.result.nameSimilarity < 1.0) {
      console.log(
        `  Fuzzy: "${kg.name}" -> Michelin "${m?.name}" (${(michelinMatch.result.nameSimilarity * 100).toFixed(0)}%)`
      );
      fuzzyMatches++;
    }
    if (wgMatch && wgMatch.result.nameSimilarity < 1.0) {
      console.log(
        `  Fuzzy: "${kg.name}" -> WG "${w?.name}" (${(wgMatch.result.nameSimilarity * 100).toFixed(0)}%)`
      );
      fuzzyMatches++;
    }

    if (michelinMatch) {
      michelinMatches++;
      matchedMichelinNames.add(normalizeName(michelinMatch.item.name));
    }
    if (wgMatch) {
      wgMatches++;
      matchedWgNames.add(normalizeName(wgMatch.item.name));
    }

    const id = generateId(kg.name, kg.address);
    const prev = existingById.get(id);

    const sources: string[] = ["krogguiden"];
    if (m) sources.push("michelin");
    if (w) sources.push("whiteguide");
    if (prev?.sources.includes("google")) sources.push("google");

    const restaurant: PipelineRestaurant = {
      id,
      name: kg.name,
      slug: kg.slug,
      address: prev?.googlePlaceId ? prev.address : kg.address,
      postalCode: kg.postalCode,
      city: kg.city,
      region: kg.region,
      phone: prev?.googlePlaceId ? prev.phone : kg.phone,
      website: prev?.googlePlaceId ? prev.website : kg.website,
      priceRange: sanitizePrice(kg.priceRange),
      cuisine: sanitizeCuisine(kg.cuisine) || sanitizeCuisine(m?.cuisine),
      image: kg.image,
      hours: prev?.googlePlaceId && prev.hours.length > 0 ? prev.hours : kg.hours,
      lat: prev?.lat ?? w?.lat ?? null,
      lng: prev?.lng ?? w?.lng ?? null,
      ratings: {
        krogguiden: kg.rating,
        google: prev?.ratings.google ?? null,
        michelin: m?.distinction ?? null,
        whiteguide: w?.classification ?? null,
      },
      links: {
        krogguiden: kg.url,
        michelin: m?.url,
        google: prev?.links.google,
        whiteguide: w?.url,
      },
      sourceIds: {
        krogguiden: kg.slug,
        michelin: m?.url,
        whiteguide: w?.placeId,
        google: prev?.sourceIds?.google ?? prev?.googlePlaceId,
      },
      sources,
    };

    // Preserve Google-specific fields
    if (prev?.googlePlaceId) {
      restaurant.googlePlaceId = prev.googlePlaceId;
      restaurant.googleRatingCount = prev.googleRatingCount;
      if (prev.businessStatus) restaurant.businessStatus = prev.businessStatus;
      preserved++;
    }

    restaurants.push(restaurant);
  }

  // Add Michelin-only restaurants (not in Krogguiden)
  if (michelin) {
    for (const mich of michelin) {
      const norm = normalizeName(mich.name);
      if (matchedMichelinNames.has(norm)) continue;

      const id = generateId(mich.name, mich.address);
      const prev = existingById.get(id);

      if (!hasMinimumData(mich.name, mich.address, prev?.googlePlaceId)) {
        skippedNoData++;
        continue;
      }

      // Fuzzy match against White Guide
      const wgMatch = findRestaurantMatch(
        mich.name,
        mich.address,
        wgByName,
        (item) => item.address,
        0.85
      );
      const w = wgMatch?.item;

      if (wgMatch) {
        wgMatches++;
        matchedWgNames.add(normalizeName(wgMatch.item.name));
        if (wgMatch.result.nameSimilarity < 1.0) {
          console.log(
            `  Fuzzy: Michelin "${mich.name}" -> WG "${w?.name}" (${(wgMatch.result.nameSimilarity * 100).toFixed(0)}%)`
          );
          fuzzyMatches++;
        }
      }

      const sources: string[] = ["michelin"];
      if (wgMatch) sources.push("whiteguide");
      if (prev?.sources.includes("google")) sources.push("google");

      const restaurant: PipelineRestaurant = {
        id,
        name: mich.name,
        slug: "",
        address: prev?.googlePlaceId ? prev.address : mich.address,
        postalCode: "",
        city: mich.city,
        region: "",
        phone: prev?.phone ?? "",
        website: prev?.website ?? "",
        priceRange: sanitizePrice(mich.priceRange),
        cuisine: sanitizeCuisine(mich.cuisine),
        image: "",
        hours: prev?.hours ?? [],
        lat: prev?.lat ?? w?.lat ?? null,
        lng: prev?.lng ?? w?.lng ?? null,
        ratings: {
          krogguiden: null,
          google: prev?.ratings.google ?? null,
          michelin: mich.distinction,
          whiteguide: w?.classification ?? null,
        },
        links: {
          michelin: mich.url,
          google: prev?.links.google,
          whiteguide: w?.url,
        },
        sourceIds: {
          michelin: mich.url,
          whiteguide: w?.placeId,
          google: prev?.sourceIds?.google ?? prev?.googlePlaceId,
        },
        sources,
      };

      if (prev?.googlePlaceId) {
        restaurant.googlePlaceId = prev.googlePlaceId;
        restaurant.googleRatingCount = prev.googleRatingCount;
        if (prev.businessStatus) restaurant.businessStatus = prev.businessStatus;
        preserved++;
      }

      restaurants.push(restaurant);
    }
  }

  // Add White Guide-only restaurants (not in Krogguiden or Michelin)
  if (whiteguide) {
    for (const w of whiteguide) {
      const norm = normalizeName(w.name);
      if (matchedWgNames.has(norm)) continue;

      const id = generateId(w.name, w.address);
      const prev = existingById.get(id);

      if (!hasMinimumData(w.name, w.address, prev?.googlePlaceId)) {
        skippedNoData++;
        continue;
      }

      const sources: string[] = ["whiteguide"];
      if (prev?.sources.includes("google")) sources.push("google");

      const restaurant: PipelineRestaurant = {
        id,
        name: w.name,
        slug: "",
        address: prev?.googlePlaceId ? prev.address : w.address,
        postalCode: "",
        city: w.city,
        region: "",
        phone: prev?.phone ?? "",
        website: prev?.website ?? "",
        priceRange: "",
        cuisine: sanitizeCuisine(prev?.cuisine),
        image: "",
        hours: prev?.hours ?? [],
        lat: prev?.lat ?? w.lat,
        lng: prev?.lng ?? w.lng,
        ratings: {
          krogguiden: null,
          google: prev?.ratings.google ?? null,
          michelin: null,
          whiteguide: w.classification,
        },
        links: {
          google: prev?.links.google,
          whiteguide: w.url,
        },
        sourceIds: {
          whiteguide: w.placeId,
          google: prev?.sourceIds?.google ?? prev?.googlePlaceId,
        },
        sources,
      };

      if (prev?.googlePlaceId) {
        restaurant.googlePlaceId = prev.googlePlaceId;
        restaurant.googleRatingCount = prev.googleRatingCount;
        if (prev.businessStatus) restaurant.businessStatus = prev.businessStatus;
        preserved++;
      }

      restaurants.push(restaurant);
    }
  }

  // Match SvD and DN reviews to existing restaurants
  const svd = loadRawJson<SvdRaw[]>("svd.json");
  const dn = loadRawJson<DnRaw[]>("dn.json");

  console.log(`  SvD: ${svd?.length ?? 0} reviews`);
  console.log(`  DN: ${dn?.length ?? 0} reviews`);

  // Build restaurant lookup for newspaper matching
  const restaurantByName = new Map<string, PipelineRestaurant>();
  for (const r of restaurants) {
    restaurantByName.set(normalizeName(r.name), r);
  }

  let svdMatches = 0;
  let dnMatches = 0;

  // Match SvD reviews
  if (svd) {
    for (const s of svd) {
      const match = findRestaurantMatch(
        s.name,
        s.address,
        restaurantByName,
        (item) => item.address,
        0.85
      );

      if (match) {
        const r = match.item;
        r.ratings.svd = s.rating;
        r.links.svd = s.url;
        r.sourceIds.svd = s.articleId;
        if (!r.sources.includes("svd")) {
          r.sources.push("svd");
        }
        svdMatches++;
        if (match.result.nameSimilarity < 1.0) {
          console.log(
            `  Fuzzy: SvD "${s.name}" -> "${r.name}" (${(match.result.nameSimilarity * 100).toFixed(0)}%)`
          );
        }
      } else if (s.address) {
        // Create new restaurant from SvD review (has address)
        const id = generateId(s.name, s.address);
        const prev = existingById.get(id);

        // Try to extract city from address (format: "Street, PostalCode City")
        const cityMatch = s.address.match(/\d{3}\s?\d{2}\s+(.+?)$/);
        const extractedCity = cityMatch?.[1]?.trim() || "";

        const restaurant: PipelineRestaurant = {
          id,
          name: s.name,
          slug: "",
          address: s.address,
          postalCode: "",
          city: extractedCity,
          region: "",
          phone: "",
          website: "",
          priceRange: "",
          cuisine: sanitizeCuisine(s.cuisine),
          image: "",
          hours: [],
          lat: prev?.lat ?? null,
          lng: prev?.lng ?? null,
          ratings: {
            krogguiden: null,
            google: prev?.ratings.google ?? null,
            michelin: null,
            whiteguide: null,
            svd: s.rating,
          },
          links: {
            svd: s.url,
            google: prev?.links.google,
          },
          sourceIds: {
            svd: s.articleId,
            google: prev?.sourceIds?.google ?? prev?.googlePlaceId,
          },
          sources: ["svd"],
        };

        if (prev?.googlePlaceId) {
          restaurant.googlePlaceId = prev.googlePlaceId;
          restaurant.googleRatingCount = prev.googleRatingCount;
          preserved++;
        }

        restaurants.push(restaurant);
        restaurantByName.set(normalizeName(s.name), restaurant);
        svdMatches++;
        console.log(`  SvD-only: "${s.name}" (${s.rating}/6)`);
      }
    }
  }

  // Match DN reviews (no address, can only match existing)
  if (dn) {
    for (const d of dn) {
      if (!d.name) continue;
      const match = findRestaurantMatch(
        d.name,
        d.address ?? undefined,
        restaurantByName,
        (item) => item.address,
        0.85
      );

      if (match) {
        const r = match.item;
        r.ratings.dn = d.score ?? null;
        r.links.dn = d.url;
        r.sourceIds.dn = d.slug;
        if (!r.sources.includes("dn")) {
          r.sources.push("dn");
        }
        dnMatches++;
        if (match.result.nameSimilarity < 1.0) {
          console.log(
            `  Fuzzy: DN "${d.name}" -> "${r.name}" (${(match.result.nameSimilarity * 100).toFixed(0)}%)`
          );
        }
      }
    }
  }

  // Match DI Weekend reviews
  const di = loadRawJson<DiRaw[]>("di.json");
  console.log(`  DI: ${di?.length ?? 0} reviews`);
  let diMatches = 0;

  if (di) {
    for (const d of di) {
      const match = findRestaurantMatch(
        d.name,
        d.address,
        restaurantByName,
        (item) => item.address,
        0.85
      );

      if (match) {
        const r = match.item;
        r.ratings.di = d.totalScore;
        r.links.di = d.url;
        r.sourceIds.di = normalizeName(d.name);
        if (!r.sources.includes("di")) {
          r.sources.push("di");
        }
        // Use DI coordinates as fallback if restaurant has none
        if (!r.lat && d.lat) {
          r.lat = d.lat;
          r.lng = d.lng;
        }
        diMatches++;
        if (match.result.nameSimilarity < 1.0) {
          console.log(
            `  Fuzzy: DI "${d.name}" -> "${r.name}" (${(match.result.nameSimilarity * 100).toFixed(0)}%)`
          );
        }
      } else if (d.address) {
        // Create new restaurant from DI review (has address + coords)
        const id = generateId(d.name, d.address);
        const prev = existingById.get(id);

        const restaurant: PipelineRestaurant = {
          id,
          name: d.name,
          slug: "",
          address: d.address,
          postalCode: "",
          city: d.city || "",
          region: "",
          phone: "",
          website: "",
          priceRange: "",
          cuisine: "",
          image: "",
          hours: [],
          lat: prev?.lat ?? d.lat,
          lng: prev?.lng ?? d.lng,
          ratings: {
            krogguiden: null,
            google: prev?.ratings.google ?? null,
            michelin: null,
            whiteguide: null,
            di: d.totalScore,
          },
          links: {
            di: d.url,
            google: prev?.links.google,
          },
          sourceIds: {
            di: normalizeName(d.name),
            google: prev?.sourceIds?.google ?? prev?.googlePlaceId,
          },
          sources: ["di"],
        };

        if (prev?.googlePlaceId) {
          restaurant.googlePlaceId = prev.googlePlaceId;
          restaurant.googleRatingCount = prev.googleRatingCount;
          preserved++;
        }

        restaurants.push(restaurant);
        restaurantByName.set(normalizeName(d.name), restaurant);
        diMatches++;
        console.log(`  DI-only: "${d.name}" (${d.totalScore}/25)`);
      }
    }
  }

  // Apply manual additions
  const manual = loadManualData();
  let manualAdded = 0;
  if (manual && manual.additions.length > 0) {
    console.log(`\nApplying manual additions...`);
    manualAdded = applyManualData(restaurants, manual);
  }

  // Deduplicate by Google Place ID — same physical location = same restaurant
  const dedupResult = deduplicateByGooglePlaceId(restaurants);
  if (dedupResult.removedCount > 0) {
    const before = restaurants.length;
    restaurants = dedupResult.restaurants;
    console.log(
      `\n  Dedup by Google Place ID: merged ${dedupResult.removedCount} duplicates (${before} → ${restaurants.length})`
    );
  }

  // Validate all restaurants
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const r of restaurants) {
    const result = validateRestaurant(r, "merged");
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  if (errors.length > 0) {
    console.log(`\nValidation Errors (${errors.length}):`);
    errors.slice(0, 10).forEach((e) => console.log(`  ${e}`));
    if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
  }

  if (warnings.length > 0) {
    console.log(`\nValidation Warnings (${warnings.length}):`);
    warnings.slice(0, 10).forEach((w) => console.log(`  ${w}`));
    if (warnings.length > 10) console.log(`  ... and ${warnings.length - 10} more`);
  }

  // Generate clean URL slugs (name + city, with numbers for duplicates)
  generateSlugs(restaurants);

  // Save merged data
  saveJson("restaurants.json", restaurants);

  const withCoords = restaurants.filter((r) => r.lat && r.lng).length;
  const withHours = restaurants.filter((r) => r.hours.length > 0).length;
  const withMichelin = restaurants.filter((r) => r.ratings.michelin).length;
  const withWg = restaurants.filter((r) => r.ratings.whiteguide).length;

  const withSvd = restaurants.filter((r) => r.ratings.svd).length;
  const withDn = restaurants.filter((r) => r.ratings.dn).length;
  const withDi = restaurants.filter((r) => r.ratings.di).length;

  console.log(`\nMerge complete: ${restaurants.length} restaurants`);
  console.log(`  Michelin matches: ${michelinMatches} (${fuzzyMatches} fuzzy)`);
  console.log(`  White Guide matches: ${wgMatches}`);
  console.log(`  SvD matches: ${svdMatches}`);
  console.log(`  DN matches: ${dnMatches}`);
  console.log(`  DI matches: ${diMatches}`);
  console.log(`  Michelin-only: ${michelin ? michelin.length - michelinMatches : 0}`);
  console.log(`  White Guide-only: ${whiteguide ? whiteguide.length - wgMatches : 0}`);
  console.log(`  Preserved enrichment: ${preserved}`);
  if (skippedNoData > 0) {
    console.log(`  Skipped (no address): ${skippedNoData}`);
  }
  if (manualAdded > 0) {
    console.log(`  Manual additions: ${manualAdded}`);
  }
  console.log(`  With coordinates: ${withCoords}`);
  console.log(`  With hours: ${withHours}`);
  console.log(`  With Michelin distinction: ${withMichelin}`);
  console.log(`  With White Guide classification: ${withWg}`);
  console.log(`  With SvD rating: ${withSvd}`);
  console.log(`  With DN review: ${withDn}`);
  console.log(`  With DI rating: ${withDi}`);

  // Print quality report
  const metrics = calculateQualityMetrics(restaurants);
  printQualityReport(metrics, "Merged Restaurants");

  return restaurants;
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("merge")) {
  merge().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
