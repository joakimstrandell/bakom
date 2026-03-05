import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, ArrowDownAZ, TrendingUp } from "lucide-react";
import type { Restaurant } from "../types";
import { ScoreBadge } from "./ScoreBadge";

type SortOption = "name" | "score";

type RestaurantListProps = {
  restaurants: Restaurant[];
  selectedRestaurant: Restaurant | null;
  onSelectRestaurant: (restaurant: Restaurant) => void;
};

export default function RestaurantList({
  restaurants,
  selectedRestaurant,
  onSelectRestaurant,
}: RestaurantListProps) {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<SortOption>("score");

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
    }
    return sorted;
  }, [restaurants, sortBy]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 border-b border-black/6 dark:border-white/6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t("list.restaurants", { count: restaurants.length })}
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
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {sortedRestaurants.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t("list.empty")}
          </div>
        ) : (
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {sortedRestaurants.map((r) => {
              const isSelected = selectedRestaurant?.id === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => onSelectRestaurant(r)}
                  className={`w-full text-left px-4 py-3 transition-colors hover:bg-black/3 dark:hover:bg-white/3 ${
                    isSelected ? "bg-black/5 dark:bg-white/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Score badge */}
                    <ScoreBadge score={r.bakomScore} size="sm" className="mt-0.5" />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-sm font-medium truncate ${
                          isSelected ? "text-foreground" : ""
                        }`}
                      >
                        {r.name}
                      </span>
                      {r.cuisine && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">
                          {r.cuisine}
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

                    {/* Price */}
                    {r.priceRange && (
                      <span className="shrink-0 text-xs text-muted-foreground">{r.priceRange}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
