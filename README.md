# Bakom — Stockholm Restaurant Map

Interactive map of Stockholm restaurants aggregating data from 7 sources: Krogguiden, Guide Michelin, White Guide, SvD, DN, Thatsup, and Google Places. Features the **Bakom Score** — a weighted rating combining expert reviews and crowd ratings.

## Getting Started

```bash
npm install
npm run dev        # Start dev server at http://localhost:3000
```

## Data Pipeline

The pipeline collects restaurant data from multiple sources and merges them into `data/restaurants.json` used by the frontend.

### Pipeline Flow

```
1. Krogguiden   →  data/raw/krogguiden.json   (web scraping, ~680 restaurants)
2. Michelin     →  data/raw/michelin.json     (web scraping, ~45 restaurants)
3. White Guide  →  data/raw/whiteguide.json   (API, ~145 restaurants)
4. SvD          →  data/raw/svd.json          (RSS + scraping, ~275 reviews)
5. DN           →  data/raw/dn.json           (RSS, ~60 reviews)
6. Thatsup      →  data/raw/thatsup.json      (web scraping, ~890 restaurants)
7. Merge        →  data/restaurants.json      (fuzzy matching, deduplication)
8. Google       →  data/restaurants.json      (enriches with hours, address, ratings)
9. Geocode      →  data/restaurants.json      (fills missing coordinates)
```

### Step Details

**Step 1 — Krogguiden**
Scrapes krogguiden.se via AJAX pagination. Fetches restaurant details from JSON-LD + HTML (name, address, cuisine, price, rating, hours, image). Uses parallel processing (3 concurrent, 2s delay). Skips existing slugs; use `--force` to re-scrape.

**Step 2 — Michelin**
Scrapes Guide Michelin's Stockholm page. Extracts distinctions (Selected, Bib Gourmand, 1–3 stars), cuisine, and price range.

**Step 3 — White Guide**
Fetches from White Guide API. Includes classification (Recommended → Global Master Class), scores (food/drink/service/environment), tags, and coordinates.

**Step 4 — SvD Krogguiden**
Fetches Svenska Dagbladet reviews via RSS + article scraping. Extracts name, address, rating (1–6 scale), and cuisine.

**Step 5 — DN Krogkommissionen**
Fetches Dagens Nyheter reviews via RSS. Boolean-only (reviewed/not reviewed, no numeric rating).

**Step 6 — Thatsup**
Scrapes thatsup.se restaurant listings. Extracts user ratings (1–5 scale), review count, address, coordinates, hours, phone, and website.

**Step 7 — Merge**
Combines all sources using fuzzy name matching (85% threshold) with address proximity. Applies manual data from `data/manual.json`. Deduplicates by Google Place ID. Calculates Bakom Score for all restaurants.

**Step 8 — Google (enrichment)**
Enriches with Google Places API: updated hours, addresses, phone, website, ratings, review count, and coordinates. Skips restaurants with existing `googlePlaceId`.

**Step 9 — Geocode**
Geocodes restaurants missing coordinates via OpenStreetMap Nominatim.

### Run Full Pipeline

```bash
npm run pipeline
```

### Run Individual Steps

```bash
npm run pipeline:krogguiden              # Step 1 — only new restaurants
npm run pipeline:krogguiden -- --force   # Step 1 — re-scrape all
npm run pipeline:michelin                # Step 2
npm run pipeline:whiteguide              # Step 3
npm run pipeline:svd                     # Step 4
npm run pipeline:dn                      # Step 5
npm run pipeline:thatsup                 # Step 6
npm run pipeline:merge                   # Step 7
npm run pipeline:google                  # Step 8 — skips already enriched
npm run pipeline:geocode                 # Step 9 — skips those with coordinates
npm run pipeline:duplicates              # Find potential duplicates
```

### Incremental Scraping

| Step | What Gets Skipped |
|------|-------------------|
| Krogguiden | Slugs already in `data/raw/krogguiden.json` |
| Thatsup | Slugs already in `data/raw/thatsup.json` |
| Google | Restaurants with existing `googlePlaceId` |
| Geocode | Restaurants with existing coordinates |

### Google Places API

Step 8 requires a Google Places API key:

```bash
export GOOGLE_PLACES_API_KEY=your_key_here
```

If missing, the pipeline skips the Google step automatically.

## Bakom Score

The **Bakom Score** (0–10) aggregates ratings from multiple sources with intelligent weighting:

### Weights

| Source | Weight | Scale | Notes |
|--------|--------|-------|-------|
| Michelin | 28% | 6–10 | Selected=6, Bib=7, ★=8.5, ★★=9.5, ★★★=10 |
| White Guide | 20% | 6.5–10 | Recommended=6.5 → Global Master=10 |
| SvD | 16% | 1–6 → 0–10 | Professional critic |
| Krogguiden | 16% | 1–5 → 0–10 | Professional reviewers |
| Google | 10% | 1–5 → 1–9 | Crowd ratings, Bayesian dampened |
| Thatsup | 10% | 1–5 → 1–9 | Crowd ratings, Bayesian dampened |
| DN | — | Boolean | Contributes to diversity only |

### Features

- **Bayesian dampening**: Crowd ratings (Google/Thatsup) with few reviews are pulled toward a 7.0 prior. Full weight at 100+ reviews.
- **Conservative crowd scaling**: Maps 1–5 to 1–9 (not 0–10) since crowd ratings cluster around 4.0–4.8.
- **Diversity factor**: Single-source ratings dampened to 88%. Two sources: 95%. Three+: 100%.
- **Michelin floors**: Starred restaurants guaranteed minimums (★=8.0, ★★=9.0, ★★★=10.0).
- **Monotonicity**: Adding a source never lowers the score (leave-one-out check).

