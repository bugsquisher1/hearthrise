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
//   coach-hold             a card the server finishes stays up long enough to read; the player's own press moves it at once
//   coach-ring             the gold ring is on the control the card names (icon, then inside its window); the icon row draws its own
//   coach-folds            the coach minimizes to its title, stays so through a re-render and a reload,
//                          marks the tab on a new card, opens to its full text (Tyler 2026-10-24)
//
//   --only a,b             run those cases and their mutants alone; --cases: the cases without mutants (CI runs everything)
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
  M.gathering = await imp('src/data/gathering.js');
  M.recipes = await imp('src/data/recipes.js');
  M.tally = await imp('src/data/tally-tasks.js');
  M.items = await imp('src/data/items.js');
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
  { role: 'healer', maxHit: 5, element: 'poison', bar: ['greater_mend', 'circle_of_renewal', 'green_sickness'] },
];

function session(M, p) {
  return M.AR.newHuntSession({
    id: 'sewer-' + p.role, huntFromMs: 0, bag: { chalked_fire_rune: { loaded: 400 }, chalked_water_rune: { loaded: 400 }, chalked_earth_rune: { loaded: 100 }, chalked_poison_rune: { loaded: 400 }, ...(p.ammo ? { [p.ammo]: { loaded: 2000 } } : {}) },
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
  'tutorial-walk-through': async (M) => {
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
    const kit = M.kit.START_INVENTORY;
    for (const s of steps) {
      const d = s.done;
      /* A PARTY card is never on a solo hero's way (Tyler 2026-10-21; the designer's playtest 2026-10-24: the solo
         chain ended on "Into the sewer, together" and sat there for hours). */
      if (s.party) continue;
      if (d.kind === 'enter') {
        if (!can.hunts.has(d.hunt)) return s.id + ': ' + d.hunt + ' is locked at this point (floor ' + H[d.hunt].band[0] + ')';
        can.inHunt = d.hunt; can.entered.add(d.hunt);
      } else if (d.kind === 'planted') {
        /* the kit's seed, a crop a Farming 1 hero may plant (hr_farm_plant has no hunt check: doable in the cellar wait) */
        const crop = M.gathering.CROPS[s.ring.crop];
        if (!crop || !(kit[crop.seed] > 0) || crop.req > 1) return s.id + ': the kit cannot plant ' + s.ring.crop;
      } else if (d.kind === 'skill_xp') {
        /* the kit holds the recipe's input, at level 1, and the step is in town (a bench does not run in a hunt) */
        const r = (M.recipes.ARTISAN_RECIPES[d.skill] || []).find((x) => x.id === s.ring.work);
        if (!r || (r.req || 1) > 1 || !(kit[r.input] > 0)) return s.id + ': the kit cannot ' + s.ring.work;
        if (can.inHunt) return s.id + ': ' + d.skill + ' is asked for while a hunt runs';
      } else if (d.kind === 'tally_taken') {
        /* Tamsin takes no task while the hero hunts; hers is a solo task on a ground this chain enters next */
        const t = M.tally.tallyTask(d.task);
        if (can.inHunt) return s.id + ': a task is asked for while a hunt runs (Take is off)';
        if (t.party || !steps.some((x) => !x.party && x.done.kind === 'enter' && x.done.hunt === t.hunt)) return s.id + ': ' + d.task + ' is not on the solo way';
      } else if (d.kind === 'tally_paid') {
        if (!steps.some((x) => x.done.kind === 'tally_taken') || !can.entered.has(M.tally.tallyTask(steps.find((x) => x.done.kind === 'tally_taken').done.task).hunt)) return s.id + ': paid for a task never hunted';
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
    /* the server's facts of a fresh hero: every skill at 0 XP, the land empty, nothing from Tamsin, no party */
    const sk = (more) => ({ farming: 0, cooking: 0, melee: 0, ...more });
    const base = { levelXp: 0, charLevel: 1, skillLevel: 1, skillXp: sk(), huntId: null, unitKinds: new Set(), foodSet: false, bar: null,
      landPlanted: false, tally: { held: 0, paid: 0, weight: false }, inParty: false };
    const at = (L, more) => ({ ...base, levelXp: lvl(L), charLevel: L, skillLevel: L, ...more });
    const planted = { skillXp: sk({ farming: 28 }), landPlanted: true };
    const cooked = { skillXp: sk({ farming: 28, cooking: 30 }), landPlanted: true };
    const taken = { tally: { held: 1, paid: 0, weight: true } };
    /* Cellar (plant in its wait) -> the town half -> Thicket (solo) -> paid -> What next: one hero, the whole chain. */
    const walk = [
      ['to_the_cellar', base],
      ['first_kill', { ...base, huntId: 'mill_cellar' }],
      ['first_level', { ...base, huntId: 'mill_cellar', levelXp: 3 }],
      ['plant_land', { ...base, huntId: 'mill_cellar', levelXp: 40, charLevel: 2, skillLevel: 2 }],
      ['earn_the_thicket', { ...base, huntId: 'mill_cellar', levelXp: 40, charLevel: 2, skillLevel: 2, ...planted }],
      ['leave_cellar', at(thicketBand, { huntId: 'mill_cellar', ...planted })],
      ['cook_catch', at(thicketBand, planted)],
      ['set_the_bar', at(thicketBand, cooked)],
      ['tamsins_task', at(thicketBand, { ...cooked, foodSet: true })],
      /* her question answered (the weight) but nothing taken: still her card */
      ['tamsins_task', at(thicketBand, { ...cooked, foodSet: true, tally: { held: 0, paid: 0, weight: true } })],
      ['into_the_thicket', at(thicketBand, { ...cooked, foodSet: true, ...taken })],
      ['tamsin_pays', at(thicketBand, { ...cooked, foodSet: true, ...taken, huntId: 'meadowbrook_thicket' })],
    ];
    for (const [id, facts] of walk) {
      const c = M.tut.currentCard(facts);
      if (!c || c.id !== id) return 'the card for ' + id + ' came up as ' + (c && c.id);
    }
    const paid = at(sewerBand, { ...cooked, foodSet: true, tally: { held: 0, paid: 1, weight: true }, huntId: 'meadowbrook_thicket' });
    /* NO SOLO WALL: paid, a solo hero at the Sewer's floor is done (What next), at any Level up to the Sewer's top. */
    if (M.tut.currentCard(paid)) return 'a solo hero who was paid is still coached: ' + M.tut.currentCard(paid).id;
    for (let L = sewerBand; L <= M.HUNTS.millrace_sewer.band[1]; L++) {
      const c = M.tut.currentCard({ ...paid, levelXp: lvl(L), charLevel: L });
      if (c) return 'a solo Level ' + L + ' hero meets ' + c.id + ' (the party card is a wall for a solo hero)';
    }
    /* A hero in a party meets the Sewer card at its floor, never below it, and not once in the sewer. */
    if ((M.tut.currentCard({ ...paid, inParty: true }) || {}).id !== 'go_below') return 'a party hero at the Sewer floor does not meet go_below';
    if (M.tut.currentCard({ ...paid, inParty: true, levelXp: lvl(sewerBand - 1), charLevel: sewerBand - 1 })) return 'a party hero under the Sewer floor meets go_below';
    if (M.tut.currentCard({ ...paid, inParty: true, huntId: 'millrace_sewer' })) return 'the tutorial does not end once the party is in the sewer';
    if (M.tut.currentCard(at(M.HUNTS.millrace_sewer.band[1] + 1, { inParty: true }))) return 'a hero past the sewer band is still coached';
    /* A town fact the server never sent is not a wall: no skills, no land, no tally = those steps pass. */
    const blind = at(thicketBand, { skillXp: null, landPlanted: null, tally: null, foodSet: true });
    if ((M.tut.currentCard(blind) || {}).id !== 'into_the_thicket') return 'with no town sections the coach asks for ' + (M.tut.currentCard(blind) || {}).id;
    const blindIn = { ...blind, huntId: 'meadowbrook_thicket' };
    if (M.tut.currentCard(blindIn)) return 'with no town sections a hero in the Thicket is asked for ' + M.tut.currentCard(blindIn).id;
    /* "TELL YOUR HERO WHEN" ON THE REAL DEFAULT BAR (playtest 2026-10-24: v0.2.42 put the role's spells first, the card
       said "slot 1 is your own Cooked Shrimp" and slot 1 was Challenge). The bar the server shows a fresh start-kit hero
       is the engine's (heroSlots: the role's defaults, then the kit's START_BAR; hr_hunt_settings_view is pinned equal by
       conditions.mjs). The card names and rings the slot that holds the food, and only a FOOD slot saved with a
       condition finishes it (a Save of Challenge restates the bar but teaches nothing). */
    const role = M.roles.roleForWeapon(M.roles.wornRoleKey({ weapon: M.kit.START_EQUIPMENT.weapon, shield: M.kit.START_EQUIPMENT.shield }, M.items.ITEMS), null);
    const shownBar = M.cond.heroSlots([], role, null).filter((r) => r.rule !== 'd_attack').map((r) => r.slot.action);
    const food = shownBar.findIndex((a) => a.type === 'consume' && a.id === 'cooked_shrimp');
    const store = shownBar.findIndex((a) => a.type === 'consume' && a.id === 'salted_shrimp');
    if (food < 0 || store < 0) return 'the default bar of a fresh ' + role + ' holds no Cooked Shrimp or Salted Shrimp slot';
    const barCard = M.tut.cardFor(M.tut.currentCard(at(thicketBand, { ...cooked, bar: shownBar })), shownBar);
    if (!barCard || barCard.id !== 'set_the_bar') return 'the bar card is not up for a cook who has saved no bar';
    if (barCard.barSlot !== food) return 'the bar card rings slot ' + barCard.barSlot + ', the Cooked Shrimp is in ' + food;
    const says = 'slot ' + (food + 1) + ' is your own Cooked Shrimp, and slot ' + (store + 1) + ' buys Salted Shrimp';
    if (!barCard.text.includes(says) || !barCard.text.includes('Press slot ' + (food + 1) + ',') || /\{slot:/.test(barCard.text)) return 'the bar card reads "' + barCard.text + '", wanted "' + says + '"';
    const tsb = await import(pathToFileURL(join(M.root, 'src/session/tutorial-sections.js')).href + V);
    const wire = (a, conditions) => ({ action: a, conditions, join: 'and' });
    const envOf = (stored) => ({ state: { level_xp: lvl(thicketBand) }, skills: { farming: { xp: 28, level: 1 }, cooking: { xp: 30, level: 1 } },
      hunt: { session_id: 's', hunt_id: 'mill_cellar', ended: true, session: {}, hero: {}, pose: { units: [] } },
      hunt_settings: { preset: 0, slots: shownBar.map((a) => wire(a, [])), bar: stored } });
    const cardOn = (stored) => { const e = envOf(stored); const c = tsb.pointerCardOf({ read: (k) => e[k] }); return c && c.id; };
    if (cardOn([]) !== 'set_the_bar') return 'the envelope of a cook with the kit bar shows ' + cardOn([]);
    const hp = [{ metric: 'self_hp_pct', op: 'lt', value: 55 }];
    const onlyChallenge = shownBar.map((a, i) => (i === 0 ? wire(a, [{ metric: 'self_hp_pct', op: 'gte', value: 1 }]) : wire(a, [])));
    if (cardOn(onlyChallenge) !== 'set_the_bar') return 'a stored bar with only a spell conditioned finishes "Tell your hero when"';
    if (cardOn(shownBar.map((a, i) => wire(a, i === food ? hp : []))) === 'set_the_bar') return 'a stored food slot with a condition does not finish "Tell your hero when"';
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
       names the next ground above the hero's Level, from the data, and the weapon skill's next unlock. A hero past the
       solo chain's last ground (the Thicket's top) is past every solo card, whatever it did in town. */
    const L = M.HUNTS.meadowbrook_thicket.band[1] + 1;
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
    /* THE PARTY PITCH, NOT A PARTY WALL (playtest 2026-10-24): a solo hero hears of the party ground its Level fits and
       how to make a party; a hero in a party does not. */
    const pitch = 'The Sewer fits your Level with a party. Invite a friend, or make a second hero: up to four of yours can hunt at once.';
    if (!html.includes(pitch)) return 'a solo Level ' + L + ' hero hears no party pitch: ' + html;
    const partyEnv = { ...sewerEnv, party: { id: '0a47c0de-0000-4000-a000-00000000aa01', members: [{ seat: 0, name: 'Mira' }, { seat: 1, name: 'Tyler' }], self_seat: 0, leader_seat: 0 } };
    const withParty = renderLaunchers({ character: { read: (k) => partyEnv[k] }, glyphs: {}, hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } });
    if (withParty.includes('make a second hero')) return 'a hero in a party is told to make a party: ' + withParty;
    if (!/Next at Melee level \d+/.test(html)) return 'the what-next line does not name the sword hero\'s next Melee unlock: ' + html;
    /* Defense at 0 XP (no armour worn: the fresh-hero play, 117 kills) points at the Shop's gloves and belts (designer
       2026-10-22, the outfitter); once Defense has XP the line is gone. */
    const withDef = (xp) => renderLaunchers({ character: { read: (k) => ({ ...sewerEnv, skills: { ...sewerEnv.skills, defense: { xp, level: 1 } } })[k] }, glyphs: {},
      hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } });
    if (!withDef(0).includes('The Shop sells gloves and belts')) return 'Defense at 0 XP: the what-next line does not point at the Shop\'s armour: ' + withDef(0);
    if (withDef(40).includes('The Shop sells gloves and belts')) return 'Defense training: the what-next line still asks for armour';
    /* THE LAND IS THE ACCOUNT'S (2026-12-14-shared-farm). v0.2.35 gate: Fingerguns, 0 Farming XP, was told "Nothing
       grows on your farm yet" over 5 READY turnips the other heroes planted. The line reads the server's `farm_land`
       field, never this hero's Farming XP: empty land asks for a seed (any hero), ready plots ask for the harvest
       (any hero may take it), a field that is only growing says nothing, and no field yet says nothing (fail safe). */
    const plot = (i, crop, ready) => ({ i, crop, ready, ready_in_s: ready ? 0 : 3600, waterable: false, regrows_left: null, by: 1, by_name: 'Andy', extra: false });
    const field = (plots) => ({ cap: 5, plot_level: 1, deeds: 0, upgrade: null, plots });
    const withLand = (xp, land) => {
      const e = { ...sewerEnv, skills: { ...sewerEnv.skills, farming: { xp, level: 1 } }, ...(land ? { farm_land: land } : {}) };
      return renderLaunchers({ character: { read: (k) => e[k] }, glyphs: {}, hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } });
    };
    const fiveReady = field([0, 1, 2, 3, 4].map((i) => plot(i, 'turnip', true)));
    const seen = withLand(0, fiveReady);
    if (/Nothing grows/.test(seen)) return 'a 0-Farming-XP hero on land holding 5 ready turnips is told nothing grows: ' + seen;
    if (!seen.includes('5 Turnip plots are ready on your land: open the Farm (J) to harvest them.')) return 'ready turnips on the shared land: no harvest line: ' + seen;
    if (!withLand(28, field([])).includes('Nothing grows on your land: open the Farm (J)')) return 'empty land, a hero who has farmed: no plant line: ' + withLand(28, field([]));
    if (!withLand(0, field([])).includes('Nothing grows on your land')) return 'empty land, a hero who never farmed: no plant line';
    if (withLand(0, field([plot(0, 'turnip', false)])).includes('Farm (J)')) return 'land only growing: the what-next line still names the Farm: ' + withLand(0, field([plot(0, 'turnip', false)]));
    if (withLand(0, null).includes('Farm (J)')) return 'no farm_land from the server yet: the what-next line claims the land';
    const mixed = withLand(0, field([plot(0, 'potato', true), plot(1, 'carrot', true), plot(2, 'carrot', true), plot(3, 'turnip', false)]));
    if (!mixed.includes('2 Carrot plots and 1 Potato plot are ready on your land')) return 'two ready crops: the harvest line does not name both: ' + mixed;
    if (!withLand(0, field([plot(0, 'wheat', true)])).includes('1 Wheat plot is ready on your land: open the Farm (J) to harvest it.')) return 'one ready plot: ' + withLand(0, field([plot(0, 'wheat', true)]));
    /* The coach reads the field with no clock: the Farm window's countdown starts from the clock that first opens it. */
    const fs = await import(pathToFileURL(join(M.root, 'src/session/farm-sections.js')).href + V);
    const late = field([plot(0, 'turnip', false)]);
    const lateEnv = { ...sewerEnv, farm_land: late };
    renderLaunchers({ character: { read: (k) => lateEnv[k] }, glyphs: {}, hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } });
    const win = fs.farmLandOf({ read: (k) => lateEnv[k] }, 5000);
    if (!win || win.seenAt !== 5000) return 'the coach stamped the Farm window\'s countdown clock (seenAt ' + (win && win.seenAt) + ', wanted 5000)';
    return null;
  },
  'coach-folds': async (M) => {
    /* Tyler 2026-10-24 ("need an option to minimize 'whats next'"): the coach folds to its title, stays folded
       through a re-render and a reload (the residue `coach`, through the real allowlist), marks the folded tab when
       the card changes without opening it, and opens to the full text; the hunt bar redraws it on each change. */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { renderLaunchers, placeCoach } = await imp('src/shell/launcher.js');
    const { residueOf, RESIDUE_FIELDS } = await imp('src/session/residue.js');
    if (!RESIDUE_FIELDS.includes('coach')) return 'the coach fold is not on the residue allowlist';
    const env = (hunt) => ({ state: { level_xp: 0 }, hunt_settings: { preset: 1, slots: [] },
      ...(hunt ? { hunt: { session_id: 's1', hunt_id: hunt, ended: false, session: {}, hero: {}, pose: { units: [] } } } : {}) });
    /* a character as the client holds it: the envelope's sections and the residue, written through setResidue */
    const hero = (e, residue) => {
      const cs = { read: (k) => e[k], record: { residue: residueOf(residue) },
        setResidue(f, v) { if (!RESIDUE_FIELDS.includes(f)) return false; cs.record = { residue: { ...cs.record.residue, ...residueOf({ [f]: v }) } }; return true; } };
      return cs;
    };
    const ctxOf = (cs) => ({ character: cs, glyphs: {}, hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } });
    const draw = (cs) => renderLaunchers(ctxOf(cs));
    const press = (cs, act) => renderLaunchers.act(ctxOf(cs), { ownerDocument: null, querySelector: () => null }, act, { type: 'click' });
    const FULL = 'Open Hunts and enter the Mill Cellar.';
    let cs = hero(env(), {});
    if (!draw(cs).includes(FULL) || !draw(cs).includes('data-hs-act="coach-min"')) return 'the coach shows no minimize control: ' + draw(cs);
    if (typeof renderLaunchers.act !== 'function') return 'the launcher row answers no coach press';
    press(cs, 'coach-min');
    const folded = (html) => html.includes('is-min') && html.includes('data-hs-act="coach-open"') && !html.includes(FULL);
    if (!folded(draw(cs))) return 'minimized, the coach still shows its text: ' + draw(cs);
    if (!folded(draw(cs))) return 'a re-render opened the folded coach';
    if (!draw(cs).includes('>Rats in the mill</button>')) return 'the folded tab does not show the title: ' + draw(cs);
    if (draw(cs).includes('hs-coach-new')) return 'a fresh fold already carries the new mark';
    /* a reload: the server's residue bag read into a fresh session (JSON, through the allowlist) */
    cs = hero(env(), JSON.parse(JSON.stringify(cs.record.residue)));
    if (!folded(draw(cs))) return 'after a reload the coach is open again: ' + draw(cs);
    /* the next card (the hero entered the Cellar): marked, still folded, its title on the tab */
    const before = draw(cs);
    cs = hero(env('mill_cellar'), cs.record.residue);
    const marked = draw(cs);
    if (!folded(marked) || !marked.includes('hs-coach-new') || !marked.includes('Your hero fights alone')) return 'a new card while folded: no mark, or it opened: ' + marked;
    /* the hunt bar (built once) redraws the coach when the fold or the card changes, and only then */
    let node = null, inserts = 0;
    const attrOf = (h, a) => (new RegExp(a + '="([^"]+)"').exec(h) || [])[1] || null;
    const bar = { querySelector: () => node, insertAdjacentHTML: (pos, h) => { inserts++;
      node = { key: attrOf(h, 'data-coach'), getAttribute: (a) => attrOf(h, a), remove: () => { node = null; } }; } };
    placeCoach(bar, before); placeCoach(bar, before);
    placeCoach(bar, marked);
    if (inserts !== 2 || !node || !/:new$/.test(node.key)) return 'the hunt bar did not redraw the coach on a new card (' + inserts + ' draws, ' + (node && node.key) + ')';
    press(cs, 'coach-open');
    const open = draw(cs);
    if (open.includes('is-min') || open.includes('hs-coach-new') || !open.includes('Your hero walks to the rats, swings')) return 'opened, the coach is not its full text: ' + open;
    press(cs, 'coach-min');
    if (draw(cs).includes('hs-coach-new')) return 'opening did not clear the mark';
    placeCoach(bar, draw(cs));
    if (inserts !== 3 || /:new$/.test(node.key)) return 'the hunt bar kept the stale coach after a fold (' + node.key + ')';
    return null;
  },
  'coach-hold': async (M) => {
    /* The designer's playtest (2026-10-24): "Your hero fights alone" and "That's a level" were never on screen (the
       first kill lands 3 s after Enter, Level 2 inside 34 s). A card the SERVER finishes on its own stays up long
       enough to read; one the server passed while another was being read gets its turn, in order; a card the PLAYER
       finished (Enter) gives way at once; a reload shows the server's card at once. On the display clock (ctx.now). */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { pointerFor, readMs } = await imp('src/shell/launcher.js');
    const card = (id) => M.tut.HUNT_TUTORIAL.find((s) => s.id === id);
    let t = 1000;
    const env = { state: { level_xp: 0 }, hunt_settings: { preset: 1, slots: [] } };
    const hero = () => ({ read: (k) => env[k] });
    let cs = hero();
    const shown = (c) => (/data-tutorial="([a-z0-9_]+)"/.exec(pointerFor({ character: c || cs, glyphs: {}, now: () => t,
      hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } })) || [])[1] || null;
    if (shown() !== 'to_the_cellar') return 'a fresh hero is shown ' + shown();
    /* Enter: the server's first answer already holds the first kill and Level 2 (the card it says is past both) */
    env.hunt = { session_id: 's1', hunt_id: 'mill_cellar', ended: false, session: {}, hero: {}, pose: { units: [] } };
    env.state = { level_xp: M.xp.charXpForLevel(2) };
    const kill = readMs(card('first_kill')), level = readMs(card('first_level'));
    if (!(kill >= 4000 && level >= 4000)) return 'a card is held under 4 s (' + kill + ', ' + level + ')';
    const seen = [];
    for (const [dt, want] of [[0, 'first_kill'], [kill - 1, 'first_kill'], [1, 'first_level'], [level - 1, 'first_level'], [1, 'earn_the_thicket']]) {
      t += dt;
      seen.push(shown());
      if (seen[seen.length - 1] !== want) return 'after Enter the coach shows ' + seen.join(' > ') + ' (wanted ' + want + ' at that point)';
    }
    if (shown(hero()) !== 'earn_the_thicket') return 'a reload replays a held card';
    /* Cash in: the player's own press; the card gives way at once (a long-read card is never held over it) */
    t += 600000;
    env.state = { level_xp: M.xp.charXpForLevel(M.HUNTS.meadowbrook_thicket.band[0]) };
    env.hunt = Object.assign({}, env.hunt, { ended: true });
    if (shown() !== 'set_the_bar') return 'out of the cellar the coach shows ' + shown();
    env.hunt_settings = { preset: 1, slots: [], bar: [{ action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 50 }], join: 'and' }] };
    if (shown() !== 'into_the_thicket') return 'a saved bar is held over: ' + shown();
    return null;
  },
  'coach-ring': async (M) => {
    /* Every card rings the real control it names (the Huntera quick start; designer playtest 2026-10-24: no card rang
       anything): the window's icon while it is closed, then the control inside it, deepest first; the bar's food slot
       until its own Configure action is open, then Save. The icon row draws its ring itself, as the last attribute. */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { renderLaunchers, ringPlan } = await imp('src/shell/launcher.js');
    const { SHELL_WINDOWS } = await imp('src/data/shell-windows.js');
    const card = (id) => M.tut.HUNT_TUTORIAL.find((s) => s.id === id);
    for (const [a, row] of Object.entries(M.tut.TUTORIAL_ANCHORS)) {
      const w = row.window && SHELL_WINDOWS.find((r) => r.id === row.window);
      if (row.window && !w) return 'anchor ' + a + ' points into no window ' + row.window;
      if (row.icon && (!w || w.launcher === false)) return 'anchor ' + a + ' starts at an icon ' + row.window + ' does not have';
    }
    /* a card whose controls live in a window shows inside it */
    if (M.tut.coachWindow(card('set_the_bar')) !== 'configure-action' || M.tut.coachWindow(card('plant_land')) !== 'farm' || M.tut.coachWindow(card('first_kill')) !== null) return 'the card-in-window map is wrong';
    const at = (open, more) => ({ open: (id) => id === open, configuring: null, weight: null, ...more });
    const first = (id, a) => ringPlan(typeof id === 'string' ? card(id) : id, a)[0] || '';
    const want = [
      ['to_the_cellar', at(null), '.hs-launchers [data-hs-open="hunts"]'],
      ['to_the_cellar', at('hunts'), '.hw-hunt-enter[data-hunt="mill_cellar"]'],
      ['into_the_thicket', at('hunts'), '.hw-hunt-enter[data-hunt="meadowbrook_thicket"]'],
      ['leave_cellar', at(null), '[data-hs-act="leave"]'],
      ['plant_land', at(null), '.hs-launchers [data-hs-open="farm"]'],
      ['plant_land', at('farm'), '[data-crop="turnip"] [data-hs-act="sow"]'],
      ['cook_catch', at(null), '.hs-launchers [data-hs-open="skills-trade"]'],
      ['cook_catch', at('skills-trade'), '.hw-work-row[data-id="cook_shrimp"] [data-hs-act="work-go"]'],
      ['tamsins_task', at(null), '.hs-launchers [data-hs-open="tally"]'],
      ['tamsins_task', at('tally', { weight: false }), '.ht-weights'],
      ['tamsins_task', at('tally', { weight: true }), '[data-hs-act="take"][data-task="thicket_gray_wolves"]'],
    ];
    for (const [id, a, sel] of want) if (!first(id, a).includes(sel)) return id + ' rings ' + JSON.stringify(first(id, a)) + ', wanted ' + sel;
    if (!ringPlan(card('to_the_cellar'), at('hunts')).some((q) => q.includes('.hw-hunt[data-hunt="mill_cellar"]'))) return 'Hunts open on a phone list: the Mill Cellar line is never ringed';
    for (const id of ['first_kill', 'first_level', 'earn_the_thicket', 'tamsin_pays']) if (ringPlan(card(id), at(null)).length) return id + ' rings something, but names no control';
    /* the bar card: the slot that holds the food, then Save once THAT slot's Configure action is open */
    const bar = [{ type: 'ability', id: 'challenge' }, { type: 'ability', id: 'power_strike' }, { type: 'consume', id: 'cooked_shrimp' }];
    const barCard = M.tut.cardFor(card('set_the_bar'), bar);
    if (first(barCard, at(null)) !== '[data-hs-widget="action-bar"] .hb-slot[data-slot="2"]') return 'the bar card rings ' + first(barCard, at(null));
    if (!first(barCard, at('configure-action', { configuring: 2 })).includes('[data-x="save"]')) return 'Configure action open on the food slot: Save is not ringed';
    if (!first(barCard, at('configure-action', { configuring: 0 })).includes('.hb-slot[data-slot="2"]')) return 'Configure action open on another slot: the food slot lost its ring';
    if (ringPlan(M.tut.cardFor(card('set_the_bar'), []), at(null)).length) return 'no food on the bar, yet a slot is ringed';
    /* the icon row: a fresh hero's Hunts icon carries the ring (once, last attribute); with Hunts open, no icon does */
    const env = { state: { level_xp: 0 }, hunt_settings: { preset: 1, slots: [] } };
    const rows = SHELL_WINDOWS.filter((r) => r.launcher !== false);
    const row = (open) => renderLaunchers({ character: { read: (k) => env[k] }, glyphs: {}, hud: { isShown: () => false },
      wm: { openIds: () => open, rows: () => rows, row: (id) => rows.find((r) => r.id === id) } });
    const town = row([]);
    if ((town.match(/data-coach-ring/g) || []).length !== 1 || !/data-hs-open="hunts"[^>]*data-key="H" data-coach-ring="">/.test(town)) return 'a fresh hero\'s icon row rings ' + (town.match(/data-hs-open="[a-z-]+"[^>]*data-coach-ring/g) || []).join();
    if (/data-coach-ring/.test(row(['hunts']))) return 'with Hunts open an icon is still ringed';
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
    /* the server's sections: the latest hunt session (open or ended), the personal bests (finished hunts of 10+ min),
       the skills (Farming and Cooking XP: this hero planted and cooked), the shared land and Tamsin's tally */
    const land = (n) => ({ cap: 2, plot_level: 1, deeds: 0, upgrade: null, plots: Array.from({ length: n }, (_, i) => ({ i, crop: 'turnip', ready: false, ready_in_s: 600 })) });
    const tally = (held, paid) => ({ held: Array.from({ length: held }, (_, i) => ({ place: i + 1, task: 'thicket_gray_wolves', hunt: 'meadowbrook_thicket', monster: 'gray_wolf', kills: 40, target: 200 })),
      recent: Array.from({ length: paid }, () => ({ claim: 'c1', at: '2026-10-24T10:00:00Z', task: 'thicket_gray_wolves', gold: 480, item: 'bronze_helm', qty: 1 })),
      paid_today: paid, per_day: 3, held_max: 3, weight: 'heavy', order: [] });
    const env = (L, hunt, ended, bests, more) => ({ state: { level_xp: M.xp.charXpForLevel(L) },
      ...(hunt ? { hunt: { session_id: 's-' + hunt, hunt_id: hunt, ended, session: {}, hero: {}, pose: { units: [] } } } : {}),
      hunt_bests: { min_ms: 600000, grounds: Object.fromEntries((bests || []).map((g) => [g, { solo: { xp_h: 1, balance_h: 1 } }])) },
      hunt_settings: { preset: 1, slots: [eat], bar: [eat], role: 'tank' },
      skills: { melee: { xp: 0, level: L }, farming: { xp: 28, level: 1 }, cooking: { xp: 30, level: 1 } },
      farm_land: land(1), tally: tally(1, 0), ...(more || {}) });
    const party2 = { party: { id: '0a47c0de-0000-4000-a000-00000000aa01', members: [{ seat: 0, name: 'Mira' }, { seat: 1, name: 'Tyler' }], self_seat: 0, leader_seat: 0 } };
    /* a reload reads the same server sections into a fresh session: nothing the browser held survives it */
    const cardOf = (e) => { const s = JSON.parse(JSON.stringify(e)); const c = pointerCardOf({ read: (k) => s[k] }); return c ? c.id : null; };
    const ids = M.tut.HUNT_TUTORIAL.map((s) => s.id);
    /* a party card stands beside "What next" (a hero who makes a party after the solo chain meets it then) */
    const side = new Set(M.tut.HUNT_TUTORIAL.filter((s) => s.party).map((s) => s.id));
    const rank = (id) => (id && (id.startsWith('goal') || side.has(id)) ? ids.length : ids.indexOf(id));
    const T = M.HUNTS.meadowbrook_thicket.band[0], S = M.HUNTS.millrace_sewer.band[0];
    const TB = ['meadowbrook_thicket'];
    const walk = [
      ['town, the cellar left', env(T, 'mill_cellar', true), 'into_the_thicket'],
      ['in the Thicket', env(T, 'meadowbrook_thicket', false), 'tamsin_pays'],
      ['in the Thicket, the Sewer open', env(S, 'meadowbrook_thicket', false), 'tamsin_pays'],
      ['town, out of the Thicket', env(S, 'meadowbrook_thicket', true, TB), 'tamsin_pays'],
      ['reload in town', env(S, 'meadowbrook_thicket', true, TB), 'tamsin_pays'],
      ['paid on the way back', env(S, 'meadowbrook_thicket', true, TB, { tally: tally(0, 1) }), 'goal'],
      ['in the Sewer', env(S, 'millrace_sewer', false, TB, { tally: tally(0, 1) }), 'goal'],
      ['town, out of a short Sewer hunt', env(S, 'millrace_sewer', true, TB, { tally: tally(0, 1) }), 'goal'],
      ['back in the Cellar (Thicket and Sewer bests)', env(S, 'mill_cellar', false, ['meadowbrook_thicket', 'millrace_sewer'], { tally: tally(0, 1) }), 'goal'],
      /* a day later Tamsin's payment is out of the section and nothing is held; the harvest emptied the land */
      ['a day later, nothing held, the land harvested', env(S, 'mill_cellar', true, TB, { tally: tally(0, 0), farm_land: land(0) }), 'goal'],
      ['reload in town', env(S, 'mill_cellar', true, TB, { tally: tally(0, 0), farm_land: land(0) }), 'goal'],
      ['in a party at the Sewer floor (a friend joined)', env(S, 'mill_cellar', true, TB, { tally: tally(0, 0), ...party2 }), 'go_below'],
      ['in the Sewer with the party', env(S, 'millrace_sewer', false, TB, { tally: tally(0, 0), ...party2 }), 'goal'],
      ['town, out of the Sewer, party kept', env(S, 'millrace_sewer', true, TB, { tally: tally(0, 0), ...party2 }), 'goal'],
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
  { name: 'the farm line keys off this hero\'s Farming XP again, not the shared land (v0.2.35 "Nothing grows" over ready crops)', case: 'tutorial-launcher-card',
    edits: [['src/session/tutorial-sections.js', 'land: landOf(cs),',
      'land: sk && sk.farming ? { planted: sk.farming.xp > 0 ? 1 : 0, ready: {} } : null,']] },
  { name: 'the what-next line never sees the land (no farm hint)', case: 'tutorial-launcher-card',
    edits: [['src/session/tutorial-sections.js', 'land: landOf(cs),', 'land: null,']] },
  { name: 'ready crops on the land are never named', case: 'tutorial-launcher-card',
    edits: [['src/data/hunt-tutorial.js', '} else if (land && land.ready) {', '} else if (false) {']] },
  { name: 'the coach stamps the Farm window\'s countdown clock', case: 'tutorial-launcher-card',
    edits: [['src/session/farm-sections.js', '  return parse(read(cs, \'farm_land\'));\n', '  return farmLandOf(cs, 0);\n']] },
  { name: 'nothing to aim at after the guide (no what-next line)', case: 'tutorial-launcher-card',
    edits: [['src/session/tutorial-sections.js', '  if (card) return cardFor(card, f.bar);\n', '  return card && cardFor(card, f.bar);\n']] },
  { name: 'the launcher shows only the first card', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher.js', 'const card = pointerCardOf(cs);', "const card = pointerCardOf(cs) && { id: 'to_the_cellar', title: 'a', text: 'b' };"]] },
  { name: 'the pointer is drawn over an open window', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher.js', 'ctx.wm.openIds().length > 0', 'ctx.wm.row(ctx.wm.openIds()[0] || "") && ctx.wm.row(ctx.wm.openIds()[0]).modal']] },
  { name: 'the launcher keeps the pointer in a hunt (over Leave hunt)', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher.js', "(ctx.hud && ctx.hud.isShown('hunt-topbar') ? '' : pointerFor(ctx))", 'pointerFor(ctx)']] },
  { name: 'the coach fold is not kept (off the residue allowlist: open again after a reload)', case: 'coach-folds',
    edits: [['src/session/residue.js', '  coach: sanitizeCoach,', '']] },
  { name: 'a new card never marks the folded coach', case: 'coach-folds',
    edits: [['src/shell/launcher.js', 'fresh: min && !!card && r.seen !== card.id', 'fresh: false']] },
  { name: 'the hunt bar redraws the coach on a new card only (a fold in a hunt does nothing)', case: 'coach-folds',
    edits: [['src/shell/launcher.js', '/data-coach="([a-z0-9_:]+)"/', '/data-tutorial="([a-z0-9_]+)"/'],
      ['src/shell/launcher.js', "have.getAttribute('data-coach') !== key", "have.getAttribute('data-tutorial') !== key"],
      ['src/shell/launcher.js', "have.getAttribute('data-coach') === key", "have.getAttribute('data-tutorial') === key"]] },
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
    edits: [['src/data/hunt-tutorial.js', "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }, { party: true }),",
      "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }, { party: true }),\n  step('the_king', 'The Rat King', 'The last room is his.', 'world', { kind: 'pull', ground: 'millrace_sewer', pocket: 5 }),"]] },
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
  /* lane/b-tutorial-fixes (designer playtest 2026-10-24) */
  { name: 'the bar card says slot 1 whatever the bar holds (v0.2.42: slot 1 was Challenge)', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "(at(id) >= 0 ? 'slot ' + (at(id) + 1)", "(at(id) >= 0 ? 'slot 1'"]] },
  { name: 'the bar card rings no slot', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', 'const barSlot = item && at(item) >= 0 ? at(item) : null;', 'const barSlot = null;']] },
  { name: 'any Save finishes "Tell your hero when" (a spell slot restates the whole bar)', case: 'tutorial-walk-through',
    edits: [['src/session/tutorial-sections.js', 'foodSet: !!st && st.storedBar.some(eatsWhen),',
      'foodSet: !!st && st.storedBar.some((s) => !!s && Array.isArray(s.conditions) && s.conditions.length > 0),']] },
  { name: 'the party card walls a solo hero again', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', '(r.party ? facts.inParty === true && facts.charLevel >= HUNT_INDEX[r.done.hunt].band[0]', '(r.party ? true']] },
  { name: 'the party card meets a party below the Sewer floor', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', '(r.party ? facts.inParty === true && facts.charLevel >= HUNT_INDEX[r.done.hunt].band[0]', '(r.party ? facts.inParty === true']] },
  { name: 'cooking is not asked for (the town half is untaught)', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "case 'skill_xp': return xpIn(facts, d.skill) === null || xpIn(facts, d.skill) > 0;", "case 'skill_xp': return true;"]] },
  { name: 'a town section the server never sent walls the coach', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "case 'tally_paid': return !facts.tally || ", "case 'tally_paid': return !!facts.tally && "]] },
  { name: 'a harvest brings "Plant your land" back (the land alone judges it)', case: 'tutorial-never-backward',
    edits: [['src/data/hunt-tutorial.js', " || xpIn(facts, 'farming') > 0 || facts.landPlanted === true;", ' || facts.landPlanted === true;']] },
  { name: 'Tamsin\'s card comes back the day after she paid', case: 'tutorial-never-backward',
    edits: [['src/data/hunt-tutorial.js', ' || (t.weight === true && reached(facts, tallyTask(d.task).hunt))', '']] },
  { name: 'a party never meets the Sewer card', case: 'tutorial-never-backward',
    edits: [['src/session/tutorial-sections.js', 'inParty: !!party && party.seats.length >= 2,', 'inParty: false,']] },
  { name: 'the town lessons are asked of a hero past the Thicket', case: 'tutorial-launcher-card',
    edits: [['src/data/hunt-tutorial.js', ': facts.charLevel <= soloCap);', ': true);']] },
  { name: 'a solo hero hears no way to make a party', case: 'tutorial-launcher-card',
    edits: [['src/data/hunt-tutorial.js', "  const solo = facts.inParty !== true;\n", '  const solo = false;\n']] },
  { name: 'a card the server finishes is replaced before it can be read', case: 'coach-hold',
    edits: [['src/shell/launcher.js', '  if (auto(had.card) && now - had.since < readMs(had.card)) return had.card;\n', '']] },
  { name: 'a card the server passed while another was read is never shown', case: 'coach-hold',
    edits: [['src/shell/launcher.js', 'const passed = HUNT_TUTORIAL.slice(from + 1, to).find(auto);', 'const passed = null;']] },
  { name: 'a card the player finished is held over (Save looks ignored)', case: 'coach-hold',
    edits: [['src/shell/launcher.js', 'const auto = (r) => !!r && !!r.done && AUTO_KINDS.includes(r.done.kind);', 'const auto = (r) => !!r;']] },
  { name: 'no ring on the icon a card starts at', case: 'coach-ring',
    edits: [['src/data/hunt-tutorial.js', 'return a && a.icon && !open(a.window) ? a.window : null;', 'return null;']] },
  { name: 'the bar ring stays on the slot while its Configure action is open', case: 'coach-ring',
    edits: [['src/shell/launcher.js', "open('configure-action') && at.configuring === card.barSlot ?", 'false ?']] },
  { name: 'the icon row draws no ring of its own (a repaint drops it)', case: 'coach-ring',
    edits: [['src/shell/launcher.js', "(ring === r.id ? ' data-coach-ring=\"\"' : '')", "''"]] },
];

/* fixtures/h1.js `plant`, widened to the world engine and its manifests (the map cases read them):
   a mutant that cannot load would read as caught, so every path this file imports is copied. */
function plant(edits) {
  const root = mkdtempSync(join(tmpdir(), 'hunt-sewer-'));
  for (const d of ['src/core', 'src/data', 'src/world', 'src/session', 'src/shell', 'src/render', 'src/utils', 'assets/world', 'prototypes/hunt-sim-assets/manifest.json']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
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
/* --only a,b: those cases and their mutants alone (a lane re-checking the cases it touched; CI runs them all). */
const ONLY = process.argv.includes('--only') ? new Set(String(process.argv[process.argv.indexOf('--only') + 1] || '').split(',')) : null;
for (const [cn, fn] of Object.entries(cases)) {
  if (ONLY && !ONLY.has(cn)) continue;
  let why = null;
  try { why = await fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
let caught = 0;
for (const mu of mutants) {
  if ((ONLY && !ONLY.has(mu.case)) || process.argv.includes('--cases')) continue;
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  caught++;
  const p = plant(mu.edits);
  try {
    let why = null;
    /* A planted copy that cannot even load is a broken mutant, not a caught one. */
    const PM = await load(p.root);
    try { why = await cases[mu.case](PM); } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).filter((c) => !ONLY || ONLY.has(c)).length + ' cases, ' + caught + ' mutants caught');
R.finish();
