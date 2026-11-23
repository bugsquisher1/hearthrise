// tests/hunt-core/sewer.mjs — THE MILLRACE SEWER AND ITS TUTORIAL, PLAYED (week plan item 17). Run by run-all.mjs.
//
//   sewer-on-the-map       every seat and spawn of both grounds stands on open floor of its
//                          world map, and every spawn is also listed in the map's `spawns`
//   formation-rows         the six sewer rows pass the roster audit on the formation band,
//                          walk at their own speed, and only the Rat King is a boss
//   one-king               the Rat King's hall is built for a party of two and stands on every hero's route
//   sewer-full-party-loop  a four-hero party plays the real core (stepSwing) on the real map:
//                          every pocket is pulled in route order, the Rat King dies, nobody wipes
//   tutorial-walk-through  each step is doable from the start kit plus the steps before it; one hero walks the whole
//                          chain in order (the 2026-10-25 curriculum); no solo wall; no town section is a wall
//   tutorial-bar-chain     every starting weapon on its real default bar, and a bar set to Carried runes only: Your action bar,
//                          Why it waits, Spells need runes, Eat on time (Configure action's own waste), Order matters; "Tell your hero when" regression
//   why-it-waits           the card's words on each caster's real default bar, from the server's slots; passed by where nothing waits
//   tutorial-town-chain    sell or keep, Blessings (the server's numbers), Tamsin's weight per role, paid, setups
//   tutorial-reactive      ate, drank, a beating, more heroes, hunt together, upgrades, storage, stamina, a death,
//                          paid Blessings, juice, a house, own runes: each on its own fact and worded from it
//   first-dangerous-run    ONE card offers the first Dangerous run at Level 8 to a hero in armor on head and body (server facts), names a ground
//                          of its range with the tier, rings its Dangerous press, and never comes back once read or taken
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
//   --batch a:b            (the file's own child) mutants a..b-1 alone: the parent runs them 40 to a process, each heap freed
//
// The loop case prints its measured clear times and kills (the evidence a balance claim needs).
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadCore, makeReport, ROOT } from './fixtures/h1.js';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';

const V = sourceQuery(ROOT);
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
  M.hl = await imp('src/shell/hunt-list.js');
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
  /* the ONE Blessing's price (lane/level-costs): hours of the wage at the hero's Level */
  M.wage = await imp('src/core/wage.js');
  M.sessions = await imp('src/data/hunt-sessions.js');
  M.coreModel = await imp('src/data/core-model.js');
  M.runes = await imp('src/data/runes.js');
  M.consumables = await imp('src/data/consumables.js');
  return M;
}

/* The walkable mask of a world map (sprites are not needed: only solid MATERIALS and solid props block,
   read from every atlas the renderer loads). */
/* THE SERVER STATES THE LEVEL (hr_state_of's `level` block: xp, level, into, need) and the client reads only that
   (src/session/character-sections.js levelOf; lane/c-level-from-server). A hand-built envelope here states it too, on the
   curve of the modules under test, as hr_level_block does on the server's. */
const srvLevel = (M, xp) => { const level = M.xp.charLevelFromXp(xp), lo = M.xp.charXpForLevel(level); return { xp, level, into: xp - lo, need: M.xp.charXpForLevel(level + 1) - lo }; };

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
/* THE PLAYER SET A RUNE SPELL TO CARRIED RUNES ONLY, carrying none: no default bar is struck (rule-subjects.js), so a struck slot is this.
   Each id takes its own slot if the bar holds it, else goes in the first slot after the abilities; the server's struck state follows. */
