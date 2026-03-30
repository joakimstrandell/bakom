---
name: enrich-quotes
description: |
  Enrich venue articles with editorial quotes/bodyText using Chrome MCP.
  Scrapes review text from White Guide, DN, SvD, and DI detail pages.
  Usage: /enrich-quotes [--source whiteguide|dn|svd|di] [--limit N]
  Defaults to all sources if no --source given. Limit defaults to all.
---

# Enrich Quotes

Enrich existing article data files with editorial bodyText from source websites using Chrome MCP.

## Prerequisites

- Chrome browser open with Claude in Chrome extension connected
- DN: must be logged in to dn.se for full article access
- SvD: must be logged in to svd.se for full article access (partial text without login)

## Overview

This skill reads existing article JSON files, finds entries with empty `bodyText`, visits their detail pages via Chrome MCP, extracts editorial text, and saves the enriched data back.

## Arguments

Parse from the user's `/enrich-quotes` invocation:
- `--source <name>`: One of `whiteguide`, `dn`, `svd`, `di`. If omitted, run all.
- `--limit <N>`: Max venues to enrich per source. If omitted, enrich all.

## Step 1: Get Chrome Tab

```
tabs_context_mcp(createIfEmpty: true)
```

Create a tab and navigate to any page to establish the session.

## Step 2: Source-Specific Enrichment

### White Guide (`whiteguide-review.json`)

White Guide venue pages are at `https://whiteguide.com/se/sv/{venueType}s/{placeId}`.
The page is JS-rendered (React/Next.js). The review text is in `.review` CSS class.

**Strategy**: Use `fetch()` from the browser tab (same-origin not needed — WG has no Cloudflare).
Navigate to `https://whiteguide.com` first to establish context, then use page-context fetch.

Actually, White Guide is a client-side rendered app. We need to navigate to each page and extract text. To speed this up, use `javascript_tool` to do fetch + DOMParser:

```javascript
window._wgEnrich = (async () => {
  // Read the articles data — pass it in from the pipeline
  const articles = ARTICLES_ARRAY; // injected by the agent
  const results = [];

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    if (a.bodyText) { results.push(a); continue; } // already has text

    try {
      const resp = await fetch(a.url);
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      // WG review text is inside .review div
      const reviewEl = doc.querySelector('.review');
      const bodyText = reviewEl ? reviewEl.textContent.trim() : '';

      results.push({ ...a, bodyText, enrichedAt: new Date().toISOString() });
    } catch (e) {
      results.push(a); // keep as-is on error
    }

    if ((i + 1) % 25 === 0) console.log(`WG: ${i + 1}/${articles.length}`);
  }

  return results;
})();
```

**Important**: White Guide pages are client-rendered, so `fetch()` + DOMParser may not work (the HTML won't contain the review text — it's rendered by JavaScript). In that case, navigate to each URL and use `javascript_tool` to extract:

```javascript
document.querySelector('.review')?.textContent?.trim() || ''
```

If fetch+DOMParser returns empty reviews, fall back to navigating to each page individually.

### DN Krogkommissionen (`dn-review.json`)

DN articles are at `https://www.dn.se/kultur/{slug}/`. User must be logged in.

**Strategy**: Navigate to each article URL, wait for content to load, extract article paragraphs.

For each article without bodyText (or with only the short og:description):

1. Navigate to the article URL
2. Wait 2-3 seconds for load
3. Extract text:

```javascript
const paragraphs = [...document.querySelectorAll('article p, .article__body p, [class*="article"] p')];
const text = paragraphs
  .map(p => p.textContent.trim())
  .filter(t => t.length > 20 && !t.includes('En utskrift från') && !t.includes('Artikelns ursprungsadress'))
  .join('\n\n');
text;
```

4. Save the extracted text as `bodyText`

### SvD Krogguiden (`svd-review.json`)

SvD articles are at `https://www.svd.se/a/{id}/{slug}`. Behind paywall.

**Strategy**: Same as DN — navigate to each article and extract visible paragraphs.

```javascript
const paragraphs = [...document.querySelectorAll('article p, .article__body p, [class*="article"] p')];
const text = paragraphs
  .map(p => p.textContent.trim())
  .filter(t => t.length > 20 && !t.includes('Redan prenumerant'))
  .join('\n\n');
text;
```

Note: If not logged in, only the first 2-3 paragraphs will be available. That's still useful as a quote.

### DI Weekend (`di.json`)

DI articles are at URLs like `https://www.di.se/nyheter/{slug}/`. Not paywalled.

**Strategy**: Navigate to each article URL and extract article text.

```javascript
const paragraphs = [...document.querySelectorAll('article p, .article__body p, [class*="article"] p')];
const text = paragraphs
  .map(p => p.textContent.trim())
  .filter(t => t.length > 20)
  .join('\n\n');
text;
```

## Step 3: Save Enriched Data

After enriching articles for a source, write the updated articles back to the corresponding JSON file in `pipeline/.data/articles/`:

```bash
# The agent should use the Write tool to save the JSON
# Path: pipeline/.data/articles/{source-file}.json
```

Update the `enrichedAt` timestamp for each enriched article.

## Step 4: Report

Print a summary:
- Source name
- Total articles
- Articles enriched (bodyText added)
- Articles skipped (already had bodyText or no URL)
- Errors

## Performance Notes

- White Guide: ~500 venues, ~2-3 min if using fetch+DOMParser, ~30 min if navigating each page
- DN: ~30-50 articles, ~2-5 min navigating each
- SvD: ~100-200 articles, ~5-15 min navigating each
- DI: ~200+ articles, ~10-20 min navigating each

For large sets, use `--limit N` to do a subset first.

## Important

- Always preserve existing article data — only add/update `bodyText` and `enrichedAt`
- Never overwrite non-empty `bodyText` with empty text
- Skip articles with no URL
- Rate limit: wait 1-2 seconds between page navigations
