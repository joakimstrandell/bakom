# Bakom

Interactive map of Swedish restaurants and hotels. Aggregates 6 review sources + Google Places into a **Bakom Score** (0–100).

## Documentation

- `docs/pipeline.md` – Data pipeline (collect, merge, refine, score, optimize)
- `docs/i18n.md` – Internationalization (Swedish/English)
- `docs/ui-patterns.md` – Frontend UI conventions

## Conventions

Run before committing:

```bash
pnpm test && pnpm lint && pnpm format
```

In code, use `@see docs/file.md` instead of duplicating docs.

## Components

- `src/components/ui/` – shadcn/ui only (`npx shadcn@latest add <component>`)
- `src/components/*.tsx` – Custom components, PascalCase filenames
- Use `cn()` from `@/lib/utils` for class merging
- Tailwind CSS with semantic colors (`text-foreground`, `bg-background`)
- Complex filter state via `useFilters` hook with dispatch pattern
- Data mode (restaurants/hotels) derived from URL path, not local state
