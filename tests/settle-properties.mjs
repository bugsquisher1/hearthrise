#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/settle-properties.mjs — PROPERTY TESTS OVER THE HUNT SETTLE, WITH SHRINKING (fast-check, MIT, dev-only).
//
//   node tests/settle-properties.mjs                          the guard: a fixed seed, a bounded run count (CI)
//   node tests/settle-properties.mjs --seed N --runs N        replay a failure, or go wider (--db-runs N for the DB tier)
//   node tests/settle-properties.mjs --seed N --path P        jump straight to the shrunk case a red run printed
//   node tests/settle-properties.mjs --nightly                the nightly size: ten times the runs, a seed per UTC day
//                                                             (also chosen when GITHUB_EVENT_NAME=schedule)
//   node tests/settle-properties.mjs --mutate                 every planted defect must be FOUND and SHRUNK small
//   --only=engine | --only=db                                 one tier; --verbose prints what each tier exercised
//
// mutant-anchors: supabase/functions/hr-accrue/accrue-hunt.js src/core/combat-sim.js src/core/action-rules.js supabase/migrations/2027-03-21-scaled-hunts.sql
//
// WHY. TICK-1 (tests/hunt-sessions-settle.mjs) proves the one-engine rule (CLAUDE.md §6, AWAY-1) on hand-picked cuts, and
// tests/conservation-fuzz.mjs fuzzes the economy with no shrinking: a red there is a 400-op trace to read by hand. Here
// fast-check GENERATES the hunt (a real ground, a party of 1-4 of any role and Level, bags, purses, stamina, Leave,
// stop rules, buffs, tiers) and the settle cadence (cuts anywhere, on round seconds or on swing boundaries, attended cuts
// just before each end and death, lost commits, retries), and on a red SHRINKS it to the smallest party, span and cut
// list that still fails, replayable by seed and path.
//
// THE ENGINE TIER: the world tick's settle itself (supabase/functions/hr-accrue/accrual.js accrueHunt over
// src/core/combat-sim.js simulateHuntInstance), the state carried between windows the way the database carries it
// (the world as its stored string; each member's swing, clock, stamina, bag, unit, HP, XP and xp_frac; one purse per
// account debited by the store bill; an ended member's session no longer read). Each generated case is played once as
// ONE window and once as its cut list; every window of both is checked:
//   SPLIT    any cut list == one window: per hero the XP, Level XP, coin, loot, supplies (own, bought, sold), paid time,
//            kills, the death rows and their price, the progress rows, the hints, the analyzer totals, the end and its
//            instant, the final swing, stamina, unit, HP and xp_frac; the instance's events, world, world swing and
//            watermark (the last three while a hero still hunts: engineCase says why).
//   WINDOW   a window settles only inside itself: it plays the boundaries before its end and no other (no event before
//            its start or at its watermark), its watermark is the first swing boundary at or after its end (or the end
//            of the hunt), and every swing is paid exactly one tick.
//   RETRY    a proposal the database never committed (a lost commit, a session_moved retry) moved nothing: proposing
//            the same window again answers byte-identical, and the read handed to the engine is unchanged.
//   NONNEG   nothing goes negative: no negative or fractional grant, no own supply spent past the bag, stamina never
//            raised by a hunt, HP inside [0, max], a death never prices more than the hero holds, and the purse never
//            below 0 (nor below the buying hero's gold floor when the store sold).
//
// THE DATABASE TIER: the same generated shape on the REAL replayed chain (PGlite, as hr_engine, the shipped edge pieces
// readHuntSettle / proposeHuntSettle / commitHuntSettle through tests/hunt-sessions-settle.mjs's HARNESS), on its
// fixture ground (rats and a wolf, ghouls, or both), a party of 1-4 accounts, the server clock pinned to each cut:
//   DB-SPLIT   the tick's slices and a generated cut list write the same rows (hunt-sessions-settle.mjs snapshot()).
//   DB-REPLAY  a landed commit sent again answers `replayed` and moves nothing; a proposal made before another settle
//              landed answers `session_moved` and moves nothing.
//   DB-LEDGER  the ledger conserves value: per account the wallet moved by exactly the sum of its ledger gold, and per item
//              the bag + backpack moved by exactly the loot the accrue rows journal less the own supplies journalled; no
//              wallet, stack, bag line, XP, Level XP or stamina pool is ever negative.
//
// A FAILURE prints the shrunk case, the first difference and `--seed S --path P` to replay it. NOTHING IS HIDDEN: a real
// defect is reported and, until fixed, pinned STRICTLY (red the day it stops reproducing; KNOWN-F1, the first, fixed
// 2026-11-18 and now a mutant below), and the two things SPLIT does not compare (a closed instance's own clock, the
// Level-up display list) say why where they are skipped.
// Every red, every run size and the coverage floor (a run that exercised too little is red: NOT VACUOUS) are exit codes.
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import fc from 'fast-check';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARGV = process.argv.slice(2);
const has = (f) => ARGV.includes(f);
const valOf = (name) => {
  const i = ARGV.indexOf(name);
  if (i >= 0 && i + 1 < ARGV.length) return ARGV[i + 1];
  const eq = ARGV.find((a) => a.startsWith(name + '='));
  return eq ? eq.slice(name.length + 1) : null;
};
const intArg = (name) => { const v = valOf(name); if (v === null) return null; const n = Number(v); if (!Number.isInteger(n)) throw new Error(name + ' wants an integer, got ' + v); return n; };
const VERBOSE = has('--verbose');
const ONLY = valOf('--only');

/* THE SIZES. CI: one fixed seed and a bounded count (measured 2026-11-18 on the lane's PC: 250 engine hunts 34 s, 40 DB
   hunts 11 s, plus the chain's boot). Nightly: a seed per UTC day (deterministic for that night, printed, so a red
   replays) and ten times the runs. */
const CI_SEED = 20261118;
const NIGHTLY = has('--nightly') || process.env.GITHUB_EVENT_NAME === 'schedule';
const DAY_SEED = CI_SEED + Math.floor(Date.now() / 86400000);
const SEED = intArg('--seed') ?? (NIGHTLY ? DAY_SEED : CI_SEED);
const ENGINE_RUNS = intArg('--runs') ?? (NIGHTLY ? 2500 : 250);
const DB_RUNS = intArg('--db-runs') ?? (NIGHTLY ? 400 : 40);
const PATH = valOf('--path');

// ═══════════════════════════════════════════════════════════════════════
// THE ENGINE TIER
// ═══════════════════════════════════════════════════════════════════════
const T0 = Date.UTC(2026, 10, 18, 12, 0, 0);
const IID = '00000000-0000-4000-8000-0000005e7701';
const SPAN_MAX = 15 * 60000;
const COMBAT = ['melee', 'ranged', 'magic', 'defense'];
const ROLES = ['tank', 'melee_dps', 'ranger', 'mage', 'healer'];

