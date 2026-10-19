# The Hunt panel — one screen

**Game Designer ruling, 2026-09-22.** This document specifies the *information
architecture*: what is on the screen, in what order, what it is called, and what
a player must understand in ten seconds. It does **not** specify the visual
craft — spacing, weight, the frame treatment, the icon set. That is the Art
Director's, per `.claude/agents/game-designer.md`. Where this document names a
CSS token it is naming the *semantic slot*, not a look.

Siblings: `docs/design/HUNTS_AND_ANALYZER.md` (the mechanic and every field's
source), `docs/design/BESTIARY_LADDER.md` (the ladder this panel links to).

---

## 0. The one-sentence design

**One screen, split above and below the fold: SET UP a hunt at the top, READ the
last one at the bottom — and the reading is always the server's last settled
numbers, with the time it settled printed next to them.**

There is no second screen, no modal stack, no wizard. A player who wants to
change a spawn and a player who wants to know whether last night was good are
looking at the same page, because they are the same question asked at different
hours.

---

## 1. The ten-second test

A new player opens the Hunt panel, having never read a word about it. In ten
seconds they must come away with:

1. **"My character is hunting Goblins right now."** — the spawn, named, with its
   art, at the top, in the largest type on the page.
2. **"I can change how careful it is."** — three labelled stance buttons, one
   visibly selected, no jargon.
3. **"It will stop when I told it to."** — the active stop rules as a short list
   in plain words: *"Stops after 8 hours, or if the bag fills."*
4. **"Last night made me money."** — one number, large, with a sign and a colour:
   **+14,200 gold/h**.

Everything else on the page is the evidence for line 4. If a player never scrolls
past it, they have still understood the feature.

What they must NOT have to understand in ten seconds: raw vs effective XP/h, what
Vigour is, or what `AMMO_DRY_MULT` means. Those are the second visit.

---

## 2. Layout

Desktop and landscape phone share one column order; phones are landscape-only
and get the scaled-desktop rail layout, never a bottom-nav
(`CLAUDE.md` §7). The breakpoint is the frozen set —
`@media (max-width: 540px), (max-height: 540px) and (max-width: 1024px)` — and
`tests/breakpoint-guard.mjs` owns it; this panel adds no new query.

```
┌─────────────────────────────────────────────────────────┐
│  🗡  GOBLIN                          ● hunting  3h 12m   │   A. THE HEADER
│      Humanoid · Tier 2                                   │
├─────────────────────────────────────────────────────────┤
│  STANCE    [ Careful ] [ Steady ] [ Reckless ]           │   B. THE SETUP
│  STOPS     after 8 hours · if the bag fills              │
│            [ change ]                                    │
├─────────────────────────────────────────────────────────┤
│  VIGOUR    ▓▓▓▓▓▓▓▓▓▓▓▓░░░░  512 / 720 min today         │   C. THE LIMITER
├─────────────────────────────────────────────────────────┤
│  PROFIT                            + 14,200 gold / h     │   D. THE VERDICT
│  ─────────────────────────────────────────────────────   │
│  XP / h            18,400        raw   21,900            │   E. THE EVIDENCE
│  Kills                3,114      per h   974             │
│  Loot (vendor)    41,200 g       Gold   9,800 g          │
│  Supplies        − 8,400 g       Deaths      2           │
│  Paid time        2h 41m         Idle   0h 31m           │
│  ─────────────────────────────────────────────────────   │
│  settled 14:32 UTC · 2 minutes ago                       │   F. THE HONESTY LINE
├─────────────────────────────────────────────────────────┤
│  BESTIARY   Goblin · Stalker ▮▮▯▯    8,120 to Slayer     │   G. THE LONG GAME
└─────────────────────────────────────────────────────────┘
```

### A. The header
Monster art, name in `--f-display`, class and tier beneath in `--ink-2`. The live
pill on the right uses `--green` when a hunt is running and `--ink-3` when idle;
the elapsed clock beside it is the only number on the page that moves between
settles, and it is a *clock*, not a game value, so it breaks no rule in
`CLAUDE.md` §6.

### B. The setup
Three stance buttons, reusing `.combat-style-buttons`' shape so the gesture is
one a player has already made on the combat screen. Selection is
`--gold` on `--gold-bg`; the rest sit on `--bg-2` with `--line`.

Under them, the stop rules **as a sentence, not a form**. Editing opens the
existing `.modal-card` with five rows. The sentence is the resting state because
the resting state is what a player reads at 11 p.m. before closing the tab, and
a form at that moment invites fiddling with something that was already right.

### C. The limiter
A single bar. `--accent` fill on `--bg-1`, `--red` on the portion spent past the
grant. The label is always absolute minutes ("512 / 720 min today"), never a
percentage — a percentage of an invisible budget is the kind of number players
learn to ignore.

When it runs out, the bar is full, turns `--red`, and the label becomes **"Tired
— hunts pay a quarter until 00:00 UTC."** One sentence, the consequence and the
reset time, no tooltip required. Slice 1 has no refill button here
(`HUNTS_AND_ANALYZER.md` §4.6).

### D. The verdict
**Profit per hour, alone, in the largest numeral on the page**, `--green` when
positive and `--red` when negative, with an explicit sign. This is the one line
the whole panel exists to deliver, so it gets the whole row and is not a cell in
the table below it.

