# Refine

The refine step enriches the merged restaurant data with external sources
and calculates Bakom Score.

Source file: [`pipeline/process/refine.ts`](../pipeline/process/refine.ts)

---

## Input / Output

### Input

| File | Required | Content |
|------|----------|---------|
| `data/restaurants.json` | Yes | Merged dataset from merge step |

### Output

| File | Content |
|------|---------|
| `data/restaurants.json` | Enriched dataset with Google data, coordinates, scores |

---

## Processing Steps

### 1. Google Places enrichment

If `GOOGLE_PLACES_API_KEY` is set, query the Google Places Text Search
API for every restaurant that doesn't already have a `googlePlaceId`.

With `--force`, re-enrich **all** restaurants regardless of existing
Google data. Use this to update business status, ratings, and contact
info for previously enriched restaurants.

For each match, Google provides:
- Address, phone, website, opening hours (preferred over scraped data)
- Coordinates (always overwrites — Google is more accurate)
- Rating and review count
- Google Maps link
- Business status (`OPERATIONAL`, `CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`)

Progress is saved every 100 restaurants. If the API key is not set,
this step is skipped with a warning.

Source: [`pipeline/collect/google.ts`](../pipeline/collect/google.ts)

### 2. Geocode missing coordinates

For restaurants still missing `lat`/`lng` after Google enrichment,
geocode the address using OpenStreetMap Nominatim. Rate limited to
1 request per second.

Source: [`pipeline/process/geocode.ts`](../pipeline/process/geocode.ts)

### 3. Deduplicate

Two-pass deduplication:

**3a. By ID** — removes exact duplicates sharing the same generated ID
(e.g. two sources producing "pa-co-riddargatan-8"). Keeps the first
occurrence.

**3b. By Google Place ID** — merges restaurants that have different
names/IDs but resolve to the same physical location in Google Places.
This catches cases like "Operakällaren" vs "Operakällarens Matsal",
"KB" vs "Konstnärsbaren/KB", or "Matbaren" vs "Mathias Dahlgren –
Matbaren" where different sources use different names for the same
restaurant.

The entry with the most sources is kept as primary. Ratings, links,
source IDs, and basic fields from the duplicate are merged into the
primary. Each merge is logged:

```
Dedup by Google Place ID: merged "Operakällarens Matsal" → "Operakällaren"
```

### 4. Calculate Bakom Score

Compute the 0-100 Bakom Score for every restaurant using ratings from
all sources and Google review count. See [`docs/score.md`](./score.md)
for the full scoring algorithm.

### 5. Validate

Run validation on all records:
- **Errors**: Missing name, NaN coordinates
- **Warnings**: Missing address, invalid phone/website format

Print a quality report with data completeness metrics.

---

## Closed restaurants

Closed restaurants (`CLOSED_PERMANENTLY` and `CLOSED_TEMPORARILY`) are
**kept** in `data/restaurants.json` so their enrichment data survives
merge re-runs. They are filtered out in the
[optimize step](./optimize.md) when generating the frontend JSON.

---

## CLI

```
npm run pipeline:refine
npm run pipeline:refine --force
```

The `--force` flag re-enriches all restaurants with Google Places,
even those already enriched. This updates business status (detects
closed restaurants) and refreshes ratings and contact info.

Without `--force`, only restaurants without a `googlePlaceId` are
enriched.

The refine step is also run as part of the full pipeline:

```
npm run pipeline
```