/** The engine and what a member is built from, imported from `root` (the repo or a planted copy). */
export async function loadEngine(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const AC = await import(u('supabase/functions/hr-accrue/accrual.js'));
  const SPAWN = await import(u('src/core/hunt-spawn.js'));
  const XP = await import(u('src/core/xp.js'));
  const SB = await import(u('src/data/supply-basics.js'));
  const G = await import(u('src/data/hunt-grounds.js'));
  const HUNTS = (await import(u('src/data/hunts.js'))).HUNT_INDEX;
  const { MONSTERS } = await import(u('src/data/monsters.js'));
  const { ITEMS } = await import(u('src/data/items.js'));
  const { wornRoleKey } = await import(u('src/data/hunt-roles.js'));
  const { gridOfMap } = await import(u('src/core/hunt-ground.js'));
  const { COMBAT_BALANCE } = await import(u('src/core/combat.js'));
  /* the measured hero's ladder kit (the balance runs' gear by Level), one source with tests/hunt-core */
  const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  const { kitFor } = await loadPlay(root);
  const basics = {};
  for (const b of SB.BASIC_SUPPLIES) basics[b.id] = { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner };
  /* every live ground the world tick settles (a staged ground is not open to anyone yet) */
  const grounds = Object.keys(G.HUNT_GROUNDS).filter((id) => HUNTS[id] && Array.isArray(HUNTS[id].band) && !HUNTS[id].staged).sort();
  const grids = new Map();
  const whereOf = (id) => {
    if (!grids.has(id)) grids.set(id, { ground: G.HUNT_GROUNDS[id], grid: gridOfMap(G.HUNT_GROUNDS[id].map) });
    return grids.get(id);
  };
  return { AC, SPAWN, XP, HUNTS, MONSTERS, ITEMS, wornRoleKey, kitFor, basics, grounds, whereOf, tickMs: COMBAT_BALANCE.tickMs };
}

/* canonical JSON (sorted keys): the one equality every comparison here uses */
const canon = (v) => {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
};
const firstDiff = (a, b) => {
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  return `at char ${i}: ...${a.slice(Math.max(0, i - 160), i + 120)}... vs ...${b.slice(Math.max(0, i - 160), i + 120)}...`;
};
const addTo = (acc, obj, sign = 1) => { for (const [k, v] of Object.entries(obj || {})) acc[k] = (acc[k] || 0) + sign * Number(v); return acc; };
const isNat = (v) => Number.isSafeInteger(v) && v >= 0;

/* ── THE GENERATED HUNT ──────────────────────────────────────────────────
   Every field shrinks toward the plainest hunt: one hero, at the ground's floor, an empty bag, a full pool, no Leave, no
   rule, no buff, one window. A cut is a millisecond offset, a round second or a swing boundary (the tick's clock lands
   on whole seconds from a whole-second start, so boundaries are where an off-by-one lives), and what became of its
   commit: landed, lost (proposed, never committed: the next settle reads the same state) or retried (proposed twice,
   committed once). An end condition (a short pool, a Leave, a stop rule) or a buff is `sometimes`: on a third of heroes,
   so most hunts run long enough to be cut (fc.option's default puts one on five heroes in six). */
const sometimes = (arb) => fc.oneof({ arbitrary: fc.constant(null), weight: 2 }, { arbitrary: arb, weight: 1 });
const heroArb = fc.record({
  role: fc.constantFrom(...ROLES),
  lvl: fc.integer({ min: -6, max: 12 }),            // Levels over the ground's floor
  over: fc.integer({ min: 0, max: 999 }),           // permille into that Level (a death can take it back)
  food: fc.integer({ min: 0, max: 40 }),            // own Cooked Shrimp packed
  arrows: fc.integer({ min: 0, max: 300 }),         // a Ranger's own Bronze Arrows packed
  gold: fc.oneof(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 30000 }), fc.constant(1000000)),
  floor: fc.constantFrom(0, 25, 300, 5000),
  onEmpty: fc.constantFrom('switch', 'end'),
  source: fc.constantFrom('mine', 'store'),
  stamina: sometimes(fc.integer({ min: 1, max: 450 })),   // swings left in the pool; null = a full pool
  together: fc.boolean(),
  shared: fc.boolean(),                             // the same account as seat 0 (one purse)
  leaveAt: sometimes(fc.integer({ min: 1, max: SPAN_MAX })),
  stop: sometimes(fc.record({ pct: fc.integer({ min: 5, max: 95 }), forMs: fc.integer({ min: 0, max: 60 }).map((n) => n * 100) })),
  buff: sometimes(fc.record({ mag: fc.integer({ min: 10, max: 200 }), from: fc.integer({ min: -60000, max: SPAN_MAX }), len: fc.integer({ min: 1, max: SPAN_MAX }) })),
});
/* A cut is WHERE in the span (millionths of it, so every cut lands inside whatever span the case has, and shrinks toward
   the start) and HOW it falls: on any millisecond, a whole second, or a swing boundary. */
const cutArb = fc.record({ u: fc.integer({ min: 1, max: 999999 }), snap: fc.constantFrom('ms', 's', 'swing'), mode: fc.constantFrom('land', 'lost', 'retry') });
const scenarioArb = (grounds) => fc.record({
  hunt: fc.constantFrom(...grounds),
  tier: fc.constantFrom('normal', 'dangerous', 'deadly'),
  density: fc.option(fc.integer({ min: 1, max: 8 }), { nil: null }),
  secret: fc.bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n }).map(String),
  spanMs: fc.integer({ min: 1000, max: SPAN_MAX }),
  heroes: fc.array(heroArb, { minLength: 1, maxLength: 4 }),
  cuts: fc.array(cutArb, { maxLength: 10 }),
  /* THE ATTENDED CUTS (hunt-sessions-settle.mjs attendedCuts, generated): a player who watches settles at irregular instants
     around the moments that matter. For the k-th end or death the one-window run saw, one more cut lands near[k % n] ms
     before it: inside the swing that set a certain end, where a stamping defect lives and a random cut almost never falls. */
  near: fc.array(fc.integer({ min: 1, max: 3000 }), { maxLength: 3 }),
});
const SNAP = Object.freeze({ ms: 1, s: 1000, swing: 2000 });
/** A case's cut offsets inside its span: [{ at (ms from the start), mode }], sorted, one per instant (the first mode wins).
    A cut is the generated { u, snap, mode } or a pinned { at, mode } (what describe() prints, so a printed case pastes back). */
export function cutOffsets(sc) {
  const seen = new Map();
  for (const c of sc.cuts) {
    const at = Number.isInteger(c.at) ? c.at : Math.floor(Math.floor((sc.spanMs * c.u) / 1e6) / SNAP[c.snap]) * SNAP[c.snap];
    if (at > 0 && at < sc.spanMs && !seen.has(at)) seen.set(at, c.mode);
  }
  return [...seen].map(([at, mode]) => ({ at, mode })).sort((x, y) => x.at - y.at);
}

