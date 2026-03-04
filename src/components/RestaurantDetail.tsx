import { X, MapPin, Phone, Globe, Navigation, Clock, ExternalLink } from "lucide-react";
import type { Restaurant, MichelinDistinction, WhiteGuideClassification } from "../types";
import { isOpen } from "../lib/isOpen";
import { ScoreBadge } from "./ScoreBadge";
import { StarDisplay, PipDisplay, OpenStatus } from "./Ratings";
import { Button } from "./ui/button";

// ─── Labels ─────────────────────────────────────────────────────

const MICHELIN_LABELS: Record<MichelinDistinction, string> = {
  selected: "Selected",
  bib_gourmand: "Bib Gourmand",
  "1_star": "★",
  "2_star": "★★",
  "3_star": "★★★",
};

const WHITEGUIDE_LABELS: Record<WhiteGuideClassification, string> = {
  recommended: "Rekommenderad",
  good_class: "God Klass",
  very_good_class: "Mycket God Klass",
  master_class: "Mästarklass",
  global_master_class: "Global Mästarklass",
};

const DAY_NAMES = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function formatHours(r: Restaurant): string[] | null {
  if (!r.hours || r.hours.length === 0) return null;
  const dayTimeLookup: Record<number, string> = {};
  for (const entry of r.hours) {
    const timeStr = `${entry.open}–${entry.close}`;
    for (const day of entry.days) {
      dayTimeLookup[day] = timeStr;
    }
  }
  if (Object.keys(dayTimeLookup).length === 0) return null;
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

// ─── Sub-components ─────────────────────────────────────────────

function SourceRating({
  label,
  href,
  children,
}: {
  label: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
      <span className="text-sm font-medium text-muted-foreground">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
            {label}
            <ExternalLink className="inline-block ml-1 size-3 opacity-50" />
          </a>
        ) : (
          label
        )}
      </span>
      <span className="text-sm font-medium">{children}</span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

type RestaurantDetailProps = {
  restaurant: Restaurant;
  onClose: () => void;
};

export default function RestaurantDetail({ restaurant, onClose }: RestaurantDetailProps) {
  const r = restaurant;
  const hours = formatHours(r);
  const openStatus = isOpen(r.hours);
  const { ratings } = r;

  const links = r.links;
  const hasRatings =
    (ratings.krogguiden != null && ratings.krogguiden > 0) ||
    (ratings.google != null && ratings.google > 0) ||
    ratings.michelin ||
    ratings.whiteguide ||
    (ratings.svd != null && ratings.svd > 0) ||
    ratings.dn ||
    (ratings.di != null && ratings.di > 0) ||
    links.michelin ||
    links.whiteguide ||
    links.svd ||
    links.dn ||
    links.di ||
    links.krogguiden ||
    links.google;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-black/6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2
                className="text-lg font-semibold truncate"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {r.name}
              </h2>
              {r.bakomScore != null && (
                <span className="shrink-0 inline-flex items-center gap-1.5">
                  <ScoreBadge score={r.bakomScore} />
                  {r.bakomRank != null && r.bakomRank <= 20 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                      #{r.bakomRank}
                    </span>
                  )}
                </span>
              )}
            </div>
            {r.cuisine && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{r.cuisine}</p>
            )}
            {openStatus !== null && (
              <OpenStatus isOpen={openStatus} className="block mt-1" />
            )}
          </div>
          <button
            onPointerDown={onClose}
            className="shrink-0 size-10 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Ratings Section */}
        {hasRatings && (
          <div className="px-5 py-4 border-b border-black/6 dark:border-white/6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Omdömen
            </h3>
            <div className="space-y-0">
              {ratings.michelin ? (
                <SourceRating label="Michelin" href={links.michelin}>
                  <span className="text-red-600 font-semibold">
                    {MICHELIN_LABELS[ratings.michelin]}
                  </span>
                </SourceRating>
              ) : links.michelin ? (
                <SourceRating label="Michelin" href={links.michelin}>
                  <span className="text-muted-foreground italic">Besökt</span>
                </SourceRating>
              ) : null}
              {ratings.whiteguide ? (
                <SourceRating label="White Guide" href={links.whiteguide}>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {WHITEGUIDE_LABELS[ratings.whiteguide]}
                  </span>
                </SourceRating>
              ) : links.whiteguide ? (
                <SourceRating label="White Guide" href={links.whiteguide}>
                  <span className="text-muted-foreground italic">Besökt</span>
                </SourceRating>
              ) : null}
              {ratings.svd != null && ratings.svd > 0 ? (
                <SourceRating label="SvD" href={links.svd}>
                  <span className="inline-flex items-center gap-2">
                    <PipDisplay score={ratings.svd} />
                    {ratings.svd}/6
                  </span>
                </SourceRating>
              ) : links.svd ? (
                <SourceRating label="SvD" href={links.svd}>
                  <span className="text-muted-foreground italic">Besökt</span>
                </SourceRating>
              ) : null}
              {ratings.dn ? (
                <SourceRating label="DN" href={links.dn}>
                  <span className="text-orange-600 dark:text-orange-400">Recenserad</span>
                </SourceRating>
              ) : links.dn ? (
                <SourceRating label="DN" href={links.dn}>
                  <span className="text-muted-foreground italic">Besökt</span>
                </SourceRating>
              ) : null}
              {ratings.di != null && ratings.di > 0 ? (
                <SourceRating label="DI Weekend" href={links.di}>
                  {ratings.di}/25
                </SourceRating>
              ) : links.di ? (
                <SourceRating label="DI Weekend" href={links.di}>
                  <span className="text-muted-foreground italic">Besökt</span>
                </SourceRating>
              ) : null}
              {ratings.krogguiden != null && ratings.krogguiden > 0 ? (
                <SourceRating label="Krogguiden" href={links.krogguiden}>
                  <span className="inline-flex items-center gap-1.5">
                    <StarDisplay rating={ratings.krogguiden} />
                    {ratings.krogguiden.toFixed(1)}
                  </span>
                </SourceRating>
              ) : links.krogguiden ? (
                <SourceRating label="Krogguiden" href={links.krogguiden}>
                  <span className="text-muted-foreground italic">Besökt</span>
                </SourceRating>
              ) : null}
              {ratings.google != null && ratings.google > 0 ? (
                <SourceRating label="Google" href={links.google}>
                  <span className="inline-flex items-center gap-1.5">
                    <StarDisplay rating={ratings.google} />
                    {ratings.google.toFixed(1)}
                    {r.googleRatingCount != null && r.googleRatingCount > 0 && (
                      <span className="text-muted-foreground text-xs">
                        ({r.googleRatingCount})
                      </span>
                    )}
                  </span>
                </SourceRating>
              ) : links.google ? (
                <SourceRating label="Google" href={links.google}>
                  <span className="text-muted-foreground italic">Besökt</span>
                </SourceRating>
              ) : null}
            </div>
          </div>
        )}

        {/* Info Section */}
        <div className="px-5 py-4 space-y-4">
          {/* Hours */}
          {hours && (
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                <Clock className="size-4" />
                Öppettider
              </div>
              <div className="text-sm space-y-0.5">
                {hours.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          )}

          {/* Address */}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
              <MapPin className="size-4" />
              Adress
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                r.name + " " + r.address + " " + r.city
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:underline"
            >
              {r.address}
              {r.postalCode && `, ${r.postalCode}`} {r.city}
            </a>
          </div>

          {/* Phone */}
          {r.phone && (
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                <Phone className="size-4" />
                Telefon
              </div>
              <a href={`tel:${r.phone}`} className="text-sm hover:underline">
                {r.phone}
              </a>
            </div>
          )}

          {/* Price */}
          {r.priceRange && (
            <div className="flex items-center justify-between py-2 border-t border-black/5 dark:border-white/5">
              <span className="text-sm text-muted-foreground">Prisklass</span>
              <span className="text-sm font-medium">{r.priceRange}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Button asChild className="flex-1 h-11 rounded-full">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  r.name + " " + r.address + " " + r.city
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Navigation className="size-4" />
                Vägbeskrivning
              </a>
            </Button>
            {r.website && (
              <Button asChild variant="outline" className="flex-1 h-11 rounded-full">
                <a
                  href={r.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Globe className="size-4" />
                  Webbplats
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
