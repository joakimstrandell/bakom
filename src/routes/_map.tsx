/**
 * Shared layout for map-based routes.
 * The Map component lives here and is shared between / and /r/:id routes.
 */
import { createFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Filters from "../components/Filters";
import RestaurantDetail from "../components/RestaurantDetail";
import RestaurantList from "../components/RestaurantList";
import type { Restaurant } from "../types";
import { useFilters } from "../hooks/useFilters";
import { type RegionFilter, REGIONS, DEFAULT_REGION } from "../lib/regions";
import {
  Search,
  SlidersHorizontal,
  Navigation,
  Loader2,
  X,
  MapIcon,
  List,
  MessageSquare,
  ChevronDown,
} from "lucide-react";
import FeedbackModal from "../components/FeedbackModal";

// Static import of all restaurant data
import restaurantData from "../../data/restaurants.frontend.json";

const Map = lazy(() => import("../components/Map"));

// Pre-filter valid restaurants (with coordinates)
const ALL_RESTAURANTS = (restaurantData as Restaurant[]).filter((r) => r.lat && r.lng);

// Count restaurants per region for the dropdown
function getRegionCount(regionId: RegionFilter): number {
  if (regionId === "all") return ALL_RESTAURANTS.length;
  return ALL_RESTAURANTS.filter((r) => r.metroRegion === regionId).length;
}

export const Route = createFileRoute("/_map")({
  component: MapLayout,
});

type SidebarMode = "filters" | "restaurant" | null;

function MapLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Get restaurant ID from child route params (if on /r/:id)
  const params = useParams({ strict: false }) as { id?: string };
  const restaurantId = params.id;

  // Find the restaurant by ID
  const selectedRestaurant = useMemo(
    () => (restaurantId ? (ALL_RESTAURANTS.find((r) => r.id === restaurantId) ?? null) : null),
    [restaurantId]
  );

  // ─── Region State ─────────────────────────────────────────────────
  const [region, setRegion] = useState<RegionFilter>(DEFAULT_REGION);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const regionMenuRef = useRef<HTMLDivElement>(null);

  // All restaurants for the map
  const allRestaurants = ALL_RESTAURANTS;

  // ─── Filter State (via useReducer hook) ────────────────────────
  // First filter by region, then apply other filters
  const regionFiltered = useMemo(() => {
    if (region === "all") return allRestaurants;
    return allRestaurants.filter((r) => r.metroRegion === region);
  }, [region, allRestaurants]);

  const {
    state: filterState,
    dispatch,
    filtered,
    activeFilterCount,
    hasActiveFilters,
  } = useFilters(regionFiltered);

  // ─── UI State ──────────────────────────────────────────────────
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sidebar state
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(
    selectedRestaurant ? "restaurant" : null
  );

  // Update sidebar mode when restaurant selection changes
  useEffect(() => {
    if (selectedRestaurant) {
      setSidebarMode("restaurant");
    } else {
      // Only close if we were showing a restaurant
      if (sidebarMode === "restaurant") {
        setSidebarMode(null);
      }
    }
  }, [selectedRestaurant]);

  // Geolocation state
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Feedback modal state
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Mobile view toggle (map vs list)
  const [mobileView, setMobileView] = useState<"map" | "list">("map");

  // ─── Handlers ──────────────────────────────────────────────────

  const handleRegionChange = useCallback((newRegion: RegionFilter) => {
    setRegion(newRegion);
    setRegionMenuOpen(false);
  }, []);

  const locateUser = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError(t("location.not_supported"));
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
            setLocationError(t("location.denied"));
            break;
          case err.POSITION_UNAVAILABLE:
            setLocationError(t("location.unavailable"));
            break;
          case err.TIMEOUT:
            setLocationError(t("location.timeout"));
            break;
          default:
            setLocationError(t("location.error"));
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [t]);

  // Handle restaurant selection - navigates to restaurant URL
  const handleSelectRestaurant = useCallback(
    (restaurant: Restaurant) => {
      navigate({ to: "/r/$id", params: { id: restaurant.id } });
    },
    [navigate]
  );

  // Handle closing sidebar - navigates back to home
  const closeSidebar = useCallback(() => {
    setSidebarMode(null);
    navigate({ to: "/" });
  }, [navigate]);

  // Toggle filter sidebar
  const toggleFilters = useCallback(() => {
    if (sidebarMode === "filters") {
      setSidebarMode(selectedRestaurant ? "restaurant" : null);
    } else {
      setSidebarMode("filters");
    }
  }, [sidebarMode, selectedRestaurant]);

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
        if (sidebarMode === "filters") {
          setSidebarMode(selectedRestaurant ? "restaurant" : null);
        } else if (sidebarMode === "restaurant") {
          closeSidebar();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    searchExpanded,
    filterState.searchQuery,
    sidebarMode,
    closeSidebar,
    regionMenuOpen,
    selectedRestaurant,
  ]);

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

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ─── Compact Header ─────────────────────────────────────── */}
      <header className="header-bar flex items-center justify-between h-14 px-4 relative z-[1003]">
        {/* Left side: Logo + Region Selector */}
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => navigate({ to: "/" })} className="logo-text logo-mark">
            B
          </button>

          {/* Region selector */}
          <div className="relative" ref={regionMenuRef}>
            <button
              onPointerDown={() => setRegionMenuOpen(!regionMenuOpen)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-black/10 bg-white/50 hover:bg-white/80 transition-colors text-sm font-medium"
            >
              <span className="hidden sm:inline">{t(`regions.${region}`)}</span>
              <span className="sm:hidden">{t(`regions_short.${region}`)}</span>
              <ChevronDown
                className={`size-4 transition-transform ${regionMenuOpen ? "rotate-180" : ""}`}
              />
            </button>

            {regionMenuOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-zinc-900 border border-black/10 dark:border-white/10 rounded-lg shadow-lg py-1 min-w-[160px] z-50">
                {REGIONS.map((r) => (
                  <button
                    key={r.id}
                    onPointerDown={() => handleRegionChange(r.id)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                      r.id === region ? "font-semibold bg-black/5 dark:bg-white/5" : ""
                    }`}
                  >
                    {t(`regions.${r.id}`)}
                    <span className="text-muted-foreground ml-2">({getRegionCount(r.id)})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right side: Search + Feedback + Filter */}
        <div className="flex items-center gap-1 shrink-0 relative">
          {/* Search - icon only when collapsed, expands left on click */}
          {searchExpanded || filterState.searchQuery ? (
            <div className="search-input-wrapper expanded">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder={t("header.search")}
                value={filterState.searchQuery}
                onChange={(e) => dispatch({ type: "SET_SEARCH", payload: e.target.value })}
                onBlur={() => {
                  if (!filterState.searchQuery) setSearchExpanded(false);
                }}
                className="search-input"
              />
              {filterState.searchQuery && (
                <button
                  onPointerDown={() => {
                    dispatch({ type: "SET_SEARCH", payload: "" });
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-black/5 transition-colors"
                >
                  <X className="size-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setSearchExpanded(true)}
              className="header-icon-btn"
              title={t("header.search")}
            >
              <Search className="size-5" />
            </button>
          )}

          {/* Feedback icon button */}
          <button
            onClick={() => setFeedbackOpen(true)}
            className="header-icon-btn"
            title={t("feedback.title")}
          >
            <MessageSquare className="size-5" />
          </button>

          {/* Filter button */}
          <button
            onPointerDown={toggleFilters}
            aria-label={sidebarMode === "filters" ? t("filters.close_aria") : t("header.filter")}
            aria-expanded={sidebarMode === "filters"}
            className={`header-icon-btn relative ${sidebarMode === "filters" ? "active" : ""}`}
          >
            <SlidersHorizontal className="size-5" />
            {activeFilterCount > 0 && sidebarMode !== "filters" && (
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-foreground text-background text-xs font-semibold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ─── Main Content: Left Sidebar + Map ─────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left sidebar - Restaurant list (desktop only) */}
        <div className="hidden md:block w-80 border-r border-black/5 dark:border-white/5 overflow-hidden">
          <RestaurantList
            restaurants={filtered}
            selectedRestaurant={selectedRestaurant}
            onSelectRestaurant={handleSelectRestaurant}
          />
        </div>

        {/* Map container - always rendered, use z-index to layer on mobile */}
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

          {/* Location button overlay - only show when map is visible */}
          <button
            onPointerDown={locateUser}
            disabled={locating}
            className={`map-overlay-btn bottom-4 right-4 size-12 ${mobileView === "list" ? "md:flex hidden" : ""}`}
            title={locationError || (userLocation ? t("location.update") : t("location.show"))}
          >
            {locating ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Navigation
                className={`size-5 ${userLocation ? "text-blue-500" : "text-muted-foreground"}`}
              />
            )}
          </button>
        </div>

        {/* Mobile list view - slides in from left */}
        <div
          className={`md:hidden absolute inset-0 bg-background z-[1000] overflow-hidden transition-transform duration-300 ${
            mobileView === "list" ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <RestaurantList
            restaurants={filtered}
            selectedRestaurant={selectedRestaurant}
            onSelectRestaurant={handleSelectRestaurant}
          />
        </div>
      </div>

      {/* Mobile view toggle button */}
      <button
        onPointerDown={() => setMobileView(mobileView === "map" ? "list" : "map")}
        className="md:hidden mobile-view-toggle"
        aria-label={mobileView === "map" ? t("header.list") : t("header.map")}
      >
        {mobileView === "map" ? <List className="size-5" /> : <MapIcon className="size-5" />}
      </button>

      {/* Mobile overlay tap-to-close */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 top-14 z-[1001] bg-black/20"
          onClick={(e) => {
            e.stopPropagation();
            if (sidebarMode === "filters") {
              setSidebarMode(selectedRestaurant ? "restaurant" : null);
            } else {
              closeSidebar();
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      )}

      {/* Sidebar - shows either Filters or Restaurant Detail */}
      <div
        className={`
          fixed top-14 bottom-0 right-0
          bg-white dark:bg-zinc-900 border-l border-black/5 dark:border-white/10
          transition-[width] duration-200 ease-out
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
              onClose={() => setSidebarMode(selectedRestaurant ? "restaurant" : null)}
              total={regionFiltered.length}
              filtered={filtered.length}
              hasActiveFilters={hasActiveFilters}
            />
          )}
          {sidebarMode === "restaurant" && selectedRestaurant && (
            <RestaurantDetail restaurant={selectedRestaurant} onClose={closeSidebar} />
          )}
        </div>
      </div>

      {/* Feedback Modal */}
      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      {/* Child routes render here (but we don't need them to render anything visible) */}
      <Outlet />
    </div>
  );
}
