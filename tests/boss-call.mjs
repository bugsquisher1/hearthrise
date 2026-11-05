#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/boss-call.mjs — CALL OUT PAYS NOTHING, AND ENDS (Tyler 2026-11-04; src/data/boss-calls.js). The money line's standing guard: data and the real settle, no database.
// tests/boss-call-db.mjs holds the server's half: the verb, the one door, the settle's refusal, both doors.
//
//   node tests/boss-call.mjs            the guard
//   node tests/boss-call.mjs --mutate   every planted defect must turn it red
//
// mutant-anchors: src/data/monsters.js src/core/hunt-rewards.js src/core/combat-sim.js src/core/action-rules.js src/core/hunt/pull-cycle.js src/data/bestiary.js src/data/hunt-grounds.js
//
//   BC-ROW     a called row is xp 0, gp [0, 0], no drops, no yield trick; it stands in its own room and nowhere else: no ground list, no roster, no Bestiary, no activity
//   BC-TIER    a difficulty tier can't reach the room (when src/data/hunt-tiers.js is on the tree)
//   BC-PAY     a kill pays nothing by any path: a lone seat, a pair, a four, Tempering, a bestiary boost: every window's delta is the settle's allowlist, and the kill reaches only the title's counter
//   BC-HP      the boss's one spawn is scaled for the party that walked in, not the first hero through the door
//   BC-FELLED  the kill ends the fight for everyone, the same instant however the windows are cut (the hunt viewed, the browser closed)
//   BC-DEATH   a death ends it for everyone, box ticked or not, and costs what a death costs
//   BC-TIME    the limit ends a fight nobody can finish, for everyone, and no hunt is left open
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ROOT as REPO, plant } from './hunt-core/fixtures/h1.js';

