# COMBAT REWORK — TWO SCREENS: THE WAR TABLE and THE FIGHT

**Author:** Game Designer · **Date:** 2026-08-16 · **Status:** DESIGN ONLY. No `src/**` touched.
**Approval model:** per-card. `COMBAT-UI-01 … 21` and `FOLD-01 … 30`. Tyler approves by id.
**Reads on:** `src/features/combat-render.js`, `src/features/boss-of-the-day.js`,
`src/styles/combat-hud.css`, `src/styles/audit-overrides.css` §combat grid (l.488–612),
`src/legacy.js` `setupArenaVs()` (l.9045–9210) + `_renderCombatEmpty()` (l.11060) +
`MONSTER_ALIAS` (l.917), `src/data/monsters.js` (111 monsters), `src/data/monster-art.js`
(`LEGACY_ART_IDS`, 30), `src/data/bosses.js`, `src/dungeons.js`, `src/features/raids.js`,
`docs/design/live-settlement.md` §6, `docs/design/supply-projection.md`.

### The three rulings this spec is written against

> **1.** *"we should be simplifying the initial combat screen; where you choose what type of
> combat you want to do; and then it should be its own screen when you actually CHOOSE the
> monster you want to fight. instead of it being so cluttered into one page."*
>
> **2.** *"we are fitting so much less into the screen than the one i shared with you. ours
> looks like shit compared to that."*
>
> **3.** *"it looks like all of the old monsters are still in our monsters list? why???"*

Rulings 1 and 2 are **not** in tension, and reading them together is the whole design:

**The current screen is cluttered AND wasteful at the same time, and both come from the same
cause — it has no zones.** Three cards fight over one grid, so content is *disorganised*
(clutter) while whole regions carry nothing (waste: the `AWAITING A FOE` void is the largest
element on the screen and it is a placeholder). Melvor fits more and reads better because
its density is **ordered** — symmetric zones, tight aligned rows, every control carrying live
data, the monster as an unmissable visual anchor.

So: **split by JOB, then make each half dense.** Not sparse. Dead space is a defect and
padding is not polish.

---

## 0 · THE ARCHITECTURE

```
       ┌──────────────────────────────────────────────────────────┐
       │  THE WAR TABLE  — a MENU. Choose what kind of fight.     │
       │  Dense with browsable content: a whole tier of portrait  │
       │  cards at once, boss destinations, dungeons, bounties.   │
       │  No loadout. No stats walls. No arena.                   │
       └────────────────────────┬─────────────────────────────────┘
                    pick a foe  │  ▲  Back  (fight keeps running)
                                ▼  │
       ┌──────────────────────────────────────────────────────────┐
       │  THE FIGHT  — a STAGE. One foe, full attention.          │
       │  Center-stage art on a painted biome, symmetric frames,  │
       │  in-bar HP numerics, swing timers, data-rich action bar, │
       │  live metrics strip, loadout quick-swap, combat log.     │
       └──────────────────────────────────────────────────────────┘
```

**Navigation contract (idle-game law):**

- **Leaving The Fight never stops the fight.** The activity pointer is server state; a screen
  is a camera. Back returns to the War Table with the fight live.
- **When a fight is live, the War Table carries a persistent RETURN RIBBON at the top** —
  foe portrait, both HP bars, kill count this session, `[ Return to the fight ]`. It is the
  hub's most prominent row and it means you can browse without anxiety.
- **The sidebar `Combat` nav opens THE FIGHT if a fight is live, otherwise the WAR TABLE.**
  Recommended, and I'll defend it: an idle player taps Combat to *check on* something running
  far more often than to start something new. One tap back to the hub is cheap; one tap into a
  menu when you wanted your fight is a wrong-screen every session. (`COMBAT-UI-01`.)
- **Combat style (Accurate/Aggressive/Defensive/Ranged) lives on THE FIGHT**, beside the
  player frame. Tyler's instinct is right — it is a fight decision, not a browsing decision,
  it changes mid-fight, and it belongs next to the fighter it re-tunes. It leaves the hub
  entirely. (This also retires the ribbon whose `csb-meta` needed a whole `order:3` rule in
  `combat-hud.css` §5b to stop it running 270px tall on a narrow window.)

### What each of Tyler's clutter complaints is answered by

| complaint | answered by |
|---|---|
| *"monsters list cramped"* | the list **is** the War Table now — the whole screen, a 6-to-9-wide portrait grid, a full tier visible without scrolling. It goes from a 280px sliver to ~1600px |
| *"equipment needs scrolling"* | the paper doll leaves combat entirely. The Fight gets a **quick-swap strip** (6 slot chips, live stat totals); the full doll lives on Character where it already fits |
| *"combat area cut in half"* | The Fight is a whole screen. No monster column, no loadout column. The stage is the page |
| *"weekly boss oversized"* | the boss cards become **destinations on the War Table** — where a destination is supposed to be big — instead of banners squatting on a battlefield |
| *"we fit so much less than Melvor"* | §3 sets an explicit information budget per screen and §2 benchmarks element-by-element against the reference |

---

## 1 · SIDE-BY-SIDE AGAINST THE REFERENCE

Tyler is benchmarking directly against that screenshot, so this answers it directly.

