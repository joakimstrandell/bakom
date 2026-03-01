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
  Newspaper,
  ThumbsUp,
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

const PRICES = ["$", "$$", "$$$", "$$$$"] as const;

// ─── Per-source filter options ───────────────────────────────────

type FilterOption = { value: number; label: string };

const BAKOM_FILTERS: FilterOption[] = [
  { value: 0, label: "Alla" },
  { value: 5, label: "5+" },
  { value: 6, label: "6+" },
  { value: 7, label: "7+" },
  { value: 8, label: "8+" },
];

const KROGGUIDEN_FILTERS: FilterOption[] = [
  { value: 0, label: "Alla" },
  { value: 3, label: "3+" },
  { value: 3.5, label: "3.5+" },
  { value: 4, label: "4+" },
];

const GOOGLE_FILTERS: FilterOption[] = [
  { value: 0, label: "Alla" },
  { value: 3, label: "3+" },
  { value: 3.5, label: "3.5+" },
  { value: 4, label: "4+" },
];

const SVD_FILTERS: FilterOption[] = [
  { value: 0, label: "Alla" },
  { value: 3, label: "3+" },
  { value: 4, label: "4+" },
  { value: 5, label: "5+" },
];

const MICHELIN_FILTERS: FilterOption[] = [
  { value: 0, label: "Alla" },
  { value: 1, label: "Selected+" },
  { value: 2, label: "Bib Gourmand+" },
  { value: 3, label: "★+" },
];

const WG_FILTERS: FilterOption[] = [
  { value: 0, label: "Alla" },
  { value: 1, label: "Rekommenderad+" },
  { value: 2, label: "God Klass+" },
  { value: 3, label: "MGK+" },
];

const THATSUP_FILTERS: FilterOption[] = [
  { value: 0, label: "Alla" },
  { value: 3, label: "3+" },
  { value: 3.5, label: "3.5+" },
  { value: 4, label: "4+" },
];

const DN_FILTERS: FilterOption[] = [
  { value: 0, label: "Alla" },
  { value: 1, label: "Recenserad" },
];

// Source filter configuration for rendering
const SOURCE_FILTERS = [
  { key: "bakom", label: "Bakom", icon: TrendingUp, options: BAKOM_FILTERS },
  { key: "krogguiden", label: "Krogguiden", icon: Star, options: KROGGUIDEN_FILTERS },
  { key: "google", label: "Google", icon: Star, options: GOOGLE_FILTERS },
  { key: "thatsup", label: "Thatsup", icon: ThumbsUp, options: THATSUP_FILTERS },
  { key: "svd", label: "SvD", icon: Newspaper, options: SVD_FILTERS },
  { key: "michelin", label: "Michelin", icon: Award, options: MICHELIN_FILTERS },
  { key: "whiteguide", label: "White Guide", icon: Award, options: WG_FILTERS },
  { key: "dn", label: "DN", icon: Newspaper, options: DN_FILTERS },
] as const;

// ─── Props ───────────────────────────────────────────────────────

type FiltersProps = {
  cuisines: Set<string>;
  prices: Set<string>;
  searchQuery: string;
  minBakomScore: number;
  minKrogguiden: number;
  minGoogle: number;
  minThatsup: number;
  minSvd: number;
  minMichelin: number;
  minWhiteGuide: number;
  minDn: number;
  onToggleCuisine: (c: string) => void;
  onTogglePrice: (p: string) => void;
  onSearchChange: (q: string) => void;
  onSourceFilterChange: (source: string, value: number) => void;
  onClear: () => void;
  total: number;
  filtered: number;
};

/** Get the current threshold value for a source key */
function getSourceValue(key: string, props: FiltersProps): number {
  switch (key) {
    case "bakom": return props.minBakomScore;
    case "krogguiden": return props.minKrogguiden;
    case "google": return props.minGoogle;
    case "thatsup": return props.minThatsup;
    case "svd": return props.minSvd;
    case "michelin": return props.minMichelin;
    case "whiteguide": return props.minWhiteGuide;
    case "dn": return props.minDn;
    default: return 0;
  }
}

/** Get active label for a source filter (for collapsed pills) */
function getActiveLabel(key: string, value: number): string | null {
  if (value === 0) return null;
  const source = SOURCE_FILTERS.find((s) => s.key === key);
  if (!source) return null;
  const option = source.options.find((o) => o.value === value);
  return option ? `${source.label} ${option.label}` : null;
}

// ─── Component ───────────────────────────────────────────────────

export default function Filters(props: FiltersProps) {
  const {
    cuisines,
    prices,
    searchQuery,
    onToggleCuisine,
    onTogglePrice,
    onSearchChange,
    onSourceFilterChange,
    onClear,
    total,
    filtered,
  } = props;

  const [expanded, setExpanded] = useState(false);

  // Collect all active source filters
  const activeSourceFilters = SOURCE_FILTERS
    .map((s) => ({ key: s.key, value: getSourceValue(s.key, props) }))
    .filter((s) => s.value > 0);

  const hasFilters =
    cuisines.size > 0 ||
    prices.size > 0 ||
    searchQuery.length > 0 ||
    activeSourceFilters.length > 0;

  const activeFilterCount =
    cuisines.size +
    prices.size +
    activeSourceFilters.length;

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
            {activeSourceFilters.map(({ key, value }) => {
              const label = getActiveLabel(key, value);
              if (!label) return null;
              return (
                <Badge
                  key={key}
                  variant="secondary"
                  className="shrink-0 cursor-pointer gap-1"
                  onClick={() => onSourceFilterChange(key, 0)}
                >
                  {label}
                  <X className="size-3" />
                </Badge>
              );
            })}
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

          {/* Per-source rating filters */}
          {SOURCE_FILTERS.map(({ key, label, icon: Icon, options }) => {
            const currentValue = getSourceValue(key, props);
            return (
              <div key={key} className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide shrink-0">
                  <Icon className="size-3.5" />
                  {label}
                </span>
                {options.map(({ value, label: optLabel }) => (
                  <Badge
                    key={value}
                    variant={currentValue === value ? "default" : "outline"}
                    className="cursor-pointer select-none transition-colors hover:bg-primary/10"
                    onClick={() => onSourceFilterChange(key, value)}
                  >
                    {optLabel}
                  </Badge>
                ))}
              </div>
            );
          })}

          {hasFilters && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="h-6 px-2 text-xs text-destructive hover:text-destructive"
              >
                <X className="size-3 mr-1" />
                Rensa
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
