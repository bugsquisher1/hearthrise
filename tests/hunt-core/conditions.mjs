// tests/hunt-core/conditions.mjs — THE CONDITIONAL ACTION ENGINE (src/core/hunt/conditions.js; Tyler
// 2026-10-18) with the party scale, the solo Healer floor and monster density it ships with. Run by run-all.mjs.
//
//   registry          every METRICS row has one evaluator and every evaluator a row; the registry validates
//   validation        the slot / bar / stop-rule refusals the server mirrors (unknown metric, op, value, subject, action, sizes)
//   footprint         odd squares centre on the aim; an even square reaches south-east (4x4 = aim -1 .. +2)
//   enemies-in-aoe    the metric is the REAL footprint of the slot's own action over every reachable aim
//   priority-fallback slot order is priority, the next passing slot is the fallback; the cast names its rule
//   join              and / or
//   ally-subject      a heal slot on "the tank below 80%" heals the tank, never the lower mage; 85% = no heal
//   consume-slot      an explicit eat slot replaces the eat-at default; a kind slot falls back when its item is gone
//   attack-item       an area shot hits its whole footprint for ONE unit; an empty stack falls back to the next slot
//   metrics-misc      target_is_boss, item_qty, effect_missing
//   stop-rule         a stop rule ends the hunt `rule` only after holding forMs; a break resets the hold
//   density           the pick is clamped to the ground for the party size; density 2 doubles the pack, deterministically
//   density-pull      the pick is the pull size: a Thicket settle at 7 spawns 7 a pack solo; in a party the LEADER's pick
//                     is the pull (Tyler 10-20: "a party leader that chooses the hunt settings"): a leader at 7 beside a
//                     member at 0 / 3 spawns 7, in either seat order; the member's pick never counts
//   density-laps      Andy 10-20 ("second lap on 8x and there's only 2 mobs"): a duo, its leader at 8 and the member
//                     never picked, runs 3+ laps of the Thicket on the real settle; EVERY spawn, the first packs and
//                     every respawn, is a pack of 8, never the room as built; the box's ring of 8 never walls the leader
//                     off the pull tile (it pulls from the ring's edge)
//   one-pack          a pack spawns at its row's HP for every party size (Tyler 2026-11-08), whole-kill: it pays its row's whole kill, every-route: a lone hero walks the King's hall
//   party-acceptance  a 4-party (Knight, Ranger, Druid, Sorcerer) on one instance: the Ranger switches 5x5 / 3x3 by
//                     enemies_in_aoe and falls back when the 5x5 runs out, one unit a shot; the Druid heals only the
//                     Knight and only under 80%; the Sorcerer casts at density 3+; cut into windows (the client closed,
//                     the away path) the instance is byte-identical; kills and loot are tallied once
//   solo-healer       a FRESH solo Healer (start kit, Apprentice Staff) on the REAL settle clears mill_cellar with no fall, then the Thicket's
//                     first pocket at Level 5 (its first real ground, Tyler 10-21) and the Sewer's at its floor (a party's first ground)
//   starter-bar-fires       every worn set of the kit, on the real settle: no dead default slot, the first pull fires, a lone monster fires, every slot earns its place
//   starter-bars-both-paths a new caster's bar, watched and with the browser closed: the same result
//   undertow-both-paths     the Healer's alone spell (Tyler 2026-11-09): a lone Healer casts it watched and closed alike; a tank and a
//                           Healer, both alive, never do on either path
//   sql-rows          the migration's catalogue rows equal the registry, the action ids and ROLE_RULES
//
//   node tests/hunt-core/conditions.mjs            cases + mutants
//   node tests/hunt-core/conditions.mjs --print    print the migration's generated blocks
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadCore, makeReport, ROOT, hero, mon, world, instOf, subStep, T0 } from './fixtures/h1.js';
import { supplySession } from './fixtures/h4.js';
import { loadPlay } from './fixtures/play-ground.mjs';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const MIGRATION = 'supabase/migrations/2026-10-25-action-conditions.sql';
/* The starter bar moved forward (Tyler 2026-10-21: a slot names ONE item; a new hero's bar). */
const STORE_MIGRATION = 'supabase/migrations/2026-11-07-store-by-slot.sql';
/* The limits (+ max_ignored), the action ids (no rune and no whetstone is an attack item) and the role rule sets (their triggers
   written as real conditions) moved forward: lane b-spell-core, Tyler 2026-10-23. */
const SLOT_MIGRATION = 'supabase/migrations/2027-01-13-slot-truth.sql';
/* The metrics (Green Sickness's mark, the heal aimed at yourself) and the role rule sets (a rune spell's slot names its
   store rune) moved forward again: lane b-spell-content, Tyler 2026-10-23. */
const CONTENT_MIGRATION = 'supabase/migrations/2027-01-13-spell-content.sql';
/* The settings view that places the starter bar, at the chain's end (restated: a slot may name any store rune of its family): lane/c-rune-ladder, 2026-11-05. */
const VIEW_MIGRATION = 'supabase/migrations/2027-03-08-rune-ladder-slots.sql';
/* The role rule sets once more (every default rune spell names its store rune, Flame Volley and Rend off the default bars: lane/c-caster-starter-bars, designer 2026-11-05),
   and again (Undertow on the Healer's set: lane/b-one-difficulty, Tyler 2026-11-09). */
const BAR_MIGRATION = 'supabase/migrations/2027-03-24-undertow-bar.sql';

async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  const raw = (p) => import(pathToFileURL(join(root, p)).href);
  M.cond = await imp('src/core/hunt/conditions.js');
  M.CM = await imp('src/data/condition-metrics.js');
  M.roles = await imp('src/data/hunt-roles.js');
  M.AD = await imp('src/data/abilities.js');
  M.CD = await imp('src/data/consumables.js');
  M.SUP = await imp('src/data/supplies.js');
  M.kit = await imp('src/data/start-kit.js');
  M.acc = await raw('supabase/functions/hr-accrue/accrual.js');
  M.hg = await raw('src/core/hunt-ground.js');
  M.heroSetup = (await raw('src/core/hunt-spawn.js')).heroSetup;
  /* The WEAPON_ROLES key an item plays (a magic weapon by its discipline), as the settle reads it (hunt-settle.js). */
  M.roleWeaponOf = (await raw('src/data/hunt-roles.js')).roleWeaponOf;
  M.drops = await imp('src/core/drops.js');
  M.XP = await imp('src/core/xp.js');
  M.hf = await imp('src/core/hearthfind.js');
  M.basics = await imp('src/data/supply-basics.js');
  M.play = await loadPlay(root);
  return M;
}

/* ── FIXTURES ─────────────────────────────────────────────────────────── */

/* A slot; `rid` stamps its stable rule id the way the server does on save (absent = the engine's content hash). */
const slot = (type, id, conditions, join, rid) => Object.assign(rid ? { id: rid } : {}, { action: { type, id }, conditions: conditions || [], join: join || 'and' });
const c = (metric, op, value, subject) => Object.assign({ metric, op, value }, subject ? { subject } : {});
const ab = (id, conds, join, rid) => slot('ability', id, conds, join, rid);
/* A bar as the engine runs it (heroSlots of the module under test: the lanes' defaults included). */
let CUR = null;
const rows = (list) => CUR.cond.heroSlots(list, null);

/* An open 24 x 12 room walled round; seats on the west, one big pocket in the east. */
function openGrid(M) {
  const W = 24; const H = 12;
  const open = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;
  return M.grid.makeGrid(W, H, open, (x, y) => !open(x, y));
}
function openGround(spawns, o) {
  return Object.assign({ id: 'ae_room', hunt: 'mill_cellar', map: 'ae_room', start: [[2, 5], [2, 6], [3, 5], [3, 6]],
    pockets: [{ room: [8, 1, 22, 10], spawns }], route: [0], respawnMs: 3000, pullDist: 1.5, groupFit: 'both', densityMax: [12, 12, 12, 12] }, o || {});
}
/* A 3 x 3 block of `monster` round (16, 5), plus a straggler at (20, 9). */
const BLOCK = (monster) => [[15, 4], [16, 4], [17, 4], [15, 5], [16, 5], [17, 5], [15, 6], [16, 6], [17, 6], [20, 9]]
  .map(([x, y]) => ({ monster, x, y }));

/* One engine-level hero row (abilities / consumables / damage read it). */
const heroRow = (M, o) => Object.assign({ hs: supplySession(M, o && o.session), actionSet: 'hunt', range: 1 }, o || {});
/* A healer's or a mage's own Water and Earth runes: Greater Mend, Circle of Renewal and Arcane Barrier are rune spells
   (Tyler 2026-10-23, the approved spell map), so a fixture that heals or shields carries them. */
const HEAL_RUNES = Object.freeze({ chalked_water_rune: { loaded: 50 }, chalked_earth_rune: { loaded: 50 } });

/* ── THE SPAN MEMBER: a hero of `role` with its own slots, bag and snapshot (the one span reads it) ── */
/* FIXTURE vitals per role (fixture data, not game data: a role sets no vitals, src/core/vitals.js does).
   HP on the core model's scale (monster blows and food x12, CORE_NUMBERS Q3); mana as the old fixture had it. */
const FIX = Object.freeze({ tank: [2400, 60], melee_dps: [2400, 60], ranger: [1800, 100], mage: [1440, 320], healer: [1620, 300] });
function member(M, key, role, o) {
  const x = o || {};
  const R = M.roles.HUNT_ROLES[role];
  const hs = M.AR.newHuntSession({ id: 'ae-' + key, instanceId: 'ae', huntFromMs: T0, nextSwingAtMs: T0,
    bag: x.bag || {}, onEmpty: 'switch', supplySource: 'mine', purse: 0,
    staminaMs: 8 * 3600000, staminaMaxMs: 8 * 3600000 });
  const hp = x.hp ?? FIX[role][0];
  const state = { skills: {}, levelXp: 0, playerHp: hp, playerMaxHp: hp, playerMaxMana: FIX[role][1], regenPm: 1000, stats: {}, gold: 0 };
  const kills = []; const loot = [];
  return {
    key, seat: x.seat || 0, unitId: null, hs, state, family: 'hammer', armoured: false, shield: false,
    bonus: () => 0, weakness: () => ({ dropMult: 1 }),
    snapshot: () => ({ acc: x.acc ?? 900, maxHit: x.maxHit ?? 6, def: x.def ?? 4 }),
    fx: { addXp() {}, addLevelXp() {}, addItem(id, n) { loot.push([id, n]); }, onLoot() {}, onDrop() {}, updateDaily() {},
      updateQuest(t) { if (t === 'kill') kills.push(1); } },
    _loot: loot,
    hero: { role, element: '', settings: null, slots: rows(x.slots || []), stopRules: M.cond.heroStopRules(x.stopRules || []),
      density: x.density ?? 0, actionSet: 'hunt', range: R.range, ammo: x.ammo || null },
  };
}

/* The 4-party: Knight (tank), Ranger (5x5 and 3x3 arrows), Druid (heals the Knight under 80%), Sorcerer (AoE at 3+). */
const HAVOC = 'steel_arrows'; const BURST = 'iron_arrows';
function party(M, o) {
  const x = o || {};
  return [
    /* 1200 HP (was 1920, lane/b-ground-formula-fix): on the formula's Drain Rats (atk 5 -> 4) the 1920 knight's lowest was 81.1%
       at a 2 s boundary, so the druid's under-80% rule never fired (main: 79.1%, 13 heals). 900-1300 HP: 6-11 heals, no death. */
    member(M, 'a-knight', 'tank', { seat: 0, hp: 1200, def: 2, maxHit: 5 }),
    member(M, 'b-ranger', 'ranger', { seat: 1, ammo: 'bronze_arrows', maxHit: 4,
      bag: { bronze_arrows: { loaded: 50 }, [HAVOC]: { loaded: x.havoc ?? 6 }, [BURST]: { loaded: 500 } },
      slots: [slot('attack_with_item', HAVOC, [c('enemies_in_aoe', 'gte', 4)], 'and', 'havoc'), slot('attack_with_item', BURST, [c('enemies_in_aoe', 'gte', 2)], 'and', 'burst')] }),
    member(M, 'c-druid', 'healer', { seat: 2, maxHit: 2, bag: { chalked_water_rune: { loaded: 500 } }, slots: [ab('greater_mend', [c('ally_hp_pct', 'lt', 80, 'tank')])], stopRules: x.druidStop }),
    member(M, 'd-sorc', 'mage', { seat: 3, maxHit: 2, bag: { chalked_fire_rune: { loaded: 300 } }, slots: [ab('fireball', [c('enemies_in_aoe', 'gte', 3)])] }),
  ];
}
/* The injected item catalogue: the 5x5 and 3x3 arrows are fixture rows over real ammo (designer data, not a ruling), and any Ranged may loose them: this case is the footprint's, not the skill's. */
const itemsWith = (M) => Object.assign({}, M.ITEMS, { [HAVOC]: Object.assign({}, M.ITEMS[HAVOC], { area: 5, reqLv: 1 }), [BURST]: Object.assign({}, M.ITEMS[BURST], { area: 3, reqLv: 1 }) });

function runParty(M, cuts, o) {
  const members = party(M, o);
  const ground = openGround(BLOCK('drain_rat'));
  const ctx = { tickMs: 2000, seed: (d, i) => M.rng.hashSeed('ae', d, i), monsters: M.MONSTERS, items: itemsWith(M), ground, grid: openGrid(M) };
  const span = (o && o.spanMs) || 120000;
  const edges = [T0, ...cuts.map((k) => T0 + k), T0 + span];
  let w = null; let next = T0; const events = []; const ended = [];
  for (let i = 1; i < edges.length; i++) {
    w = w ? M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w)))) : null;
    const r = M.cs.simulateHuntInstance({ world: w, nextSwingAtMs: next, members }, Object.assign({}, ctx, { toMs: edges[i] }));
    w = r.world; next = r.nextSwingAtMs; events.push(...r.events);
    for (const m of members) ended.push(...r.members[m.key].huntEvents.filter((e) => e.type === 'ended'));
  }
  const unit = (key) => members.find((m) => m.key === key).unitId;
  return { members, events, w, ended, unit, key: JSON.stringify({ w: M.worldstate.encode(w), events, t: members.map((m) => [m.hs.tally, m.hs.bag, m._loot]) }) };
}

/* A FRESH CHARACTER on the REAL settle (accrueHunt) at a real ground: the start kit's skills and food, a staff. */
function freshHealer(M, huntId, minutes, seed, options, element, level) {
  return freshParty(M, huntId, minutes, seed, [options], element, level);
}
/* The same fresh start-kit Healer, one per entry of `optionsList` (each its own stored options, as
   hr_hunt_member_read hands the settle player_action_sets.options), on ONE instance through the real settle. `level`: its Level, start kit and skills as they are (default 1). */
