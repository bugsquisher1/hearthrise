// ════════════════════════════════════════════════════════════════════════
// src/data/boss-calls.js — CALL OUT: A BOSS'S DROPS FOR STAMINA AND A LITTLE GOLD, WITHOUT THE ROUTE (Tyler 2026-11-04; reshaped 2026-11-14).
//
// A hero alone, or a party's leader, presses Call out on a ground's page and fights a stronger copy of that ground's boss in
// one room. A fight ends on `boss_felled`, on a death, or at the limit. A hero alone is warned, never refused (designer's ruling 2,
// PRIORITY_BOARD "2026-11-10 Rulings"; Tyler 11-04 and 11-08: a warning, not a gate).
//
// TYLER'S RULINGS, 2026-11-14 (they supersede the 11-04 "no drops from a paid call" and the 3-a-day cap):
//   "it should definitely have a chance for an item drop otherwise there is no point"
//   "I want that mechanic for people want the drops but don't want to burn stamina for them"
//   "calling out a boss should have a slider so you can fight him over and over again but it does cost stamina, it's just not as
//    much stamina because you don't have to do the whole route" (he chose the slider with stamina over gold-only at 3 a day)
// So a WIN pays the boss's own drops (the ground boss `of`: his monsters.js table at his ground rates) plus one CALL-ONLY piece
// (CALL_ITEMS below, `callOnly` on the call row). A loss or the limit pays nothing. No XP, no coin, no trash loot on any route:
// that is what skipping the route costs. tests/boss-call.mjs is the standing guard: a called room pays only on `boss_felled`, only
// from the called boss's own table, never on a loss or at the limit, never XP or coin, and his adds pay nothing at all.
//
// THE SERIES (lane C wires it: `fight` on each call, BOSS_CALL_RULES.maxFights; PRIORITY_BOARD "Boss call drops"): a slider
// picks how many fights in a row, 1 to maxFights, played viewed or not like any hunt. Each fight charges every hero in the room
// his own `fight.staminaMs` and `fight.fee` as it starts, win or lose; the time in the room drains nothing more. The series ends
// at its count, on a death, when a hero's stamina or gold can't pay the next fight, or on a leave. NO DAILY CAP: stamina is
// the limit (Tyler 2026-11-14).
// THE PRICE (designer 2026-11-14, the real settle, 3 seeds x 2 h a cell): on the Sewer a four meets the Rat King every 2.6
// stamina minutes a hero, a pair every 4.6; on the Warrens a four meets Chief Coppercap every 3.1, a pair every 5.1. A call
// fight costs 2 and 2.5: cheaper a boss kill, while the ground keeps its coin, its Level XP and its other drops, so the ground
// stays the better all-round hour. The fee is a small sink, never the main cost.
// UNTIL LANE C LANDS the live verb is ONE paid fight: `fee` and `perDay` are its server columns (hr_boss_calls) and retire with it.
//
// Postgres reads this table as hr_boss_calls (tools/gen-hunt-sessions.mjs). Fees are the designer's; a row moves them.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const BOSS_CALL_RULES = Object.freeze({
  /* The live one-fight verb's: per account, per UTC day, whichever hero calls. Retires with lane C (no daily cap, Tyler 2026-11-14). */
  perDay: 3,
  /* One fight's limit from its first swing: nobody sits in the room for ever. */
  limitMs: 10 * 60000,
  /* The slider's top: the most fights one series can queue. Stamina ends a series long before most players reach it. */
  maxFights: 100,
});

/* `id` the catalogue id the verb names; `hunt` the called room's hunt and ground (hunts.js CALLED_HUNTS, hunt-grounds.js
   CALLED_GROUNDS); `from` the ground whose page carries the press, and where the party stands afterwards; `monster` the
   called row; `of` the boss it copies; `boss` how a sentence names him (he/him: both are men, as the words say).
   `fee` the live one-fight verb's price (retires with lane C). `fight` one fight of a series, charged to EACH hero as it starts,
   win or lose: `staminaMs` (under the ground's own stamina a boss kill, THE PRICE above) and `fee` in gp.
   `callOnly` the piece only his called fight drops (CALL_ITEMS). */
export const BOSS_CALLS = Object.freeze({
  rat_king: Object.freeze({ id: 'rat_king', hunt: 'millrace_sewer_called', from: 'millrace_sewer', monster: 'rat_king_called', of: 'rat_king',
    boss: 'the Rat King', Boss: 'The Rat King', fee: 10000, fight: Object.freeze({ staminaMs: 2 * 60000, fee: 50 }), callOnly: 'kingstooth' }),
  chief_coppercap: Object.freeze({ id: 'chief_coppercap', hunt: 'coppercap_warrens_called', from: 'coppercap_warrens', monster: 'chief_coppercap_called', of: 'chief_coppercap',
    boss: 'Chief Coppercap', Boss: 'Chief Coppercap', fee: 30000, fight: Object.freeze({ staminaMs: 150000, fee: 100 }), callOnly: 'cauldron_lid' }),
});

