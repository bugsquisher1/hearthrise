# Art Director — running log

_Your private journal. Append what you learn, decide, and change (newest at top). The Coordinator and other agents read this to understand your domain. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- Non-negotiables: 0 emoji as art; "Forge & Stone" medieval; hearthlight (dark) default; earned containment (no wall-of-cards); Alegreya Sans + Cinzel; locked colour roles; wide surface value-ladder.
- Inspect RENDERED screens (preview `hearthrise-qa`, port 8123). Sticky cache — force-reload and confirm the build.
- Apply the design-review standard before declaring done; verify desktop + mobile-landscape.
- Icons = baked atlas `src/data/glyphs.js`. Theme rules must be scoped.

## Log
### 2026-08-08 · Screen-by-screen UI/UX audit (read-only) — `docs/reports/AUDIT-2026-08-08-ui-review.md`

**Scope.** b224 + account wall (`4bda860`). 40+ screen states — wall, every panel, every sub-tab, the castle + all six rooms, the modal fleet — at 1440×900 and 900×820, hearthlight and cozy-light. ~90 captures. **34 findings: 0 P0 · 9 P1 · 15 P2 · 8 P3 · 2 P4.**

**Method worth keeping.** Playwright with the smoke suite's `__HR_TEST_HARNESS__` `addInitScript` seam (localhost-only) is the way to audit this build now that the wall is up — the MCP browser cannot set a global before page scripts run, so it cannot get past the front door. Seed state by writing `G.skills[s] = XP_TABLE[lv-1]` + `window.addItem` directly rather than via `window.Admin` (admin.js is gated behind `?admin=1` and injects its own panel into every screenshot). Overlays must be cleared *before each shot*, not once after boot — the daily-reward scrim and the renown celebration arrive on delays and silently dimmed my entire first pass. And `fullPage:true` is useless here: `.panel` scrolls internally, so a second pass that scrolls the tallest overflowing descendant is the only way to see below the fold.

