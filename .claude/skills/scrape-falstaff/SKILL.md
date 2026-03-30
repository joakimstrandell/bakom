---
name: scrape-falstaff
description: |
  Scrape Falstaff restaurant and bar ratings using Chrome MCP.
  Outputs falstaff-raw.json for the pipeline collector.
  Usage: /scrape-falstaff
---

# Scrape Falstaff

Scrape rated venues from Falstaff.com using Chrome MCP (real browser, bypasses Cloudflare).

## Prerequisites

- Chrome browser open with Claude in Chrome extension connected

## Listing Pages

1. **Restaurants**: `https://www.falstaff.com/en/listings/the-best-restaurants-in-sweden`
2. **Bars**: `https://www.falstaff.com/en/listings/the-best-bars-in-sweden`

Skip cafes — they don't have ratings.

## Step 1: Get Chrome Tab

```
tabs_context_mcp(createIfEmpty: true)
```

Navigate to `https://www.falstaff.com/en` and wait for load. This establishes the session for same-origin `fetch()` calls.

## Step 2: Discover Venue URLs via Pagination

Listing pages paginate via `?page=N` (starting from 0). Venues are sorted by score — rated venues appear first, unrated ones after. **Stop paginating when a page has no scored venues.**

For each listing, store the promise on `window` so results can be retrieved after completion:

```javascript
window._falstaffRestaurants = (async () => {
  const BASE = 'https://www.falstaff.com';
  const LISTING = '/en/listings/the-best-restaurants-in-sweden'; // or the-best-bars-in-sweden
  const LINK_PATTERN = '/en/restaurants/'; // or /en/bars/
  const allUrls = new Set();
  let page = 0;

  while (true) {
    const resp = await fetch(`${BASE}${LISTING}?page=${page}`);
    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const links = doc.querySelectorAll(`a[href*="${LINK_PATTERN}"]`);
    const pageUrls = [...new Set(Array.from(links).map(a => a.getAttribute('href')).filter(Boolean))];

    if (pageUrls.length === 0) break;

    const hasScores = html.includes('guide-rating__point-total') || html.includes('point__number');

    for (const u of pageUrls) allUrls.add(u);
    page++;

    if (!hasScores) break;
  }

  return { pages: page, count: allUrls.size, urls: Array.from(allUrls) };
})();
```

Run for both restaurants and bars, then combine:

```javascript
(async () => {
  const restData = await window._falstaffRestaurants;
  const barData = await window._falstaffBars;
  window._allFalstaffUrls = [...new Set([...restData.urls, ...barData.urls])];
  return `Total unique URLs: ${window._allFalstaffUrls.length}`;
})()
```

## Step 3: Scrape Detail Pages with Sub-Scores

Scrape all URLs in one batch. Store the promise on `window` — it takes 2-3 minutes for ~200 URLs.

```javascript
window._falstaffResults = (async () => {
  const BASE = 'https://www.falstaff.com';
  const urls = window._allFalstaffUrls;
  const results = [];
  let errors = 0;

  for (let i = 0; i < urls.length; i++) {
    try {
      const resp = await fetch(BASE + urls[i]);
      if (!resp.ok) { errors++; continue; }
      const html = await resp.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const ldScript = doc.querySelector('script[type="application/ld+json"]');
      if (!ldScript) continue;
      const ld = JSON.parse(ldScript.textContent);

      // Skip unrated venues (no review = no Falstaff rating)
      if (!ld.review || ld.review.length === 0) continue;

      // Extract numeric score (80-100) from HTML
      const scoreEl = doc.querySelector('.guide-rating__point-total');
      const score = scoreEl ? parseInt(scoreEl.textContent.trim(), 10) : null;

      // Extract forks/glasses from review rating (0-4)
      const forks = ld.review[0]?.reviewRating?.ratingValue
        ? parseInt(ld.review[0].reviewRating.ratingValue, 10)
        : null;

      // Extract sub-scores: "N /N Category"
      // Restaurants: Food(/50), Service(/20), Wine(/20), Style(/10)
      // Bars: Drinks(/50), Style(/20), Service(/20), Range(/10)
      const body = doc.body.textContent;
      const subPattern = /(\d{1,2})\s*\/\s*(\d{1,2})\s+(Food|Service|Wine|Style|Drinks|Range|Ambiance|Atmosphere)/gi;
      const subScores = {};
      let m;
      while ((m = subPattern.exec(body)) !== null) {
        subScores[m[3].toLowerCase()] = { score: parseInt(m[1]), max: parseInt(m[2]) };
      }

      // Extract editorial description text
      const descEl = doc.querySelector('.guide-rating__description');
      const bodyText = descEl ? descEl.textContent.trim() : '';

      results.push({
        name: ld.name,
        url: BASE + urls[i],
        score: (score && score >= 80 && score <= 100) ? score : null,
        forks,
        address: [
          ld.address?.streetAddress,
          ld.address?.postalCode,
          ld.address?.addressLocality,
        ].filter(Boolean).join(', '),
        cuisine: [],
        subScores: Object.keys(subScores).length > 0 ? subScores : undefined,
        bodyText: bodyText || undefined,
      });
    } catch (e) {
      errors++;
    }

    if ((i + 1) % 50 === 0) {
      console.log(`${i + 1}/${urls.length} — ${results.length} rated, ${errors} errors`);
    }
  }

  return { total: urls.length, rated: results.length, errors, results };
})();
```

**Wait 2-3 minutes**, then check status:

```javascript
window._falstaffResults.then(r => JSON.stringify({total: r.total, rated: r.rated, errors: r.errors}))
```

## Step 4: Save Output

The MCP tool truncates large responses. Download the data as a file from the browser:

```javascript
window._falstaffResults.then(r => {
  const json = JSON.stringify(r.results, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'falstaff-raw.json';
  a.click();
  URL.revokeObjectURL(url);
  return `downloading ${r.results.length} venues (${json.length} bytes)`;
})
```

Then copy from Downloads to the pipeline data directory:

```bash
cp ~/Downloads/falstaff-raw*.json pipeline/.data/falstaff-raw.json
```

**Note**: Chrome may append `(1)` or `(2)` to the filename. Use the most recent one.

## Step 5: Run Pipeline

```bash
pnpm pipeline:collect --source falstaff
pnpm pipeline:merge
pnpm pipeline:refine --recategorize  # or full refine if new venues were added
pnpm pipeline:score
pnpm pipeline:optimize
```

Use `--recategorize` if no new venues were added. Use full `refine` (no flag) if new venues need Google enrichment.

## Scoring Reference

Falstaff rates on a 100-point scale:
- **1 fork/glass**: 80–84 points
- **2 forks/glasses**: 85–89 points
- **3 forks/glasses**: 90–94 points
- **4 forks/glasses**: 95–100 points

Restaurants use fork icons, bars use glass icons. Both stored as `forks` (0-4) in the data.

Sub-score scales:
- **Restaurants**: Food (/50), Service (/20), Wine (/20), Style (/10) = 100
- **Bars**: Drinks (/50), Style (/20), Service (/20), Range (/10) = 100

## Expected Output

- **~150-200 rated venues** (restaurants + bars)
- Only venues with a `review` field in their JSON-LD are included
- All venues have numeric scores (80-100) and sub-scores

## Notes

- Cloudflare blocks headless browsers — Chrome MCP with a real browser is required
- Same-origin `fetch()` works from the Falstaff tab (no Cloudflare challenge)
- Pagination via `?page=N` — stop when pages no longer contain scored venues
- The scrape takes 2-3 minutes for ~200 detail page fetches
- `falstaff-raw.json` is not committed to git — it's regenerated via this skill