/** One hero's starting state, as the database would hold it at the hunt's first instant. */
function heroState(E, sc, h, i) {
  const band = E.HUNTS[sc.hunt].band;
  const L = Math.max(1, Math.min(99, band[0] + h.lvl));
  const at = E.XP.charXpForLevel(L), next = E.XP.charXpForLevel(L + 1);
  const equipment = E.kitFor(L, h.role, false);
  const bag = {};
  if (h.food > 0) bag.cooked_shrimp = { loaded: h.food, left: h.food };
  if (h.role === 'ranger' && h.arrows > 0) bag.bronze_arrows = { loaded: h.arrows, left: h.arrows };
  const buffs = h.buff ? [{ type: 'damage', magnitude: h.buff.mag, from: new Date(T0 + h.buff.from).toISOString(), until: new Date(T0 + h.buff.from + h.buff.len).toISOString() }] : null;
  const user = h.shared && i > 0 ? 'u0' : 'u' + i;
  return {
    i, key: user + ':' + i, user, slot: i, seat: i, role: h.role, L, equipment, buffs, gold0: h.gold, floor: h.floor,
    skills: Object.fromEntries(COMBAT.map((k) => [k, E.XP.skillXpForLevel(k, L)])),
    levelXp: at + Math.floor(((next > at ? next - at : 0) * h.over) / 1000), xpFrac: {}, hp: null, unitId: null,
    swingIndex: 0, nextSwingAtMs: T0, staminaMs: h.stamina === null ? 12 * 3600000 : h.stamina * E.tickMs, bag,
    options: { ...(h.role === 'healer' ? { role: 'healer' } : {}), tier: sc.tier, ...(sc.density !== null ? { density: sc.density } : {}),
      ...(h.stop ? { stop_rules: [{ conditions: [{ metric: 'self_hp_pct', op: 'lt', value: h.stop.pct }], join: 'and', forMs: h.stop.forMs }] } : {}) },
    onEmpty: h.onEmpty, source: h.source, together: h.together, leaveAtMs: h.leaveAt === null ? null : T0 + h.leaveAt, ended: null,
  };
}

/* THE HERO THE READ HANDS THE ENGINE is its own character's (heroSetup, as hunt-settle.js readHuntSettle builds it): never
   the party the read saw. A setting the player left unset is the role's default for the party standing in the world at
   each boundary, which the engine reads itself (roles.js settingsOf). KNOWN-F1 (found here 2026-11-18, fixed the same
   day): the read once handed heroSetup the OPEN members' roles, so a survivor's defaults moved at whichever settle came
   after its partner's end; ENGINE_MUTANTS keeps that defect planted for --mutate. */

/** The read: every open member's engine input, built afresh from the carried state (hunt-settle.js memberInput's shape). */
function readOf(E, sc, inst, open, purse, toMs) {
  const where = E.whereOf(sc.hunt);
  const members = open.map((h) => ({
    key: h.key, user: h.user, slot: h.slot, seat: h.seat, unitId: h.unitId, sessionId: 's-' + h.key, version: 1, huntId: sc.hunt,
    huntSession: { id: 's-' + h.key, instanceId: IID, huntFromMs: T0, nextSwingAtMs: h.nextSwingAtMs, swingIndex: h.swingIndex,
      bag: JSON.parse(JSON.stringify(h.bag)), hoursLimit: null, leaveAtMs: h.leaveAtMs, changeAtMs: null, stopAtMs: null,
      staminaMs: h.staminaMs, staminaMaxMs: 12 * 3600000, basics: E.basics, goldFloor: h.floor, supplySource: h.source, onEmpty: h.onEmpty, cover: {} },
    skills: { ...h.skills }, levelXp: h.levelXp, xpFrac: { ...h.xpFrac }, hp: h.hp === null ? 1e9 : h.hp, gold: purse[h.user],
    equipment: { ...h.equipment }, inventory: {}, buffs: h.buffs ? h.buffs.map((b) => ({ ...b })) : null,
    deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false, perks: null,
    hero: E.SPAWN.heroSetup({ weaponType: E.wornRoleKey(h.equipment, E.ITEMS), options: h.options, bar: [],
      leaveTogether: h.together === true, lead: h.seat === 0 }),
  }));
  return { instance: { id: IID, nextSwingAtMs: inst.nextSwingAtMs, world: inst.world, worldSwing: inst.worldSwing },
    window: { fromMs: inst.settledTo, toMs }, secret: sc.secret, ground: where.ground, grid: where.grid, items: E.ITEMS, monsters: E.MONSTERS, members };
}
/* the read minus the shared catalogues (a mutation of those shows up as a SPLIT difference instead) */
const readImage = (inp) => canon({ instance: inp.instance, window: inp.window, secret: inp.secret, members: inp.members });
const proposalImage = (out) => canon(out);

/**
 * PLAY ONE TIMELINE: windows ending at `cuts` (each { at: absolute ms, mode }), the last one the span's end.
 * Answers { agg (per hero), inst (the final instance), events, problems (WINDOW / RETRY / NONNEG findings, in order) }.
 */
export function playTimeline(E, sc, cuts) {
  const heroes = sc.heroes.map((h, i) => heroState(E, sc, h, i));
  const purse = {};
  for (const h of heroes) if (!(h.user in purse)) purse[h.user] = h.gold0;
  const inst = { world: null, worldSwing: 0, nextSwingAtMs: T0, settledTo: T0 };
  const agg = Object.fromEntries(heroes.map((h) => [h.key, { xp: {}, levelXp: 0, gold: 0, items: {}, uses: {}, buys: {}, cover: {}, paidMs: 0, kills: 0,
    km: {}, ms: 0, deaths: [], deathXp: [], progress: {}, hintDeath: [], hintRare: [], slotDry: {}, analyzer: { dealt: 0, taken: 0, healed: 0 },
    ended: null, swingTo: 0, stamina: h.staminaMs, unit: null, hp: null, xpFrac: {} }]));
  const events = [];
  const problems = [];
  const bad = (rule, msg) => problems.push(rule + ' ' + msg);
  const seen = { landed: 0, lost: 0, retried: 0 };
  for (const c of cuts) {
    const open = heroes.filter((h) => !h.ended);
    if (!open.length) break;
    if (!(c.at > inst.settledTo)) continue;                 // the instance is already settled past this cut: nothing owed
    const inp = readOf(E, sc, inst, open, purse, c.at);
    const before = readImage(inp);
    const out = E.AC.accrueHunt(inp);
    if (readImage(inp) !== before) bad('RETRY', `the engine changed the read it was handed (window to +${c.at - T0} ms): a lost commit's proposal leaks into the next ${firstDiff(before, readImage(inp))}`);
    if (c.mode === 'retry' && out.accrued) {
      seen.retried++;
      const again = E.AC.accrueHunt(readOf(E, sc, inst, open, purse, c.at));
      if (proposalImage(again) !== proposalImage(out)) bad('RETRY', `the same window proposed twice answered differently (to +${c.at - T0} ms) ${firstDiff(proposalImage(out), proposalImage(again))}`);
    }
    if (out.refused) { bad('SPLIT', `the window to +${c.at - T0} ms was refused ${out.reason} (${out.worldBytes} B)`); continue; }
    if (!out.accrued) continue;
    if (c.mode === 'lost') { seen.lost++; continue; }
    seen.landed++;
    landWindow(E, sc, inst, heroes, purse, inp, out, agg, events, bad);
  }
  return { agg, inst, events, problems, heroes, seen };
}