**The finding that dwarfs the rest: 112 emoji still render as art.** A DOM sweep counting only visible text nodes, over every panel and modal: Stable 22 at **48px** (the entire screen's art), Collection log 32, Events/Dungeons 24, House→Themes 6, Store→Equipment 5, Combat active-effects 4, Settings 4, House→Plot 3. The b217/b221 passes genuinely worked — Home, Character, Inventory, Bounty, Skills, Market, Social, Farm are clean — but every selector `icon-set.js` never listed is still emoji: `.sc-icon`, `.dgn-loot`, `.dgn-icon`, `.iap-icon`, `.at-icon`, `.hr-cl-ic`, `.modal-title`. **The sweep script is the guard we've never had** — it belongs in `smoke-test.js`; a strip-list is a blocklist and it will keep losing.

**Three defects a visual pass alone would have missed, all found by measuring.**
1. **Skills detail is stale by design.** `showTab('skills')` renders only the list; `refreshAll` re-renders the detail *only if `G.activeSkill`*. Until you click a tile, a level-58 skill displays "Level 1 · 0/83 XP" **with padlocks on Oak/Willow/Maple**. Not ugly — untrustworthy.
2. **`character-page.js:225-227`** passes `lv('ranged')` into rows hardcoded `Attack / Strength`, so Melee and Ranged print two different numbers for "Attack" side by side.
3. **Two dialogs render simultaneously.** Settings + the FTUE step-1 card; More + the What's-New sheet. `welcome-modal.js`'s `BLOCKING_OVERLAYS` guard exists but doesn't include `.modal.show` or the FTUE root.

**Against my own standing brief.** The castle's six rooms are the entry affordance Tyler asked to feel like doors and they are a 6-cell bordered text table under a scene band; the room modals behind them are two-tone greybox (the Tavern is an arch, three lines and three plain black rectangles). `ROOM_ART` already draws one illustration per room — cropping those into the door tiles fixes the strip with zero new assets. Also: the Tavern tells the player the Board "needs the **clan-seat-2** migration" — a Supabase filename in shipped copy.

**Colour discipline is slipping in three specific places**, all measured, none of them taste: the clan-boss bar is `linear-gradient(90deg, rgb(178,58,44), rgb(212,99,63))` at 1210×8 rendered **100% full above a caption that says "Unmeasured"**; the Store's nine Buy buttons are the highest-chroma block in the build and read violet rather than sapphire; and cozy-light's active nav is still `linear-gradient(rgb(212,74,58), rgb(139,42,31))` — the exact oxblood Forge & Stone was created to kill, one hand-set attribute away.

**Where the value language is still absent.** House prints met and unmet requirements in the identical `rgb(236,225,204)` (Home colours the same data red); artisan recipe cards state inputs with no have/need and no disabled state; room-modal upgrade rows print `240/139 Timber Beam` which inverts into nonsense when you're over. That is **one atom** — a have/need pair with met/short states — owed to three screens.

**The front door shows nothing of the game.** The account wall is a 402×386 card in a 1440×900 flat-black field (78% empty), with its value proposition stated twice in different words 250px apart. `HearthriseBackdrop.homesteadScene(5)` already exists, is already tokenised, and would fix it behind a scrim for free.

**What holds up.** Bounty and the Store shopfront read as places and are now the internal reference for the Farm (eight diagonal-hatch plots — the most generated surface left), the Market (the last un-themed economy screen) and the castle. Home remains the strongest screen. Console clean, zero horizontal overflow at both widths, on every screen.

**Deliberately not filed** (per brief): #18 nav placement, #19 text floors, the known asset gaps, mobile-portrait, everything in BACKLOG/CONFLICTS. Two are recorded in the report's "Not filed" section because the measurements change their sequencing: at 900px the chat dock and bug button sit **on top of the "More" bottom-nav tab** — the only route to five destinations on mobile, so #8 is a navigation block, not an overlap; and #19 is chasing an 8px floor (`.hr-cl-nm`), 9px (`.dgn-bop`, `.brand-tagline`) and a wide 10–10.5px band.

**Note on overlap with b225 (below).** The audit was captured against `4bda860`, *before* the Clan destination shipped. Findings 3, 4, 25 and 27 are about the castle panel's own composition and the room modals, not its placement, so they survive the move unchanged — but they should be re-verified against b225's panel host before anyone acts on the pixel coordinates.

**Limitations, honest.** cozy-light was checked but shallowly — it is unreachable through the UI, so depth there would have been spent badly. The Stable's 22 companion glyphs are a genuine asset ask, not a mapping job, and I have not confirmed the atlas can cover them. Captures live in the session scratchpad and are not committed; the report names the harness so any of them regenerates in one command.

### 2026-08-08 · b225 (#18) — the Clan Seat gets its own destination

**The ask (Tyler, P1).** "The clan page needs to be different than the social/leaderboards tab... it should be easier to find."

**Placement decision.** New top-level sidebar entry labelled **Clan**, in a new group **Realm**, sitting directly under House. Reasoning:
- *Why top level at all* — DECISIONS 2026-08-08 makes the clan castle and the personal homestead the twin ultimate progression pillars. One of them had a nav entry (House); the other was the bottom half of a card underneath the leaderboards. Peers in the design have to be peers in the navigation. Events earned the same promotion in b220 for the same reason.
- *Why "Clan" and not "Castle" / "Clan Seat"* — "Clan" is the word the player already uses (it is the word Tyler used). "Castle" names a room ~90% of players do not own yet, so it would be a lie for anyone without a clan, and "Clan Seat" is internal vocabulary. One word also matches every other entry in the rail and survives the icon-rail tooltip.
- *Why a "Realm" group instead of extending "Homestead"* — a clan castle is explicitly NOT the homestead. Everything under Realm involves other players: Clan (your hold) and Social (the wider world's boards + friends). Social moving under it also finally explains what Social is now that the clan left it.
- *Position* — first in its group, one row below House, so the two pillars are adjacent across the divider.
- *No-clan state* — the entry never dead-ends. Signed out → "Your hold awaits" + Sign in. Signed in, no clan → "Find a hold, or found one" + the live clan list + the found-a-hold field. In a clan → the castle.
- *Mobile* — the 6-slot bottom nav is full, so the More sheet carries it, second, directly under Events (exactly what b220 did). No emoji on the new entry.

**Clan Activity moved with the hold, Friends stayed in Social.** The feed's subject is your members and its audience is your hold — leaving the one true clan surface inside Social is the defect #18 names. A friend list is cross-clan and global, so it belongs beside the leaderboards. Consequence: Social = the wider world (rankings + friends); Clan = your hold.

**Second door.** The topbar clan tag `[Emberfall Watch]` is the only place a player's hold is named on every screen, so it became a `<button>` routing to the Clan Seat. Styled to stay the quiet gilt tag it always was (verified: Alegreya Sans SC, 11.5px, 22px tall, pointer, focus ring).

**Two things the move broke, and the fixes.**
1. *The rail overflowed.* `.sidebar` was `overflow:hidden` at `height:100vh`. At 1440x900 the list already stood 25px from the edge before this (two more entries — Stable, Market — are injected at runtime), so the new entry pushed the connection indicator off-screen with no way to reach it. The rail now scrolls (`overflow-y:auto`, `overscroll-behavior:contain`, `.sidebar > *{flex-shrink:0}` so nothing gets squeezed instead). Verified: scrollHeight 955 / client 900, foot reachable, brand 108px, tap targets still 44px. This is also the right answer at 10x content — an OSRS-scale game keeps adding destinations, and a nav that cannot grow starts hiding things.
2. *Measure.* Inside Social the castle was a ~330px column, so `.hr-cs-line`'s space-between read as a label/value pair. At full panel width the same rule put "Treasury" and "42,500 gold" 1,200px apart. Capped the stacked lines, the find-or-found list and the Social signpost to a 760px column; the hold band, the six doors and the three-column week strip still take every pixel. **Lesson: a component tuned inside a narrow column does not survive being promoted to a full screen — re-check every space-between row when you widen a screen.**

**Files.** `index.html` (nav entry + Realm label + `#panel-clan` + More entry + Social card head + clan-tag button), `src/legacy.js` (showTab aliases + `renderClan`/`syncClanActivity`/`clanDisplayName`, Social's clan half became friends + signpost, `injectFriendsStub` retired), `src/features/clans.js` (hosts `#clan-panel`, owns `renderClan`, `refreshClanScreens`), `src/features/clan-seat-ui.js` (**hosting only** — `renderIfOpen` looks at `#panel-clan`), `src/features/icon-set.js` (`clan: 'uiCastle'`), `src/styles/clan-seat.css` (all of #18's CSS, one place, loads last), `src/styles/legacy.css` (the rail scroll fix), `src/chat.js` + `src/features/raids.js` ("join a clan" CTAs now have a destination), `src/features/smoke-test.js` (2 guards).

**Verified.** Static server :8157, Playwright with the `__HR_TEST_HARNESS__` init-script seam to get past the account wall. Desktop 1440x900, tablet 1100x820 (icon-rail: labels hidden, glyph correct), narrow 430x900. Hearthlight AND cozy-light (forced — the picker ships one theme now). Rendered the real castle via `_setClan`/`_setSeat`: hold band, six doors, standing bar, week strip, room modal all correct in the new home. Find-or-found state, Social's leaderboards + friends + signpost, More-sheet route, all five `showTab` aliases, activity card toggling with membership, 0 emoji in the touched chrome, 0 console/page errors. Smoke **296/296** (294 + 2 new), `bump-version.sh --check` OK, no bump.

**Known limitations.**
- A tier-1 hold leaves the lower ~40% of the screen empty. That is content depth, not layout — it fills as the hold grows. Worth a Designer look if it still reads thin once Work Orders are live.
- The Clan Activity feed is still a stub empty state (it was in Social; it is now in the right place). Real events need a server feed — Systems.
- The mobile More sheet's older labels still carry emoji (Items/House/Social/Store/Chat/Save/Settings). `icon-set.js` strips them at runtime so nothing renders, but the markup should be cleaned and given atlas glyphs. Not mine this wave.
- FTUE never referenced Social or clans, so no tour step needed changing. If a clan step is ever added it should target `button[data-tab="clan"]`.

### 2026-08-08 · Standing brief — castle beauty pass (from Tyler)
Castle blocks (stone/masonry) as the page's material language; every building clickable → a modal that feels like the INSIDE of that room (tavern warmth, vault iron, forge heat...), each carrying its upgrade ladder. Quality over speed — Tyler explicitly budgeted time for refinement. Build on the validated scene-composition craft.

### 2026-08-08 · Product-owner validation
Tyler on the b221 bounty board: "looks awesome." The scene-composition approach (in-world object + drawn SVG craft + readable type on scene surfaces) is now the validated standard for screen identity work — apply it to the castle panel beauty pass and any future screen that should feel like a place.

### 2026-08-08 · Wave 3a — the CSS substrate (b222)

**Purpose.** Pay down the debt that taxes every new screen: the b174 `!important` blankets, the unscoped stragglers, and the inert cozy-light CSS. Structural pass, not a redesign. Files: `theme-cozy.css`, `board-and-shop.css`, `smoke-test.js` (guards only).

**Method — and this is the part worth keeping.** Eyeballing 36 screens cannot prove "unchanged". I built a Playwright harness that, for every screen × both themes, dumps the computed value of 17 properties for **every visible element** plus a screenshot, and diffs two runs. Baseline noise: **0 style differences, ~0.013 % pixels** (only the muster countdown, after seeding `Math.random`). That turned every decision from taste into measurement, and it caught four things a visual pass would have missed. Anyone doing CSS surgery here should rebuild it before touching anything.

**Debt 1 — the blankets. What they actually were.** The b174 comment says they exist to beat unscoped `#panel-x * {color:#3d2817!important}` cocoa rules. b216 already scoped those to `cozy-light`, so the stated reason is gone — but the blankets are now load-bearing in their own right, and they fight *other `!important` rules in the same file*. Deleting them is not available. What IS available is to stop them reaching where they are **wrong**: an in-world surface (parchment, lit counter wood, a scene band) is lit by its picture, not by the theme.
- Added one carve-out — `:not(.bb-board,.sc-scene,.sc-counter,.iap-card, …descendants)` — to the six hearthlight blankets that a matched-rule audit proved were the *only* `!important` colour rules reaching those subtrees. Same string everywhere, greppable, documented with an add-a-root instruction.
- **`board-and-shop.css`: 35 stacked-id selectors → 1**, and every `!important` that survives is now attributable. It is 30 `color` + 4 `.iap-card` surface + 1 `border-left-color`, and *none of them are for hearthlight* — they are Cozy Day's mirror blankets (untouched on purpose) and one mobile media query. The header states the exit condition: delete Cozy Day, delete its blankets, and they all go.
- **Found the blanket re-asserting a b216 fix.** Blanket B carefully excludes `.ribbon/.chip/.btn-*` so filled controls keep their own contrast — and blanket A, one id lower and with no carve-outs, put `--ink` back on them anyway. Live consequence: **cream "Buy" text on struck gilt, and cream coin glyphs on parchment price tags (~2:1)** in the shop, for months. The carve-out let board-and-shop's own ink land: dark on gilt, dark on paper, sapphire on the premium packs.
- **Deleted an impossible selector.** `body[data-theme="cozy-light"] body[data-theme="hearthlight"] #panel-profile *` — b216's rescoping script prefixed a *comment*, and a comment is whitespace to the tokenizer, so the prefix glued itself to the next selector. Two `<body>` in one chain = never matches. **Home has rendered without the readability blanket since b216 and is the best-looking screen in the game.** That is the exit criterion now written into the file: a screen leaves the list when it stops needing it. A second instance (`body[…] body`) was found by the new guard.

**Debt 2 — the stragglers. 25 of them, and two were live.** Every rule in the "cozy-light component fine-tuning" block was a pair: `body[data-theme="cozy-light"] X, :root X`. `:root` is `<html>`; the theme attribute is on `<body>`; so the second half matched under every theme. Deleted all 25 `:root <descendant>` halves. Two were visibly painting:
- `.nav-btn.active` — the light theme's flat fill plus a **real 3px `border-left`**, which defeated b217's gilt wash and put a second spine beside the intended inset one. It also pushed every active nav label 3px right, so the selected item never lined up with the others. Both fixed.
- `.status-pill` — wore the light theme's plate and keyline.
- (`#hr-bug-btn` too, but the delta is a hairline.)

**The one that only exists on phones.** `:root .bottom-nav` set `linear-gradient(#e8d4a0,#ede0b8)` — so **the mobile bottom nav has been a cream parchment bar under the dark theme on every portrait phone**, with grey-on-cream labels. Invisible to every desktop pass ever run, including mine until I built a 420×820 sweep. Now dark. Lesson: any theme-leak audit that does not open a phone viewport is incomplete. (Follow-up: the value it falls back to is `rgba(8,15,22,.96)` — a *cool* blue-black in a warm theme. Reads near-black in situ, but it should be a `--bg-*` token.)

**Debt 3 — 636 lines / 28 KB of dead CSS deleted, with zero computed-style change.** Two provable criteria only:
- 296 selectors that were **literal duplicates inside their own rule's list** (no-ops).
- 171 selectors + 23 whole rules whose class/id hooks **appear nowhere** in `index.html` or any `src/**/*.js` — verified by regex over the full shipped corpus with a word-boundary guard, then spot-checked by hand. They are stale renames: `.invc-bag` (the real one is `.invc-bag-col`), `#quests-strip` (`#global-quests-strip`), `.ftue-tooltip/.ftue-next/.ftue-button` (FTUE ships `.ftue-card/.ftue-btn`), `.stat-val` (`.mp-stat-val`), plus `.qbtn/.bag-grid/.tier-tab/.suggested-card/.welcome-card/.item-detail`…
- Plus 3 rules byte-identical to a later rule with the same selector and `@media`.
- **Deliberately kept:** everything scoped to `cozy-light` whose hooks still exist (that theme must stay pixel-identical); 8 rules with comments interleaved in their selector list; anything reached by `[class*="…"]`. When in doubt it stayed. CURRENT_STATE's "~3,000 lines" is the *plausible* number once Cozy Day is actually retired; 636 is what is provable while it is still selectable.

**A false start worth recording.** My first dead-code cutter deleted raw *lines*. It corrupted brace pairing and left the sheet parsing as 7 rules instead of 652 — and the screenshot diff looked merely "wrong", not "broken". The fix was to rebuild each rule's **selector region** instead, and to verify by parsing both files with the browser's own CSS engine and asserting *nothing new or changed* in the output. Never line-edit CSS; edit regions and verify with a parser.

**Guards (b222 suite, 221 → 225).** Each one was proved to fail by re-introducing its bug at runtime, not assumed:
1. no always-true `:root <descendant>` in **any** sheet (b216's guard only knew `html:not([data-theme])`, only in one file);
2. no selector chaining two `<body>`/`<html>` — the comment-prefix accident;
3. **the blankets stay out of in-world surfaces** — builds a synthetic `.bb-board`/`.sc-counter`/`.iap-card` fixture and asserts no foreign `!important` colour rule matches it, so the next in-world screen never has to start an arms race;
4. `board-and-shop.css` never stacks panel ids (≤1).

**Verified.** Static server :8148. 36 screen×theme combinations swept at 1440×900 (home, character, inventory, combat, bounty, shop ×3 tabs, skills, artisan detail, farm, house, social, events, market, stable, dungeons, settings), each also captured scrolled to the bottom of its panel; plus a 20-combination mobile sweep at 880×420 landscape and 420×820 portrait. Both themes throughout. **Cozy Day: exactly one computed-style difference in the entire sweep** (a `border-bottom` on the last shop row, see limitations). Hearthlight differences are all listed above. Smoke **225/225, 0 runtime errors**; `bump-version.sh --check` OK; `findUiOverlaps()` empty; console clean apart from the pre-existing offline Supabase 404.

**Known limitations / handoffs.**
- **Cozy Day is not actually selectable, and the code says two different things.** `theme-picker.js` lists only hearthlight, and `applyTheme('cozy-light')` *removes* `data-theme` rather than setting it — so the ~900 `body[data-theme="cozy-light"]` rules can only be reached by setting the attribute by hand. Someone should decide: retire it properly (then ~2,400 more lines and 30 `!important`s fall out of this pass automatically) or make it real. **Systems decision, not mine to take alone.**
- `home-dashboard.js:182` injects `'html:not([data-theme]) …'` from JavaScript — the exact always-true pattern b216 killed, in a place CSS guards cannot police (my guards skip sheets with no `href`, or they would fail on every injected style). **Systems handoff.**
- The mobile bottom nav's new (correct, dark) background is a cool blue-black; it wants a warm token.
- The companion rows in the shop's Equipment tab are injected by a `setInterval(…, 1500)` poll, so they can take up to 1.5 s to appear. Not cosmetic — it made my screenshot harness non-deterministic until I raised the settle time. **Systems handoff.**
- One intentional visual difference in Cozy Day: the last row under "Under the counter" loses a 1px hairline. b221's own `.shop-row:last-child{border-bottom:0}` had been defeated by its author's 3-id rule; collapsing the ids let the author's intent apply.

### 2026-08-08 · Wave 2b — the board is a board, the shop is a shop (#5)

**The ask (Tyler).** "The bounty board should feel more like an actual 'board' and the 'shop' should feel like a shop.. a little chick behind a counter with offers on the table."

**The board.** `#bounty-board-body` was three bordered rows in a card — a list that happened to be called a board. It is now a built object: timber frame, a top beam with a lantern hung off it, a recessed plank field lit from that corner, and each bounty a parchment notice nailed to the wood. Pin x-position and sheet rotation are **indexed constants, never `Math.random`** — the panel re-renders on every kill, and a board whose notices jump each repaint is not furniture. Notices are `auto-fill minmax(202px,1fr)`, so the tier-2 board's extra bounties post without a code change. The claimed bounty **stays on the board**, over-stamped with one oxblood clerk's stamp (`mix-blend-mode:multiply`, struck at -11°) — one strong device, not a torn corner *and* a stamp *and* a tint.

**The shop.** `#shop-panel` was a price list. It is now a shopfront: an SVG band of a lit interior — shelves, a shuttered window at dusk, strung herbs, a burning lantern, a keeper leaning on her counter, and **a hen sitting on the wood beside the wares**. "A little chick behind a counter" is genuinely ambiguous (a young woman, or a bird); the scene answers both rather than guessing. The counter's top surface runs out of the picture and *becomes* the offers list — same wood, same lighting — and each ware sits on a stitched cloth mat with a notched price tag. At ≥1060px the offers go two-across, because one column on a 1,080px counter left a 500px void down the middle of every row.

**Three craft failures I had to walk back, in order:**
1. **Wrong aspect, again.** I drew the scene at 900×200 and dropped it in an 8:1 strip; `slice` cropped 100 viewBox units off the top and only the keeper's shoulders survived. Exactly the b219 hearth-band lesson. Fixed by authoring at 1600×200 and pinning `.sc-scene{aspect-ratio:8/1}` so the frame and the drawing agree.
2. **Rim light by offset copy reads as a sticker.** Drawing the silhouette twice, offset toward the lantern, outlines the figure on *every* side. The rim is now an **open stroke along the lit contour only** — crown, brow, cheek, jaw, neck, shoulder, the fall of the skirt.
3. **A circle on a mass is not a person, and one closed blob is not a hen.** First keeper read as a lollipop; first hen as a lump. Both are now hand-authored contours with separate parts (coif, apron, forearm / tail, body, neck, head, comb, wattle).

**The blanket problem, named.** `theme-cozy.css` carries the b174 readability blankets — `#panel-bounty#panel-bounty *:not(…){color:var(--ink)!important}` and `#panel-shop#panel-shop [class*="card"]{background:var(--bg-2)!important}`. Parchment and lit counter wood are **light surfaces in both themes**, so those blankets put parchment ink on parchment. `!important` cannot be beaten by specificity alone, so every contested declaration in `board-and-shop.css` repeats `!important` at three ids. That is documented at the top of the file, and it comes off with the blankets whenever they are deleted (already listed as debt in CURRENT_STATE). New sheet rather than appending 400 lines to a 5,000-line file, and it keeps this wave's footprint off the file another agent may be editing.

**Emoji found live on both screens (0-emoji rule was being violated):**
- Bounty: `🎯` ×6 whenever a bounty was **active** — `.bounty-title` is not in `icon-set.js`'s strip list, so the 1.2s sweep never touched it. Plus the panel title, the More-sheet entry, the Marks price, and three toasts.
- Shop: the four cosmetics shipped `icon:'✨'/'🐲'/'🦅'/'😎'` straight into `.si` — the sweep only covers `#panel-bounty .si`, so they had been live for months. Now baked-atlas glyphs. `avatar_dragon` asked for `dragon`, which lives in `HR_MONSTER_GLYPHS` not `HR_GLYPHS`, so `HR.icon` would have drawn nothing — it uses `navProfile` (the thing the cosmetic actually changes).

**Real money is sapphire now.** The store's Buy button was `btn-primary` — the identical struck-gilt control that spends in-game gold one card lower on the same screen. `art-direction.css §6` already reserves sapphire for real money; the store now uses it, along with a sapphire card-head keyline, cool-cast card surfaces, sapphire ribbons and price ink. Gem-priced cosmetics on the warm counter keep sapphire on their tag *and* their art, so a row agrees with itself about which currency it wants.

**Bug found and fixed in passing (P2, not cosmetic).** Top-level `const` in a classic script lives in the global *lexical* scope, not on `window` — so `window.SEED_SHOP`, `window.EQUIP_SHOP`, `window.IAP_CATALOG` and `window.TRAITS` were all `undefined`. Three shipped consumers were silently degraded by their own `|| []`: `item-ux.js:28-29` ("buy another" affordance), `admin.js:458-459` (obtainable-item audit), and — worst — **the b215 "no purchasable XP multiplier" guard, which has been iterating an empty catalogue and passing vacuously since it was written.** Published the four the way b220 published `DAILY_TASK_POOL`. That guard is real again.

**Contrast fixes made from measurement, not taste:** notice tertiary ink was 4.3:1 on parchment (→ `#63503a`); the Cozy Day counter was a golden-hour tan carrying cream scene-ink at ~2.2:1 — the counter now holds the **same value range in both themes** on purpose, because the type on it reads the `--scene-ink*` roles, which stay light in both.

**Verified:** static server :8145, hearthlight default. Desktop 1280×800 and 1440×900; narrow 900×760 (mobile layout, bottom nav); scene inspected 1:1 at 800px viewport. Both screens in every state: empty board, 3-notice board, claimed/stamped board, and shop seeds/equipment/cosmetics tabs. Cozy Day checked on both. FTUE welcome modal + the 6-step tour spotlight overlay the bounty screen correctly. Combat's compact "Active bounty" pill still renders and no full board leaks into `#panel-combat`. No horizontal overflow, no 404s, 0 console errors from these screens. Smoke **211/211, 0 runtime errors** (206 + 5 new); `bump-version.sh --check` OK.

**Known limitations (honest):**
- The shopfront is **flat vector silhouette art**, not painting. It reads as a lit room with a person and a bird in it, and it is cohesive with the b219 hearth band — but next to `dungeon.jpg` or the painted item icons it is clearly a different medium. A painted plate would beat it.
- The bounty panel still has a large empty area below the Unlocks row at desktop height. That is the screen having little content, not the board; inventing filler would be worse.
- The monster portraits on the notices are the painted PNGs desaturated and multiplied into the paper. It reads as a printed woodcut, which is the intent, but at 44px the detail is nearly gone; a purpose-drawn line portrait set would be better.
- `#panel-combat` still renders ~16 emoji (equipment-slot icons, `EQUIP_SLOT_META`). Out of this wave's region — flagged for Systems.

**Asset Director brief (non-blocking).**
1. **A shopkeeper NPC portrait.** `assets/icons-bundle/` ships exactly one human: `painted/npc/player.png`, which is the player's own avatar and would read as the player serving themselves. `_archive/reserve-art/monster-portraits/` (NOT shipped) holds painted human busts — `Duke_nb.png`, `Warrior_nb.png`, `ElfMage_nb.png`, `Cultist_nb.png` — in exactly the shipped painted style. `Duke_nb.png` is a strong merchant/keeper candidate. Promoting one (or commissioning a keeper in that style) would let the scene swap the SVG figure for real art.
2. **A painted shopfront plate, ~1600×200 (an 8:1 band):** dark timber interior, shelves of stock, one warm lantern as the only light, a counter running the full width with its top edge at ~82% height so the offers list continues it. Same treatment as `backgrounds/dungeon.jpg`. Drops straight into `SHOP_SCENE` as an `<img>`.
3. **A hen/chick icon** — `reserve-art/monster-portraits/Animals_*.png` are a dolphin, a falcon and others; there is no chicken anywhere in the library, shipped or archived. Tyler asked for one by name.
4. Still open from b219: painted dusk homestead plates per property tier.

### 2026-08-08 · Wave 1 — Home: no background, dead space (#6)

**Root cause of "no background".** `backdrop.js` (b158) has drawn a full-screen dusk scene since b158 — and it has never been visible on a single screen. `body` paints an opaque `--app-bg` and every `.panel` paints an opaque gradient on top of that, so `#hr-backdrop` (z-index 0, fixed) is fully occluded everywhere. Un-painting the shell would drag every other panel with it, so Home now composes a scene INTO the page instead of hoping to see one behind it.

**The hearth band.** The top of Home is a full-bleed dusk vista of the player's own holding (`HearthriseBackdrop.homesteadScene(tier)`, new in backdrop.js), with the identity block standing on it bottom-left and the day's ledger (XP / kills / harvest) in the dark right corner. Authored at **1600x300 — the band's own aspect**. My first cut was drawn at 1600x420 and sliced into a 5.6:1 strip: the whole ember horizon fell below the crop and all that survived was dark sky and a black ridge. Draw for the frame you have.

**Tier-aware, so the picture never lies.** camp → cottage (+barn/haystacks/windmill at farmstead) → hall + watchtower → castle with banner. Verified at tiers 0, 2 and 5 in the browser. Every colour is a `--scene-*` token in `theme-cozy.css` (dark + a golden-hour cozy-light set); SVG elements carry classes, nothing hardcoded.

**Things that read as "generated" and had to be fixed:** flat-fill glow ellipses render as hard-edged amber lozenges floating in the sky (→ radial gradients); concentric stacked smoke puffs read as bubbles (→ downwind drift + thinning); plain box+triangle buildings read as cardboard (→ lean-to, chimney cap, rim light on the sunward roof edge, lit tent flap standing on the ground rather than a lit rectangle inside the canvas).

**Type on a picture gets its own ink role.** `--scene-ink/-2/-3/--scene-gilt` stay light in BOTH themes, because the background of that type is the scene under a scrim, not the theme surface. Reading `--ink` there put cocoa text on a sunset in Cozy Day.

**Dead space.** Columns were 364 (left) / 490 (right) with ~200px of unexplained panel below. Now 580 / 561, no void, composed only from systems that already existed: **Your holding** (left — homestead tier, what it grants, next tier + its cost with shortfalls in red, door to House) and **The realm** (right — the daily + weekly world events, which change every skill's speed and were only ever stated in a one-line ticker pinned behind the chat button). "Today" moved out of the rail and onto the band as the ledger. Band height is `clamp(104px,24vh,204px)` — always ~a quarter of the screen, generous on a monitor, never eating a landscape phone's working area.

**Regression found and fixed (was live since b216).** `backdrop.js` carried Home-scoped overrides written when Home floated transparent cards over the global backdrop. At two IDs + an attribute they outranked home-dashboard's own CSS and silently undid the b217 pass: `.hd-card` got an opaque plate plus a 10px `backdrop-filter` (12 blurred layers per render, for a picture that is not behind them) and `.hd-mile-badge` lost its struck-metal disc to a flat 5% white — that is why the milestone/renown/daily badges read as grey pucks. Deleted; verified `backdropFilter` count 12 → 0 and the radial disc restored.

**Emoji.** Homestead tiers (⛺🏡🌾🏛️🏰👑) and world events (🔥🎪⛏🌾📜🌙🍲🕯⛰🥁🛠) both carry emoji in their data. Home maps every id onto the baked atlas (`HOLDING_GLYPH` / `EVENT_GLYPH`); 0 emoji in the Home DOM, verified by regex over `#hd-root`.

**Verified:** static server :8131, hearthlight default. Desktop 1400x900, 1000x820 (icon-rail), 900x760, 900x600, mobile-landscape 880x420, portrait 420x820. FTUE welcome modal + the 6-step tour + the daily-reward modal all overlay Home correctly. Cozy Day checked (legible, not broken). 0 console errors, no horizontal overflow. Smoke 177/177, 0 runtime errors; `bump-version.sh --check` OK.

**Known limitations / handoffs:**
- No regression test added — `src/features/smoke-test.js` was outside my allowed files this wave. **Systems/QA should add one**: Home renders `.hd-hearth` with an `.hrs-svg` child, `#hd-root` contains 0 emoji, and `.hd-mile-badge` keeps a `radial-gradient` background (that last one is the guard for the b216 override class of bug).
- The **global** `backdrop.js` `scene()` is still hardcoded hex and still 100% occluded on every screen. It should either be deleted or the shell should be made translucent deliberately — a decision, not a patch. Not mine to take alone.
- Beta-notice modal still renders literal emoji (🌱, 🐛) in its copy. Still Systems/content.

**Asset Director brief (non-blocking).** The band is CSS/SVG silhouette art because no painted homestead plate exists (`assets/icons-bundle/backgrounds/` holds only `dungeon.jpg`; `assets/bg/homestead-scene.svg` is bright golden-hour vector from the cozy era and is referenced nowhere). Wanted: **painted dusk homestead plates, ~1600x300 (a 5:1 band), one per property tier** (camp / cottage / farmstead / manor / keep / castle), matching `dungeon.jpg`'s treatment — warm desaturated CraftPix-adjacent painting, subject right of centre, left third readable-dark for the identity block, ember horizon, lit windows. They drop straight in behind the existing scrim by swapping `homesteadScene()`'s body for an `<img>`. Do NOT compose one from `assets/icons-bundle/buildings/*_nobg.png` — those are 3/4-isometric icons with baked ground patches; lined up on a horizon they read as stickers.

### 2026-08-08 · Wave 0 — type scale (#1) + brand wordmark (#2)
**#1 Text too small.** Root cause: ~700 font-size declarations hardcoded in px across `legacy.css` / `audit-overrides.css` / `art-direction.css` (base body was 14px), so a token-only bump would leave row titles/nav/chrome behind and break hierarchy. Fix: uniform proportional scale (~x1.13, rounded to 0.5px) applied mechanically to all reading/UI text in the 7-26px range across the three sheets (hero/celebration display >26px left alone), plus the 8-step `--t-*` token ramp raised to match (body 14->16). Ramp ratios preserved, so hierarchy is unchanged — only the base grew.

**#2 Logo.** The old mark was a light-background crest asset (`assets/brand/hearthrise-logo.svg`) whose dark-brown wordmark sat at near-zero contrast on the near-black hearthlight sidebar — that is why it "looked bad." Replaced the `<img>` with a real game-logo lockup: a compact inline-SVG rising-sun/hearth shield emblem drawn to read on dark, above "HEARTHRISE" in gilt Cinzel caps (ember->struck-gold gradient via background-clip, ember glow + dark contact edge) with a tracked "IDLE HOMESTEAD" SC tagline, on an incised rule. Vertical/centred because the sidebar is only 180px (a horizontal lockup clipped to "HEARTH"). Collapses to emblem-only in the <=1180px icon-rail. SVG file kept for the favicon.

**Verified:** preview on :8131, hearthlight. Screens inspected at desktop: home, character, inventory (+ overflow check: no document/button overflow), skills — all clearly legible, hierarchy intact. Smoke 175/175, 0 runtime errors; `bump-version.sh --check` OK.

**Limitation:** this browser env pins innerWidth at 1745px; `resize_window` had no effect, so mobile-landscape + icon-rail could not be screenshotted. Scaling was applied uniformly inside the mobile media queries so the ramp holds there, but QA should confirm on a real narrow viewport.

**Asset Director brief (non-blocking):** a bespoke drawn wordmark could beat pure type later — horizontal primary lockup + standalone crest emblem, gilt-on-dark SVG + light variant, sized for 180px sidebar / 64px rail / wide Steam capsule. Build on the rising-sun-over-hearth-shield emblem now in CSS.

**Also spotted (not mine to fix):** a beta-notice / welcome modal renders literal emoji (🌱, 🐛) in its copy — violates the 0-emoji-as-art rule. Owner is content/onboarding (Systems). Flagged to the Coordinator.

### 2026-08-08 · bootstrap
Domain seeded from project memory (`art-direction-system`, `design-review-standard`, `art-direction`). No active task. b217 art pass is live.
