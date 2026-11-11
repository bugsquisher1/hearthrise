#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/ground-boss.mjs — A GROUND'S BOSS PLAYS HIS TWO LINES (Tyler 2026-11-05: adds at 50% health, an enrage at 25%, a real
// boss bar), on the one engine that plays a called boss's (src/core/hunt/boss-phases.js): Captain Hask, the Muster Barrows.
// tests/boss-call.mjs holds the called room; this holds the ground, where a boss can be reset and his adds pay.
//
//   node tests/ground-boss.mjs            the guard (no database, no browser)
//   node tests/ground-boss.mjs --mutate   every planted defect must turn it red
//
// mutant-anchors: src/core/hunt/boss-phases.js src/core/hunt/leash.js src/core/hunt/pull-cycle.js src/core/hunt/damage.js src/data/grounds/muster_barrows/pack.js src/data/hunt-grounds.js tools/gen-hunt-sessions.mjs
//
//   GB-ROW    Hask carries both lines and his barrow names his wave: the ground's own monsters (his file of Pikemen), who pay. A wave with no boss to
//             call it, a boss in a wave and an add outside its room are refused (hunt-grounds.js validateGround); the catalogue generator
//             takes a ground's boss with lines (tools/gen-hunt-sessions.mjs catalogueRows)
//   GB-LINES  his fight on the real settle: the adds come at half his health and the enrage at a quarter, once each, the wave in full and
//             going for whoever isn't holding him; the wave pays a Knight's kill; the same instants however the windows are cut (the
//             hunt viewed, the browser closed)
//   GB-RAGE   under his second line his blows rise past his row's
//   GB-RESET  his holder falls with the wave up: the wave leaves, he heals, and the next try brings ONE fresh wave, never a second on top,
//             the same however the windows are cut. Through resetPack itself: a called room still never resets, and a monster with no
//             home in a pocket that names no wave is healed, not sent away
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
const TREES = [...PLAY_TREES, 'src/session', 'tools/gen-hunt-sessions.mjs', 'tools/pack', 'tests/_is-main.mjs'];
const GROUND = 'muster_barrows', BOSS = 'captain_hask', MINUTE = 60000;
/* The three cuts every both-paths check plays: a viewed hunt's short confirms, a longer one, and a closed browser's ten minutes. */
const CUTS = [10000, 30000, 10 * MINUTE];

async function loadAll(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return { root,
    play: await loadPlay(root),
    G: await import(u('src/data/hunt-grounds.js')),
    M: await import(u('src/data/monsters.js')),
    /* the engine's own instances (src/core imports with ?v=): the rows the fight reads, and the reset it runs */
    EM: (await import(u('src/data/monsters.js') + V)).MONSTERS,
    EG: await import(u('src/data/hunt-grounds.js') + V),
    LE: await import(u('src/core/hunt/leash.js') + V),
    C: await import(u('src/core/combat.js') + V),
    GEN: await import(u('tools/gen-hunt-sessions.mjs')),
  };
}

/* HIS BARROW ALONE: the ground's own pocket (its pack, its wave, its leash), walked to from the forecourt, so a fight is minutes. */
function hallOf(X) {
  const g = X.G.HUNT_GROUNDS[GROUND];
  const at = g.pockets.findIndex((p) => (p.adds || []).length);
  return { ...g, pockets: [g.pockets[at]], route: [0], start: [[44, 30], [45, 30], [46, 30], [47, 30]], gather: undefined };
}

/* One fight: every window, its events in order, every unit's kind, and the run's answer. */
function fight(X, o = {}) {
  const windows = [];
  const res = X.play.run(GROUND, o.L || 75, o.roles || ['tank', 'ranger', 'mage', 'healer'], { ground: hallOf(X), spanMs: o.spanMs || 2 * MINUTE,
    windowMs: o.cut || 30000, dropEnded: true, ...(o.bar ? { bar: o.bar } : {}), ...(o.equipment ? { equipment: o.equipment } : {}), onWindow: (w) => windows.push(w) });
  const kinds = {};
  for (const w of windows) for (const [id, r] of Object.entries(w.units || {})) kinds[id] = r[0];
  return { res, windows, kinds, ev: windows.flatMap((w) => w.events || []) };
}

