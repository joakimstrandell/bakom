import { useCallback, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  UtensilsCrossed,
  Euro,
  Star,
  Award,
  TrendingUp,
  Newspaper,
  RotateCcw,
  Clock,
  Coffee,
  Sun,
  Moon,
} from "lucide-react";
import type { MichelinDistinction, WhiteGuideClassification } from "../types";
import type { DataMode } from "../routes/_map";
import type { FilterState, Range, FilterAction, RangeFilterKey } from "../hooks/useFilters";
import type { MealType } from "../lib/isOpen";
import type { AvailabilityFilter } from "../lib/filters";
import { IconButton } from "./IconButton";
import { FilterChip } from "./FilterChip";
import { SectionHeader } from "./SectionHeader";

const PRICES = [
  { value: "budget", label: "€" },
  { value: "mellan", label: "€€" },
  { value: "lyx", label: "€€€" },
] as const;

// Michelin distinctions for multi-select
const MICHELIN_RESTAURANT_OPTIONS: { key: MichelinDistinction; label: string }[] = [
  { key: "selected", label: "Selected" },
  { key: "bib_gourmand", label: "Bib Gourmand" },
  { key: "1_star", label: "★" },
  { key: "2_star", label: "★★" },
  { key: "3_star", label: "★★★" },
];

const MICHELIN_HOTEL_OPTIONS: { key: MichelinDistinction; label: string }[] = [
  { key: "selected", label: "Selected" },
  { key: "1_key", label: "🔑" },
  { key: "2_key", label: "🔑🔑" },
  { key: "3_key", label: "🔑🔑🔑" },
];

// White Guide classification keys
const WG_KEYS: WhiteGuideClassification[] = [
  "recommended",
  "good_class",
  "very_good_class",
  "master_class",
  "global_master_class",
];

// Meal type options
const MEAL_OPTIONS: { key: MealType; icon: typeof Coffee }[] = [
  { key: "breakfast", icon: Coffee },
  { key: "lunch", icon: Sun },
  { key: "dinner", icon: Moon },
];

// Availability options
const AVAILABILITY_OPTIONS: { key: AvailabilityFilter }[] = [
  { key: "openNow" },
  { key: "opensToday" },
];

// ─── Props ───────────────────────────────────────────────────────

