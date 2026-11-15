// ════════════════════════════════════════════════════════════════════════
// src/data/session-modes.js — WHAT A HUNT SESSION COSTS AND PAYS: ONE ROW PER MODE (Tyler 2026-11-14, the board's
//   "2026-11-14 The Burning Tower" §3: "dying has no penalty BUT the level xp isn't all that great", "fitting in the system
//   to ensure people are not losing exp while doing these game modes").
//
// Every hunt session plays in a MODE. A ground names its mode (hunt-grounds.js `mode`, the way a called room names its `call`);
// a ground that names none plays DEFAULT_SESSION_MODE, which is every ground today. The server freezes the mode on the hunt
// instance when the session starts, from ITS OWN catalogue (hr_session_modes + hr_ground_session_modes, written from this file
// by tools/gen-session-modes.mjs; 2027-04-23-session-modes.sql). No intent carries a mode and the client never says which one
// it is in.
//
// A ROW:
//   deathLossPm  how much of a death's price (hunt-sessions.js DEATH_XP_LOSS of the total Level XP and of each combat skill's
//                progress) a death in this mode takes, in permille. 1000 = the full price, 0 = nothing. TWO LOCKS: the engine
//                prices the death at this share (src/core/action-rules.js modeDeathShare, combat-sim.js die), and the database
//                bounds the debit by the same share (hr_death_xp_mode_max), so a bug in one can't cost anyone XP.
//   blessings    a death uses up the Blessings held (blessings.js). False: a death leaves them for the next real hunt
//                (hr_hunt_apply_member never calls hr_blessing_take).
//   coin, drops  a kill pays coin / drops loot (no bones, no rare roll).                } What a mode PAYS is read from phase 2
//   xpPm         a kill's Level and skill XP, in permille of the formula's.            } (the Tower's ground): the engine pays the
//   bestiary     a kill counts for the Bestiary, tasks and Hearthfind.                  } row and the settle refuses a window that
//   stamina      the session drains stamina as a hunt does.                             } pays more, in one change. No ground names
//                                                                                        } a mode until then, so every one pays as a hunt.
//
// THE LOAD-TIME RULE (it can't be farmed, and that is a rule on the table): a mode whose death costs less than the full price
// must pay no coin, no drops and no Bestiary, or this module does not load (and so neither does the engine, the edge or the
// generator). Nobody can add a free-death mode that pays like a hunt by forgetting a field. The default mode is a full hunt.
// The XP half is a MEASURED guard, not a per-kill number (the board's §7): it lands with the Tower's rows.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const SESSION_MODES = Object.freeze({
  /* Every ground today. A death takes the full 6% and uses the Blessings up. */
  hunt: Object.freeze({ id: 'hunt', deathLossPm: 1000, blessings: true, xpPm: 1000, coin: true, drops: true, bestiary: true, stamina: true }),
  /* The Burning Tower (Tyler 2026-11-14): "it spits you out". A death takes nothing and leaves the Blessings alone. About half
     the XP of an hour's hunting: 200 permille a kill (the designer's fit of Tyler's "start 50% exp", the board's §7), no coin,
     no drops, no Bestiary. Stamina drains. */
  tower: Object.freeze({ id: 'tower', deathLossPm: 0, blessings: false, xpPm: 200, coin: false, drops: false, bestiary: false, stamina: true }),
});

/* The mode of every ground that names none. */
export const DEFAULT_SESSION_MODE = 'hunt';

const ID = /^[a-z0-9_]{1,32}$/;
const FLAGS = Object.freeze(['blessings', 'coin', 'drops', 'bestiary', 'stamina']);
const permille = (v) => Number.isInteger(v) && v >= 0 && v <= 1000;

/** Every problem with a mode table and its default, as strings. Empty = valid. Pure: the generator's and the tests' one rule. */
export function validateSessionModes(modes, def) {
  const out = [];
  if (!modes || typeof modes !== 'object' || !Object.keys(modes).length) return ['the mode table is empty'];
  for (const [key, m] of Object.entries(modes)) {
    if (!m || typeof m !== 'object') { out.push(key + ': not a row'); continue; }
    if (!ID.test(key) || m.id !== key) out.push(key + ': its id is not its key');
    if (!permille(m.deathLossPm)) out.push(key + ': deathLossPm is not a whole permille 0..1000');
    if (!permille(m.xpPm)) out.push(key + ': xpPm is not a whole permille 0..1000');
    for (const f of FLAGS) if (typeof m[f] !== 'boolean') out.push(key + ': ' + f + ' is not true or false');
    /* THE ANTI-FARM RULE: a death that costs less than a hunt's pays nothing a hunt pays. */
    if (m.deathLossPm < 1000 && (m.coin || m.drops || m.bestiary)) out.push(key + ': a mode whose death costs less than a hunt\'s pays coin, drops or Bestiary');
    /* A Blessing is never spent on a death that costs nothing. */
    if (m.deathLossPm === 0 && m.blessings) out.push(key + ': a death that costs nothing uses up the Blessings');
  }
  const d = modes[def];
  if (!d) out.push('the default mode ' + def + ' is no row');
  else if (!(d.deathLossPm === 1000 && d.blessings && d.xpPm === 1000 && d.coin && d.drops && d.bestiary && d.stamina)) {
    out.push('the default mode ' + def + ' is not a full hunt: every ground that names no mode would pay or cost less than a hunt');
  }
  return out;
}

const PROBLEMS = validateSessionModes(SESSION_MODES, DEFAULT_SESSION_MODE);
if (PROBLEMS.length) throw new Error('src/data/session-modes.js does not load: ' + PROBLEMS.join('; '));

/** The mode row `id` names (absent: the default), or null when no row has that id. */
export function sessionModeOf(id) {
  const k = id === undefined || id === null ? DEFAULT_SESSION_MODE : String(id);
  return Object.hasOwn(SESSION_MODES, k) ? SESSION_MODES[k] : null;
}
