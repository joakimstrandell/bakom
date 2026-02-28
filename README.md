# Krogguiden Map

Interactive map of Stockholm restaurants with data from Krogguiden, Guide Michelin, White Guide, SvD, DN, and Google Places.

## Getting Started

```bash
npm install
npm run dev        # Start dev server at http://localhost:3000
```

## Data Pipeline

The pipeline collects restaurant data from multiple sources and merges them into a single `data/restaurants.json` used by the frontend.

### Pipeline Flow

```
1. Krogguiden   →  data/raw/krogguiden.json   (restaurants from krogguiden.se)
2. Michelin     →  data/raw/michelin.json     (restaurants from Guide Michelin)
3. White Guide  →  data/raw/whiteguide.json   (restaurants from White Guide API)
4. SvD          →  data/raw/svd.json          (reviews from SvD Krogguiden)
5. DN           →  data/raw/dn.json           (reviews from DN Krogkommissionen)
6. Merge        →  data/restaurants.json      (merged data with fuzzy matching)
7. Google       →  data/restaurants.json      (enriches with address, hours, ratings)
8. Geocode      →  data/restaurants.json      (fills in missing coordinates)
```

### Step Details

**Step 1 — Krogguiden**
Scrapes krogguiden.se via AJAX pagination to fetch slugs, then detail pages for each restaurant (JSON-LD + HTML). Skips restaurants already in `data/raw/krogguiden.json`. Uses parallel processing (3 concurrent requests) for faster scraping. Use `--force` to re-scrape everything.

**Step 2 — Michelin**
Scrapes Guide Michelin's Stockholm page. Fetches distinctions (Selected, Bib Gourmand, 1–3 stars), cuisine, and price range.

**Step 3 — White Guide**
Fetches restaurant data from White Guide's API (`admin.whiteguide.com`). Includes classification (Recommended, Good Class, Very Good Class, Master Class, Global Master Class), scores, tags, and coordinates.

**Step 4 — SvD Krogguiden**
Fetches restaurant reviews from Svenska Dagbladet's Krogguiden section via RSS. Each review has JSON-LD with restaurant name, address, and rating (1-6 scale).

**Step 5 — DN Krogkommissionen**
Fetches restaurant reviews from Dagens Nyheter's Krogkommissionen section via RSS. Extracts restaurant names from article titles. No numeric rating (just reviewed/not).

**Step 6 — Merge**
Merges all sources into `data/restaurants.json`. Krogguiden is the base. Other sources are matched using fuzzy name matching with address proximity (85% similarity threshold). SvD reviews with addresses can create new restaurants. Also applies manual data from `data/manual.json` (see below).

**Step 7 — Google (enrichment)**
Takes restaurants from step 4 and looks them up via Google Places Text Search. Enriches with updated hours, addresses, phone numbers, website, ratings, and coordinates. Restaurants with existing `googlePlaceId` are skipped.