/** Commit one window the way the database does, checking WINDOW and NONNEG on the way. */
function landWindow(E, sc, inst, heroes, purse, inp, out, agg, events, bad) {
  const { fromMs, toMs } = inp.window;
  const tick = E.tickMs;
  const where = `window [+${fromMs - T0}, +${toMs - T0})`;
  /* WINDOW: a swing at a boundary before the end is played whole (its sub-steps run to the next boundary), so every event
     lies between the window's start and its watermark, and the watermark is the first boundary at or after the end (or an end) */
  for (const e of out.events || []) {
    if (Number.isFinite(e.atMs) && (e.atMs >= out.settledTo || e.atMs < fromMs)) { bad('WINDOW', `${where} carries a ${e.type} event at +${e.atMs - T0} ms, past its watermark +${out.settledTo - T0}`); break; }
  }
  const anyOpen = out.members.some((p) => !p.hunt.ended) || heroes.some((h) => !h.ended && !out.members.find((p) => p.key === h.key));
  if (anyOpen && !(out.settledTo >= toMs && out.settledTo < toMs + tick)) bad('WINDOW', `${where} settled to +${out.settledTo - T0} ms, not the first boundary at or after its end`);
  const spent = {};
  for (const p of out.members) {
    const h = heroes.find((x) => x.key === p.key);
    const a = agg[p.key];
    const d = p.delta, hu = p.hunt;
    const who = `${where} ${p.key} (${h.role} L${h.L})`;
    /* NONNEG on the proposal */
    if (d.gold !== undefined && !(isNat(d.gold) && d.gold > 0)) bad('NONNEG', `${who} coin ${d.gold}`);
    if (d.level_xp !== undefined && !(isNat(d.level_xp) && d.level_xp > 0)) bad('NONNEG', `${who} Level XP ${d.level_xp}`);
    for (const [k, v] of Object.entries(d.xp || {})) if (!(isNat(v) && v > 0)) bad('NONNEG', `${who} ${k} XP ${v}`);
    for (const [k, v] of Object.entries(d.items || {})) if (!(isNat(v) && v > 0)) bad('NONNEG', `${who} loot ${k} x${v}`);
    for (const part of ['uses', 'buys', 'cover']) for (const [k, v] of Object.entries(hu[part] || {})) if (!(isNat(v) && v > 0)) bad('NONNEG', `${who} ${part} ${k} x${v}`);
    for (const [id, n] of Object.entries(hu.uses || {})) {
      const line = h.bag[id];
      if (!line || n > line.left) bad('NONNEG', `${who} spent ${n} own ${id} with ${line ? line.left : 0} in the bag`);
    }
    if (hu.stamina !== null && !(isNat(hu.stamina) && hu.stamina <= h.staminaMs)) bad('NONNEG', `${who} stamina ${h.staminaMs} -> ${hu.stamina}`);
    if (!(isNat(d.hp) && d.hp <= p.maxHp)) bad('NONNEG', `${who} HP ${d.hp} of ${p.maxHp}`);
    if (hu.paid_ms !== (hu.swing_to - hu.swing_from) * tick) bad('WINDOW', `${who} paid ${hu.paid_ms} ms for ${hu.swing_to - hu.swing_from} swings`);
    for (const dx of hu.death_xp || []) {
      for (const [k, v] of Object.entries(dx)) {
        const held = k === 'level' ? h.levelXp + (d.level_xp || 0) : (h.skills[k] || 0) + ((d.xp || {})[k] || 0);
        if (!(isNat(v) && v <= held)) bad('NONNEG', `${who} a death priced ${k} at ${v} with ${held} held`);
      }
    }
    /* the aggregate */
    addTo(a.xp, d.xp); a.levelXp += d.level_xp || 0; a.gold += d.gold || 0; addTo(a.items, d.items);
    addTo(a.uses, hu.uses); addTo(a.buys, hu.buys); addTo(a.cover, hu.cover); a.paidMs += hu.paid_ms;
    const meta = d.journal.meta;
    a.kills += meta.kills; addTo(a.km, meta.km); a.ms += meta.ms;
    for (const x of d.deaths || []) a.deaths.push(x);
    for (const x of hu.death_xp || []) if (Object.keys(x).length) a.deathXp.push(x);
    for (const op of d.progress || []) { const k = op.kind + '|' + op.key + '|' + op.period + '|' + op.state; a.progress[k] = (a.progress[k] || 0) + op.add; }
    for (const t of hu.hints.death) a.hintDeath.push(t);
    for (const r of hu.hints.rare_drop) a.hintRare.push(r.item + '@' + r.at);
    for (const [item, t] of Object.entries(hu.hints.slot_dry || {})) if (!(item in a.slotDry)) a.slotDry[item] = t;
    for (const k of ['dealt', 'taken', 'healed']) a.analyzer[k] += Number(((p.analyzer || {})[k] || {}).total || 0);
    a.ended = hu.ended; a.swingTo = hu.swing_to; a.stamina = hu.stamina; a.unit = hu.unit_id; a.hp = d.hp;
    /* the carry (hr_hunt_apply_member + hr_apply, as the next read sees them) */
    h.swingIndex = hu.swing_to; h.nextSwingAtMs = Date.parse(hu.next_swing_at); h.staminaMs = hu.stamina;
    for (const [id, n] of Object.entries(hu.uses || {})) h.bag[id].left -= n;
    h.unitId = hu.unit_id; h.hp = d.hp;
    for (const [k, v] of Object.entries(d.xp || {})) h.skills[k] = (h.skills[k] || 0) + v;
    h.levelXp += d.level_xp || 0;
    /* the stored remainder (player_skills.xp_frac): a remainder back at 0 is the same row as none (progression.js normaliseXpFrac) */
    if (d.xp_frac) { h.xpFrac = { ...h.xpFrac, ...d.xp_frac }; a.xpFrac = Object.fromEntries(Object.entries(h.xpFrac).filter(([, v]) => Number(v) > 0)); }
    for (const dx of hu.death_xp || []) for (const [k, v] of Object.entries(dx)) { if (k === 'level') h.levelXp -= v; else h.skills[k] -= v; }
    let bill = 0;
    for (const [id, n] of Object.entries(hu.buys || {})) bill += n * E.basics[id].price;
    purse[h.user] += (d.gold || 0) - bill;
    if (bill > 0) spent[h.user] = Math.min(spent[h.user] ?? Infinity, h.floor);
    if (hu.ended) h.ended = hu.ended;
    if (h.levelXp < 0 || Object.values(h.skills).some((v) => v < 0)) bad('NONNEG', `${who} Level XP ${h.levelXp} / skills ${canon(h.skills)} after the death`);
  }
  for (const [user, g] of Object.entries(purse)) {
    if (!(isNat(g))) bad('NONNEG', `${where} the purse of ${user} is ${g}`);
    else if (user in spent && g < spent[user]) bad('NONNEG', `${where} the store took ${user}'s purse to ${g}, under the buying hero's floor ${spent[user]}`);
  }
  for (const e of out.events || []) events.push(e);
  inst.world = out.world; inst.worldSwing = out.worldSwingTo; inst.nextSwingAtMs = out.settledTo; inst.settledTo = out.settledTo;
}

