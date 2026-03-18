/**
 * Shared layout for map-based routes.
 * The Map component lives here and is shared between / and /r/:id routes.
 */
import { createFileRoute, Outlet, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Filters from "../components/Filters";
import RestaurantDetail from "../components/RestaurantDetail";
import RestaurantList from "../components/RestaurantList";
import SearchCommand from "../components/SearchCommand";
import type { Restaurant } from "../types";
import { useFilters } from "../hooks/useFilters";
import { useLocation } from "../hooks/useLocation";
import { type RegionFilter, REGIONS, DEFAULT_REGION } from "../lib/regions";
import {
  Search,
  SlidersHorizontal,
  Navigation,
  Loader2,
  MapIcon,
  List,
  MessageSquare,
  ChevronDown,
  UtensilsCrossed,
  Hotel,
  Wine,
  Coffee,
} from "lucide-react";
import FeedbackModal from "../components/FeedbackModal";
import { IconButton } from "../components/IconButton";
import { MapOverlayButton } from "../components/MapOverlayButton";

// Static import of all data
import restaurantData from "../../pipeline/.data/optimized/restaurants.frontend.json";
import barData from "../../pipeline/.data/optimized/bars.frontend.json";
import fikaData from "../../pipeline/.data/optimized/fika.frontend.json";
import hotelData from "../../pipeline/.data/optimized/hotels.frontend.json";

// Leaflet accesses `window` at module scope — return a placeholder during SSR
const Map = lazy(() => {
  if (import.meta.env.SSR) {
    return Promise.resolve({
      default: (() => null) as unknown as typeof import("../components/Map")["default"],
    });
  }
  return import("../components/Map");
});

export type DataMode = "restaurants" | "bars" | "fika" | "hotels";

// Pre-filter valid entries (with coordinates)
const ALL_RESTAURANTS = (restaurantData as Restaurant[]).filter((r) => r.lat && r.lng);
const ALL_BARS = (barData as Restaurant[]).filter((r) => r.lat && r.lng);
const ALL_FIKA = (fikaData as Restaurant[]).filter((r) => r.lat && r.lng);
const ALL_HOTELS = (hotelData as Restaurant[]).filter((r) => r.lat && r.lng);

/** Derive cuisine list from data, sorted by frequency, min 3 occurrences */
const GENERIC_TYPES = new Set(["Restaurang", "Café", "Bar", "Hotell"]);
function deriveCuisines(data: Restaurant[]): string[] {
  const counts: Record<string, number> = {};
  for (const r of data) {
    if (!r.cuisine) continue;
    for (const c of r.cuisine.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!GENERIC_TYPES.has(c)) counts[c] = (counts[c] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}

const DATA_MAP: Record<DataMode, Restaurant[]> = {
  restaurants: ALL_RESTAURANTS,
  bars: ALL_BARS,
  fika: ALL_FIKA,
  hotels: ALL_HOTELS,
};

const CUISINES_MAP: Record<DataMode, string[]> = {
  restaurants: deriveCuisines(ALL_RESTAURANTS),
  bars: deriveCuisines(ALL_BARS),
  fika: deriveCuisines(ALL_FIKA),
  hotels: deriveCuisines(ALL_HOTELS),
};

const MODE_ROOT: Record<DataMode, string> = {
  restaurants: "/",
  bars: "/b",
  fika: "/f",
  hotels: "/h",
};

const MODE_ROUTE: Record<DataMode, string> = {
  restaurants: "/r/$id",
  bars: "/b/$id",
  fika: "/f/$id",
  hotels: "/h/$id",
};

// Count entries per region for the dropdown
function getRegionCount(regionId: RegionFilter, data: Restaurant[]): number {
  if (regionId === "all") return data.length;
  return data.filter((r) => r.metroRegion === regionId).length;
}

export const Route = createFileRoute("/_map")({
  component: MapLayout,
});

type SidebarMode = "filters" | "restaurant" | null;

function MapLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Get venue ID from child route params (if on /r/:id or /h/:id)
  const params = useParams({ strict: false }) as { id?: string };
  const venueId = params.id;

  // ─── Data Mode (derived from URL path) ────────────────────────
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const dataMode: DataMode = pathname.startsWith("/h") ? "hotels"
    : pathname.startsWith("/b") ? "bars"
    : pathname.startsWith("/f") ? "fika"
    : "restaurants";
  const allData = DATA_MAP[dataMode];
  const cuisines = CUISINES_MAP[dataMode];

  // Find the venue by ID (search current dataset, fall back to both)
  const selectedRestaurant = useMemo(
    () => {
      if (!venueId) return null;
      return allData.find((r) => r.id === venueId)
        ?? ALL_RESTAURANTS.find((r) => r.id === venueId)
        ?? ALL_BARS.find((r) => r.id === venueId)
        ?? ALL_FIKA.find((r) => r.id === venueId)
        ?? ALL_HOTELS.find((r) => r.id === venueId)
        ?? null;
    },
    [venueId, allData]
  );

  // ─── Region State ─────────────────────────────────────────────────
  const [region, setRegion] = useState<RegionFilter>(DEFAULT_REGION);
  const [regionMenuOpen, setRegionMenuOpen] = useState(false);
  const regionMenuRef = useRef<HTMLDivElement>(null);

  // All venues for the map
  const allRestaurants = allData;

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
  // Sidebar state
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(
    selectedRestaurant ? "restaurant" : null
  );

  // Update sidebar mode when restaurant selection changes
  useEffect(() => {
    if (selectedRestaurant) {
      setSidebarMode("restaurant");
    } else {
      // Only close if we were showing a restaurant (use functional update to avoid dependency)
      setSidebarMode((prev) => (prev === "restaurant" ? null : prev));
    }
  }, [selectedRestaurant]);

  // Geolocation state (managed externally)
  const { location: userLocation, loading: locating, error: locationError, denied: locationDenied, locate: locateUser } = useLocation();

  // Feedback modal state
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  // Search command dialog state
  const [searchOpen, setSearchOpen] = useState(false);

  // Mobile view toggle (map vs list)
  const [mobileView, setMobileView] = useState<"map" | "list">("map");


  // ─── Handlers ──────────────────────────────────────────────────

  const handleRegionChange = useCallback((newRegion: RegionFilter) => {
    setRegion(newRegion);
    setRegionMenuOpen(false);
  }, []);

  // Handle venue selection - navigates to venue URL with correct prefix
  const handleSelectRestaurant = useCallback(
    (restaurant: Restaurant) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      navigate({ to: MODE_ROUTE[dataMode] as any, params: { id: restaurant.id } });
    },
    [navigate, dataMode]
  );

  // Handle closing sidebar - navigates back to mode root
  const closeSidebar = useCallback(() => {
    setSidebarMode(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: MODE_ROOT[dataMode] as any });
  }, [navigate, dataMode]);

  // Toggle filter sidebar
  const toggleFilters = useCallback(() => {
    if (sidebarMode === "filters") {
      setSidebarMode(selectedRestaurant ? "restaurant" : null);
    } else {
      setSidebarMode("filters");
    }
  }, [sidebarMode, selectedRestaurant]);

  // ─── Effects ───────────────────────────────────────────────────

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (regionMenuOpen) {
          setRegionMenuOpen(false);
          return;
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
  }, [sidebarMode, closeSidebar, regionMenuOpen, selectedRestaurant]);

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
      <header className="flex items-center h-14 px-4 relative z-[1003] gap-2 backdrop-blur-xl bg-white/85 dark:bg-zinc-950/90 border-b border-black/6 dark:border-white/8">
        {/* Left side: Region Selector */}
        <div className="flex items-center shrink-0 min-w-0">
          {/* Region selector */}
          <div className="relative" ref={regionMenuRef}>
            <button
              onClick={() => setRegionMenuOpen(!regionMenuOpen)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-full border border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 transition-colors text-sm font-medium"
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
                    onClick={() => handleRegionChange(r.id)}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                      r.id === region ? "font-semibold bg-black/5 dark:bg-white/5" : ""
                    }`}
                  >
                    {t(`regions.${r.id}`)}
                    <span className="text-muted-foreground ml-2">({getRegionCount(r.id, allData)})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1" />

        {/* Data mode toggle */}
        <div className="flex items-center h-8 rounded-full border border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/5 p-0.5">
          {([
            { mode: "restaurants" as DataMode, to: "/", icon: UtensilsCrossed, label: "header.restaurants" },
            { mode: "bars" as DataMode, to: "/b", icon: Wine, label: "header.bars" },
            { mode: "fika" as DataMode, to: "/f", icon: Coffee, label: "header.fika" },
            { mode: "hotels" as DataMode, to: "/h", icon: Hotel, label: "header.hotels" },
          ] as const).map(({ mode, to, icon: Icon, label }) => (
            <button
              key={mode}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={() => navigate({ to: to as any })}
              title={t(label)}
              className={`flex items-center justify-center h-7 w-8 rounded-full transition-colors ${
                dataMode === mode
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right side: Search + Feedback + Filter */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Search icon - opens search command dialog */}
          <IconButton
            onClick={() => setSearchOpen(true)}
            title={`${t("header.search")} (⌘K)`}
          >
            <Search className="size-5" />
          </IconButton>

          {/* Feedback icon button */}
          <IconButton onClick={() => setFeedbackOpen(true)} title={t("feedback.title")}>
            <MessageSquare className="size-5" />
          </IconButton>

          {/* Filter button */}
          <IconButton
            onClick={toggleFilters}
            aria-label={sidebarMode === "filters" ? t("filters.close_aria") : t("header.filter")}
            aria-expanded={sidebarMode === "filters"}
            active={sidebarMode === "filters"}
            className="relative"
          >
            <SlidersHorizontal className="size-5" />
            {activeFilterCount > 0 && sidebarMode !== "filters" && (
              <span className="absolute -top-1 -right-1 size-5 rounded-full bg-foreground text-background text-xs font-semibold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </IconButton>
        </div>
      </header>

      {/* ─── Main Content: Left Sidebar + Map ─────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Restaurant list - sidebar on desktop, slide-in overlay on mobile */}
        <div
          className={`
            overflow-hidden bg-background
            absolute inset-0 z-[1000] transition-transform duration-300
            ${mobileView === "list" ? "translate-x-0" : "-translate-x-full"}
            md:relative md:inset-auto md:z-auto md:w-80 md:translate-x-0 md:border-r md:border-black/5 md:dark:border-white/5
          `}
        >
          <RestaurantList
            restaurants={filtered}
            selectedRestaurant={selectedRestaurant}
            onSelectRestaurant={handleSelectRestaurant}
            userLocation={userLocation}
            locationDenied={locationDenied}
            onRequestLocation={locateUser}
            dataMode={dataMode}
          />
        </div>

        {/* Map container - always rendered, use z-index to layer on mobile */}
        <div className={`flex-1 relative overflow-hidden ${mobileView === "list" ? "mobile-list-active" : ""}`}>
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
          <MapOverlayButton
            onClick={locateUser}
            disabled={locating || locationDenied}
            className={`absolute z-[1000] bottom-4 right-4 ${mobileView === "list" ? "md:flex hidden" : ""}`}
            title={locationDenied ? t("location.denied") : locationError || (userLocation ? t("location.update") : t("location.show"))}
            aria-label={locationDenied ? t("location.denied") : (userLocation ? t("location.update") : t("location.show"))}
          >
            {locating ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Navigation
                className={`size-5 ${locationDenied ? "text-muted-foreground/40" : userLocation ? "text-blue-500" : "text-muted-foreground"}`}
              />
            )}
          </MapOverlayButton>
        </div>
      </div>

      {/* Mobile view toggle button */}
      <MapOverlayButton
        onClick={() => setMobileView(mobileView === "map" ? "list" : "map")}
        className="fixed z-[1100] bottom-4 left-4 md:hidden"
        aria-label={mobileView === "map" ? t("header.list") : t("header.map")}
      >
        {mobileView === "map" ? (
          <List className="size-5 text-muted-foreground" />
        ) : (
          <MapIcon className="size-5 text-muted-foreground" />
        )}
      </MapOverlayButton>

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
              dataMode={dataMode}
              cuisines={cuisines}
            />
          )}
          {sidebarMode === "restaurant" && selectedRestaurant && (
            <RestaurantDetail restaurant={selectedRestaurant} onClose={closeSidebar} />
          )}
        </div>
      </div>

      {/* Search Command Dialog */}
      <SearchCommand
        restaurants={allRestaurants}
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectRestaurant={handleSelectRestaurant}
      />

      {/* Feedback Modal */}
      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

      {/* Child routes render here (but we don't need them to render anything visible) */}
      <Outlet />
    </div>
  );
}
