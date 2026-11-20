#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-summary.mjs — THE END-OF-HUNT SUMMARY AND THE DEATH EXPLANATION, IN NODE
//
//   node tests/hunt-summary.mjs             the tests, on the real modules
//   node tests/hunt-summary.mjs --selftest  every planted defect must turn a test red
//
// mutant-anchors: src/hunt-view/death-explain.js src/hunt-view/summary-model.js src/session/hunt-summaries.js src/hunt-view/summary-recorder.js src/session/character-session.js src/session/residue.js src/shell/back-in-town.js src/shell/next-buy.js src/shell/hunt-list.js
//
//   D1  a death from a fixture event stream names the killing blows with their
//       amounts, the healing gap, the empty mana, and the heal rule that waited
//   D2  an event id counts once (the same id twice is one hit, not two)
//   D3  events outside the last 10 s are not blamed; with no rule events the
//       explanation still reads, with no rule clause
//   D4  a party wipe explains every hero that fell
//   S1  every END_ORDER reason has a plain sentence
//   S2  the stored history is bounded (8), typed, one entry per session
//   S3  huntSummaries is an allowlisted residue field and a forged value is bounded
//   S4  the summary reads the server's session + analyzer (own vs store supplies)
//       and, for a free character, the session tally
//   S5  Hunt again's arguments are the ended hunt's own
//   S6  a forfeited hunt (the server's `forfeit`) reads why in plain words; a plain server end keeps its own
//   S8  a training session's card is the skill's XP, its levels and the yard's fee (the server's last stop, the tally's XP first),
//       never Monsters / Level XP / Gold zeros; why it ended in the Training window's words; no Hunt again
//   S9  a climb the Burning Tower spat out (a mode whose death takes nothing) reads "Spat out", never "Died", on the card and in Earlier hunts
//   S7  an ended hunt names the tier it ran at (the server's session `tier`) on the card and in Earlier hunts; Normal and a forged tier name the ground alone
//   A1  Hunt again sends ONE hr_hunt_enter with the same ground, set, limits and
//       bag; a call missing its ground sends nothing
//   A2  an ended session stores its summary ONCE (a second envelope for it adds
//       nothing) and the stored card carries the death explanation
//   A5  a new hunt after an ended one is told once (the shell closes the old summary)
//   A3  a re-read that lands before the debounced residue put keeps the stored
//       card (pending residue outlives a replacing envelope until it is put)
//   T1  BACK IN TOWN (UX flow audit 2026-11-11, flow C): the steps come from the server's sections in the order a player does
//       them, each with its real count and value: Equip names the plan's picks; Sell names every stack the LOOT PLAN marks
//       Sell (never a locked stack, the kit or a stack with no bid, one sale's worth of lines); Deposit names the plan's
//       Deposit stacks with their worth; Bless names the tiers not on, only while the purse covers the next; a step with
//       nothing to do is not listed, and nothing to do at all lists nothing
//   T2  ONE GOLD PRESS: the first open step is the card's gold press, else Hunt again
//   T3  DONE STAYS: a step pressed on this card that now has nothing left reads Done with the title it was pressed with; one
//       with something left is open again
//   T4  DEPOSIT IS ONE hr_bank_move_many naming the plan's stacks (lane/c-bank-move-many): all of them or none, never a
//       per-stack hr_bank_move; a refusal moves nothing and says so
//   T5  THE NEXT BUY (next-buy.js, lane/a-next-steps; audit 2026-11-15 F12/F20): with gold to spend, ONE line names what the purse covers:
//       a Shop piece better than the worn one (a bare slot first, then the cheapest) ahead of all (the designer's power first, board
//       2026-11-15 F8/F12), then the shelf (T9): Tempering's next rung (weapon, then armor, material in hand), the cheapest room rung the
//       house is ready for, the dummy's next skill (a house, nobody on it), the cheapest the purse covers, else the nearest; in label words
//       (Tyler 2026-11-14), never sentences; last on the card, Show its press, never the gold press
//   T6  THE NEXT GROUND (hunt-list.js nextGroundFrom; audit 2026-11-18 A12: on a phone Hunt again kept a hero in the Mill Cellar all night after
//       Level 5 and nothing said so): back from a ground the Hunts list no longer recommends, ONE line names the step up it does recommend, read
//       for the server's Level (its level block, never level_xp) or the party's seats, Show opening that ground; never a step down, never for a
//       ground the list does not hold (the Tower), never the gold press
//   T7  SELL JUNK (balance program L03): the Sell step takes the plan's Sell stacks AND the junk no plan holds (the Shop's own Sell all junk set:
//       never a Material, a locked stack, a planned Deposit, a key, gear or what the House's next step names), ONE sale at the shop's bids, "Sell
//       junk for N" when it is all junk; nothing before the server's plans are read
//   T8  ALWAYS SELL THESE (L03): after that sale, the junk it took with no plan is ONE press (the next gold one) setting the existing per-item plan
//       Sell on each (one hr_loot_rule_set an item, twelve a press), done when the server's re-read plan says Sell; PLAYED on a session: the
//       purse and the bag after the sale are the server's, and the next hunt's junk is the plan's sale
//   T9  NEXT BUY WALKS THE WHOLE SHELF (L03): after the Shop's gear, each shelf's next rung (Tempering, rooms, the deed, a chest, the bag, the
//       dummy, a hero slot, a trained skill's tool, a refill after a hunt out of stamina), the cheapest the purse covers, else the nearest with
//       "Need N more"; every price the server's; Show opens where it is bought
// No ?v= on imports here (tests/**).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXPLAIN = 'src/hunt-view/death-explain.js';
const MODEL = 'src/hunt-view/summary-model.js';
const RECORDER = 'src/hunt-view/summary-recorder.js';
const SESSION = 'src/session/character-session.js';
const RESIDUE = 'src/session/residue.js';
const SUMMARIES = 'src/session/hunt-summaries.js';
const TOWN = 'src/shell/back-in-town.js';
const NEXT = 'src/shell/next-buy.js';
const HLIST = 'src/shell/hunt-list.js';
const clone = (o) => JSON.parse(JSON.stringify(o));

/* The names the recorder stamps on events as they arrive (the pose forgets a unit once it is gone). */
const NAMES = { 1: 'Knight', 2: 'Druid', 101: 'Rat King', 102: 'Slime' };
const names = { name: (u) => NAMES[u] || 'Someone', isHero: (u) => u < 100 };

/* The fixture: Knight (1) is hit by the Rat King (101) three times in the last 6 s, last healed 6 s before the death;
   Druid (2) is nearly dry and its heal rule 'Knight below 50%' waited for mana. */
const T = 100000;
const STREAM = [
  { id: (T - 15000) + '.0', type: 'dmg', atMs: T - 15000, u: 102, t: 1, amount: 99 },          // outside the 10 s window
  { id: (T - 8000) + '.0', type: 'heal', atMs: T - 8000, u: 2, t: 1, amount: 60 },
  { id: (T - 7000) + '.0', type: 'dmg', atMs: T - 7000, u: 101, t: 1, amount: 42, ability: 'basic' },
  { id: (T - 6500) + '.0', type: 'rule_wait', atMs: T - 6500, u: 2, t: 1, rule: 'heal_knight_50', rule_label: 'Knight below 50%', why: 'mana' },
  { id: (T - 5000) + '.0', type: 'dmg', atMs: T - 5000, u: 101, t: 1, amount: 38 },
  { id: (T - 2000) + '.0', type: 'dmg', atMs: T - 2000, u: 101, t: 1, amount: 51 },
  { id: T + '.0', type: 'death', atMs: T, u: 1, monster: 'rat_king', xpLost: { level: 120 } },
];
const VITALS = (u) => ({ self: u === 1 ? { mana: 20, manaMax: 20 } : null, others: [{ name: 'Druid', mana: 4, manaMax: 60 }] });

function recorded(events, mod) {
  const rec = mod.createRecorder({ names });
  for (const e of events) rec.add(e, VITALS);
  return rec;
}
const whoOf = (u, death) => ({ name: death.an, vitals: (death.vitals || {}).self || undefined, others: (death.vitals || {}).others });

