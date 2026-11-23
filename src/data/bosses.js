// ════════════════════════════════════════════════════════════════════════
// src/data/bosses.js — A BOSS IS A ROLE ROW TIMES ITS ENCOUNTER'S MULTIPLIER, AND ITS PRESSURE RAMPS (lane/tower-boss-formula, 2026-11-22).
//
// docs/design/redesign/02-architecture.md package 3 ("A boss is a bar check ... never a health bar against a clock") and
// 04-math-strategy.md section 6: "a role is a row of times and shares, the step supplies the scale", and one lever on a role,
// `rampPerMinute`: "its pressure grows through a long fight. A boss with a ramp tests damage and sustain together. Four damage dealers
// lose to the pressure, and a tank with two healers loses to the ramp." Levers: `rampPerMinute` BY ENCOUNTER TYPE.
//
// NO BOSS HAS HAND-TYPED STATS. A boss row names its ENCOUNTER (`bossKind`) and nothing else that sizes it: its numbers are its base stat
// role's (src/data/balance-sheet.js MONSTER_ROLES, the formula at its Level) times this file's row for its kind, and its blow grows
// by the kind's ramp for every minute it has been fighting (src/core/hunt/boss-phases.js swingRow reads it, the fight clock is the
// unit's own `fightMs`). A new boss is a monster row with a `bossKind`; a new kind of encounter is one row here.
//
//   role        the stat role the boss stands on (balance-sheet.js MONSTER_ROLES): its to-hit, defense and evasion shape
//   hpPpm       its HP, parts per million of that role's at its Level (ppm, so today's boss row is exactly an elite times a row)
//   blowPpm     its blow, ppm of that role's
//   xpPpm       its kill's XP, ppm of that role's
//   floorCapPm  its largest blow, held to this share (permille) of the base HP of a hero at its ground's FLOOR Level, however deep it
//               lives (designer 2026-10-21: a boss may take at most about a third of the floor hero in one blow; null: no cap)
//   rampPm      THE RAMP: its blow x(1 + rampPm/1000) for every minute of fight, from its first swing at a hero
//   rampCapPm   the ramp tops out at this multiplier, permille (a ten-minute hall cannot become a one-shot)
//
// THE KINDS (STARTING VALUES, NOT RULINGS: "a number inside its band is enough", Tyler 2026-11-21):
//   ground  a hunting ground's boss (Captain Hask): today's `boss` stat role, read as the elite x this row (5 / 1.6 HP, 1.1 blow, 1.2 /
//           1.15 XP: the same numbers, now one row). A slow ramp: a ground boss is met inside a hunt, beaten in about a minute
//   hall    a keyed hall's boss (Lord Krell, the hall's party fit): the bar check. The ramp is the hall's clock: a party that cannot keep
//           up its damage meets a boss that hits harder every minute, and one that only stacks damage meets his pressure
//   keeper  a run ground's door warden (the Burning Tower's landing Keeper, a Catacomb vault door): a short fight inside a climb
//   add     a named add (Captain Hask standing up for Lord Krell): a boss with his own kit inside another boss's fight, no ramp of his own
// tests/boss-formula.mjs holds every row to these rules and every boss row of the catalogue to a kind.
//
// PURE ESM DATA. Imports nothing. Node, Deno and the browser.
// ════════════════════════════════════════════════════════════════════════

export const BOSS_KINDS = Object.freeze({
  ground: Object.freeze({ role: 'elite', hpPpm: 3125000, blowPpm: 1100000, xpPpm: 1043478, floorCapPm: 330, rampPm: 40, rampCapPm: 1400 }),
  hall: Object.freeze({ role: 'elite', hpPpm: 3125000, blowPpm: 1100000, xpPpm: 1043478, floorCapPm: 330, rampPm: 60, rampCapPm: 1600 }),
  keeper: Object.freeze({ role: 'elite', hpPpm: 3125000, blowPpm: 1100000, xpPpm: 1043478, floorCapPm: 330, rampPm: 100, rampCapPm: 1800 }),
  add: Object.freeze({ role: 'elite', hpPpm: 3125000, blowPpm: 1100000, xpPpm: 1043478, floorCapPm: 330, rampPm: 0, rampCapPm: 1000 }),
});

