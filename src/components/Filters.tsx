import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  UtensilsCrossed,
  DollarSign,
  Star,
  Award,
  TrendingUp,
  Newspaper,
  RotateCcw,
} from "lucide-react";
import type { MichelinDistinction, WhiteGuideClassification } from "../types";
import type { FilterState, Range, FilterAction, RangeFilterKey } from "../hooks/useFilters";

const CUISINE_KEYS = [
  "Crossover",
  "Frankrike",
  "Asien",
  "Italien",
  "Klassiskt",
  "Amerika",
  "Fokus på kött",
  "Fokus på fisk",
  "Fokus på grönt",
  "Spanien",
  "Veganskt",
  "Mellanöstern",
  "Latinamerika",
  "Mexikanskt",
] as const;

const PRICES = ["$", "$$", "$$$", "$$$$"] as const;

// Michelin distinctions for multi-select
const MICHELIN_OPTIONS: { key: MichelinDistinction; label: string }[] = [
  { key: "selected", label: "Selected" },
  { key: "bib_gourmand", label: "Bib Gourmand" },
  { key: "1_star", label: "★" },
  { key: "2_star", label: "★★" },
  { key: "3_star", label: "★★★" },
];

// White Guide classification keys
const WG_KEYS: WhiteGuideClassification[] = [
  "recommended",
  "good_class",
  "very_good_class",
  "master_class",
  "global_master_class",
];

// ─── Props ───────────────────────────────────────────────────────

type FiltersProps = {
  state: FilterState;
  dispatch: React.Dispatch<FilterAction>;
  onClose: () => void;
  total: number;
  filtered: number;
  hasActiveFilters: boolean;
};

// ─── Range Slider Component ──────────────────────────────────────

type RangeSliderProps = {
  label: string;
  icon: React.ReactNode;
  range: Range;
  min: number;
  max: number;
  step: number;
  filterKey: RangeFilterKey;
  dispatch: React.Dispatch<FilterAction>;
  formatValue?: (value: number) => string;
};

