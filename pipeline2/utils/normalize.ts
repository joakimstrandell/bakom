/** Shared normalizers for cleaning collected data across all sources.
 *
 * Applied at collection time so downstream merging/geocoding sees consistent data.
 */

// ─── Address ────────────────────────────────────────────────────

/** Strip prefixes, phone numbers, trailing dots, website fragments,
 *  White Guide region suffixes, and embedded newlines. */
export function normalizeAddress(raw: string): string {
  let addr = raw.trim();
  if (!addr) return "";

  // Collapse newlines + any trailing junk after them (e.g. "Adress: X.\nTel: …")
  addr = addr.replace(/\n.*/g, "");

  // Strip leading "Adress:" / "Address:" prefix (with optional extra spaces)
  addr = addr.replace(/^Adress:\s*/i, "");

  // Strip embedded phone numbers: ", tel: 08-32 34 40." or "tel 08-665 62 09"
  // Also handles ". Tel: ..." (period before Tel) and en-dashes (–)
  addr = addr.replace(/[.,]?\s*tel:?\s*[\d\s()+\-–—]+\.?\s*$/i, "");

  // Strip White Guide region suffix: ", Region / City" → keep only street
  // Matches ", Region / MultiWord City" at end (city can have spaces/hyphens)
  // But NOT corner addresses like "Street 6 / OtherStreet 19" (both sides have digits)
  addr = addr.replace(
    /,\s+[A-ZÀ-Öa-zà-ö][A-ZÀ-Öa-zà-ö\s:-]+\s*\/\s*[A-ZÀ-Öa-zà-ö][A-ZÀ-Öa-zà-ö\s:,-]+$/,
    (match) => {
      // Don't strip if it looks like a corner address (digits on both sides of /)
      const parts = match.split("/");
      if (parts.length === 2 && /\d/.test(parts[0]) && /\d/.test(parts[1])) {
        return match;
      }
      return "";
    },
  );

  // Strip trailing website fragments: ", www" or ", sperlingco" or ", dersch"
  // These are short lowercase-only suffixes after the last comma
  addr = addr.replace(/,\s+(?:www|[a-z]{3,12})$/i, (match) => {
    // Only strip if it looks like a web fragment (no spaces, no digits, no Swedish chars in pattern)
    const fragment = match.replace(/^,\s+/, "");
    if (/^(?:www|[a-z]+\.[a-z]+|[a-z]{3,12})$/i.test(fragment) && !fragment.includes(" ")) {
      return "";
    }
    return match;
  });

  // Strip trailing dots and whitespace
  addr = addr.replace(/\.\s*$/, "").trim();

  // Clean up double spaces
  addr = addr.replace(/\s{2,}/g, " ");

  return addr;
}

// ─── City ───────────────────────────────────────────────────────

/** Canonical city names — maps common variations to a single form.
 *  Includes Stockholm district aliases (Michelin often uses districts as "city"). */
const CITY_ALIASES: Record<string, string> = {
  gothenburg: "Göteborg",
  göteborg: "Göteborg",
  goteborg: "Göteborg",
  malmö: "Malmö",
  malmo: "Malmö",
  stockholm: "Stockholm",
  köpenhamn: "Köpenhamn",
  københavn: "Köpenhamn",
  copenhagen: "Köpenhamn",
  "s:t ibb": "S:t Ibb",
  jarfalla: "Järfälla",
  // Stockholm city districts → Stockholm (within Stockholm kommun)
  östermalm: "Stockholm",
  södermalm: "Stockholm",
  norrmalm: "Stockholm",
  vasastan: "Stockholm",
  kungsholmen: "Stockholm",
  "gamla stan": "Stockholm",
  djurgården: "Stockholm",
  hägersten: "Stockholm",
  bromma: "Stockholm",
};

