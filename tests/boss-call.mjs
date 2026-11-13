#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/boss-call.mjs — CALL OUT PAYS NOTHING, AND ENDS (Tyler 2026-11-04; src/data/boss-calls.js). The money line's standing guard: data and the real settle, no database.
// tests/boss-call-db.mjs holds the server's half: the verb, the one door, the settle's refusal, both doors.
//
//   node tests/boss-call.mjs            the guard
//   node tests/boss-call.mjs --mutate   every planted defect must turn it red
//
// mutant-anchors: src/data/monsters.js src/core/hunt-rewards.js src/core/combat-sim.js src/core/action-rules.js src/data/bestiary.js src/data/hunt-grounds.js src/core/hunt/boss-phases.js src/core/hunt/damage.js src/core/hunt/pull-cycle.js src/core/hunt/leash.js supabase/functions/hr-accrue/accrual.js
//
//   BC-ROW     a called row is xp 0, gp [0, 0], no drops, no yield trick; it stands in its own room and nowhere else: no ground list, no roster, no Bestiary, no activity
//   BC-TIER    a difficulty tier can't reach the room (when src/data/hunt-tiers.js is on the tree)
//   BC-PAY     a kill pays nothing by any path: a lone seat, a pair, a four, Tempering, a bestiary boost: every window's delta is the settle's allowlist, and the kill reaches only the title's counter
//   BC-HP      the boss's one spawn is his row's HP for any party that walks in (no party scale since 2026-11-08)
//   BC-FELLED  the kill ends the fight for everyone, the same instant however the windows are cut (the hunt viewed, the browser closed)
//   BC-DEATH   a death ends it for everyone, box ticked or not, and costs what a death costs
//   BC-TIME    the limit ends a fight nobody can finish, for everyone, and no hunt is left open, with his adds standing too
//   BC-PHASE   (Tyler 2026-11-05: "phases") the two lines happen once each and at their HP, the adds come in full and go for whoever isn't the tank, Challenge takes them, the enrage raises his blows; the world's shape never moved
//   BC-GUARD   while one of his adds stands he takes only his guard's share of a blow, all of it once they're down; a ground's own monster never hides
//   BC-WAVE    a death in the add wave ends the fight for everyone, however the windows are cut: an add's kill pays nothing, and no hunt stays open
//   BC-RECORD  the server's record of a fight: where he stood, read through a leader's death (a called room never resets), and what each hero's bar fired, the same however the windows are cut
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
/* A shield makes the tank (Tyler 2026-10-23), and only a tank's bar can hold Challenge. */
const SHIELDED = { weapon: 'bronze_sword', shield: 'practice_shield', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' };
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
    P: await import(u('src/core/hunt/boss-phases.js') + V),
    XP: await import(u('src/core/xp.js') + V),
    C: await import(u('src/core/combat.js') + V),
  };
}

/* BC-GUARD's one blow of 100,000 at monster `kind` in call `c`'s room, through damage.js landHit, his add standing or fallen: what landed. */
function blowOf(X, c, addUp, kind) {
  const boss = { id: 2, side: 'mon', kind, pocket: 0, alive: true, hp: 1000000, maxHp: 1000000, x: 5, y: 5, statuses: [] };
  const add = { id: 3, side: 'mon', kind: X.G.CALLED_GROUNDS[c.hunt].pockets[0].adds[0].monster, pocket: 0, alive: addUp, hp: addUp ? 100 : 0, maxHp: 100, x: 6, y: 5, statuses: [] };
  const inst = { world: { units: [boss, add], packs: [{}] }, ground: X.G.CALLED_GROUNDS[c.hunt], heroes: {} };
  return X.D.landHit(inst, { atMs: 0, emit: () => {}, rng: null }, null, boss, 100000, null, null).dmg;
}