/** The cut list a generated case asks for, absolute, ending at the span's end. */
export function cutsOf(sc, whole) {
  const at = new Map(cutOffsets(sc).map((c) => [T0 + c.at, c.mode]));
  /* the attended cuts, from the one-window run's ends and deaths (sc.near; none when it is empty) */
  if (whole && sc.near && sc.near.length) {
    const moments = [];
    for (const a of Object.values(whole.agg)) {
      if (a.ended) moments.push(Date.parse(a.ended.at));
      for (const t of a.hintDeath) moments.push(t);
    }
    moments.sort((x, y) => x - y).forEach((t, k) => {
      const c = t - sc.near[k % sc.near.length];
      if (c > T0 && c < T0 + sc.spanMs && !at.has(c)) at.set(c, 'land');
    });
  }
  return [...[...at].map(([t, mode]) => ({ at: t, mode })).sort((x, y) => x.at - y.at), { at: T0 + sc.spanMs, mode: 'land' }];
}

/** The engine property: SPLIT, WINDOW, RETRY and NONNEG on one generated case. Answers the problems (empty = green);
    `tally` (optional) counts what the case exercised, so a run can prove it was not vacuous. */
export function engineCase(E, sc, tally) {
  const whole = playTimeline(E, sc, [{ at: T0 + sc.spanMs, mode: 'land' }]);
  const cuts = cutsOf(sc, whole);
  const split = playTimeline(E, sc, cuts);
  const problems = [...whole.problems.map((p) => 'one window: ' + p), ...split.problems.map((p) => 'cut: ' + p)];
  if (tally) {
    const t = (k, n = 1) => { tally[k] = (tally[k] || 0) + n; };
    t('cases');
    if (sc.heroes.length > 1) t('party');
    if (split.seen.landed > 1) t('split');
    t('lost', split.seen.lost); t('retried', split.seen.retried);
    t('attended', cuts.length - 1 - cutOffsets(sc).length);
    for (const a of Object.values(whole.agg)) {
      if (a.ended) t('end:' + a.ended.reason);
      if (a.deathXp.length) t('death');
      if (Object.keys(a.buys).length) t('store');
      if (Object.keys(a.uses).length) t('own');
      if (a.kills) t('kills', a.kills);
    }
    if (whole.heroes.some((h) => h.ended) && whole.heroes.some((h) => !h.ended)) t('survivor');
  }
  /* SPLIT. When every hero has ended, the instance is closed: its world is null on both, and what it did after the last
     hero went home is no hero's. combat-sim.js steps a window whose FIRST boundary ends everyone once, so no window is empty
     (hr_hunt_apply refuses bad_window): when a cut falls just before the last end, that one step moves the closed instance's
     clock (watermark, swing counter) by a tick and can emit a display float (xp_group) after the end. Every hero's own end
     instant, value and event before it is still compared. (A party instance is reused after its last end, so that counter
     seeds the NEXT hunt's dice: raised with the Backend Architect as a design question, not asserted here.) */
  const closedAt = (t) => (t.heroes.every((h) => h.ended) ? Math.max(...t.heroes.map((h) => Date.parse(h.ended.at))) : null);
  /* (Not compared: the proposal's levelUps, a display list never committed. Each window lists the Levels banked after ITS
     own death, so a hero who reaches a Level and loses it to a later death lists that Level-up in a cut list and not in
     one window. The XP, the Level XP and the death's price, which decide every Level, are compared.) */
  const image = (t) => {
    const end = closedAt(t);
    return canon({ heroes: t.agg, world: t.inst.world, clock: end === null ? [t.inst.settledTo, t.inst.worldSwing] : 'closed',
      events: end === null ? t.events : t.events.filter((e) => !(e.atMs >= end)) });
  };
  const a = image(whole), b = image(split);
  if (a !== b) problems.push(`SPLIT one window and the cut list settled different hunts ${firstDiff(a, b)}`);
  return problems;
}

/* The shrunk case, compact: what a reader needs to see the failure. */
function describe(sc) {
  return JSON.stringify({ hunt: sc.hunt, tier: sc.tier, density: sc.density, secret: sc.secret, spanMs: sc.spanMs,
    heroes: sc.heroes, cuts: cutOffsets(sc), near: sc.near || [] });
}
const sizeOf = (sc) => ({ heroes: sc.heroes.length, cuts: cutOffsets(sc).length + (sc.near ? sc.near.length : 0), spanMs: sc.spanMs });

/** Run the engine property. Answers { failed, details, ms, tally }. */
export async function runEngine(root, o) {
  const E = await loadEngine(root);
  const t0 = Date.now();
  const tally = {};
  const prop = fc.property(scenarioArb(E.grounds), (sc) => {
    const problems = engineCase(E, sc, tally);
    if (problems.length) throw new Error(problems.slice(0, 3).join('\n  '));
    return true;
  });
  const details = fc.check(prop, { seed: o.seed, numRuns: o.runs, ...(o.path ? { path: o.path } : {}),
    ...(o.timeLimitMs ? { interruptAfterTimeLimit: o.timeLimitMs } : {}) });
  return { failed: details.failed, details, ms: Date.now() - t0, tally };
}

/* NOT VACUOUS: a green run must have exercised every path the properties are about, at least this often PER 100 CASES,
   so a generator that drifts (a ground that stops dying, a cut list that stops landing) turns the run red instead of
   quiet. Counted over the generated cases (a green run never shrinks); about half what the CI seed measured on 2026-11-18
   (engine per 100: party 76, split 51, lost 89, retried 93, survivor 13, death 14, store 60, own 62, kills 6,419, ends
   left 20 / stamina 21 / rule 18 / party_member_left 36 / heals_out 4 / gold_out 3; db per 100: party 67, split 67,
   replay 60, stale 55). */
const ENGINE_FLOOR = Object.freeze({ party: 35, split: 25, lost: 40, retried: 40, survivor: 6, death: 6, store: 25, own: 25, kills: 3000,
  'end:left': 10, 'end:stamina': 10, 'end:rule': 8, 'end:party_member_left': 15, 'end:heals_out': 2, 'end:gold_out': 1, 'end:died': 6 });
const DB_FLOOR = Object.freeze({ party: 35, split: 30, replay: 25, stale: 20, death: 2, store: 5 });
function coverage(tally, floor, scale) {
  return Object.entries(floor).filter(([k, n]) => (tally[k] || 0) < Math.ceil(n * scale)).map(([k, n]) => `${k} ${tally[k] || 0} < ${Math.ceil(n * scale)}`);
}

// ═══════════════════════════════════════════════════════════════════════
// THE DATABASE TIER
// ═══════════════════════════════════════════════════════════════════════
export async function bootDb() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
  const { db } = await bootReplay();
  await H.pinDice(db);
  return { db, H };
}

