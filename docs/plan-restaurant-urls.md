# Plan: Restaurant URL Path Parameters

## Goal

Enable shareable restaurant URLs using path parameters (e.g., `/r/abc123`) while keeping filters in React state only.

## Current State

- Single route: `/` (home page)
- Restaurant selection: React state (`selectedRestaurant`, `sidebarMode`)
- No URL changes when selecting restaurants
- Filters: React state via `useFilters` hook

## Proposed URL Structure

```
/              → Home page (no restaurant selected)
/r/:id         → Home page with restaurant sidebar open
```

Using `/r/` prefix for brevity (shareable URLs should be short).

## Implementation Steps

### 1. Create Restaurant Route File

Create `src/routes/r.$id.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/r/$id")({
  ssr: false,
  component: RestaurantPage,
});

function RestaurantPage() {
  const { id } = Route.useParams();
  // Render HomePage with this restaurant pre-selected
}
```

### 2. Refactor HomePage to Accept Initial Restaurant

Options:
- **Option A**: Render the same `HomePage` component but pass `initialRestaurantId` prop
- **Option B**: Create a shared layout component used by both routes
- **Option C**: Use route context to pass the restaurant ID

**Recommended: Option A** - Simplest, least refactoring

### 3. Update Navigation

When user clicks a restaurant:

```typescript
// Current (state-based)
setSelectedRestaurant(restaurant);
setSidebarMode("restaurant");

// New (URL-based)
navigate({ to: "/r/$id", params: { id: restaurant.id } });
```

When user closes restaurant detail:

```typescript
// Navigate back to home
navigate({ to: "/" });
```

### 4. Handle Restaurant Lookup

In the restaurant route, look up the restaurant by ID:

```typescript
const restaurant = ALL_RESTAURANTS.find(r => r.id === id);
if (!restaurant) {
  // Show 404 or redirect to home
}
```

### 5. Update Components

**RestaurantList.tsx:**
```typescript
// Change onClick to use Link
<Link to="/r/$id" params={{ id: r.id }}>
  {/* restaurant card content */}
</Link>
```

**Map.tsx:**
```typescript
// Use navigate on marker click
navigate({ to: "/r/$id", params: { id: restaurant.id } });
```

**RestaurantDetail.tsx:**
```typescript
// Close button navigates to home
<Link to="/">
  <X />
</Link>
```

### 6. Preserve Filters Across Navigation

Filters stay in React state. When navigating between `/` and `/r/:id`:
- The filter state lives in a shared parent or context
- Or: lift filter state to a route-level loader/context

**Simplest approach:** Keep `useFilters` at page level, accept that filters reset on hard refresh (current behavior).

### 7. Browser Back/Forward Support

TanStack Router handles this automatically. User can:
- Click restaurant → URL changes to `/r/abc`
- Click browser back → URL changes to `/`
- Both navigations update the UI correctly

## File Changes Required

| File | Change |
|------|--------|
| `src/routes/r.$id.tsx` | **Create** - New restaurant route |
| `src/routes/index.tsx` | Extract shared logic, update navigation |
| `src/components/RestaurantList.tsx` | Use `Link` instead of `onClick` |
| `src/components/RestaurantDetail.tsx` | Close button uses `Link` |
| `src/components/Map.tsx` | Use `navigate` for marker clicks |

## Alternative: Query Parameters

Instead of `/r/:id`, could use `/?restaurant=abc`. However:
- Path params are cleaner for sharing
- Path params feel more "permanent" (like a real page)
- Query params better suited for filters (which we're keeping in state)

## SEO Considerations

- Each restaurant could have its own meta tags (title, description)
- Could add `head` function to the route for dynamic meta
- Not critical for MVP since `ssr: false`

## Sources

- [TanStack Router Path Params](https://tanstack.com/router/latest/docs/guide/path-params)
- [TanStack Router Navigation](https://tanstack.com/router/latest/docs/guide/navigation)
- [useNavigate Hook](https://tanstack.com/router/v1/docs/framework/react/api/router/useNavigateHook)
