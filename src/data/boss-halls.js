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
// THE ROWS ARE A GROUND PACK'S `hall` (src/data/grounds/shape.js), folded here and into HALL_HUNTS, HALL_GROUNDS and MONSTERS: Krell's Hall
// (src/data/grounds/krells_hold) is the first. A STAGED PACK'S HALL IS SERVED NOWHERE: its room's hunt is `staged` (hunts.js), so the server
// catalogue leaves it out (OPEN_BOSS_HALLS: hr_boss_halls holds open halls only, and hr_boss_hall_enter refuses the rest `hall_unknown`) and no
// ground page shows its door (hallFromGround). The engine and the tests still play it by hunt (groundOfHunt), as they play a staged ground.
// tests/boss-hall.mjs holds the engine on its own fixture hall, and the generator's rules on every hall in the data as if it were open.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { BOSS_CALLS } from './boss-calls.js?v=0.2.138';
import { HUNT_INDEX } from './hunts.js?v=0.2.138';
import { HALL_GROUNDS } from './hunt-grounds.js?v=0.2.138';
import { MONSTERS } from './monsters.js?v=0.2.138';
import { GROUND_PACKS } from './grounds/index.js?v=0.2.138';

export const BOSS_HALL_RULES = Object.freeze({
  /* The fight's limit from the first swing, the called rooms' ten minutes (the design: "a 10 minute limit"). */
  limitMs: 10 * 60000,
});

/* Every pack's hall (see the header), staged or open. A row: Object.freeze({ id, hunt: id + '_hall', key, boss, Boss }). */
export const BOSS_HALLS = Object.freeze(Object.fromEntries(GROUND_PACKS.filter((p) => p.hall).map((p) => [p.id,
  Object.freeze({ id: p.id, hunt: p.id + '_hall', key: p.hall.key, boss: p.hall.words.boss, Boss: p.hall.words.Boss,
    ...(p.hall.storeFloor ? { storeFloor: p.hall.storeFloor } : {}), ...(p.hall.words.bars ? { bars: p.hall.words.bars } : {}) })])));
/** The halls a player can open: every row whose room is not `staged` (its pack is open). The server catalogue reads these. */
export const OPEN_BOSS_HALLS = Object.freeze(Object.fromEntries(Object.entries(BOSS_HALLS).filter(([, h]) => !(HUNT_INDEX[h.hunt] && HUNT_INDEX[h.hunt].staged === true))));

const rows = () => Object.values(BOSS_HALLS);

