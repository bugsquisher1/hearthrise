// ════════════════════════════════════════════════════════════════════════
// src/data/boss-calls.js — CALL OUT: A BOSS'S DROPS FOR STAMINA, WITHOUT THE ROUTE (Tyler 2026-11-04; reshaped 2026-11-14; no gold 2026-11-20).
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
// THE SERIES (lane/c-boss-call-b, 2027-04-24-boss-call-series.sql; `fight` on each call, BOSS_CALL_RULES.maxFights): a slider
// picks how many fights in a row, 1 to maxFights, played viewed or not like any hunt. Each fight charges every hero in the room
// his own `fight.staminaMs` and `fight.fee` as it starts, win or lose; the time in the room drains nothing more. The series ends
// at its count, on a death, at a fight's limit, when a hero's stamina or gold can't pay the next fight, or on a leave. NO DAILY
// CAP: stamina is the limit (Tyler 2026-11-14).
// WHO DECIDES WHAT: the engine plays ONE fight (src/core/combat-sim.js: his kill ends it `boss_felled`, a death or the limit ends it);
// the SERVER owns the series. When every hero in the room won and fights are left, the settle charges each hero the next fight
// (the fee as the server quoted it at the press, kept for the whole series) and starts it on the same instant, or ends the series:
// `stamina` or `gold_out` for a hero who can't pay it, `party_member_left` for everyone else (the card names that hero and why). The
// engine never counts a fight.
// THE PRICE (designer 2026-11-14, the real settle, 3 seeds x 2 h a cell): on the Sewer a four meets the Rat King every 2.6
// stamina minutes a hero, a pair every 4.6; on the Warrens a four meets Chief Coppercap every 3.1, a pair every 5.1. A call
// fight costs 2 and 2.5: cheaper a boss kill, while the ground keeps its coin, its Level XP and its other drops, so the ground
// stays the better all-round hour. NO GOLD (Tyler 2026-11-20, call 22-8): `fee` is 0, a call is never a roll bought with gold.
// THE DROP DOOR IS OPEN (BOSS_CALL_RULES.dropsLive): it opened with the server half that allows a win's window its items
// (hr_boss_call_pays), holds every win to a paid fight (hunt_sessions' CHECK: wins never pass the fights paid) and proves the win
// from the window's own kill. tests/boss-call.mjs still plays the door shut.
//
// Postgres reads this table as hr_boss_calls (tools/gen-hunt-sessions.mjs). Fees are the designer's; a row moves them.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const BOSS_CALL_RULES = Object.freeze({
  /* One fight's limit from its first swing: nobody sits in the room for ever. */
  limitMs: 10 * 60000,
  /* The slider's top: the most fights one series can queue. Stamina ends a series long before most players reach it. */
  maxFights: 100,
  /* THE DROPS' SWITCH: true, a win rolls his table (src/core/hunt-rewards.js calledSwing). It opened with 2027-04-24-boss-call-series.sql,
     whose allowlist takes a win's items; the hr-accrue carrying this deploys AFTER that file (an older settle refuses every win: called_pays).
     tests/boss-call.mjs plays the door both ways. */
  dropsLive: true,
  /* Natural wins before the call (Tyler 2026-11-18: "you have to beat the boss in the hunting ground X times before you can call them out"): the
     hero's, and every seat's, kills of the boss the call copies (`of`) on a normal hunt (player_progress ev:kill_monster:<of>; a called fight
     counts <of>_called, never this). hr_boss_calls.wins; the evidence: 2027-05-05-entry-gates.sql's header. */
  winsToCall: 10,
});

/* `id` the catalogue id the verb names; `hunt` the called room's hunt and ground (hunts.js CALLED_HUNTS, hunt-grounds.js
   CALLED_GROUNDS); `from` the ground whose page carries the press, and where the party stands afterwards; `monster` the
   called row; `of` the boss it copies; `boss` how a sentence names him (he/him: both are men, as the words say).
   `fight` one fight of a series, charged to EACH hero as it starts, win or lose: `staminaMs` (under the ground's own stamina a
   boss kill, THE PRICE above) and `fee` in gp (hr_boss_calls.fight_stamina_ms, fight_fee; a live event's dial may waive the fee, never the stamina).
   `callOnly` the piece only his called fight drops (CALL_ITEMS). */
export const BOSS_CALLS = Object.freeze({
  rat_king: Object.freeze({ id: 'rat_king', hunt: 'millrace_sewer_called', from: 'millrace_sewer', monster: 'rat_king_called', of: 'rat_king',
    boss: 'the Rat King', Boss: 'The Rat King', fight: Object.freeze({ staminaMs: 2 * 60000, fee: 0 }), callOnly: 'kingstooth' }),
  chief_coppercap: Object.freeze({ id: 'chief_coppercap', hunt: 'coppercap_warrens_called', from: 'coppercap_warrens', monster: 'chief_coppercap_called', of: 'chief_coppercap',
    boss: 'Chief Coppercap', Boss: 'Chief Coppercap', fight: Object.freeze({ staminaMs: 150000, fee: 0 }), callOnly: 'cauldron_lid' }),
});

