// tests/hunt-core/sewer.mjs — THE MILLRACE SEWER AND ITS TUTORIAL, PLAYED (week plan item 17). Run by run-all.mjs.
//
//   sewer-on-the-map       every seat and spawn of both grounds stands on open floor of its
//                          world map, and every spawn is also listed in the map's `spawns`
//   formation-rows         the six sewer rows pass the roster audit on the formation band,
//                          walk at their own speed, and only the Rat King is a boss
//   party-scale            550 / 700 / 850 / 1000 permille, and the solo Healer floor
//   sewer-full-party-loop  a four-hero party plays the real core (stepSwing) on the real map:
//                          every pocket is pulled in route order, the Rat King dies, nobody wipes
//   tutorial-walk-through  each step is doable from the start kit plus the steps before it
//
// The loop case prints its measured clear times and kills (the evidence a balance claim needs).
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadCore, makeReport, ROOT } from './fixtures/h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const SEWER = ['drain_rat', 'sump_slime', 'culvert_bat', 'cistern_spider', 'kobold_tosher', 'rat_king'];

async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.maps = await imp('src/data/world/maps/index.js');
  M.terrain = await imp('src/data/world/terrain.js');
  M.mapc = await imp('src/world/core/map-compile.js');
  M.sets = await imp('src/data/world/atlas-sets.js');
  M.classes = await imp('src/data/monster-classes.js');
  M.tut = await imp('src/data/hunt-tutorial.js');
  M.kit = await imp('src/data/start-kit.js');
  M.xp = await imp('src/core/xp.js');
  M.supplies = await imp('src/data/supplies.js');
  M.roles = await imp('src/data/hunt-roles.js');
  M.hs = await imp('src/core/hunt-spawn.js');
  M.ws = await imp('src/core/hunt/world-step.js');
  M.basics = await imp('src/data/supply-basics.js');
  M.art = await imp('src/data/monster-art.js');
  M.cond = await imp('src/core/hunt/conditions.js');
  return M;
}

/* The walkable mask of a world map (sprites are not needed: only solid MATERIALS and solid props block,
   read from every atlas the renderer loads). */
