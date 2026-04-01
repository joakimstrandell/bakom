import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { useEffect, useRef } from "react";
import type { Restaurant } from "../types";
import { scoreColor, scoreStrokeColor } from "../lib/colors";
import type { RegionFilter } from "../lib/regions";
import { getRegionConfig } from "../lib/regions";

// ─── Marker Constants ────────────────────────────────────────────

// SVG marker factory — creates a pin-shaped marker with the given color
// Base viewBox is 25x41, padding added to prevent stroke clipping
const MARKER_PAD = 2;
const MARKER_W = 24;
const MARKER_H = 37;
const MARKER_ANCHOR_X = Math.round(((12.5 + MARKER_PAD) / (25 + MARKER_PAD * 2)) * MARKER_W);
const MARKER_ANCHOR_Y = Math.round(((41 + MARKER_PAD) / (41 + MARKER_PAD * 2)) * MARKER_H);

// Selected marker is larger with more padding for glow effect
const SELECTED_PAD = 8;
const MARKER_W_SELECTED = 32;
const MARKER_H_SELECTED = 46;
const SELECTED_ANCHOR_X = Math.round(
  ((12.5 + SELECTED_PAD) / (25 + SELECTED_PAD * 2)) * MARKER_W_SELECTED
);
const SELECTED_ANCHOR_Y = Math.round(
  ((41 + SELECTED_PAD) / (41 + SELECTED_PAD * 2)) * MARKER_H_SELECTED
);

// ─── SVG Marker Factories ────────────────────────────────────────

function createMarkerSvg(fill: string, stroke: string): string {
  const p = MARKER_PAD;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MARKER_W}" height="${MARKER_H}" viewBox="${-p} ${-p} ${25 + p * 2} ${41 + p * 2}">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
    <circle cx="12.5" cy="12.5" r="5.5" fill="white" opacity="0.9"/>
  </svg>`;
}

function createSelectedMarkerSvg(): string {
  const p = SELECTED_PAD;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MARKER_W_SELECTED}" height="${MARKER_H_SELECTED}" viewBox="${-p} ${-p} ${25 + p * 2} ${41 + p * 2}">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="#0f172a" stroke="#000000" stroke-width="2"/>
    <circle cx="12.5" cy="12.5" r="5.5" fill="white" opacity="1"/>
  </svg>`;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// ─── Static Icons ────────────────────────────────────────────────

const grayIcon = L.icon({
  iconUrl: svgToDataUrl(createMarkerSvg("#94a3b8", "#64748b")),
  iconSize: [MARKER_W, MARKER_H],
  iconAnchor: [MARKER_ANCHOR_X, MARKER_ANCHOR_Y],
  popupAnchor: [1, -MARKER_ANCHOR_Y + 6],
});

// Single black icon for all selected states
const selectedIcon = L.icon({
  iconUrl: svgToDataUrl(createSelectedMarkerSvg()),
  iconSize: [MARKER_W_SELECTED, MARKER_H_SELECTED],
  iconAnchor: [SELECTED_ANCHOR_X, SELECTED_ANCHOR_Y],
  popupAnchor: [1, -SELECTED_ANCHOR_Y + 6],
});

// Cache score-based marker icons (keyed by score rounded to nearest 5)
// NOTE: Cannot use `new Map()` here — the default export `function Map` hoists
// and shadows the global Map constructor, causing a runtime crash.
const scoreIconCache: Record<string, L.Icon> = {};

// ─── Marker Icon Factory ─────────────────────────────────────────

function getMarkerIcon(r: Restaurant, isSelected: boolean = false): L.Icon {
  // All selected pins use the same black icon
  if (isSelected) {
    return selectedIcon;
  }

  if (r.bakomScore == null) {
    return grayIcon;
  }

  // Round to nearest 5 for caching (max 21 unique icons)
  const rounded = Math.round(r.bakomScore / 5) * 5;
  const key = String(rounded);

  if (!scoreIconCache[key]) {
    const fill = scoreColor(rounded);
    const stroke = scoreStrokeColor(rounded);
    scoreIconCache[key] = L.icon({
      iconUrl: svgToDataUrl(createMarkerSvg(fill, stroke)),
      iconSize: [MARKER_W, MARKER_H],
      iconAnchor: [MARKER_ANCHOR_X, MARKER_ANCHOR_Y],
      popupAnchor: [1, -MARKER_ANCHOR_Y + 6],
    });
  }

  return scoreIconCache[key];
}

