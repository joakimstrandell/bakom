# Merge

The merge step combines raw data from all sources into a single unified
`data/restaurants.json`. It fuzzy-matches restaurants across sources,
deduplicates, and validates.

Score calculation and enrichment are handled by the [refine](./refine.md)
step. Frontend JSON generation is handled by the [optimize](./optimize.md)
step.

Source file: [`pipeline/process/merge.ts`](../pipeline/process/merge.ts)

---

## Input / Output

### Input

| File | Required | Content |
|------|----------|---------|
| `data/raw/krogguiden.json` | Yes | Base source (~850 restaurants) |
| `data/raw/michelin.json` | No | Michelin distinctions (~41) |
| `data/raw/whiteguide.json` | No | White Guide classifications (~200) |
| `data/raw/svd.json` | No | SvD reviews with rating (~150) |
| `data/raw/dn.json` | No | DN reviews, boolean only (~80) |
| `data/raw/di.json` | No | DI Weekend reviews with score (~100) |
| `data/manual.json` | No | Manual additions, merges, overrides |
| `data/restaurants.json` | No | Previous run (preserves Google enrichment) |

### Output

| File | Content |
|------|---------|
| `data/restaurants.json` | Full merged dataset (`PipelineRestaurant[]`) |

---

## Processing Steps

### 1. Load sources

Load all raw JSON files from `data/raw/`. Build lookup maps by
normalized name for Michelin and White Guide. If a previous
`data/restaurants.json` exists, load it to preserve Google
enrichment data (placeId, rating, ratingCount, coordinates, hours).

### 2. Krogguiden as base

For each Krogguiden restaurant:
- Generate a deterministic ID from `name + address`
- Skip entries without an address (unless previously Google-enriched)
- Fuzzy-match against Michelin (0.85 threshold)
- Fuzzy-match against White Guide (0.85 threshold)
- Create merged record with ratings from all matched sources
- Preserve Google data from previous run if available

### 3. Add unmatched Michelin

For Michelin restaurants not matched in step 2:
- Fuzzy-match against White Guide
- Create new restaurant record

### 4. Add unmatched White Guide

For White Guide restaurants not matched in steps 2-3:
- Create new restaurant record
- Use White Guide coordinates if available
- **Note:** White Guide tags (descriptors like "stark personlighet", "wow") are
  NOT used as cuisine — only Name, Address, Classification, and Coordinates
  are extracted from White Guide

### 5. Match newspaper reviews

**SvD** — Fuzzy-match against all existing restaurants. If matched,
add rating (1-6 scale) and link. If no match but has an address,
create a new restaurant.

**DN** — Fuzzy-match against all existing restaurants using name and
address. If matched, add score (0-5 scale) and link. DN reviews with
an address can also confirm matches. Cannot create new restaurants
(DN data is scraped via Chrome MCP due to paywall).

**DI Weekend** — Fuzzy-match against all existing restaurants. If
matched, add total score (0-25) and link. Use DI coordinates as
fallback. If no match but has an address, create a new restaurant.

### 6. Apply manual data

Load `data/manual.json` and apply three types of corrections:
- **Additions** — New restaurants not in any source
- **Merges** — Combine duplicate entries (keep + merge IDs)
- **Overrides** — Patch specific fields on existing restaurants

