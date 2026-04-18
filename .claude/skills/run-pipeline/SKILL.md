---
name: run-pipeline
description: |
  Run the full Bakom data pipeline end-to-end: collect → Chrome-MCP enrichment → merge → refine (Google Places) → refine-quotes (LLM) → score → optimize.
  Handles Chrome-MCP interleaves, prompts for user confirmation before Google Places spend, dispatches parallel sub-agents for quote extraction at scale.
  Usage: /run-pipeline [--skip-chrome] [--skip-refine] [--skip-quotes] [--force]
---

# Run Pipeline

Orchestrates the 5-phase data pipeline with checkpoints and safety gates. See [docs/pipeline.md](../../../docs/pipeline.md) for the full data model.

## Arguments

- `--skip-chrome`: Skip Chrome-MCP interleave steps (`/scrape-falstaff`, `/enrich-quotes --source dn|di`). Useful when Chrome is unavailable or those sources were scraped recently.
- `--skip-refine`: Skip `pnpm pipeline:refine`. Uses existing `venues-refined.json`. Saves ~$5 on re-runs where the venue set hasn't changed.
- `--skip-quotes`: Skip `/refine-quotes`. Score and optimize don't use excerpts.
- `--force`: Pass `--force` to sub-steps that support it (Krogguiden `--force`, refine `--force`, refine-quotes `--force`).

## Phase 1: Collect

### 1a. Automated collection

```bash
pnpm pipeline:collect
```

Runs all automated source collectors (White Guide, DN metadata, SvD, Michelin, DI API snapshot, Krogguiden, Falstaff from cache, Thatsup). Takes ~30 min (Michelin detail pages and Thatsup pagination dominate).

**Checkpoint:** Compare article counts to `git show HEAD:pipeline/.data/articles/<source>.json` for each file — flag any source that lost entries unexpectedly (e.g. the whiteguide-news drop noted in Troubleshooting).

### 1b. Chrome-MCP enrichment (skip if `--skip-chrome`)

Requires Chrome with the Claude in Chrome extension + logged-in sessions for paywalled sources.

1. **`/scrape-falstaff`** — refresh `falstaff-raw.json` via same-origin `fetch()` from falstaff.com (Cloudflare). ~8 min for ~550 URLs. Then re-run `pnpm pipeline:collect --source falstaff` to import into `falstaff.json`.
2. **`/enrich-quotes --source dn`** — confirm user is logged in to dn.se. Pulls bodyText for articles lacking `enrichedAt`.
3. **`/enrich-quotes --source di`** — DI blocks server-side HTTP (returns paywall HTML even with 200). Use Chrome same-origin fetch. Note the known Chrome auto-download limit ([Troubleshooting](../../../docs/pipeline.md#troubleshooting)); fall back to local HTTP receiver or `sessionStorage` handoff if the first download succeeds but subsequent ones silently fail.

## Phase 2: Merge

```bash
pnpm pipeline:merge
```

**Checkpoint:** Report total venues, sourceCount distribution, top cities. Expected ~4000 venues for the current source set.

## Phase 3: Refine

### 3a. Google Places (skip if `--skip-refine`)

**Always compute and display the cost estimate before running.** Load `venues-merged.json` and `google-lookups.json`; count venues without a `googlePlaceId` and not in cache. Multiply by 1.3 (retry factor). Report:

```
New venues needing Google API calls: <N>
Estimated calls (with 1.3× retry): <N*1.3>
Estimated cost (Enterprise + Atmosphere, $35/1k): $<cost>
```

Note: the script's built-in estimate quotes $0.032/call (Essentials pricing), but the current field mask includes atmosphere fields, so real billing is ~10% higher (~$0.035/call).

**Ask the user to confirm before running:**

```bash
pnpm pipeline:refine
```

### 3b. LLM quote extraction (skip if `--skip-quotes`)

Invoke `/refine-quotes`. The skill auto-picks inline vs parallel sub-agent dispatch based on how many venues need excerpts:
- ≤ 100 venues: inline.
- \> 100 venues: dispatch ~10 parallel `general-purpose` sub-agents (each ~100 venues). Proven runtime: 1887 quotes → 1873 extracted in ~7 min.

## Phase 4: Score

```bash
pnpm pipeline:score
```

**Checkpoint:** Report score distribution histogram, top 5 venues, metro region averages.

## Phase 5: Optimize

```bash
pnpm pipeline:optimize
```

**Checkpoint:** Report final counts (restaurants, bars, fika, hotels), frontend file sizes, sitemap URL count.

## Final report

At the end, summarize:

| Phase | Result |
|---|---|
| Collect | total articles by source, delta vs git HEAD |
| Chrome MCP | rated venues / enriched count per source |
| Merge | total venues, sourceCount distribution |
| Refine (Google) | new API calls, actual cost, cleanup/dedup counts |
| Refine (LLM) | excerpt coverage % |
| Score | average, top 5, 90+ count |
| Optimize | restaurants / bars / fika / hotels, frontend file sizes |

Also mention the actual wall-clock time and any failure modes hit.

## Failure modes (when to stop and ask)

- **DI collector wipes enrichment**: should no longer happen post-2026-04 patch; if observed on another source, stop and investigate the collector — apply the same load-and-merge fix.
- **Chrome same-origin fetch returns paywall text** instead of real content: check login state in the tab; if logged out, prompt user to log in and retry.
- **Google Places 403/429**: stop, report error, don't loop. The script saves progress every 100 venues.
- **Agent dispatch for refine-quotes hangs**: a single sub-agent may exceed context on very long texts. Trim `t` to 400 chars (not 500) and re-slice. Don't cancel partial agent outputs — merge what completed.
- **whiteguide-news unexpected count drop**: current open issue. Flag to user, don't abort the rest of the pipeline (news doesn't merge into venues).