// ─── Map Helper Components ───────────────────────────────────────

type UserLocation = { lat: number; lng: number } | null;

/** Flies to the user's location when it changes */
function FlyToUser({ location }: { location: UserLocation }) {
  const map = useMap();

  useEffect(() => {
    if (location) {
      map.flyTo([location.lat, location.lng], 15, { duration: 1.2 });
    }
  }, [location, map]);

  return null;
}

/** Flies to region center when region changes */
function FlyToRegion({ region }: { region: RegionFilter }) {
  const map = useMap();
  const prevRegion = useRef<RegionFilter>(region);

  useEffect(() => {
    // Only fly if region actually changed (skip initial render and re-renders)
    if (prevRegion.current === region) return;
    prevRegion.current = region;

    const config = getRegionConfig(region);
    map.flyTo(config.center, config.zoom, { duration: 0.8 });
  }, [region, map]);

  return null;
}

/** Zooms to approximate IP-based location on initial load (no marker shown) */
function FlyToIPLocation({ enabled }: { enabled: boolean }) {
  const map = useMap();
  const fetched = useRef(false);

  useEffect(() => {
    if (!enabled || fetched.current) return;
    fetched.current = true;

    fetch("https://get.geojs.io/v1/ip/geo.json")
      .then((res) => res.json())
      .then((data) => {
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          // Use setView instead of flyTo — more reliable on mobile where
          // the map container may not be fully laid out yet.
          map.setView([lat, lng], 12);
        }
      })
      .catch(() => {
        // Silently fail — keep default view
      });
  }, [enabled, map]);

  return null;
}

/** Pans/zooms map to selected restaurant if not visible or in a cluster */
function PanToSelected({
  restaurant,
  rightSidebarWidth = 360,
  clusterGroupRef,
  initialRestaurantId,
}: {
  restaurant: Restaurant | null;
  rightSidebarWidth?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clusterGroupRef: React.RefObject<any>;
  initialRestaurantId?: string;
}) {
  const map = useMap();
  const hasHandledFirstRestaurant = useRef(false);

  useEffect(() => {
    if (!restaurant || restaurant.lat == null || restaurant.lng == null) return;

    // Skip the very first effect run if we loaded with this restaurant
    // (MapContainer already positioned the map correctly)
    if (!hasHandledFirstRestaurant.current) {
      hasHandledFirstRestaurant.current = true;
      if (restaurant.id === initialRestaurantId) {
        return;
      }
    }

    const latlng = L.latLng(restaurant.lat, restaurant.lng);
    const clusterGroup = clusterGroupRef.current;

    // Helper to check/fix sidebar overlap
    const adjustForSidebar = () => {
      const point = map.latLngToContainerPoint(latlng);
      const mapSize = map.getSize();
      const visibleWidth = mapSize.x - rightSidebarWidth;
      const padding = 40;

      if (point.x > visibleWidth - padding) {
        const targetX = visibleWidth / 2;
        const offsetX = point.x - targetX;
        const center = map.getCenter();
        const targetPoint = map.latLngToContainerPoint(center);
        const newCenter = map.containerPointToLatLng([targetPoint.x + offsetX, targetPoint.y]);
        map.panTo(newCenter, { duration: 0.3 });
      }
    };

    // Find the marker for this restaurant in the cluster group
    if (clusterGroup) {
      const layers = clusterGroup.getLayers() as L.Marker[];
      const marker = layers.find((layer: L.Marker) => {
        const pos = layer.getLatLng();
        return pos.lat === restaurant.lat && pos.lng === restaurant.lng;
      });

      if (marker) {
        // Use zoomToShowLayer - it handles clustered markers properly
        // If marker is already visible, it just calls the callback
        clusterGroup.zoomToShowLayer(marker, () => {
          setTimeout(adjustForSidebar, 100);
        });
        return;
      }
    }

    // Fallback: marker not found in cluster group, just pan to location
    const bounds = map.getBounds();
    if (!bounds.contains(latlng)) {
      map.panTo(latlng, { duration: 0.3 });
      setTimeout(adjustForSidebar, 350);
      return;
    }

    adjustForSidebar();
  }, [restaurant, map, rightSidebarWidth, clusterGroupRef, initialRestaurantId]);

  return null;
}

