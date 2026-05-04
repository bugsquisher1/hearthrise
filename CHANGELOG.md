# Hearthrise — Changelog

The welcome modal reads this file on first load after a new build. New entries
go at the top. Format: each version is a `## v0.x.x — YYYY-MM-DD` heading,
followed by bullets. Keep entries short and player-friendly (not commit-log style).

## v0.9.1-beta build 123 — 2026-05-04 (b122 cascade hotfix)

After verifying b122 on the deployed iframe, the feat-buttons stayed as a vertical stack and the topbar still wrapped to two rows. Diagnosed: an earlier `html:not([data-theme]) #panel-profile .feat-buttons { display: flex !important }` rule (specificity 0,1,2,1) was outranking the b122 mobile rule (specificity 0,1,1,0). My `display: grid !important` from b122 lost to a more-specific theme rule.

- 🎯 **Re-emit feat-buttons grid + topbar nowrap with theme-prefixed selectors** so specificity ties and last-loaded wins. Covers `.feat-buttons`, `.profile-toolbar`, `.profile-actions`, `.prof-toolbar`.
- 📜 **Topbar now horizontally scrolls on portrait** when stats overflow — better than wrapping. Stats labels (CL, TL, GOLD, GEMS) hidden on portrait, restored on landscape. Avatar shrunk to 28px.

## v0.9.1-beta build 122 — 2026-05-04 (mobile QA + UI/UX sweep, pass 1)

Tyler ran a senior-tester pass and found the mobile experience nowhere near ship-ready. First batch of fixes:

- 🪙 **Skill tile icons fixed.** Every skill in Activities was rendering as a broken-image square because `_skillIcon` pointed at `assets/raw-bundle/...` paths that aren't in the deploy. Cleared the map so each skill falls back to its emoji glyph (matches the cozy theme anyway). Real curated PNGs land in a later build.
- 🟧 **Topbar avatar fixed.** Player avatar was a 404 dark square (`icons3/.../BoldWarrior_nb.png` not deployed). Swapped for `assets/icons-bundle/monsters/Warrior_nb.png` with an `onerror` fallback to ⚔️ emoji.
- 🟪 **Wax seal off on mobile.** Profile's bottom-right wax-seal ornament covered the Lifetime Stats + Save Status cards on portrait phones. Hidden under the mobile media query (still ships on desktop).
- 📐 **Profile feat-buttons in a 2×2 grid** on portrait, 4-across on landscape. Was a vertical stack eating half the viewport.
- 🧱 **Character page kills right-side bleed.** `#panel-character`'s grid is forced to a single column with `max-width:100%` and `box-sizing:border-box` everywhere on mobile.
- 📏 **Topbar compact.** One-row layout, smaller pills, name truncates to 90px, hidden empty `<img>` orphans.
- 🛡 **Combat FOES sub-tab DUNGEONS button** wraps cleanly without overflowing the title row.
- 🔴 **Inventory action buttons** themed wax-stamp red so they read as primary actions instead of disabled-looking ghosts. Ghost/secondary buttons preserved.

Pass 2 (landscape) and Pass 3 (interaction polish) still to come.

## v0.9.1-beta build 121 — 2026-05-04 (screenshot ignores the modal itself)

b120 shipped screenshots inline in Discord — but they captured the bug-report modal that was on top of the screen, defeating the point. Tyler wants to see what's BEHIND the modal, not the form he just filled out.

- 🚫 **html2canvas `ignoreElements`** filters out: `#hr-bug-modal` (the form), `#hr-bug-btn` (the floating 🐛), `#chat-dock` (when open), `#more-modal` (the mobile More sheet). The screenshot now shows the actual game state the user was reporting on.

## v0.9.1-beta build 120 — 2026-05-04 (Discord screenshots inline)

Bug reports were capturing screenshots (b117) but the direct Discord webhook path was sending JSON-only embeds, so the image never appeared in the message. Tyler asked to see it inline.

- 📸 **`sendDiscord` now uses multipart FormData** when a screenshot is present. Image attaches as `screenshot.jpg`, embed's `image.url` is set to `attachment://screenshot.jpg`, Discord renders it inline below the metadata fields.
- 🟫 **Webhook author renamed** to `Hearthrise Bug Bot`, embed color changed to wax-stamp red `0xd44a3a` to match the in-game theme.
- 🆕 **Viewport added** as an inline field — useful for mobile-vs-desktop bug triage.
- 🛟 No-screenshot fallback preserved (JSON-only embed) for cases where html2canvas fails.

