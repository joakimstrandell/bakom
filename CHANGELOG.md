# Changelog

All notable changes to Bakom will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