function carriedOnly(T, ids) {
  const slots = T.slots.slice();
  for (const id of ids) {
    const row = { type: 'ability', id, store: null, conditions: [], enabled: true, usable: false, count: null };
    const at = slots.findIndex((s) => s.type === 'ability' && s.id === id);
    if (at >= 0) slots[at] = { ...slots[at], store: null, usable: false };
    else slots.splice(slots.filter((s) => s.type === 'ability').length, 0, row);
  }
  return { ...T, slots };
}
/* Tamsin's tally as the coach reads it (tutorial-sections.js): `held` [[task, kills, done]], `paid` [task] of the last day. */
function tallyFact(held, paid, weight = true) {
  return { held: held.length, paid: paid.length, weight, paidTasks: paid.slice(),
    tasks: Object.fromEntries(held.map(([task, kills, done]) => [task, { kills, target: 25, done: !!done }])) };
}
/* The facts of that hero at Level L, in town, everything else fresh (`more` overrides). */
function tutAt(M, T, L, more) {
  const lr = M.blessings.BLESSING;
  return { levelXp: M.xp.charXpForLevel(L), charLevel: L, skillLevel: L, skillXp: { farming: 0, cooking: 0, melee: 0 }, huntId: null, endReason: null,
    visited: new Set(), unitKinds: new Set(), self: 0, name: 'Corliss', slots: T.slots, stored: [], discipline: T.discipline, role: T.role,
    stance: M.rules.ROLE_DEFAULTS[T.role].stance, store: T.store, carried: { ...M.kit.START_INVENTORY }, bag: { ...M.kit.START_INVENTORY },
    stacks: Object.keys(M.kit.START_INVENTORY).length, bagCap: 100, bankStacks: 0, lootRules: {}, weapon: T.weapon,
    blessings: { held: 0, of: 1, freeUntil: lr.freeUntilLevel, best: lr.cutPm, prices: [M.wage.blessingPrice(L)] },
    death: null, supplies: [], huntMs: 0, hpMax: M.vit.maxHpFor(L, 0), presets: 0, landPlanted: false, land: { ready: {} }, home: null, gold: 500,
    staminaMs: 8 * 3600000, tally: tallyFact([], [], false), inParty: false, partied: false,
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
    blessings: { ...f.blessings, prices: [M.wage.blessingPrice(n)] } });
  const read = (id) => (f.read instanceof Set ? set({ read: new Set([...f.read, id]) }) : null);
  const at = (id, pct) => (s) => (s && s.id === id ? { ...s, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: pct }] } : s);
  const save = (slots) => set({ slots, stored: slots.map((s) => (s ? { type: s.type, id: s.id, conditions: s.conditions } : null)) });
  const RATS = 'cellar_giant_rats', WOLVES = 'thicket_gray_wolves';
  const press = {
    /* TAMSIN FIRST (designer 2026-11-10): her rats taken before the first hunt, counted in it, paid on the way back with a helmet to wear */
    tamsins_rats: () => set({ tally: tallyFact([[RATS, 0]], []) }),
    rats_count: () => set({ tally: tallyFact([[RATS, 25, true]], []) }),
    tamsin_owes: () => set({ huntId: null, endReason: 'left', tally: tallyFact([], [RATS]), upgrades: ['bronze_helm'] }),
    equip_upgrades: () => set({ upgrades: [] }),
    back_down: () => set({ huntId: 'mill_cellar', endReason: null }),
    to_the_cellar: () => set({ huntId: 'mill_cellar', visited: new Set([...f.visited, 'mill_cellar']) }),
    first_kill: () => set({ levelXp: 3 }),
    first_level: () => L(2),
    plant_land: () => set({ skillXp: { ...f.skillXp, farming: 28 }, landPlanted: true }),
    bar_intro: () => { read('bar_intro'); L(3); },
    why_it_waits: () => read('why_it_waits'),
    spell_runes: () => save(f.slots.map((s) => (s && s.type === 'ability' && s.usable === false
      ? { ...s, usable: true, store: (f.store.find((r) => r.partner === M.abilities.ABILITIES[s.id].rune) || {}).id } : s))),
    food_when: () => save(f.slots.map(at('cooked_shrimp', 45))),
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
    tamsins_task: () => set({ tally: tallyFact([[WOLVES, 0]], [RATS]) }),
    /* in the Thicket the hero eats, and "Eat on time" comes (the two read-on-sight cards it meets on the way are read) */
    into_the_thicket: () => set({ huntId: 'meadowbrook_thicket', visited: new Set([...f.visited, 'meadowbrook_thicket']), sellable: null,
      supplies: [{ item: 'cooked_shrimp', source: 'own', count: 6 }], read: f.read instanceof Set ? new Set([...f.read, 'first_eat', 'fight_settings']) : f.read }),
    help_page: () => read('help_page'),
    tamsin_pays: () => { L(7); set({ huntId: null, endReason: 'left', tally: tallyFact([], [RATS, WOLVES]), sellable: 0 }); },
    /* ...and the hero hunts on until its stamina runs out: the day-one town cards wait for that end (plan L08, retention R3) */
    save_setup: () => set({ presets: 1, endReason: 'stamina' }),
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

/* What next as a player can read it: the card's goal and the ones behind its More. */
const whatNext = (g) => (g ? [g.text, ...(g.also || [])].join(' ') : '');
const cases = {
  'return-with-no-stamp': async (M) => {
    /* Played 2026-11-04: a hero left hunting with the tab killed seconds after Enter came back ten hours later to "Your hero just ate". No stamp, so no recap and no markBack, and the just-now cards spoke. */
    const { backWithNoStamp } = await import(pathToFileURL(join(M.root, 'src/shell/away-recap.js')).href + V);
    const make = (ms, stamp, ended) => { const e = { state: { level_xp: 5000 }, level: srvLevel(M, 5000), hunt: { session_id: 's1', hunt_id: 'meadowbrook_thicket', ended: !!ended, session: {}, hero: { hp_max: 170 }, pose: { units: [] } },
      hunt_analyzer: { hunt_ms: ms, session: {}, hero: { kills: 5, xp: 10, gold: 1, loot: [], supplies: [] } } };
      const writes = []; return { read: (k) => e[k], record: { residue: stamp ? { awaySeen: stamp } : {} }, setResidue: (k, v) => { writes.push([k, v]); return true; }, writes }; };
    const old = make(36000000);
    if (!backWithNoStamp(old) || old.writes.length !== 1 || old.writes[0][0] !== 'coach' || old.writes[0][1].back !== 's1') return 'a ten-hour hunt no stamp covers is not marked as a return: ' + JSON.stringify(old.writes);
    if (backWithNoStamp(make(300000))) return 'a five-minute hunt read as a return, so a hero watching its first hunt loses the first-meal card';
    if (backWithNoStamp(make(36000000, { s: 's1', at: 1 }))) return 'a hunt with a stamp is the recap\'s to mark, not this';
    if (backWithNoStamp(make(36000000, null, true))) return 'an ended hunt was marked as a return';
    if (!readFileSync(join(M.root, 'src/shell/alerts.js'), 'utf8').includes('else if (judged) backWithNoStamp(cs);')) return 'the alerts scan never asks';
    return null;
  },
  'what-next-one-goal': async (M) => {
    /* WHAT NEXT IS ONE GOAL (played 2026-11-04, Level 17: eight sentences, the Farm first and the third hero not named; blind 20-hour panel: "a five-sentence paragraph"). The walk-through, one lone sword
       and shield through the hours as played: at each stop the first goal is the one the card says, and the others wait behind More. Prices are the server's, passed in. */
    const roster = (n) => Array.from({ length: n }, (_, i) => ({ slot: i, level: 10, name: 'H' + i, open: i === 0, hunting: false }));
    /* THE STAMINA LINE (lane/w-wage): the server's `time_blocks` quote of a Level 20 hero's first hunting block, its price from the one
       rule (src/core/wage.js blockPrice: hours of the hero's wage) and its length from the bought-time row, so no price here goes stale */
    const { blockPrice } = await import(pathToFileURL(join(M.root, 'src/core/wage.js')).href + V);
    const { TIME_BLOCKS } = await import(pathToFileURL(join(M.root, 'src/data/time-blocks.js')).href + V);
    const BLOCK = { available: true, price: blockPrice({ kind: 'hunt', level: 20, n: 1 }), blockMs: TIME_BLOCKS.hunt.blockMin * 60000 };
    const TOP_UP = 'Press + beside stamina: ' + BLOCK.blockMs / 3600000 + ' h for ' + BLOCK.price.toLocaleString('en-US') + ' gp';
    const at = (charLevel, more) => M.tut.nextGoal({ charLevel, role: 'tank', skillLevel: charLevel, defenseXp: 90, land: { planted: 0, ready: {} }, inParty: false, gold: 0, slotCost: 50000, slotsOwned: 2, roster: roster(2), visited: new Set(), staminaMs: 28800000, refill: null, tally: { held: 1 }, home: null, partyGround: M.hl.partyGroundFor(charLevel), ...more });
    const THICKET = 'meadowbrook_thicket', WICK = 'wickstead', GLADE = 'mosslight_glade', WARRENS = 'coppercap_warrens';
    const walk = [
      /* Level, the facts of the stop, what the card's one line must say */
      /* one hero first (Tyler RD-Q6 a): the server's recruit press, once ready, leads the line */
      ['one hero, the recruits ready', 10, { roster: roster(1), gold: 15000, visited: new Set([THICKET]), recruits: { ready: true, count: 3, level: 10 } }, 'Open All characters and recruit 3 heroes'],
      ['two heroes, the Glade unwalked', 10, { gold: 15000, visited: new Set([THICKET, WICK]) }, 'Next step up: Mosslight Glade, Level 16'],
      ['the Glade walked, 41k: the hero, never the Farmstead', 17, { gold: 41172, visited: new Set([THICKET, WICK, GLADE, WARRENS]), home: { owned: true, next: { name: 'Fieldworth Farmstead', gold: 2500, items: [{ id: 'normal_log', qty: 40 }] } } }, 'Next goal: a third hero slot, 50,000 gp'],
      ['the purse is there', 18, { gold: 50000, visited: new Set([THICKET, WICK, GLADE]) }, 'Buy a third hero slot for 50,000 gp'],
      /* an empty slot with the purse for the next one: the recruits, never a sale (lane/c-hollow-proofs: at 15,000 gp the purse was too short for any
         offer, so the mutant that sells a slot past an empty one escaped once its plant could load) */
      ['the purse is there, the recruits ready', 18, { gold: 50000, roster: roster(1), visited: new Set([THICKET, WICK, GLADE]), recruits: { ready: true, count: 3, level: 10 } }, 'Open All characters and recruit 3 heroes'],
      ['the Warrens fifteen Levels up, unwalked', 17, { gold: 1000, slotCost: 200000, slotsOwned: 3, roster: roster(3), visited: new Set([GLADE]) }, 'Next step up: Coppercap Warrens, Level 32'],
      ['sixteen Levels under names no dare', 16, { gold: 1000, slotCost: 200000, slotsOwned: 3, roster: roster(3), visited: new Set([GLADE]) }, 'Find a party for Mosslight Glade'],
      ['out of stamina, gold in hand', 20, { gold: BLOCK.price + 3000, slotCost: 200000, slotsOwned: 3, roster: roster(3), visited: new Set([GLADE, WARRENS]), staminaMs: 60000, refill: BLOCK }, TOP_UP],
      ['no task held, past the Sewer', 27, { gold: 1000, slotCost: 200000, slotsOwned: 3, roster: roster(3), visited: new Set([GLADE, WARRENS]), tally: { held: 0, paid: 0, weight: true } }, 'Take a task on Tamsin\'s tally (Q)'],
      /* THE GLADE'S RUNG: the longest stretch with nothing new to wear ends at Level 22, on a piece made from what the Glade drops */
      ['nothing to buy: the gear', 21, { inParty: true, gold: 1000, slotCost: 200000, slotsOwned: 3, roster: roster(3), visited: new Set([GLADE, WARRENS]), land: null }, 'Next gear at Level 22: Houndskin Cloak, made in Crafting'],
    ];
    for (const [what, lv, more, want] of walk) {
      const g = at(lv, more);
      if (!g || g.text !== want) return what + ' (Level ' + lv + '): the card reads ' + JSON.stringify(g && g.text) + ', wanted ' + JSON.stringify(want);
      if (!Array.isArray(g.also) || g.also.includes(g.text)) return what + ': the rest of the goals read ' + JSON.stringify(g.also);
      if (!/^goal_[a-z0-9_]+$/.test(g.id)) return what + ': the id ' + g.id + ' is not a coach key';
    }
    /* NO SALE PAST AN EMPTY SLOT, in any of the card's lines (the free hero leads, so the first line alone could not tell: lane/c-hollow-proofs) */
    const emptyFull = at(18, { gold: 50000, roster: roster(1), visited: new Set([THICKET, WICK, GLADE]) });
    if ([emptyFull.text, ...emptyFull.also].some((x) => /hero slot for/.test(x))) return 'with a slot empty and the purse full the card sells a slot: ' + JSON.stringify([emptyFull.text, ...emptyFull.also]);
    /* the walk's every stop is doable with what the stop holds: each ground it names is a real, open, row; a press it names is a real window */
    for (const hunt of [GLADE, WARRENS]) if (!M.HUNTS[hunt] || M.HUNTS[hunt].staged) return hunt + ' is named and not open';
    /* the empty land, which led the card for a hunter, waits behind every goal with a press */
    const hunter = at(17, { gold: 41172, visited: new Set([GLADE, WARRENS]) });
    if (/Plant a seed/.test(hunter.text) || !hunter.also.some((t) => /^Plant a seed on the Farm/.test(t))) return 'empty land reads ' + JSON.stringify(hunter);
    /* ready crops come ahead of the waiting goals, once there are some */
    const ripe = at(17, { gold: 41172, visited: new Set([GLADE, WARRENS]), land: { planted: 2, ready: { turnip: 2 } } });
    if (!/^Harvest 2 Turnip plots on the Farm/.test(ripe.text)) return 'ready crops read ' + ripe.text;
    /* a party hears the step for the party, and no pitch */
    const inParty = at(11, { inParty: true, visited: new Set([THICKET]), gold: 0 });
    if (inParty.text !== 'Next step up: Mosslight Glade, Level 16' || [inParty.text, ...inParty.also].some((t) => /Invite/.test(t))) return 'in a party it reads ' + JSON.stringify(inParty);
    /* no ground a party suits holds Levels 1-4 (the Cellar: a four earns 0.42 of its heroes alone), so a lone Level 3 hears no pitch (lane/a-party-coach-card) */
    const cellar = at(3, { visited: new Set(['mill_cellar']) });
    if (M.hl.partyGroundFor(3) !== null || [cellar.text, ...cellar.also].some((t) => /^Find a party for/.test(t))) return 'a lone Level 3 hears a party pitch: ' + JSON.stringify(cellar);
    /* a stamina quote the purse can't pay, or a hero with plenty left, says nothing */
    const tops = (more) => whatNext(at(20, { visited: new Set([GLADE, WARRENS]), refill: BLOCK, ...more })).includes('beside stamina');
    if (tops({ gold: BLOCK.price - 1, staminaMs: 60000 }) || tops({ gold: BLOCK.price + 3000, staminaMs: 1800000 })
        || tops({ gold: BLOCK.price + 3000, staminaMs: 60000, refill: { available: false, why: 'block_limit', price: null, blockMs: BLOCK.blockMs } })
        || !tops({ gold: BLOCK.price, staminaMs: 60000 })) return 'the stamina line speaks at the wrong time';
    /* the card draws one goal and keeps the rest behind More; shut until pressed */
    const { coachHtml, actCoach } = await import(pathToFileURL(join(M.root, 'src/shell/launcher-coach.js')).href + V);
    const reader = { read: () => null, record: { residue: {} }, setResidue: () => {} };
    const html = coachHtml(reader, hunter, false);
    if (!/<span class="hs-coach-text">Next goal: a third hero slot, 50,000 gp/.test(html) || !/data-hs-act="coach-more"/.test(html) || !/class="hs-coach-also" hidden/.test(html) || !html.includes('Plant a seed on the Farm')) return 'the card draws ' + html;
    /* More works where What next stands (played 11-04: in town the card sits inside the row's <nav>, so a press on More reached nothing), and stays open through a repaint of that row */
    const also = { hidden: true }, more = { textContent: 'More', setAttribute() {} };
    const ptr = { getAttribute: () => hunter.id, classList: { toggle() { throw new Error('toggled the window line'); } }, querySelector: (q) => (q === ':scope > .hs-coach-more' ? more : q === ':scope > .hs-coach-also' ? also : null) };
    const row = { querySelector: (q) => (q === '.hs-pointer' ? ptr : null) };
    actCoach({ character: reader }, row, 'coach-more', { type: 'click' });
    if (also.hidden || more.textContent !== 'Less') return 'More in the town row leaves the goals shut';
    if (/class="hs-coach-also" hidden/.test(coachHtml(reader, hunter, false))) return 'a repaint of the row shuts the goals More opened';
    actCoach({ character: reader }, row, 'coach-more', { type: 'click' });
    if (!also.hidden || more.textContent !== 'More' || !/class="hs-coach-also" hidden/.test(coachHtml(reader, hunter, false))) return 'Less leaves the goals open';
    return null;
  },
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
        /* a body that wears another's sprite (HUNT_ART_ALIAS, the scene's spriteOf) walks in that one's art */
        const worn = Object.prototype.hasOwnProperty.call(M.art.HUNT_ART_ALIAS, s.monster) ? M.art.HUNT_ART_ALIAS[s.monster] : s.monster;
        if (key ? !units[key] : !walks(worn)) return g.id + ': ' + s.monster + ' has no walk art (PixelLab manifest or a loaded atlas)';
      }
    }
    return M.MONSTERS.rat_king.drops.some((d) => d.id === 'crown_shard') ? null : 'the Rat King does not drop the Crown Shard';
  },
  /* THE KING'S HALL IS BUILT FOR A PARTY, AND WALKED BY ANYONE (Tyler 2026-11-08: one difficulty for every group): his pocket carries forParty 2 (the
     Hunts window's warning, the advice's party ground) and stands on the route every hero walks; he spawns at his row's HP for any party (conditions.mjs one-pack). */
  'one-king': (M) => {
    const sewer = M.grounds.HUNT_GROUNDS.millrace_sewer;
    const hall = sewer.pockets.findIndex((p) => p.spawns.some((s) => s.monster === 'rat_king'));
    if (hall < 0 || sewer.pockets[hall].forParty !== 2) return 'the Rat King\'s hall is not marked built for a party of two';
    return sewer.route.includes(hall) ? null : 'the Rat King\'s hall is off the route';
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
  /* A CARD THAT ASKS NEVER WALLS (first-hour play 2026-10-31): a hero who only watches gets Cash in at the Thicket's floor,
     the skipped lessons come back in the Thicket (Tyler: the bar is taught during combat), and each has its Got it. A bow
     with nothing loaded says so before the wait for a first kill that would never come. */
  'first-hour-never-walls': async (M) => {
    const K = tutKit(M, null, M.kit.START_EQUIPMENT.weapon, M.kit.START_EQUIPMENT.shield);
    const floor = M.tut.HUNT_TUTORIAL.find((r) => r.id === 'earn_the_thicket').text.match(/Level (\d+)/)[1] * 1;
    const fresh = (L, more) => tutAt(M, K, L, { levelXp: M.xp.charXpForLevel(L), huntId: 'mill_cellar', visited: new Set(['mill_cellar']), ...(more || {}) });
    const id = (f) => (M.tut.currentCard(f) || {}).id;
    /* the farm card waits for town (audit 2026-11-18 A4), so a watcher's first lesson is the bar */
    if (id(fresh(floor - 1)) !== 'bar_intro') return 'a watcher under the floor is on ' + id(fresh(floor - 1));
    if (id(fresh(floor)) !== 'leave_cellar') return 'a watcher at the Thicket floor is on ' + id(fresh(floor)) + ', not Cash in';
    const thicket = fresh(floor + 1, { huntId: 'meadowbrook_thicket', visited: new Set(['mill_cellar', 'meadowbrook_thicket']) });
    if (id(thicket) !== 'bar_intro') return 'the lessons skipped in the Cellar did not come back in the Thicket: ' + id(thicket);
    /* ...and the farm card skipped in town comes back in town after the Thicket */
    const homeFromThicket = tutAt(M, K, floor + 1, { levelXp: M.xp.charXpForLevel(floor + 1), visited: new Set(['mill_cellar', 'meadowbrook_thicket']), read: new Set(['styles']) });
    if (id(homeFromThicket) !== 'plant_land') return 'home from the Thicket with the land bare, the card is ' + id(homeFromThicket) + ', not Plant your land';
    /* Got it on each asking card moves on, in order, with nothing else done */
    let f = fresh(floor - 1);
    const seen = [];
    for (let n = 0; n < 12; n++) {
      const c = M.tut.currentCard(f);
      if (!c || !c.gotIt) { if (c && c.id !== 'earn_the_thicket') return 'after Got it on ' + seen.join(', ') + ' the chain stops on ' + c.id; break; }
      seen.push(c.id);
      f = { ...f, read: new Set([...f.read, c.id]) };
    }
    for (const want of ['bar_intro']) if (!seen.includes(want)) return want + ' was not on the way past: ' + seen.join(', ');
    if (seen.includes('plant_land')) return 'Plant your land came in the first hunt (it waits for town): ' + seen.join(', ');
    for (const later of ['first_spell', 'help_page']) if (seen.includes(later)) return later + ' came in the first hunt (it waits for the Thicket): ' + seen.join(', ');
    /* town: every asking card has its way past too, up to the Thicket's Enter */
    let t = tutAt(M, K, floor, { levelXp: M.xp.charXpForLevel(floor), visited: new Set(['mill_cellar']), sellable: 3 });
    t = { ...t, read: new Set(seen) };
    /* each card's Got it is the shell's (launcher.js actCoach): a read for one that teaches or asks, a hide for this visit for one the server
       finishes (Sell junk since the retention dive 2026-11-20: Got it means later, not never) */
    const readsDone = (d) => d.kind === 'read' || (d.kind === 'any' && d.of.some(readsDone));
    let reachedThicket = false;
    for (let n = 0; n < 14; n++) {
      const c = M.tut.currentCard(t);
      if (!c) return 'the town chain ended with no Thicket card';
      if (c.id === 'into_the_thicket') { reachedThicket = true; break; }
      t = c.gotIt || readsDone(c.done) ? { ...t, read: new Set([...t.read, c.id]) } : { ...t, hid: new Set([...(t.hid || []), c.id]) };
    }
    if (!reachedThicket) return 'fourteen Got its in town never reached Into the Thicket: ' + (M.tut.currentCard(t) || {}).id;
    /* the food sums wait until the hero has eaten; then they ask, and Got it moves on */
    if (seen.includes('food_when')) return 'Eat on time came before the hero ate';
    const fed = (more) => fresh(floor - 1, { read: new Set(['first_eat', 'fight_settings', 'plant_land', 'bar_intro']), supplies: [{ item: 'cooked_shrimp', source: 'own', count: 6 }], ...(more || {}) });
    if (id(fed()) !== 'food_when') return 'a hero who has eaten six times is on ' + id(fed());
    /* THE FOOD LESSON WAITS FOR A HERO SPENDING FOOD (the playthrough audit 2026-11-15, F5): three meals is not six, and the audit's own hunt,
       8 meals in 2 hours of the Thicket (4 an hour, in armor on Normal), is not twelve an hour; six in ten minutes is */
    const meals = (n, ms) => fed({ supplies: [{ item: 'cooked_shrimp', source: 'own', count: n }], huntMs: ms });
    if (id(meals(3, 0)) === 'food_when') return 'Eat on time came after three meals';
    if (id(meals(8, 2 * 3600000)) === 'food_when') return 'Eat on time came at 8 meals in 2 hours (4 an hour): the audit\'s hero, who is not spending food';
    if (id(meals(6, 10 * 60000)) !== 'food_when') return 'a hero eating 6 times in 10 minutes is on ' + id(meals(6, 10 * 60000)) + ', not Eat on time';
    if (id(fed({ read: new Set(['first_eat', 'fight_settings', 'plant_land', 'bar_intro', 'food_when']) })) === 'food_when') return 'Got it does not pass Eat on time';
    /* the first card on a new hero is Tamsin's rats, then the Cellar: the style waits until home from that first hunt
       (designer 2026-11-12, first-30 play: before any hunt it sent the hero into the bag, not to the Cellar) */
    if (id(tutAt(M, K, 1)) !== 'tamsins_rats') return 'a new hero starts on ' + id(tutAt(M, K, 1));
    /* short over the town (it fits 667x375 without covering the bar), the five ways inside the bag */
    const sc = M.tut.cardFor(M.tut.HUNT_TUTORIAL.find((r) => r.id === 'styles'), tutAt(M, K, 1));
    if (sc.text.split(' ').length > 10 || !sc.text.includes('Equip') || !(sc.textIn || '').includes('then Equip')) return 'the style card reads ' + JSON.stringify([sc.text, sc.textIn]);
    if (id(tutAt(M, K, 1, { read: new Set(['styles']) })) !== 'tamsins_rats') return 'after the style card comes ' + id(tutAt(M, K, 1, { read: new Set(['styles']) }));
    /* Tamsin's rats never wall the first hunt: Got it, or the Take, and the Cellar's card follows */
    if (id(tutAt(M, K, 1, { read: new Set(['styles', 'tamsins_rats']) })) !== 'to_the_cellar') return 'Got it on Tamsin\'s rats leads to ' + id(tutAt(M, K, 1, { read: new Set(['styles', 'tamsins_rats']) }));
    if (id(tutAt(M, K, 1, { read: new Set(['styles']), tally: tallyFact([['cellar_giant_rats', 0]], []) })) !== 'to_the_cellar') return 'her rats taken, the next card is not the Cellar';
    const back = tutAt(M, K, floor, { levelXp: M.xp.charXpForLevel(floor), visited: new Set(['mill_cellar']), sellable: 3, read: new Set(seen.concat('styles')), blessings: tutAt(M, K, floor).blessings });
    if (id(back) !== 'bless') return 'back from the Cellar the first card is ' + id(back) + ', not the Blessings';
    /* the bow: the worn set says nothing is loaded (fact `ammo`); unknown says nothing */
    const B = tutKit(M, null, 'practice_bow', null);
    const bow = (more) => tutAt(M, B, 1, { ammo: null, ...(more || {}) });
    const town = bow({ visited: new Set(['mill_cellar']), read: new Set(['styles', 'tamsins_rats']) }), said = M.tut.cardFor(M.tut.currentCard(town), town);
    if (said.id !== 'load_shot' || !said.text.includes('Bronze Arrows → Put on the bar') || !said.hooks.some((h) => h.includes('data-item="bronze_arrows"'))) return 'a bow with nothing loaded in town reads ' + JSON.stringify(said);
    /* and before the first kill that would never come */
    if (id(bow({ huntId: 'mill_cellar', visited: new Set(['mill_cellar']), read: new Set(['styles']) })) !== 'load_shot_hunt') return 'a bow with nothing loaded in a hunt is on ' + id(bow({ huntId: 'mill_cellar', visited: new Set(['mill_cellar']) }));
    const S = { read: new Set(['styles', 'tamsins_rats']) };
    if (id(bow({ ...S, ammo: 'bronze_arrows' })) !== 'to_the_cellar') return 'a loaded bow is on ' + id(bow({ ...S, ammo: 'bronze_arrows' }));
    if (id(bow({ ...S, ammo: undefined })) !== 'to_the_cellar') return 'a worn set the server never sent walls the coach: ' + id(bow({ ...S, ammo: undefined }));
    if (id(bow({ ...S, slots: [...B.slots, { type: 'attack_with_item', id: 'bronze_arrows', conditions: [], enabled: true, usable: true, count: 50 }] })) !== 'to_the_cellar') return 'arrows on the bar still read as nothing to shoot';
    if (id(tutAt(M, K, 1, { ...S, ammo: null })) !== 'to_the_cellar') return 'a sword with no ammo is told it has nothing to shoot';
    /* A spell costs runes: the ring walks deeper as the player goes (deepest first; launcher.js ringPlan takes the first on screen) */
    const off = fresh(floor + 1, { huntId: 'meadowbrook_thicket', visited: new Set(['mill_cellar', 'meadowbrook_thicket']), read: new Set(seen) });
    const offer = M.tut.cardFor(M.tut.currentCard(off), off);
    if (offer.id !== 'first_spell' || !/data-store/.test(offer.hooks[0]) || !/data-id/.test(offer.hooks[1]) || !/data-tab/.test(offer.hooks[2])) return 'A spell costs runes rings ' + JSON.stringify(offer.hooks);
    /* the press it names is a tab Configure action has (Spells, Food & drink, Ammo): "then Runes" named none (designer re-read 2026-11-11) */
    if (!offer.text.includes(' → Spells → ') || /Runes →/.test(offer.text)) return 'the spell offer names a tab that is not there: ' + offer.text;
    return null;
  },
  /* TAMSIN FIRST (designer 2026-11-10, the first ten minutes, played: the quit minute was 9). Her Cellar rats are taken before the first hunt, counted
     inside it, paid with a helmet the hero wears at once, and the invitation to close the game comes on the second trip down. Every card is read
     off the server's tally: the held row's own done, the day's pays. */
  'tamsin-first': async (M) => {
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { ringPlan } = await imp('src/shell/launcher-coach.js');
    const { tutorialFactsOf } = await imp('src/session/tutorial-sections.js');
    const { MONSTERS } = await imp('src/data/monsters.js');
    const RATS = 'cellar_giant_rats', WOLVES = 'thicket_gray_wolves';
    const rats = M.tally.tallyTask(RATS);
    /* the count the designer measured inside the first hunt (24 to 29 rats at hunt minute 5 to 6), at the old gold per rat */
    if (rats.count !== 25 || rats.gold !== 25) return 'her Cellar task asks ' + rats.count + ' rats for ' + rats.gold + ' gp, the first ten minutes need 25 for 25';
    /* "she pays you gold and a helmet": her Cellar pieces are a helmet in every weight, each worn at Level 1 */
    const cellar = Object.values(M.grounds.HUNT_GROUNDS).find((g) => g.hunt === rats.hunt);
    const kinds = new Set(cellar.pockets.flatMap((p) => [...(p.spawns || []), ...(p.pack || [])].map((s) => s.monster)));
    const pieces = [...kinds].flatMap((k) => (MONSTERS[k].drops || []).filter((d) => d.band === 'scarce').map((d) => M.items.ITEMS[d.id])).filter((it) => it && it.type === 'armor');
    const weights = new Set(pieces.map((it) => M.coreModel.ARMOUR_WEIGHT[it.armourClass]));
    if (pieces.length < 3 || pieces.some((it) => it.slot !== 'helmet' || (it.reqLv || 1) > 1) || !M.tally.TALLY_RULES.weights.every((w) => weights.has(w))) {
      return 'her Cellar pick is not a helmet worn at Level 1 in every weight: ' + pieces.map((it) => it.n + '/' + it.slot + '/' + it.reqLv).join(', ');
    }
    const K = tutKit(M, 'tank');
    const lessons = ['styles', 'plant_land', 'bar_intro'];
    const at = (L, more) => tutAt(M, K, L, { levelXp: L > 1 ? M.xp.charXpForLevel(L) : 0, read: new Set(lessons), ...(more || {}) });
    const said = (f) => { const c = M.tut.currentCard(f); return c ? M.tut.cardFor(c, f) : null; };
    const id = (f) => (said(f) || {}).id || null;
    const inCellar = { huntId: 'mill_cellar', visited: new Set(['mill_cellar']) };
    /* 1. before the first hunt, and only then */
    const ask = said(at(1));
    if (!ask || ask.id !== 'tamsins_rats' || !ask.text.includes(rats.label) || !ask.gotIt) return 'a new hero in town reads ' + JSON.stringify(ask && [ask.id, ask.text]);
    const way = ringPlan(ask, { open: (w) => w === 'tally', weight: false });
    if (!way[0] || !way[0].includes('[data-hs-act="take"][data-task="' + RATS + '"]')) return 'her card rings ' + JSON.stringify(way) + ', not the Take on her rats';
    if (ringPlan(ask, { open: () => false })[0] !== '.hs-launchers [data-hs-open="tally"]') return 'with her window shut the card does not ring her icon';
    if (id(at(3, { visited: new Set(['mill_cellar']) })) === 'tamsins_rats') return 'a hero who has hunted is sent back to her rats';
    /* 2. in the Cellar the count has a card, and "Out to the brook" keeps for the second trip */
    if (id(at(3, { ...inCellar, tally: tallyFact([[RATS, 4]], []) })) !== 'rats_count') return 'her count running, the Cellar reads ' + id(at(3, { ...inCellar, tally: tallyFact([[RATS, 4]], []) }));
    /* 3. the count done: ahead of every lesson, even for a hero who pressed nothing; the server's done, never this build's count */
    const owed = said(tutAt(M, K, 3, { ...inCellar, read: new Set(), tally: tallyFact([[RATS, 25, true]], []) }));
    if (!owed || owed.id !== 'tamsin_owes' || owed.anchor !== 'hunt_topbar' || !owed.holdOpen) return 'her count done, the Cellar reads ' + JSON.stringify(owed && [owed.id, owed.anchor, owed.holdOpen]);
    const old = { held: 1, paid: 0, weight: true, paidTasks: [], tasks: { [RATS]: { kills: 40, target: 120, done: false } } };
    if (id(at(3, { ...inCellar, tally: old })) !== 'rats_count') return 'a row held at the old count of 120 with 40 kills reads ' + id(at(3, { ...inCellar, tally: old })) + ' (the card follows the server\'s done)';
    if (id(at(6, { huntId: 'meadowbrook_thicket', visited: new Set(['mill_cellar', 'meadowbrook_thicket']), tally: tallyFact([[RATS, 25, true]], []) })) === 'tamsin_owes') return 'a Level 6 hero in the Thicket is told to leave for her rats';
    /* 4. paid: the helmet first, then back down, the Cellar ringed */
    const paid = tallyFact([], [RATS]);
    if (id(at(3, { visited: new Set(['mill_cellar']), tally: paid, upgrades: ['bronze_helm'] })) !== 'equip_upgrades') return 'paid a helmet, the town card is not Wear what you found';
    const down = said(at(3, { visited: new Set(['mill_cellar']), tally: paid }));
    if (!down || down.id !== 'back_down' || !/^Hunts → Mill Cellar → Enter$/.test(down.text)) return 'paid and dressed, the town card reads ' + JSON.stringify(down && [down.id, down.text]);
    if (!ringPlan(down, { open: (w) => w === 'hunts' }).some((q) => q.includes('data-hunt="mill_cellar"'))) return 'Back down rings ' + JSON.stringify(ringPlan(down, { open: (w) => w === 'hunts' }));
    if (id(at(5, { visited: new Set(['mill_cellar']), tally: paid, sellable: 0 })) === 'back_down') return 'a Level 5 hero is sent back down';
    /* 5. the second trip: the invitation leads. A hero who never took her rats reads the first trip's words */
    const second = said(at(3, { ...inCellar, tally: paid }));
    if (!second || second.id !== 'earn_the_thicket' || !second.text.startsWith('It is safe to close the game. Your hero keeps hunting')) return 'the second trip reads ' + JSON.stringify(second && [second.id, second.text]);
    const never = said(at(3, inCellar));
    if (!never || never.id !== 'earn_the_thicket' || !never.text.startsWith('Hunt here to Level')) return 'a hero without her rats reads ' + JSON.stringify(never && [never.id, never.text]);
    /* 6. her rats are not her wolves: the Thicket's task is still asked for, and its pay still waited for */
    const town5 = { visited: new Set(['mill_cellar']), read: new Set([...lessons, 'sell_loot']), blessings: { ...at(5).blessings, held: 3, prices: [] } };
    if (id(at(5, { ...town5, tally: paid })) !== 'tamsins_task') return 'her rats paid, the wolves\' card is passed by: ' + id(at(5, { ...town5, tally: paid }));
    const thicket = { huntId: 'meadowbrook_thicket', visited: new Set(['mill_cellar', 'meadowbrook_thicket']), read: new Set([...lessons, 'food_when', 'food_order', 'first_spell', 'help_page', 'more_heroes', 'sell_loot']) };
    if (id(at(6, { ...thicket, tally: tallyFact([[WOLVES, 12]], [RATS]) })) !== 'tamsin_pays') return 'her rats paid, the wolves\' pay is not waited for: ' + id(at(6, { ...thicket, tally: tallyFact([[WOLVES, 12]], [RATS]) }));
    /* 7. the facts are the server's tally section: the held row's own count and done, the day's pays */
    const sect = { held: [{ place: 1, task: RATS, hunt: 'mill_cellar', monster: 'rat', kills: 25, target: 25, keep: false, done: true, done_at: '2026-11-10T10:00:00Z', wait: null }],
      recent: [{ claim: 'c1', at: '2026-11-10T09:00:00Z', task: WOLVES, gold: 480, item: 'bronze_helm', qty: 1, pick: 'piece' }], paid_today: 1, per_day: 3, held_max: 3, weight: 'heavy', order: [] };
    const env = { state: { level_xp: M.xp.charXpForLevel(3) }, level: { xp: M.xp.charXpForLevel(3), level: 3, into: 0, need: 1 }, tally: sect };
    const facts = tutorialFactsOf({ read: (k) => env[k] });
    if (JSON.stringify(facts.tally.tasks) !== JSON.stringify({ [RATS]: { kills: 25, target: 25, done: true } }) || facts.tally.paidTasks.join() !== WOLVES) return 'the tally facts read ' + JSON.stringify(facts.tally);
    return null;
  },
  /* THE COACH STAYS UP WITH CHAT OPEN (designer 2026-11-10: with Chat open the screen said nothing at minute 9). Chat is the one window that does not
     take the card's place, in town under the icon row and in a hunt under the hunt bar; any other open window still does. */
  'coach-beside-chat': async (M) => {
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { pointerFor, coachCovered } = await imp('src/shell/launcher-coach.js');
    const { SHELL_WINDOWS } = await imp('src/data/shell-windows.js');
    const env = { state: { level_xp: M.xp.charXpForLevel(3) }, level: { xp: M.xp.charXpForLevel(3), level: 3, into: 0, need: 1 }, hunt_settings: { preset: 1, slots: [] }, hunt: { session_id: 's1', hunt_id: 'mill_cellar', ended: false, session: {}, hero: {}, pose: { units: [] } } };
    const cs = { read: (k) => env[k], record: { residue: {} }, setResidue: () => true };
    const ctx = (open) => ({ character: cs, glyphs: {}, hud: { isShown: () => false }, wm: { openIds: () => open, rows: () => SHELL_WINDOWS.slice(), row: (w) => SHELL_WINDOWS.find((r) => r.id === w) } });
    const card = (open, hunting) => (/data-tutorial="([a-z0-9_]+)"/.exec(pointerFor(ctx(open), hunting)) || [])[1] || null;
    const alone = card([], true);
    if (!alone) return 'no card to test with';
    for (const hunting of [true, false]) {
      if (card(['chat'], hunting) !== card([], hunting)) return 'with Chat open ' + (hunting ? 'in a hunt' : 'in town') + ' the coach shows ' + card(['chat'], hunting) + ', not ' + card([], hunting);
      if (card(['inventory'], hunting) !== null) return 'the card is drawn over an open bag';
      if (card(['chat', 'inventory'], hunting) !== null) return 'the card is drawn over an open bag beside Chat';
    }
    const beside = SHELL_WINDOWS.filter((r) => r.besideCoach).map((r) => r.id);
    if (beside.join() !== 'chat') return 'the windows the card stays up beside are ' + beside.join(', ') + ', the ruling names Chat alone';
    if (coachCovered({ openIds: () => [], rows: () => SHELL_WINDOWS.slice() }) !== false) return 'with no window open the card is covered';
    return null;
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
        if (!town(s) || !(M.blessings.BLESSING.freeUntilLevel > H.meadowbrook_thicket.band[0])) return s.id + ': Blessings are not free in town when the card asks';
      } else if (d.kind === 'pull') {
        if (can.inHunt !== M.grounds.HUNT_GROUNDS[d.ground].hunt) return s.id + ': not hunting ' + d.ground;
        const pk = M.grounds.HUNT_GROUNDS[d.ground].pockets[d.pocket];
        if (pk && (pk.forParty || 1) > 1) return s.id + ': pocket ' + d.pocket + ' of ' + d.ground + ' is built for a party of ' + pk.forParty;
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
    if (cellar.hunt !== steps.find((x) => x.done.kind === 'enter').done.hunt) return 'the first hunt is not the cellar ground';
    /* THE WHOLE CHAIN, ONE HERO (2026-10-21: the launcher showed only card 1): every card in order, from facts. */
    const T = tutKit(M, 'tank');
    const order = walkChain(M, T).map((x) => x.id);
    /* the sword's default sets hold no rune spell (playtest 2026-10-29 #9: Flame Strike sat struck from minute one); "A spell
       costs runes" offers it in the Cellar, and a hero who takes it (store rune on) meets "Make your own runes" on day one */
    /* the panel's order (2026-10-31): the style before any hunt, Blessings first on the way back, the food sums once the hero has eaten.
       The panel again (2026-11-01, "about ten tips before hunt 2"): what the first two hunts need comes first; the spell offer and the
       Help page wait for the Thicket, where a hero has time to read, and Cook and Decide once for the second return */
    /* TAMSIN FIRST (designer 2026-11-10, the first ten minutes): her rats before the first hunt, her count while it runs, "Tamsin owes you" when it is
       done, the helmet worn in town, then back down, and "Out to the brook" only on that second trip */
    /* PLANT YOUR LAND IN TOWN (audit 2026-11-18 A4): home from the first hunt, before back down, never two minutes into it */
    const want = ['tamsins_rats', 'to_the_cellar', 'first_kill', 'first_level', 'bar_intro', 'rats_count', 'tamsin_owes', 'styles', 'equip_upgrades', 'plant_land', 'back_down', 'earn_the_thicket',
      'leave_cellar', 'bless', 'sell_loot', 'tamsins_task', 'into_the_thicket', 'food_when', 'food_order', 'first_spell', 'help_page', 'tamsin_pays',
      'loot_rules', 'cook_catch', 'save_setup', 'own_runes', null];
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
    /* under the floor, judged on the party card alone (since the Sewer opens at the Thicket's floor, lane/d-party-pace, the solo chain's "Out to the brook" asks
       the same Level first, so the whole chain can't tell the card's own floor from that one) */
    const goBelow = M.tut.HUNT_TUTORIAL.filter((r) => r.id === 'go_below');
    if ((M.tut.currentCard({ ...atSewer, charLevel: sewerBand - 1, levelXp: M.xp.charXpForLevel(sewerBand - 1), inParty: true }, goBelow) || {}).id === 'go_below') return 'a party hero under the Sewer floor meets go_below';
    if ((M.tut.currentCard({ ...atSewer, inParty: true }, goBelow) || {}).id !== 'go_below') return 'a party hero at the Sewer floor does not meet go_below on its own row';
    /* A PARTY AT THE FLOOR IS SENT BELOW BEFORE THE WOLVES (lane/d-party-pace; Tyler 2026-11-18 "Yes, open at 5"): walk the solo chain to the step before
       Tamsin's wolves, then the same hero in a party meets go_below, never "Into the Thicket", and a hero alone still meets the wolves. */
    const chain = walkChain(M, T);
    const before = chain.find((x) => x.id === 'tamsins_task');
    if (!before) return 'the solo chain has no tamsins_task step to stand before';
    const party5 = { ...before.facts, inParty: true, levelXp: M.xp.charXpForLevel(sewerBand), charLevel: Math.max(before.facts.charLevel, sewerBand) };
    if ((M.tut.currentCard(party5) || {}).id !== 'go_below') return 'a party at the Sewer floor, the Cellar behind it, meets ' + ((M.tut.currentCard(party5) || {}).id || 'no card') + ', not go_below';
    if ((M.tut.currentCard({ ...party5, inParty: false }) || {}).id !== 'tamsins_task') return 'a hero alone at the same point meets ' + ((M.tut.currentCard({ ...party5, inParty: false }) || {}).id || 'no card') + ', not tamsins_task';
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
      bow: ['practice_bow'], crossbow: ['practice_crossbow'], healer: ['practice_staff'],
      /* the player's own choice: Carried runes only, with none (no default bar is struck) */
      'axes, Rend on Carried runes only': ['practice_hatchets', null, ['rend']], 'mage, Frost Lance on Carried runes only': ['practice_wand', 'practice_spellbook', ['frost_lance']] };
    for (const [set, [weapon, shield, carriedRunes]] of Object.entries(sets)) {
      const K = tutKit(M, null, weapon, shield);
      const T = carriedRunes ? carriedOnly(K, carriedRunes) : K;
      const L3 = tutAt(M, T, 3, { huntId: 'mill_cellar', visited: new Set(['mill_cellar']), skillXp: { farming: 28, cooking: 0, melee: 0 }, landPlanted: true, read: new Set() });
      const say = (f) => { const c = M.tut.currentCard(f); return c ? M.tut.cardFor(c, f) : null; };
      const intro = say(L3);
      if (!intro || intro.id !== 'bar_intro') return set + ': at Level 3 in the Cellar the card is ' + (intro && intro.id);
      if (intro.text !== 'Press a slot to change what it does' || intro.barSlot !== 0) return set + ': the bar card does not ring slot 1 with its one line: ' + JSON.stringify([intro.text, intro.barSlot]);
      /* a bar with a slot waiting on a count explains it next, on that slot; any other bar passes it by. A move under its skill unlock (every area
         move at this hero's skills, Raking Shot on the bow) waits for the level, not its count (v0.2.129) */
      const waits = T.slots.findIndex((s) => s.type === 'ability' && s.usable !== false && !(M.abilities.ABILITIES[s.id] || {}).unlock && s.conditions.some((k) => ['enemies_in_aoe', 'allies_below'].includes(k.metric) && k.op === 'gte' && k.value > 1));
      const next = say({ ...L3, read: new Set(['bar_intro']) });
      if (waits >= 0 ? !next || next.id !== 'why_it_waits' || next.barSlot !== waits : !!next && next.id === 'why_it_waits') return set + ': after Your action bar the card is ' + JSON.stringify(next && { id: next.id, barSlot: next.barSlot }) + ', the waiting slot is ' + waits;
      const read = { ...L3, read: new Set(['bar_intro', 'why_it_waits']) };
      const struck = T.slots.findIndex((s) => s.type === 'ability' && s.usable === false);
      const card = say(read);
      if (struck >= 0) {
        const a = M.abilities.ABILITIES[T.slots[struck].id];
        const fam = M.items.ITEMS[a.rune].family;
        const st = T.store.find((r) => r.partner === a.rune);
        const want = 'Press slot ' + (struck + 1) + ', pick ' + M.basics.BASIC_INDEX[st.id].n + ', then Save';
        if (!fam || !card || card.id !== 'spell_runes' || card.text !== want
          || card.barSlot !== struck || !card.hooks.some((h) => h.includes('data-store="' + st.id + '"'))) return set + ': the rune card reads ' + JSON.stringify(card && { id: card.id, text: card.text, barSlot: card.barSlot }) + ', wanted it to start "' + want + '"';
        /* a store with no rune of that family: the card cannot be finished, so it is passed by, never shown */
        const noStore = M.tut.currentCard({ ...read, store: T.store.filter((r) => r.partner !== a.rune) });
        if (!noStore || noStore.id === 'spell_runes') return set + ': with no store rune to name, the rune card is ' + (noStore ? 'still up' : 'up with no words (the coach goes blank)');
      } else if (card && card.id === 'spell_runes') return set + ': no spell is struck, yet the rune card is up';
      /* Saved with the store's rune on that slot: the server now says it can fire */
      const fixed = { ...read, slots: T.slots.map((s) => ({ ...s, usable: true })), supplies: [{ item: 'cooked_shrimp', source: 'own', count: 6 }],
        read: new Set([...(read.read || []), 'first_eat', 'fight_settings']) };
      const eat = say(fixed);
      const food = T.slots.findIndex((s) => s.type === 'consume' && s.id === 'cooked_shrimp');
      const heal = M.consumables.CONSUMABLES.cooked_shrimp.amount;
      const lost = M.tut.wasteAt(heal, 60, fixed.hpMax);
      const line = wasteLine({ kind: 'food', amount: heal }, 60, fixed.hpMax);
      if (lost > 0 ? !line.includes(lost + ' of ' + heal + ' wasted') : line !== '') return set + ': the coach\'s waste (' + lost + ') is not Configure action\'s: "' + line + '"';
      /* where it says to stop: Configure action's 5% steps down from 60 until nothing is wasted, never under 50% */
      let stop = 60;
      while (stop - 5 >= 50 && M.tut.wasteAt(heal, stop, fixed.hpMax) > 0) stop -= 5;
      /* ONE VISIT SETS BOTH (the playthrough audit 2026-11-15, F4): the card that lowers the own food names the store food slot and the same line,
         so its advice does not make the "Own food first" card; a bar with no store food above the new line is told nothing more */
      const storeSlot = T.slots.findIndex((x) => x.type === 'consume' && x.id === 'salted_shrimp');
      const bothSlots = stop < 60 && storeSlot >= 0;
      const eatWant = bothSlots ? 'Press slot ' + (food + 1) + ' and slot ' + (storeSlot + 1) + ', set both to ' + stop + '% HP'
        : lost > 0 ? 'Press slot ' + (food + 1) + ' and set it to ' + stop + '% HP' : 'Press slot ' + (food + 1) + ' and set its HP with − or +';
      if (!eat || eat.id !== 'food_when' || eat.barSlot !== food || eat.text !== eatWant || (lost > 0 && eat.goal !== stop)) return set + ': the eat card reads ' + JSON.stringify(eat && [eat.text, eat.goal]) + ', wanted ' + JSON.stringify(eatWant);
      const noStore = say({ ...fixed, slots: fixed.slots.filter((x) => x.id !== 'salted_shrimp') });
      if (noStore && noStore.id === 'food_when' && noStore.text.includes('set both')) return set + ': with no store food on the bar the eat card still names one: ' + noStore.text;
      /* REGRESSION ("Tell your hero when" never showed, PRIORITY_BOARD 2026-10-25 #2): any Save restates the whole bar, so the
         kit's own 60% food slot comes back STORED; that is not the player choosing when to eat. */
      const kitStored = { ...fixed, stored: T.slots.map((s) => ({ type: s.type, id: s.id, conditions: s.conditions })) };
      if ((say(kitStored) || {}).id !== 'food_when') return set + ': a Save that restates the kit\'s bar (food still at 60%) finished "Eat on time": ' + (say(kitStored) || {}).id;
      /* the player sets 45%: the stored bar and the shown bar both say so */
      const at = (pct) => (s) => (s && s.id === 'cooked_shrimp' ? { ...s, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: pct }] } : s);
      const set45 = { ...fixed, slots: fixed.slots.map(at(45)), stored: kitStored.stored.map(at(45)) };
      const order = say(set45);
      const shop = T.slots.findIndex((s) => s.type === 'consume' && s.id === 'salted_shrimp');
      if (!order || order.id !== 'food_order' || order.barSlot !== shop || order.text !== 'Press slot ' + (shop + 1) + ' and lower it to 45% HP') return set + ': the order card reads ' + JSON.stringify(order && order.text);
      const both = (s) => (s && s.id === 'salted_shrimp' ? { ...s, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 45 }] } : at(45)(s));
      const fixedOrder = { ...set45, slots: fixed.slots.map(both), stored: kitStored.stored.map(both) };
      /* a bar with no rune spell, of a style that has one, is offered it ("A spell costs runes"); Got it moves on */
      const offer = !T.slots.some((s) => s.type === 'ability' && M.abilities.ABILITIES[s.id].rune)
        && Object.values(M.abilities.ABILITIES).some((a) => a.active && a.rune && a.disciplines.includes(T.discipline));
      /* the spell offer and the Help page wait for the Thicket's time (panel 2026-11-01) */
      const inThicket = { ...fixedOrder, huntId: 'meadowbrook_thicket', visited: new Set([...fixedOrder.visited, 'meadowbrook_thicket']) };
      if (['first_spell', 'help_page'].includes((say(fixedOrder) || {}).id)) return set + ': in the first hunt the card is ' + (say(fixedOrder) || {}).id;
      if ((say(inThicket) || {}).id !== (offer ? 'first_spell' : 'help_page')) return set + ': in the Thicket, with the bar set, the card is ' + (say(inThicket) || {}).id;
      if (offer && (say({ ...inThicket, read: new Set([...inThicket.read, 'first_spell']) }) || {}).id !== 'help_page') return set + ': after Got it on the spell offer the card is ' + (say({ ...inThicket, read: new Set([...inThicket.read, 'first_spell']) }) || {}).id;
      /* the store slot moved BEFORE the own food at the same HP: the first slot whose conditions pass fires, so it eats
         first; the card asks to move it after the own slot (lowering it to the same HP would not do) */
      const swapped = fixedOrder.slots.slice();
      [swapped[food], swapped[shop]] = [swapped[shop], swapped[food]];
      const early = say({ ...fixedOrder, slots: swapped });
      if (!early || early.id !== 'food_order' || early.barSlot !== food || early.text !== 'Press slot ' + (food + 1) + ', then Later until after slot ' + (shop + 1)) return set + ': a store slot ahead of the own food reads ' + JSON.stringify(early && early.text);
      /* the own food gone (struck "none left"): the store eating first is the fallback working, not a wrong order */
      if ((say({ ...set45, slots: set45.slots.map((s) => (s && s.id === 'cooked_shrimp' ? { ...s, count: 0 } : s)) }) || {}).id === 'food_order') return set + ': with no own food left the order card still asks';
      /* no food slot on the bar at all (the player emptied it): no card names one (#2: "Press the Cooked Shrimp slot") */
      const bare = { ...fixed, slots: fixed.slots.map((s) => (s && s.type === 'consume' ? null : s)) };
      const b = say(bare);
      if (b && /eat|food|Cooked Shrimp/i.test(b.text) && b.id !== 'earn_the_thicket') return set + ': with no food on the bar the coach still says: ' + b.text;
    }
    /* THROUGH THE REAL ENVELOPE (src/session/tutorial-sections.js): the server's struck state, stored bar and Got it reads */
    const tsb = await imp('src/session/tutorial-sections.js');
    /* the kit's sword-and-shield hero has no struck spell: it reads the bar, then eats on time; a hatchet hero who
       put Rend on Carried runes only, with none, is the struck spell the rune card speaks of */
    const tank = tutKit(M, 'tank');
    const T = carriedOnly(tutKit(M, null, 'practice_hatchets'), ['rend']);
    const env = (stored, usable, K = T, ground = 'mill_cellar') => ({ state: { level_xp: M.xp.charXpForLevel(3) }, level: srvLevel(M, M.xp.charXpForLevel(3)), skills: { farming: { xp: 28, level: 1 } },
      hunt: { session_id: 's', hunt_id: ground, ended: false, session: {}, hero: { hp_max: 170 }, pose: { units: [] } },
      hunt_settings: { preset: 0, role: K.role, discipline: K.discipline, stance: 'balanced', store: K.storeRows,
        slots: K.slots.map((s) => ({ action: { type: s.type, id: s.id }, conditions: s.conditions, join: 'and', usable: usable || s.usable, count: s.count })), bar: stored } });
    const cardOn = (e, sh) => { const c = tsb.pointerCardOf({ read: (k) => e[k], slot: 0 }, sh); return c && c.id; };
    if (tank.slots.some((s) => s.usable === false)) return 'the kit\'s sword-and-shield bar shows a struck slot: ' + tank.slots.filter((s) => s.usable === false).map((s) => s.id).join();
    if (cardOn(env([], false, tank, 'meadowbrook_thicket'), { read: ['bar_intro'] }) !== 'first_spell') return 'through the envelope a tank in the Thicket, the bar read, sees ' + cardOn(env([], false, tank, 'meadowbrook_thicket'), { read: ['bar_intro'] });
    if (cardOn(env([], false, tank), { read: ['bar_intro'] }) === 'first_spell') return 'through the envelope a tank in the Cellar is offered a spell before the Thicket';
    if (cardOn(env([])) !== 'spell_runes') return 'through the envelope (no Got it recorder) a hatchet hero at Level 3 sees ' + cardOn(env([]));
    if (cardOn(env([]), { read: [] }) !== 'bar_intro') return 'through the envelope with a recorder the bar card is not up: ' + cardOn(env([]), { read: [] });
    if (cardOn(env([]), { read: ['bar_intro'] }) !== 'spell_runes') return 'through the envelope, read, the rune card is not up';
    const kitWire = T.slots.map((s) => ({ action: { type: s.type, id: s.id }, conditions: s.conditions, join: 'and' }));
    const fedEnv = { ...env(kitWire, true), hunt_analyzer: { hero: { supplies: { own: { cooked_shrimp: 6 } } } } };
    const fedRead = { read: ['bar_intro', 'first_eat', 'fight_settings'] };
    if (cardOn(fedEnv, fedRead) !== 'food_when') return 'through the envelope, the kit bar restated by a Save finishes "Eat on time": ' + cardOn(fedEnv, fedRead);
    return null;
  },
  'starter-bars': async (M) => {
    /* NO DEAD BUTTON (designer 2026-11-05, lane/d-caster-first-fights). A style's DEFAULT bar is what a hero sees
       until its first Save (after that the bar is the player's): the kit's sword and shield, or a weapon taken up from
       the bag in minute one. Per style: nothing is struck, ever. A weapon hero whose style has a rune spell is offered it
       ("A spell costs runes"), the hammer its Quarry Blow since the spell rule (Tyler 32-5: a rune choice from Level 1); a caster's spells are already on its bar. A player who then
       sets rune spells to Carried runes only, with none, has each explained by "Spells need runes" (that slot, its family's
       store rune at the server's price), one after another, and then the chain goes on to "Eat on time". (Before the
       card: Hunts' Before you go names each one and its fix, alpha-windows AW-27.) */
    const sets = { tank: [M.kit.START_EQUIPMENT.weapon, M.kit.START_EQUIPMENT.shield], sword: ['practice_sword'], hammer: ['practice_club'],
      axes: ['practice_hatchets'], bow: ['practice_bow'], crossbow: ['practice_crossbow'], mage: ['practice_wand', 'practice_spellbook'], healer: ['practice_staff'],
      'mage, Carried runes only': ['practice_wand', 'practice_spellbook', ['frost_lance', 'arcane_barrier']], 'healer, Carried runes only': ['practice_staff', null, ['circle_of_renewal', 'green_sickness']],
      'axes, Carried runes only': ['practice_hatchets', null, ['rend']] };
    /* (the axes carry Rend on theirs since the spell rule, lane/c-spell-rule 2026-11-21, Tyler 32-3; the bow and the crossbow carry Flame Volley on their default set since the balance audit's fix 7, lane/d-audit-fixes-sim 2026-11-19: like a
       caster's, their spell is already on the bar, so nothing is offered) */
    const want = { tank: '-/first_spell', sword: '-/first_spell', hammer: '-/first_spell', axes: '-/-', bow: '-/-', crossbow: '-/-',
      mage: '-/-', healer: '-/-', 'mage, Carried runes only': 'frost_lance+arcane_barrier/-', 'healer, Carried runes only': 'circle_of_renewal+green_sickness/-', 'axes, Carried runes only': 'rend/-' };
    const seen = [];
    for (const [set, [weapon, shield, carriedRunes]] of Object.entries(sets)) {
      const base = tutKit(M, null, weapon, shield);
      const K = carriedRunes ? carriedOnly(base, carriedRunes) : base;
      if (!carriedRunes && K.slots.some((s) => s.usable === false)) return set + ': the default bar holds a struck slot: ' + K.slots.filter((s) => s.usable === false).map((s) => s.id).join();
      const walk = walkChain(M, K);
      const ids = walk.map((s) => s.id);
      const struck = K.slots.map((s, i) => (s.type === 'ability' && s.usable === false ? i : -1)).filter((i) => i >= 0);
      const row = (struck.map((i) => K.slots[i].id).join('+') || '-') + '/' + (ids.includes('first_spell') ? 'first_spell' : '-');
      if (row !== want[set]) return set + ': struck/offer reads ' + row + ', the ruling is ' + want[set];
      /* what the offer says of the spell it names: only what is true of that spell (Rend trains Melee, a Volley's trade holds on free arrows) */
      const offered = walk.find((s) => s.id === 'first_spell');
      if (offered) {
        /* THE SPELL THIS HERO CAN CAST NOW (retention dive 2026-11-20, dead moment E): a fresh hero, alone, at skill level 1, is never
           offered a row locked behind its skill or one that casts only in a party (Frost Slam: Melee 12, party only) */
        const lone = (x) => !x.unlock && !M.abilities.partyOnly(x, K.role);
        const a = Object.values(M.abilities.ABILITIES).find((x) => x.active && x.rune && x.disciplines.includes(K.discipline) && lone(x));
        const named = M.abilities.ABILITIES[/data-id="([a-z_]+)"/.exec(offered.card.hooks.join(' '))[1]];
        if (!named || named.unlock || M.abilities.partyOnly(named, K.role)) return set + ': a lone Level 1 hero is offered ' + (named && named.n) + ', which it cannot cast (unlock ' + (named && named.unlock) + ', party ' + JSON.stringify(named && named.party) + ')';
        /* the same hero in a party with Melee 12 may be offered the party spell its weapon lists first */
        if (set === 'tank') {
          const party = { ...offered.facts, inParty: true, skillXp: { ...offered.facts.skillXp, melee: M.xp.skillXpForLevel('melee', 12) } };
          const pc = M.tut.cardFor(M.tut.currentCard(party), party);
          if (!(pc && pc.id === 'first_spell' && pc.hooks.some((h) => h.includes('data-id="frost_slam"')))) return 'tank: in a party at Melee 12 the offer is ' + JSON.stringify(pc && [pc.id, pc.hooks]) + ', want Frost Slam';
        }
        const st = K.store.find((r) => r.partner === a.rune);
        const offerWant = 'Press ' + M.tut.slotWords([offered.card.barSlot]) + ' → Spells → ' + a.n + ' → ' + M.basics.BASIC_INDEX[st.id].n;
        if (offered.card.text !== offerWant || !offered.card.hooks.some((h) => h.includes('data-id="' + a.id + '"')) || !offered.card.hooks.some((h) => h.includes('data-store="' + st.id + '"'))) return set + ': the offer of ' + a.n + ' reads ' + JSON.stringify([offered.card.text, offered.card.hooks]) + ', wanted ' + JSON.stringify(offerWant);
      }
      if (!struck.length) { if (ids.includes('spell_runes')) return set + ': nothing is struck, yet "Spells need runes" is up'; seen.push(set + ' ' + row); continue; }
      const first = walk.find((s) => s.id === 'spell_runes');
      if (!first) return set + ': a struck slot and no "Spells need runes"';
      /* (a slot fixed here may wait on a count: Why it waits, read, is not what this loop asks of the rune card) */
      let f = { ...first.facts, read: new Set([...first.facts.read, 'why_it_waits']) };
      for (const i of struck) {
        const c = M.tut.currentCard(f), card = c && M.tut.cardFor(c, f);
        const st = K.store.find((r) => r.partner === M.abilities.ABILITIES[K.slots[i].id].rune);
        if (!card || card.id !== 'spell_runes' || card.barSlot !== i || !st || !card.hooks.some((h) => h.includes('data-store="' + st.id + '"'))
          || card.text !== 'Press slot ' + (i + 1) + ', pick ' + M.basics.BASIC_INDEX[st.id].n + ', then Save')
          return set + ': slot ' + (i + 1) + ' (' + K.slots[i].id + ') is struck and the card is ' + JSON.stringify(card && { id: card.id, barSlot: card.barSlot, text: card.text });
        f = { ...f, slots: f.slots.map((s, k) => (k === i ? { ...s, usable: true, store: st.id } : s)) };
      }
      f = { ...f, supplies: [{ item: 'cooked_shrimp', source: 'own', count: 6 }], read: new Set([...f.read, 'first_eat', 'fight_settings']) };
      const next = M.tut.currentCard(f);
      if ((next && next.id) !== 'food_when') return set + ': with every struck slot fixed the chain goes on at ' + (next && next.id) + ', not food_when';
      seen.push(set + ' ' + row);
    }
    console.log('    starter bars (struck/offer): ' + seen.join(' | '));
    return null;
  },
  /* WHY IT WAITS (designer 2026-11-05): the words are the server's slots', on the real default bars, Got it to finish, never asked twice. */
  'why-it-waits': (M) => {
    const up = (T, more) => { const f = tutAt(M, T, 3, { huntId: 'mill_cellar', visited: new Set(['mill_cellar']), skillXp: { farming: 28, cooking: 0, melee: 0 }, landPlanted: true, read: new Set(['bar_intro']), ...more }); return { f, c: M.tut.currentCard(f) }; };
    const mage = tutKit(M, null, 'practice_wand', 'practice_spellbook'), healer = tutKit(M, null, 'practice_staff');
    /* the bow's default set ends with Flame Volley on its own count (2+ in its area) since the balance audit's fix 7 (lane/d-audit-fixes-sim, 2026-11-19),
       so a new bow meets the card on that slot, as a caster does on its first area spell */
    const bowK = tutKit(M, null, 'practice_bow');
    const WORDS = { mage: 'Press slot 1 to change when it fires', healer: 'Press slot 2 to change when it fires',
      bow: 'Press slot ' + (bowK.slots.findIndex((s) => s && s.id === 'flame_volley') + 1) + ' to change when it fires' };
    for (const [set, T] of [['mage', mage], ['healer', healer], ['bow', bowK]]) {
      const { f, c } = up(T);
      const card = c && M.tut.cardFor(c, f);
      if (!card || card.id !== 'why_it_waits' || card.text !== WORDS[set]) return set + ': the card reads ' + JSON.stringify(card && { id: card.id, text: card.text });
      if (!Number.isInteger(card.barSlot) || !T.slots[card.barSlot].conditions.some((k) => k.op === 'gte' && k.value === 2)) return set + ': the ring is on slot ' + card.barSlot;
      const read = up(T, { read: new Set(['bar_intro', 'why_it_waits']) }).c;
      if (read && read.id === 'why_it_waits') return set + ': Got it did not finish the card';
      if (walkChain(M, T).map((x) => x.id).indexOf('why_it_waits') !== walkChain(M, T).map((x) => x.id).indexOf('bar_intro') + 1) return set + ': the card does not follow Your action bar: ' + walkChain(M, T).map((x) => x.id).join(' > ');
    }
    for (const [set, T] of [['tank', tutKit(M, 'tank')], ['axes', tutKit(M, null, 'practice_hatchets')], ['hammer', tutKit(M, null, 'practice_club')]]) {
      if (walkChain(M, T).some((x) => x.id === 'why_it_waits')) return set + ': nothing on its bar waits, yet the card came';
    }
    /* AN AREA MOVE UNDER ITS UNLOCK waits for the level, not its count (v0.2.129: Raking Shot on the Ranger's default bar
       brought the count card to a new bow). At Ranged 10 it is a real count wait and the card names it. */
    const bow = tutKit(M, null, 'practice_bow');
    const at10 = up(bow, { skillXp: { farming: 28, cooking: 0, melee: 0, ranged: M.xp.skillXpForLevel('ranged', 10) } });
    const rk = at10.c && at10.c.id === 'why_it_waits' ? M.tut.cardFor(at10.c, at10.f) : null;
    if (!rk || bow.slots[rk.barSlot].id !== 'raking_shot' || rk.text !== 'Press slot ' + (rk.barSlot + 1) + ' to change when it fires') return 'bow at Ranged 10: the card reads ' + JSON.stringify(rk && [rk.text, rk.barSlot]);
    /* the words stay true of a bar the player changed: runes of their own, no second spell, a bigger number, a struck slot, the slot switched off */
    const say = (T, more) => { const u = up(T, more); return u.c && u.c.id === 'why_it_waits' ? M.tut.cardFor(u.c, u.f).text : null; };
    if (/from the store/.test(say(mage, { carried: { chalked_fire_rune: 30 } }))) return 'with Fire runes of its own the card says ' + say(mage, { carried: { chalked_fire_rune: 30 } });
    const lone = { ...mage, slots: mage.slots.filter((s) => s.id !== 'frost_lance') };
    if (say(lone) !== 'Press slot 1 to change when it fires') return 'with no second spell the card says ' + say(lone);
    const three = { ...mage, slots: mage.slots.map((s) => (s.id === 'fireball' ? { ...s, conditions: [{ metric: 'enemies_in_aoe', op: 'gte', value: 3 }] } : s)) };
    if (say(three) !== 'Press slot 1 to change when it fires') return 'at 3 the card says ' + say(three);
    if (say(carriedOnly(mage, ['fireball']))) return 'a struck slot is said to wait: ' + say(carriedOnly(mage, ['fireball']));
    const off = { ...healer, slots: healer.slots.map((s) => (s.id === 'circle_of_renewal' ? { ...s, enabled: false } : s)) };
    if (say(off)) return 'a slot switched off is said to wait: ' + say(off);
    /* a second hero is not asked */
    const vet = { roster: [{ slot: 0, level: 1, name: 'New', open: true, hunting: false }, { slot: 1, level: M.tut.KNOWN_LEVEL + 1, name: 'Old', open: false, hunting: false }], self: 0 };
    return walkChain(M, mage, vet).some((x) => x.id === 'why_it_waits') ? 'a second hero is asked Why it waits' : null;
  },
  'tutorial-town-chain': async (M) => {
    /* THE FIRST RETURN, then the Thicket: sell what only pays coin (the Shop's own Sell all loot set, from the shell), decide
       once (a loot rule), cook, styles (Got it), Blessings before the wolves (the SERVER's free limit and protection), Tamsin
       (the armor weight for the hero's role), the Thicket, paid (not while hunting another ground), keep this bar. */
    const T = tutKit(M, 'tank');
    const steps = walkChain(M, T);
    const said = (id) => (steps.find((s) => s.id === id) || {}).card;
    const bless = said('bless');
    if (!bless || bless.text !== 'Shop → Services → Bless') return 'the Blessing card reads ' + JSON.stringify(bless && bless.text);
    const tam = said('tamsins_task');
    if (!tam || tam.textIn !== 'Pick heavy armor, then Take Gray Wolves' || tam.text !== 'Open Tamsin\'s tally → Take 200 Gray Wolves') return 'Tamsin\'s card reads ' + JSON.stringify(tam && [tam.text, tam.textIn]);
    /* a card shown from the first kill until Level 2 never names the Level; words inside a window name the server's slot */
    const lv = M.tut.HUNT_TUTORIAL.find((c) => c.id === 'first_level');
    if (!lv || /\bLevel \d/.test(lv.title + ' ' + lv.text)) return 'the first-Level card (shown at Level 1) names a Level: ' + JSON.stringify(lv && lv.title);
    const cook = said('cook_catch');
    if (!cook || cook.textIn !== 'Press Cooking, then Start on Cook Shrimp' || /\{slot:/.test(cook.text + cook.textIn)) return 'the cooking card inside its window reads ' + JSON.stringify(cook && cook.textIn);
    for (const role of ['tank', 'melee_dps', 'ranger', 'mage', 'healer']) {
      const w = M.tut.WEIGHT_FOR_ROLE[role];
      const piece = Object.entries(M.items.ITEMS).find(([, it]) => it.slot === 'helmet' && M.coreModel.ARMOUR_WEIGHT[it.armourClass] === w && it.reqLv <= 5);
      if (!piece || !M.tut.wornByRole(piece[0], role)) return 'Tamsin\'s card advises ' + w + ' for a ' + role + ', which costs its style (' + (piece && piece[0]) + ')';
    }
    const pays = said('tamsin_pays');
    if (!pays || !pays.text.includes(M.tally.tallyTask('thicket_gray_wolves').gold + ' gp from Tamsin')) return 'the paid card reads ' + JSON.stringify(pays && pays.text);
    /* hunting ANOTHER ground (the Glade), the Thicket's payment card is not the one up (#25 of the walk) */
    const held = steps.find((s) => s.id === 'tamsin_pays').facts;
    if ((M.tut.currentCard({ ...held, huntId: 'mosslight_glade' }) || {}).id === 'tamsin_pays') return 'hunting the Glade, the coach still says to hunt the Thicket';
    /* back below it (the Cellar), the card waits too: it is about the Thicket, never shown while hunting elsewhere */
    if ((M.tut.currentCard({ ...held, huntId: 'mill_cellar' }) || {}).id === 'tamsin_pays') return 'hunting the Cellar, the coach still says to hunt the Thicket';
    /* THE COUNT IS THE SERVER'S (audit 2026-11-15 F3: "Hunt the Thicket until your 200 Gray Wolves are down" beside a tally reading 200/200): her row done, the card says what is left (her gold), in the hunt and in town */
    const WOLVES = 'thicket_gray_wolves', RATS = 'cellar_giant_rats';
    const down = { ...held, tally: tallyFact([[WOLVES, 200, true]], [RATS]) };
    for (const [where, facts, next] of [['in the Thicket', { ...down, huntId: 'meadowbrook_thicket' }, 'Leave the hunt and collect 480 gp from Tamsin'], ['in town', { ...down, huntId: null }, "Open Tamsin's tally → collect 480 gp"]]) {
      /* in the Thicket it is the card up; in town another card may lead, so her card's words are read from its own row */
      const step = facts.huntId ? M.tut.currentCard(facts) : M.tut.HUNT_TUTORIAL.find((s) => s.id === 'tamsin_pays'), c = step && Object.assign({ id: step.id }, M.tut.cardFor(step, facts));
      if (!c || c.id !== 'tamsin_pays' || c.text !== next) return 'her wolves counted, ' + where + ' the paid card reads ' + JSON.stringify(c && { id: c.id, text: c.text });
    }
    const left = { ...held, huntId: 'meadowbrook_thicket', tally: tallyFact([[WOLVES, 12]], [RATS]) };
    if (!/^Kill 200 Gray Wolves, then collect 480 gp/.test((M.tut.currentCard(left) && M.tut.cardFor(M.tut.currentCard(left), left).text) || '')) return 'CONTROL: with wolves left the paid card does not say to hunt on';
    /* Cash in tells the truth: loot is in the bag as it drops (the old card said it goes there when you leave) */
    const cash = said('leave_cellar');
    if (!cash || cash.text !== 'Leave the hunt to go back to town') return 'the Cash in card reads ' + JSON.stringify(cash && cash.text);
    /* in a party a leaver takes the others home (Tyler 10-22; party panel 11-03: the card did not say so on a member's screen) */
    const cashRow = M.tut.HUNT_TUTORIAL.find((c) => c.id === 'leave_cellar');
    const inParty = M.tut.cardFor(cashRow, { charLevel: 5, inParty: true }), alone = M.tut.cardFor(cashRow, { charLevel: 5, inParty: false });
    if (inParty.text !== 'Tell your party, then leave the hunt' || /party/.test(alone.text)) return 'the Cash in card reads ' + JSON.stringify([inParty.text, alone.text]);
    /* the card stays up while the hero levels on: it names the goal reached, never a Level that goes stale */
    const later = M.tut.cardFor(cashRow, { charLevel: 6, inParty: false });
    if (/Level \d/.test(later.text)) return 'Cash in on a Level 6 hero reads ' + JSON.stringify(later.text);
    /* back in town from the Thicket with loot to sell, Sell does not come back; Decide once and Cook come now, not on the first return */
    const back = { ...steps.find((s) => s.id === 'loot_rules').facts, sellable: 6 };
    if ((M.tut.currentCard(back) || {}).id !== 'loot_rules') return 'back from the Thicket with no plan yet the coach says ' + (M.tut.currentCard(back) || {}).id;
    const said1 = M.tut.cardFor(M.tut.currentCard(back), back);
    if (!/one item/.test(said1.textIn || '') || /each item/.test(said1.text + ' ' + said1.textIn)) return 'Decide once asks for more than one plan: ' + JSON.stringify([said1.text, said1.textIn]);
    const firstBack = steps.findIndex((s) => s.id === 'into_the_thicket');
    const beforeHunt2 = steps.slice(0, firstBack + 1).map((s) => s.id);
    for (const later of ['loot_rules', 'cook_catch', 'first_spell', 'help_page', 'no_defense']) if (beforeHunt2.includes(later)) return later + ' came before the second hunt: ' + beforeHunt2.join(', ');
    /* a hero who skipped ahead of the Thicket still meets them: they ask on being there or past it */
    if ((M.tut.currentCard({ ...back, visited: new Set(['mill_cellar', 'wickstead']) }) || {}).id !== 'loot_rules') return 'a hero past the Thicket never meets Decide once';
    return null;
  },
  'tutorial-reactive': async (M) => {
    /* THE CARDS THAT EXPLAIN WHAT JUST HAPPENED, each on its own server fact, each worded from the server's numbers. A
       reactive card placed before the chain interrupts it while its fact holds; a day-one card waits for the chain. */
    const T = tutKit(M, 'tank');
    const steps = walkChain(M, T);
    const inThicket = { ...steps.find((s) => s.id === 'tamsin_pays').facts, supplies: [] };
    const say = (f) => { const c = M.tut.currentCard(f); return c ? M.tut.cardFor(c, f) : null; };
    const R = (f, ...ids) => ({ ...f, read: new Set([...(inThicket.read || [])].filter((x) => x !== 'first_eat' && x !== 'fight_settings').concat(ids)) });
    const own = (n) => [{ item: 'cooked_shrimp', source: 'own', count: n, gold: 0 }];
    const ate = say(R({ ...inThicket, supplies: own(2), carried: { cooked_shrimp: 18 } }));
    const food = T.slots.findIndex((s) => s.id === 'cooked_shrimp'), shop = T.slots.findIndex((s) => s.id === 'salted_shrimp');
    const ateWant = 'Cook more Cooked Shrimp before it runs out';
    if (!ate || ate.id !== 'first_eat' || ate.text !== ateWant || ate.barSlot !== food || shop < 0) return 'the ate card reads ' + JSON.stringify(ate && ate.text) + ', wanted it to start "' + ateWant + '"';
    if ((say(R({ ...inThicket, supplies: own(2) }, 'first_eat')) || {}).id !== 'tamsin_pays') return 'read, the ate card does not give the chain back';
    const drink = T.slots.findIndex((s) => s.id === 'thin_turnip_juice');
    const drank = say(R({ ...inThicket, supplies: [{ item: 'thin_turnip_juice', source: 'store', count: 1 }] }));
    if (!drank || drank.id !== 'first_drink' || drank.text !== 'Plant turnips to brew your own juice' || drank.barSlot !== drink) return 'the drink card reads ' + JSON.stringify(drank && drank.text);
    const beat = say(R({ ...inThicket, supplies: own(3) }, 'first_eat'));
    if (!beat || beat.id !== 'fight_settings' || beat.text !== 'Set the stance on your bar to Defensive') return 'the stance card reads ' + JSON.stringify(beat && beat.text);
    if ((say(R({ ...inThicket, supplies: own(3), stance: 'defensive' }, 'first_eat')) || {}).id === 'fight_settings') return 'the stance changed, yet the stance card is up';
    /* A BEATING IS A RATE (panel 2026-11-01: "Your hero has eaten 35 times this hunt" over a full-health hero, 8.5 h in, about 4 an hour) */
    const H = 3600000;
    if ((say(R({ ...inThicket, supplies: own(35), huntMs: 8.5 * H }, 'first_eat', 'food_when')) || {}).id === 'fight_settings') return '35 meals in 8.5 h read as a beating';
    if ((say(R({ ...inThicket, supplies: own(3), huntMs: 4 * 60000 }, 'first_eat')) || {}).id !== 'fight_settings') return '3 meals in 4 minutes are not a beating';
    /* BACK FROM AN ABSENCE, the "just now" cards stand aside for that hunt (they speak of what the player did not see) and come back on the next */
    const sid = { sessionId: 's-back' };
    const backNow = (more) => say(R({ ...inThicket, ...sid, back: 's-back', ...more }));
    if ((backNow({ supplies: own(2), carried: { cooked_shrimp: 18 } }) || {}).id === 'first_eat') return 'on a return "Your hero just ate" is up';
    if ((backNow({ supplies: [{ item: 'thin_turnip_juice', source: 'store', count: 1 }] }) || {}).id === 'first_drink') return 'on a return "Your hero just drank" is up';
    if ((say(R({ ...inThicket, ...sid, back: 's-back', supplies: own(3) }, 'first_eat')) || {}).id === 'fight_settings') return 'on a return "Taking a beating?" is up';
    if ((say(R({ ...inThicket, sessionId: 's-next', back: 's-back', supplies: own(2), carried: { cooked_shrimp: 18 } })) || {}).id !== 'first_eat') return 'the next hunt never says "Your hero just ate"';
    /* THE RECRUITS (Tyler RD-Q6 a, 1053-recruits.sql): one hero whose server section says the recruit press is ready */
    const one = { roster: [{ slot: 0, level: 6, name: 'Corliss', open: true, hunting: true }], slotsOwned: 4, playLimit: 4, name: 'Corliss',
      recruits: { ready: true, count: 3, level: 6 } };
    const more = say(R({ ...inThicket, ...one, huntMs: 5 * 60000 }));
    if (!more || more.id !== 'more_heroes' || more.text !== 'All characters → Recruit 3 heroes') return 'the recruits card reads ' + JSON.stringify(more && more.text);
    if ((say(R({ ...inThicket, ...one, recruits: { ready: false, count: 3, level: 1 } })) || {}).id === 'more_heroes') return 'the recruits card came before the press was ready';
    if ((say(R({ ...inThicket, ...one, recruits: null })) || {}).id === 'more_heroes') return 'the recruits card came with no offer from the server';
    /* a card that asks never walls (played 2026-11-01: it sat ahead of the Thicket's lessons in every hunt past 5 minutes) */
    if (!more.gotIt || (say(R({ ...inThicket, ...one, huntMs: 5 * 60000 }, 'more_heroes')) || {}).id === 'more_heroes') return 'Got it does not pass the recruits card';
    if ((say(R({ ...inThicket, ...one, roster: [...one.roster, { slot: 1, level: 6, name: 'Bree', open: false, hunting: false }], huntMs: 6e5 })) || {}).id === 'more_heroes') return 'with 2 heroes the recruits card is still up';
    /* two of the account's heroes in town and no party: hunt together, the other hero's tab */
    const town = steps.find((s) => s.id === 'save_setup').facts;
    const two = { roster: [{ slot: 0, level: 9, name: 'Corliss', open: true, hunting: false }, { slot: 2, level: 1, name: 'Bree', open: true, hunting: false }], slotsOwned: 2, playLimit: 4 };
    const pair = say(R({ ...town, ...two }));
    if (!pair || pair.id !== 'party_own' || pair.text !== 'Right-click Bree\'s tab → Invite to party' || !pair.hooks.includes('.char-tab[data-slot="2"]')) return 'the party card reads ' + JSON.stringify(pair && { text: pair.text, hooks: pair.hooks });
    if ((say(R({ ...town, ...two, partied: true })) || {}).id === 'party_own') return 'a hero who has hunted in a party is asked to make one';
    const up = say(R({ ...town, upgrades: ['bronze_platebody'] }));
    if (!up || up.id !== 'equip_upgrades' || up.text !== 'Bag → Equip upgrades') return 'the upgrade card reads ' + JSON.stringify(up && up.text);
    const full = say(R({ ...town, stacks: 80, bagCap: 100, bankStacks: 0 }));
    if (!full || full.id !== 'storage' || full.text !== 'Deposit stacks in Storage') return 'the storage card reads ' + JSON.stringify(full && full.text);
    if ((say(R({ ...town, stacks: 80, bagCap: 100, bankStacks: 1 })) || {}).id === 'storage') return 'the storage card is up with a stack stored';
    if ((say(R({ ...inThicket, staminaMs: (M.sessions.STAMINA_LOW_MIN - 1) * 60000 })) || {}).id !== 'stamina_low') return 'low stamina in a hunt shows no card';
    /* a death, through the real envelope (death_log + blessings, the death popup's own numbers) */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const tsb = await imp('src/session/tutorial-sections.js');
    const tiers = (held, L) => [{ tier: 1, permille: M.blessings.BLESSING.cutPm, price: M.wage.blessingPrice(L), held }];
    const deathEnv = (L, saved, held) => ({ state: { level_xp: M.xp.charXpForLevel(L) }, level: srvLevel(M, M.xp.charXpForLevel(L)), name: 'Corliss',
      hunt: { session_id: 's', hunt_id: 'mosslight_glade', ended: true, session: { end_reason: 'died' }, hero: {}, pose: { units: [] } },
      death_log: [{ id: 1, at: '2026-10-25T00:30:00Z', hunt: 'mosslight_glade', monster: 'rook_the_poacher', xp: 0, xp_lost: { level: 10 }, saved }],
      blessings: { held: [], permille: 0, free_until: M.blessings.BLESSING.freeUntilLevel, tiers: tiers(held, L) } });
    const died = (e, sh) => { const c = tsb.pointerCardOf({ read: (k) => e[k], slot: 0 }, sh); return c || {}; };
    /* a return, through the real envelope: the open hunt's session against the shell's `back` */
    const hungry = { state: { level_xp: M.xp.charXpForLevel(6) }, level: srvLevel(M, M.xp.charXpForLevel(6)), hunt: { session_id: 's-b', hunt_id: 'meadowbrook_thicket', ended: false, session: {}, hero: {}, pose: { units: [] } },
      hunt_settings: { preset: 0, role: T.role, discipline: T.discipline, stance: T.stance || 'balanced', store: T.storeRows, slots: T.slots.map((s) => ({ action: { type: s.type, id: s.id }, conditions: s.conditions, join: 'and', usable: s.usable, count: s.count })), bar: [] },
      hunt_analyzer: { hero: { supplies: { own: { cooked_shrimp: 2 } } } } };
    const onEnv = (back) => (tsb.pointerCardOf({ read: (k) => hungry[k], slot: 0 }, { read: ['bar_intro', 'plant_land'], back }) || {}).id;
    if (onEnv(null) !== 'first_eat') return 'through the envelope a hero who ate sees ' + onEnv(null);
    if (onEnv('s-b') === 'first_eat') return 'through the envelope a return still says "Your hero just ate"';
    const d1 = died(deathEnv(9, { level: 190 }, false));
    if (d1.id !== 'first_death' || d1.text !== 'Shop → Services → Bless') return 'the death card reads ' + JSON.stringify(d1.text);
    /* its numbers read as the death popup's do (door panel 2026-11-04: "saved 15490 more" under "kept 15,490") */
    if (died(deathEnv(9, { level: 15490 }, false)).id !== 'first_death') return 'a death with a big save is not the death card';
    const d0 = died(deathEnv(9, null, false));
    if (d0.id !== 'first_death' || d0.text !== 'Shop → Services → Bless') return 'the death card with no Blessing reads ' + JSON.stringify(d0.text);
    if (died(deathEnv(9, null, true)).id === 'first_death') return 'blessed again, the death card is still up';
    /* a death its mode took nothing for (the Burning Tower spits you out: QA gate 2026-11-17, "Next: Defeated" and a Bless upsell) is no death card */
    const towerFall = deathEnv(9, null, false);
    towerFall.hunt = { ...towerFall.hunt, hunt_id: 'the_burning_tower' };
    if (died(towerFall).id === 'first_death') return 'a free Tower fall put up the death card';
    /* Level 31, past the guide: the paid Blessings card, the server's prices */
    const paid = died(deathEnv(31, null, false), { read: [] });
    const total = M.wage.blessingPrice(31);
    if (paid.id !== 'bless_paid' || paid.text !== 'Shop → Services → Bless' || !(total > 0)) return 'at Level 31 the Blessing card reads ' + JSON.stringify(paid.text) + ' (' + paid.id + ')';
    /* the day-one cards wait for the chain: Level 9, a task held, in town: Tamsin's card, not the house */
    const homeNext = { owned: false, next: { name: 'Hearthside Homestead', gold: 400, items: [{ id: 'normal_log', qty: 30 }, { id: 'copper_ore', qty: 20 }] } };
    const L9 = (f) => ({ ...f, levelXp: M.xp.charXpForLevel(9), charLevel: 9 });
    if ((say(R(L9({ ...inThicket, huntId: null, home: homeNext, bag: { normal_log: 3 } }), 'loot_rules', 'cook_catch')) || {}).id !== 'tamsin_pays') return 'a day-one card jumped the chain';
    const after = L9({ ...town, presets: 1 });
    /* PLAN L08 (retention R3): the house card waits for the first stamina end, then sets the job: the material still short, as a
       counted job on its node (the Work window's row rings with that count), and the hero waits in town when it is done. */
    const early = say(R({ ...after, home: homeNext, bag: { normal_log: 3 } }));
    if (early && early.id === 'home') return 'the house card spoke before the stamina ran out: ' + JSON.stringify(early.text);
    const home = say(R({ ...after, endReason: 'stamina', home: homeNext, bag: { normal_log: 3 } }));
    if (!home || home.id !== 'home' || home.text !== 'Chop 27 Normal Log while stamina refills' || home.anchor !== 'crafting'
        || !home.ring || home.ring.skill !== 'woodcutting' || home.ring.work !== 'normal_tree' || home.ring.count !== 27) return 'the house card reads ' + JSON.stringify(home && [home.text, home.anchor, home.ring]);
    const juice = say(R({ ...after, home: { owned: true, next: null }, land: { ready: { turnip: 2 } }, bag: {} }));
    if (!juice || juice.id !== 'harvest_juice' || juice.text !== 'Farm → Harvest, then cook Turnip Juice') return 'the juice card reads ' + JSON.stringify(juice && juice.text);
    if (juice.anchor !== 'farm') return 'crops ready and the juice card points at ' + juice.anchor;
    /* Harvested: "Cook your turnips", so the ring goes to the bench's press; it stayed on the Farm, with nothing left to press there (door panel 2026-11-04) */
    const cook = say(R({ ...after, home: { owned: true, next: null }, land: { ready: {} }, bag: { turnip: 3 } }));
    if (!cook || cook.id !== 'harvest_juice' || cook.text !== 'Gathering and crafting → Cooking → ' + M.recipes.ARTISAN_RECIPES.cooking.find((r) => r.id === 'press_turnip_juice').name || cook.anchor !== 'crafting' || !cook.ring || cook.ring.skill !== 'cooking' || cook.ring.work !== 'press_turnip_juice') return 'the harvested juice card points at ' + JSON.stringify(cook && [cook.anchor, cook.ring, cook.text]);
    /* own juice in the bag: asked once a hunt has bought the store's drinks (a Mage's twenty minutes), never for a hero who
       hardly drinks (played 10-31: a sword hero drank one store juice in twelve hours and the card hid What next for days) */
    const storeJuice = (n) => [{ item: 'thin_turnip_juice', source: 'store', count: n }];
    const slotJ = say(R({ ...after, home: { owned: true, next: null }, bag: { turnip_juice: 6 }, carried: { turnip_juice: 6 }, supplies: storeJuice(12) }));
    if (!slotJ || slotJ.id !== 'juice_slot' || slotJ.text !== 'Put Turnip Juice in a slot before slot ' + (drink + 1) || slotJ.barSlot !== drink) return 'the juice slot card reads ' + JSON.stringify(slotJ && slotJ.text);
    for (const sup of [storeJuice(1), null]) {
      const sip = say(R({ ...after, home: { owned: true, next: null }, bag: { turnip_juice: 6 }, carried: { turnip_juice: 6 }, supplies: sup }));
      if (sip && sip.id === 'juice_slot') return 'a hero who bought ' + (sup ? '1 store drink' : 'nothing (in town)') + ' is asked to slot own juice';
    }
    /* the player put Flame Strike on the bar, store rune on (the kit's sword sets hold no rune spell: playtest 2026-10-29 #9) */
    const fs = { type: 'ability', id: 'flame_strike', store: 'plain_fire_rune', conditions: [], enabled: true, usable: true, count: null };
    const runeless0 = after.slots.filter((s) => !(s && s.type === 'ability' && M.abilities.ABILITIES[s.id] && M.abilities.ABILITIES[s.id].rune));
    const juiced = { ...after, home: { owned: true, next: null }, bag: { turnip_juice: 6 }, carried: { turnip_juice: 6 }, slots: [...runeless0, fs],
      stored: [...after.stored, { type: 'consume', id: 'turnip_juice', conditions: [] }, { type: 'ability', id: 'flame_strike', conditions: [] }] };
    if ((say(R({ ...juiced, slots: runeless0, endReason: 'stamina' })) || {}).id === 'own_runes') return 'with no rune spell on the bar the coach asks for runes';
    /* PLAN L08: the rune card, a day-one town card, waits for the stamina end too */
    if ((say(R(juiced)) || {}).id === 'own_runes') return 'the rune card spoke before the stamina ran out';
    const runes = say(R({ ...juiced, endReason: 'stamina' }));
    if (!runes || runes.id !== 'own_runes' || runes.text !== 'Mine Rune Essence, then bind runes in Runecrafting') return 'the rune card reads ' + JSON.stringify(runes && runes.text);
    if (say(R({ ...juiced, carried: { ...juiced.carried, chalked_fire_rune: 45 } }))) return 'with own runes the coach still asks: ' + say(R({ ...juiced, carried: { ...juiced.carried, chalked_fire_rune: 45 } })).id;
    /* THE FIRST HOUR (lane/b-first-hour, designer 2026-10-28). The day-one goals open at Level 7, the Thicket's first half hour. */
    /* ...once the stamina has run out (plan L08) */
    const L7 = { ...town, presets: 1, levelXp: M.xp.charXpForLevel(7), charLevel: 7, endReason: 'stamina' };
    if ((say(R({ ...L7, home: homeNext, bag: { normal_log: 3 } })) || {}).id !== 'home') return 'at Level 7 past the chain the house card is not up: ' + (say(R({ ...L7, home: homeNext, bag: { normal_log: 3 } })) || {}).id;
    if ((say(R({ ...L7, levelXp: M.xp.charXpForLevel(6), charLevel: 6, home: homeNext, bag: { normal_log: 3 } })) || {}).id === 'home') return 'the house card came before Level 7';
    /* The Hearth: back from the Cellar with the quarter hour's fuel (forest-cave --play: 9 Bones and 3 Lamp Jelly), the
       card interrupts the chain, names the biggest stack and rings it, then the bag's Burn all; Inner Flame XP ends it. */
    const back = walkChain(M, T).find((s) => s.id === 'sell_loot').facts;
    const fuel = say({ ...back, bag: { ...back.bag, bones: 9, lamp_jelly: 3 }, carried: { ...back.carried, bones: 9, lamp_jelly: 3 } });
    if (!fuel || fuel.id !== 'fuel_hearth' || fuel.text !== 'Bag → Bones → Burn all'
      || !fuel.hooks.includes('[data-hs-win="inventory"]:not(:has(.hw-burying.is-on)) .hw-pocket[data-item="bones"]') || fuel.textIn !== 'Press Bones, then Burn all') return 'the Hearth card reads ' + JSON.stringify(fuel && { id: fuel.id, text: fuel.text, hooks: fuel.hooks, textIn: fuel.textIn });
    /* the biggest first-rung stack is the one named and ringed */
    const jelly = say({ ...back, bag: { ...back.bag, bones: 2, lamp_jelly: 11 }, carried: { ...back.carried, bones: 2, lamp_jelly: 11 } });
    if (!jelly || jelly.text !== 'Bag → Lamp Jelly → Burn all' || !jelly.hooks.some((h) => h.includes('data-item="lamp_jelly"'))) return 'the Hearth card names the smaller stack: ' + JSON.stringify(jelly && jelly.text);
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
    const worn = (equipment) => died({ state: { level_xp: M.xp.charXpForLevel(5) }, level: srvLevel(M, M.xp.charXpForLevel(5)), equipment, hunt: { session_id: 's', hunt_id: 'meadowbrook_thicket', ended: true, session: { end_reason: 'left' }, hero: {}, pose: { units: [] } } }, { read: [] }).id;
    if (worn({ weapon: 'practice_staff' }) !== 'no_defense') return 'through the envelope a staff-only hero in town sees ' + worn({ weapon: 'practice_staff' });
    if (worn({ ...M.kit.START_EQUIPMENT }) === 'no_defense') return 'through the envelope the kit\'s sword and shield hero is told Defense is not training';
    /* The first-hour rung: at the cloak's Level with the pelts, the card rings the recipe; any Crafting XP ends it */
    const cloak = M.items.ITEMS.graypelt_cloak;
    const stitch = (M.recipes.ARTISAN_RECIPES.crafting || []).find((r) => r.output === 'graypelt_cloak');
    if (!cloak || !stitch || !(stitch.req <= 1) || !(cloak.reqLv > 1 && cloak.reqLv < 15)) return 'the first-hour rung is gone (a cloak worn between Level 2 and 14, made at Crafting 1)';
    const atCloak = { ...juiced, carried: { ...juiced.carried, chalked_fire_rune: 45, wolf_pelt: stitch.inputs.wolf_pelt }, levelXp: M.xp.charXpForLevel(cloak.reqLv), charLevel: cloak.reqLv };
    const sc = say(R(atCloak));
    if (!sc || sc.id !== 'stitch_cloak' || sc.text !== 'Gathering and crafting → Crafting → ' + stitch.name || !(stitch.inputs.wolf_pelt > 0) || !(sc.ring && sc.ring.work === stitch.id)) return 'the cloak card reads ' + JSON.stringify(sc && { id: sc.id, text: sc.text, ring: sc.ring });
    if (say(R({ ...atCloak, carried: { ...atCloak.carried, wolf_pelt: stitch.inputs.wolf_pelt - 1 } }))) return 'the cloak card asked with too few pelts';
    if (say(R({ ...atCloak, skillXp: { ...atCloak.skillXp, crafting: 30 } }))) return 'the cloak card is up after a craft';
    /* Klappa's Club (Tyler 2026-11-03): a club hero at its Level hears the whole way; a hero of any other weapon hears nothing; the card stays
       with the hero's hands empty (taken off to reforge, or reforged and not yet worn), and moves to the bag once the club is made */
    const kclub = M.items.ITEMS.klappas_club;
    const reforge = (M.recipes.ARTISAN_RECIPES.smithing || []).find((r) => r.output === 'klappas_club');
    const atClub = { ...atCloak, carried: { ...juiced.carried, chalked_fire_rune: 45 }, levelXp: M.xp.charXpForLevel(kclub.reqLv), charLevel: kclub.reqLv, weapon: 'practice_club' };
    const kc = say(R(atClub));
    if (!kc || kc.id !== 'klappas_club' || kc.text !== 'Gathering and crafting → Smithing → ' + reforge.name
      || !(kc.ring && kc.ring.work === reforge.id) || kc.anchor !== 'crafting') return 'the club card reads ' + JSON.stringify(kc && { id: kc.id, text: kc.text, ring: kc.ring, anchor: kc.anchor });
    if ((say(R({ ...atClub, levelXp: M.xp.charXpForLevel(kclub.reqLv - 1), charLevel: kclub.reqLv - 1 })) || {}).id === 'klappas_club') return 'the club card came before its Level';
    if ((say(R({ ...atClub, weapon: 'practice_sword' })) || {}).id === 'klappas_club') return 'the club card asked a sword hero';
    if ((say(R(atClub, 'klappas_club')) || {}).id === 'klappas_club') return 'the club card is up after its Got it';
    const emptied = { ...atClub, weapon: null, carried: { ...atClub.carried, practice_club: 1 } };
    if ((say(R(emptied)) || {}).id !== 'klappas_club') return 'the club card left when the hero took the club off to reforge it';
    const forged = { ...atClub, weapon: null, carried: { ...atClub.carried, klappas_club: 1 } };
    const kb = say(R(forged));
    if (!kb || kb.id !== 'klappas_club' || kb.anchor !== 'inventory' || !kb.text.includes('Equip') || !kb.hooks.some((h) => h.includes('.hw-pick[data-item="klappas_club"]'))) return 'reforged and empty-handed, the card reads ' + JSON.stringify(kb && { id: kb.id, text: kb.text, anchor: kb.anchor });
    if ((say(R({ ...atClub, weapon: 'klappas_club' })) || {}).id === 'klappas_club') return 'the club card is up with the club in hand';
    if ((say(R({ ...atClub, levelXp: M.xp.charXpForLevel(16), charLevel: 16 })) || {}).id === 'klappas_club') return 'the club card is up past the first day\'s grounds';
    /* What next names the rung and how it is made, for every role, below its Level (the line that said "Level 12: Grayjaw's Ruff") */
    for (const role of ['tank', 'melee_dps', 'ranger', 'mage', 'healer']) {
      const g = whatNext(M.tut.nextGoal({ charLevel: cloak.reqLv - 1, role, skillLevel: 5, defenseXp: 9, land: null, inParty: false }));
      if (!g.includes('Next gear at Level ' + cloak.reqLv + ': ' + cloak.n + ', made in Crafting') || !(stitch.inputs.wolf_pelt > 0)) return role + ': What next reads ' + JSON.stringify(g);
    }
    /* NO BENCH MAKES A WEAPON (Tyler 2026-11-18, lane/d-drop-homes): every role's next tier leads with a drop, so no What next gear line names a bench
       (a Level 12 Ranger read "Longbow, made at Crafting 15" until the recipe was cut). Each role, below tiers 2, 3 and 4. */
    const lines = (L, role) => { const g = M.tut.nextGoal({ charLevel: L, role, skillLevel: L, defenseXp: 9, land: null, inParty: false }); return [g.text, ...g.also]; };
    for (const role of ['tank', 'melee_dps', 'ranger', 'mage', 'healer']) for (const L of [14, 29, 44]) {
      const gear = lines(L, role).filter((x) => /^Next gear at Level /.test(x));
      if (!gear.length || gear.some((x) => /, made (at|in) /.test(x))) return role + ' at Level ' + L + ': What next names a bench for its next weapon: ' + JSON.stringify(gear);
    }
    /* a bench rung above 1 names its level (played 10-31: Level 12, Smithing 1, the shield's line said nothing of 15). No made piece leads a gear
       line since the cut, so the rule is read on a FIXTURE row (the old Longbow recipe, Crafting 15) planted on the live bench list and taken off. */
    const fixture = Object.freeze({ id: 'fixture_string_longbow', name: 'String Longbow', icon: '🏹', inputs: Object.freeze({ oak_plank: 3, silk_thread: 2 }), output: 'longbow', xp: 110, req: 15, ms: 3600 });
    const crafts = M.recipes.ARTISAN_RECIPES.crafting;
    crafts.push(fixture);
    let g12;
    try { g12 = lines(12, 'ranger'); } finally { crafts.splice(crafts.indexOf(fixture), 1); }
    const bowLine = 'Next gear at Level ' + M.items.ITEMS.longbow.reqLv + ': Longbow, made at Crafting ' + fixture.req;
    if (!g12.includes(bowLine)) return 'ranger at Level 12 with a Crafting 15 bow on the bench: What next reads ' + JSON.stringify(g12) + ', wanted ' + JSON.stringify(bowLine);
    /* WHAT THE GOLD IS FOR (panel 2026-11-01: 22,355 gp and "no idea what I'm saving for"), at the server's price */
    const goal = (charLevel, more) => whatNext(M.tut.nextGoal({ charLevel, role: 'tank', skillLevel: charLevel, defenseXp: 9, land: null, inParty: false, ...more }));
    if (!goal(12, { gold: 16000, slotCost: 15000, slotsOwned: 2 }).includes('Buy a third hero slot for 15,000 gp')) return 'at 16,000 gp What next reads ' + goal(12, { gold: 16000, slotCost: 15000, slotsOwned: 2 });
    if (!goal(8, { gold: 8000, slotCost: 15000, slotsOwned: 2 }).includes('Next goal: a third hero slot, 15,000 gp')) return 'at 8,000 gp What next names no price: ' + goal(8, { gold: 8000, slotCost: 15000, slotsOwned: 2 });
    /* THE SHARE AT THE REAL LADDER (lane/c-slots-lower): under half the next hero the house's deed speaks, from half the hero does, and the fourth reads the same way */
    const cottage = { owned: true, next: { name: 'Cottage', gold: 8000, items: [{ id: 'normal_log', qty: 40 }] } };
    const under = goal(8, { gold: 12499, slotCost: 25000, slotsOwned: 2, home: cottage }), half = goal(8, { gold: 12500, slotCost: 25000, slotsOwned: 2, home: cottage });
    if (!under.includes('Buy the Cottage in the House') || /hero slot,/.test(under)) return 'at 12,499 gp of a 25,000 gp hero What next reads ' + under;
    if (!half.includes('Next goal: a third hero slot, 25,000 gp') || half.includes('Buy the Cottage')) return 'at 12,500 gp of a 25,000 gp hero What next reads ' + half;
    if (/hero slot,/.test(goal(20, { gold: 37499, slotCost: 75000, slotsOwned: 3 }))) return 'the fourth hero speaks under half its price';
    if (!goal(20, { gold: 37500, slotCost: 75000, slotsOwned: 3 }).includes('Next goal: a fourth hero slot, 75,000 gp')) return 'at 37,500 gp the fourth hero reads ' + goal(20, { gold: 37500, slotCost: 75000, slotsOwned: 3 });
    if (/hero slot/.test(goal(12, { gold: 16000, slotCost: null, slotsOwned: 5 }))) return 'with no slot for sale What next offers one';
    if (/hero slot,/.test(goal(5, { gold: 400, slotCost: 15000, slotsOwned: 2 }))) return 'at 400 gp the third hero is held up as a goal';
    if (!goal(20, { gold: 45000, slotCost: 40000, slotsOwned: 3 }).includes('Buy a fourth hero slot for 40,000 gp')) return 'the fourth hero reads ' + goal(20, { gold: 45000, slotCost: 40000, slotsOwned: 3 });
    /* a deed the purse covers, once no hero is for sale; its materials are said, never hidden behind a price */
    const deed = goal(30, { gold: 9000, slotCost: null, slotsOwned: 5, home: { owned: true, next: { name: 'Cottage', gold: 8000, items: [{ id: 'normal_log', qty: 40 }] } } });
    if (!deed.includes('Buy the Cottage in the House')) return 'the house line reads ' + deed;
    /* the Weighhouse by its own gate, Leaderboards from the Level the gear runs thin: one read each, the icon ringed, after the chain */
    const chainDone = walkChain(M, T).pop().facts;
    const atL = (n, ...read) => ({ ...chainDone, levelXp: M.xp.charXpForLevel(n), charLevel: n, read: new Set([...chainDone.read, ...read]) });
    if ((say(atL(M.tut.WEIGHHOUSE_LEVEL - 1)) || {}).id === 'weighhouse') return 'the Weighhouse card came below its Level';
    const wh = say(atL(M.tut.WEIGHHOUSE_LEVEL));
    if (!wh || wh.id !== 'weighhouse' || !wh.gotIt || M.tut.coachIcon(wh, () => false) !== 'market') return 'at its Level the Weighhouse card reads ' + JSON.stringify(wh);
    if ((say(atL(M.tut.WEIGHHOUSE_LEVEL, 'weighhouse')) || {}).id === 'weighhouse') return 'Got it does not pass the Weighhouse card';
    /* A CRAFTER IS TOLD TOO (11-05: the card waited for Level 10 while hr_market_eligible also opens at a bench skill of 30): below the Level, the best
       bench skill at its level puts the card up; one under, or a bench the server never sent, does not. Through the envelope, the bench is the catalogue's
       artisan rows at the server's levels: a gathering skill at 60 opens nothing. */
    const bench = (lv) => (say({ ...atL(M.tut.WEIGHHOUSE_LEVEL - 1), benchLevel: lv }) || {}).id;
    if (bench(M.tut.WEIGHHOUSE_BENCH) !== 'weighhouse') return 'a bench skill at ' + M.tut.WEIGHHOUSE_BENCH + ' below Level ' + M.tut.WEIGHHOUSE_LEVEL + ' meets ' + bench(M.tut.WEIGHHOUSE_BENCH) + ', not the Weighhouse card';
    if (bench(M.tut.WEIGHHOUSE_BENCH - 1) === 'weighhouse' || bench(null) === 'weighhouse') return 'the Weighhouse card came below its bench level, or on a bench the server never sent';
    const benchOf = (skills) => tsb.tutorialFactsOf({ read: (k) => ({ state: { level_xp: M.xp.charXpForLevel(3) }, level: srvLevel(M, M.xp.charXpForLevel(3)), skills })[k], slot: 0 }).benchLevel;
    const sk = (id, level) => ({ [id]: { xp: 1, level } });
    if (benchOf({ ...sk('smithing', 31), ...sk('cooking', 4), ...sk('mining', 60) }) !== 31 || benchOf(sk('mining', 60)) !== null || benchOf(undefined) !== null) return 'through the envelope the bench reads ' + JSON.stringify([benchOf({ ...sk('smithing', 31), ...sk('mining', 60) }), benchOf(sk('mining', 60)), benchOf(undefined)]);
    const benchGate = readFileSync(join(M.root, 'supabase/migrations/2027-03-03-market-bench-gate.sql'), 'utf8');
    if (!benchGate.includes('min_skill_level int not null default ' + M.tut.WEIGHHOUSE_BENCH)) return 'the Weighhouse card opens at a bench of ' + M.tut.WEIGHHOUSE_BENCH + ', and its migration does not';
    if ((say(atL(M.tut.ROLL_LEVEL - 1, 'weighhouse')) || {}).id === 'roll_of_honor') return 'the Leaderboards card came below its Level';
    const roll = say(atL(M.tut.ROLL_LEVEL, 'weighhouse'));
    if (!roll || roll.id !== 'roll_of_honor' || roll.title !== 'Leaderboards' || M.tut.coachIcon(roll, () => false) !== 'honor') return 'the Leaderboards card reads ' + JSON.stringify(roll);
    /* THE BURNING TOWER (QA gate 2026-11-17: only a click on the Hearth opened it): one card at its Level while the server sends the Tower's
       section, its way the Town menu's line; never with the switch off, below its Level, once read, or once the record holds a floor */
    const atTower = (n, best, ...read) => ({ ...atL(n, 'weighhouse', 'roll_of_honor', ...read), towerBest: best });
    const tc = say(atTower(M.tut.TOWER_LEVEL, 0));
    if (!tc || tc.id !== 'burning_tower' || tc.title !== 'The Burning Tower' || tc.text !== 'Town → Burning Tower → Enter' || !tc.gotIt || M.tut.coachIcon(tc, () => false) !== 'tower')
      return 'at its Level the Tower card reads ' + JSON.stringify(tc && { id: tc.id, title: tc.title, text: tc.text });
    if ((say(atTower(M.tut.TOWER_LEVEL - 1, 0)) || {}).id === 'burning_tower') return 'the Tower card came below its Level';
    if ((say(atTower(M.tut.TOWER_LEVEL, null)) || {}).id === 'burning_tower') return 'the Tower card came with the Tower switched off';
    if ((say(atTower(M.tut.TOWER_LEVEL, 12)) || {}).id === 'burning_tower') return 'the Tower card came to a hero with a floor on its record';
    if ((say(atTower(M.tut.TOWER_LEVEL, 0, 'burning_tower')) || {}).id === 'burning_tower') return 'Got it does not pass the Tower card';
    /* through the envelope: the section's best floor while the server sends it, none without it */
    const towerSec = { hunt: 'the_burning_tower', rules: { room_size: 5, landing_every: 10, floor_limit_ms: 180000, landing_limit_ms: 600000, floor_top: 300 }, best_floor: 0, checkpoints: [0] };
    const towerOf = (sec) => tsb.tutorialFactsOf({ read: (k) => ({ state: { level_xp: M.xp.charXpForLevel(10) }, level: srvLevel(M, M.xp.charXpForLevel(10)), tower: sec })[k], slot: 0 }).towerBest;
    if (towerOf(towerSec) !== 0 || towerOf({ ...towerSec, best_floor: 23 }) !== 23 || towerOf(undefined) !== null) return 'through the envelope the Tower reads ' + JSON.stringify([towerOf(towerSec), towerOf(undefined)]);
    /* WHAT GOLD BUYS (blind panel 11-03, 15k and "nothing says what's next"): once the purse can pay for the next hero, one read naming what exists at the server's prices, ahead of the House's own card; the House opens from it */
    const DEED = { name: 'Hearthside Homestead', gold: 400, items: [{ id: 'copper_ore', qty: 20 }, { id: 'normal_log', qty: 30 }] };
    const CHEST = { name: 'Millrace Crate', gold: 1500, items: [{ id: 'normal_log', qty: 40 }] };
    const rich = (lv, gold, more, ...read) => ({ ...atL(lv, 'weighhouse', 'roll_of_honor', 'pull_goal', ...read), gold, slotCost: 15000, slotsOwned: 2, home: { owned: false, next: DEED }, chest: CHEST, ...more });
    const purse = say(rich(M.tut.ROLL_LEVEL, 15000));
    if (!purse || purse.id !== 'purse_goal' || purse.text !== 'Buy a House deed' || !purse.gotIt || M.tut.coachWindow(purse) !== 'house') return 'with 15,000 gp the card reads ' + JSON.stringify(purse);
    /* The hero is a saving goal now (lane/c-gold-matters): the card comes at the What next line's share of its price (a half) and says what is short, never "enough". */
    if ((say(rich(M.tut.ROLL_LEVEL, 7499)) || {}).id === 'purse_goal') return 'the gold card came before the purse is a start on the next hero';
    const saving = say(rich(M.tut.ROLL_LEVEL, 7500));
    if (!saving || saving.id !== 'purse_goal' || saving.text !== 'Buy a House deed') return 'saving for a hero the gold card reads ' + JSON.stringify(saving && saving.text);
    if ((say(rich(M.tut.ROLL_LEVEL, 15000, {}, 'purse_goal')) || {}).id === 'purse_goal') return 'Got it does not pass the gold card';
    if ((say(rich(M.tut.ROLL_LEVEL, 99999, { slotCost: null, slotsOwned: 5 })) || {}).id === 'purse_goal') return 'with no hero on offer the gold card still offers one';
    if ((say(rich(M.tut.ROLL_LEVEL, 15000, { huntId: 'mosslight_glade' })) || {}).id === 'purse_goal') return 'the gold card came up in a hunt';
    if ((say(rich(10, 15000)) || {}).id !== 'purse_goal') return 'at Level 10 with 15,000 gp the House\'s own card stands ahead of the gold card: ' + (say(rich(10, 15000)) || {}).id;
    if ((say(rich(10, 15000, {}, 'purse_goal')) || {}).id !== 'home') return 'past the gold card at Level 10 the card is ' + (say(rich(10, 15000, {}, 'purse_goal')) || {}).id;
    /* KLAPPA'S CLUB, THEN GOLD (walk-through 11-03: a club hero at Level 5 with the next hero's price): one card at a time, the club's first, and the gold waits while its hands are empty
       mid-job; a sword hero goes straight to the gold; a second hero keeps the club, its own state, and skips the gold, a read another hero has had */
    const clubRich = { ...atClub, gold: 15000, slotCost: 15000, slotsOwned: 2, home: { owned: false, next: DEED }, chest: CHEST };
    if ((say(R(clubRich)) || {}).id !== 'klappas_club') return 'a rich club hero at Level 5 meets ' + (say(R(clubRich)) || {}).id + ' before the club';
    if ((say(R({ ...clubRich, weapon: null, carried: { ...clubRich.carried, klappas_club: 1 } })) || {}).id !== 'klappas_club') return 'the gold card cut in with the hero\'s hands empty mid-reforge';
    if ((say(R(clubRich, 'klappas_club')) || {}).id !== 'purse_goal') return 'past the club a rich hero meets ' + (say(R(clubRich, 'klappas_club')) || {}).id;
    if ((say(R({ ...clubRich, weapon: 'klappas_club' })) || {}).id !== 'purse_goal') return 'with the club worn a rich hero meets ' + (say(R({ ...clubRich, weapon: 'klappas_club' })) || {}).id;
    if ((say(R({ ...clubRich, weapon: 'practice_sword' })) || {}).id !== 'purse_goal') return 'a rich sword hero meets ' + (say(R({ ...clubRich, weapon: 'practice_sword' })) || {}).id;
    const vetClub = { ...clubRich, roster: [{ slot: 0, level: kclub.reqLv, name: 'New', open: true, hunting: false }, { slot: 1, level: M.tut.KNOWN_LEVEL + 1, name: 'Old', open: false, hunting: false }], self: 0 };
    if ((say(R(vetClub)) || {}).id !== 'klappas_club') return 'a second hero with the club meets ' + (say(R(vetClub)) || {}).id;
    if ((say(R(vetClub, 'klappas_club')) || {}).id === 'purse_goal') return 'a second hero is told what gold buys again';
    /* A CARD THAT ASKS NEVER WALLS: Hunt together (optimizer panel 11-03: "Next: Hunt together" for two days over a woodcutting alt) finishes on its Got it, and what is behind it comes */
    const walled = { ...rich(M.tut.ROLL_LEVEL, 15000), roster: [{ slot: 0, level: 16, name: 'A', open: true, hunting: false }, { slot: 1, level: 1, name: 'Bree', open: true, hunting: false }], self: 0 };
    if ((say(walled) || {}).id !== 'party_own') return 'the Hunt together setup put up ' + (say(walled) || {}).id;
    if ((say({ ...walled, read: new Set([...walled.read, 'party_own']) }) || {}).id !== 'purse_goal') return 'Got it does not pass Hunt together: ' + (say({ ...walled, read: new Set([...walled.read, 'party_own']) }) || {}).id;
    if (say({ ...atL(M.tut.ROLL_LEVEL, 'weighhouse'), huntId: 'mosslight_glade' }) && say({ ...atL(M.tut.ROLL_LEVEL, 'weighhouse'), huntId: 'mosslight_glade' }).id === 'roll_of_honor') return 'the Leaderboards card is up in a hunt';
    const eligibility = readFileSync(join(M.root, 'supabase/migrations/2027-02-13-market-eligibility.sql'), 'utf8');
    if (!eligibility.includes('min_level int not null default ' + M.tut.WEIGHHOUSE_LEVEL)) return 'What next says the Weighhouse opens at Level ' + M.tut.WEIGHHOUSE_LEVEL + ', and its migration does not';
    return null;
  },
  /* "Plant your land" asks for EACH empty plot (playtest 2026-10-29 #12: one plot finished it, a plant pays Farming XP):
     it stays up while an open plot is bare and a seed is held; a full field, no seed, or a harvest's XP finishes it. The
     facts' `empty` is the server's field: open plots (under the cap, not an extra) holding no crop. */
  /* THE FIRST DANGEROUS RUN (lane/a-next-steps; board "2026-11-15 The audit's balance findings" F5: food has no stakes on Normal from Level 1 to 15, and
     Dangerous from Level 5 costs real food and gives more XP): ONE card at Level 8, to a hero the server shows in armor on head and body, naming a ground of
     its range that has the tier (the last one it hunted first), ringing that ground's Dangerous press; never again once read or taken, and "How hard can you
     hunt?" is not said after it. Every fact through the real envelope (equipment, hunt_tier, the hunt's ended tier). */
  'first-dangerous-run': async (M) => {
    const T = tutKit(M, 'tank');
    const chainDone = walkChain(M, T).pop().facts;
    const say = (f) => { const c = M.tut.currentCard(f); return c ? M.tut.cardFor(c, f) : null; };
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const tsb = await imp('src/session/tutorial-sections.js');
    const L = await imp('src/shell/launcher-coach.js');
    const DRESSED = { weapon: 'practice_sword', shield: 'practice_shield', helmet: 'bronze_helm', body: 'bronze_platebody' };
    /* the facts the envelope gives (tutorialFactsOf), over a hero who has walked the chain */
    const envFacts = (o) => tsb.tutorialFactsOf({ read: (k) => ({ state: { level_xp: M.xp.charXpForLevel(o.lv) }, level: srvLevel(M, M.xp.charXpForLevel(o.lv)), equipment: o.eq,
      ...(o.tiers === undefined ? {} : { hunt_tier: o.tiers }),
      ...(o.last ? { hunt: { session_id: 's-1', hunt_id: o.last, ended: true, session: { end_reason: 'stamina', ...(o.lastTier ? { tier: o.lastTier } : {}) }, hero: {}, pose: { units: [] } } } : {}) })[k], slot: 0 });
    const at = (o, ...read) => { const e = envFacts(o); return { ...chainDone, levelXp: e.levelXp, charLevel: e.charLevel, armourWorn: e.armourWorn, tierTaken: e.tierTaken, lastHunt: e.lastHunt,
      huntId: null, visited: new Set([...(chainDone.visited || []), ...(o.last ? [o.last] : [])]), read: new Set([...chainDone.read, 'weighhouse', 'roll_of_honor', ...read]) }; };
    const id = (o, ...read) => (say(at(o, ...read)) || {}).id;
    const base = { lv: 8, eq: DRESSED, tiers: { picks: {}, playing: null } };
    const offer = say(at(base));
    if (!offer || offer.id !== 'first_dangerous' || offer.title !== 'Try Dangerous' || !offer.gotIt
      || offer.text !== 'Hunts → Meadowbrook Thicket → Dangerous → Enter'
      || offer.textIn !== 'Press Meadowbrook Thicket, then Dangerous, then Enter' || M.tut.coachIcon(offer, () => false) !== 'hunts')
      return 'at Level 8 in helm and body the offer reads ' + JSON.stringify(offer && { id: offer.id, title: offer.title, text: offer.text, textIn: offer.textIn });
    /* the ring: the named ground's Dangerous press, unpressed, then its Enter */
    const ring = L.ringPlan(offer, { open: (w) => w === 'hunts' });
    if (!ring[0] || !ring[0].includes('[data-tier="dangerous"][data-hunt="meadowbrook_thicket"][aria-pressed="false"]') || !ring[1].includes('.hw-hunt-enter[data-hunt="meadowbrook_thicket"]')) return 'the offer rings ' + JSON.stringify(ring);
    /* the ground it last hunted, when it has the tier and the Level is in its band */
    if (!(say(at({ ...base, last: 'wickstead' })) || {}).text.includes('→ Wickstead →')) return 'back from Wickstead the offer names ' + JSON.stringify((say(at({ ...base, last: 'wickstead' })) || {}).text);
    if (!(say(at({ ...base, last: 'mill_cellar' })) || {}).text.includes('→ Meadowbrook Thicket →')) return 'back from the Cellar (Normal only) the offer names ' + JSON.stringify((say(at({ ...base, last: 'mill_cellar' })) || {}).text);
    /* the ground just hunted beats the highest one hunted (lane/c-hollow-proofs: back from Wickstead both read Wickstead, so the mutant that
       drops the last hunt escaped once its plant could load): been to Wickstead, back from the Thicket, the offer names the Thicket */
    const backLow = at({ ...base, last: 'meadowbrook_thicket' });
    backLow.visited = new Set([...backLow.visited, 'wickstead']);
    if (!(say(backLow) || {}).text.includes('→ Meadowbrook Thicket →')) return 'back from the Thicket, having hunted Wickstead, the offer names ' + JSON.stringify((say(backLow) || {}).text);
    /* not before its Level, not without armor on head and body, not unknown */
    if (id({ ...base, lv: 7 }) === 'first_dangerous') return 'the offer came at Level 7';
    if (id({ ...base, eq: { weapon: 'practice_sword', shield: 'practice_shield' } }) === 'first_dangerous') return 'the offer came to a hero in the practice kit (22 deaths in 2 h on the board)';
    if (id({ ...base, eq: { ...DRESSED, body: undefined } }) === 'first_dangerous') return 'the offer came with no armor on the body';
    if (id({ ...base, tiers: undefined }) === 'first_dangerous') return 'the offer came with no hunt_tier section (the picker shows no tier)';
    /* never again: read, a pick on any ground, the running hunt's, the last hunt's */
    if (id(base, 'first_dangerous') === 'first_dangerous') return 'Got it does not pass the offer';
    if (id({ ...base, tiers: { picks: { wickstead: 'dangerous' }, playing: null } }) === 'first_dangerous') return 'a Dangerous pick on another ground does not pass the offer';
    if (id({ ...base, tiers: { picks: {}, playing: 'deadly' } }) === 'first_dangerous') return 'a Deadly hunt running does not pass the offer';
    if (id({ ...base, last: 'meadowbrook_thicket', lastTier: 'dangerous' }) === 'first_dangerous') return 'a last hunt on Dangerous does not pass the offer';
    if (id({ ...base, last: 'meadowbrook_thicket', lastTier: 'normal' }) !== 'first_dangerous') return 'a last hunt on Normal passes the offer';
    /* "How hard can you hunt?" is not said after it */
    if (id({ ...base, lv: 10 }, 'first_dangerous') === 'pull_goal') return 'How hard can you hunt? came after the offer was read';
    if (id({ ...base, lv: 10, tiers: { picks: { meadowbrook_thicket: 'dangerous' }, playing: null } }) === 'pull_goal') return 'How hard can you hunt? came to a hero who took Dangerous';
    if (id({ ...base, lv: 10, eq: { weapon: 'practice_sword' } }) !== 'pull_goal') return 'a hero never offered the run lost How hard can you hunt?: ' + id({ ...base, lv: 10, eq: { weapon: 'practice_sword' } });
    /* the Hunts window records a harder pick as the offer's read (so Normal again never brings it back) */
    const hw = readFileSync(join(M.root, 'src/shell/windows/hunts.js'), 'utf8');
    if (!hw.includes('if (r.ok && d.tier !== DEFAULT_TIER) markCoachRead(cs, { id: FIRST_DANGEROUS });')) return 'the Hunts window no longer records a harder pick as the offer read';
    return null;
  },
  'tutorial-plant-every-plot': async (M) => {
    const T = tutKit(M, 'tank');
    /* in town, home from the first hunt (the card waits for town: audit 2026-11-18 A4), the weapon card read */
    const at = (land, more) => M.tut.currentCard(tutAt(M, T, 2, { visited: new Set(['mill_cellar']), read: new Set(['styles']),
      skillXp: { farming: 28, cooking: 0, melee: 0 }, landPlanted: true, land, ...(more || {}) }));
    const id = (land, more) => (at(land, more) || {}).id;
    if (id({ ready: {}, empty: 1 }) !== 'plant_land') return 'one plot planted, one bare, seeds held: the card is ' + id({ ready: {}, empty: 1 });
    /* PLANT YOUR LAND WAITS FOR TOWN AND SAYS WHERE (audit 2026-11-18 A4: two minutes into the first hunt it asked for a seed "in each empty
       plot" with no word on where the land is). In the Cellar it is never the card; in town it names the way, the Town menu's Farm, and rings it. */
    const cellar = (more) => M.tut.currentCard(tutAt(M, T, 2, { huntId: 'mill_cellar', visited: new Set(['mill_cellar']), land: { ready: {}, empty: 2 }, ...(more || {}) }));
    for (const read of [new Set(), new Set(['bar_intro']), new Set(['bar_intro', 'rats_count'])]) {
      if ((cellar({ read }) || {}).id === 'plant_land') return 'two minutes into the first hunt the coach asks for a seed (read: ' + [...read].join(', ') + ')';
    }
    const card = at({ ready: {}, empty: 2 }, { landPlanted: false, skillXp: { farming: 0, cooking: 0, melee: 0 } });
    const said = card ? M.tut.cardFor(card, tutAt(M, T, 2, { visited: new Set(['mill_cellar']) })) : null;
    if (!said || said.id !== 'plant_land' || !/^Town → Farm \(J\) → /.test(said.text)) return 'in town the farm card reads ' + JSON.stringify(said && [said.id, said.text]) + ' (it names the Town menu\'s Farm)';
    if (M.tut.coachIcon(card, () => false) !== 'farm') return 'the farm card does not ring the Farm\'s way with its window shut';
    if (id({ ready: {}, empty: 0 }) === 'plant_land') return 'every open plot planted, yet "Plant your land" is still up';
    if (id({ ready: {}, empty: 1 }, { bag: { ...M.kit.START_INVENTORY, turnip_seed: 0 } }) === 'plant_land') return 'no seed left to plant, yet "Plant your land" is still up';
    if (id({ ready: {}, empty: 2 }, { skillXp: { farming: M.gathering.CROPS.turnip.xp, cooking: 0, melee: 0 } }) === 'plant_land') return 'a harvested field came back bare and walled the chain';
    /* the field not sent (an older server): Farming XP still finishes it, as before */
    if (id(null, { landPlanted: null }) === 'plant_land') return 'with no field section, a hero with Farming XP is asked to plant';
    const tsb = await import(pathToFileURL(join(M.root, 'src/session/tutorial-sections.js')).href + V);
    const env = { state: { level_xp: M.xp.charXpForLevel(2) }, level: srvLevel(M, M.xp.charXpForLevel(2)), inventory: { turnip_seed: 7 },
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
    /* its runes: a hatchet hero who put Rend on Carried runes only, with none, is struck, and a second hero is still told */
    const axes = walkChain(M, carriedOnly(tutKit(M, null, 'practice_hatchets'), ['rend']), vet).map((x) => x.id);
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
    /* (a card that ASKS for a press still asks: Got it is only its way past where a read can be recorded, first-hour play 2026-10-31) */
    const reads = M.tut.HUNT_TUTORIAL.filter((r) => JSON.stringify(r.done).includes('"read"') && !r.done.asks).map((r) => r.id);
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
    const env = (levelXp, hunt, slots) => ({ state: { level_xp: levelXp }, level: srvLevel(M, levelXp),
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
    /* PAST THE THICKET, NO CHAIN CARD (lane/c-hollow-proofs 2026-11-20: in a hunt with no town section every town lesson is passed anyway, so the
       mutant that drops the solo cap escaped once its plant could load): each chain card the walk meets, asked of its own facts at Level L, is passed by */
    for (const s of walkChain(M, tutKit(M, 'tank'))) {
      const c = s.id && M.tut.HUNT_TUTORIAL.find((r) => r.id === s.id);
      if (!c || c.party || (c.reactive && !c.dayOne)) continue;
      const past = M.tut.currentCard({ ...s.facts, charLevel: L, levelXp: M.xp.charXpForLevel(L), skillLevel: L });
      if (past && past.id === c.id) return 'the chain card ' + c.id + ' is asked of a hero at Level ' + L + ', past the Thicket';
    }
    if (next && !html.includes(next.name)) return 'the what-next line does not name ' + next.name + ': ' + html;
    /* THE PARTY PITCH, NOT A PARTY WALL (playtest 2026-10-24): a solo hero hears of the party ground its Level fits and
       how to make a party; a hero in a party does not. The ground is the one the Hunts window's party advice picks (lane/a-party-coach-card): at
       Level 16 it named the Sewer, where a four earns 52.4k a head against the Glade's 93.6k and the window sends that party to the Glade. */
    const pg = M.hl.partyGroundFor(L), pitch = 'Find a party for ' + (pg && M.HUNTS[pg] ? M.HUNTS[pg].name : '(none)');
    if (pitch !== 'Find a party for Mosslight Glade' || !html.includes(pitch) || html.includes('Find a party for The Sewer')) return 'a solo Level ' + L + ' hero hears ' + JSON.stringify(pitch) + ', not the party advice\'s ground: ' + html;
    const partyEnv = { ...sewerEnv, party: { id: '0a47c0de-0000-4000-a000-00000000aa01', members: [{ seat: 0, name: 'Mira' }, { seat: 1, name: 'Tyler' }], self_seat: 0, leader_seat: 0 } };
    const withParty = renderLaunchers({ character: { read: (k) => partyEnv[k] }, glyphs: {}, hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } });
    if (withParty.includes('make a second hero')) return 'a hero in a party is told to make a party: ' + withParty;
    if (!/Next at Melee \d+/.test(html)) return 'the what-next line does not name the sword hero\'s next Melee unlock: ' + html;
    /* Defense at 0 XP (no armour worn: the fresh-hero play, 117 kills) points at the Shop's gloves and belts (designer
       2026-10-22, the outfitter); once Defense has XP the line is gone. */
    const withDef = (xp) => renderLaunchers({ character: { read: (k) => ({ ...sewerEnv, skills: { ...sewerEnv.skills, defense: { xp, level: 1 } } })[k] }, glyphs: {},
      hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } });
    if (!withDef(0).includes('Shop → Buy gloves or a belt')) return 'Defense at 0 XP: the what-next line does not point at the Shop\'s armour: ' + withDef(0);
    if (withDef(40).includes('Shop → Buy gloves or a belt')) return 'Defense training: the what-next line still asks for armour';
    /* A TRAINING SESSION RUNNING (lane/a-training-leftovers: a Melee session at the yard read "Your Defense isn't training"): the line is
       the skill the server's `training` section says is trained, and its hours to the next level; never the armour line. */
    const withTrain = (skill) => renderLaunchers({ character: { read: (k) => ({ ...sewerEnv, skills: { ...sewerEnv.skills, defense: { xp: 0, level: 1 } },
      training: { skills: ['melee', 'ranged', 'magic', 'defense'], max_hours: 12, quotes: [{ skill, level: 20, fee_h: 170, xp_h: 30000, hours_to_next: 2 }],
        run: { skill, where: 'yard', since: '2026-11-15T20:00:00.000Z', fee_h: 170, paid: 170 }, last_stop: null } })[k] }, glyphs: {},
      hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } });
    for (const [skill, word] of [['melee', 'Melee'], ['defense', 'Defense']]) {
      const said = withTrain(skill);
      if (!said.includes('Next: ' + word + ' 21 in about 2 hours') || /Shop → Buy gloves/.test(said)) return 'a ' + word + ' training session: the what-next line does not name the trained skill: ' + said;
    }
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
    if (/Nothing is growing/.test(seen)) return 'a 0-Farming-XP hero on land holding 5 ready turnips is told nothing grows: ' + seen;
    if (!seen.includes('Harvest 5 Turnip plots on the Farm (J)')) return 'ready turnips on the shared land: no harvest line: ' + seen;
    if (!withLand(28, field([])).includes('Plant a seed on the Farm (J)')) return 'empty land, a hero who has farmed: no plant line: ' + withLand(28, field([]));
    if (!withLand(0, field([])).includes('Plant a seed on the Farm (J)')) return 'empty land, a hero who never farmed: no plant line';
    if (withLand(0, field([plot(0, 'turnip', false)])).includes('Farm (J)')) return 'land only growing: the what-next line still names the Farm: ' + withLand(0, field([plot(0, 'turnip', false)]));
    if (withLand(0, null).includes('Farm (J)')) return 'no farm_land from the server yet: the what-next line claims the land';
    const mixed = withLand(0, field([plot(0, 'potato', true), plot(1, 'carrot', true), plot(2, 'carrot', true), plot(3, 'turnip', false)]));
    if (!mixed.includes('Harvest 2 Carrot plots and 1 Potato plot on the Farm (J)')) return 'two ready crops: the harvest line does not name both: ' + mixed;
    if (!withLand(0, field([plot(0, 'wheat', true)])).includes('Harvest 1 Wheat plot on the Farm (J)')) return 'one ready plot: ' + withLand(0, field([plot(0, 'wheat', true)]));
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
    const goal = (charLevel, role) => whatNext(M.tut.nextGoal({ charLevel, role, skillLevel: charLevel, defenseXp: 10, land: null }));
    const tank = goal(12, 'tank');
    /* Wickstead (v0.2.63) makes the Bramble Blade reachable at 15 too, so it may stand between the two: the line names both */
    if (!/Next gear at Level 15: Iron Sword and \d+ more/.test(tank)) return 'a Level-12 tank is not told the Iron Sword at Level 15: ' + tank;
    const mage = goal(12, 'mage');
    /* the third name moved with Wickstead (v0.2.63): its tier-2 gloves are reachable, and the Studded Vambraces carry no magic
       penalty (leather's is round(def x 0.15) = 0 at def 2), so a classless Mage may wear them; the wand and its book lead */
    if (!/Next gear at Level 15: Oak Wand(?: and \d+ more|, made at Crafting \d+)/.test(mage)) return 'a Level-12 Mage is not told the Oak Wand at Level 15: ' + mage;
    if (!/Next at Magic 15: Scored /.test(mage)) return 'the Mage\'s skill line lost its runes (supplies keep their skill): ' + mage;
    let named = 0;
    for (const role of ['tank', 'melee_dps', 'ranger', 'mage', 'healer']) {
      for (let L = 1; L <= 120; L++) {
        const g = M.tut.nextGoal({ charLevel: L, role, skillLevel: L, defenseXp: 10, land: null });
        const text = whatNext(g);
        for (const ln of g ? [g.text, ...(g.also || [])] : []) {
          const m = /^Next (?:gear at Level|at [A-Za-z]+) (\d+): (.+?)(?: and \d+ more)?(?:, made (?:in|at) [A-Za-z]+(?: \d+)?)?$/.exec(ln);
          if (!m) continue;
          const [, lineLv, name] = m;
          {
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
    const { renderLaunchers } = await imp('src/shell/launcher.js'); const { placeCoach } = await imp('src/shell/launcher-coach.js');
    const { residueOf, RESIDUE_FIELDS } = await imp('src/session/residue.js');
    if (!RESIDUE_FIELDS.includes('coach')) return 'the coach fold is not on the residue allowlist';
    const env = (hunt) => ({ state: { level_xp: 0 }, level: srvLevel(M, 0), hunt_settings: { preset: 1, slots: [] },
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
    const FULL = 'Hunts → Mill Cellar → Enter';
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
    if (!folded(marked) || !marked.includes('hs-coach-new') || !marked.includes('Fights on its own')) return 'a new card while folded: no mark, or it opened: ' + marked;
    /* the hunt bar (built once) redraws the coach when the fold or the card changes, and only then */
    let node = null, inserts = 0;
    const attrOf = (h, a) => (new RegExp(a + '="([^"]+)"').exec(h) || [])[1] || null;
    const bar = { querySelector: () => node, insertAdjacentHTML: (pos, h) => { inserts++;
      node = { key: attrOf(h, 'data-coach'), getAttribute: (a) => attrOf(h, a), querySelector: () => null, remove: () => { node = null; } }; } };
    placeCoach(bar, before); placeCoach(bar, before);
    placeCoach(bar, marked);
    if (inserts !== 2 || !node || !/:new$/.test(node.key)) return 'the hunt bar did not redraw the coach on a new card (' + inserts + ' draws, ' + (node && node.key) + ')';
    press(cs, 'coach-open');
    const open = draw(cs);
    if (open.includes('is-min') || open.includes('hs-coach-new') || !open.includes('Let your hero pick and fight each monster')) return 'opened, the coach is not its full text: ' + open;
    press(cs, 'coach-min');
    if (draw(cs).includes('hs-coach-new')) return 'opening did not clear the mark';
    placeCoach(bar, draw(cs));
    if (inserts !== 3 || /:new$/.test(node.key)) return 'the hunt bar kept the stale coach after a fold (' + node.key + ')';
    return null;
  },
  /* THE COACH STANDS ASIDE IN A HUNT (the panel 2026-10-31): open, then its title alone once it has had its time; the player's
     own press on the tab opens it for good; in town it stays open. */
  'coach-rests-in-a-hunt': async (M) => {
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { pointerFor, restsNow, COACH_HUNT_OPEN_MS } = await imp('src/shell/launcher-coach.js');
    let t = 1000;
    const env = { state: { level_xp: M.xp.charXpForLevel(3) }, level: { xp: M.xp.charXpForLevel(3), level: 3, into: 0, need: 1 }, level: srvLevel(M, M.xp.charXpForLevel(3)), hunt_settings: { preset: 1, slots: [] }, hunt: { session_id: 's1', hunt_id: 'mill_cellar', ended: false, session: {}, hero: {}, pose: { units: [] } } };
    const cs = { read: (k) => env[k], record: { residue: {} }, setResidue: (k, v) => { cs.record = { residue: { ...cs.record.residue, [k]: v } }; return true; } };
    const ctx = { character: cs, glyphs: {}, now: () => t, hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } };
    const key = (hunting) => (/data-coach="([a-z0-9_:]+)"/.exec(pointerFor(ctx, hunting)) || [])[1] || null;
    const first = key(true);
    if (!first || first.includes(':')) return 'a new card in a hunt is not open: ' + first;
    t += 60 * 60000;
    if (key(true) !== first + ':min') return 'an hour on, the card under the hunt bar still reads ' + key(true);
    if (key(false) !== first) return 'the town coach folded by itself: ' + key(false);
    cs.setResidue('coach', { seen: first });
    if (key(true) !== first) return 'the player opened it and it folded again: ' + key(true);
    if (!(COACH_HUNT_OPEN_MS >= 10000)) return 'a card has too little time to be read: ' + COACH_HUNT_OPEN_MS;
    /* A title that says nothing alone keeps its words, however long the hunt (newcomer panel 2026-11-01). */
    for (const id of ['first_level', 'leave_cellar']) {
      const c = M.tut.HUNT_TUTORIAL.find((s) => s.id === id);
      /* opened, then an hour on (lane/c-hollow-proofs: asked once, any card reads open, its first look starts its clock, so the mutant that drops
         holdOpen escaped once its plant could load) */
      restsNow(ctx, c);
      t += 60 * 60000;
      if (!c.holdOpen || restsNow(ctx, c)) return 'under the hunt bar ' + id + ' folds to its bare title';
    }
    return null;
  },
  'coach-hold': async (M) => {
    /* The designer's playtest (2026-10-24): "Your hero fights alone" and "That's a level" were never on screen (the
       first kill lands 3 s after Enter, Level 2 inside 34 s). A card the SERVER finishes on its own stays up long
       enough to read; one the server passed while another was being read gets its turn, in order; a card the PLAYER
       finished (Enter) gives way at once; a reload shows the server's card at once. On the display clock (ctx.now). */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { pointerFor, readMs } = await imp('src/shell/launcher-coach.js');
    const card = (id) => M.tut.HUNT_TUTORIAL.find((s) => s.id === id);
    let t = 1000;
    const env = { state: { level_xp: 0 }, level: srvLevel(M, 0), hunt_settings: { preset: 1, slots: [] } };
    const hero = () => ({ read: (k) => env[k] });
    let cs = hero();
    const shown = (c) => (/data-tutorial="([a-z0-9_]+)"/.exec(pointerFor({ character: c || cs, glyphs: {}, now: () => t,
      hud: { isShown: () => false }, wm: { openIds: () => [], rows: () => [], row: () => null } })) || [])[1] || null;
    if (shown() !== 'to_the_cellar') return 'a fresh hero is shown ' + shown();
    /* Enter: the server's first answer already holds the first kill and Level 2 (the card it says is past both) */
    env.hunt = { session_id: 's1', hunt_id: 'mill_cellar', ended: false, session: {}, hero: {}, pose: { units: [] } };
    env.state = { level_xp: M.xp.charXpForLevel(2) }; env.level = srvLevel(M, env.state.level_xp);
    const kill = readMs(card('first_kill')), level = readMs(card('first_level'));
    if (!(kill >= 4000 && level >= 4000)) return 'a card is held under 4 s (' + kill + ', ' + level + ')';
    const seen = [];
    for (const [dt, want] of [[0, 'first_kill'], [kill - 1, 'first_kill'], [1, 'first_level'], [level - 1, 'first_level'], [1, 'earn_the_thicket']]) {
      t += dt;
      seen.push(shown());
      if (seen[seen.length - 1] !== want) return 'after Enter the coach shows ' + seen.join(' > ') + ' (wanted ' + want + ' at that point)';
    }
    if (shown(hero()) !== 'earn_the_thicket') return 'a reload replays a held card';
    /* A PRESS ALWAYS ACTS (2026-11-20, the retention dive's play: Got it on a held "Fights on its own" did nothing for its reading time): Got
       it ends the hold and the next card shows at once, the one the server passed first (Level up), then the chain's. The hide is the visit's. */
    const { actCoach } = await imp('src/shell/launcher-coach.js');
    const { residueOf } = await imp('src/session/residue.js');
    const keep = { hunt: env.hunt, state: env.state, level: env.level };
    const pressing = { read: (k) => env[k], record: { data: {}, residue: residueOf({ coach: { read: [] } }) },
      setResidue(k, v) { this.record = { data: {}, residue: residueOf({ ...this.record.residue, [k]: v }) }; return true; } };
    delete env.hunt; env.state = { level_xp: 0 }; env.level = srvLevel(M, 0);
    if (shown(pressing) !== 'to_the_cellar') return 'before Enter the pressing hero is shown ' + shown(pressing);
    Object.assign(env, keep);
    const ctxOf = () => ({ character: pressing, now: () => t });
    const got = () => actCoach(ctxOf(), null, 'coach-got', { type: 'click', target: null });
    const walked = [shown(pressing)];
    for (let i = 0; i < 2; i++) { got(); walked.push(shown(pressing)); }
    if (walked.join(' > ') !== 'first_kill > first_level > earn_the_thicket') return 'Got it on held cards, at once, walks ' + walked.join(' > ') + ' (want first_kill > first_level > earn_the_thicket)';
    /* Eat on time, then the player's own Save: the card gives way at once (a long-read card is never held over it) */
    t += 600000;
    const food = (pct) => ({ action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: pct }], join: 'and' });
    env.hunt_settings = { preset: 1, slots: [food(60)], bar: [] };
    env.hunt_analyzer = { hero: { supplies: { own: { cooked_shrimp: 6 } } } };
    if (shown() !== 'food_when') return 'with the kit\'s food slot on the bar the coach shows ' + shown();
    env.hunt_settings = { preset: 1, slots: [food(50)], bar: [food(50)] };
    if (shown() !== 'earn_the_thicket') return 'a saved bar is held over: ' + shown();
    /* Cash in: the player's own press, the same */
    env.state = { level_xp: M.xp.charXpForLevel(M.HUNTS.meadowbrook_thicket.band[0]) }; env.level = srvLevel(M, env.state.level_xp);
    env.hunt = Object.assign({}, env.hunt, { ended: true });
    if (shown() !== 'into_the_thicket') return 'out of the cellar the coach shows ' + shown();
    return null;
  },
  'coach-ring': async (M) => {
    /* Every card rings the real control it names (the Huntera quick start; designer playtest 2026-10-24: no card rang
       anything): the window's icon while it is closed, then the control inside it, deepest first; the bar's food slot
       until its own Configure action is open, then Save. The icon row draws its ring itself, as the last attribute. */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const { renderLaunchers } = await imp('src/shell/launcher.js'); const { ringPlan } = await imp('src/shell/launcher-coach.js');
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
      /* a first Take asks for the weight that suits, so it is rung; the picker only while the Take is off */
      ['tamsins_task', at('tally', { weight: false }), '[data-hs-act="take"][data-task="thicket_gray_wolves"]'],
      ['tamsins_task', at('tally', { weight: true }), '[data-hs-act="take"][data-task="thicket_gray_wolves"]'],
    ];
    for (const [id, a, sel] of want) if (!first(id, a).includes(sel)) return id + ' rings ' + JSON.stringify(first(id, a)) + ', wanted ' + sel;
    if (!ringPlan(card('tamsins_task'), at('tally', { weight: false })).some((q) => q.includes('.ht-weights'))) return 'with the Take off and no weight the picker is never rung';
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
    /* "set it to 50% HP": the − stays ringed until the slot reaches the card's goal, then Save (one press at
       55% must not send the player to Save) */
    const goalCard = M.tut.cardFor(card('food_when'), { ...bar, hpMax: 200 });
    if (goalCard.goal !== 50 || goalCard.text !== 'Press slot 3 and set it to 50% HP') return 'Eat on time at 200 HP aims at ' + goalCard.goal + ': ' + goalCard.text;
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
    const env = { state: { level_xp: 0 }, level: srvLevel(M, 0), hunt_settings: { preset: 1, slots: [] } };
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
    const env = (L, hunt, ended, bests, more) => ({ state: { level_xp: M.xp.charXpForLevel(L) }, level: srvLevel(M, M.xp.charXpForLevel(L)),
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
  /* GOT IT NEVER HOLDS THE CHAIN (2026-11-18, lane/a-first-hours played on the local world: "Feed the Hearth" hidden with Got it held every card
     after it, the farm's included, until the hero burned fuel). The class: every card a Got it HIDES (one a server fact finishes, launcher.js
     markCoachHid; a card that teaches is read instead, first-hour-never-walls). At each step of the walked chain, hiding the card up puts up
     exactly the card the chain shows without that card (never nothing, never one further on: no card the player has not seen is passed); the
     reported case, in town at Level 3 with 12 Bones, moves from the Hearth to the farm; and the shell hands the hidden set to the chain. */
  'tutorial-got-it-moves-on': async (M) => {
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const L = await imp('src/shell/launcher-coach.js');
    const { tutorialFactsOf } = await imp('src/session/tutorial-sections.js');
    const { residueOf } = await imp('src/session/residue.js');
    const reads = (d) => d.kind === 'read' || (d.kind === 'any' && d.of.some(reads));
    const id = (c) => (c ? c.id : null);
    let swept = 0;
    for (const role of ['tank', 'mage', 'ranger']) {
      for (const step of walkChain(M, tutKit(M, role))) {
        const c = M.tut.currentCard(step.facts);
        if (!c || c.gotIt || reads(c.done)) continue;
        const without = M.tut.currentCard(step.facts, M.tut.HUNT_TUTORIAL.filter((r) => r.id !== c.id));
        const hidden = M.tut.currentCard({ ...step.facts, hid: new Set([c.id]) });
        if (id(hidden) !== id(without)) return role + ': with "' + c.title + '" hidden the coach is on ' + id(hidden) + ', the chain\'s next is ' + id(without);
        swept++;
      }
    }
    if (swept < 6) return 'the walk met only ' + swept + ' cards a Got it hides: the sweep proves nothing';
    const T = tutKit(M, 'tank');
    const RATS = 'cellar_giant_rats';
    const town = (more) => tutAt(M, T, 3, { visited: new Set(['mill_cellar']), read: new Set(['styles']), bag: { ...M.kit.START_INVENTORY, bones: 12 },
      tally: tallyFact([], [RATS]), land: { ready: {}, empty: 2 }, ...(more || {}) });
    if (id(M.tut.currentCard(town())) !== 'fuel_hearth') return 'in town with 12 Bones the coach is on ' + id(M.tut.currentCard(town())) + ', want Feed the Hearth';
    const after = M.tut.currentCard(town({ hid: new Set(['fuel_hearth']) }));
    if (id(after) !== 'plant_land') return 'Feed the Hearth hidden with Got it, the coach is on ' + id(after) + ', want Plant your land';
    /* the shell's own readers carry the hidden set: residue coach.hid -> coachFactsOf -> the chain's facts */
    const cs = { slot: 0, read: () => undefined, record: { data: {}, residue: residueOf({ coach: { hid: ['fuel_hearth'], hidIn: 'none:town' } }) }, setResidue: () => true };
    const sh = L.coachFactsOf(cs, null);
    if (!(sh.hid instanceof Set) || !sh.hid.has('fuel_hearth')) return 'the shell hands the chain no hidden cards: ' + JSON.stringify(sh.hid && [...sh.hid]);
    /* a hero the facts can read (an empty envelope answers no facts at all, and `f &&` made this line vacuous: lane/c-hollow-proofs found its
       mutant escaping once the plant could load) */
    const f = tutorialFactsOf({ slot: 0, read: (k) => ({ state: { level_xp: M.xp.charXpForLevel(5) }, level: srvLevel(M, M.xp.charXpForLevel(5)) })[k] }, sh);
    if (!f || !(f.hid instanceof Set && f.hid.has('fuel_hearth'))) return 'the coach\'s facts drop the hidden cards: ' + JSON.stringify(f && f.hid && [...f.hid]);
    /* GOT IT MEANS LATER, NOT NEVER (retention dive 2026-11-20, R5: Got it at Level 1 hid "Cash in" and "Into the Thicket" for good): a hide
       holds for the visit it was pressed on. Pressed in hunt s1, it holds in s1; back in town from s1, or in the next hunt, the card shows again. */
    const hunt = (session, ended) => ({ session_id: session, hunt_id: 'mill_cellar', ended, session: {}, hero: {}, pose: { units: [] } });
    let res = residueOf({ coach: { read: ['bar_intro'] } });
    const hero = (h) => ({ slot: 0, read: (k) => (k === 'hunt' ? h : undefined), record: { data: {}, residue: res }, setResidue: (k, v) => { res = residueOf({ ...res, [k]: v }); return true; } });
    if (!L.markCoachHid(hero(hunt('s1', false)), { id: 'leave_cellar' })) return 'Got it on "Cash in" recorded no hide';
    const hidIn = (h) => [...(L.coachFactsOf(hero(h), null).hid || [])].join();
    if (hidIn(hunt('s1', false)) !== 'leave_cellar') return 'in the hunt Got it was pressed in, the hidden cards are ' + JSON.stringify(hidIn(hunt('s1', false)));
    if (hidIn(hunt('s1', true)) !== '') return 'back in town from that hunt "Cash in" is still hidden: ' + JSON.stringify(hidIn(hunt('s1', true)));
    if (hidIn(hunt('s2', false)) !== '') return 'in the next hunt "Cash in" is still hidden: ' + JSON.stringify(hidIn(hunt('s2', false)));
    /* SELL JUNK IS THE SERVER'S TO FINISH: a read (the old Got it) no longer finishes it, so junk on a later return is said again */
    const junk = town({ sellable: 5, bag: { ...M.kit.START_INVENTORY }, read: new Set([...town().read, 'sell_loot']) });
    const up = (fx) => { for (let i = 0; i < 40; i++) { const c = M.tut.currentCard(fx); if (!c || c.id === 'sell_loot') return id(c); fx = { ...fx, hid: new Set([...(fx.hid || []), c.id]) }; } return null; };
    if (up(junk) !== 'sell_loot') return 'with junk in the bag on a later return, Sell junk read once never comes back (the coach walks to ' + up(junk) + ')';
    return null;
  },
  'tutorial-shell-facts': async (M) => {
    /* LANE 2 (board 2026-10-25 §4): THE SHELL'S FACTS make the twelve hidden cards visible. Through the shell's own
       readers (src/shell/launcher.js coachFactsOf over a real envelope and an AccountSession's roster): each card's
       trigger shows it, its ring lands on the real control (ringPlan: the card's hooks, deepest first), and the
       server's next answer (or the Got it press, residue `coach.read`) moves the card on. */
    const imp = (p) => import(pathToFileURL(join(M.root, p)).href + V);
    const L = await imp('src/shell/launcher-coach.js');
    const { residueOf } = await imp('src/session/residue.js');
    const { AccountCoach } = await imp('src/session/account-coach.js');
    const base = JSON.parse(readFileSync(join(M.root, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
    /* a CharacterSession as the shell reads it: its record (data + the allowlisted residue), setResidue, and the ACCOUNT's coach
       (src/session/account-coach.js: what has been read and taught is the account's, 1039), held here with no server */
    const hero = (env, coach, slot = 0) => {
      const cs = { slot, puts: [], read: (k) => cs.record.data[k], record: { data: env, residue: residueOf({ coach: coach || {} }) },
        setResidue(f, v) { cs.puts.push([f, v]); cs.record = { data: cs.record.data, residue: { ...cs.record.residue, ...residueOf({ [f]: v }) } }; return true; },
        accountCoach: new AccountCoach(null, { read: (coach && coach.read) || [] }) };
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

    /* GOT IT: a card that only teaches offers Got it where the press can be recorded; the press adds its id to the ACCOUNT's
       reads (account-coach.js; a fold writes only the hero's display residue); without a recorder there is no button and the card is passed by */
    const sc = M.tut.HUNT_TUTORIAL.find((r) => r.id === 'styles');
    const g = hero(town({ equipment: { ...worn, weapon: M.kit.START_EQUIPMENT.weapon }, inventory: kept, bag_rules: { ...base.bag_rules, loot: { rat_tail: 'sell' } },
      skills: { ...base.skills, farming: { xp: 28, level: 1, frac: 0 }, cooking: { xp: 30, level: 1, frac: 0 } } }), { read: KNOWN.filter((x) => x !== 'styles') });
    if (!L.coachHtml(g, M.tut.cardFor(sc, {})).includes('data-hs-act="coach-got"')) return 'Every weapon is a style has no Got it';
    const noRec = { slot: 0, read: g.read, record: g.record, setResidue: g.setResidue };
    if (L.coachHtml(noRec, M.tut.cardFor(sc, {})).includes('coach-got')) return 'Got it is offered where the press cannot be recorded';
    const gotCtx = { character: g, account: null, wm: { openIds: () => [], isOpen: () => false } };
    const atStyles = L.heldCard(gotCtx);
    if (!atStyles || atStyles.id !== 'styles') return 'after cooking, in town, the coach shows ' + (atStyles && atStyles.id) + ', want "Every weapon is a style"';
    /* the summary's Next is a step, never a tip's title (first-30 play 2026-11-12: "Next: Every weapon is a style") */
    if (L.heldStep(gotCtx) !== null) return 'the summary Next names the tip ' + JSON.stringify(L.heldStep(gotCtx).title);
    if (L.ringPlan(atStyles, at('inventory'))[0] !== '[data-hs-win="inventory"] .hw-slot[data-slot="weapon"]') return 'the styles card rings ' + L.ringPlan(atStyles, at('inventory'))[0];
    /* a press on a box still showing another card finishes nothing: the card it would finish was never read (a skipped step, QA 2026-11-04) */
    L.actCoach(gotCtx, null, 'coach-got', { type: 'click', target: { closest: () => ({ getAttribute: () => 'plant_land' }) } });
    if (g.accountCoach.read.has('styles') || g.puts.some(([f]) => f === 'coach')) return 'a Got it drawn on another card finished the held one: ' + JSON.stringify(g.puts);
    L.actCoach(gotCtx, null, 'coach-got', { type: 'click', target: { closest: () => ({ getAttribute: () => 'styles' }) } });
    if (!g.accountCoach.read.has('styles')) return 'Got it read ' + JSON.stringify([...g.accountCoach.read]) + ', want the account\'s reads to hold styles';
    if ((L.heldCard(gotCtx) || {}).id === 'styles') return 'after Got it the styles card is still up';
    const fold = hero(town(), { read: ['bar_intro', 'styles'] });
    const fc = { character: fold, account: null, wm: { openIds: () => [], isOpen: () => false } };
    if (L.heldCard(fc)) {
      L.actCoach(fc, { ownerDocument: null, contains: () => false }, 'coach-min', { type: 'click' });
      const p = fold.puts.find(([f]) => f === 'coach');
      if (!p || p[1].min !== true || 'read' in p[1] || !fold.accountCoach.read.has('styles')) return 'folding the coach wrote ' + JSON.stringify(p) + ' (a fold is the hero\'s, the reads the account\'s)';
    }
    if ('read' in residueOf({ coach: { read: ['c0'], min: true } }).coach) return 'the hero\'s residue still carries the coach\'s reads';

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

    /* D4 THE RECRUITS (Tyler RD-Q6 a, 1053-recruits.sql): one hero in the Thicket whose server section says the recruit press is ready:
       All characters, then its one press, ringed; a press not ready yet, or no section, is no card; a second hero finishes it */
    const thicket = (sessionMs, ready) => Object.assign(JSON.parse(JSON.stringify(base)), {
      state: { active_kind: 'combat', active_id: 'meadowbrook_thicket', gold: 5200, level_xp: M.xp.charXpForLevel(6) },
      hunt: { ...base.hunt, hunt_id: 'meadowbrook_thicket', ended: false },
      hunt_analyzer: { ...base.hunt_analyzer, hunt_ms: sessionMs, hero: { ...base.hunt_analyzer.hero, supplies: [] } },
      hunt_settings: { ...base.hunt_settings, slots: [], bar: [] }, equipment: worn, inventory: kept, skills: { ...base.skills, farming: { xp: 28, level: 1, frac: 0 } },
      recruits: ready === undefined ? null : { ready, at: 5, level: 6, first: 0, slots: [1, 2, 3], sets: ['tank', 'healer', 'ranger'] } });
    const solo = hero(thicket(6 * 60000, true), { read: KNOWN });
    const rows1 = [{ slot: 0, exists: true, level: 6, name: 'Tyler' }, { slot: 1, exists: false }];
    /* the shell's facts count the slots the roster owns, not the heroes in them (the What next line's empty-slot rule reads it) */
    const owned = L.coachFactsOf(solo, acct([solo], rows1, 4));
    if (!owned || owned.slotsOwned !== 2 || !Array.isArray(owned.roster) || owned.roster.length !== 1) return 'the shell\'s facts read ' + JSON.stringify(owned && { slotsOwned: owned.slotsOwned, roster: owned.roster });
    const d4 = card(solo, acct([solo], rows1, 4));
    if (!d4 || d4.id !== 'more_heroes' || d4.text !== 'All characters → Recruit 3 heroes')
      return 'one hero in the Thicket with the recruit press ready, the coach shows ' + JSON.stringify(d4 && [d4.id, d4.text]);
    const d4ring = L.ringPlan(d4, at(null));
    /* the press in All characters, then the strip's All characters (a phone's strip calls it Heroes, UI-10) */
    if (JSON.stringify(d4ring) !== JSON.stringify(['[data-hs-act="recruit-go"]', '.char-tool.is-all'])) return 'the recruits card rings ' + JSON.stringify(d4ring);
    if ((card(hero(thicket(6 * 60000, false), { read: KNOWN }), acct([solo], rows1, 4)) || {}).id === 'more_heroes') return 'the recruits card came before the press was ready';
    if ((card(hero(thicket(6 * 60000), { read: KNOWN }), acct([solo], rows1, 4)) || {}).id === 'more_heroes') return 'the recruits card came with no offer from the server';
    const rows2 = [{ slot: 0, exists: true, level: 6, name: 'Tyler' }, { slot: 1, exists: true, level: 6, name: 'Wren' }];
    if ((card(solo, acct([solo], rows2, 4)) || {}).id === 'more_heroes') return 'a second hero on the roster did not finish the recruits card';

    /* D5 HUNT TOGETHER: two of the account's heroes playing, both in town, no party: the other hero's tab is ringed */
    const a0 = hero(town({ equipment: worn, inventory: kept }), { read: [...KNOWN, 'loot_rules'] });
    const a1 = hero(town({ equipment: worn, inventory: kept, name: 'Wren' }), {}, 1);
    const d5 = card(a0, acct([a0, a1], rows2, 4));
    if (!d5 || d5.id !== 'party_own' || !d5.text.includes('Wren\'s tab')) return 'two heroes in town show ' + JSON.stringify(d5 && [d5.id, d5.text]) + ', want "Hunt together" naming Wren';
    if (L.ringPlan(d5, at(null))[0] !== '.char-tab[data-slot="1"]') return 'Hunt together rings ' + L.ringPlan(d5, at(null))[0];
    const a1h = hero(thicket(60000), {}, 1);
    if ((card(a0, acct([a0, a1h], rows2, 4)) || {}).id === 'party_own') return 'Hunt together is up while the other hero is out hunting';

    /* THE SERVICES TAB (Tyler 2026-10-25): a Blessing card rings the Shop's icon, then its Services tab, then the next Bless */
    const bl = M.tut.cardFor(M.tut.HUNT_TUTORIAL.find((r) => r.id === 'bless'), { blessings: { held: 0, of: 3, freeUntil: 30, best: 750, prices: [0, 0, 0] } });
    if (L.ringPlan(bl, at(null))[0] !== '.hs-launchers [data-hs-open="shop"]') return 'the Blessing card rings ' + L.ringPlan(bl, at(null))[0] + ', want the Shop icon';
    const inShop = L.ringPlan(bl, at('shop'));
    if (!inShop[0].includes('[data-hs-act="bless"]:not([disabled])') || !inShop[1].includes('.hw-tab[data-tab="services"]')) return 'in the Shop the Blessing card rings ' + JSON.stringify(inShop);
    if (M.tut.coachWindow(bl) !== 'shop' || M.tut.coachTab(bl) !== 'services') return 'the Blessing card does not point into the Shop\'s Services tab';
    if (/open Services/.test(bl.text)) return 'the Blessing card still says "open Services": ' + bl.text;
    return null;
  },
};

const mutants = [
  /* THE SPELL OFFER IS ONE THE HERO CAN CAST NOW (retention dive 2026-11-20, dead moment E) */
  { name: 'Try a rune spell offers a spell under its unlock or party only', case: 'starter-bars',
    edits: [['src/data/hunt-tutorial.js', 'x.disciplines.includes(f.discipline) && castsNow(x)) : null;', 'x.disciplines.includes(f.discipline)) : null;']] },
  /* GOT IT MEANS LATER, NOT NEVER (retention dive 2026-11-20, R5) */
  { name: 'a card hidden with Got it stays hidden on every later visit', case: 'tutorial-got-it-moves-on',
    edits: [['src/shell/launcher-coach.js', 'Array.isArray(r.hid) && r.hidIn === visitOf(cs) ? r.hid : []', 'Array.isArray(r.hid) ? r.hid : []']] },
  { name: 'Sell junk read once never comes back', case: 'tutorial-got-it-moves-on',
    edits: [['src/data/hunt-tutorial.js', "'shop', { kind: 'any', of: [{ kind: 'loot_sold' },", "'shop', { kind: 'any', of: [READ, { kind: 'loot_sold' },"]] },
  /* GOT IT NEVER HOLDS THE CHAIN (2026-11-18) */
  { name: 'a card hidden with Got it holds every card after it again', case: 'tutorial-got-it-moves-on',
    edits: [['src/data/hunt-tutorial.js', '    if (facts.hid instanceof Set && facts.hid.has(r.id)) continue;\n', '']] },
  { name: 'the shell hands the chain no hidden cards', case: 'tutorial-got-it-moves-on',
    edits: [['src/shell/launcher-coach.js', '    hid: coachHidOf(cs),\n', '    hid: null,\n']] },
  { name: 'the coach\'s facts drop the hidden cards', case: 'tutorial-got-it-moves-on',
    edits: [['src/session/tutorial-sections.js', "    hid: hid ? new Set(Array.from(hid).filter((id) => typeof id === 'string' && ID.test(id))) : null,\n", '    hid: null,\n']] },
  { name: 'a hidden card passes by the cards after it too', case: 'tutorial-got-it-moves-on',
    edits: [['src/data/hunt-tutorial.js', '    if (facts.hid instanceof Set && facts.hid.has(r.id)) continue;\n', '    if (facts.hid instanceof Set && facts.hid.size && rows.indexOf(r) >= Math.min(...[...facts.hid].map((h) => rows.findIndex((x) => x.id === h)).filter((i) => i >= 0))) continue;\n']] },
  { name: 'the first Dangerous run is offered to a hero in the practice kit', case: 'first-dangerous-run',
    edits: [['src/data/hunt-tutorial.js', "when: [IN_TOWN, { kind: 'level_at', at: DANGER_LEVEL, below: WANT_BELOW }, { kind: 'danger_kit' }] }),", "when: [IN_TOWN, { kind: 'level_at', at: DANGER_LEVEL, below: WANT_BELOW }] }),"]] },
  { name: 'a last hunt on Dangerous does not count as taken', case: 'first-dangerous-run',
    edits: [['src/session/tutorial-sections.js', '|| hard(tiers.playing) || hard(h && h.tier);', '|| hard(tiers.playing);']] },
  { name: 'the first Dangerous run comes back after it is taken', case: 'first-dangerous-run',
    edits: [['src/data/hunt-tutorial.js', "'hunt_picker', orGotIt({ kind: 'tier_taken' }), {", "'hunt_picker', orGotIt(READ), {"]] },
  { name: 'How hard can you hunt? is said again after the offer', case: 'first-dangerous-run',
    edits: [['src/data/hunt-tutorial.js', "{ kind: 'any', of: [READ, { kind: 'card_read', card: FIRST_DANGEROUS }, { kind: 'tier_taken' }] }", 'READ']] },
  { name: 'the offer rings no Dangerous press', case: 'first-dangerous-run',
    edits: [['src/shell/launcher-coach.js', "const tier = g.tier ? [inWin(", "const tier = false ? [inWin("]] },
  { name: 'the offer names the lowest ground, not the one just hunted', case: 'first-dangerous-run',
    edits: [['src/data/hunt-tutorial.js', 'return fits.find((g) => g.hunt === f.lastHunt) || ', 'return ']] },
  { name: 'the Hunts window forgets the offer was taken', case: 'first-dangerous-run',
    edits: [['src/shell/windows/hunts.js', '    if (r.ok && d.tier !== DEFAULT_TIER) markCoachRead(cs, { id: FIRST_DANGEROUS });\n', '']] },
  { name: 'her Cellar task is 120 rats again (27 minutes of a ground the game sends a hero out of at 16)', case: 'tamsin-first',
    edits: [['src/data/tally-tasks.js', "label: 'Giant Rats', count: 25, gold: 25,", "label: 'Giant Rats', count: 120, gold: 100,"]] },
  { name: 'her rats are asked of a hero who has already hunted', case: 'tamsin-first',
    edits: [['src/data/hunt-tutorial.js', "when: [IN_TOWN, { kind: 'unhunted' }], ring: { task: RATS.id }", 'when: [IN_TOWN], ring: { task: RATS.id }']] },
  { name: 'the count done says nothing (Tamsin owes you never shows)', case: 'tamsin-first',
    edits: [['src/data/hunt-tutorial.js', '(ts) => !!ts[p.task] && ts[p.task].done === true),', '() => false),']] },
  { name: 'Out to the brook is back on the first trip, over her running count', case: 'tamsin-first',
    edits: [['src/data/hunt-tutorial.js', '(ts) => !ts[p.task] || ts[p.task].done === true),', '() => true),']] },
  { name: 'Tamsin owes you follows this build\'s count, not the server\'s done', case: 'tamsin-first',
    edits: [['src/data/hunt-tutorial.js', '(ts) => !ts[p.task] || ts[p.task].done === true),', '(ts) => !ts[p.task] || ts[p.task].kills >= RATS.count),']] },
  { name: 'Tamsin owes you chases a hero past the Cellar', case: 'tamsin-first',
    edits: [['src/data/hunt-tutorial.js', "when: [HUNTING, UNDER_THICKET, { kind: 'tally_counted', task: RATS.id }]", "when: [HUNTING, { kind: 'tally_counted', task: RATS.id }]"]] },
  { name: 'Back down rings the Thicket', case: 'tamsin-first',
    edits: [['src/data/hunt-tutorial.js', "'hunt_picker', { kind: 'in_hunt', hunt: CELLAR },", "'hunt_picker', { kind: 'in_hunt', hunt: THICKET },"]] },
  { name: 'Back down sends a Level 5 hero to the Cellar', case: 'tamsin-first',
    edits: [['src/data/hunt-tutorial.js', "when: [IN_TOWN, UNDER_THICKET, { kind: 'tally_paid_for', task: RATS.id }]", "when: [IN_TOWN, { kind: 'tally_paid_for', task: RATS.id }]"]] },
  { name: 'the second trip reads the first trip\'s words (no invitation to close the game)', case: 'tamsin-first',
    edits: [['src/data/hunt-tutorial.js', "FACTS.tally_paid_for({ task: RATS.id }, f) === true ? t('coach.keep_hunting', RATS_WORDS) : BROOK", 'BROOK']] },
  { name: 'her rats count as her wolves (the Thicket\'s task is never asked for)', case: 'tamsin-first',
    edits: [['src/data/hunt-tutorial.js', 'mine.some((id) => taskFloor(id) >= taskFloor(p.task))', 'mine.length > 0']] },
  { name: 'a pay for her rats ends the wait for the wolves\' pay', case: 'tamsin-first',
    edits: [['src/data/hunt-tutorial.js', "(f.tally.paidTasks || []).includes(p.task) || !f.tally.tasks[p.task]", 'f.tally.paid > 0']] },
  { name: 'the coach never sees a held task\'s done', case: 'tamsin-first',
    edits: [['src/session/tutorial-sections.js', '{ kills: h.kills, target: h.target, done: h.done }', '{ kills: h.kills, target: h.target, done: false }']] },
  { name: 'any open window hides the coach again, Chat too', case: 'coach-beside-chat',
    edits: [['src/shell/launcher-coach.js', '  return open.some((id) => !beside.has(id));', '  return true;']] },
  { name: 'Chat is not marked as a window the card stays up beside', case: 'coach-beside-chat',
    edits: [['src/data/shell-windows.js', "object: 'plain', besideCoach: true,", "object: 'plain',"]] },
  { name: 'the card is drawn over every open window', case: 'coach-beside-chat',
    edits: [['src/shell/launcher-coach.js', "  if (!cs || coachCovered(ctx.wm)) return '';", "  if (!cs) return '';"]] },
  { name: 'the what-next line never sees Defense (no armour hint)', case: 'tutorial-launcher-card',
    edits: [['src/session/tutorial-sections.js', 'defenseXp: sk && sk.defense ? sk.defense.xp : null', 'defenseXp: null']] },
  { name: 'the farm line keys off this hero\'s Farming XP again, not the shared land (v0.2.35 "Nothing grows" over ready crops)', case: 'tutorial-launcher-card',
    edits: [['src/session/tutorial-sections.js', 'land: landOf(cs),',
      'land: sk && sk.farming ? { planted: sk.farming.xp > 0 ? 1 : 0, ready: {} } : null,']] },
  { name: 'the what-next line never sees the land (no farm hint)', case: 'tutorial-launcher-card',
    edits: [['src/session/tutorial-sections.js', 'land: landOf(cs),', 'land: null,']] },
  { name: 'ready crops on the land are never named', case: 'tutorial-launcher-card',
    edits: [['src/data/hunt-tutorial.js', '  if (land && land.ready) {', '  if (false) {']] },
  { name: 'the coach stamps the Farm window\'s countdown clock', case: 'tutorial-launcher-card',
    edits: [['src/session/farm-sections.js', '  return parse(read(cs, \'farm_land\'));\n', '  return farmLandOf(cs, 0);\n']] },
  { name: 'nothing to aim at after the guide (no what-next line)', case: 'tutorial-launcher-card',
    edits: [['src/session/tutorial-sections.js', '  if (card) return cardFor(card, f);\n', '  return card && cardFor(card, f);\n']] },
  { name: 'the launcher shows only the first card', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher-coach.js', 'card = pointerCardOf(cs, sh), gone =',
      "card = pointerCardOf(cs, sh) && { id: 'to_the_cellar', title: 'a', text: 'b' }, gone ="]] },
  { name: 'the pointer is drawn over an open window', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher-coach.js', 'coachCovered(ctx.wm)', 'ctx.wm.row(ctx.wm.openIds()[0] || "") && ctx.wm.row(ctx.wm.openIds()[0]).modal']] },
  { name: 'the launcher keeps the pointer in a hunt (over Leave hunt)', case: 'tutorial-launcher-card',
    edits: [['src/shell/launcher.js', "(ctx.hud && ctx.hud.isShown('hunt-topbar') ? '' : pointerFor(ctx))", 'pointerFor(ctx)']] },
  { name: 'the gold card stands ahead of Klappa\'s Club', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "  step('purse_goal', 'Spend your gold',\n    t('coach.purse_goal'),\n    'house', READ, { reactive: true, knowledge: true, gotIt: true, when: [IN_TOWN, { kind: 'purse_saving_hero' }] }),\n", ''], ['src/data/hunt-tutorial.js', "  step('klappas_club', 'Klappa\\'s Klub',\n", "  step('purse_goal', 'Spend your gold',\n    t('coach.purse_goal'),\n    'house', READ, { reactive: true, knowledge: true, gotIt: true, when: [IN_TOWN, { kind: 'purse_saving_hero' }] }),\n" + "  step('klappas_club', 'Klappa\\'s Klub',\n"]] },
  /* QA gate 2026-11-17: a free Tower fall raised "Defeated" and a Bless upsell; the Tower had no tip */
  { name: 'a free-death mode raises the death card', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "f.endReason === 'died' && f.freeDeath !== true,", "f.endReason === 'died',"]] },
  { name: 'the Tower card never comes', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "  tower_open: (p, f) => f.towerBest !== null && f.towerBest !== undefined,", '  tower_open: () => false,']] },
  /* both gates off (lane/c-hollow-proofs 2026-11-20): tower_climbed reads an unknown best floor as unknown and holds the card on its own, so
     tower_open alone was an equivalent mutant, "caught" only by a plant missing src/hunt-view */
  { name: 'the Tower card comes with the switch off', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "  tower_open: (p, f) => f.towerBest !== null && f.towerBest !== undefined,", '  tower_open: () => true,'],
      ['src/data/hunt-tutorial.js', '  tower_climbed: (p, f) => known(f.towerBest, (b) => b > 0),', '  tower_climbed: (p, f) => (f.towerBest || 0) > 0,']] },
  { name: 'the gold card never comes', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "Number.isSafeInteger(f.slotCost) && f.slotCost > 0 && f.gold >= f.slotCost * SAVING_FROM : null),", "false : null),"]] },
  { name: 'Hunt together walls the coach again', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "'strip', orGotIt({ kind: 'partied' }), { reactive: true, gotIt: true, when:", "'strip', { kind: 'partied' }, { reactive: true, when:"]] },
  { name: 'Cash in says nothing of the party on a member\'s screen', case: 'tutorial-town-chain',
    edits: [['src/data/hunt-tutorial.js', "  leave_cellar: (f) => ({ text: f.inParty === true ?", "  leave_cellar: (f) => ({ text: f.inParty === 'never' ?"]] },
  { name: 'the coach names gear no player can get (the copy audit\'s five)', case: 'coach-gear-by-level',
    edits: [['src/data/skill-unlocks.js', "|| it.reqSkill === LEVEL_REQ) && reach.has(id)) add(", '|| it.reqSkill === LEVEL_REQ)) add(']] },
  { name: 'the coach names gear the role does not wear (plate for a Mage)', case: 'coach-gear-by-level',
    edits: [['src/data/hunt-tutorial.js', 'role ? (id) => wornByRole(id, role) : null', 'null']] },
  { name: 'weapons stay on their style skill (the Iron Sword never reaches the Level line)', case: 'coach-gear-by-level',
    edits: [['src/data/gear-tiers.js', "whatever the style (LEVEL_REQ, Tyler 2026-10-24). */\n        reqSkill: LEVEL_REQ,", "whatever the style (LEVEL_REQ, Tyler 2026-10-24). */\n        reqSkill: 'melee',"]] },
  { name: 'the coach fold is not kept (off the residue allowlist: open again after a reload)', case: 'coach-folds',
    edits: [['src/session/residue.js', '  coach: sanitizeCoach,', '']] },
  { name: 'a new card never marks the folded coach', case: 'coach-folds',
    edits: [['src/shell/launcher-coach.js', 'fresh: min && !!card && r.seen !== card.id', 'fresh: false']] },
  { name: 'the hunt bar redraws the coach on a new card only (a fold in a hunt does nothing)', case: 'coach-folds',
    edits: [['src/shell/launcher-coach.js', '/data-coach="([a-z0-9_:]+)"/', '/data-tutorial="([a-z0-9_]+)"/'],
      ['src/shell/launcher-coach.js', "have.getAttribute('data-coach') !== key", "have.getAttribute('data-tutorial') !== key"],
      ['src/shell/launcher-coach.js', "have.getAttribute('data-coach') === key", "have.getAttribute('data-tutorial') === key"]] },
  { name: 'Cash in folds to its bare title in a hunt', case: 'coach-rests-in-a-hunt',
    edits: [['src/shell/launcher-coach.js', '  if (card.holdOpen) return false;\n', '']] },
  { name: 'the coach never rests in a hunt', case: 'coach-rests-in-a-hunt',
    edits: [['src/shell/launcher-coach.js', "return card ? coachHtml(cs, card, false, !!hunting && restsNow(ctx, card)) : '';", "return card ? coachHtml(cs, card) : '';"]] },
  { name: 'the first hunt\'s lessons wall Cash in again', case: 'first-hour-never-walls',
    edits: [['src/data/hunt-tutorial.js', "lesson_time: (p, f) => f.charLevel < HUNT_INDEX[p.hunt].band[0] || reached(f, p.hunt),", 'lesson_time: () => true,']] },
  { name: 'a bow with nothing loaded says nothing', case: 'first-hour-never-walls',
    edits: [['src/data/hunt-tutorial.js', "no_shot: (p, f) => (f.ammo === undefined || !Array.isArray(f.slots) || !f.carried ? null : !canShoot(f)),", 'no_shot: () => false,']] },
  { name: 'the coach rings the Runes tab for ever', case: 'first-hour-never-walls',
    edits: [['src/data/hunt-tutorial.js', "hooks: ['[data-hs-win=\"configure-action\"] .ca-rs[data-store=\"{store}\"]', '[data-hs-win=\"configure-action\"] .ca-row[data-id=\"{spell}\"]',\n        '[data-hs-win=\"configure-action\"] .ca-tab[data-tab=\"spells\"]'] }),", "hooks: ['[data-hs-win=\"configure-action\"] .ca-tab[data-tab=\"spells\"]', '[data-hs-win=\"configure-action\"] .ca-row[data-id=\"{spell}\"]',\n        '[data-hs-win=\"configure-action\"] .ca-rs[data-store=\"{store}\"]'] }),"]] },
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
  { name: 'the King\'s hall loses its party mark', case: 'one-king',
    edits: [['src/data/hunt-grounds.js', "['drain_rat', 54, 21], ['drain_rat', 54, 25]), forParty: 2 }),", "['drain_rat', 54, 21], ['drain_rat', 54, 25]) }),"]] },
  /* THE FIRST HOUR (lane/b-first-hour, 2026-10-28) */
  /* THE PANEL, ROUND 2 (2026-11-01): the coach's load before hunt 2, a return's stale cards, What next's goals */
  { name: 'Decide once is back before the second hunt', case: 'tutorial-town-chain',
    edits: [['src/data/hunt-tutorial.js', "{ knowledge: true, gotIt: true, when: [IN_TOWN, THICKET_BEHIND], inWindow:", "{ knowledge: true, gotIt: true, when: [IN_TOWN], inWindow:"]] },
  { name: 'Cook your catch is back before the second hunt', case: 'tutorial-town-chain',
    edits: [['src/data/hunt-tutorial.js', "{ gotIt: true, when: [IN_TOWN, THICKET_BEHIND], ring: { skill: 'cooking', work: 'cook_shrimp' },", "{ gotIt: true, when: [IN_TOWN], ring: { skill: 'cooking', work: 'cook_shrimp' },"]] },
  { name: 'Decide once asks for every stack again', case: 'tutorial-town-chain',
    edits: [['src/data/hunt-tutorial.js', "inWindow: 'Press This hunt, then set one item to Sell'", "inWindow: 'Press This hunt, then set each item to Sell'"]] },
  { name: 'Eat on time lowers the own food and leaves the store food eating first', case: 'tutorial-bar-chain',
    edits: [['src/data/hunt-tutorial.js', "    if (j >= 0) return { text: t('coach.food_when_both',", "    if (false) return { text: t('coach.food_when_both',"]] },
  { name: 'Eat on time is back after three meals', case: 'first-hour-never-walls',
    edits: [['src/data/hunt-tutorial.js', 'const FOOD_LESSON_EATS = 6;', 'const FOOD_LESSON_EATS = 3;']] },
  { name: 'Eat on time reads a count again, not a rate (8 meals in 2 h)', case: 'first-hour-never-walls',
    edits: [['src/data/hunt-tutorial.js', 'const FOOD_LESSON_PER_HOUR = 12;', 'const FOOD_LESSON_PER_HOUR = 0;']] },
  { name: 'a beating is a count again, not a rate (35 meals in 8.5 h)', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', 'sum(r) >= p.n && sum(r) * 3600000 >= p.perHour * (f.huntMs || 0)', 'sum(r) >= p.n']] },
  { name: 'the "just now" cards speak over a return', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "fresh_hunt: (p, f) => !f.back || f.back !== f.sessionId,", "fresh_hunt: () => true,"]] },
  { name: 'the envelope never says which hunt the player came back to', case: 'tutorial-reactive',
    edits: [['src/session/tutorial-sections.js', "huntId: open ? open.huntId : null, sessionId: open ? open.sessionId : null,", "huntId: open ? open.huntId : null,"]] },
  { name: 'What next forgets the third hero', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', 'if (offer && offer.purse >= offer.slot) {', 'if (false) {']] },
  { name: 'What next is a paragraph again (panel 2026-11-03)', case: 'what-next-one-goal',
    edits: [['src/data/hunt-tutorial.js', "text: lines[0], also: lines.slice(1) }", "text: lines.join(' '), also: [] }"]] },
  { name: 'the deed speaks over the hero the purse is saving for (played 11-04)', case: 'what-next-one-goal',
    edits: [['src/data/hunt-tutorial.js', "if (purse === null || (offer && purse >= offer.slot * SAVING_FROM)) return null;", "if (purse === null) return null;"]] },
  { name: 'the next step up names a ground already hunted', case: 'what-next-one-goal',
    edits: [['src/data/hunt-tutorial.js', 'if (step && !visited(step.hunt)) {', 'if (step) {']] },
  { name: 'the next step up reaches past its dare', case: 'what-next-one-goal',
    edits: [['src/data/hunt-tutorial.js', 'r.band[0] - level <= STEP_UP.mostUnder', 'r.band[0] - level <= 99']] },
  { name: 'an empty slot is sold another slot', case: 'what-next-one-goal',
    edits: [['src/data/hunt-tutorial.js', 'return purse !== null && slot && nth && !emptySlot(f) ? { purse, slot, nth } : null;', 'return purse !== null && slot && nth ? { purse, slot, nth } : null;']] },
  /* THE RETIRED REFILL (lane/w-wage; R8 215f80457 moved the line to bought blocks): a stamina line that still reads the refill's 4 h quote
     (`restoreMs`) never names the block the server sells */
  { name: 'the stamina line reads the retired refill quote, not the block', case: 'what-next-one-goal',
    edits: [['src/data/hunt-tutorial.js', '!Number.isSafeInteger(q.blockMs)', '!Number.isSafeInteger(q.restoreMs)'],
      ['src/data/hunt-tutorial.js', 'hours: Math.round(q.blockMs / 3600000)', 'hours: Math.round(q.restoreMs / 3600000)']] },
  { name: 'the stamina line offers what the purse cannot pay', case: 'what-next-one-goal',
    edits: [['src/data/hunt-tutorial.js', 'if (!Number.isSafeInteger(f.gold) || f.gold < q.price) return null;\n', '']] },
  { name: 'More reaches nothing in the town row (played 11-04)', case: 'what-next-one-goal',
    edits: [['src/shell/launcher-coach.js', "const p = el.querySelector('.hs-pointer'), b = p && p.querySelector(':scope > .hs-coach-more');", "const p = el.querySelector(':scope > .hs-pointer'), b = p && p.querySelector(':scope > .hs-coach-more');"]] },
  { name: 'a repaint shuts the goals More opened', case: 'what-next-one-goal',
    edits: [['src/shell/launcher-coach.js', 'const open = !!also && ALSO_OPEN.get(cs) === card.id;', 'const open = false;']] },
  { name: 'a return with no stamp keeps its old cards (played 11-04)', case: 'return-with-no-stamp',
    edits: [['src/shell/alerts.js', ' else if (judged) backWithNoStamp(cs);', '']] },
  { name: 'a young hunt reads as a return', case: 'return-with-no-stamp',
    edits: [['src/shell/away-recap.js', ' || a.sessionMs < AWAY_MIN_MS) return false;', ') return false;']] },
  { name: 'a stamped hunt is marked twice over', case: 'return-with-no-stamp',
    edits: [['src/shell/away-recap.js', '(was && was.s === h.sessionId) || !a', '!a']] },
  { name: 'the coach keeps its goals to itself', case: 'what-next-one-goal',
    edits: [['src/shell/launcher-coach.js', "const also = Array.isArray(card.also) && card.also.length ? card.also : null;", "const also = null;"]] },
  { name: 'What next offers a slot the server is not selling', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "const slot = Number.isSafeInteger(f.slotCost) && f.slotCost > 0 ? f.slotCost : null;", "const slot = 15000;"]] },
  { name: 'More than one hero walls a hero who wants one', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "'characters', orGotIt({ kind: 'heroes', atLeast: 2 }),", "'characters', { kind: 'heroes', atLeast: 2 },"]] },
  { name: 'the Leaderboards card is gone', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "'honor', READ, { reactive: true, knowledge: true, gotIt: true, when: [IN_TOWN, { kind: 'level_at', at: ROLL_LEVEL, below: WANT_BELOW }] }", "'honor', READ, { reactive: true, knowledge: true, gotIt: true, when: [IN_TOWN, { kind: 'level_at', at: 9999 }] }"]] },
  { name: 'the Weighhouse line names a Level its gate does not', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', 'export const WEIGHHOUSE_LEVEL = 10;', 'export const WEIGHHOUSE_LEVEL = 12;']] },
  { name: 'a crafter at bench 30 is never told the Weighhouse is open (11-05)', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', ' || (Number.isInteger(f.benchLevel) && f.benchLevel >= WEIGHHOUSE_BENCH)', '']] },
  { name: 'a gathering skill opens the Weighhouse card', case: 'tutorial-reactive',
    edits: [['src/session/tutorial-sections.js', "SKILLS_DEF[id].cat === 'artisan'", "SKILLS_DEF[id].cat !== 'combat'"]] },
  { name: 'the own-juice card asks a hero who hardly drinks (core-loop 10-31)', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "when: [{ kind: 'carries', item: 'turnip_juice' }, { kind: 'bought_drinks', n: JUICE_BOUGHT }] }),", "when: [{ kind: 'carries', item: 'turnip_juice' }] }),"]] },
  { name: 'What next hides a made piece\'s bench level (core-loop 10-31)', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "const madeKey = made ? (made.req > 1 ? 'coach.goal_gear_made_at' : 'coach.goal_gear_made')", "const madeKey = made ? ('coach.goal_gear_made')"]] },
  /* lane/d-drop-homes (Tyler 2026-11-18: no bench makes a weapon): a forge row for the Iron Sword back on the bench, and What next tells a tank to make it */
  { name: 'a weapon recipe back on the bench (What next sends a tank to Smithing)', case: 'tutorial-reactive',
    edits: [['src/data/style-gear.js', "'klappas_club', 120, 1, 3000),", "'klappas_club', 120, 1, 3000),\n    r('forge_iron_sword', 'Forge Iron Sword', '⚔️', { iron_bar: 6, normal_plank: 2 }, 'iron_sword', 120, 15, 3400),"]] },
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
  { name: 'the club card asks every weapon', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "f.weapon === p.item || (!f.weapon && (f.carried[p.item] > 0 || f.carried[p.made] > 0))", 'true']] },
  { name: 'the club card leaves a hero empty-handed once the club is made', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "(!f.weapon && (f.carried[p.item] > 0 || f.carried[p.made] > 0))", "(!f.weapon && f.carried[p.item] > 0)"]] },
  { name: 'the ring stays on the bench when the words have moved to the bag', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "...(said.anchor ? { anchor: said.anchor } : {}), ", '']] },
  { name: 'What next names the cloak but not how it is made', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "const madeKey = made ? (made.req > 1", "const madeKey = false ? (made.req > 1"]] },
  { name: 'the tutorial sends a fresh character to the sewer first', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "'hunt_picker', { kind: 'enter', hunt: CELLAR },", "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' },"]] },
  { name: 'the party-only Rat King card is back in the solo chain', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }, { party: true }),",
      "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }, { party: true }),\n  step('the_king', 'The Rat King', 'The last room is his.', 'world', { kind: 'pull', ground: 'millrace_sewer', pocket: 5 }),"]] },
  { name: 'a hero in the sewer is sent back to the Thicket card (enter judged on the current hunt only)', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', ' || past(h, hunt)', '']] },
  { name: 'out of a hunt, the pointer forgets it was there (#58: the Thicket card came back)', case: 'tutorial-never-backward',
    /* where the server has seen this hero hunt is hunt-sections.js groundsSeenOf since the Chronicle reads it too */
    edits: [['src/session/hunt-sections.js', '  if (h && h.huntId) seen.add(h.huntId);\n', '']] },
  { name: 'back in the Cellar after the Thicket, the "Cash in" card returns (#58)', case: 'tutorial-never-backward',
    edits: [['src/data/hunt-tutorial.js', ' || (!!c.openedIn && reached(f, c.openedIn, true))', '']] },
  { name: 'out of the Sewer with the wolves held, the Thicket card returns (#58, Andy)', case: 'tutorial-never-backward',
    edits: [['src/data/hunt-tutorial.js', "{ kind: 'any', of: [{ kind: 'tally_paid', task: WOLVES.id }, { kind: 'been', hunt: WOLVES.hunt, past: true }] }", "{ kind: 'tally_paid', task: WOLVES.id }"]] },
  { name: 'the pointer ignores the personal-best grounds (#58)', case: 'tutorial-never-backward',
    edits: [['src/session/hunt-sections.js', 'new Set(Object.keys((huntBestsOf(cs) || {}).grounds || {}))', 'new Set()']] },
  { name: 'the Thicket is skipped: the cellar unlocks the sewer', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "{ kind: 'unlock', hunt: THICKET }", "{ kind: 'unlock', hunt: 'millrace_sewer' }"]] },
  { name: 'the sewer opens to a fresh character', case: 'tutorial-walk-through',
    edits: [['src/data/hunts.js', 'band: [5, 25],', 'band: [1, 25],']] },
  { name: 'the party card walls a solo hero again', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', 'if (!(f.inParty === true && f.charLevel >= HUNT_INDEX[r.done.hunt].band[0])) return false;', 'if (!true) return false;']] },
  /* lane/d-party-pace (Tyler 2026-11-18 "Yes, open at 5"): a party at 5 is sent below before the wolves, never through the Thicket first */
  { name: 'the party card waits for the Thicket again: a fresh four at 5 is sent to the wolves', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }, { party: true }),", "'hunt_picker', { kind: 'enter', hunt: 'millrace_sewer' }, { party: true, when: [{ kind: 'been', hunt: THICKET }] }),"]] },
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
    edits: [['src/data/hunt-tutorial.js', ' || (tl.weight === true && reached(f, tallyTask(p.task).hunt))', '']] },
  { name: 'a party never meets the Sewer card', case: 'tutorial-never-backward',
    edits: [['src/session/tutorial-sections.js', 'inParty: !!party && party.seats.length >= 2,', 'inParty: false,']] },
  { name: 'the town lessons are asked of a hero past the Thicket', case: 'tutorial-launcher-card',
    edits: [['src/data/hunt-tutorial.js', ' else if ((!r.reactive || r.dayOne) && f.charLevel > caps.solo) return false;', '']] },
  { name: 'a solo hero hears no way to make a party', case: 'tutorial-launcher-card',
    edits: [['src/data/hunt-tutorial.js', "  const solo = facts.inParty !== true;\n", '  const solo = false;\n']] },
  { name: 'a card the server finishes is replaced before it can be read', case: 'coach-hold',
    edits: [['src/shell/launcher-coach.js', '  if (auto(had.card) && !gone(had.card) && now - had.since < readMs(had.card)) return had.card;\n', '']] },
  { name: 'Got it on a held card does nothing for its reading time', case: 'coach-hold',
    edits: [['src/shell/launcher-coach.js', '  if (auto(had.card) && !gone(had.card) && now - had.since < readMs(had.card)) return had.card;\n', '  if (auto(had.card) && now - had.since < readMs(had.card)) return had.card;\n']] },
  { name: 'a card the server passed while another was read is never shown', case: 'coach-hold',
    edits: [['src/shell/launcher-coach.js', 'const passed = HUNT_TUTORIAL.slice(from + 1, to).find((r) => auto(r) && !gone(r));', 'const passed = null;']] },
  { name: 'a card the player finished is held over (Save looks ignored)', case: 'coach-hold',
    edits: [['src/shell/launcher-coach.js', 'const auto = (r) => !!r && !!r.done && AUTO_KINDS.includes(r.done.kind);', 'const auto = (r) => !!r;']] },
  { name: 'no ring on the icon a card starts at', case: 'coach-ring',
    edits: [['src/data/hunt-tutorial.js', 'return a && a.icon && !open(a.window) ? a.window : null;', 'return null;']] },
  { name: 'the bar ring stays on the slot while its Configure action is open', case: 'coach-ring',
    edits: [['src/shell/launcher-coach.js', "if (!(open('configure-action') && at.configuring === card.barSlot)) return", 'if (true) return']] },
  { name: 'the icon row draws no ring of its own (a repaint drops it)', case: 'coach-ring',
    edits: [['src/shell/launcher.js', "data-key=\"' + esc(key) + '\"' + (ringed ? ' data-coach-ring=\"\"' : '')", "data-key=\"' + esc(key) + '\"'"]] },
  /* lane/b-tutorial-cards (the 2026-10-25 curriculum) */
  { name: 'REGRESSION "Tell your hero when" never showed: any stored food slot with a condition finishes the food lesson (a Save restates the kit\'s 60%)', case: 'tutorial-bar-chain',
    edits: [['src/data/hunt-tutorial.js', ' && hpBelow(s) !== null && hpBelow(s) !== START_FOOD_PCT) : null),', ' && hpBelow(s) !== null) : null),']] },
  { name: 'Why it waits passes every bar by (a caster loses the lesson)', case: 'why-it-waits',
    edits: [['src/data/hunt-tutorial.js', "  slot_waits: (p, f) => (Array.isArray(f.slots) ? waitingSlot(f) >= 0 : null),", "  slot_waits: () => false,"]] },
  { name: 'Why it waits comes up on a bar where nothing waits', case: 'why-it-waits',
    edits: [['src/data/hunt-tutorial.js', "  slot_waits: (p, f) => (Array.isArray(f.slots) ? waitingSlot(f) >= 0 : null),", "  slot_waits: () => true,"],
      ['src/data/hunt-tutorial.js', "    const i = waitingSlot(f);\n    return i < 0 ? null", "    const i = Math.max(waitingSlot(f), 0);\n    return i < 0 ? null"]] },
  { name: 'Why it waits tells a new Ranger its locked Raking Shot waits for a count (v0.2.129)', case: 'why-it-waits',
    edits: [['src/data/hunt-tutorial.js', ' && !underUnlock(f, ABILITIES[s.id])', '']] },
  { name: 'Why it waits never names an unlocked area move', case: 'why-it-waits',
    edits: [['src/data/hunt-tutorial.js', "const underUnlock = (f, row) => !!row.unlock && ", "const underUnlock = (f, row) => true || "]] },
  { name: 'Why it waits names a struck slot as waiting', case: 'why-it-waits',
    edits: [['src/data/hunt-tutorial.js', "f.slots.findIndex((s) => on(s) && s.type === 'ability' && s.usable !== false && !!ABILITIES[s.id]\n", "f.slots.findIndex((s) => on(s) && s.type === 'ability' && !!ABILITIES[s.id]\n"]] },
  { name: 'Why it waits rings slot 1 whatever waits', case: 'why-it-waits',
    edits: [['src/data/hunt-tutorial.js', "t('coach.why_waits', { slot: slotWords([i]) }), barSlot: i }", "t('coach.why_waits', { slot: slotWords([i]) }), barSlot: 0 }"]] },
  { name: 'Why it waits names the slot after the one that waits', case: 'why-it-waits',
    edits: [['src/data/hunt-tutorial.js', "t('coach.why_waits', { slot: slotWords([i]) })", "t('coach.why_waits', { slot: slotWords([i + 1]) })"]] },
  { name: 'Why it waits is asked of a second hero', case: 'why-it-waits',
    edits: [['src/data/hunt-tutorial.js', "'action_bar', READ, { knowledge: true, gotIt: true, when: [LESSON, { kind: 'slot_waits' }] }),", "'action_bar', READ, { gotIt: true, when: [LESSON, { kind: 'slot_waits' }] }),"]] },
  { name: 'the offer names the hero\'s own rune, not the store\'s', case: 'starter-bars',
    edits: [['src/data/hunt-tutorial.js', "spell: a.n, rune: name(st.id) })", "spell: a.n, rune: name(a.rune) })"]] },
  { name: 'the offer names a tab Configure action does not have', case: 'starter-bars',
    edits: [['src/data/hunt-tutorial.js', "tab: BAR_TEXT.tab_spells, spell: a.n", "tab: 'Runes', spell: a.n"]] },
  { name: 'a default bar shows a struck slot again (the Mage\'s Frost Lance names no store rune)', case: 'starter-bars',
    edits: [['src/data/rule-subjects.js', "const storeOf = (id) => { const r = ABILITIES[id]; const b = r && r.rune ?", "const storeOf = (id) => { const r = ABILITIES[id]; const b = r && r.rune && id !== 'frost_lance' ?"]] },
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
    edits: [['src/data/hunt-tutorial.js', "    return said.includes(null) ? null : false;", '    return false;']] },
  { name: 'the knowledge cards are asked of a second hero', case: 'tutorial-second-hero',
    edits: [['src/data/hunt-tutorial.js', '  if (r.knowledge && secondHero(f)) return false;\n', '']] },
  { name: 'a reactive card is capped by the guide\'s Level (no paid-Blessing card at Level 31)', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', '    if (past && (!r.reactive || r.dayOne)) continue;', '    if (past) continue;']] },
  /* RETIRED (lane/c-hollow-proofs 2026-11-20): "the death card reads no Blessing from the death log" (tutorial-sections.js `saved: null`)
     was "caught" only by a plant missing src/hunt-view. Loaded, no rule can catch it: the death card is a label since the 11-14 ruling
     ("Shop → Services → Bless"), and no card reads `death.saved` any more (hunt-tutorial.js: `died` and `below_free` only). An equivalent
     mutant on a field with no reader; the field itself is DISCOVERIES 2026-11-20 #4. */
  { name: 'the ate card never sees the analyzer', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "  ate: (p, f) => known(used(f, 'food', 'own'), (r) => r.length > 0),", '  ate: () => false,']] },
  /* PLAN L08 (retention R3): the day-one town cards wait for the stamina end, and the house card sets the job's count */
  { name: 'the house card speaks before the stamina runs out', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "{ kind: 'level_at', at: DAY_ONE_LEVEL }, { kind: 'stamina_ended' }, { kind: 'home_unowned' }", "{ kind: 'level_at', at: DAY_ONE_LEVEL }, { kind: 'home_unowned' }"]] },
  { name: 'the house card sends the hero gathering with no count', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', 'ring: { skill: node.skill, work: node.id, count: n } };', 'ring: { skill: node.skill, work: node.id } };']] },
  { name: 'a day-one card jumps the chain (placed before it)', case: 'tutorial-reactive',
    edits: [['src/data/hunt-tutorial.js', "  /* ── F. Day one: each waits for the chain, then starts on its own fact ── */\n", ''],
      ['src/data/hunt-tutorial.js', "  /* ── B. The first hunt, the bar while it fights ────────────────────── */\n",
        "  step('home', 'Build your home', 'x', 'house', { kind: 'home_owned' }, { reactive: true, dayOne: true, when: [IN_TOWN, { kind: 'level_at', at: DAY_ONE_LEVEL }, { kind: 'home_unowned' }] }),\n"],
      ['src/data/hunt-tutorial.js', "  step('home', 'Build your home',\n    'Gather logs and ore for your first house',\n    'house', { kind: 'home_owned' }, { reactive: true, dayOne: true, when: [IN_TOWN, { kind: 'level_at', at: DAY_ONE_LEVEL }, { kind: 'stamina_ended' }, { kind: 'home_unowned' }] }),\n", '']] },
  { name: 'Tamsin\'s payment card shows while the hero hunts another ground', case: 'tutorial-town-chain',
    edits: [['src/data/hunt-tutorial.js', "{ kind: 'been', hunt: WOLVES.hunt, past: true }] }, { when: [{ kind: 'not_elsewhere', hunt: WOLVES.hunt }] }),", "{ kind: 'been', hunt: WOLVES.hunt, past: true }] }),"]] },
  { name: 'the first-return cards come back after the Thicket', case: 'tutorial-town-chain',
    edits: [['src/data/hunt-tutorial.js', "'shop', { kind: 'any', of: [{ kind: 'loot_sold' }, { kind: 'been', hunt: THICKET }] },", "'shop', { kind: 'loot_sold' },"]] },
  { name: 'the shown first-minute cards come after the reactive ones (the shell would replay them)', case: 'tutorial-walk-through',
    edits: [['src/data/hunt-tutorial.js', "export const AUTO_KINDS = Object.freeze(['kills', 'level', 'pull']);", "export const AUTO_KINDS = Object.freeze(['kills', 'level', 'pull', 'unlock']);"]] },
  /* lane 2: the shell's facts, Got it, read on sight, the hooks' order */
  { name: 'the shell passes the coach no facts (the twelve cards stay hidden)', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher-coach.js', 'card = pointerCardOf(cs, sh), gone =', 'card = pointerCardOf(cs, undefined), gone =']] },
  { name: 'the coach counts the bag, not what Sell all loot sells', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher-coach.js', 'lootSale(bag, rulesOf(cs), shop, upgradeNeeds(homeOf(cs), chestsOf(cs))).lines.length', 'bag.length']] },
  { name: 'Got it records nothing', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher-coach.js', "  return !!c && !!card && c.mark('read', [card.id]);", '  return false;']] },
  { name: 'the hero\'s residue keeps the coach\'s reads again', case: 'tutorial-shell-facts',
    edits: [['src/session/residue.js', "  if (typeof v.seen === 'string' && /^[a-z0-9_]{1,256}$/.test(v.seen)) out.seen = v.seen;\n", "  if (typeof v.seen === 'string' && /^[a-z0-9_]{1,256}$/.test(v.seen)) out.seen = v.seen;\n  if (Array.isArray(v.read)) out.read = v.read;\n"]] },
  { name: 'a folded read-on-sight card is never on screen (it sits there forever, v0.2.63)', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher-coach.js', `'.hs-pointer[data-tutorial="' + card.id + '"]'`, `'.hs-pointer[data-tutorial="' + card.id + '"]:not(.is-min)'`]] },
  { name: 'a Got it card is marked read on sight', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher-coach.js', 'const readOnSight = (card) => readable(card) && !card.gotIt;', 'const readOnSight = (card) => readable(card);']] },
  { name: 'a read-on-sight card is marked at once', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher-coach.js', '  if (now - s.since < readMs(card)) return false;\n', '']] },
  { name: 'the slots owned are the heroes, not the slots', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher-coach.js', 'slotsOwned: rows ? rows.length : null,', 'slotsOwned: rows ? rows.filter((r) => r.exists).length : null,']] },
  { name: 'a hero out hunting counts as in town for a party', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher-coach.js', 'open: true, hunting: huntOpenOf(c) });', 'open: true, hunting: false });']] },
  { name: 'one press of − sends the player to Save before the card\'s goal HP', case: 'coach-ring',
    edits: [['src/shell/launcher-coach.js', 'if (at.edited && !(Number.isFinite(card.goal) && Number.isFinite(at.cond0) && at.cond0 > card.goal)) return [save];', 'if (at.edited) return [save];']] },
  { name: 'the hooks ring in the order written (the tab over its own control)', case: 'tutorial-shell-facts',
    edits: [['src/shell/launcher-coach.js', 'default: return (card.hooks || []).slice().reverse();', 'default: return (card.hooks || []).slice();']] },
  { name: 'the Blessing cards still point at the old Services window', case: 'tutorial-shell-facts',
    edits: [['src/data/hunt-tutorial.js', "'shop', true, 'services'),", "'services', true),"]] },
];

/* fixtures/h1.js `plant`, widened to the world engine and its manifests (the map cases read them):
   a mutant that cannot load would read as caught, so every path this file imports is copied. It had drifted (lane/c-hollow-proofs
   2026-11-20): with no src/hunt-view, src/net or src/social, no market migrations and no alpha envelope, 90 of its mutants "were caught" by Cannot find
   module / ENOENT, their cases unrun; a throw is no catch now (tests/_mutant-verdict.mjs), so a missing path reads HARNESS. */
const MARKET_SQL = ['supabase/migrations/2027-03-03-market-bench-gate.sql', 'supabase/migrations/2027-02-13-market-eligibility.sql'];
function plant(edits) {
  const root = mkdtempSync(join(tmpdir(), 'hunt-sewer-'));
  for (const d of ['src/core', 'src/data', 'src/world', 'src/session', 'src/shell', 'src/render', 'src/utils', 'src/hunt-view', 'src/net', 'src/social', 'assets/world', 'prototypes/hunt-sim-assets/manifest.json', ...MARKET_SQL, 'tests/fixtures/alpha-envelope.json']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
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
/* --batch a:b (this file's own child): mutants a..b-1 alone, no cases. Every mutant imports its planted copy of the module tree (about
   10 MB of heap each, never freed: an ES module stays cached), so ~180 of them in one process passed CI's 2 GB default heap (run
   45005524881: heap out of memory). The parent runs them in batches of MUTANT_BATCH, each in a fresh process whose heap is freed. */
const MUTANT_BATCH = 40;
const batchArg = process.argv.includes('--batch') ? String(process.argv[process.argv.indexOf('--batch') + 1] || '') : null;
const [bFrom, bTo] = batchArg ? batchArg.split(':').map(Number) : [0, Infinity];
if (!batchArg) {
  for (const [cn, fn] of Object.entries(cases)) {
    if (ONLY && !ONLY.has(cn)) continue;
    let why = null;
    try { why = await fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    R.ok(!why, cn + ': ' + why);
  }
}
const chosen = [];
mutants.forEach((mu, i) => {
  if ((ONLY && !ONLY.has(mu.case)) || process.argv.includes('--cases')) return;
  if (!cases[mu.case]) { if (!batchArg) R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); return; }
  chosen.push(i);
});
let caught = 0;
if (batchArg) {
  for (const i of chosen) {
    if (i < bFrom || i >= bTo) continue;
    const mu = mutants[i];
    caught++;
    const p = plant(mu.edits);
    try {
      let why = null;
      /* A planted copy that cannot even load is a broken mutant, not a caught one. */
      const PM = await load(p.root);
      try { why = await cases[mu.case](PM); } catch (e) { why = 'threw ' + e.message; }
      R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
    } finally { p.done(); }
  }
} else {
  const { spawnSync } = await import('node:child_process');
  const self = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  for (let a = 0; a < mutants.length; a += MUTANT_BATCH) {
    const mine = chosen.filter((i) => i >= a && i < a + MUTANT_BATCH);
    if (!mine.length) continue;
    const r = spawnSync(process.execPath, [...process.execArgv, decodeURIComponent(self), '--batch', a + ':' + (a + MUTANT_BATCH), ...(ONLY ? ['--only', [...ONLY].join(',')] : [])], { stdio: 'inherit' });
    R.ok(r.status === 0, 'mutants ' + a + '..' + (a + MUTANT_BATCH - 1) + ': the batch exited ' + r.status + (r.signal ? ' (' + r.signal + ')' : ''));
    caught += mine.length;
  }
}
if (!R.fails.length) {
  if (batchArg) console.log('  batch ' + batchArg + ': ' + caught + ' mutants caught');
  else console.log('  ' + Object.keys(cases).filter((c) => !ONLY || ONLY.has(c)).length + ' cases, ' + caught + ' mutants caught');
}
R.finish();
