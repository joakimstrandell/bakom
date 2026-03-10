import * as React from "react";
import { cn } from "@/lib/utils";

export interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
}

const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(
  ({ className, icon, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        data-slot="section-header"
        className={cn(
          "font-display text-[11px] font-semibold uppercase tracking-wider text-black/45 dark:text-white/50 mb-3 flex items-center gap-2",
          className
        )}
        {...props}
      >
        {icon}
        {children}
      </div>
    );
  }
);
SectionHeader.displayName = "SectionHeader";

export { SectionHeader };
