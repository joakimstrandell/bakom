# pipeline2 — Data Pipeline

Collects, merges, and scores restaurant/bar/cafe/hotel review data from multiple Swedish sources.

## Structure

```
pipeline2/
  collect.ts              Collect CLI entry point
  merge.ts                Merge CLI entry point
  types.ts                Article, SourceDefinition, SubArticle types
  collect/
    whiteguide.ts         White Guide collector (API)
    dn.ts                 DN Krogkommissionen collector (RSS + Chrome MCP)
    svd.ts                SvD Krogguiden collector (API + JSON-LD)
    michelin.ts           Guide Michelin collector (HTML scraping, restaurants + hotels)
    di.ts                 DI Weekend collector (JSON API)
    krogguiden.ts         Krogguiden.se collector (AJAX + JSON-LD)
  merge/
    merge.ts              Core merge logic (source processing, deduplication)
    match.ts              Fuzzy name/address matching, VenueIndex, slug generation
    venue.ts              Venue type definition (output of merge)
  sources/
    registry.ts           Source registry
    definitions/
      whiteguide.ts       White Guide source definition
      dn.ts               DN source definition
      svd.ts              SvD source definition
      michelin.ts         Michelin source definition
      di.ts               DI Weekend source definition
      krogguiden.ts       Krogguiden.se source definition
  utils/
    fetch.ts              HTTP fetch with retry + rate-limit handling
    save.ts               JSON save/load for articles + data files
    normalize.ts          Shared normalizers (address, venue name, price, city)
  data/
    articles/
      whiteguide-review.json   ~942 guide entries (restaurants, bars, cafes, hotels)
      whiteguide-news.json     ~2400 news articles
      dn-review.json           ~364 review + listing articles
      svd-review.json          ~382 review + listing articles
      michelin.json            ~121 Michelin-listed restaurants + hotels
      di.json                  ~103 DI Weekend restaurant reviews
      krogguiden.json          ~653 Krogguiden.se restaurant listings
    venues.json              ~1670 merged venue records (output of merge)
```

## Usage

```bash
# ── Collect ──
# Collect all enabled sources (normalizes data after collection)
pnpm pipeline2:collect

# Collect a specific source
pnpm pipeline2:collect --source whiteguide-review
pnpm pipeline2:collect --source dn-review
pnpm pipeline2:collect --source svd-review
pnpm pipeline2:collect --source michelin
pnpm pipeline2:collect --source di
pnpm pipeline2:collect --source krogguiden

# Force re-scrape (for incremental collectors)
pnpm pipeline2:collect --source krogguiden --force

# Skip normalization step
pnpm pipeline2:collect --skip-normalize

# ── Merge ──
pnpm pipeline2:merge
```

## Data Model

### Article (collect output)

Every article follows the `Article` type. Key fields:

- `contentType`: `review` (single venue, may have score), `listing` (multi-venue), `mentioned` (no score), `news`
- `score`: Raw numeric rating in the source's native scale (DN: 1-5, Michelin: 0-3). Scale defined on `SourceDefinition.ratingScale`
- `subArticles`: For listings — nested venues with their own name, address, score
- `explicitSubScores`: Dimensional scores normalized to 0-10 (food, service, ambiance, drinks, value)
- `enrichedAt`: Timestamp when article was processed by Chrome MCP enrichment

### Venue (merge output)

One Venue per physical place, with per-source ratings and links. Key fields:

- `id`: URL-safe slug (`"frantzen-stockholm"`)
- `name`: Best name across sources (Michelin > WG > others)
- `address`, `city`: Best available (WG > Michelin > DI > KG)
- `venueType`: `restaurant` | `bar` | `cafe` | `hotel`
- `ratings`: Per-source ratings in native scales (Michelin distinction, WG classification, DN 1-5, SvD 1-6, DI 0-25, KG 1-5)
- `sources`: Array of source references with article IDs, URLs, content types
- `sourceCount`: Number of distinct sources mentioning this venue (1-6)

## Normalization

Normalization runs automatically after every collection (opt out with `--skip-normalize`). Shared normalizers in `utils/normalize.ts`:

