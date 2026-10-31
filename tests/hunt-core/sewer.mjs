// tests/hunt-core/sewer.mjs — THE MILLRACE SEWER AND ITS TUTORIAL, PLAYED (week plan item 17). Run by run-all.mjs.
//
//   sewer-on-the-map       every seat and spawn of both grounds stands on open floor of its
//                          world map, and every spawn is also listed in the map's `spawns`
//   formation-rows         the six sewer rows pass the roster audit on the formation band,
//                          walk at their own speed, and only the Rat King is a boss
//   party-scale            550 / 700 / 850 / 1000 permille, and the solo Healer floor
//   sewer-full-party-loop  a four-hero party plays the real core (stepSwing) on the real map:
//                          every pocket is pulled in route order, the Rat King dies, nobody wipes
//   tutorial-walk-through  each step is doable from the start kit plus the steps before it; one hero walks the whole
//                          chain in order (the 2026-10-25 curriculum); no solo wall; no town section is a wall
//   tutorial-bar-chain     every starting weapon on its real default bar: Your action bar, Spells need runes, Eat on
//                          time (Configure action's own waste), Order matters; "Tell your hero when" regression
//   tutorial-town-chain    sell or keep, Blessings (the server's numbers), Tamsin's weight per role, paid, setups
//   tutorial-reactive      ate, drank, a beating, more heroes, hunt together, upgrades, storage, stamina, a death,
//                          paid Blessings, juice, a house, own runes: each on its own fact and worded from it
//   tutorial-second-hero   a second hero skips the knowledge cards and keeps the ones that set its own state
//   tutorial-no-wall       no Got it recorder or shell facts: never a wall; no card names an empty slot
//   tutorial-never-backward  town -> Thicket -> town -> Sewer -> town -> Cellar, reloading between:
//                          the pointer never moves back (#58, Andy 10-22)
//   coach-gear-by-level    "What next" names the next gear at the next Level, only pieces a player can get
//                          and the role wears (Tyler 2026-10-24: gear is worn by the hero's Level)
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
  M.abilities = await imp('src/data/abilities.js');
  M.rules = await imp('src/data/rule-subjects.js');
  M.blessings = await imp('src/data/blessings.js');
  M.sessions = await imp('src/data/hunt-sessions.js');
  M.coreModel = await imp('src/data/core-model.js');
  M.runes = await imp('src/data/runes.js');
  M.consumables = await imp('src/data/consumables.js');
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

/* ── THE TUTORIAL'S FACTS, AS THE SERVER STATES THEM (src/session/tutorial-sections.js tutorialFactsOf's shape) ──
   tutKit: a fresh hero of a starting weapon set: the bar the server SHOWS it (the engine's heroSlots: the role's
   defaults its discipline keeps, then the kit's START_BAR; hr_hunt_settings_view is pinned equal by conditions.mjs)
   with the server's struck state for a hero carrying no rune (a rune spell is `usable` only when its slot names the
   store's rune: hr_hunt_settings_view), and the server's store rows (supply-basics.js, as hr_hunt_basic_supplies). */
function tutKit(M, role, weapon, shield) {
  const w = weapon || M.kit.START_EQUIPMENT.weapon;
  const sh = weapon ? shield || null : M.kit.START_EQUIPMENT.shield;
  const key = M.roles.wornRoleKey(Object.assign({ weapon: w }, sh ? { shield: sh } : {}), M.items.ITEMS);
  const discipline = M.roles.ROLE_KEYS[key].discipline;
  const r = role || M.roles.roleForWeapon(key, null);
  const allowed = (id) => !!M.abilities.ABILITIES[id] && M.abilities.ABILITIES[id].disciplines.includes(discipline);
  const shown = M.cond.heroSlots([], r, allowed).filter((x) => x.rule !== 'd_attack').map((x) => x.slot);
  const slots = shown.map((s) => {
    const a = s.action.type === 'ability' ? M.abilities.ABILITIES[s.action.id] : null;
    return { type: s.action.type, id: s.action.id, store: s.action.store || null, conditions: s.conditions, enabled: true,
      usable: !a || !a.rune || !!s.action.store, count: s.action.type === 'consume' && !M.basics.BASIC_INDEX[s.action.id] ? M.kit.START_INVENTORY[s.action.id] || 0 : null };
  });
  const rows = M.basics.BASIC_SUPPLIES.filter((b) => ['heal', 'mana', 'ammo'].includes(b.kind));
  return { role: r, weapon: w, discipline, slots,
    store: rows.map((b) => ({ id: b.id, kind: b.kind, partner: b.partner || null, amount: b.heals || b.mana || 0, price: b.price })),
    storeRows: rows.map((b) => ({ id: b.id, kind: b.kind, partner: b.partner || null, heals: b.heals || 0, mana: b.mana || 0, price: b.price })) };
}
/* The facts of that hero at Level L, in town, everything else fresh (`more` overrides). */
function tutAt(M, T, L, more) {
  const lr = M.blessings.BLESSING_RULES;
  return { levelXp: M.xp.charXpForLevel(L), charLevel: L, skillLevel: L, skillXp: { farming: 0, cooking: 0, melee: 0 }, huntId: null, endReason: null,
    visited: new Set(), unitKinds: new Set(), self: 0, name: 'Corliss', slots: T.slots, stored: [], discipline: T.discipline, role: T.role,
    stance: M.rules.ROLE_DEFAULTS[T.role].stance, store: T.store, carried: { ...M.kit.START_INVENTORY }, bag: { ...M.kit.START_INVENTORY },
    stacks: Object.keys(M.kit.START_INVENTORY).length, bagCap: 100, bankStacks: 0, lootRules: {}, weapon: T.weapon,
    blessings: { held: 0, of: M.blessings.BLESSING_TIERS.length, freeUntil: lr.freeUntilLevel, best: Math.max(...M.blessings.BLESSING_TIERS.map((t) => t.xpLossReductionPermille)),
      prices: M.blessings.BLESSING_TIERS.map((t) => M.blessings.blessingPrice(t.tier, L)) },
    death: null, supplies: [], huntMs: 0, hpMax: M.vit.maxHpFor(L, 0), presets: 0, landPlanted: false, land: { ready: {} }, home: null, gold: 500,
    staminaMs: 8 * 3600000, tally: { held: 0, paid: 0, weight: false }, inParty: false, partied: false,
    read: new Set(), roster: null, slotsOwned: null, playLimit: null, sellable: 0, upgrades: [], ...(more || {}) };
}
/* ONE HERO WALKS THE CHAIN: at each step the card the facts put up, then the press (or the server's change) that
   finishes it, until no card is left. [{ id, card, facts }] ending { id: null }. `extra` rides on every step's facts
   (a roster, `read: undefined` = no Got it recorder). */
