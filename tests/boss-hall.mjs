#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/boss-hall.mjs — A KEYED HALL PAYS AND ENDS, A NAMED ADD FIGHTS WITH HIS OWN KIT, A SPELL SPEEDS UP UNDER HIS LINE
//   (the Krell's Hold design's engine pieces 5, 6 and 7; src/data/boss-halls.js, src/core/hunt/boss-room.js, boss-phases.js). Data and the
//   real settle, no database; tests/boss-hall-db.mjs holds the server's half (the verb, the one door, both doors of the settle).
//
//   node tests/boss-hall.mjs            the guard
//   node tests/boss-hall.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: src/core/hunt/boss-room.js src/core/hunt/leash.js src/core/combat-sim.js src/core/hunt/boss-phases.js src/core/hunt/monster-spells.js supabase/functions/hr-accrue/accrual.js tools/gen-hunt-sessions.mjs src/data/boss-halls.js src/data/hunts.js src/data/grounds/krells_hold/pack.js
//
// The data holds no hall yet (a ground pack's `hall` folds in later), so the arms play a FIXTURE hall: the Rat King's hall on the Millrace map,
// its boss, a named add and two plain adds written below as paying rows, with real spells (Slag Rain stands in for the Hall Fire).
//
//   HL-ROW     the generator takes a well-made hall (one room, its boss alone, paying rows on no other ground, a key that is an item) and
//              refuses every defect: a called row in it, a named add with a wave or a guard, a plain add with lines, a hasted spell not his own
//              or one that would start again before it lands, a boss with no lines, a room not named <ground>_hall, a key that is no item,
//              his rows on another ground, adds on a ground that is no room. The real tables: no hall, and a called room is still a call.
//   HL-PAY     a hall's kill PAYS like any ground's: the boss's and his adds' Level XP, coin and drops reach every hero's delta
//   HL-FELLED  his kill ends the fight `boss_felled` for everyone on one instant, however the windows are cut (the hunt viewed, the browser closed)
//   HL-DEATH   a death ends it for everyone, box ticked or not
//   HL-TIME    the limit ends a fight nobody can finish, for everyone, on the limit's instant
//   HL-RESET   nothing resets: his HP only falls and his pack keeps its aim (leash.js)
//   HL-RECORD  every window carries the fight's record (accrual.js fightOf): where he stood, what this hero's bar fired
//   HL-NAMED   (piece 6) at his line the wave comes once, the named add among it; the named add casts his own spell, crosses his own enrage
//              line once, brings no wave of his own, shields the boss while he stands and pays his own kill
//   HL-HASTE   (piece 7) under the enrage line his hasted spell's wait is cdPm/1000 of its row's, the wait running at the crossing is cut to
//              that once (never raised, never cut twice), every other spell keeps its own, and the flares fall on the same instants however
//              the windows are cut
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ROOT as REPO, plant } from './hunt-core/fixtures/h1.js';
import { BOSS, NAMED, ADD, ROOM, FROM, KEY, FLARE, CONE, NAMED_SPELL, ROWS, hallGround, HALL_HUNT, HALL_ROW, hallSource } from './boss-hall-fixture.mjs';

