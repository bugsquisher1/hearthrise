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
//   density-pull      the pick is the pull size: a Thicket settle at 7 spawns 7 a pack, solo and beside a partner who never
//                     picked (Tyler 10-20); a smaller real pick sets the pull; nobody picked = as built
//   party-scale       a pack spawns at the party scale's HP for the instance's size
//   healer-floor      a solo Healer's blow into an immunity lands at the floor; a duo's does not
//   party-acceptance  a 4-party (Knight, Ranger, Druid, Sorcerer) on one instance: the Ranger switches 5x5 / 3x3 by
//                     enemies_in_aoe and falls back when the 5x5 runs out, one unit a shot; the Druid heals only the
//                     Knight and only under 80%; the Sorcerer casts at density 3+; cut into windows (the client closed,
//                     the away path) the instance is byte-identical; kills and loot are tallied once
//   solo-healer       a FRESH solo Healer (start kit, Apprentice Staff) on the REAL settle clears mill_cellar and the
//                     Millrace Sewer's first pocket with no fall
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

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const MIGRATION = 'supabase/migrations/2026-10-25-action-conditions.sql';
/* The limits moved forward (Tyler 10-19: three conditions, all must match). */
const LIMITS_MIGRATION = 'supabase/migrations/2026-10-26-bar-three-conditions.sql';

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
  M.hf = await imp('src/core/hearthfind.js');
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
    pockets: [{ room: [8, 1, 22, 10], spawns }], route: [0], respawnMs: 3000, pullDist: 1.5, groupFit: 'both', densityMax: [12, 12, 12, 12], partyScale: true }, o || {});
}
/* A 3 x 3 block of `monster` round (16, 5), plus a straggler at (20, 9). */
const BLOCK = (monster) => [[15, 4], [16, 4], [17, 4], [15, 5], [16, 5], [17, 5], [15, 6], [16, 6], [17, 6], [20, 9]]
  .map(([x, y]) => ({ monster, x, y }));

/* One engine-level hero row (abilities / consumables / damage read it). */
const heroRow = (M, o) => Object.assign({ hs: supplySession(M, o && o.session), actionSet: 'hunt', range: 1 }, o || {});

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
    member(M, 'a-knight', 'tank', { seat: 0, hp: 1920, def: 2, maxHit: 5 }),
    member(M, 'b-ranger', 'ranger', { seat: 1, ammo: 'bronze_arrows', maxHit: 4,
      bag: { bronze_arrows: { loaded: 50 }, [HAVOC]: { loaded: x.havoc ?? 6 }, [BURST]: { loaded: 500 } },
      slots: [slot('attack_with_item', HAVOC, [c('enemies_in_aoe', 'gte', 4)], 'and', 'havoc'), slot('attack_with_item', BURST, [c('enemies_in_aoe', 'gte', 2)], 'and', 'burst')] }),
    member(M, 'c-druid', 'healer', { seat: 2, maxHit: 2, slots: [ab('greater_mend', [c('ally_hp_pct', 'lt', 80, 'tank')])], stopRules: x.druidStop }),
    member(M, 'd-sorc', 'mage', { seat: 3, maxHit: 2, bag: { fire_rune: { loaded: 300 } }, slots: [ab('fireball', [c('enemies_in_aoe', 'gte', 3)])] }),
  ];
}
/* The injected item catalogue: the 5x5 and 3x3 arrows are fixture rows over real ammo (designer data, not a ruling). */
const itemsWith = (M) => Object.assign({}, M.ITEMS, { [HAVOC]: Object.assign({}, M.ITEMS[HAVOC], { area: 5 }), [BURST]: Object.assign({}, M.ITEMS[BURST], { area: 3 }) });

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
function freshHealer(M, huntId, minutes, seed, options, element) {
  return freshParty(M, huntId, minutes, seed, [options], element);
}
/* The same fresh start-kit Healer, one per entry of `optionsList` (each its own stored options, as
   hr_hunt_member_read hands the settle player_action_sets.options), on ONE instance through the real settle. */