function walkChain(M, T, extra) {
  let f = tutAt(M, T, 1, extra);
  const out = [];
  const set = (more) => { f = { ...f, ...more }; };
  const L = (n) => set({ levelXp: M.xp.charXpForLevel(n), charLevel: n, skillLevel: n, hpMax: M.vit.maxHpFor(n, 0),
    blessings: { ...f.blessings, prices: M.blessings.BLESSING_TIERS.map((t) => M.blessings.blessingPrice(t.tier, n)) } });
  const read = (id) => (f.read instanceof Set ? set({ read: new Set([...f.read, id]) }) : null);
  const at = (id, pct) => (s) => (s && s.id === id ? { ...s, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: pct }] } : s);
  const save = (slots) => set({ slots, stored: slots.map((s) => (s ? { type: s.type, id: s.id, conditions: s.conditions } : null)) });
  const press = {
    to_the_cellar: () => set({ huntId: 'mill_cellar', visited: new Set([...f.visited, 'mill_cellar']) }),
    first_kill: () => set({ levelXp: 3 }),
    first_level: () => L(2),
    plant_land: () => set({ skillXp: { ...f.skillXp, farming: 28 }, landPlanted: true }),
    bar_intro: () => { read('bar_intro'); L(3); },
    spell_runes: () => save(f.slots.map((s) => (s && s.type === 'ability' && s.usable === false
      ? { ...s, usable: true, store: (f.store.find((r) => r.partner === M.abilities.ABILITIES[s.id].rune) || {}).id } : s))),
    food_when: () => { L(4); save(f.slots.map(at('cooked_shrimp', 45))); },
    food_order: () => save(f.slots.map(at('salted_shrimp', 45))),
    /* the player takes the offer: the spell into the card's empty slot, its store rune on (the server: it can fire) */
    first_spell: () => {
      const c = M.tut.cardFor(M.tut.currentCard(f), f);
      const spell = /data-id="([a-z_]+)"/.exec(c.hooks.join(' '))[1], store = /data-store="([a-z_]+)"/.exec(c.hooks.join(' '))[1];
      const slots = f.slots.slice();
      slots[c.barSlot] = { type: 'ability', id: spell, store, conditions: [], enabled: true, usable: true, count: null };
      save(slots);
    },
    earn_the_thicket: () => L(5),
    leave_cellar: () => set({ huntId: null, endReason: 'left', sellable: 5 }),
    sell_loot: () => set({ sellable: 0 }),
    loot_rules: () => set({ lootRules: { rat_tail: 'sell' } }),
    cook_catch: () => set({ skillXp: { ...f.skillXp, cooking: 30 } }),
    styles: () => read('styles'),
    bless: () => set({ blessings: { ...f.blessings, held: f.blessings.of, prices: [] } }),
    tamsins_task: () => set({ tally: { held: 1, paid: 0, weight: true } }),
    into_the_thicket: () => set({ huntId: 'meadowbrook_thicket', visited: new Set([...f.visited, 'meadowbrook_thicket']), sellable: null }),
    tamsin_pays: () => { L(7); set({ huntId: null, endReason: 'left', tally: { held: 0, paid: 1, weight: true }, sellable: 0 }); },
    save_setup: () => set({ presets: 1 }),
    /* Level 7 is the day-one goals' Level (lane/b-first-hour): paid at 7, the hero meets "Make your own runes" next.
       Its press: a rune of the bar's spell family made and carried. */
    own_runes: () => {
      const s = f.slots.find((x) => x && x.type === 'ability' && M.abilities.ABILITIES[x.id] && M.abilities.ABILITIES[x.id].rune);
      set({ carried: { ...f.carried, [M.abilities.ABILITIES[s.id].rune]: 45 } });
    },
  };
  for (let n = 0; n < 60; n++) {
    const c = M.tut.currentCard(f);
    out.push({ id: c ? c.id : null, card: c ? M.tut.cardFor(c, f) : null, facts: f });
    if (!c || !press[c.id]) break;
    press[c.id]();
  }
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
    /* What the player holds and can reach after each CHAIN step: the walk-through, in code (a reactive card starts on
       its own fact and a party card is never on a solo hero's way: the chain is what a fresh solo hero walks). */
    const can = { hunts: new Set(Object.values(H).filter((h) => h.band[0] <= fresh).map((h) => h.id)), inHunt: null, entered: new Set(), pulled: [] };
    if (!Object.keys(M.kit.START_INVENTORY).some((id) => M.supplies.SUPPLIES[id] && M.supplies.SUPPLIES[id].kind === 'heal')) {
      return 'the start kit carries no food the hunt bag can eat';
    }
    const kit = M.kit.START_INVENTORY;
    const town = (s) => (s.when || []).some((w) => w.kind === 'in_town');
    for (const s of steps) {
      const d = s.done;
      if (s.party || s.reactive) continue;
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
        if (!town(s)) return s.id + ': ' + d.skill + ' is asked for while a hunt may run';
      } else if (d.kind === 'tally_taken') {
        /* Tamsin takes no task while the hero hunts; hers is a solo task on a ground this chain enters next */
        const t = M.tally.tallyTask(d.task);
        if (!town(s)) return s.id + ': a task is asked for while a hunt may run (Take is off)';
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
      } else if (d.kind === 'food_cond' || d.kind === 'food_order') {
        /* the condition the card moves is the registry's own row, in steps the editor takes (5%) */
        if (!M.cm.METRICS.some((m) => m.id === 'self_hp_pct')) return s.id + ': the condition the card names is not in the registry';
      } else if (d.kind === 'blessed') {
        /* free at the Level the card asks it (the Thicket's floor, under the free limit) and in town */
        if (!town(s) || !(M.blessings.BLESSING_RULES.freeUntilLevel > H.meadowbrook_thicket.band[0])) return s.id + ': Blessings are not free in town when the card asks';
      } else if (d.kind === 'pull') {
        if (can.inHunt !== M.grounds.HUNT_GROUNDS[d.ground].hunt) return s.id + ': not hunting ' + d.ground;
        const pk = M.grounds.HUNT_GROUNDS[d.ground].pockets[d.pocket];
        if (pk && (pk.minParty || 1) > 1) return s.id + ': pocket ' + d.pocket + ' of ' + d.ground + ' needs a party of ' + pk.minParty;
        const route = M.grounds.HUNT_GROUNDS[d.ground].route;
        const prev = can.pulled.length ? route.indexOf(can.pulled[can.pulled.length - 1]) : -1;
        if (route.indexOf(d.pocket) <= prev) return s.id + ': pocket ' + d.pocket + ' comes before one already reached';
        can.pulled.push(d.pocket);
      }
    }
    /* B5 is doable for EVERY starting weapon: each rune spell a role's default bar names has a store rune to pick. */
    for (const [role, list] of Object.entries(M.rules.ROLE_RULES)) {
      for (const sl of list) {
        const a = M.abilities.ABILITIES[sl.action.id];
        if (a && a.rune && !M.basics.BASIC_SUPPLIES.some((b) => b.partner === a.rune)) return role + ': ' + a.n + ' needs a rune the store does not sell (the rune card cannot be finished)';
      }
    }
    const cellar = M.grounds.HUNT_GROUNDS.mill_cellar;
    if (cellar.hunt !== steps[0].done.hunt) return 'the first hunt is not the cellar ground';
    /* THE WHOLE CHAIN, ONE HERO (2026-10-21: the launcher showed only card 1): every card in order, from facts. */
    const T = tutKit(M, 'tank');
    const order = walkChain(M, T).map((x) => x.id);
    /* the sword's default sets hold no rune spell (playtest 2026-10-29 #9: Flame Strike sat struck from minute one); "A spell
       costs runes" offers it in the Cellar, and a hero who takes it (store rune on) meets "Make your own runes" on day one */
    const want = ['to_the_cellar', 'first_kill', 'first_level', 'plant_land', 'bar_intro', 'food_when', 'food_order', 'first_spell', 'earn_the_thicket',
      'leave_cellar', 'sell_loot', 'loot_rules', 'cook_catch', 'styles', 'bless', 'tamsins_task', 'into_the_thicket', 'tamsin_pays', 'save_setup', 'own_runes', null];
    if (order.join() !== want.join()) return 'a sword-and-shield hero walks ' + order.join(' > ') + ', wanted ' + want.join(' > ');
    /* NO SOLO WALL: paid, a solo hero at the Sewer's floor is done (What next), at any Level up to the Sewer's top. */
    const done = walkChain(M, T).pop().facts;
    const sewerBand = H.millrace_sewer.band[0];
    for (let L = sewerBand; L <= H.millrace_sewer.band[1]; L++) {
      const c = M.tut.currentCard({ ...done, levelXp: M.xp.charXpForLevel(L), charLevel: L });
      if (c && !c.reactive) return 'a solo Level ' + L + ' hero meets ' + c.id + ' (a wall for a solo hero)';
    }
    /* A hero in a party meets the Sewer card at its floor, never below it, and not once in the sewer. */
    const atSewer = { ...done, levelXp: M.xp.charXpForLevel(sewerBand), charLevel: sewerBand };
    if ((M.tut.currentCard({ ...atSewer, inParty: true }) || {}).id !== 'go_below') return 'a party hero at the Sewer floor does not meet go_below';
    if ((M.tut.currentCard({ ...atSewer, charLevel: sewerBand - 1, levelXp: M.xp.charXpForLevel(sewerBand - 1), inParty: true }) || {}).id === 'go_below') return 'a party hero under the Sewer floor meets go_below';
    if (M.tut.currentCard({ ...atSewer, inParty: true, huntId: 'millrace_sewer' })) return 'the tutorial does not end once the party is in the sewer';
    /* ...even when the server's record holds the Sewer alone (no best on the Thicket yet): a ground past it counts */
    if (M.tut.currentCard({ ...atSewer, inParty: true, huntId: 'millrace_sewer', visited: new Set() })) return 'in the sewer the coach sends the party back to ' + M.tut.currentCard({ ...atSewer, inParty: true, huntId: 'millrace_sewer', visited: new Set() }).id;
    if (M.tut.currentCard({ ...atSewer, charLevel: H.millrace_sewer.band[1] + 1, levelXp: M.xp.charXpForLevel(H.millrace_sewer.band[1] + 1), inParty: true })) return 'a hero past the sewer band is still coached';
    /* A town fact the server never sent is not a wall: no skills, no land, no tally, no rules, no Blessings, no shell facts. */
    const thicket = H.meadowbrook_thicket.band[0];
    const blind = { levelXp: M.xp.charXpForLevel(thicket), charLevel: thicket, skillLevel: thicket, skillXp: null, huntId: null, visited: new Set(['mill_cellar']), unitKinds: new Set(), landPlanted: null, tally: null, inParty: false };
    if ((M.tut.currentCard(blind) || {}).id !== 'into_the_thicket') return 'with no town sections the coach asks for ' + (M.tut.currentCard(blind) || {}).id;
    if (M.tut.currentCard({ ...blind, huntId: 'meadowbrook_thicket' })) return 'with no town sections a hero in the Thicket is asked for ' + M.tut.currentCard({ ...blind, huntId: 'meadowbrook_thicket' }).id;
    /* The way down exists: the cellar map has an exit into the sewer map. */
    const cm = M.maps.WORLD_MAPS.find((m) => m.id === cellar.map);
    if (!cm.exits.some((e) => e.to === 'millrace_sewer')) return 'the cellar has no way down into the sewer';
    return null;
  },
  'tutorial-bar-chain': async (M) => {
    /* TYLER 2026-10-25: the tutorial teaches the bar DURING combat. For EVERY starting weapon, on the bar the server
       shows a fresh hero (the role's defaults, then the kit's START_BAR, with the server's struck state): Your action bar,
       then Spells need runes (the struck slot, its spell, its rune family, the store's rune at the server's price), then
       Eat on time (the real waste at the real max HP, by the Configure action's own sum), then Order matters, then the
       Thicket. Each finishes on what the SERVER then says. */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { wasteLine } = await imp('src/shell/action-table.js');
    const sets = { tank: ['practice_sword', 'practice_shield'], axes: ['practice_hatchets'], hammer: ['practice_club'], mage: ['practice_wand', 'practice_spellbook'],
      bow: ['practice_bow'], crossbow: ['practice_crossbow'], healer: ['practice_staff'] };
    for (const [set, [weapon, shield]] of Object.entries(sets)) {
      const T = tutKit(M, null, weapon, shield);
      const L3 = tutAt(M, T, 3, { huntId: 'mill_cellar', visited: new Set(['mill_cellar']), skillXp: { farming: 28, cooking: 0, melee: 0 }, landPlanted: true, read: new Set() });
      const say = (f) => { const c = M.tut.currentCard(f); return c ? M.tut.cardFor(c, f) : null; };
      const intro = say(L3);
      if (!intro || intro.id !== 'bar_intro') return set + ': at Level 3 in the Cellar the card is ' + (intro && intro.id);
      if (!/^Your hero uses this bar by itself\. .* Slots? \d/.test(intro.text) || !intro.text.toLowerCase().includes(M.tut.slotWords(T.slots.map((s, i) => (s.type === 'ability' ? i : -1)).filter((i) => i >= 0))))
        return set + ': the bar card does not say which slots are the moves: ' + intro.text;
      const read = { ...L3, read: new Set(['bar_intro']) };
      const struck = T.slots.findIndex((s) => s.type === 'ability' && s.usable === false);
      const card = say(read);
      if (struck >= 0) {
        const a = M.abilities.ABILITIES[T.slots[struck].id];
        const fam = M.items.ITEMS[a.rune].family;
        const st = T.store.find((r) => r.partner === a.rune);
        const want = 'Slot ' + (struck + 1) + ', ' + a.n + ', has a line through it: every cast needs ' + (/^[AEIOU]/.test(M.runes.RUNE_FAMILIES[fam].label) ? 'an ' : 'a ')
          + M.runes.RUNE_FAMILIES[fam].label + ' rune';
        if (!card || card.id !== 'spell_runes' || !card.text.startsWith(want) || !card.text.includes('pick ' + M.basics.BASIC_INDEX[st.id].n) || !card.text.includes('(' + st.price + ' gp a cast')
          || card.barSlot !== struck || !card.hooks.some((h) => h.includes('data-store="' + st.id + '"'))) return set + ': the rune card reads ' + JSON.stringify(card && { id: card.id, text: card.text, barSlot: card.barSlot }) + ', wanted it to start "' + want + '"';
        /* a store with no rune of that family: the card cannot be finished, so it is passed by, never shown */
        const noStore = M.tut.currentCard({ ...read, store: T.store.filter((r) => r.partner !== a.rune) });
        if (!noStore || noStore.id === 'spell_runes') return set + ': with no store rune to name, the rune card is ' + (noStore ? 'still up' : 'up with no words (the coach goes blank)');
      } else if (card && card.id === 'spell_runes') return set + ': no spell is struck, yet the rune card is up';
      /* Saved with the store's rune on that slot: the server now says it can fire */
      const fixed = { ...read, slots: T.slots.map((s) => ({ ...s, usable: true })) };
      const eat = say(fixed);
      const food = T.slots.findIndex((s) => s.type === 'consume' && s.id === 'cooked_shrimp');
      const heal = M.consumables.CONSUMABLES.cooked_shrimp.amount;
      const lost = M.tut.wasteAt(heal, 60, fixed.hpMax);
      const line = wasteLine({ kind: 'food', amount: heal }, 60, fixed.hpMax);
      if (lost > 0 ? !line.includes(lost + ' of its ' + heal) : line !== '') return set + ': the coach\'s waste (' + lost + ') is not Configure action\'s: "' + line + '"';
      if (!eat || eat.id !== 'food_when' || eat.barSlot !== food || !eat.text.startsWith('Slot ' + (food + 1) + ' eats your own Cooked Shrimp when your HP is below 60%. A Cooked Shrimp heals ' + heal)
        || !eat.text.includes(fixed.hpMax + ' HP') || (lost > 0 && !eat.text.includes(lost + ' of it is wasted'))) return set + ': the eat card reads ' + JSON.stringify(eat && eat.text);
      /* where it says to stop: Configure action's 5% steps down from 60 until nothing is wasted, never under 50% */
      let stop = 60;
      while (stop - 5 >= 50 && M.tut.wasteAt(heal, stop, fixed.hpMax) > 0) stop -= 5;
      if (lost > 0 && !eat.text.includes('press − until it reads ' + stop + '%')) return set + ': the eat card does not stop at ' + stop + '%: ' + eat.text;
      /* REGRESSION ("Tell your hero when" never showed, PRIORITY_BOARD 2026-10-25 #2): any Save restates the whole bar, so the
         kit's own 60% food slot comes back STORED; that is not the player choosing when to eat. */
      const kitStored = { ...fixed, stored: T.slots.map((s) => ({ type: s.type, id: s.id, conditions: s.conditions })) };
      if ((say(kitStored) || {}).id !== 'food_when') return set + ': a Save that restates the kit\'s bar (food still at 60%) finished "Eat on time": ' + (say(kitStored) || {}).id;
      /* the player sets 45%: the stored bar and the shown bar both say so */
      const at = (pct) => (s) => (s && s.id === 'cooked_shrimp' ? { ...s, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: pct }] } : s);
      const set45 = { ...fixed, slots: fixed.slots.map(at(45)), stored: kitStored.stored.map(at(45)) };
      const order = say(set45);
      const shop = T.slots.findIndex((s) => s.type === 'consume' && s.id === 'salted_shrimp');
      if (!order || order.id !== 'food_order' || order.barSlot !== shop || !order.text.startsWith('Slot ' + (shop + 1) + ' still buys Salted Shrimp (' + M.basics.BASIC_INDEX.salted_shrimp.price
        + ' gp) below 60%, so between 45% and 60% it eats before your own Cooked Shrimp.')) return set + ': the order card reads ' + JSON.stringify(order && order.text);
      const both = (s) => (s && s.id === 'salted_shrimp' ? { ...s, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 45 }] } : at(45)(s));
      const fixedOrder = { ...set45, slots: fixed.slots.map(both), stored: kitStored.stored.map(both) };
      /* a bar with no rune spell, of a style that has one, is offered it ("A spell costs runes"); Got it moves on */
      const offer = !T.slots.some((s) => s.type === 'ability' && M.abilities.ABILITIES[s.id].rune)
        && Object.values(M.abilities.ABILITIES).some((a) => a.active && a.rune && a.disciplines.includes(T.discipline));
      if ((say(fixedOrder) || {}).id !== (offer ? 'first_spell' : 'earn_the_thicket')) return set + ': with the bar set the card is ' + (say(fixedOrder) || {}).id;
      if (offer && (say({ ...fixedOrder, read: new Set([...fixedOrder.read, 'first_spell']) }) || {}).id !== 'earn_the_thicket') return set + ': after Got it on the spell offer the card is ' + (say({ ...fixedOrder, read: new Set([...fixedOrder.read, 'first_spell']) }) || {}).id;
      /* the store slot moved BEFORE the own food at the same HP: the first slot whose conditions pass fires, so it eats
         first; the card asks to move it after the own slot (lowering it to the same HP would not do) */
      const swapped = fixedOrder.slots.slice();
      [swapped[food], swapped[shop]] = [swapped[shop], swapped[food]];
      const early = say({ ...fixedOrder, slots: swapped });
      if (!early || early.id !== 'food_order' || early.barSlot !== food || !early.text.includes('and it comes first, so it eats before your own Cooked Shrimp. Press slot '
        + (food + 1) + ', press Later until it sits after slot ' + (shop + 1) + ', then Save.')) return set + ': a store slot ahead of the own food reads ' + JSON.stringify(early && early.text);
      /* the own food gone (struck "none left"): the store eating first is the fallback working, not a wrong order */
      if ((say({ ...set45, slots: set45.slots.map((s) => (s && s.id === 'cooked_shrimp' ? { ...s, count: 0 } : s)) }) || {}).id === 'food_order') return set + ': with no own food left the order card still asks';
      /* no food slot on the bar at all (the player emptied it): no card names one (#2: "Press the Cooked Shrimp slot") */
      const bare = { ...fixed, slots: fixed.slots.map((s) => (s && s.type === 'consume' ? null : s)) };
      const b = say(bare);
      if (b && /eat|food|Cooked Shrimp/i.test(b.text) && b.id !== 'earn_the_thicket') return set + ': with no food on the bar the coach still says: ' + b.text;
    }
    /* THROUGH THE REAL ENVELOPE (src/session/tutorial-sections.js): the server's struck state, stored bar and Got it reads */
    const tsb = await imp('src/session/tutorial-sections.js');
    /* the kit's sword-and-shield hero has no struck spell (its Flame Strike names the store rune): it reads the bar, then
       eats on time; the hatchets' Rend (no store rune by default) is the struck spell the rune card speaks of */
    const tank = tutKit(M, 'tank');
    const T = tutKit(M, null, 'practice_hatchets');
    const env = (stored, usable, K = T) => ({ state: { level_xp: M.xp.charXpForLevel(3) }, skills: { farming: { xp: 28, level: 1 } },
      hunt: { session_id: 's', hunt_id: 'mill_cellar', ended: false, session: {}, hero: { hp_max: 170 }, pose: { units: [] } },
      hunt_settings: { preset: 0, role: K.role, discipline: K.discipline, stance: 'balanced', store: K.storeRows,
        slots: K.slots.map((s) => ({ action: { type: s.type, id: s.id }, conditions: s.conditions, join: 'and', usable: usable || s.usable, count: s.count })), bar: stored } });
    const cardOn = (e, sh) => { const c = tsb.pointerCardOf({ read: (k) => e[k], slot: 0 }, sh); return c && c.id; };
    if (tank.slots.some((s) => s.usable === false)) return 'the kit\'s sword-and-shield bar shows a struck slot: ' + tank.slots.filter((s) => s.usable === false).map((s) => s.id).join();
    if (cardOn(env([], false, tank), { read: ['bar_intro'] }) !== 'food_when') return 'through the envelope a tank at Level 3, the bar read, sees ' + cardOn(env([], false, tank), { read: ['bar_intro'] });
    if (cardOn(env([])) !== 'spell_runes') return 'through the envelope (no Got it recorder) a hatchet hero at Level 3 sees ' + cardOn(env([]));
    if (cardOn(env([]), { read: [] }) !== 'bar_intro') return 'through the envelope with a recorder the bar card is not up: ' + cardOn(env([]), { read: [] });
    if (cardOn(env([]), { read: ['bar_intro'] }) !== 'spell_runes') return 'through the envelope, read, the rune card is not up';
    const kitWire = T.slots.map((s) => ({ action: { type: s.type, id: s.id }, conditions: s.conditions, join: 'and' }));
    if (cardOn(env(kitWire, true), { read: ['bar_intro'] }) !== 'food_when') return 'through the envelope, the kit bar restated by a Save finishes "Eat on time": ' + cardOn(env(kitWire, true), { read: ['bar_intro'] });
    return null;
  },
  'starter-bars': async (M) => {
    /* NO UNEXPLAINED DEAD BUTTON (designer 2026-10-29, lane/a-starter-bars). A style's DEFAULT bar is what a hero sees
       until its first Save (after that the bar is the player's): the kit's sword and shield, or a weapon taken up from
       the bag in minute one. Per style: the sword's sets show nothing struck and offer a rune spell ("A spell costs
       runes"); the hammer has no rune spell to strike or offer; every other style's struck rune spells are each explained
       by "Spells need runes" (that slot, its family's store rune at the server's price), one after another, and then the
       chain goes on to "Eat on time". (Minute one, before the card: Hunts' Before you go names each one and its fix,
       alpha-windows AW-27.) */
    const sets = { tank: [M.kit.START_EQUIPMENT.weapon, M.kit.START_EQUIPMENT.shield], sword: ['practice_sword'], hammer: ['practice_club'],
      axes: ['practice_hatchets'], bow: ['practice_bow'], crossbow: ['practice_crossbow'], mage: ['practice_wand', 'practice_spellbook'], healer: ['practice_staff'] };
    const want = { tank: '-/first_spell', sword: '-/first_spell', hammer: '-/-', axes: 'rend/-', bow: 'flame_volley/-', crossbow: 'flame_volley/-',
      mage: 'frost_lance+arcane_barrier/-', healer: 'circle_of_renewal+green_sickness/-' };
    const seen = [];
    for (const [set, [weapon, shield]] of Object.entries(sets)) {
      const K = tutKit(M, null, weapon, shield);
      const walk = walkChain(M, K);
      const ids = walk.map((s) => s.id);
      const struck = K.slots.map((s, i) => (s.type === 'ability' && s.usable === false ? i : -1)).filter((i) => i >= 0);
      const row = (struck.map((i) => K.slots[i].id).join('+') || '-') + '/' + (ids.includes('first_spell') ? 'first_spell' : '-');
      if (row !== want[set]) return set + ': struck/offer reads ' + row + ', the ruling is ' + want[set];
      if (!struck.length) { if (ids.includes('spell_runes')) return set + ': nothing is struck, yet "Spells need runes" is up'; seen.push(set + ' ' + row); continue; }
      const first = walk.find((s) => s.id === 'spell_runes');
      if (!first) return set + ': a struck slot and no "Spells need runes"';
      let f = first.facts;
      for (const i of struck) {
        const c = M.tut.currentCard(f), card = c && M.tut.cardFor(c, f);
        const st = K.store.find((r) => r.partner === M.abilities.ABILITIES[K.slots[i].id].rune);
        if (!card || card.id !== 'spell_runes' || card.barSlot !== i || !st || !card.hooks.some((h) => h.includes('data-store="' + st.id + '"'))
          || !card.text.includes('(' + st.price + ' gp a cast'))
          return set + ': slot ' + (i + 1) + ' (' + K.slots[i].id + ') is struck and the card is ' + JSON.stringify(card && { id: card.id, barSlot: card.barSlot, text: card.text });
        f = { ...f, slots: f.slots.map((s, k) => (k === i ? { ...s, usable: true, store: st.id } : s)) };
      }
      const next = M.tut.currentCard(f);
      if ((next && next.id) !== 'food_when') return set + ': with every struck slot fixed the chain goes on at ' + (next && next.id) + ', not food_when';
      seen.push(set + ' ' + row);
    }
    console.log('    starter bars (struck/offer): ' + seen.join(' | '));
    return null;
  },
  'tutorial-town-chain': async (M) => {
    /* THE FIRST RETURN, then the Thicket: sell what only pays coin (the Shop's own Sell all loot set, from the shell), decide
       once (a loot rule), cook, styles (Got it), Blessings before the wolves (the SERVER's free limit and protection), Tamsin
       (the armor weight for the hero's role), the Thicket, paid (not while hunting another ground), keep this bar. */
    const T = tutKit(M, 'tank');
    const steps = walkChain(M, T);
    const said = (id) => (steps.find((s) => s.id === id) || {}).card;
    const bless = said('bless');
    if (!bless || !bless.text.includes('costs ' + Math.round(M.sessions.DEATH_XP_LOSS * 100) + '% of your Level XP, never a Level')
      || !bless.text.includes('up to ' + M.blessings.BLESSING_TIERS[M.blessings.BLESSING_TIERS.length - 1].xpLossReductionPermille / 10 + '%')
      || !bless.text.includes('free until Level ' + M.blessings.BLESSING_RULES.freeUntilLevel) || !bless.text.includes('Bless all three')) return 'the Blessing card reads ' + JSON.stringify(bless && bless.text);
    const tam = said('tamsins_task');
    if (!tam || !tam.text.includes('Heavy suits a shield tank') || !tam.text.includes('Take 200 Gray Wolves')) return 'Tamsin\'s card reads ' + JSON.stringify(tam && tam.text);
    /* playtest 2026-10-29: the way comes first (on a phone the card's foot, its Take, was cut off under the armor words);
       a card shown from the first kill until Level 2 never names the Level; words inside a window name the server's slot */
    if (tam.text.indexOf('Take 200 Gray Wolves') > tam.text.indexOf('Heavy adds')) return 'Tamsin\'s card says the weights before the way: ' + JSON.stringify(tam.text);
    const lv = M.tut.HUNT_TUTORIAL.find((c) => c.id === 'first_level');
    if (!lv || /\bLevel \d/.test(lv.title + ' ' + lv.text)) return 'the first-Level card (shown at Level 1) names a Level: ' + JSON.stringify(lv && lv.title);
    const cook = said('cook_catch');
    if (!cook || !cook.textIn || /\{slot:/.test(cook.textIn) || !/slot \d/.test(cook.textIn)) return 'the cooking card inside its window reads ' + JSON.stringify(cook && cook.textIn);
    for (const role of ['tank', 'melee_dps', 'ranger', 'mage', 'healer']) {
      const w = M.tut.WEIGHT_FOR_ROLE[role];
      const piece = Object.entries(M.items.ITEMS).find(([, it]) => it.slot === 'helmet' && M.coreModel.ARMOUR_WEIGHT[it.armourClass] === w && it.reqLv <= 5);
      if (!piece || !M.tut.wornByRole(piece[0], role)) return 'Tamsin\'s card advises ' + w + ' for a ' + role + ', which costs its style (' + (piece && piece[0]) + ')';
    }
    const pays = said('tamsin_pays');
    if (!pays || !pays.text.includes(M.tally.tallyTask('thicket_gray_wolves').gold + ' gp')) return 'the paid card reads ' + JSON.stringify(pays && pays.text);
    /* hunting ANOTHER ground (the Glade), the Thicket's payment card is not the one up (#25 of the walk) */
    const held = steps.find((s) => s.id === 'tamsin_pays').facts;
    if ((M.tut.currentCard({ ...held, huntId: 'mosslight_glade' }) || {}).id === 'tamsin_pays') return 'hunting the Glade, the coach still says to hunt the Thicket';
    /* Cash in tells the truth: loot is in the bag as it drops (the old card said it goes there when you leave) */
    const cash = said('leave_cellar');
    if (!cash || /when you do/.test(cash.text) || !cash.text.includes('already in your bag')) return 'the Cash in card reads ' + JSON.stringify(cash && cash.text);
    /* back in town from the Thicket with loot to sell, the first-return cards do not come back */
    const back = { ...steps.find((s) => s.id === 'save_setup').facts, sellable: 6, lootRules: {} };
    if (['sell_loot', 'loot_rules'].includes((M.tut.currentCard(back) || {}).id)) return 'back from the Thicket the coach asks again: ' + M.tut.currentCard(back).id;
    return null;
  },
  'tutorial-reactive': async (M) => {
    /* THE CARDS THAT EXPLAIN WHAT JUST HAPPENED, each on its own server fact, each worded from the server's numbers. A
       reactive card placed before the chain interrupts it while its fact holds; a day-one card waits for the chain. */
    const T = tutKit(M, 'tank');
    const steps = walkChain(M, T);
    const inThicket = steps.find((s) => s.id === 'tamsin_pays').facts;
    const say = (f) => { const c = M.tut.currentCard(f); return c ? M.tut.cardFor(c, f) : null; };
    const R = (f, ...ids) => ({ ...f, read: new Set([...(inThicket.read || []), ...ids]) });
    const own = (n) => [{ item: 'cooked_shrimp', source: 'own', count: n, gold: 0 }];
    const ate = say(R({ ...inThicket, supplies: own(2), carried: { cooked_shrimp: 18 } }));
    const food = T.slots.findIndex((s) => s.id === 'cooked_shrimp'), shop = T.slots.findIndex((s) => s.id === 'salted_shrimp');
    const ateWant = 'Your HP fell under ' + inThicket.slots[food].conditions[0].value + '%, so slot ' + (food + 1) + ' ate a Cooked Shrimp. You have 18 left; after that slot ' + (shop + 1) + ' buys Salted Shrimp at '
      + M.basics.BASIC_INDEX.salted_shrimp.price + ' gp.';
    if (!ate || ate.id !== 'first_eat' || !ate.text.startsWith(ateWant)) return 'the ate card reads ' + JSON.stringify(ate && ate.text) + ', wanted it to start "' + ateWant + '"';
    if ((say(R({ ...inThicket, supplies: own(2) }, 'first_eat')) || {}).id !== 'tamsin_pays') return 'read, the ate card does not give the chain back';
    const drink = T.slots.findIndex((s) => s.id === 'thin_turnip_juice');
    const drank = say(R({ ...inThicket, supplies: [{ item: 'thin_turnip_juice', source: 'store', count: 1 }] }));
    if (!drank || drank.id !== 'first_drink' || !drank.text.includes('Below 30% mana, slot ' + (drink + 1) + ' buys Thin Turnip Juice (' + M.basics.BASIC_INDEX.thin_turnip_juice.price + ' gp)')) return 'the drink card reads ' + JSON.stringify(drank && drank.text);
    const beat = say(R({ ...inThicket, supplies: own(3) }, 'first_eat'));
    if (!beat || beat.id !== 'fight_settings' || !beat.text.includes('Defensive takes 15% less damage and deals 10% less; Offensive deals and takes 10% more.')) return 'the stance card reads ' + JSON.stringify(beat && beat.text);
    if ((say(R({ ...inThicket, supplies: own(3), stance: 'defensive' }, 'first_eat')) || {}).id === 'fight_settings') return 'the stance changed, yet the stance card is up';
    /* more than one hero: 5 minutes into a hunt past the Cellar, one hero on an account that owns an empty slot */
    const one = { roster: [{ slot: 0, level: 6, name: 'Corliss', open: true, hunting: true }], slotsOwned: 2, playLimit: 4, name: 'Corliss' };
    const more = say(R({ ...inThicket, ...one, huntMs: 5 * 60000 }));
    if (!more || more.id !== 'more_heroes' || !more.text.includes('Corliss keeps hunting') || !more.text.includes('up to 4 heroes at once, and you own 2 hero slots')) return 'the heroes card reads ' + JSON.stringify(more && more.text);
    if ((say(R({ ...inThicket, ...one, huntMs: 4 * 60000 })) || {}).id === 'more_heroes') return 'the heroes card came before 5 minutes';
    if ((say(R({ ...inThicket, ...one, huntMs: 10 * 60000, huntId: 'mill_cellar' })) || {}).id === 'more_heroes') return 'the heroes card came in the Cellar';
    if ((say(R({ ...inThicket, ...one, roster: [...one.roster, { slot: 1, level: 1, name: 'Bree', open: false, hunting: false }], huntMs: 6e5 })) || {}).id === 'more_heroes') return 'with 2 heroes the heroes card is still up';
    /* two of the account's heroes in town and no party: hunt together, the other hero's tab */
    const town = steps.find((s) => s.id === 'save_setup').facts;
    const two = { roster: [{ slot: 0, level: 9, name: 'Corliss', open: true, hunting: false }, { slot: 2, level: 1, name: 'Bree', open: true, hunting: false }], slotsOwned: 2, playLimit: 4 };
    const pair = say(R({ ...town, ...two }));
    if (!pair || pair.id !== 'party_own' || !pair.text.includes('Bree\'s tab and choose Invite to party') || !pair.hooks.includes('.char-tab[data-slot="2"]')) return 'the party card reads ' + JSON.stringify(pair && { text: pair.text, hooks: pair.hooks });
    if ((say(R({ ...town, ...two, partied: true })) || {}).id === 'party_own') return 'a hero who has hunted in a party is asked to make one';
    const up = say(R({ ...town, upgrades: ['bronze_platebody'] }));
    if (!up || up.id !== 'equip_upgrades' || !up.text.startsWith('You found Bronze Platebody.')) return 'the upgrade card reads ' + JSON.stringify(up && up.text);
    const full = say(R({ ...town, stacks: 80, bagCap: 100, bankStacks: 0 }));
    if (!full || full.id !== 'storage' || !full.text.startsWith('80 of your bag\'s 100 spaces are used.')) return 'the storage card reads ' + JSON.stringify(full && full.text);
    if ((say(R({ ...town, stacks: 80, bagCap: 100, bankStacks: 1 })) || {}).id === 'storage') return 'the storage card is up with a stack stored';
    if ((say(R({ ...inThicket, staminaMs: (M.sessions.STAMINA_LOW_MIN - 1) * 60000 })) || {}).id !== 'stamina_low') return 'low stamina in a hunt shows no card';
    /* a death, through the real envelope (death_log + blessings, the death popup's own numbers) */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const tsb = await imp('src/session/tutorial-sections.js');
    const tiers = (held, L) => M.blessings.BLESSING_TIERS.map((t) => ({ tier: t.tier, permille: t.xpLossReductionPermille, price: M.blessings.blessingPrice(t.tier, L), held }));
    const deathEnv = (L, saved, held) => ({ state: { level_xp: M.xp.charXpForLevel(L) }, name: 'Corliss',
      hunt: { session_id: 's', hunt_id: 'mosslight_glade', ended: true, session: { end_reason: 'died' }, hero: {}, pose: { units: [] } },
      death_log: [{ id: 1, at: '2026-10-25T00:30:00Z', hunt: 'mosslight_glade', monster: 'rook_the_poacher', xp: 0, xp_lost: { level: 10 }, saved }],
      blessings: { held: [], permille: 0, free_until: M.blessings.BLESSING_RULES.freeUntilLevel, tiers: tiers(held, L) } });
    const died = (e, sh) => { const c = tsb.pointerCardOf({ read: (k) => e[k], slot: 0 }, sh); return c || {}; };
    const d1 = died(deathEnv(9, { level: 190 }, false));
    if (d1.id !== 'first_death' || !d1.text.includes('Corliss came home') || !d1.text.includes('Dying cost 10 Level XP; your Blessings saved 190 more and are used up now.')
      || !d1.text.includes('free until Level ' + M.blessings.BLESSING_RULES.freeUntilLevel)) return 'the death card reads ' + JSON.stringify(d1.text);
    const d0 = died(deathEnv(9, null, false));
    if (d0.id !== 'first_death' || !d0.text.includes('Blessings would have saved most of it') || !d0.text.includes('Bless all three')) return 'the death card with no Blessing reads ' + JSON.stringify(d0.text);
    if (died(deathEnv(9, null, true)).id === 'first_death') return 'blessed again, the death card is still up';
    /* Level 31, past the guide: the paid Blessings card, the server's prices */
    const paid = died(deathEnv(31, null, false), { read: [] });
    const total = M.blessings.BLESSING_TIERS.reduce((n, t) => n + M.blessings.blessingPrice(t.tier, 31), 0);
    if (paid.id !== 'bless_paid' || !paid.text.includes(total + ' gp for all three at Level 31') || !paid.text.includes('up to 95%')) return 'at Level 31 the Blessing card reads ' + JSON.stringify(paid.text) + ' (' + paid.id + ')';
    /* the day-one cards wait for the chain: Level 9, a task held, in town: Tamsin's card, not the house */
    const homeNext = { owned: false, next: { name: 'Hearthside Homestead', gold: 400, items: [{ id: 'normal_log', qty: 30 }, { id: 'copper_ore', qty: 20 }] } };
    const L9 = (f) => ({ ...f, levelXp: M.xp.charXpForLevel(9), charLevel: 9 });
    if ((say(R(L9({ ...inThicket, huntId: null, home: homeNext, bag: { normal_log: 3 } }))) || {}).id !== 'tamsin_pays') return 'a day-one card jumped the chain';
    const after = L9({ ...town, presets: 1 });
    const home = say(R({ ...after, home: homeNext, bag: { normal_log: 3 } }));
    if (!home || home.id !== 'home' || !home.text.includes('needs 400 gp, Normal Log ×30 and Copper Ore ×20. Normal Log so far: 3 of 30. Get more in Gathering and crafting, Woodcutting, Normal Tree.')) return 'the house card reads ' + JSON.stringify(home && home.text);
    const juice = say(R({ ...after, home: { owned: true, next: null }, land: { ready: { turnip: 2 } }, bag: {} }));
    if (!juice || juice.id !== 'harvest_juice' || !juice.text.includes('1 turnip makes 3')) return 'the juice card reads ' + JSON.stringify(juice && juice.text);
    const slotJ = say(R({ ...after, home: { owned: true, next: null }, bag: { turnip_juice: 6 }, carried: { turnip_juice: 6 } }));
    if (!slotJ || slotJ.id !== 'juice_slot' || !slotJ.text.includes('My mana % below 30') || !slotJ.text.includes('before slot ' + (drink + 1))) return 'the juice slot card reads ' + JSON.stringify(slotJ && slotJ.text);
    /* the player put Flame Strike on the bar, store rune on (the kit's sword sets hold no rune spell: playtest 2026-10-29 #9) */
    const fs = { type: 'ability', id: 'flame_strike', store: 'plain_fire_rune', conditions: [], enabled: true, usable: true, count: null };
    const runeless0 = after.slots.filter((s) => !(s && s.type === 'ability' && M.abilities.ABILITIES[s.id] && M.abilities.ABILITIES[s.id].rune));
    const juiced = { ...after, home: { owned: true, next: null }, bag: { turnip_juice: 6 }, carried: { turnip_juice: 6 }, slots: [...runeless0, fs],
      stored: [...after.stored, { type: 'consume', id: 'turnip_juice', conditions: [] }, { type: 'ability', id: 'flame_strike', conditions: [] }] };
    if ((say(R({ ...juiced, slots: runeless0 })) || {}).id === 'own_runes') return 'with no rune spell on the bar the coach asks for runes';
    const runes = say(R(juiced));
    if (!runes || runes.id !== 'own_runes' || !runes.text.includes('Cut Blank Runes (4 essence make 12) and Bind Chalked Fire Runes (6 blanks make 45)')) return 'the rune card reads ' + JSON.stringify(runes && runes.text);
    if (say(R({ ...juiced, carried: { ...juiced.carried, chalked_fire_rune: 45 } }))) return 'with own runes the coach still asks: ' + say(R({ ...juiced, carried: { ...juiced.carried, chalked_fire_rune: 45 } })).id;
    /* THE FIRST HOUR (lane/b-first-hour, designer 2026-10-28). The day-one goals open at Level 7, the Thicket's first half hour. */
    const L7 = { ...town, presets: 1, levelXp: M.xp.charXpForLevel(7), charLevel: 7 };
    if ((say(R({ ...L7, home: homeNext, bag: { normal_log: 3 } })) || {}).id !== 'home') return 'at Level 7 past the chain the house card is not up: ' + (say(R({ ...L7, home: homeNext, bag: { normal_log: 3 } })) || {}).id;
    if ((say(R({ ...L7, levelXp: M.xp.charXpForLevel(6), charLevel: 6, home: homeNext, bag: { normal_log: 3 } })) || {}).id === 'home') return 'the house card came before Level 7';
    /* The Hearth: back from the Cellar with the quarter hour's fuel (forest-cave --play: 9 Bones and 3 Lamp Jelly), the
       card interrupts the chain, names the biggest stack and rings it, then the bag's Fuel all; Inner Flame XP ends it. */
    const back = walkChain(M, T).find((s) => s.id === 'sell_loot').facts;
    const fuel = say({ ...back, bag: { ...back.bag, bones: 9, lamp_jelly: 3 }, carried: { ...back.carried, bones: 9, lamp_jelly: 3 } });
    if (!fuel || fuel.id !== 'fuel_hearth' || !fuel.text.startsWith('Your bag holds Bones ×9. Burn them in') || !fuel.text.includes('Inner Flame') || !fuel.text.includes('then Fuel all.')
      || !fuel.hooks.includes('[data-hs-win="inventory"] .hw-pocket[data-item="bones"]') || !/^Press the Bones, then Fuel all\./.test(fuel.textIn || '')) return 'the Hearth card reads ' + JSON.stringify(fuel && { id: fuel.id, text: fuel.text, hooks: fuel.hooks, textIn: fuel.textIn });
    const pct = Math.round((M.vit.regenPermille(10) - 1000) / 10);
    if (!fuel.text.includes(pct + '% faster by Inner Flame 10')) return 'the Hearth card does not state the engine\'s recovery (' + pct + '%): ' + fuel.text;
    if ((say({ ...back, bag: { ...back.bag, bones: 9 } }) || {}).id === 'fuel_hearth') return 'the Hearth card asked with 9 fuel';
    if ((say({ ...back, bag: { ...back.bag, bones: 12 }, skillXp: { ...back.skillXp, inner_flame: 16 } }) || {}).id === 'fuel_hearth') return 'the Hearth card is up after the hero fuelled';
    if ((say({ ...back, huntId: 'mill_cellar', bag: { ...back.bag, bones: 40 } }) || {}).id === 'fuel_hearth') return 'the Hearth card is up in a hunt';
    /* Defense that never trains: in town after a hunt wearing nothing that counts; armor or a shield worn ends it */
    const bare = say(R({ ...town, armoured: false }));
    if (!bare || bare.id !== 'no_defense' || !bare.text.includes('Leather Gloves')) return 'unarmoured in town the card is ' + JSON.stringify(bare && { id: bare.id, text: bare.text });
    if (!M.items.ITEMS.leather_gloves || M.items.ITEMS.leather_gloves.n !== 'Leather Gloves') return 'the Defense card names Leather Gloves, which is not the item\'s name';
    if ((say(R({ ...town, armoured: true })) || {}).id === 'no_defense') return 'wearing armor, the Defense card is still up';
    /* through the real envelope: the server's worn set, read by the engine's own wearsArmour (a staff alone counts for
       nothing; the kit's Practice Shield does) */
    const worn = (equipment) => died({ state: { level_xp: M.xp.charXpForLevel(5) }, equipment }, { read: [] }).id;
    if (worn({ weapon: 'practice_staff' }) !== 'no_defense') return 'through the envelope a staff-only hero in town sees ' + worn({ weapon: 'practice_staff' });
    if (worn({ ...M.kit.START_EQUIPMENT }) === 'no_defense') return 'through the envelope the kit\'s sword and shield hero is told Defense is not training';
    /* The first-hour rung: at the cloak's Level with the pelts, the card rings the recipe; any Crafting XP ends it */
    const cloak = M.items.ITEMS.graypelt_cloak;
    const stitch = (M.recipes.ARTISAN_RECIPES.crafting || []).find((r) => r.output === 'graypelt_cloak');
    if (!cloak || !stitch || !(stitch.req <= 1) || !(cloak.reqLv > 1 && cloak.reqLv < 15)) return 'the first-hour rung is gone (a cloak worn between Level 2 and 14, made at Crafting 1)';
    const atCloak = { ...juiced, carried: { ...juiced.carried, chalked_fire_rune: 45, wolf_pelt: stitch.inputs.wolf_pelt }, levelXp: M.xp.charXpForLevel(cloak.reqLv), charLevel: cloak.reqLv };
    const sc = say(R(atCloak));
    if (!sc || sc.id !== 'stitch_cloak' || !sc.text.includes('Start on ' + stitch.name + ' (Wolf Pelt ×' + stitch.inputs.wolf_pelt + ' each)') || !(sc.ring && sc.ring.work === stitch.id)) return 'the cloak card reads ' + JSON.stringify(sc && { id: sc.id, text: sc.text, ring: sc.ring });
    if (say(R({ ...atCloak, carried: { ...atCloak.carried, wolf_pelt: stitch.inputs.wolf_pelt - 1 } }))) return 'the cloak card asked with too few pelts';
    if (say(R({ ...atCloak, skillXp: { ...atCloak.skillXp, crafting: 30 } }))) return 'the cloak card is up after a craft';
    /* What next names the rung and how it is made, for every role, below its Level (the line that said "Level 12: Grayjaw's Ruff") */
    for (const role of ['tank', 'melee_dps', 'ranger', 'mage', 'healer']) {
      const g = M.tut.nextGoal({ charLevel: cloak.reqLv - 1, role, skillLevel: 5, defenseXp: 9, land: null, inParty: false });
      if (!g || !g.text.includes('Next gear at Level ' + cloak.reqLv + ': ' + cloak.n) || !g.text.includes(cloak.n + ' is made in Crafting from Wolf Pelt ×' + stitch.inputs.wolf_pelt + '.')) return role + ': What next reads ' + JSON.stringify(g && g.text);
    }
    return null;
  },
  /* "Plant your land" asks for EACH empty plot (playtest 2026-10-29 #12: one plot finished it, a plant pays Farming XP):
     it stays up while an open plot is bare and a seed is held; a full field, no seed, or a harvest's XP finishes it. The
     facts' `empty` is the server's field: open plots (under the cap, not an extra) holding no crop. */
  'tutorial-plant-every-plot': async (M) => {
    const T = tutKit(M, 'tank');
    const at = (land, more) => M.tut.currentCard(tutAt(M, T, 2, { huntId: 'mill_cellar', visited: new Set(['mill_cellar']),
      skillXp: { farming: 28, cooking: 0, melee: 0 }, landPlanted: true, land, ...(more || {}) }));
    const id = (land, more) => (at(land, more) || {}).id;
    if (id({ ready: {}, empty: 1 }) !== 'plant_land') return 'one plot planted, one bare, seeds held: the card is ' + id({ ready: {}, empty: 1 });
    if (id({ ready: {}, empty: 0 }) === 'plant_land') return 'every open plot planted, yet "Plant your land" is still up';
    if (id({ ready: {}, empty: 1 }, { bag: { ...M.kit.START_INVENTORY, turnip_seed: 0 } }) === 'plant_land') return 'no seed left to plant, yet "Plant your land" is still up';
    if (id({ ready: {}, empty: 2 }, { skillXp: { farming: M.gathering.CROPS.turnip.xp, cooking: 0, melee: 0 } }) === 'plant_land') return 'a harvested field came back bare and walled the chain';
    /* the field not sent (an older server): Farming XP still finishes it, as before */
    if (id(null, { landPlanted: null }) === 'plant_land') return 'with no field section, a hero with Farming XP is asked to plant';
    const tsb = await import(pathToFileURL(join(M.root, 'src/session/tutorial-sections.js')).href + V);
    const env = { state: { level_xp: M.xp.charXpForLevel(2) }, inventory: { turnip_seed: 7 },
      farm_land: { cap: 2, plot_level: 1, deeds: 0, upgrade: null, plots: [{ i: 0, crop: 'turnip', ready: false, ready_in_s: 600, waterable: false, by: 0, extra: false },
        { i: 3, crop: 'turnip', ready: true, ready_in_s: 0, waterable: false, by: 1, extra: true }] } };
    const f = tsb.tutorialFactsOf({ read: (k) => env[k], slot: 0 });
    if (!f || !f.land || f.land.empty !== 1) return 'through the envelope, a cap-2 field with one plot growing (and an extra) reads empty ' + (f && f.land && f.land.empty);
    return null;
  },
  'tutorial-second-hero': (M) => {
    /* NOTHING ASKED TWICE (first principle, Tyler 2026-10-18): once another hero on the account is past Level 5, a new
       hero skips the knowledge cards and still meets the ones that set its OWN state (its runes, its food, its Blessings). */
    const T = tutKit(M, 'tank');
    const vet = { roster: [{ slot: 0, level: 1, name: 'New', open: true, hunting: false }, { slot: 1, level: M.tut.KNOWN_LEVEL + 1, name: 'Old', open: false, hunting: false }], self: 0 };
    const seen = walkChain(M, T, vet).map((x) => x.id);
    const know = M.tut.HUNT_TUTORIAL.filter((r) => r.knowledge).map((r) => r.id);
    if (seen.some((id) => know.includes(id))) return 'a second hero meets ' + seen.filter((id) => know.includes(id)).join(', ');
    for (const id of ['food_when', 'bless', 'tamsins_task']) if (!seen.includes(id)) return 'a second hero never meets ' + id + ' (' + seen.join(' > ') + ')';
    /* its runes: a hatchet hero's Rend is struck (no Rupture rune, no store rune by default), and a second hero is still told */
    const axes = walkChain(M, tutKit(M, null, 'practice_hatchets'), vet).map((x) => x.id);
    if (!axes.includes('spell_runes')) return 'a second hatchet hero never meets spell_runes (' + axes.join(' > ') + ')';
    const first = walkChain(M, T, { roster: [{ slot: 0, level: 1, name: 'New', open: true, hunting: false }, { slot: 1, level: M.tut.KNOWN_LEVEL, name: 'Young', open: false, hunting: false }], self: 0 }).map((x) => x.id);
    if (!first.includes('first_kill') || !first.includes('styles')) return 'a hero whose only other hero is Level ' + M.tut.KNOWN_LEVEL + ' skips the lessons';
    /* A CELLAR HERO'S OWN STEP FIRST (played on live 10-28: Pellow, Level 2 in town, was shown "Hunt together" because
       Corliss, Level 6, stood in town): the party card waits for THIS hero to pass the Cellar stretch */
    const pair = { roster: [{ slot: 0, level: 2, name: 'Pellow', open: true, hunting: false }, { slot: 1, level: 6, name: 'Corliss', open: true, hunting: false }], self: 0, name: 'Pellow' };
    const floor = M.HUNTS.meadowbrook_thicket.band[0];
    for (let lv = 1; lv < floor; lv++) {
      const c = M.tut.currentCard(tutAt(M, T, lv, { ...pair, visited: new Set(['mill_cellar']), levelXp: M.xp.charXpForLevel(lv) + 3 }));
      if (c && c.id === 'party_own') return 'a Level ' + lv + ' hero in the Cellar stretch is asked to Hunt together before its own steps';
    }
    return null;
  },
  'tutorial-no-wall': (M) => {
    /* NEVER A WALL: without the shell's Got it recorder, every card that finishes on a read is passed by; with the shell's
       facts absent (no roster, no sellable, no upgrades) the chain still runs to its end; every stated card names only real
       slots and says no placeholder. */
    const T = tutKit(M, 'tank');
    const steps = walkChain(M, T, { read: undefined });
    const ids = steps.map((s) => s.id);
    if (ids[ids.length - 1] !== null) return 'without the shell\'s facts the chain stops at ' + ids[ids.length - 2];
    const reads = M.tut.HUNT_TUTORIAL.filter((r) => JSON.stringify(r.done).includes('"read"')).map((r) => r.id);
    if (ids.some((id) => reads.includes(id))) return 'without a recorder the coach shows ' + ids.filter((id) => reads.includes(id)).join(', ');
    for (const s of walkChain(M, T).concat(steps)) {
      if (!s.card) continue;
      if (/\{|undefined|NaN|null|\s\s/.test(s.card.text)) return s.id + ' says: ' + s.card.text;
      /* every slot a card names holds what it speaks of; "A spell costs runes" names the EMPTY slot to put its spell in */
      for (const [, n] of s.card.text.matchAll(/[Ss]lots? (\d+)/g)) {
        const held = !!(s.facts.slots && s.facts.slots[Number(n) - 1]);
        if (s.id === 'first_spell' ? held : !held) return s.id + ' names slot ' + n + (held ? ', which is taken' : ', which is empty');
      }
    }
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
    /* (out of the cellar with no town section, no bar and no shell facts sent: every town card it cannot see is passed) */
    const want = 'to_the_cellar,first_kill,leave_cellar,into_the_thicket';
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
  'coach-gear-by-level': async (M) => {
    /* Tyler 2026-10-24 ("I think all gear should just be hero level"): "What next" names the next GEAR at the next
       Level, only pieces a player can actually get (catalogue-coherence.js reachableSources: the copy audit found the
       coach naming five unreachable items) and only the ones the role wears; the skill line keeps its supplies. */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { reachableSources } = await imp('src/data/catalogue-coherence.js');
    const { ITEMS } = await imp('src/data/items.js');
    const reach = reachableSources();
    const byName = new Map(Object.entries(ITEMS).map(([id, it]) => [it.n, id]));
    const goal = (charLevel, role) => (M.tut.nextGoal({ charLevel, role, skillLevel: charLevel, defenseXp: 10, land: null }) || { text: '' }).text;
    const tank = goal(12, 'tank');
    /* Wickstead (v0.2.63) makes the Bramble Blade reachable at 15 too, so it may stand between the two: the line names both */
    const tankGear = (/Next gear at Level 15: [^.]*/.exec(tank) || [''])[0];
    if (!tankGear.startsWith('Next gear at Level 15: Iron Sword (sword)') || !tankGear.includes('Ironbound Shield (shield)')) return 'a Level-12 tank is not told the Iron Sword and its shield at Level 15: ' + tank;
    const mage = goal(12, 'mage');
    /* the third name moved with Wickstead (v0.2.63): its tier-2 gloves are reachable, and the Studded Vambraces carry no magic
       penalty (leather's is round(def x 0.15) = 0 at def 2), so a classless Mage may wear them; the wand and its book lead */
    if (!mage.includes('Next gear at Level 15: Oak Wand (wand), Oakboard Spellbook (spellbook), ')) return 'a Level-12 Mage is not told the Oak Wand at Level 15: ' + mage;
    if (!/Next at Magic level 15: Scored /.test(mage)) return 'the Mage\'s skill line lost its runes (supplies keep their skill): ' + mage;
    let named = 0;
    for (const role of ['tank', 'melee_dps', 'ranger', 'mage', 'healer']) {
      for (let L = 1; L <= 120; L++) {
        const text = goal(L, role);
        for (const [, lineLv, list] of text.matchAll(/Next (?:gear at Level|at [A-Za-z]+ level) (\d+): (.*?)\.(?: |$)/g)) {
          for (const [, name] of list.matchAll(/(?:^|, )(.+?) \([^)]*\)/g)) {
            const id = byName.get(name);
            named++;
            if (!id) return role + ' at Level ' + L + ': the coach names "' + name + '", which is no item';
            if (!reach.has(id)) return role + ' at Level ' + L + ': the coach names ' + id + ', which no player can get: ' + text;
            const it = ITEMS[id];
            if (it.slot && it.slot !== 'ammo' && !text.includes('Next gear at Level ' + it.reqLv + ':')) return id + ' (gear, Level ' + it.reqLv + ') is named outside the gear line: ' + text;
            if (it.slot && it.slot !== 'ammo' && (it.reqSkill !== 'level' || it.reqLv !== Number(lineLv) || !M.tut.wornByRole(id, role))) {
              return role + ' at Level ' + L + ': the gear line names ' + id + ' (' + it.reqSkill + ' ' + it.reqLv + ') under Level ' + lineLv + ': ' + text;
            }
          }
        }
      }
    }
    return named > 100 ? null : 'the coach named only ' + named + ' items over five roles and 120 Levels (the parse broke, not the rule)';
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
    /* Eat on time, then the player's own Save: the card gives way at once (a long-read card is never held over it) */
    t += 600000;
    const food = (pct) => ({ action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: pct }], join: 'and' });
    env.hunt_settings = { preset: 1, slots: [food(60)], bar: [] };
    if (shown() !== 'food_when') return 'with the kit\'s food slot on the bar the coach shows ' + shown();
    env.hunt_settings = { preset: 1, slots: [food(50)], bar: [food(50)] };
    if (shown() !== 'earn_the_thicket') return 'a saved bar is held over: ' + shown();
    /* Cash in: the player's own press, the same */
    env.state = { level_xp: M.xp.charXpForLevel(M.HUNTS.meadowbrook_thicket.band[0]) };
    env.hunt = Object.assign({}, env.hunt, { ended: true });
    if (shown() !== 'into_the_thicket') return 'out of the cellar the coach shows ' + shown();
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
    if (M.tut.coachWindow(card('food_when')) !== 'configure-action' || M.tut.coachWindow(card('plant_land')) !== 'farm' || M.tut.coachWindow(card('first_kill')) !== null) return 'the card-in-window map is wrong';
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
    for (const id of ['first_kill', 'tamsin_pays']) if (ringPlan(card(id), at(null)).length) return id + ' rings something, but names no control';
    /* a card on the bar's Level or stamina rings that hook (the bar draws it: lane/b-action-bar-fix) */
    for (const [id, hook] of [['first_level', '[data-coach-hook="level"]'], ['earn_the_thicket', '[data-coach-hook="stamina"]']]) if (first(id, at(null)) !== hook) return id + ' rings ' + JSON.stringify(first(id, at(null))) + ', wanted ' + hook;
    /* the bar card: the slot that holds the food, then Save once THAT slot's Configure action is open */
    const slot = (type, id, conditions) => ({ type, id, store: null, conditions: conditions || [], enabled: true, usable: true, count: null });
    const bar = { slots: [slot('ability', 'challenge'), slot('ability', 'power_strike'), slot('consume', 'cooked_shrimp', [{ metric: 'self_hp_pct', op: 'lt', value: 60 }])] };
    const barCard = M.tut.cardFor(card('food_when'), bar);
    if (first(barCard, at(null)) !== '[data-hs-widget="action-bar"] .hb-slot[data-slot="2"]') return 'the bar card rings ' + first(barCard, at(null));
    /* inside Configure action on the food slot: the HP condition's − (the card's hook) until the slot is changed, then Save */
    if (!first(barCard, at('configure-action', { configuring: 2 })).includes('.ca-cond[data-cond="0"] [data-x="dec"]')) return 'Configure action open on the food slot: the − is not ringed first: ' + first(barCard, at('configure-action', { configuring: 2 }));
    if (!first(barCard, at('configure-action', { configuring: 2, edited: true })).includes('[data-x="save"]')) return 'Configure action open on the food slot, changed: Save is not ringed';
    /* "press − until it reads 50%": the − stays ringed until the slot reaches the card's goal, then Save (one press at
       55% must not send the player to Save) */
    const goalCard = M.tut.cardFor(card('food_when'), { ...bar, hpMax: 200 });
    if (goalCard.goal !== 50 || !goalCard.text.includes('until it reads 50%')) return 'Eat on time at 200 HP aims at ' + goalCard.goal + ': ' + goalCard.text;
    if (!first(goalCard, at('configure-action', { configuring: 2, edited: true, cond0: 55 })).includes('[data-x="dec"]')) return 'at 55% of a 50% goal the ring left the −';
    if (!first(goalCard, at('configure-action', { configuring: 2, edited: true, cond0: 50 })).includes('[data-x="save"]')) return 'at the goal 50% Save is not ringed';
    /* a card the player only reads ("Your hero just ate", ringing its slot) rings nothing inside Configure action: no Save
       for a slot nobody was asked to change (played 2026-10-25: Save was ringed over the untouched slot) */
    const ate = M.tut.cardFor(card('first_eat'), { ...bar, supplies: [{ item: 'cooked_shrimp', source: 'own', count: 1 }], carried: { cooked_shrimp: 19 } });
    if (!ate || first(ate, at(null)) !== '[data-hs-widget="action-bar"] .hb-slot[data-slot="2"]') return 'Your hero just ate rings ' + (ate && first(ate, at(null)));
    if (ringPlan(ate, at('configure-action', { configuring: 2 })).length) return 'Your hero just ate rings ' + JSON.stringify(ringPlan(ate, at('configure-action', { configuring: 2 }))) + ' inside Configure action';
    if (!first(barCard, at('configure-action', { configuring: 0 })).includes('.hb-slot[data-slot="2"]')) return 'Configure action open on another slot: the food slot lost its ring';
    if (ringPlan(M.tut.cardFor(card('food_when'), { slots: [] }), at(null)).length) return 'no food on the bar, yet a slot is ringed';
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
    /* the player set when the hero eats (Eat on time: an HP of their own, stored) */
    const eat = { action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 50 }], join: 'and' };
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
    /* a party card stands beside "What next" (a hero who makes a party after the solo chain meets it then), and so
       does a reactive card (it explains what just happened, whenever its own fact comes) */
    const side = new Set(M.tut.HUNT_TUTORIAL.filter((s) => s.party || s.reactive).map((s) => s.id));
    const rank = (id) => (id && (id.startsWith('goal') || side.has(id)) ? ids.length : ids.indexOf(id));
    const T = M.HUNTS.meadowbrook_thicket.band[0], S = M.HUNTS.millrace_sewer.band[0];
    const TB = ['meadowbrook_thicket'];
    const walk = [
      ['town, the cellar left', env(T, 'mill_cellar', true), 'into_the_thicket'],
      ['in the Thicket', env(T, 'meadowbrook_thicket', false), 'tamsin_pays'],
      ['in the Thicket, the Sewer open', env(S, 'meadowbrook_thicket', false), 'tamsin_pays'],
      ['town, out of the Thicket', env(S, 'meadowbrook_thicket', true, TB), 'tamsin_pays'],
      ['reload in town', env(S, 'meadowbrook_thicket', true, TB), 'tamsin_pays'],
      /* Andy's flow (#58): on to the Sewer with the wolves still held; out of it the card stays forward */
      ['in the Sewer, the wolves still held', env(S, 'millrace_sewer', false, TB), 'goal'],
      ['town, out of the Sewer, the wolves still held', env(S, 'millrace_sewer', true, TB), 'goal'],
      ['reload in town, the wolves still held', env(S, 'millrace_sewer', true, TB), 'goal'],
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
  'tutorial-shell-facts': async (M) => {
    /* LANE 2 (board 2026-10-25 §4): THE SHELL'S FACTS make the twelve hidden cards visible. Through the shell's own
       readers (src/shell/launcher.js coachFactsOf over a real envelope and an AccountSession's roster): each card's
       trigger shows it, its ring lands on the real control (ringPlan: the card's hooks, deepest first), and the
       server's next answer (or the Got it press, residue `coach.read`) moves the card on. */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const L = await imp('src/shell/launcher.js');
    const { residueOf } = await imp('src/session/residue.js');
    const base = JSON.parse(readFileSync(join(M.root, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
    /* a CharacterSession as the shell reads it: its record (data + the allowlisted residue) and setResidue */
    const hero = (env, coach, slot = 0) => {
      const cs = { slot, puts: [], read: (k) => cs.record.data[k], record: { data: env, residue: residueOf({ coach: coach || {} }) },
        setResidue(f, v) { cs.puts.push([f, v]); cs.record = { data: cs.record.data, residue: { ...cs.record.residue, ...residueOf({ [f]: v }) } }; return true; } };
      return cs;
    };
    const acct = (open, rows, limit) => ({ characters: () => open, lastRoster: () => rows, statedLimit: () => limit });
    const ctxOf = (cs, account, t) => ({ character: cs, account, now: t === undefined ? undefined : () => t, wm: { openIds: () => [], isOpen: () => false } });
    const card = (cs, account) => L.heldCard(ctxOf(cs, account));
    const at = (open) => ({ open: (id) => id === open, configuring: null, weight: null });
    const KNOWN = ['bar_intro', 'first_eat', 'first_drink', 'fight_settings', 'styles', 'storage'];
    /* a Level 6 hero back from the Cellar: the fixture's loot plus a Bronze Helm and Leather Gloves it can wear (gear
       by Level), a bar with no lesson left on it (the bar cards are tutorial-bar-chain's) */
    const bag0 = { ...base.inventory, bronze_helm: 1, leather_gloves: 1 };
    for (const id of ['iron_helm', 'iron_platebody', 'steel_sword', 'bronze_sword', 'shortbow']) delete bag0[id];
    const town = (more) => Object.assign(JSON.parse(JSON.stringify(base)), {
      state: { active_kind: 'idle', active_id: null, gold: 5200, level_xp: M.xp.charXpForLevel(6) }, inventory: bag0,
      hunt: { ...base.hunt, hunt_id: 'mill_cellar', ended: true, session: { end_reason: 'left' } }, hunt_analyzer: { ...base.hunt_analyzer, ended: true },
      hunt_settings: { ...base.hunt_settings, slots: [], bar: [] },
      skills: { ...base.skills, farming: { xp: 28, level: 1, frac: 0 } } }, more || {});

    /* E1 Wear what you found: the bag holds what Equip upgrades would put on (upgrade-line.js upgradeOf), in town */
    const e1 = hero(town(), { read: KNOWN });
    const c1 = card(e1, acct([e1], [{ slot: 0, exists: true, level: 6, name: 'Tyler' }, { slot: 1, exists: false }], 4));
    if (!c1 || c1.id !== 'equip_upgrades') return 'a bag holding better gear in town shows ' + (c1 && c1.id) + ', want "Wear what you found"';
    if (L.ringPlan(c1, at(null))[0] !== '.hs-launchers [data-hs-open="inventory"]') return 'Wear what you found rings ' + L.ringPlan(c1, at(null))[0];
    if (!L.ringPlan(c1, at('inventory'))[0].includes('[data-hs-act="equip-upgrades"]')) return 'with the bag open Equip upgrades is not ringed: ' + L.ringPlan(c1, at('inventory'))[0];
    /* worn: the server's next answer holds nothing better: the card moves on, to Sell what only pays coin (the Shop's
       own Sell all loot set: bag-model.js lootSale over the server's bids) */
    const worn = { ...base.equipment, helmet: 'bronze_helm', gloves: 'leather_gloves' };
    const left = { ...bag0 }; delete left.bronze_helm; delete left.leather_gloves;
    const c2env = town({ equipment: worn, inventory: left });
    const c2 = card(hero(c2env, { read: KNOWN }), null);
    if (!c2 || c2.id !== 'sell_loot') return 'with nothing better left and loot in the bag the coach shows ' + (c2 && c2.id) + ', want "Sell what only pays coin"';
    const sellPlan = L.ringPlan(c2, at('shop'));
    if (!sellPlan[0].includes('[data-coach-hook="sell-confirm"]') || !sellPlan[1].includes('[data-hs-act="sell-loot"]') || !sellPlan[2].includes('.hw-tab[data-tab="sell"]'))
      return 'Sell what only pays coin rings, in order, ' + JSON.stringify(sellPlan) + ' (want the confirmation, Sell all loot, the Sell tab)';
    if (!(L.coachFactsOf(hero(c2env), null).sellable > 0)) return 'the shell says Sell all loot sells nothing over ' + JSON.stringify(Object.keys(left));
    /* sold: what is left is what Sell all loot keeps (bones for the Great Hearth, food that cooks): the card moves on */
    const kept = {}; for (const id of ['bones', 'wheat_bread', 'cooked_shrimp', 'goldenroot_tea', 'normal_log', 'copper_ore', 'chalked_fire_rune', 'bronze_arrows']) if (left[id]) kept[id] = left[id];
    const c3 = card(hero(town({ equipment: worn, inventory: kept }), { read: KNOWN }), null);
    if (!c3 || c3.id === 'sell_loot' || c3.id === 'equip_upgrades') return 'after the sale the coach still shows ' + (c3 && c3.id);
    if (L.coachFactsOf(hero(town({ inventory: kept })), null).sellable !== 0) return 'Sell all loot would still sell from ' + JSON.stringify(Object.keys(kept));
    /* without the Shop's prices the shell cannot say: unknown, never a wall */
    if (L.coachFactsOf(hero(town({ shop: undefined })), null).sellable !== null) return 'with no shop section the shell still claims a sellable count';

    /* GOT IT: a card that only teaches offers Got it where the press can be recorded; the press adds its id to the
       residue coach.read (and a fold keeps the reads); without a recorder there is no button and the card is passed by */
    const sc = M.tut.HUNT_TUTORIAL.find((r) => r.id === 'styles');
    const g = hero(town({ equipment: { ...worn, weapon: M.kit.START_EQUIPMENT.weapon }, inventory: kept, bag_rules: { ...base.bag_rules, loot: { rat_tail: 'sell' } },
      skills: { ...base.skills, farming: { xp: 28, level: 1, frac: 0 }, cooking: { xp: 30, level: 1, frac: 0 } } }), { read: KNOWN.filter((x) => x !== 'styles') });
    if (!L.coachHtml(g, M.tut.cardFor(sc, {})).includes('data-hs-act="coach-got"')) return 'Every weapon is a style has no Got it';
    const noRec = { slot: 0, read: g.read, record: g.record };
    if (L.coachHtml(noRec, M.tut.cardFor(sc, {})).includes('coach-got')) return 'Got it is offered where the press cannot be recorded';
    const gotCtx = { character: g, account: null, wm: { openIds: () => [], isOpen: () => false } };
    const atStyles = L.heldCard(gotCtx);
    if (!atStyles || atStyles.id !== 'styles') return 'after cooking, in town, the coach shows ' + (atStyles && atStyles.id) + ', want "Every weapon is a style"';
    if (L.ringPlan(atStyles, at('inventory'))[0] !== '[data-hs-win="inventory"] .hw-slot[data-slot="weapon"]') return 'the styles card rings ' + L.ringPlan(atStyles, at('inventory'))[0];
    L.actCoach(gotCtx, null, 'coach-got', { type: 'click' });
    const put = g.puts.find(([f]) => f === 'coach');
    if (!put || !put[1].read.includes('styles')) return 'Got it wrote ' + JSON.stringify(g.puts) + ', want coach.read to hold styles';
    if ((L.heldCard(gotCtx) || {}).id === 'styles') return 'after Got it the styles card is still up';
    const fold = hero(town(), { read: ['bar_intro', 'styles'] });
    const fc = { character: fold, account: null, wm: { openIds: () => [], isOpen: () => false } };
    if (L.heldCard(fc)) {
      L.actCoach(fc, { ownerDocument: null, contains: () => false }, 'coach-min', { type: 'click' });
      const p = fold.puts.find(([f]) => f === 'coach');
      if (!p || p[1].min !== true || !(p[1].read || []).includes('styles')) return 'folding the coach dropped the reads: ' + JSON.stringify(p);
    }
    if (residueOf({ coach: { read: Array.from({ length: 300 }, (_, i) => 'c' + i) } }).coach.read.length > 128) return 'coach.read is not bounded';

    /* READ ON SIGHT: "Your hero just ate" is marked read once its open box has been on screen its reading time; a Got it
       card never is; off screen the clock starts again */
    const eat = M.tut.HUNT_TUTORIAL.find((r) => r.id === 'first_eat');
    const fs = M.tut.HUNT_TUTORIAL.find((r) => r.id === 'fight_settings');
    const s = hero(town(), { read: [] });
    const ms = L.readMs(eat);
    if (L.noteCoachSight(ctxOf(s, null, 0), eat, true) || L.noteCoachSight(ctxOf(s, null, ms - 1), eat, true)) return 'a read-on-sight card was marked before its reading time';
    if (!L.noteCoachSight(ctxOf(s, null, ms + 1), eat, true) || !L.coachReadOf(s).has('first_eat')) return 'a read-on-sight card on screen its reading time was not marked read';
    const s2 = hero(town(), { read: [] });
    L.noteCoachSight(ctxOf(s2, null, 0), eat, true); L.noteCoachSight(ctxOf(s2, null, 10), eat, false);
    if (L.noteCoachSight(ctxOf(s2, null, ms + 1), eat, true)) return 'a card off screen kept its reading clock';
    L.noteCoachSight(ctxOf(s2, null, 0), fs, true);
    if (L.noteCoachSight(ctxOf(s2, null, 60000), fs, true)) return 'a Got it card was marked read on sight';

    /* FOLDED NEVER STICKS (Tyler 2026-10-28, "Your hero just drank" sat folded forever): a folded read-on-sight card is
       on screen as its tab and is read there; folded or open, a card a read finishes (Got it too) has a close that
       records the read; a card the server finishes has no close (its done is the server's) */
    const drink = M.tut.HUNT_TUTORIAL.find((r) => r.id === 'first_drink');
    const sf = hero(town(), { read: [], min: true, seen: 'first_drink' });
    const tab = L.coachHtml(sf, drink);
    if (!/is-min/.test(tab)) return 'the folded fixture did not draw a tab: ' + tab;
    const dom = { querySelector: (sel) => (sel.includes(':not(.is-min)') && /is-min/.test(tab)) || !sel.includes('[data-tutorial="first_drink"]') ? null : {} };
    if (!L.coachOnScreen([dom], drink)) return 'a folded read-on-sight card is not counted as on screen (it never finishes)';
    L.noteCoachSight(ctxOf(sf, null, 0), drink, L.coachOnScreen([dom], drink));
    if (!L.noteCoachSight(ctxOf(sf, null, L.readMs(drink) + 1), drink, L.coachOnScreen([dom], drink))) return 'a folded read-on-sight card was not read on its tab';
    for (const [c, open] of [[drink, false], [drink, true], [fs, false], [fs, true]]) {
      const x = hero(town(), open ? { read: [] } : { read: [], min: true, seen: c.id });
      if (!L.coachHtml(x, c).includes('data-hs-act="coach-close"')) return (open ? 'open ' : 'folded ') + c.id + ' has no close';
    }
    /* the close press on the card the coach holds records its read; folded stays folded */
    const fx = { character: hero(g.record.data, { read: KNOWN.filter((x) => x !== 'styles'), min: true }), account: null, wm: { openIds: () => [], isOpen: () => false } };
    const held = L.heldCard(fx);
    if (!held || !L.coachHtml(fx.character, held).includes('coach-close')) return 'the held first card (' + (held && held.id) + ') has no close';
    L.actCoach(fx, null, 'coach-close', { type: 'click' });
    if (!L.coachReadOf(fx.character).has(held.id)) return 'close on folded ' + held.id + ' did not record its read';
    const srv = M.tut.HUNT_TUTORIAL.find((r) => r.done && r.done.kind !== 'read' && r.done.kind !== 'any');
    if (L.coachHtml(hero(town(), { read: [] }), srv).includes('coach-close')) return srv.id + ' (finished by the server) offers a close';

    /* D4 MORE THAN ONE HERO: 5 minutes into the Thicket, one hero, two slots owned: the server's play limit and the
       roster's slots in the words; Characters, then Create hero ringed; a second hero finishes it */
    const thicket = (sessionMs) => Object.assign(JSON.parse(JSON.stringify(base)), {
      state: { active_kind: 'combat', active_id: 'meadowbrook_thicket', gold: 5200, level_xp: M.xp.charXpForLevel(6) },
      hunt: { ...base.hunt, hunt_id: 'meadowbrook_thicket', ended: false },
      hunt_analyzer: { ...base.hunt_analyzer, hunt_ms: sessionMs, hero: { ...base.hunt_analyzer.hero, supplies: [] } },
      hunt_settings: { ...base.hunt_settings, slots: [], bar: [] }, equipment: worn, inventory: kept, skills: { ...base.skills, farming: { xp: 28, level: 1, frac: 0 } } });
    const solo = hero(thicket(6 * 60000), { read: KNOWN });
    const rows1 = [{ slot: 0, exists: true, level: 6, name: 'Tyler' }, { slot: 1, exists: false }];
    const d4 = card(solo, acct([solo], rows1, 4));
    if (!d4 || d4.id !== 'more_heroes' || !d4.text.includes('up to 4 heroes at once') || !d4.text.includes('you own 2 hero slots'))
      return '5 minutes into the Thicket with one hero the coach shows ' + JSON.stringify(d4 && [d4.id, d4.text]);
    const d4ring = L.ringPlan(d4, at(null));
    if (d4ring[0] !== '.char-pick[data-app="create"]' || d4ring[1] !== '.char-tool[data-app="characters"]') return 'More than one hero rings ' + JSON.stringify(d4ring);
    if ((card(hero(thicket(4 * 60000), { read: KNOWN }), acct([solo], rows1, 4)) || {}).id === 'more_heroes') return 'the more-heroes card came before 5 minutes in the Thicket';
    if ((card(solo, acct([solo], rows1, null)) || {}).id === 'more_heroes') return 'the more-heroes card stated a play limit the server never sent';
    const rows2 = [{ slot: 0, exists: true, level: 6, name: 'Tyler' }, { slot: 1, exists: true, level: 1, name: 'Wren' }];
    if ((card(solo, acct([solo], rows2, 4)) || {}).id === 'more_heroes') return 'a second hero on the roster did not finish "More than one hero"';

    /* D5 HUNT TOGETHER: two of the account's heroes playing, both in town, no party: the other hero's tab is ringed */
    const a0 = hero(town({ equipment: worn, inventory: kept }), { read: [...KNOWN, 'loot_rules'] });
    const a1 = hero(town({ equipment: worn, inventory: kept, name: 'Wren' }), {}, 1);
    const d5 = card(a0, acct([a0, a1], rows2, 4));
    if (!d5 || d5.id !== 'party_own' || !d5.text.includes('Wren\'s tab')) return 'two heroes in town show ' + JSON.stringify(d5 && [d5.id, d5.text]) + ', want "Hunt together" naming Wren';
    if (L.ringPlan(d5, at(null))[0] !== '.char-tab[data-slot="1"]') return 'Hunt together rings ' + L.ringPlan(d5, at(null))[0];
    const a1h = hero(thicket(60000), {}, 1);
    if ((card(a0, acct([a0, a1h], rows2, 4)) || {}).id === 'party_own') return 'Hunt together is up while the other hero is out hunting';

    /* THE SERVICES TAB (Tyler 2026-10-25): a Blessing card rings the Shop's icon, then its Services tab, then the next Bless */
    const bl = M.tut.cardFor(M.tut.HUNT_TUTORIAL.find((r) => r.id === 'bless'), { blessings: { held: 0, of: 3, freeUntil: 30, best: 950, prices: [0, 0, 0] } });
    if (L.ringPlan(bl, at(null))[0] !== '.hs-launchers [data-hs-open="shop"]') return 'the Blessing card rings ' + L.ringPlan(bl, at(null))[0] + ', want the Shop icon';
    const inShop = L.ringPlan(bl, at('shop'));
    if (!inShop[0].includes('[data-hs-act="bless"]:not([disabled])') || !inShop[1].includes('.hw-tab[data-tab="services"]')) return 'in the Shop the Blessing card rings ' + JSON.stringify(inShop);
    if (M.tut.coachWindow(bl) !== 'shop' || M.tut.coachTab(bl) !== 'services') return 'the Blessing card does not point into the Shop\'s Services tab';
    if (/open Services/.test(bl.text)) return 'the Blessing card still says "open Services": ' + bl.text;
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
    edits: [['src/session/tutorial-sections.js', '  if (card) return cardFor(card, f);\n', '  return card && cardFor(card, f);\n']] },
  { name: 'the launcher shows only the first card', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher.js', 'const card = pointerCardOf(cs, cs ? coachFactsOf(cs, ctx.account || null) : undefined);',
      "const card = pointerCardOf(cs, cs ? coachFactsOf(cs, ctx.account || null) : undefined) && { id: 'to_the_cellar', title: 'a', text: 'b' };"]] },
  { name: 'the pointer is drawn over an open window', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher.js', 'ctx.wm.openIds().length > 0', 'ctx.wm.row(ctx.wm.openIds()[0] || "") && ctx.wm.row(ctx.wm.openIds()[0]).modal']] },
  { name: 'the launcher keeps the pointer in a hunt (over Leave hunt)', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher.js', "(ctx.hud && ctx.hud.isShown('hunt-topbar') ? '' : pointerFor(ctx))", 'pointerFor(ctx)']] },
  { name: 'the coach names gear no player can get (the copy audit\'s five)', case: 'coach-gear-by-level',
    edits: [['src/data/skill-unlocks.js', "|| it.reqSkill === LEVEL_REQ) && reach.has(id)) add(", '|| it.reqSkill === LEVEL_REQ)) add(']] },
  { name: 'the coach names gear the role does not wear (plate for a Mage)', case: 'coach-gear-by-level',
    edits: [['src/data/hunt-tutorial.js', 'role ? (id) => wornByRole(id, role) : null', 'null']] },
  { name: 'weapons stay on their style skill (the Iron Sword never reaches the Level line)', case: 'coach-gear-by-level',
    edits: [['src/data/gear-tiers.js', "whatever the style (LEVEL_REQ, Tyler 2026-10-24). */\n        reqSkill: LEVEL_REQ,", "whatever the style (LEVEL_REQ, Tyler 2026-10-24). */\n        reqSkill: 'melee',"]] },
  { name: 'the coach fold is not kept (off the residue allowlist: open again after a reload)', case: 'coach-folds',
    edits: [['src/session/residue.js', '  coach: sanitizeCoach,', '']] },
  { name: 'a new card never marks the folded coach', case: 'coach-folds',
    edits: [['src/shell/launcher.js', 'fresh: min && !!card && r.seen !== card.id', 'fresh: false']] },
  { name: 'the hunt bar redraws the coach on a new card only (a fold in a hunt does nothing)', case: 'coach-folds',
    edits: [['src/shell/launcher.js', '/data-coach="([a-z0-9_:]+)"/', '/data-tutorial="([a-z0-9_]+)"/'],
      ['src/shell/launcher.js', "have.getAttribute('data-coach') !== key", "have.getAttribute('data-tutorial') !== key"],
      ['src/shell/launcher.js', "have.getAttribute('data-coach') === key", "have.getAttribute('data-tutorial') === key"]] },
  { name: 'the card never advances past the first unmet step', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', '    if (judge(r.done, facts, { openedIn, id: r.id }) !== false) continue;\n', '']] },
  { name: 'the first kill does not finish its card', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', '  kills: (p, f) => f.levelXp > 0,', '  kills: () => false,']] },
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
  /* THE FIRST HOUR (lane/b-first-hour, 2026-10-28) */
  { name: 'the day-one goals wait for Level 8 again (about two hours in)', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', 'const DAY_ONE_LEVEL = 7;', 'const DAY_ONE_LEVEL = 8;']] },
  { name: 'the Hearth card waits for more fuel than the Cellar leaves', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', 'const FUEL_CARD_AT = 10;', 'const FUEL_CARD_AT = 13;']] },
  { name: 'the Hearth card rings no bag stack', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', ".replace('{fuel}', said.fuel || '')", '']] },
  { name: 'the Hearth card never ends (no Inner Flame XP seen)', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "'inventory', { kind: 'skill_xp', skill: 'inner_flame' }", "'inventory', { kind: 'skill_xp', skill: 'smithing' }"]] },
  { name: 'the Defense card never sees a hero with nothing worn that counts', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', 'unarmoured: (p, f) => known(f.armoured, (a) => a === false),', 'unarmoured: (p, f) => known(f.armoured, (a) => a === null),']] },
  { name: 'the envelope says every hero wears armor (the worn set unread)', case: 'tutorial-reactive',
    edits: [['src/session/tutorial-sections.js', 'armoured: eq ? wearsArmour(eq, ITEMS) : undefined,', 'armoured: eq ? true : undefined,']] },
  { name: 'the cloak card asks with any pelt', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', 'c[p.item] >= (p.n || 1)', 'c[p.item] > 0']] },
  { name: 'What next names the cloak but not how it is made', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', '    if (made) lines.push(made);\n', '']] },
  { name: 'the tutorial sends a fresh character to the sewer first', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "'hunt_picker', { kind: 'enter', hunt: CELLAR },", "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' },"]] },
  { name: 'the party-only Rat King card is back in the solo chain', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }, { party: true }),",
      "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }, { party: true }),\n  step('the_king', 'The Rat King', 'The last room is his.', 'world', { kind: 'pull', ground: 'millrace_sewer', pocket: 5 }),"]] },
  { name: 'a hero in the sewer is sent back to the Thicket card (enter judged on the current hunt only)', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', ' || HUNT_INDEX[h].band[0] > HUNT_INDEX[hunt].band[0]', '']] },
  { name: 'out of a hunt, the pointer forgets it was there (#58: the Thicket card came back)', case: 'tutorial-never-backward',
    edits: [['src/session/tutorial-sections.js', '  if (h && h.huntId) visited.add(h.huntId);\n', '']] },
  { name: 'back in the Cellar after the Thicket, the "Cash in" card returns (#58)', case: 'tutorial-never-backward',
    edits: [['src/data/hunt-tutorial.js', ' || (!!c.openedIn && reached(f, c.openedIn, true))', '']] },
  { name: 'out of the Sewer with the wolves held, the Thicket card returns (#58, Andy)', case: 'tutorial-never-backward',
    edits: [['src/data/hunt-tutorial.js', "{ kind: 'any', of: [{ kind: 'tally_paid' }, { kind: 'been', hunt: WOLVES.hunt, past: true }] }", "{ kind: 'tally_paid' }"]] },
  { name: 'the pointer ignores the personal-best grounds (#58)', case: 'tutorial-never-backward',
    edits: [['src/session/tutorial-sections.js', 'new Set(Object.keys((bests || {}).grounds || {}))', 'new Set()']] },
  { name: 'the Thicket is skipped: the cellar unlocks the sewer', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "{ kind: 'unlock', hunt: THICKET }", "{ kind: 'unlock', hunt: 'millrace_sewer' }"]] },
  { name: 'the sewer opens to a fresh character', case: 'tutorial-walk-through',
    edits: [['src/data/hunts.js', 'band: [8, 25],', 'band: [1, 25],']] },
  { name: 'the party card walls a solo hero again', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', 'if (!(f.inParty === true && f.charLevel >= HUNT_INDEX[r.done.hunt].band[0])) return false;', 'if (!true) return false;']] },
  { name: 'the party card meets a party below the Sewer floor', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', 'if (!(f.inParty === true && f.charLevel >= HUNT_INDEX[r.done.hunt].band[0])) return false;', 'if (!(f.inParty === true)) return false;']] },
  { name: 'cooking is not asked for (the town half is untaught)', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', '  skill_xp: (p, f) => known(xpIn(f, p.skill), (xp) => xp > 0),', '  skill_xp: () => true,']] },
  { name: 'a town section the server never sent walls the coach', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', '  tally_paid: (p, f) => !f.tally || ', '  tally_paid: (p, f) => !!f.tally && ']] },
  { name: 'a harvest brings "Plant your land" back (the land alone judges it)', case: 'tutorial-plant-every-plot',
    edits: [['src/data/hunt-tutorial.js', "    return (xp === null && f.landPlanted == null) || xp > 0 || f.landPlanted === true;", '    return (xp === null && f.landPlanted == null) || f.landPlanted === true;']] },
  { name: 'one plant finishes "Plant your land" again (any Farming XP)', case: 'tutorial-plant-every-plot',
    edits: [['src/data/hunt-tutorial.js', "      return f.land.empty === 0 || (xp !== null && xp >= crop.xp) ||", "      return f.land.empty === 0 || (xp !== null && xp > 0) ||"]] },
  { name: 'a harvested field walls the chain (no sticky XP)', case: 'tutorial-plant-every-plot',
    edits: [['src/data/hunt-tutorial.js', "      return f.land.empty === 0 || (xp !== null && xp >= crop.xp) ||", "      return f.land.empty === 0 ||"]] },
  { name: 'the facts count an extra plot as open land', case: 'tutorial-plant-every-plot',
    edits: [['src/session/tutorial-sections.js', ".filter((p) => !p.extra && p.i < field.cap).length", ".length"]] },
  { name: 'Tamsin\'s card comes back the day after she paid', case: 'tutorial-never-backward',
    edits: [['src/data/hunt-tutorial.js', ' || (t.weight === true && reached(f, tallyTask(p.task).hunt))', '']] },
  { name: 'a party never meets the Sewer card', case: 'tutorial-never-backward',
    edits: [['src/session/tutorial-sections.js', 'inParty: !!party && party.seats.length >= 2,', 'inParty: false,']] },
  { name: 'the town lessons are asked of a hero past the Thicket', case: 'tutorial-launcher-card',
    edits: [['src/data/hunt-tutorial.js', ' else if ((!r.reactive || r.dayOne) && f.charLevel > caps.solo) return false;', '']] },
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
    edits: [['src/shell/launcher.js', "if (!(open('configure-action') && at.configuring === card.barSlot)) return", 'if (true) return']] },
  { name: 'the icon row draws no ring of its own (a repaint drops it)', case: 'coach-ring',
    edits: [['src/shell/launcher.js', "(ring === r.id ? ' data-coach-ring=\"\"' : '')", "''"]] },
  /* lane/b-tutorial-cards (the 2026-10-25 curriculum) */
  { name: 'REGRESSION "Tell your hero when" never showed: any stored food slot with a condition finishes the food lesson (a Save restates the kit\'s 60%)', case: 'tutorial-bar-chain',
    edits: [['src/data/hunt-tutorial.js', ' && hpBelow(s) !== null && hpBelow(s) !== START_FOOD_PCT) : null),', ' && hpBelow(s) !== null) : null),']] },
  { name: 'the rune card ignores the server\'s struck state (names a spell the store already feeds)', case: 'tutorial-bar-chain',
    edits: [['src/data/hunt-tutorial.js', "s.type === 'ability' && s.usable === false && !!ABILITIES[s.id]", "s.type === 'ability' && !!ABILITIES[s.id]"]] },
  { name: 'STARTER BARS: the sword-and-shield hero is never offered a rune spell (no rune lesson in its first hour)', case: 'starter-bars',
    edits: [['src/data/hunt-tutorial.js', "    if (!a || !st || !name(st.id) || !fam || free < 0 || !Number.isInteger(st.price)) return null;", '    return null;']] },
  { name: 'STARTER BARS: "Spells need runes" explains only the first struck slot (the Mage\'s second stays dead)', case: 'starter-bars',
    edits: [['src/data/hunt-tutorial.js', "  rune_ready: (p, f) => (Array.isArray(f.slots) ? struckSpell(f) < 0 : null),", "  rune_ready: (p, f) => (Array.isArray(f.slots) ? f.slots.some((s) => s && s.usable === true && s.store) || struckSpell(f) < 0 : null),"]] },
  { name: 'the order card never sees a store slot that eats at a higher HP', case: 'tutorial-bar-chain',
    edits: [['src/data/hunt-tutorial.js', 'if (hpBelow(S) > hpBelow(O) || (s < o && hpBelow(S) >= hpBelow(O))) return', 'if (s < o && hpBelow(S) >= hpBelow(O)) return']] },
  { name: 'the order card asks while the own food is gone (the fallback working)', case: 'tutorial-bar-chain',
    edits: [['src/data/hunt-tutorial.js', "hpBelow(O) === null || O.count === 0) continue;", 'hpBelow(O) === null) continue;']] },
  { name: 'the coach\'s waste is not Configure action\'s sum', case: 'tutorial-bar-chain',
    edits: [['src/data/hunt-tutorial.js', 'export const wasteAt = (amount, pct, max) => amount - Math.round((max * (100 - pct)) / 100);', 'export const wasteAt = (amount, pct, max) => amount - Math.round((max * pct) / 100);']] },
  { name: 'the eat card sends a low hero under the designer\'s 50% to waste nothing', case: 'tutorial-bar-chain',
    edits: [['src/data/hunt-tutorial.js', 'const PCT_STEP = 5, EAT_FLOOR_PCT = 50;', 'const PCT_STEP = 5, EAT_FLOOR_PCT = 0;']] },
  { name: 'every slot the coach names is "slot 1"', case: 'tutorial-bar-chain',
    edits: [['src/data/hunt-tutorial.js', '  const n = ix.map((i) => i + 1);', '  const n = ix.map(() => 1);']] },
  { name: 'a card that cannot be stated truly is shown anyway', case: 'tutorial-bar-chain',
    edits: [['src/data/hunt-tutorial.js', '    if (stated(r, facts)) return r;\n', '    return r;\n']] },
  { name: 'the envelope reader drops the server\'s struck state', case: 'tutorial-bar-chain',
    edits: [['src/session/tutorial-sections.js', '  enabled: s.enabled !== false, usable: s.usable !== false,', '  enabled: s.enabled !== false, usable: true,']] },
  { name: 'the shell\'s Got it reads never reach the coach', case: 'tutorial-bar-chain',
    edits: [['src/session/tutorial-sections.js', "    read: read ? new Set(Array.from(read).filter((id) => typeof id === 'string' && ID.test(id))) : null,", '    read: null,']] },
  { name: 'the bar card rings no slot', case: 'coach-ring',
    edits: [['src/data/hunt-tutorial.js', 'const barSlot = Number.isInteger(said.barSlot) ? said.barSlot : item && at(item) >= 0 ? at(item) : null;', 'const barSlot = null;']] },
  { name: 'a read card shows with no Got it recorder (a wall until lane 2): an unrecorded read is "not read"', case: 'tutorial-no-wall',
    edits: [['src/data/hunt-tutorial.js', '  read: (p, f, c) => (f.read instanceof Set ? f.read.has(c.id) : null),', '  read: (p, f, c) => (f.read instanceof Set ? f.read.has(c.id) : false),']] },
  { name: 'a "Got it, or X" card walls the coach until X (an unknown read reads as false in any)', case: 'tutorial-no-wall',
    edits: [['src/data/hunt-tutorial.js', "    return got.includes(true) ? true : got.includes(null) ? null : false;", '    return got.includes(true);']] },
  { name: 'the knowledge cards are asked of a second hero', case: 'tutorial-second-hero',
    edits: [['src/data/hunt-tutorial.js', '  if (r.knowledge && secondHero(f)) return false;\n', '']] },
  { name: 'a reactive card is capped by the guide\'s Level (no paid-Blessing card at Level 31)', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', '    if (past && (!r.reactive || r.dayOne)) continue;', '    if (past) continue;']] },
  { name: 'the death card reads no Blessing from the death log', case: 'tutorial-reactive',
    edits: [['src/session/tutorial-sections.js', 'saved: d.saved ? { level: nat(d.saved.level) ?? 0 } : null', 'saved: null']] },
  { name: 'the ate card never sees the analyzer', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "  ate: (p, f) => known(used(f, 'food', 'own'), (r) => r.length > 0),", '  ate: () => false,']] },
  { name: 'a day-one card jumps the chain (placed before it)', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "  /* ── F. Day one: each waits for the chain, then starts on its own fact ── */\n", ''],
      ['src/data/hunt-tutorial.js', "  /* ── B. The first hunt, the bar while it fights ────────────────────── */\n",
        "  step('home', 'Build your home', 'x', 'house', { kind: 'home_owned' }, { reactive: true, dayOne: true, when: [IN_TOWN, { kind: 'level_at', at: DAY_ONE_LEVEL }, { kind: 'home_unowned' }] }),\n"],
      ['src/data/hunt-tutorial.js', "  step('home', 'Build your home',\n    'Your first house needs gold, ore and logs: start with logs in Gathering and crafting, Woodcutting.',\n    'house', { kind: 'home_owned' }, { reactive: true, dayOne: true, when: [IN_TOWN, { kind: 'level_at', at: DAY_ONE_LEVEL }, { kind: 'home_unowned' }] }),\n", '']] },
  { name: 'Tamsin\'s payment card shows while the hero hunts another ground', case: 'tutorial-town-chain',
    edits: [['src/data/hunt-tutorial.js', "'world', { kind: 'tally_paid' }, { when: [{ kind: 'not_elsewhere', hunt: WOLVES.hunt }] }),", "'world', { kind: 'tally_paid' }),"]] },
  { name: 'the first-return cards come back after the Thicket', case: 'tutorial-town-chain',
    edits: [['src/data/hunt-tutorial.js', "'shop', { kind: 'any', of: [{ kind: 'loot_sold' }, { kind: 'been', hunt: THICKET }] },", "'shop', { kind: 'loot_sold' },"]] },
  { name: 'the shown first-minute cards come after the reactive ones (the shell would replay them)', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "export const AUTO_KINDS = Object.freeze(['kills', 'level', 'pull']);", "export const AUTO_KINDS = Object.freeze(['kills', 'level', 'pull', 'unlock']);"]] },
  /* lane 2: the shell's facts, Got it, read on sight, the hooks' order */
  { name: 'the shell passes the coach no facts (the twelve cards stay hidden)', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher.js', 'const card = pointerCardOf(cs, cs ? coachFactsOf(cs, ctx.account || null) : undefined);', 'const card = pointerCardOf(cs, undefined);']] },
  { name: 'the coach counts the bag, not what Sell all loot sells', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher.js', 'lootSale(bag, rulesOf(cs), shop, skillsOf(cs)).lines.length', 'bag.length']] },
  { name: 'Got it records nothing', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher.js', "return cs.setResidue('coach', Object.assign({}, r, { read: Array.from(read).concat(card.id).slice(-COACH_READ_MAX) }));", 'return false;']] },
  { name: 'folding the coach forgets the reads', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher.js', 'const keep = read && read.size ? { read: Array.from(read) } : {};', 'const keep = {};']] },
  { name: 'a folded read-on-sight card is never on screen (it sits there forever, v0.2.63)', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher.js', `'.hs-pointer[data-tutorial="' + card.id + '"]'`, `'.hs-pointer[data-tutorial="' + card.id + '"]:not(.is-min)'`]] },
  { name: 'a Got it card is marked read on sight', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher.js', 'const readOnSight = (card) => readable(card) && !card.gotIt;', 'const readOnSight = (card) => readable(card);']] },
  { name: 'a read-on-sight card is marked at once', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher.js', '  if (now - s.since < readMs(card)) return false;\n', '']] },
  { name: 'the slots owned are the heroes, not the slots', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher.js', 'slotsOwned: rows ? rows.length : null,', 'slotsOwned: rows ? rows.filter((r) => r.exists).length : null,']] },
  { name: 'a hero out hunting counts as in town for a party', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher.js', 'open: true, hunting: huntOpenOf(c) });', 'open: true, hunting: false });']] },
  { name: 'one press of − sends the player to Save before the card\'s goal HP', case: 'coach-ring',
    edits: [['src/shell/launcher.js', 'if (at.edited && !(Number.isFinite(card.goal) && Number.isFinite(at.cond0) && at.cond0 > card.goal)) return [save];', 'if (at.edited) return [save];']] },
  { name: 'the hooks ring in the order written (the tab over its own control)', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher.js', 'default: return (card.hooks || []).slice().reverse();', 'default: return (card.hooks || []).slice();']] },
  { name: 'the Blessing cards still point at the old Services window', case: 'tutorial-shell-facts',
    edits: [['src/data/hunt-tutorial.js', "'shop', true, 'services'),", "'services', true),"]] },
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
