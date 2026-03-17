# Bakom – Sveriges Bästa Restauranger & Hotell

Interactive map of Swedish restaurants and hotels aggregating data from 6 sources: White Guide, Krogguiden, Guide Michelin, SvD, DN, and DI Weekend – enriched with Google Places. Features the **Bakom Score** – a 0–100 weighted rating combining expert reviews and crowd ratings.

**Regions**: Stockholm, Göteborg, Malmö, and rest of Sweden – each with per-region rankings.

## Getting Started

```bash
pnpm install
pnpm dev           # Start dev server at http://localhost:3000
```

## Data Pipeline

Five-phase pipeline producing `data/restaurants.frontend.json` and `data/hotels.frontend.json` for the web app. See [docs/pipeline.md](docs/pipeline.md) for full documentation.

```
collect  →  merge  →  refine  →  score  →  optimize
```

| Step | What it does |
|------|-------------|
| **Collect** | Fetches raw articles from 6 sources into `pipeline/.data/articles/` |
| **Merge** | Fuzzy-matches and deduplicates into ~1,670 unified venues |
| **Refine** | Google Places enrichment, dedup by Place ID, removes closed venues |
| **Score** | Weighted composite score (0–100), national + regional rankings |
| **Optimize** | Shapes for frontend, splits restaurants vs hotels, maps cuisines |

### Run

```bash
pnpm pipeline:collect           # Collect all sources
pnpm pipeline:merge             # Merge into venues
pnpm pipeline:refine            # Google Places enrichment
pnpm pipeline:score             # Compute Bakom Scores
pnpm pipeline:optimize          # Generate frontend JSON
```

Google Places enrichment requires `GOOGLE_PLACES_API_KEY`.

## Bakom Score

The **Bakom Score** (0–100) aggregates ratings from Michelin, White Guide, SvD, DN, DI Weekend, Krogguiden, and Google with source-appropriate weighting, prestige-aware averaging, diversity dampening, time decay, and prestige ceilings. See [docs/pipeline.md](docs/pipeline.md#phase-4-score-).

## URL Structure

```
/              Restaurants (default)
/r/:id         Restaurant detail
/h             Hotels
/h/:id         Hotel detail
```

## Documentation

- [docs/pipeline.md](docs/pipeline.md) – Data pipeline (collect, merge, refine, score, optimize)
- [docs/i18n.md](docs/i18n.md) – Internationalization (Swedish/English)
- [docs/ui-patterns.md](docs/ui-patterns.md) – Frontend UI conventions

## Tech Stack

- **Frontend**: TanStack Start, React 19, Leaflet, Tailwind CSS, Radix UI
- **Pipeline**: Node.js, TypeScript, Cheerio
- **APIs**: Google Places, White Guide, DI Weekend
- **Analytics**: Vercel Analytics + Speed Insights
- **Build**: Vite, Nitro