// ─── Main Map Component ──────────────────────────────────────────

type MapProps = {
  restaurants: Restaurant[];
  userLocation: UserLocation;
  selectedRestaurant?: Restaurant | null;
  onSelectRestaurant?: (restaurant: Restaurant) => void;
  region: RegionFilter;
};

// Zoom level for viewing a single restaurant
const RESTAURANT_ZOOM = 16;

export default function Map({
  restaurants,
  userLocation,
  selectedRestaurant,
  onSelectRestaurant,
  region,
}: MapProps) {
  const regionConfig = getRegionConfig(region);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clusterGroupRef = useRef<any>(null);

  // Track the initial restaurant ID (captured once on mount)
  const initialRestaurantId = useRef<string | undefined>(selectedRestaurant?.id);

  // On initial load with a selected restaurant, center on it
  const initialCenter: [number, number] =
    initialRestaurantId.current &&
    selectedRestaurant?.lat != null &&
    selectedRestaurant?.lng != null
      ? [selectedRestaurant.lat, selectedRestaurant.lng]
      : regionConfig.center;
  const initialZoom = initialRestaurantId.current ? RESTAURANT_ZOOM : regionConfig.zoom;

  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />

      <FlyToIPLocation enabled={region === "all" && !initialRestaurantId.current} />
      <FlyToRegion region={region} />
      <FlyToUser location={userLocation} />
      <PanToSelected
        restaurant={selectedRestaurant ?? null}
        clusterGroupRef={clusterGroupRef}
        initialRestaurantId={initialRestaurantId.current}
      />

      {/* User location indicator */}
      {userLocation && (
        <>
          {/* Outer pulse ring */}
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={24}
            pathOptions={{
              color: "#3b82f6",
              fillColor: "#3b82f6",
              fillOpacity: 0.1,
              weight: 1,
              opacity: 0.3,
            }}
          />
          {/* Inner dot */}
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={8}
            pathOptions={{
              color: "#ffffff",
              fillColor: "#3b82f6",
              fillOpacity: 1,
              weight: 3,
              opacity: 1,
            }}
          >
            <Popup>
              <p className="!text-sm !font-medium !m-0">Du är här</p>
            </Popup>
          </CircleMarker>
        </>
      )}

      {/* Restaurant markers */}
      <MarkerClusterGroup
        ref={clusterGroupRef}
        chunkedLoading
        maxClusterRadius={60}
        disableClusteringAtZoom={14}
        zoomToBoundsOnClick={false}
        spiderfyOnMaxZoom={false}
        showCoverageOnHover
        eventHandlers={{
          clusterclick: (e) => {
            const cluster = e.propagatedFrom;
            const bounds = cluster.getBounds();
            // Zoom to cluster bounds, ensuring we reach zoom 14+ where pins show individually
            e.target._map.fitBounds(bounds, { maxZoom: 16, padding: [40, 40] });
          },
        }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        iconCreateFunction={(cluster: any) => {
          const count = cluster.getChildCount();
          // Small clusters (< 10): smaller, more subtle appearance
          if (count < 10) {
            return L.divIcon({
              html: `<span>${count}</span>`,
              className: "custom-cluster-icon custom-cluster-small",
              iconSize: L.point(28, 28),
            });
          }
          const size = count < 50 ? 40 : count < 100 ? 48 : 56;
          return L.divIcon({
            html: `<span>${count}</span>`,
            className: "custom-cluster-icon",
            iconSize: L.point(size, size),
          });
        }}
      >
        {restaurants.map((r) => {
          const isSelected = selectedRestaurant?.id === r.id;
          return (
            <Marker
              key={r.id}
              position={[r.lat!, r.lng!]}
              icon={getMarkerIcon(r, isSelected)}
              zIndexOffset={isSelected ? 1000 : 0}
              eventHandlers={{
                click: () => onSelectRestaurant?.(r),
              }}
            />
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
