---
name: refine-quotes
description: |
  Extract short editorial quotes from venue bodyText using Claude as the LLM.
  Reads venues-refined.json, processes quotes inline or via parallel sub-agents, writes back with excerpts.
  Usage: /refine-quotes [--limit N] [--force]
  Defaults to all venues if no --limit given. --force re-extracts existing excerpts.
---

# Refine Quotes

Extract short, representative editorial quotes from full bodyText stored in each venue's `quotes[]` array.

## Overview

After collect and merge, each venue may have `quotes[]` with full editorial bodyText from sources (Michelin, White Guide, Falstaff, DN, SvD, DI). This skill reads `venues-refined.json`, extracts a short `excerpt` for each quote, and saves back.

Claude itself acts as the LLM — no API calls needed.

## Arguments

- `--limit <N>`: Max venues to process. If omitted, process all.
- `--force`: Re-extract excerpts even if already present.

## Step 1: Scale decision

Read `pipeline/.data/venues-refined.json` and count quotes needing excerpts.

- Without `--force`: quotes where `excerpt` is missing or empty.
- With `--force`: all quotes.

Report: "Found N venues with M quotes needing excerpts."

**Pick a strategy based on N:**

| Venues needing excerpts | Strategy |
|---|---|
| ≤ 30 | Inline (Steps 2–3 below) |
| 31–100 | Inline in batches of 10–20 venues (Steps 2–3) |
| > 100 | **Parallel sub-agents** (Step 2-alt) — proven to extract 1873 excerpts in ~7 min across 10 agents |

## Step 2 (alt): Parallel sub-agent dispatch

Use this when there are more than ~100 venues to process. Inline extraction past that scale exhausts the main agent's context.

### 2a. Shard the remaining venues

Sort venues needing excerpts by `sourceCount` descending (highest-impact first). Split into N shards (10 is a good default). Write each shard as a compact JSON file at `/tmp/agent-shard-{i}.json`:

```js
// Per venue, compact form:
{
  id: v.id,
  n: v.name,
  c: v.city,
  q: v.quotes
    .filter(q => q.text && !q.excerpt)
    .map(q => ({ s: q.sourceId, t: q.text.slice(0, 500) }))
}
```

Keep `t` trimmed to ~500 chars — enough for a pull-quote, much cheaper to ship to each agent.

### 2b. Dispatch N agents in one message

Launch all N `general-purpose` sub-agents **concurrently in a single assistant message** (multiple `Agent` tool calls in the same turn), each with `run_in_background: true`.

Per-agent prompt template (substitute `{N}` for the shard index):

```
Extract short editorial quote excerpts for a list of restaurant reviews.

Input: /tmp/agent-shard-{N}.json — array of venues, each with
{id, n (name), c (city), q: [{s (sourceId), t (text ~500 chars)}]}.

For each venue and each of its quotes:
- Pick the single most vivid, specific, descriptive 1-2 sentence excerpt
  from `t` (under 40 words).
- Prefer opinionated critic voice or concrete dish/atmosphere detail
  over generic praise.
- Keep the ORIGINAL language (Swedish stays Swedish, English stays English).
- Skip metadata lines like "Adress:", "Hemsida:", "Öppet:", "Kontakt:",
  "Telefon:", and disclaimers.
- If no meaningful excerpt can be extracted, skip that quote (omit it
  from output).

Output: Write /tmp/excerpts-agent-{N}.json as a JSON object mapping
{venueId: {sourceId: "excerpt text"}}.

Work autonomously — do not ask questions. Report back: count of venues
processed, total excerpts produced, path of output file. Under 50 words.
```

### 2c. Apply outputs

Wait for all agents to complete (you'll be notified). Then run a small script to merge all `/tmp/excerpts-agent-{N}.json` files into `venues-refined.json`, writing each excerpt to the matching `{venueId}.quotes[].excerpt` where `sourceId` matches.

Typical result: 1873/1887 (99%) coverage. The ~1% gap is boilerplate/paywall-stub quotes agents correctly declined to summarize.

## Step 2: Inline extraction (small sets only)

For each venue with quotes needing excerpts, process each quote:

1. Read the `text` field (full bodyText).
2. Extract the single most interesting, descriptive, or opinionated 1-2 sentences (under 40 words).
3. Prefer vivid, specific language over generic praise.
4. Keep the original language (Swedish quotes stay Swedish, English stay English).
5. Write the result into the `excerpt` field on the quote object.

If no meaningful quote can be extracted (text too short, generic, or nonsensical), skip it — leave `excerpt` empty.

### Source labels for context

- `michelin` → Guide Michelin
- `whiteguide-review` → White Guide
- `falstaff` → Falstaff
- `dn-review` → Dagens Nyheter
- `svd-review` → Svenska Dagbladet
- `di` → DI Weekend

### Batch processing

Process venues in batches of 10–20. After each batch:
1. Save progress to `venues-refined.json` (use Write tool).
2. Report progress: "Batch N: X/Y venues done, Z excerpts extracted."

## Step 3: Save and Report

After all batches (or all sub-agent outputs applied):
1. Save final `venues-refined.json`.
2. Report summary:
   - Total venues processed
   - Total excerpts extracted
   - Coverage: excerpts / total quotes
   - Excerpts by source
   - Skipped (no meaningful quote)

## Important

- Never modify any field other than `excerpt` on quote objects.
- Never remove or modify existing `text`, `sourceId`, `publishedAt`, or `url` fields.
- Preserve the full `venues-refined.json` structure (sourceHash, all venue fields).
- Save incrementally to avoid losing progress on large runs.
- The file is large (~50MB+) — use Read with offset/limit to process in chunks if needed.
