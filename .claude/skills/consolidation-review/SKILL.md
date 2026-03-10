---
name: consolidation-review
description: |
  Code review focused on consolidation: reducing surface area without changing behavior.
  Invoke via /review command. Checks for: (1) CSS that should be Tailwind utilities,
  (2) UI inconsistencies between similar components, (3) repeated patterns that should
  be extracted to components, (4) business logic that should move from React lifecycle
  to vanilla libs, (5) code duplication across files.
---

# Consolidation Review

Review the codebase for consolidation opportunities. Goal: make the codebase smaller and more predictable without changing behavior.

## Process

1. **Read** `references/checklist.md` for the full checklist
2. **Scan** each category using grep/glob patterns from the checklist
3. **Report** findings grouped by category with file:line references
4. **Propose** specific fixes (do not implement without approval)

## Quick Checks

```bash
# Custom CSS (should be minimal)
wc -l src/index.css

# Inconsistent borders
rg "border-(black|white)/\d+" src/

# Missing dark mode
rg "bg-white[^d]" src/components/

# Repeated patterns
rg "rounded-xl shadow-lg" src/

# Business logic in components (sort/filter in useMemo)
rg "useMemo.*sort|filter" src/components/
```

## Output Format

```markdown
## Consolidation Review

### CSS Consolidation
- [ ] `src/index.css:45` - `.custom-btn` can be Tailwind: `rounded-lg px-4 py-2`

### UI Consistency
- [ ] Border opacity: `/5` in Filters.tsx, `/10` in Detail.tsx → standardize to `/6`

### Component Extraction
- [ ] Icon button pattern repeated in `_map.tsx:12`, `Header.tsx:8`, `Sidebar.tsx:22`

### React Lifecycle
- [ ] Sorting logic in `RestaurantList.tsx:65-89` could move to `src/lib/sort.ts`

### Duplication
- [ ] `isRangeActive` defined in both `useFilters.ts:117` and `filters.ts:45`
```

## Project Conventions

- `src/components/ui/` = shadcn components only
- Custom components in `src/components/*.tsx`
- Business logic in `src/lib/`
- Hooks as thin wrappers in `src/hooks/`
- Border opacity: `/6` for subtle, `/10` for visible
- Always pair light colors with `dark:` variants
