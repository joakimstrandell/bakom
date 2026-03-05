# Collect

The collect step fetches restaurant data from external sources and saves
each result to `data/raw/{source}.json`. Each source produces its own raw
file. Collection is independent from merge, scoring, and enrichment.

Source file: [`pipeline/collect.ts`](../pipeline/collect.ts)

---

## Sources

### Pre-merge sources

These sources provide primary restaurant data that is combined in the merge step:

| Source | Type | Speed | Scale | Output |
|--------|------|-------|-------|--------|
| Krogguiden | HTML scraper | ~7 min | ~680 restaurants | `data/raw/krogguiden.json` |
| Michelin | HTML scraper | ~30s | ~76 restaurants | `data/raw/michelin.json` |
| White Guide | JSON API | ~2s | ~530 restaurants | `data/raw/whiteguide.json` |
| SvD | HTML scraper | ~2-3 min | ~280 reviews | `data/raw/svd.json` |
| DN | HTML scraper | ~1-2 min | ~60 reviews | `data/raw/dn.json` |
| DI Weekend | JSON API | ~3s | ~140 restaurants | `data/raw/di.json` |

### Post-merge sources

These sources enrich existing restaurants and require `data/restaurants.json`:

| Source | Type | Speed | Scale | Output |
|--------|------|-------|-------|--------|
| Google | API | ~15 min | ~1100 restaurants | `data/raw/google.json` |

---

## CLI Usage

### Run all pre-merge sources

```
pnpm pipeline:collect
```

Runs all 6 pre-merge sources sequentially. Fast APIs always re-fetch. Slow
scrapers run in incremental mode (only new items).

### Run a single source

```
pnpm pipeline:collect --source krogguiden
pnpm pipeline:collect --source michelin
pnpm pipeline:collect --source whiteguide
pnpm pipeline:collect --source svd
pnpm pipeline:collect --source dn
pnpm pipeline:collect --source di
pnpm pipeline:collect --source google  # requires restaurants.json
```

### Force full re-fetch

```
pnpm pipeline:collect --force
pnpm pipeline:collect --source krogguiden --force
```

The `--force` flag overrides incremental mode for slow scrapers, causing
a complete re-scrape from scratch.

---

## Incremental Mode

By default, slow HTML scrapers run in **incremental mode**: they load
existing data from `data/raw/{source}.json`, identify which items have
already been scraped, and only fetch new items. This avoids unnecessary
HTTP requests and keeps scrape times short on subsequent runs.

Fast API sources (White Guide, DI Weekend) **always re-fetch** because
the entire dataset comes from a single HTTP request in under 5 seconds.

| Source | Default behavior | With `--force` |
|--------|-----------------|----------------|
| Krogguiden | Incremental (by slug) | Full re-scrape |
| Michelin | Skip if data exists | Full re-scrape |
| White Guide | Always re-fetch | Always re-fetch |
| SvD | Incremental (by articleId) | Full re-scrape |
| DN | Incremental (by slug) | Full re-scrape |
| DI Weekend | Always re-fetch | Always re-fetch |
| Google | Incremental (by restaurantId) | Full re-fetch |

---

## Source Details

### Krogguiden

- **URL:** `krogguiden.se`
- **Method:** AJAX pagination to discover slugs, then scrape individual detail pages
- **Data:** JSON-LD structured data (name, address, rating, cuisine, hours)
- **Incremental key:** `slug` — skips restaurants already in `krogguiden.json`
- **Rate limit:** 3 concurrent requests, 2s minimum delay
- **Collector:** [`pipeline/collect/krogguiden.ts`](../pipeline/collect/krogguiden.ts)

### Michelin

- **URL:** `guide.michelin.com/se/en/stockholm-region/restaurants`
- **Method:** Scrape listing page for all restaurants, then enrich from detail pages
- **Data:** Name, distinction (Selected → 3 stars), address, cuisine, price range
- **Incremental:** Skips entire scrape if `michelin.json` already exists with data
- **Rate limit:** Sequential, 2s delay between detail pages
- **Collector:** [`pipeline/collect/michelin.ts`](../pipeline/collect/michelin.ts)

