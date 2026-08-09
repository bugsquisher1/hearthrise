# UI/UX REVIEW — screen by screen

**Date:** 2026-08-08 · **Auditor:** Art Director · **Build under test:** v0.9.2-beta b224 (`4bda860`, main + account wall)
**Method:** read-only. Local static server on :8161, Playwright with the smoke suite's harness flag (`window.__HR_TEST_HARNESS__` via `addInitScript` — localhost only). Every screen rendered and inspected, not read from source.

**Coverage:** account wall · home · character · inventory (+ Equipment / Stats / Companion) · combat · events (muster + clan boss + dungeons) · bounty · store (premium + Seeds/Equipment/Cosmetics) · skills grid + 4 skill details · farm · house (Rooms/Plot/Themes) · social (Throne/Overall/Skills/Combat/Clans + friends) · clan castle + all six rooms · market · stable · settings · and the modal fleet (What's-New, daily reward, name claim, beta card, collection log, More, room modals ×6). Each at **1440×900** and **900×820**, in **hearthlight** and **cozy-light**. 40+ screen states, ~90 captures.

**Console:** clean. 0 runtime errors, 0 page errors across the whole sweep (excluding the expected offline Supabase 404s). **No horizontal document overflow** at either width on any screen.

> **Timing note.** Captures were taken against `4bda860`, before b225 moved the Clan Seat out of Social into its own top-level destination (#18). Findings 3, 4, 25 and 27 concern the castle panel's own composition and its room modals, not their placement, so they survive the move — but re-verify their pixel coordinates against b225's panel host before acting on them. Finding 17 (the Social panel's section IA) is likely to have shifted; re-check it first.

**Not filed here** (per brief): text-size floors (#19), clan nav placement (#18), hen / homestead-plate / boss-art asset gaps, mobile-portrait, and everything already in `BACKLOG.md` / `CONFLICTS.md`. See §Not filed at the end for the two known items whose *severity* looks understated from the rendered evidence.

---

## Counts

| Severity | Count |
|---|---|
| **P0** | 0 |
| **P1** | 9 |
| **P2** | 15 |
| **P3** | 8 |
| **P4** | 2 |
| **Total** | **34** |

Top 10 by impact: **1, 2, 3, 4, 5, 6, 7, 8, 9, 10**. Captures for those are named inline; regenerate any of them with the harness described in §Reproducing.

---

# P1 — nine

### 1 · P1 · GLOBAL — 112 emoji are rendered as art, across 8 surfaces
*Capture: `A-stable.png`, `A-events.png`, `A-house-themes.png`, `M-collection.png`*

The "0 emoji as art" rule is not close to held. A full DOM sweep of every panel and modal, counting only *visible* text nodes, returns **112 emoji nodes**:

| Surface | Nodes | Size | Sample |
|---|---|---|---|
| Stable (companion tiles) | 22 | **48px** | 🦊 🐺 🐦 🐰 🐝 🦡 🦅 🐉 🦂 🦝 🦉 🐢 🦫 🗿 🪿 🐿 🐤 👺 🕷 🕯 💀 🐲 |
| Collection log modal | 32 | 24px | 31× ❔ + ✕ |
| Events → Dungeons | 24 | 12.5px loot chips, **32px** `.dgn-icon` | ⚱ 📜 🦴 ⚔ 🗿 🎖 🗝 🔮 📕 ⚙ ⬛ 🪲 ⚫ 🌌 🌑 🐲 🗡 |
| House → Themes | 6 | 36px | 🏡 🌲 🏜 ❄ 🌋 🧚 |
| Store → Equipment | 5 | 27px | 🐦 🐝 🦝 🦉 🔒 |
| Combat (active effects) | 4 | 27px | 📈 🌟 🎯 ⚔ |
| Settings modal | 4 | 18px title | ⚙ ✓ ⬇ ⚠ |
| House → Plot | 3 | 12.5–32px | 🌾 🥕 📜 |

The Stable is the worst case and is not a stray glyph — it is **the entire screen's art**: 22 tiles whose only image is a 48px full-colour system emoji. They are also the only fully-saturated objects anywhere in a warm near-monochrome UI, so the screen reads as a different product. Store → Equipment reuses the same companion data, so the same 4 emoji leak there too.

The b217/b221 sweeps clearly worked — Home, Character, Inventory, Bounty, Skills, Market, Social and the Farm plot grid are all clean. What is left is every surface the selector list in `icon-set.js` never covered: `.sc-icon`, `.dgn-loot`, `.dgn-icon`, `.iap-icon`, `.at-icon`, `.hr-cl-ic`, `.modal-title`.

**Smallest strong fix:** the pet/dungeon/theme icon *keys* already exist in data — map them onto `HR_GLYPHS`/`HR_MONSTER_GLYPHS` the way `home-dashboard.js` maps `HOLDING_GLYPH`/`EVENT_GLYPH`, and add those seven selectors to the `icon-set.js` strip list so the next one is caught automatically. Then a smoke guard: `document.body` contains 0 emoji text nodes with every panel rendered — the sweep script in §Reproducing is that test, already written.
**Owner:** Art (mapping + guard) · Asset Director (22 companion glyphs are a real asset ask — flag if the atlas can't cover them).

---

### 2 · P1 · STABLE — 21 raw machine keys are shown to the player as unlock copy
*Capture: `A-stable.png`*

Every locked companion states its unlock condition as the literal data key:

```
Locked · drop:small_wolf          Locked · shop:8000:cooking25
Locked · skill:woodcutting:2500   Locked · quest:harvest100
Locked · boss:lich:200            Locked · shop:50:prayer50
Locked · hatch:dragon_egg         Locked · drop:shadow_creeper
```

21 of the 22 tiles. There is no sentence anywhere on the screen that a player can act on. A companion bonus line has the same problem: `+1 gold (5% on combatHit)`.

**Smallest strong fix:** one `describeUnlock(key)` formatter in the pets module — `skill:woodcutting:2500` → "Woodcutting 2,500 XP", `drop:small_wolf` → "Drops from Small Wolf", `shop:8000:cooking25` → "8,000g · Cooking 25". Six branches; the key shapes are already regular.
**Owner:** Systems (formatter) · Game Designer (the 22 strings).

---

### 3 · P1 · CLAN CASTLE — the six rooms are a text table, not doors
*Capture: `A-castle.png`*

Tyler's standing brief for this screen: *"every building clickable → a modal that feels like the INSIDE of that room."* The entry affordance for all six is a **6-column strip of plain bordered cells**, 1,250px wide and 52px tall, each containing two lines of text (`The Tavern` / `LV 6`) separated by 1px vertical rules. No art, no door, no hover state, no hit-target cue. It reads as a data table and sits immediately under a full-bleed painted-silhouette scene, which makes the contrast worse: the picture promises a place, the row beneath it is a spreadsheet.

The scene band is also full-bleed to x=180 while the headings above and the meters below are inset to x=190 — a visible 10px jog down the left edge of the panel.

**Smallest strong fix:** the room art already exists (`ROOM_ART` in `clan-seat-ui.js`, one illustration per room — see #4). Use a crop of each room's own illustration as the door tile's background with a scrim and the name/level over it, at the bounty-notice size (~200px), and give it the same hover lift the bounty notices have. That converts the strip into six lit doorways with zero new assets.
**Owner:** Art.

---

### 4 · P1 · ROOM MODALS ×6 — greybox art, and an internal migration name in player copy
*Capture: `A-room-tavern.png`, `A-room-sawmill.png`, `A-room-great_hall.png`*

Two problems in the same component.

**The art.** The Tavern's illustration is an arch with a flame, three horizontal lines, a bench, and **three plain black rounded rectangles** that are presumably barrels but read as unrendered boxes. It is the weakest drawing in the game and it is attached to the one screen whose whole job is atmosphere. The Great Hall and Sawmill are better (arches + banners; a saw blade + stacked planks) but all six are flat two-tone vector against a UI that elsewhere ships painted item art and two real scene compositions. The band is authored at ~640×160 but the drawn subject occupies only the left 60%, leaving a dead right third in every room.

**The copy.** The Tavern's Board section reads, verbatim:

> The Barkeep has not posted yet. The Board needs the **clan-seat-2** migration — until it is run there are no tasks, and inventing some would be a lie.

A Supabase migration filename, shown to a player. The honesty is right; the vocabulary is not.

**Smallest strong fix:** copy — "The Barkeep has not posted yet. The Board opens when the hold's ledger is ready." Art — give each room one lit light-source and one silhouetted foreground object at the right edge (the b221 shopfront method), which is what stops the Tavern reading as a wireframe; and re-author at the band's true aspect so the subject fills it (the b219/b221 lesson, still being relearned).
**Owner:** Art (art) · Systems (copy string).

---

### 5 · P1 · MODAL FLEET — two dialogs render on top of each other
*Capture: `M-settings.png`, `M-more.png`*

Verified twice, from real entry points:

- Open **Settings** (topbar gear) → the FTUE card *"Step 1 of 6 — Welcome to Hearthrise"* renders centred **on top of it**, covering the Display and Gameplay rows. The Settings modal stays live and clickable behind it; both share one scrim, so the stack has no depth cue at all.
- Open **More** → the **What's-New** sheet renders on top of it; the More modal's Close button and rows are plainly visible behind the sheet's edge.

`welcome-modal.js` has a `BLOCKING_OVERLAYS` / `anotherModalUp()` guard, so the intent exists — it just doesn't include `.modal.show` (the shared `#settings-modal` / `#more-modal` element) or the FTUE root.

**Smallest strong fix:** one `isAnyDialogUp()` predicate that every deferred opener consults, covering `.modal.show`, `.ftue-root`, and the `hr-*-scrim` family — and add `.modal.show` to `BLOCKING_OVERLAYS`. Deferred sheets re-arm rather than stack.
**Owner:** Systems.

---

### 6 · P1 · SKILLS — the detail pane shows Level 1 for a level-58 skill
*Capture: `A-skills.png`*

`showTab('skills')` calls `renderSkillsList()` only, and `refreshAll()` re-renders the detail **only if `G.activeSkill` is set**. Until a player clicks a skill tile once, the default pane is whatever was drawn at boot and never updates.

Measured, same screen, same instant:

- left list: `Woodcutting 58`
- right pane: `WOODCUTTING · Level 1 · 0 / 83 XP`, with **Oak Tree / Willow / Maple Tree showing padlocks and "Level 15 / 30 / 45"** — three activities the player has been able to use for 40 levels, presented as locked.

Clicking the tile corrects it to `Level 58 · 224,466 / 247,886 XP` and drops the false locks. A player who trains from the Home launchpad or an activity grid and then opens Skills sees a flatly wrong account of their own progress plus fake gates — the worst class of UI defect, because it is not ugly, it is untrustworthy.

**Smallest strong fix:** in `showTab('skills')`, render the detail for `G.activeSkill || <first skill>` and set `G.activeSkill` at the same time, so the refresh path is armed from the first paint.
**Owner:** Systems. **Add the regression test** — the level in the detail header equals the level in the list.

---

### 7 · P1 · CHARACTER — the Ranged and Magic cards print the wrong row labels
*Capture: `A-character.png`, `src/features/character-page.js:225-227`*

```js
styleCard('Melee',  …, lv('attack'), lv('strength'), lv('defense'), …)
styleCard('Ranged', …, lv('ranged'), lv('ranged'),   lv('defense'), …)
styleCard('Magic',  …, lv('magic'),  lv('magic'),    lv('defense'), …)
```

The row labels are hardcoded `Attack / Strength / Defense` in all three cards. So with Attack 58 and Ranged 20, the screen shows **"Attack Lv 58" in one card and "Attack Lv 20" in the card beside it**, and "Strength" appears twice with two different values. Three cards, one screen, contradicting each other about the same stat name.

**Smallest strong fix:** pass row labels into `styleCard` — Melee `Attack/Strength/Defense`, Ranged `Ranged/Ranged bonus/Defense` (or a single `Ranged` row), Magic likewise. Two-line change in one file.
**Owner:** Systems.

---

### 8 · P1 · ACCOUNT WALL — the first screen every player sees shows nothing of the game
*Capture: `W-wall-desk.png`, `W-wall-narrow.png`*

Since #17 landed this is the front door: no player reaches the game without it. It is a 402×386 card centred in a 1440×900 field of flat near-black — **78% of the viewport is empty** — carrying a small emblem, a wordmark, and two form fields. There is no scene, no art, no screenshot, no reason to sign up. Meanwhile Home's hearth band, one click later, is the best-looking thing in the build.

Also on it:

- The value proposition is **stated twice, in different words, 250px apart**: *"One account carries your name, your progress and your standing across every device you play on."* (in the card) and *"Hearthrise is played online. Your account holds your progress, your name, and your place on the boards."* (below it).
- No forgot-password link, no password-reveal toggle, no terms/privacy link. The last one is a store-submission requirement for both target platforms.

**Smallest strong fix:** put `HearthriseBackdrop.homesteadScene(5)` — the castle-tier dusk vista that already exists and is already themed — full-bleed behind the card under a scrim, and delete the duplicated sentence. Zero new assets, and it makes the front door look like the game.
**Owner:** Art (scene + copy) · Systems (the three missing links).

---

### 9 · P1 · EVENTS — the clan-boss bar is a 1,210px vermilion band showing a value it says it doesn't have
*Capture: `A-events.png`, `N-events.png`*

Measured: `linear-gradient(90deg, rgb(178,58,44), rgb(212,99,63))`, 1,210 × 8px, rendered **100% full** — directly above the caption *"Unmeasured — your first strike of the week sets the quarry's size."* So the loudest, most saturated element on the page is a meter that is admitting it has no value.

Two separate faults: an off-palette saturated red on a screen with no other red (colour roles are locked and this isn't one of them), and a full meter as the representation of "unknown".

**Smallest strong fix:** when the quarry is unmeasured, render the track empty with a hatched or dashed fill and no gradient; and move the bar's colour onto the ember/gilt ramp so it belongs to Forge & Stone. The two-line caption then does the explaining, which is what it is already for.
**Owner:** Art.

---

# P2 — fifteen

### 10 · P2 · FARM — the empty plots are a diagonal hatch swatch
*Capture: `A-farm.png`*

Eight 165×165 tiles filled with a repeating diagonal barber-pole stripe. That pattern's entire cultural meaning in UI is "disabled / no content"; here it is meant to be tilled earth. It is the single most generated-looking surface in the build, and it is eight of them at once, above the fold, on a screen the player opens several times a session. Home, Bounty and the Store all got scene passes; the Farm — the game's namesake homestead loop — has no scene identity at all.

Also: the grid stops at x=1257 of a 1424px field (a fixed column count that doesn't fill), and 8 identical filled-gilt "PLANT" buttons plus a filled-gilt "Plant all" put nine primaries on one screen with no hierarchy.

**Smallest strong fix:** replace the hatch with the same SVG treatment the hearth band uses — furrow lines in `--scene-*` tokens, warmer at the lit edge — and demote the per-plot buttons to ghost so "Plant all" is the only primary.
**Owner:** Art.

### 11 · P2 · MARKET — the last un-themed economy screen, plus a control laid over a banner
*Capture: `A-market.png`*

Bounty became a board, Store became a shopfront; the Market is still a form and two centred grey sentences in a 1,200×380 void. The empty state has no illustration and no CTA beyond the form above it.

And measured: the **"Premium Store" button** (x 1309.6→1428) sits **114px inside** the "Listings rules" banner (x 196→1424) and overhangs its right border by 4px. It is a floated control on top of a bordered surface, not a control in a row.

**Smallest strong fix:** move Premium Store into the panel header row beside the title (where the other screens put their secondary action) so the banner is a banner; and give the empty state one line of scene — a weigh-beam/scales motif already exists as the Market nav glyph.
**Owner:** Art.

### 12 · P2 · HOUSE — met and unmet requirements are the same colour
*Capture: `A-house.png`*

`40000 / 40000` and `0 / 50` are both `rgb(236, 225, 204)` — identical cream, no weight difference, no icon. Five rows, and nothing tells you which two you have. Home's "Your holding" card renders the *same data* with shortfalls in red (b221). One screen colours it, the other doesn't.

**Smallest strong fix:** reuse Home's shortfall treatment verbatim.
**Owner:** Art.

### 13 · P2 · HOUSE — three "+0%" cards at 1,240 × 63px each
*Capture: `S-house-bottom.png`*

The Bonuses block renders four full-width cards; three of them read `+0% COMBAT XP`, `+0 FARM YIELD`, `+0% GATHER SPEED`. That is 3,720px² of panel spent saying nothing three times, at the bottom of the longest screen in the game (1,692px of scroll).

**Smallest strong fix:** hide zero-value bonuses, or collapse the whole block to one inline row of chips and only promote a bonus to a card once it is non-zero.
**Owner:** Art.

### 14 · P2 · INVENTORY vs COMBAT — two different equipment dolls for one job
*Capture: `A-inventory.png`, `A-combat.png`*

Combat renders `.td-slot` + `.td-slot-lbl`: every slot carries its name (Helmet, Necklace, Earrings, Cape, Offhand, Ammo, Ring 1/2, Body, Gloves, Boots). Inventory renders `.invc-tile.invc-slot` with **empty text content** — fourteen unlabeled squares carrying only a ~18px line glyph at roughly 2:1 against the tile. Same task, same session, two components and two answers about whether slots have names.

The Inventory doll is also laid out as a 4-column grid with holes (Boots in column 2, Ring 2 in column 4, nothing between), which reads as a broken grid rather than a body.

**Smallest strong fix:** delete the Inventory doll and mount the Combat one (`td-*`) in both places.
**Owner:** Systems (one render swap) · Art (confirm the 4-col arrangement).

### 15 · P2 · INVENTORY at 900px — the sub-tab labels vanish and the doll blows up
*Capture: `N-inventory.png`*

At 900×820 the `EQUIPMENT / STATS / COMPANION` segmented control becomes three full-width ~290px buttons containing **only a small centred glyph — the words are gone**. Below it the doll's four columns stretch to the full panel width and the slot glyphs scale to ~60px, so each empty slot is a 220×150 cell with a giant grey outline in it. The bag grid's last row is clipped mid-tile.

The 900px layout is a scaled desktop layout that hasn't been looked at; this is the one screen where that shows badly.

**Smallest strong fix:** keep the labels (they fit — 290px each), and cap the doll grid at its desktop width with `max-width` + `justify-content:center` instead of letting it stretch.
**Owner:** Art.

### 16 · P2 · TOPBAR at ≤900px — the numbers lose their units
*Capture: `N-home.png`*

At 1440 the topbar reads `66 CL · 756 TL · 1,250,000 GOLD · 640 GEMS`. At 900 the small-caps unit labels are dropped and it reads `66 · 756 · 1,250,000 · 640` — four bare numbers with small glyphs, three of which (66/756/640) are indistinguishable at a glance. The responsive rule sheds the *semantics* and keeps the least-legible part.

**Smallest strong fix:** drop the two least important stats entirely at ≤900px rather than de-labelling all four; total level and gems can live on Character/Store.
**Owner:** Art.

### 17 · P2 · SOCIAL — a section called "Clan + Friends" that contains neither, followed by "Friends"
*Capture: `A-social.png`*

Section order down the panel: `LEADERBOARDS` → `CLAN + FRIENDS` (contents: one sentence and a Sign in button) → `FRIENDS` (empty-state card) → `CLAN ACTIVITY` (empty-state card). Three of the four sections are about the same two things, and the one whose title names both contains neither.

Containment is also inconsistent within the panel: the leaderboard rows are borderless, the two empty states are 84px bordered cards.

**Smallest strong fix:** rename `CLAN + FRIENDS` → `YOUR CLAN` and let the three sections mean three things; use one empty-state treatment for all of them.
**Owner:** Art (with Designer for the naming).

### 18 · P2 · SOCIAL → SKILLS — the skill chip row is clipped mid-glyph
*Capture: `A-social-skills.png`*

Fifteen chips (Attack…Prayer). Fourteen fit; the fifteenth is **cut in half against the panel's right edge at x≈1424** with no fade, no scroll arrow, no wrap. Nothing tells you there is more, and there is no way to reach it with a mouse.

**Smallest strong fix:** wrap the row (it's two clean lines) or give it `overflow-x:auto` with an edge fade — the Combat tier chips already wrap, so wrapping is the consistent choice.
**Owner:** Art.

### 19 · P2 · STORE — a $49.99 wall is the first thing on the shop screen, in dev voice
*Capture: `A-shop.png`, `S-shop-bottom.png`*

`Premium Store` occupies the top 560px — nine real-money cards up to $49.99 — and the actual in-game shop (seeds, equipment, cosmetics) starts below the fold at y≈719. On a free beta whose stated position is no-pay-to-win, the Store leads with the till.

Under it, shipped to players:

> Purchases route to the platform you're running on (Steamworks / App Store / Play Store / Stripe). Receipts are validated server-side before granting items. **Detected: web.**

That is an engineering note, including a runtime detection readout.

Nine identical high-chroma indigo Buy buttons in one grid is also the most saturated block of colour in the build; against a warm gilt palette it reads violet, not sapphire.

**Smallest strong fix:** put the in-game shop first and the premium packs below it (or behind the existing "Premium Store" chip); delete the routing sentence; and pull the Buy fill toward the cooler-but-desaturated end of the sapphire role so it stops reading as a framework blue.
**Owner:** Art (order + colour) · Systems (copy).

### 20 · P2 · WHAT'S-NEW SHEET — the version badge overflows its box, and the copy is a changelog
*Capture: `M-more.png`*

The build badge top-right is a ~54px bordered box; the string `0.9.2-beta-224` wraps to **three lines** (`0.9.2-` / `beta-` / `224`) and pushes past the box. Visible on the first modal a returning player sees.

The body is engineering voice: *"282 tests green (+8 that specifically watch numbers move, which is how this stayed invisible)"*, *"the old Eat path pointed at code that never existed"*, *"hasn't done anything since build 134"*. Honest and well-written for a team channel; a player has no use for the test count.

**Smallest strong fix:** `white-space:nowrap` + a wider badge (or just `b224`); and let the sheet carry the player-facing half of each entry only — the first sentence of each bullet already is that.
**Owner:** Art (badge) · Systems/content (copy).

### 21 · P2 · EVENTS — the boss title sits 354px right of the panel's text edge
*Capture: `A-events.png`*

Every heading and paragraph on the Events panel starts at x=190. The clan-boss row is a three-part flex — portrait left, title centred, note right — so `◆ Lone Hunt — Warden of the Long Dark` renders at **x=544→810** inside a container spanning 190→1430. It is the only centred text on the screen and it breaks the left rule that everything else establishes.

The panel also uses two different heading treatments at the same structural level: `THE MUSTER` / `TODAY'S BLESSING` / `WEEKLY CLAN BOSS` are small gilt caps; `DUNGEONS (SOLO)` is large Cinzel caps.

**Smallest strong fix:** left-align the title next to the portrait and let the note keep the right edge; unify the four section headings on one treatment.
**Owner:** Art.

### 22 · P2 · SKILL DETAIL — a crafting screen with no affordability signal
*Capture: `A-skill-smithing.png`, `A-skill-cooking.png`, `A-skill-crafting.png`*

Recipe cards state their inputs (`2x Copper + Coal`, `Mithril + Magic + 4x Coal`) but never say whether you have them. No have/need counts, no dimming, no disabled state — an unaffordable recipe and an affordable one are pixel-identical apart from the level padlock. On the three artisan skills that is the primary decision the screen exists to support.

**Smallest strong fix:** append a `have/need` count per input and desaturate the card when any input is short — the House requirement rows already have the pattern (and, per #12, need the colour anyway, so build it once).
**Owner:** Art (with Systems for the inventory lookup).

### 23 · P2 · BOUNTY — the Unlocks ladder is ten unexplained chips
*Capture: `A-bounty.png`*

`1 Cull · 5 Proof · 10 Weapon · 15 Streak · 20 Tier 2 Board · 30 Boss · 40 Chain · 50 Hard · 60 Auto-Bounty II · 75 Elite`. Two-word labels, no verb, no tooltip, no visible locked/unlocked distinction beyond the first chip's slightly lighter fill. "Proof" and "Chain" are unguessable. It is the progression spine of the screen rendered as jargon.

**Smallest strong fix:** `title` text at minimum; better, one sentence under the strip describing the next unlock only ("At Bounty 5: notices show the proof you'll need before you accept").
**Owner:** Game Designer (strings) · Art (the next-unlock line).

### 24 · P2 · GLOBAL — three floating layers and two toast languages fight in the corners
*Capture: `A-home.png`, `A-character.png`, `N-home.png`*

Measured at 1440×900: `#notifs` fixed z-10050 anchored at (1428, 799) · `#hr-bug-btn` fixed z-9998 at (1393, 809) 35×29 · `#chat-dock` fixed z-10000 at (1342, 846) 82×38. Three independent systems inside one 86×85px corner with no shared spacing rule, and toasts grow up through it.

Consequences seen in the captures: the bottom-right toast lands on the Home "Upkeep" list and on the Character screen's Magic stat rows; the bug button is 35×29 with a surface measuring **1.16:1 against the page** — effectively invisible until you know it is there.

Separately, the app has **two toast systems with two visual languages**: a maroon/oxblood achievement card top-right (which on Character covers the "Combat Lv" stat tile outright) and a dark bordered card bottom-right. Neither knows about the other.

**Smallest strong fix:** one stacking context for the corner (a single flex column: toasts → bug → chat, 8px gutter), and fold the achievement card into the bottom-right toast system so there is one notification language. Raise the bug button to ≥2.5:1.
**Owner:** Art (layout + contrast) · Systems (merge the two toast paths).

---

# P3 — eight

### 25 · P3 · ROOM MODALS — `240/139` reads as nonsense
*Capture: `A-room-sawmill.png`*

Upgrade rows print requirements as a single run-on 12.5px line: `240/139 Timber Beam · 120/60 Iron Fitting · 19,722 gold on completion`. Where the player has *more* than needed the fraction inverts and reads like a bug; where they have less, nothing marks it. Four have/need pairs, one line, no colour, no icons. Same fix as #12/#22 — build the have/need atom once.
**Owner:** Art.

### 26 · P3 · HOUSE — Workshop and Shrine share a generic fallback icon
*Capture: `S-house-bottom.png`*

Kitchen, Forge, Garden, Trophy Room and Cellar have distinct painted isometric icons. **Workshop and Shrine both render the same flat generic house outline** — the fallback, twice, adjacent in the list, so it reads as a bug rather than a style.
**Owner:** Asset Director (two icons) · Art (until then, a distinct placeholder each).

### 27 · P3 · CLAN CASTLE — the destructive action is filed under "Treasury"
*Capture: `A-castle.png`*

`TREASURY` heading → treasury figures on its right → and then **"Leave the hold"** rendered directly beneath the Treasury label, inside its block. The one irreversible action on the screen is grouped under an unrelated heading.
**Owner:** Art.

### 28 · P3 · FARM — nine primaries and an invisible disabled state
*Capture: `A-farm.png`*

Eight per-plot filled-gilt `PLANT` buttons + a filled-gilt `Plant all`. And `Water all` in its disabled state is near-identical to the enabled `Auto-replant: off` beside it — same fill, same border, only the label colour shifts slightly.
**Owner:** Art. (Covered partly by #10's fix.)

### 29 · P3 · MODAL FLEET — three different close controls, and a 0% bar you cannot see
*Capture: `M-collection.png`, `M-settings.png`, `A-room-tavern.png`*

Closing a dialog is spelled three ways: a text `Close` button (Settings, More), a circled `⊗` floated on the artwork (room modals), and a square outlined `✕` (Collection log). Pick one.

In the Collection log specifically: the "0% Complete" progress bar is a full-width 2px track with a 0-width fill — literally nothing renders; and the Bestiary/Items control is asymmetric (active half is a filled 244px pill, inactive half is bare text with no boundary). The modal is 790px tall in a 900px viewport and clips its Tier 6 row with no scroll cue.
**Owner:** Art.

### 30 · P3 · NAME CLAIM — the secondary action outweighs the primary
*Capture: `M-namecliam.png`*

With the field empty, `Claim this name` is a muted gilt fill and `Not now` is a solid dark button with a light keyline — so the dismissal is the visually stronger of the two, on a modal whose whole purpose is to get a name claimed. There is also a ~40px unexplained gap between the input and its helper text.
**Owner:** Art.

### 31 · P3 · SKILLS — the tab is called Skills, the panel is called Activities, and half the skills are missing
*Capture: `A-skills.png`*

The Skills panel lists seven: four Gathering, three Artisan. Attack, Strength, Defense, Hitpoints, Ranged, Magic and Prayer are not on it — they exist (the Social → Skills leaderboard has a chip for each) but the screen named Skills doesn't acknowledge them. Its own header says `ACTIVITIES`. For a game whose north star is "all skills to 99" the skills screen shows half the ladder and calls itself something else.

The list also shows level only — no XP bar, no progress to next — so the main skilling navigation surface can't tell you where you are.
**Owner:** Game Designer (IA ruling: does Skills own combat skills?) · Art (the list rows).

### 32 · P3 · HOME — the "Next up" rows disagree about what to show
*Capture: `A-home.png`*

Row 1: `Gather 15 resources · 0 / 15 · 0%`. Rows 2–4: `Smith 8 items · 0 / 8 · 450` (a gold reward). One list, four rows, two different third fields — and row 1 is the only one without a stated reward while being the only one with a filled primary button.
**Owner:** Art.

---

# P4 — two

### 33 · P4 · COZY-LIGHT — the retired theme still paints the nav oxblood red
*Capture: `L-home.png`*

Setting `body[data-theme="cozy-light"]` by hand still works, and the active nav item renders `linear-gradient(rgb(212,74,58), rgb(139,42,31))` — vermilion into oxblood, on the primary navigation, plus a crimson rosette ornament floating over the chat dock at (1310,845) and scroll-corner flourishes on the panel frame. That is the exact palette the Forge & Stone direction was created to kill, still one attribute away.

It is unreachable through the UI (`applyTheme('cozy-light')` removes `data-theme`; the picker lists only hearthlight), which is why this is P4 and not higher — but the retire-or-make-real decision is already owed to Systems, and this is the argument for retiring.
**Owner:** Systems (the decision) · Art (execute).

### 34 · P4 · GLOBAL — twelve unlabeled icon controls
*Capture: `A-inventory.png`, `A-home.png`*

Inventory's category filter is **nine unlabeled ~20px monochrome glyphs** in a row, with no text, no tooltip and no grouping; the active one differs only by a gilt keyline. The topbar's right cluster is **three unlabeled 32×32 buttons** (notifications / save / settings) that carry `title` attributes only — no visible label, no `aria-label`, and no separator from the stat pills to their left.
**Owner:** Art.

---

## Not filed — already tracked, but the rendered evidence says the severity is low

Two items, recorded because the audit measured them and the numbers matter for sequencing. **No action is requested here; these are the existing backlog items.**

- **BACKLOG #8 (chat button, P2).** At 900×820 the chat dock (x 800–885, y 768–802) and the bug button (855, 757) sit **directly on top of the sixth bottom-nav tab, "More"** — its glyph is gone and its label is half-covered. On mobile, More is the only route to Events, Inventory, House, Social and the Store. That is a navigation block, not an overlap annoyance.
- **BACKLOG #19 (text floors, P1, in flight).** The floor pass should know it is chasing `.hr-cl-nm` at **8px**, `.dgn-bop` and `.brand-tagline` at **9px**, and a large `10–10.5px` band (`hr-cs-label`, `hr-cs-door-lv`, `nav-group-label`, `hr-id-badge`, `hr-*-eyebrow`, the Character/Combat stat captions).

## Also observed, deliberately not filed

- The Bounty board and the Store shopfront hold up as rendered — they are the two screens that read as places, and they are the reference for #3, #10 and #11.
- Home is still the strongest screen in the build. The identity band, the ledger and the two-column composition are working; findings 24 and 32 are the only marks against it.
- Console is clean and there is no horizontal overflow anywhere at either width. Whatever else is wrong, the build is not broken.

---

## Reproducing

Server: `python -m http.server 8161` from the repo root. Harness: Playwright with `page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; })` before `goto` — the same seam `tests/run-smoke.mjs:141` uses, honoured on localhost only.

Capture scripts used for this audit (screen sweep, bottom-of-panel sweep, modal fleet via real entry points, wall, geometry/colour measurement, and the whole-app emoji sweep) were written to the session scratchpad at
`C:\Users\tyler\AppData\Local\Temp\claude\R--the-game\248eb06d-5795-48c0-8d1a-07115fdb9957\scratchpad\`
with the ~90 captures under `…\scratchpad\shots\` (`A-*` = seeded/dark/1440, `S-*` = scrolled to panel bottom, `N-*` = 900×820, `L-*` = cozy-light, `M-*` = modals, `W-*` = wall). They are throwaway; the emoji sweep is the one worth promoting into `smoke-test.js` as the guard for finding #1.