const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(REPO, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(REPO, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const T0 = Date.UTC(2026, 9, 18, 12, 0, 0);
const MINUTE = 60000;
/* The planted tree a mutant runs: the play trees and the generator's own imports. */
const TREES = [...PLAY_TREES, 'tools/gen-hunt-sessions.mjs', 'tools/pack', 'tests/_is-main.mjs', 'src/session'];

/* ── THE FIXTURE HALL (tests/boss-hall-fixture.mjs) ─────────────────────────── */
const STRONG = { L: 70, kit: { weapon: 'steel_warhammer', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' } };
const SHIELDED = { weapon: 'steel_sword', shield: 'coppercap_shield', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' };

async function loadAll(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const play = await loadPlay(root);
  const X = { play, root,
    S: await import(u('src/data/grounds/shape.js')),
    BH: await import(u('src/data/boss-halls.js')),
    B: await import(u('src/data/boss-calls.js')),
    G: await import(u('src/data/hunt-grounds.js')),
    H: await import(u('src/data/hunts.js')),
    M: await import(u('src/data/monsters.js')),
    I: await import(u('src/data/items.js')),
    EM: (await import(u('src/data/monsters.js') + V)).MONSTERS,
    D: await import(u('src/core/hunt/damage.js') + V),
    P: await import(u('src/core/hunt/boss-phases.js') + V),
    L: await import(u('src/core/hunt/leash.js') + V),
    R: await import(u('src/core/hunt/boss-room.js') + V),
    GEN: await import(u('tools/gen-hunt-sessions.mjs')),
  };
  X.ground = hallGround(X.S.pocket);
  return X;
}

/* The fixture rows into every instance the engine and the settle read (the ?v= core's, the settle's, the generator's), and out again. */
async function withRows(root, fn) {
  const X = await loadAll(root);
  const insts = [X.EM, X.play.MONSTERS, X.M.MONSTERS];
  const put = (o) => { for (const m of insts) for (const [id, r] of Object.entries(o)) m[id] = JSON.parse(JSON.stringify(r)); };
  X.setRow = (id, o) => { for (const m of insts) Object.assign(m[id], o); };
  X.restore = () => put(ROWS);
  put(ROWS);
  try { return await fn(X); } finally { for (const m of insts) for (const id of Object.keys(ROWS)) delete m[id]; }
}

/* One fight to its end: the windows, the ends and every member's deltas. */
function fight(X, roles, o = {}) {
  const windows = [];
  X.play.run(ROOM, o.L || STRONG.L, roles, { ground: X.ground, spanMs: X.BH.BOSS_HALL_RULES.limitMs + 2 * MINUTE, windowMs: o.cut || 30000,
    secret: o.secret || '-4611686018427387904', leaveTogether: o.box !== false,
    equipment: o.equipment || ((role) => (role === 'tank' ? SHIELDED : role === 'mage' ? { weapon: 'oak_wand' } : role === 'healer' ? { weapon: 'oak_staff' } : (o.kit || STRONG.kit))),
    ...(o.bar ? { bar: o.bar } : {}), onWindow: (w) => windows.push(w) });
  const members = windows.flatMap((w) => w.members);
  const ended = {};
  for (const m of members) if (m.hunt.ended) ended[m.key] = m.hunt.ended;
  return { windows, members, ended };
}
const kindsOf = (f) => { const out = {}; for (const w of f.windows) for (const [u, r] of Object.entries(w.units || {})) out[u] = r[0]; return out; };
const eventsOf = (f) => f.windows.flatMap((w) => w.events || []);

/* ── THE ARMS ──────────────────────────────────────────────────────────────── */
const ARMS = {
  /* HL-ROW: the generator's own rules, on the fixture and on each defect. */
  async row(X) {
    const bad = [];
    const src = (o = {}) => hallSource(X.M.MONSTERS, X.ground, o);
    let r;
    try { r = X.GEN.catalogueRows(src()); } catch (e) { bad.push('HL-ROW the well-made hall was refused: ' + String(e.message).slice(0, 200)); return bad; }
    const row = r.bossHalls.find((h) => h.id === FROM);
    if (!row || row.hunt !== ROOM || row.monster !== BOSS || row.key !== KEY || row.limitMs !== X.BH.BOSS_HALL_RULES.limitMs) bad.push('HL-ROW the hall\'s row reads ' + JSON.stringify(r.bossHalls));
    for (const id of [BOSS, NAMED, ADD]) {
      const b = r.killBounds.find((k) => k.id === id);
      if (!b || !(b.xp > 0 && b.gold > 0 && Object.keys(b.drops).length)) bad.push('HL-ROW ' + id + '\'s kill bound pays nothing: ' + JSON.stringify(b));
    }
    if (!r.drops.some((d) => d.hunt === ROOM && d.item === 'bones')) bad.push('HL-ROW the room\'s drop bound misses its adds\' drops');
    if (r.travel.some((t) => t.id.includes(ADD) || t.id.includes(NAMED))) bad.push('HL-ROW an add got a single-foe fight of its own');
    if (!r.groundSpawns.some((s) => s.hunt === ROOM && s.monster === NAMED)) bad.push('HL-ROW the named add is not among the room\'s spawn rows (its kill bound base)');
    const pocketWith = (o) => ({ [ROOM]: { ...X.ground, pockets: [{ ...X.ground.pockets[0], ...o }] } });
    const DEFECTS = [
      /* (a row of its own, `_called` and marked so: the id rule holds, and it stands nowhere else) */
      ['a called row in the hall', { monsters: { hall_guard_called: { ...ROWS[ADD], called: true, xp: 0, gp: [0, 0], drops: [] } },
        hallGrounds: pocketWith({ adds: [...X.ground.pockets[0].adds, { monster: 'hall_guard_called', x: 54, y: 26 }] }) }],
      ['a named add with a wave', { monsters: { [NAMED]: { ...ROWS[NAMED], phases: { addsPm: 500, enragePm: 400, enrageAtkPm: 1300 } } } }],
      ['a named add with a guard', { monsters: { [NAMED]: { ...ROWS[NAMED], phases: { enragePm: 400, enrageAtkPm: 1300, guardPm: 800 } } } }],
      ['a plain add with lines', { monsters: { [ADD]: { ...ROWS[ADD], phases: { enragePm: 400, enrageAtkPm: 1300 } } } }],
      ['a hasted spell he does not cast', { monsters: { [BOSS]: { ...ROWS[BOSS], phases: { ...ROWS[BOSS].phases, hasten: { spell: 'squeal', cdPm: 500 } } } } }],
      ['a hasted spell that starts again before it lands', { monsters: { [BOSS]: { ...ROWS[BOSS], phases: { ...ROWS[BOSS].phases, hasten: { spell: FLARE, cdPm: 100 } } } } }],
      ['a hasten that speeds nothing', { monsters: { [BOSS]: { ...ROWS[BOSS], phases: { ...ROWS[BOSS].phases, hasten: { spell: FLARE, cdPm: 1000 } } } } }],
      ['a boss with no lines', { monsters: { [BOSS]: { ...ROWS[BOSS], phases: undefined } } }],
      ['a boss that is an add', { monsters: { [BOSS]: { ...ROWS[BOSS], add: true } } }],
      ['a room not named for its ground', { halls: { [FROM]: { ...HALL_ROW, hunt: 'fixture_room' } } }],
      ['a key that is no item', { halls: { [FROM]: { ...HALL_ROW, key: 'no_such_key' } } }],
      ['a hall on no open ground', { halls: { no_ground: { ...HALL_ROW, id: 'no_ground', hunt: 'no_ground_hall' } }, hallHunts: [{ ...HALL_HUNT, id: 'no_ground_hall' }], hallGrounds: { no_ground_hall: { ...X.ground, id: 'no_ground_hall', hunt: 'no_ground_hall', hall: 'no_ground' } } }],
      ['his boss stands alone no more', { hallGrounds: pocketWith({ spawns: [...X.ground.pockets[0].spawns, { monster: ADD, x: 54, y: 24 }] }) }],
      ['a room with no adds', { hallGrounds: pocketWith({ adds: [] }) }],
      ['a hall hunt with no hall', { halls: {} }],
    ];
    for (const [name, o] of DEFECTS) {
      try { X.GEN.catalogueRows(src(o)); bad.push('HL-ROW took ' + name); } catch { /* refused */ }
    }
    /* his rows on another ground, and adds on a ground that is no room */
    const open = X.G.OPEN_GROUNDS[FROM];
    const elsewhere = { ...open, pockets: open.pockets.map((p, i) => (i === 0 ? { ...p, spawns: [...p.spawns, { monster: NAMED, x: p.spawns[0].x, y: p.spawns[0].y }] } : p)) };
    try { X.GEN.catalogueRows({ ...src(), grounds: { ...X.G.OPEN_GROUNDS, [FROM]: elsewhere } }); bad.push('HL-ROW took the named add on the open ground too'); } catch { /* refused */ }
    const adds = { ...open, pockets: open.pockets.map((p, i) => (i === 0 ? { ...p, adds: [{ monster: ADD, x: p.spawns[0].x, y: p.spawns[0].y }] } : p)) };
    try { X.GEN.catalogueRows({ ...src(), grounds: { ...X.G.OPEN_GROUNDS, [FROM]: adds } }); bad.push('HL-ROW took adds on a ground that is no room'); } catch { /* refused */ }
    /* the hunts catalogue takes the room too (tools/gen-hunts.mjs): its row, and no spawn row (its one door is the verb) */
    const GH = await import(pathToFileURL(join(REPO, 'tools/gen-hunts.mjs')).href);
    try {
      const sql = GH.render([...X.H.OPEN_HUNTS, ...X.H.CALLED_HUNTS, HALL_HUNT, ...X.H.TRAINING_HUNTS], { ...X.M.MONSTERS });
      if (!sql.includes("'" + ROOM + "'")) bad.push('HL-ROW the hunts catalogue has no row for the room');
    } catch (e) { bad.push('HL-ROW the hunts catalogue refused the room: ' + String(e.message).slice(0, 160)); }
    /* the real tables: the OPEN halls and no other (a staged pack's hall is served nowhere), and the called rooms still read as calls */
    const realMonsters = Object.fromEntries(Object.entries(X.M.MONSTERS).filter(([id]) => !(id in ROWS)));
    const real = X.GEN.catalogueRows({ monsters: realMonsters });
    const openHalls = Object.keys(X.BH.OPEN_BOSS_HALLS).sort();
    if (real.bossHalls.map((h) => h.id).sort().join() !== openHalls.join()) bad.push('HL-ROW the real catalogue holds the halls ' + (real.bossHalls.map((h) => h.id).join() || 'none') + ', the open ones are ' + (openHalls.join() || 'none'));
    /* EVERY HALL IN THE DATA (Krell's Hall, src/data/grounds/krells_hold): while its pack is staged it stands in no served table and no page
       shows its door; and the generator takes it whole the day its pack opens (opened here: the pack's hunt and ground, and its hall). */
    for (const h of Object.values(X.BH.BOSS_HALLS)) {
      const staged = X.H.HUNT_INDEX[h.hunt] && X.H.HUNT_INDEX[h.hunt].staged === true;
      if (staged !== (X.H.HUNT_INDEX[h.id] && X.H.HUNT_INDEX[h.id].staged === true)) bad.push('HL-ROW the hall ' + h.id + ' and its ground disagree on staged');
      if (staged) {
        const served = [real.bossHalls.some((r) => r.id === h.id) && 'hr_boss_halls', real.travel.some((t) => t.id === h.hunt) && 'hr_hunt_travel',
          real.grounds.some((g) => g.hunt === h.hunt || g.id === h.hunt) && 'hr_hunt_grounds', real.groundSpawns.some((s) => s.hunt === h.hunt) && 'hr_hunt_ground_spawns'].filter(Boolean);
        if (served.length) bad.push('HL-ROW the staged hall ' + h.id + ' is served in ' + served.join(', '));
        /* the committed catalogues themselves (rendered on the whole view, tools/pack/whole.mjs: an unshipped pack is not in them): no line
           names the staged room or one of its rows */
        const g = X.G.HALL_GROUNDS[h.hunt];
        const names = [h.hunt, ...new Set(g.pockets[0].spawns.concat(g.pockets[0].adds).map((s) => s.monster))];
        for (const f of [X.GEN.OUT_NAME, GH.OUT_NAME]) {
          const sql = readFileSync(join(REPO, 'supabase', 'migrations', f), 'utf8');
          const hit = names.filter((n) => sql.includes('\'' + n + '\''));
          if (hit.length) bad.push('HL-ROW the staged hall ' + h.id + ' is in ' + f + ': ' + hit.join(', '));
        }
        if (X.BH.hallFromGround(h.id) !== null) bad.push('HL-ROW the staged hall ' + h.id + ' shows a door on its ground\'s page');
      } else if (!X.BH.hallFromGround(h.id)) bad.push('HL-ROW the open hall ' + h.id + ' shows no door');
      if (X.BH.hallOfHunt(h.hunt) !== h || (X.R.roomOf(X.G.HALL_GROUNDS[h.hunt]) || {}).kind !== 'hall') bad.push('HL-ROW the engine does not read ' + h.hunt + ' as a hall');
      let opened = null;
      try {
        opened = X.GEN.catalogueRows({ monsters: realMonsters, hunts: [...X.H.OPEN_HUNTS.filter((x) => x.id !== h.id), { ...X.H.HUNT_INDEX[h.id], staged: undefined }],
          grounds: { ...X.G.OPEN_GROUNDS, [h.id]: X.G.HUNT_GROUNDS[h.id] },
          hallHunts: [...X.H.OPEN_HALL_HUNTS.filter((x) => x.id !== h.hunt), { ...X.H.HUNT_INDEX[h.hunt], staged: undefined }],
          hallGrounds: { ...X.G.OPEN_HALL_GROUNDS, [h.hunt]: X.G.HALL_GROUNDS[h.hunt] }, halls: { ...X.BH.OPEN_BOSS_HALLS, [h.id]: h } });
      } catch (e) { bad.push('HL-ROW the hall ' + h.id + ' would be refused the day its pack opens: ' + String(e.message).slice(0, 220)); }
      if (opened) {
        const r = opened.bossHalls.find((x) => x.id === h.id), boss = X.BH.hallBossOf(X.G.HALL_GROUNDS[h.hunt]);
        if (!r || r.hunt !== h.hunt || r.monster !== boss || r.key !== h.key) bad.push('HL-ROW opened, the hall ' + h.id + ' reads ' + JSON.stringify(r));
        const b = opened.killBounds.find((k) => k.id === boss);
        if (!b || !(b.xp > 0 && b.gold > 0 && Object.keys(b.drops).length)) bad.push('HL-ROW opened, ' + boss + '\'s kill bound pays nothing: ' + JSON.stringify(b));
      }
    }
    for (const c of Object.values(X.B.BOSS_CALLS)) {
      const room = X.BH.roomOfHunt(c.hunt);
      if (!room || room.kind !== 'call' || room.monster !== c.monster) bad.push('HL-ROW the call ' + c.id + ' reads as ' + JSON.stringify(room));
      const g = X.G.CALLED_GROUNDS[c.hunt];
      if ((X.R.roomOf(g) || {}).kind !== 'call') bad.push('HL-ROW the engine reads ' + c.hunt + ' as ' + JSON.stringify(X.R.roomOf(g)));
    }
    const hr = X.R.roomOf(X.ground);
    if (!hr || hr.kind !== 'hall' || hr.monster !== BOSS || hr.limitMs !== X.BH.BOSS_HALL_RULES.limitMs) bad.push('HL-ROW the engine reads the hall as ' + JSON.stringify(hr));
    if (X.R.roomOf(open) !== null) bad.push('HL-ROW the engine reads an open ground as a room');
    return bad;
  },

  /* HL-PAY, HL-FELLED, HL-RECORD: a party that wins, cut three ways. */
  win(X) {
    const bad = [];
    const roles = ['tank', 'healer', 'melee_dps', 'mage'];
    const cuts = [10000, 30000, 4 * MINUTE].map((cut) => fight(X, roles, { cut }));
    const f = cuts[1];
    if (Object.keys(f.ended).length !== roles.length) bad.push('HL-FELLED ' + Object.keys(f.ended).length + ' of ' + roles.length + ' ended');
    for (const e of Object.values(f.ended)) if (e.reason !== 'boss_felled') bad.push('HL-FELLED ended ' + e.reason);
    const key = (x) => JSON.stringify(Object.entries(x.ended).sort());
    for (const x of cuts) if (key(x) !== key(f)) bad.push('HL-FELLED the cuts disagree: ' + key(x) + ' against ' + key(f));
    const k = kindsOf(f), ev = eventsOf(f);
    const killed = ev.filter((e) => e.type === 'kill').map((e) => k[e.t]);
    if (!killed.includes(BOSS)) bad.push('HL-PAY CONTROL: the boss never fell');
    if (!killed.includes(ADD) && !killed.includes(NAMED)) bad.push('HL-PAY CONTROL: no add fell, so an add\'s pay was never read');
    /* HL-PAY: what the deltas say, summed over the party */
    let lx = 0, coin = 0;
    const items = {};
    for (const m of f.members) {
      lx += m.delta.level_xp || 0; coin += m.delta.gold || 0;
      for (const [id, n] of Object.entries(m.delta.items || {})) items[id] = (items[id] || 0) + n;
    }
    if (!(lx >= ROWS[BOSS].xp)) bad.push('HL-PAY the party took ' + lx + ' Level XP, the boss alone is ' + ROWS[BOSS].xp);
    if (!(coin >= ROWS[BOSS].gp[0])) bad.push('HL-PAY the party took ' + coin + ' coin');
    if (!(items.big_bones >= 1)) bad.push('HL-PAY the boss\'s sure drop never came: ' + JSON.stringify(items));
    if (!(items.bones >= 1)) bad.push('HL-PAY an add\'s sure drop never came: ' + JSON.stringify(items));
    const counted = f.members.flatMap((m) => m.delta.progress || []).filter((op) => op.key === 'ev:kill_monster:' + BOSS).length;
    if (counted < roles.length) bad.push('HL-PAY the boss\'s kill counter moved ' + counted + ' times for ' + roles.length + ' heroes');
    /* HL-RECORD: every window of every hero carries one, and the last says he is down */
    for (const w of f.windows) for (const m of w.members) {
      const rec = m.analyzer && m.analyzer.fight;
      if (!rec || !Number.isInteger(rec.boss_pm) || typeof rec.fired !== 'object') { bad.push('HL-RECORD a window of ' + m.key + ' has no record: ' + JSON.stringify(m.analyzer || null).slice(0, 120)); break; }
    }
    const last = f.windows[f.windows.length - 1].members.map((m) => (m.analyzer && m.analyzer.fight ? m.analyzer.fight.boss_pm : null));
    if (!last.every((pm) => pm === 0)) bad.push('HL-RECORD the last window says he stood at ' + last.join());
    return bad;
  },

  /* HL-DEATH and HL-TIME. */
  ends(X) {
    const bad = [];
    /* a death: one hero far too low, in nothing, dies to his blows, and the other's fight ends with it, box unticked; he is far from down */
    X.setRow(BOSS, { hp: 100000 });
    try {
      const f = fight(X, ['tank', 'healer'], { L: [70, 1], box: false, equipment: (role, seat) => (seat === 1 ? {} : SHIELDED) });
      const reasons = Object.values(f.ended).map((e) => e.reason).sort();
      if (reasons.join() !== 'died,party_member_died' && reasons.join() !== 'died,died') bad.push('HL-DEATH ended ' + reasons.join());
      const at = new Set(Object.values(f.ended).map((e) => e.at));
      if (at.size !== 1) bad.push('HL-DEATH two instants: ' + [...at].join());
    } finally { X.restore(); }
    /* the limit: a boss nobody can finish, his adds too */
    X.setRow(BOSS, { hp: 100000000, atk: 1, baseAcc: 0 });
    X.setRow(NAMED, { hp: 10000000, atk: 1, baseAcc: 0 });
    X.setRow(ADD, { hp: 10000000, atk: 1, baseAcc: 0 });
    try {
      const f = fight(X, ['tank', 'healer'], { cut: 60000 });
      const ends = Object.values(f.ended);
      if (ends.length !== 2 || !ends.every((e) => e.reason === 'boss_time' && Date.parse(e.at) === T0 + X.BH.BOSS_HALL_RULES.limitMs)) bad.push('HL-TIME ended ' + JSON.stringify(f.ended));
    } finally { X.restore(); }
    return bad;
  },

  /* HL-RESET: a leash reset on the hall moves nothing. */
  reset(X) {
    const bad = [];
    const boss = { id: 2, side: 'mon', kind: BOSS, pocket: 0, alive: true, hp: 1200, maxHp: 3500, x: 55, y: 23, home: [55, 23], target: 7, statuses: [] };
    const inst = { world: { units: [boss], packs: [{ aggro: true, holder: 7 }] }, ground: X.ground, heroes: {} };
    const sc = { atMs: 0, emit: () => {} };
    X.L.resetPack(inst, 0, sc);
    if (boss.hp !== 1200 || boss.target !== 7 || inst.world.packs[0].aggro !== true) bad.push('HL-RESET a reset healed or freed him: ' + JSON.stringify({ hp: boss.hp, target: boss.target, pack: inst.world.packs[0] }));
    return bad;
  },

  /* HL-NAMED (piece 6). */
  named(X) {
    const bad = [];
    /* the guard: a blow on the boss while the named add stands lands his guard's share, all of it once he is down */
    const blow = (up) => {
      const boss = { id: 2, side: 'mon', kind: BOSS, pocket: 0, alive: true, hp: 1000000, maxHp: 1000000, x: 55, y: 23, statuses: [] };
      const cap = { id: 3, side: 'mon', kind: NAMED, pocket: 0, alive: up, hp: up ? 100 : 0, maxHp: 600, x: 56, y: 23, statuses: [] };
      const inst = { world: { units: [boss, cap], packs: [{}] }, ground: X.ground, heroes: {} };
      return X.D.landHit(inst, { atMs: 0, emit: () => {}, rng: null }, null, boss, 100000, null, null).dmg;
    };
    const up = blow(true), down = blow(false);
    if (!(up < down && Math.abs(up * 1000 - down * ROWS[BOSS].phases.guardPm) <= 1000)) bad.push('HL-NAMED the named add shields him to ' + up + ' of ' + down);
    /* a fight long enough to see his kit: the boss soft on the hit and slow to fall */
    X.setRow(BOSS, { hp: 9000, atk: 1, baseAcc: 0 });
    try {
      const f = fight(X, ['tank', 'healer', 'melee_dps', 'mage']);
      const k = kindsOf(f), ev = eventsOf(f);
      const waves = ev.filter((e) => e.type === 'boss_phase' && e.phase === 'adds');
      if (waves.length !== 1 || k[waves[0].u] !== BOSS) bad.push('HL-NAMED ' + waves.length + ' waves came, from ' + waves.map((e) => k[e.u]).join());
      const caps = Object.keys(k).filter((u) => k[u] === NAMED), guards = Object.keys(k).filter((u) => k[u] === ADD);
      if (caps.length !== 1 || guards.length !== 2) bad.push('HL-NAMED the wave was ' + caps.length + ' named and ' + guards.length + ' plain adds');
      const cap = Number(caps[0]);
      if (!ev.some((e) => e.type === 'spell' && e.u === cap && e.spell === NAMED_SPELL)) bad.push('HL-NAMED the named add never cast his own spell');
      const rage = ev.filter((e) => e.type === 'boss_phase' && e.u === cap);
      if (rage.map((e) => e.phase).join() !== 'enrage') bad.push('HL-NAMED the named add\'s own lines fell as ' + (rage.map((e) => e.phase).join() || 'nothing') + ', want his enrage once');
      if (!ev.some((e) => e.type === 'kill' && e.t === cap)) bad.push('HL-NAMED CONTROL: the named add never fell');
      const capKills = f.members.flatMap((m) => m.delta.progress || []).filter((op) => op.key === 'ev:kill_monster:' + NAMED).length;
      if (!capKills) bad.push('HL-NAMED the named add\'s kill reached no counter');
      const capCoin = f.members.reduce((n, m) => n + ((m.delta.items || {}).bones || 0), 0);
      if (!capCoin) bad.push('HL-NAMED no add\'s drop came');
    } finally { X.restore(); }
    return bad;
  },

  /* HL-HASTE (piece 7). */
  haste(X) {
    const bad = [];
    const flareCd = 20000, hasted = Math.floor((flareCd * ROWS[BOSS].phases.hasten.cdPm) / 1000);
    /* (a) the wait read at a start */
    const at = (hp) => ({ kind: BOSS, hp, maxHp: 1000 });
    if (X.P.spellCdOf(at(260), FLARE, flareCd) !== flareCd) bad.push('HL-HASTE above his line the flare waits ' + X.P.spellCdOf(at(260), FLARE, flareCd));
    if (X.P.spellCdOf(at(250), FLARE, flareCd) !== hasted) bad.push('HL-HASTE on his line the flare waits ' + X.P.spellCdOf(at(250), FLARE, flareCd));
    if (X.P.spellCdOf(at(100), CONE, 14000) !== 14000) bad.push('HL-HASTE under his line another spell waits ' + X.P.spellCdOf(at(100), CONE, 14000));
    if (X.P.spellCdOf({ kind: NAMED, hp: 1, maxHp: 1000 }, NAMED_SPELL, 12000) !== 12000) bad.push('HL-HASTE a row with no hasten waits less');
    /* (b) the wait running at the crossing: cut once to the hasted wait, never raised, never cut twice */
    const cross = (cds, from, to) => {
      const t = { id: 2, side: 'mon', kind: BOSS, pocket: 0, alive: true, hp: to, maxHp: 1000, spellCds: { ...cds } };
      X.P.crossLines({ world: { units: [t], packs: [{}] }, ground: X.ground }, { atMs: 0, emit: () => {} }, t, from);
      return t.spellCds;
    };
    let c = cross({ [FLARE]: 18000, [CONE]: 9000 }, 300, 200);
    if (c[FLARE] !== hasted || c[CONE] !== 9000) bad.push('HL-HASTE the crossing left ' + JSON.stringify(c));
    c = cross({ [FLARE]: 3000 }, 300, 200);
    if (c[FLARE] !== 3000) bad.push('HL-HASTE the crossing raised a short wait to ' + c[FLARE]);
    c = cross({ [FLARE]: 18000 }, 300, 280);
    if (c[FLARE] !== 18000) bad.push('HL-HASTE a blow above the line cut the wait to ' + c[FLARE]);
    /* (c) in a fight: the boss lives long under his line, the party lives through his flares */
    X.setRow(BOSS, { hp: 60000, atk: 1, baseAcc: 0, phases: { ...ROWS[BOSS].phases, addsPm: 950, enragePm: 700 } });
    X.setRow(NAMED, { hp: 60, atk: 1, baseAcc: 0 });
    X.setRow(ADD, { hp: 60, atk: 1, baseAcc: 0 });
    try {
      const runs = [10000, 30000, 90000].map((cut) => fight(X, ['tank', 'healer', 'melee_dps', 'mage'], { cut }));
      const flaresOf = (f) => { const k = kindsOf(f); return eventsOf(f).filter((e) => e.type === 'spell' && k[e.u] === BOSS && e.spell === FLARE).map((e) => e.atMs); };
      const f = runs[1];
      const k = kindsOf(f), ev = eventsOf(f);
      const rage = ev.find((e) => e.type === 'boss_phase' && e.phase === 'enrage' && k[e.u] === BOSS);
      const flares = flaresOf(f);
      if (!rage) bad.push('HL-HASTE CONTROL: he never crossed his line');
      else {
        const before = flares.filter((t) => t < rage.atMs), after = flares.filter((t) => t > rage.atMs);        for (let i = 1; i < before.length; i++) if (before[i] - before[i - 1] < flareCd) bad.push('HL-HASTE above the line two flares ' + (before[i] - before[i - 1]) + ' ms apart');
        for (let i = 1; i < after.length; i++) if (after[i] - after[i - 1] < hasted) bad.push('HL-HASTE under the line two flares ' + (after[i] - after[i - 1]) + ' ms apart');
        if (after.length < 3) bad.push('HL-HASTE CONTROL: only ' + after.length + ' flares under his line');
        else if (!after.slice(1).some((t, i) => t - after[i] < flareCd)) bad.push('HL-HASTE under the line the flares never came faster: ' + after.map((t, i) => (i ? t - after[i - 1] : 0)).join());
        if (after.length && after[0] - rage.atMs > hasted + 5000) bad.push('HL-HASTE the first flare under the line came ' + (after[0] - rage.atMs) + ' ms after it: the running wait was not cut');
        if (before.length < 2) bad.push('HL-HASTE CONTROL: only ' + before.length + ' flares above his line');
      }
      for (const x of runs) if (flaresOf(x).join() !== flares.join()) bad.push('HL-HASTE the cuts disagree on the flares: ' + flaresOf(x).length + ' against ' + flares.length);
    } finally { X.restore(); }
    return bad;
  },
};

async function guard(root) {
  return withRows(root, async (X) => {
    const bad = [];
    const only = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
    /* an arm that throws is that arm red (a planted engine that crashes on a hall is as broken as one that pays nothing) */
    const TAG = { row: 'HL-ROW', win: 'HL-FELLED', ends: 'HL-TIME', reset: 'HL-RESET', named: 'HL-NAMED', haste: 'HL-HASTE' };
    for (const [name, arm] of Object.entries(ARMS)) {
      if (only && name !== only) continue;
      try { bad.push(...await arm(X)); } catch (e) { bad.push(TAG[name] + ' threw: ' + String(e && e.message).slice(0, 160)); }
    }
    return bad;
  });
}

const MUTANTS = [
  { name: 'a hall is no room', edits: [['src/core/hunt/boss-room.js', '  if (ground.hall) {', '  if (false) {']], want: /HL-FELLED|HL-TIME|HL-ROW/ },
  { name: 'a hall resets', edits: [['src/core/hunt/leash.js', '  if (inst.ground && inst.ground.hall) return;\n', '']], want: /HL-RESET/ },
  { name: 'only a call\'s boss ends the fight', edits: [['src/core/combat-sim.js', 'if (room && r.events.some(', 'if (call && r.events.some(']], want: /HL-FELLED|HL-PAY/ },
  { name: 'a hall pays like a call', edits: [['src/core/combat-sim.js', 'hearthfind: ctx.hearthfind, call,', 'hearthfind: ctx.hearthfind, call: call || (room && room.kind === \'hall\' ? room : null),']], want: /HL-PAY/ },
  { name: 'the limit is a call\'s only', edits: [['src/core/combat-sim.js', '  if (room) {\n', '  if (call) {\n']], want: /HL-TIME|HL-DEATH/ },
  { name: 'the record is a call\'s only', edits: [['supabase/functions/hr-accrue/accrual.js', '} else if (inp.ground.hall && Number.isInteger(summary.unitIdEver)) {', '} else if (false) {']], want: /HL-RECORD/ },
  { name: 'the hasted spell waits its whole cooldown', edits: [['src/core/hunt/boss-phases.js', '  return hastened(cdMs, h);\n}', '  return cdMs;\n}']], want: /HL-HASTE/ },
  { name: 'the crossing cuts no running wait', edits: [['src/core/hunt/boss-phases.js', '    hastenNow(t, ph);\n', '']], want: /HL-HASTE/ },
  { name: 'the crossing raises a short wait', edits: [['src/core/hunt/boss-phases.js', '  if (left > top) t.spellCds', '  if (left > 0) t.spellCds']], want: /HL-HASTE/ },
  { name: 'every spell speeds up', edits: [['src/core/hunt/boss-phases.js', "if (!h || h.spell !== id || !atOrUnder(u.hp, u.maxHp, ph.enragePm)) return cdMs;", 'if (!h || !atOrUnder(u.hp, u.maxHp, ph.enragePm)) return cdMs;']], want: /HL-HASTE/ },
  { name: 'the start reads the row\'s cooldown', edits: [['src/core/hunt/monster-spells.js', '{ [id]: spellCdOf(u, id, sp.cdMs) }', '{ [id]: sp.cdMs }']], want: /HL-HASTE/ },
  { name: 'a named add may bring a wave', edits: [['tools/gen-hunt-sessions.mjs', "const NAMED_ADD_PHASES = Object.freeze(['enragePm', 'enrageAtkPm']);", "const NAMED_ADD_PHASES = Object.freeze(['enragePm', 'enrageAtkPm', 'addsPm', 'guardPm']);"]], want: /HL-ROW/ },
  { name: 'the hasted wait may outrun its windup', edits: [['tools/gen-hunt-sessions.mjs', '    if (!(Math.floor((sp.cdMs * h.cdPm) / 1000) > sp.windupMs)) throw', '    if (false) throw']], want: /HL-ROW/ },
  { name: 'a called row may stand in a hall', edits: [['tools/gen-hunt-sessions.mjs', "if (!a || a.add !== true || a.called === true) throw", "if (!a || a.add !== true) throw"], ['tools/gen-hunt-sessions.mjs', "      if (!g.call && S.monsters[id] && S.monsters[id].called === true) throw", "      if (!g.call && !g.hall && S.monsters[id] && S.monsters[id].called === true) throw"]], want: /HL-ROW/ },
  { name: 'a hall\'s rows may stand on another ground', edits: [['tools/gen-hunt-sessions.mjs', "if (mine.has(s.monster)) throw new Error(`hall ${h.id}'s ${s.monster} stands on ${o.id} too`);", "if (false) throw new Error('');"]], want: /HL-ROW/ },
  { name: 'an add\'s drops are no room\'s drops', edits: [['tools/gen-hunt-sessions.mjs', '.concat(p.spawns || [], p.adds || [])) mons.add(s.monster);', '.concat(p.spawns || [])) mons.add(s.monster);']], want: /HL-ROW/ },
  /* THE REAL HALL (Krell's, staged with its pack): hidden while staged, and held to the generator's rules for the day it opens */
  { name: 'a staged hall shows its door', edits: [['src/data/boss-halls.js', 'return Object.values(OPEN_BOSS_HALLS).find((h) => h.id === huntId) || null;', 'return rows().find((h) => h.id === huntId) || null;']], want: /HL-ROW the staged hall \w+ shows a door/ },
  { name: 'a staged hall is among the served halls', edits: [['src/data/boss-halls.js', '.filter(([, h]) => !(HUNT_INDEX[h.hunt] && HUNT_INDEX[h.hunt].staged === true))', '.filter(() => true)']], want: /HL-ROW/ },
  { name: 'a staged hall\'s room is a served hunt', edits: [['src/data/hunts.js', 'export const OPEN_HALL_HUNTS = Object.freeze(HALL_HUNTS.filter((h) => h.staged !== true));', 'export const OPEN_HALL_HUNTS = HALL_HUNTS;']], want: /HL-ROW/ },
  { name: 'Krell hastens a spell that is not his', edits: [['src/data/grounds/krells_hold/pack.js', "hasten: { spell: 'hall_fire', cdPm: 500 }", "hasten: { spell: 'squeal', cdPm: 500 }"]], want: /HL-ROW the hall krells_hold would be refused/ },
  { name: 'Captain Hask brings a wave of his own in the hall', edits: [['src/data/grounds/krells_hold/pack.js', 'drops: [], phases: { enragePm: 250, enrageAtkPm: 1150 } },', 'drops: [], phases: { addsPm: 500, enragePm: 250, enrageAtkPm: 1150 } },']], want: /HL-ROW/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) {
      const bad = await guard(REPO);
      console.log('boss-hall --mutate: control ran the clean tree: ' + (bad.length ? bad.join('; ') : 'green'));
      process.exit(0);
    }
    let escaped = 0;
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    for (const m of list) {
      const { root, done } = plant(m.edits, TREES);
      let got = [];
      try { got = await guard(root); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 160)]; }
      finally { done(); }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every check held').slice(0, 140));
    }
    console.log(escaped ? 'boss-hall --mutate: ' + escaped + ' ESCAPED' : 'boss-hall --mutate: ' + list.length + '/' + list.length + ' caught');
    process.exit(escaped ? 1 : 0);
  }
  const bad = await guard(REPO);
  for (const p of bad) console.log('FAIL  ' + p);
  console.log(bad.length ? 'boss-hall: ' + bad.length + ' FAILED' : 'boss-hall: green (the rules, the pay, the three ends, no reset, the record, the named add, the hasted flare, every cut)');
  process.exit(bad.length ? 1 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
