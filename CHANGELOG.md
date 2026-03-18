# Changelog

All notable changes to Bakom will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-03-18

### Added
- Thatsup as data source: 3,312 venues scraped via JSON-LD from thatsup.se (17 cities, 4 categories)
- Thatsup rating display in detail panel with star rating and review count
- Thatsup range filter (0-5 scale) in filter panel
- Incremental Google Places enrichment with `--limit` flag for cost control
- Pipeline data: 1,956 restaurants, 391 bars, 699 fika, 270 hotels (3,316 total)

### Changed
- Score color gradient: linear red(0) → yellow(50) → green(100) scale
- Proportional prestige ceiling: crowd-only venues spread across 0-75 instead of clustering at 75
- Renamed `venues.json` → `venues-merged.json` for clarity
- Moved frontend JSON files to `optimized/` folder

## [0.4.0] - 2026-03-18

### Added
- Split venues into 4 categories: Restauranger, Barer, Fika, Hotell with dedicated routes (`/b`, `/f`, `/h`)
- Icon-only category toggle buttons centered in header
- SEO meta tags (title, description, OG, canonical) for all venue pages
- SSR restaurant list for search engine indexing (top 50 venues)
- Sitemap.xml with 1,328 venue URLs and robots.txt
- Falstaff Chrome MCP scraper skill (`/scrape-falstaff`) with sub-score extraction
- Per-category filter visibility (restaurants get all filters, bars/fika/hotels get relevant subset)

### Fixed
- SSR hydration mismatches (leaflet, i18n language, platform detection, RestaurantList)
- WhiteGuide URL paths for bars, cafes, and hotels (were all linking to `/restaurants/`)
- Falstaff data quality: only rated venues included, fake fork-to-score conversion removed
- Scoring: rebalanced weights (Michelin > WG/Falstaff > DI > SvD/DN > Krogguiden > Google)
- Scoring: removed diversity dampening, lowered no-prestige ceiling to 75, raised WG classification scores
- Dark mode flash on dark OS (force light color scheme)

### Maintenance
- Enable strict mode in tsconfig
- Add puppeteer dependency
- Untrack falstaff-raw.json from git

## [0.3.1] - 2026-03-17

### Added
- Falstaff as a data source with scoring, filters, and display

### Fixed
- Removed prestige-aware source skipping from scoring for more consistent results

### Documentation
- Updated pipeline docs for Falstaff and scoring changes

### Maintenance
- Regenerated pipeline data with Falstaff and scoring fix

## [0.2.0] - 2026-03-17

### Added
- Opening hours, website, and phone number data from Google Places API
- Pipeline `--backfill` flag to fetch missing hours/website/phone without re-fetching all venues
- App versioning with version display in feedback modal and changelog link
- Release skill (`/release`) for bump-tag-deploy workflow
- Context-aware hotel filters (hides restaurant-only filters in hotel view)
- Hotel support in pipeline with separate data and filters
- Consolidation review skill
- Distance sorting with geolocation

### Changed
- Bakom score moved to its own labeled section above ratings
- Price display uses euro symbols (€/€€/€€€) instead of dollar signs
- Pipeline reorganized: renamed pipeline2 to pipeline, removed old v1
- Cuisines derived from loaded data instead of static file
- Simplified pipeline ranking logic
- Extracted reusable UI components

### Fixed
- Price filter now correctly matches data values
- Dark mode styling in feedback and search modals
- Michelin Selected score value increased to 7.5

### Documentation
- Streamlined documentation and AGENTS.md

### Maintenance
- Updated restaurant data with latest scores
- Removed old data/ directory

## [0.1.0] - 2026-03-17

Initial tracked release.

### Added
- Interactive map with clustered markers (Leaflet + OpenStreetMap)
- Restaurant and hotel views with separate data and filters
- Bakom Score: composite scoring algorithm across 7 sources (Michelin, White Guide, Krogguiden, Google, SvD, DN, DI Weekend)
- Source ratings detail view with links to original reviews
- Price filter with euro symbols (€/€€/€€€)
- Cuisine filter derived from Google Places primary types
- Michelin and White Guide distinction filters
- Range sliders for Bakom Score, Google, Krogguiden, SvD, DN, DI Weekend
- Meal type filters (breakfast, lunch, dinner)
- Availability filters (open now, open today)
- Opening hours display with collapsible daily schedule
- Command palette search (Cmd+K)
- Virtualized restaurant list for performance
- Distance sorting with geolocation
- Shareable restaurant URLs
- Region selector (Sweden, Stockholm, Gothenburg, Malmö)
- Internationalization (Swedish and English)
- Dark mode support
- Feedback modal
- Data pipeline: collect, merge, refine (Google Places), score, optimize
- Vercel deployment with analytics and speed insights
