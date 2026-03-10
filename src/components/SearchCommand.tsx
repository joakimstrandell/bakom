import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { Restaurant } from "../types";
import { ScoreBadge } from "./ScoreBadge";

type SearchCommandProps = {
  restaurants: Restaurant[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectRestaurant: (restaurant: Restaurant) => void;
};

const ITEM_HEIGHT = 72;

export default function SearchCommand({
  restaurants,
  open,
  onOpenChange,
  onSelectRestaurant,
}: SearchCommandProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const parentRef = useRef<HTMLDivElement>(null);

  // Reset search and selection when dialog opens
  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedIndex(0);
    }
  }, [open]);

  // Filter and sort restaurants
  const filteredRestaurants = useMemo(() => {
    const searchLower = search.toLowerCase().trim();

    // Filter
    const filtered = searchLower
      ? restaurants.filter((r) => {
          const searchText = `${r.name} ${r.cuisine || ""} ${r.address}`.toLowerCase();
          return searchText.includes(searchLower);
        })
      : [...restaurants];

    // Sort by score (best first)
    filtered.sort((a, b) => {
      if (a.bakomRank == null && b.bakomRank == null) return 0;
      if (a.bakomRank == null) return 1;
      if (b.bakomRank == null) return -1;
      return a.bakomRank - b.bakomRank;
    });

    return filtered;
  }, [restaurants, search]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const virtualizer = useVirtualizer({
    count: filteredRestaurants.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
    enabled: open, // Only enable when dialog is open
  });

  // Force re-measure when dialog opens (after animation)
  useEffect(() => {
    if (open) {
      // Small delay to wait for dialog animation
      const timer = setTimeout(() => {
        virtualizer.measure();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, virtualizer]);

  // Scroll selected item into view
  useEffect(() => {
    if (filteredRestaurants.length > 0 && open) {
      virtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [selectedIndex, virtualizer, filteredRestaurants.length, open]);

  const handleSelect = useCallback(
    (restaurant: Restaurant) => {
      onSelectRestaurant(restaurant);
      onOpenChange(false);
    },
    [onSelectRestaurant, onOpenChange]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filteredRestaurants.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredRestaurants.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredRestaurants[selectedIndex]) {
            handleSelect(filteredRestaurants[selectedIndex]);
          }
          break;
      }
    },
    [filteredRestaurants, selectedIndex, handleSelect]
  );

  // Global keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <CommandPrimitive
          className="flex h-full w-full flex-col overflow-hidden rounded-md bg-background text-foreground"
          shouldFilter={false}
          onKeyDown={handleKeyDown}
        >
          {/* Search Input */}
          <div className="flex items-center border-b border-black/10 dark:border-white/10 px-3">
            <Search className="mr-2 size-4 shrink-0 opacity-50" />
            <input
              className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              placeholder={t("search.placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Results */}
          <div
            ref={parentRef}
            className="h-[400px] overflow-y-auto overflow-x-hidden p-2"
          >
            {filteredRestaurants.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t("search.no_results")}
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
                  const r = filteredRestaurants[virtualItem.index];
                  const isSelected = virtualItem.index === selectedIndex;
                  return (
                    <div
                      key={r.id}
                      data-index={virtualItem.index}
                      ref={virtualizer.measureElement}
                      onClick={() => handleSelect(r)}
                      onMouseEnter={() => setSelectedIndex(virtualItem.index)}
                      className={`absolute top-0 left-0 w-full cursor-pointer select-none rounded-lg px-2 py-3 ${
                        isSelected ? "bg-black/5 dark:bg-white/5" : ""
                      }`}
                      style={{
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                    >
                      <div className="flex items-start gap-3 w-full">
                        {/* Score badge */}
                        <ScoreBadge score={r.bakomScore} size="sm" className="mt-0.5 shrink-0" />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{r.name}</div>
                          {r.cuisine && (
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                              {r.cuisine}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {r.address}
                          </div>
                        </div>

                        {/* Price */}
                        {r.priceRange && (
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {r.priceRange}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}
