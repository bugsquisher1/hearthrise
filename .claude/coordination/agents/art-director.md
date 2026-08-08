# Art Director — running log

_Your private journal. Append what you learn, decide, and change (newest at top). The Coordinator and other agents read this to understand your domain. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- Non-negotiables: 0 emoji as art; "Forge & Stone" medieval; hearthlight (dark) default; earned containment (no wall-of-cards); Alegreya Sans + Cinzel; locked colour roles; wide surface value-ladder.
- Inspect RENDERED screens (preview `hearthrise-qa`, port 8123). Sticky cache — force-reload and confirm the build.
- Apply the design-review standard before declaring done; verify desktop + mobile-landscape.
- Icons = baked atlas `src/data/glyphs.js`. Theme rules must be scoped.

## Log
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
