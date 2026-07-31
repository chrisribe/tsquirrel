# Product Take & Feed Prototype — "Sell the Take, Not the Headline"

Status: **design / product thinking**
Created: 2026-07-30

---

## Why this doc exists

A pause to answer a strategic question before adding more UI polish:
**Why are users here, what mindset are they in, and what plus-value keeps them
opening the next story?** The visual work (cards, heroes, spacing) is done; this
doc captures the *product* direction that the UI should now serve.

---

## Who is here and in what mindset

TSquirrel is a **curated, opinionated news digest** (RSS + HN + Google Trends,
clustered and summarized). A visitor is **not** here for breaking news — they'd
use Twitter/X or Google for that. They arrive in one of two modes:

| Mode | Mindset | What they want |
|------|---------|----------------|
| **"Catch me up"** | Low-effort scan, anti-doomscroll | "What happened while I was away, without opening 6 tabs" |
| **"What's the deal with X?"** | Curiosity gap from a headline seen elsewhere | The *shape* of the story fast: what happened, who's saying what, is it a big deal |

The existing tagline already nails the promise:
> "The internet is a big forest. **We sniff out the good stuff** so you don't
> have to dig."

That is the north star: **pre-digested, opinionated, time-saving.** Every feature
should serve *"save me time AND give me a take I can't get from a raw feed."*

---

## Where the real value already lives

Two things a plain RSS reader **cannot** do, both already in the product:

1. **Convergence** — "4 sources are covering this" is a genuine importance
   signal. Curation, not aggregation.
2. **The Squirrel's Take** — the one-liner opinion. This is the differentiation.
   Nobody opens a fifth article for a *neutral* summary; they open it for a
   **voice**.

> Strategic framing: **TSquirrel is not a news source. It's a trusted friend who
> read everything and tells you what's worth caring about, with personality.**
> The product sells *judgment + voice*, not information.

---

## The curiosity-gap model (the "LeBron test")

A user tapping the Drake/LeBron shirt story does not want a sober recap. In their
head is one question: **"Is this real beef or nothing?"** They want:

- the **receipts** (the shirt, the quote, the timeline),
- a **verdict with attitude** ("a T-shirt doing more press than most diss
  tracks manage these days").

They open a story to **resolve a curiosity gap**, and they stay for the **voice**
that resolves it. Neutral summaries *end* the relationship the moment they answer
the question. A take *extends* it.

---

## The core insight

> The headline is what the user has **already seen elsewhere**.
> The **take** is *why they should click here instead of Google*.

So the feed must **sell the take, not re-print the headline.**

Compare:
- Headline-led (current): **"Altman Taps the Brakes — Right After Declaring the Singularity Arrived"**
- Take-led (proposed hook): **"The man who spent years shouting 'faster' just found the brake pedal."**

The second is the reason to click *this* card over a raw feed.

---

## Priority levers (highest engagement leverage first)

1. **Take-led feed cards** — lead each card with the Squirrel's Take as the hook;
   demote the headline to secondary. The take is the click driver.
2. **"Why it matters" line** — a one-liner *distinct from the summary*.
   Summary = *what happened*. Why-it-matters = *the twist / why you should care*.
   This is the explicit plus-value over a raw feed.
3. **Forward tension / "what's next"** — surface the open question (already written
   beautifully in the Altman story: "the gap between his cosmic optimism and his
   sudden caution is where the real questions live"). This is what makes someone
   come back tomorrow.
4. **Related / "keep digging" at article end** — the moment a user finishes a
   story is **peak intent**, yet the only exit today is "back to trending." One or
   two *thematically related* stories turns one read into three. Highest-leverage
   engagement change; already powered by existing category + tags data.
5. **Velocity / temperature** — lean into *speed* of convergence
   ("blowing up in the last hour") not just count, to create scannable FOMO.

Supporting detail (sentiment gauge, source lists) is nice but will **not** drive
"open another." The **take** and the **related-stories exit** will.

---

## Prototype A — Take-led feed card

**Goal:** make the take the hook; headline becomes context.

```
┌─────────────────────────────────────────────┬──────────┐
│  💻 TECHNOLOGY   🔥 blowing up · 4 sources   │          │
│                                              │  [image] │
│  “The man who spent years shouting          │  full-   │
│   ‘faster’ just found the brake pedal.”     │  height  │
│   ── the Squirrel                            │  panel   │
│                                              │          │
│  Altman Taps the Brakes — Right After        │          │
│  Declaring the Singularity Arrived           │          │
│                                              │          │
│  #openai  #ai-safety              1h ago     │          │
└─────────────────────────────────────────────┴──────────┘
```

Changes vs current card:
- **Take** rendered large/first as the primary hook (quote styling, attributed
  "── the Squirrel").
- **Headline** demoted to a smaller secondary line (context, not the sell).
- Meta row leans on **velocity** ("blowing up") when convergence is recent.
- Fallback when a story has no take: keep the current headline-led layout so
  nothing breaks. **A story without a take should be the exception**, not the norm.

---

## Prototype B — "Keep digging" at article end

**Goal:** convert peak-intent (end of read) into the next open.

```
        ┌───────────────────────────────────┐
        │  🐿️  KEEP DIGGING                  │
        ├───────────────────────────────────┤
        │  💻  More from the AI-hype beat    │
        │      “Microsoft is openly …”       │
        ├───────────────────────────────────┤
        │  🌍  Also chattering right now      │
        │      “Berlin Pride …”               │
        └───────────────────────────────────┘
             ← Back to trending  (centered)
```

Selection logic (uses existing data, no new pipeline):
1. **Same category or shared tag**, published/updated recently, excluding the
   current story — the "more from this beat" slot.
2. **Highest-convergence recent story** overall — the "also chattering" slot.
3. Cap at 2–3 to avoid a wall; each row leads with **its take**, consistent with
   Prototype A.

Server-side this is a small DAO query (`WHERE category = $cat OR tags && $tags
ORDER BY published_at DESC LIMIT 3`) rendered as a fragment beneath the sources
card, above the centered "Back to trending" link.

---

## Content contract implication

For this to work, the authoring/agent flow must treat the **take** and the
**why-it-matters** as first-class, near-required fields — not optional flourishes.
The API already supports `squirrel_take`; a `why_it_matters` field (or a
convention within the summary) would make Prototype A/B fully expressible.

**Definition of a "good" TSquirrel story:**
- has a **take** (the voice / differentiation), and
- has a **why-it-matters** (the utility / plus-value over a raw feed),
- ideally names the **open tension** (the reason to return).

---

## Suggested build order

1. **Prototype B (Keep digging)** — highest leverage, uses existing data,
   low risk, purely additive.
2. **Prototype A (Take-led cards)** — higher impact on the scan experience but
   touches the core card everyone sees; do after B validates the thesis.
3. **`why_it_matters` field** — enables the explicit plus-value line once A/B
   prove the direction.