/* What a cut must not move: every event's instant and who it names. */
const keyOf = (f) => JSON.stringify(f.ev.map((e) => [e.type, e.atMs, e.u, e.t, e.phase, e.amount, e.pocket]));
const bossUnit = (f) => Number(Object.keys(f.kinds).find((u) => f.kinds[u] === BOSS));

/* Every unit of `kind` the windows saw, by id: a unit's id is the world's next one when it is placed, so the barrow's own come first,
   then each wave in the order it came (no respawn falls inside these fights). */
const idsOf = (f, kind) => Object.keys(f.kinds).filter((u) => f.kinds[u] === kind).map(Number).sort((a, b) => a - b);
/* The instant unit `u` first acts or is named, or Infinity. */
const firstAt = (f, u) => (f.ev.find((e) => e.u === u || e.t === u) || { atMs: Infinity }).atMs;

/* Restore every row a check rewrote, on both module instances. */
function setRow(X, id, o) { Object.assign(X.EM[id], o); Object.assign(X.play.MONSTERS[id], o); }

async function guard(X) {
  const bad = [];
  const { G, M, EM } = X;
  const g = G.HUNT_GROUNDS[GROUND];
  const row = M.MONSTERS[BOSS];

  /* GB-ROW: the data. */
  const ph = row && row.phases;
  if (!row || row.boss !== true || row.called === true) bad.push('GB-ROW ' + BOSS + ' is no ground boss');
  if (!(ph && ph.addsPm === 500 && ph.enragePm === 250 && ph.enrageAtkPm > 1000)) bad.push('GB-ROW ' + BOSS + ' has no lines at half and a quarter: ' + JSON.stringify(ph));
  const holds = g.pockets.filter((p) => (p.adds || []).length);
  if (holds.length !== 1 || !holds[0].spawns.some((s) => s.monster === BOSS)) bad.push('GB-ROW his barrow names no wave (' + holds.length + ' pockets with one)');
  for (const p of holds) for (const s of p.adds) {
    const a = M.MONSTERS[s.monster];
    if (!a || a.called === true || a.boss === true || !(a.xp > 0)) bad.push('GB-ROW his wave fields ' + s.monster + ', which is no paying monster of the ground');
  }
  const own = G.validateGround(g);
  if (own.length) bad.push('GB-ROW the ground does not validate: ' + own.join('; '));
  const refused = (what, ground, refs) => { if (!G.validateGround(ground, refs).some((s) => /add/.test(s))) bad.push('GB-ROW a ground with ' + what + ' validates'); };
  const at = g.pockets.indexOf(holds[0]);
  const withPocket = (p) => ({ ...g, pockets: g.pockets.map((x, i) => (i === at ? p : x)) });
  if (holds[0]) {
    refused('a wave and no boss with lines to call it', g, { monsters: { ...M.MONSTERS, [BOSS]: { ...row, phases: undefined } } });
    refused('a boss in his wave', withPocket({ ...holds[0], adds: [{ monster: BOSS, x: holds[0].adds[0].x, y: holds[0].adds[0].y }] }));
    refused('an add outside its room', withPocket({ ...holds[0], adds: [{ monster: holds[0].adds[0].monster, x: holds[0].room[2] + 4, y: holds[0].room[3] + 4 }] }));
  }
  try { X.GEN.catalogueRows(); } catch (e) { bad.push('GB-ROW the catalogue generator refuses the data: ' + String(e && e.message).slice(0, 140)); }

  /* GB-LINES: his real row, a four at the band's top, three cuts. */
  const wave = holds[0] ? holds[0].adds.length : 0;
  const lines = CUTS.map((cut) => fight(X, { cut }));
  for (const f of lines) if (keyOf(f) !== keyOf(lines[0])) bad.push('GB-LINES the cuts disagree: the ' + (f === lines[1] ? '30 s' : '10 min') + ' cut moves an event');
  {
    const f = lines[0], hask = bossUnit(f);
    const said = f.ev.filter((e) => e.type === 'boss_phase' && e.u === hask);
    if (said.map((e) => e.phase).join() !== 'adds,enrage') bad.push('GB-LINES his lines fell as ' + (said.map((e) => e.phase).join() || 'nothing') + ', want adds then enrage, once each');
    const book = Object.values(f.windows[0].units || {}).find((x) => x[0] === BOSS);
    const maxHp = book ? book[1] : 0;
    let dealt = 0;
    for (const e of f.ev) {
      if (e.type === 'boss_phase' && e.u === hask) {
        const pm = Math.floor(((maxHp - dealt) * 1000) / maxHp), line = e.phase === 'adds' ? EM[BOSS].phases.addsPm : EM[BOSS].phases.enragePm;
        if (!(pm <= line && pm > line - 150)) bad.push('GB-LINES ' + e.phase + ' fell at ' + pm + ' permille of him, the line is ' + line);
      }
      if (e.type === 'dmg' && e.t === hask) dealt += e.amount;
    }
    const addsAt = (said.find((e) => e.phase === 'adds') || {}).atMs;
    const built = holds[0] ? holds[0].spawns.filter((s) => s.monster === holds[0].adds[0].monster).length : 0;
    const came = holds[0] ? idsOf(f, holds[0].adds[0].monster).slice(built) : [];
    if (came.length !== wave) bad.push('GB-LINES ' + came.length + ' adds came, his wave is ' + wave);
    for (const u of came) if (!(firstAt(f, u) >= addsAt)) bad.push('GB-LINES an add acted before his first line');
    /* THE WAVE PAYS (a ground's adds are its own monsters; a called room's pay nothing): the as-built Knights and his wave all die and count. */
    const killed = (f.res.killsBy || {})[holds[0] ? holds[0].adds[0].monster : ''] || 0;
    if (killed !== built + wave) bad.push('GB-LINES ' + killed + ' of the kind his wave is paid their kill, the barrow had ' + built + ' and his wave ' + wave);
    if (!((f.res.killsBy || {})[BOSS] === 1)) bad.push('GB-LINES CONTROL: he did not fall in the try: ' + JSON.stringify(f.res.killsBy));
  }

  /* GB-RAGE: a pair, his blows sure and small, his enrage tripled: the largest before the line stays under his row's, after it passes it.
     No Challenge on the bars, so an add's first blow is its first aim (the Healer's id comes first, so a wave aimed round the whole
     party would land one add on the tank): GB-LINES' "whoever isn't holding him". His Knights can't hurt, so nobody falls before him. */
  setRow(X, BOSS, { hp: 4000, atk: 10, baseAcc: 3, phases: { ...EM[BOSS].phases, enrageAtkPm: 3000 } });
  if (holds[0]) setRow(X, holds[0].adds[0].monster, { atk: 1, baseAcc: 0 });
  {
    const NO_CHALLENGE = (role) => (role === 'tank' ? [{ action: { type: 'ability', id: 'power_strike' }, conditions: [], join: 'and' }] : []);
    /* a Level 50 tank in steel, so his blows land and the armor does not swallow the raise (at Level 75 in the ladder kit nine in ten miss) */
    const STEEL = { weapon: 'steel_sword', shield: 'practice_shield', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' };
    const f = fight(X, { L: 50, roles: ['tank', 'healer'], bar: NO_CHALLENGE, spanMs: 8 * MINUTE, equipment: (role) => (role === 'tank' ? STEEL : { weapon: 'oak_staff' }) }), hask = bossUnit(f);
    const kind = holds[0] ? holds[0].adds[0].monster : '', built = holds[0] ? holds[0].spawns.filter((s) => s.monster === kind).length : 0;
    const came = idsOf(f, kind).slice(built, built + wave);
    if (came.length !== wave) bad.push('GB-LINES CONTROL: ' + came.length + ' adds came to the pair');
    for (const u of came) {
      const first = f.ev.find((e) => (e.type === 'dmg' || e.type === 'miss') && e.u === u);
      if (!first) bad.push('GB-LINES CONTROL: an add never swung');
      else if (f.kinds[first.t] === 'tank') bad.push('GB-LINES an add went for the tank holding him');
    }
    let on = false, before = 0, after = 0;
    for (const e of f.ev) {
      if (e.type === 'boss_phase' && e.u === hask && e.phase === 'enrage') on = true;
      if (e.type === 'dmg' && e.u === hask) { if (on) after = Math.max(after, e.amount); else before = Math.max(before, e.amount); }
    }
    const plain = X.C.monsterMaxHit({ ...EM[BOSS], atk: 10 });
    if (!before || before > plain) bad.push('GB-RAGE before the line his largest blow was ' + before + ', his row\'s is ' + plain);
    if (!(after > plain)) bad.push('GB-RAGE in the enrage his largest blow was ' + after + ', his row\'s plain one is ' + plain);
  }

  /* GB-RESET, played: his wave can't hurt, he can't hurt until his enrage, and then he fells the tank holding him at once. The Healer plays on. */
  setRow(X, BOSS, { hp: 900, atk: 1, baseAcc: 0, phases: { ...EM[BOSS].phases, enrageAtkPm: 1000000 } });
  if (holds[0]) setRow(X, holds[0].adds[0].monster, { atk: 1, baseAcc: 0 });
  {
    const ways = CUTS.map((cut) => fight(X, { cut, roles: ['tank', 'healer'], spanMs: 5 * MINUTE }));
    for (const f of ways) if (keyOf(f) !== keyOf(ways[0])) bad.push('GB-RESET the cuts disagree: the ' + (f === ways[1] ? '30 s' : '10 min') + ' cut moves an event');
    const f = ways[0], hask = bossUnit(f), kind = holds[0] ? holds[0].adds[0].monster : '';
    const said = f.ev.filter((e) => e.type === 'boss_phase' && e.u === hask);
    const reset = f.ev.find((e) => e.type === 'pack_reset' && said.length > 1 && e.atMs >= said[1].atMs);
    if (said.map((e) => e.phase).join() !== 'adds,enrage,adds,enrage' || !reset) bad.push('GB-RESET his lines fell as ' + (said.map((e) => e.phase).join() || 'nothing') + (reset ? '' : ', with no reset') + ', want adds and enrage, a reset, then both again');
    else {
      const built = holds[0].spawns.filter((s) => s.monster === kind).length, ids = idsOf(f, kind);
      const first = ids.slice(built, built + wave), second = ids.slice(built + wave);
      if (first.length !== wave || second.length !== wave) bad.push('GB-RESET the waves were ' + first.length + ' and ' + second.length + ', his wave is ' + wave);
      for (const u of second) if (!(firstAt(f, u) >= said[2].atMs)) bad.push('GB-RESET a second-wave add acted before the line of his second try');
      const stayed = f.ev.filter((e) => e.atMs > reset.atMs && (first.includes(e.u) || first.includes(e.t)));
      if (stayed.length) bad.push('GB-RESET the first wave stayed through the reset: ' + stayed.length + ' events name it after, the first ' + stayed[0].type);
      const healed = f.ev.filter((e) => e.type === 'dmg' && e.t === hask && e.atMs > reset.atMs && e.atMs <= said[2].atMs).reduce((n, e) => n + e.amount, 0);
      if (!(healed * 2 >= EM[BOSS].hp)) bad.push('GB-RESET the second wave came ' + healed + ' damage after the reset: he was not healed');
    }
  }

  /* GB-RESET, through resetPack itself. */
  {
    const sc = { atMs: 0, emit() {} };
    const unit = (o) => ({ side: 'mon', alive: true, target: null, path: [], goal: null, ...o });
    const inst = (ground, units, p) => ({ ground, world: { units, packs: ground.pockets.map((_, i) => ({ aggro: i === p, holder: i === p ? 1 : null })) } });
    const gp = holds[0] ? at : 0, h = holds[0] || g.pockets[0], tile = [h.spawns[0].x, h.spawns[0].y];
    const units = [{ id: 1, side: 'hero', alive: true, target: 4 },
      unit({ id: 2, kind: BOSS, pocket: gp, hp: 100, maxHp: 1556, home: tile }), unit({ id: 3, kind: 'muster_knight', pocket: gp, hp: 50, maxHp: 440, home: tile }),
      unit({ id: 4, kind: 'muster_knight', pocket: gp, hp: 50, maxHp: 440, home: null }), unit({ id: 5, kind: 'muster_knight', pocket: gp, hp: 440, maxHp: 440, home: null })];
    const a = inst(g, units, gp);
    X.LE.resetPack(a, gp, sc);
    const ids = a.world.units.map((u) => u.id).join();
    if (ids !== '1,2,3') bad.push('GB-RESET after a reset the world holds units ' + ids + ', want the hero, him and his own Knight');
    if ((a.world.units.find((u) => u.id === 2) || {}).hp !== 1556 || (a.world.units.find((u) => u.id === 3) || {}).hp !== 440) bad.push('GB-RESET the reset healed nobody');
    if (a.world.units[0].target !== null) bad.push('GB-RESET a hero still aims at an add that left');
    /* a pocket with no wave: a monster built with no home is healed and stays */
    const other = g.pockets.findIndex((p) => !(p.adds || []).length);
    const b = inst(g, [unit({ id: 7, kind: 'barrow_pikeman', pocket: other, hp: 1, maxHp: 191, home: null })], other);
    X.LE.resetPack(b, other, sc);
    if (b.world.units.length !== 1 || b.world.units[0].hp !== 191) bad.push('GB-RESET a homeless monster of a pocket with no wave was sent away');
    /* a called room never resets: his wave stands and he stays hurt */
    const room = Object.values(X.EG.CALLED_GROUNDS).find((r) => r.pockets.some((p) => (p.adds || []).length));
    const rp = room.pockets[0];
    const c = inst(room, [unit({ id: 2, kind: rp.spawns[0].monster, pocket: 0, hp: 10, maxHp: 2000, home: [rp.spawns[0].x, rp.spawns[0].y] }),
      unit({ id: 4, kind: rp.adds[0].monster, pocket: 0, hp: 300, maxHp: 300, home: null })], 0);
    X.LE.resetPack(c, 0, sc);
    if (c.world.units.length !== 2 || c.world.units[0].hp !== 10) bad.push('GB-RESET a called room reset');
  }
  return bad;
}

async function restoring(root, fn) {
  const X = await loadAll(root);
  const ids = [BOSS, 'muster_knight', 'barrow_pikeman'];
  const keep = ids.map((id) => [id, { ...X.EM[id] }]);
  try { return await fn(X); } finally {
    for (const [id, row] of keep) { Object.assign(X.EM[id], row); Object.assign(X.play.MONSTERS[id], row); }
  }
}

const PHASES = '      phases: { addsPm: 500, enragePm: 250, enrageAtkPm: 1150 } },';
const MUTANTS = [
  /* THE LINES (the brief: a mutant that removes a phase is caught) */
  { name: 'Hask loses his lines', edits: [['src/data/grounds/muster_barrows/pack.js', 'formula: true,\n' + PHASES, 'formula: true },']], want: /GB-ROW|GB-LINES/ },
  { name: 'the enrage line is gone', edits: [['src/core/hunt/boss-phases.js', "  if (crossed(ph.enragePm)) sc.emit(makeEvent('boss_phase', sc.atMs, { u: t.id, phase: 'enrage' }));\n", '']], want: /GB-LINES/ },
  { name: 'the wave never comes', edits: [['src/core/hunt/boss-phases.js', 'spawnAdds(inst, t.pocket, sc);', '']], want: /GB-LINES/ },
  { name: 'the lines play in a called room only', edits: [['src/core/hunt/boss-phases.js', 'if (!ph || t.hp <= 0) return;', 'if (!ph || t.hp <= 0 || !inst.ground.call) return;']], want: /GB-LINES/ },
  { name: 'the first line is read at the wrong HP', edits: [['src/core/hunt/boss-phases.js', 'if (crossed(ph.addsPm)) {', 'if (crossed(ph.addsPm - 300)) {']], want: /GB-LINES/ },
  { name: 'the enrage raises nothing', edits: [['src/core/hunt/damage.js', 'const blowRow = swingRow(u, row);', 'const blowRow = row;']], want: /GB-RAGE/ },
  { name: 'his wave goes for the one holding him', edits: [['src/core/hunt/pull-cycle.js', 'const on = off.length ? off : standing;', 'const on = standing;']], want: /GB-LINES/ },
  /* THE RESET */
  { name: 'the reset leaves his wave standing', edits: [['src/core/hunt/leash.js', '    if (isAdd(inst, u)) { u.alive = false; u.hp = 0; u.goal = null; gone.add(u.id); continue; }\n', '']], want: /GB-RESET/ },
  { name: 'an add has a home to walk to', edits: [['src/core/hunt/pull-cycle.js', 'home: add ? null : at,', 'home: at,']], want: /GB-RESET/ },
  { name: 'any homeless monster reads as an add', edits: [['src/core/hunt/leash.js', "return u.side === 'mon' && !u.home && !!p && Array.isArray(p.adds) && p.adds.length > 0;", "return u.side === 'mon' && !u.home;"]], want: /GB-RESET/ },
  { name: 'a hero still aims at an add that left', edits: [['src/core/hunt/leash.js', '    for (const u of inst.world.units) if (gone.has(u.target)) u.target = null;\n', '']], want: /GB-RESET/ },
  { name: 'a called room resets', edits: [['src/core/hunt/leash.js', 'if (!pack || (inst.ground && inst.ground.call)) return;', 'if (!pack) return;']], want: /GB-RESET/ },
  /* THE DATA'S DOORS */
  { name: 'a wave validates with no boss to call it', edits: [['src/data/hunt-grounds.js', "    if (!(p.pack || p.spawns || []).concat(p.spawns || []).some(ph)) bad('pocket ' + i + ' has adds and no boss with phases to call them');\n", '']], want: /GB-ROW/ },
  { name: 'the generator refuses a ground boss with lines', edits: [['tools/gen-hunt-sessions.mjs', '    if (m.boss !== true || m.add === true) throw new Error(`monster ${id} has phases and is no boss`);', '    if (m.called !== true) throw new Error(`monster ${id} has phases and is no called row`);']], want: /GB-ROW/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) {
      const bad = await restoring(REPO, guard);
      console.log('ground-boss --mutate: control ran the clean tree: ' + (bad.length ? bad.join('; ') : 'green'));
      process.exit(0);
    }
    let escaped = 0;
    for (const m of MUTANTS) {
      const { root, done } = plant(m.edits, TREES);
      let got = [];
      try { got = await restoring(root, guard); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 160)]; }
      finally { done(); }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got.find((p) => m.want.test(p)) || got[0] || 'every check held').slice(0, 120));
    }
    console.log(escaped ? 'ground-boss --mutate: ' + escaped + ' ESCAPED' : 'ground-boss --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exit(escaped ? 1 : 0);
  }
  const bad = await restoring(REPO, guard);
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? 'ground-boss: ' + bad.length + ' FAILED' : 'ground-boss: green (his lines, his wave, his reset, every cut)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