function freshParty(M, huntId, minutes, seed, optionsList, element, level) {
  const { ground, grid } = M.hg.huntGroundOf(huntId);
  const from = T0; const to = from + minutes * 60000;
  const food = Object.keys(M.kit.START_INVENTORY).find((id) => M.SUP.SUPPLIES[id] && M.SUP.SUPPLIES[id].kind === 'heal');
  const members = optionsList.map((options, i) => {
    /* `lead` marks the party leader, as hunt-settle.js reads hr_hunt_instance_read `leads` */
    const hero = M.heroSetup({ weaponType: M.roleWeaponOf(M.ITEMS.apprentice_staff), options: Object.assign({ role: 'healer' }, options || {}), bar: [], partyRoles: [],
      lead: !!(options && options.lead) });
    return { key: 'h' + (i || ''), user: 'u', slot: i, seat: i, unitId: null, sessionId: 's' + i, version: 1, huntId,
      huntSession: { id: 's' + i, instanceId: 'i', huntFromMs: from, nextSwingAtMs: from, swingIndex: 0, onEmpty: 'switch', supplySource: 'mine', goldFloor: 0, cover: {},
        /* the store, as hr_hunt_member_read hands the settle: its default bar's runes are bought here (a Healer with no store could not cast a heal, and this case passed anyway) */
        basics: Object.fromEntries(M.basics.BASIC_SUPPLIES.map((b) => [b.id, { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner }])),
        bag: { [food]: { loaded: M.kit.START_INVENTORY[food] } },
        staminaMs: 8 * 3600000, staminaMaxMs: 8 * 3600000 },
      skills: Object.assign({}, M.kit.START_SKILL_XP), levelXp: level ? M.XP.charXpForLevel(level) : 0, hp: M.kit.START_CURRENCY.hp, gold: M.kit.START_CURRENCY.gold,
      equipment: { weapon: 'apprentice_staff' }, inventory: {}, hero: Object.assign({}, hero, { element: element || '' }) };
  });
  const secret = String(BigInt.asIntN(64, BigInt(seed) * 2654435761n + 1n));
  const out = M.acc.accrueHunt({ instance: { id: '00000000-0000-4000-8000-0000000000ae', nextSwingAtMs: from, world: null },
    window: { fromMs: from, toMs: to }, secret, ground, grid, items: M.ITEMS, monsters: M.MONSTERS, members });
  return out;
}

/* ── A NEW HERO OF EVERY STYLE, AS THE KIT MAKES IT ──────────────────────── */
/* Every worn set a new hero can stand in (start-kit.js STARTER_SETS: each weapon with the off-hand beside it), and the sword alone,
   the shield taken off; a shooter's ammo loaded, as Equip loads it. A new row is covered by being a row. */
function starterWorn(M) {
  const sets = [];
  for (const ids of Object.values(M.kit.STARTER_SETS)) {
    const off = ids.find((id) => M.ITEMS[id].slot === 'shield');
    for (const weapon of ids.filter((id) => M.ITEMS[id].slot === 'weapon')) sets.push(Object.assign({ weapon }, off ? { shield: off } : {}));
  }
  sets.push({ weapon: M.kit.START_EQUIPMENT.weapon });
  return sets.map((worn) => {
    const ammo = Object.keys(M.kit.START_INVENTORY).find((id) => M.roles.shootsItem(M.roles.roleForWeapon(M.roles.wornRoleKey(worn, M.ITEMS), null), M.ITEMS[id]));
    return Object.assign(worn, ammo ? { ammo } : {});
  });
}
/* The hunt's bag as Enter packs it (hunt-list.js packFor): every hunt supply in the kit. */
const kitBag = (M) => Object.fromEntries(Object.entries(M.kit.START_INVENTORY).filter(([id]) => M.SUP.SUPPLIES[id]).map(([id, n]) => [id, { loaded: n }]));
/* Why a default slot may never cast alone at the Thicket's floor. Add an ability here only with its reason. */
const WAITS_FOR_OTHERS = Object.freeze({ challenge: 'nothing leaves a lone tank', circle_of_renewal: 'it needs two hurt heroes, and this hero is alone' });
/* A new hero on the real settle: an empty stored bar, the kit's bag. Each cast of its own ability, by the first pull's clock. */
function newHeroCasts(M, worn, huntId, L, ground, spanMs, secret) {
  const setup = M.heroSetup({ weaponType: M.roles.wornRoleKey(worn, M.ITEMS), options: {}, bar: [], partyRoles: [] });
  const out = { first: null, casts: {}, role: setup.role };
  M.play.run(huntId, L, [setup.role], { spanMs, windowMs: 10000, secret, ground, equipment: () => Object.assign({}, worn), bag: () => kitBag(M), bar: () => [],
    start: () => (L === 1 ? { levelXp: 0, skills: {} } : {}),
    onWindow: (w) => { for (const e of w.events || []) {
      if (e.type === 'pull' && out.pullAt === undefined) out.pullAt = e.atMs;
      if (e.type === 'cast' && !M.AD.ABILITIES[e.ability].universal) {
        out.casts[e.ability] = (out.casts[e.ability] || 0) + 1;
        if (out.first === null) out.first = e;
      }
    } } });
  return out;
}

/* ── THE MIGRATION'S GENERATED BLOCKS (pinned equal to the data) ─────────── */
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const arr = (a) => (a && a.length ? 'array[' + a.map(q).join(', ') + ']::text[]' : "'{}'::text[]");
export function metricRowsSql(M) {
  return M.CM.METRICS.map((m) => '  (' + [q(m.id), q(m.value), arr(m.ops), m.range ? m.range[0] : 'null', m.range ? m.range[1] : 'null',
    arr(m.subject ? Object.keys(m.subject) : []), m.slotOnly ? 'true' : 'false', arr(m.value === 'effect' ? M.CM.EFFECT_IDS : [])].join(', ') + ')').join(',\n');
}
export function actionIdRowsSql(M) {
  const ids = [];
  for (const k of Object.keys(M.CM.ATTACK_KINDS)) ids.push(['attack_with_item', k]);
  /* ONE item a slot (Tyler 2026-10-21): every crafted food and drink AND every store food and drink; no kinds. */
  for (const r of Object.values(M.CD.CONSUMABLES)) ids.push(['consume', r.id]);
  /* an attack item is an ammo some weapon can shoot: no rune (runes fuel spells only, Tyler 2026-10-23), no whetstone (Andy a41) */
  for (const s of Object.values(M.SUP.SUPPLIES)) if (M.conditions.attackItem(s.id)) ids.push(['attack_with_item', s.id]);
  return ids.sort((a, b) => (a[0] + ':' + a[1] < b[0] + ':' + b[1] ? -1 : 1)).map(([t, i]) => '  (' + q(t) + ', ' + q(i) + ')').join(',\n');
}
export function roleRuleRowsSql(M) {
  const out = [];
  for (const role of Object.keys(M.RS.ROLE_RULES).sort()) {
    M.RS.ROLE_RULES[role].forEach((s, i) => out.push('  (' + q(role) + ', ' + i + ', ' + q(JSON.stringify(s)) + '::jsonb)'));
  }
  return out.join(',\n');
}
export function limitRowsSql(M) {
  return [['max_conditions', M.CM.MAX_CONDITIONS], ['max_stop_rules', M.CM.MAX_STOP_RULES],
    ['stop_hold_max_ms', M.CM.STOP_HOLD_MS.max], ['stop_hold_step_ms', M.CM.STOP_HOLD_MS.step],
    ['max_ignored', M.CM.MAX_IGNORED]].map(([k, v]) => '  (' + q(k) + ', ' + v + ')').join(',\n');
}
const between = (src, tag) => {
  const a = src.indexOf('-- ⟦' + tag + '⟧\n'); const b = src.indexOf('-- ⟦/' + tag + '⟧');
  return a < 0 || b < 0 ? null : src.slice(a + tag.length + 6, b).replace(/\n$/, '');
};

/* ── THE CASES ────────────────────────────────────────────────────────── */

