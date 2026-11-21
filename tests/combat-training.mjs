#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/combat-training.mjs — THE TRAINING GROUND ON THE ONE ENGINE (Tyler 2026-11-08, 2026-11-14; src/data/training.js, src/core/hunt/training.js).
// The engine's half, no database: data and the real settle (accrual.js accrueHunt). tests/combat-training-db.mjs and
// tests/training-gear-db.mjs hold the server's half (the verbs, the one door, the hourly charge, the items, both doors to the end);
// tools/balance-sim/yard-table.mjs the fixed-rate gate on every skill at every point.
//
//   node tests/combat-training.mjs            the guard
//   node tests/combat-training.mjs --mutate   every planted defect must turn it red
//
// mutant-anchors: src/core/hunt/training.js src/core/hunt-rewards.js src/core/combat-sim.js src/core/hunt/damage.js src/core/hunt/abilities.js src/data/monsters.js src/data/training.js src/data/bestiary.js
//
//   CT-ROW     the dummy pays nothing (xp 0, gp [0, 0], no drop), has no class, never walks, is no Bestiary entry and passes the roster audit;
//              the eight training grounds (yard and house x four skills) hold one seat, one pocket and the dummy alone, stand in no ground
//              list, and are reached by hunt; the fee is the designer's table (skill 1: 56, 20: 170, 37: 272, 56: 386, 99: 644)
//   CT-PAY     THE FIXED RATE (Tyler 2026-11-14): every skill's yard on the real settle, with the server's xp carry, at Level 10, 30 and 56:
//              one settled hour pays EXACTLY 30,000 of that skill and nothing else, no Level XP, coin, item or kill; the hero never under
//              the floor
//   CT-BOOST   an item's hours pay 200% for exactly the time they cover and only on the trained skill: an hour of item time pays 60,000,
//              half an hour 45,000, and the windows' claims (journal boost_ms) add up to the time spent
//   CT-TICK    the door's arithmetic: any run of intervals pays the floor of its exact sum (no tick floors its own slice), the swing pays
//              nothing by any blow, cast or hit, and a death is answered
//   CT-FREE    the yard spends no supply: no store bill, no own use, the bar shut (a Ranger with store arrows loaded, every skill's hero
//              taken to its floor by the dummy: no food bought)
//   CT-NOBLOW  (Tyler 2026-11-16: a yard session ended "10 minutes without landing a blow") a bow with nothing loaded and an empty bag
//              shoots the dummy past the no-fight span at the Ranged and Magic yards, browser closed (the tick's 10-minute cut) and
//              viewed (10 s settles): no end, the exact rate paid; and a quiet stretch longer than the span ends no training session
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
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(REPO, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const V = sourceQuery(REPO);
const MINUTE = 60000;
const HOUR = 3600000;
const SKILLS = Object.freeze([['melee', 'melee_dps'], ['ranged', 'ranger'], ['magic', 'mage'], ['defense', 'tank']]);
const POINTS = Object.freeze([10, 30, 56]);

async function loadAll(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return { root, play: await loadPlay(root),
    T: await import(u('src/data/training.js')),
    G: await import(u('src/data/hunt-grounds.js')),
    S: await import(u('src/data/hunt-sessions.js')),
    H: await import(u('src/data/hunts.js')),
    M: await import(u('src/data/monsters.js')),
    MC: await import(u('src/data/monster-classes.js')),
    BE: await import(u('src/data/bestiary.js')),
    /* the engine's own instances (src/core imports with ?v=) */
    ET: await import(u('src/data/training.js') + V),
    EM: (await import(u('src/data/monsters.js') + V)).MONSTERS,
    D: await import(u('src/core/hunt/damage.js') + V),
    TR: await import(u('src/core/hunt/training.js') + V),
    HT: await import(u('src/core/hunt-track.js') + V),
  };
}

/* One yard run on the real settle with the server's xp carry: `skill` trained by a hero of `role` at Level L, cut into `windowMs` windows. */
function yard(X, skill, role, o = {}) {
  const id = X.T.trainingHuntId(o.place || 'yard', skill);
  const windows = [];
  const res = X.play.run(id, o.L || 20, [role], { ground: X.G.TRAINING_GROUNDS[id], spanMs: o.spanMs || 20 * MINUTE, windowMs: o.windowMs || 60000, xpFrac: true,
    ...(o.session ? { session: o.session } : {}), ...(o.bag ? { bag: o.bag } : {}), ...(o.equipment ? { equipment: o.equipment } : {}),
    ...(Number.isInteger(o.density) ? { density: o.density } : {}),
    onWindow: (w, mems) => { windows.push(w); if (o.onWindow) o.onWindow(w, mems); } });
  return { res, windows, members: windows.flatMap((w) => w.members) };
}

async function guard(X) {
  const bad = [];
  const { T, G, H, M, MC, BE } = X;
  const rate = T.TRAINING_RULES.xpPerHour, item = T.trainingXpPerHour(true);

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
  if (rate !== 30000 || item !== 60000 || T.TRAINING_RULES.minLevel !== 10) bad.push('CT-ROW the rate is ' + rate + ' an hour, the item\'s ' + item + ', from Level ' + T.TRAINING_RULES.minLevel + ' (Tyler 2026-11-14: 30,000, 60,000, Level 10)');

  /* CT-PAY: each skill's yard pays exactly the rate an hour, that skill alone, at every point */
  const floorPm = T.TRAINING_RULES.hpFloorPm;
  for (const [skill, role] of SKILLS) {
    for (const L of POINTS) {
      const { res, members } = yard(X, skill, role, { L, spanMs: HOUR, windowMs: 10 * MINUTE });
      const xp = res.heroXp[X.play.memberKey(role, 0)] || {};
      if (xp[skill] !== rate || res.playedMs !== HOUR) bad.push(`CT-PAY the ${skill} yard at Level ${L} paid ${xp[skill]} ${skill} in ${res.playedMs} ms (want exactly ${rate} an hour)`);
      for (const k of Object.keys(xp)) if (k !== skill && xp[k] > 0) bad.push('CT-PAY the ' + skill + ' yard paid ' + k + ' ' + xp[k]);
      if (res.levelXp || res.coin || Object.keys(res.items).length || res.kills || res.falls) bad.push('CT-PAY the ' + skill + ' yard paid ' + JSON.stringify({ levelXp: res.levelXp, coin: res.coin, items: res.items, kills: res.kills, falls: res.falls }));
      for (const p of members) {
        if (p.delta.level_xp || p.delta.gold || p.delta.items || p.delta.hearthfind || p.delta.deaths || (p.delta.progress && p.delta.progress.length)) bad.push('CT-PAY a ' + skill + ' window carries ' + JSON.stringify(Object.keys(p.delta)));
        if (p.delta.journal.meta.kills !== 0 || p.delta.journal.meta.km || p.delta.journal.meta.boost_ms) bad.push('CT-PAY a ' + skill + ' window journals kills or item time');
        if (!Number.isFinite(p.maxHp)) bad.push('CT-PAY harness: a window carries no maxHp');
        else if (p.delta.hp < Math.ceil(p.maxHp * floorPm / 1000) && !p.hunt.ended) bad.push('CT-PAY the ' + skill + ' hero stood at ' + p.delta.hp + ' of ' + p.maxHp + ', under the floor');
      }
    }
  }

  /* CT-BOOST: the item's hours pay 200% for the time they cover, on the trained skill only */
  for (const [skill, role] of [['melee', 'melee_dps'], ['magic', 'mage']]) {
    /* half an hour and thirty seconds: the item time runs out inside a window (2-minute cuts), not on its edge */
    for (const [boost, want] of [[HOUR, item], [HOUR / 2 + 30000, rate + (item - rate) * (HOUR / 2 + 30000) / HOUR], [0, rate]]) {
      const { res, members } = yard(X, skill, role, { L: 30, spanMs: HOUR, windowMs: 2 * MINUTE, session: { trainBoostMs: boost } });
      const xp = res.heroXp[X.play.memberKey(role, 0)] || {};
      const claimed = members.reduce((n, p) => n + (p.delta.journal.meta.boost_ms || 0), 0);
      if (xp[skill] !== want || claimed !== boost || Object.keys(xp).some((k) => k !== skill && xp[k] > 0)) bad.push(`CT-BOOST ${skill} with ${boost} ms of item time paid ${JSON.stringify(xp)} and claimed ${claimed} ms (want ${want}, ${boost})`);
    }
  }

  /* CT-TICK: the door's arithmetic, on a member stub */
  {
    const got = {};
    const mk = (boostMs) => ({ hs: { swingIndex: 0, trainBoostMs: boostMs, tally: { boostMs: 0 } }, fx: { addFixedXp: (k, n) => { got[k] = (got[k] || 0) + n; } } });
    const run = (n, boostMs, tick) => { for (const k of Object.keys(got)) delete got[k]; const m = mk(boostMs); for (let i = 0; i < n; i++) { m.hs.swingIndex += 1; X.TR.trainingTick(m, { place: 'yard', skill: 'ranged' }, tick); } return m; };
    const units = (v) => Math.round((v || 0) * 1e6);
    /* 3 intervals of 100 ms at 30,000 an hour are 2.5 XP exactly; 7 are floor(17.5 / 3 x 1e6) units; a whole hour is 30,000 */
    for (const [n, tick, wantUnits] of [[3, 100, 2500000], [7, 100, Math.floor(7 * 2500000 / 3)], [36000, 100, 30000e6], [1, 2000, Math.floor(30000 * 2000 * 1e6 / HOUR)]]) {
      run(n, 0, tick);
      if (units(got.ranged) !== wantUnits || Object.keys(got).some((k) => k !== 'ranged')) bad.push(`CT-TICK ${n} intervals of ${tick} ms paid ${units(got.ranged)} units (want ${wantUnits})`);
    }
    const m = run(5, 250, 100);
    if (units(got.ranged) !== Math.floor(5 * 2500000 / 3) + Math.floor(2 * 2500000 / 3) || m.hs.trainBoostMs !== 50 || m.hs.tally.boostMs !== 200) bad.push(`CT-TICK 250 ms of item time over five intervals paid ${units(got.ranged)} units, left ${m.hs.trainBoostMs}, claimed ${m.hs.tally.boostMs}`);
    const units9 = { 1: { id: 1, side: 'hero' }, 9: { id: 9, side: 'mon', kind: dId } };
    const deaths = X.TR.trainingSwing(new Map([[1, mk(0)]]), [{ type: 'dmg', u: 1, t: 9, amount: 100 }, { type: 'cast', u: 1, mana: 20, magicXpMult: 1600 }, { type: 'dmg', u: 9, t: 1, amount: 3 },
      { type: 'kill', u: 9, t: 1, atMs: 5 }, { type: 'kill', u: 1, t: 9, atMs: 6 }], (id) => units9[id] || null);
    if (deaths.length !== 1 || deaths[0].unit !== 1 || deaths[0].monster !== dId) bad.push('CT-TICK a swing\'s deaths answered ' + JSON.stringify(deaths));
  }

  /* CT-FREE: the yard spends nothing; a Ranger with Iron Arrows loaded (a shot each: five carried, then the store's) shoots for free;
     the dummy's blows buy no food */
  for (const [skill, role] of SKILLS) {
    const o = { L: 30, spanMs: 20 * MINUTE, windowMs: 2 * MINUTE,
      ...(role === 'ranger' ? { bag: () => ({ iron_arrows: { loaded: 5 } }), equipment: (r, i, L) => ({ ...X.play.kitFor(L, r), ammo: 'iron_arrows' }) } : {}) };
    const { res, members } = yard(X, skill, role, o);
    const uses = members.reduce((n, p) => n + Object.values(p.hunt.uses || {}).reduce((a, b) => a + b, 0), 0);
    const buys = members.reduce((n, p) => n + Object.values(p.hunt.buys || {}).reduce((a, b) => a + b, 0), 0);
    if (res.store || uses || buys) bad.push(`CT-FREE the ${skill} yard spent: store ${res.store}, own uses ${uses}, buys ${buys}`);
  }

  /* CT-NOBLOW (Tyler 2026-11-16: a yard session ended "10 minutes without landing a blow"): a bow with nothing loaded and an empty bag
     shoots the dummy for free at the Ranged and the Magic yard, past the no-fight span, cut as the tick cuts it (browser closed) and
     as a viewer's settles do; and a quiet stretch longer than the span (the stored world's last blow an hour before the hunt) ends
     no training session */
  {
    const span = (X.S.NO_FIGHT_END_MIN + 4) * MINUTE, quietMs = X.S.NO_FIGHT_END_MIN * MINUTE;
    const bare = { bag: () => ({}), equipment: (r, i, L) => { const k = { ...X.play.kitFor(L, r) }; delete k.ammo; return k; } };
    /* a window's hero blows on the dummy (the units book names each unit's kind) */
    const onDummy = (w) => (w.events || []).filter((e) => e.type === 'dmg' && w.units && w.units[e.t] && w.units[e.t][0] === dId);
    /* THE QUIET CLOCK (damage.js landHit, the stored world's fightAt): the one integer of the world row equal to the window's last blow
       on a monster, moved an hour before the hunt; true when it was found exactly once */
    const fightAtBack = (w, t0) => {
      const last = Math.max(...onDummy(w).map((e) => e.atMs));
      const o = JSON.parse(w.world);
      const at = o.w.flatMap((v, i) => (v === last ? [i] : []));
      if (at.length !== 1) return false;
      o.w[at[0]] = t0 - HOUR;
      w.world = JSON.stringify(o);
      return true;
    };
    for (const skill of ['ranged', 'magic']) {
      for (const [cut, windowMs] of [['closed', 10 * MINUTE], ['viewed', 10000]]) {
        let late = 0;
        const { res, members } = yard(X, skill, 'ranger', { L: 30, spanMs: span, windowMs, ...bare,
          onWindow: (w, mems) => { late += onDummy(w).filter((e) => e.atMs > mems[0].huntSession.huntFromMs + quietMs).length; } });
        const xp = (res.heroXp[X.play.memberKey('ranger', 0)] || {})[skill];
        const ends = members.filter((p) => p.hunt.ended).map((p) => p.hunt.ended.reason);
        if (ends.length || res.playedMs !== span || xp !== rate * span / HOUR) bad.push(`CT-NOBLOW ${cut}: a bow with no arrows at the ${skill} yard ended ${JSON.stringify(ends)} after ${res.playedMs} ms, paid ${xp} (want no end, ${span} ms, ${rate * span / HOUR})`);
        if (!(late > 0)) bad.push(`CT-NOBLOW ${cut}: a bow with no arrows landed no blow on the dummy past the no-fight span at the ${skill} yard`);
      }
    }
    let quiet = false;
    const { res, members } = yard(X, 'melee', 'melee_dps', { L: 30, spanMs: span, windowMs: 2 * MINUTE,
      onWindow: (w, mems) => { const t0 = mems[0].huntSession.huntFromMs; if (!quiet && w.settledTo - t0 >= quietMs + 2 * MINUTE) quiet = fightAtBack(w, t0); } });
    const ends = members.filter((p) => p.hunt.ended).map((p) => p.hunt.ended.reason);
    if (!quiet) bad.push('CT-NOBLOW harness: the stored world\'s last-blow instant was not found');
    if (ends.length || res.playedMs !== span) bad.push(`CT-NOBLOW a training session ${X.S.NO_FIGHT_END_MIN}+ quiet minutes in ended ${JSON.stringify(ends)} after ${res.playedMs} ms`);
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
    const hunt = X.play.run('mill_cellar', 4, ['tank'], { spanMs: 3 * MINUTE, windowMs: 60000, onWindow: (w) => { for (const p of w.members) if (p.hunt.stamina === null) bad.push('CT-STAMINA a hunting ground stopped proposing stamina'); } });
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

  /* CT-CUT: one long window and many short ones (the tick's and a viewer's) walk the same swings and pay the same, item time too */
  {
    const a = yard(X, 'melee', 'melee_dps', { spanMs: 6 * MINUTE, windowMs: 6 * MINUTE, session: { trainBoostMs: 150000 } });
    const b = yard(X, 'melee', 'melee_dps', { spanMs: 6 * MINUTE, windowMs: 10000, session: { trainBoostMs: 150000 } });
    const xa = a.res.heroXp[X.play.memberKey('melee_dps', 0)] || {}, xb = b.res.heroXp[X.play.memberKey('melee_dps', 0)] || {};
    const wa = X.HT.worldHash(a.windows[a.windows.length - 1].world), wb = X.HT.worldHash(b.windows[b.windows.length - 1].world);
    if (JSON.stringify(a.res.members) !== JSON.stringify(b.res.members) || wa !== wb || xa.melee !== xb.melee) bad.push('CT-CUT one window ' + JSON.stringify(xa) + ' ' + wa + ' vs many ' + JSON.stringify(xb) + ' ' + wb);
  }

  /* CT-PICK: a tier pick never spawns a second dummy */
  {
    const { windows } = yard(X, 'melee', 'melee_dps', { spanMs: 2 * MINUTE, density: 8 });
    const last = windows[windows.length - 1];
    const standing = last && last.world ? JSON.parse(last.world).u.filter((u) => u.includes(dId)).length : 0;
    if (standing !== 1) bad.push('CT-PICK a pick of 8 stood ' + standing + ' dummies');
  }
  return bad;
}

const MUTANTS = [
  { name: 'the engine has no door: a training swing pays like a hunt\'s', edits: [['src/core/hunt-rewards.js', '  if (ctx.train) return trainingSwing(members, events, unitOf);\n', '']], want: /CT-PAY/ },
  { name: 'the sim forgets to hand the rewards the ground', edits: [['src/core/combat-sim.js', '...(train ? { train } : {}), emit:', 'emit:']], want: /CT-PAY/ },
  { name: 'the time is never paid', edits: [['src/core/combat-sim.js', '      if (train) trainingTick(m, train, tick);\n', '']], want: /CT-PAY/ },
  { name: 'each interval floors its own slice', edits: [['src/core/hunt/training.js', '  return (i) => K(i) - K(i - 1);', '  return () => Math.floor(num / den);']], want: /CT-PAY|CT-TICK/ },
  { name: 'the rate moves', edits: [['src/data/training.js', '  xpPerHour: 30000,', '  xpPerHour: 31000,']], want: /CT-PAY|CT-ROW/ },
  { name: 'the item pays the plain rate', edits: [['src/core/hunt/training.js', '    units += sliceOf(TRAINING_RULES.xpPerHour * (TRAINING_GEAR.boostPermille - 1000) / 1000, tickMs)(i);\n', '']], want: /CT-BOOST/ },
  { name: 'the item time never runs out', edits: [['src/core/hunt/training.js', '    hs.trainBoostMs -= tickMs;\n', '']], want: /CT-BOOST/ },
  { name: 'the item time is never claimed', edits: [['src/core/hunt/training.js', '    hs.tally.boostMs = (Number(hs.tally.boostMs) || 0) + tickMs;\n', '']], want: /CT-BOOST|CT-TICK/ },
  { name: 'the yard\'s bar stays open', edits: [['src/core/combat-sim.js', 'slots: train ? TRAINING_SLOTS : m.hero.slots', 'slots: m.hero.slots']], want: /CT-FREE/ },
  { name: 'the yard\'s basic is the bar\'s: a bow waits for arrows and pays for a shot', edits: [['src/core/hunt/damage.js', '      if (yard) return yard;\n', '']], want: /CT-FREE|CT-NOBLOW/ },
  { name: 'a training session ends after ten quiet minutes', edits: [['src/core/combat-sim.js', '    if (train) for (const m of members) m.hs.fightAtMs = null;\n', '']], want: /CT-NOBLOW/ },
  { name: 'the dummy falls', edits: [['src/core/hunt/damage.js', "  if (target.side === 'mon') dummyStands(rowOf(inst, target.kind), target);\n", '']], want: /CT-DUMMY/ },
  { name: 'the dummy\'s blow has no floor', edits: [['src/core/hunt/damage.js', "dummyBlow(source && source.side === 'mon' ? rowOf(inst, source.kind) : null, target, Math.min(target.hp, n - absorbed))", 'Math.min(target.hp, n - absorbed)']], want: /CT-DUMMY/ },
  { name: 'a training session drains stamina', edits: [['src/core/combat-sim.js', '  if (train) for (const m of members) m.hs.staminaMs = null;\n', '']], want: /CT-STAMINA/ },
  { name: 'a pick fills the yard', edits: [['src/core/combat-sim.js', 'const pickOf = (ms) => (train || play.normalOf(tierPick(ms)) ? 0 : picker(ms));', 'const pickOf = (ms) => (play.normalOf(tierPick(ms)) ? 0 : picker(ms));']], want: /CT-PICK/ },
  { name: 'the dummy walks', edits: [['src/data/monsters.js', '  if (row && row.dummy === true) return 0;   // a training', '  // a training']], want: /CT-ROW/ },
  { name: 'the Bestiary counts the dummy', edits: [['src/data/bestiary.js', '    if (m.dummy === true) continue;\n', '']], want: /CT-ROW/ },
  { name: 'the yard stops past its last hour', edits: [['src/core/hunt/training.js', ' || hours >= TRAINING_RULES.maxHours', '']], want: /CT-STOP/ },
  { name: 'the yard never stops', edits: [['src/core/hunt/training.js', '  return stop > Math.floor(Number(fromMs)) ? stop : Infinity;', '  return Infinity;']], want: /CT-STOP/ },
  { name: 'coin planted on the dummy', edits: [['src/data/monsters.js', 'hp: 1000, atk: 2, aim: 22, evasion: 21, def: 0, xp: 0, gp: [0, 0], drops: [] },', 'hp: 1000, atk: 2, aim: 22, evasion: 21, def: 0, xp: 0, gp: [1, 5], drops: [] },']], want: /CT-ROW/ },
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
  console.log(bad.length ? 'combat-training: ' + bad.length + ' FAILED' : 'combat-training: green (the dummy, the eight grounds, the fixed rate, the item\'s hours, free swings, the floor, no stamina, the hour\'s edge, every cut)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