## v0.9.1-beta build 119 — 2026-05-04 (SW kill-switch + renderProfile null guard)

Tyler reported "auth not configured" on the live site. Console showed an error torrent: `TypeError: Cannot set properties of null (setting 'textContent') at renderProfile (legacy.js?v=111:1297)`. Two issues:

1. **Old service worker still alive.** Errors stack-trace to `legacy.js?v=111` even though the deployed HTML is at v=118 across all script tags. The pre-b111 SW (cache name `hearthbound-v2`, cache-first strategy) is still intercepting requests in installed browsers and serving stale JS — including the SW reference itself, so it can't update itself.

2. **`renderProfile` crashing on null DOM.** When `onAuthStateChange` fires before the Profile panel template is in the DOM, `getElementById('dash-user-sub')` returns null → `.textContent =` throws → error boundary captures it → infinite re-render loop because the auth listener also re-fires on render.

Fixes:

- 💀 **SW kill-switch** added as the very first inline `<script>` in `<head>`. Runs before any SW can intercept. Detects old `hearthbound-v2` cache, deletes it, unregisters the SW, reloads once. `sessionStorage` flag prevents reload loops. Idempotent — does nothing if no old cache exists. After this self-heals, the b111+ network-first SW takes over and future updates propagate normally.
- 🛡️ **Null guards in `renderProfile`** for `dash-user-sub` and `dash-user-body`. If either is missing, bail early instead of crashing. Stops the auth-listener-driven render loop.

After this build deploys, anyone stuck on a pre-b111 SW will auto-recover on next page visit. New installs use the b111+ SW from the start.

## v0.9.1-beta build 118 — 2026-05-04 (Discord webhook live)

Tyler set up the Hearthrise Discord server (Info / Community / Feedback categories with 8 channels). Created the `#bug-reports` channel + "Hearthrise Bug Bot" webhook. Webhook URL pasted into `DISCORD_WEBHOOK_URL` in `bug-report.js` — bug reports now flow directly to Discord.