function maskOf(M, mapId) {
  const row = M.maps.WORLD_MAPS.find((m) => m.id === mapId);
  if (!row) return null;
  const sprites = {};
  for (const set of M.sets.ATLAS_SETS) {
    Object.assign(sprites, JSON.parse(readFileSync(join(M.root, 'assets/world/atlas-' + set + '.json'), 'utf8')).sprites);
  }
  const map = M.mapc.compileMap(row, { materials: M.terrain.MATERIALS, sprites, openClasses: M.terrain.OPEN_CLASSES, lights: {} });
  return { row, map, open: (x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h && map.mask[y * map.w + x] === 0 };
}

/* The hunt grid of a world map: walk = open floor; sight is blocked by rock, not by water. */
function gridOf(M, mapId) {
  const m = maskOf(M, mapId);
  const opaque = (x, y) => { const mat = M.terrain.MATERIALS[m.map.ground[y * m.map.w + x]]; return !!(mat && mat.solid && !mat.flat); };
  return M.grid.makeGrid(m.map.w, m.map.h, (x, y) => m.open(x, y), opaque);
}

/* The party the sim measured (combat-data.js HEROES, BALANCE_RULINGS): role, basic max hit, its element. */
const PARTY = [
  { role: 'tank', maxHit: 9, element: '', bar: ['challenge', 'flame_strike', 'power_strike'], disc: 'shield' },
  { role: 'ranger', maxHit: 8, element: '', bar: ['hunters_mark', 'flame_volley', 'precision_shot'], ammo: 'iron_bolts' },
  { role: 'mage', maxHit: 7, element: '', bar: ['fireball', 'arcane_barrier'] },
  { role: 'healer', maxHit: 5, element: 'poison', bar: ['greater_mend', 'circle_of_renewal', 'natures_wrath'] },
];

function session(M, p) {
  return M.AR.newHuntSession({
    id: 'sewer-' + p.role, huntFromMs: 0, bag: { fire_rune: { loaded: 400 }, ...(p.ammo ? { [p.ammo]: { loaded: 2000 } } : {}) },
    slots: [{ item: '*heal_shop', on: true, conditions: [] }, { item: '*mana_shop', on: true, conditions: [] }],
    /* The REAL tier-1 store rows (supply-basics.js), so the supply bill is the game's. */
    basics: Object.fromEntries(['salted_shrimp', 'thin_turnip_juice', 'plain_iron_bolts'].map((id) => {
      const b = M.basics.BASIC_INDEX[id];
      return [id, { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner }];
    })),
    shop: { heal: 'salted_shrimp', mana: 'thin_turnip_juice' }, purse: 1000000, goldFloor: 0, supplySource: 'mine', onEmpty: 'switch',
  });
}

/** Play a ground for `swings` with `party`; answers what happened, pocket by pocket. */
function playSewer(M, party, swings, seed, groundId) {
  const ground = M.grounds.HUNT_GROUNDS[groundId || 'millrace_sewer'];
  const grid = gridOf(M, ground.map);
  const world = M.hs.newHuntWorld(ground, grid, party.map((p) => ({ role: p.role, maxHp: M.roles.HUNT_ROLES[p.role].hp,
    acc: p.acc || 850, maxHit: p.maxHit, def: 0, element: p.element })));
  const heroes = {};
  party.forEach((p, i) => {
    const u = world.units[i];
    u.mana = u.maxMana = M.roles.HUNT_ROLES[p.role].mana;
    heroes[u.id] = { hs: session(M, p), slots: M.cond.heroSlots(p.bar, null), actionSet: 'hunt', range: M.roles.HUNT_ROLES[p.role].range, ammo: p.ammo || null };
  });
  const out = { pulls: [], kills: {}, wipes: 0, falls: 0, kingDead: false, swings: 0, loops: 0 };
  let pullAt = null;
  for (let s = 0; s < swings; s++) {
    const r = M.ws.stepSwing(world, { fight: false, ground, grid, heroes, swingMs: 2000, atMs: s * 2000,
      rng: M.rng.createRng(M.rng.hashSeed('sewer', seed, s)) });
    for (const ev of r.events) {
      if (ev.type === 'pull') { pullAt = ev.atMs; out.pulls.push({ pocket: ev.pocket, at: ev.atMs, clearS: null }); }
      if (ev.type === 'kill') {
        const t = world.units.find((u) => u.id === ev.t);
        if (t && t.side === 'mon') { out.kills[t.kind] = (out.kills[t.kind] || 0) + 1; if (t.kind === 'rat_king') out.kingDead = true; }
        if (t && t.side === 'hero') out.falls++;
      }
      if (ev.type === 'wipe') out.wipes++;
    }
    out.swings = s + 1;
    out.loops = world.runs || 0;
    if (out.loops >= 1) break;
  }
  for (let i = 0; i < out.pulls.length; i++) {
    const next = out.pulls[i + 1];
    out.pulls[i].clearS = next ? Math.round((next.at - out.pulls[i].at) / 1000) : null;
  }
  void pullAt;
  /* Supplies spent (store gold + own lines at book value) and loot value (coin mean + drop chance x book value). */
  let supply = 0;
  out.bought = {};
  for (const h of Object.values(heroes)) {
    supply += 1000000 - h.hs.purse;
    for (const [id, n] of Object.entries((h.hs.tally && h.hs.tally.bought) || {})) out.bought[id] = (out.bought[id] || 0) + n;
    for (const [id, l] of Object.entries(h.hs.bag)) {
      supply += (l.loaded - l.left) * ((M.ITEMS[id] && M.ITEMS[id].v) || 0);
      out.used = out.used || {};
      out.used[id] = (out.used[id] || 0) + Math.round((l.loaded - l.left) * 3600 / (out.swings * 2));
    }
  }
  /* The same consumption at the RULED prices (BALANCE_RULINGS round 2: runes 6 g, bolts 1 g, mana 0.06 g a
     point; food at the sim's Ham, 3 g for 70 HP): the bill the sewer's income is balanced against. */
  let ruled = 0;
  for (const h of Object.values(heroes)) {
    for (const [id, l] of Object.entries(h.hs.bag)) ruled += (l.loaded - l.left) * (id === 'fire_rune' ? 6 : 1);
  }
  for (const [id, n] of Object.entries(out.bought)) {
    const b = M.basics.BASIC_INDEX[id];
    ruled += b.kind === 'mana' ? n * b.mana * 0.06 : b.kind === 'heal' ? n * b.heals * 3 / 70 : n * 1;
  }
  let coin = 0, common = 0, rare = 0;
  for (const [kind, n] of Object.entries(out.kills)) {
    const m = M.MONSTERS[kind];
    coin += n * (m.gp[0] + m.gp[1]) / 2;
    /* rare = under 5%, or the boss's chase item (the Crown Shard is the profit, whatever its rate) */
    for (const d of m.drops) {
      const val = n * d.ch * M.ITEMS[d.id].v;
      if (d.ch < 0.05 || (m.boss && d.ch < 1 && d.id === 'crown_shard')) rare += val; else common += val;
    }
  }
  const perH = 3600 / (out.swings * 2);
  Object.assign(out, { ruledH: Math.round(ruled * perH), supplyH: Math.round(supply * perH), coinH: Math.round(coin * perH), commonH: Math.round(common * perH),
    rareH: Math.round(rare * perH), kingsH: +(perH * (out.kills.rat_king || 0)).toFixed(1) });
  return out;
}

const cases = {
  'sewer-on-the-map': (M) => {
    for (const g of Object.values(M.grounds.HUNT_GROUNDS)) {
      const m = maskOf(M, g.map);
      if (!m) return g.id + ': map ' + g.map + ' is not a world map';
      if (!m.row.hunts.includes(g.hunt)) return g.id + ': map ' + g.map + ' does not render hunt ' + g.hunt;
      for (const [x, y] of g.start) if (!m.open(x, y)) return g.id + ': seat ' + x + ',' + y + ' is not open floor';
      for (const p of g.pockets) {
        for (const s of p.spawns) {
          if (!m.open(s.x, s.y)) return g.id + ': ' + s.monster + ' at ' + s.x + ',' + s.y + ' is not open floor';
          if (g.map === 'millrace_sewer' && !m.row.spawns.some(([x, y]) => x === s.x && y === s.y)) {
            return g.id + ': spawn ' + s.x + ',' + s.y + ' is missing from the map row\'s spawns';
          }
        }
      }
    }
    return null;
  },
  'formation-rows': (M) => {
    const bad = M.classes.auditRoster(M.MONSTERS);
    if (bad.length) return 'roster audit: ' + bad.join('; ');
    for (const id of SEWER) {
      const m = M.MONSTERS[id];
      if (!m) return id + ' is not a monster row';
      if (m.formation !== true) return id + ' is not a formation row';
      if (!Number.isInteger(m.speed) || m.speed <= 0) return id + ' has no speed';
      if ((m.boss === true) !== (id === 'rat_king')) return id + ': only the Rat King is a boss';
      for (const d of m.drops) if (!M.ITEMS[d.id]) return id + ' drops unknown item ' + d.id;
    }
    /* every monster a pocket spawns has walk art that exists */
    /* a monster drawn with a sim unit (HUNT_WALK_ART) needs that unit in the PixelLab manifest; one ported
       straight into the world atlases (the cellar's Hive Wasp, the 10-18 grounds) needs its own 8-facing walk there */
    const units = JSON.parse(readFileSync(join(M.root, 'prototypes/hunt-sim-assets/manifest.json'), 'utf8')).units;
    const atlas = {};
    for (const set of M.sets.ATLAS_SETS) Object.assign(atlas, JSON.parse(readFileSync(join(M.root, 'assets/world/atlas-' + set + '.json'), 'utf8')).sprites);
    const walks = (id) => !!(atlas[id] && atlas[id].anims.walk && ['s', 'e', 'n', 'w', 'se', 'sw', 'ne', 'nw'].every((d) => (atlas[id].anims.walk.dirs[d] || []).length));
    for (const g of Object.values(M.grounds.HUNT_GROUNDS)) {
      for (const p of g.pockets) for (const s of p.spawns) {
        const key = M.art.HUNT_WALK_ART[s.monster];
        if (key ? !units[key] : !walks(s.monster)) return g.id + ': ' + s.monster + ' has no walk art (PixelLab manifest or a loaded atlas)';
      }
    }
    return M.MONSTERS.rat_king.drops.some((d) => d.id === 'crown_shard') ? null : 'the Rat King does not drop the Crown Shard';
  },
  'party-scale': (M) => {
    const got = [1, 2, 3, 4].map((n) => M.grounds.packScalePermille(n)).join(',');
    if (got !== '550,700,850,1000') return 'party scale ' + got;
    if (M.grounds.scaledHp(M.MONSTERS.rat_king, 1) !== 330) return 'a solo Rat King has ' + M.grounds.scaledHp(M.MONSTERS.rat_king, 1) + ' HP, not 330';
    if (M.grounds.elementWithFloor(0, 'healer', 1) !== 500) return 'a solo Healer into an immunity is not floored at 500';
    if (M.grounds.elementWithFloor(0, 'healer', 2) !== 0) return 'the Healer floor reached a party of two';
    return null;
  },
  'sewer-full-party-loop': (M) => {
    const r = playSewer(M, PARTY, 600, 1);
    const order = r.pulls.map((p) => p.pocket).join(',');
    console.log('    full party: pulls ' + r.pulls.map((p) => p.pocket + '@' + Math.round(p.at / 1000) + 's' + (p.clearS != null ? '/' + p.clearS + 's' : '')).join(' ')
      + ' | loop ' + r.swings * 2 + 's | falls ' + r.falls + ' wipes ' + r.wipes
      + ' | g/h supply ' + r.supplyH + ' coin ' + r.coinH + ' common ' + r.commonH + ' rare ' + r.rareH + ' | kings/h ' + r.kingsH);
    if (!order.startsWith('0,1,2,3,4,5')) return 'the pulls went ' + order + ', not the route 0..5';
    if (!r.kingDead) return 'the Rat King never died';
    if (r.wipes) return r.wipes + ' wipe(s) in a full-party loop';
    return null;
  },
  'cellar-solo-first-kill': (M) => {
    /* Tutorial step 2 on the real core: a fresh hero (a weak swing: 60% to hit, max 2) alone in the cellar
       ground kills a rat inside two minutes and is never knocked out. */
    const r = playSewer(M, [{ role: 'tank', maxHit: 2, acc: 600, element: '', bar: [] }], 60, 1, 'mill_cellar');
    console.log('    cellar solo: pulls ' + r.pulls.map((p) => p.pocket + '@' + Math.round(p.at / 1000) + 's').join(' ') + ' | kills ' + JSON.stringify(r.kills) + ' | falls ' + r.falls);
    if (!(r.kills.rat >= 1)) return 'a fresh hero killed no rat in the cellar in two minutes';
    return r.falls ? 'a fresh hero was knocked out in the cellar' : null;
  },
  'tutorial-walk-through': (M) => {
    const bad = M.tut.validate();
    if (bad.length) return bad.join('; ');
    const steps = M.tut.HUNT_TUTORIAL;
    const fresh = M.xp.combatLevel(M.kit.START_SKILL_XP);
    const H = M.HUNTS;
    /* What the player holds and can reach after each step: the walk-through, in code. */
    const can = { hunts: new Set(Object.values(H).filter((h) => h.band[0] <= fresh).map((h) => h.id)), inHunt: null, entered: new Set(), pulled: [] };
    if (!Object.keys(M.kit.START_INVENTORY).some((id) => M.supplies.SUPPLIES[id] && M.supplies.SUPPLIES[id].kind === 'heal')) {
      return 'the start kit carries no food the hunt bag can eat';
    }
    for (const s of steps) {
      const d = s.done;
      if (d.kind === 'enter') {
        if (!can.hunts.has(d.hunt)) return s.id + ': ' + d.hunt + ' is locked at this point (floor ' + H[d.hunt].band[0] + ')';
        can.inHunt = d.hunt; can.entered.add(d.hunt);
      } else if (d.kind === 'kills' || d.kind === 'level') {
        if (!can.inHunt) return s.id + ': needs a hunt in progress';
      } else if (d.kind === 'unlock') {
        if (!can.inHunt) return s.id + ': needs a hunt in progress to earn the level';
        if (H[d.hunt].band[0] <= fresh) return s.id + ': ' + d.hunt + ' is already open to a fresh character (the step is empty)';
        if (H[d.hunt].band[0] > H[can.inHunt].band[1]) return s.id + ': ' + can.inHunt + ' stops being worth it before ' + d.hunt + ' opens';
        can.hunts.add(d.hunt);
      } else if (d.kind === 'ended') {
        if (!can.inHunt) return s.id + ': no hunt to end';
        can.inHunt = null;
      } else if (d.kind === 'pull') {
        if (can.inHunt !== M.grounds.HUNT_GROUNDS[d.ground].hunt) return s.id + ': not hunting ' + d.ground;
        const route = M.grounds.HUNT_GROUNDS[d.ground].route;
        const prev = can.pulled.length ? route.indexOf(can.pulled[can.pulled.length - 1]) : -1;
        if (route.indexOf(d.pocket) <= prev) return s.id + ': pocket ' + d.pocket + ' comes before one already reached';
        can.pulled.push(d.pocket);
      }
    }
    const cellar = M.grounds.HUNT_GROUNDS.mill_cellar;
    if (cellar.hunt !== steps[0].done.hunt) return 'the first hunt is not the cellar ground';
    /* The way down exists: the cellar map has an exit into the sewer map. */
    const cm = M.maps.WORLD_MAPS.find((m) => m.id === cellar.map);
    if (!cm.exits.some((e) => e.to === 'millrace_sewer')) return 'the cellar has no way down into the sewer';
    return null;
  },
};

const mutants = [
  { name: 'a sewer spawn moved into the wall', case: 'sewer-on-the-map',
    edits: [['src/data/hunt-grounds.js', "['drain_rat', 7, 4], ['drain_rat', 8, 3]", "['drain_rat', 7, 1], ['drain_rat', 8, 3]"]] },
  { name: 'a sewer monster with no walk art', case: 'formation-rows',
    edits: [['src/data/monster-art.js', "kobold_tosher: 'kobold', ", "kobold_tosher: 'kobold_unported', "]] },
  { name: 'the Rat King loses his boss flag', case: 'formation-rows',
    edits: [['src/data/monsters.js', "family: 'Vermin', formation: true, boss: true,", "family: 'Vermin', formation: true,"]] },
  { name: 'the cellar pocket holds a monster a fresh hero cannot kill', case: 'cellar-solo-first-kill',
    edits: [['src/data/hunt-grounds.js', "pocket([15, 5, 21, 10], ['rat', 18, 7], ['rat', 19, 6]),", "pocket([15, 5, 21, 10], ['rat_king', 18, 7]),"]] },
  { name: 'the party scale is flat', case: 'party-scale',
    edits: [['src/data/hunt-grounds.js', 'perHeroPermille: 150', 'perHeroPermille: 0']] },
  { name: 'the tutorial sends a fresh character to the sewer first', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "{ kind: 'enter', hunt: 'mill_cellar' }", "{ kind: 'enter', hunt: 'millrace_sewer' }"]] },
  { name: 'the sewer opens to a fresh character', case: 'tutorial-walk-through',
    edits: [['src/data/hunts.js', 'band: [4, 40],', 'band: [0, 40],']] },
];