**Step 8 — Geocode**
Geocodes restaurants still missing coordinates (those Google didn't find) via OpenStreetMap Nominatim.

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
npm run pipeline:merge                   # Step 6
npm run pipeline:google                  # Step 7 — skips already enriched
npm run pipeline:geocode                 # Step 8 — skips those with coordinates
npm run pipeline:duplicates              # Find potential duplicates
```

Each step can run independently, but order matters:

- `pipeline:merge` requires at least `data/raw/krogguiden.json` (and ideally `michelin.json` and `whiteguide.json`)
- `pipeline:google` requires `data/restaurants.json` (run merge first)
- `pipeline:geocode` requires `data/restaurants.json`

### Incremental Scraping

The pipeline is designed for multiple runs without redundant work:

| Step | What Gets Skipped |
|------|-------------------|
| Krogguiden | Slugs already in `data/raw/krogguiden.json` |
| Google | Restaurants with existing `googlePlaceId` |
| Geocode | Restaurants with existing coordinates (lat/lng) |

Use `--force` to force a full re-scrape of Krogguiden.

### Google Places API

Step 5 requires a Google Places API key. Create a Google Cloud project, enable Places API (New), and set the env variable:

```bash
export GOOGLE_PLACES_API_KEY=your_key_here
```

See `.env.example` for reference. If the key is missing, the pipeline skips the Google step automatically.

## Manual Data

You can add, merge, or override restaurants manually via `data/manual.json`. This file is applied during the merge step.

### Structure

```json
{
  "additions": [],
  "merges": [],
  "overrides": []
}
```

### Additions

Add restaurants not in any scraped source:

```json
{
  "additions": [
    {
      "id": "my-custom-restaurant",
      "name": "My Custom Restaurant",
      "address": "Storgatan 1",
      "city": "Stockholm",
      "phone": "08-123 45 67",
      "website": "https://example.com",
      "cuisine": "Swedish",
      "lat": 59.33,
      "lng": 18.07
    }
  ]
}
```

### Merges

Combine two duplicate entries into one:

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

The `keep` restaurant absorbs all source IDs, links, and ratings from `merge`. The merged entry is removed. Use `preferFields` to specify which fields to take from the merged entry.

### Overrides

Override specific fields on existing restaurants:

```json
{
  "overrides": [
    {
      "id": "some-restaurant-id",
      "fields": {
        "name": "Correct Name",
        "website": "https://correct-website.com"
      }
    }
  ]
}
```

## Features

### Fuzzy Matching
The merge step uses Levenshtein distance for name matching with address proximity as a tiebreaker. This catches matches like:
- "Fotografiska" → "Fotografiskas restaurang" (92% match)
- "Konstnärsbaren/KB" → "Konstnärsbaren / KB" (94% match)

### Request Timeouts
All HTTP requests have 30-second timeouts (15s for Google API) to prevent hanging connections.

### Parallel Processing
Krogguiden scraper uses parallel processing (3 concurrent requests with 2s minimum delay) for ~3x faster scraping while respecting rate limits.

### Data Validation
The merge step validates all restaurants and reports:
- Missing required fields (name, address)
- Coordinates outside Stockholm bounds (lat 59.0-59.6, lng 17.5-18.5)
- Data quality metrics (completeness percentages)

## File Structure

```
pipeline/
  collect/
    krogguiden.ts      Krogguiden.se scraper (slugs + details + hours)
    michelin.ts        Guide Michelin scraper (Selected, Bib Gourmand, 1-3 stars)
    whiteguide.ts      White Guide API (classification, scores, coordinates)
    svd.ts             SvD Krogguiden (RSS + JSON-LD, rating 1-6)
    dn.ts              DN Krogkommissionen (RSS, restaurant names)
    google.ts          Google Places API (enriches existing restaurants)
  process/
    merge.ts           Merge sources with fuzzy matching + manual data
    geocode.ts         Geocode missing coordinates
  utils/
    fetch.ts           fetchWithRetry with timeout support
    hours.ts           Hours parsing (Krogguiden HTML + Google API)
    match.ts           Fuzzy name matching between sources
    fuzzy.ts           Levenshtein distance and similarity functions
    validate.ts        Data validation and quality metrics
    concurrency.ts     Parallel processing with rate limiting
    geocode.ts         OpenStreetMap Nominatim geocoding
  run.ts               Run all steps in sequence
  types.ts             Pipeline-specific types (raw data, manual data)
  find-duplicates.ts   Find potential duplicate restaurants

src/
  types.ts             Shared Restaurant type (frontend + pipeline)
  routes/index.tsx     Homepage with map and filters
  components/
    Map.tsx            Leaflet map with markers and popups
    Filters.tsx        Search, cuisine, price, rating, Michelin/White Guide filters
  lib/
    isOpen.ts          Determine if a restaurant is currently open
    score.ts           Calculate Bakom Score

data/
  raw/                 Raw data per source (krogguiden, michelin, whiteguide, svd, dn)
  restaurants.json     Final merged data (used by frontend)
  manual.json          Manual additions, merges, and overrides
```

## Data Sources

| Source | Type | What We Fetch |
|--------|------|---------------|
| Krogguiden | Web scraping | Name, address, cuisine, price, rating, hours, image |
| Guide Michelin | Web scraping | Distinctions (Selected, Bib Gourmand, 1–3 stars), cuisine |
| White Guide | API | Classification, scores (food/drink/service/environment), tags, coordinates |
| SvD Krogguiden | RSS + scraping | Restaurant reviews with rating (1-6 scale), name, address |
| DN Krogkommissionen | RSS + scraping | Restaurant reviews, name (no numeric rating) |
| Google Places | API | Address, hours, phone, website, rating, coordinates |

### Priority During Merge and Enrichment

| Field | Primary Source |
|-------|----------------|
| Name, cuisine, image, region | Krogguiden |
| Address, phone, website, hours | Google (step 5) |
| Coordinates (lat/lng) | Google > White Guide > Nominatim |
| Ratings | Displayed per source (Google, Krogguiden, Michelin, White Guide separately) |

## Data Format

### Hours (`hours`)

Hours are stored as an array of `HoursEntry`:

```typescript
type HoursEntry = {
  days: number[];  // 0=Sunday, 1=Monday, ..., 6=Saturday (JS Date.getDay())
  open: string;    // "HH:MM"
  close: string;   // "HH:MM"
};
```

Day 0 is **Sunday** (follows JavaScript `Date.getDay()` convention). Late-night restaurants have `close < open` (e.g., `open: "17:00", close: "02:00"`).

### Source IDs

Each restaurant tracks its ID from each source for data provenance and manual merging:

```typescript
type SourceIds = {
  krogguiden?: string;  // slug
  michelin?: string;    // URL
  whiteguide?: number;  // place_id
  google?: string;      // Google Place ID
};
```

## Tech Stack

- **Frontend**: TanStack Start, React, Leaflet, Tailwind CSS
- **Pipeline**: Node.js, cheerio, Google Places API
- **Geocoding**: OpenStreetMap Nominatim