| Normalizer | What it does |
|---|---|
| `normalizeAddress` | Strips "Adress:" prefix, phone numbers (incl. en-dashes), trailing dots, website fragments, WG region suffixes |
| `normalizeCity` | Canonical city names (Gothenburg→Göteborg), Stockholm district→Stockholm, rejects region names (Dalarna, Gotland) |
| `normalizeVenueName` | Trims, normalizes smart quotes, strips trailing dots |
| `normalizePriceRange` | Unifies to `budget`/`mellan`/`lyx` across all source formats ($, $$, €€, Mellanklass, Medel, Högt, etc.) |
| `isCityHeader` | Detects city/area names used as false venue names in DN listing sub-articles |

## Merge

Merge combines all collected articles into unified Venue records. Run: `pnpm pipeline2:merge`

### Merge order

Sources are processed in order of structural data quality (richest first):

1. **White Guide** (base) — best coordinates, addresses, venue type classification. Creates ~920 initial venues.
2. **Krogguiden** — large Stockholm coverage. Matches ~144, creates ~509 new.
3. **Michelin** — prestige ratings, hotels. Matches ~93, creates ~28 new.
4. **DI Weekend** — scores + coordinates. Matches ~76, creates ~27 new.
5. **DN** — reviews + listing sub-articles (373 sub-venues). Matches ~478, creates ~99 new.
6. **SvD** — reviews only, no city data → stricter name matching (0.90 threshold). Matches ~189, creates ~88 new.

### Matching strategy

Three tiers of matching via `VenueIndex`:

1. **Exact** — normalized name identical (strips prefixes like "Restaurang", suffixes like "& Bar", punctuation). ~95% of matches.
2. **Fuzzy** — Levenshtein similarity ≥ 0.85, confirmed by address similarity (80% name + 20% address weighting).
3. **City-scoped** — When city is available, search same-city candidates first, then fall back to all.

For sources without city data (SvD), the name threshold is raised to 0.90 to avoid false matches.

### Best-data-wins resolution

| Field | Priority |
|---|---|
| **name** | Michelin > White Guide > DN > SvD > DI > Krogguiden |
| **address** | White Guide > Michelin > DI > Krogguiden > DN > SvD |
| **coordinates** | White Guide (937) > Michelin (45 hotels) > DI (103) |
| **venueType** | White Guide (explicit) > Michelin (hotel override) > "restaurant" default |
| **cuisine** | Merged from all sources, deduplicated |
| **priceRange** | First available in merge order |

### Current merge output

~1670 venues:
- By source count: 1279×1, 215×2, 100×3, 42×4, 31×5, 3×6
- By type: 1235 restaurants, 223 cafes, 147 hotels, 65 bars
- With coordinates: 984
- Top cities: Stockholm (780), Göteborg (104), Malmö (63)

## Adding a New Source

1. Create source definition in `sources/definitions/{source}.ts`
2. Register it in `sources/registry.ts`
3. Create collector in `collect/{source}.ts`
4. Add collector to `COLLECTORS` map in `collect.ts`
5. Add data file to `DATA_FILES` array in `collect.ts`

---

## Source: White Guide

**Source ID**: `whiteguide-review`, `whiteguide-news`
**Prestige**: prestige
**Method**: Public API (`admin.whiteguide.com/api/search/detailed`)

### Reviews (guide entries)

Fetches all rated venues from the White Guide API across four venue types: restaurant, bar, cafe, hotel. Each API call returns all venues of that type with:

- Venue name, address, coordinates (lat/lng)
- Classification label (e.g. "Grand Award", "Very Good")
- Dimensional sub-scores: food (max 39), service (max 20), environment (max 20), drink (max 20)
- Cuisine tags

Sub-scores are normalized to 0-10 scale. White Guide does not use a single numeric rating — venues are ranked by classification labels stored in `tags`.

**Output**: `whiteguide-review.json` (~942 entries)

### News

Paginated API (`admin.whiteguide.com/api/articles`), sorted by publish date descending. Stops at cutoff date (2025-01-01).

**Output**: `whiteguide-news.json` (~2400 articles)

---

## Source: DN Krogkommissionen

**Source ID**: `dn-review`
**Prestige**: professional
**Rating scale**: 1-5
**Method**: RSS discovery + Chrome MCP enrichment

### Collection (Step 1: RSS)