/* ── THE CALL-ONLY PIECES (Tyler 2026-11-14: "sprinkle items like this throughout the game", normal stats plus ONE attribute) ──
   Each is its tier's piece with one attribute the engine already reads (src/core/combat.js equipmentStats: `bane` through
   src/core/bane.js, `resistPm` through src/core/elements.js resistProfile); the item card's stat lines and its compare say the
   attribute in the engine's numbers (src/shell/bag-model.js statLines, compare).
   A UNIQUE IS NEVER A COPY (Tyler, binding; the coherence pass's C1, board "2026-11-15 Coherence pass"): its own stat mix and its own
   property, never another piece's numbers plus a number (Kingstooth was the Iron Sword plus 3% crit, Widow's Fang the same sword plus
   6%). Each one wins somewhere: Kingstooth on the vermin grounds, the Cauldron Lid against fire (uniques are side-grades, Tyler
   2026-11-18). No jewelry: high-end jewelry is crafted (Tyler 2026-11-14). Designer lane/d-coherence-fixes 2026-11-16, re-landed by
   lane/a-honesty-rescue. Source: his called fight's win only (monsters.js `<id>_called` drops). Use: worn, and traded (a drop, so it trades). */
export const CALL_ITEMS = Object.freeze({
  /* tier 2, worn at Level 15. A tooth is long and thin: it lands more and bites less than an Iron Sword (8 / 5 against 7 / 6),
     and it does 10% more to Vermin (the special catalogue's bane at tier 2: the Mill Cellar and the Sewer are vermin grounds) */
  kingstooth: Object.freeze({ n: 'Kingstooth', icon: '🗡️', v: 600, type: 'weapon', slot: 'weapon', weaponType: 'sword', atkB: 8, strB: 5,
    bane: Object.freeze({ class: 'vermin', mult: 1.1 }), effects: Object.freeze(['bane']),
    tier: 2, rarity: 'rare', reqSkill: 'level', reqLv: 15 }),
  /* tier 3, worn at Level 30. A lid is thinner than a shield: 6 guard against the Coppercap Shield's 7, no swing penalty, and 10% less
     fire damage (the special catalogue's element resistance; "less from every hit" starts at tier 5, so no tier-3 piece carries
     it). The Chief's own Slag Rain and Slag Toss are fire, and so are the Goblin Digger's Blasting Charge and the Turncoat's Smoke
     Pot (src/data/monster-spells.js) */
  cauldron_lid: Object.freeze({ n: 'Cauldron Lid', icon: '🛡️', v: 1200, type: 'offhand', slot: 'shield', offhand: 'shield', defB: 6,
    resistPm: Object.freeze({ ember: 100 }), tier: 3, rarity: 'rare', reqSkill: 'level', reqLv: 30 }),
});
export const CALL_ITEM_DESC = Object.freeze({
  kingstooth: 'The Rat King\'s long front tooth, set in an iron hilt. Vermin feel it most, and it lands more often than an Iron Sword',
  cauldron_lid: 'The lid off the cauldron Chief Coppercap wears as a crown. It guards less than a Coppercap Shield but turns fire aside',
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
  /* The press opens the warning. The price is one fight's: the line beside the press and the warning's labels say it (a free fight
     reads its event's words, src/data/live-events.js WORDS.open_halls). */
  press: 'Call out {boss}',
  warnTitle: 'Call out {boss}?',
  /* LABELS, one a line (Tyler 2026-11-14: "Recommended: 4+ players", "do it like that for everything outside of actual lore"); the note keeps line breaks. */
  warn: Object.freeze([
    'Hits harder than on the ground\n50% HP: summons adds that target non-tanks{guard}\n25% HP: hits even harder\nEnds if anyone dies',
  ]),
  /* THE SERIES' LABELS (the slider; Tyler 2026-11-14). EVERY NUMBER IS THE SERVER'S QUOTE (hr_boss_call_view): {n} the fights picked (1 to its
     max_fights), {fee} and {staminaMin} one fight's price, {minutes} one fight's limit, {stamina} and {gold} the picked count's bill (the quote's
     `totals`, never a sum made in the browser), {covers} the fights the room's stamina and gold pay for right now. */
  series: Object.freeze({
    each: 'A fight costs {staminaMin} min of stamina and {fee} gp.',
    eachFree: 'A fight costs {staminaMin} min of stamina and no gold.',
    pick: 'Fights in a row',
    fights: 'Fights: {n}',
    stamina: 'Stamina: {staminaMin} min a fight',
    cost: 'Cost: {fee} gp a fight, win or lose',
    costFree: 'Cost: no gold',
    drops: 'Drops on a win',
    none: 'No XP or coin',
    limit: 'Time limit: {minutes} min a fight',
    total: 'Total: {stamina} min of stamina, {gold} gp',
    totalFree: 'Total: {stamina} min of stamina',
    covers: Object.freeze({ none: 'Affordable now: none', one: 'Affordable now: 1 fight', other: 'Affordable now: {covers} fights' }),
    /* more than one of this account's heroes in the room ({heroes}, the server's count): whose stamina, whose gold */
    heroes: 'Your {heroes} heroes: each pays its own stamina',
    ends: 'Ends on a death, or when stamina runs out',
    confirm: 'Call him out {n} times',
    confirmOne: 'Call him out once',
    /* WHAT A WIN CAN DROP (audit F24, 2026-11-15: "Why would I pay to fight the Rat King for nothing?"): the head of the list on the page, and how a row's
       odds read. The list and the odds are the SERVER'S (the quote's `drops`: his table with each row's odds); {pct} is its odds as a percent. */
    dropsHead: 'A win can drop',
    odds: Object.freeze({ always: 'every win', pct: '{pct}% a win' }),
    /* While the fights run (the hunt's own line) and once they are over (the summary): the server's count of fights and wins, and what it charged. */
    now: 'Fight {fight} of {fights}',
    done: Object.freeze({ one: 'Won {won} of 1 fight', other: 'Won {won} of {fought} fights' }),
    paid: 'Paid {stamina} min of stamina and {gold} gp',
    paidFree: 'Paid {stamina} min of stamina',
    /* Why a series ended short of its count when the hero could not pay another fight (the session's own end reason, the server's:
       src/hunt-view/summary-model.js endWords reads it for a called room). Labels, the end reasons' shape (text/summary.js end_stamina). */
    ended: Object.freeze({
      stamina: 'Out of stamina for another fight (refills hour for hour in town)',
      gold_out: 'Out of gold for another fight',
    }),
  }),
  /* A boss whose adds shield him (monsters.js phases.guardPm): the warning's {guard}, empty for one whose adds don't. */
  /* NO PER-BOSS CHALLENGE ADVICE (Tyler 2026-11-14: "the player should decide whether or not challenge should be on"; lane/d-march-balance re-fit
     the Chief and Krell so Challenge on and off are both fair, measured in their rows). The label says what the adds do, nothing to turn off. */
  warnGuard: ' and shield him until killed',
  /* The warning's one more line when the room will hold the caller alone (the server's quote says `alone`): the ground's own
     "Recommended: N+ players" (hunt-list.js partyNote), this row only where the ground names no size. */
  warnAlone: 'Recommended: party',
  cancel: 'Not yet',
  /* The status line while the call is out, and once he answers (alone: no party walks in with you). */
  calling: 'Calling {boss} out…',
  answered: Object.freeze({ party: '{Boss} answers, party on the way', alone: '{Boss} answers, heading in' }),
  hunting: 'Not while hunting',
  noQuote: 'Checking…',
  /* THE DANGER, SAID BEFORE THE PRESS (audit F24: a call killed a Level 44 hero whose page had warned of nothing; the keyed hall's card already says what
     wins it). Each line is one fact the SERVER read of the room (the quote's `danger`): {bossLevel} his Level, {lowest} the lowest hero's, {n} the bars
     with no food. Food, a healer, a tank: never a word about Challenge (Tyler 2026-11-14: the player decides). */
  danger: Object.freeze({
    label: 'Before you call him out',
    under: '{Boss}: Level {bossLevel} vs your lowest Level {lowest} (expect to lose)',
    tank: 'No tank (bring a hero with a sword and a shield)',
    healer: 'No healer (bring one, or your best food on every bar)',
    food: Object.freeze({ one: 'No food on 1 hero\'s bar', other: 'No food on {n} heroes\' bars' }),
  }),
  /* Why the press is off, beside it, before anything was pressed (the quote's `why`, the server's; {who} the seat it names, {fee} and
     {staminaMin} one fight's price). The same codes answer a press in `refused` below, where they also say nobody was charged. */
  /* NATURAL WINS BEFORE THE CALL (Tyler 2026-11-18; the quote's `wins` and the envelope's entry_gates.calls, the server's numbers): {name} the
     boss's own name (monsters.js `n` of the row the call copies), {have} and {need} the server's count and number, {who} a seat's name. A label
     a line: this hero's own count while it falls short, then each other seat that does. */
  wins: '{name} wins: {have}/{need}',
  cant: Object.freeze({
    call_wins: 'Requires {need} {name} wins',
    party_wins: '{who}: {name} wins {have}/{need}',
    call_leader: 'Party leader only',
    call_stamina: 'Requires {staminaMin} min of stamina a fight',
    insufficient_gold: 'Requires {fee} gp a fight',
    party_stamina: '{who}: not enough stamina for a fight',
    party_gold: '{who}: not enough gold for a fight',
  }),
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
    call_wins: 'Requires {need} {name} wins, not charged',
    party_wins: '{who}: {name} wins {have}/{need}, nobody charged',
    call_leader: 'Party leader only',
    bad_fights: 'Pick 1 to {max} fights, not charged',
    call_stamina: 'Requires {staminaMin} min of stamina a fight, not charged',
    party_stamina: '{who}: not enough stamina, nobody charged',
    party_gold: '{who}: not enough gold, nobody charged',
    quote_changed: 'Price changed, not charged',
    call_unknown: 'Call not available, not charged',
    insufficient_gold: 'Not enough gold, not charged',
    not_ready: 'Party not ready, not charged',
    party_hunting: 'Party still hunting, not charged',
  }),
});
