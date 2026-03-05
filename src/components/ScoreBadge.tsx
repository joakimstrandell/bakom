import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { scoreColor } from "@/lib/colors";

const scoreBadgeVariants = cva(
  "inline-flex items-center justify-center font-bold text-white shrink-0",
  {
    variants: {
      size: {
        default: "px-2 py-0.5 rounded-md text-sm",
        sm: "w-9 h-6 rounded text-xs",
        lg: "px-3 py-1 rounded-lg text-base",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface ScoreBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof scoreBadgeVariants> {
  score: number | null | undefined;
  /** Text to show when score is null/undefined */
  fallback?: string;
}

function ScoreBadge({ score, size, fallback = "—", className, ...props }: ScoreBadgeProps) {
  if (score == null) {
    return (
      <span
        data-slot="score-badge"
        className={cn(
          scoreBadgeVariants({ size }),
          "bg-black/10 dark:bg-white/10 text-muted-foreground font-medium",
          className
        )}
        {...props}
      >
        {fallback}
      </span>
    );
  }

  return (
    <span
      data-slot="score-badge"
      className={cn(scoreBadgeVariants({ size }), className)}
      style={{ backgroundColor: scoreColor(score) }}
      {...props}
    >
      {score}
    </span>
  );
}

export { ScoreBadge, scoreBadgeVariants };
