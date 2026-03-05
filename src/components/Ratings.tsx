import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// ─── Star Display ────────────────────────────────────────────────

export interface StarDisplayProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Rating value (0-5) */
  rating: number;
  /** Maximum stars to show */
  max?: number;
}

function StarDisplay({ rating, max = 5, className, ...props }: StarDisplayProps) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.3;
  const emptyStars = max - fullStars - (hasHalf ? 1 : 0);

  return (
    <span
      data-slot="star-display"
      className={cn("inline-flex", className)}
      aria-label={`${rating}/${max}`}
      {...props}
    >
      {Array.from({ length: fullStars }, (_, i) => (
        <span key={`f${i}`} className="text-amber-400">
          ★
        </span>
      ))}
      {hasHalf && <span className="text-amber-400 opacity-50">★</span>}
      {Array.from({ length: emptyStars }, (_, i) => (
        <span key={`e${i}`} className="text-black/20 dark:text-white/20">
          ★
        </span>
      ))}
    </span>
  );
}

// ─── Pip Display (for SvD 1-6 scale) ─────────────────────────────

export interface PipDisplayProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Current score */
  score: number;
  /** Maximum pips to show */
  max?: number;
}

function PipDisplay({ score, max = 6, className, ...props }: PipDisplayProps) {
  return (
    <span
      data-slot="pip-display"
      className={cn("inline-flex gap-0.5", className)}
      aria-label={`${score} av ${max}`}
      {...props}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn(
            "inline-block w-1.5 h-1.5 rounded-full",
            i < score ? "bg-foreground" : "bg-black/15 dark:bg-white/15"
          )}
        />
      ))}
    </span>
  );
}

// ─── Open Status Indicator ───────────────────────────────────────

export interface OpenStatusProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Whether the place is currently open */
  isOpen: boolean | null;
}

function OpenStatus({ isOpen, className, ...props }: OpenStatusProps) {
  const { t } = useTranslation();

  if (isOpen === null) return null;

  return (
    <span
      data-slot="open-status"
      className={cn(
        "text-sm font-medium",
        isOpen ? "text-green-600 dark:text-green-400" : "text-red-500",
        className
      )}
      {...props}
    >
      {isOpen ? `● ${t("status.open")}` : `● ${t("status.closed")}`}
    </span>
  );
}

export { StarDisplay, PipDisplay, OpenStatus };