/* fixtures/h1.js `plant`, widened to the world engine and its manifests (the map cases read them):
   a mutant that cannot load would read as caught, so every path this file imports is copied. */
function plant(edits) {
  const root = mkdtempSync(join(tmpdir(), 'hunt-sewer-'));
  for (const d of ['src/core', 'src/data', 'src/world', 'assets/world', 'prototypes/hunt-sim-assets/manifest.json']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
  cpSync(join(ROOT, 'src/build-info.js'), join(root, 'src/build-info.js'));
  for (const [file, from, to] of edits) {
    const f = join(root, file);
    const src = readFileSync(f, 'utf8');
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error('plant: ' + file + ' has ' + n + ' copies of the anchor ' + JSON.stringify(from.slice(0, 60)));
    writeFileSync(f, src.replace(from, to));
  }
  return { root, done: () => rmSync(root, { recursive: true, force: true }) };
}

const R = makeReport('hunt-core/sewer');
const M = await load(ROOT);
if (process.argv.includes('--report')) {
  /* The party-size table (evidence, not a gate): each composition, 3 seeds, one loop or 20 sim-minutes. */
  const comps = { full: PARTY, 'tank+mage': [PARTY[0], PARTY[2]], 'tank+healer': [PARTY[0], PARTY[3]],
    'solo tank': [PARTY[0]], 'solo ranger': [PARTY[1]], 'solo mage': [PARTY[2]], 'solo healer': [PARTY[3]] };
  for (const [name, party] of Object.entries(comps)) {
    for (const seed of [1, 2, 3]) {
      const r = playSewer(M, party, 600, seed);
      console.log(name.padEnd(12) + ' s' + seed + ' pulls ' + r.pulls.map((p) => p.pocket + (p.clearS != null ? ':' + p.clearS : '')).join(' ')
        + ' | ' + (r.loops ? 'loop ' + r.swings * 2 + 's' : 'no loop in ' + r.swings * 2 + 's') + ' king ' + (r.kingDead ? 'dead' : 'alive')
        + ' falls ' + r.falls + ' wipes ' + r.wipes + ' | g/h supply ' + r.supplyH + ' (ruled ' + r.ruledH + ') coin ' + r.coinH + ' common ' + r.commonH + ' rare ' + r.rareH
        + ' | bought ' + JSON.stringify(r.bought) + ' | own lines/h ' + JSON.stringify(r.used));
    }
  }
  process.exit(0);
}
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of mutants) {
  const p = plant(mu.edits);
  try {
    let why = null;
    /* A planted copy that cannot even load is a broken mutant, not a caught one. */
    const PM = await load(p.root);
    try { why = cases[mu.case](PM); } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
