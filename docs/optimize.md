# Optimize

The optimize step filters closed restaurants, splits by region, calculates
per-region rankings, and generates size-stripped frontend JSON files.

Source file: [`pipeline/process/optimize.ts`](../pipeline/process/optimize.ts)

---

## Input / Output

| File | Direction | Content |
|------|-----------|---------|
| `data/restaurants.json` | Input | Full pipeline dataset (includes closed) |
| `data/restaurants.stockholm.frontend.json` | Output | Stockholm region |
| `data/restaurants.gothenburg.frontend.json` | Output | Göteborg region |
| `data/restaurants.malmo.frontend.json` | Output | Malmö region |
| `data/restaurants.sweden.frontend.json` | Output | Rest of Sweden |

---

## Processing Steps

### 1. Filter closed restaurants

Removes restaurants with `businessStatus` set to `CLOSED_PERMANENTLY`
or `CLOSED_TEMPORARILY`. These are kept in `data/restaurants.json` (so
enrichment data survives merge re-runs) but excluded from the frontend.

Business status comes from Google Places enrichment in the
[refine step](./refine.md).

### 2. Split by region

Restaurants are categorized into 4 regions based on coordinates (distance from city center):

| Region | Center | Radius |
|--------|--------|--------|
| Stockholm | 59.33°N, 18.07°E | 50 km |
| Göteborg | 57.71°N, 11.97°E | 40 km |
| Malmö | 55.60°N, 13.00°E | 50 km |
| Rest of Sweden | Outside all metro areas | — |

### 3. Calculate per-region rankings

Each region gets its own `bakomRank` (1, 2, 3...) based on Bakom Score
within that region. This ensures every region has a #1 restaurant.

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