/** The hall whose room is hunt `huntId`, or null. */
export function hallOfHunt(huntId) { return rows().find((h) => h.hunt === huntId) || null; }
/** The hall opened from ground `huntId`'s page, or null: an OPEN hall's door only (a staged pack's hall has none: the server holds no row for it). */
export function hallFromGround(huntId) { return Object.values(OPEN_BOSS_HALLS).find((h) => h.id === huntId) || null; }

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
  /* the confirm group's name for a screen reader (src/shell/windows/boss-hall-pane.js) */
  sure: 'Confirm',
  press: 'Open {hall}',
  /* WHERE A KEY COMES FROM (designer 2026-11-14, lane/d-march-balance: the hand play found the page never said). {source} is `source` with
     the monster whose drops name the hall's key, or nothing when no monster drops it. Labels (Tyler 2026-11-14). */
  /* `party`: nobody's own bag holds one here, and the server names the seat whose key the open takes ({name} that hero's; label style) */
  have: Object.freeze({ none: 'Requires {key}{source}', one: '{key}: 1', other: '{key}: {n}', party: '{key}: held by {name}' }),
  source: ', dropped by {dropper}',
  /* ANY SEAT'S KEY OPENS THE HALL (2027-04-24-hall-key-any-seat.sql: the leader's own first, else the first seat's that holds one it has not
     locked), and the leader still makes the press. So a member who holds one is told it counts, as a label (Tyler 2026-11-14: labels, never
     sentences, outside lore). {n} this hero's keys. */
  memberKey: '{key}: {n}, your leader opens the hall',
  /* THE DAILY PRIZE (Tyler 2026-11-14 "a daily kill"; 2027-04-25-boss-daily.sql). Label lines, one a line, every one read from the server's
     own `boss_halls` section (src/session/boss-quote.js hallStateOf), never from this browser's clock or bag. {in} the wait to the server's
     next day ("6 h 12 m"), {n} of {m} the heroes this open marches in who can still take today's. `none` is the confirm's own line when
     nobody would: the key is used all the same. `label` names the list for a screen reader. */
  loot: Object.freeze({
    label: 'Loot',
    left: 'Loot: available',
    taken: 'Loot: claimed today',
    next: 'Next: {in}',
    party: 'Party loot: {n} of {m}',
    none: 'Loot: none today, the key is still used',
    /* A HERO'S FIRST WIN ALWAYS PAYS A PIECE (2027-04-25-boss-daily.sql `first`): said while it is still ahead of this hero */
    first: 'First win: one piece, guaranteed',
    /* THE PRIZE TABLE, the numbers the server rolls (src/core/drops.js prizeSlices over the boss's own rows): `table` opens it, {n} its
       pieces; `row` one piece and its share of a roll; `rowFirst` the same while this hero's first win is ahead, both numbers */
    table: 'Loot table: {n} pieces, one roll a day',
    row: '{item}: {pct}%',
    rowFirst: '{item}: {pct}%, first win {first}%',
  }),
  warnTitle: 'Fight {boss}?',
  /* LABELS, one a line (Tyler 2026-11-14), the same shape as a called room's (boss-calls.js warn). */
  warn: Object.freeze([
    'Hits hard\n50% HP: summons adds that target non-tanks{guard}\n25% HP: hits even harder{haste}\nEnds if anyone dies',
    'Uses {whose} {key}, win or lose\nTime limit: {minutes} min',
  ]),
  /* {whose} in the line above: this hero's own key, or the seat's the server names (any seat's key opens the hall) */
  whose: Object.freeze({ own: 'your', seat: '{name}\'s' }),
  /* the same label as a called room's (boss-calls.js warnGuard): what his adds do, never a move to turn off */
  warnGuard: ' and shield him until killed',
  /* WHAT WINS (lane/d-march-balance, the v0.2.132 re-play: 0 of 6 on the bars a party is handed). A hall that names a store food (`storeFloor`)
     says it, and its bar line (`words.bars`, label style), under the key line; {food} the store food. `foodShort` is red: this hero's bar buys
     weaker food (src/shell/hunt-go.js storeFoodUnder). */
  food: 'Requires {food} or better on every bar',
  foodShort: 'Bar food: {have}. Change that slot to {food}.',
  /* ...for another hero of this account in the party (boss-hall-pane.js foodShortWords) */
  foodShortPeer: '{name}\'s food: {have}. Change that slot to {food}.',
  /* a hero whose name the envelope has not sent yet */
  someHero: 'A hero',
  /* the lead-in to the hall's tips (its `words.bars`, label lines, each one change from the bar a party is handed) */
  tips: 'What wins',
  /* the tips list's name for a screen reader */
  tipsLabel: 'What wins',
  /* the boss row's phases.hasten: the spell that speeds up under his enrage line */
  warnHaste: ', {spell} comes faster',
  /* the ground's own "Recommended: N+ players" (hunt-list.js partyNote) speaks first; this row only where the ground names no size */
  warnAlone: 'Recommended: party',
  confirm: 'Use the {key}',
  cancel: 'Not yet',
  opening: 'Opening {hall}…',
  opened: Object.freeze({ party: 'Door open, party on the way', alone: 'Door open, heading in' }),
  hunting: 'Not while hunting',
  /* The end card's Hunt again, off for a hall (one door: the key on the ground's page). */
  again: 'Fight again: use another {key} from the hunt\'s page',
  /* The end card's line when the hall's boss is down (summary-model.js END_WORDS.boss_felled is a called room's: it names a title). */
  felled: 'You beat {Boss}.',
  /* The boss bar (src/shell/widgets/boss-bar.js): the spell that speeds up, counting down, and a named add while he stands. */
  bar: Object.freeze({ soon: '{spell} in {s} s', casting: '{spell} is coming', named: '{pct}%', namedRage: 'Enraged' }),
  /* The combat log's line when his adds come with a named add among them (src/hunt-view/combat-log.js), after his name. */
  log: Object.freeze({
    named: 'calls up {names} and his adds to attack non-tanks',
    namedGuarded: 'calls up {names} and his adds to shield him and attack non-tanks',
    namedOnly: 'calls up {names} to attack non-tanks',
    namedOnlyGuarded: 'calls up {names} to shield him and attack non-tanks',
  }),
  /* The verb's own refusals, each moving nothing (supabase/migrations/2027-04-20-boss-hall.sql): each says nothing was used. */
  refused: Object.freeze({
    hall_leader: 'Party leader only',
    no_key: 'Requires {key}, nothing used',
    hall_unknown: 'Hall not open, nothing used',
    not_ready: 'Party not ready, nothing used',
    party_hunting: 'Party still hunting, nothing used',
  }),
});
