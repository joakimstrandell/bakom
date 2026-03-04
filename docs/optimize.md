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

---

## Processing Steps

### 1. Filter closed restaurants

Removes restaurants with `businessStatus` set to `CLOSED_PERMANENTLY`
or `CLOSED_TEMPORARILY`. These are kept in `data/restaurants.json` (so
enrichment data survives merge re-runs) but excluded from the frontend.

Business status comes from Google Places enrichment in the
[refine step](./refine.md).

### 2. Assign metro region

Each restaurant gets a `metroRegion` field based on coordinates (distance from city center):

| Region | Center | Radius |
|--------|--------|--------|
| `stockholm` | 59.33°N, 18.07°E | 50 km |
| `gothenburg` | 57.71°N, 11.97°E | 40 km |
| `malmo` | 55.60°N, 13.00°E | 50 km |
| `sweden` | Outside all metro areas | — |

### 3. Calculate rankings

**Global ranking:** All restaurants get a `bakomRank` (1, 2, 3...) based on
Bakom Score across all of Sweden.

**Per-region ranking:** Restaurants in metro areas (Stockholm, Gothenburg,
Malmö) also get a `bakomRankRegion` — their rank within that metro area only.
Restaurants in `sweden` (outside metro areas) do not have a regional rank.

### 4. Strip pipeline-only fields

- `slug`, `image`, `sourceIds`, `sources`, `googlePlaceId`
- All `null` and empty string values
- `businessStatus` when `OPERATIONAL` (default assumption)
- Empty `hours`, `ratings`, and `links` objects

This reduces file size by ~25-30% compared to the full dataset.

---

## CLI

```
npm run pipeline:optimize
```

The optimize step is also run as part of the full pipeline:

```
npm run pipeline
```
