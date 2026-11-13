#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/combat-training.mjs — THE TRAINING GROUND ON THE ONE ENGINE (Tyler 2026-11-08; src/data/training.js, src/core/hunt/training.js).
// The engine's half, no database: data and the real settle (accrual.js accrueHunt). tests/combat-training-db.mjs holds the server's
// half (the verbs, the one door, the hourly charge, both doors to the end); tools/balance-sim/yard-table.mjs the 0.40x pace gate.
//
//   node tests/combat-training.mjs            the guard
//   node tests/combat-training.mjs --mutate   every planted defect must turn it red
//
// mutant-anchors: src/core/hunt/training.js src/core/hunt-rewards.js src/core/combat-sim.js src/core/hunt/damage.js src/data/monsters.js src/data/training.js src/data/bestiary.js
//
//   CT-ROW     the dummy pays nothing (xp 0, gp [0, 0], no drop), has no class, never walks, is no Bestiary entry and passes the roster audit;
//              the eight training grounds (yard and house x four skills) hold one seat, one pocket and the dummy alone, stand in no ground
//              list, and are reached by hunt; the fee is the designer's table (skill 1: 56, 20: 170, 37: 272, 56: 386, 99: 644)
//   CT-PAY     every skill's yard, on the real settle: its own skill's XP and nothing else, no Level XP, coin, item or kill, no fall, the
//              hero's HP never under the floor at any window's end
//   CT-SHARE   the door's arithmetic on one swing's events: a blow, a hit taken (read at the hero's own Level), a block, a dodge, a tick,
//              a cast, kill XP, a death: each pays the trained skill at its share, or nothing
//   CT-DUMMY   damage.js: a blow that empties the dummy finds it whole and no kill; its blow at a hero on the floor lands nothing; any
//              other monster is untouched
//   CT-STAMINA a training window proposes no stamina and never ends `stamina`, on an empty pool too; a hunting ground still drains
//   CT-STOP    the yard's edge (trainingStopMs): its next unpaid hour, never past the longest session, never on the house dummy or a
//              hunting ground, never a stop the window already stands on
//   CT-CUT     one long window and many short ones walk the same swings: the same XP and the same world, viewed or not (TICK-1)
//   CT-PICK    a hero's tier pick never spawns a second dummy
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
const MINUTE = 60000;
const SKILLS = Object.freeze([['melee', 'melee_dps'], ['ranged', 'ranger'], ['magic', 'mage'], ['defense', 'tank']]);

async function loadAll(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return { root, play: await loadPlay(root),
    T: await import(u('src/data/training.js')),
    G: await import(u('src/data/hunt-grounds.js')),
    H: await import(u('src/data/hunts.js')),
    M: await import(u('src/data/monsters.js')),
    MC: await import(u('src/data/monster-classes.js')),
    BE: await import(u('src/data/bestiary.js')),
    /* the engine's own instances (src/core imports with ?v=) */
    ET: await import(u('src/data/training.js') + V),
    EM: (await import(u('src/data/monsters.js') + V)).MONSTERS,
    D: await import(u('src/core/hunt/damage.js') + V),
    TR: await import(u('src/core/hunt/training.js') + V),
    CX: await import(u('src/data/core-model.js') + V),
    XS: await import(u('src/core/hunt/xp-share.js') + V),
    HT: await import(u('src/core/hunt-track.js') + V),
  };
}

/* One yard run on the real settle: `skill` trained by a hero of `role` at Level L, cut into `windowMs` windows. */
function yard(X, skill, role, o = {}) {
  const id = X.T.trainingHuntId(o.place || 'yard', skill);
  const windows = [];
  const res = X.play.run(id, o.L || 20, [role], { ground: X.G.TRAINING_GROUNDS[id], spanMs: o.spanMs || 20 * MINUTE, windowMs: o.windowMs || 60000,
    ...(o.session ? { session: o.session } : {}), ...(Number.isInteger(o.density) ? { density: o.density } : {}), onWindow: (w) => windows.push(w) });
  return { res, windows, members: windows.flatMap((w) => w.members) };
}

