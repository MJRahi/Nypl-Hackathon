# Before You Sign NYC — 3-minute demo script

Word-for-word. Practice it once before the real thing — 3 minutes goes fast.

## Before you're on stage

- `npm run dev`, confirm `http://localhost:3000` loads.
- Confirm `.env.local` has `ANTHROPIC_API_KEY` set — the AI summary and photo
  review both need it live. If you don't have a key or the wifi is bad, skip
  to **"If something breaks"** at the bottom; the core report still works.
- Have 1–2 photos ready on the phone or laptop you're demoing from. A photo
  of any wall, ceiling corner, or under-sink cabinet works — the model finds
  what's actually in the frame, so don't stage anything. See **"On the photo
  moment"** below for what to expect.
- The three addresses below are pre-cached in `public/demo/` — the building
  report itself loads instantly with no network call, wifi or not.

## The three addresses

| # | Address | What it shows |
|---|---|---|
| 1 | **1510 Sheridan Avenue, Bronx** | Grade F, score 36 — the bad building |
| 2 | **310 East 70 Street, Manhattan** | Grade A, score 100 — the clean building |
| 3 | **627 Manhattan Avenue, Brooklyn** | Grade C, score 60 — the in-between building (backup, if time allows) |

You can either click the matching tile under "Or try a real building" on the
landing page (zero typing, zero risk), or type the address into the search
box and pick the top result. Both are demoed below — pick whichever fits
your setup.

---

## 0:00–0:20 — The hook

*(On the landing page.)*

> "You're about to sign a lease. The city already knows things about this
> building that you don't — every complaint, every violation, whether
> there's an open bedbug case. It's all public. It's just spread across
> seven different datasets that nobody's cross-referencing standing in a
> hallway five minutes before a viewing. Before You Sign does that lookup for
> you. Let's try a real one."

Type **1510 Sheridan Avenue, Bronx**, or click that tile.

## 0:20–1:00 — The bad building

*(Report loads. Point at the grade first.)*

> "Grade F, 36 out of 100. That's not a vibe, it's a formula — open class C
> violations, the city's 'immediately hazardous' tier, complaints in the
> last 24 months, weighted by unit count so a 12-unit building with the same
> raw numbers as a 400-unit building doesn't get treated the same. Scroll
> down —"

*(Scroll to categories.)*

> "— heat and hot water, plumbing, pests, structural: all flagged high. This
> building has thirty-nine plumbing complaints in the last two years alone.
> Every one of these numbers links back to the exact city dataset it came
> from, right here."

*(Point at "Check our work" / raw records section.)*

> "Nothing here is generated. It's arithmetic on public records."

## 1:00–1:20 — The AI summary

*(Scroll to "What this means.")*

> "Below that, an AI summary — but constrained hard. It's only allowed to
> interpret the numbers we already computed. It can't do math, it can't
> introduce a figure we didn't hand it — if it ever tries, we throw the
> whole summary away rather than show something invented. What it's good
> for is turning 'thirty-nine plumbing complaints' into 'ask what's still
> open and when it's scheduled to be fixed' — the checklist right here."

## 1:20–2:20 — The photo moment

*(Scroll to the photo upload section.)*

> "Now say you're actually standing in this apartment. You take a couple of
> photos while you're there —"

*(Upload the 1–2 prepared photos. Wait for analysis.)*

> "It's not diagnosing anything — you'll notice it never says 'this is
> mold' or 'this is a leak.' It says what's visible and what to ask about.
> But watch what happens when a photo lines up with what the city already
> has on file —"

*(Point at the highlighted finding, if one landed in a high-severity
category — plumbing, structural, heat/hot water, pests, or safety all
qualify on this building.)*

> "That's the moment. What you photographed in thirty seconds just got
> connected to what the city recorded over two years. That link — 'you
> spotted this, and here's what the record already says about it' — is the
> whole idea."

*(If no photo happens to land in a flagged category, that's fine —
say so, don't force it:)*

> "An empty or unrelated result here is still an honest one — we'd rather
> say nothing than guess wrong about someone's apartment."

## 2:20–2:45 — The share card

*(Scroll to or open the share card.)*

> "Nobody signs a lease alone. This is built to screenshot — address, grade,
> top concerns, the questions checklist — and send to whoever's helping you
> decide. Or just copy it as text."

*(Click "Copy summary.")*

> "That's it in your clipboard, ready to paste into a text thread."

## 2:45–3:00 — The contrast, and out

*(Navigate back, click 310 East 70 Street.)*

> "And for contrast — this one's a grade A, zero open violations, clean
> bedbug record. Same pipeline, same seven datasets, completely different
> story. That's Before You Sign: one address in, the public record out, in the
> time it takes to stand in a hallway."

---

## On the photo moment

The vision model is genuinely looking at your photo, so the exact finding
isn't scripted — that's the point, it's not a canned demo. On the Bronx
building (1510 Sheridan Avenue), heat/hot water, plumbing, pests,
structural, safety, and "other" are all flagged high-severity in the city
record, so almost any indoor photo (a wall, a ceiling, a radiator, a
cabinet) has a good chance of producing a highlighted finding. If you want
zero risk, take a screenshot of a successful run beforehand as a backup and
have it ready in another tab.

## If something breaks

- **No `ANTHROPIC_API_KEY` / no wifi:** skip the AI summary and photo
  sections. The graded report, category breakdown, timeline, and share card
  (address/grade/score/violation count) all work from the committed
  `public/demo/` fixtures with zero network calls. Say so plainly: "the
  report itself never depends on a live connection — the AI layer on top
  does."
- **`RATE_LIMITED` on the AI summary or photo review:** say "the city or the
  model is asking us to slow down for a second" and move on — it's a
  distinct, handled state, not a crash.
- **A photo upload times out:** fall back to "here's what the public record
  shows" — the panel that's already there when no photo has been uploaded.
  It's built to not read as a failure state.
