# Bakom Score

Bakom Score is an aggregated restaurant rating on a **0–100** scale that combines ratings from multiple independent sources into a single comparable value.

Source file: [`src/lib/score.ts`](../src/lib/score.ts)

---

## Data Sources

| Source | Type | Original scale | Internal (0–10) | Weight |
|--------|------|---------------|-----------------|--------|
| Michelin | Expert assessment | Categories (Selected → 3★) | 6.5–10.0 | 0.28 |
| White Guide | Expert assessment | Categories (Recommended → Global Master) | 7.0–10.0 | 0.20 |
| SvD | Professional critic | 1–6 | 1.67–10.0 | 0.16 |
| DI Weekend | Professional critic | 0–25 (total score) | 0–10.0 | 0.16 |
| Krogguiden | Professional reviewers | 1–5 | 2.0–10.0 | 0.16 |
| Google | Crowdsource | 1–5 (with review count) | 2.0–10.0 | 0.10 |
| DN | Professional critic | Boolean (reviewed/not) | — | — |

DN has no numeric rating. A DN review counts as an extra diversity source but does not contribute to the weighted average.

---

## Normalization

All sources are normalized to an internal 0–10 scale using **score/max** (straight percentage) before weighting.

### Michelin (fixed mapping)

Values are calibrated so that having a Michelin distinction always lifts a restaurant's score above what non-prestige sources alone can achieve. Lower categories (Selected, Bib) are set high enough that they never drag down the weighted average.

| Category | Internal value |
|----------|---------------|
| Selected | 6.5 |
| Bib Gourmand | 8.0 |
| 1 star | 9.0 |
| 2 stars | 9.5 |
| 3 stars | 10.0 |

### White Guide (fixed mapping)

Same principle as Michelin — values are set so prestige sources always help, never hurt.

| Category | Internal value |
|----------|---------------|
| Recommended | 7.0 |
| Good Class | 7.5 |
| Very Good Class | 8.5 |
| Master Class | 9.0 |
| Global Master Class | 10.0 |

### SvD (1–6 scale)

```
internal = (score / 6) * 10
```

| Rating | Internal |
|--------|----------|
| 1/6 | 1.67 |
| 3/6 | 5.0 |
| 4/6 | 6.67 |
| 6/6 | 10.0 |

### DI Weekend (0–25 total score)

```
internal = (score / 25) * 10
```

| Rating | Internal |
|--------|----------|
| 15/25 | 6.0 |
| 20/25 | 8.0 |
| 21/25 | 8.4 |
| 25/25 | 10.0 |

### Krogguiden (1–5 scale)

```
internal = (score / 5) * 10
```

| Rating | Internal |
|--------|----------|
| 1.0/5 | 2.0 |
| 3.0/5 | 6.0 |
| 3.8/5 | 7.6 |
| 5.0/5 | 10.0 |

### Google (1–5 scale + Bayesian dampening)

Google ratings use the same score/max normalization, but an additional Bayesian dampening step prevents restaurants with few reviews from getting inflated scores.

**Step 1 — Normalization:**

```
raw = (score / 5) * 10
```

| Rating | Raw |
|--------|-----|
| 1.0/5 | 2.0 |
| 3.5/5 | 7.0 |
| 4.2/5 | 8.4 |
| 4.6/5 | 9.2 |
| 5.0/5 | 10.0 |

**Step 2 — Bayesian dampening:**

```
confidence = min(1, reviewCount / 100)
internal = confidence * raw + (1 - confidence) * 7.0
```

The prior value 7.0 (equivalent to Google 3.5/5) prevents restaurants with few reviews from getting artificially high or low scores.

| Review count | Confidence | Effect |
|--------------|------------|--------|
| 0 | 0.0 | Score pulled entirely to 7.0 (prior) |
| 50 | 0.5 | Halfway between raw and 7.0 |
| 100+ | 1.0 | Raw score used as-is |

**Example:** Google 4.2 with 30 reviews:
- Raw: `(4.2 / 5) * 10 = 8.4`
- Confidence: `30 / 100 = 0.3`
- Internal: `0.3 * 8.4 + 0.7 * 7.0 = 2.52 + 4.90 = 7.42`

---

## Weighting

Weights determine how much each source influences the final result. Only present sources are weighted — a restaurant with only DI and Google uses only those two weights.

```
Michelin:    0.28   (most prestigious, strict assessment)
White Guide: 0.20   (expert assessment, Swedish context)
SvD:         0.16   (professional critic)
DI Weekend:  0.16   (professional critic)
Krogguiden:  0.16   (professional reviewers)
Google:      0.10   (crowdsource, lowest weight)
```

The weighted average is calculated as:

```
score = sum(weight * internal) / sum(weight)
```

Only present sources are included. For a restaurant with Michelin + Google:

```
score = (0.28 * michelinValue + 0.10 * googleValue) / (0.28 + 0.10)
```

---

## Adjustments

### 1. Diversity dampening

Restaurants with few sources are dampened — a single source provides lower confidence than multiple independent assessments.

| Number of sources | Factor |
|-------------------|--------|
| 1 source | x 0.88 |
| 2 sources | x 0.95 |
| 3+ sources | x 1.00 |