const cases = {
  registry: (M) => {
    const bad = M.CM.validate();
    if (bad.length) return bad.join('; ');
    const g = M.cond.evaluatorGaps();
    return g.missing.length || g.extra.length ? 'metric rows with no evaluator ' + g.missing + ' / evaluators with no row ' + g.extra : null;
  },
  validation: (M) => {
    const P = M.cond.slotProblem;
    const want = [
      [ab('power_strike', [c('self_hp_pct', 'lt', 50)]), null],
      ['power_strike', null], [null, null],
      [ab('power_strike', [c('nope', 'lt', 50)]), 'bad_metric'],
      [ab('power_strike', [c('self_hp_pct', 'has_effect', 50)]), 'bad_op'],
      [ab('power_strike', [c('self_hp_pct', 'lt', 101)]), 'bad_value'],
      [ab('power_strike', [c('self_hp_pct', 'lt', 50.5)]), 'bad_value'],
      [ab('power_strike', [c('ally_hp_pct', 'lt', 50, 'boss')]), 'bad_subject'],
      [ab('power_strike', [c('self_hp_pct', 'lt', 50, 'tank')]), 'bad_subject'],
      [ab('power_strike', [c('target_is_boss', 'eq', 1)]), 'bad_value'],
      [ab('power_strike', [c('effect_missing', 'lacks_effect', 'glow')]), 'bad_value'],
      [ab('power_strike', [c('self_hp_pct', 'lt', 1), c('self_hp_pct', 'lt', 2), c('self_hp_pct', 'lt', 3)]), null],
      [ab('power_strike', [c('self_hp_pct', 'lt', 1), c('self_hp_pct', 'lt', 2), c('self_hp_pct', 'lt', 3), c('self_hp_pct', 'lt', 4)]), 'too_many_conditions'],
      /* A slot's conditions all must match (Tyler 10-19): a slot never joins 'or'. */
      [ab('power_strike', [c('self_hp_pct', 'lt', 50), c('self_mana_pct', 'lt', 50)], 'or'), 'bad_join'],
      [ab('power_strike', [], 'xor'), 'bad_join'],
      [ab('no_such'), 'bad_action'], [slot('consume', 'iron_arrows'), 'bad_action'], [slot('attack_with_item', 'cooked_shrimp'), 'bad_action'],
      /* ONE item a slot (Tyler 2026-10-21): a crafted food or a store food; the retired "Any food" is refused in words. */
      [slot('consume', 'cooked_shrimp'), null], [slot('consume', 'salted_shrimp'), null], [slot('consume', 'food'), 'choose_item'], [slot('consume', 'drink'), 'choose_item'],
      [slot('attack_with_item', 'iron_arrows', [c('enemies_in_aoe', 'gte', 3)]), null],
      [Object.assign(ab('power_strike'), { when: 1 }), 'bad_slot'],
      /* Runes fuel spells only (Tyler 2026-10-23): no attack slot names one. */
      [slot('attack_with_item', 'chalked_fire_rune'), 'bad_action'],
      /* A whetstone sharpens a Melee weapon worn in the ammo slot and is no one's shot (Andy a41: a bow loosed 1,012 Copper
         Whetstones from an attack slot): no attack slot names one (attackItem, the server's hr_hunt_action_ids). */
      [slot('attack_with_item', 'copper_whetstone'), 'bad_action'], [slot('attack_with_item', 'steel_whetstone'), 'bad_action'],
      [slot('attack_with_item', 'iron_bolts'), null],
      /* ON / OFF and the IGNORED MONSTERS (Tyler 2026-10-19; the server's hr_hunt_slot_check, the same refusals). */
      [Object.assign(ab('power_strike'), { enabled: false }), null], [Object.assign(ab('power_strike'), { enabled: 'no' }), 'bad_enabled'],
      [Object.assign(ab('fireball'), { ignore: ['rat', 'slime'] }), null],
      [Object.assign(ab('fireball'), { ignore: ['no_such_monster'] }), 'bad_ignore'], [Object.assign(ab('fireball'), { ignore: ['rat', 'rat'] }), 'bad_ignore'],
      [Object.assign(ab('fireball'), { ignore: 'rat' }), 'bad_ignore'],
      [Object.assign(ab('fireball'), { ignore: Object.keys(M.MONSTERS).slice(0, M.CM.MAX_IGNORED + 1) }), 'too_many_ignored'],
    ];
    for (const [s, err] of want) {
      const p = P(s);
      if ((p && p.error) !== (err || undefined) && !(err === null && p === null)) return JSON.stringify(s) + ' answered ' + JSON.stringify(p) + ', not ' + err;
    }
    if ((M.cond.barProblem(Array(21).fill(null), 20) || {}).error !== 'too_many_slots') return 'a 21-slot bar was taken';
    if ((M.cond.barProblem([null, ab('nope')], 20) || {}).slot !== 1) return 'a bar refusal does not name its slot';
    const S = M.cond.stopRulesProblem;
    if (S([{ conditions: [c('self_mana_pct', 'lt', 20)], forMs: 30000 }]) !== null) return 'a valid stop rule was refused';
    if (S([{ conditions: [c('self_mana_pct', 'lt', 20), c('self_hp_pct', 'lt', 20)], join: 'or' }]) !== null) return 'a stop rule joined any was refused';
    if ((S([{ conditions: [c('enemies_in_aoe', 'gte', 2)] }]) || {}).error !== 'bad_metric') return 'a stop rule took a slot-only metric';
    if ((S([{ conditions: [c('item_qty', 'lt', 5, 'item')] }]) || {}).error !== 'bad_subject') return 'a stop rule took the slot item';
    if ((S([{ conditions: [c('self_mana_pct', 'lt', 20)], forMs: 150 }]) || {}).error !== 'bad_hold') return 'a hold off the sub-step grid was taken';
    if ((S([{ conditions: [] }]) || {}).error !== 'bad_stop_rule') return 'an empty stop rule was taken';
    return (S([1, 2, 3, 4].map(() => ({ conditions: [c('self_hp_pct', 'lt', 5)] }))) || {}).error === 'too_many_stop_rules' ? null : 'four stop rules were taken';
  },
  footprint: (M) => {
    const got = [1, 2, 3, 4, 5].map((n) => M.cond.footprint(n).join('..')).join(' ');
    if (got !== '0..0 0..1 -1..1 -1..2 -2..2') return 'footprints ' + got;
    const aim = { x: 10, y: 10 };
    return M.cond.inFootprint(aim, 4, { x: 12, y: 12 }) && !M.cond.inFootprint(aim, 4, { x: 8, y: 10 }) ? null : 'the 4x4 is not aligned south-east of its aim';
  },
  'enemies-in-aoe': (M) => {
    /* Five rats in a plus, the hero (a ranger, range 7) west of them: a 3x3 on the centre covers 5, the arm-ends cover 2. */
    const h = hero(M, 1, 11, 3, { role: 'ranger' });
    const ms = [[15, 3], [14, 3], [16, 3], [15, 2], [15, 4]].map(([x, y], i) => mon(M, 10 + i, 0, x, y, { target: 1 }));
    const inst = instOf(M, world(M, [h, ...ms]));
    const row = heroRow(M, { range: 7 });
    inst.heroes = { 1: row };
    const count = (n) => M.cond.bestAim(inst, h, 7, n).count;
    if (count(3) !== 5 || count(1) !== 1) return 'best aim counts ' + count(3) + ' (3x3) / ' + count(1) + ' (1x1), want 5 / 1';
    const t = (size, v) => M.cond.testSlot(inst, h, Object.assign(row, { items: Object.assign({}, M.ITEMS, { iron_arrows: { ...M.ITEMS.iron_arrows, area: size } }) }),
      slot('attack_with_item', 'iron_arrows', [c('enemies_in_aoe', 'gte', v)])).pass;
    if (!t(3, 5) || t(3, 6) || t(1, 2)) return 'enemies_in_aoe did not read the slot item\'s footprint';
    /* A CLEAVE reads its swing (abilities.js: its target and the rest beside the hero, up to maxHits 3), not a footprint of 1. */
    const cleaveCount = (spots, ignore) => {
      const hm = hero(M, 1, 6, 6, { role: 'melee_dps' });
      const around = spots.map(([x, y], i) => mon(M, 10 + i, 0, x, y, { target: 1 }));
      const ci = instOf(M, world(M, [hm, ...around]));
      const cr = heroRow(M, { range: 1 });
      ci.heroes = { 1: cr };
      const n = (v) => M.cond.testSlot(ci, hm, cr, Object.assign(ab('cleave', [c('enemies_in_aoe', 'gte', v)]), ignore ? { ignore } : {})).pass;
      return [1, 2, 3, 4].filter(n).length;
    };
    const four = [[7, 6], [5, 6], [6, 5], [6, 7]];
    if (cleaveCount(four) !== 3) return 'a Cleave beside four reads ' + cleaveCount(four) + ', want its maxHits 3';
    if (cleaveCount([[7, 6]]) !== 1) return 'a Cleave beside one reads ' + cleaveCount([[7, 6]]);
    if (cleaveCount([[7, 6], [6, 5]]) !== 2) return 'a Cleave beside two reads ' + cleaveCount([[7, 6], [6, 5]]);
    if (cleaveCount([[7, 6], [9, 9]]) !== 1) return 'a Cleave counted a monster out of its swing';
    if (cleaveCount([[7, 6]], ['rat']) !== 0) return 'a Cleave with nothing it may swing at read a crowd';
    /* An aim out of sight does not count: wall the plus off. */
    return null;
  },
  'priority-fallback': (M) => {
    const run = (hp) => {
      const h = hero(M, 1, 12, 3, { role: 'tank', hp, maxHp: 100, mana: 100, maxMana: 100 });
      const inst = instOf(M, world(M, [h, mon(M, 10, 0, 13, 3, { target: 1, hp: 500, maxHp: 500 })]));
      inst.heroes = { 1: heroRow(M, { slots: rows([ab('power_strike', [c('self_hp_pct', 'lt', 50)], 'and', 'ps'), ab('cleave', [], 'and', 'cl')]) }) };
      const sc = subStep(0); sc.rng = M.rng.createRng(7);
      M.abilities.castAbilities(inst, sc);
      return sc.events.filter((e) => e.type === 'cast').map((e) => e.ability + '#' + e.rule + ':' + e.pass).join();
    };
    const a = run(40); const b = run(90);
    return a === 'power_strike#ps:1' && b === 'cleave#cl:0' ? null : 'at 40% fired ' + a + ', at 90% fired ' + b;
  },
  join: (M) => {
    const h = hero(M, 1, 12, 3, { hp: 40, maxHp: 100, mana: 90, maxMana: 100 });
    const inst = instOf(M, world(M, [h]));
    const r = heroRow(M);
    const s = (j) => M.cond.testSlot(inst, h, r, ab('power_strike', [c('self_hp_pct', 'lt', 50), c('self_mana_pct', 'lt', 50)], j));
    const a = s('and'); const o = s('or');
    return !a.pass && o.pass && a.mask === 1 && o.mask === 1 ? null : 'and ' + JSON.stringify([a.pass, a.mask]) + ' or ' + JSON.stringify([o.pass, o.mask]);
  },
  'ally-subject': (M) => {
    const run = (tankHp) => {
      const d = hero(M, 1, 6, 3, { role: 'healer', hp: 100, maxHp: 100, mana: 300, maxMana: 300 });
      const k = hero(M, 2, 8, 3, { role: 'tank', hp: tankHp, maxHp: 100 });
      const m = hero(M, 3, 7, 4, { role: 'mage', hp: 10, maxHp: 100 });
      const inst = instOf(M, world(M, [d, k, m, mon(M, 10, 0, 9, 3, { target: 2, hp: 500, maxHp: 500 })]));
      inst.heroes = { 1: heroRow(M, { range: 7, slots: rows([ab('greater_mend', [c('ally_hp_pct', 'lt', 80, 'tank')])]), session: { bag: { ...HEAL_RUNES } } }) };
      const sc = subStep(0); sc.rng = M.rng.createRng(3);
      M.abilities.castAbilities(inst, sc);
      return sc.events.filter((e) => e.type === 'heal').map((e) => e.t).join();
    };
    const a = run(75); const b = run(85);
    return a === '2' && b === '' ? null : 'tank at 75%: healed ' + (a || 'nobody') + '; tank at 85%: healed ' + (b || 'nobody');
  },
  /* RESTORATION'S FRIEND SHIELD AND THE HEAL AIMED AT YOURSELF (roadmap p22, p23): Protective Ward shields the wounded
     ally its conditions name (an Earth rune spell, version I's 30 at level 1) and never over a shield still standing; a
     Greater Mend aimed at YOURSELF heals the healer at 60% though the tank is lower, and waits while the healer is
     at 80%. */
  'friend-shield-and-yourself': (M) => {
    const run = (slots, hps, tankShield) => {
      const d = hero(M, 1, 6, 3, { role: 'healer', hp: hps[0], maxHp: 100, mana: 300, maxMana: 300 });
      const k = hero(M, 2, 8, 3, { role: 'tank', hp: hps[1], maxHp: 100, shield: tankShield || 0 });
      const inst = instOf(M, world(M, [d, k, mon(M, 10, 0, 9, 3, { target: 2, hp: 500, maxHp: 500 })]));
      inst.heroes = { 1: heroRow(M, { range: 7, slots: rows(slots), session: { bag: { ...HEAL_RUNES } } }) };
      const sc = subStep(0); sc.rng = M.rng.createRng(3);
      M.abilities.castAbilities(inst, sc);
      return { k, ev: sc.events };
    };
    const ward = ab('protective_ward', [c('ally_hp_pct', 'lt', 90, 'lowest')]);
    const a = run([ward], [100, 60]);
    const sh = a.ev.find((e) => e.type === 'shield');
    if (!sh || sh.u !== 1 || sh.t !== 2 || a.k.shield !== sh.amount || sh.amount !== M.AD.ABILITIES.protective_ward.shield) return 'Protective Ward did not shield the wounded tank: ' + JSON.stringify(sh);
    if (run([ward], [100, 60], 12).ev.some((e) => e.type === 'cast')) return 'Protective Ward recast over a standing shield';
    const self = ab('greater_mend', [c('ally_hp_pct', 'lt', 70, 'self')]);
    const heal = run([self], [60, 30]).ev.find((e) => e.type === 'heal');
    if (!heal || heal.t !== 1) return 'a Greater Mend aimed at yourself healed ' + (heal ? 'unit ' + heal.t : 'nobody') + ' (want the healer, 1)';
    return run([self], [80, 30]).ev.some((e) => e.type === 'heal') ? 'a Greater Mend aimed at yourself healed while the healer stood at 80%' : null;
  },
  'consume-slot': (M) => {
    const run = (hp, slots, bag) => {
      const h = hero(M, 1, 12, 3, { hp, maxHp: 100, mana: 100, maxMana: 100 });
      const inst = instOf(M, world(M, [h]));
      inst.heroes = { 1: heroRow(M, { slots: rows(slots), session: { bag } }) };
      const sc = subStep(0);
      M.consumables.consume(inst, sc);
      return sc.events.filter((e) => e.type === 'eat').map((e) => e.item + '#' + e.rule).join();
    };
    const bag = { cooked_shrimp: { loaded: 3 }, cooked_trout: { loaded: 0 } };
    /* NO HIDDEN EAT-AT (Tyler 2026-10-23, c21/c24): a food slot with no conditions eats whenever it is ready, so at 85%;
       at full HP it has nothing to restore and is not ready. A slot's own condition is the only threshold. */
    if (run(85, [slot('consume', 'cooked_shrimp', [], 'and', 'sh')], bag) !== 'cooked_shrimp#sh') return 'a food slot with no conditions did not eat at 85% (a hidden eat-at stands behind it)';
    if (run(100, [slot('consume', 'cooked_shrimp', [], 'and', 'sh')], bag) !== '') return 'a food slot ate at full HP';
    if (run(85, [slot('consume', 'cooked_shrimp', [c('self_hp_pct', 'lt', 50)], 'and', 'f50')], bag) !== '') return 'an eat slot at 50% ate at 85%';
    if (run(85, [slot('consume', 'cooked_shrimp', [c('self_hp_pct', 'lt', 90)], 'and', 'f90')], bag) !== 'cooked_shrimp#f90') return 'an eat slot at 90% did not eat at 85%';
    /* An empty item falls back to the next slot. */
    const fb = run(40, [slot('consume', 'cooked_trout', [], 'and', 'tr'), slot('consume', 'cooked_shrimp', [], 'and', 'sh')], bag);
    return fb === 'cooked_shrimp#sh' ? null : 'an empty trout slot fell back to ' + (fb || 'nothing');
  },
  /* NO HIDDEN DEFAULT ON AN ABILITY EITHER (c21): an Arcane Barrier slot with no conditions fires at 95% HP (the old hidden
     trigger held it to under 85%); the Mage's ROLE rule set carries that trigger as a REAL condition on its slot, so the
     default bar behaves as before and the screen shows why. A new slot starts with it written on it. */
  'no-hidden-defaults': (M) => {
    const cast = (bar) => {
      const h = hero(M, 1, 12, 3, { role: 'mage', hp: 95, maxHp: 100, mana: 300, maxMana: 300 });
      const inst = instOf(M, world(M, [h, mon(M, 10, 0, 16, 3, { target: 1, hp: 500, maxHp: 500 })]));
      inst.heroes = { 1: heroRow(M, { range: 7, slots: bar, session: { bag: { ...HEAL_RUNES } } }) };
      const sc = subStep(0); sc.rng = M.rng.createRng(3);
      M.abilities.castAbilities(inst, sc);
      return sc.events.filter((e) => e.type === 'cast').map((e) => e.ability).join();
    };
    if (cast(rows([ab('arcane_barrier')])) !== 'arcane_barrier') return 'an Arcane Barrier slot with no conditions held back at 95% HP (a hidden trigger)';
    const role = M.cond.heroSlots([], 'mage').find((r) => r.slot.action.id === 'arcane_barrier');
    if (!role || JSON.stringify(role.slot.conditions) !== JSON.stringify([c('self_hp_pct', 'lt', M.AD.ABILITIES.arcane_barrier.whenBelowPct)])) return 'the Mage\'s default Arcane Barrier does not carry its trigger: ' + JSON.stringify(role && role.slot);
    if (cast(M.cond.heroSlots([], 'mage').filter((r) => r.slot.action.id === 'arcane_barrier')) !== '') return 'the default Arcane Barrier fired at 95% HP';
    const start = M.cond.suggestedConditions({ type: 'ability', id: 'greater_mend' });
    return JSON.stringify(start) === JSON.stringify([c('ally_hp_pct', 'lt', M.AD.ABILITIES.greater_mend.whenBelowPct, 'lowest')]) ? null : 'a new Greater Mend slot starts with ' + JSON.stringify(start);
  },
  /* ON / OFF AND IGNORED MONSTERS (Tyler 2026-10-19 Configure action; c23): a slot switched Off never fires (and still holds
     its lane: no role default stands in); a slot never fires while its hero fights a monster it ignores, never takes one as
     a single target, and an area slot never aims at one. */
  'slot-switch-and-ignore': (M) => {
    const fight = (bar, mons, target) => {
      const h = hero(M, 1, 12, 3, { role: 'tank', hp: 100, maxHp: 100, mana: 300, maxMana: 300, target });
      const inst = instOf(M, world(M, [h, ...mons.map(([id, x, y, kind]) => mon(M, id, 0, x, y, { target: 1, kind, hp: 5000, maxHp: 5000 }))]));
      inst.heroes = { 1: heroRow(M, { range: 1, slots: M.cond.heroSlots(bar, 'tank') }) };
      const sc = subStep(0); sc.rng = M.rng.createRng(9);
      M.abilities.castAbilities(inst, sc);
      return sc.events.filter((e) => e.type === 'cast').map((e) => e.ability + '@' + e.t).join();
    };
    const off = Object.assign(ab('power_strike'), { enabled: false });
    if (fight([off, ab('cleave')], [[10, 13, 3, 'rat']], 10) !== 'cleave@10') return 'an Off Power Strike above Cleave: ' + fight([off, ab('cleave')], [[10, 13, 3, 'rat']], 10);
    if (fight([off], [[10, 13, 3, 'rat']], 10) !== '') return 'a bar whose only ability is Off cast ' + fight([off], [[10, 13, 3, 'rat']], 10) + ' (a role default stood in)';
    const ign = Object.assign(ab('power_strike'), { ignore: ['rat'] });
    if (fight([ign, ab('cleave')], [[10, 13, 3, 'rat']], 10) !== 'cleave@10') return 'Power Strike ignoring rats fired at a rat: ' + fight([ign, ab('cleave')], [[10, 13, 3, 'rat']], 10);
    if (fight([ign, ab('cleave')], [[10, 13, 3, 'slime']], 10) !== 'power_strike@10') return 'Power Strike ignoring rats did not fire at a slime';
    /* while its hero fights a rat, Power Strike ignoring rats waits even with a slime beside it (it fires at the
       slime once the slime is the hero's target) */
    const pair = [[10, 13, 3, 'rat'], [11, 13, 4, 'slime']];
    if (fight([ign], pair, 10) !== '') return 'Power Strike ignoring rats fired while its hero fought a rat: ' + fight([ign], pair, 10);
    if (fight([ign], pair, 11) !== 'power_strike@11') return 'CONTROL: Power Strike ignoring rats did not fire at the slime it fights: ' + fight([ign], pair, 11);
    /* AN IGNORE LIST BINDS ONLY A SLOT THAT AIMS AT MONSTERS (Coordinator 2026-10-23): a hero hit by an ignored
       monster still eats, drinks and heals. A food slot and a Greater Mend slot each ignoring rats fire while their
       hero fights a rat exactly as while it fights a slime. */
    const eat = (kind) => {
      const h = hero(M, 1, 12, 3, { hp: 40, maxHp: 100, mana: 100, maxMana: 100, target: 10 });
      const inst = instOf(M, world(M, [h, mon(M, 10, 0, 13, 3, { target: 1, kind, hp: 500, maxHp: 500 })]));
      inst.heroes = { 1: heroRow(M, { slots: rows([Object.assign(slot('consume', 'cooked_shrimp', [c('self_hp_pct', 'lt', 50)], 'and', 'sh'), { ignore: ['rat'] })]),
        session: { bag: { cooked_shrimp: { loaded: 3 } } } }) };
      const sc = subStep(0);
      M.consumables.consume(inst, sc);
      return sc.events.filter((e) => e.type === 'eat').length;
    };
    if (eat('rat') !== 1 || eat('slime') !== 1) return 'a food slot ignoring rats ate ' + eat('rat') + ' fighting a rat and ' + eat('slime') + ' fighting a slime (want 1 and 1)';
    const mend = (kind) => {
      const h = hero(M, 1, 12, 3, { role: 'healer', hp: 40, maxHp: 100, mana: 300, maxMana: 300, target: 10 });
      const inst = instOf(M, world(M, [h, mon(M, 10, 0, 13, 3, { target: 1, kind, hp: 500, maxHp: 500 })]));
      inst.heroes = { 1: heroRow(M, { range: 7, slots: M.cond.heroSlots([Object.assign(ab('greater_mend', [c('ally_hp_pct', 'lt', 70, 'lowest')]), { ignore: ['rat'] })], 'healer'), session: { bag: { ...HEAL_RUNES } } }) };
      const sc = subStep(0); sc.rng = M.rng.createRng(9);
      M.abilities.castAbilities(inst, sc);
      return sc.events.filter((e) => e.type === 'cast' && e.ability === 'greater_mend').length;
    };
    if (mend('rat') !== 1 || mend('slime') !== 1) return 'a Greater Mend slot ignoring rats cast ' + mend('rat') + ' fighting a rat and ' + mend('slime') + ' fighting a slime (want 1 and 1)';
    /* the hero's own target (a slime) is out of reach and a rat stands next to it: the rat is no target for this slot */
    if (fight([ign], [[10, 13, 3, 'rat'], [11, 16, 3, 'slime']], 11) !== '') return 'Power Strike ignoring rats took the rat beside it: ' + fight([ign], [[10, 13, 3, 'rat'], [11, 16, 3, 'slime']], 11);
    /* an area slot ignoring rats aims at the lone slime, never the pack of rats */
    const fb = Object.assign(ab('fireball', [c('enemies_in_aoe', 'gte', 1)]), { ignore: ['rat'] });
    const aimed = (bar) => {
      const h = hero(M, 1, 9, 3, { role: 'mage', hp: 100, maxHp: 100, mana: 300, maxMana: 300, target: 13 });
      const inst = instOf(M, world(M, [h, ...[[10, 15, 2, 'rat'], [11, 15, 3, 'rat'], [12, 15, 4, 'rat'], [13, 14, 6, 'slime']].map(([id, x, y, kind]) => mon(M, id, 0, x, y, { target: 1, kind, hp: 5000, maxHp: 5000 }))]));
      inst.heroes = { 1: heroRow(M, { range: 7, slots: M.cond.heroSlots(bar, 'mage'), session: { bag: { chalked_fire_rune: { loaded: 5 } } } }) };
      const sc = subStep(0); sc.rng = M.rng.createRng(9);
      M.abilities.castAbilities(inst, sc);
      return sc.events.filter((e) => e.type === 'cast').map((e) => e.ability + '@' + e.t).join();
    };
    if (aimed([ab('fireball', [c('enemies_in_aoe', 'gte', 1)])]) !== 'fireball@11') return 'CONTROL: Fireball with nothing ignored did not aim at the rats\' centre: ' + aimed([ab('fireball', [c('enemies_in_aoe', 'gte', 1)])]);
    return aimed([fb]) === 'fireball@13' ? null : 'a Fireball ignoring rats aimed ' + aimed([fb]);
  },
  'attack-item': (M) => {
    const r = runShots(M, { burst: 4 });
    if (r.shots.filter((s) => s.item === 'iron_arrows').length !== 4) return 'the 3x3 slot shot ' + JSON.stringify(r.shots);
    if (r.left !== 0) return 'the 3x3 stack has ' + r.left + ' left after 4 shots of 4';
    if (!r.shots.some((s) => s.hits > 1)) return 'no area shot hit more than one monster';
    if (r.dmgPerShot.some((n, i) => n !== r.shots[i].hits)) return 'a shot did not roll once per monster in its footprint: ' + JSON.stringify(r.dmgPerShot);
    const after = r.shots.slice(4);
    return after.length && after.every((s) => s.item === 'bronze_arrows' && s.rule === 'bz') ? null
      : 'once the 3x3 stack was empty the next slot did not take over: ' + JSON.stringify(after.slice(0, 3));
  },
  /* The death explanation's input: a rule whose conditions held but that could not fire says why, ONCE. */
  'rule-wait': (M) => {
    const h = hero(M, 1, 12, 3, { role: 'tank', hp: 30, maxHp: 100, mana: 0, maxMana: 100 });
    const inst = instOf(M, world(M, [h, mon(M, 10, 0, 13, 3, { target: 1, hp: 500, maxHp: 500 })]));
    inst.heroes = { 1: heroRow(M, { slots: rows([ab('power_strike', [c('self_hp_pct', 'lt', 50)], 'and', 'ps')]) }) };
    const sc = subStep(0); sc.rng = M.rng.createRng(2);
    for (let i = 0; i < 30; i++) { sc.atMs = i * 100; M.abilities.castAbilities(inst, sc); }
    const waits = sc.events.filter((e) => e.type === 'rule_wait');
    if (waits.length !== 1 || waits[0].rule !== 'ps' || waits[0].rule_label !== 'power_strike' || waits[0].why !== 'mana' || waits[0].u !== 1) return 'waits ' + JSON.stringify(waits);
    h.mana = 100; sc.atMs = 3000; M.abilities.castAbilities(inst, sc);
    if (!sc.events.some((e) => e.type === 'cast' && e.rule === 'ps') || h.ruleWait !== null) return 'the rule fired but its wait was not cleared: ' + JSON.stringify(h.ruleWait);
    for (let i = 0; i < 30; i++) { sc.atMs = 3100 + i * 100; M.abilities.castAbilities(inst, sc); }
    const cd = sc.events.filter((e) => e.type === 'rule_wait').slice(1);
    return cd.length === 1 && cd[0].why === 'cooldown' ? null : 'after the cast the waits were ' + JSON.stringify(cd);
  },
  /* STABLE RULE IDS: a reorder keeps every rule's id; an edit changes only the edited slot's; a repeat is unique. */
  'stable-ids': (M) => {
    const A = ab('power_strike', [c('self_hp_pct', 'lt', 50)]); const B = ab('cleave'); const C2 = slot('consume', 'cooked_shrimp', [c('self_hp_pct', 'lt', 40)]);
    const ids = (list) => Object.fromEntries(M.cond.heroSlots(list, null).filter((r) => !r.rule.startsWith('d_')).map((r) => [r.slot.action.id + JSON.stringify(r.slot.conditions), r.rule]));
    const one = ids([A, B, C2]); const re = ids([C2, null, B, A]);
    if (JSON.stringify(Object.entries(one).sort()) !== JSON.stringify(Object.entries(re).sort())) return 'a reorder changed ids: ' + JSON.stringify([one, re]);
    const A2 = ab('power_strike', [c('self_hp_pct', 'lt', 60)]);
    const ed = ids([A2, B, C2]);
    const same = Object.keys(ed).filter((k) => one[k] === ed[k]);
    if (same.length !== 2 || Object.values(ed).includes(one[Object.keys(one)[0]])) return 'an edit to one slot moved other ids: ' + JSON.stringify([one, ed]);
    const dup = M.cond.heroSlots([B, B], null).filter((r) => r.slot.action.id === 'cleave').map((r) => r.rule);
    if (dup.length !== 2 || dup[0] === dup[1]) return 'two identical slots share an id: ' + dup;
    /* A stamped id wins over the hash, so the server's id is what the engine reports. */
    return M.cond.heroSlots([ab('cleave', [], 'and', 'srv1')], null)[0].rule === 'srv1' ? null : 'the stored id was not kept';
  },
  /* THE BAR / STOP RULES CHANGE MID-HUNT: state keyed by id survives a move, an id that is gone is dropped. */
  'rekey': (M) => {
    const h = hero(M, 1, 12, 3, { mana: 10, maxMana: 100 });
    const inst = instOf(M, world(M, [h]));
    const keep = { id: 'keep', conditions: [c('self_mana_pct', 'lt', 20)], forMs: 60000 };
    const gone = { id: 'gone', conditions: [c('self_mana_pct', 'lt', 30)], forMs: 60000 };
    const r = heroRow(M, { slots: rows([ab('cleave', [], 'and', 'w1'), ab('power_strike', [], 'and', 'w2')]), stopRules: M.cond.heroStopRules([keep, gone]) });
    inst.heroes = { 1: r };
    h.ruleWait = { ability: 'w1:mana', consume: 'zz:busy' };
    const sc = subStep(0);
    for (let i = 0; i < 5; i++) { sc.atMs = i * 100; M.cond.checkStopRules(inst, sc); }
    if (!h.ruleHold || h.ruleHold.keep !== 500 || h.ruleHold.gone !== 500) return 'holds before the edit ' + JSON.stringify(h.ruleHold);
    if (!h.ruleWait || h.ruleWait.ability !== 'w1:mana' || h.ruleWait.consume) return 'a wait on a rule that is not on the bar survived: ' + JSON.stringify(h.ruleWait);
    /* The player reorders the stop rules, drops one, and moves w1 to the end of the bar. */
    r.stopRules = M.cond.heroStopRules([keep]);
    r.slots = rows([ab('power_strike', [], 'and', 'w2'), ab('cleave', [], 'and', 'w1')]);
    sc.atMs = 500; M.cond.checkStopRules(inst, sc);
    if (!h.ruleHold || h.ruleHold.keep !== 600 || 'gone' in h.ruleHold) return 'after the edit holds are ' + JSON.stringify(h.ruleHold);
    if (!h.ruleWait || h.ruleWait.ability !== 'w1:mana') return 'the moved rule lost its wait: ' + JSON.stringify(h.ruleWait);
    r.slots = rows([ab('power_strike', [], 'and', 'w2')]);
    sc.atMs = 600; M.cond.checkStopRules(inst, sc);
    return h.ruleWait === null ? null : 'a wait on a removed rule survived: ' + JSON.stringify(h.ruleWait);
  },
  /* ONE PACK FOR EVERY GROUP (Tyler 2026-11-08: "the difficulty should be unchanged"): a monster spawns at its row's HP for 1, 2, 3 or 4
     heroes and pays its row's whole kill: XP, every drop chance (a sure one too) and the Hearthfind, untouched. */
  'whole-kill': (M) => {
    const row = M.MONSTERS.drain_rat;
    for (const n of [1, 2, 3, 4]) {
      const w = M.spawn.newHuntWorld(openGround([{ monster: 'drain_rat', x: 16, y: 5 }]), openGrid(M),
        Array.from({ length: n }, () => ({ role: 'tank', maxHp: 100, acc: 900, maxHit: 5, def: 1 })));
      const m = w.units.find((u) => u.side === 'mon');
      if (m.maxHp !== row.hp || 'yieldPm' in m) return n + ' heroes: the monster spawned at ' + m.maxHp + ' HP (the row ' + row.hp + ')' + ('yieldPm' in m ? ' carrying a yield share' : '');
    }
    const ch = M.drops.effectiveDropChance({ ch: 0.2 }); const sure = M.drops.effectiveDropChance({ ch: 1 });
    if (Math.abs(ch - 0.2) > 1e-9 || sure !== 1) return 'drop chances read ' + ch + ' / ' + sure + ', the rows say 0.2 / 1';
    const src = readFileSync(join(M.root, 'src/core/hunt-rewards.js'), 'utf8');
    if (/rng\.chance\(y\)|yieldMult/.test(src)) return 'a kill\'s drops or Hearthfind still read a yield share';
    /* the paid kill, alone: its share before bonuses is the row's whole XP */
    const h = hero(M, 1, 12, 3, { role: 'tank' }); const r = mon(M, 10, 0, 13, 3, { kind: 'drain_rat', hp: 1, maxHp: row.hp });
    const inst = instOf(M, world(M, [h, r])); const sc = subStep(0);
    M.damage.landHit(inst, sc, h, r, 50, null, null);
    const raw = sc.events.filter((e) => e.type === 'xp').reduce((a, e) => a + e.raw, 0);
    return raw === row.xp ? null : 'a lone hero\'s kill paid a share of ' + raw + ' XP, the row says ' + row.xp;
  },
  /* EVERY HERO WALKS EVERY POCKET (Tyler 2026-11-08): a lone hero's route is the ground's, the Rat King's hall included (a warning, never a gate). */
  'every-route': (M) => {
    const sewer = M.grounds.HUNT_GROUNDS.millrace_sewer;
    const king = sewer.pockets.findIndex((p) => p.forParty);
    if (king < 0 || !sewer.route.includes(king)) return 'the King\'s hall is not on the Sewer\'s route';
    /* A lone hero that cannot fall walks the real sewer until its route loops twice: it pulls the King's hall. */
    const { ground, grid } = M.hg.huntGroundOf('millrace_sewer');
    const w = M.spawn.newHuntWorld(ground, grid, [{ role: 'tank', maxHp: 1e7, hp: 1e7, acc: 1000, maxHit: 400, def: 50 }]);
    const pulls = [];
    for (let i = 0; i < 1500 && w.runs < 2; i++) {
      const r = M.worldstep.stepSwing(w, { ground, grid, heroes: {}, swingMs: 2000, atMs: T0 + i * 2000, rng: M.rng.createRng(M.rng.hashSeed('route', i)) });
      for (const e of r.events) if (e.type === 'pull') pulls.push(e.pocket);
    }
    return w.runs >= 2 && pulls.includes(king) ? null : 'a lone hunt pulled ' + pulls.join(',') + ' (runs ' + w.runs + '), never the King\'s hall ' + king;
  },
  'metrics-misc': (M) => {
    const h = hero(M, 1, 12, 3, { target: 10 });
    const boss = mon(M, 10, 0, 13, 3, { kind: 'rat_king', target: 1, statuses: [{ s: 'bleed', src: 1, left: 1000, next: 1000, scale: 1000 }] });
    const inst = instOf(M, world(M, [h, boss]));
    const r = heroRow(M, { session: { bag: { cooked_shrimp: { loaded: 7 }, iron_arrows: { loaded: 3 } } }, ammo: 'iron_arrows' });
    const holds = (cond, s) => M.cond.holds({ inst, u: h, h: r, slot: s || ab('power_strike') }, cond);
    const bad = [
      [c('target_is_boss', 'eq', true), true], [c('target_is_boss', 'eq', false), false],
      [c('item_qty', 'eq', 7, 'food'), true], [c('item_qty', 'eq', 3, 'ammo'), true],
      [c('effect_missing', 'has_effect', 'bleed', 'target'), true], [c('effect_missing', 'lacks_effect', 'bleed', 'self'), true],
      [c('effect_missing', 'lacks_effect', 'bleed', 'ally'), true],
    ].filter(([cond, want]) => holds(cond) !== want);
    if (holds(c('item_qty', 'eq', 7, 'item'), slot('consume', 'cooked_shrimp')) !== true) bad.push(['the slot item of a food slot']);
    return bad.length ? 'wrong: ' + JSON.stringify(bad) : null;
  },
  'stop-rule': (M) => {
    const h = hero(M, 1, 12, 3, { mana: 10, maxMana: 100 });
    const inst = instOf(M, world(M, [h]));
    const r = heroRow(M, { stopRules: M.cond.heroStopRules([{ id: 'low_mana', conditions: [c('self_mana_pct', 'lt', 20)], join: 'and', forMs: 1000 }]) });
    inst.heroes = { 1: r };
    const sc = subStep(0);
    for (let i = 0; i < 5; i++) { sc.atMs = i * 100; M.cond.checkStopRules(inst, sc); }
    h.mana = 50; sc.atMs = 500; M.cond.checkStopRules(inst, sc);
    if (h.ruleHold !== null || typeof r.hs.ruleStop === 'string') return 'a break did not reset the hold: ' + JSON.stringify(h.ruleHold);
    h.mana = 10;
    for (let i = 0; i < 9; i++) { sc.atMs = 600 + i * 100; M.cond.checkStopRules(inst, sc); }
    if (typeof r.hs.ruleStop === 'string') return 'the rule fired after 900 ms of a 1000 ms hold';
    sc.atMs = 1500; M.cond.checkStopRules(inst, sc);
    if (r.hs.ruleStop !== 'low_mana' || !sc.events.some((e) => e.type === 'rule_stop' && e.rule === 'low_mana')) return 'the rule did not fire at 1000 ms held';
    return M.AR.endReasonAt(r.hs, 2000) === 'rule' ? null : 'the end order does not end a met stop rule: ' + M.AR.endReasonAt(r.hs, 2000);
  },
  /* The Druid's stop rule (always true, held 5 s) ends ITS hunt `rule`, the others hunt on; cut into windows
     every 2 s (shorter than the hold) the instance is identical, so the hold survives a settle cut. */
  'stop-rule-span': (M) => {
    const o = { spanMs: 20000, druidStop: [{ conditions: [c('self_mana_pct', 'lt', 101)], join: 'and', forMs: 5000 }] };
    const whole = runParty(M, [], o);
    const cut = runParty(M, [2000, 4000, 6000, 8000, 10000, 12000], o);
    const e = whole.ended.find((x) => x.reason === 'rule');
    if (!e || whole.ended.length !== 1) return 'the druid did not end alone on its rule: ' + JSON.stringify(whole.ended);
    if (!whole.members.find((m) => m.key === 'c-druid').hs.endedReason) return 'the druid\'s session is not ended';
    return whole.key === cut.key ? null : 'a settle cut changed when the stop rule fired: ' + JSON.stringify(cut.ended);
  },
  density: (M) => {
    const g = M.grounds.HUNT_GROUNDS.millrace_sewer;
    const got = [M.grounds.densityFor(g, 1, 16), M.grounds.densityFor(g, 3, 16), M.grounds.densityFor(g, 4, 9), M.grounds.densityFor(g, 1, 0)].join();
    if (got !== '8,10,9,0') return 'densityFor answered ' + got + ' (want an over-max pick clamped to 8 solo, 10 for three; a pick under the max kept; none = as built)';
    for (const row of Object.values(M.grounds.HUNT_GROUNDS)) {
      if (!row.densityMax || row.densityMax.some((v) => v < M.grounds.DENSITY_FULL_BOX)) return row.id + ' allows less than a full box: ' + row.densityMax;
    }
    const pack = (d) => {
      const w = M.spawn.newHuntWorld(openGround(BLOCK('rat').slice(0, 4)), openGrid(M), [{ role: 'tank', maxHp: 100, acc: 900, maxHit: 5, def: 1, density: d }]);
      return w.units.filter((u) => u.side === 'mon').map((u) => u.x + ',' + u.y).join(' ');
    };
    const one = pack(0).split(' ').length; const two = pack(8).split(' ').length;
    if (one !== 4 || two !== 8) return 'density 0 / 8 spawned ' + one + ' / ' + two + ' monsters, want 4 (as built) / 8';
    return pack(8) === pack(8) ? null : 'a density-8 pack is not placed deterministically';
  },
  /* Tyler 2026-10-18: a FULL BOX. At density 8 the pack fills all eight tiles round a tank that holds still. */
  'full-box': (M) => {
    const ground = openGround([{ monster: 'drain_rat', x: 18, y: 5 }], { start: [[14, 5]] });
    const grid = openGrid(M);
    const w = M.spawn.newHuntWorld(ground, grid, [{ role: 'tank', maxHp: 1000000, hp: 1000000, acc: 0, maxHit: 1, def: 0, density: 8,
      settings: { chase: false, dist: 1 } }]);
    const mons = w.units.filter((u) => u.side === 'mon');
    if (mons.length !== 8) return 'density 8 spawned ' + mons.length;
    /* Already pulled: the pack is on the tank, which holds (chase off, distance 1). */
    const tank = w.units.find((u) => u.side === 'hero');
    w.phase = 'fight'; w.packs[0].aggro = true; w.packs[0].holder = tank.id;
    for (const m of mons) { m.hp = m.maxHp = 1000000; m.target = tank.id; }
    for (let s = 0; s < 20; s++) M.worldstep.stepSwing(w, { ground, grid, heroes: {}, swingMs: 2000, atMs: T0 + s * 2000, rng: M.rng.createRng(M.rng.hashSeed('box', s)) });
    const k = w.units.find((u) => u.side === 'hero');
    if (k.x !== 14 || k.y !== 5) return 'the tank moved to ' + k.x + ',' + k.y;
    const around = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      around.push(w.units.some((u) => u.side === 'mon' && u.alive && u.x === k.x + dx && u.y === k.y + dy) ? 1 : 0);
    }
    const n = around.reduce((a, b) => a + b, 0);
    return n === 8 && w.units.filter((u) => u.side === 'mon' && u.alive).every((m) => m.target === k.id) ? null
      : 'after 40 s only ' + n + ' of the 8 tiles round the tank hold a monster (' + around.join('') + ')';
  },
  /* ONE PACK FOR EVERY GROUP: the same HP for 1, 2 and 4 heroes, and no ground row carries the old party scale. */
  'one-pack': (M) => {
    const hp = (n) => {
      const w = M.spawn.newHuntWorld(openGround([{ monster: 'drain_rat', x: 16, y: 5 }]), openGrid(M),
        Array.from({ length: n }, () => ({ role: 'tank', maxHp: 100, acc: 900, maxHit: 5, def: 1 })));
      return w.units.find((u) => u.side === 'mon').maxHp;
    };
    const got = [1, 2, 4].map(hp).join();
    if (got !== [1, 2, 4].map(() => M.MONSTERS.drain_rat.hp).join()) return 'packs spawned at ' + got + ' HP for 1, 2 and 4 heroes, the row says ' + M.MONSTERS.drain_rat.hp;
    const scaled = Object.values(M.grounds.HUNT_GROUNDS).filter((g) => 'partyScale' in g).map((g) => g.id);
    return scaled.length ? 'grounds still carry a party scale: ' + scaled.join(', ') : null;
  },
  'party-acceptance': (M) => {
    const whole = runParty(M, []);
    const cut = runParty(M, [10000, 26000, 50000, 90000]);
    if (whole.key !== cut.key) return 'the instance cut into windows (the away path) differs from one span';
    const ev = whole.events;
    const ranger = whole.unit('b-ranger'); const druid = whole.unit('c-druid'); const knight = whole.unit('a-knight'); const sorc = whole.unit('d-sorc');
    const shots = ev.filter((e) => e.type === 'shot' && e.u === ranger);
    const havoc = shots.filter((e) => e.item === HAVOC); const burst = shots.filter((e) => e.item === BURST);
    const rm = whole.members.find((m) => m.key === 'b-ranger');
    if (havoc.length !== 6 || rm.hs.bag[HAVOC].left !== 0) return 'the 5x5 slot shot ' + havoc.length + ' of 6, ' + rm.hs.bag[HAVOC].left + ' left';
    if (!burst.length || 500 - rm.hs.bag[BURST].left !== burst.length) return 'the 3x3 slot shot ' + burst.length + ' and spent ' + (500 - rm.hs.bag[BURST].left);
    /* Each shot's footprint IS the metric it was chosen on: a 5x5 at 4+, a 3x3 at 2+. */
    if (havoc.some((e) => e.hits < 4) || burst.some((e) => e.hits < 2)) return 'a shot fired under its threshold: ' + JSON.stringify(shots.filter((e) => e.hits < (e.item === HAVOC ? 4 : 2)).slice(0, 2));
    if (!havoc.some((e) => e.hits >= 4) || havoc.some((e) => e.rule !== 'havoc')) return 'the 5x5 shots did not hit 4+ under rule havoc: ' + JSON.stringify(havoc.slice(0, 2));
    const lastHavoc = havoc[havoc.length - 1].atMs;
    if (!burst.some((e) => e.atMs > lastHavoc && e.rule === 'burst')) return 'the 3x3 slot never took over after the 5x5 ran out';
    const heals = ev.filter((e) => e.type === 'heal' && e.u === druid);
    if (!heals.length || heals.some((e) => e.t !== knight)) return 'the druid healed ' + JSON.stringify(heals.map((e) => e.t)) + ' (the knight is ' + knight + ')';
    const casts = ev.filter((e) => e.type === 'cast' && e.u === sorc && e.ability === 'fireball');
    if (!casts.length) return 'the sorcerer never cast fireball';
    for (const k of casts) {
      const hits = ev.filter((e) => e.type === 'dmg' && e.u === sorc && e.atMs === k.atMs && e.ability === 'fireball').length;
      if (hits < 3) return 'a fireball at density ' + hits + ' (the rule says 3+)';
    }
    /* XP and loot settled ONCE: every monster kill is one tally kill and one bestiary count, never twice. */
    const monKills = ev.filter((e) => e.type === 'kill' && whole.w.units.every((u) => u.id !== e.t || u.side === 'mon')).length;
    const tallied = whole.members.reduce((a, m) => a + m.hs.tally.kills, 0);
    return monKills > 0 && tallied === monKills * whole.members.length ? null
      : 'kills: ' + monKills + ' monster kill events, tallies sum ' + tallied + ' over ' + whole.members.length + ' members';
  },
  /* Both with today's neutral staff blow and with the Healer's POISON (the sim's element): every cellar and first-sewer
     monster takes half of it (vermin, Tyler 2026-11-06: no immunities, so no solo Healer floor either). */
  'solo-healer': (M) => {
    for (const [seed, el] of [[1, ''], [2, ''], [1, 'poison'], [2, 'poison']]) {
      const tag = 'seed ' + seed + (el ? ' (' + el + ')' : '');
      const cellar = freshHealer(M, 'mill_cellar', 10, seed, null, el);
      const ce = cellar.events;
      const spawned = M.grounds.HUNT_GROUNDS.mill_cellar.pockets.reduce((a, p) => a + p.spawns.length, 0);
      if (ce.some((e) => e.type === 'wipe') || ce.some((e) => e.type === 'death')) return tag + ': a fresh solo healer died in the cellar';
      if (!ce.some((e) => e.type === 'pull' && e.pocket === 1) || ce.filter((e) => e.type === 'kill').length < spawned) return tag + ': the cellar was not cleared';
      /* The Thicket is a fresh solo hero's first real ground (Tyler 10-21); the Sewer is a party's: each is held at its own floor. */
      for (const [huntId, level] of [['meadowbrook_thicket', 5], ['millrace_sewer', 8]]) {
        const next = freshHealer(M, huntId, 10, seed, null, el, level);
        const second = next.events.filter((e) => e.type === 'pull').find((e) => e.pocket !== 0);
        if (!second) return tag + ': ' + huntId + '\'s first pocket was never cleared in 10 minutes at Level ' + level;
        const fell = next.events.find((e) => e.type === 'wipe' && e.atMs < second.atMs);
        if (fell) return tag + ': the healer fell in ' + huntId + '\'s first pocket at ' + (fell.atMs - T0) + ' ms';
      }
    }
    return null;
  },
  /* The SETTLE clamps an over-max pick (the stored 4) to the ground's solo max (the sewer's 2): its first pocket spawns twice. */
  /* Tyler P1: the Healer's default rule set (an empty bar) heals first and attacks only when nobody needs healing and it holds the mana (rule-subjects.js SICKNESS_WHEN). */
  'healer-default-rules': (M) => {
    const setup = M.heroSetup({ weaponType: M.roleWeaponOf(M.ITEMS.apprentice_staff), options: { role: 'healer' }, bar: [], partyRoles: [] });
    const run = (allyHp, mana) => {
      const d = hero(M, 1, 6, 3, { role: 'healer', hp: 135, maxHp: 135, mana: mana ?? 300, maxMana: 300 });
      const k = hero(M, 2, 8, 3, { role: 'tank', hp: allyHp, maxHp: 100 });
      const ms = [[9, 3], [10, 3]].map(([x, y], i) => mon(M, 10 + i, 0, x, y, { target: 2, hp: 500, maxHp: 500 }));
      const inst = instOf(M, world(M, [d, k, ...ms]));
      inst.heroes = { 1: heroRow(M, { range: 7, slots: setup.slots, session: { runes: true, bag: { chalked_poison_rune: { loaded: 5 }, ...HEAL_RUNES } } }) };
      const sc = subStep(0); sc.rng = M.rng.createRng(5);
      M.abilities.castAbilities(inst, sc);
      return sc.events.filter((e) => e.type === 'cast').map((e) => e.ability).join();
    };
    const safe = run(95); const hurt = run(60); const spent = run(95, 150);
    if (spent) return 'with the tank at 95% and half its mana the healer cast ' + spent + ': the mana goes to Greater Mend first';
    return safe === 'green_sickness' && hurt === 'greater_mend' ? null : 'with the tank at 95% the healer cast ' + (safe || 'nothing') + '; at 60% ' + (hurt || 'nothing');
  },
  /* NO DEFAULT BAR HOLDS A SPELL IT CAN'T CAST, AND EVERY STYLE'S FIRST FIGHTS FIRE (designer 2026-11-05, lane/a-silent-triggers: a new
     Mage cast nothing for five minutes on a lone monster, and a new Healer's defaults sat struck from minute one). The kit carries no rune
     (Tyler 2026-10-23), so a caster's spells name their store runes and a weapon hero's rune spell is the player's choice ("A spell costs runes").
     Over every worn set of the kit, on the real settle:
     1. no dead slot: every default rune spell names a store row whose partner is its rune;
     2. the first pull fires: a cast of the style's own ability within 5 s of the first pull, the Cellar as built;
     3. a lone monster fires: the same within 30 s, on a Cellar copy with one monster a pocket;
     4. every slot earns its place: in 30 minutes at the Thicket's floor each default ability slot casts, but for WAITS_FOR_OTHERS. */
  'starter-bar-fires': (M) => {
    if (Object.keys(M.kit.START_INVENTORY).some((id) => /_rune$/.test(id))) return 'the start kit carries a rune: re-judge this case';
    const cellar = M.grounds.HUNT_GROUNDS.mill_cellar;
    const lone = Object.assign({}, cellar, { pockets: cellar.pockets.map((p) => Object.assign({}, p, { spawns: p.spawns.slice(0, 1) })) });
    if (!lone.pockets.every((p) => p.spawns.length === 1)) return 'CONTROL: a pocket of the lone-monster Cellar holds no monster';
    const floor = M.HUNTS.meadowbrook_thicket.band[0];
    const SECRET = '-4611686018427387904';
    for (const worn of starterWorn(M)) {
      const name = worn.weapon + (worn.shield ? '+' + worn.shield : '');
      const setup = M.heroSetup({ weaponType: M.roles.wornRoleKey(worn, M.ITEMS), options: {}, bar: [], partyRoles: [] });
      const abilities = setup.slots.filter((r) => r.slot.action.type === 'ability').map((r) => r.slot.action);
      const dead = abilities.filter((a) => { const rune = M.AD.ABILITIES[a.id].rune; return rune && !M.basics.BASIC_SUPPLIES.some((b) => b.id === a.store && b.partner === rune); });
      if (dead.length) return name + ': the starter bar holds ' + dead.map((a) => a.id).join(', ') + ' with no store rune of its family (a rune spell that cannot fire)';
      const within = (ground, ms, tag) => {
        const r = newHeroCasts(M, worn, 'mill_cellar', 1, ground, ms + 60000, SECRET);
        if (r.pullAt === undefined) return name + ': no pull on ' + tag;
        return r.first && r.first.atMs - r.pullAt <= ms ? null : name + ': on ' + tag + ' its first cast of its own ' + (r.first ? 'came ' + (r.first.atMs - r.pullAt) + ' ms' : 'never came in ' + ms + ' ms') + ' after the first pull, want ' + ms + ' ms at most';
      };
      const fires = within(cellar, 5000, 'the Cellar as built') || within(lone, 30000, 'a lone monster');
      if (fires) return fires;
      const earned = newHeroCasts(M, worn, 'meadowbrook_thicket', floor, null, 30 * 60000, SECRET);
      const idle = abilities.filter((a) => !earned.casts[a.id] && !WAITS_FOR_OTHERS[a.id]).map((a) => a.id);
      if (idle.length) return name + ': in 30 minutes at the Thicket\'s floor ' + idle.join(', ') + ' never cast (' + JSON.stringify(earned.casts) + ')';
    }
    return null;
  },
  /* BOTH PATHS (CLAUDE.md §4): a new caster's bar, watched (the 10 s settle the open client asks for) and with the browser closed (the world tick's long window):
     one settle, one result: the same casts at the same moments, the same store bill, gold, XP and bag. A guard on the rows, so a bar that buys has its proof. */
  'starter-bars-both-paths': (M) => {
    const roleOf = (worn) => M.heroSetup({ weaponType: M.roles.wornRoleKey(worn, M.ITEMS), options: {}, bar: [], partyRoles: [] }).role;
    const casters = starterWorn(M).filter((w) => ['mage', 'healer'].includes(roleOf(w)));
    if (casters.length < 2) return 'CONTROL: ' + casters.length + ' caster sets in the kit';
    for (const worn of casters) {
      const play = (windowMs) => {
        const casts = [];
        const r = M.play.run('mill_cellar', 1, [roleOf(worn)], { spanMs: 10 * 60000, windowMs, secret: '42', equipment: () => Object.assign({}, worn), bag: () => kitBag(M), bar: () => [],
          start: () => ({ levelXp: 0, skills: {} }), onWindow: (w) => { for (const e of w.events || []) if (e.type === 'cast') casts.push([e.atMs, e.ability, e.gold || 0]); } });
        return { casts, sum: JSON.stringify([r.totals.buys, r.totals.coin, r.totals.levelXp, r.totals.xp, r.totals.kills, r.totals.falls, r.items, r.members]) };
      };
      const watched = play(10000), closed = play(600000);
      if (watched.casts.length < 3 || !watched.casts.some((c) => M.AD.ABILITIES[c[1]].rune)) return worn.weapon + ': CONTROL: ' + watched.casts.length + ' casts in 10 minutes';
      if (JSON.stringify(watched.casts) !== JSON.stringify(closed.casts)) return worn.weapon + ': the casts differ with the browser closed (' + watched.casts.length + ' watched, ' + closed.casts.length + ' closed)';
      if (watched.sum !== closed.sum) return worn.weapon + ': watched ' + watched.sum.slice(0, 200) + ' but closed ' + closed.sum.slice(0, 200);
    }
    return null;
  },
  /* UNDERTOW ON BOTH PATHS (Tyler 2026-11-09: "a new spell that can only be used when not in a party"; CLAUDE.md §4): the Healer's
     default bar at the Thicket's floor, watched (10 s settles) and with the browser closed (10 min windows). A lone Healer casts
     Undertow on both, the same casts; a tank and a Healer, both alive throughout, never cast it on either, and their paths agree. */
  'undertow-both-paths': (M) => {
    const L = M.HUNTS.meadowbrook_thicket.band[0];
    const play = (roles, windowMs) => {
      const casts = [];
      const r = M.play.run('meadowbrook_thicket', L, roles, { spanMs: 10 * 60000, windowMs, secret: '42', bar: () => [],
        onWindow: (w) => { for (const e of w.events || []) if (e.type === 'cast') casts.push([e.atMs, e.u, e.ability]); } });
      return { casts, n: casts.filter((c) => c[2] === 'undertow').length, falls: r.totals.falls,
        sum: JSON.stringify([r.totals.buys, r.totals.coin, r.totals.levelXp, r.totals.xp, r.totals.kills, r.totals.falls, Object.entries(r.items).sort()]) };
      /* (a party's loot tallies its windows in another key order: the bag compared as sorted pairs) */
    };
    for (const roles of [['healer'], ['tank', 'healer']]) {
      const tag = roles.join(' + ');
      const watched = play(roles, 10000), closed = play(roles, 600000);
      if (watched.falls || closed.falls) return 'CONTROL: ' + tag + ' fell (' + watched.falls + ' watched, ' + closed.falls + ' closed), so a hero was alone for a while';
      if (JSON.stringify(watched.casts) !== JSON.stringify(closed.casts)) return tag + ': the casts differ with the browser closed (' + watched.casts.length + ' watched, ' + closed.casts.length + ' closed)';
      if (watched.sum !== closed.sum) return tag + ': watched ' + watched.sum.slice(0, 160) + ' but closed ' + closed.sum.slice(0, 160);
      if (roles.length === 1 && !(watched.n > 0)) return 'CONTROL: a lone Healer never cast Undertow in 10 minutes';
      if (roles.length > 1 && (watched.n || closed.n)) return tag + ': Undertow cast ' + watched.n + ' times watched and ' + closed.n + ' closed with two heroes alive';
    }
    return null;
  },
  'density-settle': (M) => {
    const out = freshHealer(M, 'millrace_sewer', 1, 1, { density: 16 });
    const w = M.worldstate.decode(JSON.parse(out.world));
    const max = M.grounds.HUNT_GROUNDS.millrace_sewer.densityMax[0];
    const born = M.grounds.HUNT_GROUNDS.millrace_sewer.pockets.map((_, p) => w.units.filter((u) => u.side === 'mon' && u.pocket === p).length);
    if (w.density !== max) return 'the settle ran density ' + w.density + ' for a stored 16 on a solo sewer hunt (max ' + max + ')';
    return born.every((n) => n <= max) && born[1] === max ? null : 'packs spawned ' + born + ', want at most ' + max + ' and a full pocket 1';
  },
  /* Tyler 2026-10-20 (Meadowbrook, "7 each", "only like 2 mobs per pull"): his pick of 7 sat beside a
     partner character who never touched the step (no stored density = 0, as built), and the party's
     smallest pick made every pull the room's 2-3. The pick is the PULL SIZE: a settle at 7 on the
     Thicket spawns 7 a pack. Then (Tyler 2026-10-20): "There should be a party leader that chooses the
     hunt settings": in a party the LEADER's pick is the pull; a member's (unset, 0 or 3) never counts. */
  'density-pull': (M) => {
    const g = M.grounds.HUNT_GROUNDS.meadowbrook_thicket;
    const packs = (opts) => {
      const w = M.worldstate.decode(JSON.parse(freshParty(M, 'meadowbrook_thicket', 0.25, 3, opts).world));
      return { d: w.density, born: g.pockets.map((_, p) => w.units.filter((u) => u.side === 'mon' && u.pocket === p).length) };
    };
    /* the packs the window never reached stand at their spawn size (the first pocket may be mid-fight) */
    const at = (r, n) => r.d === n && r.born.every((k) => k <= n) && r.born.filter((k) => k === n).length >= g.pockets.length - 1;
    const solo = packs([{ density: 7 }]);
    if (!at(solo, 7)) return 'a solo settle at density 7 on the Thicket ran ' + solo.d + ' with packs of ' + solo.born;
    /* Tyler's seat order: the member who never picked is member 0, the one that opens the world */
    const unset = packs([{}, { density: 7, lead: true }]);
    if (!at(unset, 7)) return 'a leader at 7 beside a member who never picked ran ' + unset.d + ' with packs of ' + unset.born + ' (want 7 a pack)';
    const zero = packs([{ density: 7, lead: true }, { density: 0 }]);
    if (!at(zero, 7)) return 'a leader at 7 beside a member at As built ran ' + zero.d + ' with packs of ' + zero.born;
    const three = packs([{ density: 3 }, { density: 7, lead: true }]);
    if (!at(three, 7)) return 'a leader at 7 beside a member at 3 ran ' + three.d + ' with packs of ' + three.born + ' (the leader chooses, Tyler 10-20)';
    const member = packs([{ density: 7 }, { density: 3, lead: true }]);
    if (!at(member, 3)) return 'a leader at 3 beside a member at 7 ran ' + member.d + ' with packs of ' + member.born + ' (a member\'s pick never counts)';
    /* a leader with no pick: the party's default pull on this ground (designer 2026-11-01), the member's 7 still has no say */
    const built = packs([{ density: 7 }, { lead: true }]);
    return built.d === g.partyPull[1] ? null : 'a leader with no pick beside a member at 7 ran density ' + built.d + ', want the pair\'s pull ' + g.partyPull[1];
  },
  /* A PARTY'S DEFAULT PULL (designer 2026-11-01: a mixed party as built stayed under solo, and most players never press +):
     no pick and more than one hero answers the row's partyPull, clamped; a lone hero's answer is untouched on every ground. */
  'party-pull': (M) => {
    const G = M.grounds;
    const want = { meadowbrook_thicket: [0, 4, 5, 6], wickstead: [0, 3, 3, 4], mosslight_glade: [0, 3, 3, 4], mill_cellar: [0, 4, 5, 5], millrace_sewer: [0, 0, 0, 0], coppercap_warrens: [0, 0, 0, 0] };
    if (Object.keys(G.HUNT_GROUNDS).sort().join() !== Object.keys(want).sort().join()) return 'a new ground: give it a line here, its pull is a choice';
    for (const [id, row] of Object.entries(want)) {
      const got = [1, 2, 3, 4].map((n) => G.densityFor(G.HUNT_GROUNDS[id], n, 0));
      if (got.join() !== row.join()) return id + ' with no pick reads ' + got + ', want ' + row;
      for (const n of [1, 2, 3, 4]) if (G.densityFor(G.HUNT_GROUNDS[id], n, 7) !== 7) return id + ': a pick of 7 for ' + n + ' reads ' + G.densityFor(G.HUNT_GROUNDS[id], n, 7);
    }
    const low = { partyPull: [0, 9, 9, 9], densityMax: [8, 8, 8, 8] };
    if (G.densityFor(low, 2, 0) !== 8) return 'a pull over the ground\'s max reads ' + G.densityFor(low, 2, 0) + ', the clamp is 8';
    if (G.validateGround(Object.assign({}, G.HUNT_GROUNDS.wickstead, { partyPull: [3, 3, 3, 4] })).every((s) => !/partyPull/.test(s))) return 'a pull for a lone hero passed validation';
    /* The settle opens at it: a Thicket four with no pick stands at 6 each (Tyler 11-02), a lone hero at the room as built. */
    const opened = (n) => M.worldstate.decode(JSON.parse(freshParty(M, 'meadowbrook_thicket', 0.25, 3, Array.from({ length: n }, (_, i) => (i ? {} : { lead: true }))).world)).density;
    if (opened(4) !== 6) return 'a Thicket four settled at density ' + opened(4);
    return opened(1) === 0 ? null : 'a lone hero on the Thicket settled at density ' + opened(1) + ', its pull never moves';
  },
  'density-laps': (M) => {
    const { ground, grid } = M.hg.huntGroundOf('meadowbrook_thicket');
    const from = T0; const to = from + 30 * 60000;
    const L = 40;
    /* Two strong heroes: seat 0 the LEADER at 8, seat 1 never touched the step (no stored density). */
    const members = [['tank', 'bronze_sword', 'sword', { density: 8 }, true], ['melee_dps', 'stone_maul', 'hammer', {}, false]].map(([role, weapon, wt, options, lead], i) => ({
      key: 'l' + i, user: 'u' + i, slot: 0, seat: i, unitId: null, sessionId: 's' + i, version: 1, huntId: 'meadowbrook_thicket',
      huntSession: { id: 's' + i, instanceId: 'i', huntFromMs: from, nextSwingAtMs: from, swingIndex: 0, onEmpty: 'switch', bag: {},
        staminaMs: 8 * 3600000, staminaMaxMs: 8 * 3600000 },
      skills: { melee: M.XP.skillXpForLevel('melee', L), defense: M.XP.skillXpForLevel('defense', L), ranged: 0, magic: 0, inner_flame: 0 },
      levelXp: M.XP.charXpForLevel(L), hp: 1e6, gold: 0, equipment: { weapon }, inventory: {},
      hero: M.heroSetup({ weaponType: wt, options: Object.assign({ role }, options), bar: [], partyRoles: ['tank', 'melee_dps'], lead }) }));
    const out = M.acc.accrueHunt({ instance: { id: '00000000-0000-4000-8000-0000000000af', nextSwingAtMs: from, world: null },
      window: { fromMs: from, toMs: to }, secret: '77', ground, grid, items: M.ITEMS, monsters: M.MONSTERS, members });
    const w = M.worldstate.decode(JSON.parse(out.world));
    if (w.runs < 3) return 'the duo ran ' + w.runs + ' lap(s) in 30 min, the test needs 3';
    const respawns = out.events.filter((e) => e.type === 'respawn');
    if (respawns.length < 2 * ground.pockets.length) return 'only ' + respawns.length + ' respawns in 3 laps';
    /* The units the first world opened with (the leader and its first packs) and the heroes are not respawns. */
    const opened = M.spawn.newHuntWorld(ground, grid, [{ role: 'tank', maxHp: 200, acc: 1000, maxHit: 12, def: 0 }], { density: 8 });
    const heroIds = new Set(w.units.filter((u) => u.side === 'hero').map((u) => u.id));
    /* every respawn instant: the monsters first placed at it (a respawn places each by the track) number 8 per pocket */
    const first = new Map();
    for (const s of out.track) if (!first.has(s.u) && s.u >= opened.nextId && !heroIds.has(s.u)) first.set(s.u, s.atMs);
    const at = new Map();
    for (const e of respawns) at.set(e.atMs, (at.get(e.atMs) || 0) + 1);
    for (const [ms, pockets] of at) {
      const born = [...first.values()].filter((x) => x === ms).length;
      if (born !== 8 * pockets) return 'lap respawn at +' + (ms - from) + ' ms brought ' + born + ' monster(s) for ' + pockets + ' pocket(s), want 8 each (the leader\'s 8)';
    }
    return w.density === 8 ? null : 'the world ran density ' + w.density + ', want the leader\'s 8';
  },
  'sql-rows': (M) => {
    let sql;
    try { sql = readFileSync(join(M.root, MIGRATION), 'utf8'); } catch { return MIGRATION + ' is missing'; }
    let truth;
    try { truth = readFileSync(join(M.root, SLOT_MIGRATION), 'utf8'); } catch { return SLOT_MIGRATION + ' is missing'; }
    let store;
    try { store = readFileSync(join(M.root, STORE_MIGRATION), 'utf8'); } catch { return STORE_MIGRATION + ' is missing'; }
    let content;
    try { content = readFileSync(join(M.root, CONTENT_MIGRATION), 'utf8'); } catch { return CONTENT_MIGRATION + ' is missing'; }
    let roles;
    try { roles = readFileSync(join(M.root, VIEW_MIGRATION), 'utf8'); } catch { return VIEW_MIGRATION + ' is missing'; }
    let bars;
    try { bars = readFileSync(join(M.root, BAR_MIGRATION), 'utf8'); } catch { return BAR_MIGRATION + ' is missing'; }
    const from = { limits: truth, 'action-ids': truth, 'role-rules': bars, metrics: content };
    for (const [tag, want] of [['metrics', metricRowsSql(M)], ['action-ids', actionIdRowsSql(M)], ['role-rules', roleRuleRowsSql(M)], ['limits', limitRowsSql(M)]]) {
      const got = between(from[tag] || sql, tag);
      if (got !== want) return 'the migration\'s ' + tag + ' block is stale (node tests/hunt-core/conditions.mjs --print)';
    }
    /* THE STARTER BAR the server places for a new hero is the start kit's (src/data/start-kit.js START_BAR). */
    /* the chain end's settings view (2027-03-08-rune-ladder-slots.sql restates it, the 2026-11-07 placement block unchanged) */
    const sb = /-- ⟦starter-bar⟧\n\s*v_def := v_def \|\| '([^\n]*)'::jsonb;\n\s*-- ⟦\/starter-bar⟧/.exec(roles);
    let bar = null;
    try { bar = sb ? JSON.parse(sb[1].replace(/''/g, "'")) : null; } catch { bar = null; }
    if (JSON.stringify(bar) !== JSON.stringify(M.kit.START_BAR)) return 'the server\'s starter bar is not the start kit\'s: ' + (sb ? sb[1].slice(0, 120) : 'no ⟦starter-bar⟧ block');
    return null;
  },
};

