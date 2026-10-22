#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-summary.mjs — THE END-OF-HUNT SUMMARY AND THE DEATH EXPLANATION, IN NODE
//
//   node tests/hunt-summary.mjs             the tests, on the real modules
//   node tests/hunt-summary.mjs --selftest  every planted defect must turn a test red
//
// mutant-anchors: src/hunt-view/death-explain.js src/hunt-view/summary-model.js src/session/hunt-summaries.js src/hunt-view/summary-recorder.js src/session/character-session.js src/session/residue.js
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
//   A1  Hunt again sends ONE hr_hunt_enter with the same ground, set, limits and
//       bag; a call missing its ground sends nothing
//   A2  an ended session stores its summary ONCE (a second envelope for it adds
//       nothing) and the stored card carries the death explanation
//   A3  a re-read that lands before the debounced residue put keeps the stored
//       card (pending residue outlives a replacing envelope until it is put)
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
    ok(f.lines[0].includes("rule 'Knight below 50%' was waiting for mana"), 'the rule that waited: ' + f.lines[0]);
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
    bag: [['wheat_bread', 20, 0], ['goldenroot_tea', 10, 1]], tally: { kills: 7, xp: 70, coins: 30, loot: { rat_tail: 4 }, supplies: { wheat_bread: 3 }, deaths: 1 }, died: 1 }, over || {});

  await t('S4 the summary reads the analyzer (own vs store) and, for a free character, the tally', () => {
    const an = { sessionMs: 120000, hero: { kills: 164, xp: 16311, gold: 2996, supplies: [{ item: 'wheat_bread', source: 'own', count: 12 }, { item: 'wheat_bread', source: 'store', count: 4 }],
      loot: [{ item: 'rat_tail', count: 5 }, { item: 'cheese', count: 9 }], perHour: { xp: 489330, rawXp: null, gold: 89880, waste: null, balance: 71220 } } };
    const s = MD.buildSummary(ended(), an, ['Knight died.']);
    /* Per hour is the server's figure (designer 2026-10-21): balance for everyone, raw XP only when sent (premium). */
    eq([s.balanceH, s.rawXpH], [71220, null], 'a free character: the server balance per hour, no raw XP per hour');
    const prem = MD.buildSummary(ended(), { ...an, hero: { ...an.hero, perHour: { ...an.hero.perHour, rawXp: 401000 } } }, []);
    eq([prem.balanceH, prem.rawXpH], [71220, 401000], 'a premium character: balance and raw XP per hour');
    eq(MD.sanitizeSummaries([prem])[0].rawXpH, 401000, 'the stored card keeps the per-hour figures');
    eq([s.ms, s.kills, s.xp, s.gold, s.reason, s.died], [120000, 164, 16311, 2996, 'died', 1], 'the analyzer numbers');
    eq(s.supplies, [['wheat_bread', 'own', 12], ['wheat_bread', 'store', 4]], 'bag vs store');
    eq(s.loot[0], ['cheese', 9], 'top loot first');
    const free = MD.buildSummary(ended(), null, []);
    eq([free.ms, free.kills, free.xp, free.gold, free.loot, free.supplies], [60000, 7, 70, 30, [['rat_tail', 4]], [['wheat_bread', 'own', 3]]], 'the free character reads the session tally');
  });

  await t('S5 Hunt again is the ended hunt\'s own settings', () => {
    const s = MD.buildSummary(ended(), null, []);
    eq(MD.huntAgainOf(s), { hunt: 'mill_cellar', preset: 1, hours: 2,
      bag: [{ item: 'wheat_bread', qty: 20 }, { item: 'goldenroot_tea', qty: 10, essential: true }] }, 'same ground, set, limits, bag');
    eq(MD.huntAgainOf(Object.assign({}, s, { hunt: null })), null, 'no ground, no card button');
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
    let v = 8;
    const cs = sessionOn(calls, () => endedEnv(v));
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
    /* The put goes first, so the re-read below carries no card (this stub keeps nothing) and only the
       recorder's own once-per-session rule can stop a second write. */
    await cs.flushResidue();
    v = 9;
    await cs.load();
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

  return fails;
}

async function load(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  /* The recorder names heroes off the character's own sections, so the A2 stream's names come from the fixture party. */
  return {
    EX: await import(u(EXPLAIN)), MD: await import(u(MODEL)), REC: await import(u(RECORDER)),
    CS: Object.assign({}, await import(u(SESSION))), RES: await import(u(RESIDUE)),
    END_ORDER: (await import(u('src/data/hunt-sessions.js'))).END_ORDER,
  };
}

const MUTANTS = [
  { test: 'A3', file: SESSION, from: '    for (const [f, v] of Object.entries(this._pending)) this._record = withResidue(this._record, f, v);\n', to: '' },
  { test: 'D1', file: EXPLAIN, from: "parts.push(plural(g.amounts.length, g.who + ' hit', g.who + ' hits')", to: "parts.push(plural(1, g.who + ' hit', g.who + ' hits')" },
  { test: 'D1', file: EXPLAIN, from: "else if (to - lastHeal >= 3000)", to: "else if (false)" },
  { test: 'D1', file: EXPLAIN, from: "for (const o of who.others || []) if", to: "for (const o of []) if" },
  { test: 'D1', file: EXPLAIN, from: "rules.push(\"rule '\" + ruleName(w) + \"' was waiting\"", to: "rules.push(\"rule '\" + ruleName(w) + \"' fired\"" },
  { test: 'D2', file: MODEL, from: "if (key === null || seen.has(key)) return false;", to: "if (key === null) return false;" },
  { test: 'D3', file: EXPLAIN, from: "e.atMs >= from && e.atMs <= to)", to: "e.atMs <= to)" },
  { test: 'D4', file: EXPLAIN, from: "kind: wipe ? 'wipe'", to: "kind: false ? 'wipe'" },
  { test: 'S1', file: MODEL, from: "  stamina: 'Your stamina ran out.',\n", to: '' },
  { test: 'S2', file: SUMMARIES, from: "    if (out.length >= HISTORY_MAX) break;", to: '' },
  { test: 'S2', file: SUMMARIES, from: "if (!s || seen.has(s.id)) continue;", to: "if (!s) continue;" },
  { test: 'S3', file: RESIDUE, from: "  huntSummaries: sanitizeSummaries,", to: "  huntSummaries: (v) => v," },
  { test: 'S4', file: MODEL, from: ".map((x) => [x.item, x.source, x.count])", to: ".map((x) => [x.item, 'own', x.count])" },
  { test: 'S4', file: MODEL, from: "loot.sort((a, b) => b[1] - a[1]);", to: '' },
  { test: 'S4', file: MODEL, from: 'balanceH: ph ? ph.balance : null,', to: 'balanceH: ph ? ph.gold : null,' },
  { test: 'S4', file: SUMMARIES, from: 'balanceH: num(v.balanceH), rawXpH: num(v.rawXpH),', to: 'balanceH: num(v.balanceH),' },
  { test: 'S5', file: MODEL, from: "hunt: summary.hunt, preset: summary.preset, hours: summary.hoursLimit,", to: "hunt: summary.hunt, preset: 0, hours: summary.hoursLimit," },
  { test: 'A1', file: SESSION, from: "p_hunt: a.hunt, p_bag: a.bag, p_preset: a.preset,", to: "p_hunt: a.hunt, p_bag: [], p_preset: a.preset," },
  { test: 'A1', file: SESSION, from: "if (!a || !ITEM.test(String(a.hunt)) ||", to: "if (!a ||" },
  { test: 'A2', file: RECORDER, from: "    if (a.done.has(s.id)) return;\n    a.done.add(s.id);", to: "    a.done.add(s.id);" },
  { test: 'A2', file: RECORDER, from: "const ex = a.sid === s.id ? explainDeaths(a.rec.events(), { whoOf }) : { deaths: [] };", to: "const ex = { deaths: [] };" },
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
