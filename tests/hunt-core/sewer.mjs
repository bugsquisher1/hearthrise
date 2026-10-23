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
//   tutorial-never-backward  town -> Thicket -> town -> Sewer -> town -> Cellar, reloading between:
//                          the pointer never moves back (#58, Andy 10-22)
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
  M.cm = await imp('src/data/condition-metrics.js');
  M.kit = await imp('src/data/start-kit.js');
  M.xp = await imp('src/core/xp.js');
  M.supplies = await imp('src/data/supplies.js');
  M.roles = await imp('src/data/hunt-roles.js');
  M.hs = await imp('src/core/hunt-spawn.js');
  M.ws = await imp('src/core/hunt/world-step.js');
  M.basics = await imp('src/data/supply-basics.js');
  M.art = await imp('src/data/monster-art.js');
  M.cond = await imp('src/core/hunt/conditions.js');
  M.vit = await imp('src/core/vitals.js');
  return M;
}

/* The walkable mask of a world map (sprites are not needed: only solid MATERIALS and solid props block,
   read from every atlas the renderer loads). */
function maskOf(M, mapId) {
  const row = M.maps.mapRowOf(mapId);   // shipped or staged (hunts.js `staged`): every ground's grid is checked
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
    id: 'sewer-' + p.role, huntFromMs: 0, bag: { chalked_fire_rune: { loaded: 400 }, ...(p.ammo ? { [p.ammo]: { loaded: 2000 } } : {}) },
    slots: [{ item: '*heal_shop', on: true, conditions: [] }, { item: '*mana_shop', on: true, conditions: [] }],
    /* The REAL tier-1 store rows (supply-basics.js), so the supply bill is the game's. */
    basics: Object.fromEntries(['salted_shrimp', 'thin_turnip_juice', 'plain_iron_bolts'].map((id) => {
      const b = M.basics.BASIC_INDEX[id];
      return [id, { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner }];
    })),
    purse: 1000000, goldFloor: 0, supplySource: 'mine', onEmpty: 'switch',
  });
}

/* THE ARMOUR each role wears in the measurement (six armour slots: src/data/core-model.js ARMOUR_SLOTS):
   the tank in plate, the casters in cloth, the ranger in leather. Vitals come from Level + armour
   (src/core/vitals.js), never from the role. */
const ARMOUR = Object.freeze({ tank: [6, 0], melee_dps: [6, 0], ranger: [0, 0], mage: [0, 6], healer: [0, 6] });