function RangeSlider({
  label,
  icon,
  range,
  min,
  max,
  step,
  filterKey,
  dispatch,
  formatValue,
}: RangeSliderProps) {
  const format = formatValue || ((v: number) => v.toString());
  const isActive = range.min > min || range.max < max;

  // Calculate percentages for the track highlight
  const minPercent = ((range.min - min) / (max - min)) * 100;
  const maxPercent = ((range.max - min) / (max - min)) * 100;

  const handleMinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newMin = parseFloat(e.target.value);
      dispatch({
        type: "SET_RANGE",
        payload: {
          key: filterKey,
          range: { min: Math.min(newMin, range.max), max: range.max },
        },
      });
    },
    [dispatch, filterKey, range.max]
  );

  const handleMaxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newMax = parseFloat(e.target.value);
      dispatch({
        type: "SET_RANGE",
        payload: {
          key: filterKey,
          range: { min: range.min, max: Math.max(newMax, range.min) },
        },
      });
    },
    [dispatch, filterKey, range.min]
  );

  return (
    <div className="filter-section">
      <div className="filter-section-title">
        {icon}
        {label}
        {isActive && (
          <span className="ml-auto text-foreground font-semibold text-xs">
            {format(range.min)} – {format(range.max)}
          </span>
        )}
      </div>
      <div className="relative h-6 flex items-center">
        {/* Track background */}
        <div className="absolute inset-x-0 h-2 bg-black/10 dark:bg-white/10 rounded-full" />

        {/* Active range highlight */}
        <div
          className="absolute h-2 bg-foreground/30 rounded-full"
          style={{
            left: `${minPercent}%`,
            right: `${100 - maxPercent}%`,
          }}
        />

        {/* Min slider - higher z-index when at max to allow dragging back */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={range.min}
          onChange={handleMinChange}
          style={{ zIndex: range.min >= range.max ? 20 : 10 }}
          className="absolute inset-x-0 w-full h-2 appearance-none bg-transparent cursor-pointer pointer-events-none
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:pointer-events-auto
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-foreground
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110"
        />

        {/* Max slider */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={range.max}
          onChange={handleMaxChange}
          style={{ zIndex: 10 }}
          className="absolute inset-x-0 w-full h-2 appearance-none bg-transparent cursor-pointer pointer-events-none
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:pointer-events-auto
            [&::-webkit-slider-thumb]:w-4
            [&::-webkit-slider-thumb]:h-4
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-foreground
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:transition-transform
            [&::-webkit-slider-thumb]:hover:scale-110"
        />
      </div>

      {/* Value labels */}
      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────

export default function Filters({
  state,
  dispatch,
  onClose,
  total,
  filtered,
  hasActiveFilters,
}: FiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-black/6">
        <div>
          <h2
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("filters.title")}
          </h2>
          <p
            className="text-sm text-muted-foreground mt-0.5"
            dangerouslySetInnerHTML={{
              __html: t("filters.showing", { count: filtered, total }),
            }}
          />
        </div>
        <button
          onPointerDown={onClose}
          className="size-10 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors select-none"
          aria-label={t("filters.close_aria")}
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Filter sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Bakom Score range */}
        <RangeSlider
          label="Bakom Score"
          icon={<TrendingUp className="size-4" />}
          range={state.bakomScore}
          min={0}
          max={100}
          step={5}
          filterKey="bakomScore"
          dispatch={dispatch}
        />

        {/* Krogguiden range */}
        <RangeSlider
          label="Krogguiden"
          icon={<Star className="size-4" />}
          range={state.krogguiden}
          min={0}
          max={5}
          step={0.1}
          filterKey="krogguiden"
          dispatch={dispatch}
          formatValue={(v) => v.toFixed(1)}
        />

        {/* Google range */}
        <RangeSlider
          label="Google"
          icon={<Star className="size-4" />}
          range={state.google}
          min={0}
          max={5}
          step={0.1}
          filterKey="google"
          dispatch={dispatch}
          formatValue={(v) => v.toFixed(1)}
        />

        {/* SvD range */}
        <RangeSlider
          label="SvD"
          icon={<Newspaper className="size-4" />}
          range={state.svd}
          min={0}
          max={6}
          step={1}
          filterKey="svd"
          dispatch={dispatch}
        />

        {/* DI range */}
        <RangeSlider
          label="DI Weekend"
          icon={<Newspaper className="size-4" />}
          range={state.di}
          min={0}
          max={25}
          step={1}
          filterKey="di"
          dispatch={dispatch}
        />

        {/* Michelin multi-select */}
        <div className="filter-section">
          <div className="filter-section-title">
            <Award className="size-4" />
            Michelin
          </div>
          <div className="flex flex-wrap gap-2">
            {MICHELIN_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() =>
                  dispatch({ type: "TOGGLE_MICHELIN", payload: key })
                }
                className={`filter-chip ${state.selectedMichelin.has(key) ? "active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* White Guide multi-select */}
        <div className="filter-section">
          <div className="filter-section-title">
            <Award className="size-4" />
            White Guide
          </div>
          <div className="flex flex-wrap gap-2">
            {WG_KEYS.map((key) => (
              <button
                key={key}
                onClick={() =>
                  dispatch({ type: "TOGGLE_WHITEGUIDE", payload: key })
                }
                className={`filter-chip ${state.selectedWhiteGuide.has(key) ? "active" : ""}`}
              >
                {t(`whiteguide.${key}`)}
              </button>
            ))}
          </div>
        </div>

        {/* DN range */}
        <RangeSlider
          label="DN"
          icon={<Newspaper className="size-4" />}
          range={state.dn}
          min={0}
          max={5}
          step={1}
          filterKey="dn"
          dispatch={dispatch}
        />

        {/* Cuisine filters */}
        <div className="filter-section">
          <div className="filter-section-title">
            <UtensilsCrossed className="size-4" />
            {t("filters.cuisine")}
          </div>
          <div className="flex flex-wrap gap-2">
            {CUISINE_KEYS.map((key) => (
              <button
                key={key}
                onClick={() =>
                  dispatch({ type: "TOGGLE_CUISINE", payload: key })
                }
                className={`filter-chip ${state.selectedCuisines.has(key) ? "active" : ""}`}
              >
                {t(`cuisines.${key}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Price filters */}
        <div className="filter-section">
          <div className="filter-section-title">
            <DollarSign className="size-4" />
            {t("filters.price")}
          </div>
          <div className="flex flex-wrap gap-2">
            {PRICES.map((p) => (
              <button
                key={p}
                onClick={() => dispatch({ type: "TOGGLE_PRICE", payload: p })}
                className={`filter-chip ${state.selectedPrices.has(p) ? "active" : ""}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      {hasActiveFilters && (
        <div className="px-5 py-4 border-t border-black/6">
          <button
            onClick={() => dispatch({ type: "CLEAR_ALL" })}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-full border border-black/10 text-sm font-medium hover:bg-black/5 transition-colors"
          >
            <RotateCcw className="size-4" />
            {t("filters.clear")}
          </button>
        </div>
      )}
    </div>
  );
}