async function guard(X) {
  const bad = [];
  const { T, G, H, M, MC, BE } = X;
  const pm = (k) => T.TRAINING_RULES.xpPermille[k] / 1000;

  /* CT-ROW */
  const dummies = Object.entries(M.MONSTERS).filter(([, m]) => m.dummy === true);
  if (dummies.length !== 1) bad.push('CT-ROW ' + dummies.length + ' dummy rows, want exactly one');
  const [dId, d] = dummies[0] || [null, {}];
  if (!(d.xp === 0 && Array.isArray(d.gp) && d.gp[0] === 0 && d.gp[1] === 0 && Array.isArray(d.drops) && d.drops.length === 0 && d.dropBonus === undefined)) bad.push('CT-ROW the dummy pays: ' + JSON.stringify({ xp: d.xp, gp: d.gp, drops: d.drops }));
  if (d.cls || d.weaponWeak || (d.weaponResist && d.weaponResist.length) || (d.elements && Object.keys(d.elements).length)) bad.push('CT-ROW the dummy has a class or a weak spot: ' + JSON.stringify({ cls: d.cls, weak: d.weaponWeak }));
  if (M.monsterSpeedOf(d) !== 0) bad.push('CT-ROW the dummy walks at ' + M.monsterSpeedOf(d));
  if (BE.buildBestiary(M.MONSTERS)[dId]) bad.push('CT-ROW the Bestiary lists the dummy');
  const audit = MC.auditRoster(M.MONSTERS).filter((p) => p.startsWith(String(dId)));
  if (audit.length) bad.push('CT-ROW the roster audit says ' + audit.join('; '));
  const want = Object.keys(T.TRAINING_PLACES).flatMap((p) => T.TRAINING_SKILLS.map((s) => T.trainingHuntId(p, s)));
  if (JSON.stringify(Object.keys(G.TRAINING_GROUNDS).sort()) !== JSON.stringify([...want].sort())) bad.push('CT-ROW the training grounds are ' + Object.keys(G.TRAINING_GROUNDS).join(','));
  for (const id of want) {
    const g = G.TRAINING_GROUNDS[id];
    const t = T.trainingOf(id);
    if (!g || !t || !g.train || g.train.place !== t.place || g.train.skill !== t.skill) { bad.push('CT-ROW ' + id + ' does not train what its id says'); continue; }
    const mons = g.pockets.flatMap((p) => (p.pack || []).concat(p.spawns, p.adds || [])).map((s) => s.monster);
    if (g.start.length !== 1 || g.pockets.length !== 1 || mons.length !== 1 || mons[0] !== dId) bad.push('CT-ROW ' + id + ' is not one seat, one pocket and the dummy alone');
    if (G.groundOfHunt(id) !== g || !H.HUNT_INDEX[id] || H.HUNTS.some((h) => h.id === id) || G.HUNT_GROUNDS[id] || G.OPEN_GROUNDS[id]) bad.push('CT-ROW ' + id + ' is listed with the hunting grounds, or unreachable by hunt');
  }
  if (G.validate().length) bad.push('CT-ROW the ground table: ' + G.validate().slice(0, 2).join('; '));
  for (const g of Object.values(G.HUNT_GROUNDS)) if (g.pockets.some((p) => (p.pack || []).concat(p.spawns).some((s) => s.monster === dId))) bad.push('CT-ROW the hunting ground ' + g.id + ' fields the dummy');
  const fees = [[1, 56], [20, 170], [37, 272], [56, 386], [99, 644]].filter(([lv, f]) => T.trainingFee(lv) !== f);
  if (fees.length) bad.push('CT-ROW the fee table moved: ' + fees.map(([lv, f]) => 'skill ' + lv + ' ' + T.trainingFee(lv) + ' (want ' + f + ')').join(', '));

  /* CT-PAY: each skill's yard pays that skill alone */
  const floorPm = T.TRAINING_RULES.hpFloorPm;
  for (const [skill, role] of SKILLS) {
    const { res, members } = yard(X, skill, role);
    const xp = res.heroXp[role + '0'] || {};
    if (!(xp[skill] > 0)) bad.push('CT-PAY the ' + skill + ' yard paid no ' + skill + ': ' + JSON.stringify(xp));
    for (const k of Object.keys(xp)) if (k !== skill && xp[k] > 0) bad.push('CT-PAY the ' + skill + ' yard paid ' + k + ' ' + xp[k]);
    if (res.levelXp || res.coin || Object.keys(res.items).length || res.kills || res.falls) bad.push('CT-PAY the ' + skill + ' yard paid ' + JSON.stringify({ levelXp: res.levelXp, coin: res.coin, items: res.items, kills: res.kills, falls: res.falls }));
    for (const p of members) {
      if (p.delta.level_xp || p.delta.gold || p.delta.items || p.delta.hearthfind || p.delta.deaths || (p.delta.progress && p.delta.progress.length)) bad.push('CT-PAY a ' + skill + ' window carries ' + JSON.stringify(Object.keys(p.delta)));
      if (p.delta.journal.meta.kills !== 0 || p.delta.journal.meta.km) bad.push('CT-PAY a ' + skill + ' window journals kills');
      if (!Number.isFinite(p.maxHp)) bad.push('CT-PAY harness: a window carries no maxHp');
      else if (p.delta.hp < Math.ceil(p.maxHp * floorPm / 1000) && !p.hunt.ended) bad.push('CT-PAY the ' + skill + ' hero stood at ' + p.delta.hp + ' of ' + p.maxHp + ', under the floor');
    }
  }

  /* CT-SHARE: the door on one swing's events */
  {
    const got = {};
    const mk = (key, o) => ({ ...o, fx: { addXp: (k, n) => { got[key] = got[key] || {}; got[key][k] = (got[key][k] || 0) + n; }, addLevelXp: () => { got[key] = got[key] || {}; got[key].level = 1; } } });
    const sword = mk('sword', { family: 'sword', armoured: true, shield: true });
    const bow = mk('bow', { family: 'ranged', armoured: true, shield: false });
    const units = { 1: { id: 1, side: 'hero', heroLv: 30 }, 2: { id: 2, side: 'hero', heroLv: 30 }, 9: { id: 9, side: 'mon', kind: dId } };
    const unitOf = (id) => units[id] || null;
    const run = (skill, members, events) => { for (const k of Object.keys(got)) delete got[k]; return X.TR.trainingSwing(members, events, unitOf, { train: { place: 'yard', skill } }); };
    const near = (a, b) => Math.abs((a || 0) - b) < 1e-9;
    const hit = X.CX.COMBAT_XP.hitXpPerDamage, def = X.CX.COMBAT_XP.defenseXpPerLevelPermille / 1000, block = X.CX.COMBAT_XP.blockMult;
    run('melee', new Map([[1, sword], [2, bow]]), [{ type: 'dmg', u: 1, t: 9, amount: 100 }, { type: 'dmg', u: 2, t: 9, amount: 100 }, { type: 'xp', u: 1, amount: 500 }, { type: 'dmg', u: 9, t: 1, amount: 3 }]);
    if (!near(got.sword && got.sword.melee, 100 * hit * pm('melee')) || (got.bow && Object.keys(got.bow).length) || (got.sword && (got.sword.level || got.sword.defense))) bad.push('CT-SHARE a melee swing paid ' + JSON.stringify(got));
    run('ranged', new Map([[1, sword], [2, bow]]), [{ type: 'dmg', u: 1, t: 9, amount: 100 }, { type: 'dmg', u: 2, t: 9, amount: 40 }]);
    if (!near(got.bow && got.bow.ranged, 40 * hit * pm('ranged')) || got.sword) bad.push('CT-SHARE a ranged swing paid ' + JSON.stringify(got));
    run('defense', new Map([[1, sword], [2, bow]]), [{ type: 'dmg', u: 9, t: 1, amount: 3 }, { type: 'miss', u: 9, t: 1 }, { type: 'miss', u: 9, t: 2 }, { type: 'miss', u: 9, t: 2, dodge: true },
      { type: 'dmg', u: 9, t: 2, amount: 1, dot: true }, { type: 'dmg', u: 1, t: 9, amount: 100 }]);
    if (!near(got.sword && got.sword.defense, (30 * def + 30 * def * block) * pm('defense')) || !near(got.bow && got.bow.defense, (30 * def + 30 * def) * pm('defense')) || (got.sword && got.sword.melee)) bad.push('CT-SHARE a defense swing paid ' + JSON.stringify(got));
    run('magic', new Map([[1, sword]]), [{ type: 'cast', u: 1, mana: 20, magicXpMult: 1600 }, { type: 'shot', u: 1, mana: 2, magicXpMult: 1000 }, { type: 'dmg', u: 1, t: 9, amount: 50 }]);
    if (!near(got.sword && got.sword.magic, (X.XS.magicXpFor(20, 1.6) + X.XS.magicXpFor(2, 1)) * pm('magic')) || (got.sword && got.sword.melee)) bad.push('CT-SHARE a magic swing paid ' + JSON.stringify(got));
    const deaths = run('melee', new Map([[1, sword]]), [{ type: 'kill', u: 9, t: 1, atMs: 5 }, { type: 'kill', u: 1, t: 9, atMs: 6 }]);
    if (deaths.length !== 1 || deaths[0].unit !== 1 || deaths[0].monster !== dId || Object.keys(got).length) bad.push('CT-SHARE a kill answered ' + JSON.stringify({ deaths, got }));
  }

  /* CT-DUMMY: damage.js on the dummy and from it */
  {
    const row = X.EM[dId];
    const dummy = { id: 9, side: 'mon', kind: dId, alive: true, hp: 5, maxHp: row.hp, statuses: [] };
    const hero = { id: 1, side: 'hero', alive: true, hp: 60, maxHp: 100, statuses: [] };
    const inst = { world: { units: [hero, dummy], packs: [{}] }, ground: G.TRAINING_GROUNDS.training_yard_melee, heroes: {} };
    const r = X.D.hurt(inst, dummy, 50000, hero, null, null, null);
    if (r.killed || dummy.hp !== dummy.maxHp || r.dmg !== 5) bad.push('CT-DUMMY a blow that empties the dummy answered ' + JSON.stringify({ r, hp: dummy.hp }));
    const atFloor = { id: 1, side: 'hero', alive: true, hp: Math.ceil(100 * floorPm / 1000), maxHp: 100, statuses: [] };
    const r2 = X.D.hurt(inst, atFloor, 50, dummy, null, null, { int: () => 0, next: () => 0, chance: () => false });
    if (r2.dmg !== 0 || atFloor.hp !== Math.ceil(100 * floorPm / 1000)) bad.push('CT-DUMMY the dummy took a hero on the floor to ' + atFloor.hp);
    const rat = { id: 7, side: 'mon', kind: 'rat', alive: true, hp: 5, maxHp: 5, statuses: [] };
    const r3 = X.D.hurt({ ...inst, world: { units: [hero, rat], packs: [{}] } }, rat, 50000, hero, null, null, null);
    if (!r3.killed || rat.hp !== 0) bad.push('CT-DUMMY a rat stood again: ' + JSON.stringify({ r3, hp: rat.hp }));
  }

  /* CT-STAMINA */
  {
    const { members } = yard(X, 'melee', 'melee_dps', { spanMs: 3 * MINUTE, session: { staminaMs: 0 } });
    if (!members.length || members.some((p) => p.hunt.stamina !== null) || members.some((p) => p.hunt.ended && p.hunt.ended.reason === 'stamina')) bad.push('CT-STAMINA a yard window proposed ' + JSON.stringify(members.map((p) => [p.hunt.stamina, p.hunt.ended])).slice(0, 160));
    if (!members.some((p) => p.delta.xp && p.delta.xp.melee > 0)) bad.push('CT-STAMINA an empty pool trained nothing');
    const hunt = X.play.run('mill_cellar', 6, ['tank'], { spanMs: 3 * MINUTE, windowMs: 60000, onWindow: (w) => { for (const p of w.members) if (p.hunt.stamina === null) bad.push('CT-STAMINA a hunting ground stopped proposing stamina'); } });
    if (!hunt) bad.push('CT-STAMINA no hunt ran');
  }

  /* CT-STOP */
  {
    const S = X.TR.trainingStopMs, H0 = 1000000, hr = T.TRAINING_RULES.hourMs, max = T.TRAINING_RULES.maxHours;
    const cases = [
      ['the yard, hour 1', G.TRAINING_GROUNDS.training_yard_melee, { hunt_from_ms: H0, hours_limit: 1 }, H0, H0 + hr],
      ['the yard, hour 5', G.TRAINING_GROUNDS.training_yard_magic, { hunt_from_ms: H0, hours_limit: 5 }, H0 + 4 * hr, H0 + 5 * hr],
      ['the yard, its last hour', G.TRAINING_GROUNDS.training_yard_melee, { hunt_from_ms: H0, hours_limit: max }, H0, Infinity],
      ['a stop the window stands on', G.TRAINING_GROUNDS.training_yard_melee, { hunt_from_ms: H0, hours_limit: 1 }, H0 + hr, Infinity],
      ['the house', G.TRAINING_GROUNDS.training_house_melee, { hunt_from_ms: H0, hours_limit: max }, H0, Infinity],
      ['a hunting ground', G.HUNT_GROUNDS.mill_cellar, { hunt_from_ms: H0, hours_limit: 1 }, H0, Infinity],
    ];
    for (const [name, g, s, from, want] of cases) if (S(g, s, from) !== want) bad.push('CT-STOP ' + name + ': ' + S(g, s, from) + ', want ' + want);
  }

  /* CT-CUT: one long window and many short ones (the tick's and a viewer's) walk the same swings */
  {
    const a = yard(X, 'melee', 'melee_dps', { spanMs: 6 * MINUTE, windowMs: 6 * MINUTE });
    const b = yard(X, 'melee', 'melee_dps', { spanMs: 6 * MINUTE, windowMs: 10000 });
    const xa = a.res.heroXp.melee_dps0 || {}, xb = b.res.heroXp.melee_dps0 || {};
    const wa = X.HT.worldHash(a.windows[a.windows.length - 1].world), wb = X.HT.worldHash(b.windows[b.windows.length - 1].world);
    if (JSON.stringify(a.res.members) !== JSON.stringify(b.res.members) || wa !== wb) bad.push('CT-CUT one window ' + JSON.stringify(xa) + ' ' + wa + ' vs many ' + JSON.stringify(xb) + ' ' + wb);
  }

  /* CT-PICK: a tier pick never spawns a second dummy */
  {
    const { windows } = yard(X, 'melee', 'melee_dps', { spanMs: 2 * MINUTE, density: 8 });
    const mons = new Set();
    for (const w of windows) for (const e of w.events || []) if (e && e.type === 'dmg' && typeof e.t === 'number') mons.add(e.t);
    const last = windows[windows.length - 1];
    const standing = last && last.world ? JSON.parse(last.world).u.filter((u) => u.includes(dId)).length : 0;
    if (standing !== 1) bad.push('CT-PICK a pick of 8 stood ' + standing + ' dummies');
  }
  return bad;
}

