# Data Pipeline

Collects, merges, and scores restaurant/bar/cafe/hotel review data from multiple Swedish sources.

## Structure

```
pipeline/
  types.ts                Article, SourceDefinition, SubArticle types
  collect/
    index.ts              Collect CLI entry point
    whiteguide.ts         White Guide collector (API)
    dn.ts                 DN Krogkommissionen collector (RSS + Chrome MCP)
    svd.ts                SvD Krogguiden collector (API + JSON-LD)
    michelin.ts           Guide Michelin collector (HTML scraping, restaurants + hotels)
    di.ts                 DI Weekend collector (JSON API)
    krogguiden.ts         Krogguiden.se collector (AJAX + JSON-LD)
    falstaff.ts           Falstaff collector (reads cached falstaff-raw.json)
  merge/
    index.ts              Merge CLI entry point
    merge.ts              Core merge logic (source processing, deduplication)
    match.ts              Fuzzy name/address matching, VenueIndex, slug generation
    venue.ts              Venue type definition (output of merge)
  refine/
    index.ts              Refine CLI entry point (--force, --id flags)
    google.ts             Google Places enrichment, cleanup, categorization, metro regions
    (quote extraction is a Claude Code skill: /refine-quotes)
  score/
    index.ts              Score CLI entry point
    score.ts              Scoring engine (normalize, weight, dampen, rank)
  optimize/
    index.ts              Optimize CLI entry point
    optimize.ts           Frontend JSON shaping, cuisine mapping, split by category
  sources/
    registry.ts           Source registry
    definitions/          Per-source definitions (whiteguide, dn, svd, michelin, di, krogguiden, falstaff)
  utils/
    fetch.ts              HTTP fetch with retry + rate-limit handling
    save.ts               JSON save/load for articles + data files
    normalize.ts          Shared normalizers (address, venue name, price, city)
  .data/
    articles/             Raw collected articles per source
    falstaff-raw.json     Cached Falstaff scrape (Chrome-based, Cloudflare-protected)
    venues-merged.json    Merged venue records (with quotes)
    venues-refined.json   Google-enriched venues (with sourceHash for incremental)
    venues-scored.json    Scored + ranked venues
    google-lookups.json   Persistent Google API lookup cache (avoids re-querying)
    known-merges.json     Dedup aliases from Google Place ID (fed back to merge)
    restaurants.frontend.json  ~1,342 restaurants (frontend-ready)
    hotels.frontend.json       ~179 hotels (frontend-ready)
```

## Usage

