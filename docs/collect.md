# Collect

The collect step fetches restaurant data from external sources and saves
each result to `data/raw/{source}.json`. Each source produces its own raw
file. Collection is independent from merge, scoring, and enrichment.

Source file: [`pipeline/collect.ts`](../pipeline/collect.ts)

---

## Sources

| Source | Type | Speed | Scale | Output |
|--------|------|-------|-------|--------|
| Krogguiden | HTML scraper | ~7 min | ~850 restaurants | `data/raw/krogguiden.json` |
| Michelin | HTML scraper | ~30s | ~41 restaurants | `data/raw/michelin.json` |
| White Guide | JSON API | ~2s | ~200 restaurants | `data/raw/whiteguide.json` |
| SvD | HTML scraper | ~2-3 min | ~150 reviews | `data/raw/svd.json` |
| DN | HTML scraper | ~1-2 min | ~80 reviews | `data/raw/dn.json` |
| DI Weekend | JSON API | ~3s | ~100 restaurants | `data/raw/di.json` |

---

## CLI Usage

### Run all sources

```
npm run pipeline:collect
```

Runs all 6 sources sequentially. Fast APIs always re-fetch. Slow scrapers
run in incremental mode (only new items).

### Run a single source

```
npm run pipeline:collect --source krogguiden
npm run pipeline:collect --source michelin
npm run pipeline:collect --source whiteguide
npm run pipeline:collect --source svd
npm run pipeline:collect --source dn
npm run pipeline:collect --source di
```

### Force full re-fetch

```
npm run pipeline:collect --force
npm run pipeline:collect --source krogguiden --force
```

The `--force` flag overrides incremental mode for slow scrapers, causing
a complete re-scrape from scratch.

### Backward-compatible individual scripts

```
npm run pipeline:krogguiden [--force]
npm run pipeline:michelin [--force]
npm run pipeline:whiteguide
npm run pipeline:svd [--force]
npm run pipeline:dn [--force]
npm run pipeline:di
```

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

- **URL:** `dn.se/rss/om/krogkommissionen/`
- **Method:** RSS feed for article URLs, then scrape each article for restaurant name
- **Data:** Restaurant name, article URL, publish date (boolean review, no numeric rating)
- **Incremental key:** `slug` — skips articles already in `dn.json`
- **Rate limit:** Sequential, 1.5s delay between articles
- **Collector:** [`pipeline/collect/dn.ts`](../pipeline/collect/dn.ts)

### DI Weekend (Dagens Industri)

- **URL:** `di.se/pang-ms/widgets/RestaurantGuide/`
- **Method:** Single API request returns all reviewed restaurants (cols/rows format)
- **Data:** Name, address, total score (0-25), sub-scores (food/environment/service), coordinates
- **Incremental:** N/A (always re-fetches, ~3s)
- **Collector:** [`pipeline/collect/di.ts`](../pipeline/collect/di.ts)

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

Types are defined in [`pipeline/types.ts`](../pipeline/types.ts).

These raw files are consumed by the merge step, which combines them into
a single `data/restaurants.json` with fuzzy matching and deduplication.
