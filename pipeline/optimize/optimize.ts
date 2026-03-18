/** Optimize — shape scored venues into frontend-ready JSON. @see docs/pipeline.md */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { loadData, saveOptimized } from "../utils/save.js";
import type { ScoredVenue } from "../score/score.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Frontend output type ───────────────────────────────────────

type FrontendHoursEntry = {
  days: number[];
  open: string;
  close: string;
};

type FrontendVenue = {
  id: string;
  name: string;
  address: string;
  city: string;
  priceRange?: string;
  cuisine?: string;
  hours?: FrontendHoursEntry[];
  website?: string;
  phone?: string;
  lat: number | null;
  lng: number | null;
  ratings: {
    krogguiden?: number | null;
    google?: number | null;
    michelin?: string | null;
    whiteguide?: string | null;
    svd?: number | null;
    dn?: number | null;
    di?: number | null;
    falstaff?: number | null;
    thatsup?: number | null;
  };
  thatsupReviewCount?: number;
  links: Record<string, string>;
  googleRatingCount?: number;
  bakomScore: number;
  bakomScoreRaw: number;
  bakomRank: number;
  bakomRankRegion?: number | null;
  metroRegion: string;
};

// ─── Google primaryType → cuisine label ─────────────────────────

const CUISINE_MAP: Record<string, string> = {
  italian_restaurant: "Italienskt",
  french_restaurant: "Franskt",
  japanese_restaurant: "Japanskt",
  sushi_restaurant: "Sushi",
  chinese_restaurant: "Kinesiskt",
  thai_restaurant: "Thaimat",
  indian_restaurant: "Indiskt",
  mexican_restaurant: "Mexikanskt",
  korean_restaurant: "Koreanskt",
  vietnamese_restaurant: "Vietnamesiskt",
  lebanese_restaurant: "Libanesiskt",
  persian_restaurant: "Persiskt",
  spanish_restaurant: "Spanskt",
  greek_restaurant: "Grekiskt",
  turkish_restaurant: "Turkiskt",
  mediterranean_restaurant: "Medelhav",
  scandinavian_restaurant: "Skandinaviskt",
  european_restaurant: "Europeiskt",
  asian_restaurant: "Asiatiskt",
  asian_fusion_restaurant: "Asiatisk fusion",
  seafood_restaurant: "Fisk & skaldjur",
  steak_house: "Steakhouse",
  hamburger_restaurant: "Hamburgare",
  pizza_restaurant: "Pizza",
  ramen_restaurant: "Ramen",
  tapas_restaurant: "Tapas",
  falafel_restaurant: "Falafel",
  fine_dining_restaurant: "Fine dining",
  bistro: "Bistro",
  gastropub: "Gastropub",
  brunch_restaurant: "Brunch",
  vegan_restaurant: "Veganskt",
  vegetarian_restaurant: "Vegetariskt",
  brazilian_restaurant: "Brasilianskt",
  dim_sum_restaurant: "Dim sum",
  barbecue_restaurant: "BBQ",
  bangladeshi_restaurant: "Bangladeshiskt",
  czech_restaurant: "Tjeckiskt",
  austrian_restaurant: "Österrikiskt",
  german_restaurant: "Tyskt",
  peruvian_restaurant: "Peruanskt",
  caribbean_restaurant: "Karibiskt",
  hawaiian_restaurant: "Hawaiianskt",
  danish_restaurant: "Danskt",
  ukrainian_restaurant: "Ukrainskt",
  south_american_restaurant: "Sydamerikanskt",
  cajun_restaurant: "Cajun",
  fusion_restaurant: "Fusion",
  bakery: "Bageri",
  pastry_shop: "Konditori",
  cafe: "Café",
  cafeteria: "Café",
  coffee_shop: "Café",
  coffee_roastery: "Café",
  bar: "Bar",
  wine_bar: "Vinbar",
  cocktail_bar: "Cocktailbar",
  pub: "Pub",
  brewpub: "Bryggpub",
  bar_and_grill: "Bar & grill",
  ice_cream_shop: "Glass",
  chocolate_shop: "Choklad",
  dessert_shop: "Dessert",
  sandwich_shop: "Smörgåsar",
  bagel_shop: "Bagels",
  restaurant: "Restaurang",
};

// ─── WhiteGuide classification mapping ──────────────────────────