The collector discovers articles via the public RSS feed at `dn.se/rss/om/krogkommissionen/`. For each new URL it scrapes public metadata (title, date, og:description) — the article body is behind DN's paywall.

Articles where the title matches `"VenueName: headline"` get `contentType: "review"` with `venueName` extracted. Everything else gets `contentType: "listing"`.

### Enrichment (Step 2: Chrome MCP)

Since DN is paywalled, full article data requires a logged-in browser session. Enrichment is done via Chrome MCP (Claude in Chrome extension) with a same-origin fetch from dn.se:

1. Inject parser functions (`_dnParse`, `_dnBatch`) into a Chrome tab on dn.se
2. Batch-fetch article URLs via `fetch()` (same-origin, uses existing session cookies)
3. Parse HTML with DOMParser: extract score (Betyg), address, price class
4. For listings (articles with 2+ venue h2 headings): extract `subArticles` with per-venue scores and addresses
5. Apply results to `dn-review.json` and set `enrichedAt`

**Output**: `dn-review.json` (~364 articles)

---

## Source: SvD Krogguiden

**Source ID**: `svd-review`
**Prestige**: professional
**Rating scale**: 1-6
**Method**: API discovery + JSON-LD scraping (no browser needed)

SvD publishes restaurant reviews under the "Krogguiden" brand. Anonymous critics rate on a 1-6 scale. Single-venue reviews only.

### Collection

1. **Discovery**: Paginated API at `svd.se/api/topic-backfill/story/krogguiden` returns HTML with article URLs
2. **Scraping**: Each article page has `<script type="application/ld+json">` with `@type: "Review"` + `itemReviewed: { @type: "Restaurant" }`. Publicly accessible. Provides name, address, rating (1-6), `servesCuisine` (actually price class), publish date
3. **No enrichment needed**: All structured data is in the JSON-LD
4. **Incremental**: Skips already-collected URLs. Non-review URLs saved as stubs to prevent re-scraping

**Note**: SvD articles have no city data — matching relies on name only (with stricter 0.90 threshold).

**Output**: `svd-review.json` (~382 articles: 277 with scores, 105 stubs)

---

## Source: Guide Michelin

**Source ID**: `michelin`
**Prestige**: prestige
**Rating scale**: 0-3 (0=Selected, 0.5=Bib Gourmand, 1-3=Stars/Keys)
**Method**: HTML scraping (listing pages + detail pages)

Michelin Guide Sweden listings. Restaurants (Stars/Bib Gourmand/Selected) and Hotels (Keys/Selected).

### Collection

Two-pass scraping:

1. **Restaurant listings**: Paginated HTML from `guide.michelin.com/se/en/selection/sweden/restaurants`. Extracts name, distinction (stars/Bib Gourmand/Selected from icon images), city, cuisine, price range (€-€€€€), URL
2. **Hotel listings**: Single page from `guide.michelin.com/se/en/hotels-stays/sweden`. Extracts name, distinction (Keys from icon images), city (from `data-dtm-city`), coordinates (`data-lat`/`data-lng`), guest score
3. **Detail pages**: Each entry's detail page enriches with full address and accurate cuisine data
4. **Non-Swedish filter**: Drops international hotels that appear on the Sweden page but lack a Swedish address

### Address / city handling

Michelin addresses: `"Street, City, PostalCode, Sweden"`. The collector:
- Extracts city from the part before the postal code (or last part if no postal code)
- Normalizes city names (Gothenburg→Göteborg, Malmö, Stockholm districts→Stockholm)
- Strips country, postal code, and city from the address field

### Distinction storage

Stored as both a numeric `score` (0-3 scale) and a `tags` entry:
- Restaurants: `selected` (0), `bib_gourmand` (0.5), `1_star`-`3_star` (1-3)
- Hotels: `selected` (0), `1_key`-`3_key` (1-3)

**Output**: `michelin.json` (~121 entries: 76 restaurants, 45 hotels)

---

## Source: DI Weekend

**Source ID**: `di`
**Prestige**: professional
**Rating scale**: 0-25 (total of food + environment + service)
**Method**: JSON API (single request)

DI Weekend restaurant guide. Single JSON API endpoint returns all restaurants (~140, primarily Stockholm/Göteborg).

### Collection