const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(REPO, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(REPO, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const T0 = Date.UTC(2026, 9, 18, 12, 0, 0);
const MINUTE = 60000;
const ALLOWED = new Set(['accrued_to', 'hp', 'journal', 'progress', 'deaths']);

/* The strong and the doomed, on the kits the rooms are tuned for: the fight's outcome is not the question here, its end and its pay are. */
const STRONG = { L: 70, kit: { weapon: 'steel_warhammer', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' } };

async function loadAll(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const play = await loadPlay(root);
  return { play, root,
    B: await import(u('src/data/boss-calls.js')),
    G: await import(u('src/data/hunt-grounds.js')),
    H: await import(u('src/data/hunts.js')),
    M: await import(u('src/data/monsters.js')),
    BE: await import(u('src/data/bestiary.js')),
    /* the engine's own instances (src/core imports with ?v=): the rows the fight reads */
    EM: (await import(u('src/data/monsters.js') + V)).MONSTERS,
    D: await import(u('src/core/hunt/damage.js') + V),
    XP: await import(u('src/core/xp.js') + V),
  };
}

/* One fight to its end: the windows, the ends and every member's deltas. `cut` the settle's window. */
function fight(X, call, roles, o = {}) {
  const windows = [];
  const res = X.play.run(call.hunt, o.L || STRONG.L, roles, { ground: X.G.CALLED_GROUNDS[call.hunt], spanMs: X.B.BOSS_CALL_RULES.limitMs + 2 * MINUTE, windowMs: o.cut || 30000,
    secret: o.secret || '-4611686018427387904', leaveTogether: o.box !== false, ...(o.temper ? { temper: o.temper } : {}), ...(o.start ? { start: o.start } : {}), equipment: (role) => o.kit || (role === 'mage' ? { weapon: 'oak_wand' } : role === 'healer' ? { weapon: 'oak_staff' } : STRONG.kit),
    onWindow: (w) => windows.push(w) });
  const members = windows.flatMap((w) => w.members);
  const ended = {};
  for (const m of members) if (m.hunt.ended) ended[m.key] = m.hunt.ended;
  return { res, windows, members, ended };
}

/* Every way a delta can pay, as the settle's allowlist reads it (hr_boss_call_pays). */
function paysOf(delta, monster) {
  const out = [];
  for (const k of Object.keys(delta)) if (!ALLOWED.has(k)) out.push(k + '=' + JSON.stringify(delta[k]).slice(0, 40));
  const meta = (delta.journal && delta.journal.meta) || {};
  if (Number(meta.kills) !== 0) out.push('journal kills ' + meta.kills);
  if (meta.km) out.push('km');
  for (const op of delta.progress || []) {
    if (op.kind === 'stat' && (op.key === 'deaths' || (op.key === 'ev:kill_monster:' + monster && op.period === '' && op.add === 1))) continue;
    out.push('progress ' + op.key);
  }
  return out;
}

async function guard(X) {
  const bad = [];
  const { B, G, H, M, BE } = X;
  const calls = Object.values(B.BOSS_CALLS);
  const rows = Object.entries(M.MONSTERS).filter(([, m]) => m.called === true);

  /* BC-ROW */
  if (rows.length !== calls.length) bad.push('BC-ROW ' + rows.length + ' called rows for ' + calls.length + ' calls');
  for (const [id, m] of rows) {
    if (m.xp !== 0) bad.push('BC-ROW ' + id + ' pays XP ' + m.xp);
    if (!(m.gp && m.gp[0] === 0 && m.gp[1] === 0)) bad.push('BC-ROW ' + id + ' pays coin ' + JSON.stringify(m.gp));
    if (!(Array.isArray(m.drops) && m.drops.length === 0)) bad.push('BC-ROW ' + id + ' drops ' + JSON.stringify(m.drops));
    if (m.yieldPm !== undefined) bad.push('BC-ROW ' + id + ' carries a yield: yieldOf reads 0 as full yield');
    if (!/_called$/.test(id)) bad.push('BC-ROW ' + id + ' id does not end _called');
    if (id in BE.BESTIARY) bad.push('BC-ROW ' + id + ' has a Bestiary entry');
  }
  /* yieldOf's trap, read: the rule the row's zeros exist for. If it ever reads 0 as nothing, this file's reason moved: say so. */
  if (X.D.yieldOf({ yieldPm: 0 }) !== 1000) bad.push('BC-ROW yieldOf no longer reads yieldPm 0 as full yield: the header is out of date');
  for (const c of calls) {
    const g = G.CALLED_GROUNDS[c.hunt];
    if (!g || g.call !== c.id) { bad.push('BC-ROW ' + c.id + ' has no room'); continue; }
    if (G.HUNT_GROUNDS[c.hunt]) bad.push('BC-ROW room ' + c.hunt + ' is on the ground list');
    if (G.OPEN_GROUNDS[c.hunt]) bad.push('BC-ROW room ' + c.hunt + ' is an open ground');
    if (H.HUNTS.some((h) => h.id === c.hunt) || H.OPEN_HUNTS.some((h) => h.id === c.hunt)) bad.push('BC-ROW room ' + c.hunt + ' is on the hunt list');
    if (G.groundOfHunt(c.hunt) !== g) bad.push('BC-ROW the engine does not find room ' + c.hunt);
    for (const p of g.pockets) for (const s of p.spawns) if (!(M.MONSTERS[s.monster] && M.MONSTERS[s.monster].called === true)) bad.push('BC-ROW room ' + c.hunt + ' fields ' + s.monster);
    if (G.pullRows(g, 0, 8).length !== 1) bad.push('BC-ROW a pull of 8 brings ' + G.pullRows(g, 0, 8).length + ' to room ' + c.hunt);
  }
  const reach = G.reachableOf(G.OPEN_GROUNDS, H.HUNT_INDEX).monsters;
  for (const [id] of rows) if (reach.includes(id)) bad.push('BC-ROW ' + id + ' is on the reachable roster');
  for (const g of Object.values(G.HUNT_GROUNDS)) for (const p of g.pockets) for (const s of (p.pack || []).concat(p.spawns)) if (M.MONSTERS[s.monster] && M.MONSTERS[s.monster].called === true) bad.push('BC-ROW ground ' + g.id + ' fields ' + s.monster);
  const sql = readFileSync(join(X.root === REPO ? REPO : REPO, 'supabase/migrations/2027-03-02-boss-call-hunt-sessions-catalogue.generated.sql'), 'utf8');
  for (const [id] of rows) {
    if (!sql.includes(`('${id}', 0, 0, '{}'::jsonb)`)) bad.push('BC-ROW the catalogue\'s kill bound of ' + id + ' is not nothing');
    if (new RegExp(`delete from public.hr_hunt_roster;[\\s\\S]*?\\('${id}'\\)[\\s\\S]*?delete from public.hr_hunt_weapons`).test(sql)) bad.push('BC-ROW ' + id + ' is in hr_hunt_roster');
  }

  /* BC-TIER: the difficulty lane's data, once it lands here. */
  const tiers = await import(pathToFileURL(join(X.root, 'src/data/hunt-tiers.js')).href).catch(() => null);
  if (tiers) for (const c of calls) if (tiers.tiersOf(G.CALLED_GROUNDS[c.hunt].id).join() !== tiers.DEFAULT_TIER) bad.push('BC-TIER room ' + c.hunt + ' offers ' + tiers.tiersOf(c.hunt).join());

  const king = B.BOSS_CALLS.rat_king, chief = B.BOSS_CALLS.chief_coppercap;
  /* BC-PAY: every path, on rows that make the kill certain and quick: the boss is real, his blows aren't what's measured. Then BC-FELLED's three cuts. */
  const soft = (c, hp) => { for (const inst of [X.EM[c.monster], X.play.MONSTERS[c.monster]]) { inst.hp = hp; inst.atk = 1; inst.baseAcc = 0; } };
  soft(king, 400); soft(chief, 400);
  const PATHS = [
    ['a lone seat', king, ['tank'], {}],
    ['a pair', king, ['tank', 'healer'], {}],
    ['a four, mixed', king, ['tank', 'healer', 'melee_dps', 'mage'], {}],
    ['a four on the Chief', chief, ['tank', 'healer', 'melee_dps', 'ranger'], {}],
    ['Tempering at every rung', king, ['tank', 'melee_dps'], { temper: { 'temper:blows:2': 5, 'temper:armor:2': 5, 'temper:blows:3': 5, 'temper:armor:3': 5 } }],
  ];
  for (const [name, c, roles, o] of PATHS) {
    const f = fight(X, c, roles, o);
    if (Object.keys(f.ended).length !== roles.length) bad.push('BC-PAY ' + name + ': ' + Object.keys(f.ended).length + ' of ' + roles.length + ' ended');
    let kills = 0;
    for (const m of f.members) {
      for (const p of paysOf(m.delta, c.monster)) bad.push('BC-PAY ' + name + ': ' + m.key + ' ' + p);
      kills += (m.delta.progress || []).filter((op) => op.key === 'ev:kill_monster:' + c.monster).length;
      if (m.hunt.raw_xp && Object.keys(m.hunt.raw_xp).length) bad.push('BC-PAY ' + name + ': the tally reads XP ' + JSON.stringify(m.hunt.raw_xp));
      if (m.events && m.events.some((e) => e.type === 'rare_drop')) bad.push('BC-PAY ' + name + ': a rare drop');
    }
    if (kills !== roles.length) bad.push('BC-PAY ' + name + ': the title\'s counter moved ' + kills + ' times for ' + roles.length + ' heroes');
    for (const w of f.windows) for (const e of w.events || []) if (e.type === 'xp' || e.type === 'xp_group' || e.type === 'rare_roll') bad.push('BC-PAY ' + name + ': a ' + e.type + ' event');
    if (!Object.values(f.ended).every((e) => e.reason === 'boss_felled')) bad.push('BC-PAY ' + name + ': ended ' + JSON.stringify(f.ended));
  }
  /* A bestiary boost and a relic reach no payout: the same pair, a relic row for the boss, the same zero. */
  {
    const seen = [];
    const run = X.play.run;
    const f = run(king.hunt, STRONG.L, ['tank', 'melee_dps'], { ground: G.CALLED_GROUNDS[king.hunt], spanMs: 5 * MINUTE, windowMs: 30000, leaveTogether: true, equipment: () => STRONG.kit,
      session: () => ({}), onWindow: (w, members) => { for (const m of members) m.relicMults = { [king.monster]: 1.25, [king.of]: 1.25 }; for (const p of w.members) seen.push(p); } });
    for (const p of seen) for (const w of paysOf(p.delta, king.monster)) bad.push('BC-PAY a relic on the boss: ' + w);
    if (f.totals.levelXp || f.totals.xp || f.totals.coin) bad.push('BC-PAY a relic on the boss paid ' + JSON.stringify(f.totals));
  }

  /* BC-HP: the one spawn is the party's size, read from the first window's unit book. */
  for (const [roles, pm] of [[['tank', 'healer'], 700], [['tank', 'healer', 'mage'], 850], [['tank', 'healer', 'mage', 'melee_dps'], 1000]]) {
    const f = fight(X, king, roles, {});
    const book = f.windows[0].units || {};
    const boss = Object.values(book).find((u) => u[0] === king.monster);
    const want = Math.floor((X.EM[king.monster].hp * pm) / 1000);
    if (!boss || boss[1] !== want) bad.push('BC-HP ' + roles.length + ' heroes meet ' + (boss && boss[1]) + ' HP, want ' + want);
  }

  /* BC-FELLED: the same fight cut three ways ends on the same instant, with the same reason for everyone. */
  {
    const cuts = [10000, 30000, 10 * MINUTE].map((cut) => fight(X, king, ['tank', 'healer'], { cut }));
    /* ...and a window that closes on the very boundary the kill lands before: the end is stamped past it, in the same settle. */
    const at = Date.parse(Object.values(cuts[2].ended)[0].at);
    cuts.push(fight(X, king, ['tank', 'healer'], { cut: at - T0 }));
    const key = (f) => JSON.stringify(Object.entries(f.ended).sort());
    for (const f of cuts) if (key(f) !== key(cuts[0])) bad.push('BC-FELLED the cuts disagree: ' + key(f) + ' against ' + key(cuts[0]));
    for (const e of Object.values(cuts[0].ended)) if (e.reason !== 'boss_felled') bad.push('BC-FELLED ended ' + e.reason);
    if (Object.keys(cuts[0].ended).length !== 2) bad.push('BC-FELLED ' + Object.keys(cuts[0].ended).length + ' of 2 ended');
  }

  /* BC-DEATH: a boss who kills at once. The box is unticked: on any other ground the friend hunts on; here the fight is over for both. */
  for (const inst of [X.EM[king.monster], X.play.MONSTERS[king.monster]]) { inst.hp = 1000000; inst.atk = 400; inst.baseAcc = 1; }
  {
    /* well past the Level's start, or the 2% has nothing to take (a death never de-levels) */
    const f = fight(X, king, ['tank', 'healer'], { box: false, L: 8, kit: { weapon: 'bronze_sword' }, start: (role, i, L) => ({ levelXp: X.XP.charXpForLevel(L) + 2000 }) });
    const reasons = Object.values(f.ended).map((e) => e.reason).sort().join();
    if (reasons !== 'died,party_member_died') bad.push('BC-DEATH ended ' + (reasons || 'nothing') + ', want died and party_member_died');
    const lost = f.members.flatMap((m) => (m.summary.deathLog || []).map((d) => d.xpLost));
    if (lost.length !== 1 || !lost[0] || !(lost[0].level > 0)) bad.push('BC-DEATH the death cost ' + JSON.stringify(lost));
    if (f.res.playedMs >= B.BOSS_CALL_RULES.limitMs) bad.push('BC-DEATH ran to the limit');
  }

  /* BC-TIME: nobody can finish him and he can't finish anybody: the limit ends it for everyone, one swing after it falls at most, and nothing stays open. */
  for (const inst of [X.EM[king.monster], X.play.MONSTERS[king.monster]]) { inst.hp = 100000000; inst.atk = 1; inst.baseAcc = 0; }
  for (const cut of [10000, 10 * MINUTE]) {
    const f = fight(X, king, ['tank', 'healer'], { cut });
    const ended = Object.values(f.ended);
    if (ended.length !== 2 || !ended.every((e) => e.reason === 'boss_time')) bad.push('BC-TIME cut ' + cut + ' ended ' + JSON.stringify(f.ended));
    for (const e of ended) if (Date.parse(e.at) !== T0 + B.BOSS_CALL_RULES.limitMs) bad.push('BC-TIME ended at ' + e.at + ', the limit falls ' + new Date(T0 + B.BOSS_CALL_RULES.limitMs).toISOString());
    if (f.windows.some((w) => w.members.some((m) => Object.keys(m.delta).some((k) => !ALLOWED.has(k))))) bad.push('BC-TIME a window of the limit paid something');
  }
  return bad;
}

async function restoring(root, fn) {
  const X = await loadAll(root);
  const keep = Object.values(X.B.BOSS_CALLS).map((c) => [c.monster, { ...X.EM[c.monster] }]);
  try { return await fn(X); } finally {
    for (const [id, row] of keep) { Object.assign(X.EM[id], row); Object.assign(X.play.MONSTERS[id], row); delete X.EM[id].unused; }
  }
}

const ROW_KING = "hp: 5000, atk: 61, baseAcc: 0.1, def: 4, xp: 0, gp: [0, 0], speed: 2800, drops: [] },";
const MUTANTS = [
  { name: 'a drop row planted on a called row', edits: [['src/data/monsters.js', ROW_KING, ROW_KING.replace('drops: []', "drops: [{ id: 'bones', ch: 1, band: 'common' }]")]], want: /BC-ROW/ },
  { name: 'XP planted on a called row', edits: [['src/data/monsters.js', ROW_KING, ROW_KING.replace('xp: 0', 'xp: 500')]], want: /BC-ROW/ },
  { name: 'coin planted on a called row', edits: [['src/data/monsters.js', ROW_KING, ROW_KING.replace('gp: [0, 0]', 'gp: [1, 5]')]], want: /BC-ROW/ },
  { name: 'a yield of 0 instead of the zeros', edits: [['src/data/monsters.js', ROW_KING, ROW_KING.replace('drops: []', 'drops: [], yieldPm: 0')]], want: /BC-ROW/ },
  { name: 'the engine has no door: a called swing pays like any other', edits: [['src/core/hunt-rewards.js', '  if (ctx.call) return calledSwing(members, events, unitOf, ctx.call.monster);\n', '']], want: /BC-PAY/ },
  { name: 'the sim forgets to hand the rewards the call', edits: [['src/core/combat-sim.js', 'hearthfind: ctx.hearthfind, call,', 'hearthfind: ctx.hearthfind,']], want: /BC-PAY/ },
  { name: 'a called kill counts as a kill', edits: [['src/core/hunt-rewards.js', "for (const m of members.values()) call(m.fx, 'updateQuest', 'kill_monster', 1, { target: t.kind });", "for (const m of members.values()) { m.hs.tally.kills += 1; call(m.fx, 'updateQuest', 'kill_any', 1, { target: t.kind }); call(m.fx, 'updateQuest', 'kill_monster', 1, { target: t.kind }); }"]], want: /BC-PAY/ },
  { name: 'the kill never reaches the title', edits: [['src/core/hunt-rewards.js', "for (const m of members.values()) call(m.fx, 'updateQuest', 'kill_monster', 1, { target: t.kind });", '']], want: /BC-PAY/ },
  { name: 'the kill ends nothing', edits: [['src/core/combat-sim.js', "for (const m of members) if (!m.left) m.hs.bossFelled = true;", '']], want: /BC-PAY|BC-FELLED/ },
  { name: 'the kill ends only the window it fell in', edits: [['src/core/combat-sim.js', "typeof m.hs.ruleStop === 'string' || m.hs.died === true || m.hs.bossFelled === true) {", "typeof m.hs.ruleStop === 'string' || m.hs.died === true) {"]], want: /BC-FELLED/ },
  { name: 'a death leaves the unticked friend in the room', edits: [['src/core/combat-sim.js', 'if (called || (o.hero && o.hero.leaveTogether === true))', 'if (o.hero && o.hero.leaveTogether === true)']], want: /BC-DEATH/ },
  { name: 'the limit never falls', edits: [['src/core/action-rules.js', 'boss_time: (hs, t) => at(hs.callEndsAtMs, t),', 'boss_time: () => false,']], want: /BC-TIME/ },
  { name: 'the boss spawns at one hero\'s HP', edits: [['src/core/hunt/pull-cycle.js', 'const heroes = inst.scaleHeroes || partySize(inst);', 'const heroes = partySize(inst);']], want: /BC-HP/ },
  { name: 'a called boss in the Bestiary', edits: [['src/data/bestiary.js', "if (!m || typeof m !== 'object' || m.called === true) continue;", "if (!m || typeof m !== 'object') continue;"]], want: /BC-ROW/ },
  { name: 'a room on the ground list', edits: [['src/data/hunt-grounds.js', 'export const OPEN_GROUNDS = Object.freeze(Object.fromEntries(Object.entries(HUNT_GROUNDS)', 'export const OPEN_GROUNDS = Object.freeze(Object.fromEntries(Object.entries({ ...HUNT_GROUNDS, ...CALLED_GROUNDS })']], want: /BC-ROW/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) {
      const bad = await restoring(REPO, guard);
      console.log('boss-call --mutate: control ran the clean tree: ' + (bad.length ? bad.join('; ') : 'green'));
      process.exit(0);
    }
    let escaped = 0;
    for (const m of MUTANTS) {
      const { root, done } = plant(m.edits, PLAY_TREES);
      let got = [];
      try { got = await restoring(root, guard); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 160)]; }
      finally { done(); }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every check held').slice(0, 120));
    }
    console.log(escaped ? 'boss-call --mutate: ' + escaped + ' ESCAPED' : 'boss-call --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exit(escaped ? 1 : 0);
  }
  const bad = await restoring(REPO, guard);
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? 'boss-call: ' + bad.length + ' FAILED' : 'boss-call: green (the rows, the paths, the three ends, every cut)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
