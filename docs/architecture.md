# Architecture

This document provides a high-level overview of the Bakom codebase.

---

## System Overview

Bakom is a full-stack application with two major components:

1. **Pipeline** — Node.js data collection and processing
2. **Frontend** — React single-page application with interactive map

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA PIPELINE                            │
│                                                                 │
│   External Sources              Processing              Output  │
│   ┌─────────────┐              ┌─────────┐                     │
│   │ Krogguiden  │──┐           │         │                     │
│   │ Michelin    │  │  ┌─────┐  │  merge  │   ┌──────────────┐  │
│   │ White Guide │──┼─▶│ raw │─▶│    ↓    │──▶│ restaurants  │  │
│   │ SvD         │  │  │ *.json│ │ refine  │   │    .json     │  │
│   │ DN          │  │  └─────┘  │    ↓    │   └──────────────┘  │
│   │ DI Weekend  │──┘           │optimize │          │          │
│   └─────────────┘              └─────────┘          │          │
│          │                          │               ▼          │
│          │    ┌─────────────────────┘    ┌──────────────────┐  │
│          │    │                          │ restaurants      │  │
│          ▼    ▼                          │ .frontend.json   │  │
│   ┌─────────────┐                        └──────────────────┘  │
│   │   Google    │ (post-merge)                   │             │
│   │   Places    │                                │             │
│   └─────────────┘                                │             │
│                                                  │             │
└──────────────────────────────────────────────────│─────────────┘
                                                   │
                                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                          FRONTEND                               │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                   React Application                      │   │
│   │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────────┐  │   │
│   │  │   Map   │  │ Filters │  │  List   │  │   Detail   │  │   │
│   │  │(Leaflet)│  │  Panel  │  │  View   │  │   Modal    │  │   │
│   │  └─────────┘  └─────────┘  └─────────┘  └────────────┘  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
/
├── src/                      # Frontend React application
│   ├── routes/               # TanStack Router file-based routing
│   │   ├── __root.tsx        # Root layout (HTML, analytics)
│   │   └── index.tsx         # Main application component
│   ├── components/           # React components
│   │   ├── ui/               # shadcn UI primitives
│   │   ├── Map.tsx           # Leaflet map with clustering
│   │   ├── Filters.tsx       # Filter UI panel
│   │   ├── RestaurantList.tsx
│   │   └── RestaurantDetail.tsx
│   ├── hooks/                # Custom React hooks
│   │   └── useFilters.ts     # Filter state management
│   ├── lib/                  # Utilities & business logic
│   │   ├── score.ts          # Bakom Score calculation
│   │   ├── filters.ts        # Filter algorithms
│   │   ├── isOpen.ts         # Opening hours logic
│   │   └── regions.ts        # Metro region definitions
│   └── types.ts              # Shared TypeScript types
│
├── pipeline/                 # Data collection & processing
│   ├── collect/              # Source-specific collectors
│   │   ├── krogguiden.ts
│   │   ├── michelin.ts
│   │   ├── whiteguide.ts
│   │   ├── svd.ts
│   │   ├── dn.ts
│   │   ├── di.ts
│   │   └── google.ts         # Post-merge enrichment
│   ├── process/              # Pipeline processing steps
│   │   ├── merge.ts          # Combine sources, deduplicate
│   │   ├── refine.ts         # Enrich, geocode, score
│   │   └── optimize.ts       # Generate frontend JSON
│   ├── utils/                # Pipeline utilities
│   │   ├── fetch.ts          # HTTP with retry
│   │   ├── match.ts          # Fuzzy name matching
│   │   └── validate.ts       # Data validation
│   ├── collect.ts            # Unified collection CLI
│   ├── run.ts                # Full pipeline orchestration
│   └── types.ts              # Pipeline-specific types
│
├── data/                     # Generated data files
│   ├── raw/                  # Raw scraped data per source
│   ├── restaurants.json      # Full merged dataset
│   ├── restaurants.frontend.json  # Optimized for frontend
│   └── manual.json           # Manual corrections
│
└── docs/                     # Documentation
    ├── architecture.md       # This file
    ├── collect.md            # Collection step details
    ├── merge.md              # Merge step details
    ├── refine.md             # Refinement step details
    ├── optimize.md           # Optimization step details
    ├── score.md              # Bakom Score algorithm
    └── ui-patterns.md        # Frontend UI conventions
