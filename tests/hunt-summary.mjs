#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-summary.mjs — THE END-OF-HUNT SUMMARY AND THE DEATH EXPLANATION, IN NODE
//
//   node tests/hunt-summary.mjs             the tests, on the real modules
//   node tests/hunt-summary.mjs --selftest  every planted defect must turn a test red
//
// mutant-anchors: src/hunt-view/death-explain.js src/hunt-view/summary-model.js src/session/hunt-summaries.js src/hunt-view/summary-recorder.js src/session/character-session.js src/session/residue.js src/shell/back-in-town.js
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
//   S7  an ended hunt names the tier it ran at (the server's session `tier`) on the card and in Earlier hunts; Normal and a forged tier name the ground alone
//   A1  Hunt again sends ONE hr_hunt_enter with the same ground, set, limits and
//       bag; a call missing its ground sends nothing
//   A2  an ended session stores its summary ONCE (a second envelope for it adds
//       nothing) and the stored card carries the death explanation
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
    for (const r of END_ORDER) ok(/^[A-Z].*\.$/.test(MD.endWords(r)), r + ' is a sentence');
    ok(MD.endWords('nonsense') === 'The hunt ended.', 'an unknown reason still reads');
    /* out of stamina: why, how it comes back, and what the hero has now (panel 2026-11-01: "Your stamina ran out." and nothing else) */
    eq(MD.reasonWords({ reason: 'stamina' }, 'Pip', 5 * 3600000 + 46 * 60000), MD.END_WORDS.stamina + ' Stamina now: 5 h 46 min.', 'the stamina end says what is rested');
    ok(/comes back hour for hour/.test(MD.END_WORDS.stamina), 'the stamina end says how it comes back');
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

  await t('S6 a forfeited hunt says why in plain words, never "by the server"', () => {
    /* The server's session as hr_hunt_view projects it after hr_hunt_forfeit (2026-11-17-hunt-density-home.sql). */
    const csOf = (session) => ({ read: (k) => (k === 'hunt' ? { session, pose: null } : null) });
    const sess = (over) => Object.assign({ id: 'sess-f', hunt: 'mill_cellar', preset: 0, entered_at: '2026-10-18T10:00:00Z',
      ended_at: '2026-10-18T10:20:00Z', end_reason: 'server', phase: 'ended', forfeit: true, bag: [], tally: { kills: 3, xp: 30, coins: 5 } }, over || {});
    const card = (session) => MD.sanitizeSummaries([MD.buildSummary(MD.endedSessionOf(csOf(session)), null, [])])[0];
    const f = card(sess());
    eq([f.reason, f.forfeit], ['server', true], 'the stored card keeps the forfeit');
    eq(MD.endWords(f.reason, f.forfeit), 'Your hunt was stopped because the server could not accept its last few minutes, so nothing from them was counted.', 'the forfeit sentence');
    const plain = card(sess({ forfeit: false }));
    eq([plain.forfeit, MD.endWords(plain.reason, plain.forfeit)], [false, MD.END_WORDS.server], 'a plain server end keeps its own words');
    const left = card(sess({ end_reason: 'left' }));
    ok(/^You left the hunt\. .*nothing from them was counted\.$/.test(MD.endWords(left.reason, left.forfeit)), 'a forfeit after Leave says both');
    eq(MD.endWords('died', true), MD.END_WORDS.died, 'a forfeit flag never rewrites another reason');
    for (const w of Object.values(MD.FORFEIT_WORDS).concat(Object.values(MD.END_WORDS))) ok(!/maintenance/i.test(w), 'no maintenance claim: ' + w);
  });

  await t('S7 an ended hunt names the tier it ran at, on the card and in Earlier hunts', () => {
    /* The server's ended session (hr_hunt_view `tier`, 2027-03-16-ended-hunt-tier.sql): hunt_tier.playing is null by then. */
    const csOf = (session) => ({ read: (k) => (k === 'hunt' ? { session, pose: null } : null) });
    const card = (over) => MD.sanitizeSummaries([MD.buildSummary(MD.endedSessionOf(csOf(Object.assign({ id: 'sess-t', hunt: 'wickstead', preset: 0,
      entered_at: '2026-11-05T10:00:00Z', ended_at: '2026-11-05T10:20:00Z', end_reason: 'left', phase: 'ended', bag: [], tally: { kills: 3, xp: 30, coins: 5 } }, over))), null, [])])[0];
    eq([card({ tier: 'dangerous' }).tier, MD.groundTitle(card({ tier: 'dangerous' }))], ['dangerous', 'Wickstead · Dangerous'], 'a Dangerous hunt, stored and named');
    eq(MD.groundTitle(card({ tier: 'deadly' })), 'Wickstead · Deadly', 'a Deadly hunt');
    eq([MD.groundTitle(card({ tier: 'normal' })), MD.groundTitle(card({})), MD.groundTitle(card({ tier: null }))], ['Wickstead', 'Wickstead', 'Wickstead'], 'Normal, or a session the server stamped none on, is the ground alone');
    /* the residue is the player's own file: a forged tier names nothing */
    eq([MD.groundTitle(MD.sanitizeSummaries([entry(1, { hunt: 'wickstead', tier: 'constructor' })])[0]), MD.sanitizeSummaries([entry(1, { tier: 'Deadly!' })])[0].tier],
      ['Wickstead', null], 'a forged tier');
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
    cs.setResidue = (f, val) => { store.push([f, val]); return real(f, val); };
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
    eq(sell.words, 'Your loot plan marks Rat Tail and Slime Gel for the shop.', 'the sale says whose rule it is');
    eq(r.steps[0].ops, { gloves: 'leather_gloves', belt: 'bronze_belt' }, 'Equip is the plan\'s ONE delta');
    eq(r.steps[0].words, 'Wear Leather Gloves (+1 Melee accuracy) and Bronze Belt (+2 Defense).', 'Equip says what goes on');
    eq(r.steps[2].lines, [{ item: 'wolf_pelt', qty: 3 }], 'Deposit names the plan\'s Deposit stacks whole');
    eq(r.steps[2].words, 'Your loot plan marks Wolf Pelt for Storage, and that frees 1 bag space.', 'Deposit says what it frees');
    /* a locked stack is never moved by a plan (the server's Dispatch loot skips it too): locked, the Wolf Pelt leaves no Deposit step */
    eq(steps({ rules: { locked: new Set(['sticky_core', 'wolf_pelt']), loot: rules.loot } }).steps.map((s) => s.id), ['equip', 'sell', 'bless'], 'a locked Deposit stack is not a step');
    eq([r.steps[3].tiers, r.steps[3].words], [[1, 2, 3], 'Free until Level 30. A death costs you less with them on.'], 'Bless names the tiers not on');
    /* one sale's worth of lines: 70 planned stacks sell 64 now, the rest on the next press */
    const many = Array.from({ length: 70 }, (_, i) => ({ id: 'stack_' + i, qty: 1 }));
    const r70 = steps({ bag: many, rules: { locked: new Set(), loot: Object.fromEntries(many.map((x) => [x.id, 'sell'])) }, bids: new Map(many.map((x) => [x.id, 3])) });
    const s70 = r70.steps.find((s) => s.id === 'sell');
    eq([s70.count, s70.lines.length, s70.title], [64, 64, 'Sell 64 stacks for 192 gp'], 'one sale\'s worth of lines');
    /* Bless only while the purse covers the next tier (the server prices each); a purse not read reads as enough */
    const dear = { tiers: [{ tier: 1, price: 500, held: true }, { tier: 2, price: 900, held: false }, { tier: 3, price: 1400, held: false }], freeUntil: null };
    eq(steps({ blessings: dear, purse: 100 }).steps.map((s) => s.id), ['equip', 'sell', 'deposit'], 'short of the next Blessing, no Bless step');
    eq(steps({ blessings: dear, purse: 900 }).steps[3].title + ' · ' + steps({ blessings: dear, purse: 900 }).steps[3].words, 'Bless II and III · Costs 2,300 gp. A death costs you less with them on.', 'the purse covers the next');
    eq(steps({ blessings: dear, purse: null }).steps.length, 4, 'a purse not read yet is not a refusal');
    /* nothing to do at all: no steps, Hunt again is the press */
    const none = steps({ plan: { ops: {}, picks: [], choices: [] }, rules: { locked: new Set(), loot: {} }, blessings: { tiers: dear.tiers.map((x) => ({ ...x, held: true })), freeUntil: null } });
    eq([none.steps, none.primary], [[], 'again'], 'nothing to do lists nothing');
    eq(steps({ plan: null, bag: null, rules: null, bids: null, blessings: null, purse: null }).steps, [], 'sections not read yet list nothing');
  });

  await t('T2 the first open step is the one gold press, else Hunt again', () => {
    eq(steps().primary, 'equip', 'Equip first');
    eq(steps({ plan: { ops: {}, picks: [] } }).primary, 'sell', 'with nothing to wear, Sell');
    const did = new Map([['equip', 'Equip 2 better pieces'], ['sell', 'Sell 2 stacks for 246 gp']]);
    const r = steps({ plan: { ops: {}, picks: [] }, rules: { locked: new Set(), loot: { wolf_pelt: 'deposit' } }, did });
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

  return fails;
}

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  /* The recorder names heroes off the character's own sections, so the A2 stream's names come from the fixture party. */
  return {
    EX: await import(u(EXPLAIN)), MD: await import(u(MODEL)), REC: await import(u(RECORDER)),
    CS: Object.assign({}, await import(u(SESSION))), RES: await import(u(RESIDUE)),
    TN: await import(u(TOWN)), UP: await import(u('src/shell/upgrade-plan.js')),
    END_ORDER: (await import(u('src/data/hunt-sessions.js'))).END_ORDER,
  };
}