Its subtitle, small, `--ink-3`: *"gold + vendor value of loot − food and
arrows."* Six words that stop it ever being mistaken for gold banked.

### E. The evidence
A two-column table on `--td-cell`, six rows, left column the headline figure and
right column its companion. The pairing is the design, not a space saving:

- **XP/h beside raw XP/h.** Effective is the honest one (it divides by elapsed);
  raw is what the spawn pays while you swing. The gap *is* the diagnosis — a big
  gap means deaths, dry ammo or refusals, and a player who sees it once
  understands their stance is wrong without anyone explaining stances.
- **Kills beside kills/h**, **loot beside gold**, **supplies beside deaths**,
  **paid time beside idle time**. Each pair is a total and its rate, or a cost
  and its cause.

Supplies is always shown with a leading minus in `--red`. A cost rendered as a
positive number is a cost players do not subtract.

### F. The honesty line
`settled HH:MM UTC · N minutes ago`, small, `--ink-3`, never omitted.

This line is a requirement, not decoration. Every number above it is the
server's last settled projection; nothing on this panel extrapolates forward
between settles, and a player who reloads twice within one window must see the
same numbers both times and understand why. That is the direct application of
Tyler's 2026-09-14 ruling — the browser never says one thing while the server
says another — to a screen whose whole content is rates.

### G. The long game
One row linking the Bestiary: the current trophy stage as four pips, and
`nextTrophyAt()`'s remaining count in words — **"8,120 to Slayer"**. It sits at
the bottom because it is the reason to come back tomorrow, not the reason to
look today, and a player reading the panel bottom-up finishes on a number that
grows.

---

## 3. The empty state

A player with no hunt running sees the same layout with the header pill idle and
sections D–F replaced by a single line:

> **No hunts yet.** Start one and this panel will tell you what it was worth.

Not a tutorial, not an arrow, not a modal. The panel is self-explanatory once
there is data in it, and an empty screen that explains itself in eleven words is
better than one that explains itself in a carousel.

A player whose hunt is running but has not settled a window yet sees D–F with
em-dashes and the honesty line reading **"nothing settled yet."** Zeroes would be
a claim; an em-dash is the truth.

---

## 4. Rules this panel obeys

- **No hardcoded colours.** Every colour above is a token from
  `src/styles/theme-cozy.css` (`CLAUDE.md` §7). `tests/css-literal-ratchet.mjs`
  is the enforcement; a new component is the cheapest possible place to be
  token-clean, because there is nothing to convert.
- **No new breakpoint.** The frozen set only, `tests/breakpoint-guard.mjs`.
- **Nothing is predicted.** Every game value is rendered from the server's
  projection and **replaced** by each envelope — never merged upward, never
  extrapolated. The elapsed clock in the header is the single exception and it
  is a wall clock, not a game value.
- **Nothing here gates a server capability.** The stance buttons, the stop
  editor and the Bestiary link read server-mirrored values with a fail-safe of
  "not unlocked" (`CLAUDE.md` §6, residue-ahead).
- **The visual gate applies** on the assembled set, desktop AND 922×423,
  screenshots read, per `CLAUDE.md` §3.3 lane B.

---

## 5. Player-facing pitch

The Hunt panel is one screen that answers one question: *was that a good night?*
Set your spawn, your stance and what should stop the hunt at the top; read what
the last one actually earned — profit an hour, XP an hour, what the loot sold
for and what the food cost — at the bottom. Every number is the server's, with
the time it was settled printed underneath, so what you read is what happened.

---

## 6. What the backend will need (names only)

Nothing beyond `HUNTS_AND_ANALYZER.md` §8. This panel renders
`hr_hunt_analyzer()`, `hr_vigour_of()` and `hr_bestiary_of()`, and sends
`set_activity`. It introduces **no** read of its own — a screen that needs a new
RPC to render is a screen that has grown a second model.

Client files it touches: `src/render/*` for the panel body (extract first, per
task #129), `src/net/client-state.js` **only** to confirm no analyzer field
enters `RESIDUE_FIELDS` — every number here is server-projected, and a rate in
the residue would be a stale rate rendered with confidence.

---

## 7. Open questions I decided

| Question | Decision | Why |
|---|---|---|
| One screen or a setup screen + a report screen? | **One.** | Same question at different hours; two screens means two places to look for a number. |
| Does the panel tick between settles? | **No.** The wall clock moves; no game value does. | A kill counter running ahead of the server is the phantom-seed bug with a different noun. |
| Lead with XP/h or profit/h? | **Profit/h.** | It is the number that decides whether to keep hunting here; XP/h is the number that decides *what* to hunt, and that decision happens on the monster card. |
| Show raw XP/h at all — is it clutter? | **Show it, paired.** | The gap between raw and effective is the diagnosis; hiding it leaves a player with a bad number and no cause. |
| Vigour as a percentage? | **Absolute minutes.** | A percentage of an invisible budget is a number players learn to ignore. |
| Zeroes or em-dashes before the first settle? | **Em-dashes**, plus "nothing settled yet". | A zero is a claim. |
| Stop rules as a form or a sentence? | **A sentence at rest**, a modal to edit. | The resting state is read at bedtime, and a form at that moment invites breaking something that was right. |
| Bestiary progress at the top or the bottom? | **Bottom.** | It is the reason to return tomorrow, not the reason to look today. |
