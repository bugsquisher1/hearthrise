// ============================================================================
// tests/accrual-engine.mjs — the SERVER ACCRUAL guard.
//
// The away path prices two kinds since the one-town-work cut (09-crafting.md 4.17): a hunt (a session, guarded by
// tests/hunt-sessions-settle.mjs and tests/hunt-core/*) and the Great Hearth's FUEL RUN (`artisan`, the `fuel_*`
// rows). This file holds the fuel run's engine half and the shell around both. Mechanical claims, none of them
// provable from a browser:
//
//   1. THE PAYLOAD AND THE TIMELINE. The fuel index the edge imports carries every `fuel_*` row and nothing else (a
//      bench row on it is a bench priced again), resolves no prototype key, and a buff held for part of a window pays
//      for that part and no more (the b347 slice rule, re-aimed from the gather night to the fuel run).
//      The old GATHER PARITY claim (server span == the client's own loop) RETIRED with gathering: no client computes a
//      town span any more, the engine is the only construction, and a "parity" against it would be the engine equal
//      to itself. The tool carry, the gather bag-full stop and the Timberline / Deep Waters stand payloads left with
//      the nodes they priced.
//
//   2. HOSTILE INPUT. Nothing a client could send inflates a grant: not `tickMs`, not `minTickMs`, not `atMs`, not
//      `capMs`, not `elapsed`, not `nowMs`, not `grantMs`, and not the cut bench's own knobs (`count`, `next`, a node
//      index, a tool carry). The engine reads named server fields only, so the proof is "these keys are inert",
//      asserted by running with and without them and comparing.
//
//   3. SHAPE. The delta only ever contains keys hr_apply implements; every numeric value is an integer (hr_apply casts
//      with ::bigint, and a fractional string is a `bad_delta` that costs a player their whole night); the journal row
//      is an aggregate on an allowlist; and the source of the engine never spreads a caller object into the
//      simulation ctx — the rule that keeps `minTickMs` from riding in through the same door as `tickMs`.
//
//   4. HEADROOM. Every fuel row at the reachable offline cap stays inside hr_apply's per-call clamps and the day
//      budget, read out of the migrations rather than restated.
//
// Run standalone:  node tests/accrual-engine.mjs
// Also invoked as a preflight by tests/run-smoke.mjs.
// ============================================================================

import { readFile, readdir } from 'node:fs/promises';
/* SYNC, deliberately: REACHABLE_CAP_H is a module-scope constant the sweep
   tables below are built from, and an async read there would make it a promise
   that every fixture silently compared against. */
import { readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createRng } from '../src/core/rng.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { isFuelRun, FUEL_SKILL } from '../src/core/artisan-sim.js';

import {
  computeAccrual, zeroBonus,
  TOWN_SETTLE_MIN_MS, ACCRUE_MAX_SPAN_MS,
} from '../supabase/functions/hr-accrue/accrual.js';
import { FUEL_RUNS } from '../supabase/functions/hr-accrue/catalogue.js';
import { parseIntent, readSlot, MAX_SLOT, INTENT_KEYS } from '../supabase/functions/hr-accrue/request.js';
import { isMain } from './_is-main.mjs';
import { engineSource } from './_accrual-engine.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const FN_DIR = join(ROOT, 'supabase', 'functions', 'hr-accrue');

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const eq = (a, b, msg) => {
  const A = JSON.stringify(a); const B = JSON.stringify(b);
  if (A !== B) problems.push(`${msg}\n      got:  ${A}\n      want: ${B}`);
};

// ── The fixture ─────────────────────────────────────────────────────────────
// Real items, a real absence. MONSTER survives only as the "a fight outside a
// hunt session is refused" probe in the hostile section (lane C2).

const MONSTER = Object.keys(MONSTERS).includes('goblin') ? 'goblin' : Object.keys(MONSTERS)[0];

/* Every skill at 99, so a sweep row is never silently testing a level gate instead of a yield. */
const MAXED = Object.freeze({
  melee: 13034431, defense: 13034431,
  ranged: 13034431, magic: 13034431, inner_flame: 13034431,
});

/* 2026-03-14 20:00 UTC → 2026-03-15 08:00 UTC. Twelve hours across one UTC
   boundary, the shape a real night has. */
const FROM_MS = Date.UTC(2026, 2, 14, 20, 0, 0);
const SPAN_MS = 12 * 3600000;
const NOW_MS = FROM_MS + SPAN_MS;
const SEED = 0x5eed1234;
const USER = '00000000-0000-4000-8000-000000000001';

function baseSkills() {
  return { melee: 30000, defense: 22000, ranged: 1000, magic: 1000, inner_flame: 500 };
}

/* Equipment chosen FROM THE LIVE CATALOGUE, never invented — an invented item
   would test the engine against data the game does not contain. Best-in-slot so
   the one channel equipment reaches a fuel run by (`xpB`) carries a real value. */
function pickEquipment() {
  const eqp = {};
  const weapon = Object.keys(ITEMS)
    .filter((id) => ITEMS[id]?.weaponType && ITEMS[id]?.atkB)
    .sort((a, b) => (ITEMS[b].atkB || 0) - (ITEMS[a].atkB || 0))[0];
  if (weapon) eqp.weapon = weapon;
  const best = {};
  for (const [id, it] of Object.entries(ITEMS)) {
    if (!it || it.type !== 'armor' || !it.slot) continue;
    const cur = best[it.slot];
    if (!cur || (it.tier || 0) > (ITEMS[cur].tier || 0)) best[it.slot] = id;
  }
  for (const [slot, id] of Object.entries(best)) eqp[slot === 'head' ? 'helmet' : slot] = id;
  return eqp;
}
const EQUIPMENT = pickEquipment();

/* Enough fuel that the CLOCK is the only bound: 24 h at the fastest row (640 ms) is 135,000 actions. */
const FUEL_STACK = 1_000_000;

// ── Server call helper ──────────────────────────────────────────────────────
/* A FUEL NIGHT, the one town kind the away path prices (a fight outside a hunt
   session is refused `hunt_required`, and gathering is refused at the door), so
   the hostile-input and shape baselines run on it. */
const BASE_RUN = 'fuel_bones';
function serverAccrual(over) {
  return computeAccrual({
    userId: USER,
    slot: 0,
    nowMs: NOW_MS,
    accruedToMs: FROM_MS,
    activeSinceMs: FROM_MS,
    activeKind: 'artisan',
    activeId: BASE_RUN,
    capMs: 12 * 3600000,
    seed: SEED,
    hp: 60, maxHp: 60, gold: 1234,
    skills: { ...baseSkills(), inner_flame: MAXED.inner_flame },
    equipment: EQUIPMENT,
    inventory: { [FUEL_RUNS[BASE_RUN].recipe.input]: FUEL_STACK },
    items: ITEMS,
    monsters: MONSTERS,
    recipes: FUEL_RUNS,
    ...over,
  });
}

// ── 1a. THE FUEL INDEX THE EDGE CARRIES ─────────────────────────────────────
/* Re-aimed from GATHER (the node index) and TIMBERLINE-S1 / DEEPWATERS-S1 (the payload carries the new stands): the
   index is the one the edge imports (hr-accrue/catalogue.js FUEL_RUNS), never a local rebuild, so a fuel row the
   client paints but the payload lacks is caught here rather than as a night refused `unknown_recipe`. */
function fuelIndexGuard() {
  const want = [];
  for (const [skill, rows] of Object.entries(ARTISAN_RECIPES)) {
    for (const r of rows || []) if (isFuelRun(skill, r)) want.push(r.id);
  }
  ok(want.length > 0, 'FUEL-INDEX: ARTISAN_RECIPES holds no fuel run at all — every arm below would pass on an empty set');
  eq(Object.keys(FUEL_RUNS).sort(), want.sort(),
    'FUEL-INDEX: the edge fuel index is not exactly the data\'s fuel runs (a row the client offers is refused, or a '
    + 'row that is not a fuel run is priced)');
  for (const [id, e] of Object.entries(FUEL_RUNS)) {
    ok(e && e.skill === FUEL_SKILL && isFuelRun(e.skill, e.recipe),
      `FUEL-INDEX: '${id}' is on the index but is not a ${FUEL_SKILL} fuel run — a bench row priced again`);
    ok(Object.isFrozen(e), `FUEL-INDEX: '${id}' is a mutable entry — a caller could rewrite the row the engine prices`);
  }
  /* The prototype hazard, measured rather than asserted about. `active_id` is bounded by /^[a-z0-9_]{1,64}$/, which
     matches `constructor`. */
  for (const probe of ['__proto__', 'constructor', 'toString', 'valueOf']) {
    ok(FUEL_RUNS[probe] === undefined, `FUEL-INDEX: the index resolves '${probe}' — a null-prototype container was expected`);
    const r = serverAccrual({ activeId: probe });
    ok(r.accrued === false && !r.delta, `FUEL-INDEX: a pointer on '${probe}' produced a grant`);
  }

  /* THE PAYLOAD PAYS, AND THE CONTROL SAYS THE PASS IS ABOUT THE PAYLOAD. One hour of Bones at Inner Flame 1, no gear:
     the interval is the row's own (400 ms x PACE), one fuel a swing, every swing the same XP. With the row removed
     from the index the same span is REFUSED unknown_recipe (a REFUSING reason: the window is deferred, never
     confiscated). */
  const run = (recipes) => serverAccrual({
    nowMs: FROM_MS + 3600000, skills: { inner_flame: 0 }, equipment: {},
    inventory: { bones: 100000 }, recipes,
  });
  const s = run(FUEL_RUNS);
  ok(s.accrued === true, `FUEL-INDEX: a 1 h Bones span accrued nothing (reason: ${s.reason})`);
  if (s.accrued) {
    eq(s.summary.ticks, Math.floor(3600000 / s.tickMs), 'FUEL-INDEX: 1 h of Bones did not run one action an interval');
    eq(s.delta.items, { bones: -s.summary.ticks }, 'FUEL-INDEX: 1 h of Bones did not burn one Bones an action');
    ok(s.delta.xp && s.delta.xp.inner_flame > 0 && s.delta.xp.inner_flame % s.summary.ticks === 0,
      `FUEL-INDEX: 1 h of Bones paid ${JSON.stringify(s.delta.xp)} over ${s.summary.ticks} actions, not one flat grant an action`);
    const again = run(FUEL_RUNS);
    eq(again.delta, s.delta, 'FUEL-INDEX: the same window priced twice gave two answers (a fuel run draws no RNG)');
  }
  const without = Object.assign(Object.create(null), FUEL_RUNS);
  delete without.fuel_bones;
  const refused = run(without);
  ok(refused.accrued !== true && refused.reason === 'unknown_recipe',
    `FUEL-INDEX CONTROL: with fuel_bones removed from the index the span answered accrued=${refused.accrued} `
    + `reason=${refused.reason}, not a refusal as unknown_recipe`);
}

// ── 1b. THE BUFF TIMELINE (b347), on the fuel run ───────────────────────────
/* Re-aimed from the gather night (a `gather_speed` buff, retired with gathering). The unique catch is unchanged: a
   flat `floor(spanMs / interval)` loop pays a buff's rate for the whole night off a ten-minute consumable, and a buff
   that pays without draining is the b326 exploit written backwards. On the fuel run the buff that moves the grant is
   `all_xp` (no buff type speeds the Hearth: `flameSpeed` is a perk key only), so the arithmetic is on XP: ten buffed
   minutes inside a buffed-all-hour's per-action edge, exactly, and the summary states the slice, the expiry and the
   buffed time. Through the REAL engine (the server's buff rows, buffQueueFromServer), not core alone. */
