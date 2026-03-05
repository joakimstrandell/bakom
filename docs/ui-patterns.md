# UI Patterns

This document covers frontend UI conventions and patterns used in the Bakom application.

---

## Responsive Interaction Events

### The Problem

Default `onClick` handlers on touch devices have a ~300ms delay between touch and action. This delay exists for historical reasons (detecting double-tap zoom), but makes the UI feel sluggish.

### The Solution

Use `onPointerDown` instead of `onClick` for most UI interactions. This triggers immediately when the user touches/clicks, providing instant feedback.

```tsx
// ✅ Good - instant response
<button onPointerDown={() => setOpen(true)}>
  Open
</button>

// ❌ Avoid - 300ms delay on touch devices
<button onClick={() => setOpen(true)}>
  Open
</button>
```

### When to Use Each

| Event | Use For |
|-------|---------|
| `onPointerDown` | Navigation, toggles, selections, filters, dropdowns, sorting, closing modals |
| `onClick` | Destructive actions, form submissions, sending data, anything that shouldn't trigger accidentally |

### Examples

**Use `onPointerDown`:**
- Selecting a restaurant from list
- Toggling filter chips
- Opening/closing sidebars
- Sort buttons
- Search icon expand
- Region dropdown toggle
- Mobile view toggle (map ↔ list)

**Use `onClick`:**
- "Send Feedback" button (shouldn't fire if user drags away)
- Form submit buttons
- Delete confirmations
- Any action with irreversible consequences

### CSS Complement

The CSS includes `touch-action: manipulation` to eliminate additional tap delay:

```css
/* src/index.css */
button, a, [role="button"] {
  touch-action: manipulation;
}
```

This tells the browser not to wait for potential double-tap gestures on interactive elements.

---

## Mobile Layout Patterns

### View Toggle

On mobile, users toggle between map and list views. The list slides in from the left:

```tsx
<div className={`
  md:hidden absolute inset-0
  transition-transform duration-300
  ${mobileView === "list" ? "translate-x-0" : "-translate-x-full"}
`}>
  <RestaurantList ... />
</div>
```

Key points:
- Use `translate-x` instead of `display: none` to keep components mounted
- Important for Leaflet map which loses dimensions when hidden
- `md:hidden` ensures this overlay only appears on mobile

### Z-Index Layering

Mobile overlays use a consistent z-index hierarchy:

| Layer | z-index | Element |
|-------|---------|---------|
| Map controls | 1000 | Leaflet controls, location button |
| Mobile list | 1000 | List view overlay |
| Tap-to-close overlay | 1001 | Background overlay when sidebar open |
| Sidebar | 1002 | Filters/detail panel |
| Header | 1003 | Top navigation bar |
| Mobile toggle | 1100 | Map/list toggle button |

### Sidebar Behavior

The detail sidebar animates from the right regardless of current view (map or list):

```tsx
<div
  className="fixed top-14 bottom-0 right-0 transition-[width] duration-200"
  style={{ width: sidebarOpen ? 360 : 0 }}
>
```

Clicking outside the sidebar closes it without triggering underlying elements:

```tsx
<div
  className="fixed inset-0 bg-black/20 z-[1001]"
  onClick={(e) => {
    e.stopPropagation();
    closeSidebar();
  }}
  onPointerDown={(e) => e.stopPropagation()}
/>
```

Both `onClick` and `onPointerDown` need `stopPropagation()` to prevent event bubbling.

---

## Map Interaction Patterns

### No Repositioning on Mobile

When a restaurant is selected, the map pans to show it on desktop. On mobile, this is disabled to avoid disorienting the user:

```tsx
// src/components/Map.tsx - PanToSelected component
if (window.innerWidth < 768) return; // Skip on mobile
```

### Cluster Click Behavior

Clicking a marker cluster zooms in rather than opening a popup:

```tsx
eventHandlers={{
  clusterclick: (e) => {
    const bounds = e.propagatedFrom.getBounds();
    e.target._map.fitBounds(bounds, { maxZoom: 16, padding: [40, 40] });
  },
}}
```

---

## Header Patterns

### Ghost Buttons

Header buttons use a ghost style (no background until hover):

```css
.header-icon-btn {
  background: transparent;
  border: none;
  color: var(--muted-foreground);
}

.header-icon-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--foreground);
}

.header-icon-btn.active {
  background: var(--foreground);
  color: var(--background);
}
```

### Expanding Search

Search shows only an icon by default, expanding leftward on click:

```tsx
{searchExpanded ? (
  <div className="search-input-wrapper expanded">
    <input ... />
  </div>
) : (
  <button onPointerDown={() => setSearchExpanded(true)}>
    <Search />
  </button>
)}
```

The expanded search overlays the logo on mobile:

```css
.search-input-wrapper.expanded {
  position: absolute;
  right: 88px;
  width: min(360px, calc(100vw - 180px));
  z-index: 20;
}
```

---

## Accessibility Notes

- All interactive elements have `touch-action: manipulation`
- Buttons include `aria-label` for screen readers
- `aria-expanded` used for toggleable elements
- Focus management when search expands
- Escape key closes modals and expanded elements
