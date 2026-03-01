import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState, useMemo, useCallback } from "react";
import allRestaurants from "../../data/restaurants.frontend.json";
import Filters from "../components/Filters";
import type { Restaurant, MichelinDistinction, WhiteGuideClassification } from "../types";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Loader2 } from "lucide-react";

const Map = lazy(() => import("../components/Map"));

const validRestaurants = (allRestaurants as Restaurant[]).filter(
  (r) => r.lat && r.lng
);

// Hierarchical rank for categorical sources (higher = better)
const MICHELIN_RANK: Record<MichelinDistinction, number> = {
  selected: 1,
  bib_gourmand: 2,
  "1_star": 3,
  "2_star": 4,
  "3_star": 5,
};

const WG_RANK: Record<WhiteGuideClassification, number> = {
  recommended: 1,
  good_class: 2,
  very_good_class: 3,
  master_class: 4,
  global_master_class: 5,
};

export const Route = createFileRoute("/")(
  {
  ssr: false,
  component: HomePage,
});

function HomePage() {
  const [selectedCuisines, setSelectedCuisines] = useState<Set<string>>(
    new Set()
  );
  const [selectedPrices, setSelectedPrices] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // Per-source rating thresholds (0 = no filter)
  const [minBakomScore, setMinBakomScore] = useState(0);
  const [minKrogguiden, setMinKrogguiden] = useState(0);
  const [minGoogle, setMinGoogle] = useState(0);
  const [minThatsup, setMinThatsup] = useState(0);
  const [minSvd, setMinSvd] = useState(0);
  const [minMichelin, setMinMichelin] = useState(0);
  const [minWhiteGuide, setMinWhiteGuide] = useState(0);
  const [minDn, setMinDn] = useState(0);

  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const toggleCuisine = useCallback((c: string) => {
    setSelectedCuisines((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }, []);

  const togglePrice = useCallback((p: string) => {
    setSelectedPrices((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  // Generic callback for all source filters
  const handleSourceFilterChange = useCallback((source: string, value: number) => {
    switch (source) {
      case "bakom": setMinBakomScore(value); break;
      case "krogguiden": setMinKrogguiden(value); break;
      case "google": setMinGoogle(value); break;
      case "thatsup": setMinThatsup(value); break;
      case "svd": setMinSvd(value); break;
      case "michelin": setMinMichelin(value); break;
      case "whiteguide": setMinWhiteGuide(value); break;
      case "dn": setMinDn(value); break;
    }
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedCuisines(new Set());
    setSelectedPrices(new Set());
    setSearchQuery("");
    setMinBakomScore(0);
    setMinKrogguiden(0);
    setMinGoogle(0);
    setMinThatsup(0);
    setMinSvd(0);
    setMinMichelin(0);
    setMinWhiteGuide(0);
    setMinDn(0);
  }, []);

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolokalisering stöds inte av din webbläsare.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setLocationError("Platsåtkomst nekad.");
            break;
          case err.POSITION_UNAVAILABLE:
            setLocationError("Platsinformation ej tillgänglig.");
            break;
          case err.TIMEOUT:
            setLocationError("Tidsgräns för platsförfrågan.");
            break;
          default:
            setLocationError("Kunde inte hämta din plats.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const filtered = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return validRestaurants.filter((r) => {
      if (query) {
        const searchable =
          `${r.name} ${r.address} ${r.region} ${r.cuisine}`.toLowerCase();
        if (!searchable.includes(query)) return false;
      }
      if (selectedCuisines.size > 0) {
        const cuisines = r.cuisine
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (!cuisines.some((c) => selectedCuisines.has(c))) return false;
      }
      if (selectedPrices.size > 0) {
        if (!selectedPrices.has(r.priceRange)) return false;
      }
      // Per-source rating filters
      if (minBakomScore > 0) {
        if (r.bakomScore == null || r.bakomScore < minBakomScore) return false;
      }
      if (minKrogguiden > 0) {
        if (!r.ratings.krogguiden || r.ratings.krogguiden < minKrogguiden) return false;
      }
      if (minGoogle > 0) {
        if (!r.ratings.google || r.ratings.google < minGoogle) return false;
      }
      if (minThatsup > 0) {
        if (!r.ratings.thatsup || r.ratings.thatsup < minThatsup) return false;
      }
      if (minSvd > 0) {
        if (!r.ratings.svd || r.ratings.svd < minSvd) return false;
      }
      if (minMichelin > 0) {
        if (!r.ratings.michelin || MICHELIN_RANK[r.ratings.michelin] < minMichelin) return false;
      }
      if (minWhiteGuide > 0) {
        if (!r.ratings.whiteguide || WG_RANK[r.ratings.whiteguide] < minWhiteGuide) return false;
      }
      if (minDn > 0) {
        if (!r.ratings.dn) return false;
      }
      return true;
    });
  }, [selectedCuisines, selectedPrices, searchQuery, minBakomScore, minKrogguiden, minGoogle, minThatsup, minSvd, minMichelin, minWhiteGuide, minDn]);

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-3 px-5 py-3 bg-primary text-primary-foreground">
        <MapPin className="size-5" />
        <h1 className="text-lg font-semibold tracking-tight">
          Bakom
        </h1>
        <span className="text-sm opacity-70 hidden sm:inline">
          Stockholms restauranger
        </span>
        <div className="ml-auto flex items-center gap-2">
          {locationError && (
            <span className="text-xs text-red-300">{locationError}</span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={locateUser}
            disabled={locating}
            className="gap-1.5"
          >
            {locating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Navigation className="size-4" />
            )}
            {userLocation ? "Uppdatera plats" : "Visa min plats"}
          </Button>
        </div>
      </header>
      <Filters
        cuisines={selectedCuisines}
        prices={selectedPrices}
        searchQuery={searchQuery}
        minBakomScore={minBakomScore}
        minKrogguiden={minKrogguiden}
        minGoogle={minGoogle}
        minThatsup={minThatsup}
        minSvd={minSvd}
        minMichelin={minMichelin}
        minWhiteGuide={minWhiteGuide}
        minDn={minDn}
        onToggleCuisine={toggleCuisine}
        onTogglePrice={togglePrice}
        onSearchChange={setSearchQuery}
        onSourceFilterChange={handleSourceFilterChange}
        onClear={clearFilters}
        total={validRestaurants.length}
        filtered={filtered.length}
      />
      <div className="flex-1">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Laddar karta...
            </div>
          }
        >
          <Map restaurants={filtered} userLocation={userLocation} />
        </Suspense>
      </div>
    </div>
  );
}