1. **Fetch**: Single POST to `di.se/pang-ms/widgets/RestaurantGuide/` returns all entries in a cols/rows tabular format
2. **Parse**: Maps column indices to fields (name, address, city, scores, price, coordinates, URL, date)
3. **Sub-scores**: Food (max 15), Environment (max 5), Service (max 5) — normalized to 0-10 scale
4. **Snapshot mode**: Always re-fetches everything (~3 seconds)

### Price mapping

DI uses: Lågt→budget, Medel→mellan, Högt/Mycket högt→lyx

**Output**: `di.json` (~103 restaurant reviews)

---

## Source: Krogguiden.se

**Source ID**: `krogguiden`
**Prestige**: professional
**Rating scale**: 1-5 (aggregate rating, often decimal like 3.8)
**Method**: AJAX pagination + JSON-LD detail page scraping

Stockholm-focused restaurant guide. ~680 restaurants with ratings, price classes, and cuisine types.

### Collection

Two-phase scrape:

1. **Slug discovery**: AJAX POST pagination at `krogguiden.se/ajax/getMoreListRestaurants` discovers restaurant slugs. Supplemented by search endpoint for any missed
2. **Detail pages**: Each restaurant page at `/restauranger/view/{slug}` has `<script type="application/ld+json">` with `@type: "Restaurant"` providing name, address, city, price range, cuisine, rating
3. **Incremental**: Skips already-collected slugs. `--force` re-scrapes everything

### Price mapping

Krogguiden uses dollar signs: $→budget, $$→mellan, $$$+→lyx

### Notes

- 307 of ~680 restaurants have no score (null rating)
- 22 Gotland restaurants have empty city (normalizer rejects "Gotland" as a region name; actual town is preserved in `tags`)
- Some entries lack JSON-LD data and are skipped (~34)

**Output**: `krogguiden.json` (~653 restaurant listings)

---

## Roadmap

### Phase 1: Collect ✅

All 6 source collectors are built and operational. ~2,565 articles collected. Normalization runs after each collection.

### Phase 2: Merge ✅

Articles merged into ~1,670 unified Venue records. Fuzzy name + address matching with city-scoped fallback. 3 venues have ratings from all 6 sources.

### Phase 3: Refine (next)

Enrich venues with **Google Places API** data:

- **Canonical address & coordinates**: Resolve address conflicts between sources. Fill in missing coordinates (686 venues currently without).
- **Google Place ID**: Stable identifier for deduplication confidence (merge only catches ~600 overlaps; Google will catch more via address resolution).
- **Google rating + review count**: Additional signal for scoring.
- **Business status**: Detect permanently closed venues.
- **Missing data**: Opening hours, phone, website from Google.

This phase requires a Google Places API key. Process:
1. For each venue, search Google Places by name + address + city
2. Match the top result by name similarity + address proximity
3. Store `googlePlaceId`, `googleRating`, `googleRatingCount`, `businessStatus`, resolved coordinates
4. Run deduplication pass: merge venues that resolve to the same Google Place ID

### Phase 4: Score

Compute a composite score for each venue based on all source ratings + Google rating.

- Normalize each source's native scale to 0-10 (DN 1-5, SvD 1-6, Michelin 0-3, DI 0-25, Krogguiden 1-5, WG classification labels)
- Weight by source prestige (Michelin 28% > WG 20% > SvD/DN/DI/KG 16% each)
- Factor in recency, number of sources, dimensional sub-scores
- Produce `bakomScore` (0-100), `bakomRank` (global), `bakomRankRegion` (per metro area)
- Store both the composite score and all individual source scores on each venue

### Phase 5: Optimize (frontend output)

Transform venue data for efficient frontend consumption. Exact format TBD, but considerations:

- **Split by venue type**: Separate outputs for restaurants vs hotels (different UI, different scoring)
- **List vs detail split**: Lightweight list payload (name, city, score, coordinates, price, cuisine) for map/list view, full detail payload (all reviews, sub-scores, links) loaded on demand per venue
- **Output format**: Static JSON files (simplest), or a lightweight DB (SQLite, Turso) if query flexibility is needed
- **Geographic indexing**: Group by city/area for fast filtering
- **Search index**: Pre-built search index for venue name / cuisine / area fuzzy search
- **Incremental builds**: Only regenerate output for venues whose source data changed