type FiltersProps = {
  state: FilterState;
  dispatch: React.Dispatch<FilterAction>;
  onClose: () => void;
  total: number;
  filtered: number;
  hasActiveFilters: boolean;
  dataMode?: DataMode;
  cuisines: string[];
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

  // Local state for smooth dragging - only commit to parent on release
  const [localRange, setLocalRange] = useState(range);

  // Sync local state when parent range changes (e.g., on clear filters)
  useEffect(() => {
    setLocalRange(range);
  }, [range]);

  const isActive = localRange.min > min || localRange.max < max;

  // Calculate percentages for the track highlight
  const minPercent = ((localRange.min - min) / (max - min)) * 100;
  const maxPercent = ((localRange.max - min) / (max - min)) * 100;

  const handleMinChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newMin = parseFloat(e.target.value);
      setLocalRange((prev) => ({ min: Math.min(newMin, prev.max), max: prev.max }));
    },
    []
  );

  const handleMaxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newMax = parseFloat(e.target.value);
      setLocalRange((prev) => ({ min: prev.min, max: Math.max(newMax, prev.min) }));
    },
    []
  );

  // Commit to parent state on pointer/mouse up
  const commitRange = useCallback(() => {
    dispatch({
      type: "SET_RANGE",
      payload: { key: filterKey, range: localRange },
    });
  }, [dispatch, filterKey, localRange]);

  return (
    <div className="px-5 py-4 border-b border-black/6 dark:border-white/6">
      <SectionHeader icon={icon}>
        {label}
        {isActive && (
          <span className="ml-auto text-foreground font-semibold text-xs normal-case tracking-normal">
            {format(localRange.min)} – {format(localRange.max)}
          </span>
        )}
      </SectionHeader>
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
          value={localRange.min}
          onChange={handleMinChange}
          onPointerUp={commitRange}
          onMouseUp={commitRange}
          style={{ zIndex: localRange.min >= localRange.max ? 20 : 10 }}
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
          value={localRange.max}
          onChange={handleMaxChange}
          onPointerUp={commitRange}
          onMouseUp={commitRange}
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
  dataMode = "restaurants",
  cuisines,
}: FiltersProps) {
  const { t } = useTranslation();
  const isHotels = dataMode === "hotels";
  const isBars = dataMode === "bars";
  const isFika = dataMode === "fika";
  const isRestaurants = dataMode === "restaurants";
  const michelinOptions = isHotels ? MICHELIN_HOTEL_OPTIONS : MICHELIN_RESTAURANT_OPTIONS;
  const showingKey = isHotels ? "filters.showing_hotels"
    : isBars ? "filters.showing_bars"
    : isFika ? "filters.showing_fika"
    : "filters.showing";

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-black/6 dark:border-white/6">
        <div>
          <h2 className="text-lg font-semibold font-display">{t("filters.title")}</h2>
          <p
            className="text-sm text-muted-foreground mt-0.5"
            dangerouslySetInnerHTML={{
              __html: t(showingKey, { count: filtered, total }),
            }}
          />
        </div>
        <IconButton onClick={onClose} aria-label={t("filters.close_aria")}>
          <X className="size-5" />
        </IconButton>
      </div>

      {/* Filter sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Michelin multi-select — not for fika */}
        {!isFika && <div className="px-5 py-4 border-b border-black/6 dark:border-white/6">
          <SectionHeader icon={<Award className="size-4" />}>Michelin</SectionHeader>
          <div className="flex flex-wrap gap-2">
            {michelinOptions.map(({ key, label }) => (
              <FilterChip
                key={key}
                onClick={() => dispatch({ type: "TOGGLE_MICHELIN", payload: key })}
                active={state.selectedMichelin.has(key)}
              >
                {label}
              </FilterChip>
            ))}
          </div>
        </div>}

        {/* White Guide multi-select — not for fika */}
        {!isFika && <div className="px-5 py-4 border-b border-black/6 dark:border-white/6">
          <SectionHeader icon={<Award className="size-4" />}>White Guide</SectionHeader>
          <div className="flex flex-wrap gap-2">
            {WG_KEYS.map((key) => (
              <FilterChip
                key={key}
                onClick={() => dispatch({ type: "TOGGLE_WHITEGUIDE", payload: key })}
                active={state.selectedWhiteGuide.has(key)}
              >
                {t(`whiteguide.${key}`)}
              </FilterChip>
            ))}
          </div>
        </div>}

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

        {/* Restaurant-only rating sources (newspaper reviews) */}
        {isRestaurants && (
          <>
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
            <RangeSlider
              label="Falstaff"
              icon={<Award className="size-4" />}
              range={state.falstaff}
              min={0}
              max={100}
              step={5}
              filterKey="falstaff"
              dispatch={dispatch}
            />
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
          </>
        )}

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

        {/* Cuisine filters — restaurants and bars */}
        {(isRestaurants || isBars) && cuisines.length > 0 && (
          <div className="px-5 py-4 border-b border-black/6 dark:border-white/6">
            <SectionHeader icon={<UtensilsCrossed className="size-4" />}>
              {t("filters.cuisine")}
            </SectionHeader>
            <div className="flex flex-wrap gap-2">
              {cuisines.map((key) => (
                <FilterChip
                  key={key}
                  onClick={() => dispatch({ type: "TOGGLE_CUISINE", payload: key })}
                  active={state.selectedCuisines.has(key)}
                >
                  {key}
                </FilterChip>
              ))}
            </div>
          </div>
        )}

        {/* Price filters — restaurants and bars */}
        {(isRestaurants || isBars) && (
          <div className="px-5 py-4 border-b border-black/6 dark:border-white/6">
            <SectionHeader icon={<Euro className="size-4" />}>
              {t("filters.price")}
            </SectionHeader>
            <div className="flex flex-wrap gap-2">
              {PRICES.map((p) => (
                <FilterChip
                  key={p.value}
                  onClick={() => dispatch({ type: "TOGGLE_PRICE", payload: p.value })}
                  active={state.selectedPrices.has(p.value)}
                >
                  {p.label}
                </FilterChip>
              ))}
            </div>
          </div>
        )}

        {/* Availability & meal filters — restaurants only */}
        {isRestaurants && (
          <>
            <div className="px-5 py-4 border-b border-black/6 dark:border-white/6">
              <SectionHeader icon={<Clock className="size-4" />}>
                {t("filters.availability")}
              </SectionHeader>
              <div className="flex flex-wrap gap-2">
                {AVAILABILITY_OPTIONS.map(({ key }) => (
                  <FilterChip
                    key={key}
                    onClick={() => dispatch({ type: "TOGGLE_AVAILABILITY", payload: key })}
                    active={state.selectedAvailability.has(key)}
                  >
                    {t(`filters.${key}`)}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-b border-black/6 dark:border-white/6">
              <SectionHeader icon={<UtensilsCrossed className="size-4" />}>
                {t("filters.mealType")}
              </SectionHeader>
              <div className="flex flex-wrap gap-2">
                {MEAL_OPTIONS.map(({ key, icon: Icon }) => (
                  <FilterChip
                    key={key}
                    onClick={() => dispatch({ type: "TOGGLE_MEAL", payload: key })}
                    active={state.selectedMeals.has(key)}
                  >
                    <Icon className="size-3.5" />
                    {t(`filters.${key}`)}
                  </FilterChip>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      {hasActiveFilters && (
        <div className="px-5 py-4 border-t border-black/6 dark:border-white/6">
          <button
            onClick={() => dispatch({ type: "CLEAR_ALL" })}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-full border border-black/10 dark:border-white/10 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <RotateCcw className="size-4" />
            {t("filters.clear")}
          </button>
        </div>
      )}
    </div>
  );
}
