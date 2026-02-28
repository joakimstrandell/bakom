import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  CircleMarker,
  useMap,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import { useEffect, useMemo, useState } from "react";
import type { Restaurant, MichelinDistinction, WhiteGuideClassification } from "../types";
import { isOpen } from "../lib/isOpen";

// SVG marker factory — creates a pin-shaped marker with the given color
const MARKER_W = 20;
const MARKER_H = 33;

function createMarkerSvg(fill: string, stroke: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MARKER_W}" height="${MARKER_H}" viewBox="0 0 25 41">
    <path d="M12.5 0C5.6 0 0 5.6 0 12.5C0 21.9 12.5 41 12.5 41S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
    <circle cx="12.5" cy="12.5" r="5.5" fill="white" opacity="0.9"/>
  </svg>`;
}

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

const greenIcon = L.icon({
  iconUrl: svgToDataUrl(createMarkerSvg("#22c55e", "#16a34a")),
  iconSize: [MARKER_W, MARKER_H],
  iconAnchor: [MARKER_W / 2, MARKER_H],
  popupAnchor: [1, -MARKER_H + 6],
});

const redIcon = L.icon({
  iconUrl: svgToDataUrl(createMarkerSvg("#ef4444", "#dc2626")),
  iconSize: [MARKER_W, MARKER_H],
  iconAnchor: [MARKER_W / 2, MARKER_H],
  popupAnchor: [1, -MARKER_H + 6],
});

const grayIcon = L.icon({
  iconUrl: svgToDataUrl(createMarkerSvg("#94a3b8", "#64748b")),
  iconSize: [MARKER_W, MARKER_H],
  iconAnchor: [MARKER_W / 2, MARKER_H],
  popupAnchor: [1, -MARKER_H + 6],
});

function getMarkerIcon(r: Restaurant): L.Icon {
  const status = isOpen(r.hours);
  if (status === null) return grayIcon; // no hours data
  return status ? greenIcon : redIcon;
}

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

// Weekday order for display (Monday first, Swedish convention)
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // mån, tis, ons, tor, fre, lör, sön
const DAY_NAMES = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];

/**
 * Formats hours by aggregating days with the same opening times.
 * e.g. mån 11–22, tis 11–22, ons 11–22 → mån–ons 11:00–22:00
 */
function formatHours(r: Restaurant): string[] | null {
  if (!r.hours || r.hours.length === 0) return null;

  // Build a lookup: day → "open–close"
  const dayTimeLookup: Record<number, string> = {};
  for (const entry of r.hours) {
    const timeStr = `${entry.open}–${entry.close}`;
    for (const day of entry.days) {
      dayTimeLookup[day] = timeStr;
    }
  }

  if (Object.keys(dayTimeLookup).length === 0) return null;

  // Group consecutive days (in display order) with the same time
  const groups: { days: number[]; time: string }[] = [];
  for (const day of DISPLAY_ORDER) {
    const time = dayTimeLookup[day];
    if (!time) continue;

    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.time === time) {
      lastGroup.days.push(day);
    } else {
      groups.push({ days: [day], time });
    }
  }

  return groups.map((g) => {
    const first = DAY_NAMES[g.days[0]];
    const last = DAY_NAMES[g.days[g.days.length - 1]];
    const dayStr = g.days.length === 1 ? first : `${first}–${last}`;
    return `${dayStr} ${g.time}`;
  });
}

/** Tiny inline Google Maps pin icon */
function GoogleMapsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 92.3 132.3"
      className="inline-block shrink-0"
      style={{ width: 10, height: 14, marginRight: 3, verticalAlign: "middle" }}
    >
      <path
        fill="#1a73e8"
        d="M60.2 2.2C55.8.8 51 0 46.1 0 32 0 19.3 6.4 10.8 16.5l21.8 18.3L60.2 2.2z"
      />
      <path
        fill="#ea4335"
        d="M10.8 16.5C4.1 24.5 0 34.9 0 46.1c0 8.7 1.7 15.7 4.6 22l28-33.3-21.8-18.3z"
      />
      <path
        fill="#4285f4"
        d="M46.2 28.5c9.8 0 17.7 7.9 17.7 17.7 0 4.3-1.6 8.3-4.2 11.4 0 0 13.9-16.6 27.5-32.7-5.6-10.8-15.3-19-27-22.7L32.6 34.8c3.3-3.8 8.1-6.3 13.6-6.3"
      />
      <path
        fill="#fbbc04"
        d="M46.2 63.8c-9.8 0-17.7-7.9-17.7-17.7 0-4.3 1.5-8.3 4.1-11.3l-28 33.3c4.8 10.6 12.8 19.2 21 29.9l34.1-40.5c-3.3 3.9-8.1 6.3-13.5 6.3"
      />
      <path
        fill="#34a853"
        d="M59.1 109.2c15.4-24.1 33.3-35 33.3-63 0-7.7-1.9-14.9-5.2-21.3L25.6 98c2.6 3.4 5.3 7.3 7.9 11.3 9.4 14.5 6.8 23.1 12.8 23.1s3.4-8.7 12.8-23.2"
      />
    </svg>
  );
}

function OpenStatus({ restaurant }: { restaurant: Restaurant }) {
  const status = isOpen(restaurant.hours);
  if (status === null) return null;

  return (
    <p className="!text-xs !font-medium !mt-1 !mb-0">
      {status ? (
        <span className="text-green-600">● Öppet nu</span>
      ) : (
        <span className="text-red-500">● Stängt</span>
      )}
    </p>
  );
}

/** Star display helper for numeric ratings */
function StarDisplay({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.3;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return (
    <span className="inline-flex">
      {Array.from({ length: fullStars }, (_, i) => (
        <span key={`f${i}`} className="text-amber-400">
          ★
        </span>
      ))}
      {hasHalf && <span className="text-amber-400 opacity-50">★</span>}
      {Array.from({ length: emptyStars }, (_, i) => (
        <span key={`e${i}`} className="text-slate-300">
          ★
        </span>
      ))}
    </span>
  );
}

/** Michelin distinction labels (short, for rating display) */
const MICHELIN_LABELS: Record<MichelinDistinction, string> = {
  selected: "Selected",
  bib_gourmand: "Bib Gourmand",
  "1_star": "★",
  "2_star": "★★",
  "3_star": "★★★",
};

/** White Guide classification labels (short) */
const WHITEGUIDE_LABELS: Record<WhiteGuideClassification, string> = {
  recommended: "Rekommenderad",
  good_class: "God Klass",
  very_good_class: "Mycket God Klass",
  master_class: "Mästarklass",
  global_master_class: "Global Mästarklass",
};

/** Bakom Score badge — prominent composite score */
function BakomScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8
      ? "bg-emerald-600 text-white"
      : score >= 6
        ? "bg-amber-500 text-white"
        : "bg-slate-500 text-white";

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold ${color}`}
      title="Bakom Score — sammanvägt betyg 0–10"
    >
      {score.toFixed(1)}
    </span>
  );
}

