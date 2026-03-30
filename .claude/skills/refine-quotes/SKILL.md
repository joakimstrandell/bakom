---
name: refine-quotes
description: |
  Extract short editorial quotes from venue bodyText using Claude as the LLM.
  Reads venues-refined.json, processes quotes inline, writes back with excerpts.
  Usage: /refine-quotes [--limit N] [--force]
  Defaults to all venues if no --limit given. --force re-extracts existing excerpts.
---

# Refine Quotes

Extract short, representative editorial quotes from full bodyText stored in each venue's `quotes[]` array.

## Overview

After collect and merge, each venue may have `quotes[]` with full editorial bodyText from sources (Michelin, White Guide, Falstaff, DN, SvD, DI). This skill reads `venues-refined.json`, extracts a short `excerpt` for each quote, and saves back.

Claude itself acts as the LLM — no API calls needed. Process quotes inline by reading the text and writing the excerpt.

## Arguments

Parse from the user's `/refine-quotes` invocation:
- `--limit <N>`: Max venues to process. If omitted, process all.
- `--force`: Re-extract excerpts even if already present.

## Step 1: Load Data

Read `pipeline/.data/venues-refined.json` (JSON with `{ sourceHash, venues[] }`).

Find all venues where `quotes` exists and has entries. Count how many quotes need excerpts:
- Without `--force`: quotes where `excerpt` is missing or empty
- With `--force`: all quotes

Report: "Found N venues with M quotes needing excerpts."

## Step 2: Extract Excerpts

For each venue with quotes needing excerpts, process each quote:

1. Read the `text` field (full bodyText)
2. Extract the single most interesting, descriptive, or opinionated 1-2 sentences (under 40 words)
3. Prefer vivid, specific language over generic praise
4. Keep the original language (Swedish quotes stay Swedish, English stay English)
5. Write the result into the `excerpt` field on the quote object

If no meaningful quote can be extracted (text too short, generic, or nonsensical), skip it — leave `excerpt` empty.

### Source labels for context

- `michelin` → Guide Michelin
- `whiteguide-review` → White Guide
- `falstaff` → Falstaff
- `dn-review` → Dagens Nyheter
- `svd-review` → Svenska Dagbladet
- `di` → DI Weekend

### Batch processing

Process venues in batches of 50. After each batch:
1. Save progress to `venues-refined.json` (use Write tool)
2. Report progress: "Batch N: X/Y venues done, Z excerpts extracted"

## Step 3: Save and Report

After all batches:
1. Save final `venues-refined.json`
2. Report summary:
   - Total venues processed
   - Total excerpts extracted
   - Excerpts by source
   - Skipped (no meaningful quote)

## Important

- Never modify any field other than `excerpt` on quote objects
- Never remove or modify existing `text`, `sourceId`, `publishedAt`, or `url` fields
- Preserve the full `venues-refined.json` structure (sourceHash, all venue fields)
- Save incrementally to avoid losing progress on large runs
- The file is large (~50MB+) — use Read with offset/limit to process in chunks if needed