/* ── THE CALL-ONLY PIECES (Tyler 2026-11-14: "sprinkle items like this throughout the game", normal stats plus ONE attribute) ──
   Each is its tier's plain piece with one attribute the engine already reads (src/core/combat.js equipmentStats: `critB`,
   `steadyPm`) and the bag already words (src/shell/bag-model.js STATS). No jewelry: high-end jewelry is crafted (Tyler 2026-11-14).
   Source: his called fight's win only (monsters.js `<id>_called` drops). Use: worn, and traded (a drop, so it trades). */
export const CALL_ITEMS = Object.freeze({
  /* the Iron Sword's numbers (tier 2, worn at Level 15) and +3% critical chance */
  kingstooth: Object.freeze({ n: 'Kingstooth', icon: '🗡️', v: 600, type: 'weapon', slot: 'weapon', weaponType: 'sword', atkB: 7, strB: 6, critB: 0.03,
    tier: 2, rarity: 'rare', reqSkill: 'level', reqLv: 15 }),
  /* the Coppercap Shield's guard (tier 3, worn at Level 30), no swing penalty, and 5% less from every hit (`steadyPm`, a cape's cut) */
  cauldron_lid: Object.freeze({ n: 'Cauldron Lid', icon: '🛡️', v: 1200, type: 'offhand', slot: 'shield', offhand: 'shield', defB: 7, steadyPm: 50,
    tier: 3, rarity: 'rare', reqSkill: 'level', reqLv: 30 }),
});
export const CALL_ITEM_DESC = Object.freeze({
  kingstooth: 'The Rat King\'s long front tooth, set in an iron hilt. It hits like an Iron Sword and lands more critical hits',
  cauldron_lid: 'The lid off the cauldron Chief Coppercap wears for a crown. It guards like a Coppercap Shield, and every hit you take lands a little softer',
});

const rows = Object.values(BOSS_CALLS);

/** Do a called boss's adds shield him (his monsters.js row's `phases.guardPm`, core/hunt/boss-phases.js)? The words read it, never a second flag. */
export const isGuarded = (row) => !!(row && row.phases && Number.isInteger(row.phases.guardPm) && row.phases.guardPm < 1000);

/** The call whose room is hunt `huntId`, or null. */
export function callOfHunt(huntId) { return rows.find((c) => c.hunt === huntId) || null; }
/** The call pressed from ground `huntId`'s page, or null. */
export function callFromGround(huntId) { return rows.find((c) => c.from === huntId) || null; }