const DB_T0 = Date.UTC(2026, 10, 18, 9, 0, 0);
const DB_SPAN_MAX = 12 * 60000;
const dbHeroArb = fc.record({
  level: fc.integer({ min: 3, max: 30 }),
  stock: fc.integer({ min: 0, max: 30 }),            // Cooked Shrimp in the backpack
  packed: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 30 })),   // ...of which packed (half the bags empty: the store feeds them)
  gold: fc.oneof(fc.integer({ min: 0, max: 2000 }), fc.constant(100000)),
  onEmpty: fc.constantFrom('switch', 'end'),
  hurt: sometimes(fc.integer({ min: 5, max: 200 })),
});
const dbScenarioArb = fc.record({
  ground: fc.constantFrom('rats', 'mixed', 'ghouls'),
  heroes: fc.array(dbHeroArb, { minLength: 1, maxLength: 4 }),
  stamina: sometimes(fc.integer({ min: 1, max: 300 })),
  spanMs: fc.integer({ min: 2000, max: DB_SPAN_MAX }),
  /* as the engine tier's cuts (cutOffsets), and what the cut does: land, land then send the same commit again (replay), or
     read and propose for the NEXT cut, let this one land first, then commit that stale proposal (stale) */
  cuts: fc.array(fc.record({ u: fc.integer({ min: 1, max: 999999 }), snap: fc.constantFrom('ms', 's', 'swing'), mode: fc.constantFrom('land', 'replay', 'stale') }), { maxLength: 8 }),
});

const dbFixture = (h) => ({ level: h.level, inv: h.stock > 0 ? { cooked_shrimp: h.stock } : {},
  bag: Math.min(h.stock, h.packed) > 0 ? [{ item: 'cooked_shrimp', qty: Math.min(h.stock, h.packed) }] : [], gold: h.gold,
  options: { on_empty: h.onEmpty }, ...(h.hurt !== null ? { hp: h.hurt } : {}) });

/** One DB case: two timelines in one transaction (the tick's slices, then the generated cuts), checked. `tally` as engineCase's. */
export async function dbCase(db, H, M, sc, tally) {
  const problems = [];
  const t = (k, n = 1) => { if (tally) tally[k] = (tally[k] || 0) + n; };
  t('cases');
  if (sc.heroes.length > 1) t('party');
  const users = H.UIDS.slice(0, sc.heroes.length);
  const pinNow = (ms) => db.query(`select set_config('hr.test_now', $1, true)`, [new Date(ms).toISOString()]);
  const onClock = { clock: pinNow };
  return H.inTx(db, async () => {
    /* every case draws the same ids whatever ran before it (the shrinker replays cases out of order) */
    await db.query(`select setval('public.hr_test_uuid_seq', 5000, false)`);
    await pinNow(DB_T0);
    const fixtures = sc.heroes.map(dbFixture);
    const row = sc.ground === 'ghouls' ? undefined : sc.ground === 'mixed' ? H.mixedRow : undefined;
    const o = sc.heroes.length === 1
      ? { ...fixtures[0], fromMs: DB_T0, ...(sc.ground === 'ghouls' ? { deadly: true } : {}), ...(row ? { row } : {}), ...(sc.stamina !== null ? { stamina: sc.stamina * 2000 } : {}) }
      : { party: fixtures, fromMs: DB_T0, ...(sc.ground === 'ghouls' ? { deadly: true } : {}), ...(row ? { row } : {}), ...(sc.stamina !== null ? { stamina: sc.stamina * 2000 } : {}) };
    const h = await H.hunter(db, M, o);
    const end = h.from + sc.spanMs;
    const exec = H.makeExec(db);
    const rawSnap = () => Promise.all(h.sids.map((sid, i) => H.snapshot(db, sid, users[i])));
    /* a closed instance's clock is no hero's value (the engine tier's SPLIT note): compared only while a session is open */
    const snap = async () => {
      const s = await rawSnap();
      if (!s.every((x) => x.session && x.session.ended_at)) return s;
      return s.map((x) => ({ ...x, instance: x.instance ? { world: x.instance.world, clock: 'closed' } : null }));
    };
    const books = async () => H.one(db, `select jsonb_build_object(
        'wallet', (select jsonb_object_agg(user_id, gold) from public.account_wallet where user_id = any($1::uuid[])),
        'items', (select jsonb_object_agg(k, n) from (select user_id || '|' || item_id k, sum(n) n from (
                    select user_id, item_id, qty n from public.player_inventory where user_id = any($1::uuid[])
                    union all select s.user_id, b.item_id, b.qty_left from public.hunt_bag b join public.hunt_sessions s on s.id = b.session_id
                     where s.user_id = any($1::uuid[])) x group by 1) y),
        'neg', (select jsonb_build_object(
                    'wallet', (select count(*) from public.account_wallet where user_id = any($1::uuid[]) and gold < 0),
                    'inv', (select count(*) from public.player_inventory where user_id = any($1::uuid[]) and qty < 0),
                    'bag', (select count(*) from public.hunt_bag b join public.hunt_sessions s on s.id = b.session_id where s.user_id = any($1::uuid[]) and b.qty_left < 0),
                    'xp', (select count(*) from public.player_skills where user_id = any($1::uuid[]) and xp < 0),
                    'state', (select count(*) from public.player_state where user_id = any($1::uuid[]) and (level_xp < 0 or stamina_ms < 0)))),
        'hwm', (select coalesce(max(id), 0) from public.player_ledger))`, [users]);
    const ledgerSince = (hwm) => H.q(db, `select user_id, kind, intent, gold, qty, item_id, meta from public.player_ledger
                                             where id > $1 and user_id = any($2::uuid[]) order by id`, [hwm, users]);
    /* DB-LEDGER over one timeline */
    const conserve = async (label, b0) => {
      const b1 = await books();
      for (const [k, n] of Object.entries(b1.neg)) if (Number(n)) problems.push(`DB-LEDGER ${label}: ${n} negative ${k} row(s)`);
      const rows = await ledgerSince(b0.hwm);
      const gold = {}, items = {}, unread = new Set();
      for (const r of rows) {
        gold[r.user_id] = (gold[r.user_id] || 0) + Number(r.gold || 0);
        const m = r.meta || {};
        /* the loot an accrue row journals (hr_apply's delta.i), the own units a supply row spent from the bag, and any row that
           names one item on the bag or backpack side by its signed quantity (the bag home at the end: bag -n, backpack +n) */
        if (r.kind === 'combat' && r.intent === 'accrue') addTo(items, Object.fromEntries(Object.entries((m.delta && m.delta.i) || {}).map(([id, n]) => [r.user_id + '|' + id, n])));
        else if (r.kind === 'hunt' && r.intent === 'supply_own') addTo(items, Object.fromEntries(Object.entries(m.items || {}).map(([id, n]) => [r.user_id + '|' + id, n])), -1);
        else if (r.item_id && (m.side === 'bag' || m.side === 'inventory')) addTo(items, { [r.user_id + '|' + r.item_id]: Number(r.qty || 0) });
        else if (r.item_id || (r.qty && r.intent !== 'supply_buy')) unread.add(r.kind + ':' + r.intent + (m.side ? ':' + m.side : ''));
      }
      if (unread.size) problems.push(`DB-LEDGER ${label}: ledger rows this guard does not know how to count: ${[...unread].join(', ')}`);
      if (label === 'the generated cuts') {
        if (rows.some((r) => r.intent === 'supply_buy')) t('store');
        if (rows.some((r) => r.intent === 'death')) t('death');
        if (rows.filter((r) => r.kind === 'combat' && r.intent === 'accrue').length > sc.heroes.length) t('split');
      }
      for (const u of users) {
        const moved = Number((b1.wallet || {})[u] || 0) - Number((b0.wallet || {})[u] || 0);
        if (moved !== (gold[u] || 0)) problems.push(`DB-LEDGER ${label}: the wallet of seat ${users.indexOf(u)} moved ${moved}, its ledger says ${gold[u] || 0}`);
      }
      const keys = new Set([...Object.keys(b0.items || {}), ...Object.keys(b1.items || {}), ...Object.keys(items)]);
      for (const k of keys) {
        const moved = Number((b1.items || {})[k] || 0) - Number((b0.items || {})[k] || 0);
        if (moved !== (items[k] || 0)) problems.push(`DB-LEDGER ${label}: ${k.split('|')[1]} of seat ${users.indexOf(k.split('|')[0])} moved ${moved}, the ledger says ${items[k] || 0}`);
      }
    };
    /* THE TICK'S ROSTER (supabase/functions/hr-accrue/tick.js body.hunts): every open session has a selector, so a party whose first
       seat has ended is still settled, through a seat still hunting. Driving every settle through seat 0 alone left a partner's
       session open once seat 0 went home in an earlier window (a harness gap, nightly 2026-11-19), never what the game does. */
    const settleOpen = async (at, o) => {
      for (const u of users) {
        const r = await H.settleTo(db, M, at, { ...o, user: u });
        if (r.skipped !== 'no_hunt') return r;
      }
      return { skipped: 'no_hunt' };
    };
    /* TIMELINE A: the tick's slices, one window asked */
    await db.query('savepoint sp_a');
    const a0 = await books();
    await settleOpen(end, onClock);
    await conserve('the tick\'s slices', a0);
    const a = await snap();
    await db.query('rollback to savepoint sp_a');
    /* TIMELINE B: the generated cuts, with replays and stale proposals */
    await db.query(`select setval('public.hr_test_uuid_seq', 5000, false)`);
    await pinNow(h.from);
    const b0 = await books();
    const cuts = [...cutOffsets(sc).map((c) => ({ at: h.from + c.at, op: c.mode })), { at: end, op: 'land' }];
    for (let i = 0; i < cuts.length; i++) {
      const c = cuts[i];
      if (c.op === 'stale' && i + 1 < cuts.length) {
        /* a proposal for a LATER instant, read now, then another settle lands first: it must lose the CAS */
        await pinNow(cuts[i + 1].at);
        const plan = await M.HS.readHuntSettle({ exec, user: users[0], slot: 0, grounds: H.groundsOf(M), atMs: cuts[i + 1].at }, 'tick');
        const stale = plan.answer ? null : await M.HS.proposeHuntSettle(plan, plan.toMs, 1);
        const r = await settleOpen(c.at, onClock);
        if (r.skipped === 'no_hunt') break;
        if (stale && stale.commit && r.commit) {
          const s1 = canon(await snap());
          const late = await M.HS.commitHuntSettle(exec, { ...stale.commit, project: null });
          t('stale');
          if (!late || late.error !== 'session_moved') problems.push(`DB-REPLAY a proposal made before another settle landed answered ${JSON.stringify(late).slice(0, 200)}`);
          if (canon(await snap()) !== s1) problems.push('DB-REPLAY a stale proposal moved the hunt');
        }
        continue;
      }
      const r = await settleOpen(c.at, onClock);
      if (r.skipped === 'no_hunt') break;
      if (c.op === 'replay' && r.commit) {
        const s1 = canon(await snap());
        t('replay');
        const again = await M.HS.commitHuntSettle(exec, { ...r.commit, project: null });
        if (!again || again.ok !== true || again.stage !== 'replayed') problems.push(`DB-REPLAY the same keys committed again answered ${JSON.stringify(again).slice(0, 200)}`);
        const s2 = canon(await snap());
        if (s2 !== s1) problems.push(`DB-REPLAY a replayed commit moved the hunt ${firstDiff(s1, s2)}`);
      }
    }
    await conserve('the generated cuts', b0);
    const b = await snap();
    if (canon(a) !== canon(b)) problems.push(`DB-SPLIT the tick's slices and the generated cuts wrote different rows ${firstDiff(canon(a), canon(b))}`);
    return problems;
  });
}