function fuelBuffTimelineGuard() {
  const HOUR = 3600000;
  const BUFF_MS = 10 * 60000;
  const seg = (ms) => [{ type: 'all_xp', magnitude: 4,
    from: new Date(FROM_MS).toISOString(), until: new Date(FROM_MS + ms).toISOString() }];
  const night = (buffs) => serverAccrual({
    nowMs: FROM_MS + HOUR, skills: { inner_flame: 0 }, equipment: {},
    inventory: { bones: 100000 }, buffs,
  });
  const bare = night(undefined);
  const buffed = night(seg(BUFF_MS));
  const allHour = night(seg(2 * HOUR));
  if (!bare.accrued || !buffed.accrued || !allHour.accrued) {
    problems.push(`BUFF TIMELINE: a fixture did not accrue (${bare.reason} / ${buffed.reason} / ${allHour.reason})`);
    return;
  }
  const xp = (r) => (r.delta.xp && r.delta.xp.inner_flame) || 0;
  const edge = (xp(allHour) - xp(bare)) / bare.summary.ticks;
  ok(edge > 0, 'BUFF TIMELINE: an all_xp buff held for the whole hour paid nothing — every assertion below is vacuous');
  ok(xp(buffed) > xp(bare),
    `BUFF TIMELINE: a 10-minute all_xp buff paid ${xp(buffed)} against an unbuffed ${xp(bare)} — the buff paid nothing`);
  ok(xp(buffed) < xp(allHour),
    `BUFF TIMELINE: a 10-minute buff paid ${xp(buffed)}, the whole-hour buffed rate (${xp(allHour)}). The span is not `
    + 'being sliced at the expiry.');
  eq(xp(buffed) - xp(bare), Math.floor(BUFF_MS / bare.tickMs) * edge,
    'BUFF TIMELINE: the buffed minutes did not pay exactly their own actions at the buffed edge');
  eq(buffed.summary.slices, 2, 'BUFF TIMELINE: one buff expiry inside the window must make exactly two slices');
  eq(buffed.summary.buffsExpired, ['all_xp'],
    'BUFF TIMELINE: the summary did not STATE which buff ran out, so a welcome-back card would have to infer it');
  eq(buffed.summary.buffPaidMs, BUFF_MS, 'BUFF TIMELINE: the summary claims a different buffed time than the buff held');
  /* THE CONTROL: no buff held is ONE slice and the flat arithmetic, so every pre-existing number stays honest. */
  eq(bare.summary.slices, 1, 'BUFF TIMELINE CONTROL: an unbuffed night did not run in one slice');
  eq(bare.summary.ticks, Math.floor(HOUR / bare.tickMs), 'BUFF TIMELINE CONTROL: an unbuffed night is not the flat loop');
  eq(buffed.summary.ticks, bare.summary.ticks, 'BUFF TIMELINE: an XP buff changed the action count');
}

// ── 2. HOSTILE INPUT ────────────────────────────────────────────────────────
function hostileGuard() {
  const honest = serverAccrual();
  if (!honest.accrued) { problems.push('hostile: baseline did not accrue'); return; }
  const fingerprint = (r) => JSON.stringify({
    ticks: r.summary?.ticks, kills: r.summary?.kills, xp: r.summary?.xp,
    gold: r.summary?.gold, items: r.summary?.items, grantMs: r.grantMs, tickMs: r.tickMs,
  });
  const base = fingerprint(honest);

  /* Every field a compromised or careless caller might try to smuggle in. The
     engine takes a NAMED object, so the proof is that adding these keys changes
     nothing at all. This is the mechanical form of "construct the ctx field by
     field — never spread a request body". */
  const attacks = {
    tickMs: 1,
    minTickMs: 1,
    interval_ms: 1,
    ticks: 43_200_000,
    atMs: 0,
    fromMs: 0,
    toMs: NOW_MS + 365 * 86400000,
    elapsedMs: 365 * 86400000,
    elapsed: 365 * 86400000,
    grantMs: 365 * 86400000,
    spanMs: 365 * 86400000,
    away: false,
    rateMult: 1000,
    capped: false,
    bonus: () => 10,
    rng: createRng(1),
    ctx: { tickMs: 1, minTickMs: 1 },
    delta: { gold: 1e12 },
    hearth_tokens: 1e9,
    /* The cut bench's own knobs (09-crafting.md 4.17): a request's own `count` (the run's is the server's
       `activeLeft`), a queued next job, a node index, a tool carry, a bag cap and a learned-recipe map. Nothing on the
       fuel run reads any of them; asserted, not assumed. */
    count: 1e9,
    next: { kind: 'artisan', id: 'fuel_void_chitin', count: 1e9 },
    nodes: { fuel_bones: { skill: 'mining', node: { prod: 'bones', qty: [1e6, 1e6] } } },
    toolCarry: { inner_flame: 0.99 },
    bagCap: 0,
    unlockedRecipes: { all: true },
  };
  for (const [k, v] of Object.entries(attacks)) {
    const r = serverAccrual({ [k]: v });
    if (fingerprint(r) !== base) {
      problems.push(`HOSTILE: request field '${k}' changed the grant — it must be inert`);
    }
  }
  /* …and all of them at once, in case one is only inert in isolation. */
  const all = serverAccrual(attacks);
  if (fingerprint(all) !== base) problems.push('HOSTILE: the combined hostile payload changed the grant');

  // capMs: a caller-inflated cap can never buy more than the real elapsed time,
  // and can never exceed the engine's own absolute fuse.
  const bigCap = serverAccrual({ capMs: Number.MAX_SAFE_INTEGER });
  ok(bigCap.accrued && bigCap.grantMs === SPAN_MS,
    `HOSTILE: an unbounded capMs granted ${bigCap.grantMs}ms, expected the real elapsed ${SPAN_MS}ms`);

  const longAbsence = serverAccrual({
    accruedToMs: NOW_MS - 400 * 86400000, activeSinceMs: NOW_MS - 400 * 86400000, capMs: Number.MAX_SAFE_INTEGER,
  });
  ok(longAbsence.grantMs <= ACCRUE_MAX_SPAN_MS,
    `HOSTILE: a 400-day absence with a broken cap granted ${longAbsence.grantMs}ms — the absolute fuse did not hold`);

  // The cap is real: an 18h absence at a 12h cap pays exactly 12h and reports it.
  const capped = serverAccrual({ accruedToMs: NOW_MS - 18 * 3600000, activeSinceMs: NOW_MS - 18 * 3600000 });
  ok(capped.grantMs === 12 * 3600000, `CAP: 18h absence at a 12h cap granted ${capped.grantMs}ms`);
  ok(capped.capped === true, 'CAP: a capped grant did not report capped:true');
  ok(capped.delta.accrued_to === new Date(NOW_MS).toISOString(),
    'CAP: a capped grant must still advance the watermark to now — otherwise the cap is drainable in instalments');

  // active_since clamps too, so a stale watermark after a forgotten
  // `accrued_to` on start_activity cannot mint a night.
  const staleWatermark = serverAccrual({
    accruedToMs: NOW_MS - 11 * 3600000,
    activeSinceMs: NOW_MS - 30 * 60000,          // the run started 30 minutes ago
  });
  ok(staleWatermark.grantMs === 30 * 60000,
    `WATERMARK: a stale accrued_to paid ${staleWatermark.grantMs}ms for a run that is 30 minutes old`);

  // A clock that has not moved, or has moved backwards, grants nothing.
  for (const [name, over] of [
    ['no elapsed time', { accruedToMs: NOW_MS }],
    ['a future watermark', { accruedToMs: NOW_MS + 86400000 }],
    /* A town pointer's accrue floor is TOWN_SETTLE_MIN_MS (lane c-live-town-work): one ms under it pays nothing. */
    ['a sub-threshold absence', { accruedToMs: NOW_MS - (TOWN_SETTLE_MIN_MS - 1) }],
    ['a zero cap', { capMs: 0 }],
    ['a negative cap', { capMs: -1 }],
    ['a NaN cap', { capMs: NaN }],
    ['an idle character', { activeKind: 'idle', activeId: null }],
    ['a fight outside a hunt session', { activeKind: 'combat', activeId: MONSTER }],
    ['an unknown recipe', { activeId: 'not_a_recipe' }],
    /* THE CUT (09-crafting.md 4.17): a bench pointer and a gather pointer are both refused, never priced. */
    ['a cut bench recipe', { activeId: 'smelt_bronze' }],
    ['a gather pointer', { activeKind: 'gather', activeId: 'copper_rock' }],
  ]) {
    const r = serverAccrual(over);
    ok(r.accrued === false, `SKIP: ${name} produced a grant (${JSON.stringify(r.grantMs)})`);
    ok(!r.delta, `SKIP: ${name} produced a delta`);
  }

  // tickMs: RETIRED 2026-10-19 (core rebuild): deriveTickMs, gear speed and style speed are deleted; every
  // basic attack is COMBAT_BALANCE.tickMs, guarded by tests/basic-attack-interval.mjs (a real hunt swings at it).
  ok(zeroBonus('goldFind') === 0 && zeroBonus('dropRate') === 0 && zeroBonus('allXP') === 0,
    'BONUS: the server perk stack is not inert');
}

// ── 3. SHAPE + SOURCE ───────────────────────────────────────────────────────
// hr_apply's delta contract, asserted against the same list the SQL enforces.
const DELTA_KEYS = ['gold', 'gems', 'hp', 'items', 'xp', 'equip', 'activity',
                    'accrued_to', 'farm', 'progress', 'progress_claim', 'journal'];