This is a temporary configuration until the Cloudflare Worker is deployed (waiting on Tyler's GitHub access). The URL is currently in the public JS bundle. Risk: scraper-driven channel spam. Mitigation: regenerate webhook URL in Discord if abused.

After Worker deploy, the URL moves to a Cloudflare secret and the constant goes back to empty.

## v0.9.1-beta build 117 — 2026-05-04 (bug-report pipeline + screenshot capture)

The "test on phone via RDP" pain solved.

- 📸 **Screenshot capture in bug reports.** `html2canvas` (loaded from CDN, no bundle bloat) renders the current viewport to a JPEG; included in the report payload. Embedded inline in the Copy-to-clipboard markdown. Visible in Discord embeds + GitHub Issues.
- 🌉 **Cloudflare Worker bug-report bridge.** New file `cloudflare-workers/bug-report-bridge.js`. Single endpoint that fans out to **Discord channel + GitHub Issues** in parallel. Holds Discord webhook URL + GitHub PAT as Cloudflare secrets so they never touch the public web client.
- 📝 **`BUG_REPORT_PIPELINE.md`** — step-by-step setup guide. ~25 min one-time wiring: Discord channel + webhook → GitHub PAT → Cloudflare Workers signup → `wrangler deploy` → secrets → paste worker URL into `bug-report.js`.

After Tyler completes the setup, the testing loop becomes:

> Phone → 🐛 → Send → Discord notification on phone (Tyler sees) + GitHub Issue created (Claude reads via WebFetch)

Every report has the screenshot inline, viewable on either side. Claude can comment on issues, label them, close them as fixed. Persistent shared source of truth for bugs across co-pilot sessions.

The legacy direct-Discord and Supabase paths still work as redundant fallbacks. If `BRIDGE_URL` is left blank in `bug-report.js`, the game uses the old paths transparently.

## v0.9.1-beta build 116 — 2026-05-04 (landscape side-rail height hotfix)

After b115 deployed, the side rail was visible at the top with HOME / Profile button rendered correctly — but no other buttons. iframe DOM inspection showed all 6 buttons existed (Home/Character/Combat/Skills/Farm/More at y=6, 64, 122, 180, 238, 296) but the nav container was only 60px tall with `overflow: auto`, so 5 of 6 buttons were below the fold and required scrolling.

Cause: my own b113 block in `theme-cozy.css` had `.bottom-nav { height: calc(40px + safe-b) !important }` from when the nav was still horizontal. b113 came AFTER b114 in the file, so b113's height override won via cascade order. Self-inflicted regression.

Fix: removed the obsolete bottom-nav height + bn-btn sizing rules from the b113 block. b114's `height: 100vh` now wins. All 6 rail buttons are visible top-to-bottom in landscape.

## v0.9.1-beta build 115 — 2026-05-04 (landscape visual polish)

Tyler's first b114 read: "clunky, no parchment background on left nav." Six issues spotted in the iframe screenshot:

1. Side rail dark cocoa, didn't match theme
2. Topbar still too tall — eating reclaimed vertical
3. DUNGEONS button overflowed to the right
4. Buttons clustered at top of rail, bottom empty
5. Topbar email clipped behind rail boundary
6. Activity bar barely visible

This patch fixes all six.

- 🟫 **Side rail is parchment** (cream→amber gradient) with 2px gold border. Cocoa text, Cinzel font, hover state, wax-stamp red active. Matches the rest of the cozy theme — feels like part of the game, not an injected sidebar.
- 📏 **Topbar 32px** (was 36) with tighter stats row
- 🛡️ **DUNGEONS button** width-capped at 140px so it stops sprawling
- 📐 Activity bar 26px slim
- 🔧 Layout offset moved to `.app` level so children inherit cleanly — topbar no longer bleeds behind the rail
- 💬 Full chat dock (when opened from More menu) respects side-rail offset

## v0.9.1-beta build 114 — 2026-05-04 (landscape side-rail nav)

The real landscape answer (b113 was the baseline; this is the structural fix).

- 📱 **Bottom nav rotates into a left side rail in landscape.** Same DOM, same buttons — just `flex-direction: column` and positioned on the left edge. Reclaims the ~40px of vertical the horizontal bottom-nav was eating. Wax-stamp red active-state preserved.
- 📐 **Topbar slim** — 36px in landscape (was 40px), pushed right to clear the rail.
- 🎯 **Activity bar slim** — 28px strip at top.
- 🔋 **Content gets the full vertical screen** — panels no longer reserve bottom space for nav.
- 🎨 **Side rail uses cocoa gradient** with gold border, matches the parchment-RPG palette.
- 📱 Triggers on landscape phones AND tablets ≤1024px wide so iPad-mini-in-landscape and similar fall in.

Verification gate before b115: real-phone test in landscape — content area should now feel spacious (~70% of horizontal × 100% of vertical), not cramped.

## v0.9.1-beta build 113 — 2026-05-04 (landscape baseline + UX plan)

After Tyler discovered he'd been playing in landscape (which our portrait-only media queries didn't match), this push makes landscape phones a first-class orientation rather than a broken one.

**This push is a baseline, not the final answer.** Senior PM read: rather than shipping one giant landscape redesign and risking regressions, we phase it across b113 → b116 with verification gates between each push. Plan is documented in `UX_PLAN.md`.

- 🔄 **Mobile rules now fire in landscape too.** Every `@media (max-width: 540px)` block now also matches `(max-height: 540px) and (max-width: 900px)`. Sub-tabs, dense lists, chat-as-tab, all the b110-b112 work — fires in both orientations.
- 📐 **Landscape-specific chrome compaction.** Topbar 40px (was 60), bottom nav 40px (was 60), sub-tab strip 32px (was 56). Activity bar 28px. Card padding 4-6px. Reclaims most of the vertical bleed in the cramped 380px landscape height.
- 📋 **`UX_PLAN.md`** ships with the push, capturing the b113→b116 phased plan to senior-quality landscape (side-rail nav, two-column content, verification gates).

**Open issue (planned for b114):** landscape still uses the horizontal bottom nav, which eats ~40px of vertical when ergonomically a left side rail would work better in landscape. Not addressed in b113 because rotating the nav is a real DOM/layout change with regression risk and we want to verify b113 is stable first.

## v0.9.1-beta build 112 — 2026-05-04 (Profile bleed-through hotfix)

🚨 **The reason "nothing looked different" on your phone after b110 + b111.**

A CSS rule I wrote way back in b109 was missing its `.active` scope:

```css
#panel-profile { display: block !important; }   /* old — wrong */
#panel-profile.active { display: block !important; }   /* b112 — correct */
```

That single missing `.active` was forcing the Profile panel to render on top of every other tab on mobile. Combat / Inventory / Skills with their new sub-tab strips were ALL there, working — just hidden behind a permanently-visible Profile panel. The Achievements / Bestiary / Lifetime Stats buttons + player name showing on every tab in the iframe screenshots was the giveaway.

This single character fix should make b110 + b111 visible on phones for the first time. After this push deploys + the b111 service-worker fix actually takes effect (one more home-shortcut reset required), every future build auto-updates.

## v0.9.1-beta build 111 — 2026-05-04 (mobile rebuild pt 2 + service-worker fix)

Two big things in this push.

### 1. Service worker rewrite (P0 — fixes the "phone shows old version" bug)

Previous service worker used a fixed cache name (`hearthbound-v2`) and "cache-first" strategy. Translation: once the SW cached a file, it served the cached version forever. Pushing new builds did nothing for installed PWAs until the user manually deleted + reinstalled the home shortcut. That's why b110 looked unchanged on Tyler's phone home shortcut.

New strategy:
- Cache name now includes the build version (e.g. `hearthrise-111`). Each build → new cache → old caches purged on activate.
- App shell (HTML/JS/CSS) = network-first. Fresh fetch on every load when online; cache fallback only when offline.
- Static assets (PNG/SVG/font) = cache-first because they're URL-versioned.
- `skipWaiting()` + `clients.claim()` so updates take effect on the next page load with no manual reset.

After this build deploys, all future pushes will propagate to phones automatically within ~30s of opening the app.

### 2. Mobile rebuild pt 2 — Inventory + Activities

Same Idle-Clans-style sub-tab pattern Combat got in b110, applied to two more panels.

- 🎒 **Inventory sub-tabs**: `Bag | Equip | Saved` strip. Bag shows just the item grid (5-col on mobile), Equip shows the paper-doll + hero stats, Saved shows loadouts. New `src/inventory-mobile-tabs.js`.
- ⛏️ **Activities skill strip**: 9 skills as a horizontal-scroll strip across the top (Wood / Mine / Fish / Farm / Cook / Craft / Smith / Prayer / Magic). Tap to focus. The selected skill's detail view fills the rest of the screen. Replaces the desktop sidebar+detail layout that was eating ~60% of the panel on mobile. New `src/activities-mobile-tabs.js`.
- Skill nodes (Normal Tree, Oak, etc.) and bag tiles densified to phone-friendly sizes.

## v0.9.1-beta build 110 — 2026-05-04 (Idle Clans-style mobile rebuild — pt 1: Combat)

First of three structural rebuilds to make the mobile experience feel like Idle Clans (and other dense, tabbed mobile idle games) instead of a desktop site squeezed into a phone.

This push targets the **Combat panel** + chat-as-tab + dense lists. Next pushes (b111, b112) restructure Inventory/Activities and the rest.

- ⚔️ **Combat sub-tab strip on mobile**: `Style | Foes | Arena` across the top of the panel. Only one section is visible at a time. New `src/combat-mobile-tabs.js` injects the bar; CSS in theme-cozy.css gates section visibility via `data-mobile-sub`. Replaces the 1500px-tall vertical scroll with a focused single-pane view.
- 💬 **Chat moved into the More menu** on mobile (was a floating pill that overlapped gameplay). Tap More → 💬 Chat → dock opens fullscreen. Floating pill is hidden on phone via CSS. New `src/mobile-more-chat.js` wires the button.
- 👹 **Dense monster list rows** — was 200px+ "cards" with verbose chips, now ~56px rows: tiny icon, name, weakness, tier badge. Same screen now shows ~12 monsters where it used to show 3.
- 📐 **Bounty cards densified** to match — 60px rows with compact reward + weakness text.
- 🔁 **Folded in the b109 polish** — chat pill no longer overlaps nav, density restored from b108's over-correction, profile overlap killed, bottom nav 48px tap targets, topbar compacted.

## v0.9.1-beta build 109 — 2026-05-04 (real-phone fixes)

Tested on a real phone after b108 deployed. Reports:
- "Chat button is in the way"
- "Combat screen is not visible"
- "Way too much scrolling"
- "Profile page has a ton of overlap"