## Manual Data

Override or supplement scraped data via `data/manual.json`:

```json
{
  "additions": [],
  "merges": [],
  "overrides": []
}
```

### Additions

Add restaurants not in any source:

```json
{
  "additions": [
    {
      "id": "my-restaurant",
      "name": "My Restaurant",
      "address": "Storgatan 1",
      "city": "Stockholm",
      "lat": 59.33,
      "lng": 18.07
    }
  ]
}
```

### Merges

Combine duplicate entries:

```json
{
  "merges": [
    {
      "keep": "ai-ramen-erstagatan-22",
      "merge": "ai-ramen-sofia-erstagatan-22",
      "preferFields": ["name"]
    }
  ]
}
```

### Overrides

Override specific fields:

```json
{
  "overrides": [
    {
      "id": "some-restaurant-id",
      "fields": { "name": "Correct Name" }
    }
  ]
}
```

## Features

### Fuzzy Matching
Levenshtein distance with 85% threshold + address proximity:
- "Fotografiska" → "Fotografiskas restaurang" (92%)
- "Konstnärsbaren/KB" → "Konstnärsbaren / KB" (94%)

### Deduplication
Restaurants with the same Google Place ID are automatically merged, combining ratings and data from all sources.

### Data Validation
Reports missing fields, out-of-bounds coordinates (Stockholm: lat 59.0–59.6, lng 17.5–18.5), and quality metrics.

### Real-time Open Status
Frontend checks current time against hours data, handling overnight hours (close < open).

## File Structure

```
pipeline/
  collect/
    krogguiden.ts      Krogguiden.se scraper
    michelin.ts        Guide Michelin scraper
    whiteguide.ts      White Guide API
    svd.ts             SvD Krogguiden (RSS + scraping)
    dn.ts              DN Krogkommissionen (RSS)
    thatsup.ts         Thatsup.se scraper
    google.ts          Google Places API enrichment
  process/
    merge.ts           Merge sources + fuzzy matching + Bakom Score
    geocode.ts         Nominatim geocoding
  utils/
    fetch.ts           HTTP client with retries and timeouts
    match.ts           Fuzzy name/address matching
    fuzzy.ts           Levenshtein distance
    validate.ts        Data validation
    concurrency.ts     Parallel processing
    hours.ts           Hours parsing
    geocode.ts         Geocoding utilities
  run.ts               Run all pipeline steps
  types.ts             Pipeline types

src/
  types.ts             Shared Restaurant type
  routes/
    __root.tsx         Root layout with Analytics
    index.tsx          Homepage with map + filters
  components/
    Map.tsx            Leaflet map with markers
    Filters.tsx        Search, cuisine, price, rating filters
  lib/
    score.ts           Bakom Score calculation
    isOpen.ts          Open/closed detection

data/
  raw/                 Raw data per source
  restaurants.json     Full merged dataset (~1400 restaurants)
  restaurants.frontend.json   Stripped for frontend (~27% smaller)
  manual.json          Manual additions/merges/overrides
```

## Data Sources

| Source | Type | Data |
|--------|------|------|
| Krogguiden | Scraping | Name, address, cuisine, price, rating (1–5), hours, image |
| Michelin | Scraping | Distinctions, cuisine, price |
| White Guide | API | Classification, scores, tags, coordinates |
| SvD | RSS + scraping | Rating (1–6), name, address, cuisine |
| DN | RSS | Name (boolean: reviewed) |
| Thatsup | Scraping | Rating (1–5), review count, hours, coordinates, contact |
| Google | API | Hours, address, phone, website, rating, coordinates |

### Field Priority

| Field | Primary Source |
|-------|----------------|
| Name, cuisine, image | Krogguiden |
| Address, phone, website, hours | Google |
| Coordinates | Google > White Guide > Thatsup > Nominatim |
| Ratings | Per-source (displayed separately + Bakom Score) |

## Data Format

### Restaurant

```typescript
type Restaurant = {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  region: string;
  phone: string;
  website: string;
  priceRange: string;        // "$" | "$$" | "$$$" | "$$$$"
  cuisine: string;
  hours: HoursEntry[];
  lat: number | null;
  lng: number | null;
  ratings: SourceRatings;
  links: SourceLinks;
  googleRatingCount?: number;
  thatsupRatingCount?: number;
  bakomScore?: number | null; // 0–10
  businessStatus?: string;    // "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY"
};
```

### Hours

```typescript
type HoursEntry = {
  days: number[];  // 0=Sunday, 1=Monday, ..., 6=Saturday
  open: string;    // "HH:MM"
  close: string;   // "HH:MM" (can be < open for overnight)
};
```

### Ratings

```typescript
type SourceRatings = {
  krogguiden?: number | null;              // 1–5
  google?: number | null;                  // 1–5
  michelin?: MichelinDistinction | null;   // "selected" | "bib_gourmand" | "1_star" | "2_star" | "3_star"
  whiteguide?: WhiteGuideClassification | null;
  svd?: number | null;                     // 1–6
  dn?: boolean | null;                     // true = reviewed
  thatsup?: number | null;                 // 1–5
};
```

## Analytics

The app includes Vercel Analytics and Speed Insights for tracking:
- Page views, unique visitors, referrers
- Core Web Vitals (LCP, FID, CLS, INP, TTFB)

## Tech Stack

- **Frontend**: TanStack Start, React 19, Leaflet, Tailwind CSS, Radix UI
- **Pipeline**: Node.js, TypeScript, Cheerio
- **APIs**: Google Places, White Guide
- **Geocoding**: OpenStreetMap Nominatim
- **Analytics**: Vercel Analytics + Speed Insights
- **Build**: Vite, Nitro
