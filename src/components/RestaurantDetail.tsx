import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  MapPin,
  Phone,
  Globe,
  Navigation,
  Clock,
  ExternalLink,
  Trophy,
  ChevronDown,
} from "lucide-react";
import type { Restaurant, MichelinDistinction, HoursEntry } from "../types";
import { isOpen, getNextOpenTime } from "../lib/isOpen";
import { ScoreBadge } from "./ScoreBadge";
import { StarDisplay, PipDisplay } from "./Ratings";
import { Button } from "./ui/button";
import { IconButton } from "./IconButton";
import { SectionHeader } from "./SectionHeader";

const PRICE_LABELS: Record<string, string> = { budget: "€", mellan: "€€", lyx: "€€€" };
function priceLabel(v?: string): string { return (v && PRICE_LABELS[v]) || v || ""; }

// ─── Labels ─────────────────────────────────────────────────────

const MICHELIN_LABELS: Record<MichelinDistinction, string> = {
  selected: "Selected",
  bib_gourmand: "Bib Gourmand",
  "1_star": "★",
  "2_star": "★★",
  "3_star": "★★★",
  "1_key": "🔑",
  "2_key": "🔑🔑",
  "3_key": "🔑🔑🔑",
};

/**
 * Get hours for each day of the week, starting from today.
 * Returns array of { day: number, dayName: string, hours: string }
 */
