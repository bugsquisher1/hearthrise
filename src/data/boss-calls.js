// ════════════════════════════════════════════════════════════════════════
// src/data/boss-calls.js — CALL OUT: A PAID PROOF, NEVER A FARM (Tyler 2026-11-04; designer's verdict,
// PRIORITY_BOARD "The boss call").
//
// A party presses Call out on a ground's page and fights a stronger copy of that ground's boss in one room. The
// party leader pays, whatever the dice say. The fight ends on `boss_felled`, on a death, or at the limit.
//
// THE RULE THIS TABLE EXISTS FOR: a called row (monsters.js `called: true`) has `xp: 0`, `gp: [0, 0]`, `drops: []`,
// and the room pays nothing on any route (hunt-rewards.js, hr_hunt_apply_member). Tyler ruled out buying rare drops,
// and `yieldPm: 0` is no way to say so: damage.js yieldOf reads 0 as full yield. tests/boss-call.mjs is the standing
// guard. The prize is a title at price 0, the same whatever the dice say, nothing tradeable.
//
// Postgres reads this table as hr_boss_calls (tools/gen-hunt-sessions.mjs). Fees are the designer's; a row moves them.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const BOSS_CALL_RULES = Object.freeze({
  /* Per account, per UTC day, whichever hero leads. */
  perDay: 3,
  /* A party of at least this many (Tyler: the lone hero skips the King's hall anyway). */
  partyMin: 2,
  /* The fight's limit from the party's first swing: nobody sits in the room for ever. */
  limitMs: 10 * 60000,
});

/* `id` the catalogue id the verb names; `hunt` the called room's hunt and ground (hunts.js CALLED_HUNTS, hunt-grounds.js
   CALLED_GROUNDS); `from` the ground whose page carries the press, and where the party stands afterwards; `monster` the
   called row; `of` the boss it copies; `boss` how a sentence names him (he/him: both are men, as the words say). */
export const BOSS_CALLS = Object.freeze({
  rat_king: Object.freeze({ id: 'rat_king', hunt: 'millrace_sewer_called', from: 'millrace_sewer', monster: 'rat_king_called', of: 'rat_king',
    boss: 'the Rat King', Boss: 'The Rat King', fee: 10000 }),
  chief_coppercap: Object.freeze({ id: 'chief_coppercap', hunt: 'coppercap_warrens_called', from: 'coppercap_warrens', monster: 'chief_coppercap_called', of: 'chief_coppercap',
    boss: 'Chief Coppercap', Boss: 'Chief Coppercap', fee: 30000 }),
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
  press: 'Call out {boss}: {fee} gp',
  warnTitle: 'Call out {boss}?',
  warn: Object.freeze([
    '{Boss} hits harder here than on the ground. At half his health his adds come for whoever isn\'t your tank.{guard} At a quarter he rages and hits harder still. A death ends the fight for the whole party.',
    'You pay {fee} gp from your purse, win or lose. There is no XP, no coin and no drops in this room, only the fight. It ends after {minutes} minutes.',
  ]),
  /* A boss whose adds shield him (monsters.js phases.guardPm): the warning's {guard}, empty for one whose adds don't. */
  warnGuard: ' They shield him until they fall.',
  confirm: 'Call him out: {fee} gp',
  cancel: 'Not yet',
  left: Object.freeze({ one: '1 call left today.', other: '{n} calls left today.', none: 'No calls left today.' }),
  hunting: 'Not while you\'re hunting. Come back to town first.',
  noQuote: 'The server hasn\'t said yet whether he can be called.',
  /* The boss bar (src/shell/widgets/boss-bar.js) past each line, the same words the world calls out (hunt-view/scene.js). */
  bar: Object.freeze({ adds: 'His adds are coming', guarded: 'His adds shield him', enrage: 'He is enraged' }),
  /* The combat log's line, after his name (src/hunt-view/combat-log.js), and what the world calls out over him (src/hunt-view/scene.js). */
  log: Object.freeze({ adds: 'calls his adds. They go for whoever isn\'t your tank.', guarded: 'calls his adds. They go for whoever isn\'t your tank and shield him while they stand.', enrage: 'is enraged, and hits far harder.' }),
  shout: Object.freeze({ adds: 'Adds!', enrage: 'Enraged!' }),
  /* THE LOSING LINE (src/hunt-view/boss-loss.js): where it was lost, what this hero's bar did there, what answers it. {pct} his HP at the end; {times} the server's count. */
  loss: Object.freeze({
    fell: Object.freeze({ first: 'Fell before his adds came, at {pct}%', adds: 'Fell in the add wave at {pct}%', enrage: 'Fell in the enrage at {pct}%' }),
    time: Object.freeze({ first: 'Time ran out before his adds came, at {pct}%', adds: 'Time ran out in the add wave at {pct}%', enrage: 'Time ran out in the enrage at {pct}%' }),
    fact: Object.freeze({ challenge: 'your Challenge fired {times}', heals: 'your heals fired {times}', area: 'your area slots fired {times}', ate: 'you ate {times}' }),
    answer: Object.freeze({
      first: 'His plain blows beat your healing. Bring a healer, eat earlier, or come back a gear tier up.',
      adds: 'His adds go for whoever isn\'t your tank. Challenge brings them to your tank, an area slot like Cleave or Fireball clears them, and Target on Lowest HP kills them first.',
      /* The add wave of a boss whose adds shield him (isGuarded; designer ruling 2026-11-05, the board): the one answer the table says decides it. */
      guarded: 'His adds shield him while they stand. Set your damage dealers\' Target to Lowest HP so they kill the adds before him.',
      enrage: 'Under a quarter of his health he hits far harder. Eat earlier on every bar, and set your healer to heal sooner.',
    }),
  }),
  /* The verb's own refusals (src/data/refusal-words.js holds them for the table's walker; this is the worded row). */
  refused: Object.freeze({
    call_party: '{Boss} wants a party of two or more.',
    call_leader: 'Only your party\'s leader can call him out.',
    call_limit: 'You\'ve called 3 times today. More after midnight UTC.',
    quote_changed: 'The price moved, so you weren\'t charged. Look again.',
    call_unknown: 'Nobody here answers that call, so you weren\'t charged.',
    insufficient_gold: 'You don\'t have the gold, so you weren\'t charged.',
    not_ready: 'Not everyone in the party is ready, so you weren\'t charged. The Party window says who.',
    party_hunting: 'Not while your party is hunting, so you weren\'t charged. Wait until everyone is back in town.',
  }),
});