### White Guide

- **URL:** `admin.whiteguide.com/api/search/detailed`
- **Method:** Single API request returns all Stockholm restaurants
- **Data:** Name, address, classification, sub-scores (food/drink/service/environment), coordinates
- **Incremental:** N/A (always re-fetches, ~2s)
- **Collector:** [`pipeline/collect/whiteguide.ts`](../pipeline/collect/whiteguide.ts)

### SvD (Svenska Dagbladet)

- **URL:** `svd.se/api/topic-backfill/story/krogguiden`
- **Method:** Paginated API for article URLs, then scrape each article for JSON-LD
- **Data:** Restaurant name, address, cuisine, rating (1-6 scale), article URL
- **Incremental key:** `articleId` — skips articles already in `svd.json`
- **Rate limit:** Sequential, 2s delay between articles
- **Collector:** [`pipeline/collect/svd.ts`](../pipeline/collect/svd.ts)

### DN (Dagens Nyheter)

- **URL:** `dn.se/om/krogkommissionen/?page=1` through `?page=9`
- **Method:** Chrome MCP browser scraping (paywall requires DN login session).
  Article URLs are collected from the topic listing pages, then each article is
  fetched to extract the `.ds-factbox` element containing structured review data.
  Older articles (pre-2022) use `/sthlm/` URL paths instead of `/kultur/`.
- **Data:** Restaurant name, score (0-5), address, price class, website, contact,
  hours, article URL, publish date
- **Incremental key:** `slug` — skips articles already in `dn.json`
- **Rate limit:** Sequential with 300ms delay every 5 requests
- **Note:** Cannot be automated via CLI due to paywall. Must be run via Chrome MCP
  with a logged-in DN session. See `pipeline/collect/dn.ts` for the original
  RSS-based scraper (limited to basic metadata only).
- **Collector:** Chrome MCP (manual), [`pipeline/collect/dn.ts`](../pipeline/collect/dn.ts) (legacy)

### DI Weekend (Dagens Industri)

- **URL:** `di.se/pang-ms/widgets/RestaurantGuide/`
- **Method:** Single API request returns all reviewed restaurants (cols/rows format)
- **Data:** Name, address, total score (0-25), sub-scores (food/environment/service), coordinates
- **Incremental:** N/A (always re-fetches, ~3s)
- **Collector:** [`pipeline/collect/di.ts`](../pipeline/collect/di.ts)

### Google (post-merge)

- **URL:** `places.googleapis.com/v1/places:searchText`
- **Requires:** `GOOGLE_PLACES_API_KEY` environment variable, `data/restaurants.json`
- **Method:** Text Search API for each restaurant name + city
- **Data:** Address (with postal code/city), phone, website, hours, rating, review count,
  coordinates, business status, Google Maps URL, primaryType (for cuisine fallback)
- **Incremental key:** `restaurantId` — skips restaurants already in `google.json`
- **Rate limit:** Sequential, 200ms delay between requests
- **Non-Swedish filtering:** Rejects matches to non-Swedish addresses (København, Danmark, etc.)
- **Collector:** [`pipeline/collect/google.ts`](../pipeline/collect/google.ts)

---

## Output

Each source writes a typed JSON array to `data/raw/{source}.json`:

| File | Type |
|------|------|
| `data/raw/krogguiden.json` | `KrogguidenRaw[]` |
| `data/raw/michelin.json` | `MichelinRaw[]` |
| `data/raw/whiteguide.json` | `WhiteGuideRaw[]` |
| `data/raw/svd.json` | `SvdRaw[]` |
| `data/raw/dn.json` | `DnRaw[]` |
| `data/raw/di.json` | `DiRaw[]` |
| `data/raw/google.json` | `GoogleRaw[]` |

Types are defined in [`pipeline/types.ts`](../pipeline/types.ts).

Pre-merge raw files are consumed by the merge step, which combines them into
a single `data/restaurants.json` with fuzzy matching and deduplication.

The Google raw file is applied in the refine step to enrich existing restaurants
with address, contact info, coordinates, and ratings.