export const BOSS_KIND_IDS = Object.freeze(Object.keys(BOSS_KINDS));

/** The boss stat role of kind `kind` laid over the base role row `base` (balance-sheet.js MONSTER_ROLES shape: hp, hit, blow, def,
    evasion, xp, gp, and gentleHp when the base has one): the multipliers applied, the floor cap carried. Pure. */
export function bossRole(base, kind) {
  const k = BOSS_KINDS[kind];
  if (!k || !base) throw new Error('bosses: no boss kind ' + kind);
  const out = { ...base, hp: (base.hp * k.hpPpm) / 1e6, blow: (base.blow * k.blowPpm) / 1e6, xp: (base.xp * k.xpPpm) / 1e6 };
  delete out.gentleHp;
  if (k.floorCapPm !== null) out.floorCap = k.floorCapPm / 1000;
  return Object.freeze(out);
}

/** The boss kind of monster row `row`: its own `bossKind`, else a named add's (a row `boss` and `add`), else a ground's for any other boss
    row, else null (not a boss). Pure. */
export function bossKindOf(row) {
  if (!row) return null;
  if (typeof row.bossKind === 'string') return Object.hasOwn(BOSS_KINDS, row.bossKind) ? row.bossKind : null;
  if (row.boss !== true) return null;
  return row.add === true ? 'add' : 'ground';
}

/** The ramp a boss row fights with: { pm, capPm } from its kind, or null (no kind, or a kind with no ramp). Pure. */
export function rampOf(row) {
  const kind = bossKindOf(row);
  const k = kind ? BOSS_KINDS[kind] : null;
  return k && k.rampPm > 0 ? { pm: k.rampPm, capPm: k.rampCapPm } : null;
}

/** The ramp's multiplier, permille, after `fightMs` of fight: 1000 + pm a minute, whole permille, at most capPm. Pure. */
export function rampPmAt(ramp, fightMs) {
  if (!ramp || !(fightMs > 0)) return 1000;
  return Math.min(ramp.capPm, 1000 + Math.floor((ramp.pm * fightMs) / 60000));
}

/** Every problem with the boss table, as strings (empty: valid). `roles`: the stat roles a kind may stand on. Pure. */
export function validateBosses(kinds = BOSS_KINDS, roles = []) {
  const out = [];
  for (const [id, k] of Object.entries(kinds || {})) {
    if (!k || typeof k !== 'object') { out.push(id + ': no row'); continue; }
    if (roles.length && !roles.includes(k.role)) out.push(id + ': its role ' + k.role + ' is no stat role');
    for (const f of ['hpPpm', 'blowPpm', 'xpPpm']) if (!Number.isInteger(k[f]) || k[f] < 100000 || k[f] > 20000000) out.push(id + ': ' + f + ' is not a whole ppm 100000..20000000');
    if (k.floorCapPm !== null && (!Number.isInteger(k.floorCapPm) || k.floorCapPm < 100 || k.floorCapPm > 1000)) out.push(id + ': floorCapPm is not null or 100..1000');
    if (!Number.isInteger(k.rampPm) || k.rampPm < 0 || k.rampPm > 500) out.push(id + ': rampPm is not a whole permille a minute 0..500');
    if (!Number.isInteger(k.rampCapPm) || k.rampCapPm < 1000 || k.rampCapPm > 3000) out.push(id + ': rampCapPm is not 1000..3000');
    if (k.rampPm === 0 && k.rampCapPm !== 1000) out.push(id + ': no ramp, but a ramp cap over 1000');
  }
  return out;
}

const PROBLEMS = validateBosses();
if (PROBLEMS.length) throw new Error('src/data/bosses.js does not load: ' + PROBLEMS.join('; '));