/* Five rats in a column the ranger shoots into, with a 4-unit 3x3 stack then the free loaded arrows (rule 1). */
function runShots(M, o) {
  const h = hero(M, 1, 9, 3, { role: 'ranger', acc: 1000, maxHit: 3, mana: 0, maxMana: 0 });
  const ms = [[15, 2], [15, 3], [15, 4], [16, 3], [14, 3]].map(([x, y], i) => mon(M, 10 + i, 0, x, y, { target: 1, hp: 9000, maxHp: 9000 }));
  const w = world(M, [h, ...ms]);
  w.phase = 'fight';
  const inst = instOf(M, w);
  /* no worn ammo: the bar's Bronze slot is the next row once the 3x3 stack is empty (a worn Bronze would take over
     first: conditions.js attackOrder, Andy #63) */
  inst.heroes = { 1: heroRow(M, { range: 7, ammo: null,
    items: Object.assign({}, M.ITEMS, { iron_arrows: { ...M.ITEMS.iron_arrows, area: 3 } }),
    session: { bag: { iron_arrows: { loaded: o.burst }, bronze_arrows: { loaded: 50 } } },
    slots: rows([slot('attack_with_item', 'iron_arrows', [c('enemies_in_aoe', 'gte', 2)], 'and', 'b3'), slot('attack_with_item', 'bronze_arrows', [], 'and', 'bz')]) }) };
  const sc = subStep(0); sc.rng = M.rng.createRng(11);
  h.target = 11;
  for (let i = 0; i < 160; i++) { sc.atMs = i * 100; M.damage.resolveAttacks(inst, sc); }
  const shots = sc.events.filter((e) => e.type === 'shot');
  const dmgPerShot = shots.map((s) => sc.events.filter((e) => (e.type === 'dmg' || e.type === 'miss') && e.u === 1 && e.atMs === s.atMs).length);
  return { shots, dmgPerShot, left: inst.heroes[1].hs.bag.iron_arrows.left };
}