function getHoursByDay(
  hours: HoursEntry[],
  dayNames: string[],
  closedLabel: string
): { day: number; dayName: string; hours: string }[] {
  if (!hours || hours.length === 0) return [];

  const today = new Date().getDay();
  const result: { day: number; dayName: string; hours: string }[] = [];

  // Build lookup of day -> times
  const dayTimeLookup: Record<number, string[]> = {};
  for (const entry of hours) {
    const timeStr = `${entry.open}–${entry.close}`;
    for (const day of entry.days) {
      if (!dayTimeLookup[day]) dayTimeLookup[day] = [];
      dayTimeLookup[day].push(timeStr);
    }
  }

  // Start from today, go through 7 days
  for (let i = 0; i < 7; i++) {
    const day = (today + i) % 7;
    const times = dayTimeLookup[day];
    result.push({
      day,
      dayName: dayNames[day],
      hours: times ? times.join(", ") : closedLabel,
    });
  }

  return result;
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
  const { t } = useTranslation();
  const [hoursExpanded, setHoursExpanded] = useState(false);
  const r = restaurant;
  const dayNames = t("days", { returnObjects: true }) as string[];
  const hoursByDay = getHoursByDay(r.hours ?? [], dayNames, t("detail.closed"));
  const openStatus = isOpen(r.hours ?? []);
  const nextOpen = !openStatus ? getNextOpenTime(r.hours ?? []) : null;
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
      <div className="px-5 py-4 border-b border-black/6 dark:border-white/6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold font-display truncate">{r.name}</h2>
            {r.cuisine && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{r.cuisine}</p>
            )}
            {r.bakomRank != null && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <Trophy className="size-3" />
                <span>{t("detail.rank_sweden", { rank: r.bakomRank })}</span>
                {r.metroRegion && r.metroRegion !== "sweden" && r.bakomRankRegion != null && (
                  <>
                    <span>·</span>
                    <span>
                      {t("detail.rank_region", {
                        rank: r.bakomRankRegion,
                        region: t(`regions.${r.metroRegion}`),
                      })}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <IconButton onClick={onClose} className="shrink-0">
            <X className="size-5" />
          </IconButton>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Bakom Score Section */}
        {r.bakomScore != null && (
          <div className="px-5 py-3 border-b border-black/6 dark:border-white/6 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Bakom</span>
            <div className="flex items-center gap-1.5">
              {r.bakomRank != null && r.bakomRank <= 50 && (
                <span className="inline-flex items-center justify-center gap-1 h-6 px-1.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold">
                  TOP 50
                </span>
              )}
              <ScoreBadge score={r.bakomScore} size="sm" />
            </div>
          </div>
        )}

        {/* Ratings Section */}
        {hasRatings && (
          <div className="px-5 py-4 border-b border-black/6 dark:border-white/6">
            <div className="space-y-0">
              {ratings.michelin ? (
                <SourceRating label="Michelin" href={links.michelin}>
                  <span className="text-red-600 font-semibold">
                    {MICHELIN_LABELS[ratings.michelin]}
                  </span>
                </SourceRating>
              ) : links.michelin ? (
                <SourceRating label="Michelin" href={links.michelin}>
                  <span className="text-muted-foreground italic">{t("detail.visited")}</span>
                </SourceRating>
              ) : null}
              {ratings.whiteguide ? (
                <SourceRating label="White Guide" href={links.whiteguide}>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {t(`whiteguide.${ratings.whiteguide}`)}
                  </span>
                </SourceRating>
              ) : links.whiteguide ? (
                <SourceRating label="White Guide" href={links.whiteguide}>
                  <span className="text-muted-foreground italic">{t("detail.visited")}</span>
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
                  <span className="text-muted-foreground italic">{t("detail.visited")}</span>
                </SourceRating>
              ) : null}
              {ratings.dn != null && ratings.dn > 0 ? (
                <SourceRating label="DN" href={links.dn}>
                  <span className="inline-flex items-center gap-2">
                    <PipDisplay score={ratings.dn} max={5} />
                    {ratings.dn}/5
                  </span>
                </SourceRating>
              ) : links.dn ? (
                <SourceRating label="DN" href={links.dn}>
                  <span className="text-muted-foreground italic">{t("detail.visited")}</span>
                </SourceRating>
              ) : null}
              {ratings.di != null && ratings.di > 0 ? (
                <SourceRating label="DI Weekend" href={links.di}>
                  {ratings.di}/25
                </SourceRating>
              ) : links.di ? (
                <SourceRating label="DI Weekend" href={links.di}>
                  <span className="text-muted-foreground italic">{t("detail.visited")}</span>
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
                  <span className="text-muted-foreground italic">{t("detail.visited")}</span>
                </SourceRating>
              ) : null}
              {ratings.google != null && ratings.google > 0 ? (
                <SourceRating label="Google" href={links.google}>
                  <span className="inline-flex items-center gap-1.5">
                    <StarDisplay rating={ratings.google} />
                    {ratings.google.toFixed(1)}
                    {r.googleRatingCount != null && r.googleRatingCount > 0 && (
                      <span className="text-muted-foreground text-xs">({r.googleRatingCount})</span>
                    )}
                  </span>
                </SourceRating>
              ) : links.google ? (
                <SourceRating label="Google" href={links.google}>
                  <span className="text-muted-foreground italic">{t("detail.visited")}</span>
                </SourceRating>
              ) : null}
            </div>
          </div>
        )}

        {/* Price */}
        {r.priceRange && (
          <div className="px-5 py-3 border-b border-black/6 dark:border-white/6 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">{t("detail.price")}</span>
            <span className="text-sm font-medium">{priceLabel(r.priceRange)}</span>
          </div>
        )}

        {/* Info Section */}
        <div className="px-5 py-4 space-y-4">
          {/* Hours - Collapsible Google-style */}
          {hoursByDay.length > 0 && (
            <div>
              <button
                onClick={() => setHoursExpanded(!hoursExpanded)}
                className="w-full flex items-center gap-3 text-left py-1 group"
              >
                <Clock className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 flex items-center gap-1.5 text-sm">
                  {openStatus !== null && (
                    <span
                      className={
                        openStatus
                          ? "text-green-600 dark:text-green-500 font-medium"
                          : "text-red-600 dark:text-red-500 font-medium"
                      }
                    >
                      {openStatus ? t("detail.open") : t("detail.closed_now")}
                    </span>
                  )}
                  {!openStatus && nextOpen && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">
                        {nextOpen.day === new Date().getDay()
                          ? t("detail.opens_at", { time: nextOpen.time })
                          : t("detail.opens_day", {
                              day: dayNames[nextOpen.day],
                              time: nextOpen.time,
                            })}
                      </span>
                    </>
                  )}
                </div>
                <ChevronDown
                  className={`size-4 text-muted-foreground transition-transform ${hoursExpanded ? "rotate-180" : ""}`}
                />
              </button>

              {hoursExpanded && (
                <div className="ml-7 mt-2 space-y-1">
                  {hoursByDay.map((entry, i) => (
                    <div key={entry.day} className="flex text-sm">
                      <span className={`w-20 ${i === 0 ? "font-medium" : "text-muted-foreground"}`}>
                        {entry.dayName}
                      </span>
                      <span className={i === 0 ? "font-medium" : ""}>{entry.hours}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Address */}
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
              <MapPin className="size-4" />
              {t("detail.address")}
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                r.name + " " + r.address
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm hover:underline"
            >
              {r.address}
              {r.postalCode && `, ${r.postalCode}`}
              {r.city && !r.address.includes(r.city) && ` ${r.city}`}
            </a>
          </div>

          {/* Phone */}
          {r.phone && (
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                <Phone className="size-4" />
                {t("detail.phone")}
              </div>
              <a href={`tel:${r.phone}`} className="text-sm hover:underline">
                {r.phone}
              </a>
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
                {t("detail.directions")}
              </a>
            </Button>
            {r.website && (
              <Button asChild variant="outline" className="flex-1 h-11 rounded-full">
                <a href={r.website} target="_blank" rel="noopener noreferrer">
                  <Globe className="size-4" />
                  {t("detail.website")}
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