const WG_CLASSIFICATION_MAP: Record<string, string> = {
  "GOD NIVÅ": "recommended",
  "REKOMMENDERAD": "recommended",
  "REKOMMENDERAT": "recommended",
  "GOD KLASS": "good_class",
  "MYCKET GOD KLASS": "very_good_class",
  "MYCKET GOD NIVÅ": "very_good_class",
  "MÄSTARKLASS": "master_class",
  "EXCEPTIONELL NIVÅ": "master_class",
  "GLOBAL MÄSTARKLASS": "global_master_class",
  "GLOBAL EXCEPTIONELL NIVÅ": "global_master_class",
};

// ─── Transform venue ────────────────────────────────────────────

function transformVenue(v: ScoredVenue): FrontendVenue {
  // Build links from source references
  const links: Record<string, string> = {};
  for (const src of v.sources) {
    const key = src.sourceId.replace("-review", "").replace("-news", "");
    if (src.url && !links[key]) links[key] = src.url;
  }
  if (v.googleMapsUri) links.google = v.googleMapsUri;

  // Build frontend ratings
  const ratings: FrontendVenue["ratings"] = {};

  if (v.ratings.krogguiden?.score != null) {
    ratings.krogguiden = v.ratings.krogguiden.score;
  }
  if (v.googleRating != null) {
    ratings.google = v.googleRating;
  }
  if (v.ratings.michelin) {
    ratings.michelin = v.ratings.michelin.distinction;
  }
  if (v.ratings.whiteguide?.classification) {
    ratings.whiteguide =
      WG_CLASSIFICATION_MAP[v.ratings.whiteguide.classification.toUpperCase()] ??
      v.ratings.whiteguide.classification;
  }
  if (v.ratings.svd?.score != null) {
    ratings.svd = v.ratings.svd.score;
  }
  if (v.ratings.dn?.score != null) {
    ratings.dn = v.ratings.dn.score;
  }
  if (v.ratings.di?.score != null) {
    ratings.di = v.ratings.di.score;
  }
  if (v.ratings.falstaff?.score != null) {
    ratings.falstaff = v.ratings.falstaff.score;
  }
  if (v.ratings.thatsup?.score != null) {
    ratings.thatsup = v.ratings.thatsup.score;
  }

  // Cuisine from Google primary type
  const cuisine = v.googlePrimaryType
    ? CUISINE_MAP[v.googlePrimaryType] || undefined
    : undefined;

  const result: FrontendVenue = {
    id: v.id,
    name: v.name,
    address: v.address,
    city: v.city,
    lat: v.lat,
    lng: v.lng,
    ratings,
    links,
    bakomScore: v.bakomScore,
    bakomScoreRaw: Math.round(v.bakomScoreRaw * 10) / 10,
    bakomRank: v.rankNational,
    metroRegion: v.metroRegion || "sweden",
  };

  if (v.priceRange) result.priceRange = v.priceRange;
  if (cuisine) result.cuisine = cuisine;
  if (v.hours && v.hours.length > 0) result.hours = v.hours;
  if (v.website) result.website = v.website;
  if (v.phone) result.phone = v.phone;
  if (v.googleRatingCount) result.googleRatingCount = v.googleRatingCount;
  if (v.ratings.thatsup?.reviewCount) result.thatsupReviewCount = v.ratings.thatsup.reviewCount;
  if (v.rankRegion != null) result.bakomRankRegion = v.rankRegion;

  return result;
}

// ─── Main optimize function ─────────────────────────────────────