/* A plant: a default row that names no store rune, whatever storeOf would say (a weapon hero's rune spell put back as it stood). */
const NO_STORE_ROW = ['src/data/rule-subjects.js', "export const ROLE_RULES = Object.freeze({", "const NO_STORE = (id) => Object.freeze({ id: 'd_' + id, action: Object.freeze({ type: 'ability', id }), conditions: Object.freeze([]), join: 'and' });\nexport const ROLE_RULES = Object.freeze({"];
const mutants = [
  { name: 'a lone hero takes the party\'s pull', case: 'party-pull', edits: [['src/data/hunt-grounds.js', 'return n > 1 && ground && Array.isArray(ground.partyPull) ? ground.partyPull[n - 1] : 0;', 'return ground && Array.isArray(ground.partyPull) ? ground.partyPull[Math.max(n, 2) - 1] : 0;']] },
  { name: 'a party with no pick stays as built', case: 'party-pull', edits: [['src/data/hunt-grounds.js', 'const p = Number.isInteger(pick) && pick > 0 ? pick : partyPullOf(ground, n);', 'const p = Number.isInteger(pick) && pick > 0 ? pick : 0;']] },
  { name: 'a pull ignores the ground\'s clamp', case: 'party-pull', edits: [['src/data/hunt-grounds.js', 'return Math.max(0, Math.min(max, p, DENSITY_PICK.max));\n}\n\n/** THE PULL\'S PICK', 'return Math.max(0, Number.isInteger(pick) && pick > 0 ? Math.min(max, p, DENSITY_PICK.max) : p);\n}\n\n/** THE PULL\'S PICK']] },
  { name: 'a row\'s pull for a lone hero passes validation', case: 'party-pull', edits: [['src/data/hunt-grounds.js', 'row.partyPull.length === MAX_HEROES && row.partyPull[0] === 0', 'row.partyPull.length === MAX_HEROES']] },
  { name: 'a metric row with no evaluator', case: 'registry', edits: [['src/core/hunt/conditions.js', '  target_is_boss: (cx) => {', '  target_is_boss_x: (cx) => {']] },
  { name: 'an unknown metric is accepted', case: 'validation', edits: [['src/core/hunt/conditions.js', "  if (!m || (stop && m.slotOnly)) return 'bad_metric';", "  if (stop && m && m.slotOnly) return 'bad_metric';\n  if (!m) return null;"]] },
  { name: 'a value out of range is accepted', case: 'validation', edits: [['src/core/hunt/conditions.js', ' || c.value < m.range[0] || c.value > m.range[1]) return', ') return']] },
  { name: 'a slot may join or', case: 'validation', edits: [['src/core/hunt/conditions.js', "(!JOINS.includes(join) || (!stop && join !== 'and'))", '!JOINS.includes(join)']] },
  { name: 'four conditions are accepted', case: 'validation', edits: [['src/core/hunt/conditions.js', '  if (list.length > MAX_CONDITIONS) return', '  if (list.length > MAX_CONDITIONS + 1) return']] },
  { name: 'the even footprint is centred north-west', case: 'footprint', edits: [['src/core/hunt/conditions.js', ' : -(size / 2 - 1);', ' : -(size / 2);']] },
  { name: 'enemies_in_aoe counts the 1x1 always', case: 'enemies-in-aoe', edits: [['src/core/hunt/conditions.js', '    const b = bestAim(cx.inst, cx.u, cx.h && cx.h.range, footprintOf(cx.slot, cx.h), cx.slot);', '    const b = bestAim(cx.inst, cx.u, cx.h && cx.h.range, 3, cx.slot);']] },
  { name: 'slots fire in reverse order', case: 'priority-fallback', edits: [['src/core/hunt/conditions.js', '  for (const row of rows) {\n    const t = testSlot', '  for (const row of rows.slice().reverse()) {\n    const t = testSlot']] },
  { name: 'or is read as and', case: 'join', edits: [['src/core/hunt/conditions.js', "(slot.join === 'or' ? mask !== 0 : mask === all)", '(mask === all)']] },
  { name: 'the ally subject is ignored (lowest is healed)', case: 'ally-subject', edits: [['src/core/hunt/abilities.js', '      if (cx && cx.ally) return ok(cx.ally) ? cx.ally : null;\n', '']] },
  { name: 'a slot with no conditions takes a hidden default again (c21)', case: 'consume-slot', edits: [['src/core/hunt/conditions.js', '  const conds = slot.conditions;', '  const conds = slot.conditions.length ? slot.conditions : suggestedConditions(slot.action);']] },
  { name: 'a slot with no conditions takes a hidden default again (c21), an ability', case: 'no-hidden-defaults', edits: [['src/core/hunt/conditions.js', '  const conds = slot.conditions;', '  const conds = slot.conditions.length ? slot.conditions : suggestedConditions(slot.action);']] },
  { name: 'a food with nothing to restore is eaten anyway', case: 'consume-slot', edits: [['src/core/hunt/consumables.js', "  if (int(u[stat]) >= int(u[MAX_OF[stat]])) return null;\n", '']] },
  { name: 'a slot switched Off still fires', case: 'slot-switch-and-ignore', edits: [['src/core/hunt/conditions.js', '  list.forEach((s, at) => { if (keep(s) && s.enabled !== false) out.push({ rule: s.id, slot: s, at }); });', '  list.forEach((s, at) => { if (keep(s)) out.push({ rule: s.id, slot: s, at }); });']] },
  { name: 'a slot fires while its hero fights an ignored monster', case: 'slot-switch-and-ignore', edits: [['src/core/hunt/conditions.js', '    if (ignores(slot, t)) return { pass: false, mask: 0, cx };\n', '']] },
  { name: 'an ignore list holds back a food or a heal slot (S1a)', case: 'slot-switch-and-ignore', edits: [['src/core/hunt/conditions.js', ' && Number.isInteger(u.target) && aimsAtMonsters(slot)) {', ' && Number.isInteger(u.target)) {']] },
  { name: '[spell-content] Protective Ward recasts over a standing shield', case: 'friend-shield-and-yourself',
    edits: [['src/core/hunt/abilities.js', " && pct(a) < 100 && (row.heal || !(int(a.shield) > 0))\n", ' && pct(a) < 100\n']] },
  { name: '[spell-content] Protective Ward shields nothing', case: 'friend-shield-and-yourself',
    edits: [['src/core/hunt/abilities.js', '      t.shield = scaled(row.shield);\n', '      t.shield = 0;\n']] },
  { name: '[spell-content] a heal aimed at yourself finds nobody', case: 'friend-shield-and-yourself',
    edits: [['src/core/hunt/conditions.js', "  if (subject === 'self') return cx.u.alive ? cx.u : null;\n", '']] },
  { name: 'an ignore list holds back a food slot', case: 'slot-switch-and-ignore', edits: [['src/core/hunt/conditions.js', "  if (a.type === 'attack_with_item') return true;\n", "  if (a.type === 'attack_with_item' || a.type === 'consume') return true;\n"]] },
  { name: 'an ignore list holds back an ally heal', case: 'slot-switch-and-ignore', edits: [['src/core/hunt/conditions.js', "const MONSTER_TARGETS = Object.freeze(['taunt', 'mark', 'enemy', 'area', 'cleave']);", "const MONSTER_TARGETS = Object.freeze(['taunt', 'mark', 'enemy', 'area', 'cleave', 'ally']);"]] },
  { name: 'an area slot aims at an ignored monster', case: 'slot-switch-and-ignore', edits: [['src/core/hunt/conditions.js', '  const cand = mons.filter((m) => reaches(inst, hero, range, m) && !ignores(slot, m))', '  const cand = mons.filter((m) => reaches(inst, hero, range, m))']] },
  { name: 'an ignored monster may be a single-target ability\'s target', case: 'slot-switch-and-ignore', edits: [['src/core/hunt/abilities.js', '  const near = mons.filter((m) => inReach(inst, hero, h.range, m) && !ignores(cx && cx.slot, m)).sort(byPreference(hero));', '  const near = mons.filter((m) => inReach(inst, hero, h.range, m)).sort(byPreference(hero));']] },
  { name: 'an unknown monster may be ignored', case: 'validation', edits: [['src/core/hunt/conditions.js', "  if (!s.ignore.every((id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(MONSTERS, id)) || new Set(s.ignore).size !== s.ignore.length) return { error: 'bad_ignore' };\n", '']] },
  { name: 'a whetstone attack slot is accepted (Andy a41)', case: 'validation',
    edits: [['src/core/hunt/conditions.js', 'SHOOTERS.some((r) => shootsItem(r, ITEMS[id]))', "!!ITEMS[id] && ITEMS[id].reqSkill !== 'magic'"]] },
  { name: 'a slot may ignore without bound', case: 'validation', edits: [['src/core/hunt/conditions.js', "  if (s.ignore.length > MAX_IGNORED) return { error: 'too_many_ignored' };\n", '']] },
  { name: 'an area shot spends one unit per monster hit', case: 'attack-item', edits: [['src/core/hunt/damage.js', '    for (const m of hits) if (m.alive) blow(inst, sc, u, h, m, shot.pick.price, sharePm);', '    for (const m of hits) { if (m !== aim && shot.pick.ammo) payBasic(inst, u, { ammo: shot.pick.ammo }, sc); if (m.alive) blow(inst, sc, u, h, m, shot.pick.price, sharePm); }']] },
  { name: 'an empty attack stack does not fall back', case: 'attack-item', edits: [['src/core/hunt/damage.js', "    if (!l.id || l.why) return { why: shotWait(l) };\n    const size", '    if (!l.id) return { id, size: 1, aim: cx.aim || u };\n    const size']] },
  { name: 'target_is_boss reads the wrong flag', case: 'metrics-misc', edits: [['src/core/hunt/conditions.js', 'MONSTERS[t.kind].boss === true', 'MONSTERS[t.kind].formation === false']] },
  { name: 'the id is the slot position', case: 'stable-ids', edits: [['src/core/hunt/conditions.js', '  list.forEach((s, at) => { if (keep(s) && s.enabled !== false) out.push({ rule: s.id, slot: s, at }); });', '  list.forEach((s, at) => { if (keep(s) && s.enabled !== false) out.push({ rule: \'p\' + at, slot: s, at }); });']] },
  { name: 'a bar edit keeps a dropped rule\'s state', case: 'rekey', edits: [['src/core/hunt/conditions.js', '    for (const [id, ms] of Object.entries(u.ruleHold)) if (ids.has(id)) hold[id] = int(ms);', '    for (const [id, ms] of Object.entries(u.ruleHold)) hold[id] = int(ms);']] },
  /* ONE PACK FOR EVERY GROUP (Tyler 2026-11-08): the old party scale, the yield share and the party-only hall, each planted back */
  { name: 'a lone hero\'s kill pays 55% of its row\'s XP', case: 'whole-kill', edits: [['src/core/hunt/damage.js', 'xp: Math.round(atTier(rowOf(inst, target.kind), inst.tier).xp) }', "xp: Math.round(atTier(rowOf(inst, target.kind), inst.tier).xp * (inst.world.units.filter((x) => x.side === 'hero').length === 1 ? 0.55 : 1)) }"]] },
  { name: 'a sure drop thinned by a yield share', case: 'whole-kill', edits: [['src/core/drops.js', '  if (row.ch >= 1) return Math.min(1, row.ch);', '  if (row.ch >= 1) return Math.min(1, row.ch * 0.55);']] },
  { name: 'a lone hero skips the King\'s hall', case: 'every-route', edits: [['src/core/hunt/pull-cycle.js', 'const routeOf = (inst) => inst.ground.route;', "const routeOf = (inst) => (inst.world.units.filter((u) => u.side === 'hero').length > 1 ? inst.ground.route : inst.ground.route.filter((i) => !inst.ground.pockets[i].forParty));"]] },
  { name: 'a wait is reported every sub-step', case: 'rule-wait', edits: [['src/core/hunt/conditions.js', '  if (cur[lane] === key) return;\n', '']] },
  { name: 'a stop rule ignores its hold', case: 'stop-rule', edits: [['src/core/hunt/conditions.js', '      if (t.pass && hold[r.id] >= int(r.forMs)) {', '      if (t.pass) {']] },
  { name: 'the span never ends a met stop rule', case: 'stop-rule-span', edits: [['src/core/combat-sim.js', " || typeof m.hs.ruleStop === 'string' ||", ' ||'], ['src/core/action-rules.js', "  rule: (hs) => typeof hs.ruleStop === 'string' && hs.ruleStop.length > 0,", '  rule: () => false,']] },
  { name: 'the density pick is not clamped', case: 'density', edits: [['src/data/hunt-grounds.js', '  return Math.max(0, Math.min(max, p, DENSITY_PICK.max));', '  return Math.max(0, Math.min(p, DENSITY_PICK.max));']] },
  { name: 'density does not reach the pack', case: 'density', edits: [['src/core/hunt/pull-cycle.js', 'pullRows(inst.ground, p, w.density)', 'pullRows(inst.ground, p, 0)']] },
  { name: 'a lone hero\'s pack spawns at 55% HP', case: 'one-pack', edits: [['src/core/hunt/pull-cycle.js', '  const hp = Math.max(1, atTier(row, inst.tier).hp || 1);', "  const hp = Math.max(1, Math.floor((atTier(row, inst.tier).hp || 1) * (inst.world.units.filter((x) => x.side === 'hero').length === 1 ? 0.55 : 1)));"]] },
  { name: 'the druid heals whoever is lowest', case: 'ally-subject', edits: [['src/core/hunt/conditions.js', '  if (subject && subject !== \'lowest\') return all.find((a) => a.role === subject) || null;\n', '']] },
  { name: 'an attack slot ignores its conditions', case: 'party-acceptance', edits: [['src/core/hunt/damage.js', '  const got = shotPasses(inst, u, h, rows, (own) => (slot, cx) => {', '  const got = shotPasses(inst, u, h, rows.map((r) => ({ rule: r.rule, slot: Object.assign({}, r.slot, { conditions: [] }) })), (own) => (slot, cx) => {']] },
  { name: 'the stop-rule hold is not persisted (a cut resets it)', case: 'stop-rule-span', edits: [['src/core/hunt/conditions.js', "  unit: Object.freeze([['ruleHold', 'json'], ['ruleWait', 'json']]),", "  unit: Object.freeze([['ruleWait', 'json']]),"]] },
  { name: '[undertow] a party casts the alone spell', case: 'undertow-both-paths',
    edits: [['src/core/hunt/abilities.js', '    && (solo || !(ABILITIES[r.slot.action.id] && ABILITIES[r.slot.action.id].alone)));', '    && (solo || true));']] },
  { name: 'the healer\'s default rule set has no attack-when-safe rule', case: 'healer-default-rules',
    edits: [['src/data/rule-subjects.js', ", slot('green_sickness', SICKNESS_WHEN), slot('undertow', UNDERTOW_WHEN)]),", ", slot('undertow', UNDERTOW_WHEN)]),"]] },
  { name: 'the healer\'s attack spends the mana a heal needs', case: 'healer-default-rules',
    edits: [['src/data/rule-subjects.js', "subject: 'lowest' }, { metric: 'self_mana_pct', op: 'gte', value: 78 }]);", "subject: 'lowest' }]);"]] },
  { name: 'the tank\'s default set holds Flame Strike again, with no store rune (struck from minute one)', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "  tank: Object.freeze([slot('challenge'), slot('power_strike')]),", "  tank: Object.freeze([slot('challenge'), NO_STORE('flame_strike'), slot('power_strike')]),"], NO_STORE_ROW] },
  { name: 'a sword alone casts Flame Strike again, with no store rune (struck from minute one)', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "  melee_dps: Object.freeze([slot('power_strike'), slot('cleave')]),", "  melee_dps: Object.freeze([NO_STORE('flame_strike'), slot('power_strike'), slot('cleave')]),"], NO_STORE_ROW] },
  { name: 'Rend comes back on the axes\' default set with no store rune', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "  melee_dps: Object.freeze([slot('power_strike'), slot('cleave')]),", "  melee_dps: Object.freeze([slot('power_strike'), slot('cleave'), NO_STORE('rend')]),"], NO_STORE_ROW] },
  { name: 'Flame Volley comes back on the Ranger\'s default set with no store rune', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "  ranger: Object.freeze([slot('hunters_mark'), slot('precision_shot')]),", "  ranger: Object.freeze([slot('hunters_mark'), NO_STORE('flame_volley'), slot('precision_shot')]),"], NO_STORE_ROW] },
  { name: 'a cooldown is lost at a window cut (watched and closed part ways)', case: 'starter-bars-both-paths',
    edits: [['src/core/hunt/abilities.js', "['lanes', 'json'], ['cds', 'json'],", "['lanes', 'json'],"]] },
  { name: 'Frost Lance names no store rune (the Mage\'s slot 2 struck again)', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "const storeOf = (id) => { const r = ABILITIES[id]; const b = r && r.rune ?", "const storeOf = (id) => { const r = ABILITIES[id]; const b = r && r.rune && id !== 'frost_lance' ?"]] },
  { name: 'Green Sickness names no store rune (the Healer\'s slot 3 struck again)', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "const storeOf = (id) => { const r = ABILITIES[id]; const b = r && r.rune ?", "const storeOf = (id) => { const r = ABILITIES[id]; const b = r && r.rune && id !== 'green_sickness' ?"]] },
  { name: 'a default slot names another family\'s store rune', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "? BASIC_SUPPLIES.find((x) => x.partner === r.rune) : null; return b ? b.id : null; };", "? BASIC_SUPPLIES.find((x) => x.partner === r.rune) : null; return b ? 'plain_fire_rune' : null; };"]] },
  { name: 'Frost Lance waits for two monsters (a new Mage fires nothing on a lone one)', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "slot('frost_lance', SPARE_MANA)", "slot('frost_lance', [{ metric: 'enemies_in_aoe', op: 'gte', value: 2 }])"]] },
  /* (Undertow fires on a lone monster too since 2026-11-09, so both of the Healer's strikes wait for two here.) */
  { name: 'Green Sickness waits for two monsters (a new Healer fires nothing on a lone one)', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "slot('green_sickness', SICKNESS_WHEN)", "slot('green_sickness', [{ metric: 'enemies_in_aoe', op: 'gte', value: 2 }])"],
      ['src/data/rule-subjects.js', "slot('undertow', UNDERTOW_WHEN)", "slot('undertow', [{ metric: 'enemies_in_aoe', op: 'gte', value: 2 }])"]] },
  { name: 'Green Sickness waits for someone hurt (the old Healer: nothing until it hurts)', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "slot('green_sickness', SICKNESS_WHEN)", "slot('green_sickness', [{ metric: 'ally_hp_pct', op: 'lt', value: 70, subject: 'lowest' }])"]] },
  { name: 'Arcane Barrier can never fire (HP under 0%)', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "slot('arcane_barrier')", "slot('arcane_barrier', [{ metric: 'self_hp_pct', op: 'lt', value: 0 }])"]] },
  { name: 'a new style holds a slot that waits for nobody and never fires', case: 'starter-bar-fires',
    edits: [['src/data/rule-subjects.js', "  tank: Object.freeze([slot('challenge'), slot('power_strike')]),", "  tank: Object.freeze([slot('challenge'), slot('power_strike', [{ metric: 'target_is_boss', op: 'eq', value: true }])]),"]] },
  { name: 'monsters do not fill the diagonal tiles of the box', case: 'full-box', edits: [['src/core/hunt/roles.js', '  if (dx && dy && (!walkable(inst.grid, tx + dx, ty) || !walkable(inst.grid, tx, ty + dy))) return false;', '  if (dx && dy) return false;']] },
  { name: 'the smallest pick sets the pull (the rule before Tyler 10-20)', case: 'density-pull',
    edits: [['src/data/hunt-grounds.js', "  const lead = list.find((h) => h.lead === true)\n    || list", "  const lead = list.filter((h) => h.density > 0).sort((a, b) => a.density - b.density)[0]\n    || list"]] },
  { name: 'the lowest seat chooses, not the leader', case: 'density-pull', edits: [['src/data/hunt-grounds.js', "  const lead = list.find((h) => h.lead === true)\n    || list", "  const lead = list"]] },
  { name: 'the settle never hands the member its leader flag', case: 'density-pull', edits: [['src/core/member.js', ' density: h.density || 0, tier: h.tier || null, lead: h.lead === true,', ' density: h.density || 0, tier: h.tier || null,']] },
  { name: 'the first packs spawn at the opening hero\'s pick alone', case: 'density-pull', edits: [['src/core/combat-sim.js', '            { density: densityFor(ctx.ground, standing.length, pickOf(standing)), tier, monsters: play.monsters });', '            { tier, monsters: play.monsters });']] },
  { name: 'respawns read every member\'s pick, smallest first (Andy 10-20, v0.2.20)', case: 'density-laps',
    edits: [['src/core/combat-sim.js', '        pickOf(members.filter((m) => !m.left && m.unitId !== null)));', '        Math.min(...members.filter((m) => !m.left && m.unitId !== null).map((m) => m.hero.density)));']] },
  { name: 'a full box walls the leader off the pull tile (no pull from the ring\'s edge)', case: 'density-laps',
    edits: [['src/core/hunt/pull-cycle.js', ' || arrived || walled)) {', ' || arrived)) {']] },
  { name: 'the settle never clamps the stored pick', case: 'density-settle', edits: [['src/core/combat-sim.js', '      world.density = densityFor(ctx.ground,', '      world.density = Math.max(...members.map((m) => m.hero.density), 1) || densityFor(ctx.ground,']] },
  /* the P1 as it shipped: a first room that shrugs off her poison whole (the immunity Tyler removed 2026-11-06); packs are the row's own since 2026-11-08 */
  /* (As it shipped the Healer's bar had no Undertow, its strike with no element since 2026-11-09: the bar goes back to that too.) */
  { name: 'the solo healer fights behind a poison wall (the P1 as it shipped)', case: 'solo-healer',
    edits: [['src/core/elements.js', '  if (!monster || !isElement(element)) return 1000;', "  if (element === 'poison' && monster && monster.elements && monster.elements.poison === 50) return 0;\n  if (!monster || !isElement(element)) return 1000;"],
      ['src/core/hunt/damage.js', '  const el = elementOn(target, element);\n', '  const el = elementOn(target, element);\n  if (el === 0) return { dmg: 0, absorbed: 0, killed: false };\n'],
      ['src/data/rule-subjects.js', ", slot('undertow', UNDERTOW_WHEN)]),", ']),']] },
  { name: 'a migration row drifts from the registry', case: 'sql-rows', edits: [['src/data/condition-metrics.js', "label: 'My target is a boss', say: 'my target being a boss', value: 'bool', ops: Object.freeze(['eq'])", "label: 'My target is a boss', say: 'my target being a boss', value: 'bool', ops: Object.freeze(['eq', 'ne'])"]] },
  { name: 'the start kit bar drifts from the server one', case: 'sql-rows', edits: [['src/data/start-kit.js', "startSlot('d_drink', 'thin_turnip_juice', 'self_mana_pct', 30)", "startSlot('d_drink', 'thin_turnip_juice', 'self_mana_pct', 35)"]] },
  { name: 'a store food is no slot item', case: 'sql-rows', edits: [['src/data/consumables.js', "    .map((b) => row(b.id, b.kind === 'heal' ? 'food' : 'drink', b.kind === 'heal' ? b.heals : b.mana, 'store', b.price)),", "    .filter(() => false).map((b) => row(b.id, b.kind === 'heal' ? 'food' : 'drink', b.kind === 'heal' ? b.heals : b.mana, 'store', b.price)),"]] },
];

