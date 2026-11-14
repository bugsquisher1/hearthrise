// ════════════════════════════════════════════════════════════════════════
// src/data/boss-halls.js — A KEYED HALL: A BOSS ROOM OPENED WITH A KEY THAT DROPS ON ITS GROUND, AND IT PAYS (the Krell's Hold design's
// engine piece 5, PRIORITY_BOARD "2026-11-10 Krell's Hold" §3; lane/b-barrow-boss-room).
//
// A hero alone, or a party's leader, spends one Hall Key on the hall's ground page and fights the hall's boss in one room. The key is the
// door: the server takes it on entry, journalled, win or lose (supabase/migrations/2027-04-20-boss-hall.sql hr_boss_hall_enter). The fight
// is a called room's (src/core/hunt/boss-room.js): one fight, a limit, his kill ends it, a death ends it for everyone, nothing resets.
// UNLIKE A CALLED ROOM, A HALL PAYS: its boss and his adds are paying rows, so a kill gives Level XP, coin and drops like any ground. The
// called room's money line (src/data/boss-calls.js: a called row pays nothing; tests/boss-call.mjs) is untouched: a hall row is never
// `called`, and a called row never stands in a hall.
//
// THE ROW: `id` the ground whose page carries the press and whose key opens it (the key item's `opens`), and where the party stands after;
// `hunt` the hall's hunt and ground, `<id>_hall` (hunts.js HALL_HUNTS, hunt-grounds.js HALL_GROUNDS, whose ONE spawn is the boss); `key` the
// item spent; `boss` / `Boss` how a sentence names him. Postgres reads it as hr_boss_halls (tools/gen-hunt-sessions.mjs hallRows).
// A NAMED ADD (piece 6): an `adds` row whose monster row is `boss` and `add` both (Captain Hask standing up for Lord Krell): a boss with his
// own kit, his spells and his own enrage line, who never brings a wave of his own or hides behind one (no addsPm, no guardPm), and who
// shields the hall's boss while he stands like any add (core/hunt/boss-phases.js guardPmOf).
// A SPELL THAT SPEEDS UP UNDER HIS LINE (piece 7): the boss row's `phases.hasten` { spell, cdPm } (core/hunt/boss-phases.js spellCdOf):
// at his enrage line that spell's wait is cdPm/1000 of its row's, so the Hall Fire flares twice as often at a quarter (cdPm 500).
//
// THE ROWS ARE A GROUND PACK'S `hall` (src/data/grounds/shape.js), folded in when the first pack carries one: none does on this tree, so
// every table here is empty and nothing serves a hall. tests/boss-hall.mjs holds the engine on its own fixture hall and the rules on any row.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { BOSS_CALLS } from './boss-calls.js?v=0.2.129';
import { HALL_GROUNDS } from './hunt-grounds.js?v=0.2.129';
import { MONSTERS } from './monsters.js?v=0.2.129';

export const BOSS_HALL_RULES = Object.freeze({
  /* The fight's limit from the first swing, the called rooms' ten minutes (the design: "a 10 minute limit"). */
  limitMs: 10 * 60000,
});

/* No hall on this tree (see the header). A row: Object.freeze({ id, hunt: id + '_hall', key, boss, Boss }). */
export const BOSS_HALLS = Object.freeze({});

const rows = () => Object.values(BOSS_HALLS);

/** The hall whose room is hunt `huntId`, or null. */
export function hallOfHunt(huntId) { return rows().find((h) => h.hunt === huntId) || null; }
/** The hall opened from ground `huntId`'s page, or null. */
export function hallFromGround(huntId) { return rows().find((h) => h.id === huntId) || null; }

/** A hall ground's boss: its one spawn (boss-room.js reads the same), or null. */
export function hallBossOf(ground) {
  const s = ground && ground.hall && ground.pockets && ground.pockets[0] && ground.pockets[0].spawns && ground.pockets[0].spawns[0];
  return s ? s.monster : null;
}

/** Is monster row `row` a NAMED ADD (a boss and an add both, piece 6)? The bar and the log name him; the rules read the same. */
export const isNamedAdd = (row) => !!row && row.boss === true && row.add === true;

