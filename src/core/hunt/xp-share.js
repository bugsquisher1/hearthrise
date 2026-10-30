// ============================================================
// src/core/hunt/xp-share.js — PER-HERO KILL XP (spec §3.5, parity XP-01..05, XP-07, AB-04)
//
// THE RULE (one place; a solo hunt is a party of one):
//   base share = monster XP / heroes alive at the kill        (XP-01)
//   hero XP    = floor(base share x that hero's multiplier)   (XP-02)
// The multiplier is read server-side and injected per hero as
// `sc.xpMultOf(heroUnit)` (bestiary mastery, boosts, later modifiers); absent,
// every hero's is 1 (XP-07, the bestiary-ready hook). "Raw" XP is the share
// before the multiplier (spec §3.6 #3) and rides on each `xp` event as `raw`.
//
// "+XP" GROUPING (XP-03). Kills within HUNT_XP.groupMs of the first are ONE
// `xp_group` event: `amount` the party's XP, `by` each hero's own (the view
// shows the VIEWED hero's, XP-04), `x`/`y` the centre of the kills. The open
// group is persisted on the world (`xpGroup`), so a settle cut inside the
// window closes it exactly where one span would; `flushXpGroup` (a sub-step
// hook in world-step.js) emits it on the first sub-step at or past its close.
//
// Level-ups (XP-05) and Magic XP (AB-04) are pure helpers here; the curve is
// src/core/xp.js, the only one (XP-06).
//
// Draws nothing. PURE ESM, dual-runtime. No DOM, no clock, no Math.random.
// ============================================================

import { HUNT_XP } from '../../data/hunt-xp.js?v=0.2.71';
import { skillLevelFromXp, charLevelFromXp } from '../xp.js?v=0.2.71';
import { makeEvent } from './events.js?v=0.2.71';

export const PERSISTED = Object.freeze({ unit: Object.freeze([]), world: Object.freeze([['xpGroup', 'json']]), pack: Object.freeze([]) });

/* A hero's multiplier: the injected hook's answer, refused (never clamped) when it is not a number >= 0. */
function multOf(sc, hero) {
  const f = sc && typeof sc.xpMultOf === 'function' ? sc.xpMultOf : null;
  const m = f ? f(hero) : 1;
  if (typeof m !== 'number' || !Number.isFinite(m) || m < 0) throw new Error('xp-share: xpMultOf answered ' + m + ' for hero ' + (hero && hero.id));
  return m;
}

const xpOf = (kill) => {
  const xp = kill && kill.xp !== undefined ? kill.xp : 0;
  if (!Number.isSafeInteger(xp) || xp < 0) throw new Error('xp-share: kill xp must be an integer >= 0, got ' + xp);
  return xp;
};

/**
 * THE SPLIT. `heroes` are the living heroes (objects with an integer `id`).
 * Answers { [id]: { xp, raw } }; nobody alive is nobody paid.
 */
function splitKillXp(xp, heroes, sc) {
  const out = {};
  if (!heroes.length || xp <= 0) return out;
  const raw = xp / heroes.length;
  for (const h of heroes) out[h.id] = { xp: Math.floor(raw * multOf(sc, h) + 1e-9), raw: Math.floor(raw + 1e-9) };
  return out;
}

/**
 * Per-hero XP for one kill: base share x that hero's own multiplier.
 * `kill` = { t: the dead monster's unit id, u: the killer, xp: the monster
 * row's XP }. Emits one `xp` event per paid hero and folds the kill into the
 * open "+XP" group. Answers { [heroId]: xp }.
 */
export function shareKillXp(inst, kill, sc) {
  const xp = xpOf(kill);
  const units = (inst && inst.world && inst.world.units) || [];
  const living = units.filter((u) => u.side === 'hero' && u.alive === true);
  const paid = splitKillXp(xp, living, sc);
  const ids = Object.keys(paid);
  const answer = {};
  if (!ids.length) return answer;
  if (inst && inst.world) flushXpGroup(inst, sc);
  for (const id of ids) {
    answer[id] = paid[id].xp;
    sc.emit(makeEvent('xp', sc.atMs, { u: Number(id), amount: paid[id].xp, raw: paid[id].raw }));
  }
  if (inst && inst.world) {
    const dead = units.find((u) => u.id === kill.t) || null;
    /* kills = every kill in the group; n / sx / sy = the ones with a tile, for the centre. */
    const g = inst.world.xpGroup || { at: sc.atMs, kills: 0, n: 0, sx: 0, sy: 0, by: {} };
    g.kills += 1;
    if (dead) { g.n += 1; g.sx += dead.x; g.sy += dead.y; }
    for (const id of ids) g.by[id] = (g.by[id] || 0) + paid[id].xp;
    inst.world.xpGroup = g;
  }
  return answer;
}

/** Sub-step hook: emit the open "+XP" group once its window has closed. */
export function flushXpGroup(inst, sc) {
  const g = inst.world.xpGroup;
  if (!g || sc.atMs < g.at + HUNT_XP.groupMs) return;
  inst.world.xpGroup = null;
  const by = {};
  let amount = 0;
  for (const id of Object.keys(g.by).sort((a, b) => a - b)) { by[id] = g.by[id]; amount += g.by[id]; }
  /* The centre of the kills is where the number shows (display only, never persisted). */
  const centre = g.n > 0 ? { x: g.sx / g.n, y: g.sy / g.n } : {};
  sc.emit(makeEvent('xp_group', sc.atMs, { amount, by, kills: g.kills, ...centre }));
}

/** The `level` events of `skill` going from `xpBefore` to `xpBefore + gained` (XP-05);
    `skill` 'level' is the character's Level (src/core/xp.js charLevelFromXp). */
export function levelUps(u, skill, xpBefore, gained, atMs) {
  const lvOf = (x) => (skill === 'level' ? charLevelFromXp(x) : skillLevelFromXp(skill, x));
  const from = lvOf(xpBefore);
  const to = lvOf(xpBefore + gained);
  const out = [];
  for (let lv = from + 1; lv <= to; lv++) out.push(makeEvent('level', atMs, { u, skill, level: lv }));
  return out;
}

/** Magic XP for `mana` spent by an ability whose own multiplier is `abilityMult` (AB-04). */
export function magicXpFor(mana, abilityMult) {
  if (!Number.isSafeInteger(mana) || mana < 0) throw new Error('xp-share: mana must be an integer >= 0, got ' + mana);
  const m = abilityMult === undefined ? 1 : abilityMult;
  if (typeof m !== 'number' || !Number.isFinite(m) || m < 0) throw new Error('xp-share: ability multiplier ' + m + ' is not a number >= 0');
  return Math.floor((mana * HUNT_XP.magicXpPermillePerMana * m) / 1000 + 1e-9);
}
