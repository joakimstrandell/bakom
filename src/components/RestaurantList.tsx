import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MapPin, ArrowDownAZ, TrendingUp, Navigation } from "lucide-react";
import type { Restaurant } from "../types";
import type { DataMode } from "../routes/_map";
import { ScoreBadge } from "./ScoreBadge";
import { calculateDistance, formatDistance } from "../lib/distance";

const PRICE_LABELS: Record<string, string> = { budget: "€", mellan: "€€", lyx: "€€€" };

type SortOption = "name" | "score" | "distance";

type UserLocation = { lat: number; lng: number } | null;

type RestaurantListProps = {
  restaurants: Restaurant[];
  selectedRestaurant: Restaurant | null;
  onSelectRestaurant: (restaurant: Restaurant) => void;
  userLocation?: UserLocation;
  locationDenied?: boolean;
  onRequestLocation?: () => Promise<boolean>;
  dataMode?: DataMode;
};

const ITEM_HEIGHT = 88; // Estimated height for each restaurant item

export default function RestaurantList({
  restaurants,
  selectedRestaurant,
  onSelectRestaurant,
  userLocation,
  locationDenied = false,
  onRequestLocation,
  dataMode = "restaurants",
}: RestaurantListProps) {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<SortOption>("score");
  const prevSortRef = useRef<SortOption>("score");
  const parentRef = useRef<HTMLDivElement>(null);

  const handleDistanceSort = useCallback(async () => {
    // If we already have location, just switch to distance sort
    if (userLocation) {
      prevSortRef.current = sortBy;
      setSortBy("distance");
      return;
    }

    // No location yet - request it and only switch on success
    if (onRequestLocation) {
      const success = await onRequestLocation();
      if (success) {
        prevSortRef.current = sortBy;
        setSortBy("distance");
      }
    }
  }, [userLocation, sortBy, onRequestLocation]);

  // Calculate distances for all restaurants (memoized)
  const distances = useMemo(() => {
    if (!userLocation) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const r of restaurants) {
      if (r.lat != null && r.lng != null) {
        map.set(r.id, calculateDistance(userLocation.lat, userLocation.lng, r.lat, r.lng));
      }
    }
    return map;
  }, [restaurants, userLocation]);

  const sortedRestaurants = useMemo(() => {
    const sorted = [...restaurants];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "sv"));
    } else if (sortBy === "score") {
      sorted.sort((a, b) => {
        // Nulls go last
        if (a.bakomRank == null && b.bakomRank == null) return 0;
        if (a.bakomRank == null) return 1;
        if (b.bakomRank == null) return -1;
        return a.bakomRank - b.bakomRank; // Ascending rank (1 is best)
      });
    } else if (sortBy === "distance") {
      sorted.sort((a, b) => {
        const distA = distances.get(a.id);
        const distB = distances.get(b.id);
        // No distance (no coords or no user location) goes last
        if (distA == null && distB == null) return 0;
        if (distA == null) return 1;
        if (distB == null) return -1;
        return distA - distB;
      });
    }
    return sorted;
  }, [restaurants, sortBy, distances]);

  // Track hydration — render static list during SSR for search engines
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const virtualizer = useVirtualizer({
    count: sortedRestaurants.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
    enabled: mounted,
  });

  const renderItem = (r: Restaurant, isSelected: boolean) => (
    <div className="flex items-start gap-3">
      <ScoreBadge score={r.bakomScore} size="sm" className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm font-medium truncate block ${
            isSelected ? "text-foreground" : ""
          }`}
        >
          {r.name}
        </span>
        {(r.cuisine || (sortBy === "distance" && distances.get(r.id))) && (
          <div className="text-xs text-muted-foreground truncate mt-0.5">
            {r.cuisine}
            {sortBy === "distance" && distances.get(r.id) != null && (
              <>
                {r.cuisine && " · "}
                {formatDistance(distances.get(r.id)!)}
              </>
            )}
          </div>
        )}
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {r.address}
        </div>
        {r.bakomRank != null && (
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {t("list.rank_sweden", { rank: r.bakomRank })}
            {r.metroRegion &&
              r.metroRegion !== "sweden" &&
              r.bakomRankRegion != null && (
                <>
                  {" "}
                  ·{" "}
                  {t("list.rank_region", {
                    rank: r.bakomRankRegion,
                    region: t(`regions.${r.metroRegion}`),
                  })}
                </>
              )}
          </div>
        )}
      </div>
      {r.priceRange && (
        <span className="shrink-0 text-xs text-muted-foreground">{PRICE_LABELS[r.priceRange] || r.priceRange}</span>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-black/6 dark:border-white/6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t(`list.${dataMode}`, { count: restaurants.length })}
            </span>
          </div>

          {/* Sort toggle */}
          <div className="flex gap-1 p-0.5 bg-black/5 dark:bg-white/5 rounded-md">
            <button
              onClick={() => setSortBy("name")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                sortBy === "name"
                  ? "bg-white dark:bg-zinc-800 shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title={t("list.sort_name")}
            >
              <ArrowDownAZ className="size-3.5" />
            </button>
            <button
              onClick={() => setSortBy("score")}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                sortBy === "score"
                  ? "bg-white dark:bg-zinc-800 shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title={t("list.sort_score")}
            >
              <TrendingUp className="size-3.5" />
            </button>
            <button
              onClick={handleDistanceSort}
              disabled={locationDenied}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                sortBy === "distance"
                  ? "bg-white dark:bg-zinc-800 shadow-sm text-foreground"
                  : locationDenied
                    ? "text-muted-foreground/40 cursor-not-allowed"
                    : "text-muted-foreground hover:text-foreground"
              }`}
              title={locationDenied ? t("location.denied") : t("list.sort_distance")}
              aria-label={locationDenied ? t("location.denied") : t("list.sort_distance")}
            >
              <Navigation className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* List — static during SSR for SEO, virtualized on client */}
      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {sortedRestaurants.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t("list.empty")}
          </div>
        ) : !mounted ? (
          // SSR: render all items as plain list for search engine indexing
          <div>
            {sortedRestaurants.map((r) => (
              <div
                key={r.id}
                className="w-full text-left px-4 py-3 border-b border-black/5 dark:border-white/5"
              >
                {renderItem(r, selectedRestaurant?.id === r.id)}
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const r = sortedRestaurants[virtualItem.index];
              const isSelected = selectedRestaurant?.id === r.id;
              return (
                <button
                  key={r.id}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  onClick={() => onSelectRestaurant(r)}
                  className={`absolute top-0 left-0 w-full text-left px-4 py-3 transition-colors hover:bg-black/3 dark:hover:bg-white/3 border-b border-black/5 dark:border-white/5 ${
                    isSelected ? "bg-black/5 dark:bg-white/5" : ""
                  }`}
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {renderItem(r, isSelected)}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
