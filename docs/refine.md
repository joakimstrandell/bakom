# Refine

The refine step applies collected Google data, geocodes missing coordinates,
deduplicates, calculates Bakom Score, and validates.

Source file: [`pipeline/process/refine.ts`](../pipeline/process/refine.ts)

---

## Input / Output

### Input

| File | Required | Content |
|------|----------|---------|
| `data/restaurants.json` | Yes | Merged dataset from merge step |
| `data/raw/google.json` | No | Google Places data from collect step |

### Output

| File | Content |
|------|---------|
| `data/restaurants.json` | Enriched dataset with Google data, coordinates, scores |

---

## Processing Steps

### 1. Apply Google Places data

Applies pre-collected Google Places data from `data/raw/google.json` to
restaurants. Google data is collected separately via:

```
npm run pipeline:collect --source google
```

This separation means:
- **Collect step** (slow, uses API): Fetches Google data for all restaurants
- **Refine step** (fast, no API): Applies cached data from `google.json`

For each match, Google provides:
- Address, phone, website, opening hours (preferred over scraped data)
- Country suffix stripped from addresses (e.g., ", Sverige" removed)
- Coordinates (always overwrites — Google is more accurate)
- Rating and review count
- Google Maps link
- Business status (`OPERATIONAL`, `CLOSED_TEMPORARILY`, `CLOSED_PERMANENTLY`)
- **Cuisine fallback:** If the restaurant has no cuisine from Krogguiden or
  Michelin, Google's `primaryType` is used (e.g., `"italian_restaurant"` →
  `"Italian"`, `"japanese_restaurant"` → `"Japanese"`)

**Non-Swedish filtering:** Matches to non-Swedish locations (detected by
address keywords like "København", "Danmark", "Oslo", "Norge") are skipped
to prevent false matches.

If `google.json` doesn't exist, this step prints a hint to run collection.

Source: [`pipeline/collect/google.ts`](../pipeline/collect/google.ts)

### 2. Geocode missing coordinates

For restaurants still missing `lat`/`lng` after Google data application,
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
```

The refine step is also run as part of the full pipeline:

```
npm run pipeline
```

To update Google data, run collection with `--force` to re-fetch all:

```
npm run pipeline:collect --source google --force
npm run pipeline:refine
```