async function runTests(M) {
  const fails = [];
  const t = async (name, fn) => { try { await fn(); } catch (e) { fails.push(name + ' — ' + (e && e.message || e)); } };
  const ok = (c, msg) => { if (!c) throw new Error(msg); };
  const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + '\n      got  ' + JSON.stringify(a) + '\n      want ' + JSON.stringify(b)); };
  const { EX, MD, CS, RES, END_ORDER } = M;

  await t('D1 the explanation names the killing blows, the gap, the empty mana and the waiting rule', () => {
    const rec = recorded(STREAM, MD);
    const out = EX.explainDeaths(rec.events(), { whoOf });
    eq(out.kind, 'death', 'one death');
    const f = out.deaths[0];
    ok(f.name === 'Knight', 'names the dead hero: ' + f.name);
    ok(f.lines[0].includes('3 Rat King hits (42, 38, 51)'), 'the blows and amounts: ' + f.lines[0]);
    ok(f.lines[0].includes('no heal for 8 s'), 'the healing gap: ' + f.lines[0]);
    ok(f.lines[0].includes('Druid at 4 mana'), 'the empty mana: ' + f.lines[0]);
    ok(f.lines[0].includes("Druid at 4 mana. Rule 'Knight below 50%' was waiting for mana."), 'the rule that waited, its own sentence: ' + f.lines[0]);
    ok(!/;/.test(f.lines.join(' ')), 'no semicolon joins the reasons (copy 11-06): ' + f.lines.join(' | '));
    ok(f.lines[1] === 'The killing blow was 51 from Rat King.', 'the killing blow: ' + f.lines[1]);
    eq(f.damageByType, [{ type: 'physical', total: 131 }], 'damage by type');
  });

  await t('D1b a killing blow from a monster spell names the spell (lane/b-area-client)', () => {
    const spellStream = STREAM.map((e) => (e.atMs === T - 2000 ? Object.assign({}, e, { ability: 'tail_lash' }) : e));
    const f = EX.explainDeaths(recorded(spellStream, MD).events(), { whoOf }).deaths[0];
    ok(f.lines[1] === 'The killing blow was 51 from Rat King’s Tail Lash.', 'the spell\'s killing blow: ' + f.lines[1]);
  });

  await t('D2 an event id counts once', () => {
    const rec = recorded(STREAM.concat(STREAM.slice(2, 6)), MD);   // the next settle restates the window's tail
    eq(rec.events().length, STREAM.length, 'a restated event is not kept twice');
    const f = EX.explainDeaths(rec.events(), { whoOf }).deaths[0];
    ok(f.lines[0].includes('3 Rat King hits (42, 38, 51)') && !f.lines[0].includes('6 Rat King'), 'three blows, not six: ' + f.lines[0]);
    eq(f.hits, 3, 'hit count');
    /* the timeline's own key form dedupes the same way */
    const r2 = MD.createRecorder({ names });
    ok(r2.add({ key: 'i:5.0', type: 'dmg', atMs: 5, u: 101, t: 1, amount: 1 }) && !r2.add({ key: 'i:5.0', type: 'dmg', atMs: 5, u: 101, t: 1, amount: 1 }), 'a key is kept once');
  });

  await t('D3 only the last 10 s is blamed, and no rule events means no rule clause', () => {
    const plain = STREAM.filter((e) => e.type !== 'rule_wait');
    const f = EX.explainDeaths(recorded(plain, MD).events(), { whoOf }).deaths[0];
    ok(!f.lines[0].includes('99'), 'the 15 s old blow is not blamed: ' + f.lines[0]);
    ok(!f.lines[0].includes('rule'), 'no rule clause without rule events: ' + f.lines[0]);
    const bare = EX.explainDeaths(recorded([{ id: '1.0', type: 'death', atMs: 1, u: 5 }], MD).events(), { whoOf }).deaths[0];
    ok(bare.lines[0].startsWith('Someone died:'), 'a bare death still reads: ' + bare.lines[0]);
  });

  await t('D4 a wipe explains every hero that fell', () => {
    const evs = STREAM.concat([{ id: (T + 100) + '.0', type: 'dmg', atMs: T + 100, u: 101, t: 2, amount: 70 },
      { id: (T + 200) + '.0', type: 'death', atMs: T + 200, u: 2, monster: 'rat_king', xpLost: { level: 5 } }, { id: (T + 200) + '.1', type: 'wipe', atMs: T + 200 }]);
    const out = EX.explainDeaths(recorded(evs, MD).events(), { whoOf });
    eq([out.kind, out.deaths.map((f) => f.name)], ['wipe', ['Knight', 'Druid']], 'both heroes, flagged a wipe');
  });

  await t('S1 every END_ORDER reason has a plain sentence', () => {
    eq(Object.keys(MD.END_WORDS), [...END_ORDER], 'END_WORDS covers END_ORDER, in order');
    for (const r of END_ORDER) ok(/^[A-Z][^]*\S$/.test(MD.endWords(r)) && MD.endWords(r) !== 'Hunt ended', r + ' has its own words (a label, Tyler 2026-11-14)');
    ok(MD.endWords('nonsense') === 'Hunt ended', 'an unknown reason still reads');
    /* out of stamina: why, how it comes back, and what the hero has now (panel 2026-11-01: "Your stamina ran out." and nothing else) */
    eq(MD.reasonWords({ reason: 'stamina' }, 'Pip', 5 * 3600000 + 46 * 60000), MD.END_WORDS.stamina + '. Stamina now: 5 h 46 min', 'the stamina end says what is rested');
    eq(MD.END_WORDS.stamina, 'Out of stamina · Stamina refills 1 h per hour', 'the stamina end says why and how it comes back');
    eq(MD.reasonWords({ reason: 'stamina' }, 'Pip', null), MD.END_WORDS.stamina, 'an older hunt, or a server that has not said: no number');
    eq(MD.reasonWords({ reason: 'left' }, 'Pip', 3600000), MD.END_WORDS.left, 'another end says nothing of stamina');
  });

  const entry = (i, over) => Object.assign({ id: 'sess-' + i, hunt: 'mill_cellar', at: 1000 + i, reason: 'left', ms: 60000, kills: i, xp: 10, gold: 5, died: 0,
    loot: [['rat_tail', 3]], supplies: [['wheat_bread', 'own', 2]], preset: 0, hoursLimit: null, bag: [['wheat_bread', 20, 0]], deaths: [] }, over);

  await t('S2 the stored history is bounded, typed and one entry per session', () => {
    const many = Array.from({ length: 30 }, (_, i) => entry(i));
    eq(MD.sanitizeSummaries(many).length, 8, 'at most 8 kept');
    eq(MD.sanitizeSummaries(many)[0].id, 'sess-0', 'newest first, as given');
    eq(MD.sanitizeSummaries([entry(1), entry(1)]).length, 1, 'one per session id');
    const forged = MD.sanitizeSummaries([entry(1, { reason: 'Bad Reason!', hunt: 'BAD ID', loot: [['x y', 1], ['ok_item', 'many']], deaths: ['a'.repeat(5000)], kills: 1.5 })])[0];
    eq([forged.reason, forged.hunt, forged.loot, forged.kills], [null, null, [], null], 'a forged entry is typed');
    ok(forged.deaths[0].length <= 280, 'a death line is bounded');
    const next = MD.withSummary(many, entry(99));
    eq([next.length, next[0].id], [8, 'sess-99'], 'a new summary goes first and the oldest falls off');
  });

  await t('S3 huntSummaries is an allowlisted residue field and a forged value is bounded', () => {
    ok(RES.RESIDUE_FIELDS.includes('huntSummaries'), 'on the allowlist');
    const out = RES.residueOf({ huntSummaries: Array.from({ length: 50 }, (_, i) => entry(i)).concat([{ id: 7 }, null, 'x']), gold: 5 });
    eq(Object.keys(out), ['huntSummaries'], 'only the allowlist');
    eq(out.huntSummaries.length, 8, 'bounded to 8');
  });

  const ended = (over) => Object.assign({ id: 'sess-9', ended: true, hunt: 'mill_cellar', reason: 'died', preset: 1, hoursLimit: 2, enteredMs: 1000, endedMs: 61000,
    bag: [['wheat_bread', 20, 0], ['goldenroot_tea', 10, 1]], tally: { kills: 7, xp: { level: 70, melee: 500, defense: 90 }, coins: 30, loot: { rat_tail: 4 }, supplies: { wheat_bread: 3 }, deaths: 1 }, died: 1 }, over || {});

  await t('S4 the summary reads the analyzer (own vs store) and, for a free character, the tally', () => {
    const an = { sessionMs: 120000, hero: { kills: 164, levelXp: 16311, trainingXp: 40210, gold: 2996, lootValue: 406, supplies: [{ item: 'wheat_bread', source: 'own', count: 12 }, { item: 'wheat_bread', source: 'store', count: 4 }],
      loot: [{ item: 'rat_tail', count: 5 }, { item: 'cheese', count: 9 }], perHour: { levelXp: 489330, rawLevelXp: null, trainingXp: 1206300, gold: 89880, waste: null, balance: 71220 } } };
    const s = MD.buildSummary(ended(), an, ['Knight died.']);
    /* Per hour is the server's figure (designer 2026-10-21): balance for everyone, raw XP only when sent (premium). */
    eq([s.balanceH, s.rawXpH], [71220, null], 'a free character: the server balance per hour, no raw XP per hour');
    const prem = MD.buildSummary(ended(), { ...an, hero: { ...an.hero, perHour: { ...an.hero.perHour, rawLevelXp: 401000 } } }, []);
    eq([prem.balanceH, prem.rawXpH], [71220, 401000], 'a premium character: balance and raw XP per hour');
    eq(MD.sanitizeSummaries([prem])[0].rawXpH, 401000, 'the stored card keeps the per-hour figures');
    /* XP on the card is LEVEL XP, never Level plus training (Tyler 2026-10-22). */
    eq([s.ms, s.kills, s.xp, s.gold, s.reason, s.died], [120000, 164, 16311, 2996, 'died', 1], 'the analyzer numbers, XP = Level XP');
    eq(s.supplies, [['wheat_bread', 'own', 12], ['wheat_bread', 'store', 4]], 'bag vs store');
    /* Brannoc 10-22: gold is the coin received; the loot's shop value is its own line, kept on the stored card. */
    eq([s.lootValue, MD.sanitizeSummaries([s])[0].lootValue, MD.buildSummary(ended(), null, []).lootValue], [406, 406, null], 'loot value (unsold) is its own figure, never in gold');
    /* The hunt's own balance is on the card from the first kill, rated or not (core-loop play 2026-10-30), and kept. */
    const unrated = MD.buildSummary(ended(), { ...an, hero: { ...an.hero, balance: 2228, perHour: { ...an.hero.perHour, balance: null } } }, []);
    eq([unrated.balance, unrated.balanceH, MD.sanitizeSummaries([unrated])[0].balance], [2228, null, 2228], 'the balance shows before the per-hour rate does');
    eq(s.loot[0], ['cheese', 9], 'top loot first');
    /* GEAR AND RARES LEAD, THEN THE SHOP'S BID EACH (designer re-read 2026-11-11: Bones and Rat Tail led by count, the Iron Platebody never got a line) */
    const night = MD.buildSummary(ended(), { ...an, hero: { ...an.hero, loot: [{ item: 'bones', count: 900, value: 900 }, { item: 'rat_tail', count: 300, value: 1800 },
      { item: 'dire_fang', count: 4, value: 600 }, { item: 'iron_platebody', count: 1, value: 100 }, { item: 'wolf_pelt', count: 40, value: null }] } }, []);
    eq(night.loot.map((l) => l[0]), ['iron_platebody', 'dire_fang', 'rat_tail', 'bones', 'wolf_pelt'], 'gear first, then the most each is worth, an unbid row last');
    eq(MD.bestFind([{ item: 'bones', count: 900, value: 900 }, { item: 'iron_platebody', count: 1, value: 400 }]), 'iron_platebody', 'the best find is the gear');
    eq(MD.bestFind([{ item: 'bones', count: 900, value: 900 }]), null, 'Bones are never a best find');
    const free = MD.buildSummary(ended(), null, []);
    eq([free.ms, free.kills, free.xp, free.gold, free.loot, free.supplies], [60000, 7, 70, 30, [['rat_tail', 4]], [['wheat_bread', 'own', 3]]], 'the free character reads the session tally (XP = its Level key, not the skills)');
  });

  await t('S5 Hunt again is the ended hunt\'s own settings', () => {
    const s = MD.buildSummary(ended(), null, []);
    eq(MD.huntAgainOf(s), { hunt: 'mill_cellar', preset: 1, hours: 2,
      bag: [{ item: 'wheat_bread', qty: 20 }, { item: 'goldenroot_tea', qty: 10, essential: true }] }, 'same ground, set, limits, bag');
    eq(MD.huntAgainOf(Object.assign({}, s, { hunt: null })), null, 'no ground, no card button');
    /* The bag it carries is the one it holds now (blind playtest 2026-10-31: the old hunt's 20 shrimp, all eaten, were refused
       "You no longer have that many."), keeping the old hunt's essential marks. */
    eq(MD.againWithBag(MD.huntAgainOf(s), [{ item: 'goldenroot_tea', qty: 3 }, { item: 'cooked_shrimp', qty: 2 }]).bag,
      [{ item: 'goldenroot_tea', qty: 3, essential: true }, { item: 'cooked_shrimp', qty: 2 }], 'what the bag holds now');
    eq(MD.againWithBag(MD.huntAgainOf(s), []).bag, [], 'an empty bag goes on store supplies, as Enter does');
  });

  await t('S6 a forfeited hunt says why in plain words, and that its last minutes did not count', () => {
    /* The server's session as hr_hunt_view projects it after hr_hunt_forfeit (2026-11-17-hunt-density-home.sql). */
    const csOf = (session) => ({ read: (k) => (k === 'hunt' ? { session, pose: null } : null) });
    const sess = (over) => Object.assign({ id: 'sess-f', hunt: 'mill_cellar', preset: 0, entered_at: '2026-10-18T10:00:00Z',
      ended_at: '2026-10-18T10:20:00Z', end_reason: 'server', phase: 'ended', forfeit: true, bag: [], tally: { kills: 3, xp: 30, coins: 5 } }, over || {});
    const card = (session) => MD.sanitizeSummaries([MD.buildSummary(MD.endedSessionOf(csOf(session)), null, [])])[0];
    const f = card(sess());
    eq([f.reason, f.forfeit], ['server', true], 'the stored card keeps the forfeit');
    eq(MD.endWords(f.reason, f.forfeit), 'Stopped by the server. The last minutes did not count', 'the forfeit sentence');
    const plain = card(sess({ forfeit: false }));
    eq([plain.forfeit, MD.endWords(plain.reason, plain.forfeit)], [false, MD.END_WORDS.server], 'a plain server end keeps its own words');
    const left = card(sess({ end_reason: 'left' }));
    ok(/^Left the hunt\. .*did not count$/.test(MD.endWords(left.reason, left.forfeit)), 'a forfeit after Leave says both');
    eq(MD.endWords('died', true), MD.END_WORDS.died, 'a forfeit flag never rewrites another reason');
    for (const w of Object.values(MD.FORFEIT_WORDS).concat(Object.values(MD.END_WORDS))) ok(!/maintenance/i.test(w), 'no maintenance claim: ' + w);
  });

  /* S9 (audit 2026-11-18 A5): the hunt history listed a Burning Tower climb as "Died", though the Tower spits you out and takes nothing. A death in a
     mode that takes nothing for one (session-modes.js deathLossPm 0) reads as the climb's own end, in the summary and in Earlier hunts; a hunt's death keeps "Died". */
  await t('S9 a climb the Tower spat out never reads Died; a hunt\'s death still does', () => {
    eq(MD.endWords('died', false, null, 'Wren', null, 'the_burning_tower'), 'Spat out, no XP lost', 'a Tower death');
    eq(MD.reasonWords({ reason: 'died', hunt: 'the_burning_tower' }, 'Wren', null), 'Spat out, no XP lost', 'the end card\'s reason');
    eq(MD.endWords('died', false, null, 'Wren', null, 'wickstead'), MD.END_WORDS.died, 'a hunt\'s death keeps Died');
    eq(MD.endWords('died'), MD.END_WORDS.died, 'no hunt named: Died');
    eq(MD.endWords('floor_time', false, null, 'Wren', null, 'the_burning_tower'), MD.END_WORDS.floor_time, 'another Tower end keeps its own words');
  });

  await t('S7 an ended hunt names the tier it ran at, on the card and in Earlier hunts', () => {
    /* The server's ended session (hr_hunt_view `tier`, 2027-03-16-ended-hunt-tier.sql): hunt_tier.playing is null by then. */
    const csOf = (session) => ({ read: (k) => (k === 'hunt' ? { session, pose: null } : null) });
    const card = (over) => MD.sanitizeSummaries([MD.buildSummary(MD.endedSessionOf(csOf(Object.assign({ id: 'sess-t', hunt: 'wickstead', preset: 0,
      entered_at: '2026-11-05T10:00:00Z', ended_at: '2026-11-05T10:20:00Z', end_reason: 'left', phase: 'ended', bag: [], tally: { kills: 3, xp: 30, coins: 5 } }, over))), null, [])])[0];
    eq([card({ tier: 'dangerous' }).tier, MD.groundTitle(card({ tier: 'dangerous' }))], ['dangerous', 'Wickstead (Dangerous)'], 'a Dangerous hunt, stored and named');
    eq(MD.groundTitle(card({ tier: 'deadly' })), 'Wickstead (Deadly)', 'a Deadly hunt');
    eq([MD.groundTitle(card({ tier: 'normal' })), MD.groundTitle(card({})), MD.groundTitle(card({ tier: null }))], ['Wickstead', 'Wickstead', 'Wickstead'], 'Normal, or a session the server stamped none on, is the ground alone');
    /* the residue is the player's own file: a forged tier names nothing */
    eq([MD.groundTitle(MD.sanitizeSummaries([entry(1, { hunt: 'wickstead', tier: 'constructor' })])[0]), MD.sanitizeSummaries([entry(1, { tier: 'Deadly!' })])[0].tier],
      ['Wickstead', null], 'a forged tier');
  });

  /* S8 (the designer's coherence pass 2026-11-15, walk rows 5 and 7): an hour of Defense at the yard read "You left the hunt. Monsters 0,
     Level XP 0, Gold 0 gp" and left out the Defense 18 to 20 and the 176 g; its 12-hour end read "The hunt reached its time limit." */
  await t('S8 a training session\'s card is the skill it gave and the fee it cost, from the server, in the yard\'s own words', () => {
    const csOf = (session) => ({ read: (k) => (k === 'hunt' ? { session, pose: null } : null) });
    const sess = (over) => Object.assign({ id: 'sess-y', hunt: 'training_yard_defense', preset: 0, entered_at: '2026-11-15T10:00:00Z', ended_at: '2026-11-15T11:00:00Z',
      end_reason: 'left', phase: 'ended', bag: [], tally: { kills: 0, xp: { level: 0, defense: 30000 }, coins: 0 } }, over || {});
    /* the `training` section's last stop for this session (2027-04-23-training-gear.sql hr_training_section) */
    const stop = { reason: 'left', skill: 'defense', at: null, session: 'sess-y', xp: 30000, paid: 176, level: 20, from: 18 };
    const card = (session, st) => MD.sanitizeSummaries([MD.buildSummary(MD.endedSessionOf(csOf(session)), null, [], null, st)])[0];
    const c = card(sess(), stop);
    eq(c.train, { skill: 'defense', xp: 30000, fee: 176, from: 18, to: 20 }, 'the skill, its XP, the fee and the levels, each the server\'s');
    eq([c.kills, c.xp, c.gold, c.balance, c.loot, c.supplies], [null, null, null, null, [], []], 'no row of hunting zeros');
    eq(MD.huntAgainOf(c), null, 'never an hr_hunt_enter: training has its own Start');
    /* the `training` section can land after the `hunt` one: the card keeps the tally's XP, then the stop fills the rest */
    const early = card(sess(), null);
    eq(early.train, { skill: 'defense', xp: 30000, fee: null, from: null, to: null }, 'before the stop: the session tally\'s XP');
    eq(MD.withTrainingStop(early, stop).train, c.train, 'the stop fills the fee and levels');
    eq([MD.withTrainingStop(early, { ...stop, session: 'sess-other' }), MD.withTrainingStop(c, stop)], [null, null], 'another session\'s stop, or a card already full: nothing');
    /* why it ended: the Training window's words, never a hunt's */
    eq(MD.endWords('left', false, null, 'Wren', null, 'training_yard_defense'), 'Training stopped', 'stopped');
    eq(MD.reasonWords(card(sess({ end_reason: 'hours' }), stop), 'Wren', 5 * 3600000), 'Training ended (12 h reached)', 'the 12-hour end');
    eq(MD.endWords('gold_out', false, null, 'Wren', null, 'training_yard_defense'), 'Training ended (out of gold)', 'out of gold');
    /* Tyler 2026-11-16: a yard session's end read "You went 10 minutes without landing a blow, so you headed home." Every end a
       training session can carry reads as training, never a hunt's words. */
    for (const why of END_ORDER) {
      const w = MD.endWords(why, false, null, 'Wren', null, 'training_yard_ranged');
      ok(/^Training (ended|stopped)/.test(w) && !/hunt|headed home|came home|blow|ammo|stamina/i.test(w), 'a training session ended ' + why + ' reads ' + JSON.stringify(w));
    }
    eq(MD.endWords('hours', false, null, 'Wren', null, 'wickstead'), MD.END_WORDS.hours, 'a hunt keeps its own words');
    eq(card(sess({ hunt: 'wickstead' }), stop).train, null, 'a hunt is no training card');
  });

  const FIX = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
  const endedEnv = (version) => {
    const e = clone(FIX);
    e.version = version;
    e.hunt = { session: { id: 'sess-9', hunt: 'mill_cellar', preset: 1, hours_limit: 2, entered_at: '2026-10-18T10:00:00Z', ended_at: '2026-10-18T10:01:00Z', end_reason: 'died', phase: 'ended',
      bag: [{ item: 'wheat_bread', loaded: 20, left: 4, essential: false }], tally: { kills: 7, xp: 70, coins: 30, loot: { rat_tail: 4 }, supplies: { wheat_bread: 3 }, deaths: 1 } }, pose: null };
    delete e.hunt_analyzer;
    delete e.hunt_events;
    return e;
  };
  CS.observeSessions(M.REC.attach);
  const sessionOn = (calls, body) => new CS.CharacterSession({ slot: 0, uid: 'u', now: () => 0,
    server: { rpc: async (name, args) => { calls.push({ name, args }); return name === 'hr_load' ? { ok: true, body: body() } : { ok: true, body: { ok: true } }; }, accrue: async () => ({ ok: true, body: {} }) },
    setTimer: () => 0, clearTimer: () => {} });

  await t('A1 Hunt again sends ONE hr_hunt_enter with the same settings', async () => {
    const calls = [];
    const cs = sessionOn(calls, () => endedEnv(8));
    const args = MD.huntAgainOf(MD.buildSummary(ended(), null, []));
    const r = await cs.huntAgain(args);
    ok(r.ok, 'the intent was accepted');
    const enters = calls.filter((c) => c.name === 'hr_hunt_enter');
    eq(enters.length, 1, 'exactly one enter');
    eq(enters[0].args, { p_slot: 0, p_hunt: 'mill_cellar', p_bag: args.bag, p_preset: 1, p_hours: 2, p_idem: enters[0].args.p_idem }, 'the same ground, set, limits and bag');
    const before = calls.length;
    const bad = await cs.huntAgain({ hunt: 'Bad Id', preset: 0, bag: [] });
    ok(!bad.ok && calls.length === before, 'a call missing its ground sends nothing');
  });

  await t('A2 an ended session stores its summary once, with the death explanation', async () => {
    const calls = [];
    let v = 8; let state;
    const cs = sessionOn(calls, () => Object.assign(endedEnv(v), state ? { client_state: state } : {}));
    const store = [];
    const real = cs.setResidue.bind(cs);
    /* the summary's writes (the start stamp, residue huntStart, is its own field: L2) */
    cs.setResidue = (f, val) => { if (f === 'huntSummaries') store.push([f, val]); return real(f, val); };
    /* the hunt was open (session id seen) and its events played */
    const open = clone(FIX); open.version = 7; open.hunt = { session: { id: 'sess-9', hunt: 'mill_cellar', preset: 1, phase: 'hunting', bag: [], tally: {} }, pose: FIX.hunt.pose };
    await cs._take(open, 'load');
    cs.timeline.ingest({ events: STREAM.map((e) => Object.assign({}, e, { atMs: e.atMs })), serverNowMs: T, track: [] }, 0);
    cs.timeline.advance(1e9);
    ok(await cs.load(), 'the ended envelope applied');
    eq(store.length, 1, 'one residue write for the ended session');
    ok(store[0][1][0].id === 'sess-9' && store[0][1][0].reason === 'died', 'the card is for the ended session');
    ok(store[0][1][0].deaths.some((d) => d.includes('3 ') && d.includes('hits')), 'the card carries the explanation: ' + JSON.stringify(store[0][1][0].deaths));
    /* The put goes and the server echoes it, then a later copy has lost the card, so the record holds no card
       and only the recorder's own once-per-session rule can stop a second write. */
    await cs.flushResidue();
    state = clone(calls.find((c) => c.name === 'hr_put_client_state').args.p_patch); v = 9;
    await cs.load();
    state = { huntSummaries: [] }; v = 10;
    await cs.load();
    ok(!M.REC.summariesOf(cs).length, 'the fixture lost the card (else the store check hides the once-rule)');
    eq(store.length, 1, 'a second envelope for the same session adds nothing');
  });

  /* THE LEVEL LINE (UI audit 2026-11-18 #1: a 6 h hunt never said "Level 5 to 8"), from two server answers: the stamp of the server's Level
     and skill levels while the session had paid nothing, and the server's Level and skill levels as it ends. Never this build's curve. */
  await t('L1 the level line is two server answers: the stamp of this session and the levels now', async () => {
    const start = { s: 'sess-9', lv: 5, sk: { melee: 3, defense: 2, mining: 4 } };
    const now = { melee: { level: 6 }, defense: { level: 2 }, mining: { level: 9 }, magic: { level: 4 } };
    const line = MD.levelLine('sess-9', start, { level: 8, xp: 1 }, now, ['melee', 'defense', 'magic']);
    eq(line, { lvFrom: 5, lvTo: 8, ups: [['melee', 3, 6]] }, 'Level 5 to 8; only a skill the hunt trained AND the stamp knew, raised (mining is not the hunt\'s)');
    eq(MD.levelLine('sess-8', start, { level: 8 }, now, ['melee']), { lvFrom: null, lvTo: 8, ups: [] }, 'another session\'s stamp gives no start');
    eq(MD.levelLine('sess-9', null, null, now, ['melee']), { lvFrom: null, lvTo: null, ups: [] }, 'no Level block: no line');
    ok(MD.atStart({ ended: false, tally: null }) && MD.atStart({ ended: false, tally: { kills: 0, xp: { level: 0 } } }), 'a session that has paid nothing is at its start');
    ok(!MD.atStart({ ended: false, tally: { kills: 4 } }) && !MD.atStart({ ended: false, tally: { xp: { level: 30 } } }) && !MD.atStart({ ended: true, tally: null }), 'one kill or one XP in, or ended: not the start');
    eq(MD.trainedIn({ tally: { xp: { level: 70, melee: 12, defense: 0 } } }, null), ['melee'], 'the skills the tally paid XP to');
    const S = M.RES.sanitizeResidueField('huntStart', { s: 'sess-9', lv: 5, sk: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['s' + String.fromCharCode(97 + (i % 26)) + 'x'.repeat(Math.floor(i / 26)), 2])) });
    ok(S.lv === 5 && Object.keys(S.sk).length === 32, 'the stamp is bounded: ' + Object.keys(S.sk).length + ' skills');
    eq(M.RES.sanitizeResidueField('huntStart', { s: 'sess-9', lv: 0 }), {}, 'a stamp with no Level is no stamp');
  });

  /* The card played both ways: the hunt viewed (the page saw it start and end) and with the page closed (a new page's first read is the ended
     session, the stamp the first page wrote on the server); and a page that first met the hunt mid-way names only the Level it ended at. */
  const levelled = (v, ended, tally, lv, melee) => {
    const e = clone(FIX); e.version = v;
    e.level = Object.assign({}, e.level, { level: lv });
    e.skill_levels = Object.assign({}, e.skill_levels, { melee: Object.assign({}, e.skill_levels.melee, { level: melee }) });
    e.hunt = { session: Object.assign({ id: 'sess-9', hunt: 'mill_cellar', preset: 1, bag: [], tally },
      ended ? { entered_at: '2026-10-18T10:00:00Z', ended_at: '2026-10-18T16:00:00Z', end_reason: 'stamina', phase: 'ended' } : { phase: 'hunting' }), pose: ended ? null : FIX.hunt.pose };
    delete e.hunt_analyzer; delete e.hunt_events;
    return e;
  };
  const PAID = { kills: 900, xp: { level: 9000, melee: 400 }, coins: 300, loot: { rat_tail: 4 }, supplies: {} };
  await t('L2 the end card says "Level 5 to 8": viewed, and with the page closed', async () => {
    const calls = [];
    let env = levelled(7, false, {}, 5, 3);
    const cs = sessionOn(calls, () => env);
    await cs._take(env, 'load');
    const stamp = cs.record.residue.huntStart;
    eq(stamp && [stamp.s, stamp.lv, stamp.sk.melee], ['sess-9', 5, 3], 'the start is stamped from the server\'s Level and skill levels');
    env = levelled(8, false, { kills: 40, xp: { level: 400 } }, 6, 3);
    await cs._take(env, 'load');
    eq(cs.record.residue.huntStart.lv, 5, 'a later read of the same hunt never moves the stamp');
    env = levelled(9, true, PAID, 8, 6);
    ok(await cs.load(), 'the ended envelope applied');
    const card = M.REC.summariesOf(cs)[0];
    eq(card && [card.lvFrom, card.lvTo, card.ups], [5, 8, [['melee', 3, 6]]], 'VIEWED: the card holds Level 5 to 8 and Melee 3 to 6');
    /* the page closed: the stamp is on the server (the put), a new page's first read is the ended hunt */
    await cs.flushResidue();
    const put = calls.filter((c) => c.name === 'hr_put_client_state').map((c) => c.args.p_patch).find((p) => p.huntStart);
    ok(put && put.huntStart.lv === 5, 'the stamp went to the server: ' + JSON.stringify(put && put.huntStart));
    const later = levelled(10, true, PAID, 8, 6); later.client_state = { huntStart: put.huntStart };
    const cs2 = sessionOn([], () => later);
    await cs2._take(later, 'load');
    const card2 = M.REC.summariesOf(cs2)[0];
    eq(card2 && [card2.lvFrom, card2.lvTo, card2.ups], [5, 8, [['melee', 3, 6]]], 'CLOSED: the next page\'s card holds the same line');
    /* a page that first read the hunt mid-way stamps nothing, and its card names the Level it ended at, no start */
    let mid = levelled(7, false, { kills: 40, xp: { level: 400 } }, 6, 3);
    const cs3 = sessionOn([], () => mid);
    await cs3._take(mid, 'load');
    ok(!cs3.record.residue.huntStart || !cs3.record.residue.huntStart.s, 'no stamp mid-hunt: ' + JSON.stringify(cs3.record.residue.huntStart));
    mid = levelled(8, true, PAID, 8, 6);
    await cs3.load();
    const card3 = M.REC.summariesOf(cs3)[0];
    eq(card3 && [card3.lvFrom, card3.lvTo, card3.ups], [null, 8, []], 'MID-WAY: Level 8, no start and no skill line');
  });

  /* L3 THE STANDING LINE (the faction QA 2026-11-19 #9: "11 h of standing earned in one hunt does not appear on its summary"): the server's
     standing per side stamped at the start beside the Level, and the `factions` section's at the end; the card says what the hunt raised. */
  await t('L3 the end card says the standing a hunt earned, from the server\'s standing at its start and end', async () => {
    const H = 3600000;
    const sided = (v, ended, tally, flame) => Object.assign(levelled(v, ended, tally, 5, 3), { factions: { faction: 'first_flame', can_join: false,
      joined_at: '2026-10-17T00:00:00Z', swap: null, swap_ready_at: '2026-10-24T00:00:00Z', standing: { last_ember: 2 * H, first_flame: flame },
      today_ms: 0, day_cap_ms: 24 * H, pieces: [{ id: 'flamebearer', faction: 'first_flame', need_ms: 25 * H, held: false }], swap_need_ms: 10 * H, cooldown_ms: 7 * 24 * H } });
    let env = sided(7, false, {}, H);
    const cs = sessionOn([], () => env);
    await cs._take(env, 'load');
    eq(cs.record.residue.huntStart && cs.record.residue.huntStart.fx, { last_ember: 2 * H, first_flame: H }, 'the start stamps the server\'s standing per side');
    env = sided(8, true, PAID, 12 * H);
    ok(await cs.load(), 'the ended envelope applied');
    const card = M.REC.summariesOf(cs)[0];
    eq(card && card.standing, [['first_flame', 11 * H]], 'the card holds First Flame +11 h and nothing for the side the hunt did not raise');
    const W = await import(pathToFileURL(join(ROOT, 'src/shell/windows/hunt-summary.js')).href);
    eq(W.resultOf(card).ups, ['First Flame standing +11 h'], 'the card\'s line');
    eq(MD.standingLine('sess-8', cs.record.residue.huntStart, { first_flame: 12 * H }), [], 'another session\'s stamp gives no line');
    eq(MD.standingLine('sess-9', { s: 'sess-9', lv: 5, sk: {} }, { first_flame: 12 * H }), [], 'a stamp from before the factions gives no line');
    const S = M.RES.sanitizeResidueField('huntStart', { s: 'sess-9', lv: 5, sk: {}, fx: { first_flame: -1, 'x y': 3, last_ember: 5 } });
    eq(S.fx, { last_ember: 5 }, 'the stamp keeps only a side id with a whole, unsigned number');
  });

  /* C4 EVERY HUNT REACHES EARLIER HUNTS (post-140 audit C4: both Wickstead days and the Glade death never did, and "Training Yard ... Training
     stopped" took 5 of 7 rows). Both paths. VIEWED: the hunt ends in view, then the yard its plan opens runs and stops again and again: the hunt
     stays, beside ONE yard row. CLOSED: the hunt ended with the page shut and the yard took over, so the page's first read is the yard; the
     server names the hunt (hunt_after.last while the yard runs, the start stamp once it has stopped too), its card is built from the server's
     answer for that session (summary-recorder.js recordPast, the alert centre's one read), placed by its end time, once; never a yard's. */
  await t('C4 a hunt that ended unseen under the yard reaches Earlier hunts, and yard rows never push hunts out', async () => {
    const HUNT = '00000000-0000-4000-a000-00000000c401', YARD = (n) => '00000000-0000-4000-a000-0000000c40' + String(n).padStart(2, '0');
    const yardEnv = (v, id, ended, after) => {
      const e = clone(FIX); e.version = v;
      e.hunt = { session: Object.assign({ id, hunt: 'training_yard_melee', preset: 0, entered_at: '2026-11-18T08:00:0' + (v % 10) + 'Z', bag: [], tally: { xp: { melee: 500 } } },
        ended ? { ended_at: '2026-11-18T09:00:0' + (v % 10) + 'Z', end_reason: 'left', phase: 'ended' } : { phase: 'hunting' }), pose: ended ? null : FIX.hunt.pose };
      e.hunt_after = { choice: 'train', skill: 'melee', grace_s: 300, job: null, now: ended ? null : { session: id, choice: 'wait', skill: null }, last: after || null };
      delete e.hunt_analyzer; delete e.hunt_events;
      return e;
    };
    /* the server's answer for the Wickstead session (hr_hunt_analyzer, the basic block) */
    const answer = (cs, id, hunt) => M.HS.analyzerFrom(cs, { tier: 'basic', hunt_ms: 6.6 * 3600000,
      session: { id, hunt, entered_at: '2026-11-17T20:00:00Z', ended_at: '2026-11-18T02:36:00Z', end_reason: 'stamina', phase: 'ended' },
      hero: { kills: 2924, xp: { level: 52000 }, coins: 14568, loot_value: 900, balance: 15000, loot: { iron_platebody: 1 }, supplies: { own: {}, store: {} } } });
    /* CLOSED: the first read is the yard running, the hunt it took over is the server's last ended session */
    let env = yardEnv(7, YARD(1), false, { session: HUNT, choice: 'train', skill: 'melee', done: { state: 'started' } });
    env.client_state = { huntStart: { s: HUNT, lv: 9, sk: {} } };
    const cs = sessionOn([], () => env);
    await cs._take(env, 'load');
    eq(M.REC.pastToRead(cs), [HUNT], 'the hunt the yard took over is the one to read');
    ok(!M.REC.recordPast(cs, YARD(9), answer(cs, YARD(9), 'training_yard_melee')), 'a training session read this way is never a row');
    ok(M.REC.recordPast(cs, HUNT, answer(cs, HUNT, 'wickstead')), 'the hunt\'s card went in');
    ok(!M.REC.recordPast(cs, HUNT, answer(cs, HUNT, 'wickstead')) && M.REC.summariesOf(cs).length === 1, 'once');
    const card = M.REC.summariesOf(cs)[0];
    eq(card && [card.id, card.hunt, card.kills, card.gold, card.reason, card.train], [HUNT, 'wickstead', 2924, 14568, 'stamina', null], 'its card is the server\'s tally of that session');
    eq(M.REC.pastToRead(cs), [], 'nothing left to read');
    ok(!M.REC.takeFresh(cs), 'it never opens the summary by itself (the away card is the return\'s notice)');
    /* the yard stops: its card is the newest, the hunt stays under it */
    env = yardEnv(8, YARD(1), true, { session: YARD(1), choice: 'wait', skill: null, done: null });
    await cs.load();
    eq(M.REC.summariesOf(cs).map((x) => x.id), [YARD(1), HUNT], 'the yard\'s card first, the hunt under it (by end time)');
    /* CLOSED, the yard already stopped too: the server's last is the yard, the start stamp still names the hunt */
    const late = yardEnv(9, YARD(2), true, { session: YARD(2), choice: 'wait', skill: null, done: null });
    late.client_state = { huntStart: { s: HUNT, lv: 9, sk: {} } };
    const cs2 = sessionOn([], () => late);
    await cs2._take(late, 'load');
    eq(M.REC.pastToRead(cs2), [HUNT], 'the start stamp names the hunt once the yard has stopped');
    ok(M.REC.recordPast(cs2, HUNT, answer(cs2, HUNT, 'wickstead')), 'its card went in');
    eq(M.REC.summariesOf(cs2).map((x) => x.id), [YARD(2), HUNT], 'under the yard that ended after it, never ahead of it');
    /* a session the server names that is a yard's (an older one the list keeps no row for) is judged once, then never asked again */
    const next = clone(FIX); next.version = 30; next.hunt = { session: { id: 'sess-n', hunt: 'wickstead', preset: 1, phase: 'hunting', bag: [], tally: {} }, pose: FIX.hunt.pose };
    next.hunt_after = { choice: 'wait', skill: null, grace_s: 300, job: null, now: { session: 'sess-n', choice: 'wait', skill: null }, last: { session: YARD(5), choice: 'wait', skill: null, done: null } };
    const cs4 = sessionOn([], () => next);
    await cs4._take(next, 'load');
    eq(M.REC.pastToRead(cs4), [YARD(5)], 'the server\'s last ended session is read');
    ok(!M.REC.recordPast(cs4, YARD(5), answer(cs4, YARD(5), 'training_yard_melee')), 'a yard\'s is no row');
    eq(M.REC.pastToRead(cs4), [], 'and is not read again');
    /* VIEWED: the hunt ended in view (its card), then nine yard sessions run and stop: the hunt keeps its row beside ONE yard row */
    let v = 10;
    const run = clone(FIX); run.version = v++; run.hunt = { session: { id: 'sess-h', hunt: 'wickstead', preset: 1, phase: 'hunting', bag: [], tally: {} }, pose: FIX.hunt.pose };
    let cur = run;
    const cs3 = sessionOn([], () => cur);
    await cs3._take(run, 'load');
    cur = Object.assign(endedEnv(v++), {}); cur.hunt.session.id = 'sess-h'; cur.hunt.session.hunt = 'wickstead';
    await cs3.load();
    for (let n = 1; n <= 9; n++) { cur = yardEnv(v++, YARD(10 + n), false, null); await cs3.load(); cur = yardEnv(v++, YARD(10 + n), true, null); await cs3.load(); }
    const rows = M.REC.summariesOf(cs3);
    eq([rows.filter((x) => x.train).length, rows.some((x) => x.id === 'sess-h'), rows[0] && rows[0].id], [1, true, YARD(19)], 'one yard row (the newest) and the hunt still listed');
  });

  await t('A5 a new hunt after an ended one says so once (the shell closes the old summary: playtest v0.2.127)', async () => {
    const calls = [];
    const cs = sessionOn(calls, () => endedEnv(8));
    const run = (id, v) => { const e = clone(FIX); e.version = v; e.hunt = { session: { id, hunt: 'mill_cellar', preset: 1, phase: 'hunting', bag: [], tally: {} }, pose: FIX.hunt.pose }; return e; };
    await cs._take(run('sess-9', 7), 'load');
    ok(!M.REC.takeStarted(cs), 'the first hunt this page sees is no new start');
    ok(await cs.load(), 'the ended envelope applied');
    ok(M.REC.takeFresh(cs), 'the ended hunt is fresh');
    await cs._take(run('sess-10', 9), 'load');
    ok(M.REC.takeStarted(cs), 'the next hunt starting is told');
    ok(!M.REC.takeStarted(cs), 'and told once');
  });

  /* A6 SUMMARY IN A HUNT IS THE HUNT ON NOW (UI audit 2026-11-18: pressed mid-hunt it showed the hunt before): the open session's card,
     from the server's analyzer, marked live with the server's start; never stored, and gone once the hunt ends (its stored card takes over). */
  await t('A6 the hunt on now is its own card, from the server\'s analyzer, never stored', async () => {
    const calls = [];
    const cs = sessionOn(calls, () => endedEnv(8));
    const open = clone(FIX); open.version = 7;
    open.hunt = { session: { id: 'sess-9', hunt: 'mill_cellar', preset: 1, phase: 'hunting', entered_at: '2026-10-18T10:00:00Z', bag: [], tally: { kills: 3 } }, pose: FIX.hunt.pose };
    await cs._take(open, 'load');
    const card = M.REC.liveSummaryOf(cs);
    const an = FIX.hunt_analyzer.hero;
    ok(!!card && card.live === true && card.id === 'sess-9' && card.hunt === 'mill_cellar', 'the hunt on now has a live card: ' + JSON.stringify(card && [card.id, card.hunt, card.live]));
    eq(card && [card.kills, card.balance, card.since], [an.kills, an.balance, Date.parse('2026-10-18T10:00:00Z')], 'its figures are the analyzer\'s and its start the server\'s');
    ok(!M.REC.summariesOf(cs).some((x) => x.id === 'sess-9'), 'the live card was stored');
    ok(await cs.load(), 'the ended envelope applied');
    eq(M.REC.liveSummaryOf(cs), null, 'an ended hunt has no live card');
  });

  await t('A3 a re-read before the residue put lands keeps the stored card (it never blinks out)', async () => {
    const calls = [];
    let v = 8;
    const cs = sessionOn(calls, () => endedEnv(v));
    const open = clone(FIX); open.version = 7; open.hunt = { session: { id: 'sess-9', hunt: 'mill_cellar', preset: 1, phase: 'hunting', bag: [], tally: {} }, pose: FIX.hunt.pose };
    await cs._take(open, 'load');
    ok(await cs.load(), 'the ended envelope applied');
    ok(M.REC.summariesOf(cs).some((x) => x.id === 'sess-9'), 'the card is stored');
    /* the server's copy (no client_state yet: the debounced put has not gone) replaces the record */
    v = 9;
    ok(await cs.load(), 'the re-read applied');
    ok(M.REC.summariesOf(cs).some((x) => x.id === 'sess-9'), 'the re-read dropped the card the put had not sent yet');
    ok(await cs.flushResidue(), 'the put goes');
    ok(calls.some((c) => c.name === 'hr_put_client_state' && Array.isArray(c.args.p_patch.huntSummaries)), 'the put carries the card');
  });

  /* HS-25 (in-page, flaky 2026-10-22): the debounced put went, and a re-read built BEFORE the server stored it
     answered after: its client_state has no card, and nothing was pending any more, so the card blinked out. */
  await t('A4 a re-read that crossed the residue put in flight keeps the card until the server echoes it', async () => {
    const calls = [];
    let v = 8; let state;
    const cs = sessionOn(calls, () => Object.assign(endedEnv(v), state ? { client_state: state } : {}));
    const open = clone(FIX); open.version = 7; open.hunt = { session: { id: 'sess-9', hunt: 'mill_cellar', preset: 1, phase: 'hunting', bag: [], tally: {} }, pose: FIX.hunt.pose };
    await cs._take(open, 'load');
    ok(await cs.load(), 'the ended envelope applied');
    ok(await cs.flushResidue(), 'the put goes (nothing is pending after it)');
    const put = calls.find((c) => c.name === 'hr_put_client_state').args.p_patch;
    v = 9;
    ok(await cs.load(), 'a re-read that predates the put applied');
    ok(M.REC.summariesOf(cs).some((x) => x.id === 'sess-9'), 'a re-read that crossed the put in flight dropped the card');
    /* the server echoes it (jsonb re-orders keys: the echo is matched key order aside) */
    const reorder = (o) => (Array.isArray(o) ? o.map(reorder) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).reverse().map((k) => [k, reorder(o[k])])) : o);
    state = reorder(clone(put)); v = 10;
    ok(await cs.load(), 'the echo applied');
    ok(M.REC.summariesOf(cs).some((x) => x.id === 'sess-9'), 'the echoed card is shown');
    /* once echoed, the server's word is the client's again: a later copy without it (another device) is shown as sent */
    state = { huntSummaries: [] }; v = 11;
    ok(await cs.load(), 'the later re-read applied');
    ok(!M.REC.summariesOf(cs).some((x) => x.id === 'sess-9'), 'an echoed field kept overriding the server forever');
  });

  /* ── Back in town (src/shell/back-in-town.js): a Level 5 sword hero home from the Cellar with the alpha fixture's bag, plans and bids ── */
  const { TN, UP } = M;
  const bag = [{ id: 'rat_tail', qty: 31 }, { id: 'slime_gel', qty: 12 }, { id: 'sticky_core', qty: 1 }, { id: 'bones', qty: 8 }, { id: 'wolf_pelt', qty: 3 },
    { id: 'leather_gloves', qty: 1 }, { id: 'bronze_belt', qty: 1 }, { id: 'shrimp', qty: 4 }];
  const rules = { locked: new Set(['sticky_core']), loot: { rat_tail: 'sell', slime_gel: 'sell', sticky_core: 'sell', bones: 'sell', wolf_pelt: 'deposit', shrimp: 'sell' } };
  const bids = new Map([['rat_tail', 6], ['slime_gel', 5], ['sticky_core', 35], ['wolf_pelt', 7], ['shrimp', 2]]);
  const blessings = { tiers: [{ tier: 1, price: 0, held: false }, { tier: 2, price: 0, held: false }, { tier: 3, price: 0, held: false }], freeUntil: 30 };
  const plan = UP.upgradePlan({ equipment: { weapon: 'bronze_sword' }, bag, skills: { defense: { level: 1 }, melee: { level: 1 } }, level: 5 });
  const steps = (over) => TN.townSteps(Object.assign({ plan, bag, rules, bids, blessings, purse: 100, did: new Map() }, over || {}));

  await t('T1 the steps come from the server\'s sections, in order, each with its real count and value', () => {
    const r = steps();
    eq(r.steps.map((s) => s.id), ['equip', 'sell', 'deposit', 'bless'], 'the four steps, in the order a player does them');
    eq(r.steps.map((s) => s.title), ['Equip 2 better pieces', 'Sell 2 stacks for 246 gp', 'Deposit 1 stack worth 21 gp', 'Bless I, II and III'], 'the titles carry the count and the value');
    eq(r.steps.map((s) => s.verb), ['Equip', 'Sell', 'Deposit', 'Bless'], 'the presses are the glossary\'s words');
    const sell = r.steps[1];
    /* the LOOT PLAN's rule, Dispatch loot's own (Coordinator 2026-11-11): never a locked stack (Sticky Core), the kit (Shrimp) or a stack with no bid (Bones) */
    eq(sell.lines, [{ item: 'rat_tail', qty: 31 }, { item: 'slime_gel', qty: 12 }], 'the sale names the plan\'s Sell stacks whole, and nothing else');
    eq(sell.words, 'Marked Sell: Rat Tail and Slime Gel', 'the sale says whose rule it is');
    eq(r.steps[0].ops, { gloves: 'leather_gloves', belt: 'bronze_belt' }, 'Equip is the plan\'s ONE delta');
    eq(r.steps[0].words, 'Upgrade: Leather Gloves (+1 Melee accuracy) and Bronze Belt (+2 Defense)', 'Equip says what goes on');
    eq(r.steps[2].lines, [{ item: 'wolf_pelt', qty: 3 }], 'Deposit names the plan\'s Deposit stacks whole');
    eq(r.steps[2].words, 'Marked Deposit: Wolf Pelt, frees 1 bag space', 'Deposit says what it frees');
    /* a locked stack is never moved by a plan (the server's Dispatch loot skips it too): locked, the Wolf Pelt leaves no Deposit step */
    eq(steps({ rules: { locked: new Set(['sticky_core', 'wolf_pelt']), loot: rules.loot } }).steps.map((s) => s.id), ['equip', 'sell', 'bless'], 'a locked Deposit stack is not a step');
    eq([r.steps[3].tiers, r.steps[3].words], [[1, 2, 3], 'Free until Level 30'], 'Bless names the tiers not on');
    /* ONE LINE ON WHAT A BLESSING DOES (L03, retention R6), from the server's tier rows: each tier's permille counts the ones under it, so the top
       tier's is the cut with all of them on */
    const said = { tiers: [{ tier: 1, price: 0, held: false, permille: 250 }, { tier: 2, price: 0, held: false, permille: 500 }, { tier: 3, price: 0, held: false, permille: 750 }], freeUntil: 30 };
    eq(steps({ blessings: said }).steps[3].words, 'A death costs 75% less XP and uses them up · Free until Level 30', 'Bless says what a Blessing does');
    eq(steps({ blessings: { ...said, tiers: said.tiers.map((x) => ({ ...x, price: 1000, held: x.tier === 1 })) }, purse: 5000 }).steps[3].words,
      'A death costs 75% less XP and uses them up · Cost: 2,000 gp', '...and what the ones not on cost');
    /* one sale's worth of lines: 70 planned stacks sell 64 now, the rest on the next press */
    const many = Array.from({ length: 70 }, (_, i) => ({ id: 'stack_' + i, qty: 1 }));
    const r70 = steps({ bag: many, rules: { locked: new Set(), loot: Object.fromEntries(many.map((x) => [x.id, 'sell'])) }, bids: new Map(many.map((x) => [x.id, 3])) });
    const s70 = r70.steps.find((s) => s.id === 'sell');
    eq([s70.count, s70.lines.length, s70.title], [64, 64, 'Sell 64 stacks for 192 gp'], 'one sale\'s worth of lines');
    /* Bless only while the purse covers the next tier (the server prices each); a purse not read reads as enough */
    const dear = { tiers: [{ tier: 1, price: 500, held: true }, { tier: 2, price: 900, held: false }, { tier: 3, price: 1400, held: false }], freeUntil: null };
    eq(steps({ blessings: dear, purse: 100 }).steps.map((s) => s.id), ['equip', 'sell', 'deposit'], 'short of the next Blessing, no Bless step');
    eq(steps({ blessings: dear, purse: 900 }).steps[3].title + ' · ' + steps({ blessings: dear, purse: 900 }).steps[3].words, 'Bless II and III · Cost: 2,300 gp', 'the purse covers the next');
    eq(steps({ blessings: dear, purse: null }).steps.length, 4, 'a purse not read yet is not a refusal');
    /* after a hunt whose death costs nothing (the Tower: QA gate 2026-11-17, the climb's card upsold Bless I/II/III) there is no Bless step */
    eq(steps({ free: true }).steps.map((s) => s.id), ['equip', 'sell', 'deposit'], 'no Bless step after a free-death mode');
    /* nothing to do at all: no steps, Hunt again is the press (no plan, and no junk: the Rat Tail is the bag's one junk, T7) */
    const none = steps({ plan: { ops: {}, picks: [], choices: [] }, bag: bag.filter((r) => r.id !== 'rat_tail'), rules: { locked: new Set(), loot: {} }, blessings: { tiers: dear.tiers.map((x) => ({ ...x, held: true })), freeUntil: null } });
    eq([none.steps, none.primary], [[], 'again'], 'nothing to do lists nothing');
    eq(steps({ plan: null, bag: null, rules: null, bids: null, blessings: null, purse: null }).steps, [], 'sections not read yet list nothing');
  });

  await t('T2 the first open step is the one gold press, else Hunt again', () => {
    eq(steps().primary, 'equip', 'Equip first');
    eq(steps({ plan: { ops: {}, picks: [] } }).primary, 'sell', 'with nothing to wear, Sell');
    const did = new Map([['equip', 'Equip 2 better pieces'], ['sell', 'Sell 2 stacks for 246 gp']]);
    const r = steps({ plan: { ops: {}, picks: [] }, bag: bag.filter((x) => x.id !== 'rat_tail'), rules: { locked: new Set(), loot: { wolf_pelt: 'deposit' } }, did });
    eq([r.steps.map((s) => s.id + (s.done ? ':done' : '')), r.primary], [['equip:done', 'sell:done', 'deposit', 'bless'], 'deposit'], 'past the done rows, the first open step');
  });

  await t('T3 a pressed step with nothing left reads Done with the title it was pressed with, and stays', () => {
    const did = new Map([['sell', 'Sell 2 stacks for 246 gp']]);
    const sold = steps({ bag: bag.filter((r) => r.id !== 'rat_tail' && r.id !== 'slime_gel'), did });
    const row = sold.steps.find((s) => s.id === 'sell');
    eq([row.done, row.title, row.words], [true, 'Sell 2 stacks for 246 gp', ''], 'Done, saying what it did');
    /* pressed, but a refusal left stacks behind: open again with what is left */
    const left = steps({ bag: bag.filter((r) => r.id !== 'rat_tail'), did }).steps.find((s) => s.id === 'sell');
    eq([left.done, left.title], [false, 'Sell 1 stack for 60 gp'], 'what is left stays a press');
  });

  await t('T4 Deposit is ONE hr_bank_move_many naming the plan\'s stacks, all or nothing', async () => {
    const lines = [{ item: 'wolf_pelt', qty: 3 }, { item: 'bones', qty: 8 }, { item: 'rat_tail', qty: 2 }];
    const calls = [];
    let refuse = null;
    const server = { accrue: async () => ({ ok: true, body: {} }), rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'hr_load') return { ok: true, body: endedEnv(8) };
      if (name === 'hr_bank_move_many') return refuse ? { ok: false, body: { ok: false, error: refuse, item: 'bones', index: 1 } } : { ok: true, body: { ok: true, count: 3 } };
      return { ok: true, body: { ok: true } };
    } };
    const cs = new CS.CharacterSession({ slot: 0, uid: 'u', now: () => 0, server, setTimer: () => 0, clearTimer: () => {} });
    const r = await TN.depositPlanned({ server }, cs, lines);
    eq([r.ok, r.moved], [true, 3], 'every stack went, the server\'s count');
    const many = calls.filter((c) => c.name === 'hr_bank_move_many');
    eq([many.length, many[0].args.p_slot, many[0].args.p_items], [1, 0, [{ item: 'wolf_pelt', dir: 'deposit' }, { item: 'bones', dir: 'deposit' }, { item: 'rat_tail', dir: 'deposit' }]], 'ONE bulk move naming the stacks, no counts');
    ok(!calls.some((c) => c.name === 'hr_bank_move'), 'never a per-stack hr_bank_move');
    /* refused: nothing moved, the server's reason stands, still one ask */
    refuse = 'bank_full';
    const no = await TN.depositPlanned({ server }, cs, lines);
    eq([no.ok, no.error, no.moved], [false, 'bank_full', 0], 'a refusal moves nothing');
    eq(calls.filter((c) => c.name === 'hr_bank_move_many').length, 2, 'one ask per press');
  });

  await t('T5 with gold to spend the card names ONE next buy the purse covers, from the server\'s sections, last and never the gold press', async () => {
    const { NB } = M;
    /* audit 2026-11-15 F12/F20 and the Practice Shield worn to 87: a tank at 31 with the Shop's Bronze-Rimmed Shield on offer */
    const tank = { weapon: 'steel_sword', shield: 'practice_shield', helmet: 'bronze_helm', body: 'bronze_platebody', pants: 'bronze_platelegs', boots: 'bronze_boots', gloves: 'bronze_gauntlets', belt: 'bronze_belt' };
    const noBelt = { ...tank }; delete noBelt.belt;
    const sk = { defense: { level: 31, xp: 0 }, melee: { level: 31, xp: 0 } };
    const shop = (...o) => ({ offers: o.map(([item, price, kind]) => ({ offer: 'shop.' + item, item, kind: kind || 'gear', price })), bids: new Map() });
    const buy = (over) => NB.nextBuy(Object.assign({ purse: 5000, equipment: tank, skills: sk, level: 31, prefer: 'heavy', chosen: 'heavy', shop: shop(['bronze_rimmed_shield', 140]),
      temper: null, dummy: null, home: null, bag: [], bank: [] }, over || {}));
    const shield = buy();
    eq(shield && [shield.kind, shield.title, shield.words, shield.icon, shield.place], ['gear', 'Next buy: Bronze-Rimmed Shield (140 gp)', '+1 Defense vs Practice Shield', 'bronze_rimmed_shield',
      { kind: 'shop', item: 'bronze_rimmed_shield' }], 'a Shop piece better than the worn one, its price and what it adds');
    /* a bare slot first, though dearer; a piece worse than the worn one, another style's, or past the purse is never named */
    const bare = buy({ equipment: noBelt, shop: shop(['bronze_rimmed_shield', 140], ['bronze_belt', 200]) });
    eq(bare && [bare.title, bare.words], ['Next buy: Bronze Belt (200 gp)', '+2 Defense, +22 health, empty belt slot'], 'an empty slot comes first');
    eq(buy({ purse: 139 }), null, 'past the purse, nothing');
    eq(buy({ equipment: { ...tank, shield: 'bronze_rimmed_shield' } }), null, 'what is worn already is not bought again');
    eq(buy({ shop: shop(['bronze_rimmed_shield', 140, 'tool']) }), null, 'only the Shop\'s gear');
    /* THE PLAN'S WEIGHT RULE, AND WHERE THE HERO'S WEIGHT COMES FROM (the full-game audit's A11, 2026-11-18: Next buy sold Leather Gloves, medium, to
       a heavy hero at Level 9 and they stayed on to 85; designer ruling 2b of 2026-11-18). Next buy reads upgradePlan's rule (upgrade-plan.js
       weightFits), never its own: a bare slot takes any weight, so a heavy hero's bare gloves slot is sold the medium pair, as a medium hero's is;
       a slot worn off the weight chosen at Tamsin's is never sold another piece of that off weight (a better Studded Helmet over a worn Leather
       Helmet), and the line names the heavy piece Equip upgrades would move it to and where it comes from, from the catalogue (item-lore.js
       wherePlaces), its Show opening there; so does a bare slot no Shop piece fills. */
    const { wherePlaces } = await import(pathToFileURL(join(ROOT, 'src/shell/item-lore.js')).href);
    const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src/data/items.js')).href);
    const dressed = tank;
    const noGloves = { ...dressed }; delete noGloves.gloves;
    const gloves = shop(['leather_gloves', 160]);
    eq(buy({ equipment: noGloves, shop: gloves }).title, 'Next buy: Leather Gloves (160 gp)', 'a heavy hero\'s bare gloves slot is sold the medium pair (a bare slot takes any weight)');
    eq(buy({ equipment: noGloves, shop: gloves, prefer: 'medium', chosen: 'medium' }).title, 'Next buy: Leather Gloves (160 gp)', 'a medium hero is sold them too');
    const isFind = (find, kind) => { const fit = find && ITEMS[find.icon];
      return [find && find.kind, find && new RegExp('^Next upgrade: .+ \\(' + kind + '\\)$').test(find.title), fit && fit.slot, fit && fit.armourClass, fit && fit.reqLv <= 31, find && find.words, find && find.place]; };
    const want = (find, slot) => ['find', true, slot, 'plate', true, (wherePlaces(find && find.icon)[0] || {}).words, (wherePlaces(find && find.icon)[0] || {}).place];
    const bareFind = buy({ equipment: noGloves, shop: shop() });
    eq(isFind(bareFind, 'heavy gloves'), want(bareFind, 'gloves'), 'a bare slot no Shop piece fills: the heavy gloves it can wear, and where they come from');
    const wornFind = buy({ equipment: { ...dressed, gloves: 'leather_gloves' }, shop: gloves });
    eq(isFind(wornFind, 'heavy gloves'), want(wornFind, 'gloves'), 'a slot worn off the chosen weight names the heavy gloves Equip upgrades would move it to');
    const helmFind = buy({ equipment: { ...dressed, helmet: 'leather_helmet' }, shop: shop(['studded_helmet', 300]) });
    eq(isFind(helmFind, 'heavy helmet'), want(helmFind, 'helmet'), 'a better piece of a worn off weight is never the buy');
    /* the Shop's Bronze Belt moves a worn Leather Belt to the chosen weight, and the line says what the move gives up beside what it adds; a worn
       Studded Leather Belt (tier 2) is never moved to it (a lower tier) */
    const move = buy({ equipment: { ...dressed, belt: 'leather_belt' }, shop: shop(['bronze_belt', 220]) });
    eq(move && [move.kind, move.title, move.words], ['gear', 'Next buy: Bronze Belt (220 gp)', '+1 Defense, +22 health, -0.4% critical chance vs Leather Belt'], 'a move to the chosen weight, its cost said');
    eq(buy({ equipment: { ...dressed, belt: 'studded_belt' }, shop: shop(['bronze_belt', 220]) }).kind, 'find', 'never a lower tier');
    eq(buy({ equipment: dressed, shop: gloves }), null, 'a full set of the hero\'s weight: nothing to find');
    /* Tempering's next rung: the weapon's, then the armor's, gold and material in hand */
    const rung = (piece, gold, short, nextPm) => ({ piece, below: false, ladder: { track: 'x', tier: 2, rung: 0, max: 5, offer: 'temper.x', gold, items: [] }, needs: [{ id: 'iron_bar', need: 2, short }], nowPm: 0, nextPm });
    const temper = { blows: rung('Steel Sword', 3000, 0, 10), armor: rung('Bronze armor', 2000, 0, 10) };
    const tb = buy({ shop: null, temper });
    eq(tb && [tb.kind, tb.title, tb.words, tb.place], ['temper', 'Next buy: Temper Steel Sword (3,000 gp)', 'Damage and heals +1%', { kind: 'temper' }], 'the weapon\'s rung');
    const ta = buy({ shop: null, temper: { ...temper, blows: rung('Steel Sword', 3000, 1, 10) } });
    eq(ta && [ta.title, ta.words], ['Next buy: Temper Bronze armor (2,000 gp)', 'Damage taken −1%'], 'short of a material, the armor\'s rung');
    /* neither rung in the purse: the nearest is named with what it still needs (the whole shelf, T9), the shelf's own first, the weapon's */
    const near = buy({ shop: null, temper, purse: 1999 });
    eq(near && [near.kind, near.title, near.words, near.short], ['temper', 'Next buy: Temper Steel Sword (3,000 gp)', 'Damage and heals +1% · Need 1,001 gp more', 1001], 'neither rung in the purse: the nearest, and what it needs');
    /* the purse covers the armor's rung only: the shelf names the first it covers */
    eq(buy({ shop: null, temper, purse: 2500 }).title, 'Next buy: Temper Bronze armor (2,000 gp)', 'the shelf\'s first rung the purse covers');
    /* the dummy's next skill, a house to hold it, nobody on it */
    const dummy = { needs: null, hasHome: true, owned: ['melee'], ladder: [100000, 250000], nextPrice: 250000, busy: null };
    const dm = buy({ shop: null, purse: 300000, dummy });
    eq(dm && [dm.kind, dm.title, dm.words, dm.place], ['dummy', 'Next buy: House dummy skill (250,000 gp)', 'Train at home, no hourly fee', { kind: 'house' }], 'the dummy\'s next unlock');
    eq([buy({ shop: null, purse: 300000, dummy: { ...dummy, hasHome: false } }), buy({ shop: null, purse: 300000, dummy: { ...dummy, busy: 'Ilsa' } }), buy({ shop: null, purse: 300000, dummy: { ...dummy, nextPrice: null } })],
      [null, null, null], 'no house, someone on it, or every skill unlocked: nothing');
    /* the cheapest room rung the house is ready for, gold and material in hand (the bag, then Storage) */
    const room = (r, name, gold, need, opens) => ({ room: r, name, level: 1, rungs: 5, opens: opens || 1, rungName: null, next: { offer: 'home.' + r, name: name + ' II', rung: 2, need: need || 1, item: null, gold, items: [{ id: 'oak_log', qty: 20 }] } });
    const home = { tier: 1, tiers: [], rooms: [room('forge', 'Forge', 9000), room('cellar', 'Cellar', 6000), room('garden', 'Garden', 4000, 2)] };
    const rm = buy({ shop: null, purse: 10000, home, bag: [{ id: 'oak_log', qty: 5 }], bank: [{ id: 'oak_log', qty: 15 }] });
    eq(rm && [rm.kind, rm.title, rm.words, rm.place], ['room', 'Next buy: Cellar upgrade (6,000 gp)', 'Next: Cellar II', { kind: 'house' }], 'the cheapest rung the house is ready for (the Garden waits on the next tier)');
    eq(buy({ shop: null, purse: 10000, home, bag: [{ id: 'oak_log', qty: 5 }], bank: [] }), null, 'short of the logs: nothing');
    /* the order (the designer's, board 2026-11-15 F8/F12): gear, then Tempering, then a room rung, then the dummy; no purse read, nothing */
    eq(buy({ temper, dummy, home, purse: 300000, bag: [{ id: 'oak_log', qty: 20 }] }).kind, 'gear', 'gear first');
    eq(buy({ shop: null, temper, dummy, home, purse: 300000, bag: [{ id: 'oak_log', qty: 20 }] }).kind, 'temper', 'then Tempering');
    eq(buy({ shop: null, dummy, home, purse: 300000, bag: [{ id: 'oak_log', qty: 20 }] }).kind, 'room', 'then a room rung, ahead of the dummy');
    eq(buy({ shop: null, dummy, home, purse: 300000, bag: [] }).kind, 'dummy', 'then the dummy');
    /* label words, never a sentence (Tyler 2026-11-14): no full stop on any line the card can name */
    const said = [shield, bare, tb, ta, dm, rm].flatMap((b) => [b.title, b.words]).filter((w) => /\.$/.test(w));
    eq(said, [], 'every next-buy line is a label');
    eq([buy({ purse: null }), buy({ purse: 0 })], [null, null], 'no purse, nothing');
    /* on the card: one row, last, Show opens where it is bought, and it is never the gold press */
    const none = { ops: {}, picks: [], choices: [] };
    const solo = steps({ plan: none, bag: bag.filter((r) => r.id !== 'rat_tail'), rules: { locked: new Set(), loot: {} }, blessings: null, buy: shield });
    eq([solo.steps.map((s) => [s.id, s.title, s.words, s.verb, s.icon]), solo.primary], [[['buy', 'Next buy: Bronze-Rimmed Shield (140 gp)', '+1 Defense vs Practice Shield', 'Show', 'bronze_rimmed_shield']], 'again'],
      'with the bag sorted the card still names the buy, and Hunt again stays the press');
    const all = steps({ buy: shield });
    eq([all.steps.map((s) => s.id), all.primary], [['equip', 'sell', 'deposit', 'bless', 'buy'], 'equip'], 'after the other steps, never ahead of them');
  });

  await t('T6 THE NEXT GROUND: back from a ground the Hunts list no longer recommends, the card names the step up it does, by the server\'s Levels, and Show opens it', async () => {
    /* audit 2026-11-18 A12: on a phone "Hunt again" kept a hero in the Mill Cellar all night after Level 5 and the summary never said so */
    const { levelBlock } = await import(pathToFileURL(join(ROOT, 'tests/_server-level.mjs')).href);
    const { charXpForLevel } = await import(pathToFileURL(join(ROOT, 'src/core/xp.js')).href);
    /* the hero home from `hunt` at the SERVER's Level `lv` (its level block; level_xp left as the fixture's, so a Level read off it is wrong) */
    const home = async (hunt, lv, party) => {
      const e = clone(FIX);
      e.version = 9;
      /* the server's hunt section (hr_hunt_view) for a session it holds ended */
      e.hunt = Object.assign({}, e.hunt, { hunt_id: hunt, ended: true, session: { end_reason: 'left', ended_at: '2026-10-18T10:01:00Z' } });
      delete e.hunt_analyzer;
      delete e.hunt_events;
      e.level = levelBlock(charXpForLevel(lv));
      e.party = party || null;
      const cs = sessionOn([], () => e);
      ok(await cs.load(), 'the envelope applied');
      return TN.townStepsOf(cs, new Map());
    };
    const ground = (r) => { const g = r.steps.find((s) => s.id === 'ground'); return g ? [g.title, g.words, g.verb, g.glyph, g.place] : null; };
    const at7 = await home('mill_cellar', 7);
    eq(ground(at7), ['Next ground: Meadowbrook Thicket', 'Levels 5–15, recommended for Level 7', 'Show', 'uiMap', { kind: 'hunt', hunt: 'meadowbrook_thicket' }],
      'the Cellar at the server\'s Level 7: the Thicket, the Hunts list\'s Recommended ground, its Show opening it');
    ok(at7.primary !== 'ground', 'it points, so it is never the gold press');
    const ids = at7.steps.map((s) => s.id), gi = ids.indexOf('ground');
    ok(ids.slice(0, gi).every((x) => ['equip', 'sell', 'deposit', 'bless'].includes(x)) && ids.slice(gi + 1).every((x) => x === 'buy'), 'after the chores, before the next buy: ' + ids.join());
    /* the server's Level, never one worked out here: a block saying Level 3 over the fixture's level_xp (a Level 7's) keeps the Cellar the advice */
    eq(ground(await home('mill_cellar', 3)), null, 'at Level 3 the Cellar is still the advice: no line');
    eq(ground(await home('mill_cellar', 9))[0], 'Next ground: Wickstead', 'at Level 9 the list recommends Wickstead, and so does the card');
    /* never a step down, and never a ground the list does not hold */
    eq(ground(await home('wickstead', 7)), null, 'a ground above the advice names nothing');
    eq(ground(await home('meadowbrook_thicket', 7)), null, 'on the recommended ground already, nothing');
    eq(ground(await home('the_burning_tower', 30)), null, 'the Tower is no ground of the list');
    /* a party: every seat's Level, as the Hunts window reads them, and the party's tie goes to the party ground */
    const party = { id: '00000000-0000-4000-8000-000000000001', self_seat: 0, leader_seat: 0,
      members: [{ seat: 0, name: 'Tyler', level: 7, weapon: 'shield' }, { seat: 1, name: 'Mira', level: 6, weapon: 'bow' }, { seat: 2, name: 'Oren', level: 6, weapon: 'staff' }, { seat: 3, name: 'Sef', level: 7, weapon: 'sword' }] };
    eq(ground(await home('mill_cellar', 7, party)), ['Next ground: The Sewer', 'Levels 5–25, recommended for Levels 6–7', 'Show', 'uiMap', { kind: 'hunt', hunt: 'millrace_sewer' }],
      'a party of four at 6 and 7: the Sewer, for the seats\' Levels');
    /* AN OUTGROWN CELLAR (hunt-grounds.js endsAtLevel; the board's 2026-11-19 complete balance look, change 1): the reason names the Level, Hunt
       again has nothing to send (the server refuses it), and once the chores are done the card's press is the next ground, never Hunt again */
    eq(MD.endWords('outgrown', false, null, 'Tyler', null, 'mill_cellar'), 'Ground outgrown at Level 5', 'an outgrown Cellar names its Level');
    eq(MD.huntAgainOf({ hunt: 'mill_cellar', preset: 0, bag: [], reason: 'outgrown' }), null, 'an outgrown Cellar has a Hunt again');
    ok(MD.huntAgainOf({ hunt: 'mill_cellar', preset: 0, bag: [], reason: 'stamina' }) !== null, 'CONTROL: a Cellar that ran out of stamina lost its Hunt again');
    const bare = (outgrown) => TN.townSteps({ plan: null, bag: [], rules: null, bids: null, blessings: null, purse: 0, did: new Map(), buy: null, free: false, outgrown,
      ground: { row: { hunt: 'meadowbrook_thicket', name: 'Meadowbrook Thicket', band: [5, 15] }, levels: [5] } }).primary;
    eq([bare(true), bare(false)], ['ground', 'again'], 'with no chore left, an outgrown card presses the next ground and any other Hunt again');
    /* audit 2026-11-19 L2 (played, 1440x900): the Cellar's Level 5 end opened on a greyed Hunt again while the chores' gold row and the Next
       ground row lay under the sticky foot. Hunt again can't go, so the next ground is the press ahead of every chore, which keeps its own */
    const chores = (outgrown) => TN.townSteps({ plan, bag, rules, bids, blessings, purse: 100, did: new Map(), buy: null, free: false, outgrown,
      ground: { row: { hunt: 'meadowbrook_thicket', name: 'Meadowbrook Thicket', band: [5, 15] }, levels: [5] } });
    const out5 = chores(true);
    eq([out5.primary, out5.steps.map((s) => s.id), out5.steps.find((s) => s.id === 'ground').name], ['ground', ['equip', 'sell', 'deposit', 'bless', 'ground'], 'Meadowbrook Thicket'],
      'outgrown with chores open: the next ground is the press, named for the foot, and every chore is still listed');
    eq(chores(false).primary, 'equip', 'CONTROL: any other end keeps the first chore as the press');
  });

  /* ── THE END CARD SELLS (balance program L03, 30-plan.md; economy dive change 1: hunt one paid 130 gold in coin and left 501 unsold, and one real
     new player sold nothing in 12 hours) ── a hero home with junk no plan holds, beside a Material, a locked junk stack, a planned Deposit, the Hall
     Key, a gear piece and a junk the House's next step names */
  const jbag = [{ id: 'rat_tail', qty: 31 }, { id: 'goblin_ear', qty: 5 }, { id: 'slime_gel', qty: 12 }, { id: 'bat_wing', qty: 2 }, { id: 'troll_hide', qty: 1 },
    { id: 'hall_key', qty: 1 }, { id: 'leather_gloves', qty: 1 }, { id: 'venom_sac', qty: 4 }];
  const jbids = new Map([['rat_tail', 6], ['goblin_ear', 3], ['slime_gel', 5], ['bat_wing', 4], ['troll_hide', 9], ['hall_key', 400], ['leather_gloves', 20], ['venom_sac', 7]]);
  const jrules = (loot) => ({ locked: new Set(['bat_wing']), loot: Object.assign({ troll_hide: 'deposit' }, loot || {}) });
  const jsteps = (over) => TN.townSteps(Object.assign({ plan: null, bag: jbag, rules: jrules(), bids: jbids, blessings: null, purse: 100, did: new Map(), needs: new Set(['venom_sac']) }, over || {}));
  const row = (r, id) => r.steps.find((s) => s.id === id) || null;

  await t('T7 SELL JUNK: the junk no plan holds sells with the plan\'s Sell stacks, ONE sale at the shop\'s bids, and an all-junk sale says "Sell junk for N"', async () => {
    const { kindOf, lootSale } = await import(pathToFileURL(join(M.ROOT, 'src/shell/bag-model.js')).href);
    const r = jsteps();
    const sell = row(r, 'sell');
    /* 31 Rat Tail at 6 and 5 Goblin Ear at 3: never the Material (Slime Gel), the locked junk (Bat Wing), the planned Deposit (Troll Hide), the Hall Key,
       the gear, or the junk the House's next step names (Venom Sac) */
    eq(sell && [sell.title, sell.words, sell.lines, sell.fresh, sell.verb], ['Sell junk for 201 gp', 'Rat Tail and Goblin Ear', [{ item: 'rat_tail', qty: 31 }, { item: 'goblin_ear', qty: 5 }],
      ['rat_tail', 'goblin_ear'], 'Sell'], 'the junk, its value at the shop\'s bids, and what no plan holds yet');
    eq([r.primary, row(r, 'deposit').lines], ['sell', [{ item: 'troll_hide', qty: 1 }]], 'Sell is the gold press, and the planned Deposit stays the Deposit\'s');
    /* A KEY IS NEVER JUNK: the Hall Key opens Krell's Hold; the Shop's Sell all junk reads the same kind (one function, never two rules) */
    ok(kindOf('hall_key') !== 'junk', 'the Hall Key files as junk: ' + kindOf('hall_key'));
    ok(!lootSale(jbag, jrules(), { bids: jbids }, null).lines.some((l) => l.item === 'hall_key'), 'the Shop\'s Sell all junk sells the Hall Key');
    /* a plan's gear beside the junk: the stack count, the plain names; all the junk planned: "Sell junk", and whose rule it is */
    const mixed = row(jsteps({ rules: jrules({ leather_gloves: 'sell' }) }), 'sell');
    eq([mixed.title, mixed.words, mixed.fresh], ['Sell 3 stacks for 221 gp', 'Rat Tail, Goblin Ear and Leather Gloves', ['rat_tail', 'goblin_ear']], 'gear marked Sell beside the junk');
    const marked = row(jsteps({ rules: jrules({ rat_tail: 'sell', goblin_ear: 'sell' }) }), 'sell');
    eq([marked.title, marked.words, marked.fresh], ['Sell junk for 201 gp', 'Marked Sell: Rat Tail and Goblin Ear', []], 'the junk the plan holds: the plan\'s words, nothing fresh');
    /* no junk before the server's plans are read (a locked stack is theirs to say), and no Sell step at all then */
    eq(row(jsteps({ rules: null }), 'sell'), null, 'plans not read: no sale');
    /* a House that wants none of it: the Venom Sac sells too */
    eq(row(jsteps({ needs: null }), 'sell').lines.map((l) => l.item), ['rat_tail', 'goblin_ear', 'venom_sac'], 'House not read: its junk sells');
  });

  await t('T8 ALWAYS SELL THESE: after the sale, the junk it sold with no plan is one press that sets the plan Sell on each, done when the server\'s plan says so', async () => {
    const sold = ['rat_tail', 'goblin_ear'];
    const after = jbag.filter((r) => !sold.includes(r.id));
    const did = new Map([['sell', 'Sell junk for 201 gp']]);
    const r = jsteps({ bag: after, did, sold });
    eq([r.steps.map((s) => s.id + (s.done ? ':done' : '')).slice(0, 2), r.primary], [['sell:done', 'always'], 'always'], 'right after the sale, the next gold press');
    const a = row(r, 'always');
    eq([a.title, a.words, a.verb, a.items, a.icon], ['Always sell these', 'Set Sell on Rat Tail and Goblin Ear', 'Always sell', sold, 'rat_tail'], 'the offer names what was just sold');
    /* the plan is the server's: Sell on one, the other still offered; on both, the row is gone (or Done, once pressed on this card) */
    eq(row(jsteps({ bag: after, did, sold, rules: jrules({ rat_tail: 'sell' }) }), 'always').items, ['goblin_ear'], 'what the plan does not hold yet');
    eq(row(jsteps({ bag: after, did, sold, rules: jrules({ rat_tail: 'sell', goblin_ear: 'sell' }) }), 'always'), null, 'every one planned: no offer');
    const pressed = row(jsteps({ bag: after, did: new Map([...did, ['always', 'Always sell these']]), sold, rules: jrules({ rat_tail: 'sell', goblin_ear: 'sell' }) }), 'always');
    eq(pressed && [pressed.done, pressed.title], [true, 'Always sell these'], 'pressed on this card: Done');
    /* no plans read: no offer; the kit is never offered (the server refuses a Sell plan on it, hr_loot_plan_refusal start_kit) */
    eq(row(jsteps({ bag: after, did, sold, rules: null }), 'always'), null, 'plans not read: no offer');
    eq(row(jsteps({ bag: after, did, sold: ['shrimp'] }), 'always'), null, 'the starting kit is never offered');
    /* a long list: one press sets what one press may (the server's `hunt` bucket is 30 a minute), the next press the rest */
    const many = Array.from({ length: 14 }, (_, i) => 'junk_' + i);
    const big = row(jsteps({ bag: after, did, sold: many }), 'always');
    eq([big.count, big.items.length, big.items[0]], [14, 12, 'junk_0'], 'twelve a press');

    /* THE PRESS, ONE hr_loot_rule_set an item, the plan Sell; the answer counts what the server took and keeps its refusal */
    const calls = [];
    let refuse = null;
    const fake = { setLootRule: async (item, rule) => { calls.push([item, rule]); return item === refuse ? { ok: false, error: 'item_not_sellable' } : { ok: true }; } };
    eq(await TN.alwaysSell(fake, sold), { set: 2, ok: true }, 'both set');
    eq(calls, [['rat_tail', 'sell'], ['goblin_ear', 'sell']], 'ONE plan an item, Sell');
    refuse = 'goblin_ear';
    eq(await TN.alwaysSell(fake, sold), { set: 1, ok: false, error: 'item_not_sellable' }, 'a refusal stands, with what was set');

    /* PLAYED ON A SESSION (the server's sections in, the server's answers out): a hunt ends with junk in the bag, Sell junk is ONE vendor_sell_many,
       the purse and the bag are then the server's; Always sell these sets the plans, the re-read says Sell, and the next hunt's junk is the plan's sale */
    const srv = { v: 20, gold: 1200, inv: { rat_tail: 31, goblin_ear: 5, slime_gel: 12 }, loot: {}, bids: { rat_tail: 6, goblin_ear: 3, slime_gel: 5 } };
    const env = () => {
      const e = endedEnv(srv.v);
      e.hunt = Object.assign({}, FIX.hunt, { hunt_id: 'mill_cellar', ended: true, session: { end_reason: 'left', ended_at: '2026-10-18T10:01:00Z' } });
      e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, gold: srv.gold, gold_v: srv.v });
      e.inventory = Object.assign({}, srv.inv);
      e.bag_rules = { locked: [], loot: Object.assign({}, srv.loot), restock: {} };
      e.shop = { offers: [], bids: Object.assign({}, srv.bids) };
      return e;
    };
    const seen = [];
    const server = {
      rpc: async (name, args) => {
        seen.push(name);
        if (name === 'hr_load') return { ok: true, body: env() };
        if (name === 'hr_loot_rule_set') { srv.loot[args.p_item] = args.p_rule; srv.v++; return { ok: true, body: { ok: true } }; }
        return { ok: true, body: { ok: true } };
      },
      accrue: async (body) => {
        if (body.verb !== 'vendor_sell_many') return { ok: true, status: 200, body: {} };
        seen.push('vendor_sell_many');
        let paid = 0;
        for (const l of body.lines) { paid += srv.bids[l.item] * l.qty; srv.inv[l.item] -= l.qty; if (!srv.inv[l.item]) delete srv.inv[l.item]; }
        srv.gold += paid; srv.v++;
        return { ok: true, status: 200, body: Object.assign(env(), { receipt: { gold: paid } }) };
      },
    };
    const cs = new CS.CharacterSession({ slot: 0, uid: 'u', now: () => 0, server, setTimer: () => 0, clearTimer: () => {} });
    ok(await cs.load(), 'the ended hunt\'s envelope applied');
    const IS = await import(pathToFileURL(join(M.ROOT, 'src/session/item-sections.js')).href);
    const home = TN.townStepsOf(cs, new Map(), []);
    const s = row(home, 'sell');
    eq(s && [s.title, s.lines, s.fresh, home.primary], ['Sell junk for 201 gp', [{ item: 'rat_tail', qty: 31 }, { item: 'goblin_ear', qty: 5 }], ['rat_tail', 'goblin_ear'], 'sell'], 'the card offers the junk at the server\'s bids');
    const sale = await cs.edgeIntent('vendor_sell_many', { lines: s.lines });
    eq([sale.ok, sale.paid], [true, 201], 'ONE sale, paid what the server says');
    eq([IS.goldOf(cs), IS.bagOf(cs)], [srv.gold, Object.entries(srv.inv).map(([id, qty]) => ({ id, qty }))], 'the purse and the bag are the server\'s');
    const did2 = new Map([['sell', s.title]]);
    const offer = row(TN.townStepsOf(cs, did2, s.fresh), 'always');
    eq(offer && offer.items, ['rat_tail', 'goblin_ear'], 'Always sell these, for what was just sold');
    const set = await TN.alwaysSell(cs, offer.items);
    eq([set.ok, set.set, seen.filter((n) => n === 'hr_loot_rule_set').length], [true, 2, 2], 'the plans went, one ask an item');
    eq(IS.rulesOf(cs).loot, { rat_tail: 'sell', goblin_ear: 'sell' }, 'the plan on screen is the server\'s re-read');
    eq(row(TN.townStepsOf(cs, did2, s.fresh), 'always'), null, 'nothing left to offer');
    /* the next hunt brings Rat Tail again: the card's sale is the plan's now */
    srv.inv.rat_tail = 9; srv.v++;
    ok(await cs.load(), 'the next return applied');
    const next = row(TN.townStepsOf(cs, new Map(), []), 'sell');
    eq(next && [next.title, next.words, next.fresh], ['Sell junk for 54 gp', 'Marked Sell: Rat Tail', []], 'the next sale is the plan\'s');
  });

  await t('T9 NEXT BUY WALKS THE WHOLE SHELF: each shelf\'s next rung, the cheapest the purse covers, else the nearest with what it needs', async () => {
    const { NB } = M;
    const { targetOf } = await import(pathToFileURL(join(M.ROOT, 'src/shell/goto.js')).href);
    const tank = { weapon: 'steel_sword', shield: 'bronze_rimmed_shield', helmet: 'bronze_helm', body: 'bronze_platebody', pants: 'bronze_platelegs', boots: 'bronze_boots', gloves: 'bronze_gauntlets', belt: 'bronze_belt' };
    const sk = { defense: { level: 31, xp: 0 }, melee: { level: 31, xp: 0 }, mining: { level: 1, xp: 0 } };
    const shelf = (over) => NB.nextBuy(Object.assign({ purse: 5000, equipment: tank, skills: sk, level: 31, prefer: 'heavy', chosen: 'heavy', shop: null, temper: null, dummy: null, home: null,
      bag: [], bank: [], chests: null, bagGrow: null, slot: null, refill: null }, over || {}));
    const see = (b) => b && [b.kind, b.title, b.words, b.place];
    const room = (r, name, opens) => ({ room: r, name, level: 0, rungs: 5, opens, rungName: null, next: null });
    const deedHome = (owned) => ({ tier: owned ? 1 : 0, tiers: [{ offer: 'property.homestead', name: 'Hearthside Homestead', tier: 1, need: 0, owned, gold: 400, items: [] }],
      rooms: [room('kitchen', 'Kitchen', 1), room('garden', 'Garden', 1), room('forge', 'Forge', 2)] });
    eq(see(shelf({ home: deedHome(false) })), ['deed', 'Next buy: Hearthside Homestead (400 gp)', 'Opens Kitchen and Garden', { kind: 'house' }], 'the House\'s next property rung, and the rooms it opens');
    const grow = { cap: 40, rung: 0, max: 10, next: { offer: 'bag.r1', gold: 1000, adds: 10 } };
    const bagRow = shelf({ bagGrow: grow });
    eq(see(bagRow), ['bag', 'Next buy: Bag space (1,000 gp)', '+10 bag spaces', { kind: 'storage' }], 'the bag\'s next rung');
    eq(targetOf(bagRow.place), { win: 'storage', tab: null, find: null }, 'Show opens Storage, where the bag grows');
    const chests = { used: 90, cap: 100, chests: [], next: { chest: 'millrace_crate', name: 'Millrace Crate', stacks: 20, tier: 0, built: false, gold: 1500, items: [{ id: 'normal_log', qty: 40 }], canBuild: true } };
    eq(see(shelf({ chests, bag: [{ id: 'normal_log', qty: 40 }] })), ['chest', 'Next buy: Millrace Crate (1,500 gp)', '+20 Storage spaces', { kind: 'house' }], 'the next Storage chest, its logs in hand');
    eq([shelf({ chests }), shelf({ chests: { ...chests, next: { ...chests.next, canBuild: false } }, bag: [{ id: 'normal_log', qty: 40 }] })], [null, null], 'short of logs, or the property tier not reached: nothing');
    /* THE CHEAPEST THE PURSE COVERS, across every shelf: a Tempering rung (the first shelf) loses to a cheaper deed */
    const rung = { piece: 'Steel Sword', below: false, ladder: { track: 'blows', tier: 2, rung: 0, max: 5, offer: 'temper.x', gold: 3000, items: [] }, needs: [], nowPm: 0, nextPm: 10 };
    const all = { temper: { blows: rung, armor: null }, home: deedHome(false), bagGrow: grow, slot: { slotId: 1, cost: 400000 }, dummy: { hasHome: true, nextPrice: 100000, busy: null } };
    eq(shelf(all).kind, 'deed', 'the cheapest of all, the deed at 400');
    eq(shelf({ ...all, home: deedHome(true) }).kind, 'bag', 'the deed owned: the bag at 1,000');
    eq(shelf({ ...all, home: deedHome(true), bagGrow: null }).kind, 'temper', 'then Tempering at 3,000');
    /* NONE COVERED: the nearest, and what it still needs (the purse's shortfall at the server's price) */
    const slot = shelf({ slot: { slotId: 1, cost: 400000 } });
    eq([...see(slot), slot.short], ['slot', 'Next buy: Hero slot 2 (400,000 gp)', 'Another hero for your account · Need 395,000 gp more', { kind: 'characters' }, 395000], 'a hero slot, the nearest');
    eq(shelf({ ...all, purse: 300 }).words, 'Opens Kitchen and Garden · Need 100 gp more', 'short of all of them: the nearest');
    /* A TOOL, only for a skill this hero trains, and only a better tier than the bag's */
    const tools = { offers: [{ offer: 'shop.bronze_pickaxe', item: 'bronze_pickaxe', kind: 'tool', price: 120 }, { offer: 'shop.bronze_axe', item: 'bronze_axe', kind: 'tool', price: 120 }], bids: new Map() };
    eq(shelf({ shop: tools }), null, 'a hunter is never sent to the rocks');
    const miner = { ...sk, mining: { level: 3, xp: 200 } };
    const pick = shelf({ shop: tools, skills: miner });
    eq(pick && [pick.kind, pick.title, pick.place, /^Mining \d+% faster/.test(pick.words)], ['tool', 'Next buy: Bronze Pickaxe (120 gp)', { kind: 'shop', item: 'bronze_pickaxe' }, true], 'a miner\'s pickaxe');
    eq(shelf({ shop: tools, skills: miner, bag: [{ id: 'bronze_pickaxe', qty: 1 }] }), null, 'one in the bag already: nothing');
    /* A REFILL, when the caller gives the server's quote (only after a hunt that ran out of stamina, nextBuyOf) */
    const refill = { available: true, why: null, price: 1600, restoreMs: 4 * 3600000, n: 1, perDay: 6, boughtToday: 0 };
    eq(see(shelf({ refill })), ['refill', 'Next buy: Stamina refill (1,600 gp)', '+4 h of stamina', { kind: 'services' }], 'a refill, its hours the server\'s');
    eq(targetOf({ kind: 'services' }), { win: 'shop', tab: 'services', find: null }, 'Show opens the Shop\'s Services');
    eq(shelf({ refill: { ...refill, available: false, price: null } }), null, 'none to buy: nothing');
    /* POWER FIRST: a Shop piece Equip upgrades would put on stays ahead of the whole shelf (the designer's order) */
    const bare = { ...tank }; delete bare.belt;
    eq(shelf({ ...all, equipment: bare, shop: { offers: [{ offer: 'shop.bronze_belt', item: 'bronze_belt', kind: 'gear', price: 200 }], bids: new Map() } }).kind, 'gear', 'gear first');
    const said = [shelf(all), bagRow, slot, pick, shelf({ refill })].flatMap((b) => [b.title, b.words]).filter((w) => /\.$/.test(w) || /;|—/.test(w));
    eq(said, [], 'every line a label, no full stop, semicolon or dash');

    /* FROM A SESSION: the hero slot is the account section's offer, a refill only after a hunt out of stamina */
    const at = (reason) => {
      const e = endedEnv(30);
      /* the server's hunt section (hr_hunt_view) for a session it holds ended, as T6 builds it */
      e.hunt = Object.assign({}, FIX.hunt, { hunt_id: 'mill_cellar', ended: true, session: { end_reason: reason, ended_at: '2026-10-18T10:01:00Z' } });
      e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, gold: 2000 });
      e.inventory = {};
      e.equipment = tank;
      e.account = { hero_slot_offer: { slot_id: 1, cost_gold: 400000 }, hero_slots_max: 4 };
      e.stamina_refill = { available: true, price: 1600, restore_ms: 4 * 3600000, n: 1, per_day: 6 };
      return e;
    };
    const csOf = async (reason) => { const c = sessionOn([], () => at(reason)); ok(await c.load(), 'the envelope applied'); return c; };
    eq((await csOf('stamina')) && NB.nextBuyOf(await csOf('stamina'), null).kind, 'refill', 'out of stamina: the refill');
    const left = NB.nextBuyOf(await csOf('left'), null);
    eq(left && [left.kind, left.title], ['slot', 'Next buy: Hero slot 2 (400,000 gp)'], 'any other end: no refill, the account\'s next slot');
  });

  return fails;
}

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  /* The recorder names heroes off the character's own sections, so the A2 stream's names come from the fixture party. */
  return {
    EX: await import(u(EXPLAIN)), MD: await import(u(MODEL)), REC: await import(u(RECORDER)),
    CS: Object.assign({}, await import(u(SESSION))), RES: await import(u(RESIDUE)),
    ROOT: base, TN: await import(u(TOWN)), UP: await import(u('src/shell/upgrade-plan.js')), NB: await import(u(NEXT)),
    END_ORDER: (await import(u('src/data/hunt-sessions.js'))).END_ORDER,
    HS: await import(u('src/session/hunt-sections.js')),
  };
}

