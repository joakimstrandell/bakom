import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MapPin,
  UtensilsCrossed,
  DollarSign,
  X,
  Search,
  SlidersHorizontal,
  ChevronUp,
  Star,
  Award,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";

const CUISINES = [
  { key: "Crossover", label: "Crossover" },
  { key: "Frankrike", label: "Franskt" },
  { key: "Asien", label: "Asiatiskt" },
  { key: "Italien", label: "Italienskt" },
  { key: "Klassiskt", label: "Klassiskt" },
  { key: "Amerika", label: "Amerikanskt" },
  { key: "Fokus på kött", label: "Kött" },
  { key: "Fokus på fisk", label: "Fisk" },
  { key: "Fokus på grönt", label: "Grönt" },
  { key: "Spanien", label: "Spanskt" },
  { key: "Veganskt", label: "Veganskt" },
  { key: "Mellanöstern", label: "Mellanöstern" },
  { key: "Latinamerika", label: "Latinamerikanskt" },
  { key: "Mexikanskt", label: "Mexikanskt" },
] as const;

const PRICES = ["$", "$$", "$$$", "$$$$", "$$$$$"] as const;

const RATINGS = [
  { value: 0, label: "Alla" },
  { value: 3, label: "3+" },
  { value: 3.5, label: "3.5+" },
  { value: 4, label: "4+" },
] as const;

const BAKOM_SCORES = [
  { value: 0, label: "Alla" },
  { value: 5, label: "5+" },
  { value: 6, label: "6+" },
  { value: 7, label: "7+" },
  { value: 8, label: "8+" },
] as const;

type FiltersProps = {
  cuisines: Set<string>;
  prices: Set<string>;
  searchQuery: string;
  minRating: number;
  minBakomScore: number;
  michelinOnly: boolean;
  whiteGuideOnly: boolean;
  onToggleCuisine: (c: string) => void;
  onTogglePrice: (p: string) => void;
  onSearchChange: (q: string) => void;
  onRatingChange: (r: number) => void;
  onBakomScoreChange: (s: number) => void;
  onMichelinToggle: () => void;
  onWhiteGuideToggle: () => void;
  onClear: () => void;
  total: number;
  filtered: number;
};

