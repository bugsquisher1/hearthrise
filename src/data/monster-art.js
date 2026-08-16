// ════════════════════════════════════════════════════════════════════════
// src/data/monster-art.js — THE MONSTER PORTRAIT MANIFEST
//
// WHY THIS FILE EXISTS (three defects it closes, all of them measured)
//
//  1. THE MIS-MAP. `assets/icons-bundle/painted/monsters/bear.png` is a wild
//     BOAR, and `dragon.png` is a pale humanoid VAMPIRE bust — both wired to
//     ids they do not depict, both live for months. The art pilot then parked
//     three portraits it had no home for on borrowed ids ON PURPOSE
//     (hellhound -> lesser_demon, grim_reaper -> wraith, elk_king -> bear),
//     marked PILOT PREVIEW ONLY. Those three ids now EXIST, so this manifest
//     binds each portrait to the monster it actually depicts. There is no
//     park left in the system, and `EXPECTED` is the contract the art batch
//     is generated against, so a mis-named delivery is caught by a test
//     rather than by a player.
//
//  2. THE MISSING FILE. 80 of the 111 monsters have no portrait yet (the
//     batch runs separately). A mapped-but-absent path renders a broken
//     image and a 404. So `wiredIconMap()` emits an entry ONLY for an id in
//     `SHIPPED` — every renderer already falls back to the glyph atlas and
//     then the emoji when `_monsterIcon[id]` is absent, so a missing
//     portrait degrades silently and correctly. Art lands => add the id to
//     `SHIPPED` => it appears. One line per delivery.
//
//  3. THE THREE-PLACE RENAME. An id used to appear in the PNG filename,
//     `HR_MONSTER_GLYPHS`, and `LOCAL_MONSTER_ICON` in legacy.js, with only
//     the last enforced. The filename is now DERIVED from the id, so those
//     two can no longer disagree.
//
// TWO FOLDERS, ON PURPOSE. The 31 pre-wave portraits live in `painted/` in
// the retired art direction; new work lands in `hearthfire/` (the lane Tyler
// chose 2026-08-16). Until batch M0 regenerates the old 31 the bestiary is a
// mixed shelf — representable here, and the mix is visible in one place
// rather than inferred from a path prefix scattered across a 16k-line file.
//
// NOTE — a doc disagreement, flagged not silently resolved:
// `docs/design/monster-art-prompts.md` §0 says new portraits go to
// `assets/icons-bundle/painted/monsters/` ("no new subfolders"); the shipped
// art pilot put them in `assets/icons-bundle/hearthfire/`. This file follows
// the pilot because that is what exists on disk, and `HEARTHFIRE_DIR` is the
// one line to change if the sheet wins.
// ════════════════════════════════════════════════════════════════════════

import { MONSTERS } from './monsters.js?v=358';

/** The retired direction — the 30 portraits that shipped before the wave. */
export const PAINTED_DIR = 'assets/icons-bundle/painted/monsters/';
/** The chosen direction. All new generation lands here. */
export const HEARTHFIRE_DIR = 'assets/icons-bundle/hearthfire/monsters/';

/**
 * Ids whose portrait is still the OLD direction. Everything else is expected
 * in HEARTHFIRE_DIR. As batch M0 regenerates one, delete it from this set —
 * that is the whole migration, one line at a time.
 */
export const LEGACY_ART_IDS = Object.freeze([
  'slime', 'rat', 'goblin', 'weak_skeleton', 'small_wolf',
  'giant_bat', 'hobgoblin', 'wolf', 'skeleton', 'dark_wizard',
  'venom_spider', 'goblin_brute', 'dire_wolf', 'zombie', 'warlock',
  'plague_swarm', 'goblin_warlord', 'bear', 'wraith', 'lesser_demon',
  'shadow_creeper', 'warband_captain', 'panther', 'death_knight', 'archmage',
  'void_parasite', 'war_king', 'ancient_bear', 'lich', 'dragon',
]);

/** `<id>.png` — the filename is DERIVED, so it can never drift from the id. */
export function fileFor(id) { return String(id) + '.png'; }

/** The full expected path for a monster id. */
export function pathFor(id) {
  return (LEGACY_ART_IDS.indexOf(id) >= 0 ? PAINTED_DIR : HEARTHFIRE_DIR) + fileFor(id);
}

/**
 * THE MANIFEST the art batch is generated against: every monster id -> the
 * exact path its portrait must be written to. 111 entries.
 * `tests/run-smoke.mjs` reconciles this against the filesystem.
 */
export const EXPECTED = Object.freeze(
  Object.keys(MONSTERS).reduce((acc, id) => { acc[id] = pathFor(id); return acc; }, {}),
);

/**
 * Ids whose file EXISTS in the repo right now.
 *
 * This is a hand-maintained allowlist ON PURPOSE: the browser cannot stat a
 * file, so "does this art exist?" has to be data. It is not trusted data —
 * `tests/run-smoke.mjs` walks both art folders in Node and fails if this list
 * and the filesystem disagree in either direction. So it cannot rot, and it
 * cannot be padded with wishful entries.
 *
 * `mountain_troll` is deliberately absent: it is the one live monster that
 * has never had a portrait (it falls back to a glyph today, and still does).
 */
export const SHIPPED = Object.freeze([
  'slime', 'rat', 'goblin', 'weak_skeleton', 'small_wolf',
  'giant_bat', 'hobgoblin', 'wolf', 'skeleton', 'dark_wizard',
  'venom_spider', 'goblin_brute', 'dire_wolf', 'zombie', 'warlock',
  'plague_swarm', 'goblin_warlord', 'bear', 'wraith', 'lesser_demon',
  'shadow_creeper', 'warband_captain', 'panther', 'death_knight', 'archmage',
  'void_parasite', 'war_king', 'ancient_bear', 'lich', 'dragon',
  /* HEARTHFIRE WAVE 0 — the 13-image pilot Tyler approved 2026-08-16. These
     five are the first portraits in the new lane and they live in
     `hearthfire/`, so the bestiary is a mixed shelf until batch M0 reshoots
     the 30 above. `barn_rat` and `winter_wolf` are NEW-roster ids; the other
     three were the pilot's temporary stand-ins and now own their real rows. */
  'barn_rat', 'winter_wolf', 'hellhound', 'grim_reaper', 'elk_king',
]);

/**
 * The map that is actually wired into `window._monsterIcon`: the manifest,
 * filtered to what exists. An unshipped monster gets NO entry, so the
 * renderer's existing glyph/emoji fallback takes over — no 404, no broken
 * image, no console noise.
 */
export function wiredIconMap() {
  const out = {};
  SHIPPED.forEach((id) => { if (EXPECTED[id]) out[id] = EXPECTED[id]; });
  return out;
}

/**
 * The art batch's worklist: every id still owed a portrait, with the exact
 * filename and folder it must be delivered as. Sorted by tier then id so the
 * batch runs in the order players meet the monsters.
 */
export function pendingArt() {
  const shipped = new Set(SHIPPED);
  return Object.keys(EXPECTED)
    .filter((id) => !shipped.has(id))
    .map((id) => ({ id, tier: MONSTERS[id].tier, cls: MONSTERS[id].cls, path: EXPECTED[id] }))
    .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
}
