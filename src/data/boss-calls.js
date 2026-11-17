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
  /* LABELS, one a line (Tyler 2026-11-14: "Recommended: 4+ players", "do it like that for everything outside of actual lore"); the note keeps line breaks. */
  warn: Object.freeze([
    'Hits harder than on the ground\n50% HP: adds attack non-tanks{guard}\n25% HP: hits even harder\nEnds if anyone dies',
    'Cost: {fee} gp, win or lose\nNo XP, coin or drops\nTime limit: {minutes} min',
  ]),
  /* A boss whose adds shield him (monsters.js phases.guardPm): the warning's {guard}, empty for one whose adds don't. */
  /* NO PER-BOSS CHALLENGE ADVICE (Tyler 2026-11-14: "the player should decide whether or not challenge should be on"; lane/d-march-balance re-fit
     the Chief and Krell so Challenge on and off are both fair, measured in their rows). The label says what the adds do, nothing to turn off. */
  warnGuard: ' and shield him until killed',
  /* The warning's one more line when the room will hold the caller alone (the server's quote says `alone`): the ground's own
     "Recommended: N+ players" (hunt-list.js partyNote), this row only where the ground names no size. */
  warnAlone: 'Recommended: party',
  confirm: 'Call him out for {fee} gp',
  cancel: 'Not yet',
  /* The status line while the call is out, and once he answers (alone: no party walks in with you). */
  calling: 'Calling {boss} out…',
  answered: Object.freeze({ party: '{Boss} answers, party on the way', alone: '{Boss} answers, heading in' }),
  left: Object.freeze({ one: 'Calls left today: 1', other: 'Calls left today: {n}', none: 'Calls left today: 0' }),
  hunting: 'Not while hunting',
  noQuote: 'Checking…',
  /* The boss bar (src/shell/widgets/boss-bar.js) past each line, the same words the world calls out (hunt-view/scene.js). */
  bar: Object.freeze({ adds: 'Adds incoming', guarded: 'Shielded by adds', enrage: 'Enraged' }),
  /* The combat log's line, after his name (src/hunt-view/combat-log.js), and what the world calls out over him (src/hunt-view/scene.js). */
  log: Object.freeze({ adds: 'calls his adds to attack non-tanks', guarded: 'calls his adds to shield him and attack non-tanks', enrage: 'is enraged and hits harder' }),
  shout: Object.freeze({ adds: 'Adds!', enrage: 'Enraged!' }),
  /* THE LOSING LINE (src/hunt-view/boss-loss.js): three labels, one a line: where it was lost, what this hero's bar did there, what answers it.
     {pct} his HP at the end; {n} the server's count. */
  loss: Object.freeze({
    fell: Object.freeze({ first: 'Lost before his adds, boss at {pct}%', adds: 'Lost during his adds, boss at {pct}%', enrage: 'Lost after his enrage, boss at {pct}%' }),
    time: Object.freeze({ first: 'Time up before his adds, boss at {pct}%', adds: 'Time up during his adds, boss at {pct}%', enrage: 'Time up after his enrage, boss at {pct}%' }),
    fact: Object.freeze({ challenge: 'Challenge casts: {n}', heals: 'Heals cast: {n}', area: 'Area slot casts: {n}', ate: 'Food eaten: {n}' }),
    /* What answers each part of the fight, as a tip. */
    answer: Object.freeze({
      first: 'Tip: Bring a healer, eat earlier or upgrade gear',
      adds: 'Tip: Cleave, Fireball or Target on Lowest HP clears adds',
      /* The add wave of a boss whose adds shield him (isGuarded): the one answer the table says decides it (warnGuard above, re-measured 2026-11-14). */
      guarded: 'Tip: Kill his adds first, heal whoever they attack',
      enrage: 'Tip: Eat earlier and heal sooner below 25% HP',
      /* The enrage of a boss whose adds shield him (isGuarded): what he hits harder is the tank. */
      enrageGuarded: 'Tip: Better tank armor, earlier food, faster heals',
    }),
  }),
  /* The verb's own refusals (src/data/refusal-words.js holds them for the table's walker; this is the worded row). Each says it charged nothing. */
  refused: Object.freeze({
    call_leader: 'Party leader only',
    call_limit: 'Daily limit reached (3), resets at midnight UTC',
    quote_changed: 'Price changed, not charged',
    call_unknown: 'Call not available, not charged',
    insufficient_gold: 'Not enough gold, not charged',
    not_ready: 'Party not ready, not charged',
    party_hunting: 'Party still hunting, not charged',
  }),
});
