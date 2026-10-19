# Sim to game gap list, 2026-10-19

Tyler: "the sim is in all ways better than the game." We fix the EXISTING game to the sim's standard, gap by gap, in existing modules (replace/delete, never a parallel path). Tyler's later rulings win (rulings-of-record.md).

Basis: game = origin/main cfa546fc4 (v0.2.7); sim = prototypes/hunt-sim/*; rows from docs/design/HUNT_PARITY_CHECKLIST.md (its 285 TODO statuses are stale). Code reading only (Explore agent); P0 rows N-A1, N-A2 and findings 4, 6, 11 must be confirmed by playing.

**Headline:** the engine in src/core/hunt/* is a faithful port of the sim. Almost every gap is in the CLIENT PLAYBACK / DISPLAY layer, plus a few ruling gaps.

Verdicts: GAP / MATCH / RULING (a later ruling overrides the sim) / ASK (ruling silent). Severity: P0 can't play, P1 obviously worse, P2 polish.

## Top gaps (owner)
| # | ID | Gap | Sev | Change in | Owner |
|---|---|---|---|---|---|
| 1 | N-A1 | Scene is a 16 s slideshow: client re-reads the hunt every 16 s (session/config.js:34 huntPollMs), settle floor 15 s (hr-accrue/hunt-settle.js:66), playback 600 ms behind (hunt-view/timeline.js:34,63) → units move ~0.6 s then freeze; most floats/effects arrive past their 1 s life and are dropped (scene.js:142-193). Spec promised ~2 s for the viewed hero. | P0 | config.js + hunt-settle.js (short poll for the VIEWED hero) or timeline.js delay ≥ window + maxSteps > 64 | core lane |
| 2 | N-A2 | Hero/units invisible after Enter or reload until a settle body sets the clock offset (timeline.js:56-63,130; hr_load carries no timeline, character-session.js:170,442). | P0 | timeline.js (offset from pose.at_ms), character-session.js | core lane |
| 3 | H1 | Regen ×60: server sends hp/mana regen PER MINUTE (core-bodies.sql:4550), action-bar.js:123,131-132 prints "/s". | P0 | action-bar.js (÷60, one decimal) | core lane |
| 4 | J1 | Common loot + gold never show: kill events carry no loot/gp (damage.js:60-66, hunt-rewards.js:148-158); scene.js:161-170 and combat-log.js:58-62 read ev.loot. Sim showed twinkle + drop log with gp. | P1 | core/hunt-rewards.js (annotate kill with loot + gp) | core lane |
| 5 | N-A4 | Unit HP/party/vitals bars change only per envelope (sim 10 Hz). Spec S3 says "never from events". | P1 | hunt-view/scene.js (apply played dmg/heal events between envelopes) — needs S3 design call | ASK |
| 6 | N-A3 | Walk pace fixed 312 ms/tile (timeline.js:34,139-141): diagonals/slow/fast monsters rush-then-idle stutter. | P1 | timeline.js positionAt (interpolate over real step spacing) | core lane |
| 7 | M1 | No round vitals hub (ruling 10-19); four flat gauges hidden in town; mana hidden when none. | P1 | action-bar.js + hunt.css | bar lane (paused) |
| 8 | O1 | Windows dock and re-centre the camera (ruling: float over the world). | P1 | camera.js, canvas-backend.js, world-pane.js:86, window-manager.js | UI lane |
| 9 | F1 | Mage/Healer attacks show nothing (hunt-vfx.js:59,64 roles ['ranger'] only). Sim drew arcane/nature/fire/frost bolts. | P1 | data/hunt-vfx.js (+ asset port) | bar lane / art |
| 10 | G1 | Eat/drink feedback is only an item-name float; sim showed "+N HP/MP", cup pop, sparkle. | P1 | hunt-view/scene.js + data/hunt-vfx.js | core lane (scene) |
| 11 | E1 | Ranged spot hysteresis 0.5 (hunt-roles.js:92) vs sim 2.5 (sim.js:603): casters bounce between tiles. | P1 | data/hunt-roles.js | core lane |
| 12 | M3 | Hunt settings window still exists (Eat at / Drink at); ruling: removed, controls on the bar plaque. | P1 | hunt-settings.js → action-bar.js | bar lane (paused) |
| 13 | L1/L2 | Analyzer: loot value + store-supply gold blank (hunt-sections.js:178-180); free characters get no basic analyzer (hunt-analyzer-v2.sql:18). | P1 | hunt-sections.js + hr_hunt_analyzer | UI lane (analyzer half) |
| 14 | K1/K2/K4 | Party panel: no stamina gauge (ruling), role glyph not head portrait, no click-to-view/kick/leave/stop-accepting. | P1 | shell/widgets/party-panel.js | later |
| 15 | M5 | HUD panels can't be dragged/minimised/hidden with H (hud.js:7 "drag is v1.1"); sim had all three; 10-15 ruling says movable. | P1 | shell/hud.js, shell.js | later |

## P2 (polish, later)
Hover bob for fliers (VW-04); peers' shield bubble (VW-06); hero death cue (N-A6); A* blocked goal (GR); dead leader-wipe code in pull-cycle.js:105-124 (RULING, remove); density fits 8 on cellar/sewer + per-ground memory; Challenge cast name float (TG-08); aggro icon in party panel; RO-10 close-in tile choice; RO-19 melee abilities need at-rest; float colour by element (F3); fallback drawn effects (F6); bleed drip (ST-08); crit visuals (F9); flash on use (BB-08); slot number vs one corner count (BB-07); stamina ticking live (H2); in-fight regen shown (H3); regen hidden on narrow screens (H4); emblem tooltips/minimise (M2); analyzer reset (AW-01); loot bag-full/split note (J2); smooth camera follow (O2); ambient torch flicker/dust/water (AM-01..09).

## ASK (ruling silent) → tracker
- BB-06 cooldown "ember" rising on a cooling slot (sim) — want it?
- N-A4 / spec S3: let HP bars move live from fight events between server updates (smoother), or only on server updates?
- N3 return point: town arrival point (ruling 10-19 says arrival point — treat as ruled) vs where the hero last stood.
- O3 party camera keys 1-4 / P (sim) — want it?
- TB-03/04 top bar "ready in" and "»".

## Matches (no work)
Integer zoom/nearest (VW-02), frame pacing, z-sort, corpses fade, bleed/mark badges, grid/A*/movement, speeds (engine), pulls/packs/respawn (PC-01..12), in-fight regen extension, targeting/peel/leash, kiting (RO-01..15 except E1), damage math, statuses, consumables engine (CO-01..08), conditions engine, analyzer structure (AW-02..15), action bar 2×10, top bar, hunt leave flow, hero never auto-walks in world-boot.js (N4 — but walk-scene auto-walk to stations is the live bug, UI lane).