export async function optimizeAll(): Promise<{
  restaurants: FrontendVenue[];
  bars: FrontendVenue[];
  fika: FrontendVenue[];
  hotels: FrontendVenue[];
}> {
  console.log("=== Optimize ===\n");

  const scored = loadData<ScoredVenue[]>("venues-scored.json");
  if (!scored || scored.length === 0) {
    throw new Error(
      "pipeline/.data/venues-scored.json not found. Run pipeline:score first.",
    );
  }

  console.log(`  Loaded ${scored.length} scored venues`);

  // Filter out venues with no ratings (mentioned in articles but never scored)
  const hasRatings = (v: ScoredVenue): boolean => {
    const r = v.ratings;
    return !!(
      r.michelin ||
      r.whiteguide?.classification ||
      r.svd?.score != null ||
      r.dn?.score != null ||
      r.di?.score != null ||
      r.krogguiden?.score != null ||
      v.googleRating != null
    );
  };

  const noRatings = scored.filter((v) => !hasRatings(v));
  if (noRatings.length > 0) {
    console.log(`\n  Excluded ${noRatings.length} venues with no ratings:`);
    for (const v of noRatings) {
      console.log(`    - ${v.name} (${v.city})`);
    }
  }

  const ratedVenues = scored.filter(hasRatings);

  // Split by category (assigned in refine step)
  const restaurants: ScoredVenue[] = [];
  const bars: ScoredVenue[] = [];
  const fika: ScoredVenue[] = [];
  const hotels: ScoredVenue[] = [];
  const excluded: { name: string; type: string }[] = [];

  for (const v of ratedVenues) {
    const cat = v.category || "restaurant";
    if (cat === "restaurant") restaurants.push(v);
    else if (cat === "bar") bars.push(v);
    else if (cat === "fika") fika.push(v);
    else if (cat === "hotel") hotels.push(v);
    else excluded.push({ name: v.name, type: v.googlePrimaryType || "unknown" });
  }

  // Transform and sort by rank
  const restaurantsFrontend = restaurants.map(transformVenue).sort((a, b) => a.bakomRank - b.bakomRank);
  const barsFrontend = bars.map(transformVenue).sort((a, b) => a.bakomRank - b.bakomRank);
  const fikaFrontend = fika.map(transformVenue).sort((a, b) => a.bakomRank - b.bakomRank);
  const hotelsFrontend = hotels.map(transformVenue).sort((a, b) => a.bakomRank - b.bakomRank);

  // Save
  saveOptimized("restaurants.frontend.json", restaurantsFrontend);
  saveOptimized("bars.frontend.json", barsFrontend);
  saveOptimized("fika.frontend.json", fikaFrontend);
  saveOptimized("hotels.frontend.json", hotelsFrontend);

  // Stats
  console.log(`\n  === Optimize Results ===`);
  console.log(`  Restaurants: ${restaurantsFrontend.length}`);
  console.log(`  Bars:        ${barsFrontend.length}`);
  console.log(`  Fika:        ${fikaFrontend.length}`);
  console.log(`  Hotels:      ${hotelsFrontend.length}`);
  console.log(`  Excluded:    ${excluded.length}`);

  if (excluded.length > 0) {
    console.log(`\n  Excluded venues (non-venue Google types):`);
    for (const e of excluded) {
      console.log(`    - ${e.name} (${e.type})`);
    }
  }

  // Restaurant cuisine breakdown
  const byCuisine = new Map<string, number>();
  for (const r of restaurantsFrontend) {
    const c = r.cuisine || "Övrigt";
    byCuisine.set(c, (byCuisine.get(c) ?? 0) + 1);
  }
  console.log(`\n  Top cuisines:`);
  for (const [c, n] of [...byCuisine.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`    ${c}: ${n}`);
  }

  // File sizes
  const files = [
    ["restaurants.frontend.json", restaurantsFrontend],
    ["bars.frontend.json", barsFrontend],
    ["fika.frontend.json", fikaFrontend],
    ["hotels.frontend.json", hotelsFrontend],
  ] as const;
  console.log(`\n  File sizes:`);
  for (const [name, data] of files) {
    console.log(`    ${name}: ${(JSON.stringify(data).length / 1024).toFixed(0)} KB`);
  }

  // Generate sitemap.xml
  generateSitemap(restaurantsFrontend, barsFrontend, fikaFrontend, hotelsFrontend);

  return { restaurants: restaurantsFrontend, bars: barsFrontend, fika: fikaFrontend, hotels: hotelsFrontend };
}

// ─── Sitemap generation ──────────────────────────────────────────

const BASE_URL = "https://bakom.se";

function generateSitemap(
  restaurants: FrontendVenue[],
  bars: FrontendVenue[],
  fika: FrontendVenue[],
  hotels: FrontendVenue[],
): void {
  const today = new Date().toISOString().split("T")[0];

  const urls: { loc: string; priority: string; changefreq: string }[] = [
    { loc: BASE_URL, priority: "1.0", changefreq: "weekly" },
    { loc: `${BASE_URL}/b`, priority: "0.8", changefreq: "weekly" },
    { loc: `${BASE_URL}/f`, priority: "0.8", changefreq: "weekly" },
    { loc: `${BASE_URL}/h`, priority: "0.8", changefreq: "weekly" },
  ];

  const categories: [FrontendVenue[], string, number][] = [
    [restaurants, "r", 50],
    [bars, "b", 20],
    [fika, "f", 20],
    [hotels, "h", 20],
  ];

  for (const [venues, prefix, topN] of categories) {
    for (const v of venues) {
      urls.push({
        loc: `${BASE_URL}/${prefix}/${v.id}`,
        priority: v.bakomRank <= topN ? "0.8" : "0.6",
        changefreq: "monthly",
      });
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

  const publicDir = resolve(__dirname, "../../public");
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(resolve(publicDir, "sitemap.xml"), xml, "utf-8");
  console.log(`\n  Sitemap: ${urls.length} URLs → public/sitemap.xml`);
}