export default function Filters({
  cuisines,
  prices,
  searchQuery,
  minRating,
  minBakomScore,
  michelinOnly,
  whiteGuideOnly,
  onToggleCuisine,
  onTogglePrice,
  onSearchChange,
  onRatingChange,
  onBakomScoreChange,
  onMichelinToggle,
  onWhiteGuideToggle,
  onClear,
  total,
  filtered,
}: FiltersProps) {
  const [expanded, setExpanded] = useState(false);
  const hasFilters =
    cuisines.size > 0 ||
    prices.size > 0 ||
    searchQuery.length > 0 ||
    minRating > 0 ||
    minBakomScore > 0 ||
    michelinOnly ||
    whiteGuideOnly;
  const activeFilterCount =
    cuisines.size +
    prices.size +
    (minRating > 0 ? 1 : 0) +
    (minBakomScore > 0 ? 1 : 0) +
    (michelinOnly ? 1 : 0) +
    (whiteGuideOnly ? 1 : 0);

  return (
    <div className="border-b bg-card">
      {/* Collapsed bar — always visible */}
      <div className="flex items-center gap-2 px-4 py-2">
        <Button
          variant={expanded ? "secondary" : "outline"}
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="gap-1.5 shrink-0"
        >
          {expanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <SlidersHorizontal className="size-4" />
          )}
          <span className="hidden sm:inline">Filter & Sök</span>
          {activeFilterCount > 0 && !expanded && (
            <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5">
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        {/* Active filter pills when collapsed */}
        {!expanded && hasFilters && (
          <div className="flex items-center gap-1.5 overflow-x-auto min-w-0">
            {searchQuery && (
              <Badge variant="secondary" className="shrink-0 gap-1">
                <Search className="size-3" />
                {searchQuery}
              </Badge>
            )}
            {minBakomScore > 0 && (
              <Badge
                variant="secondary"
                className="shrink-0 cursor-pointer gap-1"
                onClick={() => onBakomScoreChange(0)}
              >
                <TrendingUp className="size-3 text-emerald-600" />
                Bakom {minBakomScore}+
                <X className="size-3" />
              </Badge>
            )}
            {minRating > 0 && (
              <Badge
                variant="secondary"
                className="shrink-0 cursor-pointer gap-1"
                onClick={() => onRatingChange(0)}
              >
                <Star className="size-3 fill-amber-400 text-amber-400" />
                {minRating}+
                <X className="size-3" />
              </Badge>
            )}
            {michelinOnly && (
              <Badge
                variant="secondary"
                className="shrink-0 cursor-pointer gap-1"
                onClick={onMichelinToggle}
              >
                <Award className="size-3 text-red-600" />
                Michelin
                <X className="size-3" />
              </Badge>
            )}
            {whiteGuideOnly && (
              <Badge
                variant="secondary"
                className="shrink-0 cursor-pointer gap-1"
                onClick={onWhiteGuideToggle}
              >
                <Award className="size-3 text-emerald-700" />
                White Guide
                <X className="size-3" />
              </Badge>
            )}
            {[...cuisines].map((c) => (
              <Badge
                key={c}
                variant="secondary"
                className="shrink-0 cursor-pointer gap-1"
                onClick={() => onToggleCuisine(c)}
              >
                {CUISINES.find((x) => x.key === c)?.label ?? c}
                <X className="size-3" />
              </Badge>
            ))}
            {[...prices].map((p) => (
              <Badge
                key={p}
                variant="secondary"
                className="shrink-0 cursor-pointer gap-1"
                onClick={() => onTogglePrice(p)}
              >
                {p}
                <X className="size-3" />
              </Badge>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-sm text-muted-foreground ml-auto shrink-0">
          <MapPin className="size-4" />
          <span>
            {filtered === total ? (
              <span className="font-medium text-foreground">{total}</span>
            ) : (
              <>
                <span className="font-medium text-foreground">{filtered}</span>
                <span className="hidden sm:inline"> av {total}</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-4 pb-3 space-y-3 animate-in slide-in-from-top-2 duration-200">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Sök restaurang..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              autoFocus
              className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {/* Cuisine filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
              <UtensilsCrossed className="size-3.5" />
              Kök
            </span>
            {CUISINES.map(({ key, label }) => (
              <Badge
                key={key}
                variant={cuisines.has(key) ? "default" : "outline"}
                className="cursor-pointer select-none transition-colors hover:bg-primary/10"
                onClick={() => onToggleCuisine(key)}
              >
                {label}
              </Badge>
            ))}
          </div>

          {/* Price filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
              <DollarSign className="size-3.5" />
              Pris
            </span>
            {PRICES.map((p) => (
              <Badge
                key={p}
                variant={prices.has(p) ? "default" : "outline"}
                className="cursor-pointer select-none transition-colors hover:bg-primary/10"
                onClick={() => onTogglePrice(p)}
              >
                {p}
              </Badge>
            ))}
          </div>

          {/* Bakom Score filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
              <TrendingUp className="size-3.5" />
              Bakom
            </span>
            {BAKOM_SCORES.map(({ value, label }) => (
              <Badge
                key={value}
                variant={minBakomScore === value ? "default" : "outline"}
                className="cursor-pointer select-none transition-colors hover:bg-primary/10"
                onClick={() => onBakomScoreChange(value)}
              >
                {label}
              </Badge>
            ))}
          </div>

          {/* Rating filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
              <Star className="size-3.5" />
              Betyg
            </span>
            {RATINGS.map(({ value, label }) => (
              <Badge
                key={value}
                variant={minRating === value ? "default" : "outline"}
                className="cursor-pointer select-none transition-colors hover:bg-primary/10"
                onClick={() => onRatingChange(value)}
              >
                {label}
              </Badge>
            ))}
          </div>

          {/* Guides filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
              <Award className="size-3.5" />
              Guider
            </span>
            <Badge
              variant={michelinOnly ? "default" : "outline"}
              className="cursor-pointer select-none transition-colors hover:bg-primary/10"
              onClick={onMichelinToggle}
            >
              Michelin
            </Badge>
            <Badge
              variant={whiteGuideOnly ? "default" : "outline"}
              className="cursor-pointer select-none transition-colors hover:bg-primary/10"
              onClick={onWhiteGuideToggle}
            >
              White Guide
            </Badge>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="ml-2 h-6 px-2 text-xs text-destructive hover:text-destructive"
              >
                <X className="size-3 mr-1" />
                Rensa
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