Cause: b108 over-corrected on padding/font/tap-target sizes — everything got bigger so the page got taller, and the chat pill at `bottom: 16px+safe-b` sat directly on top of the new 60px+safe-b bottom nav.

This patch walks b108 back to a denser layout while keeping tap targets above Apple's 44px minimum.

- 💬 **Chat pill lifted above bottom nav** (was overlapping). Smaller, more transparent, with backdrop blur — feels like a quiet utility, not a primary CTA.
- 📐 **Density restored.** Base font 13px (was 14), panel padding 8px (was 12), card padding 10px (was 14), card margin-bottom 8px (was 12). Page is shorter, less scrolling.
- ⚔️ **Combat panel compressed.** Hidden the "Style: Accurate · Trains: Attack / Accuracy skill: attack..." descriptive text on mobile — it's redundant once you've picked a style. Combat-style buttons now in a tight 4-up grid with no labels. "Suggested for your level" hidden on mobile because the full monster picker covers the same purpose.
- 👤 **Profile overlap fixes.** Last card has 80px bottom margin so it doesn't sit under the chat pill. feat-buttons back to single-column stacked (was 2-col but labels truncated). Active Effects copy compacted.
- 📱 **Topbar + bottom nav compacted.** Bottom nav 48px tap targets (was 52, still over Apple's 44 minimum) saves 4px of vertical real estate × every screen.
- 🔁 **Full chat dock when expanded** now flush left/right and sits above the bottom nav, not floating in space.

## v0.9.1-beta build 108 — 2026-05-04 (mobile feel pass + PWA polish)

Tyler reported it's a "shit experience" on a real phone in browser. The iframe audit only proves CSS works at 380px; doesn't catch the actual touch / keyboard / safe-area / lag issues. This pass attacks those.

- 👆 **Tap delay killed everywhere** — `touch-action: manipulation` globally + on every interactive element. The 200-300ms iOS tap-lag responsible for "feels slow" is gone.
- 🎯 **Tap targets ≥44px on every interactive element** (Apple HIG minimum). Bottom-nav buttons 52px, monster/bounty cards 56px, Accept/Build/Buy buttons 40px, combat-style picker 48px, paper-doll slots 56px. Phones can actually hit things now.
- 📱 **Safe-area-insets respected** for iPhone home indicator + notch. Bottom nav extends with `env(safe-area-inset-bottom)`, topbar pads with `env(safe-area-inset-top)`. No more home indicator chopping the nav.
- ⌨️ **Soft keyboard no longer covers chat input** — new `src/mobile-keyboard.js` module toggles `body.kb-open` on focus + scrolls the field above the keyboard. Uses `visualViewport` API on newer browsers for precise detection.
- 🌬 **Visual breathing room** — bigger base font on phones (14 / 1.45 line-height), more panel padding, more card spacing.
- 🍯 **Wax-red tap highlight** instead of the default blue iOS Safari flash — matches the rest of the cozy theme.
- 🏠 **PWA install polished** — manifest now uses the real Hearthrise crest icon (was emoji), `theme_color` + `background_color` switched to cozy palette so the install splash + status bar match the in-game UI. "Add to Home Screen" produces a proper-looking app.

## v0.9.1-beta build 107 — 2026-05-04 (mobile follow-ups)

Two issues caught when re-walking the iframe mobile audit after b106 deployed.

- ⚔️ **Combat monster picker was actually rendering at 26px tall** (just the card header — body collapsed because of `overflow: hidden + flex: 0` from desktop styles). Now forced to `min-height: 240px`, `overflow: visible`, `height: auto` on mobile so the tier buttons + monster cards inside actually show.
- 📋 **Profile right-side bleed.** The 2-column layout (main content + Active Effects sidebar) wasn't stacking on mobile — fragments like "FO... HC... wid..." were visible past the parchment edge. Forced single-column block layout, Active Effects flows underneath. Also wrapped the `.feat-buttons` row (Achievements / Bestiary / Last Session / Lifetime Stats — 570px wide before) into a 2×2 grid.

## v0.9.1-beta build 106 — 2026-05-04 (mobile pass)

Found these by loading the live site in a 380px iframe (Chrome MCP can't actually shrink the viewport, so the iframe trick fires the real `@media (max-width: 540px)` rules).

- 📱 **Chat dock no longer takes over the screen on mobile** — forces minimized state on first load when the viewport is ≤540px. First impression is the small "Chat" pill, not a full-screen overlay.
- 🏠 **House building icons survive on mobile.** When the `.shop-row` flex went vertical at narrow widths, the building image was collapsing to 0px. Forced a 48×48 reserved column (44×44 on phones <400px). The Forge cottage / Library tower / Garden windmill all show up now.
- ⚔️ **Combat monster picker no longer disappears on mobile.** The tier selector + monster list was being hidden by the desktop side-by-side layout breaking. Forced `display: block` and stacked the three columns vertically.
- 🎒 **Inventory paper-doll fixed for mobile.** Was showing only the Helm slot at narrow widths. Now renders as a 3-column responsive grid that fits all 14 slots inside 380px.
- ✏️ **Player name ellipsis** instead of mid-word clip ("ADVENTU..." → "ADVENTURER…", proper truncation marker).
- ⚔️ **Combat-style header stacks** the DUNGEONS button below the title at <540px so "COMBAT STYLE — 1H SWORD" no longer gets cut off by it.

## v0.9.1-beta build 105 — 2026-05-04 (chat polish + monsters + polish)

Six things in one push.

- 💬 **Chat dock now shows your message immediately** after sending. The supabase chat backend was silently dropping subscribers when it hot-swapped over the local backend — fixed by re-subscribing on `setBackend`. Realtime pushes from other users will start flowing too.
- 🐉 **31 hand-painted monster avatars** wired up. Slime, Field Rat, Goblin (1-5 variants), Skeleton, Spider, Zombie, Wraith, Demon, Dragon, etc. — every monster in the bestiary now has art instead of a generic crate. Adds ~10 MB.
- 🏠 **Building icons in House sized up** from 42×42 to 56×56 — the homestead reads more substantial.
- 🎒 **Inventory paper-doll hover labels** — tooltip now reads e.g. "Helm: Iron Helm (click to unequip)" so you know which slot is which even when filled.
- 📋 **Bug-report dialog has a Copy button** — falls back to clipboard so testers can paste reports into Discord/email/wherever even before we wire up a real webhook.
- 🔧 **Consolidated Supabase clients** — chat backend now reuses the auth.js client. Removes the "Multiple GoTrueClient instances detected" warning from the console.

## v0.9.1-beta build 104 — 2026-05-04 (chat fix)

- 💬 **Chat send was 400'ing for everyone signed in.** The `from_id` column on `chat_messages` is a UUID, but the chat code was sending `"local-0"` (a local fallback) instead of the actual Supabase user UUID. Now reads the live session user.id when present, with a graceful fallback to legacy local IDs only when offline.

## v0.9.1-beta build 103 — 2026-05-03 (asset cherry-pick)

First batch of real hand-painted icons shipped to the live deploy.

- 🏠 **House rooms now have hand-painted buildings** — Forge is a blacksmith cottage, Kitchen is a homestead, Library is a tower, Garden is a windmill, Trophy Room is a citadel, Cellar is a cottage. Replaces the emoji glyphs.
- 🌾 **Farm plot buildings get art too** — Farm Plot is a real farm, Tool Shed is a small house, Watchtower is a tower.
- ⛏️ **Material items get hand-painted icons** — wood logs (all 5 tiers), planks (all 5 tiers), copper/iron/silver/gold/mithril/rune bars, copper/iron/silver/gold ore, stone, mushrooms, dragon eggs. Inventory + crafting recipes start showing real art.
- 🎨 New `assets/icons-bundle/` directory ships ~14 MB of curated PNGs cherry-picked from the icons3 megapack. Subfolders: buildings/, resources/, medieval/. More to come in build 104+.
- 🔧 Replaced the b101/b102 absence-probe with a proper override system. Items without art fall through cleanly to the emoji glyph (`m.icon`).
- 📋 Added `ASSET_AUDIT.md` documenting which packs match the cozy theme and which don't. Spoiler: `Icons/`, `icons2/`, and `icons4/AI|EPS|TXT/` are off-theme and should be deleted from local disk.

## v0.9.1-beta build 102 — 2026-05-03 (second hot patch)

Walked the live site, found six things, fixed all of them.

- ❤️ **Character page HP** — was showing `— / —` because it read `G.hp` / `getMaxHp()` (neither exists). Now reads `G.playerHp` / `G.playerMaxHp` like Inventory does. Shows `10 / 10` correctly.
- 👤 **Profile auth state** — Profile sheet said "Offline play · sign in to sync" even when Settings showed cloud sync active. Profile now reads the live Supabase session directly and displays "Online · cloud save active" with the right name.
- ☁️ **Settings cloud-sync status** — was contradicting itself ("Cloud save active · syncing every 30s" right next to "Never synced"). Now shows "Auto-syncing every 30s — waiting for first round-trip" while signed in, only switching to a real timestamp once a sync completes.
- 🛒 **Market buttons re-skinned** — green Idle-Clans-style "List" button is now wax-stamp red; dark-blue "Premium Store" pill is now parchment with a gold gem accent. Both match the rest of the UI.
- 📦 **Bundle-icon 404s silenced** — the `assets/raw-bundle/` directory isn't on the deploy, so every monster icon was 404ing and falling back to a generic crate. Added a startup probe: if the bundle is absent, clear the icon maps so renders use the proper monster emoji directly (🐀 🦊 ⚔️ etc.). No more 404 spam, no more broken-image flash.

## v0.9.1-beta build 101 — 2026-05-03 (hot patch)

Bug-fix patch caught during the first live-site walkthrough.

- 🐛 **Bounty Board raw-HTML finally fixed for real.** The old regex-on-innerHTML approach fought with `image-fallback.js` and produced corrupted markup like `class="icon-fallback" style=...> Field Rat`. Rewrote `paintBountyMonsters` to use proper DOM API (createElement + appendChild) — the failure mode can't recur.
- 🚪 Click the idle activity bar in the topbar to jump straight to Activities. New-player quality-of-life.
- 👋 First-time-after-signup welcome modal — fires once per account, names the player, points at Activities.
- 🛒 Market "List an item" form had an olive-green background; now matches parchment.
- 📋 Added `TODO_BETA.md` with prioritized post-beta backlog.

## v0.9.1-beta — 2026-05-03

**Hearthrise looks like a real game now.** Massive UI rebuild to match the homestead-RPG vibe.

- 🎨 New character-sheet UI: parchment pages with gold corner flourishes + wax seal, instead of the old dashboard cards
- 🏠 New Hearthrise crest logo — cottage with rising sun above + wheat sheaves
- ✒️ Hand-drawn icons for every nav and topbar slot (24 SVG icons in a consistent style)
- 🌅 Atmospheric "homestead at golden hour" background — warm amber sky fading down through grass to deep forest
- 🔴 Wax-stamp red accents for primary actions (Sign In, Quests, active nav)
- 📜 Cinzel typography for headings; Quicksand for body — replaces generic sans
- 💬 Chat dock + welcome modal + bug-report system all themed
- 🔐 Cloud sync (sign in via Settings → Account) live for cross-device saves
- 🛒 Marketplace (player listings) lives at Market tab; premium store accessible from there
- 🗝 Dungeons accessible from a button inside Combat
- 📋 Beta invite system + signup display name field

**Gameplay**
- All 9 skills trainable, weapons + armor crafting, Bounty Board with marks rewards
- Companion system: Wolf, Beaver, Raccoon
- House upgrades: 8 rooms, account-wide bonuses

**Known limitations**
- Beta — expect some rough edges. Save backups roll automatically every 30s.
- Mobile is supported but desktop is more polished.
- Some achievements + the bestiary are still client-side only.
- Email confirmation links may need a fresh browser tab to complete sign-up.

**How to send feedback**
- Use the 🐛 button bottom-right → captures your build version + game state
- Or join the Discord (link in Settings → Beta tester tools, once configured)


## v0.9.0-beta — 2026-05-01

**Welcome to Hearthrise beta!** Thanks for testing.

- ☁️ Cloud save: sign in to sync your progress across devices
- 💬 Live global, trade, clan, and whisper chat
- 🛒 Player market with search, 7-day price analytics, and partial buys
- 🐛 Bug-report button (bottom-right corner — please use it!)
- 🏆 Leaderboards: Total Level, Combat, Gold

**Known limitations**

- This is beta — expect rough edges. Save backups roll automatically every 30s.
- Mobile is supported but desktop is more polished right now.
- Some achievements + the bestiary are still client-side only.

**How to send feedback**

Use the 🐛 button bottom-right, or pop into the Discord (link in Settings).
