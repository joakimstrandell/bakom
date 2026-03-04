# Component Guidelines

## Folder Structure

```
src/components/
├── ui/           # shadcn/ui components only (from https://ui.shadcn.com)
├── *.tsx         # Custom app components
```

## shadcn/ui Components (`ui/`)

- Install via: `npx shadcn@latest add <component>`
- Uses Radix UI primitives via unified `radix-ui` package
- Follow shadcn patterns: `cn()` utility, CVA for variants, `data-slot` attributes
- Reference: https://ui.shadcn.com/docs/components

## Custom Components

- Place in `src/components/` (not in `ui/`)
- Use PascalCase filenames matching component name
- Extend native HTML element props when appropriate
- Use `cn()` from `@/lib/utils` for class merging

### Component Pattern

```tsx
import { cn } from "@/lib/utils"

export interface MyComponentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
}

function MyComponent({ value, className, ...props }: MyComponentProps) {
  return (
    <div className={cn("base-classes", className)} {...props}>
      {value}
    </div>
  )
}

export { MyComponent }
```

## Styling

- Tailwind CSS with design tokens from `tailwind.config.ts`
- Color utilities in `@/lib/colors` (scoreColor, scoreStrokeColor)
- Use semantic colors: `text-foreground`, `bg-background`, `text-muted-foreground`
- Dark mode: `dark:` prefix

## State Management

- Complex filter state: use `useFilters` hook from `@/hooks/useFilters`
- Dispatch pattern for multiple related state updates
