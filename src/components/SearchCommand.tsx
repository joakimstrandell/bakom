import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Restaurant } from "../types";
import { ScoreBadge } from "./ScoreBadge";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "./ui/command";

type SearchCommandProps = {
  restaurants: Restaurant[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectRestaurant: (restaurant: Restaurant) => void;
};

export default function SearchCommand({
  restaurants,
  open,
  onOpenChange,
  onSelectRestaurant,
}: SearchCommandProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Reset search when dialog opens
  useEffect(() => {
    if (open) {
      setSearch("");
    }
  }, [open]);

  // Scroll list to top when search changes
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [search]);

  // Sort restaurants by score (best first)
  const sortedRestaurants = useMemo(() => {
    const sorted = [...restaurants];
    sorted.sort((a, b) => {
      if (a.bakomRank == null && b.bakomRank == null) return 0;
      if (a.bakomRank == null) return 1;
      if (b.bakomRank == null) return -1;
      return a.bakomRank - b.bakomRank;
    });
    return sorted;
  }, [restaurants]);

  const handleSelect = useCallback(
    (restaurant: Restaurant) => {
      onSelectRestaurant(restaurant);
      onOpenChange(false);
    },
    [onSelectRestaurant, onOpenChange]
  );

  // Keyboard shortcut to open search
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
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t("search.placeholder")}
        value={search}
        onValueChange={setSearch}
      />
      <CommandList ref={listRef}>
        <CommandEmpty>{t("search.no_results")}</CommandEmpty>
        <CommandGroup heading={t("search.restaurants")}>
          {sortedRestaurants.map((r) => (
            <CommandItem
              key={r.id}
              value={`${r.name} ${r.cuisine || ""} ${r.address}`}
              onSelect={() => handleSelect(r)}
              className="py-3"
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
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
