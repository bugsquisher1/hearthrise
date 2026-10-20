// ============================================================
// src/core/hunt/death-why.js — WHAT KILLED A HERO, AS THE ENGINE SAW IT.
//
// PURE ESM, dual-runtime. Each hero unit keeps a short ring of what reached it
// (`hurt`, persisted with the world: world-state.js composes DEFAULTED below),
// so the account is the same however the settle windows were cut (AWAY-1).
// At a death the engine (combat-sim.js) reads the ring into the death log:
//
//   { blow: { m, ab, n } | null,                       the last hit before the death
//     recent: [{ k: 'dmg'|'heal', n, ago, m?, ab? }] }   newest first, ago = ms before it
//
// The edge sends it as the settle's `hints.death_why`; the database stores it
// on the death event (hr_death_why sanitizes it) for the death popup. DISPLAY
// ONLY: no number here prices, pays or gates anything.
//
// Ring entry: [atMs, 0 dmg | 1 heal, amount, dealer monster kind | null, ability | null].
// ============================================================

export const DEATH_WHY_WINDOW_MS = 10000;
const DEATH_WHY_MAX = 12;

/* `hurt` is per unit; only heroes ever fill it (null on every other unit). A DEFAULTED field
   (world-state.js): a world saved without it loads it empty, so no running hunt is refused. */
export const DEFAULTED = Object.freeze({
  unit: Object.freeze([['hurt', 'json']]),
  world: Object.freeze([]),
  pack: Object.freeze([]),
});

const ID = /^[a-z0-9_]{1,64}$/;
const amt = (v) => Math.max(0, Math.min(1e7, Math.floor(Number(v) || 0)));
const idOr = (v) => (typeof v === 'string' && ID.test(v) ? v : null);

/**
 * Note one swing's events on the heroes they reached (after the swing, before its rewards).
 * @param {object} world   the instance world (its units)
 * @param {object[]} events the swing's events
 * @param {object} kinds   unit id -> kind as last seen
 */
export function noteHurt(world, events, kinds) {
  if (!world || !Array.isArray(events) || !events.length) return;
  const heroes = new Map();
  for (const u of world.units) if (u.side === 'hero') heroes.set(u.id, u);
  for (const e of events) {
    if (!e || (e.type !== 'dmg' && e.type !== 'status_tick' && e.type !== 'heal')) continue;
    const u = heroes.get(e.t);
    if (!u) continue;
    const hurt = e.type !== 'heal';
    const n = amt(e.amount);
    if (!n) continue;
    const dealer = hurt && e.u !== null && e.u !== undefined && e.u !== u.id && kinds ? idOr(kinds[e.u]) : null;
    const ab = hurt ? idOr(e.type === 'status_tick' ? e.status : e.ability) : null;
    const ring = Array.isArray(u.hurt) ? u.hurt.filter((r) => e.atMs - r[0] <= DEATH_WHY_WINDOW_MS) : [];
    ring.push([Math.floor(e.atMs), hurt ? 0 : 1, n, dealer, ab]);
    u.hurt = ring.slice(-DEATH_WHY_MAX);
  }
}

/** The account of a death at `atMs` from the dying hero unit's ring (null without one). */
export function deathWhy(unit, atMs) {
  const ring = unit && Array.isArray(unit.hurt) ? unit.hurt : [];
  const recent = [];
  let blow = null;
  for (let i = ring.length - 1; i >= 0; i--) {
    const [at, k, n, m, ab] = ring[i];
    if (at > atMs || atMs - at > DEATH_WHY_WINDOW_MS) continue;
    const r = { k: k === 1 ? 'heal' : 'dmg', n, ago: atMs - at };
    if (m) r.m = m;
    if (ab) r.ab = ab;
    if (!blow && k === 0) blow = { m: m || null, ab: ab || null, n };
    recent.push(r);
  }
  return recent.length ? { blow, recent } : null;
}
