# Player-journey audit — the full new-player playthrough
**Date:** 2026-08-08 · **Auditor:** Game Designer · **Build:** b224 + account wall (`4bda860`)
**Method:** played the game, wall to endgame-horizon, in headless Chromium against a local
serve of the main tree (port 8158, harness seam per `tests/run-smoke.mjs`). Fresh account →
gate → FTUE → first 5 min → first 30 min → a simulated 9-hour offline gap → session 2 →
mid-game surfaces (skills/artisan/combat/farm/house/bounty/events/market/social/collection/
renown/shop/chat). Every finding below was reproduced in a running build, not read off source.

**Not filed (known / in flight):** type scale (#19), clan nav placement (#18), account-wall UX,
crafting category lanes (#12 — shipped, verified live), harvest-daily capability scaling (b220 —
verified fixed), welcome-back modal halving the offline number (CONFLICTS), Cellar storage perk,
solo-raid one-tap chest, `deaths` never incrementing, recipe-less tier-3–6 drops, unreachable
Goldenroot/Emberfruit/Moonbloom (CONFLICTS), dungeon discoverability (#14).

---

## Executive summary — the three things most in the way of loving this game

1. **The game pays you the same for not playing it.** Offline gathering runs at *exactly* the
   active rate with no dampening, capped at 12h. A fresh account left on Normal Trees for nine
   hours came back at Woodcutting 62 with 16,110 logs — identical to nine hours of playing. We
   just shipped an account wall to make this an online realm, while the core loop's economics
   say "close the tab." Nothing else on this list matters as much.
2. **A new player is handed two contradictory to-do lists, and the button on one opens the other.**
   Home's "Next up" and the topbar "Quests" button are two separate systems with seven different,
   non-overlapping objectives; clicking "View" on a Home quest opens a modal that does not contain
   that quest. The designed onboarding chain (gather → cook → fight → farm) is invisible inside it.
3. **The game never tells you why anything matters.** The FTUE ends with the player idle. Activity
   cards sell seconds and XP but never name what they produce or what it's for. The renown ladder —
   the meta-spine — never says how renown is earned. The collection log is 311 anonymous "?" tiles.
   Every one of these is a place the player asks "so what?" and gets no answer.

**Counts:** P0 × 1 · P1 × 8 · P2 × 5 · P3 × 2 — **16 findings.**

---

## P0

### 1 · Offline progression pays identically to playing — presence is worth nothing
**Where:** `src/legacy.js` → `processOffline()` (`// Offline gather runs at the same rate as active
play — no dampening.`) → `doSkillAction(true)`, where `silent` only suppresses a re-render.
Cap: 12h F2P (16h with Offline+, plus renown/property/clan hours).

**What a new player experiences:** I finished the tour, planted two turnips, started Normal Trees
and left for nine hours. I returned to Woodcutting 62 (0 → 301,383 XP), 16,110 normal logs, renown
310 → 1,138 (Peasant → **Squire**, skipping Serf), a pet, and a "Right now: Woodcutting — Training"
card inviting me to leave again. The first House upgrade wants 30 normal logs; I had five hundred
times that. There was no reason to have been present, and no reason to be present now.

**Why it's P0:** the north star is an *online, social* idle-RPG, and b224 spent a whole build
forcing accounts. Every online-only surface in the game — the muster, world events, chat, market,
clans, raids, bounties — is in direct competition with a loop that pays full rate for absence.
The optimal play pattern this creates is "log in twice a day for thirty seconds," which is exactly
the pattern that kills a social game.

**Smallest strong fix:** do **not** nerf offline — that promise is why an idle game works on a
train, and cutting it makes every existing player worse off. Make *presence* strictly better
instead: an online-only bonus roll on the gather path (a presence multiplier on `doSkillAction`
when `!silent`, or a resource that only drops while the tab is live and feeds the homestead /
muster). The `LIVE_XP_AURA` in `muster.js` (+10% all XP while mustered) is the proven shape —
generalise it rather than inventing a second mechanism. Any change must be reviewed against the
`allXP` power budget (CONFLICTS: ceiling is +52%, fuse ≤0.60).
**Owner:** Game Designer (balance) + Systems Engineer (engine seam, exploit review).

---

## P1

### 2 · Two competing quest systems, and the Home CTA opens the wrong one
**Where:** Home "Next up" card renders `G.quests` (the b217 onboarding chain, `ensureRetentionState`)
interleaved with `G.daily.tasks` (`DAILY_TASK_POOL`). The topbar **Quests** button opens a modal fed
by `DAILY_GOAL_POOL` / `WEEKLY_GOAL_POOL` — a completely disjoint set.

**What a new player experiences:** Home says my objectives are *Gather 15 resources · Smith 8 items ·
Gather 120 resources · Harvest 10 crops*. The button literally labelled **Quests** says they are
*Catch 15 fish · Slay 30 monsters · Gather 25 logs*. Seven objectives, zero overlap, both called
quests. I clicked **View** on "Gather 120 resources" and landed in a modal that does not list it.
Worse: the deliberately-designed onboarding chain (gather → cook → fight → farm, authored in b217 so
the player has food before their first fight) is reduced to a single unlabelled row buried among
dailies, so the pedagogy never lands.

**Smallest strong fix:** one list. Promote the onboarding chain to its own "Your first steps" block
that owns the top of Home until it's finished, and make the topbar Quests button open *that* plus the
dailies it already shows. If the two pools must stay separate in code, they must not both be called
"Quests" and Home's CTA must deep-link to the row it came from.
**Owner:** Game Designer (IA + which list wins) + Systems Engineer (wiring).

### 3 · The tour teaches navigation, then leaves the player idle
**Where:** `src/ftue.js` `STEPS` — six cards: welcome, topbar, skills tab, combat tab, inventory tab,
wrap.

**What a new player experiences:** sixty seconds of being shown where the buttons are, ending on
"Train any skill, kill anything that moves. Good luck out there." — and then dropped on Home under a
status bar reading **"Idle — pick an activity"** with nothing running. The tour never has me *do*
anything. In an idle game the single most valuable thirty seconds of onboarding is watching your
first XP bar fill by itself, and we skip it. Step 4 also tells me to "equip a weapon and bring food"
when I already have a bronze sword equipped and my only food is raw shrimp — advice that is both
already-done and impossible.

**Smallest strong fix:** convert step 3 from "here is the Skills tab" to "tap Normal Tree" and hold
the card until the activity is running; end the tour with the bar moving and the wrap card reading
"you're already earning — it keeps going when you close this." Fix step 4's copy to point at the
cooking step that actually precedes combat in the chain.
**Owner:** Game Designer (script + gating) + Systems Engineer (activity-started hook).

### 4 · The loudest thing in the topbar has no subject: "LIVE · 25:47 left"
**Where:** `src/features/muster.js` → `computeState()`, state `live`:
`copy: 'LIVE · ' + fmtClock(...) + ' left'`, tone `gold-pulse` ("the loudest the topbar is ever
allowed to be").

**What a new player experiences:** the first thing that draws the eye on first boot is a pulsing gold
pill counting down, naming nothing. What is live? What ends in 25 minutes? Am I losing it? The
information that would make it a hook — *The Ashen Horde*, a combat muster, +10% all XP while
mustered — exists two clicks away on the Events page and is absent from the pill.

**Smallest strong fix:** put the event name in the pill (`The Ashen Horde · 25:47`) and keep LIVE as
the tone, not the text. One string change to the highest-traffic call to action in the game.
**Owner:** Game Designer (copy) + Art Director (fit at the new length).

### 5 · Renown is the meta-spine and nothing anywhere says how you earn it
**Where:** `src/features/renown.js` `computeRenown()` / the ladder modal; Home "Rise to the throne" card.

**What a new player experiences:** Home tells me I am a Peasant with "310 Renown · 90 to Serf" and
shows a bar that is already 77% full — before I have done anything. Opening the ladder shows twelve
ranks and their rewards, and still never says what moves the number. There is no action I can take
*because* it earns renown, which means the game's stated spine ("Rise to the Throne") is a readout,
not a goal. The 310 opening figure also makes the first rank-up feel handed to me rather than earned.

**Smallest strong fix:** a one-line source breakdown in the ladder header — "Renown comes from skill
levels, combat level, kills, quests, collection entries and your login streak" — with the top three
contributors and their current values, so the player can see which lever to pull. Separately consider
subtracting the fresh-account baseline (~310) so the first bar starts near empty and Serf is a real
first win rather than a formality.
**Owner:** Game Designer.

### 6 · The rank-up ceremony's hero art is a 🎉 emoji
**Where:** the renown rank-up modal (`RANK UP / 🎉 / SERF`). Screenshot captured.

**What a new player experiences:** the highest-ceremony moment in the meta-spine — the one screen
designed to make climbing feel like an event — presents a full-colour party-popper emoji in the
middle of an otherwise disciplined gold-on-stone medieval frame. It reads as a placeholder, and it is
a direct Final Directive violation ("No emoji as art anywhere"), on the one surface where the art is
the whole point. (`📊` in the Quests modal header is the same class of leak; the rest of the game's
glyphs are correctly swapped by `src/data/glyphs.js`.)

**Smallest strong fix:** swap in the rank's own crest/sigil at ceremony scale — the ladder already
has per-rank marks — or the Hearthrise crest already drawn in `account-gate.js`. Then sweep for
remaining raw emoji in ceremony surfaces.
**Owner:** Art Director (+ Asset Director for the crest set).

### 7 · The bounty board's entry offer is three ~90-kill grinds
**Where:** `BOUNTY_KILL_COUNTS.cull` tier 1 = `[80,120]`; `BOUNTY_BASE_REWARDS[1] = {gold:320,
marks:6, xp:45}`, easy multiplier 0.85.

**What a new player experiences:** my very first bounty board offered *Defeat 91 Field Rats* (270g),
*Defeat 85 Weak Skeletons* (320g), *Defeat 89 Small Wolfs* (320g). Three near-identical single-target
grinds, each a ~15–25 minute commitment at level 3, each paying less than the 500 gold I started
with. There is no small first bounty that closes the loop quickly and teaches the system, and the
Bounty Shop's useful items (50–300 marks at ~5–6 marks a turn-in) are ten to fifty bounties away. The
Field Rat card also says "Weak to 2H Hammer" with no indication of where a hammer comes from.

**Smallest strong fix:** a guaranteed first-bounty override — one 10-kill "Cull" at full tier-1 marks
— so the player completes and turns in a bounty inside their first session and sees the marks
economy work once. Then let the normal table take over.
**Owner:** Game Designer.

### 8 · The collection log is 311 anonymous "?" tiles
**Where:** `src/features/collection-log.js` — Bestiary 0/31 · Items 0/280, every undiscovered entry
rendered as an identical `?` with no name.

**What a new player experiences:** I opened the completionist surface and found six tier headings and
thirty-one indistinguishable question marks, then an Items tab with two hundred and eighty more. It
tells me the size of the mountain and nothing about any step up it. A collection log's entire job is
to make you want a *specific* thing; ours cannot name one.

**Smallest strong fix:** show the name (and for items, the source line) on undiscovered entries in a
dimmed state, silhouette-style — "Goblin · Tier 1", "Bone Key · Crypt of Bones". Reveal the art on
discovery. Same data, and suddenly every tile is a lead.
**Owner:** Game Designer (what's revealed) + Art Director (the locked treatment).

### 9 · Events is a room full of locked doors with no key shown
**Where:** `#panel-events` dungeon/epic/legendary cards.

**What a new player experiences:** Events is a top-level nav pillar. At combat level 3 it contains one
joinable muster, a solo clan-boss strike, and then **six dungeon cards in a row**, every one reading
"Combat Lv 25/35/45/65/80/95 required (you are 3)" and "Entry: 1× Bone Key (**have 0**)". Nothing on
any card says where a Bone Key comes from, so the requirement is unactionable as well as unmet. The
page's dominant message to a new player is "not for you," six times.

**Smallest strong fix:** collapse content the player cannot reach into a single "Locked — unlocks at
Combat 25" summary row, and put the acquisition source on the entry requirement ("Bone Key — drops
from Weak Skeletons"). Show one *next* dungeon expanded as the goal, not all six as rejections.
Coordinates with backlog #14 (which fixes *finding* Events; this fixes *arriving* at it).
**Owner:** Game Designer + Art Director.

---

## P2

### 10 · Completing the tour arms a listener that throws on the player's next click
**Where:** `src/ftue.js` `renderStep()` — `autoAdvanceOnClick` attaches a capture-phase click listener
to the step's nav tab and only removes it when *that* listener fires. Advancing with the card's
**Next** button leaves it armed. `next()` then runs with `rootEl === null` and throws at line 352.

**Repro (verified):** fresh account → complete all six steps with the primary button → click
**Skills**. Uncaught `TypeError: Cannot read properties of null (reading 'querySelector')`, captured
by Sentry with a real release tag. Only one error fires because `advancing` is set to `true` on the
line before the throw and never reset — which also permanently disables `next()`.

**Player harm:** none visible after the tour, but during it a player who clicks a *previously*
highlighted tab skips a step. The real cost is a guaranteed uncaught exception on the single most
travelled new-player path, polluting production error telemetry, with no test guarding it.

**Smallest strong fix:** remove the listener in `next()`/`endFTUE()` (keep the handles), and guard
`next()` with `if (!rootEl) return;`. Regression test: complete the tour, click Skills, assert no
pageerror.
**Owner:** Systems Engineer.

### 11 · Session 2 opens with three stacked overlays and a toast pile
**What I saw on return from the 9-hour gap:** the welcome-back sheet (`.wbv-overlay`), the beta-banner
overlay, and the daily-reward modal all mounted at once, over a notification stack reading
"Woodcutting 52! / Woodcutting 53! / Woodcutting 54! / **A wild friend! Beaver now follows you!**".
My first pet — a genuine landmark — arrived as toast number four behind three level-ups, under three
modals. The return-to-game beat is the most emotionally valuable moment an idle game has, and ours
spends it on modal dismissal.

**Smallest strong fix:** one return sequence. Fold the daily reward *into* the welcome-back sheet
(it is already a "what happened while you were away" summary), show the beta banner only when its
version changes, and promote first-time landmarks (first pet, first rank) out of the toast queue into
the sheet's body. Note the welcome-back number bug is already logged in CONFLICTS — fix that in the
same pass rather than twice.
**Owner:** Game Designer (sequence) + Systems Engineer (modal precedence, which b221/b223 already own).

### 12 · Activity cards sell seconds and XP, never the point
**Where:** the Skills activity grid — "Normal Tree · 25 XP · 3.0s"; combat monster rows —
"Slime · Vermin · weak to sword · 8 HP · 2 ATK".

**What a new player experiences:** the picker where I make my most frequent decision never tells me
what I *get*. Nothing on the Normal Tree card says it yields Normal Logs, and nothing connects those
logs to the "0/30 Normal Log" the Home card wants for my first house. Nothing on a monster row says
what it drops, so "why Slime over Field Rat" has no answer beyond HP. The result is that the only
legible axis is level gating, which is why every locked card reads as the real content.

**Smallest strong fix:** add the output to the card — the produced item's icon and name on gathering/
artisan tiles, and the one signature drop on monster rows. Where a Home/House/quest requirement is
outstanding for that item, mark it ("needed: 30 for Hearthside Homestead"). That single line turns the
picker into a plan.
**Owner:** Game Designer (what to surface) + Art Director (fit in the tile).

### 13 · The farm's first action pays out in four hours, in vocabulary nobody taught
**Where:** `#panel-farming` — "Farm Plot Lv 1/5 · 0 Deeds · Auto-replant: off", "2 plots are thirsty",
Turnip "Lv 1 · 4h grow · 2-4 yield".

**What a new player experiences:** the farm is a Homestead pillar and its entire day-one interaction is
"plant two turnips, come back in four hours." Between those points there is no state to look at and
nothing to do; the plot shows "0% · dry". Meanwhile the header uses three terms — **Deeds**,
**Auto-replant**, **thirsty/watering** — that appear nowhere else and are never explained, and the
crop list shows nine crops of which eight are locked, three of them (Goldenroot/Emberfruit/Moonbloom)
unplantable at any plot level (already in CONFLICTS).

**Smallest strong fix:** give the first planting a visible early beat — a sprouting stage in the first
few minutes so the plot changes while the player is still there — and put a one-line "what is this"
on Deeds and watering at the point of use. Backlog #13 (watering optional, speeds growth) is the right
home for the watering half; fold this in rather than shipping it separately.
**Owner:** Game Designer.

### 14 · Placeholder copy and an off-palette progress colour on the Quests modal
**Where:** the topbar Quests modal. All three dailies carry the identical body line **"Complete this
objective to claim your reward."** — a sentence that restates the UI and says nothing about the
objective. Progress bars in this modal render **red**; every other progress surface in the game
(renown, skills, activity bar, house build) is gold. The `📊` beside "QUEST INFO" is a raw emoji.

**What a new player experiences:** the one surface that is supposed to tell me what to do next reads
as unfinished, and red bars in a game where red means damage make three neutral objectives look like
warnings.

**Smallest strong fix:** replace the shared line with per-quest copy that says where to do it ("Fish
at any spot — Skills → Fishing"), retone the bars to the gold progress token, and swap the emoji.
**Owner:** Game Designer (copy) + Art Director (colour role, emoji).

---

## P3

### 15 · The Shop opens on real-money packs
`#panel-shop` leads with **Premium Store · Real-money packs** ($6.99 Hearth Tokens, $4.99 Starter
Gems) above the in-game Seeds/Equipment/Cosmetics shop. A level-1 player with 500 gold who taps
"Market" to spend their first coins meets a price list in dollars first. Nothing here is
pay-to-win — the bond is correctly IAP-only and tradeable — but the ordering asks for money before
the player has ever experienced the currency it substitutes for. Put the in-game shop first and let
Premium be a tab, not the headline.
**Owner:** Game Designer.

### 16 · "Defeat 89 Small Wolfs"
Generated bounty copy pluralises by appending `s` to the monster name. It is the first sentence a
new player reads on the Bounty Board, and it reads as machine-written. Add a `plural` field to
`MONSTERS` (or an irregulars map) and use it wherever counts are rendered.
**Owner:** Systems Engineer.

---

## Handoffs raised
- **Systems Engineer:** #10 (FTUE listener leak — has a clean regression test), #16 (pluralisation),
  and the engine seam for #1 (online presence bonus) + #2 (quest list unification).
- **Art Director:** #6 (rank-up hero art), #14 (progress colour role + emoji), and the locked-state
  treatments for #8 and #9.
- **Coordinator:** #1 is a product-thesis question as much as a balance one — it should reach Tyler
  as a decision, not land as a silent tuning change. #11 should be merged with the existing
  welcome-back CONFLICTS entry so the return beat is fixed once.

## Verification notes
Every finding was observed in a running b224+wall build served from the main tree. Screenshots and
the driver scripts used to reproduce them are in the session scratchpad. No game files were modified
by this audit.
