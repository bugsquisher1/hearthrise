// ════════════════════════════════════════════════════════════════════════
// src/core/pet-roll.js — THE PET ROLL, ON THE SERVER (2026-10-10).
//
// A rolled companion (a `skill:<skill>:<N>` pet, a `boss:<monster>:<N>` pet or
// a `drop:<monster>` pet) used to be rolled in the BROWSER — src/features/pets.js
// on every addXp/killMonster, src/features/companions.js on every kill — and
// the browser then CLAIMED it through hr_companion_grant, which could only
// check that the id was a rollable pet. Whether the roll happened was the
// client's word. Whole-game review 2026-10-08, Designer ruling: "the 1-in-N roll
// moves server-side, into the accrual/activity settle for skill pets and the
// boss kill settle for boss pets."
//
// ── HOW IT ROLLS, AND WHY IT IS ONE DRAW PER SOURCE ─────────────────────────
// The settle knows how many qualifying events its span produced: kills of each
// monster (combat), actions of the bench/node's skill (gather, artisan). A pet
// with per-event chance p over n events is owned at the end of the span with
// probability 1 - (1 - p)^n — exactly what n independent client rolls gave,
// because a pet is binary (a second hit grants nothing). So the engine draws
// ONCE per (pet, span) against that number instead of n times.
//
// ── THE STREAM IS ITS OWN ───────────────────────────────────────────────────
// The caller hands this a DEDICATED rng (accrual.js seeds it with
// `seed ^ PET_RNG_SALT`). Nothing here touches the span's main stream, so every
// pinned replay of gold, drops, XP and hearthfinds is byte-identical with or
// without a pet source in play — the hearthfind rule ("a source with no row
// draws no random number") taken one step further: no pet ever draws from the
// stream anything else reads. Deterministic: the same (seed, counts) is the
// same verdict, so a find is replayable from the settle's own inputs.
//
// ── THIS FILE GRANTS NOTHING ────────────────────────────────────────────────
// It reports `{ companion, source_kind, source_id }`. hr_apply re-derives the
// pairing from hr_companion_grants under the character lock, skips an owned
// pet, clamps the day, writes the ownership row and journals it. The engine's
// proposal is a claim, not a credit (2026-10-10-pet-roll-server.sql).
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ════════════════════════════════════════════════════════════════════════

import { COMPANIONS, PET_DROP_CHANCES } from '../data/companions.js?v=564';

/** The three rolled source kinds, in the order their rows are rolled. */
export const PET_SOURCE_KINDS = Object.freeze(['skill', 'boss', 'drop']);

/**
 * Index the rolled companions by the event that rolls them.
 *
 * @returns { kill: { [monsterId]: [{ companion, kind, id, p }] },
 *            skill: { [skillId]: [{ companion, kind, id, p }] } }
 * A malformed row THROWS: a pet the catalogue promises and the engine never
 * rolls is a silent content loss, and a drop pet with no authored chance is a
 * guess. Null-prototype maps (request-layer ids are lookup keys here).
 */
export function indexPetSources(table = COMPANIONS, dropChances = PET_DROP_CHANCES) {
  const kill = Object.create(null);
  const skill = Object.create(null);
  const push = (m, k, row) => { (m[k] || (m[k] = [])).push(row); };
  for (const companion of Object.keys(table).sort()) {
    const src = table[companion] && table[companion].source;
    if (typeof src !== 'string') continue;
    const [kind, id, nRaw] = src.split(':');
    if (!PET_SOURCE_KINDS.includes(kind)) continue;
    if (!id) throw new Error(`pet-roll: ${companion} source ${src} names no id`);
    let p;
    if (kind === 'drop') {
      p = Number(dropChances[companion]);
      if (!(p > 0 && p <= 1)) throw new Error(`pet-roll: drop pet ${companion} has no PET_DROP_CHANCES row`);
    } else {
      const n = parseInt(nRaw, 10);
      if (!(n >= 2)) throw new Error(`pet-roll: ${companion} source ${src} has no 1-in-N >= 2`);
      p = 1 / n;
    }
    const row = Object.freeze({ companion, kind, id, p });
    if (kind === 'skill') push(skill, id, row); else push(kill, id, row);
  }
  return { kill, skill };
}

/** The shipped index, built once. */
export const PET_INDEX = indexPetSources();

/**
 * Roll every pet the span's events could have rolled.
 *
 * @param counts  { kills?: {[monsterId]: n}, actions?: {[skillId]: n} } — the
 *                settle's OWN counts, never a client value
 * @param rng     a DEDICATED stream (src/core/rng.js contract)
 * @param index   PET_INDEX by default
 * @returns [{ companion, source_kind, source_id }] — deterministic order
 *          (kills before actions, ids sorted, catalogue order within an id)
 */
export function rollPets(counts, rng, index = PET_INDEX) {
  const out = [];
  if (!rng || typeof rng.chance !== 'function') return out;
  const roll = (rows, n) => {
    for (const r of rows) {
      const pAny = 1 - Math.pow(1 - r.p, n);
      if (rng.chance(pAny)) out.push({ companion: r.companion, source_kind: r.kind, source_id: r.id });
    }
  };
  const c = counts || {};
  for (const [field, map] of [['kills', index.kill], ['actions', index.skill]]) {
    const src = c[field] || {};
    for (const id of Object.keys(src).sort()) {
      const n = Math.floor(Number(src[id]) || 0);
      if (n <= 0 || !Object.prototype.hasOwnProperty.call(map, id)) continue;   // no row, no draw
      roll(map[id], n);
    }
  }
  return out;
}