/** Play a ground for `swings` with `party` at Level `level`; answers what happened, pocket by pocket. */
function playSewer(M, party, swings, seed, groundId, level) {
  const ground = M.grounds.HUNT_GROUNDS[groundId || 'millrace_sewer'];
  const grid = gridOf(M, ground.map);
  const L = level || 12;
  const world = M.hs.newHuntWorld(ground, grid, party.map((p) => ({ role: p.role, maxHp: M.vit.maxHpFor(L, ARMOUR[p.role][0]),
    acc: p.acc || 850, maxHit: p.maxHit, def: 0, element: p.element })));
  const heroes = {};
  party.forEach((p, i) => {
    const u = world.units[i];
    u.mana = u.maxMana = M.vit.maxManaFor(L, ARMOUR[p.role][1]);
    /* Each ability slot as a player's new slot starts: its own trigger WRITTEN on it (conditions.js suggestedConditions;
       Tyler 2026-10-23: no hidden default stands behind a slot, so a bare id would fire whenever it is ready). */
    const bar = p.bar.map((id) => ({ action: { type: 'ability', id }, conditions: M.cond.suggestedConditions({ type: 'ability', id }), join: 'and' }));
    heroes[u.id] = { hs: session(M, p), slots: M.cond.heroSlots(bar, null), actionSet: 'hunt', range: M.roles.HUNT_ROLES[p.role].range, ammo: p.ammo || null };
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
    for (const [id, l] of Object.entries(h.hs.bag)) ruled += (l.loaded - l.left) * (id === 'chalked_fire_rune' ? 6 : 1);
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
    /* the OPEN grounds: a staged one has no art yet by definition (forest-cave.mjs staged-until-art holds it hidden) */
    for (const g of Object.values(M.grounds.OPEN_GROUNDS)) {
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
    /* The mechanics claim (route order, the boss dies, nobody dies) at Level 30. Measured 2026-10-19 on the
       designer's CORE_NUMBERS (monster damage x12, ability heals and shields still FLAT, its line 99): L30 / L40
       clear with no death; L12-L25 lose a hero (L12 at the Cistern Spider, L16-L25 to the Rat King), so the
       band's top half needs the abilities pass before a band-level claim can stand here (handed to the designer). */
    const r = playSewer(M, PARTY, 600, 1, 'millrace_sewer', 30);
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
    /* Tutorial step 2 on the real core: a fresh Level-1 hero (a weak swing: 60% to hit, max 2) alone in the
       cellar ground kills a rat inside two minutes and does not die. */
    const r = playSewer(M, [{ role: 'tank', maxHit: 2, acc: 600, element: '', bar: [] }], 60, 1, 'mill_cellar', 1);
    console.log('    cellar solo: pulls ' + r.pulls.map((p) => p.pocket + '@' + Math.round(p.at / 1000) + 's').join(' ') + ' | kills ' + JSON.stringify(r.kills) + ' | falls ' + r.falls);
    if (!(r.kills.rat >= 1)) return 'a fresh hero killed no rat in the cellar in two minutes';
    return r.falls ? 'a fresh hero died in the cellar' : null;
  },
  'tutorial-walk-through': (M) => {
    const bad = M.tut.validate();
    if (bad.length) return bad.join('; ');
    const steps = M.tut.HUNT_TUTORIAL;
    const fresh = M.xp.charLevelFromXp(0);
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
      } else if (d.kind === 'bar') {
        /* The bar shows in town and in a hunt, and its first condition is the registry's own row: always doable. */
        if (!M.cm.METRICS.some((m) => m.id === 'self_hp_pct')) return s.id + ': the condition the card names is not in the registry';
      } else if (d.kind === 'pull') {
        if (can.inHunt !== M.grounds.HUNT_GROUNDS[d.ground].hunt) return s.id + ': not hunting ' + d.ground;
        /* The chain is walked by a fresh SOLO hero (Tyler 2026-10-21): a party-only pocket is a card he can never finish. */
        const pk = M.grounds.HUNT_GROUNDS[d.ground].pockets[d.pocket];
        if (pk && (pk.minParty || 1) > 1) return s.id + ': pocket ' + d.pocket + ' of ' + d.ground + ' needs a party of ' + pk.minParty;
        const route = M.grounds.HUNT_GROUNDS[d.ground].route;
        const prev = can.pulled.length ? route.indexOf(can.pulled[can.pulled.length - 1]) : -1;
        if (route.indexOf(d.pocket) <= prev) return s.id + ': pocket ' + d.pocket + ' comes before one already reached';
        can.pulled.push(d.pocket);
      }
    }
    const cellar = M.grounds.HUNT_GROUNDS.mill_cellar;
    if (cellar.hunt !== steps[0].done.hunt) return 'the first hunt is not the cellar ground';
    /* THE CARDS ADVANCE (2026-10-21: the launcher showed only card 1, the other eight never appeared):
       the card is the first step the SERVER's facts have not finished, so one character walked through
       the whole chain meets every card in order. */
    const lvl = (n) => M.xp.charXpForLevel(n);
    const thicketBand = M.HUNTS.meadowbrook_thicket.band[0], sewerBand = M.HUNTS.millrace_sewer.band[0];
    const base = { levelXp: 0, charLevel: 1, skillLevel: 1, huntId: null, unitKinds: new Set(), barSet: false };
    const at = (L, more) => ({ ...base, levelXp: lvl(L), charLevel: L, skillLevel: L, ...more });
    /* Cellar -> Thicket (solo) -> Sewer (party): one character walked through the chain (designer 2026-10-21). */
    const walk = [
      ['to_the_cellar', base],
      ['first_kill', { ...base, huntId: 'mill_cellar' }],
      ['first_level', { ...base, huntId: 'mill_cellar', levelXp: 3 }],
      ['earn_the_thicket', { ...base, huntId: 'mill_cellar', levelXp: 40, charLevel: 2, skillLevel: 2 }],
      ['leave_cellar', at(thicketBand, { huntId: 'mill_cellar' })],
      ['set_the_bar', at(thicketBand)],
      ['into_the_thicket', at(thicketBand, { barSet: true })],
      ['earn_the_sewer', at(thicketBand, { barSet: true, huntId: 'meadowbrook_thicket' })],
      ['go_below', at(sewerBand, { barSet: true, huntId: 'meadowbrook_thicket' })],
    ];
    for (const [id, facts] of walk) {
      const c = M.tut.currentCard(facts);
      if (!c || c.id !== id) return 'the card for ' + id + ' came up as ' + (c && c.id);
    }
    /* The chain only moves forward: a hero in the Sewer is not sent back to the Thicket's card. */
    if (M.tut.currentCard(at(sewerBand, { barSet: true, huntId: 'millrace_sewer' }))) return 'the tutorial does not end once the hero is in the sewer';
    if (M.tut.currentCard(at(M.HUNTS.millrace_sewer.band[1] + 1, { barSet: true }))) return 'a hero past the sewer band is still coached';
    /* The way down exists: the cellar map has an exit into the sewer map. */
    const cm = M.maps.WORLD_MAPS.find((m) => m.id === cellar.map);
    if (!cm.exits.some((e) => e.to === 'millrace_sewer')) return 'the cellar has no way down into the sewer';
    return null;
  },
  'tutorial-launcher-card': async (M) => {
    /* The launcher draws the card the SERVER's envelope puts the character on, not always the first one. */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { renderLaunchers } = await imp('src/shell/launcher.js');
    const env = (levelXp, hunt, slots) => ({ state: { level_xp: levelXp },
      ...(hunt ? { hunt: { session_id: 's1', hunt_id: hunt, ended: false, session: {}, hero: {}, pose: { units: [] } } } : {}),
      hunt_settings: { preset: 1, slots: slots || [] } });
    /* `opts.open`: window ids open; `opts.bar`: the hunt top bar is on screen (it draws the card itself). */
    const cardOf = (e, opts = {}) => {
      const ctx = { character: { read: (k) => e[k] }, glyphs: {}, hud: { isShown: (id) => id === 'hunt-topbar' && !!opts.bar },
        wm: { openIds: () => opts.open || [], rows: () => [], row: () => null } };
      const m = /data-tutorial="([a-z_]+)"/.exec(renderLaunchers(ctx));
      return m ? m[1] : null;
    };
    /* Gate v0.2.23 P1: no card over an open window (any window), none in the launcher row during a hunt. */
    if (cardOf(env(0), { open: ['inventory'] })) return 'the launcher draws the card over an open window';
    if (cardOf(env(0, 'mill_cellar'), { bar: true })) return 'the launcher draws the card in a hunt, over the hunt bar';
    const floor = M.xp.charXpForLevel(M.HUNTS.millrace_sewer.band[0]);
    const got = [cardOf(env(0)), cardOf(env(0, 'mill_cellar')), cardOf(env(floor, 'mill_cellar')), cardOf(env(floor))].join(',');
    const want = 'to_the_cellar,first_kill,leave_cellar,set_the_bar';
    if (got !== want) return 'the launcher showed ' + got + ', wanted ' + want;
    /* AFTER THE GUIDE (designer 2026-10-22: at Level 12 in the Sewer nothing said what to aim at): the pointer
       names the next ground above the hero's Level, from the data, and the weapon skill's next unlock. */
    const L = M.HUNTS.millrace_sewer.band[0] + 4;
    /* the player has set the bar (a conditioned slot, shown and stored), so the guide is done */
    const eat = { action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 60 }], join: 'and' };
    const sewerEnv = { ...env(M.xp.charXpForLevel(L), 'millrace_sewer'), hunt_settings: { preset: 1, slots: [eat], bar: [eat], role: 'tank' },
      skills: { melee: { xp: 0, level: 11 } } };
    const html = renderLaunchers({ character: { read: (k) => sewerEnv[k] }, glyphs: {}, hud: { isShown: () => false },
      wm: { openIds: () => [], rows: () => [], row: () => null } });
    const goal = (/data-tutorial="([a-z0-9_]+)"/.exec(html) || [])[1] || '';
    const next = Object.values(M.HUNTS).filter((h) => h.staged !== true && Object.values(M.grounds.HUNT_GROUNDS).some((g) => g.hunt === h.id) && h.band[0] > L)
      .sort((a, b) => a.band[0] - b.band[0])[0];
    if (!goal.startsWith('goal_')) return 'after the guide (Level ' + L + ', in the Sewer) the pointer shows ' + (goal || 'nothing');
    if (next && !html.includes(next.name)) return 'the what-next line does not name ' + next.name + ': ' + html;
    if (!/Next at Melee level \d+/.test(html)) return 'the what-next line does not name the sword hero\'s next Melee unlock: ' + html;
    /* Defense at 0 XP (no armour worn: the fresh-hero play, 117 kills) points at the Shop's gloves and belts (designer
       2026-10-22, the outfitter); once Defense has XP the line is gone. */
    const withDef = (xp) => renderLaunchers({ character: { read: (k) => ({ ...sewerEnv, skills: { ...sewerEnv.skills, defense: { xp, level: 1 } } })[k] }, glyphs: {},
      hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } });
    if (!withDef(0).includes('The Shop sells gloves and belts')) return 'Defense at 0 XP: the what-next line does not point at the Shop\'s armour: ' + withDef(0);
    if (withDef(40).includes('The Shop sells gloves and belts')) return 'Defense training: the what-next line still asks for armour';
    /* Farming at 0 XP (nothing ever planted: farming sat at zero, P1 2026-10-22) points at the Farm once; one planting ends it. */
    const withFarm = (xp) => renderLaunchers({ character: { read: (k) => ({ ...sewerEnv, skills: { ...sewerEnv.skills, farming: { xp, level: 1 } } })[k] }, glyphs: {},
      hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } });
    if (!withFarm(0).includes('open the Farm (J)')) return 'Farming at 0 XP: the what-next line does not point at the Farm: ' + withFarm(0);
    if (withFarm(28).includes('open the Farm (J)')) return 'Farming started: the what-next line still asks for a planting';
    return null;
  },
  'tutorial-never-backward': async (M) => {
    /* #58 (Andy 10-22): the pointer followed WHERE the hero was, not where it had been: town -> Thicket
       showed the Sewer card, back in town the Thicket card again; out of the Sewer, the Thicket card again.
       One hero walked town -> Thicket -> town -> Sewer -> town -> Cellar, reloading between, through the
       real envelope readers (src/session/tutorial-sections.js pointerCardOf): the card never moves back. */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { pointerCardOf } = await imp('src/session/tutorial-sections.js');
    const eat = { action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 60 }], join: 'and' };
    /* the server's sections: the latest hunt session (open or ended) and the personal bests (finished hunts of 10+ min) */
    const env = (L, hunt, ended, bests) => ({ state: { level_xp: M.xp.charXpForLevel(L) },
      ...(hunt ? { hunt: { session_id: 's-' + hunt, hunt_id: hunt, ended, session: {}, hero: {}, pose: { units: [] } } } : {}),
      hunt_bests: { min_ms: 600000, grounds: Object.fromEntries((bests || []).map((g) => [g, { solo: { xp_h: 1, balance_h: 1 } }])) },
      hunt_settings: { preset: 1, slots: [eat], bar: [eat], role: 'tank' }, skills: { melee: { xp: 0, level: L } } });
    /* a reload reads the same server sections into a fresh session: nothing the browser held survives it */
    const cardOf = (e) => { const s = JSON.parse(JSON.stringify(e)); const c = pointerCardOf({ read: (k) => s[k] }); return c ? c.id : null; };
    const ids = M.tut.HUNT_TUTORIAL.map((s) => s.id);
    const rank = (id) => (id && id.startsWith('goal') ? ids.length : ids.indexOf(id));
    const T = M.HUNTS.meadowbrook_thicket.band[0], S = M.HUNTS.millrace_sewer.band[0];
    const walk = [
      ['town, the cellar left', env(T, 'mill_cellar', true), 'into_the_thicket'],
      ['in the Thicket', env(T, 'meadowbrook_thicket', false), 'earn_the_sewer'],
      ['in the Thicket, the Sewer open', env(S, 'meadowbrook_thicket', false), 'go_below'],
      ['town, out of the Thicket', env(S, 'meadowbrook_thicket', true), 'go_below'],
      ['reload in town', env(S, 'meadowbrook_thicket', true), 'go_below'],
      ['in the Sewer', env(S, 'millrace_sewer', false), 'goal'],
      ['town, out of a short Sewer hunt', env(S, 'millrace_sewer', true), 'goal'],
      ['reload in town', env(S, 'millrace_sewer', true), 'goal'],
      ['back in the Cellar (Thicket and Sewer bests)', env(S, 'mill_cellar', false, ['meadowbrook_thicket', 'millrace_sewer']), 'goal'],
      ['town, out of the Cellar', env(S, 'mill_cellar', true, ['meadowbrook_thicket', 'millrace_sewer']), 'goal'],
    ];
    let prev = -1;
    const seen = [];
    for (const [where, e, want] of walk) {
      const id = cardOf(e);
      seen.push(where + ': ' + id);
      if (!(id || '').startsWith(want)) return 'at "' + where + '" the pointer showed ' + id + ', wanted ' + want + ' (' + seen.join(' | ') + ')';
      if (rank(id) < prev) return 'the pointer moved BACK at "' + where + '": ' + seen.join(' | ');
      prev = rank(id);
    }
    return null;
  },
};

