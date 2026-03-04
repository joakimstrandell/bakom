# Bakom — Sveriges Bästa Restauranger

Interactive map of Swedish restaurants aggregating data from 6 sources: Krogguiden, Guide Michelin, White Guide, SvD, DN, and DI Weekend — enriched with Google Places. Features the **Bakom Score** — a 0–100 weighted rating combining expert reviews and crowd ratings.

**Regions**: Stockholm, Göteborg, Malmö, and rest of Sweden — each with per-region rankings.

## Getting Started

```bash
npm install
npm run dev        # Start dev server at http://localhost:3000
```

## Data Pipeline

The pipeline produces `data/restaurants.json` and region-specific frontend files for the web app.

```
collect  →  merge  →  refine  →  optimize
```

| Step | What it does | Docs |
|------|-------------|------|
| **Collect** | Fetches raw data from 6 sources into `data/raw/*.json` | [docs/collect.md](docs/collect.md) |
| **Merge** | Fuzzy-matches and deduplicates into `data/restaurants.json` | [docs/merge.md](docs/merge.md) |
| **Refine** | Google Places enrichment, geocoding, filters closed, calculates Bakom Score | [docs/refine.md](docs/refine.md) |
| **Optimize** | Splits by region, calculates per-region ranks, strips for frontend | [docs/optimize.md](docs/optimize.md) |

### Run

```bash
npm run pipeline                # Run all steps
npm run pipeline:collect        # Collect all sources
npm run pipeline:merge          # Merge only
npm run pipeline:refine         # Refine only
npm run pipeline:optimize       # Optimize only
```

Individual collectors can also be run directly — see [docs/collect.md](docs/collect.md).

Google Places enrichment requires `GOOGLE_PLACES_API_KEY`. If missing, the refine step skips Google and falls back to geocoding only.

## Bakom Score

The **Bakom Score** (0–100) aggregates ratings from Michelin, White Guide, SvD, Krogguiden, DI Weekend, and Google with source-appropriate weighting, diversity dampening, and prestige ceilings. See [docs/score.md](docs/score.md).

## Manual Data

Override or supplement scraped data via `data/manual.json` (additions, merges, overrides). See [docs/merge.md](docs/merge.md#manual-data).

## Tech Stack

- **Frontend**: TanStack Start, React 19, Leaflet, Tailwind CSS, Radix UI
- **Pipeline**: Node.js, TypeScript, Cheerio
- **APIs**: Google Places, White Guide, DI Weekend
- **Geocoding**: OpenStreetMap Nominatim
- **Analytics**: Vercel Analytics + Speed Insights
- **Build**: Vite, Nitro
