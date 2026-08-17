# CURRENT_STATE

_The team's shared snapshot of where Hearthrise is. Updated at every COORDINATE and after every integration. Keep it true._

**Last updated:** 2026-08-09 · b229 shipped. ACTIVE PROGRAM: itemization rework — all 4 audits committed (docs/reports/itemization-audit/A-D), Phase 1 DONE. NEXT SESSION: synthesize master audit + new-itemization DESIGN → Tyler approval → implement (id-alias layer is step 1). See memory [[itemization-program]].

## Build & branch
- **main HEAD:** `ebbe1bc` — **b229 SHIPPED** (Character/Skills rework Phase 1: combined Skills·Equipment·Hero screen, heroes on Home, playMs, room-pill fix).

- **Version:** v0.9.2-beta (build b229)
- **Remote:** in sync (`92734b7`). Pushing to `main` **auto-deploys** to production (https://bugsquisher1.github.io/hearthrise/). Tyler authorized autonomous wave shipping (DECISIONS 2026-08-08).
- **✅ 7 migrations applied (2026-08-09).** **⚠️ PENDING migrations (run in order, after the earlier queue): rally-preselect, clan-governance, rally-v2, bonus-rebase (all `supabase/migrations/2026-08-09-*.sql`).** All idempotent, client-first, self-checking. More coming from in-flight agents: clan-governance, possibly bonus-rebase mirrors.
- **Working tree:** worktree `manual-presence` (branch `agent-presence`) holds **b227 — the presence rework**, ready for integration: blessings are presence-gated, the flat ×1.12 is removed, the pool spans ten wired keys. Not version-bumped (`bump-version.sh --check` green at 226); the Coordinator bumps at ship.

## Reachability (b371, Art Director — worktree `agent-acb1f7f449a1819de`, NOT bumped, NOT pushed)
- **NEW GATE: `tests/reachability.mjs`** runs inside `node tests/run-smoke.mjs`. It asserts every
  declared primary CTA is inside the viewport **and hit-testable via `elementFromPoint`** at
  **1366x768, 1280x800, 1440x900, 922x423**. Extend by adding a row to `CTAS` — it is data.
  `node tests/reachability.mjs --mutate` re-plants three real shipped defects and fails if any
  escapes. Its banner is in `REQUIRED_GUARD_MARKERS`.
- **P1 FIXED — FIGHT was unreachable at 1366x768** (y=776..813 on a 768px screen, zero scrollable
  ancestors). Cause: the scroll net was fenced inside `@media (max-height:560px)`. It is now
  unconditional, and the foe portrait carries a `calc(100vh - 540px)` term so the net stays unused.
  Fight now lands at y=681..718.
- **Two of the four audited defects DID NOT reproduce as reported.** The nav rail and the Character
  panel are both `overflow-y:auto` and were reachable by scrolling; the audit measured position
  without scrolling. They were fixed as FIT problems instead (rail compacted at `max-height:899px`;
  `#char-shell` no longer shrinks below its pane). See DISCOVERIES b371.
- **Desktop-mode banner no longer false-positives on touchscreen laptops** (threshold 900 → 500);
  predicate now takes an injected environment and is asserted against ten real devices.
- Suite **828/828**, 0 console/page errors across 4 viewports x 5 surfaces.
- ⚠ **OPEN, handed to Systems Engineer:** `.ach-toast` is a SECOND notification system
  (`legacy.css:2425`, fixed top-right) that paints on the foe portrait on every viewport and hides
  the monster entirely at 922x423. Not fixed here — see HANDOFFS.

## Build/test state
- **Smoke:** `node tests/run-smoke.mjs` → **337/337 green, 0 runtime errors** (b227 gate; 330 at b226 + 7 net from the presence rework).
- **Version guard:** `bash bump-version.sh --check`.
- **CI:** `.github/workflows/smoke.yml` (headless Playwright + version-guard; verified to fail on breakage).
- Local preview: `hearthrise-qa`, port 8123 (`.claude/launch.json` also has `hearthrise-static` on 8000). Cache is sticky — force-reload and confirm the build under test.

## Backbone
Supabase is LIVE in production — chat/market/clans/raids/leaderboards are genuinely multiplayer for signed-in players. `supabase/schema.sql` applied. Economy is server-authoritative.

## Art direction (current)
"Forge & Stone" medieval, hearthlight (dark) default theme. 0 emoji rendered as art. Icons = baked atlas in `src/data/glyphs.js`. Type: Alegreya Sans + Cinzel. Containment is earned (no wall-of-cards). See `.claude/coordination/agents/art-director.md` and project memory `art-direction-system`.

**Hearthfire adoption — ITEMS UPDATED b362 (worktree `agent-a5cb9a90f10977eb5` — not integrated, not bumped, not pushed).**
- **Items: 473 of 512 wired** (`src/data/item-art.js`). b362 wired Tyler's 71 hand-made web-UI exports
  (**$0.00 — no API spend**; 4 flattened files matted locally): **45 wired, 10 refused, 7 correct but
  mapping to no live `ITEMS` key.** `REJECTED_WRONG_SUBJECT` is down to **20**. Bars, ores, `potato`
  and `slime_gel` are fixed; the staff/rod class is now half-solved (4 of 6 rods, 4 of 7 staves).
- **⚠️ FIVE ALREADY-WIRED ICONS DEPICT THE WRONG OBJECT** and have since b358: `oak_plank`,
  `duskwood_plank`, `runewood_plank` (round shields), `bronze_bar` (hammer+anvil), `copper_bar`
  (sphere). Visible in the Recipe Book. NOT unwired in b362 — top of the re-shoot worklist. See
  DISCOVERIES b362.
- **⚠️ `assets/items/` is 51 MB of source raws tracked at the deploy root** — needs an ignore or a move.
- b362 evidence: suite **775/775 ×3**, 10 surfaces × 3 contexts, 0 404s / 0 console errors / 0 broken
  imgs, 1251 hearthfire renders. Screenshots `assets/art-pilot/_screenshots/wave2/` (gitignored).
- _(superseded)_ b361 figure was 386→428 of 512.
- **Monsters:** **104 of 111 wired** (`src/data/monster-art.js`) — 74 hearthfire + 30 legacy `painted/`.
  Wave 1 added 69. Still owed: `jackal`, `air_elemental`, `wyrmling` (never delivered) and
  `cyclops`, `void_mote`, `elder_cinder`, `ooze` (delivered, **withheld — wrong subject**, listed with
  regeneration briefs in `WAVE1_REJECTED`, enforced by the monster-art preflight in both directions).
- **THE OPEN ART PROBLEM:** the mixed shelf is now 74 hearthfire vs **30 legacy `painted/`**, and the
  bestiary and boss cards render them side by side at the same size. The 30 now read as placeholder
  art. Re-shooting `LEGACY_ART_IDS` is the highest-value art request in the queue — see HANDOFFS.
- Flattened art deliveries do **not** need paid background removal: probe with `tools/art-bg-probe.mjs`,
  matte with `tools/art-wave-matte.mjs` (256² square, ct6). Wave 1 cost **$0.00**.

## Gameplay direction (current)
Online-only social idle-RPG, OSRS-scale north star. All skills to 99 (data-driven gear tiers in `src/data/gear-tiers.js`). "Rise to the Throne" renown meta-spine + daily login + collection log are the retention pillars. No pay-to-win (Season Pass removed).

## Major technical constraints
- Content authored ONCE in `src/data/*`; `main.js` merges ESM into `window.__LEGACY_INLINE` (identity merge). Never reintroduce the data double-copy.
- Theme rules must be scoped (`:root` = dark tokens; `body[data-theme="cozy-light"]` for the retired light theme).
- `assets/` structure is frozen (icons-bundle paths wired ~360 places). Prefer add over rename.
- `snapshotG` save allowlist is a manual 24-field list — fragile.

## Designer ratifications — **CLOSED 2026-08-08** (all six ruled; each recorded in the spec it touches)
1. **Hunt §8.6 vs §5.2 → §5.2 stands, §8.6 was the typo.** The 20%-of-median floor is normative; the test case is corrected in `clan-boss-events.md` §8.6 (median 750 → 100 earns *no chest*, not Partisan). Implementation + smoke already correct.
2. **Hunt-forged kit → stats/values/rarity RATIFIED; level gates RE-RULED.** Three of six unlocked *below* the Dawnsteel rung they replace and one tied. Now helm 94 / legs 97 / body 99 / belt 92 (gauntlets 90 + cape 95 unchanged). **Band is Smithing 90-99, Crafting 95** — not 90-95. Missing boots ratified as deliberate (Dawnsteel Boots stay BiS). Kit stays tradeable; positioning corrected to "solo cannot *earn*". `clan-boss-events.md` §3.4a.
3. **Undeclared week → RATIFIED, `c_grace_days = 3` is correct.** Largest window that still leaves 4 of 7 days to kill the boss. Auto-found stays Tier I only. `clan-boss-events.md` §3.1.
4. **18,776 vs 18,780 → formula wins; the table is corrected** in `clan-overhaul.md` §6.5.
5. **3 Phase-B reagents → STAY catalogued** (the `phase` field is what makes the route honest; removing them breaks the 34-route invariant). **Binding condition:** no surface may present a `phase:'B'` route as actionable. `clan-overhaul.md` §4.5.
6. **Muster guest-solo-join → RATIFIED**, and `world-event-cadence.md` §4.5's Guests row is rewritten to match. Three binding conditions: floor band only, label + upsell stay, nothing solo touches a server-facing surface.

## Twin-pillar: homestead spec delivered
`docs/design/homestead-deepening.md` — the personal half of Tyler's twin-pillar directive. 8 existing rooms + 3 new, five-rung ladders, the room-modal descriptor both pillars consume, and the homestead half of the power budget. Phase 1 = room modals + the Cellar ruling + Kitchen L4/L5 + Library L4/L5 (Rested XP). **Cellar `+500 storage` backlog item is CLOSED by ruling** (repurposed to buff-duration via the existing `registerBuffScaler`, zero new machinery, zero players worse off).

## Wave 3b inputs (from 3a contracts)
- Panel builder consumes `window.HearthriseClanSeat` (reducers under test) — do NOT re-derive in a renderer.
- Designer rulings owed: 18,776 vs 18,780 labour discrepancy (formula pinned by test); 3 Phase-B reagents catalogued early.
- Systems decision owed: Cozy Day isn't actually selectable (`applyTheme('cozy-light')` removes data-theme) — retire (≈2,400 more dead lines) or make real.
- `home-dashboard.js:182` injects `html:not([data-theme])` from JS — b216 pattern where CSS guards can't see it.
- 4 castle goods need painted icons (Asset); currently gilt atlas glyphs.
- Staged, not faked: leaderboard Climbers season + Top-25 gem claim; weekly raid-damage boards (blocked on raid_contributions work).

## Wave 2 follow-ups (b221)
- Delete the farming dual-write `watered` compatibility field (was b219-rollback safety only — farming agent's contract).
- Designer to ratify the Muster guest-solo-join deviation (spec said sign-in-gate; implementer allowed labelled solo musters, matching the raids precedent).
- `daily_kill`/`daily_gather` have the same fixed-goal-vs-capability problem the harvest daily had.
- Armour category lane is 42 tiles — optional §3 sub-grouping (by family/slot) not built.

## Known bugs / open items
- **Design (Game Designer):** Cellar +500 storage perk feeds nothing; solo raid pool one-tap chest; "harvest 25 crops" harsh for starters; `deaths` never increments; ~25 tier-3–6 drops are recipe-less vendor trash; only 2 real bosses.
- **Systems debt:** `showTab` wrapped 23×; `wrapShowTab`/`HearthriseIdentity` built but unused; 27 files use `localStorage` directly; ~3,000 lines inert cozy-light CSS deletable; gear wield/level-requirement seam unbuilt.
- No open P0/P1 as of bootstrap.

## Active initiatives
- **Team system bootstrap** (this) — establishing the five-specialist coordination system. See `TEAM.md`.

## Integration status
Nothing in the integration queue. Base is clean and green.