const describeDb = (sc) => JSON.stringify({ ...sc, cuts: cutOffsets(sc) });

/** Run the database property on a booted chain. */
export async function runDb(env, o) {
  const { db, H } = env;
  const M = await H.loadEdge(o.root || ROOT);
  const t0 = Date.now();
  const tally = {};
  const prop = fc.asyncProperty(dbScenarioArb, async (sc) => {
    const problems = await dbCase(db, H, M, sc, tally);
    if (problems.length) throw new Error(problems.slice(0, 3).join('\n  '));
    return true;
  });
  const details = await fc.check(prop, { seed: o.seed, numRuns: o.runs, ...(o.path ? { path: o.path } : {}),
    ...(o.timeLimitMs ? { interruptAfterTimeLimit: o.timeLimitMs } : {}) });
  return { failed: details.failed, details, ms: Date.now() - t0, tally };
}

// ═══════════════════════════════════════════════════════════════════════
// THE MUTATION PROOF (--mutate)
// ═══════════════════════════════════════════════════════════════════════
/* REAL DEFECTS, each one a settle a careless change would plausibly ship. An engine mutant is planted in a temp copy of
   src/core, src/data and the edge (tests/hunt-core/fixtures/h1.js plant), never the tree; a database mutant in the booted
   chain's live body, put back after. Each must turn the property RED on the CI seed AND shrink to a small case: at most
   SHRUNK.heroes heroes and SHRUNK.cuts cuts (a mutant caught only by a sprawling case proves the generator, not the
   property), and that shrunk case must be GREEN on the clean engine or body, so a failure the tree already has (the next
   finding, pinned) can never pass for a catch. */