const MUTANTS = [
  { test: 'A3', file: SESSION, from: 'for (const [f, v] of Object.entries({ ...this._sent, ...this._pending })) this._record', to: 'for (const [f, v] of Object.entries({ ...this._sent })) this._record' },
  { test: 'A4', file: SESSION, from: 'this._pending = {}; this._sent = Object.assign({}, this._sent, patch);', to: 'this._pending = {};' },
  { test: 'A4', file: RESIDUE, from: 'if (back === undefined || JSON.stringify(back) !== JSON.stringify(v)) out[f] = v;', to: 'out[f] = v;' },
  { test: 'D1', file: EXPLAIN, from: "parts.push(plural(g.amounts.length, g.who + ' hit', g.who + ' hits')", to: "parts.push(plural(1, g.who + ' hit', g.who + ' hits')" },
  { test: 'D1', file: EXPLAIN, from: "else if (to - lastHeal >= 3000)", to: "else if (false)" },
  { test: 'D1', file: EXPLAIN, from: "for (const o of who.others || []) if", to: "for (const o of []) if" },
  { test: 'D1', file: EXPLAIN, from: "rules.push(\"rule '\" + ruleName(w) + \"' was waiting\"", to: "rules.push(\"rule '\" + ruleName(w) + \"' fired\"" },
  { test: 'D2', file: MODEL, from: "if (key === null || seen.has(key)) return false;", to: "if (key === null) return false;" },
  { test: 'D3', file: EXPLAIN, from: "e.atMs >= from && e.atMs <= to)", to: "e.atMs <= to)" },
  { test: 'D4', file: EXPLAIN, from: "kind: wipe ? 'wipe'", to: "kind: false ? 'wipe'" },
  { test: 'S1', file: MODEL, from: "if (s.reason !== 'stamina' || !Number.isFinite(msLeft)) return why;", to: 'return why;' },
  { test: 'S1', file: MODEL, from: "  stamina: 'Your stamina ran out, so your hero came home. It comes back hour for hour while you aren\\'t hunting.',\n", to: '' },
  { test: 'S2', file: SUMMARIES, from: "    if (out.length >= HISTORY_MAX) break;", to: '' },
  { test: 'S2', file: SUMMARIES, from: "if (!s || seen.has(s.id)) continue;", to: "if (!s) continue;" },
  { test: 'S3', file: RESIDUE, from: "  huntSummaries: sanitizeSummaries,", to: "  huntSummaries: (v) => v," },
  { test: 'S4', file: MODEL, from: ".map((x) => [x.item, x.source, x.count])", to: ".map((x) => [x.item, 'own', x.count])" },
  { test: 'S4', file: MODEL, from: "(standout(b.item) - standout(a.item)) || ", to: '' },
  { test: 'S4', file: MODEL, from: '(each(b) - each(a)) || ', to: '' },
  { test: 'S4', file: MODEL, from: 'balanceH: ph ? ph.balance : null,', to: 'balanceH: ph ? ph.gold : null,' },
  { test: 'S4', file: SUMMARIES, from: 'lootValue: num(v.lootValue), ', to: '' },
  { test: 'S4', file: SUMMARIES, from: 'balance: num(v.balance), ', to: '' },
  { test: 'S4', file: MODEL, from: 'balance: hero ? hero.balance : null,', to: 'balance: null,' },
  { test: 'S4', file: SUMMARIES, from: 'balanceH: num(v.balanceH), rawXpH: num(v.rawXpH),', to: 'balanceH: num(v.balanceH),' },
  { test: 'S4', file: MODEL, from: 'isObj(t.xp) ? num(t.xp.level) : num(t.xp)', to: 'num(t.xp)' },
  { test: 'S5', file: MODEL, from: "hunt: summary.hunt, preset: summary.preset, hours: summary.hoursLimit,", to: "hunt: summary.hunt, preset: 0, hours: summary.hoursLimit," },
  { test: 'S6', file: MODEL, from: "return (forfeit === true && FORFEIT_WORDS[reason]) || END_WORDS[reason]", to: "return END_WORDS[reason]" },
  { test: 'S6', file: MODEL, from: "    forfeit: s.forfeit === true,\n", to: '' },
  { test: 'S6', file: SUMMARIES, from: "reason, forfeit: v.forfeit === true,", to: "reason," },
  { test: 'S7', file: MODEL, from: "    tier: typeof s.tier === 'string' ? s.tier : null,\n", to: '' },
  { test: 'S7', file: SUMMARIES, from: "    tier: typeof v.tier === 'string' && REASON.test(v.tier) ? v.tier : null,\n", to: '' },
  { test: 'S7', file: MODEL, from: "s.tier !== DEFAULT_TIER && Object.prototype.hasOwnProperty.call(TIER_NAME, s.tier)", to: "s.tier && TIER_NAME[s.tier]" },
  { test: 'A1', file: SESSION, from: "p_hunt: a.hunt, p_bag: a.bag, p_preset: a.preset,", to: "p_hunt: a.hunt, p_bag: [], p_preset: a.preset," },
  { test: 'A1', file: SESSION, from: "if (!a || !ITEM.test(String(a.hunt)) ||", to: "if (!a ||" },
  { test: 'A2', file: RECORDER, from: "    if (a.done.has(s.id)) return;\n    a.done.add(s.id);", to: "    a.done.add(s.id);" },
  { test: 'A2', file: RECORDER, from: "const ex = a.sid === s.id ? explainDeaths(a.rec.events(), { whoOf }) : { deaths: [] };", to: "const ex = { deaths: [] };" },
  /* Back in town (T1..T4) */
  { test: 'T1', file: TOWN, from: "rules.loot[r.id] === rule && !rules.locked.has(r.id) &&", to: "rules.loot[r.id] === rule &&" },
  { test: 'T1', file: TOWN, from: " && !(rule === 'sell' && isStartKit(r.id))", to: '' },
  { test: 'T1', file: TOWN, from: "const lines = sale.lines.slice(0, SELL_LINES_MAX);", to: "const lines = sale.lines.slice(0);" },
  { test: 'T1', file: TOWN, from: "const can = missing.length > 0 && (purse === null || purse >= missing[0].price);", to: "const can = missing.length > 0;" },
  { test: 'T1', file: TOWN, from: "if (step.count > 0) out.push(Object.assign(step, { done: false }));", to: "if (step.count >= 0) out.push(Object.assign(step, { done: false }));" },
  { test: 'T2', file: TOWN, from: "const first = out.find((s) => !s.done);", to: "const first = out[0];" },
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