const MUTANTS = [
  { name: 'the engine has no door: a training swing pays like a hunt\'s', edits: [['src/core/hunt-rewards.js', '  if (ctx.train) return trainingSwing(members, events, unitOf, ctx);\n', '']], want: /CT-PAY/ },
  { name: 'the sim forgets to hand the rewards the ground', edits: [['src/core/combat-sim.js', '...(train ? { train } : {}), emit:', 'emit:']], want: /CT-PAY/ },
  { name: 'the dummy falls', edits: [['src/core/hunt/damage.js', "  if (target.side === 'mon') dummyStands(rowOf(inst, target.kind), target);\n", '']], want: /CT-DUMMY/ },
  { name: 'the dummy\'s blow has no floor', edits: [['src/core/hunt/damage.js', "dummyBlow(source && source.side === 'mon' ? rowOf(inst, source.kind) : null, target, Math.min(target.hp, n - absorbed))", 'Math.min(target.hp, n - absorbed)']], want: /CT-DUMMY/ },
  { name: 'a training session drains stamina', edits: [['src/core/combat-sim.js', '  if (train) for (const m of members) m.hs.staminaMs = null;\n', '']], want: /CT-STAMINA/ },
  { name: 'the share is the whole', edits: [['src/data/training.js', 'xpPermille: Object.freeze({ melee: 215,', 'xpPermille: Object.freeze({ melee: 1000,'], ['src/core/hunt/training.js', "const pm = (Number(TRAINING_RULES.xpPermille[skill]) || 0) / 1000;", 'const pm = 1;']], want: /CT-SHARE/ },
  { name: 'Defense reads the dummy\'s level', edits: [['src/core/hunt/training.js', 'const lv = heroUnit && Number.isInteger(heroUnit.heroLv) && heroUnit.heroLv > 0 ? heroUnit.heroLv : 1;', 'const lv = 1;']], want: /CT-SHARE/ },
  { name: 'any weapon trains the skill', edits: [['src/core/hunt/training.js', ' && FAMILY_SKILL[m.family] === skill) {', ') {']], want: /CT-SHARE|CT-PAY/ },
  { name: 'a hit taken trains any skill', edits: [['src/core/hunt/training.js', "        if (skill === 'defense' && ev.dot !== true) pay(", "        if (ev.dot !== true) pay("]], want: /CT-SHARE|CT-PAY/ },
  { name: 'a pick fills the yard', edits: [['src/core/combat-sim.js', 'const pickOf = (ms) => (train || play.normalOf(tierPick(ms)) ? 0 : picker(ms));', 'const pickOf = (ms) => (play.normalOf(tierPick(ms)) ? 0 : picker(ms));']], want: /CT-PICK/ },
  { name: 'the dummy walks', edits: [['src/data/monsters.js', '  if (row && row.dummy === true) return 0;   // a training', '  // a training']], want: /CT-ROW/ },
  { name: 'the Bestiary counts the dummy', edits: [['src/data/bestiary.js', '    if (m.dummy === true) continue;\n', '']], want: /CT-ROW/ },
  { name: 'the yard stops past its last hour', edits: [['src/core/hunt/training.js', ' || hours >= TRAINING_RULES.maxHours', '']], want: /CT-STOP/ },
  { name: 'the yard never stops', edits: [['src/core/hunt/training.js', '  return stop > Math.floor(Number(fromMs)) ? stop : Infinity;', '  return Infinity;']], want: /CT-STOP/ },
  { name: 'coin planted on the dummy', edits: [['src/data/monsters.js', 'hp: 1000, atk: 2, baseAcc: 0.5, def: 0, xp: 0, gp: [0, 0], drops: [] },', 'hp: 1000, atk: 2, baseAcc: 0.5, def: 0, xp: 0, gp: [1, 5], drops: [] },']], want: /CT-ROW/ },
  { name: 'the fee table moves', edits: [['src/data/training.js', '  feePerLevel: 6,', '  feePerLevel: 5,']], want: /CT-ROW/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) {
      const bad = await guard(await loadAll(REPO));
      console.log('combat-training --mutate: control ran the clean tree: ' + (bad.length ? bad.join('; ') : 'green'));
      process.exit(0);
    }
    let escaped = 0;
    for (const m of MUTANTS) {
      const { root, done } = plant(m.edits, PLAY_TREES);
      let got = [];
      try { got = await guard(await loadAll(root)); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 160)]; }
      finally { done(); }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every check held').slice(0, 120));
    }
    console.log(escaped ? 'combat-training --mutate: ' + escaped + ' ESCAPED' : 'combat-training --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exit(escaped ? 1 : 0);
  }
  const bad = await guard(await loadAll(REPO));
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? 'combat-training: ' + bad.length + ' FAILED' : 'combat-training: green (the dummy, the eight grounds, the pay, the floor, no stamina, the hour\'s edge, every cut)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
