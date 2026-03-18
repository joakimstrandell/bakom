/** White Guide collector — guide entries (restaurant/bar/cafe/hotel) + news. */

import { createHash } from "crypto";
import { fetchWithRetry } from "../utils/fetch.js";
import { saveArticles } from "../utils/save.js";
import { normalizeAddress, normalizeVenueName, normalizeCity } from "../utils/normalize.js";
import type { Article, VenueType } from "../types.js";

// ─── API Config ─────────────────────────────────────────────────

const API_URL = "https://admin.whiteguide.com/api/search/detailed";
const NEWS_URL = "https://whiteguide.com/se/sv/news";

const RELEASE_IDS = [93, 59, 60, 58, 98, 181];
const SWEDEN_CHANNEL_ID = 3;

const VENUE_TYPES: VenueType[] = ["restaurant", "bar", "cafe", "hotel"];

// ─── Helpers ────────────────────────────────────────────────────

function articleId(sourceId: string, url: string): string {
  return createHash("sha256").update(`${sourceId}:${url}`).digest("hex").slice(0, 16);
}

function now(): string {
  return new Date().toISOString();
}

/** Extract city from White Guide address format.
 *  Common formats: "Street, 123 45 City" or "Street, Area / City" */
function extractCity(address: string): string {
  // Try postal code format first: "Street, 123 45 City"
  const postalMatch = address.match(/\d{3}\s?\d{2}\s+(.+?)$/);
  if (postalMatch) return postalMatch[1].trim();
  // Fallback: last part after comma/slash
  const parts = address.split(/[,/]/).map((s) => s.trim());
  return parts[parts.length - 1] || "";
}

/** White Guide score scales (from API data analysis) */
const WG_SCORE_MAX = {
  food: 39,
  service: 20,
  environment: 20,
  drink: 20,
  total: 99,
} as const;

/** Normalize a WG sub-score to 0-10 */
function normalizeSubScore(score: number, max: number): number {
  if (max === 0) return 0;
  return Math.round((score / max) * 10 * 10) / 10;
}

/** Clean WG tags: remove empty strings and deduplicate */
function cleanTags(tags: string[]): string[] {
  return [...new Set(tags.filter((t) => t.trim() !== ""))];
}

/** Strip HTML tags and decode entities */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&aring;/g, "å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Aring;/g, "Å")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Guide Entries (Reviews) ────────────────────────────────────

async function fetchVenueType(venueType: VenueType): Promise<Article[]> {
  const params = new URLSearchParams();
  params.set("search[query]", "");
  params.set("type", venueType);
  params.set(`search[channel_ids][]`, String(SWEDEN_CHANNEL_ID));
  params.set("locale", "sv");
  params.set("search[tags_and]", "true");

  const releaseParams = RELEASE_IDS.map((id) => `search[release_ids][]=${id}`).join("&");
  const url = `${API_URL}?${params.toString()}&${releaseParams}`;

  console.log(`  Fetching ${venueType}s...`);
  const res = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });

  const data: Record<string, unknown>[] = await res.json();
  console.log(`    ${data.length} results`);

  const articles: Article[] = [];
  const seen = new Set<number>();

  for (const item of data) {
    const placeId = item.place_id as number;
    if (seen.has(placeId)) continue;
    seen.add(placeId);

    const address = (item.address as string) ?? "";
    const scores = (item.detailed as Record<string, unknown>)?.scores_totals as Record<string, number> | undefined;
    const tags = (item.detailed as Record<string, unknown>)?.tag_names as string[] | undefined;
    const lat = (item.detailed as Record<string, unknown>)?.lat as number | null;
    const lng = (item.detailed as Record<string, unknown>)?.lng as number | null;

    const rawName = (item.place_title as string) ?? (item.title as string) ?? "";
    const name = normalizeVenueName(rawName);
    const classification = (item.classification_total_label as string) ?? "";
    const articleUrl = `https://whiteguide.com/se/sv/${venueType}s/${placeId}`;
    const cleanAddr = normalizeAddress(address);

    articles.push({
      id: articleId("whiteguide-review", articleUrl),
      sourceId: "whiteguide-review",
      url: articleUrl,
      title: `${name} — ${classification}`,
      publishedAt: now(), // White Guide doesn't expose review dates
      contentType: "review",
      bodyText: "", // Guide entries don't have article text
      venueType,
      venueName: name,
      venueAddress: cleanAddr,
      venueCity: normalizeCity(extractCity(address)),
      explicitSubScores: scores
        ? {
            food: normalizeSubScore(scores.food ?? 0, WG_SCORE_MAX.food),
            service: normalizeSubScore(scores.service ?? 0, WG_SCORE_MAX.service),
            ambiance: normalizeSubScore(scores.environment ?? 0, WG_SCORE_MAX.environment),
            drinks: normalizeSubScore(scores.drink ?? 0, WG_SCORE_MAX.drink),
          }
        : undefined,
      cuisine: tags?.length ? cleanTags(tags) : undefined,
      tags: [classification].filter(Boolean),
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      collectedAt: now(),
    });
  }

  return articles;
}

