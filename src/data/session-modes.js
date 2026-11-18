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
//   coin, drops  a kill pays coin / drops loot (no bones, no rare roll).                } WHAT A MODE PAYS (lane/c-tower-climb, phase 2):
//   xpPm         a kill's Level and skill XP, in permille of the formula's.            } the engine pays the row (sessionPayOf: src/core/
//   bestiary     a kill counts for the Bestiary, tasks and Hearthfind.                  } hunt-rewards.js, xp-share.js) and the settle
//   stamina      the session drains stamina as a hunt does.                             } refuses a window that pays more (`mode_pays`,
//                                                                                        } and every XP bound at xpPm:
//                                                                                        } 2027-04-24-tower-climb.sql). TWO LOCKS again.
//   checkpointEvery  a run in this mode may start from every this-many steps of the record it has reached (0: no checkpoints, a run
//                starts at the bottom). Tyler 2026-11-16: the Tower returns to any landing up to the hero's best, a party to the
//                highest landing every member has reached; the server picks the record and checks the pick (hr_mode_checkpoints,
//                2027-04-24-tower-climb.sql), never the client's floor. A descent (the Unmarked Catacombs' vault doors) reads the
//                same field against its own record.
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
  hunt: Object.freeze({ id: 'hunt', deathLossPm: 1000, blessings: true, xpPm: 1000, coin: true, drops: true, bestiary: true, stamina: true, checkpointEvery: 0 }),
  /* The Burning Tower (Tyler 2026-11-14): "it spits you out". A death takes nothing and leaves the Blessings alone. No coin, no
     drops, no Bestiary. Stamina drains. XP: Tyler's "start 50% exp" (the board's §7: an hour against an hour, between 35 and 65% of
     hunting for the median hero alone at the top Level measured, and no cell over hunting). The designer's 200 permille, fitted on
     proxy rooms, read 0.24 on real climbs (lane/c-tower-climb); 375 is fitted on REAL climbs (lane/c-tower-chest,
     `node tools/balance-sim/tower-climb.mjs --levels 10,20,30,45 --seeds 3 --starts -10,0,10 --who solo,pair,three,four`): the
     median hero alone reads 0.44 of hunting at Level 45 (0.47 / 0.43 / 0.64 at 10 / 20 / 30), a party a head about a third,
     the best of 96 cells, three seeds each (a Level 30 bow restarting on its top landing) 0.80, none over; the best skill cell 1.05 of a Training
     Yard hour (the yard costs gold and no stamina). The player's words (drafts for the window lane): docs/planning/PRIORITY_BOARD.md
     '2026-11-15 The Hearth Chest, and the Tower's XP fitted on real climbs'. */
  tower: Object.freeze({ id: 'tower', deathLossPm: 0, blessings: false, xpPm: 375, coin: false, drops: false, bestiary: false, stamina: true,
    checkpointEvery: 10 }),
  /* The Unmarked Catacombs' descent (Tyler 2026-11-16: "their OWN game mode like the Burning Tower"; the board's "2026-11-16 The Unmarked
     Catacombs descent" §2): a copy of `tower`. Keeper Dunn carries a dying hero up because its name isn't in the Wood Book, so a death costs
     nothing and the Blessings stay. No coin, drops or Bestiary; stamina drains. XP starts at the Tower's 375 permille (ASSUMED: the design's
     own words, to be re-fitted on real descents to the same target, about half of hunting for the median hero alone at 45, no cell over).
     Its checkpoints are the vault doors, every 10th room (src/data/tower.js CATACOMB_RULES.landingEvery). */
  catacomb: Object.freeze({ id: 'catacomb', deathLossPm: 0, blessings: false, xpPm: 375, coin: false, drops: false, bestiary: false, stamina: true,
    checkpointEvery: 10 }),
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
    if (!Number.isInteger(m.checkpointEvery) || m.checkpointEvery < 0 || m.checkpointEvery > 1000) out.push(key + ': checkpointEvery is not a whole number 0..1000');
    /* THE ANTI-FARM RULE: a death that costs less than a hunt's pays nothing a hunt pays. */
    if (m.deathLossPm < 1000 && (m.coin || m.drops || m.bestiary)) out.push(key + ': a cheaper death pays coin, drops or Bestiary');
    /* A Blessing is never spent on a death that costs nothing. */
    if (m.deathLossPm === 0 && m.blessings) out.push(key + ': a death that costs nothing uses up the Blessings');
  }
  const d = modes[def];
  if (!d) out.push('the default mode ' + def + ' is no row');
  else if (!(d.deathLossPm === 1000 && d.blessings && d.xpPm === 1000 && d.coin && d.drops && d.bestiary && d.stamina && d.checkpointEvery === 0)) {
    out.push('the default mode ' + def + ' is not a full hunt. Every ground that names no mode would pay or cost less than a hunt');
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

/** WHAT A KILL PAYS in the mode `id` names (absent: the default): { xpPm, coin, drops, bestiary }, the engine's one read of it
    (src/core/combat-sim.js hands it to the rewards and the split). An id no row has is a refusal, never a guess. */
export function sessionPayOf(id) {
  const m = sessionModeOf(id);
  if (!m) throw new Error('sessionPayOf: ' + String(id) + ' is no session mode (src/data/session-modes.js)');
  return Object.freeze({ xpPm: m.xpPm, coin: m.coin, drops: m.drops, bestiary: m.bestiary });
}
