# Walkthrough

A renter types a NYC address. Walkthrough pulls that building's public housing
record — HPD complaints and violations, DOB complaints and violations, bedbug
filings — and turns it into a plain-language risk report before a lease gets
signed.

Nobody signs a lease alone. Walkthrough also reads photos taken at the viewing
and looks for things worth asking about, and produces a screenshot-shaped
summary to send to whoever else is helping you decide.

## The problem

NYC Open Data already publishes every HPD complaint and violation filed
against a building, but it's spread across seven separate datasets, keyed by
identifiers (BBL, BIN) nobody carries around, and not something a renter
standing in a hallway at a viewing is going to cross-reference in the next
five minutes. Walkthrough does that lookup for them: one address in, one
graded report out.

## What it does

- **Address → building report.** Type an address, get a grade (A–F), a
  0–100 score, and a category breakdown (heat/hot water, plumbing, pests,
  electrical, structural, elevator, safety, other) — each with a 24-month
  count, an all-time count, and how many violations are still open.
- **A 40-event timeline** of the building's most recent complaints and
  violations, newest and unresolved first, each one linked back to the city
  dataset it came from.
- **A plain-language AI summary** — red flags and questions to ask — written
  from the aggregate numbers only. The model never sees or invents a number;
  every figure in the report was computed in TypeScript from the raw
  records, and a generated summary that contains a figure we didn't supply
  is thrown away rather than shown.
- **Photo review.** Upload up to 6 photos (or a short video) from the
  viewing and get back cautious, non-diagnostic observations — "possible
  water staining near the ceiling — ask when this was last repaired," never
  "this apartment has mold." When a photo finding lines up with a
  high-complaint category the city record already shows, the two are
  connected explicitly.
- **A shareable summary card** — address, grade, score, top concerns,
  questions checklist — sized to screenshot and send in a text thread.

## Datasets

All from [NYC Open Data](https://opendata.cityofnewyork.us/) (Socrata) unless noted:

| Dataset | ID | Used for |
|---|---|---|
| HPD Complaints | `uwyv-629c` | complaint counts, timeline |
| HPD Complaint Problems | `a2nx-4u46` | category classification |
| HPD Violations | `wvxf-dwi5` | open/closed violations, class A/B/C |
| DOB Complaints | `eabe-havv` | DOB complaint counts, timeline |
| DOB Violations | `3h2n-5cm9` | DOB violation timeline |
| HPD Bedbug Reporting | `wz6d-d3jb` | bedbug filing status |
| HPD Housing Registrations | `tesw-yqqr` | unit count, landlord registration |

Address search uses [NYC Planning Labs Geosearch](https://geosearch.planninglabs.nyc/)
(not a Socrata dataset) to resolve free-text addresses to BBL/BIN/lat/lng.

The AI narrative and photo review both call the Claude API
(`@anthropic-ai/sdk`) server-side only — the browser never talks to
Socrata, Geosearch, or Anthropic directly, only to this app's own
`/api/*` routes.

## How to run it

```bash
npm install
cp .env.example .env.local   # fill in the two keys below
npm run dev                  # http://localhost:3000
```

`.env.local`:

- `SOCRATA_APP_TOKEN` — raises the NYC Open Data rate limit above the
  anonymous tier. [Register here](https://data.cityofnewyork.us/profile/edit/developer_settings).
  The app still works without it, just with a lower ceiling before
  `RATE_LIMITED` kicks in.
- `ANTHROPIC_API_KEY` — powers `/api/narrative` and `/api/analyze-media`.
  Without it, the report still renders (no narrative section) and photo
  upload returns `UPSTREAM_DOWN` rather than fabricating results.

Other scripts:

- `npm run typecheck` — strict TypeScript across the whole app.
- `npm run smoke` — runs the real pipeline against nine intentionally
  awkward live buildings (a commercial tower, a park, a Staten Island lot
  with no unit count, etc.) and asserts the invariants the UI relies on:
  categories sum correctly, the timeline is capped at 40 and sorted, the
  score is an integer in range. Good pre-demo sanity check.
- `npm run warm-cache -- --bbl <bbl>` — regenerates a committed fixture in
  `public/demo/`. Every building on the landing page's "try a real
  building" list has one, and `resolveReport()` checks that directory
  before the cache and before any network call — so the three demo
  addresses render correctly with the wifi unplugged. See
  [docs/demo-script.md](docs/demo-script.md) for the addresses.

## Limitations

- **This is filed complaints, not ground truth.** A building with a clean
  record may just have tenants who don't file complaints with the city.
  Absence of a violation is not proof of a well-maintained building.
- **Not legal advice**, and not a substitute for seeing the apartment in
  person.
- **Category complaint counts overlap.** One HPD complaint can span
  several categories (e.g. a leak that's both "plumbing" and
  "structural") and is counted in each — they do not sum to the total
  complaint count. Open violation counts, unlike complaints, do partition
  exactly.
- **Unit count and BIN aren't always on file.** When they're missing, the
  report says so explicitly (`dataQuality.warnings`) rather than silently
  guessing, and per-unit comparisons are unavailable.
- **The AI narrative can be absent.** If generation fails, times out, or
  produces a number we didn't supply, the endpoint returns `narrative:
  null` rather than a plausible-looking guess, and the report renders
  without that section.
- **Photo review is not an inspection.** It reports what's visible and
  what to ask about, never a diagnosis, and confidence is a coarse
  low/medium/high — never a percentage, which would imply more precision
  than a photo can support. An empty findings array is a valid, honest
  result.
- **Rate limits happen.** Both NYC Open Data and the Claude API can
  return 429s under load; the app surfaces this as `RATE_LIMITED` with a
  "try again in a moment" message, distinct from an actual outage
  (`UPSTREAM_DOWN`).

## Demo

See [docs/demo-script.md](docs/demo-script.md) for a word-for-word,
3-minute walkthrough with the exact addresses to type.
