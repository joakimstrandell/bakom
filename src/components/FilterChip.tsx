import * as React from "react";
import { cn } from "@/lib/utils";

export interface FilterChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(
  ({ className, active, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        data-slot="filter-chip"
        data-active={active || undefined}
        className={cn(
          "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-medium cursor-pointer transition-all select-none",
          active
            ? "bg-foreground text-background border border-transparent"
            : "border border-black/10 dark:border-white/15 text-black/70 dark:text-white/70 hover:border-black/20 dark:hover:border-white/25 hover:bg-black/3 dark:hover:bg-white/5",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
FilterChip.displayName = "FilterChip";

export { FilterChip };
