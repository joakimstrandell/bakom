import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState, useMemo, useCallback } from "react";
import allRestaurants from "../../data/restaurants.json";
import Filters from "../components/Filters";
import type { Restaurant } from "../types";
import { Button } from "@/components/ui/button";
import { MapPin, Navigation, Loader2 } from "lucide-react";

const Map = lazy(() => import("../components/Map"));

const validRestaurants = (allRestaurants as Restaurant[]).filter(
  (r) => r.lat && r.lng
);

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
  const [minRating, setMinRating] = useState(0);
  const [minBakomScore, setMinBakomScore] = useState(0);
  const [michelinOnly, setMichelinOnly] = useState(false);
  const [whiteGuideOnly, setWhiteGuideOnly] = useState(false);
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

  const handleRatingChange = useCallback((r: number) => {
    setMinRating(r);
  }, []);

  const handleBakomScoreChange = useCallback((s: number) => {
    setMinBakomScore(s);
  }, []);

  const handleMichelinToggle = useCallback(() => {
    setMichelinOnly((prev) => !prev);
  }, []);

  const handleWhiteGuideToggle = useCallback(() => {
    setWhiteGuideOnly((prev) => !prev);
  }, []);

  const clearFilters = useCallback(() => {
    setSelectedCuisines(new Set());
    setSelectedPrices(new Set());
    setSearchQuery("");
    setMinRating(0);
    setMinBakomScore(0);
    setMichelinOnly(false);
    setWhiteGuideOnly(false);
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
      if (minRating > 0) {
        // Use best available numeric rating (Google preferred, then Krogguiden)
        const bestRating = r.ratings.google ?? r.ratings.krogguiden ?? null;
        if (!bestRating || bestRating < minRating) return false;
      }
      if (minBakomScore > 0) {
        if (r.bakomScore == null || r.bakomScore < minBakomScore) return false;
      }
      if (michelinOnly) {
        if (!r.ratings.michelin) return false;
      }
      if (whiteGuideOnly) {
        if (!r.ratings.whiteguide) return false;
      }
      return true;
    });
  }, [selectedCuisines, selectedPrices, searchQuery, minRating, minBakomScore, michelinOnly, whiteGuideOnly]);

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
        minRating={minRating}
        minBakomScore={minBakomScore}
        michelinOnly={michelinOnly}
        whiteGuideOnly={whiteGuideOnly}
        onToggleCuisine={toggleCuisine}
        onTogglePrice={togglePrice}
        onSearchChange={setSearchQuery}
        onRatingChange={handleRatingChange}
        onBakomScoreChange={handleBakomScoreChange}
        onMichelinToggle={handleMichelinToggle}
        onWhiteGuideToggle={handleWhiteGuideToggle}
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