const MUTANTS = [
  { test: 'L3', file: MODEL, from: '    if (ID.test(side) && from !== null && Number.isSafeInteger(ms) && ms > from) out.push([side, ms - from]);', to: '    if (ID.test(side) && Number.isSafeInteger(ms) && ms > 0) out.push([side, ms]);' },
  { test: 'L3', file: RECORDER, from: "cs.setResidue('huntStart', f ? { s: s.id, lv: lv.level, sk, fx: Object.assign({}, f.standing) } : { s: s.id, lv: lv.level, sk });", to: "cs.setResidue('huntStart', { s: s.id, lv: lv.level, sk });" },
  { test: 'A6', file: RECORDER, from: "return card ? Object.assign(card, { live: true, since: s.enteredMs }) : null;", to: 'return null;' },
  { test: 'A6', file: RECORDER, from: "  if (!s || s.ended) return null;\n  const an = analyzerOf(cs);", to: "  if (!s) return null;\n  const an = analyzerOf(cs);" },
  { test: 'A3', file: SESSION, from: 'for (const [f, v] of Object.entries({ ...this._sent, ...this._pending })) this._record', to: 'for (const [f, v] of Object.entries({ ...this._sent })) this._record' },
  { test: 'A4', file: SESSION, from: 'this._pending = {}; this._sent = Object.assign({}, this._sent, patch);', to: 'this._pending = {};' },
  { test: 'A4', file: RESIDUE, from: 'if (back === undefined || JSON.stringify(back) !== JSON.stringify(v)) out[f] = v;', to: 'out[f] = v;' },
  { test: 'D1', file: EXPLAIN, from: "parts.push(plural(g.amounts.length, g.who + ' hit', g.who + ' hits')", to: "parts.push(plural(1, g.who + ' hit', g.who + ' hits')" },
  { test: 'D1', file: EXPLAIN, from: "else if (to - lastHeal >= 3000)", to: "else if (false)" },
  { test: 'D1', file: EXPLAIN, from: "for (const o of who.others || []) if", to: "for (const o of []) if" },
  { test: 'D1', file: EXPLAIN, from: "rules.push(\"rule '\" + ruleName(w) + \"' was waiting\"", to: "rules.push(\"rule '\" + ruleName(w) + \"' fired\"" },
  { test: 'D1b', file: EXPLAIN, from: "const cast = killingBlow && spellRow(killingBlow.ability);", to: "const cast = null;" },
  { test: 'D2', file: MODEL, from: "if (key === null || seen.has(key)) return false;", to: "if (key === null) return false;" },
  { test: 'D3', file: EXPLAIN, from: "e.atMs >= from && e.atMs <= to)", to: "e.atMs <= to)" },
  { test: 'D4', file: EXPLAIN, from: "kind: wipe ? 'wipe'", to: "kind: false ? 'wipe'" },
  { test: 'S1', file: MODEL, from: "if (s.reason !== 'stamina' || !Number.isFinite(msLeft)) return why;", to: 'return why;' },
  { test: 'S1', file: MODEL, from: "  stamina: t('summary.end_stamina'),\n", to: '' },
  { test: 'S2', file: SUMMARIES, from: "    if (out.length >= HISTORY_MAX) break;", to: '' },
  { test: 'S2', file: SUMMARIES, from: "if (!s || seen.has(s.id) || (s.train && yard)) continue;", to: "if (!s || (s.train && yard)) continue;" },
  /* C4: every hunt reaches Earlier hunts (post-140 audit C4) */
  { test: 'C4', file: SUMMARIES, from: "if (!s || seen.has(s.id) || (s.train && yard)) continue;", to: "if (!s || seen.has(s.id)) continue;" },
  { test: 'C4', file: RECORDER, from: "  const ids = [after && after.last ? after.last.session : null, st ? st.s : null, a ? a.prevStart : null];", to: "  const ids = [];" },
  { test: 'C4', file: RECORDER, from: "  const ids = [after && after.last ? after.last.session : null, st ? st.s : null, a ? a.prevStart : null];", to: "  const ids = [after && after.last ? after.last.session : null];" },
  { test: 'C4', file: RECORDER, from: " || trainedBy(f.hunt) || ", to: ' || ' },
  { test: 'C4', file: RECORDER, from: "withPastSummary(summariesOf(cs), card)", to: "withSummary(summariesOf(cs), card)" },
  { test: 'C4', file: RECORDER, from: "  if (a) a.pastDone.add(id);\n", to: '' },
  { test: 'S3', file: RESIDUE, from: "  huntSummaries: sanitizeSummaries,", to: "  huntSummaries: (v) => v," },
  { test: 'S4', file: MODEL, from: ".map((x) => [x.item, x.source, x.count])", to: ".map((x) => [x.item, 'own', x.count])" },
  { test: 'S4', file: MODEL, from: "(standout(b.item) - standout(a.item)) || ", to: '' },
  { test: 'S4', file: MODEL, from: '(each(b) - each(a)) || ', to: '' },
  { test: 'S4', file: MODEL, from: 'balanceH: ph ? ph.balance : null,', to: 'balanceH: ph ? ph.gold : null,' },
  { test: 'S4', file: SUMMARIES, from: 'lootValue: num(v.lootValue), ', to: '' },
  { test: 'S4', file: SUMMARIES, from: 'balance: num(v.balance), ', to: '' },
  { test: 'S4', file: MODEL, from: 'balance: hero ? hero.balance : null,', to: 'balance: null,' },
  { test: 'S4', file: SUMMARIES, from: 'balanceH: num(v.balanceH), rawXpH: num(v.rawXpH),', to: 'balanceH: num(v.balanceH),' },
  { test: 'S4', file: MODEL, from: 'isObj(tl.xp) ? num(tl.xp.level) : num(tl.xp)', to: 'num(tl.xp)' },
  { test: 'S5', file: MODEL, from: "hunt: summary.hunt, preset: summary.preset, hours: summary.hoursLimit,", to: "hunt: summary.hunt, preset: 0, hours: summary.hoursLimit," },
  { test: 'S6', file: MODEL, from: "return (forfeit === true && FORFEIT_WORDS[reason]) || END_WORDS[reason]", to: "return END_WORDS[reason]" },
  { test: 'S6', file: MODEL, from: "    forfeit: s.forfeit === true,\n", to: '' },
  { test: 'S6', file: SUMMARIES, from: "reason, forfeit: v.forfeit === true,", to: "reason," },
  { test: 'S7', file: MODEL, from: "    tier: typeof s.tier === 'string' ? s.tier : null,\n", to: '' },
  { test: 'S7', file: SUMMARIES, from: "    tier: typeof v.tier === 'string' && REASON.test(v.tier) ? v.tier : null,\n", to: '' },
  { test: 'S7', file: MODEL, from: "s.tier !== DEFAULT_TIER && Object.prototype.hasOwnProperty.call(TIER_NAME, s.tier)", to: "s.tier && TIER_NAME[s.tier]" },
  { test: 'S8', file: MODEL, from: "  if (train && reason && !forfeit) return trainingEndWords({ reason, skill: train.skill });\n", to: '' },
  { test: 'S9', file: MODEL, from: "if (reason === 'died' && hunt && sessionModeOfHunt(hunt).deathLossPm === 0) return", to: "if (false) return" },
  { test: 'S8', file: MODEL, from: "fee: mine ? mine.paid : null,", to: "fee: null," },
  { test: 'S8', file: MODEL, from: "  if (train) {\n    const dur", to: "  if (false) {\n    const dur" },
  { test: 'S8', file: SUMMARIES, from: "    train: trainOf(v.train),\n", to: '' },
  { test: 'A1', file: SESSION, from: "p_hunt: a.hunt, p_bag: a.bag, p_preset: a.preset,", to: "p_hunt: a.hunt, p_bag: [], p_preset: a.preset," },
  { test: 'A1', file: SESSION, from: "if (!a || !ITEM.test(String(a.hunt)) ||", to: "if (!a ||" },
  { test: 'A5', file: RECORDER, from: 'a.started = a.sid !== null || a.done.size > 0;', to: 'a.started = false;' },
  { test: 'A2', file: RECORDER, from: "    if (a.done.has(s.id)) return fillTraining(cs, stop);\n    a.done.add(s.id);", to: "    a.done.add(s.id);" },
  { test: 'A2', file: RECORDER, from: "const ex = a.sid === s.id ? explainDeaths(a.rec.events(), { whoOf, words: fallWordsOf(s.hunt) }) : { deaths: [] };", to: "const ex = { deaths: [] };" },
  /* the level line (L1, L2) */
  { test: 'L1', file: MODEL, from: "const mine = isObj(start) && start.s === sessionId ? start : null;", to: "const mine = isObj(start) ? start : null;" },
  { test: 'L1', file: MODEL, from: "if (was !== null && now !== null && now > was) ups.push", to: "if (now !== null) ups.push" },
  { test: 'L1', file: MODEL, from: "return !!s && !s.ended && !(int(paid.kills) > 0) && !(xp > 0);", to: "return !!s && !s.ended;" },
  { test: 'L1', file: RESIDUE, from: "    if (++n >= HUNT_START_SKILLS) break;\n", to: '' },
  { test: 'L2', file: RECORDER, from: "if ((was && was.s === s.id) || !lv || !atStart(s) || typeof cs.setResidue !== 'function') return;", to: "if (!lv || typeof cs.setResidue !== 'function') return;" },
  { test: 'L2', file: RECORDER, from: "      stampStart(cs, s);\n      return;\n", to: "      return;\n" },
  { test: 'L2', file: SUMMARIES, from: "lvFrom: level(v.lvFrom), lvTo: level(v.lvTo),", to: "lvFrom: null, lvTo: level(v.lvTo)," },
  { test: 'L2', file: RESIDUE, from: "  huntStart: sanitizeHuntStart, ", to: "  huntStartGone: sanitizeHuntStart, " },
  /* Back in town (T1..T4) */
  { test: 'T1', file: TOWN, from: "rules.loot[r.id] === rule && !rules.locked.has(r.id) &&", to: "rules.loot[r.id] === rule &&" },
  { test: 'T1', file: TOWN, from: " && !(rule === 'sell' && isStartKit(r.id))", to: '' },
  /* one sale's worth of lines: sellPlan stops at SELL_LINES_MAX (audit F18 moved the cap there, where every bulk sale reads it) */
  { test: 'T1', file: 'src/shell/bag-model.js', from: "    if (lines.length >= SELL_LINES_MAX) { more++; continue; }\n", to: '' },
  { test: 'T1', file: TOWN, from: "const can = missing.length > 0 && (purse === null || purse >= missing[0].price);", to: "const can = missing.length > 0;" },
  { test: 'T1', file: TOWN, from: 'const offer = can && !(o && o.free);', to: 'const offer = can;' },
  { test: 'T1', file: TOWN, from: "if (step.count > 0) out.push(Object.assign(step, { done: false }));", to: "if (step.count >= 0) out.push(Object.assign(step, { done: false }));" },
  { test: 'T2', file: TOWN, from: "const first = out.find((s) => !s.done && s.id !== 'buy' && s.id !== 'ground');", to: "const first = out[0];" },
  { test: 'T5', file: TOWN, from: "const first = out.find((s) => !s.done && s.id !== 'buy' && s.id !== 'ground');", to: "const first = out.find((s) => !s.done && s.id !== 'ground');" },
  { test: 'T5', file: TOWN, from: "  if (buy) out.push(", to: "  if (false) out.push(" },
  { test: 'T6', file: TOWN, from: 'free, ground: groundOf(cs, h),', to: 'free, ground: null,' },
  { test: 'T6', file: TOWN, from: "const first = out.find((s) => !s.done && s.id !== 'buy' && s.id !== 'ground');", to: "const first = out.find((s) => !s.done && s.id !== 'buy');" },
  { test: 'T6', file: TOWN, from: 'const levels = [].concat(adviceLevels(lv.level, party)).filter(Number.isInteger);', to: 'const levels = [lv.level];' },
  /* T6 the outgrown card (lane/d-first-day-path): its press, its Hunt again, its reason */
  { test: 'T6', file: TOWN, from: "  if (o && o.outgrown && out.some((s) => s.id === 'ground')) return { steps: out, primary: 'ground' };\n", to: '' },
  /* audit 2026-11-19 L2: the chores went back ahead of the next ground on an outgrown card (its gold row under the sticky foot) */
  { test: 'T6', file: TOWN, from: "  if (o && o.outgrown && out.some((s) => s.id === 'ground')) return", to: "  if (o && o.outgrown && !first && out.some((s) => s.id === 'ground')) return" },
  { test: 'T6', file: MODEL, from: "  if (summary.reason === 'outgrown') return null;\n", to: '' },
  { test: 'T6', file: MODEL, from: "if (Number.isInteger(ends) && forfeit !== true) return t('summary.end_outgrown', { level: ends });", to: '' },
  { test: 'T6', file: HLIST, from: 'rec.row.hunt !== hunt && rec.row.band[0] > was.band[0] ? rec.row : null;', to: 'rec.row.hunt !== hunt ? rec.row : null;' },
  { test: 'T5', file: NEXT, from: "(Number(!!a.replaces) - Number(!!b.replaces)) || ", to: '' },
  { test: 'T5', file: NEXT, from: "x.kind === 'gear' && x.price <= o.purse && ", to: "x.kind === 'gear' && " },
  { test: 'T5', file: NEXT, from: "&& !row.needs.some((n) => n.short > 0) ", to: '' },
  { test: 'T5', file: NEXT, from: "if (!d || !d.hasHome || ", to: "if (!d || " },
  { test: 'T5', file: NEXT, from: "&& r.next.need <= h.tier && ", to: '&& ' },
  { test: 'T5', file: NEXT, from: "&& roomDoes(r.room) && holds(r.next.items, o.bag, o.bank))", to: '&& roomDoes(r.room))' },
  /* power first: the whole shelf went ahead of the Shop's gear */
  { test: 'T5', file: NEXT, from: "  const power = gearBuy(o) || findPiece(o);\n  if (power) return power;\n", to: '' },
  /* each shelf's first rung the purse covers: its first at all instead (the weapon's rung over the armor's the purse covers) */
  { test: 'T5', file: NEXT, from: "const front = c.find((x) => x.gold <= o.purse) || c[0];", to: 'const front = c[0];' },
  /* none covered: nothing named (the nearest and its shortfall gone) */
  { test: 'T5', file: NEXT, from: "  if (!fronts.length) return null;\n  const near = fronts[0].row", to: "  if (fronts.length) return null;\n  const near = fronts[0].row" },
  /* T9 the whole shelf: across shelves the cheapest the purse covers, never the shelf order; the deed's gates; a tool only for a trained skill and
     a better tier; the hero slot from the account section; a refill only after a hunt out of stamina */
  { test: 'T9', file: NEXT, from: "  fronts.sort((a, b) => (a.row.gold - b.row.gold) || (a.rank - b.rank));\n", to: '' },
  { test: 'T9', file: NEXT, from: "const SHELF = Object.freeze([temperRows, roomRows, deedRows, chestRows, bagRows, dummyRows, slotRows, toolRows, refillRows]);", to: "const SHELF = Object.freeze([temperRows, roomRows, chestRows, bagRows, dummyRows, slotRows, toolRows, refillRows]);" },
  { test: 'T9', file: NEXT, from: "if (!c || !c.canBuild || !holds(c.items, o.bag, o.bank)) return [];", to: 'if (!c) return [];' },
  { test: 'T9', file: NEXT, from: "if (!sk || !(sk.xp > 0)) return false;", to: 'if (!it) return false;' },
  { test: 'T9', file: NEXT, from: "return (it.toolTier || 0) > ((best && best.toolTier) || 0);", to: 'return true;' },
  { test: 'T9', file: NEXT, from: "slot: slotOfferOf(cs && typeof cs.read === 'function' ? cs.read('account') : null),", to: 'slot: null,' },
  { test: 'T9', file: NEXT, from: "refill: h && h.ended && h.endReason === 'stamina' ? staminaRefillOf(cs) : null });", to: 'refill: staminaRefillOf(cs) });' },
  { test: 'T9', file: NEXT, from: "words: opens.length ? t('summary.buy_deed_words', { rooms: listWords(opens) }) : '',", to: "words: ''," },
  { test: 'T9', file: 'src/shell/goto.js', from: "  if (place.kind === 'storage') return { win: 'storage', tab: null, find: null };\n", to: '' },
  /* T7 the end card's junk sale: none of it, the House's needs swept, a planned Deposit sold too, a mixed sale called junk, a key swept, nothing fresh */
  { test: 'T7', file: TOWN, from: "const junk = new Set(rules ? lootToSell(bag, (o && o.needs) || null).filter((id) => !rules.loot[id] && !isStartKit(id)) : []);", to: 'const junk = new Set();' },
  { test: 'T7', file: TOWN, from: "lootToSell(bag, (o && o.needs) || null)", to: 'lootToSell(bag, null)' },
  { test: 'T7', file: TOWN, from: ".filter((id) => !rules.loot[id] && !isStartKit(id))", to: ".filter((id) => !isStartKit(id))" },
  { test: 'T7', file: TOWN, from: "lines.every((l) => kindOf(l.item) === 'junk')", to: 'true' },
  { test: 'T7', file: TOWN, from: "fresh: lines.filter((l) => !marked.has(l.item)).map((l) => l.item) });", to: 'fresh: [] });' },
  { test: 'T7', file: 'src/shell/bag-model.js', from: "  if (it.opens) return 'other';\n", to: '' },
  /* T8 Always sell these: still offered once the server's plan says Sell, a long list in one press, the kit offered, the wrong plan sent, a refusal lost */
  { test: 'T8', file: TOWN, from: "filter((id) => rules.loot[id] !== 'sell' && !isStartKit(id))", to: "filter((id) => !isStartKit(id))" },
  { test: 'T8', file: TOWN, from: "items: want.slice(0, ALWAYS_PER_PRESS) });", to: 'items: want });' },
  { test: 'T8', file: TOWN, from: "filter((id) => rules.loot[id] !== 'sell' && !isStartKit(id))", to: "filter((id) => rules.loot[id] !== 'sell')" },
  { test: 'T8', file: TOWN, from: "cs.setLootRule(id, 'sell')", to: "cs.setLootRule(id, 'keep')" },
  { test: 'T8', file: TOWN, from: "  const no = answers.find((r) => !(r && r.ok));", to: '  const no = null;' },
  /* T1 a Blessing's one line: gone, or the lowest tier's cut said as the whole */
  { test: 'T1', file: TOWN, from: "const does = Number.isSafeInteger(top) && top > 0 ? t('summary.bless_does', { pct: Math.round(top / 10) + '%' }) : '';", to: "const does = '';" },
  { test: 'T1', file: TOWN, from: "const top = b && b.tiers.length ? b.tiers[b.tiers.length - 1].permille : null;", to: 'const top = b && b.tiers.length ? b.tiers[0].permille : null;' },
  /* the full-game audit's A11 under designer ruling 2b: Next buy off the plan's weight rule (a better piece of a worn off weight sold), and nothing
     saying where the hero's own weight comes from */
  { test: 'T5', file: NEXT, from: "prefer: o.prefer, chosen: o.chosen });", to: "prefer: o.prefer });" },
  { test: 'T5', file: NEXT, from: "  const power = gearBuy(o) || findPiece(o);", to: "  const power = gearBuy(o);" },
  { test: 'T5', file: NEXT, from: '    const p = now[0] || later[0];', to: '    const p = later[0] || now[0];' },
  { test: 'T5', file: NEXT, from: "&& offWeight(ITEMS[eq[s]], o.chosen)));", to: '&& false));' },
  { test: 'T5', file: NEXT, from: '.concat((p.costs || []).slice(0, 1))', to: '' },
  { test: 'T3', file: TOWN, from: "else if (did.has(step.id)) out.push(Object.assign(step, { done: true, title: did.get(step.id) || step.title, words: '' }));", to: '' },
  { test: 'T3', file: TOWN, from: "done: true, title: did.get(step.id) || step.title, words: ''", to: "done: true, words: ''" },
  { test: 'T4', file: TOWN, from: "lines.map((l) => l.item), 'deposit');", to: "lines.map((l) => l.item), 'withdraw');" },
  { test: 'T4', file: TOWN, from: "return Object.assign({ moved: r && r.ok ? r.count : 0 }, r", to: "return Object.assign({ moved: lines.length }, r" },
];