/* One fight to its end: the windows, the ends and every member's deltas. `cut` the settle's window. */
function fight(X, call, roles, o = {}) {
  const windows = [];
  const res = X.play.run(call.hunt, o.L || STRONG.L, roles, { ground: X.G.CALLED_GROUNDS[call.hunt], spanMs: X.B.BOSS_CALL_RULES.limitMs + 2 * MINUTE, windowMs: o.cut || 30000,
    secret: o.secret || '-4611686018427387904', leaveTogether: o.box !== false, ...(o.temper ? { temper: o.temper } : {}), ...(o.start ? { start: o.start } : {}), equipment: (role) => o.kit || (role === 'mage' ? { weapon: 'oak_wand' } : role === 'healer' ? { weapon: 'oak_staff' } : STRONG.kit),
    ...(o.bar ? { bar: o.bar } : {}), onWindow: (w) => windows.push(w) });
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

  /* BC-ROW: a boss and his adds, and an add that pays is as red as a boss that does. */
  const addIds = new Set(calls.flatMap((c) => G.CALLED_GROUNDS[c.hunt] ? G.CALLED_GROUNDS[c.hunt].pockets.flatMap((p) => p.adds || []).map((s) => s.monster) : []));
  if (rows.length !== calls.length + addIds.size) bad.push('BC-ROW ' + rows.length + ' called rows for ' + calls.length + ' calls and ' + addIds.size + ' kinds of add');
  for (const id of addIds) {
    const a = M.MONSTERS[id];
    if (!a || a.called !== true) bad.push('BC-ROW the add ' + id + ' is no called row: it pays');
    else if (a.boss === true || a.add !== true) bad.push('BC-ROW the add ' + id + ' reads as a boss: "target is a boss" must tell them apart');
    if (a && a.phases) bad.push('BC-ROW the add ' + id + ' has phases');
  }
  for (const [id, m] of Object.entries(M.MONSTERS)) if (m.phases && !calls.some((c) => c.monster === id)) bad.push('BC-ROW ' + id + ' has phases and is no called boss');
  for (const c of calls) { const p = (M.MONSTERS[c.monster] || {}).phases; if (!p || !(p.addsPm > p.enragePm && p.enragePm > 0 && p.enrageAtkPm > 1000)) bad.push('BC-ROW ' + c.monster + ' has no two lines: ' + JSON.stringify(p)); }
  for (const [id, m] of rows) {
    if (m.xp !== 0) bad.push('BC-ROW ' + id + ' pays XP ' + m.xp);
    if (!(m.gp && m.gp[0] === 0 && m.gp[1] === 0)) bad.push('BC-ROW ' + id + ' pays coin ' + JSON.stringify(m.gp));
    if (!(Array.isArray(m.drops) && m.drops.length === 0)) bad.push('BC-ROW ' + id + ' drops ' + JSON.stringify(m.drops));
    if (!/_called$/.test(id)) bad.push('BC-ROW ' + id + ' id does not end _called');
    if (id in BE.BESTIARY) bad.push('BC-ROW ' + id + ' has a Bestiary entry');
  }
  for (const c of calls) {
    const g = G.CALLED_GROUNDS[c.hunt];
    if (!g || g.call !== c.id) { bad.push('BC-ROW ' + c.id + ' has no room'); continue; }
    if (G.HUNT_GROUNDS[c.hunt]) bad.push('BC-ROW room ' + c.hunt + ' is on the ground list');
    if (G.OPEN_GROUNDS[c.hunt]) bad.push('BC-ROW room ' + c.hunt + ' is an open ground');
    if (H.HUNTS.some((h) => h.id === c.hunt) || H.OPEN_HUNTS.some((h) => h.id === c.hunt)) bad.push('BC-ROW room ' + c.hunt + ' is on the hunt list');
    if (G.groundOfHunt(c.hunt) !== g) bad.push('BC-ROW the engine does not find room ' + c.hunt);
    for (const p of g.pockets) for (const s of p.spawns.concat(p.adds || [])) if (!(M.MONSTERS[s.monster] && M.MONSTERS[s.monster].called === true)) bad.push('BC-ROW room ' + c.hunt + ' fields ' + s.monster);
    if (!g.pockets.some((p) => (p.adds || []).length)) bad.push('BC-ROW room ' + c.hunt + ' has no adds');
    if (G.pullRows(g, 0, 8).length !== 1) bad.push('BC-ROW a pull of 8 brings ' + G.pullRows(g, 0, 8).length + ' to room ' + c.hunt);
  }
  const reach = G.reachableOf(G.OPEN_GROUNDS, H.HUNT_INDEX).monsters;
  for (const [id] of rows) if (reach.includes(id)) bad.push('BC-ROW ' + id + ' is on the reachable roster');
  for (const g of Object.values(G.HUNT_GROUNDS)) for (const p of g.pockets) for (const s of (p.pack || []).concat(p.spawns)) if (M.MONSTERS[s.monster] && M.MONSTERS[s.monster].called === true) bad.push('BC-ROW ground ' + g.id + ' fields ' + s.monster);
  const sql = readFileSync(join(X.root === REPO ? REPO : REPO, 'supabase/migrations/2027-03-12-boss-call-hunt-sessions-catalogue.generated.sql'), 'utf8');
  for (const [id] of rows) {
    if (!sql.includes(`('${id}', 0, 0, '{}'::jsonb)`)) bad.push('BC-ROW the catalogue\'s kill bound of ' + id + ' is not nothing');
    if (new RegExp(`delete from public.hr_hunt_roster;[\\s\\S]*?\\('${id}'\\)[\\s\\S]*?delete from public.hr_hunt_weapons`).test(sql)) bad.push('BC-ROW ' + id + ' is in hr_hunt_roster');
  }

  /* BC-TIER: the difficulty lane's data, once it lands here. */
  const tiers = await import(pathToFileURL(join(X.root, 'src/data/hunt-tiers.js')).href).catch(() => null);
  if (tiers) for (const c of calls) if (tiers.tiersOf(G.CALLED_GROUNDS[c.hunt].id).join() !== tiers.DEFAULT_TIER) bad.push('BC-TIER room ' + c.hunt + ' offers ' + tiers.tiersOf(c.hunt).join());

  const king = B.BOSS_CALLS.rat_king, chief = B.BOSS_CALLS.chief_coppercap;
  /* BC-PAY: every path, on rows that make the kill certain and quick: the boss is real, his blows aren't what's measured. Then BC-FELLED's three cuts. */
  const addOf = (c) => G.CALLED_GROUNDS[c.hunt].pockets[0].adds[0].monster;
  const bothRows = (id) => [X.EM[id], X.play.MONSTERS[id]];
  const setRow = (id, o) => { for (const inst of bothRows(id)) Object.assign(inst, o); };
  const soft = (c, hp) => { setRow(c.monster, { hp, atk: 1, baseAcc: 0 }); setRow(addOf(c), { hp: 60, atk: 1, baseAcc: 0 }); };
  soft(king, 1600); soft(chief, 1600);
  const kinds = (f) => { const out = {}; for (const w of f.windows) for (const [u, r] of Object.entries(w.units || {})) out[u] = r[0]; return out; };
  const eventsOf = (f) => f.windows.flatMap((w) => w.events || []);
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
    /* (A pair's tank stays on him and its healer heals: nobody there kills an add; the others read an add's kill.) */
    if (name !== 'a pair') { const k = kinds(f); if (!eventsOf(f).some((e) => e.type === 'kill' && k[e.t] === addOf(c))) bad.push('BC-PAY ' + name + ': CONTROL: no add fell, so an add\'s pay was never read'); }
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

  /* BC-HP: the one spawn is his row's HP for a party of 2, 3 or 4, read from the first window's unit book. */
  for (const roles of [['tank', 'healer'], ['tank', 'healer', 'mage'], ['tank', 'healer', 'mage', 'melee_dps']]) {
    const f = fight(X, king, roles, {});
    const book = f.windows[0].units || {};
    const boss = Object.values(book).find((u) => u[0] === king.monster);
    const want = X.EM[king.monster].hp;
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

  /* BC-PHASE: the world's shape, against the last catalogue APPLIED before the boss lane: neither line is a stored field (the boss lane's catalogue
     wrote the same shape). Since then the shape moved once, by a field taken OUT (lane/b-one-difficulty: a monster's yield share), so the engine's
     shape is the newest catalogue's (tools/gen-hunt-sessions.mjs OUT_NAME), and the boss's lines are still no field of it. */
  {
    const shapeOf = (file) => Number((/insert into public\.hr_hunt_world_shape \(id, version, shape, fields\) values \(true, 1, (\d+),/.exec(readFileSync(join(REPO, 'supabase/migrations', file), 'utf8')) || [])[1]);
    const applied = shapeOf('2027-02-24-gold-matters-hunt-sessions-catalogue.generated.sql');
    if (shapeOf('2027-03-12-boss-call-hunt-sessions-catalogue.generated.sql') !== applied) bad.push('BC-PHASE the boss lane\'s catalogue wrote another shape');
    const { OUT_NAME } = await import(pathToFileURL(join(REPO, 'tools/gen-hunt-sessions.mjs')).href);
    const WS = await import(pathToFileURL(join(X.root, 'src/core/hunt/world-state.js')).href + V);
    if (!(shapeOf(OUT_NAME) > 0) || WS.SHAPE !== shapeOf(OUT_NAME)) bad.push('BC-PHASE the world\'s shape is ' + WS.SHAPE + ', the newest catalogue ' + shapeOf(OUT_NAME) + ' (a stored flag, or a new field)');
  }
  /* BC-PHASE: the lines, once each, at their HP; no Challenge on the bar, so every blow an add lands is its first aim. */
  const NO_CHALLENGE = (role) => (role === 'tank' ? [{ action: { type: 'ability', id: 'power_strike' }, conditions: [], join: 'and' }] : []);
  setRow(king.monster, { hp: 3000, atk: 1, baseAcc: 0 });
  {
    const f = fight(X, king, ['tank', 'healer'], { bar: NO_CHALLENGE });
    const k = kinds(f), ev = eventsOf(f), row = X.EM[king.monster];
    const lines = ev.filter((e) => e.type === 'boss_phase');
    if (lines.map((e) => e.phase).join() !== 'adds,enrage') bad.push('BC-PHASE the lines fell as ' + (lines.map((e) => e.phase).join() || 'nothing') + ', want adds then enrage, once each');
    const book = Object.values(f.windows[0].units).find((u) => u[0] === king.monster);
    const maxHp = book ? book[1] : 0;
    let dealt = 0;
    for (const e of ev) {
      if (e.type === 'boss_phase') {
        const pm = Math.floor(((maxHp - dealt) * 1000) / maxHp), line = e.phase === 'adds' ? row.phases.addsPm : row.phases.enragePm;
        if (pm > line || pm < line - 150) bad.push('BC-PHASE ' + e.phase + ' fell at ' + pm + ' permille of him, the line is ' + line);
      }
      if (e.type === 'dmg' && k[e.t] === king.monster) dealt += e.amount;
    }
    const addUnits = Object.keys(k).filter((u) => k[u] === addOf(king));
    const want = G.CALLED_GROUNDS[king.hunt].pockets[0].adds.length;
    if (addUnits.length !== want) bad.push('BC-PHASE ' + addUnits.length + ' adds came, the wave is ' + want);
    const blows = ev.filter((e) => (e.type === 'dmg' || e.type === 'miss') && k[e.u] === addOf(king));
    if (!blows.length) bad.push('BC-PHASE CONTROL: no add swung');
    for (const e of blows) if (k[e.t] !== 'healer') bad.push('BC-PHASE an add went for the ' + k[e.t] + ', with a healer standing');
  }
  /* BC-GUARD: while one of his adds stands he takes guardPm of a blow, all of it once none does, and a ground's own monster always all of it. One blow through the engine's
     own door (damage.js landHit), on every called boss. */
  const guarded = calls.filter((c) => Number.isInteger(((X.EM[c.monster] || {}).phases || {}).guardPm));
  if (!guarded.length) bad.push('BC-GUARD CONTROL: no called boss has a guard, so none was read');
  for (const c of calls) {
    const row = X.EM[c.monster], guard = (row.phases || {}).guardPm;
    if (guard === undefined) {
      if (blowOf(X, c, true, c.monster) !== blowOf(X, c, false, c.monster)) bad.push('BC-GUARD ' + c.monster + ' has no guard and still hides behind a standing add');
      continue;
    }
    if (!(Number.isInteger(guard) && guard > 0 && guard < 1000)) { bad.push('BC-GUARD ' + c.monster + ' has a guard of ' + guard); continue; }
    const blow = (addUp, kind) => blowOf(X, c, addUp, kind);
    const open = blow(false, c.monster), held = blow(true, c.monster);
    if (!(open > 0) || Math.abs(held - Math.floor((open * guard) / 1000)) > 1) bad.push('BC-GUARD ' + c.monster + ' took ' + held + ' behind his adds and ' + open + ' without, his guard is ' + guard);
    if (blow(true, c.of) !== blow(false, c.of)) bad.push('BC-GUARD ' + c.of + ' on his own ground hides behind a standing add');
  }
  /* ...and the tank's Challenge takes them. */
  {
    const f = fight(X, king, ['tank', 'healer'], { kit: SHIELDED });
    const k = kinds(f), ev = eventsOf(f);
    const at = (ev.find((e) => e.type === 'boss_phase' && e.phase === 'adds') || {}).atMs;
    const took = ev.filter((e) => e.type === 'target' && k[e.u] === addOf(king) && k[e.t] === 'tank' && e.atMs >= at);
    if (!ev.some((e) => e.type === 'challenge' && e.atMs >= at) || !took.length) bad.push('BC-PHASE the tank\'s Challenge took no add');
  }
  /* ...and the enrage raises his blows (his swings only, ability 'basic': a spell is priced off the same row and would hide a swing that ignores it): his largest before the line stays under his row's, after it passes it. */
  setRow(king.monster, { hp: 9000, atk: 10, baseAcc: 1, phases: { ...X.EM[king.monster].phases, enrageAtkPm: 3000 } });
  {
    const f = fight(X, king, ['tank', 'healer'], { bar: NO_CHALLENGE });
    const k = kinds(f);
    let on = false, before = 0, after = 0;
    for (const e of eventsOf(f)) {
      if (e.type === 'boss_phase' && e.phase === 'enrage') on = true;
      if (e.type === 'dmg' && k[e.u] === king.monster && e.ability === 'basic') { if (on) after = Math.max(after, e.amount); else before = Math.max(before, e.amount); }
    }
    const plain = X.C.monsterMaxHit({ ...X.EM[king.monster], atk: 10 });
    if (!before || before > plain) bad.push('BC-PHASE before the line his largest blow was ' + before + ', his row\'s is ' + plain);
    if (!(after > plain)) bad.push('BC-PHASE in the enrage his largest blow was ' + after + ', his row\'s plain one is ' + plain);
  }
  setRow(king.monster, { phases: { ...X.EM[king.monster].phases, enrageAtkPm: 1600 } });

  /* BC-WAVE: an add that kills: the healer falls with the wave up, the tank comes home with it, both paths. */
  setRow(king.monster, { hp: 3000, atk: 1, baseAcc: 0 });
  setRow(addOf(king), { hp: 100000, atk: 400, baseAcc: 1 });
  {
    const ways = [10000, 30000, 10 * MINUTE].map((cut) => fight(X, king, ['tank', 'healer'], { cut, bar: NO_CHALLENGE, L: 30, start: (role, i, L) => ({ levelXp: X.XP.charXpForLevel(L) + 2000 }) }));
    const key = (f) => JSON.stringify(Object.entries(f.ended).sort());
    for (const f of ways) {
      if (key(f) !== key(ways[0])) bad.push('BC-WAVE the cuts disagree: ' + key(f) + ' against ' + key(ways[0]));
      const reasons = Object.values(f.ended).map((e) => e.reason).sort().join();
      if (reasons !== 'died,party_member_died') bad.push('BC-WAVE ended ' + (reasons || 'nothing') + ', want died and party_member_died');
      for (const m of f.members) for (const p of paysOf(m.delta, king.monster)) bad.push('BC-WAVE ' + m.key + ' ' + p);
      const log = f.members.flatMap((m) => m.summary.deathLog || []);
      if (log.length !== 1 || log[0].monster !== addOf(king)) bad.push('BC-WAVE the death reads ' + JSON.stringify(log));
    }
  }

  /* BC-RECORD: where he stood, read through the leader's death (a called room never heals him). */
  setRow(addOf(king), { hp: 60, atk: 1, baseAcc: 0 });
  setRow(king.monster, { hp: 3000, atk: 120, baseAcc: 1 });
  const lastFight = (f, key) => { let out = null; for (const m of f.members) if (m.key === key && m.analyzer && m.analyzer.fight) out = m.analyzer.fight; return out; };
  {
    const f = fight(X, king, ['tank', 'healer'], { L: 30, start: (role, i, L) => ({ levelXp: X.XP.charXpForLevel(L) + 2000 }) });
    const k = kinds(f), tank = f.members.find((m) => /^tank/.test(m.key)).key;
    const book = Object.values(f.windows[0].units).find((u) => u[0] === king.monster);
    const dealt = eventsOf(f).filter((e) => e.type === 'dmg' && k[e.t] === king.monster).reduce((a, e) => a + e.amount, 0);
    const rec = lastFight(f, tank);
    if (!dealt) bad.push('BC-RECORD CONTROL: nobody touched him before the tank fell');
    if (!Object.values(f.ended).some((e) => e.reason === 'died')) bad.push('BC-RECORD CONTROL: the tank did not fall: ' + JSON.stringify(f.ended));
    if (!rec || rec.boss_pm !== Math.floor(((book[1] - dealt) * 1000) / book[1])) bad.push('BC-RECORD the record says ' + JSON.stringify(rec) + ' with ' + dealt + ' of ' + book[1] + ' dealt: a reset healed him');
  }
  /* ...on a kill it reads nothing left, what fired is each hero's own, and any cut says the same. (He hits hard enough that someone eats.) */
  setRow(king.monster, { hp: 1600, atk: 30, baseAcc: 3 });
  {
    const FOOD = () => [{ action: { type: 'consume', id: 'salted_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 90 }], join: 'and' }];
    const ways = [10000, 30000, 10 * MINUTE].map((cut) => fight(X, king, ['tank', 'healer'], { cut, kit: SHIELDED, bar: FOOD }));
    const fold = (f, key) => { const n = {}; for (const m of f.members) if (m.key === key && m.analyzer && m.analyzer.fight) for (const [a, c] of Object.entries(m.analyzer.fight.fired)) n[a] = (n[a] || 0) + c; return n; };
    const norm = (o) => JSON.stringify(Object.entries(o).sort());
    const f0 = ways[0], keys = [...new Set(f0.members.map((m) => m.key))];
    for (const key of keys) {
      const unit = f0.members.find((m) => m.key === key && Number.isInteger(m.summary.unitIdEver)).summary.unitIdEver;
      const seen = {};
      for (const e of eventsOf(f0)) if (e.u === unit && (e.type === 'cast' || e.type === 'eat' || e.type === 'drink')) { const a = e.type === 'cast' ? e.ability : e.type; seen[a] = (seen[a] || 0) + 1; }
      if (norm(fold(f0, key)) !== norm(seen)) bad.push('BC-RECORD ' + key + ' fired ' + norm(seen) + ', the record says ' + norm(fold(f0, key)));
      for (const f of ways) {
        if (norm(fold(f, key)) !== norm(fold(f0, key))) bad.push('BC-RECORD the cuts disagree on what ' + key + ' fired');
        const rec = lastFight(f, key);
        if (!rec || rec.boss_pm !== 0) bad.push('BC-RECORD a felled boss reads ' + JSON.stringify(rec));
      }
    }
    if (!keys.some((key) => (fold(f0, key).challenge || 0) > 0)) bad.push('BC-RECORD CONTROL: nothing fired Challenge');
    if (!keys.some((key) => (fold(f0, key).eat || 0) > 0)) bad.push('BC-RECORD nobody ate, or the record forgot the food: ' + JSON.stringify(keys.map((key) => fold(f0, key))));
  }
  /* A normal hunt's window carries no record. */
  {
    const seen = [];
    X.play.run('mill_cellar', 6, ['tank'], { spanMs: 60000, windowMs: 30000, onWindow: (w) => { for (const m of w.members) seen.push(m); } });
    if (!seen.length || seen.some((m) => m.analyzer && 'fight' in m.analyzer)) bad.push('BC-RECORD a normal hunt carries a record');
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
  /* (Measured: what a pair deals in ten minutes. A pair meets his whole row (no party scale since 2026-11-08), so a row of 1.5 times that puts his first line well inside the limit and the kill past it, and his adds, who never die, stand when it falls.) */
  {
    const measure = fight(X, king, ['tank', 'healer']);
    const k = kinds(measure);
    const dealt = eventsOf(measure).filter((e) => e.type === 'dmg' && k[e.t] === king.monster).reduce((a, e) => a + e.amount, 0);
    if (!dealt) bad.push('BC-TIME CONTROL: nothing was dealt in ten minutes');
    setRow(king.monster, { hp: Math.floor(dealt * 1.5) });
    setRow(addOf(king), { hp: 10000000, atk: 1, baseAcc: 0 });
    const f = fight(X, king, ['tank', 'healer']);
    const kk = kinds(f);
    const addsUp = eventsOf(f).some((e) => e.type === 'boss_phase' && e.phase === 'adds') && Object.values(kk).includes(addOf(king));
    const ended = Object.values(f.ended);
    if (!addsUp) bad.push('BC-TIME CONTROL: his adds never came before the limit');
    if (ended.length !== 2 || !ended.every((e) => e.reason === 'boss_time')) bad.push('BC-TIME with the wave up, ended ' + JSON.stringify(f.ended));
    setRow(king.monster, { hp: 100000000 });
  }
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
  const keep = Object.values(X.B.BOSS_CALLS).flatMap((c) => [c.monster, X.G.CALLED_GROUNDS[c.hunt] ? X.G.CALLED_GROUNDS[c.hunt].pockets[0].adds[0].monster : c.monster]).map((id) => [id, { ...X.EM[id] }]);
  try { return await fn(X); } finally {
    for (const [id, row] of keep) { Object.assign(X.EM[id], row); Object.assign(X.play.MONSTERS[id], row); delete X.EM[id].unused; }
  }
}

const ROW_KING = "hp: 2000, atk: 42, baseAcc: 0.1, def: 4, xp: 0, gp: [0, 0], speed: 2800, drops: [], phases: { addsPm: 500, enragePm: 250, enrageAtkPm: 1600 } },";
const ROW_ADD = "hp: 300, atk: 66, baseAcc: -0.6, def: 0, xp: 0, gp: [0, 0], speed: 3400, drops: [] },";
const MUTANTS = [
  { name: 'a drop row planted on a called row', edits: [['src/data/monsters.js', ROW_KING, ROW_KING.replace('drops: []', "drops: [{ id: 'bones', ch: 1, band: 'common' }]")]], want: /BC-ROW/ },
  { name: 'XP planted on a called row', edits: [['src/data/monsters.js', ROW_KING, ROW_KING.replace('xp: 0', 'xp: 500')]], want: /BC-ROW/ },
  { name: 'coin planted on a called row', edits: [['src/data/monsters.js', ROW_KING, ROW_KING.replace('gp: [0, 0]', 'gp: [1, 5]')]], want: /BC-ROW/ },
  { name: 'the engine has no door: a called swing pays like any other', edits: [['src/core/hunt-rewards.js', '  if (ctx.call) return calledSwing(members, events, unitOf, ctx.call.monster);\n', '']], want: /BC-PAY/ },
  { name: 'the sim forgets to hand the rewards the call', edits: [['src/core/combat-sim.js', 'hearthfind: ctx.hearthfind, call,', 'hearthfind: ctx.hearthfind,']], want: /BC-PAY/ },
  { name: 'a called kill counts as a kill', edits: [['src/core/hunt-rewards.js', "for (const m of members.values()) call(m.fx, 'updateQuest', 'kill_monster', 1, { target: t.kind });", "for (const m of members.values()) { m.hs.tally.kills += 1; call(m.fx, 'updateQuest', 'kill_any', 1, { target: t.kind }); call(m.fx, 'updateQuest', 'kill_monster', 1, { target: t.kind }); }"]], want: /BC-PAY/ },
  { name: 'the kill never reaches the title', edits: [['src/core/hunt-rewards.js', "for (const m of members.values()) call(m.fx, 'updateQuest', 'kill_monster', 1, { target: t.kind });", '']], want: /BC-PAY/ },
  { name: 'the kill ends nothing', edits: [['src/core/combat-sim.js', "for (const m of members) if (!m.left) m.hs.bossFelled = true;", '']], want: /BC-PAY|BC-FELLED/ },
  { name: 'the kill ends only the window it fell in', edits: [['src/core/combat-sim.js', "typeof m.hs.runesOut === 'string' || m.hs.died === true || m.hs.bossFelled === true) {", "typeof m.hs.runesOut === 'string' || m.hs.died === true) {"]], want: /BC-FELLED/ },
  { name: 'a death leaves the unticked friend in the room', edits: [['src/core/combat-sim.js', 'm.hero = Object.assign({}, m.hero, { leaveTogether: true });', '']], want: /BC-DEATH/ },
  { name: 'the limit never falls', edits: [['src/core/action-rules.js', 'boss_time: (hs, t) => at(hs.callEndsAtMs, t),', 'boss_time: () => false,']], want: /BC-TIME/ },
  { name: 'the boss spawns scaled down for a small party', edits: [['src/core/hunt/pull-cycle.js', '  const hp = Math.max(1, atTier(row, inst.tier).hp || 1);', '  const hp = Math.max(1, Math.floor((atTier(row, inst.tier).hp || 1) * 0.7));']], want: /BC-HP/ },
  { name: 'a called boss in the Bestiary', edits: [['src/data/bestiary.js', "if (!m || typeof m !== 'object' || m.called === true) continue;", "if (!m || typeof m !== 'object') continue;"]], want: /BC-ROW/ },
  /* THE ADDS PAY NOTHING EITHER (the brief's core rule: "any add that pays goes red"). */
  { name: 'XP planted on an add', edits: [['src/data/monsters.js', ROW_ADD, ROW_ADD.replace('xp: 0', 'xp: 500')]], want: /BC-ROW/ },
  { name: 'coin planted on an add', edits: [['src/data/monsters.js', ROW_ADD, ROW_ADD.replace('gp: [0, 0]', 'gp: [1, 5]')]], want: /BC-ROW/ },
  { name: 'a drop planted on an add', edits: [['src/data/monsters.js', ROW_ADD, ROW_ADD.replace('drops: []', "drops: [{ id: 'bones', ch: 1, band: 'common' }]")]], want: /BC-ROW/ },
  { name: 'a wave of the ground\'s paying rats', edits: [['src/data/hunt-grounds.js', "adds: addRows(['drain_rat_called', 56, 18],", "adds: addRows(['drain_rat', 56, 18],"]], want: /BC-ROW/ },
  { name: 'an add\'s kill counts on the title\'s counter', edits: [['src/core/hunt-rewards.js', "if (t && t.side === 'mon' && t.kind === boss) {", "if (t && t.side === 'mon') {"]], want: /BC-PAY/ },
  { name: 'an add reads as a boss', edits: [['src/data/monsters.js', "family: 'Vermin', formation: true, called: true, add: true,", "family: 'Vermin', formation: true, called: true, boss: true,"]], want: /BC-ROW/ },
  /* THE LINES */
  { name: 'a stored flag: the world\'s shape moves', edits: [['src/core/hunt/damage.js', "world: Object.freeze([['fightAt', 'int']]),", "world: Object.freeze([['fightAt', 'int'], ['bossLine', 'int']]),"]], want: /BC-PHASE/ },
  { name: 'the wave comes on every blow under the line', edits: [['src/core/hunt/boss-phases.js', 'const crossed = (pm) => !atOrUnder(before, t.maxHp, pm) && atOrUnder(t.hp, t.maxHp, pm);', 'const crossed = (pm) => atOrUnder(t.hp, t.maxHp, pm);']], want: /BC-PHASE/ },
  { name: 'the wave never comes', edits: [['src/core/hunt/boss-phases.js', 'spawnAdds(inst, t.pocket, sc);', '']], want: /BC-PHASE|BC-PAY|BC-WAVE/ },
  { name: 'the first line is read at the wrong HP', edits: [['src/core/hunt/boss-phases.js', 'if (crossed(ph.addsPm)) {', 'if (crossed(ph.addsPm - 300)) {']], want: /BC-PHASE/ },
  { name: 'the adds go for the one holding him', edits: [['src/core/hunt/pull-cycle.js', 'const on = off.length ? off : standing;', 'const on = standing;']], want: /BC-PHASE/ },
  { name: 'the enrage raises nothing', edits: [['src/core/hunt/damage.js', 'const blowRow = swingRow(u, row);', 'const blowRow = row;']], want: /BC-PHASE/ },
  { name: 'his adds shield him from nothing', edits: [['src/core/hunt/damage.js', "  if (target.side === 'mon') n = Math.floor((n * guardPmOf(inst, target)) / 1000);\n", '']], want: /BC-GUARD/ },
  { name: 'a fallen add still shields him', edits: [['src/core/hunt/boss-phases.js', 'inst.world.units.some((u) => u.alive && u.side', 'inst.world.units.some((u) => u.side']], want: /BC-GUARD/ },
  { name: 'every monster hides behind an add', edits: [['src/core/hunt/boss-phases.js', "if (!ph || !Number.isInteger(ph.guardPm)) return 1000;", "if (!ph || !Number.isInteger(ph.guardPm)) return t.side === 'mon' && inst.world.units.some((u) => u.alive && (MONSTERS[u.kind] || {}).add === true) ? 500 : 1000;"]], want: /BC-GUARD/ },
  { name: 'the enrage reads the row, not his HP', edits: [['src/core/hunt/boss-phases.js', 'if (!ph || !atOrUnder(u.hp, u.maxHp, ph.enragePm)) return row;', 'if (!ph) return row;']], want: /BC-PHASE/ },
  { name: 'a leader\'s death heals him', edits: [['src/core/hunt/leash.js', "if (!pack || (inst.ground && inst.ground.call)) return;", 'if (!pack) return;']], want: /BC-RECORD/ },
  { name: 'the record counts everyone\'s casts', edits: [['supabase/functions/hr-accrue/accrual.js', 'if (e.u !== unitId) continue;', '']], want: /BC-RECORD/ },
  { name: 'the record forgets the food', edits: [['supabase/functions/hr-accrue/accrual.js', "e.type === 'cast' ? e.ability : e.type === 'eat' || e.type === 'drink' ? e.type : null", "e.type === 'cast' ? e.ability : null"]], want: /BC-RECORD/ },
  { name: 'every hunt carries a record', edits: [['supabase/functions/hr-accrue/accrual.js', 'fight: fightOf(sim, summary.unitIdEver, BOSS_CALLS[inp.ground.call]) };', "fight: fightOf(sim, summary.unitIdEver, BOSS_CALLS[inp.ground.call || 'rat_king']) };"], ['supabase/functions/hr-accrue/accrual.js', 'if (inp.ground.call && Number.isInteger(summary.unitIdEver)) {', 'if (Number.isInteger(summary.unitIdEver)) {']], want: /BC-RECORD/ },
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
