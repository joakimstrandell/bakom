# Consolidation Review Checklist

## 1. CSS Consolidation

### Custom CSS that should be Tailwind
- [ ] Check `src/index.css` for custom classes
- [ ] Any `.class-name { ... }` definitions should be questioned
- [ ] Keep only: CSS that manipulates DOM outside React (e.g., Leaflet clusters)

### Inline styles
- [ ] Search for `style={{` - should rarely be needed with Tailwind
- [ ] Exception: dynamic values from data (transforms, positions)

## 2. UI Consistency

### Border colors
- [ ] Grep for `border-black/` and `border-white/`
- [ ] Should use consistent opacity (prefer `/6` for subtle borders)
- [ ] Every light border needs a `dark:` variant

### Dark mode coverage
- [ ] Grep for `bg-white` without `dark:bg-`
- [ ] Grep for `text-black` without `dark:text-`
- [ ] Grep for `ring-black` without `dark:ring-`

### Repeated button patterns
- [ ] Same button styling in 3+ places = extract component
- [ ] Check: icon buttons, filter chips, overlay buttons, toggle buttons

### Section headers
- [ ] Grep for `uppercase` + `text-xs` + `font-` combinations
- [ ] Should be consistent or extracted to component

## 3. Component Extraction

### Extraction signals
- [ ] Same className string repeated 3+ times
- [ ] Same JSX structure with different content
- [ ] Components over 200 lines with extractable sections

### Folder conventions
- [ ] `src/components/ui/` = shadcn only (installed via `npx shadcn@latest add`)
- [ ] Custom components go in `src/components/*.tsx`

## 4. React Lifecycle

### Business logic in components
- [ ] Sorting functions inside useMemo = candidate for `src/lib/`
- [ ] Filter functions inside useMemo = candidate for `src/lib/`
- [ ] Date/time calculations = candidate for `src/lib/`
- [ ] Distance/geo calculations = candidate for `src/lib/`

### Hook patterns
- [ ] Hooks should be thin wrappers around vanilla libs
- [ ] Heavy computation should be in `src/lib/`, memoized in hooks

### Pub/sub over prop drilling
- [ ] Deeply passed state (4+ levels) = consider vanilla pub/sub service
- [ ] Example: location state uses `src/lib/location.ts` with subscribers

## 5. Code Duplication

### Function duplication
- [ ] Same function defined in multiple files
- [ ] Consolidate to single source in `src/lib/`

### Type duplication
- [ ] Same type/interface in multiple files
- [ ] Consolidate to `src/types.ts` or `src/types/`

### Magic numbers
- [ ] Same numeric constants in multiple places
- [ ] Extract to named constants