DN counts as an extra source for diversity calculation (even though it doesn't contribute to the weighted average).

### 2. Visited-but-no-score ceiling

When a restaurant has a Krogguiden link but no Krogguiden rating, the score is capped at **70**. This means Krogguiden listed the restaurant but chose not to rate it — a signal of lower quality.

This ceiling is the effective limiter for many restaurants that only have Google reviews, since most of them come from the Krogguiden directory.

### 3. Prestige ceiling

Restaurants without prestigious expert sources are capped to prevent high scores from crowd-sourced or less selective sources alone.

| Prestige level | Ceiling (internal) | Ceiling (Bakom Score) |
|----------------|-------------------|----------------------|
| No Michelin AND no White Guide | 8.0 | 80 |
| Has White Guide OR Michelin (selected/bib) | 9.5 | 95 |
| Has Michelin 1★+ | — | — |

### 4. Perfection requirement

A score of 100 represents a flawless restaurant by every measure. To achieve 100:

- Must have Michelin 1★ or higher (prestige requirement)
- **ALL** present sources must score ≥ 9.5/10 (normalized)

If any source falls below 9.5, the maximum score is 99.

| Source | Minimum for 100 |
|--------|-----------------|
| Michelin | 1★ or higher |
| White Guide | Master Class or higher |
| Krogguiden | ≥ 4.75/5 |
| Google | ≥ 4.75/5 (with 100+ reviews) |
| SvD | 6/6 |
| DI | ≥ 23.75/25 |

### 5. Conversion to Bakom Score

The final step converts from the internal 0–10 scale to the public 0–100 scale:

```
bakomScore = round(internal * 10)
```

---

## Calculation steps (summary)

```
1. Collect all available sources' normalized values (0–10) and weights
2. Compute weighted average
3. Apply diversity dampening (x0.88 / x0.95 / x1.0)
4. Apply "visited but no score" ceiling (max 70)
5. Apply prestige ceiling (cap based on presence of expert sources)
6. Apply perfection requirement (cap at 99 if any source < 9.5)
7. Convert: internal * 10 → Bakom Score (0–100)
8. Round to integer
```

---

## Worked example 1: Villa Skärtofta

**Sources:** White Guide Very Good Class, DI 21/25, Google 5.0 (0 reviews)

### Step 1 — Normalization

| Source | Original rating | Internal (0–10) | Weight |
|--------|----------------|-----------------|--------|
| White Guide | Very Good Class | 8.5 | 0.20 |
| DI | 21/25 | 8.4 | 0.16 |
| Google | 5.0 (0 reviews) | 7.0* | 0.10 |

*Google: raw = (5/5) * 10 = 10.0, but 0 reviews → confidence = 0 → Bayesian dampening pulls entirely to prior 7.0.

### Step 2 — Weighted average

```
score = (0.20 * 8.5 + 0.16 * 8.4 + 0.10 * 7.0) / (0.20 + 0.16 + 0.10)
      = (1.70 + 1.344 + 0.70) / 0.46
      = 3.744 / 0.46
      = 8.139
```

### Step 3 — Diversity dampening

3 sources → factor 1.0 (no dampening).

### Step 4 — Prestige ceiling

Has White Guide → ceiling 9.5. Score 8.139 < 9.5, no cap applied.

### Step 5 — Perfection requirement

Score < 9.95 → not relevant.

### Step 6 — Conversion

```
bakomScore = round(8.139 * 10) = round(81.39) = 81
```

**Villa Skärtofta: Bakom Score 81**

---

## Worked example 2: Frantzén

**Sources:** Michelin 3★, White Guide Global Master Class, Krogguiden 4.4/5, Google 4.8/5 (737 reviews)

### Step 1 — Normalization

| Source | Original rating | Internal (0–10) | Weight |
|--------|----------------|-----------------|--------|
| Michelin | 3★ | 10.0 | 0.28 |
| White Guide | Global Master Class | 10.0 | 0.20 |
| Krogguiden | 4.4/5 | 8.8 | 0.16 |
| Google | 4.8/5 (737 reviews) | 9.6 | 0.10 |

### Step 2 — Weighted average

```
score = (0.28 * 10.0 + 0.20 * 10.0 + 0.16 * 8.8 + 0.10 * 9.6) / (0.28 + 0.20 + 0.16 + 0.10)
      = (2.8 + 2.0 + 1.408 + 0.96) / 0.74
      = 7.168 / 0.74
      = 9.686
```

### Step 3 — Diversity dampening

4 sources → factor 1.0 (no dampening).

### Step 4 — Prestige ceiling

Has Michelin 3★ → no ceiling.

### Step 5 — Perfection requirement

Score rounds to 97, but let's check: Krogguiden 8.8 < 9.5 → **not all sources are perfect**.

Even if the weighted average were higher, the maximum would be capped at 99.

### Step 6 — Conversion

```
bakomScore = round(9.686 * 10) = round(96.86) = 97
```

**Frantzén: Bakom Score 97** (capped at 99 due to imperfect Krogguiden, but weighted average already yields 97)
