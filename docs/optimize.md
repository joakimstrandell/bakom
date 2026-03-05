# Optimize

The optimize step filters closed restaurants, assigns metro regions based on
coordinates, calculates global rankings, and generates a size-stripped
frontend JSON file.

Source file: [`pipeline/process/optimize.ts`](../pipeline/process/optimize.ts)

---

## Input / Output

| File | Direction | Content |
|------|-----------|---------|
| `data/restaurants.json` | Input | Full pipeline dataset (includes closed) |
| `data/restaurants.frontend.json` | Output | All active restaurants with `metroRegion` field |
| `data/cuisines.json` | Output | Unique cuisine types with counts for filter UI |

---

## Processing Steps

### 1. Filter restaurants without Google data

Removes restaurants that don't have a `googlePlaceId`. If we couldn't
find the restaurant in Google Places, we can't verify it exists or get
accurate coordinates. These are excluded from the frontend.

### 2. Filter closed restaurants

Removes restaurants with `businessStatus` set to `CLOSED_PERMANENTLY`
or `CLOSED_TEMPORARILY`. These are kept in `data/restaurants.json` (so
enrichment data survives merge re-runs) but excluded from the frontend.

Business status comes from Google Places enrichment in the
[refine step](./refine.md).

### 3. Assign metro region

Each restaurant gets a `metroRegion` field based on coordinates (distance from city center):

| Region | Center | Radius |
|--------|--------|--------|
| `stockholm` | 59.33°N, 18.07°E | 50 km |
| `gothenburg` | 57.71°N, 11.97°E | 40 km |
| `malmo` | 55.60°N, 13.00°E | 50 km |
| `sweden` | Outside all metro areas | — |

### 4. Calculate rankings

**Global ranking:** All restaurants get a `bakomRank` (1, 2, 3...) based on
Bakom Score across all of Sweden.

**Per-region ranking:** Restaurants in metro areas (Stockholm, Gothenburg,
Malmö) also get a `bakomRankRegion` — their rank within that metro area only.
Restaurants in `sweden` (outside metro areas) do not have a regional rank.

### 5. Strip pipeline-only fields

- `slug`, `image`, `sourceIds`, `sources`, `googlePlaceId`
- All `null` and empty string values
- `businessStatus` when `OPERATIONAL` (default assumption)
- Empty `hours`, `ratings`, and `links` objects

This reduces file size by ~25-30% compared to the full dataset.

### 6. Extract cuisine metadata

Extracts unique cuisine values from all restaurants for the filter UI:

- Splits comma-separated cuisine values (e.g., "Crossover,Frankrike")
- Filters out non-cuisine terms (Restaurant, Hotel, Bar, etc.)
- Maps variations to canonical names (e.g., "Japanese" → "Asien", "Seafood" → "Fokus på fisk")
- Only includes cuisines with 3+ restaurants
- Outputs sorted by count descending

The frontend imports `cuisines.json` directly to populate the cuisine filter.

---

## CLI

```
pnpm pipeline:optimize
```

The optimize step is also run as part of the full pipeline:

```
pnpm pipeline
```