| Melvor 2 element | Ours **today** | Ours **designed** |
|---|---|---|
| Monster as large center-stage art, ~40% of screen height | 96px portrait in a 3-column grid; when idle, a placeholder reading **AWAITING A FOE** occupies the largest region on the page | **Hero plate**, `min(42vh, 340px)`, the wave-1 256px painterly portrait at native resolution, b357 square mask. No idle state exists — you only reach this screen by choosing a foe |
| Illustrated biome backdrop | one shared `dungeon.jpg` under a heavy scrim; every fight in the game happens in the same dark corridor | **11 class biomes** (§5), painterly, dark-friendly, tier-tinted. A Dragon fight looks like a Dragon fight |
| Symmetric combatant framing | asymmetric ad-hoc: a `VS` divider between two 96px busts and two stacked text lines | **same five-row grammar both sides** (name · level · HP+numerics · swing bar · action), foe at ~2× the art weight |
| Wide HP bar with `x/y` inside | 12–14px bar with the numerals on a **separate line below it** | numerals **inside** a 20px bar, tabular, both sides. One element instead of two |
| Attack-timer bar under the HP bar (`3.50s Normal Attack`) | **nothing.** Damage simply appears every 2.4s | swing bar both sides, driven by `combatTickMs()` — *the same value `combat-sim.js` divides the span by*. Labelled with the **weapon** (`Longsword · 2.4s`), which makes weapon speed a visible stat for the first time |
| Collapsible stats card — Offensive / Evasion / Resistances, `View All Stats` | a **Stats modal** (b227) — good, but zero stats on the stage itself | a **6-tile stat block per fighter, always on** (§3.2): hit chance, max hit, DPS. Deep rows stay in the modal. We match Melvor's *at-a-glance* count without its wall |
| Floating damage numbers on the monster | exists (b297), foe only | kept, plus a **`▾N` flash inside the player's own HP bar** — your damage on your bar, theirs on theirs |
| Slayer Task card with `0/81` + `Jump To Enemy` | **nothing on the combat screen.** Bounties live elsewhere entirely | bounty targets are a **destination row on the War Table** with live `7/12` counters and Jump |
| Loadout quick-swap at the top of the player column | a 320–340px paper-doll column that scrolls | **44px quick-swap strip**: 6 slot chips + `+12 atk · +34 def`, weapon chip shows swing time |
| Action bar: Eat (food icon + `+181 HP`), Pause, Run, Monster Drops, Loot History | Eat with name + heal + count (**good, ours is already better than theirs — it's beside the bar it affects**); Loot + Stats chips; **Flee is hidden outright** by `audit-overrides.css` l.585; no loot history | full bar: `[🐟 Eat Cooked Trout +14 HP · 84] [Flee] · [Loot] [Stats] [History ●3]`. Eat gains the food icon; **Flee restored**; History is new and **collection-log aware** |
| Metrics strip: XP/hr, gold/hr, dmg/s, time-to-depletion | four unqualified hourly rates buried in a modal | **one sentence, always on**: `41 XP/min · 128 gold/min · you last 3h 20m on 84 Cooked Trout` — b341-honest, refuses to quote a rate you can't survive |
| Pause Fight | — | **deliberately not built.** We are server-authoritative: the pointer is set or idle. A third state would lie |
| Four currency tickers, double icon rails, 12+ evasion rows per side | — | **not taken.** §4 |

**Read that table as the density answer.** We are not adding fewer elements than Melvor —
we add the swing bars, the stat tiles, the metrics strip, the loot history, the biome art,
and the bounty counters they have, and we *remove* the placeholder void, the paper-doll
column and the duplicated monster list that are eating our screen today.

---

## 2 · THE WAR TABLE (screen 1)

**Job:** answer *"what am I going to fight?"* — completely, in one screen, without scrolling
for the common case.

**Density target: a full tier of monsters visible at once.** Tier 4 has 21 monsters, the
largest tier. At 1900px with the rail, ~1600px of content: a 160px portrait card grid runs
**9 across**, so 21 monsters is **3 rows**. Every tier fits above the fold. *A menu that
shows three items on a 1900px screen is a failure* — so the card is sized from the roster,
not the roster from the card.

### 2.1 Desktop wireframe (1900×1000)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ⚔ FIGHTING  Ancient Bear   ▓▓▓▓▓▓░░ 212/340   you ▓▓▓▓▓▓▓▓░ 74/100   ×47 kills       │ 52
│                                                              [ RETURN TO THE FIGHT ] │  ← only when live
├──────────────────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐         │
│  │ BOSS OF DAY  ⏱6h│ │ WEEKLY BOSS 4d │ │ DUNGEON        │ │ BOUNTY   7/12  │        │
│  │ ┌────┐          │ │ ┌────┐         │ │ ┌────┐         │ │ ┌────┐         │        │  DESTINATIONS
│  │ │ 🐻 │ Ancient  │ │ │ 🐉 │Crownless│ │ │ 🏛 │ Barrow  │ │ │ 🐺 │ Slay 12 │        │  ~150px
│  │ └────┘ Bear     │ │ └────┘ Wyrm    │ │ └────┘ Deep    │ │ └────┘ Direwolf│        │
│  │ +25% drops/XP   │ │ clan · 0/1     │ │ 5 floors · Lv40│ │ 1,200g · 3d    │        │
│  │        [FIGHT ▸]│ │        [ENTER ▸]│ │       [ENTER ▸]│ │        [JUMP ▸]│        │
│  └────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘         │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ MONSTERS   [T1][T2][T3]●[T4][T5][T6]     class: [all][Mammal][Undead][Dragon]…       │ 40
│ ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐             │
│ │ ART  ││ ART  ││ ART  ││ ART  ││ ART  ││ ART  ││ ART  ││ ART  ││ ART  │             │
│ │ 128  ││      ││      ││      ││      ││      ││      ││      ││      │  160px card │
│ │      ││      ││      ││      ││      ││      ││      ││      ││      │  ×9 across  │
│ ├──────┤├──────┤├──────┤├──────┤├──────┤├──────┤├──────┤├──────┤├──────┤             │
│ │Plague││Giant ││ Bear ││Winter││Carniv││Goblin││Mtn   ││ Ogre ││Minot.│  name       │
│ │Swarm ││Spider││      ││ Wolf ││Plant ││Warlrd││Troll ││      ││      │             │
│ │🔨 620││🗡 480││🔨 700││🏹 540││🔥 460││🗡 900││🔨1100││🔨 850││🗡 780│  weak+HP    │
│ │ ×12  ││  —   ││ ×204 ││  —   ││ ×3   ││ ×31  ││  —   ││  —   ││ NEW  │  your kills │
│ └──────┘└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘             │
│ ┌──────┐┌──────┐ … 21 monsters, 3 rows, no scroll …                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 The monster card — the browsing unit

160×210px. Everything on it is a **decision input**, nothing is decoration:

- **128px portrait** — the browsing art. This is what the 104 wave-1 portraits are *for*.
- **Name.**
- **Weakness glyph + HP.** `🔨 700` — the two numbers you compare between foes, in a fixed
  position on every card so the grid scans straight down.
- **Your kill count** — `×204`, or `NEW` in gilt if you have never killed one. This is the
  cheapest possible collection-log hook and it makes the grid *yours* rather than a catalogue.
- **Locked state:** greyed plate + `Lv 45` instead of the kill count. Locked monsters stay
  **visible** — a menu that hides its own future is a menu with no pull.
- **Hover/focus:** the card lifts and reveals a two-line drop summary (`Bear Pelt 22% ·
  Great Fang 4%`). Click → The Fight's **preview** state (§3.4), never straight into combat
  (b342's rule: the fast path must not skip the one honest screen).

### 2.3 The destination row — every combat entry point, unified

Surveyed from the codebase, these are the ways a player enters combat today, and where they
live: monster tiers (`#panel-combat`), Boss of the Day + Weekly (`boss-of-the-day.js`, cards
injected above the picker), dungeons (`src/dungeons.js`, reached from Adventure),
clan raids (`src/features/raids.js`, reached from the clan screen), bounties
(`src/core/bounty.js`, reached from the board), world events (`world-events.js`).

**They have never had one front door.** The War Table is it. Each destination is a
~150px card with a live counter and a verb: Fight / Enter / Jump / Join. A destination with
nothing live shows its timer (`new boss in 6h 12m`), never disappears — an empty slot in a
menu teaches the rotation.

Recommended order, left to right, by urgency-of-expiry: **Bounty → Boss of the Day → Weekly
Boss → Dungeon → Raid → World Event.** Bounties expire soonest and are the daily driver.

### 2.4 War Table on mobile-landscape (922×423)

```
┌────────────────────────────────────────────────────────────┐
│ ⚔ Ancient Bear ▓▓▓▓░ 212/340  ×47        [ RETURN ]        │ 40  (only when live)
├────────────────────────────────────────────────────────────┤
│ [BOSS 🐻 Ancient Bear ⏱6h] [WEEKLY 🐉 0/1] [BOUNTY 7/12] ▸ │ 66  horizontal scroll
├────────────────────────────────────────────────────────────┤
│ [T1][T2][T3]●[T4][T5][T6]                                  │ 30
│ ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐           │
│ │ART ││ART ││ART ││ART ││ART ││ART ││ART ││ART │  104px    │ 2 rows visible,
│ │Bear││Wolf││Plnt││Wrld││Trol││Ogre││Mino││Adpt│  card     │ 3rd peeks → scroll
│ │🔨700││🏹540││🔥460││🗡900││🔨1100││🔨850││🗡780││🗡520│           │ affordance
│ └────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘           │
└────────────────────────────────────────────────────────────┘
```

104px cards, **8 across, 2 full rows visible** (16 of 21) with the third row deliberately
peeking so the scroll is discoverable. Destinations become a horizontal chip rail. The card
drops the drop-summary hover (no hover on touch) — that content is in the preview.

---

## 3 · THE FIGHT (screen 2)

**Job:** *who am I fighting, who is winning, what do I press* — in five seconds — and then
reward a long look with real depth.

### 3.1 Desktop wireframe (1900×1000)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ◀ War Table    ANCIENT BEAR · Mammal · Tier 4     [⚔][🛡][🪖][🧥][👖][💍] +12atk +34def│ 44
├──────────────────────────────────────────────────────────────────────────────────────┤
│                    ░░░ PAINTED BIOME — MAMMAL / DEEP WOOD ░░░                        │
│  ┌──────────┐                                            ┌──────────────────┐        │
│  │          │                                            │                  │        │
│  │   YOU    │ 170px                                      │    ANCIENT BEAR  │ 340px  │
│  │          │                                            │      (plate)     │        │
│  └──────────┘                          VS                └──────────────────┘        │
│  TYLER · Lv 63                                            ANCIENT BEAR · Lv 58       │  ~400
│  ▓▓▓▓▓▓▓▓░░  74 / 100          ▾8                         ▓▓▓▓▓▓▓░░░  212 / 340      │
│  ▓▓▓▓▓░░░░░  Longsword · 2.4s                             ▓▓▓▓▓▓▓▓░░  Maul · 3.0s    │
│  ┌────────┬────────┬────────┐                            ┌────────┬────────┬───────┐ │
│  │HIT  82%│MAX   19│DPS  7.9│                            │HIT  41%│MAX   24│HP  340│ │
│  └────────┴────────┴────────┘                            └────────┴────────┴───────┘ │
│  STYLE  ◉Accurate ○Aggressive ○Defensive ○Ranged           weak to 🔨 hammer          │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ [🐟 Eat Cooked Trout  +14 HP · 84]  [ Flee ]        [Loot] [Stats] [History ●3]      │ 54
├──────────────────────────────────────────────────────────────────────────────────────┤
│ 41 XP/min · 128 gold/min · 3.4 dmg/s · you last 3h 20m on 84 Cooked Trout            │ 28
├──────────────────────────────────────────────────────────────────────────────────────┤
│ 14:32  You hit Ancient Bear for 17                          Bear Pelt ×1  Great Fang │
│ 14:29  Ancient Bear hits you for 9                                                   │ rest
│ 14:27  Ancient Bear defeated · +180 XP · 47 gold             ← loot rail, right edge  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Information count on this screen:** 2 portraits, 2 names, 2 levels, 2 HP bars with
numerics, 2 swing bars with weapon names, 6 stat tiles, 1 weakness, 4 style options, 6 gear
slots + 2 stat totals, 5 controls (3 carrying live data), 4 metrics, a scrolling log, a
loot rail. **That is at or above Melvor's count**, in tight aligned rows, on a painted
stage — and it is one screen instead of one third of one.

### 3.2 The six stat tiles — the "collapsible stats card" steal, made ours

Melvor shows 12+ rows per side, always. We show **three per side, always**, and they are the
three that change a decision:

- **Yours:** HIT % · MAX HIT · DPS
- **Theirs:** HIT % (against you) · MAX HIT (the worst blow you can take) · HP

Every one of these is already computed by `forecast()` in `combat-render.js` — the tiles are
a **render** of numbers the Stats modal is producing today. Evasion ratings, resistance
tables, per-style accuracy breakdowns, matchup multipliers and the away projection stay in
that modal. Depth is one click away, exactly as briefed.

### 3.3 The action bar — every control carries live data

That is the Melvor lesson Tyler named, and it generalises:

| control | the data it carries |
|---|---|
| **Eat** | food icon · food name · `+14 HP` heal preview · `84` remaining. Already better than Melvor's; it only lacks the icon |
| **Flee** | currently **hidden by CSS**. Restored. Carries `— ends the fight` on hover, no data needed |
| **Loot** | badge with the drop count for this foe |
| **Stats** | — |
| **History** | `●3` — items gained this session, gilt ring if any is a first-ever |
| **Auto-eat chip** (when owned) | already exists (b267), keeps its `Auto-eat: Cooked Trout ▾` |

Only **Eat** is bright. That is the existing button ladder and this rework does not touch it.

### 3.4 The PREVIEW state — the honest screen, upgraded

Clicking a War Table card opens The Fight in **preview**: the exact same layout, the foe
plate already painted, the biome already up, both stat tile rows filled with the projection —
but the HP bars are full, the swing bars are still, and the action bar's primary reads
**`[ FIGHT ▸ ]`** instead of Eat.

This replaces the b342 forecast modal with something strictly better: instead of a modal
interrupting a decision, **the decision screen is the fight screen with the fight not
started.** You see the actual arena you are committing to. Pressing Fight starts the swing
bars moving on a screen that has not moved a pixel. That transition — a still stage coming
alive — is the best two frames in the whole game and it costs nothing.

It also permanently kills `_renderCombatEmpty()` and the **AWAITING A FOE** void. There is
no idle state on this screen, because you cannot arrive here without a foe.

### 3.5 The Fight on mobile-landscape (922×423)

~360px of content after rail and safe areas. Everything must earn it.

```
┌────────────────────────────────────────────────────────────┐
│ ◀  ANCIENT BEAR T4   [⚔][🛡][🪖][🧥][👖][💍] +12/+34        │ 32
├────────────────────────────────────────────────────────────┤
│ ░░ BIOME ░░                                                │
│ ┌────┐                              ┌──────────┐           │
│ │YOU │ 80                           │  ANCIENT │  170px    │
│ └────┘                              │   BEAR   │           │
│ Lv63                          VS    └──────────┘           │ 200
│ ▓▓▓▓▓▓░░ 74/100                     Lv58                   │
│ ▓▓▓▓░░░░ 2.4s                       ▓▓▓▓▓▓░ 212/340        │
│ 82% · 19 · 7.9dps                   41% · 24 · 340hp       │ ← tiles → one row
│ ◉Acc ○Agg ○Def ○Rng                 🔨 hammer              │
├────────────────────────────────────────────────────────────┤
│ [🐟 Eat +14 · 84]  [Flee]      [Loot][Stats][Hist ●3]      │ 48
├────────────────────────────────────────────────────────────┤
│ 41 XP/min · lasts 3h 20m                                   │ 24
└────────────────────────────────────────────────────────────┘   log below the fold
```

What collapses, and only this:
- Stat **tiles become one dot-separated row** per side — same six numbers, no boxes.
- Style buttons lose their `small` sub-labels (finishing the job `combat-hud.css` §5b started
  by punting `.csb-meta` to `order:3`).
- Plates 340→170 and 170→80. The foe is still the largest thing on screen.
- Metrics strip drops to **two clauses** — rate and runway. Never dropped: it matters *more*
  on a phone, where the session is short and the away run is long.
- **Combat log goes below the fold.** It is watched, not acted on — b227's own rule sends it
  there. Everything actionable is above the fold at 423px.
- **Nothing else.** No hidden Eat, no hidden Flee, no sub-tab that can produce a blank screen
  (the b230 / b334 traps die with the two-screen split, because the Fight has no sub-tabs).

---

## 4 · THE LEAVE LIST

| Melvor shows | we don't | where the depth lives |
|---|---|---|
| 12+ evasion / accuracy / resistance rows per combatant, always | 3 tiles per side | **Stats modal** (b227, exists, live-refreshing, reads the engine's own rolls) |
| `View All Stats` expander under an already-expanded card | no expander on the stage | a modal or nothing. An expander is a layout that moves under a fighting player |
| Four currency tickers | gold in the shell header, once | unchanged |
| Prayer-point drain math in the footer | no resource ledger on a fighting screen | the metrics strip covers *what runs out* |
| Double icon rails (gear + potions, both always on) | **one** 44px quick-swap strip | consumables are the Eat button; that is the only one that matters mid-fight |
| Pause Fight | never | server-authoritative: set or idle. A pause state would lie |
| Per-monster biome backdrops (111 scenes) | **11 class biomes**, tier-tinted | §5 — an asset budget decision, not a taste one |
| A monster list on the combat screen | it's a whole screen now | the War Table |

---

## 5 · BACKDROPS — the single biggest "reads as a game" lever

Melvor's illustrated biome is a large part of why theirs reads as a **game** and ours reads
as a **form**. Ours today is one `dungeon.jpg` under a scrim so heavy it is functionally
black, behind every fight in the game.

**Recommendation: eleven backdrops, keyed to the eleven monster classes** — the taxonomy is
already the identity carrier (`cls` is a live field on all 111 monsters), so this is a data
lookup with no new schema, and eleven is a number a player learns.

| class | scene |
|---|---|
| Mammal | deep wood, low mist, shafts of light through pine |
| Vermin | a rotting granary interior, grain sacks, rafters |
| Plant | overgrown ruin, roots through flagstones, green gloom |
| Humanoid | a war camp at dusk — palisade, cook-fires, banners |
| Human | a stone hall, tall windows, hanging tapestries |
| Undead | a barrow field under a low moon, leaning stones |
| Demon | a cracked basalt plain, ember light from below |
| Dragon | a high cliff ledge above cloud, bones in the scree |
| Elemental | a shattered elemental node — floating stone, charged air |
| Construct | a workshop floor, chains, half-built forms, forge glow |
| Extra Dimensional | a starfield through a torn arch, no horizon |

**Spec, so they're usable:** 1920×1080, **painterly, dark-theme-first**, all detail in the
outer thirds and a **deliberately quiet center-and-lower-center** so the plates and bars
read without needing a black scrim over the whole image. Current scrim drops from ~72% to
**~35% edge / ~12% center** — that alone recovers the art we already paid for. Tier is a
**token tint** on top (T1 warm/green → T6 cold/violet), not eleven more files.

Tyler generates these in his web-UI sessions on subscription credits, so cost is not the
blocker — the blocker is the composition spec above, which is why it's written out.
Dungeons and raids override with their own scene where one exists. Ships as
`COMBAT-UI-14`, and Phase 1 can land with **one** new backdrop to prove the composition
before the other ten are generated.

---

## 6 · THE SETTLEMENT CONTRACT

`live-settlement.md` §6 is law; this is its UI half and adds nothing to it.

| event | the screen does |
|---|---|
| **HP corrects at a settle** (envelope `hp`/`max_hp` are absolute in both phases) | the bar **jumps to truth in one frame. No tween, no rollback animation.** §6: *"HP must be honest instantly, because a player fighting on a health bar that lies will die and blame the server"*. A 200ms ease on a downward HP correction **is** that lie |
| HP corrects upward | also instant. Asymmetric HP animation is a tell |
| foe HP corrects | instant — **and the foe's swing bar resets to phase 0.** A swing bar that survives a reconcile is animating a swing that did not happen |
| any other number corrects **down** (XP, gold, a predicted drop the server didn't roll) | **never rolls down inside an animation.** Reconcile silently at the next natural boundary — a kill, a screen change, a return from the War Table. §6's recommended feel rule, adopted |
| any number corrects **up** | immediately, normal gain treatment |
| **client predicted death, server survived** | §6 flags this *"jarring; Designer owns it."* **Ruling: remove death prediction from the client tick**, as §6 recommends — the client already renders a server-declared death correctly (`legacy.js:3217`). Until then the stage must not play a death stamp for the **player**, only the foe |
| **server died, client alive** | receipt carries `died:true` → the stage goes to a **fallen state**: plate desaturates, action bar's primary becomes `[ Return ]`, metrics strip becomes the post-mortem (`you lasted 42m · 71 kills · 3,400 XP`). This is a good moment, not a toast |
| **fight longer than the settle cadence** (§P3 — a 520 HP dragon takes ~20 min/kill and pays **zero** at every cadence) | **the metrics strip must not quote a rate for any target whose time-to-kill exceeds the cadence.** It prints `long fight — pays on the kill`. Design will not advertise a number the server pays as zero. **Hard gate on shipping the strip**; raised to Systems in `CONFLICTS.md` |

The in-bar `▾N` damage flash is prediction-only decoration and is suppressed for one tick
after any correction, so a corrected bar never carries a delta that doesn't match the jump.

---

## 7 · THE FOLD AUDIT — *"why are all the old monsters still there?"*

**The honest answer, first:** they're still there because they were *folded*, not replaced —
`MONSTER_ALIAS` (`legacy.js:917`) ships deliberately **empty** so the rename layer exists
before the first rename, and live progress (kill counts, bounty targets, drop history) ties
to those 30 ids. They *read* as leftovers for two reasons, and only one is a design problem:

1. **The art.** All 30 still use the retired `painted/` direction (`LEGACY_ART_IDS`), while
   new monsters land in `hearthfire/`. The bestiary is a visibly mixed shelf. **The legacy-30
   reshoot pack is already being prepared separately — every KEEP below gets a new face
   regardless of this audit.** That fixes most of the "leftover" feeling on its own.
2. **Three genuine duplicate pairs** where the fold put two monsters a player cannot tell
   apart into the same tier and the same role. That's real, and it's fixed below.

**The bias:** a tier must not carry two monsters a player can't distinguish *by role*. A
merge is free — `MONSTER_ALIAS` preserves kill counts, bounty targets and drop history.

### 7.1 The 30 legacy monsters

`FOLD-01…30`. Every row is reshoot-list (`RESHOOT: yes`) unless it merges away.

| id | Fold id | T | Now | Verdict | Reason |
|---|---|---|---|---|---|
| **FOLD-01** | `slime` | 1 | Slime | **KEEP** | the tutorial monster and the first fight in the game. Untouchable |
| **FOLD-02** | `rat` "Field Rat" | 1 | Vermin | **KEEP + absorbs `barn_rat`** | see FOLD-31. Rename display → **Giant Rat** (familiar-fantasy standard; "Field" was only ever there to disambiguate from Barn) |
| **FOLD-03** | `small_wolf` "Small Wolf" | 1 | Mammal | **KEEP, rename → Wolf Cub** | it is the T1 mammal and the head of a clean canine ladder. "Small X" reads as a dev label; "Cub" reads as a creature |
| **FOLD-04** | `goblin` | 1 | Humanoid | **KEEP** | anchors the best ladder in the game: goblin → hobgoblin → brute → warlord → war_king. Five tiers, one silhouette evolving |
| **FOLD-05** | `weak_skeleton` "Weak Skeleton" | 1 | Undead | **KEEP, rename → Brittle Skeleton** | same problem as FOLD-03. "Weak" is a stat; "Brittle" is a description a player reads as *fragile* without being told it's the tutorial version |
| **FOLD-06** | `giant_bat` | 2 | Vermin | **KEEP** | only flier below T4; distinct role (fast, low HP) |
| **FOLD-07** | `wolf` | 2 | Mammal | **KEEP + absorbs `jackal`** | see FOLD-32 |
| **FOLD-08** | `hobgoblin` | 2 | Humanoid | **KEEP** | rung 2 of the goblin ladder |
| **FOLD-09** | `dark_wizard` | 2 | Human | **KEEP + absorbs `cultist`** | see FOLD-33. Head of the caster line: dark_wizard → warlock → conjurer → archmage → necromancer |
| **FOLD-10** | `skeleton` | 2 | Undead | **KEEP** | rung 2 of the undead ladder |
| **FOLD-11** | `venom_spider` | 3 | Vermin | **KEEP** | heads the spider ladder into `giant_spider` (T4) and `broodmother` (T6); carries the poison axis |
| **FOLD-12** | `dire_wolf` | 3 | Mammal | **KEEP** | T3 canine; the ladder's midpoint and a bounty staple |
| **FOLD-13** | `goblin_brute` | 3 | Humanoid | **KEEP** | rung 3 |
| **FOLD-14** | `warlock` | 3 | Human | **KEEP** | rung 2 of the caster line |
| **FOLD-15** | `zombie` | 3 | Undead | **KEEP, differentiate** | shares T3 Undead with `ghoul` and today they are indistinguishable. **Ruling: zombie = slow, very high HP, low damage; ghoul = fast swing, low HP, high damage.** That is a real choice (do you want a punching bag or a race?) and it costs two data fields. Copy follows: *"shambles — it will outlast you before it hurts you"* |
| **FOLD-16** | `plague_swarm` | 4 | Vermin | **KEEP** | the T4 swarm; distinct from single-target vermin |
| **FOLD-17** | `goblin_warlord` | 4 | Humanoid | **KEEP** | rung 4 |
| **FOLD-18** | `bear` | 4 | Mammal | **KEEP** | ⚠ note: `painted/monsters/bear.png` **is a wild boar** (`monster-art.js` defect 1). The reshoot fixes it; flagged so it isn't re-shipped |
| **FOLD-19** | `wraith` | 4 | Undead | **KEEP** | the incorporeal identity, distinct from every skeletal/rotting undead |
| **FOLD-20** | `lesser_demon` "Lesser Demon" | 4 | Demon | **KEEP, rename → Horned Demon** | "Lesser" is the same dev-label tell as FOLD-03/05, and it is the *only* demon at its tier so it isn't lesser than anything on screen |
| **FOLD-21** | `panther` "Night Panther" | 5 | Mammal | **KEEP** | ambusher identity; the T5 mammal that isn't a bulk creature |
| **FOLD-22** | `warband_captain` | 5 | Humanoid | **KEEP** | the goblin ladder's officer tier; distinct from T5 `bandit_lord` (Human class, different weakness) |
| **FOLD-23** | `archmage` | 5 | Human | **KEEP** | rung 4 of the caster line |
| **FOLD-24** | `death_knight` | 5 | Undead | **KEEP** | best-loved silhouette in the roster; anchors T5 undead |
| **FOLD-25** | `shadow_creeper` | 5 | Extra Dim. | **KEEP** | one of only two T5 extradimensionals; carries the class into the tier |
| **FOLD-26** | `ancient_bear` | 6 | Mammal | **KEEP** | the Boss-of-the-Day workhorse; sits fine beside `elk_king` (apex predator vs apex herbivore — different silhouette, different weakness) |
| **FOLD-27** | `war_king` | 6 | Humanoid | **KEEP** | the payoff of the five-tier goblin ladder. Deleting it would break the best progression story we have |
| **FOLD-28** | `lich` "Ancient Lich" | 6 | Undead | **KEEP** | T6 caster-undead; distinct from `necromancer` (Human) and `revenant` (melee undead) |
| **FOLD-29** | `dragon` "Green Dragon" | 6 | Dragon | **KEEP** | ⚠ `painted/monsters/dragon.png` **is a vampire bust** (`monster-art.js` defect 1). Reshoot fixes; flagged |
| **FOLD-30** | `void_parasite` | 6 | Extra Dim. | **KEEP** | the class's T6 anchor |

### 7.2 The three merges (new-wave ids folding INTO legacy ids)

Each is one `MONSTER_ALIAS` line. Kill counts, bounty targets and drop history survive.

| id | Merge | Reason |
|---|---|---|
| **FOLD-31** | `barn_rat` → `rat` | **Tyler's poster child.** Two rats, Tier 1, Vermin class, same weakness, same role, adjacent rows. There is no reading of the game in which a player chooses between them. The legacy id wins because it carries the kill counts; the display name becomes **Giant Rat** |
| **FOLD-32** | `jackal` → `wolf` | Tier 2 Mammal pack canine, ×2. The canine ladder is already five rungs (cub → wolf → dire → winter → and `hellhound` in Demon); it does not need two animals on rung two |
| **FOLD-33** | `cultist` → `dark_wizard` | Tier 2 Human robed caster, ×2, both magic-styled. The Human class carries **eleven** casters across six tiers — the most over-populated role in the roster. This is the one place the redundancy is obvious enough to fix by merge; the rest is a differentiation problem, below |

### 7.3 Adjacent findings — outside the 30, flagged not merged

Not in the brief's scope, so **recommendations only**, each its own future card:

- **Tier 4 carries four humanoids** — `goblin_warlord`, `mountain_troll`, `ogre`, `minotaur`.
  Ogre and Mountain Troll are the same fight (big, slow, club, hammer-weak). Recommend
  `ogre` → `mountain_troll` at a future pass.
- **`adept` (T4 Human) and `conjurer` (T4 Human)** are the same robed caster one tier up from
  FOLD-33's pair. Recommend `adept` → `conjurer`.
- **The Human class needs a non-caster spine**, not more merges: `cutpurse` → `deserter` →
  `bandit_lord` exists but is thin. Adding two rungs is cheaper than deleting casters.

Net effect of §7: **111 → 108 monsters, 3 renames, 1 differentiation, 0 lost player progress,
and 30 new faces from the reshoot.** The tier lists stop reading as leftovers because the
duplicates are gone and the art is one direction.

---

## 8 · PHASES

The two-screen split **is** Phase 1. It answers the clutter complaint structurally, not by
squeezing, and every later card lands more cheaply into it.

### Phase 1 — **THE SPLIT** · L · render + routing + CSS; no engine
- `#panel-combat` becomes two views under one panel (`data-combat-view="table"|"fight"`).
  The three-card grid dies.
- **War Table:** destination row (daily/weekly/dungeon/bounty as cards), tier chips + class
  filter, 160px portrait card grid, return ribbon when live.
- **The Fight:** hero plates, in-bar HP numerics, stat tiles, quick-swap gear strip, style
  selector, action bar with **Flee restored** and the food icon on Eat, combat log with a
  loot rail.
- Preview state replaces the b342 forecast modal and `_renderCombatEmpty`.
- Nav rule: Combat → live fight if running, else War Table.
- Mobile-landscape for both screens (§2.4, §3.5).
- **Ships without:** swing bars, metrics strip, loot history, new backdrops (one shared
  backdrop at the corrected scrim opacity).
- **Gate:** the release visual gate — assembled main, desktop + 922×423, screenshots read.

### Phase 2 — **THE FACE** · M · art + data
- The 11 class backdrops (§5) + tier tint. Land one first to prove the composition.
- The legacy-30 reshoot wired through `monster-art.js` `SHIPPED` (one line each).
- The §7 folds: 3 `MONSTER_ALIAS` lines, 3 renames, the zombie/ghoul differentiation.
- Loot History, collection-log aware, `NEW` on first-ever drop.

### Phase 3 — **THE SWING** · M · needs one engine seam
- Swing-phase timer bars, both fighters, off `combatTickMs()`. **Requires the tick loop to
  publish `{ phase01, tickMs }`. Must not introduce a second clock** — a bar out of phase
  with the damage is worse than no bar.
- In-bar `▾N` damage flash.
- Settlement contract §6 wired: instant HP jumps, swing reset on correction, death-prediction
  removal.

### Phase 4 — **THE PROJECTION** · L · blocked on settlement
- The metrics strip, honest across settles, **with the long-fight refusal**.
- **Blocked** until in-flight monster HP is server state (`live-settlement.md` §P3).
- Ammo / food depletion seams land here with `supply-projection.md`.

---

## 9 · APPROVABLE CARDS

Grouped so hub and fight screen can be approved separately, as briefed.

### A · Architecture

| id | What | Ph | Sz |
|---|---|---|---|
| **COMBAT-UI-01** | **The two-screen split.** War Table (menu) and The Fight (stage) as separate views. Nav opens the live fight if one is running, else the hub. Back never stops the fight | 1 | L |
| **COMBAT-UI-02** | **Return ribbon** on the War Table when a fight is live — foe, both HP bars, session kills, Return | 1 | S |

### B · The War Table

| id | What | Ph | Sz |
|---|---|---|---|
| **COMBAT-UI-03** | **Portrait card grid**, 160px, 9 across, a whole tier visible without scrolling | 1 | M |
| **COMBAT-UI-04** | **The card contents** — 128px art, name, weakness glyph + HP, your kill count / `NEW` / locked level. Hover reveals drops | 1 | S |
| **COMBAT-UI-05** | **Destination row** — Bounty · Boss of the Day · Weekly · Dungeon · Raid · World Event, unified as one front door with live counters. Retires the two injected boss cards | 1 | M |
| **COMBAT-UI-06** | **Class filter** beside the tier chips (the 11-class taxonomy becomes navigable) | 1 | S |
| **COMBAT-UI-07** | **War Table on 922×423** — 104px cards, 8 across, 2 rows + peek; destinations as a chip rail | 1 | M |

### C · The Fight

| id | What | Ph | Sz |
|---|---|---|---|
| **COMBAT-UI-08** | **Hero plates** — foe `min(42vh,340px)`, player 170px, b357 square mask, 256px art at native size | 1 | S |
| **COMBAT-UI-09** | **Symmetric five-row grammar** both sides: name · level · HP+numerics · swing bar · stats | 1 | M |
| **COMBAT-UI-10** | **HP numerics inside the bar**, both sides; the separate `-hp-text` line retires | 1 | S |
| **COMBAT-UI-11** | **Six stat tiles**, three per side, from `forecast()`. Deep rows stay in the Stats modal | 1 | S |
| **COMBAT-UI-12** | **Gear quick-swap strip** — 6 slot chips + live totals. Paper doll leaves combat for Character | 1 | M |
| **COMBAT-UI-13** | **Action bar** `[Eat +heal +count +icon][Flee] · [Loot][Stats][History]`. **Restores Flee**, currently hidden by CSS | 1 | S |
| **COMBAT-UI-14** | **Style selector moves to The Fight**, beside the player frame. Retires the ribbon | 1 | S |
| **COMBAT-UI-15** | **Preview state** — the fight screen with the fight not started. Replaces the b342 modal and kills `AWAITING A FOE` | 1 | M |
| **COMBAT-UI-16** | **The Fight on 922×423** — tiles to one row, plates 170/80, log below fold, nothing actionable hidden | 1 | M |
| **COMBAT-UI-17** | **11 class backdrops** + tier tint, painterly, quiet-center composition, scrim 72% → 35/12% | 2 | M |
| **COMBAT-UI-18** | **Loot History**, collection-log aware, `NEW` on first-ever drop | 2 | M |
| **COMBAT-UI-19** | **Swing-timer bars**, weapon-named, off `combatTickMs()` | 3 | M |
| **COMBAT-UI-20** | **Settlement contract** — instant HP, no downward tween, swing reset on correction, death prediction removed from the client tick | 3 | M |
| **COMBAT-UI-21** | **Metrics strip** — b341-honest, refuses to quote a rate for a fight longer than the settle cadence | 4 | L |

### D · The fold audit

`FOLD-01 … FOLD-30` (§7.1) approve per-monster; `FOLD-31/32/33` (§7.2) are the three merges.
Every KEEP is on the reshoot list regardless of verdict.

**My recommendation:** approve **A + B + C Phase 1 as one block** (01–16). They cannot be
evaluated in isolation — 03 needs 01 to have a screen, 08 needs 01 to have room, 15 is what
connects them. Then **17** (the biggest single "reads as a game" step, and the one Tyler can
unblock himself with generation credits), then the folds, then 18–21 as their seams land.

---

## 10 · SCOPE AND HANDOFFS

- **Not redesigning UI chrome.** Type scale, tokens, plate treatment, button ladder: the Art
  Director's. Every pixel here is a **budget**, not a style.
- **Not touching the engine.** Phases 3–4 name seams; Systems owns them.
- **Not revisiting b227.** Its division of labour — actions on the stage beside their fighter,
  reference in modals — is correct, and this rework is built on top of it.

**Handoffs:**
- **Art Director** — hero-plate treatment; the 11 backdrop compositions (§5 is a brief, not a
  layout); merged mobile ribbon; action-bar hierarchy (only Eat is bright); the monster card.
- **Asset Director** — 11 backdrops; the legacy-30 reshoot; the two mis-mapped portraits
  (`bear.png` is a boar, `dragon.png` is a vampire — `monster-art.js` defect 1) must not be
  re-shipped as-is.
- **Systems Engineer** — swing-phase publication (one clock only); death-prediction removal;
  `MONSTER_ALIAS` population for FOLD-31/32/33; and the §6 long-fight gate, which is a
  `CONFLICTS.md` entry: **design will not ship a rate the server pays as zero.**