async function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'hunt-summary-'));
  let caught = 0;
  try {
    for (const m of MUTANTS) {
      const base = join(tmp, String(caught));
      const skip = new Set(['styles', 'vendor'].map((n) => join(ROOT, 'src', n)));
      mkdirSync(join(base, 'src'), { recursive: true });
      mkdirSync(join(base, 'tests/fixtures'), { recursive: true });
      cpSync(join(ROOT, 'src'), join(base, 'src'), { recursive: true, filter: (s) => !skip.has(s) });
      const p = join(base, m.file);
      const src = readFileSync(p, 'utf8');
      if (!src.includes(m.from)) throw new Error('selftest: anchor for ' + m.test + ' not found in ' + m.file + ': ' + m.from);
      writeFileSync(p, src.replace(m.from, m.to));
      const fails = await runTests(await load(base));
      if (!fails.some((f) => f.startsWith(m.test + ' '))) { console.error('  MISSED: ' + m.test + ' stayed green with its defect planted (' + m.file + ')'); process.exit(1); }
      caught++;
      console.log('  caught  ' + m.test + '  (' + m.file + ')');
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log('hunt-summary selftest: ' + caught + '/' + MUTANTS.length + ' planted defects caught');
}

if (process.argv.includes('--selftest')) {
  const clean = await runTests(await load(ROOT));
  if (clean.length) { console.error('hunt-summary selftest: the CLEAN arm is red\n  ' + clean.join('\n  ')); process.exit(1); }
  await selftest();
} else {
  const fails = await runTests(await load(ROOT));
  if (fails.length) { console.error('hunt-summary: ' + fails.length + ' failing\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('hunt-summary: explanation, dedupe, bounded history, hunt-again intent and once-only storage green');
}
