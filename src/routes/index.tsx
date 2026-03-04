import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from "react";
import Filters from "../components/Filters";
import RestaurantDetail from "../components/RestaurantDetail";
import RestaurantList from "../components/RestaurantList";
import type { Restaurant } from "../types";
import { useFilters } from "../hooks/useFilters";
import { type Region, REGIONS, DEFAULT_REGION } from "../lib/regions";
import {
  Search,
  SlidersHorizontal,
  Navigation,
  Loader2,
  X,
  MapPin,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import FeedbackModal from "../components/FeedbackModal";

// Static imports for all region data files
import stockholmData from "../../data/restaurants.stockholm.frontend.json";
import gothenburgData from "../../data/restaurants.gothenburg.frontend.json";
import malmoData from "../../data/restaurants.malmo.frontend.json";
import swedenData from "../../data/restaurants.sweden.frontend.json";

const Map = lazy(() => import("../components/Map"));

// Pre-filter valid restaurants for each region
const REGION_DATA: Record<Region, Restaurant[]> = {
  stockholm: (stockholmData as Restaurant[]).filter((r) => r.lat && r.lng),
  gothenburg: (gothenburgData as Restaurant[]).filter((r) => r.lat && r.lng),
  malmo: (malmoData as Restaurant[]).filter((r) => r.lat && r.lng),
  sweden: (swedenData as Restaurant[]).filter((r) => r.lat && r.lng),
};

export const Route = createFileRoute("/")({
  ssr: false,
  component: HomePage,
});

type SidebarMode = "filters" | "restaurant" | null;

function HomePage() {
  // ─── Region State ─────────────────────────────────────────────────
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const regionMenuRef = useRef<HTMLDivElement>(null);

  // Get restaurants for current region
  const validRestaurants = useMemo(() => REGION_DATA[region], [region]);

  // ─── Filter State (via useReducer hook) ────────────────────────
  const { state: filterState, dispatch, filtered, activeFilterCount, hasActiveFilters } =
    useFilters(validRestaurants);

  // ─── UI State ──────────────────────────────────────────────────
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sidebar state
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  // Geolocation state
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Feedback modal state
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // ─── Handlers ──────────────────────────────────────────────────

  const handleRegionChange = useCallback((newRegion: Region) => {
    setRegion(newRegion);
    setRegionMenuOpen(false);
    // Clear selection when changing regions
    setSelectedRestaurant(null);
    if (sidebarMode === "restaurant") {
      setSidebarMode(null);
    }
  }, [sidebarMode]);

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

  // Handle restaurant selection - opens sidebar with restaurant details
  const handleSelectRestaurant = useCallback((restaurant: Restaurant) => {
    setSelectedRestaurant(restaurant);
    setSidebarMode("restaurant");
  }, []);

  // Handle closing sidebar
  const closeSidebar = useCallback(() => {
    setSidebarMode(null);
    setSelectedRestaurant(null);
  }, []);

  // Toggle filter sidebar
  const toggleFilters = useCallback(() => {
    if (sidebarMode === "filters") {
      setSidebarMode(null);
    } else {
      setSidebarMode("filters");
      setSelectedRestaurant(null);
    }
  }, [sidebarMode]);

  // ─── Effects ───────────────────────────────────────────────────

  // Focus search input when expanded
  useEffect(() => {
    if (searchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchExpanded]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (regionMenuOpen) {
          setRegionMenuOpen(false);
          return;
        }
        if (searchExpanded && !filterState.searchQuery) {
          setSearchExpanded(false);
        }
        if (sidebarMode) {
          closeSidebar();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchExpanded, filterState.searchQuery, sidebarMode, closeSidebar, regionMenuOpen]);

  // Close region menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (regionMenuRef.current && !regionMenuRef.current.contains(e.target as Node)) {
        setRegionMenuOpen(false);
      }
    };
    if (regionMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [regionMenuOpen]);

  // ─── Layout Constants ──────────────────────────────────────────
  const SIDEBAR_WIDTH = 360;
  const sidebarOpen = sidebarMode !== null;

  const currentRegion = REGIONS.find((r) => r.id === region)!;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ─── Compact Header ─────────────────────────────────────── */}
      <header className="header-bar flex items-center h-14 px-4 relative z-[1003]">
        {/* Logo + Region Selector - left side */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="logo-text">Bakom</span>

          {/* Region selector */}
          <div className="relative" ref={regionMenuRef}>
            <button
              onClick={() => setRegionMenuOpen(!regionMenuOpen)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-black/10 bg-white/50 hover:bg-white/80 transition-colors text-sm font-medium"
            >
              <span className="hidden sm:inline">{currentRegion.label}</span>
              <span className="sm:hidden">{currentRegion.shortLabel}</span>
              <ChevronDown className={`size-4 transition-transform ${regionMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {regionMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                {REGIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleRegionChange(r.id)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                      r.id === region ? "font-semibold bg-black/5 dark:bg-white/5" : ""
                    }`}
                  >
                    {r.label}
                    <span className="text-muted-foreground ml-2">
                      ({REGION_DATA[r.id].length})
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => setFeedbackOpen(true)}
            className="hidden sm:flex items-center gap-1.5 h-8 px-3 rounded-full border border-black/10 bg-white/50 hover:bg-white/80 transition-colors text-xs font-medium text-muted-foreground hover:text-foreground"
            title="Skicka feedback"
          >
            <MessageSquare className="size-3.5" />
            <span>Feedback</span>
          </button>
        </div>

        {/* Search - centered */}
        <div className="flex-1 flex justify-center px-4">
          <div
            className={`search-input-wrapper ${searchExpanded || filterState.searchQuery ? "expanded" : "collapsed"}`}
          >
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Sök restaurang..."
              value={filterState.searchQuery}
              onChange={(e) =>
                dispatch({ type: "SET_SEARCH", payload: e.target.value })
              }
              onFocus={() => setSearchExpanded(true)}
              onBlur={() => {
                if (!filterState.searchQuery) setSearchExpanded(false);
              }}
              className="search-input"
            />
            {filterState.searchQuery && (
              <button
                onClick={() => {
                  dispatch({ type: "SET_SEARCH", payload: "" });
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-black/5 transition-colors"
              >
                <X className="size-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Filter button & count - right side */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="count-badge hidden sm:flex">
            <MapPin className="size-3.5" />
            <strong>{filtered.length}</strong>
            {filtered.length !== validRestaurants.length && (
              <span className="text-muted-foreground">
                / {validRestaurants.length}
              </span>
            )}
          </div>
          <button
            onPointerDown={toggleFilters}
            aria-label={sidebarMode === "filters" ? "Stäng filter" : "Öppna filter"}
            aria-expanded={sidebarMode === "filters"}
            className={`relative flex items-center gap-2 h-10 px-4 rounded-full border transition-all text-sm font-medium select-none ${
              sidebarMode === "filters"
                ? "bg-foreground text-background border-foreground"
                : "border-black/10 bg-white/50 hover:bg-white/80"
            }`}
          >
            <SlidersHorizontal className="size-4" />
            <span className="hidden sm:inline">
              {sidebarMode === "filters" ? "Stäng" : "Filter"}
            </span>
            {activeFilterCount > 0 && sidebarMode !== "filters" && (
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-foreground text-background text-xs font-semibold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ─── Main Content: Left Sidebar + Map ─────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Restaurant list (desktop only) */}
        <div className="hidden md:block w-80 border-r border-black/5 dark:border-white/5 overflow-hidden">
          <RestaurantList
            restaurants={filtered}
            selectedRestaurant={selectedRestaurant}
            onSelectRestaurant={handleSelectRestaurant}
          />
        </div>

        {/* Map container */}
        <div className="flex-1 relative overflow-hidden">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
              </div>
            }
          >
            <Map
              restaurants={filtered}
              userLocation={userLocation}
              selectedRestaurant={selectedRestaurant}
              onSelectRestaurant={handleSelectRestaurant}
              region={region}
            />
          </Suspense>

          {/* Location button overlay */}
          <button
            onClick={locateUser}
            disabled={locating}
            className="map-overlay-btn bottom-6 right-4 size-12"
            title={
              locationError || (userLocation ? "Uppdatera plats" : "Visa min plats")
            }
          >
            {locating ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Navigation
                className={`size-5 ${userLocation ? "text-blue-500" : "text-muted-foreground"}`}
              />
            )}
          </button>

          {/* Mobile count badge */}
          <div className="sm:hidden count-badge absolute bottom-6 left-4 z-[1000]">
            <MapPin className="size-3.5" />
            <strong>{filtered.length}</strong>
          </div>
        </div>
      </div>

      {/* Mobile overlay tap-to-close */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 top-14 z-[1001] bg-black/20"
          onPointerDown={closeSidebar}
        />
      )}

      {/* Sidebar - shows either Filters or Restaurant Detail */}
      <div
        className={`
          fixed top-14 bottom-0 right-0
          bg-white dark:bg-zinc-900 border-l border-black/5 dark:border-white/10
          transition-all duration-300 ease-out
          overflow-hidden z-[1002]
          ${sidebarOpen ? "shadow-[-8px_0_24px_rgba(0,0,0,0.1)]" : ""}
        `}
        style={{
          width: sidebarOpen ? SIDEBAR_WIDTH : 0,
          maxWidth: "calc(100vw - 60px)",
        }}
      >
        <div
          className="h-full overflow-hidden"
          style={{ width: SIDEBAR_WIDTH, maxWidth: "calc(100vw - 60px)" }}
        >
          {sidebarMode === "filters" && (
            <Filters
              state={filterState}
              dispatch={dispatch}
              onClose={closeSidebar}
              total={validRestaurants.length}
              filtered={filtered.length}
              hasActiveFilters={hasActiveFilters}
            />
          )}
          {sidebarMode === "restaurant" && selectedRestaurant && (
            <RestaurantDetail
              restaurant={selectedRestaurant}
              onClose={closeSidebar}
            />
          )}
        </div>
      </div>

      {/* Feedback Modal */}
      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