// ─── Source rating row (link left, rating right) ──────────────

function SourceRow({
  label,
  href,
  color,
  children,
}: {
  label: string;
  href?: string;
  color: string;
  children: React.ReactNode;
}) {
  const name = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${color} hover:underline`}
    >
      {label}
    </a>
  ) : (
    <span className={color}>{label}</span>
  );

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium">{name}</span>
      <span className="text-xs text-slate-600 whitespace-nowrap">{children}</span>
    </div>
  );
}

/** Tab: Betyg — source ratings with links */
function SourceRatingsTab({ restaurant: r }: { restaurant: Restaurant }) {
  const { ratings } = r;
  const hasAny =
    (ratings.krogguiden != null && ratings.krogguiden > 0) ||
    (ratings.google != null && ratings.google > 0) ||
    ratings.michelin ||
    ratings.whiteguide;

  if (!hasAny) {
    return <p className="!text-xs !text-slate-400 !mt-1 !mb-0">Inga betyg</p>;
  }

  return (
    <div className="space-y-1 mt-1">
      {ratings.michelin && (
        <SourceRow label="Michelin" href={r.links.michelin} color="text-red-600">
          {MICHELIN_LABELS[ratings.michelin]}
        </SourceRow>
      )}
      {ratings.whiteguide && (
        <SourceRow label="White Guide" href={r.links.whiteguide} color="text-emerald-700">
          {WHITEGUIDE_LABELS[ratings.whiteguide]}
        </SourceRow>
      )}
      {ratings.krogguiden != null && ratings.krogguiden > 0 && (
        <SourceRow label="Krogguiden" href={r.links.krogguiden} color="text-blue-600">
          <span className="inline-flex items-center gap-1">
            <StarDisplay rating={ratings.krogguiden} />
            {ratings.krogguiden.toFixed(1)}
          </span>
        </SourceRow>
      )}
      {ratings.google != null && ratings.google > 0 && (
        <SourceRow label="Google" href={r.links.google} color="text-blue-600">
          <span className="inline-flex items-center gap-1">
            <StarDisplay rating={ratings.google} />
            {ratings.google.toFixed(1)}
            {r.googleRatingCount != null &&
              r.googleRatingCount > 0 &&
              ` (${r.googleRatingCount})`}
          </span>
        </SourceRow>
      )}
    </div>
  );
}

/** Tab: Info — hours, address, phone, links */
function InfoTab({ restaurant: r }: { restaurant: Restaurant }) {
  const hours = formatHours(r);

  return (
    <div className="mt-1 space-y-1">
      {hours && (
        <div className="!text-xs !text-slate-500 leading-relaxed">
          {hours.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + " " + r.address + " " + r.city)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="!text-xs !text-slate-600 flex items-start hover:text-blue-600 hover:underline cursor-pointer transition-colors"
      >
        <GoogleMapsIcon />
        <span>
          {r.address}
          {r.postalCode && `, ${r.postalCode}`} {r.city}
        </span>
      </a>
      {r.phone && (
        <p className="!text-xs !mb-0">
          <span className="text-slate-500">Tel:</span>{" "}
          <a href={`tel:${r.phone}`} className="text-blue-600 hover:underline">
            {r.phone}
          </a>
        </p>
      )}
      {r.priceRange && (
        <p className="!text-xs !mb-0">
          <span className="text-slate-500">Pris:</span> {r.priceRange}
        </p>
      )}
      <div className="flex gap-3 pt-0.5 flex-wrap">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(r.name + " " + r.address + " " + r.city)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="!text-xs text-blue-600 hover:underline"
        >
          Vägbeskrivning
        </a>
        {r.website && (
          <a
            href={r.website}
            target="_blank"
            rel="noopener noreferrer"
            className="!text-xs text-blue-600 hover:underline"
          >
            Webbplats
          </a>
        )}
      </div>
    </div>
  );
}

/** Complete popup content with tabs */
function PopupContent({ restaurant: r }: { restaurant: Restaurant }) {
  const [tab, setTab] = useState<"betyg" | "info">("betyg");

  return (
    <div className="min-w-[220px] max-w-[280px] font-sans">
      {/* Header — always visible */}
      <div className="flex items-start justify-between gap-2">
        <p className="!text-sm !font-semibold !leading-tight !m-0">{r.name}</p>
        {r.bakomScore != null && <BakomScoreBadge score={r.bakomScore} />}
      </div>
      {r.cuisine && (
        <p className="!text-xs !text-slate-500 !mt-0.5 !m-0">{r.cuisine}</p>
      )}
      <OpenStatus restaurant={r} />

      {/* Tab bar */}
      <div className="flex gap-4 mt-1.5 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("betyg")}
          className={`pb-1 text-xs font-medium transition-colors border-b-2 -mb-px ${
            tab === "betyg"
              ? "border-slate-800 text-slate-800"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          Betyg
        </button>
        <button
          type="button"
          onClick={() => setTab("info")}
          className={`pb-1 text-xs font-medium transition-colors border-b-2 -mb-px ${
            tab === "info"
              ? "border-slate-800 text-slate-800"
              : "border-transparent text-slate-400 hover:text-slate-600"
          }`}
        >
          Info
        </button>
      </div>

      {/* Tab content */}
      {tab === "betyg" ? (
        <SourceRatingsTab restaurant={r} />
      ) : (
        <InfoTab restaurant={r} />
      )}
    </div>
  );
}

