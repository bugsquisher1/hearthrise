# docs/archive — superseded documents

Moved here on 2026-10-19 (Tyler: "weed out old shit that is no longer relevant"). These describe the scrapped pre-rebuild game or replaced plans. **Never read them for current rules**: the rules are Tyler's rulings of record (memory `rulings-of-record.md`) and `CLAUDE.md`. Kept for history; code comments that cite the old paths point here.

## design/
- `agility-and-monster-foundation.md` — Agility skill and the August monster rework; the skill set is now Melee/Ranged/Magic/Defense + Prayer.
- `armour-identities.md` — August armour rescale; replaced by Heavy/Medium/Light = Absorb/Dodge/Ward (Tyler 10-18).
- `art-direction-picker.md`, `art-pilot-prompts.md`, `art-sample-pack.md` — August painted-icon style lanes; style 1 is final (10-15).
- `attended-loot-credit.md`, `live-settlement.md` — old attended/away settle; replaced by hunt sessions.
- `away-combat-licence.md`, `away-time-ruling.md` — away accrual; replaced by server-run hunts that keep running offline (10-18).
- `bonus-rebase.md`, `pacing-overhaul.md`, `progression-depth.md` — old boost economy and pacing; replaced by the 10-14+ combat/progression rulings.
- `bounty-accept-bh-clamp.md`, `combat-authority.md` — Bounty Board, removed.
- `bug-triage-loop.md` — loop over the old client's bug button; the old client is deleted.
- `character-skills-rework.md`, `combat-screen-rework.md` — screens of the scrapped client.
- `clan-boss-events.md`, `clan-overhaul.md` — clans and raids, removed (guilds are post-EA).
- `consumable-economy.md`, `crafting-cooking-taxonomy.md` — old Fletching/Runecrafting/Stonemason and cooking taxonomy; supplies are now food/drink/runes/ammo, own stock then store (10-16).
- `dungeon-settlement.md` — dungeons, paused.
- `farming-watering.md`, `homestead-deepening.md` — old farm and Homestead; housing at EA is the cottage, benches, depot and trophies (10-14/15).
- `leaderboards.md`, `renown-kill-faucet.md`, `quests.md`, `world-event-cadence.md` — leaderboards, renown, quests and world events, removed.
- `render-extraction-pattern.md` — strangler pattern for `src/legacy.js`, which is deleted.
- `server-authority.md` — the August foundation design; its laws live on in CLAUDE.md §1/§2/§6, its phases are done.
- `signup-door-config-gates.md` — old sign-up door; sign-in was rebuilt.
- `supply-projection.md` — "enough for X hours" on the old supply model.
- `unlock-buy.md` — the `unlock_buy` verb, removed.
- `BESTIARY_LADDER.md` — the 09-22 trophy ladder; replaced by stages 25/250/1000/2500 with a relic boost up to +25% (10-14/15).
- `HUNTS_AND_ANALYZER.md`, `HUNT_ANALYZER_UI.md` — 09-22 hunts with Vigour; replaced by `docs/design/HUNT_SCREEN_SPEC.md`.
- `super-rare-drops.md` — August spec built on clans, renown and quests.

## planning/
- `PRIORITY_BOARD_pre-rebuild.md` — the whole board up to 2026-10-14 (old client and systems); the live board restarted empty.
- `BETA_PLAN.md` — 10-15 plan; replaced by `WEEK_PLAN_2026-10-17.md`.
- `APP_PLAN.md`, `UX_PLAN.md`, `DEPLOY.md`, `DEPLOYMENT_ROADMAP.md`, `ROADMAP.md`, `BETA_PREP.md`, `TODO_BETA.md` — b1xx-era plans for the single-file prototype.
- `CLEANUP_PROGRAM.md`, `CLIENT_PREDICTION_RETIREMENT.md` — cleanup of the old client, now deleted.
- `DISCORD_PLAN.md` — gem/clan-era Discord plan; Discord layout is redone closer to beta.
- `FEATURE_SLATE.md` — First Light, Set the Night, The Larder and other old-system features.
- `LIVE_WORLD_BRIEF.md` — 09-16 brief; the live-world decision is made.
- `SEC_*.md` (21 files) — Security reviews of old surfaces (world-tick gather/combat probes, Vigour, M6 hunts, M8 parties, bestiary trophies, settle-before-mutate). `SEC_WORLD_TICK_M3_2026-09-22.md` stays in `docs/planning/` because `tests/world-tick-ledger-meta.mjs` reads it.

## root
- `STABILIZATION_AUDIT.md` — the 09-04 bug ledger of the old game.