export async function collectWhiteGuideEntries(): Promise<Article[]> {
  console.log("=== White Guide — Guide Entries ===\n");

  const allArticles: Article[] = [];

  for (const venueType of VENUE_TYPES) {
    const articles = await fetchVenueType(venueType);
    allArticles.push(...articles);
  }

  console.log(`\n  Total guide entries: ${allArticles.length}`);

  // Stats by venue type
  for (const vt of VENUE_TYPES) {
    const count = allArticles.filter((a) => a.venueType === vt).length;
    if (count > 0) console.log(`    ${vt}: ${count}`);
  }

  saveArticles("whiteguide-review.json", allArticles);
  return allArticles;
}

// ─── News (paginated API) ───────────────────────────────────────

const NEWS_API_URL = "https://admin.whiteguide.com/api/articles";
const NEWS_PAGE_SIZE = 50;
const NEWS_CUTOFF_DATE = "2025-01-01T00:00:00.000Z";

/** Build URL for a page of news articles */
function newsPageUrl(page: number): string {
  const params = new URLSearchParams();
  params.set("filter[][by]", "channel_id");
  params.set("filter[][with]", String(SWEDEN_CHANNEL_ID));
  params.set("limit", String(NEWS_PAGE_SIZE));
  params.set("locale", "sv");
  params.set("page[number]", String(page));
  params.set("page[size]", String(NEWS_PAGE_SIZE));
  params.set("sort[][by]", "publish_date");
  params.set("sort[][direction]", "desc");
  return `${NEWS_API_URL}?${params.toString()}`;
}

/** Parse a single news article from the API response */
function parseNewsItem(item: Record<string, unknown>): Article | null {
  const attrs = (item.attributes as Record<string, unknown>) ?? {};
  const title = (attrs.title as string) ?? "";
  if (!title) return null;

  const tagline = (attrs.tagline as string) ?? "";
  const rawBody = (attrs.body as string) ?? tagline;
  const body = stripHtml(rawBody);
  const publishDate = (attrs["publish-date"] as string) ?? "";
  const slug = (attrs.slug as string) ?? (item.id as string) ?? "";
  const newsUrl = `https://whiteguide.com/se/sv/news/${slug}`;

  return {
    id: articleId("whiteguide-news", newsUrl),
    sourceId: "whiteguide-news",
    url: newsUrl,
    title,
    publishedAt: publishDate,
    contentType: "news",
    bodyText: body,
    venueName: "",
    collectedAt: now(),
  };
}

/** Extract total page count from API links.last URL */
function extractLastPage(links: Record<string, string>): number | null {
  const lastUrl = links?.last;
  if (!lastUrl) return null;
  const match = lastUrl.match(/page%5Bnumber%5D=(\d+)|page\[number\]=(\d+)/);
  return match ? parseInt(match[1] ?? match[2], 10) : null;
}

export async function collectWhiteGuideNews(): Promise<Article[]> {
  console.log("\n=== White Guide — News ===\n");

  const allArticles: Article[] = [];
  let page = 1;
  let totalPages: number | null = null;

  while (true) {
    const url = newsPageUrl(page);
    console.log(`  Fetching page ${page}${totalPages ? `/${totalPages}` : ""}...`);

    const res = await fetchWithRetry(url, {
      headers: { Accept: "application/json" },
    });
    const json = await res.json();

    const items = (json.data as Array<Record<string, unknown>>) ?? [];
    if (items.length === 0) break;

    // Extract total pages from first response
    if (page === 1 && json.links) {
      totalPages = extractLastPage(json.links as Record<string, string>);
      if (totalPages) console.log(`  Total pages: ${totalPages}`);
    }

    let reachedCutoff = false;
    for (const item of items) {
      const article = parseNewsItem(item);
      if (!article) continue;
      // Articles are sorted desc by date — stop when we pass the cutoff
      if (article.publishedAt && article.publishedAt < NEWS_CUTOFF_DATE) {
        reachedCutoff = true;
        break;
      }
      allArticles.push(article);
    }

    console.log(`    ${items.length} articles (total: ${allArticles.length})`);

    if (reachedCutoff) {
      console.log(`  Reached cutoff date (${NEWS_CUTOFF_DATE.slice(0, 10)}), stopping`);
      break;
    }

    // Stop if no more pages
    if (!json.links?.next || (totalPages && page >= totalPages)) break;
    page++;
  }

  console.log(`\n  Total news articles: ${allArticles.length}`);
  if (allArticles.length > 0) {
    saveArticles("whiteguide-news.json", allArticles);
  }

  return allArticles;
}