function plant(edits) {
  const root = mkdtempSync(join(tmpdir(), 'hunt-cond-'));
  for (const d of ['src/core', 'src/data', 'src/session', 'supabase/functions/hr-accrue', 'supabase/migrations']) cpSync(join(ROOT, d), join(root, d), { recursive: true });
  cpSync(join(ROOT, 'src/build-info.js'), join(root, 'src/build-info.js'));
  for (const [file, from, to] of edits) {
    const f = join(root, file);
    const src = readFileSync(f, 'utf8');
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error('plant: ' + file + ' has ' + n + ' copies of the anchor ' + JSON.stringify(from.slice(0, 60)));
    writeFileSync(f, src.replace(from, () => to));
  }
  return { root, done: () => rmSync(root, { recursive: true, force: true }) };
}

const M = await load(ROOT);
if (process.argv.includes('--print')) {
  console.log('-- ⟦metrics⟧\n' + metricRowsSql(M) + '\n-- ⟦/metrics⟧\n');
  console.log('-- ⟦action-ids⟧\n' + actionIdRowsSql(M) + '\n-- ⟦/action-ids⟧\n');
  console.log('-- ⟦role-rules⟧\n' + roleRuleRowsSql(M) + '\n-- ⟦/role-rules⟧\n');
  console.log('-- ⟦limits⟧\n' + limitRowsSql(M) + '\n-- ⟦/limits⟧');
  process.exit(0);
}
const R = makeReport('hunt-core/conditions');
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
for (const [cn, fn] of Object.entries(cases)) {
  if (only.length && !only.includes(cn)) continue;
  let why = null;
  CUR = M;
  try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
if (!process.argv.includes('--no-mutate')) {
  for (const mu of mutants) {
    if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
    if (only.length && !only.includes(mu.case)) continue;
    const p = plant(mu.edits);
    try {
      let why = null;
      const PM = await load(p.root);
      CUR = PM;
      try { why = cases[mu.case](PM); } catch (e) { why = 'threw ' + e.message; }
      R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    } finally { p.done(); }
  }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