async function shapeGuard() {
  const s = serverAccrual();
  if (!s.accrued) { problems.push('shape: baseline did not accrue'); return; }

  for (const k of Object.keys(s.delta)) {
    ok(DELTA_KEYS.includes(k),
      `SHAPE: delta key '${k}' is not in hr_apply's contract — unknown keys are REJECTED, not ignored`);
  }
  ok(!('hearth_tokens' in s.delta), 'SHAPE: the bond must never appear in a delta');
  ok(!('gems' in s.delta), 'SHAPE: accrual must not touch gems');
  ok(!('equip' in s.delta), 'SHAPE: accrual must not move equipment');

  const ints = [];
  if (s.delta.gold !== undefined) ints.push(['gold', s.delta.gold]);
  if (s.delta.hp !== undefined) ints.push(['hp', s.delta.hp]);
  for (const [k, v] of Object.entries(s.delta.xp || {})) ints.push([`xp.${k}`, v]);
  for (const [k, v] of Object.entries(s.delta.items || {})) ints.push([`items.${k}`, v]);
  for (const p of s.delta.progress || []) ints.push([`progress.${p.key}`, p.add]);
  for (const [k, v] of ints) {
    ok(Number.isInteger(v) && Number.isFinite(v),
      `SHAPE: ${k} = ${v} is not an integer — hr_apply casts with ::bigint and would return bad_delta`);
    /* `items` is the ONE signed map — auto-eat debits the food it consumed, and
       hr_apply's item block is signed for exactly this (it re-reads the row
       under a lock and rejects `have + delta < 0`). Everything else stays
       non-negative: a negative `gold` or `xp` from an accrual would make a
       rollback indistinguishable from an exploit. */
    ok(v >= 0 || k.startsWith('items.'), `SHAPE: ${k} = ${v} is negative`);
  }

  ok(s.delta.xp === undefined || Object.values(s.delta.xp).every((v) => v > 0),
    'SHAPE: XP is monotonic — a zero or negative grant must be omitted');

  for (const it of Object.keys(s.delta.items || {})) {
    ok(!!ITEMS[it], `SHAPE: item '${it}' is not in the authored catalogue — hr_apply would reject the WHOLE delta`);
  }
  for (const p of s.delta.progress || []) {
    ok(['quest', 'daily', 'bounty', 'stat', 'collection', 'flag'].includes(p.kind),
      `SHAPE: progress kind '${p.kind}' is not one hr_apply accepts`);
    ok(['active', 'done'].includes(p.state),
      `SHAPE: progress state '${p.state}' is not settable by a delta ('claimed' has its own path)`);
  }
  /* `craft`, not `artisan`: the only value player_ledger_kind_check accepts for town work. */
  ok(s.delta.journal?.kind === 'craft' && s.delta.journal?.intent === 'accrue',
    'SHAPE: the journal row must name kind=craft / intent=accrue');
  /* ── THE JOURNAL META: AN ALLOWLIST, NOT A COUNT (rewritten 2026-09-18) ────
     This was `Object.keys(meta).length <= 8` measured on ONE sample, and the
     sample was an away window with neither an attended split nor a consumable
     burn — so the bound was never exercised against the shape it was written
     for. The combat meta's WORST case on 2026-09-18 is
       ms, ticks, kills, capped, ate, att, spent, w, from, to  = TEN keys,
     and it was NINE before `w` landed. A count that a real row can exceed while
     the guard passes is not a bound; an ALLOWLIST is, because a per-kill log
     cannot be spelled without a key that is not on it. Both are asserted: an
     unknown key fails, and so does a row longer than the enumerated list.

     WHY THE NUMBER MAY MOVE FROM 9 TO 10, with the arithmetic rather than a
     shrug. The rule this guard enforces is "aggregate, never per-tick"
     (game_events: 1.6M rows / 229 MB from six players in four days). `w` adds
     NO ROWS - it is a <=24-byte scalar on a row that already exists, and it is
     OMITTED when both its terms are zero, i.e. on every window with no death
     and no idle time. Measured cadence: the 14-day production read behind
     tests/fixtures/world-tick-real-windows.json is ~1.7k accrue rows for 5
     users, i.e. ~24 rows/user/day. At 100x the live player base (500 active)
     that is ~12k accrue rows/day; if EVERY one carried the widest form the
     ceiling is ~290 KB/day (~105 MB/year), and the real figure is a small
     fraction of that. The bound that matters - rows - is unchanged.

     ⚠ The next key gets the same treatment: add it to META_KEYS with its
       byte-and-rows arithmetic, or nest it inside an existing one the way
       `att` is. Never just raise a number. */
  /* ELEVENTH KEY, 2026-09-22: `stopped`. Added WITH the arithmetic this block's
     own closing note demands, never by raising a number.
       WHAT IT IS: the name of the hunt stop rule that ended the run — one of
       six short strings ('falls', 'bag_full', 'food_floor', 'ammo_floor',
       'hours', 'ammo_dry'), at most 11 bytes.
       ROWS ADDED: ZERO. It is a scalar on a row that already exists, and the
       rule this guard enforces is "aggregate, never per-tick" (game_events:
       1.6M rows / 229 MB from six players in four days).
       BYTES: OMITTED on every window that did not stop, i.e. on all of them but
       the LAST of a hunt. A hunt is at least an hour and settles at the ~90 s
       attended cadence, so fewer than 1 in 40 combat rows can carry it even in
       the worst case. Against the measured ~24 accrue rows/user/day, at 100x
       the live player base (500 active) that is at most ~300 rows/day x 11
       bytes = ~3 KB/day. The bound that matters — rows — is unchanged.
       WHY NOT NESTED: `att` is nested because it is four related integers;
       this is one scalar, and nesting a single value inside an object to keep a
       count down would be the number-raising this note forbids, wearing a hat.
     The next key gets the same treatment. */
  /* TWELFTH KEY, 2026-10-10: `mon`. Added WITH the arithmetic, never by
     raising a number.
       WHAT IT IS: the monster id of the pointer the window settled (one
       pointer per window, so one id per row). Rally points weight a kill by
       its tier (2026-10-10-rally-points-server.sql) and this row is the only
       server record of which monster a window's kills were.
       ROWS ADDED: ZERO. A scalar on a row that already exists.
       BYTES: ids are <= ~24 bytes (sliced to 64). Against the measured ~24
       accrue rows/user/day, at 100x the live player base (500 active) that is
       ~12k rows/day x ~30 bytes = ~360 KB/day (~130 MB/year) at the ceiling
       if every row were combat; the bound that matters — rows — is unchanged.
       WHY NOT NESTED: one scalar; nesting it to keep a count down would be the
       number-raising this note forbids, wearing a hat.
     The next key gets the same treatment. */
  /* THIRTEENTH KEY, 2026-10-13: `km` (lane C1, Security C3). Added WITH the
     arithmetic, never by raising a number.
       WHAT IT IS: a NAMED HUNT's kills by monster ({id: n}); `mon` is the area
       id on those rows, so rally points need the per-monster split to price
       each kill at its server tier (2026-10-20-hunts-rally-kills.sql).
       ROWS ADDED: ZERO. A flat map of integers on a row that already exists.
       BYTES: one entry per spawn (<= 3 today, ~20 bytes each), OMITTED on every
       training row. At 100x (500 active, ~12k accrue rows/day) the ceiling if
       EVERY row were a hunt is ~12k x 60 bytes = ~720 KB/day; rows unchanged.
       WHY NOT NESTED: it is already one object, the `spent` shape. */
  /* THE FUEL ROW'S ALLOWLIST (the one-town-work cut, 09-crafting.md 4.17: the
     shape baseline is a fuel night; the gather row's `qty` and `node` left with
     gathering, and the combat row's keys above are the hunt settle's, journalled
     by hr_hunt_apply). Same rule: a new key comes with its rows-and-bytes
     arithmetic, never a raised number.
       WHAT IS ON IT: the gather row's `ms`, `ticks`, `capped`, `skill`, `w`,
       `from`, `to`, plus `recipe` (the fuel id: the Hearth's day reads it,
       1043-hearthrise.sql), `stopped` and `out_of` (why the run ended and which
       fuel ran out: the welcome-back line) and `skipped_items` (a fuel the item
       catalogue dropped, the journalled form of a skip).
       ROWS ADDED: ZERO. One row a window, the same aggregate the bench wrote.
       BYTES: the four keys the gather row lacked are <= ~90 bytes together on the
       widest row; against the measured ~24 accrue rows/user/day, at 100x the live
       player base (500 active) that is at most ~12k rows/day x 90 bytes = ~1 MB/day
       (~390 MB/year) if EVERY row were a fuel row, and the hunt settle's rows are
       most of them. The bound that matters — rows — is unchanged. */
  /* `n` AND `left` (the hearth run's count, 09-crafting.md 4.17's bridge): the count a window started from and what it
     left. ROWS ADDED: ZERO. BYTES: two integers of at most six digits, under 30 bytes, OMITTED on every run with no
     count ("Burn all"); at the same 12k rows/day ceiling, if every row were a counted run, ~360 KB/day. */
  const META_KEYS = ['ms', 'ticks', 'capped', 'recipe', 'skill', 'stopped', 'out_of', 'n', 'left', 'skipped_items', 'w', 'from', 'to'];
  const counted = serverAccrual({ activeLeft: 5, jobEnds: true });
  const metaProblems = (m) => {
    const out = [];
    if (typeof m !== 'object' || m === null || Array.isArray(m)) return ['meta is not an object'];
    const keys = Object.keys(m);
    for (const k of keys) if (!META_KEYS.includes(k)) out.push(`unknown meta key '${k}'`);
    if (keys.length > META_KEYS.length) out.push(`${keys.length} keys > ${META_KEYS.length}`);
    return out;
  };
  /* MUTATION PROOF, INLINE AND ALWAYS RUN. A guard that has never been red is
     not a guard: the two shapes it exists to refuse are a per-kill log (an
     unknown key) and an over-long row. If either of these came back clean the
     assertion below would be decoration. */
  ok(metaProblems({ ...s.delta.journal.meta, kill_log: [1, 2, 3] }).length > 0,
    'SHAPE-selftest: the meta checker accepted a per-kill log key — it is not checking anything');
  ok(metaProblems(Object.fromEntries(META_KEYS.concat('extra').map((k) => [k, 1]))).length > 0,
    'SHAPE-selftest: the meta checker accepted a row longer than its own allowlist');
  ok(counted.accrued && 'n' in counted.delta.journal.meta && metaProblems(counted.delta.journal.meta).length === 0,
    `SHAPE: a counted run's journal meta is not on the allowlist: ${counted.accrued ? metaProblems(counted.delta.journal.meta).join('; ') : counted.reason}`);
  ok(metaProblems(s.delta.journal?.meta).length === 0,
    `SHAPE: the journal meta must be an aggregate, not a per-kill log (game_events: 1.6M rows from six players): ${metaProblems(s.delta.journal?.meta).join('; ')}`);
  ok(typeof s.delta.accrued_to === 'string' && !Number.isNaN(Date.parse(s.delta.accrued_to)),
    'SHAPE: accrued_to must be an ISO timestamp');

  // ── Source-level rules that no runtime test can see ──────────────────────
  /* The whole engine: the door (accrual.js) and every piece it reaches (tests/_accrual-engine.mjs). */
  const engine = engineSource(FN_DIR);
  const shell = await readFile(join(FN_DIR, 'index.ts'), 'utf8');
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const engineCode = code(engine);
  const shellCode = code(shell);

  ok(!/\.\.\.\s*(inp|input|req|body|opts|ctx)\b/.test(engineCode),
    'SOURCE: the accrual engine spreads a caller object — minTickMs would ride in through the same door as tickMs');
  /* Reading COMBAT_BALANCE.minTickMs is correct (it IS the floor); ASSIGNING
     `minTickMs:` into a ctx is the opt-in that would defeat the clamp. Match
     the assignment, not the identifier. */
  ok(!/\bminTickMs\s*:/.test(engineCode),
    'SOURCE: the accrual engine sets minTickMs in a ctx — the accrual path must use the real 600ms floor');
  ok(!/\bMath\s*\.\s*random\s*\(/.test(engineCode) && !/\bMath\s*\.\s*random\s*\(/.test(shellCode),
    'SOURCE: Math.random() is banned server-side — accrual must be replayable');
  ok(!/\bDate\s*\.\s*now\s*\(\)/.test(engineCode),
    'SOURCE: the accrual engine reads a wall clock — atMs must come from now() in Postgres');
  ok(/service_role/.test(shellCode) === false,
    'SOURCE: index.ts references the service role — it bypasses RLS and holds every table privilege (defect S1)');
  ok(!/:5432\b/.test(shellCode),
    'SOURCE: index.ts names port 5432 — all engine traffic uses the transaction pooler on 6543 (design §2a-ii, HARD RULE)');
  ok(/set local role hr_engine/.test(shellCode),
    'SOURCE: index.ts must `set local role hr_engine` inside every transaction — transaction mode keeps no session state');
  ok(/prepare:\s*false/.test(shellCode),
    'SOURCE: index.ts must set prepare:false — named prepared statements do not survive transaction-mode pooling');
  for (const table of ['player_state', 'player_inventory', 'player_skills', 'player_ledger', 'player_progress']) {
    ok(!new RegExp(`(insert|update|delete)[\\s\\S]{0,40}${table}`, 'i').test(shellCode),
      `SOURCE: index.ts appears to write ${table} directly — Edge Functions never write tables`);
  }
  ok(/hr_apply\(/.test(shellCode), 'SOURCE: index.ts must go through hr_apply');
  /* ── RETREAT-W8's PROVENANCE HALF, INVERTED (lane C2) ─────────────────────
     The attended kill ledger was the ONE input that could make `resolveKill`
     run outside the simulation. It is GONE (ruling HR-2026-10-14 §3: the
     attended top-up and hr_credit_kills are deleted), so the shell may not pass
     an `attended` value at all, and may not read hr_attended_kills: a revived
     door is a client-claimed kill count reaching the engine again. */
  ok(!/attended\s*:\s*[A-Za-z_$]/.test(shellCode),
    'SOURCE: index.ts passes an `attended` value to the engine again — the attended top-up is deleted');
  ok(!/hr_attended_kills/.test(shellCode),
    'SOURCE: index.ts reads hr_attended_kills again — the attended kill ledger is deleted');
  /* AND THE COUNTER ITSELF IS NEVER CLIENT-SOURCED. `consecFalls` is seeded
     from hr_state_of's projection and proposed back; an assignment reading the
     parsed intent would be the same defect one field over. */
  ok(!/consecFalls\s*:\s*(intent|body|req|payload)\b/.test(shellCode),
    'SOURCE: index.ts seeds consecFalls from the request — the retreat counter is server-owned');
  /* 2026-10-10 presence horizon: the accrue span cap is hr_accrue_cap_ms — hr_offline_cap_ms
     bounded by the last real return + cap (2026-10-10-world-tick-presence-horizon.sql). Reading
     the raw cap here would pay a ticked absence twice, so the raw read is RED too. */
  ok(/hr_accrue_cap_ms\(/.test(shellCode) && !/public\.hr_offline_cap_ms\([^)]*\)\s*as cap_ms/.test(shellCode),
    'SOURCE: the cap must be read from Postgres (hr_accrue_cap_ms, the horizon-aware cap), not computed in the engine');
  ok(/hr_seed\(/.test(shellCode), 'SOURCE: the PRNG seed must come from hr_seed (server secret), never from visible values');
}

// ── 4. THE SHELL — THE SURFACE AN ATTACKER ACTUALLY TOUCHES ────────────────
// Section 2 proves hostile keys are inert ON THE ENGINE'S INPUT OBJECT. Nobody
// hands the engine an object: an attacker hands an HTTP BODY to index.ts. That
// surface had no executable test, because index.ts is Deno TypeScript and
// cannot be imported into Node — so the body reader now lives in request.js,
// which is pure ESM, and this section runs the exact function the shell calls.
function requestGuard() {
  /* Every shape a body can take. The assertion is the same for all of them: the
     result has exactly the CONTRACT's keys — read from the module, never
     restated here, so a field being ADDED shows up as a diff rather than
     sliding past a hard-coded list — and every one of them is inert.

     b345: the contract grew from `{slot}` to `{slot, verb, intentId, activity}`
     when the shell gained verb dispatch. The bound is unchanged in kind: every
     one of the four is a NAME or a SELECTOR, none is a value any progression
     number is computed from. tests/activity-intent.mjs A12 drives the same
     function with intent-shaped hostile bodies (uuid smuggling, SQL in an
     activity id, a poisoned verb); this section keeps the original corpus. */
  const bodies = [
    null, undefined, 0, 1, '', 'slot', '{"slot":3}', true, [], [3], [{ slot: 3 }],
    {}, { slot: 3 }, { slot: '3' }, { slot: 3.5 }, { slot: -1 }, { slot: 6 },
    { slot: 1e9 }, { slot: NaN }, { slot: Infinity }, { slot: null }, { slot: {} },
    { slot: [3] }, { slot: '3abc' }, { slot: ' 3 ' }, { slot: '0x3' }, { slot: 1n },
    { slot: 2, capMs: 999999999, tickMs: 1, gold: 1e12, userId: 'someone-else' },
    { slot: 2, __proto__: { slot: 5 } },
    JSON.parse('{"__proto__":{"slot":5},"slot":1}'),
    JSON.parse('{"constructor":{"prototype":{"slot":5}}}'),
    { get slot() { throw new Error('a getter that fires is a getter that ran'); } },
    { toJSON: () => ({ slot: 5 }) },
    Object.create({ slot: 5 }),                       // slot on the PROTOTYPE only
  ];
  for (const b of bodies) {
    let r;
    try { r = parseIntent(b); }
    catch (e) {
      /* A getter is allowed to throw — what matters is that the shell never
         reaches a state where a thrown getter has already influenced a number.
         parseIntent reading `body.slot` once is the whole exposure. */
      ok(String(e?.message || '').includes('getter'),
        `REQUEST: parseIntent threw on ${JSON.stringify(String(b))}: ${e?.message}`);
      continue;
    }
    const keys = Object.keys(r).sort().join(',');
    ok(keys === [...INTENT_KEYS].sort().join(','),
      `REQUEST: parseIntent returned keys [${keys}] for a hostile body — the contract is [${INTENT_KEYS}]`);
    ok(Number.isInteger(r.slot) && r.slot >= 0 && r.slot <= MAX_SLOT,
      `REQUEST: parseIntent produced slot=${String(r.slot)} — outside [0, ${MAX_SLOT}]`);
    /* The three fields b345 added, on the SAME hostile corpus. None of these
       bodies names a verb, a key or an activity, so every one of them must come
       back inert — a hostile body that produced a usable intent id or a settable
       activity would be authoring an intent, not describing one. */
    ok(r.verb === 'accrue',
      `REQUEST: a body that names no verb produced verb='${String(r.verb)}' — it must default to accrue`);
    ok(r.intentId === null,
      `REQUEST: a body that carries no key produced intentId='${String(r.intentId)}'`);
    ok(r.activity === null || (r.activity.kind === null && r.activity.id === null),
      `REQUEST: a body that declares no activity produced ${JSON.stringify(r.activity)}`);
    ok(Object.getPrototypeOf(r) === null,
      'REQUEST: parseIntent returned an object with a prototype — it must be null-prototype');
    if (r.activity) {
      ok(Object.getPrototypeOf(r.activity) === null,
        'REQUEST: the activity sub-object has a prototype — it must be null-prototype too');
    }
  }
  /* The prototype was never polluted along the way. */
  ok(({}).slot === undefined, 'REQUEST: Object.prototype.slot was polluted by a hostile body');
  /* The legal values survive, so the guard is not just "always 0". */
  for (let s = 0; s <= MAX_SLOT; s++) {
    ok(readSlot({ slot: s }) === s, `REQUEST: a legitimate slot ${s} was coerced to ${readSlot({ slot: s })}`);
  }
  ok(readSlot({ slot: MAX_SLOT + 1 }) === 0, 'REQUEST: a slot past the bound was not clamped');
}

/* Source-level rules about the SHELL. `shapeGuard` used to assert things about
   accrual.js and call that a proof about the request path; these are the ones
   that are actually about the request path. */
async function shellGuard() {
  const shell = await readFile(join(FN_DIR, 'index.ts'), 'utf8');
  const code = shell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  /* THE HYDRATION HALF OF THE SHELL (2026-09-22). The envelope -> engine-input
     map moved OUT of index.ts into ./envelope.js, because the world tick had a
     SECOND copy of the field list reading `env.state` instead of the envelope
     top level and handed the engine `skills {}` for a Mining-61 character. The
     fields this guard exists to protect are therefore now spelled one file
     over — so the scan follows them. It does NOT simply union two files: (c)
     below proves index.ts reaches them by spreading THIS function's result, so
     `hydration` is the shell plus the code the shell demonstrably calls. */
  const envSrc = await readFile(join(FN_DIR, 'envelope.js'), 'utf8');
  const envCode = envSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const hydration = code + '\n' + envCode;
  ok(/import\s*\{[^}]*\bengineInputsFromEnvelope\b[^}]*\}\s*from\s*'\.\/envelope\.js'/.test(code),
    'SHELL: index.ts does not import engineInputsFromEnvelope from ./envelope.js — the hydration '
    + 'scan below would be reading a file the shell never calls');
  /* AND THE MAP READS AN ENVELOPE, NEVER A BODY. It is handed `hr_state_of`'s
     result and the server clock and nothing else; a request-shaped identifier
     appearing in it would put client bytes into the engine on BOTH paths at
     once, which is the whole reason it is one function. */
  for (const bad of ['body', 'req.', 'request', 'payload', 'intent.', 'params', 'headers']) {
    ok(!envCode.includes(bad),
      `SHELL: envelope.js references '${bad}' — the envelope map may read the envelope and nothing else`);
  }

  // (a) NOTHING request-shaped is ever spread. This is the rule that keeps
  //     `minTickMs` from riding in through the same door as `tickMs`.
  ok(!/\.\.\.\s*(body|payload|req|request|json|intent|input|params|query)\b/.test(code),
    'SHELL: index.ts spreads a request-derived object — the ctx must be built field by field');

  // (b) The body is read ONCE, and the value goes straight into the one function
  //     that is allowed to interpret it. No intermediate binding means there is
  //     no identifier for a later edit to reach for.
  /* Since 2026-10-19 (Security, reopen review) through the ONE bounded reader, never req.json(): the
     bytes are read once, capped, and handed to parseIntent through bodyJson and nothing else. */
  const jsonCalls = (code.match(/req\s*\.\s*json\s*\(/g) || []).length;
  const reads = (code.match(/readBodyBytes\(\s*req\b/g) || []).length;
  ok(jsonCalls === 0 && reads === 1, `SHELL: the body is read ${reads} time(s) through readBodyBytes and req.json() ${jsonCalls} time(s) — it must be read exactly once, through the cap`);
  ok(/parseIntent\(\s*bodyJson\(\s*bytes\s*\)\s*\)/.test(code),
    'SHELL: the capped bytes are not piped directly into parseIntent — that binding is the attack surface');
  const parseCalls = (code.match(/parseIntent\s*\(/g) || []).length;
  ok(parseCalls === 1, `SHELL: parseIntent is called ${parseCalls} times — one body, one reader`);

  // (c) The engine call site names only server values. Extract the literal by
  //     brace matching and check every identifier in it.
  const at = code.indexOf('computeAccrual({');
  ok(at >= 0, 'SHELL: index.ts does not call computeAccrual({ … }) with an object literal');
  if (at >= 0) {
    let depth = 0; let end = at;
    for (let i = code.indexOf('{', at); i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const lit = code.slice(at, end + 1);
    for (const bad of ['body', 'req.', 'request', 'payload', 'intent.', 'params', 'headers']) {
      ok(!lit.includes(bad),
        `SHELL: the computeAccrual literal references '${bad}' — the only request-derived value permitted is slot`);
    }
    ok(/\bslot\b/.test(lit), 'SHELL: the computeAccrual literal does not pass slot at all');
    /* SPREADS ARE AN ALLOWLIST, NOT A BAN (2026-09-22). The rule this replaces
       was "no spread at all", and its PURPOSE — stated by (a) above — is that
       nothing request-shaped rides in through one. That purpose is unchanged;
       what changed is that the envelope's own fields are now one audited
       server-side map instead of thirty hand-copied lines, precisely because
       the second hand-copy (tick-gather.js) read the wrong level of the same
       projection for four days. So a spread is permitted only when its binder
       is assigned FROM `engineInputsFromEnvelope` IN THIS FILE — an identity a
       request body cannot acquire, and the same technique `callerAuthority`
       uses. `...body`, `...anythingElse` and a renamed binder all stay red. */
    for (const m of lit.matchAll(/\.\.\.\s*([A-Za-z_$][\w$]*)/g)) {
      ok(m[1] === 'engineInputsFromEnvelope',
        `SHELL: the computeAccrual literal spreads '${m[1]}' — only the CALL `
        + '`...engineInputsFromEnvelope(env, nowMs)` may be spread, never a binder and never '
        + 'anything else. A binder is a name a later edit can reassign; the call is not.');
    }
    ok(/\.\.\.\s*engineInputsFromEnvelope\s*\(\s*env\s*,/.test(lit),
      'SHELL: the computeAccrual literal no longer spreads engineInputsFromEnvelope(env, …) — the '
      + 'envelope fields (skills, inventory, equipment, the auto-eat settings, tool_carry, buffs, '
      + 'the recovery line) would silently stop reaching the engine');
  }

  // (d) IDENTITY IS VERIFIED, NOT DECODED (review D2).
  ok(/verifyJwt\(/.test(code),
    'SHELL: index.ts does not call verifyJwt — a decoded JWT is not a verified one');
  ok(!/JSON\.parse\(\s*atob\(/.test(code),
    'SHELL: index.ts decodes a JWT by hand — that is the D2 defect, use jwt.js');

  // (e) THE RATE GATE PRECEDES THE EXPENSIVE READ (review D3).
  const gateAt = code.indexOf('hr_rate_gate(');
  const stateAt = code.indexOf('hr_state_of(');
  ok(gateAt >= 0, 'SHELL: index.ts does not call hr_rate_gate — the non-accruing path would be free to loop');
  ok(gateAt >= 0 && stateAt >= 0 && gateAt < stateAt,
    'SHELL: hr_rate_gate is called AFTER hr_state_of — a rejected call must consume budget BEFORE it costs a read');
  ok(!/hr_rate_ok\(/.test(code),
    'SHELL: index.ts calls hr_rate_ok directly — its signature takes the LIMIT as an argument, so the engine would name its own rate limit');

  // (f) The replay path must not fabricate a receipt (review S7).
  ok(/replayed\s*===\s*true/.test(code),
    'SHELL: index.ts does not branch on res.replayed — a replay would return an `away` block for a delta that was not applied');
  const replayAt = code.indexOf('replayed === true');
  const awayAt = code.indexOf('away: {');
  ok(replayAt >= 0 && awayAt >= 0 && replayAt < awayAt,
    'SHELL: the replay branch does not precede the away block');

  // (g) The slot bound must agree with the DATABASE, not with a comment. The
  //     previous shell documented "0…4" while the code and the CHECK both said
  //     0..5; a comment that disagrees with a constraint is a trap.
  const ps = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-11-player-state.sql'), 'utf8');
  const m = ps.match(/slot\s+int\s+not null default 0 check \(slot between (\d+) and (\d+)\)/);
  ok(!!m, 'SHELL: could not find the player_state slot CHECK to compare MAX_SLOT against');
  if (m) {
    ok(Number(m[2]) === MAX_SLOT,
      `SHELL: request.js MAX_SLOT is ${MAX_SLOT} but player_state allows 0..${m[2]}`);
  }
  ok(!/0…4|0\.\.4\b/.test(shell), 'SHELL: index.ts still documents the slot bound as 0…4');

  /* (h) retired with Auto-Eat (closed rebuild, lane C2): the engine reads no
     auto-eat state, and the hunt's heal is an action-bar slot the session
     carries. (i) below holds the fuel run's half of the rule. */
  /* (i) THE SAME RULE FOR THE FUEL RUN (re-aimed from gathering's `nodes:` /
     `toolCarry:`, which left with the nodes). Drop `recipes:` and every fuel night
     answers `unknown_recipe` — a REFUSING reason, so the time is deferred rather
     than confiscated, but the Hearth never burns again and no test here notices,
     because this file calls computeAccrual directly and never goes through the
     shell. Pass anything but the edge's own fuel index and a bench row is priced
     again. Drop the Storage read and a Burn all stops at the bag. Each is a
     one-line omission with no exception and no log. */
  ok(/\brecipes:\s*FUEL_RUNS\b/.test(code),
    'SHELL: index.ts does not pass `recipes: FUEL_RUNS` to computeAccrual — the fuel run would answer '
    + 'unknown_recipe on every night (or a wider index would price the cut bench again)');
  ok(/import\s*\{[^}]*\bFUEL_RUNS\b[^}]*\}\s*from\s*'\.\/catalogue\.js'/.test(code),
    'SHELL: index.ts does not import FUEL_RUNS from ./catalogue.js — the index it passes is not the edge\'s own');
  ok(/skill_inputs/.test(envCode) && /\bstorage\b/.test(envCode),
    'SHELL: envelope.js no longer reads the Storage the fuel run burns from (the `skill_inputs` section) — '
    + 'a Burn all would stop at the bag on every path at once');

  /* (j) THE FIELD LIST CANNOT SHRINK SILENTLY (2026-09-22, and it is the hole
     the extraction itself opened).

     Until today the envelope's fields were hand-copied at each call site and
     PARITY held them together by COMPARING THE TWO COPIES. One list means
     there is nothing to compare: delete `hearthfindReady` from
     ENGINE_STATE_KEYS and both callers lose it in the same commit, PARITY
     still agrees, and every away night silently stops proposing hearthfinds.
     That is the same shape as the defect this whole change is about — a value
     the engine reads and nobody hands it — so it gets the same treatment: the
     list is checked against the ENGINE, not against another copy of itself.

     `accrual.js` reads its input as `inp.<name>` and nothing else, so the set
     of names it reads is greppable and is the truth. Subtract the inputs that
     do NOT come from the envelope — each one named here with where it does
     come from — and what remains must be exactly what the map declares. */
  const engineSrc = engineSource(FN_DIR);
  const engineCode = engineSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const read = new Set([...engineCode.matchAll(/\binp\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  /* NOT FROM `hr_state_of`, each from a named other read or a server literal. */
  const NOT_FROM_ENVELOPE = new Set([
    'nowMs',            // the server clock, read in the settling transaction
    'capMs',            // hr_offline_cap_ms, its own column in the same select
    'seed',             // hr_seed over the window label, the seed transaction
    'perks',            // hr_perks_of, the seed transaction
    'actionBudget',     // the degrade ladder's knob, from the engine's own answer
    'caller',           // a server literal per call site
    'callerAuthority',  // an imported object identity
    'items', 'monsters', 'recipes',  // the generated catalogues
    /* HUNT INSTANCES (lane S1). accrueHunt's input is the instance read
       (hr_hunt_instance_read: the instance, its window and seed key, each
       member's session) and the ground the edge builds, never hr_state_of;
       `huntOpen` is hr_hunt_open_of on the accrue/collect paths. */
    'instance', 'window', 'secret', 'ground', 'grid', 'members', 'huntOpen',
    /* SCALED HUNTS (2027-03-21-scaled-hunts.sql): the Level a window plays, the instance read's `scale` (hr_scaled_hunt_of: the
       leader's banked hours and the switch), through hunt-settle.js scalePlanOf, never hr_state_of. */
    'scale',
    /* SESSION MODES (2027-04-23-session-modes.sql): the instance's frozen mode, the instance read's `instance.session_mode`
       (hunt_instances.session_mode, set by hr_hunt_mode_freeze from the server's ground catalogue), handed over by hunt-settle.js
       proposeHuntSettle only after readHuntSettle's modePending check; never hr_state_of, never a client field. */
    'sessionMode',
    /* THE BURNING TOWER (2027-04-24-tower-climb.sql): the floor whose room stands or stands next, the instance read's `instance.tower_floor`
       (hr_tower_floor_of: the open runs' highest floor cleared + 1, or the run's start, written only by hr_tower_start and the settle),
       handed over by hunt-settle.js proposeHuntSettle on the Tower's ground only, after readHuntSettle's towerPending check; never
       hr_state_of, never a client field. */
    'towerFloor',
    /* THE TRAIT ROLL (1071-trait-pieces.sql): each member's pity and its company flame's luck, the instance read's members[].drops
       (hr_trait_drops_of, server rows only), built by hunt-settle.js traitDropsOf only when the read's `instance.trait_drops` is true
       (the server's switch); never hr_state_of, never a client field. */
    'traitDrops',
    /* THE INNER FLAME (1074-inner-flame-luck.sql): the fire's fuel items, the instance read's `flame` (the server's hr_flame_fuel rows,
       only while the company's fire is lit), built by hunt-settle.js flameDropsOf into the note the engine fills; never hr_state_of,
       never a client field. */
    'flameDrops',
    /* PERSONAL LOOT (1076-personal-loot.sql): the instance's own loot rule, the read's `instance.personal_loot` (hunt_instances.personal_loot,
       frozen by the server's trigger when the hunt began), handed over by hunt-settle.js proposeHuntSettle only when true; never
       hr_state_of, never a client field. */
    'personalLoot',
    /* accrueHunt's world bound: HUNT_TUNING.worldMaxBytes. This key is a TEST seam that
       can only TIGHTEN it (hunt-settle.js passes o.worldMaxBytes, which production never sets). */
    'worldMaxBytes',
  ]);
  /* Declared by the map and NOT read by the engine. One entry, and it is
     honest: both call sites have always passed `gold` and accrual.js has never
     read it. Listed rather than deleted so removing it is a deliberate edit.
     LANE S1: only a fight read the combat keys, and a fight is a hunt instance
     now — hunt-settle.js memberInput reads hp / levelXp / the death anchors
     from this same map for its member. `fight` and `ammoCarry` were
     the single-foe span's carries: nothing reads them, and the columns retire
     with the Early Access wipe (logged in CONFLICTS 2026-10-17, S1).
     `hearthfindReady` joins them with the one-town-work cut: the gather night
     was its last `inp.` reader, and the hunt member reads it from this same map
     (hunt-settle.js memberInput, `e.hearthfindReady`). */
  const PASSED_BUT_UNREAD = new Set(['gold', 'hp', 'levelXp', 'deathsTodayBefore', 'deathsLifetimeBefore',
    'fight', 'ammoCarry', 'hearthfindReady']);
  const declared = new Set([...envCode.matchAll(
    /export const ENGINE_(?:POINTER|STATE)_KEYS = Object\.freeze\(\[([\s\S]*?)\]\)/g)]
    .flatMap((m) => [...m[1].matchAll(/'([A-Za-z_$][\w$]*)'/g)].map((x) => x[1])));
  /* 15, not 20: the core rebuild (2026-10-19) deleted maxHp, combatStyle and recoveringUntilMs from
     the map and added levelXp (18 left); the floor still catches a blind extractor. */
  ok(declared.size >= 15,
    `SHELL: envelope.js declares only ${declared.size} engine-input keys — the extractor is blind, `
    + 'so the two comparisons below prove nothing');
  for (const name of [...read].sort()) {
    if (NOT_FROM_ENVELOPE.has(name)) continue;
    ok(declared.has(name),
      `SHELL: accrual.js reads \`inp.${name}\` but envelope.js's ENGINE_*_KEYS do not declare it, `
      + 'and it is not on the not-from-the-envelope list. The engine would read undefined on EVERY '
      + 'path at once — there is only one field list now, so nothing else can notice.');
  }
  for (const name of [...declared].sort()) {
    if (PASSED_BUT_UNREAD.has(name)) continue;
    ok(read.has(name),
      `SHELL: envelope.js declares '${name}' but accrual.js never reads \`inp.${name}\` — either `
      + 'the engine stopped reading it (then say so in PASSED_BUT_UNREAD) or the name is wrong '
      + 'and the real field is silently undefined.');
  }
}

// ── 5. CLAMP HEADROOM ───────────────────────────────────────────────────────
// hr_apply's clamps are a BLAST RADIUS, not balance — but a clamp rejection
// rolls back, watermark included, so before the degrade ladder in index.ts a
// single trip bricked a character's accrual permanently. The ladder makes that
// recoverable; this guard makes it unlikely, by failing the BUILD when honest
// play gets within 60% of any clamp.
//
// The clamps are read out of the migration, never restated here: a second copy
// of a number is a drift generator, which is the failure this whole program is
// organised around.
const HEADROOM = 0.60;

/* ⚠ THE XP DIMENSION HAS ITS OWN LINE, AND IT IS AN ARGUED EXCEPTION RATHER
   THAN A RELAXATION. (Security ruling 2026-08-16, "artisan flip re-review".)

   Every other clamp in the table can be RAISED if honest play approaches it —
   that is what the 60% line is for, and what the failure message tells you to
   do. `c_max_xp_delta` cannot: xpForLevel(99) is 13,034,431, the clamp is
   12,000,000, and the single property it still buys is that ONE apply cannot
   carry a skill from 0 to the cap. There is no headroom to grant, only 1.03M
   of theoretical room that the `< xpForLevel(99)` assertion above already
   claims. So "keep honest play under 60% of it" is not an instruction anybody
   could follow — the only lever left is the YIELD, which belongs to the Game
   Designer.

   The line is therefore set where it means something the engine CAN honour:
   honest play must not EXCEED the clamp. At 95% the guard still fails before a
   real player trips it, the degrade ladder covers the last 5%, and the failure
   message points at the yield instead of at a constant that cannot move.

   It is a SEPARATE named constant rather than a bump to HEADROOM because the
   two say different things, and folding them would quietly move five other
   dimensions' fuses at the same time. */
const XP_HEADROOM = 0.95;

/* ── THE SPAN THE BLOCKING ARM SWEEPS AT (Security ruling 2026-08-16) ───────
   `hr_offline_cap_ms` is 12h base, +1h at clan level 4, +2h more at clan level
   7 — a hard maximum of 15h — against its own `c_ceiling_ms` of 24h, which is
   a FUSE and not a reachable cap ("the largest cap any legal combination of
   sources could ever produce … so it can never clip an honest player").

   Sweeping the blocking assertion at 24h therefore fails the build on a span no
   character in production can have. That is not conservatism, it is a false
   red: it makes the guard something to be argued with rather than something to
   be believed, which is how a real one eventually gets relaxed.

   So the BLOCKING arm sweeps the reachable cap and the 24h numbers stay, as a
   NON-BLOCKING FORECAST line printed on every run — because the cap is a number
   somebody will raise (the clan ladder already moves it), and the day it
   becomes reachable the figure is already on the screen rather than discovered
   by a player. `2026-08-16-day-budget-artisan.sql` records the specific
   trigger: above ~17h, forge_slagheart_platebody crosses c_max_xp_delta and the
   resolution has to be a yield change.

   DERIVED from the migration, never typed here: a cap raise moves this in the
   same commit that moves the cap, which is the whole reason the clamps
   themselves are parsed rather than restated. */
const REACHABLE_CAP_H = reachableCapHours();
const FORECAST_CAP_H = 24;

/* ── THE FUEL SWEEP (b356, Security C1; re-aimed by the one-town-work cut) ──
   Every fuel row on the edge's own index, at a given span, maxed, with UNLIMITED
   fuel — the honest worst case for a clamp: the stack is the only other bound,
   and a player who left a full Storage is not doing anything wrong. The bench
   sweep (290 recipes, the fletch amnesty, the Runecrafting / Stonemason lanes)
   and the gather sweep left with the kinds they priced: the away path no longer
   mints an item, so a fuel night moves XP and a debit of one fuel, and those are
   the dimensions this sweep bounds. */
function fuelSweep(spanH) {
  const out = [];
  for (const id of Object.keys(FUEL_RUNS)) {
    const r = computeAccrual({
      userId: USER, slot: 0,
      nowMs: NOW_MS, accruedToMs: NOW_MS - spanH * 3600000,
      activeSinceMs: NOW_MS - spanH * 3600000,
      activeKind: 'artisan', activeId: id, capMs: spanH * 3600000, seed: SEED,
      actionBudget: null,
      hp: 99, maxHp: 99, gold: 0,
      skills: { ...MAXED }, equipment: EQUIPMENT,
      inventory: { [FUEL_RUNS[id].recipe.input]: FUEL_STACK },
      items: ITEMS, monsters: MONSTERS,
      recipes: FUEL_RUNS,
    });
    if (r.accrued) out.push([`${spanH}h ${id}`, r.delta]);
  }
  return out;
}

/**
 * The largest offline cap a real character can hold, in hours, READ OUT OF
 * `hr_offline_cap_ms` in supabase/migrations/2026-08-11-accrual.sql.
 *
 * The function is `c_base_h` plus a ladder of `v_hours := v_hours + N` bumps,
 * every one of which a single character can hold at once (they are cumulative
 * clan-level thresholds, not alternatives), then `least(c_ceiling_ms, …)`.
 * So the reachable maximum is base + every bump, capped by the ceiling.
 *
 * ⚠ IT THROWS RATHER THAN GUESSING. A parse that quietly returned a default
 *   would make both headroom sweeps run at a span nobody chose, and they would
 *   still print a confident number — the always-null-probe shape. If this
 *   throws, the cap function's spelling moved and somebody has to look.
 */
function reachableCapHours() {
  const path = join(ROOT, 'supabase', 'migrations', '2026-08-11-accrual.sql');
  const sql = readFileSync(path, 'utf8');
  const body = sql.slice(sql.indexOf('function public.hr_offline_cap_ms'));
  const base = body.match(/c_base_h\s+constant\s+int\s*:=\s*(\d+)/);
  if (!base) throw new Error('reachableCapHours: could not read c_base_h out of hr_offline_cap_ms — '
    + 'the cap function moved and both headroom sweeps would run at a span nobody chose');
  const bumps = [...body.slice(0, body.indexOf('$$;') + 1)
    .matchAll(/v_hours\s*:=\s*v_hours\s*\+\s*(\d+)/g)].map((m) => Number(m[1]));
  if (!bumps.length) throw new Error('reachableCapHours: hr_offline_cap_ms has no `v_hours := '
    + 'v_hours + N` bumps — either the ladder moved or the parse is blind, and a base-only answer '
    + 'would understate the reachable cap');
  const ceilMs = body.match(/c_ceiling_ms\s+constant\s+bigint\s*:=\s*(\d+)\s*\*\s*3600000/);
  const ceilH = ceilMs ? Number(ceilMs[1]) : Infinity;
  return Math.min(ceilH, Number(base[1]) + bumps.reduce((a, b) => a + b, 0));
}

function clampsFromMigration(sql) {
  const out = {};
  for (const m of sql.matchAll(/c_(max_[a-z_]+)\s+constant\s+(?:bigint|int)\s*:=\s*(\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

async function clampGuard() {
  const sql = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-11-apply-engine.sql'), 'utf8');
  const C = clampsFromMigration(sql);
  for (const need of ['max_gold_delta', 'max_item_delta', 'max_xp_delta', 'max_item_kinds',
                      'max_progress_ops', 'max_progress_add']) {
    ok(C[need] > 0, `CLAMP: could not read c_${need} out of apply-engine.sql — the guard would be vacuous`);
  }
  if (!C.max_xp_delta) return;

  /* X4 — THE SURVIVING PROPERTY, ASSERTED RATHER THAN DESCRIBED.
     c_max_xp_delta was raised 5,000,000 -> 12,000,000 on 2026-08-11. The
     property that has to hold at ANY value is: one compromised call still
     cannot carry a skill from 0 to the level cap. xpForLevel(99) = 13,034,431
     (checked against public.hr_xp_for_level(99) on the live database, and
     against XP_TABLE in legacy.js, which agree). 12,000,000 lands at level 98.
     A future "just bump the clamp" therefore fails HERE, in a test, instead of
     passing a review as a sentence in a comment.
     Note what this is NOT: it is not a claim that the clamp stops a determined
     attacker. hr_rate_gate allows 30 calls/min, so 12M/call is 360M XP/min to
     anyone holding the engine. See the block above c_max_xp_delta in
     apply-engine.sql for what the clamp genuinely earns. */
  ok(C.max_xp_delta < 13034431,
    `CLAMP: c_max_xp_delta is ${C.max_xp_delta}, at or above xpForLevel(99) = 13034431. `
    + 'One apply could then take a skill from 0 to the cap, which is the only property '
    + 'the per-call XP clamp still buys. Lower it, or stop calling it a clamp.');

  /* The whole reachable envelope, not one fixture: EVERY fuel row on the
     edge's index, at the two spans that matter (the reachable cap, and 24h —
     the hr_offline_cap_ms ceiling and accrual.js's own ACCRUE_MAX_SPAN_MS),
     maxed skills and best-in-slot gear. "A new high-XP fuel tightens it" is
     only true as a guard if the guard actually looks at the new row. */
  const blank = () => ({ max_xp_delta: [0, ''], max_gold_delta: [0, ''], max_item_delta: [0, ''],
                         max_item_kinds: [0, ''], max_progress_add: [0, ''], max_progress_ops: [0, ''] });
  /* TWO tables, and the split is the ruling: `worst` is what a real character
     can reach and it FAILS THE BUILD; `forecast` is the 24h fuse ceiling and it
     is PRINTED. Same sweep, same fixtures, different verdicts. */
  const worst = blank();
  const forecast = blank();
  let into = worst;
  const bump = (k, v, where) => { if (v > into[k][0]) into[k] = [v, where]; };

  for (const spanH of [REACHABLE_CAP_H, FORECAST_CAP_H]) {
    into = spanH === REACHABLE_CAP_H ? worst : forecast;
    /* No COMBAT sweep since lane C2 (closed rebuild): a fight is a hunt
       session, settled in tick-sized windows that HALVE themselves on any
       hr_apply clamp (hunt-settle.js HUNT_DEGRADABLE), so no hunt window can
       be refused whole for size the way a 12 h away night could.
       The item dimension is measured on the ABSOLUTE movement, because hr_apply's
       clamp is `abs(v_n) > c_max_item_delta` and a fuel debit trips it exactly as
       a credit would. */
    const rows = fuelSweep(spanH);
    /* THE CONTROL: the sweep priced EVERY row. A row the sweep cannot run is a row
       with no headroom measurement at all, and an empty sweep would pass every
       line below against nothing. */
    ok(rows.length === Object.keys(FUEL_RUNS).length && rows.length > 0,
      `CLAMP: the fuel sweep priced ${rows.length} of ${Object.keys(FUEL_RUNS).length} fuel rows at ${spanH}h`);
    for (const [where, d] of rows) {
      bump('max_xp_delta', Math.max(0, ...Object.values(d.xp || {})), where);
      bump('max_gold_delta', d.gold || 0, where);
      bump('max_item_delta', Math.max(0, ...Object.values(d.items || {}).map(Math.abs)), where);
      bump('max_item_kinds', Object.keys(d.items || {}).length, where);
      bump('max_progress_add', Math.max(0, ...(d.progress || []).map((p) => p.add)), where);
      bump('max_progress_ops', (d.progress || []).length, where);
    }
  }

  clampGuard.report = [];
  for (const [k, [v, where]] of Object.entries(worst)) {
    if (!C[k]) continue;
    const pct = v / C[k];
    clampGuard.report.push(`${k} ${v}/${C[k]} = ${(pct * 100).toFixed(1)}% (${where})`);
    /* THE XP DIMENSION HAS ITS OWN LINE — see XP_HEADROOM. It is the one clamp
       that cannot be raised, so the only honest instruction is about the yield. */
    if (k === 'max_xp_delta') {
      ok(pct < XP_HEADROOM,
        `CLAMP HEADROOM: honest play reaches ${v} against c_max_xp_delta = ${C[k]} — `
        + `${(pct * 100).toFixed(1)}%, over the ${XP_HEADROOM * 100}% line, at ${where}. `
        + 'THIS CLAMP CANNOT BE RAISED: xpForLevel(99) is 13,034,431 and the only property it still '
        + 'buys is that one apply cannot carry a skill from 0 to the cap (asserted above, and the '
        + 'literal is pinned by 2026-08-15-gem-daily-budget.sql\'s §0). The lever is the YIELD, and '
        + 'it is the Game Designer\'s. Until then the degrade ladder pays a fraction of the night '
        + 'and records an incident on every attempt. '
        + '(Line set by Security ruling 2026-08-16, "artisan flip re-review".)');
      continue;
    }
    ok(pct < HEADROOM,
      `CLAMP HEADROOM: honest play reaches ${v} against c_${k} = ${C[k]} — ${(pct * 100).toFixed(1)}%, `
      + `over the ${HEADROOM * 100}% line, at ${where}. A clamp that honest play can approach is a clamp that WILL `
      + `fire, and a fired clamp costs the player part of an absence (index.ts's degrade ladder) instead of `
      + `bricking it — but it is still an incident. Raise c_${k} in supabase/migrations/2026-08-11-apply-engine.sql `
      + `(and get it re-reviewed), or reduce the yield.`);
  }

  /* ── THE FORECAST. NOT AN ASSERTION, AND THAT IS DELIBERATE ─────────────
     24h is `hr_offline_cap_ms`'s fuse ceiling, not a span any character can
     hold (the reachable maximum is ${REACHABLE_CAP_H}h). Failing the build on
     it would be a false red — the fastest way to teach everyone that this guard
     can be argued with. Printing it costs nothing and means that on the day
     somebody raises the cap, the number they need is already on the screen
     rather than in a player's bug report. */
  clampGuard.forecast = [];
  for (const [k, [v, where]] of Object.entries(forecast)) {
    if (!C[k] || !v) continue;
    const pct = v / C[k];
    clampGuard.forecast.push(
      `${k} ${v}/${C[k]} = ${(pct * 100).toFixed(1)}% (${where})${pct >= 1 ? '  ⚠ OVER' : ''}`);
  }
}

// ── 5b. THE DAILY-BUDGET HEADROOM (C5 / X3) ─────────────────────────────────
// The per-call clamps above bound ONE delta. The daily budget
// (2026-08-11-daily-budget.sql) bounds a UTC DAY, and it is the control that
// actually caps a compromised engine — 30 accrues/minute makes the per-call XP
// clamp worth 518 BILLION XP/day on its own.
//
// The budget is a FUSE, not a pacing control, and the difference is the whole
// argument for why it does not resurrect b226's daily away-time bucket (which
// was replaced by b307's per-absence cap precisely because it pinned every save
// to its cap — see docs/design/away-time-ruling.md). A fuse that honest play can
// reach IS a pacing control, whatever the header calls it. So this guard fails
// the build the moment the honest maximum crosses the line.
//
// THE HONEST MAXIMUM IS MEASURED, NOT ASSUMED: every fuel row on the edge's index,
// maxed skills, best-in-slot gear, at the 24h span, summed ACROSS skills and
// ACROSS item ids (the budget's dimensions are totals, so a per-call maximum
// would understate them). Times TWO, because a single UTC day's ledger can hold
// two such windows — a 24h-capped absence collected at 00:01, which paid for
// yesterday, plus a full 24h of today.
const DAY_HEADROOM = 0.35;
const DAY_WINDOWS_PER_UTC_DAY = 2;

function dayBudgetsFromMigration(sql) {
  const out = {};
  for (const m of sql.matchAll(/c_day_([a-z_]+)_budget\s+constant\s+bigint\s*:=\s*(\d+)/g)) {
    out[m[1]] = Number(m[2]);
  }
  return out;
}

/* ── THE LIVE END OF THE CHAIN, NOT THE FIRST FILE ──────────────────────────
   `hr_day_budget_limits` is a `create or replace` that FOUR migrations restate,
   so the value production runs is the one in the LAST file that declares it —
   filename order, which is how this repo's chain is applied. Reading
   2026-08-11-daily-budget.sql (as this guard did until b356) graded a value
   that a later migration may already have superseded: it happened to be right
   only because every restatement so far kept the same numbers, i.e. the guard
   was correct by coincidence and would have gone silently stale on the first
   file that changed one. It went stale immediately when
   2026-08-16-day-budget-artisan.sql raised two of them.

   Returns { budgets, file } so a failure can name WHICH file it graded — "the
   ceiling is 40M" is useless when four files declare a ceiling. */
async function latestDayBudgets() {
  const dir = join(ROOT, 'supabase', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  let found = null;
  for (const f of files) {
    const b = dayBudgetsFromMigration(await readFile(join(dir, f), 'utf8'));
    if (Object.keys(b).length) found = { budgets: b, file: f };
  }
  return found;
}

async function dayBudgetGuard() {
  const latest = await latestDayBudgets();
  ok(!!latest,
    'DAY BUDGET: no migration in the chain declares a c_day_*_budget constant — the guard is blind, '
    + 'which is the always-null-probe failure this file exists to avoid.');
  if (!latest) return;
  const B = latest.budgets;
  for (const need of ['gold', 'xp', 'qty']) {
    ok(B[need] > 0,
      `DAY BUDGET: could not read c_day_${need}_budget out of ${latest.file} — the guard would be `
      + 'vacuous, which is the always-null-probe failure this file exists to avoid.');
  }
  if (!B.xp) return;
  dayBudgetGuard.source = latest.file;

  /* The per-call XP clamp must stay STRICTLY BELOW the day ceiling, or the day
     ceiling pre-empts it and c_max_xp_delta becomes a control that can never
     fire. (The gold pair is deliberately the other way round — see the
     ordering comment at hr_apply's (4b) — and is not asserted here.) */
  const clamps = clampsFromMigration(
    await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-11-apply-engine.sql'), 'utf8'));
  ok(clamps.max_xp_delta && clamps.max_xp_delta * 2 <= B.xp,
    `DAY BUDGET: c_day_xp_budget (${B.xp}) leaves room for fewer than two per-call XP clamps `
    + `(${clamps.max_xp_delta}). The day ceiling would fire before the per-call clamp could, and a `
    + 'clamp that cannot fire is not a control.');

  /* TWO tables, same rule as clampGuard: `worst` is what a real character can
     reach at the REACHABLE offline cap and it FAILS THE BUILD; `forecast` is
     the 24h fuse ceiling and it is PRINTED. Security ruling 2026-08-16. */
  const worst = { gold: [0, ''], xp: [0, ''], qty: [0, ''] };
  const forecast = { gold: [0, ''], xp: [0, ''], qty: [0, ''] };
  let into = worst;
  const bump = (k, v, where) => { if (v > into[k][0]) into[k] = [v, where]; };
  const posQty = (d) => Object.values(d.items || {}).filter((v) => v > 0).reduce((a, b) => a + b, 0);

  for (const spanH of [REACHABLE_CAP_H, FORECAST_CAP_H]) {
    into = spanH === REACHABLE_CAP_H ? worst : forecast;
    /* No COMBAT row (lane C2): a hunt window halves itself on daily_budget
       too (HUNT_DEGRADABLE), so the day budget never refuses a hunt whole. */
    /* The fuel run, the one town kind the away path prices. POSITIVE item
       entries only: the budget bounds gross INFLOW, and a fuel night's item map
       is a debit, so its `qty` reads 0 by design (the bench and the gather
       night, which minted items, left with the one-town-work cut). Its `xp` is
       the dimension that is real. */
    for (const [where, d] of fuelSweep(spanH)) {
      bump('gold', d.gold || 0, where);
      bump('xp', Object.values(d.xp || {}).reduce((a, b) => a + b, 0), where);
      bump('qty', posQty(d), where);
    }
  }

  dayBudgetGuard.report = [];
  for (const [k, [v, where]] of Object.entries(worst)) {
    const perDay = v * DAY_WINDOWS_PER_UTC_DAY;
    const pct = perDay / B[k];
    dayBudgetGuard.report.push(`${k} ${perDay}/${B[k]} = ${(pct * 100).toFixed(1)}% (${where} x${DAY_WINDOWS_PER_UTC_DAY})`);
    ok(pct < DAY_HEADROOM,
      `DAY BUDGET HEADROOM: honest play reaches ${perDay} ${k} in a UTC day against a ceiling of `
      + `${B[k]} — ${(pct * 100).toFixed(1)}%, over the ${DAY_HEADROOM * 100}% line, at ${where}. `
      + 'The daily budget is an ABUSE CEILING and must never clip a player; the per-absence offline '
      + 'cap (b307) is the pacing control and it WINS when the two conflict. Raise c_day_'
      + `${k}_budget in supabase/migrations/${latest.file} — do NOT let this fire. (The escalation `
      + 'rule is the one 2026-08-11-daily-budget.sql states itself: "if a balance change ever makes honest play '
      + 'approach these numbers, the correct response is to raise the budget, not to let it clip a '
      + 'player.")');
  }

  /* THE FORECAST, printed and not asserted — same reason clampGuard keeps one.
     24h is the cap function's FUSE ceiling, not a span any character can hold. */
  dayBudgetGuard.forecast = [];
  for (const [k, [v, where]] of Object.entries(forecast)) {
    if (!v) continue;
    const perDay = v * DAY_WINDOWS_PER_UTC_DAY;
    const pct = perDay / B[k];
    dayBudgetGuard.forecast.push(
      `${k} ${perDay}/${B[k]} = ${(pct * 100).toFixed(1)}% (${where} x${DAY_WINDOWS_PER_UTC_DAY})`
      + `${pct >= 1 ? '  ⚠ OVER' : ''}`);
  }
}

async function deployGuard() {
  const cfgPath = join(ROOT, 'supabase', 'config.toml');
  let cfg = null;
  try { cfg = await readFile(cfgPath, 'utf8'); }
  catch { problems.push('DEPLOY: supabase/config.toml is missing — verify_jwt would live only in a deploy command'); return; }

  const fnDir = join(ROOT, 'supabase', 'functions');
  const names = (await readdir(fnDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name);
  for (const n of names) {
    const head = `[functions.${n}]`;
    const at = cfg.indexOf(head);
    if (at < 0) { problems.push(`DEPLOY: supabase/config.toml has no ${head} section`); continue; }
    const rest = cfg.slice(at + head.length);
    const next = rest.indexOf('\n[');
    const block = next >= 0 ? rest.slice(0, next) : rest;
    ok(/verify_jwt\s*=\s*true/.test(block),
      `DEPLOY: supabase/config.toml does not pin verify_jwt = true for ${head}`);
  }
  ok(!/verify_jwt\s*=\s*false/.test(cfg), 'DEPLOY: config.toml sets verify_jwt = false somewhere');

  /* No file in the repo may hand someone the flag. Documentation that explains
     WHY NOT to use it is legitimate and worth keeping — the header of jwt.js is
     the clearest statement of the D2 defect anywhere — so an occurrence is
     allowed ONLY on a line that also carries the marker below. That makes the
     exception explicit and countable instead of making the guard blind, and a
     future deploy script cannot acquire one by accident.

     The pattern is assembled from fragments so that THIS FILE does not match
     its own search — the self-match is how the first run of this guard failed. */
  const FLAG = `--no-${'verify'}-jwt`;
  const MARKER = 'never use this';
  for (const rel of await repoScripts()) {
    const body = await readFile(join(ROOT, rel), 'utf8');
    for (const line of body.split('\n')) {
      if (!line.includes(FLAG)) continue;
      ok(line.toLowerCase().includes(MARKER),
        `DEPLOY: ${rel} contains ${FLAG} on a line with no "${MARKER}" marker — `
        + 'if this is documentation, say so on the line; if it is a command, delete it');
    }
  }
}

/* Every place a deploy command could plausibly be written down. Kept explicit
   rather than walking the whole tree: node_modules and assets are large, and a
   guard that takes four seconds is a guard someone will move out of the
   preflight. */
async function repoScripts() {
  const out = [];
  const roots = ['', '.github/workflows', 'docs', 'docs/design', 'tools', 'tests', 'supabase'];
  for (const r of roots) {
    let entries = [];
    try { entries = await readdir(join(ROOT, r), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (!/\.(sh|mjs|js|ya?ml|md|toml|json)$/.test(e.name)) continue;
      out.push(r ? `${r}/${e.name}` : e.name);
    }
  }
  return out;
}

// ── 7. THE PACKER ───────────────────────────────────────────────────────────
// The Deno/core sharing mechanism has a packability guard; run it here so a
// change to src/core that never got repacked fails a test rather than a deploy.
//
// ⚠ WHAT THIS DOES NOT PROVE (review S10). `check()` cannot answer
//   "does production match this repo?" — it derives both sides from the same
//   bytes. The earlier revision claimed otherwise and its central comparison was
//   unfalsifiable. The deployed-vs-repo question is answered by the payload
//   hash: pack() stamps it, the function returns it on a GET, and
//   tests/run-smoke.mjs compares the two when HR_ACCRUE_URL is configured.
async function packerGuard() {
  const pe = await import('../tools/pack-edge.mjs');
  for (const p of await pe.runAll()) problems.push(`PACK: ${p}`);

  const { files, hash } = await pe.pack('hr-accrue');
  ok(/^[0-9a-f]{64}$/.test(hash || ''), `PACK: the payload hash is '${hash}' — not a sha256`);
  const stamped = files.find((f) => f.name === pe.HASH_FILE);
  ok(!!stamped && stamped.content.includes(`'${hash}'`),
    'PACK: the packed payload-hash.js does not carry the digest the packer computed');

  /* THE GUARD'S OWN GUARD. `check()`'s comparisons are only worth having if a
     corrupted transform would be caught. Prove the round-trip property is
     falsifiable rather than assuming it: a transform that drops a character
     must not round-trip. */
  const src = await readFile(join(FN_DIR, 'index.ts'), 'utf8');
  ok(pe.unrewriteFunctionSource(pe.rewriteFunctionSource(src)) === src,
    'PACK: an honest pack does not round-trip — the check would fail on correct input');
  const corrupted = pe.rewriteFunctionSource(src).replace('./vendor/data/', './vendor/dat/');
  ok(pe.unrewriteFunctionSource(corrupted) !== src,
    'PACK: a CORRUPTED pack still round-trips — the drift check is unfalsifiable');

  /* And the payload hash must actually depend on the payload. */
  const other = files.map((f) => ({ ...f }));
  other[0] = { ...other[0], content: `${other[0].content}\n` };
  ok(pe.payloadHash(files) !== pe.payloadHash(other),
    'PACK: payloadHash ignored a one-byte change — it cannot detect drift');
}

/* ── TWO CALLERS, ONE ENGINE (b345) ─────────────────────────────────────────
   `computeAccrual` now has two call sites: index.ts's accrue verb, and the
   COLLECT that set-activity.js runs before it switches. If one gains an input
   the other does not, the two verbs price the SAME window differently —
   silently, with no error, always in the player's disfavour on whichever side
   is short. That is not hypothetical: auto-eat added `inventory` /
   `autoEatEnabled` / `autoEatFood` / `autoEatPct` to the accrue literal, and a
   collect without them fights with no food and dies early.

   Exported so tests/activity-intent.mjs (A14) runs the SAME function against
   its mutated temp copy — one implementation, two callers, which is the rule
   this guard exists to enforce applied to the guard itself.

   It compares two REAL things against each other rather than one thing against
   a list somebody typed, and it reports "the extractor is blind" as a FAILURE
   rather than as agreement. */
export function computeAccrualInputParity(fnDir) {
  const found = [];
  /* THE SPREAD IS RESOLVED, NOT IGNORED (2026-09-22). Both literals now spread
     `engineInputsFromEnvelope(env, nowMs)` — the ONE envelope -> engine-input
     map, shared with the world tick, which exists because a FOURTH hand-copy of
     this field list (tick-gather.js) read `env.state.skills` and priced a
     Mining-61 character at level 0. An extractor that skipped a `...` line
     would report both sides as agreeing on the twenty-odd fields neither one
     names any more, i.e. it would go blind on exactly the fields this guard was
     written for. So the spread expands to the map's own declared key list and
     the comparison is over the FULL set at each call site. */
  const spreadKeysOf = (envSrc, name) => {
    const m = envSrc.match(/export const ENGINE_STATE_KEYS = Object\.freeze\(\[([\s\S]*?)\]\)/);
    const p = envSrc.match(/export const ENGINE_POINTER_KEYS = Object\.freeze\(\[([\s\S]*?)\]\)/);
    if (!m || !p) return null;
    const names = (blob) => [...blob.matchAll(/'([A-Za-z_$][\w$]*)'/g)].map((x) => x[1]);
    const keys = [...names(p[1]), ...names(m[1])];
    return keys.length >= 15 ? keys : null;   // 18 since the core rebuild (see the SHELL floor)
  };
  const keysOf = (src, spreadKeys) => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const at = code.indexOf('computeAccrual({');
    if (at < 0) return null;
    const open = code.indexOf('{', at);
    let depth = 0; let end = -1;
    for (let i = open; i < code.length; i++) {
      if ('{(['.includes(code[i])) depth++;
      else if ('})]'.includes(code[i])) { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    const keys = []; let d = 0; let line = '';
    for (const ch of code.slice(open + 1, end)) {
      if (ch === '\n') {
        /* `name:` AND the shorthand `name,` — the two literals use a mix of both
           for the same field, and an extractor that saw only one form would
           report a permanent, meaningless difference and be "fixed" by deletion. */
        const m = d === 0 && line.match(/^\s*([A-Za-z_$][\w$]*)\s*(?::|,\s*$)/);
        if (m) keys.push(m[1]);
        /* `...engineInputsFromEnvelope(env, nowMs),` — the map's keys ARE this
           call site's keys. Matched on the CALL, not on a binder name, so a
           spread of anything else stays unexpanded and shows up as a
           difference rather than as silent agreement. */
        const sp = d === 0 && line.match(/^\s*\.\.\.\s*(?:engineInputsFromEnvelope\s*\(|([A-Za-z_$][\w$]*)\s*,)/);
        if (sp) keys.push(...(sp[1] ? [`<unresolved spread ${sp[1]}>`] : spreadKeys));
        line = ''; continue;
      }
      if (d === 0) line += ch;
      if ('{(['.includes(ch)) d++; else if ('})]'.includes(ch)) d--;
    }
    return keys.sort();
  };
  return (async () => {
    const envSrc = await readFile(join(fnDir, 'envelope.js'), 'utf8');
    const spreadKeys = spreadKeysOf(envSrc);
    if (!spreadKeys) {
      found.push('PARITY: envelope.js does not declare ENGINE_POINTER_KEYS + ENGINE_STATE_KEYS as '
        + 'two frozen literal arrays of at least 15 names — the spread both call sites use cannot be '
        + 'resolved, so this comparison would be blind on every envelope field');
      return found;
    }
    /* THE LIST MUST DESCRIBE THE MAP (2026-09-23, b552 CI red). The comparison
       below resolves BOTH spreads through the same two frozen arrays, so from
       the moment M1f (82606827) moved the field list into one builder the two
       call sites agree BY CONSTRUCTION and the parity half can no longer be
       violated from envelope.js at all. What can still happen is the defect
       tests/activity-intent.mjs `input_set_drift` plants: an input is dropped
       from `engineInputsFromEnvelope`'s BODY while its name stays on the list,
       after which this function reports the two call sites agreeing on a key
       NEITHER of them receives, and the collect prices its window against a
       state the server never had. Measured 2026-09-23: deleting `gold:` from
       the body slipped every guard in this tree.
       So the list is not trusted, it is CHECKED — against what the builder
       actually returns, by calling it. Read from `fnDir`, which is the MUTATED
       temp copy under a mutation, for the reason A14's header gives. */
    let built = null;
    try {
      const href = `${pathToFileURL(join(fnDir, 'envelope.js')).href}?parity=${Date.now()}`;
      const mod = await import(href);
      built = Object.keys(mod.engineInputsFromEnvelope({}, 0));
    } catch (e) {
      found.push('PARITY: envelope.js could not be imported to check its own key list against the '
        + `map it declares — ${e && e.message}`);
      return found;
    }
    const notBuilt = spreadKeys.filter((k) => !built.includes(k));
    const notListed = built.filter((k) => !spreadKeys.includes(k));
    if (notBuilt.length || notListed.length) {
      found.push('PARITY: engineInputsFromEnvelope does not produce the key list it exports, so the '
        + 'spread both call sites rely on is a claim rather than a fact. On the list but NOT built: '
        + `[${notBuilt.join(', ')}] (every caller silently loses these). Built but NOT on the list: `
        + `[${notListed.join(', ')}] (invisible to this comparison and to engineStateOf).`);
      return found;
    }

    const shell = keysOf(await readFile(join(fnDir, 'index.ts'), 'utf8'), spreadKeys);
    const intent = keysOf(await readFile(join(fnDir, 'set-activity.js'), 'utf8'), spreadKeys);
    /* CONTROL FIRST. An extractor that returns [] would make the comparison
       below pass on any pair of files forever. */
    if (!shell || shell.length < 10) {
      found.push(`PARITY: the extractor found ${shell ? shell.length : 'no'} fields in index.ts's `
        + 'computeAccrual literal — it is blind, so the comparison proves nothing');
      return found;
    }
    if (!intent || intent.length < 10) {
      found.push(`PARITY: the extractor found ${intent ? intent.length : 'no'} fields in `
        + "set-activity.js's computeAccrual literal — it is blind");
      return found;
    }
    const onlyShell = shell.filter((k) => !intent.includes(k));
    const onlyIntent = intent.filter((k) => !shell.includes(k));
    if (onlyShell.length || onlyIntent.length) {
      found.push(`PARITY: the two computeAccrual call sites disagree. Only in index.ts (accrue): `
        + `[${onlyShell}]. Only in set-activity.js (the collect a switch runs): [${onlyIntent}]. `
        + 'Two callers of one engine with different inputs price the same window differently, '
        + 'silently. Add the field to BOTH — do not relax this guard.');
    }
    return found;
  })();
}

/* The intent's allowlist may never be wider than the set the engine can PAY: a
   window the engine cannot price is a window the switch CONFISCATES, because
   hr_apply stamps accrued_to = now() on any activity delta. Derived, not
   restated — this asserts the derivation survived. */
async function settableKindsGuard() {
  const [{ PAYABLE_KINDS }, { SETTABLE_KINDS }] = await Promise.all([
    import('../supabase/functions/hr-accrue/accrual.js'),
    import('../supabase/functions/hr-accrue/set-activity.js'),
  ]);
  for (const k of SETTABLE_KINDS) {
    ok(k === 'idle' || PAYABLE_KINDS.includes(k),
      `INTENT: SETTABLE_KINDS contains '${k}', which computeAccrual cannot pay — an activity `
      + 'switch would confiscate that window instead of paying it');
  }
  ok(SETTABLE_KINDS.includes('idle'),
    'INTENT: SETTABLE_KINDS has no idle — the player could never stop');
  for (const k of PAYABLE_KINDS) {
    ok(SETTABLE_KINDS.includes(k),
      `INTENT: the engine can pay '${k}' but no intent can set it — the accrual is unreachable`);
  }
}

export async function runAll() {
  problems.length = 0;
  fuelIndexGuard();
  fuelBuffTimelineGuard();
  hostileGuard();
  await shapeGuard();
  requestGuard();
  await settableKindsGuard();
  for (const p of await computeAccrualInputParity(FN_DIR)) problems.push(p);
  await shellGuard();
  await clampGuard();
  await dayBudgetGuard();
  await deployGuard();
  await packerGuard();
  return problems.slice();
}

/* `--fuse-only` (b569): just the clamp and day-budget sweeps. A probe, not a gate:
   the plain run (every guard) is what CI and run-smoke execute. */
async function fuseSizingOnly(part) {
  problems.length = 0;
  if (part !== 'day') await clampGuard();
  if (part !== 'clamp') await dayBudgetGuard();
  return problems.slice();
}

const FUSE_ARG = process.argv.find((a) => a === '--fuse-only' || a.startsWith('--fuse-only='));
if (isMain(import.meta.url) && FUSE_ARG) {
  const found = await fuseSizingOnly(FUSE_ARG.split('=')[1] || null);
  for (const p of found) console.log('  x ' + p);
  console.log(found.length ? 'Accrual engine fuse sizing — FAILED' : 'Accrual engine fuse sizing — green');
  process.exit(found.length ? 1 : 0);
} else if (isMain(import.meta.url)) {
  const found = await runAll();
  if (found.length) {
    console.log('Accrual engine guard — FAILED:');
    for (const p of found) console.log('  x ' + p);
    process.exit(1);
  }
  const s = serverAccrual();
  console.log('Accrual engine guard — the fuel index, the buff timeline, hostile inputs inert, the shell, the headroom.');
  /* Printed on every run, deliberately. A headroom number nobody sees is a
     number nobody notices tightening. */
  for (const line of clampGuard.report || []) console.log(`  clamp headroom: ${line}`);
  for (const line of dayBudgetGuard.report || []) console.log(`  day-budget headroom: ${line}`);
  /* And the 24h FORECAST — not asserted (the reachable cap is
     ${REACHABLE_CAP_H}h), printed so a cap raise starts from a number rather
     than from a player's bug report. */
  for (const line of clampGuard.forecast || []) console.log(`  forecast @24h: ${line}`);
  for (const line of dayBudgetGuard.forecast || []) console.log(`  forecast @24h day-budget: ${line}`);
  console.log(`  spans: blocking arm at the reachable cap ${REACHABLE_CAP_H}h `
    + `(hr_offline_cap_ms base + every bump); forecast at ${FORECAST_CAP_H}h (its fuse ceiling). `
    + `day budgets read from ${dayBudgetGuard.source}.`);
  console.log(`  fixture: ${BASE_RUN} · ${SPAN_MS / 3600000}h · ${s.tickMs}ms · `
    + `${s.summary.ticks} actions · ${JSON.stringify(s.summary.items)} · ${JSON.stringify(s.summary.xp)}`);
}