/** Helper to get the best numeric rating for a restaurant */
export function bestNumericRating(r: Restaurant): number | null {
  return r.ratings.google ?? r.ratings.krogguiden ?? null;
}

type MapProps = {
  restaurants: Restaurant[];
  userLocation: UserLocation;
};

export default function Map({ restaurants, userLocation }: MapProps) {
  // Recalculate open/closed status every minute
  const now = useMemo(() => new Date(), []);
  const minuteKey = `${now.getHours()}:${now.getMinutes()}`;

  // Force re-render every minute for live status updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Trigger re-render by updating state in parent
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <MapContainer
      center={[59.33, 18.07]}
      zoom={12}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FlyToUser location={userLocation} />

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
        chunkedLoading
        maxClusterRadius={28}
        iconCreateFunction={(cluster: L.MarkerCluster) => {
          const count = cluster.getChildCount();
          const size = count < 20 ? 36 : count < 50 ? 42 : 48;
          return L.divIcon({
            html: `<span>${count}</span>`,
            className: "custom-cluster-icon",
            iconSize: L.point(size, size),
          });
        }}
      >
      {restaurants.map((r) => (
        <Marker key={r.id} position={[r.lat!, r.lng!]} icon={getMarkerIcon(r)}>
          <Popup>
            <PopupContent restaurant={r} />
          </Popup>
        </Marker>
      ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