function freshParty(M, huntId, minutes, seed, optionsList, element) {
  const { ground, grid } = M.hg.huntGroundOf(huntId);
  const from = T0; const to = from + minutes * 60000;
  const food = Object.keys(M.kit.START_INVENTORY).find((id) => M.SUP.SUPPLIES[id] && M.SUP.SUPPLIES[id].kind === 'heal');
  const members = optionsList.map((options, i) => {
    const hero = M.heroSetup({ weaponType: M.roleWeaponOf(M.ITEMS.apprentice_staff), options: Object.assign({ role: 'healer' }, options || {}), bar: [], partyRoles: [] });
    return { key: 'h' + (i || ''), user: 'u', slot: i, seat: i, unitId: null, sessionId: 's' + i, version: 1, huntId,
      huntSession: { id: 's' + i, instanceId: 'i', huntFromMs: from, nextSwingAtMs: from, swingIndex: 0, onEmpty: 'switch',
        bag: { [food]: { loaded: M.kit.START_INVENTORY[food] }, air_rune: { loaded: M.kit.START_INVENTORY.air_rune } },
        staminaMs: 8 * 3600000, staminaMaxMs: 8 * 3600000 },
      skills: Object.assign({}, M.kit.START_SKILL_XP), levelXp: 0, hp: M.kit.START_CURRENCY.hp, gold: M.kit.START_CURRENCY.gold,
      equipment: { weapon: 'apprentice_staff', ammo: 'air_rune' }, inventory: {}, hero: Object.assign({}, hero, { element: element || '' }) };
  });
  const secret = String(BigInt.asIntN(64, BigInt(seed) * 2654435761n + 1n));
  const out = M.acc.accrueHunt({ instance: { id: '00000000-0000-4000-8000-0000000000ae', nextSwingAtMs: from, world: null },
    window: { fromMs: from, toMs: to }, secret, ground, grid, items: M.ITEMS, monsters: M.MONSTERS, members });
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
  for (const k of Object.keys(M.CM.CONSUME_KINDS)) ids.push(['consume', k]);
  for (const k of Object.keys(M.CM.ATTACK_KINDS)) ids.push(['attack_with_item', k]);
  for (const r of Object.values(M.CD.CONSUMABLES)) if (r.source === 'own') ids.push(['consume', r.id]);
  for (const s of Object.values(M.SUP.SUPPLIES)) if (s.kind === 'ammo') ids.push(['attack_with_item', s.id]);
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
    ['stop_hold_max_ms', M.CM.STOP_HOLD_MS.max], ['stop_hold_step_ms', M.CM.STOP_HOLD_MS.step]].map(([k, v]) => '  (' + q(k) + ', ' + v + ')').join(',\n');
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
      [slot('consume', 'food'), null], [slot('attack_with_item', 'iron_arrows', [c('enemies_in_aoe', 'gte', 3)]), null],
      [Object.assign(ab('power_strike'), { when: 1 }), 'bad_slot'],
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
      inst.heroes = { 1: heroRow(M, { range: 7, slots: rows([ab('greater_mend', [c('ally_hp_pct', 'lt', 80, 'tank')])]) }) };
      const sc = subStep(0); sc.rng = M.rng.createRng(3);
      M.abilities.castAbilities(inst, sc);
      return sc.events.filter((e) => e.type === 'heal').map((e) => e.t).join();
    };
    const a = run(75); const b = run(85);
    return a === '2' && b === '' ? null : 'tank at 75%: healed ' + (a || 'nobody') + '; tank at 85%: healed ' + (b || 'nobody');
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
    if (run(85, [], bag) !== '') return 'the default eat-at (50%) ate at 85%';
    if (run(85, [slot('consume', 'food', [c('self_hp_pct', 'lt', 90)], 'and', 'f90')], bag) !== 'cooked_shrimp#f90') return 'an eat slot at 90% did not eat at 85%';
    /* An empty item falls back to the next slot. */
    const fb = run(40, [slot('consume', 'cooked_trout', [], 'and', 'tr'), slot('consume', 'cooked_shrimp', [], 'and', 'sh')], bag);
    return fb === 'cooked_shrimp#sh' ? null : 'an empty trout slot fell back to ' + (fb || 'nothing');
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
    const A = ab('power_strike', [c('self_hp_pct', 'lt', 50)]); const B = ab('cleave'); const C2 = slot('consume', 'food', [c('self_hp_pct', 'lt', 40)]);
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
  /* SCALING IS PAID IN REWARD (designer ruling 2026-10-18): a monster at s/1000 HP pays s/1000 of its row's kill yield,
     so the yield per HP dealt (and with kill speed set by HP, the yield per hour) is the same for 1, 2, 3 or 4 heroes. */
  'yield-scale': (M) => {
    const row = M.MONSTERS.drain_rat;
    for (const n of [1, 2, 3, 4]) {
      const w = M.spawn.newHuntWorld(openGround([{ monster: 'drain_rat', x: 16, y: 5 }]), openGrid(M),
        Array.from({ length: n }, () => ({ role: 'tank', maxHp: 100, acc: 900, maxHit: 5, def: 1 })));
      const m = w.units.find((u) => u.side === 'mon');
      const pm = M.grounds.yieldPermille(n);
      if (m.yieldPm !== pm) return n + ' heroes: the monster pays ' + m.yieldPm + ' permille, the ruling says ' + pm;
      /* per HP dealt: the kill XP it pays over its HP, against the row's, within one XP of rounding */
      const xp = Math.round(row.xp * m.yieldPm / 1000);
      /* within one XP of rounding and one HP of the scaled pool's rounding */
      if (Math.abs(xp / m.maxHp - row.xp / row.hp) > (1 + row.xp / row.hp) / m.maxHp + 1e-9) return n + ' heroes: ' + xp + ' XP for ' + m.maxHp + ' HP vs ' + row.xp + ' for ' + row.hp;
    }
    /* every chance scales: a drop (a sure one too) and the Hearthfind */
    const ch = M.drops.effectiveDropChance({ ch: 0.2 }, { yieldMult: 0.55 }); const sure = M.drops.effectiveDropChance({ ch: 1 }, { yieldMult: 0.55 });
    if (Math.abs(ch - 0.11) > 1e-9 || Math.abs(sure - 0.55) > 1e-9) return 'drop chances scaled to ' + ch + ' / ' + sure;
    /* the Hearthfind is thinned OUTSIDE its roll (the mint guard): the kill payout's source gates it at y first */
    const src = readFileSync(join(M.root, 'src/core/hunt-rewards.js'), 'utf8');
    if (!src.includes('if (y < 1 && !rng.chance(y)) return;')) return 'a scaled kill\'s Hearthfind is not thinned by its yield share';
    /* and the paid kill: a 550-permille rat's kill XP event */
    const h = hero(M, 1, 12, 3, { role: 'tank' }); const r = mon(M, 10, 0, 13, 3, { kind: 'drain_rat', hp: 1, maxHp: 25, yieldPm: 550 });
    const inst = instOf(M, world(M, [h, r])); const sc = subStep(0);
    M.damage.landHit(inst, sc, h, r, 50, null, null);
    const paid = sc.events.filter((e) => e.type === 'xp' || e.type === 'xp_group').map((e) => e.amount);
    M.xpshare.flushXpGroup(inst, sc);
    const all = sc.events.filter((e) => e.type === 'xp').reduce((a, e) => a + e.amount, 0);
    return all === Math.round(row.xp * 0.55) ? null : 'a 550-permille kill paid ' + all + ' XP (' + JSON.stringify(paid) + '), want ' + Math.round(row.xp * 0.55);
  },
  /* THE KING NEEDS A PARTY: a solo route never includes a minParty pocket; a pair walks it. */
  'solo-route': (M) => {
    for (const g of Object.values(M.grounds.HUNT_GROUNDS)) {
      const solo = M.grounds.routeFor(g, 1);
      if (solo.some((i) => (g.pockets[i].minParty || 1) > 1)) return g.id + ': the solo route walks a party-only pocket';
    }
    const sewer = M.grounds.HUNT_GROUNDS.millrace_sewer;
    const king = sewer.pockets.findIndex((p) => p.minParty);
    if (king < 0 || !M.grounds.routeFor(sewer, 2).includes(king)) return 'the King\'s pocket is not on a pair\'s route';
    /* A solo hero that cannot fall walks the real sewer until its route loops twice. */
    const { ground, grid } = M.hg.huntGroundOf('millrace_sewer');
    const w = M.spawn.newHuntWorld(ground, grid, [{ role: 'tank', maxHp: 1e7, hp: 1e7, acc: 1000, maxHit: 400, def: 50 }]);
    const pulls = [];
    for (let i = 0; i < 1500 && w.runs < 2; i++) {
      const r = M.worldstep.stepSwing(w, { ground, grid, heroes: {}, swingMs: 2000, atMs: T0 + i * 2000, rng: M.rng.createRng(M.rng.hashSeed('route', i)) });
      for (const e of r.events) if (e.type === 'pull') pulls.push(e.pocket);
    }
    return w.runs >= 2 && !pulls.includes(king) ? null : 'a solo hunt pulled ' + pulls.join(',') + ' (runs ' + w.runs + ')';
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
    if (holds(c('item_qty', 'eq', 7, 'item'), slot('consume', 'food')) !== true) bad.push(['the slot item of a food slot']);
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
    const got = [M.grounds.densityFor(g, 1, [16]), M.grounds.densityFor(g, 3, [16]), M.grounds.densityFor(g, 4, [12, 9]), M.grounds.densityFor(g, 1, [])].join();
    if (got !== '8,10,9,0') return 'densityFor answered ' + got + ' (want an over-max pick clamped to 8 solo, 10 for three; a party takes its smallest pick; none = as built)';
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
    const ground = openGround([{ monster: 'drain_rat', x: 18, y: 5 }], { start: [[14, 5]], partyScale: false });
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
  'party-scale': (M) => {
    const hp = (n) => {
      const w = M.spawn.newHuntWorld(openGround([{ monster: 'drain_rat', x: 16, y: 5 }]), openGrid(M),
        Array.from({ length: n }, () => ({ role: 'tank', maxHp: 100, acc: 900, maxHit: 5, def: 1 })));
      return w.units.find((u) => u.side === 'mon').maxHp;
    };
    const got = [1, 2, 4].map(hp).join();
    const want = [1, 2, 4].map((n) => M.grounds.scaledHp(M.MONSTERS.drain_rat, n)).join();
    if (got !== want || !(hp(1) < M.MONSTERS.drain_rat.hp)) return 'packs spawned at ' + got + ' HP, the party scale says ' + want;
    const flat = M.spawn.newHuntWorld(openGround([{ monster: 'drain_rat', x: 16, y: 5 }], { partyScale: false }), openGrid(M),
      [{ role: 'tank', maxHp: 100, acc: 900, maxHit: 5, def: 1 }]).units.find((u) => u.side === 'mon').maxHp;
    if (flat !== M.MONSTERS.drain_rat.hp) return 'a ground that does not opt in scaled its pack to ' + flat;
    return ['mill_cellar', 'millrace_sewer'].every((g) => M.grounds.HUNT_GROUNDS[g].partyScale === true) ? null : 'the cellar and the sewer do not opt in to the party scale';
  },
  'healer-floor': (M) => {
    /* A fixture immunity: the monster rows are the designer's, so the immune element is planted on the unit's kind row copy. */
    const kind = 'rat';
    const was = M.MONSTERS[kind].elementImmune;
    const probe = (n) => {
      const heroes = Array.from({ length: n }, (_, i) => hero(M, i + 1, 2 + i, 3, { role: 'healer' }));
      const t = mon(M, 10, 0, 13, 3, { kind, hp: 900, maxHp: 900 });
      const inst = instOf(M, world(M, [...heroes, t]));
      return M.damage.hurt(inst, t, 100, heroes[0], 'poison', null);
    };
    let a; let b;
    try {
      Object.defineProperty(M.MONSTERS[kind], 'elementImmune', { value: ['poison'], configurable: true, writable: true });
      a = probe(1); b = probe(2);
    } catch (e) {
      return 'fixture: could not plant an immunity (' + e.message + ')';
    } finally {
      try { Object.defineProperty(M.MONSTERS[kind], 'elementImmune', { value: was, configurable: true, writable: true }); } catch { /* frozen */ }
    }
    return !a.immune && a.dmg > 0 && b.immune ? null : 'solo ' + JSON.stringify(a) + ' duo ' + JSON.stringify(b);
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
      const hits = ev.filter((e) => (e.type === 'dmg' || e.type === 'immune') && e.u === sorc && e.atMs === k.atMs && (e.ability === 'fireball' || e.type === 'immune')).length;
      if (hits < 3) return 'a fireball at density ' + hits + ' (the rule says 3+)';
    }
    /* XP and loot settled ONCE: every monster kill is one tally kill and one bestiary count, never twice. */
    const monKills = ev.filter((e) => e.type === 'kill' && whole.w.units.every((u) => u.id !== e.t || u.side === 'mon')).length;
    const tallied = whole.members.reduce((a, m) => a + m.hs.tally.kills, 0);
    return monKills > 0 && tallied === monKills * whole.members.length ? null
      : 'kills: ' + monKills + ' monster kill events, tallies sum ' + tallied + ' over ' + whole.members.length + ' members';
  },
  /* Both with today's neutral staff blow and with the Healer's POISON (the sim's element, which the element-id
     unification will land: every cellar and first-sewer monster is poison-immune, so only the floor lets her kill). */
  'solo-healer': (M) => {
    for (const [seed, el] of [[1, ''], [2, ''], [1, 'poison'], [2, 'poison']]) {
      const tag = 'seed ' + seed + (el ? ' (' + el + ')' : '');
      const cellar = freshHealer(M, 'mill_cellar', 10, seed, null, el);
      const ce = cellar.events;
      const spawned = M.grounds.HUNT_GROUNDS.mill_cellar.pockets.reduce((a, p) => a + p.spawns.length, 0);
      if (ce.some((e) => e.type === 'wipe') || ce.some((e) => e.type === 'death')) return tag + ': a fresh solo healer died in the cellar';
      if (!ce.some((e) => e.type === 'pull' && e.pocket === 1) || ce.filter((e) => e.type === 'kill').length < spawned) return tag + ': the cellar was not cleared';
      const sewer = freshHealer(M, 'millrace_sewer', 10, seed, null, el);
      const pulls = sewer.events.filter((e) => e.type === 'pull');
      const second = pulls.find((e) => e.pocket !== 0);
      if (!second) return tag + ': the sewer\'s first pocket was never cleared in 10 minutes';
      const fell = sewer.events.find((e) => e.type === 'wipe' && e.atMs < second.atMs);
      if (fell) return tag + ': the healer fell in the sewer\'s first pocket at ' + (fell.atMs - T0) + ' ms';
    }
    return null;
  },
  /* The SETTLE clamps an over-max pick (the stored 4) to the ground's solo max (the sewer's 2): its first pocket spawns twice. */
  /* Tyler P1: the Healer's default rule set (an empty bar) heals first and attacks only when nobody needs healing. */
  'healer-default-rules': (M) => {
    const setup = M.heroSetup({ weaponType: M.roleWeaponOf(M.ITEMS.apprentice_staff), options: { role: 'healer' }, bar: [], partyRoles: [] });
    const run = (allyHp) => {
      const d = hero(M, 1, 6, 3, { role: 'healer', hp: 135, maxHp: 135, mana: 300, maxMana: 300 });
      const k = hero(M, 2, 8, 3, { role: 'tank', hp: allyHp, maxHp: 100 });
      const ms = [[9, 3], [10, 3]].map(([x, y], i) => mon(M, 10 + i, 0, x, y, { target: 2, hp: 500, maxHp: 500 }));
      const inst = instOf(M, world(M, [d, k, ...ms]));
      inst.heroes = { 1: heroRow(M, { range: 7, slots: setup.slots }) };
      const sc = subStep(0); sc.rng = M.rng.createRng(5);
      M.abilities.castAbilities(inst, sc);
      return sc.events.filter((e) => e.type === 'cast').map((e) => e.ability).join();
    };
    const safe = run(95); const hurt = run(60);
    return safe === 'natures_wrath' && hurt === 'greater_mend' ? null : 'with the tank at 95% the healer cast ' + (safe || 'nothing') + '; at 60% ' + (hurt || 'nothing');
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
     Thicket spawns 7 a pack, solo and beside an unset partner; a real smaller pick still wins. */
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
    /* Tyler's seat order: the unset character is member 0, the one that opens the world */
    const unset = packs([{}, { density: 7 }]);
    if (!at(unset, 7)) return 'a pick of 7 beside a partner who never picked ran ' + unset.d + ' with packs of ' + unset.born + ' (want 7 a pack)';
    const built = packs([{ density: 7 }, { density: 0 }]);
    if (!at(built, 7)) return 'a pick of 7 beside a partner at As built ran ' + built.d + ' with packs of ' + built.born;
    const small = packs([{ density: 7 }, { density: 4 }]);
    if (!at(small, 4)) return 'picks of 7 and 4 ran ' + small.d + ' with packs of ' + small.born + ' (the smaller real pick sets the pull)';
    const none = M.grounds.densityFor(g, 2, [0, 0]);
    return none === 0 ? null : 'a party where nobody picked ran density ' + none + ', want 0 (as built)';
  },
  'sql-rows': (M) => {
    let sql;
    try { sql = readFileSync(join(M.root, MIGRATION), 'utf8'); } catch { return MIGRATION + ' is missing'; }
    let lim;
    try { lim = readFileSync(join(M.root, LIMITS_MIGRATION), 'utf8'); } catch { return LIMITS_MIGRATION + ' is missing'; }
    for (const [tag, want] of [['metrics', metricRowsSql(M)], ['action-ids', actionIdRowsSql(M)], ['role-rules', roleRuleRowsSql(M)], ['limits', limitRowsSql(M)]]) {
      const got = between(tag === 'limits' ? lim : sql, tag);
      if (got !== want) return 'the migration\'s ' + tag + ' block is stale (node tests/hunt-core/conditions.mjs --print)';
    }
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
  inst.heroes = { 1: heroRow(M, { range: 7, ammo: 'bronze_arrows',
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

const mutants = [
  { name: 'a metric row with no evaluator', case: 'registry', edits: [['src/core/hunt/conditions.js', '  target_is_boss: (cx) => {', '  target_is_boss_x: (cx) => {']] },
  { name: 'an unknown metric is accepted', case: 'validation', edits: [['src/core/hunt/conditions.js', "  if (!m || (stop && m.slotOnly)) return 'bad_metric';", "  if (stop && m && m.slotOnly) return 'bad_metric';\n  if (!m) return null;"]] },
  { name: 'a value out of range is accepted', case: 'validation', edits: [['src/core/hunt/conditions.js', ' || c.value < m.range[0] || c.value > m.range[1]) return', ') return']] },
  { name: 'a slot may join or', case: 'validation', edits: [['src/core/hunt/conditions.js', "(!JOINS.includes(join) || (!stop && join !== 'and'))", '!JOINS.includes(join)']] },
  { name: 'four conditions are accepted', case: 'validation', edits: [['src/core/hunt/conditions.js', '  if (list.length > MAX_CONDITIONS) return', '  if (list.length > MAX_CONDITIONS + 1) return']] },
  { name: 'the even footprint is centred north-west', case: 'footprint', edits: [['src/core/hunt/conditions.js', ' : -(size / 2 - 1);', ' : -(size / 2);']] },
  { name: 'enemies_in_aoe counts the 1x1 always', case: 'enemies-in-aoe', edits: [['src/core/hunt/conditions.js', '    const b = bestAim(cx.inst, cx.u, cx.h && cx.h.range, footprintOf(cx.slot, cx.h));', '    const b = bestAim(cx.inst, cx.u, cx.h && cx.h.range, 3);']] },
  { name: 'slots fire in reverse order', case: 'priority-fallback', edits: [['src/core/hunt/conditions.js', '  for (const row of rows) {\n    const t = testSlot', '  for (const row of rows.slice().reverse()) {\n    const t = testSlot']] },
  { name: 'or is read as and', case: 'join', edits: [['src/core/hunt/conditions.js', "(slot.join === 'or' ? mask !== 0 : mask === all)", '(mask === all)']] },
  { name: 'the ally subject is ignored (lowest is healed)', case: 'ally-subject', edits: [['src/core/hunt/abilities.js', '      if (cx && cx.ally) return ok(cx.ally) ? cx.ally : null;\n', '']] },
  { name: 'an explicit consume slot keeps the default threshold', case: 'consume-slot', edits: [['src/core/hunt/conditions.js', '  const conds = slot.conditions.length ? slot.conditions : defaultConditions(slot, h);', '  const conds = defaultConditions(slot, h).length ? defaultConditions(slot, h) : slot.conditions;']] },
  { name: 'an area shot spends one unit per monster hit', case: 'attack-item', edits: [['src/core/hunt/damage.js', '    for (const m of hits) if (m.alive) blow(inst, sc, u, h, m);', '    for (const m of hits) { if (m !== aim && shot.pick.ammo) payBasic(inst, u, { ammo: shot.pick.ammo }, sc); if (m.alive) blow(inst, sc, u, h, m); }']] },
  { name: 'an empty attack stack does not fall back', case: 'attack-item', edits: [['src/core/hunt/damage.js', "    if (!l.id || l.why) return { why: l.why === 'gold_short' ? 'gold_short' : 'no_stock' };\n    const size", '    if (!l.id) return { id, size: 1, aim: cx.aim || u };\n    const size']] },
  { name: 'target_is_boss reads the wrong flag', case: 'metrics-misc', edits: [['src/core/hunt/conditions.js', 'MONSTERS[t.kind].boss === true', 'MONSTERS[t.kind].formation === false']] },
  { name: 'the id is the slot position', case: 'stable-ids', edits: [['src/core/hunt/conditions.js', '  for (const s of list) if (keep(s)) out.push({ rule: s.id, slot: s });', '  list.forEach((s, i) => { if (keep(s)) out.push({ rule: \'p\' + i, slot: s }); });']] },
  { name: 'a bar edit keeps a dropped rule\'s state', case: 'rekey', edits: [['src/core/hunt/conditions.js', '    for (const [id, ms] of Object.entries(u.ruleHold)) if (ids.has(id)) hold[id] = int(ms);', '    for (const [id, ms] of Object.entries(u.ruleHold)) hold[id] = int(ms);']] },
  { name: 'a scaled kill pays its row\'s whole XP', case: 'yield-scale', edits: [['src/core/hunt/damage.js', 'xp: Math.round((MONSTERS[target.kind].xp * yieldOf(target)) / 1000) }', 'xp: MONSTERS[target.kind].xp }']] },
  { name: 'a sure drop ignores the yield share', case: 'yield-scale', edits: [['src/core/drops.js', '  if (row.ch >= 1) return Math.min(1, row.ch * y);', '  if (row.ch >= 1) return row.ch;']] },
  { name: 'a solo hero walks the King\'s hall', case: 'solo-route', edits: [['src/core/hunt/pull-cycle.js', 'const routeOf = (inst) => routeFor(inst.ground, partySize(inst));', 'const routeOf = (inst) => inst.ground.route;']] },
  { name: 'a wait is reported every sub-step', case: 'rule-wait', edits: [['src/core/hunt/conditions.js', '  if (cur[lane] === key) return;\n', '']] },
  { name: 'a stop rule ignores its hold', case: 'stop-rule', edits: [['src/core/hunt/conditions.js', '      if (t.pass && hold[r.id] >= int(r.forMs)) {', '      if (t.pass) {']] },
  { name: 'the span never ends a met stop rule', case: 'stop-rule-span', edits: [['src/core/combat-sim.js', " || typeof m.hs.ruleStop === 'string' ||", ' ||'], ['src/core/action-rules.js', "  rule: (hs) => typeof hs.ruleStop === 'string' && hs.ruleStop.length > 0,", '  rule: () => false,']] },
  { name: 'the density pick is not clamped', case: 'density', edits: [['src/data/hunt-grounds.js', '  return Math.max(0, Math.min(max, pick, DENSITY_PICK.max));', '  return Math.max(0, Math.min(pick, DENSITY_PICK.max));']] },
  { name: 'density does not reach the pack', case: 'density', edits: [['src/core/hunt/pull-cycle.js', 'pullRows(inst.ground, p, w.density)', 'pullRows(inst.ground, p, 0)']] },
  { name: 'packs spawn at full HP whatever the party', case: 'party-scale', edits: [['src/data/hunt-grounds.js', '  return ground && ground.partyScale === true ? scaledHp(row, partySize) : Math.max(1, (row && row.hp) || 1);', '  return Math.max(1, (row && row.hp) || 1);']] },
  { name: 'the solo healer floor is never applied', case: 'healer-floor', edits: [['src/core/hunt/damage.js', '    ? elementWithFloor(elementOn(target, element), source.role, partySize(inst)) : elementOn(target, element);', '    ? elementOn(target, element) : elementOn(target, element);']] },
  { name: 'the druid heals whoever is lowest', case: 'ally-subject', edits: [['src/core/hunt/conditions.js', '  if (subject && subject !== \'lowest\') return all.find((a) => a.role === subject) || null;\n', '']] },
  { name: 'an attack slot ignores its conditions', case: 'party-acceptance', edits: [['src/core/hunt/damage.js', '  return pickSlot(inst, u, h, rows, (slot, cx) => {', '  return pickSlot(inst, u, h, rows.map((r) => ({ rule: r.rule, slot: Object.assign({}, r.slot, { conditions: [] }) })), (slot, cx) => {']] },
  { name: 'the stop-rule hold is not persisted (a cut resets it)', case: 'stop-rule-span', edits: [['src/core/hunt/conditions.js', "  unit: Object.freeze([['ruleHold', 'json'], ['ruleWait', 'json']]),", "  unit: Object.freeze([['ruleWait', 'json']]),"]] },
  { name: 'the healer\'s default rule set has no attack-when-safe rule', case: 'healer-default-rules',
    edits: [['src/data/rule-subjects.js', "    slot('natures_wrath', [{ metric: 'ally_hp_pct', op: 'gte', value: 70, subject: 'lowest' }])]),", '  ]),']] },
  { name: 'monsters do not fill the diagonal tiles of the box', case: 'full-box', edits: [['src/core/hunt/roles.js', '      if ((!dx && !dy) || !walkable(inst.grid, x, y)', '      if ((!dx && !dy) || (dx && dy) || !walkable(inst.grid, x, y)']] },
  { name: 'an unset partner drags the pull to as built (Tyler 10-20)', case: 'density-pull', edits: [['src/data/hunt-grounds.js', '  const want = (picks || []).filter((p) => Number.isInteger(p) && p > 0);', '  const want = (picks || []).filter(Number.isInteger);']] },
  { name: 'the first packs spawn at the opening hero\'s pick alone', case: 'density-pull', edits: [['src/core/combat-sim.js', '            { density: densityFor(ctx.ground, standing.length, standing.map((x) => x.hero.density)) });', '            {});']] },
  { name: 'the settle never clamps the stored pick', case: 'density-settle', edits: [['src/core/combat-sim.js', '      world.density = densityFor(ctx.ground,', '      world.density = Math.max(...members.map((m) => m.hero.density), 1) || densityFor(ctx.ground,']] },
  { name: 'the solo healer fights unscaled packs with no floor (the P1 as it shipped)', case: 'solo-healer',
    edits: [['src/data/hunt-grounds.js', '  return ground && ground.partyScale === true ? scaledHp(row, partySize) : Math.max(1, (row && row.hp) || 1);', '  return Math.max(1, (row && row.hp) || 1);'],
      ['src/core/hunt/damage.js', '    ? elementWithFloor(elementOn(target, element), source.role, partySize(inst)) : elementOn(target, element);', '    ? elementOn(target, element) : elementOn(target, element);']] },
  { name: 'a migration row drifts from the registry', case: 'sql-rows', edits: [['src/data/condition-metrics.js', "label: 'My target is a boss', value: 'bool', ops: Object.freeze(['eq'])", "label: 'My target is a boss', value: 'bool', ops: Object.freeze(['eq', 'ne'])"]] },
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
