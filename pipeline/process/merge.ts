/**
 * Merge step: combines raw data from Krogguiden, Michelin and White Guide
 * into a single unified restaurants.json consumed by the frontend.
 *
 * Preserves existing Google data and coordinates from a previous
 * restaurants.json if it exists — so re-running merge doesn't wipe
 * out enrichment from later pipeline steps.
 *
 * Google is NOT part of merge — it runs after as a refinement step.
 *
 * Output: data/restaurants.json (Restaurant[])
 *
 * CLI: tsx pipeline/process/merge.ts
 */

import { loadJson, loadRawJson, saveJson } from "../utils/fetch.js";
import { normalizeName, findRestaurantMatch } from "../utils/match.js";
import {
  calculateQualityMetrics,
  printQualityReport,
  validateRestaurant,
} from "../utils/validate.js";
import type { KrogguidenRaw, MichelinRaw, WhiteGuideRaw, SvdRaw, DnRaw, ThatsupRaw, ManualData, PipelineRestaurant } from "../types.js";
import { calculateBakomScore } from "../../src/lib/score.js";

/** Valid price ranges — anything outside this set is treated as empty */
const VALID_PRICES = new Set(["$", "$$", "$$$", "$$$$"]);

/** Sanitize a priceRange value — drop bogus values like $$$$$ */
function sanitizePrice(price: string | undefined | null): string {
  if (!price) return "";
  return VALID_PRICES.has(price) ? price : "";
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
 * Apply manual additions, merges, and overrides to the restaurant list.
 */
function applyManualData(
  restaurants: PipelineRestaurant[],
  manual: ManualData
): { added: number; merged: number; overridden: number } {
  const stats = { added: 0, merged: 0, overridden: 0 };
  const byId = new Map<string, PipelineRestaurant>();
  for (const r of restaurants) {
    byId.set(r.id, r);
  }

  // 1. Apply additions (new restaurants not in any source)
  for (const add of manual.additions) {
    if (byId.has(add.id)) {
      console.log(`  Manual: Skipping addition "${add.name}" (ID already exists)`);
      continue;
    }

    const restaurant: PipelineRestaurant = {
      id: add.id,
      name: add.name,
      slug: "",
      address: add.address ?? "",
      postalCode: add.postalCode ?? "",
      city: add.city ?? "Stockholm",
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
    stats.added++;
    console.log(`  Manual: Added "${add.name}"`);
  }

  // 2. Apply merges (combine two entries into one)
  for (const m of manual.merges) {
    const keep = byId.get(m.keep);
    const merge = byId.get(m.merge);

    if (!keep) {
      console.log(`  Manual: Merge failed - keep ID "${m.keep}" not found`);
      continue;
    }
    if (!merge) {
      console.log(`  Manual: Merge failed - merge ID "${m.merge}" not found`);
      continue;
    }

    // Merge sources
    for (const src of merge.sources) {
      if (!keep.sources.includes(src)) {
        keep.sources.push(src);
      }
    }

    // Merge sourceIds
    keep.sourceIds = { ...keep.sourceIds, ...merge.sourceIds };

    // Merge links
    keep.links = { ...keep.links, ...merge.links };

    // Merge ratings (prefer non-null from merged)
    if (merge.ratings.krogguiden && !keep.ratings.krogguiden) {
      keep.ratings.krogguiden = merge.ratings.krogguiden;
    }
    if (merge.ratings.google && !keep.ratings.google) {
      keep.ratings.google = merge.ratings.google;
    }
    if (merge.ratings.michelin && !keep.ratings.michelin) {
      keep.ratings.michelin = merge.ratings.michelin;
    }
    if (merge.ratings.whiteguide && !keep.ratings.whiteguide) {
      keep.ratings.whiteguide = merge.ratings.whiteguide;
    }

    // Optionally prefer specific fields from merged
    if (m.preferFields) {
      for (const field of m.preferFields) {
        if (field in merge && (merge as any)[field]) {
          (keep as any)[field] = (merge as any)[field];
        }
      }
    }

    // Remove the merged entry
    const idx = restaurants.findIndex((r) => r.id === m.merge);
    if (idx !== -1) {
      restaurants.splice(idx, 1);
      byId.delete(m.merge);
    }

    stats.merged++;
    console.log(`  Manual: Merged "${merge.name}" into "${keep.name}"`);
  }

  // 3. Apply overrides (update specific fields)
  for (const o of manual.overrides) {
    const restaurant = byId.get(o.id);
    if (!restaurant) {
      console.log(`  Manual: Override failed - ID "${o.id}" not found`);
      continue;
    }

    for (const [key, value] of Object.entries(o.fields)) {
      (restaurant as any)[key] = value;
    }

    stats.overridden++;
    console.log(`  Manual: Overrode ${Object.keys(o.fields).length} fields on "${restaurant.name}"`);
  }

  return stats;
}

/**
 * Generate a deterministic ID from name + address.
 */
function generateId(name: string, address: string): string {
  return `${name} ${address}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
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
      cuisine: kg.cuisine || (m?.cuisine ?? ""),
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
        cuisine: mich.cuisine,
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
        cuisine: w.tags.slice(0, 3).join(", "),
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
          console.log(`  Fuzzy: SvD "${s.name}" -> "${r.name}" (${(match.result.nameSimilarity * 100).toFixed(0)}%)`);
        }
      } else if (s.address) {
        // Create new restaurant from SvD review (has address)
        const id = generateId(s.name, s.address);
        const prev = existingById.get(id);

        const restaurant: PipelineRestaurant = {
          id,
          name: s.name,
          slug: "",
          address: s.address,
          postalCode: "",
          city: "Stockholm",
          region: "",
          phone: "",
          website: "",
          priceRange: "",
          cuisine: s.cuisine || "",
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
      const match = findRestaurantMatch(
        d.name,
        undefined,
        restaurantByName,
        (item) => item.address,
        0.85
      );

      if (match) {
        const r = match.item;
        r.ratings.dn = true; // DN has no numeric rating
        r.links.dn = d.url;
        r.sourceIds.dn = d.slug;
        if (!r.sources.includes("dn")) {
          r.sources.push("dn");
        }
        dnMatches++;
        if (match.result.nameSimilarity < 1.0) {
          console.log(`  Fuzzy: DN "${d.name}" -> "${r.name}" (${(match.result.nameSimilarity * 100).toFixed(0)}%)`);
        }
      }
    }
  }

  // Match Thatsup restaurants
  const thatsup = loadRawJson<ThatsupRaw[]>("thatsup.json");
  console.log(`  Thatsup: ${thatsup?.length ?? 0} restaurants`);

  let thatsupMatches = 0;
  let thatsupNew = 0;

  if (thatsup) {
    for (const t of thatsup) {
      const match = findRestaurantMatch(
        t.name,
        t.address,
        restaurantByName,
        (item) => item.address,
        0.85
      );

      if (match) {
        const r = match.item;
        r.ratings.thatsup = t.rating;
        r.thatsupRatingCount = t.reviewCount;
        r.links.thatsup = t.url;
        r.sourceIds.thatsup = t.slug;
        if (!r.sources.includes("thatsup")) {
          r.sources.push("thatsup");
        }
        // Enrich with Thatsup data if missing
        if (!r.lat && t.lat) r.lat = t.lat;
        if (!r.lng && t.lng) r.lng = t.lng;
        if (!r.phone && t.phone) r.phone = t.phone;
        if (!r.website && t.website) r.website = t.website;
        if (r.hours.length === 0 && t.hours.length > 0) r.hours = t.hours;

        thatsupMatches++;
        if (match.result.nameSimilarity < 1.0) {
          console.log(`  Fuzzy: Thatsup "${t.name}" -> "${r.name}" (${(match.result.nameSimilarity * 100).toFixed(0)}%)`);
        }
      } else if (t.address) {
        // Create new restaurant from Thatsup
        const id = generateId(t.name, t.address);
        const prev = existingById.get(id);

        const restaurant: PipelineRestaurant = {
          id,
          name: t.name,
          slug: "",
          address: t.address,
          postalCode: t.postalCode || "",
          city: t.city || "Stockholm",
          region: "",
          phone: t.phone || "",
          website: t.website || "",
          priceRange: sanitizePrice(t.priceRange),
          cuisine: t.cuisine.join(", "),
          image: "",
          hours: t.hours || [],
          lat: prev?.lat ?? t.lat,
          lng: prev?.lng ?? t.lng,
          ratings: {
            krogguiden: null,
            google: prev?.ratings.google ?? null,
            michelin: null,
            whiteguide: null,
            svd: null,
            dn: null,
            thatsup: t.rating,
          },
          links: {
            thatsup: t.url,
            google: prev?.links.google,
          },
          sourceIds: {
            thatsup: t.slug,
            google: prev?.sourceIds?.google ?? prev?.googlePlaceId,
          },
          sources: ["thatsup"],
          thatsupRatingCount: t.reviewCount,
        };

        if (prev?.googlePlaceId) {
          restaurant.googlePlaceId = prev.googlePlaceId;
          restaurant.googleRatingCount = prev.googleRatingCount;
          preserved++;
        }

        restaurants.push(restaurant);
        restaurantByName.set(normalizeName(t.name), restaurant);
        thatsupNew++;
        const ratingStr = t.rating ? `${t.rating}/5` : "no rating";
        console.log(`  Thatsup-only: "${t.name}" (${ratingStr})`);
      }
    }
  }

  // Apply manual data (additions, merges, overrides)
  const manual = loadManualData();
  let manualStats = { added: 0, merged: 0, overridden: 0 };
  if (manual) {
    const hasManual =
      manual.additions.length > 0 ||
      manual.merges.length > 0 ||
      manual.overrides.length > 0;

    if (hasManual) {
      console.log(`\nApplying manual data...`);
      manualStats = applyManualData(restaurants, manual);
    }
  }

  // Deduplicate by Google Place ID — same physical location = same restaurant
  {
    const byPlaceId = new Map<string, PipelineRestaurant[]>();
    for (const r of restaurants) {
      if (!r.googlePlaceId) continue;
      const group = byPlaceId.get(r.googlePlaceId);
      if (group) group.push(r);
      else byPlaceId.set(r.googlePlaceId, [r]);
    }

    const toRemove = new Set<string>();
    let deduped = 0;

    for (const [placeId, group] of byPlaceId) {
      if (group.length < 2) continue;

      // Pick primary: most sources, then most ratings, then longest name
      group.sort((a, b) => {
        const aSources = a.sources.length;
        const bSources = b.sources.length;
        if (aSources !== bSources) return bSources - aSources;
        const aRatings = Object.values(a.ratings).filter((v) => v != null).length;
        const bRatings = Object.values(b.ratings).filter((v) => v != null).length;
        if (aRatings !== bRatings) return bRatings - aRatings;
        return b.name.length - a.name.length;
      });

      const primary = group[0];
      const others = group.slice(1);

      for (const other of others) {
        // Merge ratings (keep non-null values)
        for (const [key, val] of Object.entries(other.ratings)) {
          if (val != null && (primary.ratings as Record<string, unknown>)[key] == null) {
            (primary.ratings as Record<string, unknown>)[key] = val;
          }
        }

        // Merge links
        for (const [key, val] of Object.entries(other.links)) {
          if (val && !(primary.links as Record<string, string | undefined>)[key]) {
            (primary.links as Record<string, string | undefined>)[key] = val;
          }
        }

        // Merge sourceIds
        for (const [key, val] of Object.entries(other.sourceIds)) {
          if (val != null && !(primary.sourceIds as Record<string, unknown>)[key]) {
            (primary.sourceIds as Record<string, unknown>)[key] = val;
          }
        }

        // Merge sources array
        for (const src of other.sources) {
          if (!primary.sources.includes(src)) {
            primary.sources.push(src);
          }
        }

        // Merge numeric fields
        if (!primary.googleRatingCount && other.googleRatingCount) {
          primary.googleRatingCount = other.googleRatingCount;
        }
        if (!primary.thatsupRatingCount && other.thatsupRatingCount) {
          primary.thatsupRatingCount = other.thatsupRatingCount;
        }

        // Fill missing basic fields from other
        if (!primary.phone && other.phone) primary.phone = other.phone;
        if (!primary.website && other.website) primary.website = other.website;
        if (!primary.cuisine && other.cuisine) primary.cuisine = other.cuisine;
        if (!primary.priceRange && other.priceRange) primary.priceRange = other.priceRange;
        if (primary.hours.length === 0 && other.hours.length > 0) primary.hours = other.hours;
        if (!primary.lat && other.lat) { primary.lat = other.lat; primary.lng = other.lng; }

        toRemove.add(other.id);
        deduped++;
      }
    }

    if (deduped > 0) {
      const before = restaurants.length;
      restaurants = restaurants.filter((r) => !toRemove.has(r.id));
      console.log(`\n  Dedup by Google Place ID: merged ${deduped} duplicates (${before} → ${restaurants.length})`);
    }
  }

  // Calculate Bakom Score for all restaurants
  for (const r of restaurants) {
    r.bakomScore = calculateBakomScore({
      ratings: r.ratings,
      googleRatingCount: r.googleRatingCount,
      thatsupRatingCount: r.thatsupRatingCount,
    });
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
    if (warnings.length > 10)
      console.log(`  ... and ${warnings.length - 10} more`);
  }

  // Save merged data
  saveJson("restaurants.json", restaurants);

  const withCoords = restaurants.filter((r) => r.lat && r.lng).length;
  const withHours = restaurants.filter((r) => r.hours.length > 0).length;
  const withMichelin = restaurants.filter((r) => r.ratings.michelin).length;
  const withWg = restaurants.filter((r) => r.ratings.whiteguide).length;

  const withSvd = restaurants.filter((r) => r.ratings.svd).length;
  const withDn = restaurants.filter((r) => r.ratings.dn).length;
  const withThatsup = restaurants.filter((r) => r.ratings.thatsup).length;

  console.log(`\nMerge complete: ${restaurants.length} restaurants`);
  console.log(`  Michelin matches: ${michelinMatches} (${fuzzyMatches} fuzzy)`);
  console.log(`  White Guide matches: ${wgMatches}`);
  console.log(`  SvD matches: ${svdMatches}`);
  console.log(`  DN matches: ${dnMatches}`);
  console.log(`  Thatsup matches: ${thatsupMatches}`);
  console.log(`  Thatsup-only: ${thatsupNew}`);
  console.log(`  Michelin-only: ${michelin ? michelin.length - michelinMatches : 0}`);
  console.log(`  White Guide-only: ${whiteguide ? whiteguide.length - wgMatches : 0}`);
  console.log(`  Preserved enrichment: ${preserved}`);
  if (skippedNoData > 0) {
    console.log(`  Skipped (no address): ${skippedNoData}`);
  }
  if (manualStats.added || manualStats.merged || manualStats.overridden) {
    console.log(`  Manual: ${manualStats.added} added, ${manualStats.merged} merged, ${manualStats.overridden} overridden`);
  }
  console.log(`  With coordinates: ${withCoords}`);
  console.log(`  With hours: ${withHours}`);
  console.log(`  With Michelin distinction: ${withMichelin}`);
  console.log(`  With White Guide classification: ${withWg}`);
  console.log(`  With SvD rating: ${withSvd}`);
  console.log(`  With DN review: ${withDn}`);
  console.log(`  With Thatsup rating: ${withThatsup}`);

  const withScore = restaurants.filter((r) => r.bakomScore != null);
  if (withScore.length > 0) {
    const scores = withScore.map((r) => r.bakomScore!);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    console.log(`  With Bakom Score: ${withScore.length} (avg ${avg.toFixed(1)}, max ${Math.max(...scores).toFixed(1)})`);
  }

  // Print quality report
  const metrics = calculateQualityMetrics(restaurants);
  printQualityReport(metrics, "Merged Restaurants");

  // Generate stripped frontend JSON (no pipeline-only fields, no empty values)
  generateFrontendJson(restaurants);

  return restaurants;
}

/**
 * Generate a stripped restaurants.frontend.json for the web app.
 * Removes pipeline-only fields (slug, image, sourceIds, sources, googlePlaceId)
 * and strips null/empty values to minimize bundle size.
 */
function generateFrontendJson(restaurants: PipelineRestaurant[]): void {
  const stripped = restaurants.map((r) => {
    const out: Record<string, unknown> = {};

    // Required fields (always present)
    out.id = r.id;
    out.name = r.name;
    out.lat = r.lat;
    out.lng = r.lng;

    // Optional string fields — omit if empty
    if (r.address) out.address = r.address;
    if (r.postalCode) out.postalCode = r.postalCode;
    if (r.city) out.city = r.city;
    if (r.region) out.region = r.region;
    if (r.phone) out.phone = r.phone;
    if (r.website) out.website = r.website;
    if (r.priceRange) out.priceRange = r.priceRange;
    if (r.cuisine) out.cuisine = r.cuisine;

    // Hours — omit if empty array
    if (r.hours && r.hours.length > 0) out.hours = r.hours;

    // Ratings — only include non-null values
    const ratings: Record<string, unknown> = {};
    if (r.ratings) {
      for (const [k, v] of Object.entries(r.ratings)) {
        if (v != null) ratings[k] = v;
      }
    }
    out.ratings = ratings;

    // Links — only include non-empty values
    const links: Record<string, unknown> = {};
    if (r.links) {
      for (const [k, v] of Object.entries(r.links)) {
        if (v) links[k] = v;
      }
    }
    out.links = links;

    // Numeric optional fields
    if (r.googleRatingCount) out.googleRatingCount = r.googleRatingCount;
    if (r.thatsupRatingCount) out.thatsupRatingCount = r.thatsupRatingCount;
    if (r.bakomScore != null) out.bakomScore = r.bakomScore;

    // Only include businessStatus if not operational (saves space)
    if (r.businessStatus && r.businessStatus !== "OPERATIONAL") {
      out.businessStatus = r.businessStatus;
    }

    return out;
  });

  saveJson("restaurants.frontend.json", stripped);

  const fullSize = JSON.stringify(restaurants).length;
  const strippedSize = JSON.stringify(stripped).length;
  console.log(
    `\nFrontend JSON: ${(strippedSize / 1024).toFixed(0)}KB ` +
    `(${((1 - strippedSize / fullSize) * 100).toFixed(0)}% smaller than full ${(fullSize / 1024).toFixed(0)}KB)`
  );
}

// ─── CLI entry point ─────────────────────────────────────────────

if (process.argv[1]?.includes("merge")) {
  merge().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