/** Region names that should not be used as city — fallback to empty. */
const REGION_NAMES = new Set([
  "dalarna",
  "gotland",
  "västergötland",
  "öland",
  "skåne",
  "lappland",
  "norrland",
  "småland",
  "värmland",
  "halland",
  "blekinge",
  "bohuslän",
  "uppland",
  "södermanland",
  "östergötland",
  "jämtland",
  "hälsingland",
  "ångermanland",
  "medelpad",
  "gästrikland",
  "härjedalen",
  "norrbotten",
  "västerbotten",
]);

/** Normalize a city name: unify aliases, reject region names. */
export function normalizeCity(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();

  // Check if it's a known region (not a city)
  if (REGION_NAMES.has(lower)) return "";

  // Check aliases
  const alias = CITY_ALIASES[lower];
  if (alias) return alias;

  // Return as-is with first-letter capitalized if it looks reasonable
  return trimmed;
}

// ─── Venue Name ─────────────────────────────────────────────────

/** City/area names that appear as false venue names in DN listing sub-articles. */
const CITY_AS_VENUE_NAMES = new Set([
  "stockholm",
  "göteborg",
  "gothenburg",
  "malmö",
  "uppsala",
  "södermalm",
  "norrmalm",
  "vasastan",
  "östermalm",
  "kungsholmen",
  "gamla stan",
  "djurgården",
  "hägersten",
  "bromma",
  "solna",
  "sundbyberg",
  "nacka",
  "lidingö",
  "majorna",
  "linnéstaden",
  "haga",
  "lund",
  "helsingborg",
  "västerås",
  "örebro",
  "linköping",
  "norrköping",
  "jönköping",
  "umeå",
  "gävle",
  "borås",
  "eskilstuna",
  "karlstad",
  "täby",
  "halmstad",
  "växjö",
  "sundsvall",
  "luleå",
  "trollhättan",
  "östersund",
  "kalmar",
  "falun",
  "kristianstad",
  "skövde",
  "uddevalla",
  "visby",
  "kiruna",
]);

/** Check if a name is actually a city/area header rather than a venue. */
export function isCityHeader(name: string): boolean {
  return CITY_AS_VENUE_NAMES.has(name.toLowerCase().trim());
}

/** Light venue name normalization — trim whitespace, normalize quotes. */
export function normalizeVenueName(raw: string): string {
  let name = raw.trim();
  if (!name) return "";

  // Normalize curly/smart quotes to straight
  name = name.replace(/[\u2018\u2019]/g, "'");
  name = name.replace(/[\u201C\u201D]/g, '"');

  // Trim trailing dots
  name = name.replace(/\.\s*$/, "");

  // Clean up double spaces
  name = name.replace(/\s{2,}/g, " ");

  return name;
}

// ─── Price Range ────────────────────────────────────────────────

/** Normalize price range labels to a consistent set:
 *  "budget" | "mellan" | "lyx" | (original if unknown) */
export function normalizePriceRange(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();

  // Budget tier — DI "Lågt", Krogguiden "$"
  if (lower === "budget" || lower === "billig" || lower === "enkel" || lower === "lågt" || trimmed === "$") {
    return "budget";
  }

  // Mid tier — SVD "Mellanklass", DN "Mellan", DI "Medel", Krogguiden "$$"
  if (
    lower === "mellan" ||
    lower === "mellanklass" ||
    lower === "medel" ||
    lower === "medium" ||
    trimmed === "$$"
  ) {
    return "mellan";
  }

  // Luxury tier — DI "Högt"/"Hög"/"Mycket högt", Krogguiden "$$$"+"$$$$"+...
  if (
    lower === "lyx" ||
    lower === "lyxig" ||
    lower === "luxury" ||
    lower === "exklusiv" ||
    lower === "högt" ||
    lower === "hög" ||
    lower === "mycket högt" ||
    /^\${3,}$/.test(trimmed)
  ) {
    return "lyx";
  }

  // "other" or unknown — return as-is
  return trimmed;
}