```

---

## Data Flow

### Pipeline Stages

| Stage | Input | Output | Purpose |
|-------|-------|--------|---------|
| **Collect** | External APIs/sites | `data/raw/*.json` | Fetch raw data from 6 sources |
| **Merge** | `data/raw/*.json` | `data/restaurants.json` | Fuzzy-match, deduplicate, combine |
| **Refine** | `data/restaurants.json` | `data/restaurants.json` | Google enrich, geocode, score |
| **Optimize** | `data/restaurants.json` | `data/restaurants.frontend.json` | Strip fields, add regions |

### Frontend Data Flow

```
restaurants.frontend.json
         │
         ▼
   Load on startup
         │
         ▼
  ┌──────────────┐
  │ Region Filter│ (stockholm, gothenburg, malmo, sweden)
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  useFilters  │ (search, ratings, cuisine, price, etc.)
  └──────┬───────┘
         │
         ▼
  ┌──────────────────────────────────────┐
  │           Filtered Results            │
  │  ┌─────────┐  ┌─────────┐            │
  │  │   Map   │  │  List   │            │
  │  │ Markers │  │  View   │            │
  │  └─────────┘  └─────────┘            │
  └──────────────────────────────────────┘
```

---

## Technology Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| React 19 | UI framework |
| TanStack Start | Meta-framework with SSR |
| TanStack Router | File-based routing |
| Leaflet + react-leaflet | Interactive map |
| Tailwind CSS | Styling |
| Radix UI | Accessible UI primitives |
| Vite | Build tool |
| Nitro | Server runtime |

### Pipeline

| Technology | Purpose |
|------------|---------|
| Node.js | Runtime |
| TypeScript | Type safety |
| Cheerio | HTML parsing/scraping |
| tsx | Run TypeScript directly |

### External Services

| Service | Purpose |
|---------|---------|
| Google Places API | Address enrichment, ratings, hours |
| OpenStreetMap Nominatim | Geocoding fallback |
| Vercel Analytics | Usage analytics |

---

## Key Concepts

### Bakom Score

A composite 0–100 rating combining multiple sources with different weights:

- **Michelin** (28%) — Most prestigious
- **White Guide** (20%) — Swedish expert context
- **SvD** (16%) — Professional critic
- **DI Weekend** (16%) — Professional critic
- **Krogguiden** (16%) — Professional reviewers
- **Google** (10%) — Crowd-sourced

See [score.md](./score.md) for the full algorithm.

### Fuzzy Matching

Restaurants are matched across sources using:
1. Name normalization (strip prefixes/suffixes, lowercase)
2. Levenshtein distance (85% similarity threshold)
3. Address proximity bonus

See [merge.md](./merge.md#fuzzy-matching) for details.

### UI Interaction Events

The frontend uses `onPointerDown` instead of `onClick` for most UI interactions to eliminate the ~300ms tap delay on touch devices. Exceptions include destructive actions like form submissions.

See [ui-patterns.md](./ui-patterns.md) for the full convention.

### Metro Regions

Restaurants are assigned to regions based on coordinate distance:

| Region | Center | Radius |
|--------|--------|--------|
| Stockholm | 59.33°N, 18.07°E | 50 km |
| Gothenburg | 57.71°N, 11.97°E | 40 km |
| Malmö | 55.60°N, 13.00°E | 50 km |
| Sweden | Outside metro areas | — |

---

## Development Workflow

### Running Locally

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server (http://localhost:3000)
```

### Updating Data

```bash
pnpm pipeline         # Run full pipeline (collect → merge → refine → optimize)
```

Or run individual steps:

```bash
pnpm pipeline:collect              # Fetch from all sources
pnpm pipeline:collect --source X   # Fetch from one source
pnpm pipeline:merge                # Merge raw data
pnpm pipeline:refine               # Enrich and score
pnpm pipeline:optimize             # Generate frontend JSON
```

### Testing

```bash
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
```

### Building for Production

```bash
pnpm build            # Build to .output/
pnpm start            # Run production server
```

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GOOGLE_PLACES_API_KEY` | No | Google Places enrichment (skipped if missing) |

Copy `.env.example` to `.env` and fill in values.