```bash
# ── Collect (Step 1: Automated scripts) ──
# Collect all enabled sources (normalizes data after collection)
pnpm pipeline:collect

# Collect a specific source
pnpm pipeline:collect --source whiteguide-review
pnpm pipeline:collect --source svd-review
pnpm pipeline:collect --source michelin
pnpm pipeline:collect --source di
pnpm pipeline:collect --source krogguiden
pnpm pipeline:collect --source falstaff

# Force re-scrape (for incremental collectors)
pnpm pipeline:collect --source krogguiden --force

# Skip normalization step
pnpm pipeline:collect --skip-normalize

# ── Collect (Step 2: Manual MCP skills) ──
# These require Chrome MCP (Claude in Chrome extension) with a logged-in browser.
# Run via Claude Code skills:
/scrape-falstaff                      # Falstaff (Cloudflare-protected)
/enrich-quotes --source dn            # DN (paywalled, requires login)
/enrich-quotes --source di            # DI (blocks server-side HTTP)

# ── Merge ──
pnpm pipeline:merge

# ── Refine (Step 1: Google Places enrichment) ──
pnpm pipeline:refine

# ── Refine (Step 2: LLM quote extraction) ──
# Run via Claude Code skill (Claude extracts quotes inline, no API cost):
/refine-quotes
/refine-quotes --limit 50    # Process at most 50 venues
/refine-quotes --force       # Re-extract all quotes

# ── Score ──
pnpm pipeline:score

# ── Optimize ──
pnpm pipeline:optimize
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
- `ratings`: Per-source ratings in native scales (Michelin distinction, WG classification, DN 1-5, SvD 1-6, DI 0-25, KG 1-5, Falstaff 0-100)
- `sources`: Array of source references with article IDs, URLs, content types
- `sourceCount`: Number of distinct sources mentioning this venue (1-7)
- `quotes`: Per-source editorial text, each with `sourceId`, `text` (full bodyText), `publishedAt`, `url`. After LLM refinement, each quote also has an `excerpt` (short extracted quote, ~1-2 sentences)

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

Merge combines all collected articles into unified Venue records. Run: `pnpm pipeline:merge`

### Merge order

Sources are processed in order of structural data quality (richest first):

1. **White Guide** (base) — best coordinates, addresses, venue type classification. Creates ~919 initial venues.
2. **Krogguiden** — large Stockholm coverage. Matches ~144, creates ~509 new.
3. **Michelin** — prestige ratings, hotels. Matches ~93, creates ~28 new.
4. **DI Weekend** — scores + coordinates. Matches ~76, creates ~27 new.
5. **DN** — reviews + listing sub-articles (373 sub-venues). Matches ~478, creates ~99 new.
6. **SvD** — reviews only, no city data → stricter name matching (0.90 threshold). Matches ~189, creates ~88 new.
7. **Falstaff** — Austrian-origin gourmet guide, 745 Swedish restaurants. Matches ~461, creates ~284 new.

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
| **quotes** | One per source (first bodyText seen), from: Michelin, White Guide, Falstaff, DN, SvD, DI |

### Current merge output

~1954 venues:
- By source count: 1334×1, 376×2, 123×3, 58×4, 36×5, 25×6, 2×7
- By type: 1519 restaurants, 223 cafes, 147 hotels, 65 bars
- With coordinates: 984
- Top cities: Stockholm (830), Göteborg (123), Malmö (83)

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

After API collection, the collector makes a second pass to fetch review text (bodyText) from each venue's detail page on whiteguide.com. The `.review` div contains the editorial review text.

**Output**: `whiteguide-review.json` (~942 entries, ~99% with bodyText)

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
3. **bodyText**: Pre-paywall article paragraphs are extracted from the same HTML during collection (no separate enrichment step needed)
4. **Incremental**: Skips already-collected URLs. Non-review URLs saved as stubs to prevent re-scraping

**Note**: SvD articles have no city data — matching relies on name only (with stricter 0.90 threshold). bodyText is partial (pre-paywall only).

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

## Source: Falstaff

**Source ID**: `falstaff`
**Prestige**: professional
**Rating scale**: 0–100 (with fork ratings 0–4 as fallback)
**Method**: Cached raw data (Cloudflare-protected site requires Chrome-based scraping)

Austrian-origin gourmet guide rating Swedish restaurants. ~745 restaurants with scores (0–100 scale) and fork ratings (0–4 forks).

### Collection

Falstaff.com is protected by Cloudflare and blocks direct HTTP requests. The collector reads from a cached `falstaff-raw.json` file that must be scraped separately via a Chrome-based browser scraper.

1. **Raw data format**: Array of `{ name, url, score, address, cuisine, forks }`
2. **Score handling**: Uses numeric score (80–100) when available, otherwise converts forks to estimated score (0 forks = 55, 4 forks = 95)
3. **Address parsing**: Handles Falstaff format `"Street, PostalCode City, Sweden"` — strips postal codes and country

### Notes

- Listing page: `https://www.falstaff.com/en/listings/the-best-restaurants-in-sweden`
- 461 matched to existing venues, 284 created as new entries
- Score range in practice: 80–100 (top-rated) with fork-based estimates filling gaps

**Output**: `falstaff.json` (~745 restaurant reviews)

---

### Phase 1: Collect ✅

Two-step collection process:

**Step 1 — Automated scripts** (`pnpm pipeline:collect`): All source collectors run as Node.js scripts. Michelin, White Guide, and SvD fetch editorial bodyText inline during collection. Normalization runs after each collection.

**Step 2 — Manual MCP skills**: Sources that require a real browser (Cloudflare protection, paywalls, HTTP blocking) are collected via Chrome MCP skills:
- `/scrape-falstaff` — Falstaff venues + bodyText (Cloudflare-protected)
- `/enrich-quotes --source dn` — DN article text (paywalled, requires login)
- `/enrich-quotes --source di` — DI article text (blocks server-side HTTP)

### Phase 2: Merge ✅

Articles merged into unified Venue records. Fuzzy name + address matching with city-scoped fallback. The merge step carries `bodyText` from articles into per-venue `quotes[]` (one per source, with sourceId, full text, publishedAt, and URL).

### Phase 3: Refine ✅

Two-step refinement:

**Step 1 — Google Places enrichment** (`pnpm pipeline:refine`): Enriches venues with Google Places API data.

**Google Places Text Search** for each venue:
- Searches by `"{name}, {city}, Sweden"` with city-based location bias (50 km radius)
- Food-type retry: if the first result has a non-food `primaryType`, retries with `"Restaurant {name}, {city}, Sweden"` (or `"Bar"` for bars)
- Always overwrites coordinates — Google is the most accurate source
- Backfills missing city from Google's formatted address

**Enrichment fields added**: `googlePlaceId`, `googleRating`, `googleRatingCount`, `googleMapsUri`, `googlePrimaryType`, `businessStatus`, `hours` (opening hours), `website`, `phone`

