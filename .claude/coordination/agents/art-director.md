# Art Director — running log

_Your private journal. Append what you learn, decide, and change (newest at top). The Coordinator and other agents read this to understand your domain. Team-wide items also go to `DISCOVERIES.md` / `HANDOFFS.md`._

## Standing knowledge
- Non-negotiables: 0 emoji as art; "Forge & Stone" medieval; hearthlight (dark) default; earned containment (no wall-of-cards); Alegreya Sans + Cinzel; locked colour roles; wide surface value-ladder.
- Inspect RENDERED screens (preview `hearthrise-qa`, port 8123). Sticky cache — force-reload and confirm the build.
- Apply the design-review standard before declaring done; verify desktop + mobile-landscape.
- Icons = baked atlas `src/data/glyphs.js`. Theme rules must be scoped.

## Log
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