/* ── THE WORDS (designer's table; `{Boss}` and `{boss}` from the row) ───────────────────────────────────────────────── */
export const BOSS_CALL_WORDS = Object.freeze({
  /* "for {fee} gp", never a colon-joined price (the copy rules; mocks 2026-11-10 SPEC §2 gap 3). A free call reads its event's words
     (src/data/live-events.js WORDS.open_halls: "Call out {boss} for free", "Call him out for free"). */
  press: 'Call out {boss} for {fee} gp',
  warnTitle: 'Call out {boss}?',
  warn: Object.freeze([
    '{Boss} hits harder here than on the ground. At half his health his adds come for whoever isn\'t your tank.{guard} At a quarter of his health he hits even harder. If anyone dies, the fight ends.',
    /* LABELS, not a sentence (Tyler 2026-11-14's label rule): what it costs, what it pays, how long. */
    'Cost: {fee} gp, win or lose · Drops on a win · No XP or coin · Time limit: {minutes} min',
  ]),
  /* THE SERIES' LABELS (lane C's slider; Tyler 2026-11-14). {n} fights picked, {stamina} and {gold} the series' whole bill, {fee} and {staminaMin} one fight's. */
  series: Object.freeze({
    fights: 'Fights: {n}',
    stamina: 'Stamina: {staminaMin} min a fight',
    cost: 'Cost: {fee} gp a fight, win or lose',
    drops: 'Drops on a win',
    none: 'No XP or coin',
    limit: 'Time limit: {minutes} min a fight',
    total: 'Total: {stamina} stamina, {gold} gp',
    ends: 'Ends on a death, or when stamina or gold runs out',
    confirm: 'Call him out {n} times',
  }),
  /* A boss whose adds shield him (monsters.js phases.guardPm): the warning's {guard}, empty for one whose adds don't. CHALLENGE IS THE WRONG
     PRESS AT A SHIELDED BOSS (designer 2026-11-14, lane/d-hold-pass; boss-call-table.mjs, the good bar with one answer moved): his own blows
     already fill the tank, so pulling the adds on too is what loses. Chief Coppercap, 100 tries: damage left on him 38% won with Challenge,
     96% without. Krell's Hall, 200 tries: 66% against 99%, and the good bar 98% against 100%. Without Challenge the Target setting moves nothing. */
  warnGuard: ' They shield him until you kill them. Your tank can\'t hold him and his adds at the same time, so take Challenge off your tank\'s bar for this fight.',
  /* The warning's one more line when the room will hold the caller alone (the server's quote says `alone`). */
  warnAlone: '{Boss} is built for a party. You can fight him alone, but he can kill you.',
  confirm: 'Call him out for {fee} gp',
  cancel: 'Not yet',
  /* The status line while the call is out, and once he answers (alone: no party walks in with you). */
  calling: 'Calling {boss} out…',
  answered: Object.freeze({ party: '{Boss} answers. Your party is on its way.', alone: '{Boss} answers. You\'re on your way.' }),
  left: Object.freeze({ one: 'You have 1 call left today.', other: 'You have {n} calls left today.', none: 'You have no calls left today.' }),
  hunting: 'Not while you\'re hunting. Come back to town first.',
  noQuote: 'Checking if you can call him out.',
  /* The boss bar (src/shell/widgets/boss-bar.js) past each line, the same words the world calls out (hunt-view/scene.js). */
  bar: Object.freeze({ adds: 'His adds are coming', guarded: 'His adds shield him', enrage: 'He is enraged' }),
  /* The combat log's line, after his name (src/hunt-view/combat-log.js), and what the world calls out over him (src/hunt-view/scene.js). */
  log: Object.freeze({ adds: 'calls his adds. They go for whoever isn\'t your tank.', guarded: 'calls his adds. They go for whoever isn\'t your tank and shield him until you kill them.', enrage: 'is enraged, and hits harder.' }),
  shout: Object.freeze({ adds: 'Adds!', enrage: 'Enraged!' }),
  /* THE LOSING LINE (src/hunt-view/boss-loss.js): where it was lost, what this hero's bar did there, what answers it. {pct} his HP at the end; {times} the server's count. */
  loss: Object.freeze({
    fell: Object.freeze({ first: 'You lost before his adds came, with him at {pct}%', adds: 'You lost while his adds were up, with him at {pct}%', enrage: 'You lost after he got enraged, with him at {pct}%' }),
    time: Object.freeze({ first: 'Time ran out before his adds came, with him at {pct}%', adds: 'Time ran out while his adds were up, with him at {pct}%', enrage: 'Time ran out after he got enraged, with him at {pct}%' }),
    fact: Object.freeze({ challenge: 'your Challenge fired {times}', heals: 'your heals fired {times}', area: 'your area slots fired {times}', ate: 'you ate {times}' }),
    answer: Object.freeze({
      first: 'His normal hits were too much for your healing. Bring a healer, eat earlier, or come back in better gear.',
      adds: 'His adds go for whoever isn\'t your tank. Challenge brings them to your tank, an area slot like Cleave or Fireball clears them, and Target on Lowest HP kills them first.',
      /* The add wave of a boss whose adds shield him (isGuarded): the one answer the table says decides it (warnGuard above, re-measured 2026-11-14). */
      guarded: 'Your tank can\'t hold him and his adds at the same time. Take Challenge off your tank\'s bar for this fight and let your healer look after whoever the adds go for.',
      enrage: 'Under a quarter of his health he hits far harder. Eat earlier on every bar, and set your healer to heal sooner.',
    }),
  }),
  /* The verb's own refusals (src/data/refusal-words.js holds them for the table's walker; this is the worded row). */
  refused: Object.freeze({
    call_leader: 'Only your party\'s leader can call him out.',
    call_limit: 'You\'ve called 3 times today. More after midnight UTC.',
    quote_changed: 'The price moved, so you weren\'t charged. Look again.',
    call_unknown: 'Nobody here answers that call, so you weren\'t charged.',
    insufficient_gold: 'You don\'t have the gold, so you weren\'t charged.',
    not_ready: 'Not everyone in the party is ready, so you weren\'t charged. The Party window says who.',
    party_hunting: 'Not while your party is hunting, so you weren\'t charged. Wait until everyone is back in town.',
  }),
});