**Incremental processing**: Hash-based staleness detection. If `venues-merged.json` hasn't changed since last run, skips already-enriched venues. A persistent lookup cache (`google-lookups.json`) tracks all Google API queries — including "not found" results — so venues are never queried twice. Progress saved every 100 venues for crash recovery. `--force` re-fetches all (ignores cache). `--id {venue-id}` targets a single venue. `--backfill` re-fetches only venues that have a Google Place ID but are missing hours, website, or phone.

**Post-enrichment passes**:
1. **Deduplication**: Merges venues that resolve to the same Google Place ID (sources, ratings, and metadata merged into the venue with the most sources)
2. **Cleanup**: Removes venues without Google data, venues outside Sweden (bounding box check + address keyword filter for Denmark/Norway), and permanently/temporarily closed venues
3. **Metro region assignment**: Haversine distance to Stockholm (50 km), Göteborg (40 km), Malmö (50 km). Everything else → `"sweden"`
4. **Venue categorization**: `restaurant` (food-related Google types), `hotel` (hotel/resort/inn/lodging/hostel), or `exclude` (non-food types that survived retry, e.g. camping, museum)

**Output**: `venues-refined.json` (~1,566 venues with `sourceHash` for incremental detection)

**Step 2 — LLM quote extraction** (`/refine-quotes`): A Claude Code skill where Claude reads `venues-refined.json` and extracts short, representative editorial quotes from the full `bodyText` stored in each venue's `quotes[]`. For each quote, Claude picks the most vivid 1-2 sentence excerpt and stores it as `excerpt` alongside the original `text`. No API cost — Claude processes quotes inline. Supports `--limit N` and `--force` flags. Saves progress incrementally.

### Phase 4: Score ✅

Computes a composite **Bakom Score** (0–100) for each venue. Run: `pnpm pipeline:score`

**Normalization** (all sources → internal 0–10 scale):

| Source | Scale | Method |
|---|---|---|
| Michelin | Distinction → 0–10 | `selected` 7.5, `bib_gourmand` 8.0, `1_star`/`1_key` 9.0, `2_star`/`2_key` 9.5, `3_star`/`3_key` 10.0 |
| White Guide | Classification → 0–10 | `God nivå` 6.5 → `Global exceptionell nivå` 10.0 |
| DN | 0–5 → 0–10 | Linear: `score / 5 * 10` |
| SvD | 1–6 → 0–10 | Linear: `score / 6 * 10` |
| DI | 0–25 → 0–10 | Linear: `score / 25 * 10` |
| Krogguiden | 1–5 → 0–10 | Linear: `score / 5 * 10` |
| Falstaff | 0–100 → 0–10 | Linear: `score / 100 * 10` |
| Google | 1–5 → 0–10 | Bayesian dampening: `confidence * raw + (1 - confidence) * prior`, where `confidence = min(1, reviewCount / 100)` and `prior = 7.0` |

**Weighted average**: Michelin 28%, WG 20%, SvD 16%, DI 16%, Krogguiden 16%, Falstaff 14%, DN 14%, Google 10%. Only present sources participate. All sources are always included in the average.

**Time decay**: Editorial reviews older than 3 years lose 15% weight per additional year (floor: 40% weight at 7+ years). No-date reviews get full weight.

**Diversity dampening**: 1 source → ×0.88, 2 sources → ×0.95, 3+ sources → ×1.0.

**Prestige ceilings**: No Michelin AND no WG → max 80. Has WG OR Michelin selected/bib → max 95. Michelin 1★+/1🔑+ → no ceiling.

**Perfection requirement**: Score 100 requires Michelin 1★+ (or 1🔑+) AND all sources ≥ 9.5.

**Ranking**: Separate ranks per category (restaurant vs hotel). National rank + metro region rank (Stockholm, Göteborg, Malmö).

**Output**: `venues-scored.json` (~1,566 scored + ranked venues)

### Phase 5: Optimize ✅

Shapes scored venues into frontend-ready JSON. Run: `pnpm pipeline:optimize`

**Transforms**:
- Maps pipeline internal types → frontend `FrontendVenue` type
- Extracts source links from `SourceReference[]` → flat `links` record (`{ michelin: url, whiteguide: url, ... }`)
- Maps `googlePrimaryType` → Swedish cuisine labels (e.g. `italian_restaurant` → `"Italienskt"`, ~50 mappings)
- Maps WG classification labels → normalized keys (`"MÄSTARKLASS"` → `"master_class"`)
- Strips internal fields (`articleIds`, `mergedAt`, `normalizedRatings`, `sourceHash`, etc.)

**Filtering**:
- Removes venues with no ratings from any source (mentioned in articles but never scored)
- Splits by category: `restaurant` (includes bars, cafes) and `hotel` (includes inns, resorts)
- Excludes non-venue categories (`exclude`)

**Output**:
- `restaurants.frontend.json` — ~1,342 restaurants sorted by rank
- `hotels.frontend.json` — ~179 hotels sorted by rank