/** A hall's wave as the log names it: { names (its named adds, in the room's order), others (plain adds come too) }, or null with none named. */
export function namedWaveOf(huntId) {
  const g = HALL_GROUNDS[huntId];
  const adds = g ? g.pockets.flatMap((p) => p.adds || []) : [];
  const names = [...new Set(adds.filter((s) => isNamedAdd(MONSTERS[s.monster])).map((s) => MONSTERS[s.monster].name))];
  if (!names.length) return null;
  return { names: names.length < 3 ? names.join(' and ') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1], others: adds.some((s) => !isNamedAdd(MONSTERS[s.monster])) };
}

/**
 * THE BOSS ROOM hunt `huntId` is, for every screen that shows a room's fight (the boss bar, the combat log, the losing line, the end card):
 * { kind: 'call' | 'hall', id, hunt, monster, boss, Boss }, or null on any other hunt. A called room is BOSS_CALLS's, a hall BOSS_HALLS's.
 * The call alone pays nothing: a screen that says what a room pays asks `kind`.
 */
export function roomOfHunt(huntId) {
  const c = Object.values(BOSS_CALLS).find((x) => x.hunt === huntId);
  if (c) return { kind: 'call', id: c.id, hunt: c.hunt, monster: c.monster, boss: c.boss, Boss: c.Boss };
  const h = hallOfHunt(huntId);
  const monster = h ? hallBossOf(HALL_GROUNDS[h.hunt]) : null;
  return h && monster ? { kind: 'hall', id: h.id, hunt: h.hunt, monster, boss: h.boss, Boss: h.Boss, key: h.key } : null;
}

/* ── THE WORDS (`{Boss}`, `{boss}`, `{key}` the key item's name, `{hall}` the hall's name, `{minutes}`, `{spell}`, `{s}`, `{names}`) ───── */
export const BOSS_HALL_WORDS = Object.freeze({
  heading: 'The hall',
  press: 'Open {hall}',
  have: Object.freeze({ none: 'You don\'t have a {key}.', one: 'You have 1 {key}.', other: 'You have {n} of them.' }),
  warnTitle: 'Fight {boss}?',
  warn: Object.freeze([
    '{Boss} hits hard. At half his health his adds come for whoever isn\'t your tank.{guard} At a quarter of his health he hits even harder.{haste} If anyone dies, the fight ends.',
    'It uses up your {key}, win or lose. The fight ends after {minutes} minutes.',
  ]),
  warnGuard: ' They shield him until they fall.',
  /* the boss row's phases.hasten: the spell that speeds up under his enrage line */
  warnHaste: ' From then on his {spell} comes faster.',
  warnAlone: '{Boss} is built for a party. You can fight him alone, but he can kill you.',
  confirm: 'Use the {key}',
  cancel: 'Not yet',
  opening: 'Opening {hall}…',
  opened: Object.freeze({ party: 'The door opens. Your party is on its way.', alone: 'The door opens. You\'re on your way.' }),
  hunting: 'Not while you\'re hunting. Come back to town first.',
  /* The end card's Hunt again, off for a hall (one door: the key on the ground's page). */
  again: 'His hall opens with a {key}, from the ground\'s page.',
  /* The end card's line when the hall's boss is down (summary-model.js END_WORDS.boss_felled is a called room's: it names a title). */
  felled: 'You beat {Boss}.',
  /* The boss bar (src/shell/widgets/boss-bar.js): the spell that speeds up, counting down, and a named add while he stands. */
  bar: Object.freeze({ soon: '{spell} in {s} s', casting: '{spell} is coming', named: '{pct}%', namedRage: 'Enraged' }),
  /* The combat log's line when his adds come with a named add among them (src/hunt-view/combat-log.js), after his name. */
  log: Object.freeze({
    named: 'calls {names} and his other adds. They go for whoever isn\'t your tank.',
    namedGuarded: 'calls {names} and his other adds. They go for whoever isn\'t your tank and shield him while they stand.',
    namedOnly: 'calls {names}. They go for whoever isn\'t your tank.',
    namedOnlyGuarded: 'calls {names}. They go for whoever isn\'t your tank and shield him while they stand.',
  }),
  /* The verb's own refusals, each moving nothing (supabase/migrations/2027-04-20-boss-hall.sql). */
  refused: Object.freeze({
    hall_leader: 'Only your party\'s leader can open it.',
    no_key: 'You need a {key} for that, so nothing was used.',
    hall_unknown: 'That door doesn\'t open, so nothing was used.',
    not_ready: 'Not everyone in the party is ready, so nothing was used. The Party window says who.',
    party_hunting: 'Not while your party is hunting, so nothing was used. Wait until everyone is back in town.',
  }),
});
