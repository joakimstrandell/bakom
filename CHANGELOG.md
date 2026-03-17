# Changelog

All notable changes to Bakom will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
