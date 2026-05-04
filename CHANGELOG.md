# Hearthrise — Changelog

The welcome modal reads this file on first load after a new build. New entries
go at the top. Format: each version is a `## v0.x.x — YYYY-MM-DD` heading,
followed by bullets. Keep entries short and player-friendly (not commit-log style).

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
