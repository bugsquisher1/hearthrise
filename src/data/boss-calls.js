// ════════════════════════════════════════════════════════════════════════
// src/data/boss-calls.js — CALL OUT: A PAID PROOF, NEVER A FARM (Tyler 2026-11-04; designer's verdict,
// PRIORITY_BOARD "The boss call").
//
// A hero alone, or a party's leader, presses Call out on a ground's page and fights a stronger copy of that ground's boss in
// one room. The caller pays, whatever the dice say. The fight ends on `boss_felled`, on a death, or at the limit. A hero alone
// is warned, never refused (designer's ruling 2, PRIORITY_BOARD "2026-11-10 Rulings"; Tyler 11-04 and 11-08: a warning, not a gate).
//
// THE RULE THIS TABLE EXISTS FOR: a called row (monsters.js `called: true`) has `xp: 0`, `gp: [0, 0]`, `drops: []`,
// and the room pays nothing on any route (hunt-rewards.js, hr_hunt_apply_member). Tyler ruled out buying rare drops.
// tests/boss-call.mjs is the standing guard. The prize is a title at price 0, the same whatever the dice say, nothing tradeable.
//
// Postgres reads this table as hr_boss_calls (tools/gen-hunt-sessions.mjs). Fees are the designer's; a row moves them.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const BOSS_CALL_RULES = Object.freeze({
  /* Per account, per UTC day, whichever hero calls. */
  perDay: 3,
  /* The fight's limit from the first swing: nobody sits in the room for ever. */
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
  /* "for {fee} gp", never a colon-joined price (the copy rules; mocks 2026-11-10 SPEC §2 gap 3). A free call reads its event's words
     (src/data/live-events.js WORDS.open_halls: "Call out {boss} for free", "Call him out for free"). */
  press: 'Call out {boss} for {fee} gp',
  warnTitle: 'Call out {boss}?',
  warn: Object.freeze([
    '{Boss} hits harder here than on the ground. At half his health his adds come for whoever isn\'t your tank.{guard} At a quarter of his health he hits even harder. If anyone dies, the fight ends.',
    'You pay {fee} gp, win or lose. You get no XP, coin or drops in his room. The fight ends after {minutes} minutes.',
  ]),
  /* A boss whose adds shield him (monsters.js phases.guardPm): the warning's {guard}, empty for one whose adds don't. */
  warnGuard: ' They shield him until they fall.',
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
  log: Object.freeze({ adds: 'calls his adds. They go for whoever isn\'t your tank.', guarded: 'calls his adds. They go for whoever isn\'t your tank and shield him while they stand.', enrage: 'is enraged, and hits harder.' }),
  shout: Object.freeze({ adds: 'Adds!', enrage: 'Enraged!' }),
  /* THE LOSING LINE (src/hunt-view/boss-loss.js): where it was lost, what this hero's bar did there, what answers it. {pct} his HP at the end; {times} the server's count. */
  loss: Object.freeze({
    fell: Object.freeze({ first: 'You lost before his adds came, with him at {pct}%', adds: 'You lost while his adds were up, with him at {pct}%', enrage: 'You lost after he got enraged, with him at {pct}%' }),
    time: Object.freeze({ first: 'Time ran out before his adds came, with him at {pct}%', adds: 'Time ran out while his adds were up, with him at {pct}%', enrage: 'Time ran out after he got enraged, with him at {pct}%' }),
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
    call_leader: 'Only your party\'s leader can call him out.',
    call_limit: 'You\'ve called 3 times today. More after midnight UTC.',
    quote_changed: 'The price moved, so you weren\'t charged. Look again.',
    call_unknown: 'Nobody here answers that call, so you weren\'t charged.',
    insufficient_gold: 'You don\'t have the gold, so you weren\'t charged.',
    not_ready: 'Not everyone in the party is ready, so you weren\'t charged. The Party window says who.',
    party_hunting: 'Not while your party is hunting, so you weren\'t charged. Wait until everyone is back in town.',
  }),
});