See [Manual Data](#manual-data) below.

### 7. Sanitize cuisine

Cuisine values are sanitized to remove polluted data:

- **Priority:** Krogguiden cuisine → Michelin cuisine → empty
- **Filtered out:** White Guide descriptor tags that are not cuisines:
  - Descriptors: "stark personlighet", "se och synas", "wow", "fab",
    "excellent", "premium", "star", "premi"
  - Service tags: "kvarterskrog", "take away", "nyöppnat", "sommarkrog",
    "stort dryckesfokus", "maffig miljö", "naturnära", "nynordiskt", etc.
  - Repeated values: patterns like "X, X" or "X, X, X" (tag pollution)

If a cuisine value contains any of these patterns, it is cleared. The
[refine step](./refine.md) can later fill empty cuisines using Google
Places `primaryType`.

### 8. Deduplicate by Google Place ID

Group restaurants sharing the same `googlePlaceId` (same physical
location found by Google in a previous enrichment run). Select a
primary by: most sources → most ratings → longest name. Merge
ratings, links, and sourceIds from secondaries into the primary.
Remove secondaries.

### 9. Validate

Run validation on all records:
- **Errors**: Missing name (blocks output)
- **Warnings**: Missing address, coordinates outside Stockholm
  bounds (59.0-59.6N, 17.5-18.5E), invalid phone/website format

---

## Fuzzy Matching

Source files:
[`pipeline/utils/match.ts`](../pipeline/utils/match.ts),
[`pipeline/utils/fuzzy.ts`](../pipeline/utils/fuzzy.ts)

### Name normalization

Before matching, restaurant names are normalized:

1. Lowercase
2. Strip prefixes: `restaurang`, `restaurant`, `ristorante`, `trattoria`, `brasserie`, `bistro`, `café`, `cafe`
3. Strip suffixes: `restaurang`, `restaurant`, `bar`, `grill`, `kitchen`, `kök`, `& bar`, `& grill`
4. Remove apostrophes and accents
5. Keep only letters, numbers, spaces
6. Collapse whitespace

Examples: `"Restaurang Kry"` → `"kry"`, `"Mälarpaviljongen"` → `"malarpaviljongen"`

### Matching algorithm

1. **Exact match** (fast path) — If normalized name exists in the
   candidate map, return immediately with score 1.0.

2. **Fuzzy match** — Compare against all candidates using Levenshtein
   distance (Wagner-Fischer algorithm):

   ```
   nameSimilarity  = 1 - (levenshteinDistance / maxLength)
   ```

   Skip if `nameSimilarity < 0.85` (threshold).

3. **Address confirmation** — If both sides have an address, calculate
   address similarity (70% street name + 30% street number match).

4. **Combined score**:

   ```
   combinedScore = nameSimilarity × 0.8 + addressSimilarity × 0.2
   ```

   The candidate with the highest combined score wins.

### Threshold

All matching uses **0.85** (85% name similarity). This catches
variations like `"Esperanto"` vs `"Esperanto Restaurant"` while
avoiding false positives.

---

## Manual Data

File: `data/manual.json`

### Additions

Add restaurants not found in any scraped source:

```json
{
  "additions": [
    {
      "id": "my-restaurant-storgatan-1",
      "name": "My Restaurant",
      "address": "Storgatan 1",
      "city": "Stockholm"
    }
  ]
}
```

### Merges

Combine two entries that are the same restaurant (e.g., different
spellings across sources that fuzzy matching didn't catch):

```json
{
  "merges": [
    {
      "keep": "sushi-yama-kungsgatan-44",
      "merge": "sushiyama-kungsgatan-44",
      "preferFields": ["address", "phone"]
    }
  ]
}
```

The `merge` entry is removed. Its ratings, links, and sources are
folded into the `keep` entry. `preferFields` optionally overwrites
specific fields from the merged entry.

### Overrides

Patch specific fields on an existing restaurant:

```json
{
  "overrides": [
    {
      "id": "my-restaurant-storgatan-1",
      "fields": { "cuisine": "Japanese", "priceRange": "$$$" }
    }
  ]
}
```

---

## Deduplication

After all sources are merged, restaurants may still be duplicates
if they share a `googlePlaceId` from a previous Google enrichment
run. The dedup step:

1. Group all restaurants by `googlePlaceId`
2. For groups with 2+ entries, pick a **primary**:
   - Most sources (e.g., krogguiden + michelin beats michelin-only)
   - Then most non-null ratings
   - Then longest name (tiebreaker)
3. Merge ratings, links, sourceIds, sources from secondaries
4. Fill missing fields (phone, website, cuisine, coords, hours)
5. Remove secondary entries

---

## Output Structure

Each record in `data/restaurants.json` is a `PipelineRestaurant`:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Deterministic: normalized `name + address` |
| `name` | `string` | Restaurant name |
| `slug` | `string` | Krogguiden slug (pipeline-only) |
| `address` | `string` | Street address |
| `postalCode` | `string` | Postal code |
| `city` | `string` | City (default: Stockholm) |
| `phone` | `string` | Phone number |
| `website` | `string` | Website URL |
| `priceRange` | `string` | `$`, `$$`, `$$$`, or `$$$$` |
| `cuisine` | `string` | Cuisine type |
| `image` | `string` | Image URL (pipeline-only) |
| `hours` | `HoursEntry[]` | Opening hours per day |
| `lat` / `lng` | `number \| null` | Coordinates |
| `ratings` | `SourceRatings` | Rating per source (see [score docs](./score.md)) |
| `links` | `SourceLinks` | URL to each source's page |
| `sourceIds` | `SourceIds` | Internal IDs per source (pipeline-only) |
| `sources` | `string[]` | Which sources contributed (pipeline-only) |
| `googlePlaceId` | `string?` | Google Places ID (pipeline-only) |
| `googleRatingCount` | `number?` | Number of Google reviews |
| `bakomScore` | `number \| null` | Composite score 0-100 |
| `businessStatus` | `string?` | `OPERATIONAL`, `CLOSED_TEMPORARILY`, etc. |

Types defined in [`pipeline/types.ts`](../pipeline/types.ts) and
[`src/types.ts`](../src/types.ts).

---

## CLI

```
npm run pipeline:merge
```

Reads from `data/raw/*.json`, writes to `data/restaurants.json`.

The merge step is also run as part of the full pipeline:

```
npm run pipeline
```