const SHRUNK = Object.freeze({ heroes: 2, cuts: 2 });
const ENGINE_MUTANTS = [
  { name: 'a settle drops the remainder: the watermark is the window end, not the next swing', file: 'supabase/functions/hr-accrue/accrue-hunt.js',
    from: '    settledTo: sim.nextSwingAtMs,', to: '    settledTo: toMs,' },
  { name: 'an off-by-one window: the swing ON the window end is played in it', file: 'src/core/combat-sim.js',
    from: '  while (atMs < toMs && members.some((m) => !m.left)) {', to: '  while (atMs <= toMs && members.some((m) => !m.left)) {' },
  { name: 'a non-idempotent retry: a proposal spends the bag lines of the read it was handed', file: 'src/core/action-rules.js',
    from: '    bag[id] = { loaded, left: Math.max(0, int(l && l.left, loaded)), essential: isEssential(id, l) };',
    to: '    bag[id] = Object.assign(l, { loaded, left: Math.max(0, int(l && l.left, loaded)), essential: isEssential(id, l) });' },
  { name: 'a certain end (a death, gold out, a rule) is stamped at the window end, not the hero\'s next swing', file: 'src/core/combat-sim.js',
    from: '    const next = m.hs.nextSwingAtMs;', to: '    const next = toMs;' },
  { name: 'the store sells past the purse (and the floor)', file: 'src/core/action-rules.js',
    from: '  return Math.max(0, int(hs.purse, 0)) + coverValue(hs) - floorOf(hs) >= price;', to: '  return true;' },
  /* KNOWN-F1 planted back: a survivor's unset settings read the party the read handed in (an ended partner counts until the
     next settle drops it), not the party standing in the world at the boundary */
  { name: 'KNOWN-F1: the party defaults read every member the read handed in, not the party standing', file: 'src/core/combat-sim.js',
    from: '    const roles = rolesOf(inWorld(members));', to: '    const roles = rolesOf(members);' },
];
const AI_SIG = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)';
const DB_MUTANTS = [
  { name: 'the instance CAS is gone (a stale proposal or a replay is applied again)', fn: AI_SIG,
    find: '  if v_i.world_swing <> p_world_from then', replace: '  if false then' },
  { name: 'the store bill is journalled at 0 gold (the wallet moves, the ledger does not)', fn: AI_SIG,
    find: "'hunt', 'supply_buy', -(v_p->>'cost')::bigint,", replace: "'hunt', 'supply_buy', 0::bigint," },
  { name: 'the instance world is not stored (every settle restarts it)', fn: AI_SIG,
    find: '       set world = case when v_n > 0 then v_world end, world_swing = v_wsw,', replace: '       set world = null, world_swing = v_wsw,' },
];

async function mutate(o) {
  const { plant } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/h1.js')).href);
  const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  const pick = (valOf('--mutant') || '').toLowerCase();
  const chosen = (list) => list.filter((m) => !pick || m.name.toLowerCase().includes(pick));
  let bad = 0, total = 0;
  /* `clean(case)`: the case's problems on the clean engine or body (must be none) */
  const judge = async (tier, m, r, clean) => {
    total++;
    const d = r.details;
    if (!d.failed) { bad++; console.error(`✗ ${tier} mutant SURVIVED ${d.numRuns} hunts: ${m.name}`); return; }
    const cex = d.counterexample[0];
    const s = sizeOf(cex);
    const msg = String((d.errorInstance && d.errorInstance.message) || d.errorInstance).split('\n')[0];
    const rule = (/^(?:one window: |cut: )?(SPLIT|WINDOW|RETRY|NONNEG|DB-SPLIT|DB-REPLAY|DB-LEDGER)\b/.exec(msg) || [, '?'])[1];
    const small = s.heroes <= SHRUNK.heroes && s.cuts <= SHRUNK.cuts;
    const before = await clean(cex);
    const ok = small && !before.length;
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${tier} ${rule} caught after ${d.numRuns} hunt(s), shrunk ${d.numShrinks}x to ${s.heroes} hero(es), ${s.cuts} cut(s), ${s.spanMs} ms: ${m.name}`);
    if (before.length) console.log('    ✗ the shrunk case is red on the clean tree too, so it is not this mutant\'s: ' + before[0].slice(0, 200));
    if (VERBOSE || !ok) console.log('    ' + (tier === 'engine' ? describe : describeDb)(cex) + '\n    ' + msg.slice(0, 300));
  };
  if (ONLY !== 'db') {
    const E = await loadEngine(ROOT);
    for (const m of chosen(ENGINE_MUTANTS)) {
      const p = plant([[m.file, m.from, m.to]], PLAY_TREES);
      try { await judge('engine', m, await runEngine(p.root, { seed: o.seed, runs: 200, timeLimitMs: 240000 }), (cex) => engineCase(E, cex)); } finally { p.done(); }
    }
  }
  if (ONLY !== 'engine') {
    const env = await bootDb();
    const M = await env.H.loadEdge(ROOT);
    for (const m of chosen(DB_MUTANTS)) {
      const def = String(await env.H.one(env.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split(String.fromCharCode(13)).join('');
      if (def.split(m.find).length !== 2) { bad++; total++; console.error(`✗ db mutant anchor not found exactly once: ${m.name}`); continue; }
      await env.db.exec(def.replace(m.find, () => m.replace));
      let r;
      try { r = await runDb(env, { seed: o.seed, runs: 60, timeLimitMs: 240000 }); } finally { await env.db.exec(def); }
      await judge('db', m, r, (cex) => dbCase(env.db, env.H, M, cex));
    }
  }
  console.log(bad ? `settle-properties --mutate: ${bad} of ${total} mutant(s) survived or shrank badly` : `settle-properties --mutate: all ${total} mutants caught and shrunk`);
  return bad ? 1 : 0;
}

// ═══════════════════════════════════════════════════════════════════════
// REPORTING AND MAIN
// ═══════════════════════════════════════════════════════════════════════
function report(tier, r, show, floor) {
  const d = r.details;
  if (VERBOSE) console.log(`  ${tier} exercised: ${canon(r.tally || {})}`);
  if (!d.failed) {
    /* the coverage floor, at the CI size or above and only on a fresh run (a --path replay runs one case) */
    const short = PATH || d.interrupted ? [] : coverage(r.tally || {}, floor, d.numRuns / 100);
    if (short.length) {
      console.error(`✗ ${tier}: ${d.numRuns} hunts green but VACUOUS: too few cases exercised ${short.join(', ')} (seed ${d.seed}, ${(r.ms / 1000).toFixed(1)} s)`);
      return 1;
    }
    console.log(`✓ ${tier}: ${d.numRuns} generated hunts green (seed ${d.seed}, ${(r.ms / 1000).toFixed(1)} s)${d.interrupted ? ' (time limit reached)' : ''}`);
    return 0;
  }
  console.error(`✗ ${tier}: RED after ${d.numRuns} hunt(s), shrunk ${d.numShrinks} time(s) to:`);
  console.error('    ' + show(d.counterexample[0]));
  console.error('  ' + String((d.errorInstance && d.errorInstance.message) || d.errorInstance).split('\n').join('\n  '));
  console.error(`  replay: node tests/settle-properties.mjs --only=${tier} --seed ${d.seed} --path ${d.counterexamplePath}`);
  return 1;
}

async function main() {
  /* the proof is judged on the fixed seed every night too (a per-day seed would make a catch depend on the date) */
  if (process.argv.includes('--mutate')) return mutate({ seed: intArg('--seed') ?? CI_SEED });
  let red = 0;
  if (ONLY !== 'db') {
    const r = await runEngine(ROOT, { seed: SEED, runs: ENGINE_RUNS, path: PATH });
    red += report('engine', r, describe, ENGINE_FLOOR);
  }
  if (ONLY !== 'engine') {
    let env;
    try { env = await bootDb(); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 400)); return 2; }
    const r = await runDb(env, { seed: SEED, runs: DB_RUNS, path: PATH });
    red += report('db', r, describeDb, DB_FLOOR);
  }
  console.log(red ? `settle-properties: ${red} tier(s) red` : 'settle-properties: green');
  return red ? 1 : 0;
}

/* for a fix lane's own probes: the generators, the printers and the clock a printed case is read against */
export { scenarioArb, dbScenarioArb, describe, describeDb, T0 };

if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error('✗ harness: ' + (e && e.stack || e)); process.exit(2); });