const mutants = [
  { name: 'the what-next line never sees Defense (no armour hint)', case: 'tutorial-launcher-card',
    edits: [['src/session/tutorial-sections.js', 'defenseXp: sk && sk.defense ? sk.defense.xp : null', 'defenseXp: null']] },
  { name: 'the what-next line never sees Farming (no farm hint)', case: 'tutorial-launcher-card',
    edits: [['src/session/tutorial-sections.js', 'farmingXp: sk && sk.farming ? sk.farming.xp : null', 'farmingXp: null']] },
  { name: 'nothing to aim at after the guide (no what-next line)', case: 'tutorial-launcher-card',
    edits: [['src/session/tutorial-sections.js', '  if (card) return card;\n', '  return card;\n']] },
  { name: 'the launcher shows only the first card', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher.js', 'const card = pointerCardOf(cs);', "const card = pointerCardOf(cs) && { id: 'to_the_cellar', title: 'a', text: 'b' };"]] },
  { name: 'the pointer is drawn over an open window', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher.js', 'ctx.wm.openIds().length > 0', 'ctx.wm.row(ctx.wm.openIds()[0] || "") && ctx.wm.row(ctx.wm.openIds()[0]).modal']] },
  { name: 'the launcher keeps the pointer in a hunt (over Leave hunt)', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher.js', "(ctx.hud && ctx.hud.isShown('hunt-topbar') ? '' : pointerFor(ctx))", 'pointerFor(ctx)']] },
  { name: 'the card never advances past the first unmet step', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', 'if (!isDone(r.done, facts, openedIn)) return r;', 'return r;']] },
  { name: 'the first kill does not finish its card', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "case 'kills': return facts.levelXp > 0;", "case 'kills': return false;"]] },
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
  { name: 'the party-only Rat King card is back in the solo chain', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }),",
      "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }),\n  step('the_king', 'The Rat King', 'The last room is his.', 'world', { kind: 'pull', ground: 'millrace_sewer', pocket: 5 }),"]] },
  { name: 'a hero in the sewer is sent back to the Thicket card (enter judged on the current hunt only)', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', ' || HUNT_INDEX[h].band[0] > HUNT_INDEX[hunt].band[0]', '']] },
  { name: 'out of a hunt, the pointer forgets it was there (#58: the Thicket card came back)', case: 'tutorial-never-backward',
    edits: [['src/session/tutorial-sections.js', '  if (h && h.huntId) visited.add(h.huntId);\n', '']] },
  { name: 'back in the Cellar after the Thicket, the "Cash in" card returns (#58)', case: 'tutorial-never-backward',
    edits: [['src/data/hunt-tutorial.js', " || (!!openedIn && reached(facts, openedIn, true))", '']] },
  { name: 'the pointer ignores the personal-best grounds (#58)', case: 'tutorial-never-backward',
    edits: [['src/session/tutorial-sections.js', 'new Set(Object.keys((huntBestsOf(cs) || {}).grounds || {}))', 'new Set()']] },
  { name: 'the Thicket is skipped: the cellar unlocks the sewer', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "{ kind: 'unlock', hunt: 'meadowbrook_thicket' }", "{ kind: 'unlock', hunt: 'millrace_sewer' }"]] },
  { name: 'the sewer opens to a fresh character', case: 'tutorial-walk-through',
    edits: [['src/data/hunts.js', 'band: [8, 25],', 'band: [1, 25],']] },
];

/* fixtures/h1.js `plant`, widened to the world engine and its manifests (the map cases read them):
   a mutant that cannot load would read as caught, so every path this file imports is copied. */
function plant(edits) {
  const root = mkdtempSync(join(tmpdir(), 'hunt-sewer-'));
  for (const d of ['src/core', 'src/data', 'src/world', 'src/session', 'src/shell', 'src/utils', 'assets/world', 'prototypes/hunt-sim-assets/manifest.json']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
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
  try { why = await fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
for (const mu of mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits);
  try {
    let why = null;
    /* A planted copy that cannot even load is a broken mutant, not a caught one. */
    const PM = await load(p.root);
    try { why = await cases[mu.case](PM); } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
