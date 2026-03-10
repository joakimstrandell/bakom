import * as React from "react";
import { cn } from "@/lib/utils";

export interface MapOverlayButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const MapOverlayButton = React.forwardRef<HTMLButtonElement, MapOverlayButtonProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        data-slot="map-overlay-button"
        className={cn(
          "size-12 bg-white dark:bg-zinc-900/95 rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10",
          "hover:shadow-xl hover:-translate-y-px active:translate-y-0 transition-all",
          "flex items-center justify-center",
          "disabled:cursor-wait disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
MapOverlayButton.displayName = "MapOverlayButton";

export { MapOverlayButton };
