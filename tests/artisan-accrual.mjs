// ============================================================================
// tests/artisan-accrual.mjs — THE ARTISAN ACCRUAL GUARD: THE GREAT HEARTH'S FUEL RUN.
//
// Since the one-town-work cut (09-crafting.md 4.17) the `artisan` kind is the Great Hearth's `fuel_<item>` runs and
// nothing else: town work is a company's jobs, settled in SQL, and the bench (its burn, its yields, its jewel rolls,
// its recipe gate, its tax) left with the cut. This guard holds the fuel run's accrual to the same
// claims the bench's held, re-aimed. The bench-only claims (b356's T2 client parity of `doArtisanAction`, T5's recipe
// gate, T6's noBurn and the cooking settlement arm, the ammo-clamp ratchet) retired with the bench: their subjects are
// gone. The bench's count stays as the hearth run's ("Burn" is a count of one, 4.17's bridge): T9. Every claim is driven through the REAL engine door (accrual.js computeAccrual).
//
//   T1  THE DISPATCH IS TOTAL: PAYABLE_KINDS and KIND_ACCRUERS agree in both directions (combat the one inline
//       kind, a hunt session), and a kind with no simulation is REFUSED `unsupported_activity`, never priced
//   T3  THE FUEL IS THE SERVER'S: a run burns no more than the bag plus Storage hold, the debit never exceeds the
//       starting stack, and the bag is spent before Storage (the server's order)
//   T4  RUNNING DRY IS A STOP: the worked time is paid, the run ENDS (`activity: idle`), the watermark stamps now
//       and the journal names the fuel; a run with no fuel at all still clears the pointer
//   T4c THE ACTION THAT BURNS THE LAST FUEL ENDS THE RUN in that settle (report #68: "still fueling the hearth")
//   T5  NO BENCH ROW IS PRICED: FUEL_RUNS is the fuel rows alone, and an artisan pointer on a cut bench recipe is
//       refused `unknown_recipe` (a POINTER reason: a STOP forfeits it), never priced
//   T7  SHAPE: every delta key is one hr_apply implements, every number an integer, the item map signed, the ledger
//       kind `craft`, every meta value a scalar; the bench's old inputs (a recipe map, a tax, a bag cap, a gather
//       index) reaching the engine change nothing
//   T8  THE DEGRADE LADDER halves the ACTIONS of a fuel window (its output is bounded by the bag, not the clock), a
//       budget stop keeps the pointer, and a forged budget can only shrink a window
//   T9  THE COUNT ("Burn" is a count of one): a run burns its count and no more however its settles are cut, ends on
//       the action that reaches it, says what it left (`active_left`) only where the server takes it, and a count it
//       cannot read is no count
//   T10 THE TOWN FLOOR is 15 s, the hunt settle's, and a fuel window is deterministic: one window asked twice
//       proposes one delta under one intent key
//   T11 THE WORK DAY ends a run at the day's end (`work_cap`), and says where its work ended (`work_to`)
//
//   node tests/artisan-accrual.mjs             the guard
//   node tests/artisan-accrual.mjs --selftest  every planted defect (MUTATIONS) must turn the guard red
//
// Run standalone, and as a preflight by tests/run-smoke.mjs (runAll).
// ============================================================================

import {
  computeAccrual, PAYABLE_KINDS, KIND_ACCRUERS, SKIP, degradeStep, accrueFloorMs, TOWN_SETTLE_MIN_MS, CALLER_AUTHORITY,
} from '../supabase/functions/hr-accrue/accrual.js';
import { FUEL_RUNS } from '../supabase/functions/hr-accrue/catalogue.js';
import { HUNT_SETTLE_MIN_MS } from '../supabase/functions/hr-accrue/hunt-settle.js';
import { intentIdFor, POINTER_SKIP_REASONS } from '../supabase/functions/hr-accrue/intents.js';
import { ITEMS } from '../src/data/items.js';
import { ARTISAN_RECIPES } from '../src/data/recipes.js';
import { HEARTH_FUELS, fuelRecipeId } from '../src/data/hearth.js';
import { simulateFuelSpan, indexFuelRuns } from '../src/core/artisan-sim.js';
import { advance } from '../supabase/functions/hr-accrue/tick-shadow.js';
import { isMain } from './_is-main.mjs';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); return !!cond; };

const FROM_MS = Date.UTC(2026, 10, 20, 2, 0, 0);
const HOUR = 3600000;
const USER = '00000000-0000-4000-8000-0000000aa5e1';
const RUN = 'fuel_bones';
const FUEL = 'bones';

/** One fuel window through the engine door, every input named. */
function call(over = {}) {
  return computeAccrual({
    userId: USER, slot: 0,
    nowMs: FROM_MS + 8 * HOUR, accruedToMs: FROM_MS, activeSinceMs: FROM_MS,
    activeKind: 'artisan', activeId: RUN, capMs: 12 * HOUR, seed: 0x5eed,
    hp: 50, levelXp: 0, gold: 0,
    skills: { inner_flame: 0 }, xpFrac: {}, equipment: {}, inventory: { [FUEL]: 1000000 }, storage: null,
    buffs: [], perks: null, workDay: null,
    items: ITEMS, monsters: {}, recipes: FUEL_RUNS,
    actionBudget: null, huntOpen: false, caller: 'accrue', callerAuthority: CALLER_AUTHORITY,
    ...over,
  });
}

/* ── T1 ─────────────────────────────────────────────────────────────────── */
function dispatchGuard() {
  const accrued = Object.keys(KIND_ACCRUERS);
  const missing = PAYABLE_KINDS.filter((k) => k !== 'combat' && !accrued.includes(k));
  const orphan = accrued.filter((k) => !PAYABLE_KINDS.includes(k));
  ok(missing.length === 0, `T1: PAYABLE_KINDS names ${missing.join(', ')} with no accruer: a payable kind nothing prices`);
  ok(orphan.length === 0, `T1: KIND_ACCRUERS prices ${orphan.join(', ')}, which PAYABLE_KINDS does not name: a simulation nothing can reach`);
  ok(!PAYABLE_KINDS.includes('gather'), 'T1: gather is payable again: the one-town-work cut took it out (town work is a company\'s jobs)');
  const g = call({ activeKind: 'gather', activeId: 'normal_tree' });
  ok(g.accrued === false && g.reason === SKIP.UNSUPPORTED,
    `T1: a gather pointer answered ${JSON.stringify({ accrued: g.accrued, reason: g.reason })}, not ${SKIP.UNSUPPORTED} (refused, never priced)`);
  ok(POINTER_SKIP_REASONS.includes(SKIP.UNSUPPORTED) && POINTER_SKIP_REASONS.includes(SKIP.NO_RECIPE),
    'T1: an unsupported or unknown-recipe pointer is not a POINTER reason, so a STOP cannot forfeit it and the hero is frozen on it');
}

/* ── T3, T4, T4c ────────────────────────────────────────────────────────── */
function materialGuard() {
  /* Seven bones, an eight-hour window: seven actions, the run ends, the watermark stamps now. */
  const r = call({ inventory: { [FUEL]: 7 } });
  ok(r.accrued === true, `T4: a seven-bone night did not accrue (${r.reason})`);
  if (r.accrued) {
    ok(r.delta.items && r.delta.items[FUEL] === -7, `T3: seven bones in the bag, the delta burnt ${JSON.stringify(r.delta.items)}`);
    ok(r.summary.ticks === 7, `T4: the run made ${r.summary.ticks} actions from seven bones`);
    ok(r.delta.activity && r.delta.activity.kind === 'idle', `T4: the run ran dry and kept its pointer (${JSON.stringify(r.delta.activity)})`);
    ok(Date.parse(r.delta.accrued_to) === FROM_MS + 8 * HOUR, `T4: a stopped run stamped ${r.delta.accrued_to}, not now`);
    ok(r.delta.journal.meta.stopped === 'supplies' && r.delta.journal.meta.out_of === FUEL,
      `T4: the journal says ${JSON.stringify({ stopped: r.delta.journal.meta.stopped, out_of: r.delta.journal.meta.out_of })}, not supplies / ${FUEL}`);
    ok(r.delta.xp && r.delta.xp.inner_flame > 0, `T4: the worked time paid no Inner Flame XP (${JSON.stringify(r.delta.xp)})`);
  }
  /* No fuel at all: nothing to pay, and the pointer still clears. */
  const z = call({ inventory: {} });
  ok(z.accrued === true && z.delta.activity && z.delta.activity.kind === 'idle' && !z.delta.items,
    `T4: an empty bag answered ${JSON.stringify({ accrued: z.accrued, reason: z.reason, activity: z.delta && z.delta.activity })}: the pointer must clear`);
  /* The last bone ends the run in THAT settle: a window just long enough for the thirtieth action (thirty, so the
     window clears the 15 s town floor). */
  const step = r.accrued ? r.tickMs : 640;
  const exact = call({ inventory: { [FUEL]: 30 }, nowMs: FROM_MS + 30 * step + 1 });
  ok(exact.accrued === true && exact.delta.activity && exact.delta.activity.kind === 'idle' && exact.summary.ticks === 30,
    `T4c: the window that burnt the last bone left the run going (${JSON.stringify({ ticks: exact.summary && exact.summary.ticks, activity: exact.delta && exact.delta.activity })})`);
  /* The bag first, then Storage; never more than both hold. */
  const s = call({ inventory: { [FUEL]: 3 }, storage: { [FUEL]: 4 } });
  ok(s.accrued && s.delta.items[FUEL] === -7 && s.summary.ticks === 7,
    `T3: three in the bag and four in Storage burnt ${JSON.stringify(s.delta && s.delta.items)} over ${s.summary && s.summary.ticks} actions, not 7`);
  const sOnly = call({ inventory: {}, storage: { [FUEL]: 5 } });
  ok(sOnly.accrued && sOnly.delta.items[FUEL] === -5, `T3: five in Storage alone burnt ${JSON.stringify(sOnly.delta && sOnly.delta.items)}`);
  /* A storage the server does not offer (null) is not a pool. */
  const noS = call({ inventory: { [FUEL]: 2 }, storage: null });
  ok(noS.accrued && noS.delta.items[FUEL] === -2, `T3: with no Storage switch the run burnt ${JSON.stringify(noS.delta && noS.delta.items)} from a bag of 2`);
}

/* ── T5 ─────────────────────────────────────────────────────────────────── */
function benchGoneGuard() {
  const want = HEARTH_FUELS.map((f) => fuelRecipeId(f.item)).sort();
  const got = Object.keys(FUEL_RUNS).sort();
  ok(JSON.stringify(got) === JSON.stringify(want), `T5: FUEL_RUNS [${got.join(', ')}] is not one run a Hearth fuel [${want.join(', ')}]`);
  for (const [id, e] of Object.entries(FUEL_RUNS)) {
    ok(e.skill === 'inner_flame' && !e.recipe.output, `T5: ${id} is not an output-less Inner Flame run`);
  }
  /* The index refuses a bench row whatever the data still holds. */
  const idx = indexFuelRuns({ smithing: [{ id: 'smelt_bronze', input: 'copper_ore', output: 'bronze_bar', xp: 6, ms: 2400 }],
    crafting: [{ id: 'fuel_kiln', input: 'coal', output: null, xp: 9, ms: 1 }],
    inner_flame: [{ id: 'fuel_bones', input: 'bones', output: null, xp: 40, ms: 400 }, { id: 'cook_x', input: 'x', output: 'y', xp: 1, ms: 1 },
      { id: 'burn_scrap', input: 'scrap', output: null, xp: 1, ms: 1 }] });
  ok(Object.keys(idx).join() === 'fuel_bones', `T5: indexFuelRuns took ${Object.keys(idx).join(', ')} from a bench, not fuel_bones alone`);
  const benchIds = Object.values(ARTISAN_RECIPES || {}).flat().map((r) => r && r.id).filter((id) => id && !FUEL_RUNS[id]);
  for (const id of ['forge_iron_platebody', ...benchIds.slice(0, 3)]) {
    const r = call({ activeId: id, inventory: { copper_ore: 1000, [FUEL]: 1000 } });
    ok(r.accrued === false && r.reason === SKIP.NO_RECIPE, `T5: a pointer on the bench recipe '${id}' answered ${JSON.stringify({ accrued: r.accrued, reason: r.reason })}, not ${SKIP.NO_RECIPE}`);
  }
}

/* ── T7 ─────────────────────────────────────────────────────────────────── */
const DELTA_KEYS = ['accrued_to', 'journal', 'items', 'xp', 'xp_frac', 'activity', 'work_to', 'active_left'];
function shapeGuard() {
  const r = call({ inventory: { [FUEL]: 50 }, xpFrac: { inner_flame: 0.25 }, workDay: { dayMs: 0, usedMs: 0, baseMs: 8 * HOUR, extraMs: 0, todayMs: 0 } });
  ok(r.accrued, `T7: the shape fixture did not accrue (${r.reason})`);
  if (!r.accrued) return;
  const stray = Object.keys(r.delta).filter((k) => !DELTA_KEYS.includes(k));
  ok(stray.length === 0, `T7: the fuel delta proposes ${stray.join(', ')}, which a fuel run has no business writing`);
  ok(r.delta.journal.kind === 'craft', `T7: the ledger kind is '${r.delta.journal.kind}' (player_ledger_kind_check admits craft, not artisan)`);
  for (const [k, v] of Object.entries(r.delta.journal.meta)) {
    ok(v === null || ['string', 'number', 'boolean'].includes(typeof v), `T7: journal meta '${k}' is not a scalar (${JSON.stringify(v)})`);
  }
  for (const [k, v] of Object.entries({ ...r.delta.items, ...r.delta.xp })) ok(Number.isInteger(v), `T7: '${k}' moves by a non-integer ${v}`);
  ok(r.delta.journal.meta.recipe === RUN && r.delta.journal.meta.skill === 'inner_flame',
    `T7: the journal names ${r.delta.journal.meta.recipe}/${r.delta.journal.meta.skill}: the Hearth's day (1043-hearthrise.sql) reads them`);
  /* The bench's old inputs are inert: the same window with each forged reads the same. */
  const base = JSON.stringify(call({ inventory: { [FUEL]: 50 } }).delta);
  for (const forged of [{ unlockedRecipes: { x: true } }, { benchTax: { now_mg: 1, rows: {} } }, { jobEnds: true },
    { bagCap: 1 }, { nodes: { fuel_bones: { skill: 'mining', node: { id: 'fuel_bones', xp: 9999, ms: 1 } } } }, { toolCarry: { inner_flame: 0.99 } }]) {
    ok(JSON.stringify(call({ inventory: { [FUEL]: 50 }, ...forged }).delta) === base,
      `T7: the cut input ${Object.keys(forged)[0]} reached the engine and moved the delta`);
  }
}

/* ── T8 ─────────────────────────────────────────────────────────────────── */
function ladderGuard() {
  const r = call();
  ok(r.accrued, `T8: the ladder fixture did not accrue (${r.reason})`);
  if (!r.accrued) return;
  const step = degradeStep(r, 1);
  ok(step && step.actionBudget === Math.floor(r.summary.ticks / 2) && step.capMs === r.grantMs,
    `T8: a fuel window degrades by ${JSON.stringify(step && step.report)}: the ACTIONS must halve and the span stay (a bag-bound night halved in time pays the same)`);
  const half = call({ actionBudget: step ? step.actionBudget : 1 });
  ok(half.accrued && half.summary.ticks === step.actionBudget && !half.delta.activity,
    `T8: a budget of ${step && step.actionBudget} ran ${half.summary && half.summary.ticks} actions and ${half.delta && half.delta.activity ? 'ENDED the run' : 'kept the pointer'}: a budget is the ladder's, not the hero's stop`);
  const forged = call({ actionBudget: 1e12 });
  ok(forged.accrued && forged.summary.ticks === r.summary.ticks, `T8: a forged budget of 1e12 ran ${forged.summary && forged.summary.ticks} actions, not the window's ${r.summary.ticks}`);
  const nan = call({ actionBudget: 'x' });
  ok(nan.accrued && nan.summary.ticks === r.summary.ticks, 'T8: a non-finite budget is not "no cap"');
}

/* ── T9 ─────────────────────────────────────────────────────────────────── */
function countGuard() {
  /* BURN ONE: a thousand bones, eight hours, a count of one: one bone, the run over, 0 left. */
  const one = call({ inventory: { [FUEL]: 1000 }, activeLeft: 1, jobEnds: true });
  ok(one.accrued && one.delta.items[FUEL] === -1 && one.summary.ticks === 1,
    `T9: "Burn one" burnt ${JSON.stringify(one.delta && one.delta.items)} over ${one.summary && one.summary.ticks} actions: the count is the whole stack's only protection`);
  if (one.accrued) {
    ok(one.delta.activity && one.delta.activity.kind === 'idle' && one.delta.active_left === 0,
      `T9: a counted-out run answered ${JSON.stringify({ activity: one.delta.activity, active_left: one.delta.active_left })}, not idle with 0 left`);
    ok(one.delta.journal.meta.stopped === 'count' && one.delta.journal.meta.n === 1 && one.delta.journal.meta.left === 0 && one.delta.journal.meta.out_of === null,
      `T9: the journal says ${JSON.stringify(one.delta.journal.meta)}, not a count of one reached`);
    ok(Date.parse(one.delta.accrued_to) === FROM_MS + 8 * HOUR, `T9: a counted-out run stamped ${one.delta.accrued_to}, not now`);
  }
  /* A database that takes no `active_left` beside an idle (before 1026) is never sent one. */
  const old = call({ inventory: { [FUEL]: 1000 }, activeLeft: 1, jobEnds: false });
  ok(old.accrued && old.delta.items[FUEL] === -1 && !('active_left' in old.delta), 'T9: a database without the job end was sent active_left beside idle (hr_apply: bad_delta)');
  /* HOWEVER THE SETTLES ARE CUT: a 100-action run settled in windows of 37 actions burns 100, counting down. */
  const step = one.accrued ? one.tickMs : 640;
  let left = 100; let burnt = 0; let from = FROM_MS; let ended = false; const lefts = [];
  for (let i = 0; i < 6 && !ended; i++) {
    const to = from + 37 * step;
    const w = call({ inventory: { [FUEL]: 1000 - burnt }, activeLeft: left, jobEnds: true, accruedToMs: from, nowMs: to });
    if (!w.accrued) { ok(false, `T9: window ${i} of a counted run did not accrue (${w.reason})`); break; }
    burnt += -(w.delta.items && w.delta.items[FUEL]) || 0;
    ended = !!w.delta.activity;
    ok(!('active_left' in w.delta) || w.delta.active_left <= left, `T9: window ${i} raised the count ${left} -> ${w.delta.active_left}`);
    ok('active_left' in w.delta, `T9: window ${i} of a counted run proposed no countdown: the next window burns the whole count again`);
    left = w.delta.active_left; lefts.push(left);
    from = Date.parse(w.delta.accrued_to);
  }
  ok(burnt === 100 && ended && JSON.stringify(lefts) === '[63,26,0]', `T9: a run of 100 cut in windows burnt ${burnt} (left ${JSON.stringify(lefts)}, ended ${ended})`);
  /* The fuel ends it first: the run stops on supplies and says what it left. */
  const dry = call({ inventory: { [FUEL]: 7 }, activeLeft: 20, jobEnds: true });
  ok(dry.accrued && dry.delta.items[FUEL] === -7 && dry.delta.active_left === 13 && dry.delta.journal.meta.stopped === 'supplies',
    `T9: seven bones under a count of 20 answered ${JSON.stringify(dry.delta && { items: dry.delta.items, left: dry.delta.active_left, stopped: dry.delta.journal.meta.stopped })}`);
  /* The degrade ladder's budget and the count: the smaller binds, and a budget stop still keeps the pointer. */
  const both = call({ inventory: { [FUEL]: 1000 }, activeLeft: 50, jobEnds: true, actionBudget: 20 });
  ok(both.accrued && both.summary.ticks === 20 && !both.delta.activity && both.delta.active_left === 30,
    `T9: a budget of 20 under a count of 50 ran ${both.summary && both.summary.ticks} and answered ${JSON.stringify(both.delta && { activity: both.delta.activity, left: both.delta.active_left })}`);
  /* THE CHAIN'S CARRIER (a shadow chain, where the database is not the carrier): the next window caps at what this one left. */
  const carrier = (out) => { const c = { skills: {}, inventory: {}, activeLeft: 50 }; advance(c, out); return c.activeLeft; };
  ok(carrier(both) === 30 && carrier(one) === null, `T9: the tick's carrier holds ${carrier(both)} then ${carrier(one)}, not 30 then no count`);
  /* What is not a whole positive number is no count. */
  const free = JSON.stringify(call({ inventory: { [FUEL]: 50 } }).delta);
  for (const bad of [null, undefined, 0, -1, 1.5, '3', NaN, {}]) {
    ok(JSON.stringify(call({ inventory: { [FUEL]: 50 }, activeLeft: bad }).delta) === free, `T9: a count of ${String(bad)} moved the window`);
  }
}

/* ── T10 ────────────────────────────────────────────────────────────────── */
async function floorGuard() {
  ok(accrueFloorMs('artisan') === TOWN_SETTLE_MIN_MS && TOWN_SETTLE_MIN_MS === HUNT_SETTLE_MIN_MS,
    `T10: the town floor is ${accrueFloorMs('artisan')} ms (TOWN_SETTLE_MIN_MS ${TOWN_SETTLE_MIN_MS}, the hunt's ${HUNT_SETTLE_MIN_MS}): one player-door fuse`);
  const short = call({ nowMs: FROM_MS + TOWN_SETTLE_MIN_MS - 1 });
  ok(short.accrued === false && short.reason === SKIP.TOO_SOON, `T10: a window under the floor answered ${short.reason}`);
  const a = call({ nowMs: FROM_MS + TOWN_SETTLE_MIN_MS });
  const b = call({ nowMs: FROM_MS + TOWN_SETTLE_MIN_MS });
  ok(a.accrued && JSON.stringify(a.delta) === JSON.stringify(b.delta), 'T10: one window asked twice proposed two different deltas');
  const key = (o) => intentIdFor({ user: 'u', slot: 0, watermark: new Date(FROM_MS).toISOString(), version: 7, salt: 's', attempt: 0, ...o });
  ok(await key({}) === await key({}), 'T10: the derived intent key is not a function of the window');
}

/* ── T11 ────────────────────────────────────────────────────────────────── */
function workDayGuard() {
  /* One hour of work left today: an eight-hour window is cut there and the run ends work_cap. */
  const dayMs = Math.floor(FROM_MS / 86400000) * 86400000;
  const w = { dayMs, usedMs: 7 * HOUR, baseMs: 8 * HOUR, extraMs: 0, todayMs: dayMs };
  const r = call({ workDay: w });
  ok(r.accrued && r.delta.activity && r.delta.activity.kind === 'idle' && r.delta.journal.meta.stopped === 'work_cap',
    `T11: the day's end did not end the run (${JSON.stringify({ activity: r.delta && r.delta.activity, stopped: r.delta && r.delta.journal.meta.stopped })})`);
  ok(r.accrued && r.grantMs <= HOUR && Date.parse(r.delta.work_to) <= FROM_MS + HOUR,
    `T11: the window ran ${r.grantMs} ms and its work ended at ${r.delta && r.delta.work_to}, past the hour the day had left`);
  ok(!('work_to' in call().delta), 'T11: a database without the work day (workDay null) was asked for work_to');
}

export async function runAll() {
  problems.length = 0;
  dispatchGuard();
  materialGuard();
  benchGoneGuard();
  shapeGuard();
  ladderGuard();
  countGuard();
  await floorGuard();
  workDayGuard();
  ok(typeof simulateFuelSpan === 'function' && simulateFuelSpan.length >= 2, 'artisan: simulateFuelSpan is not the two-argument span function');
  return problems.slice();
}

/* ══════════════════════════════════════════════════════════════════════════
   THE MUTATION CATALOGUE (`--selftest`): each entry plants a REAL defect in the real file (one exact anchor, CRLF
   tolerated), re-runs this guard in a child process (the ESM cache makes an in-process re-import useless), and restores
   the file through tests/mutation-safety.mjs (every exit path, a signal included, verified by hash). A mutation the
   guard does not turn red SLIPPED, and the run exits 1.
   ══════════════════════════════════════════════════════════════════════════ */
const FN = 'supabase/functions/hr-accrue';
export const MUTATIONS = [
  { id: 'M1', arm: 'T3', why: 'the fuel is never debited from the pool: an endless pile, and a delta hr_apply refuses insufficient_item',
    file: `${FN}/accrue-artisan.js`, from: '      supply[id] = have - take;\n', to: '' },
  { id: 'M2', arm: 'T4', why: 'a run that ran dry keeps its pointer (the town body stands "Fueling" forever)',
    file: `${FN}/accrue-artisan.js`, from: '  const stopped = summary.stoppedBy === FUEL_STOP.SUPPLIES || counted;', to: '  const stopped = counted;' },
  { id: 'M3', arm: 'T4c', why: 'the action that burnt the last fuel does not end the run (report #68)',
    file: 'src/core/artisan-sim.js', from: '        /* THE ACTION THAT BURNT THE LAST FUEL ENDS THE RUN (report #68), on every path. */\n        if (outOfFuel()) return done;\n',
    to: '        /* THE ACTION THAT BURNT THE LAST FUEL ENDS THE RUN (report #68), on every path. */\n' },
  { id: 'M4', arm: 'T3', why: 'Storage is not in the pool: a Burn all of the bag and Storage stops at the bag',
    file: `${FN}/accrue-artisan.js`, from: '  for (const id in storage0) supply[id] = (supply[id] || 0) + storage0[id];\n', to: '' },
  { id: 'M5', arm: 'T5', why: 'the fuel index admits any row: a bench recipe is priced again',
    file: 'src/core/artisan-sim.js', from: "  return skill === FUEL_SKILL && !!recipe && typeof recipe.id === 'string' && /^fuel_[a-z0-9_]+$/.test(recipe.id)",
    to: "  return !!recipe && typeof recipe.id === 'string' && (true || /^fuel_[a-z0-9_]+$/.test(recipe.id))" },
  { id: 'M6', arm: 'T1', why: 'gather is payable again with no accruer',
    file: `${FN}/accrual-contract.js`, from: "export const PAYABLE_KINDS = Object.freeze(['combat', 'artisan']);", to: "export const PAYABLE_KINDS = Object.freeze(['combat', 'gather', 'artisan']);" },
  { id: 'M7', arm: 'T8', why: 'the ladder halves a fuel window\'s span, not its actions (a bag-bound night halved pays the same)',
    file: `${FN}/accrual.js`, from: "  if (kind === 'craft') {", to: "  if (kind === 'craft_x') {" },
  { id: 'M8', arm: 'T10', why: 'the town floor reverts to a minute',
    file: `${FN}/accrual-window.js`, from: "  return activeKind === 'artisan' ? TOWN_SETTLE_MIN_MS : ACCRUE_MIN_MS;", to: '  return ACCRUE_MIN_MS;' },
  { id: 'M9', arm: 'T8', why: 'a budget stop ends the run (the ladder idles the hero)',
    file: `${FN}/accrue-artisan.js`, from: '  const runOver = stopped || workEnd;', to: "  const runOver = stopped || workEnd || summary.stoppedBy === FUEL_STOP.BUDGET;" },
  { id: 'M10', arm: 'T7', why: 'the journal is filed as artisan (player_ledger_kind_check refuses it: the night is lost)',
    file: `${FN}/accrue-artisan.js`, from: "      kind: 'craft',", to: "      kind: 'artisan'," },
  { id: 'M11', arm: 'T11', why: 'the work day no longer ends a run that reached its end',
    file: `${FN}/accrue-artisan.js`, from: '  const workEnd = span.workCapped === true && !stopped;', to: '  const workEnd = false;' },
  { id: 'M13', arm: 'T9', why: 'the run\'s count is not read: "Burn one" burns the whole stack',
    file: `${FN}/accrue-artisan.js`, from: '    maxActions: runCap(inp.actionBudget, left0),', to: '    maxActions: inp.actionBudget,' },
  { id: 'M14', arm: 'T9', why: 'a counted-out run keeps its pointer: the next settle burns the count again',
    file: `${FN}/accrue-artisan.js`, from: '  const stopped = summary.stoppedBy === FUEL_STOP.SUPPLIES || counted;', to: '  const stopped = summary.stoppedBy === FUEL_STOP.SUPPLIES;' },
  { id: 'M15', arm: 'T9', why: 'a run short of its count proposes no countdown: every window burns the whole count',
    file: `${FN}/accrue-artisan.js`, from: 'if (left1 !== null && ((runOver && inp.jobEnds === true) || (!runOver && left1 < left0))) delta.active_left = left1;', to: ';' },
  { id: 'M17', arm: 'T9', why: 'the tick\'s carrier forgets the count: a chained window burns the whole count again',
    file: `${FN}/tick-shadow.js`, from: "  if (typeof d.active_left === 'number') char.activeLeft = d.active_left > 0 ? d.active_left : null;\n", to: '' },
  { id: 'M16', arm: 'T9', why: 'the job end is proposed to a database that refuses it (hr_apply: bad_delta, the window is lost)',
    file: `${FN}/accrue-artisan.js`, from: '((runOver && inp.jobEnds === true) ||', to: '(runOver ||' },
  /* The door's catalogue answer and the accruer's own are one rule in two layers (either alone refuses): the mutant
     takes both, and the window is then answered nothing_accrued, a SAFE reason a switch confiscates. */
  { id: 'M12', arm: 'T5', why: 'an artisan pointer on a cut bench recipe is answered nothing (a switch confiscates it) instead of refused',
    file: `${FN}/accrual.js`, from: "  if (inp.activeKind === 'artisan' && !catalogueHas(inp.recipes || {}, inp.activeId)) {", to: '  if (false) {',
    also: [{ file: `${FN}/accrue-artisan.js`, from: '  if (summary.stoppedBy === FUEL_STOP.UNKNOWN_RECIPE) return { accrued: false, reason: SKIP.NO_RECIPE, summary };\n', to: '' }] },
];

async function selftest() {
  const { readFileSync, writeFileSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { snapshot, assertNoResidue, noteDirtyTree, finish } = await import('./mutation-safety.mjs');
  const self = fileURLToPath(import.meta.url);
  const sites = (m) => [{ file: m.file, from: m.from, to: m.to }, ...(m.also || [])];
  assertNoResidue(MUTATIONS.flatMap(sites));
  noteDirtyTree([...new Set(MUTATIONS.flatMap(sites).map((x) => x.file))]);
  const clean = spawnSync(process.execPath, [self], { encoding: 'utf8' });
  if (clean.status !== 0) { console.log(`HARNESS: the UNMUTATED guard is red:\n${String(clean.stdout).slice(0, 600)}`); finish(2); }
  console.log('  clean baseline: green unmutated');
  let slipped = 0;
  for (const m of MUTATIONS) {
    const origs = new Map();
    let bad = null;
    for (const x of sites(m)) {
      if (!origs.has(x.file)) origs.set(x.file, snapshot(x.file));
      const text = readFileSync(x.file, 'utf8').replace(/\r\n/g, '\n');
      const hits = text.split(x.from).length - 1;
      if (hits !== 1) { bad = `${x.file} matched ${hits}x`; break; }
      writeFileSync(x.file, text.replace(x.from, () => x.to), 'utf8');
    }
    const r = bad ? { status: 0, stdout: '' } : spawnSync(process.execPath, [self], { encoding: 'utf8' });
    for (const [file, orig] of origs) writeFileSync(file, orig, 'utf8');
    if (bad) { console.log(`ANCHOR-FAIL ${m.id}: ${bad}`); slipped++; continue; }
    const out = String(r.stdout || '') + String(r.stderr || '');
    const caught = r.status !== 0 && new RegExp(`\\b${m.arm}\\b`).test(out);
    if (!caught) slipped++;
    console.log(`  ${caught ? 'CAUGHT ' : 'SLIPPED'} ${m.id} (${m.arm}) ${m.why}`);
    if (!caught) console.log(`            exit ${r.status}: ${out.split('\n').filter((l) => l.includes('x ')).slice(0, 2).join(' | ').slice(0, 200)}`);
  }
  if (slipped) { console.log(`\n${slipped} mutation(s) SLIPPED.`); finish(1); }
  console.log(`\nall ${MUTATIONS.length} mutations CAUGHT.`);
  finish(0);
}

if (isMain(import.meta.url) && process.argv.includes('--selftest')) {
  await selftest();
} else if (isMain(import.meta.url)) {
  const found = await runAll();
  if (found.length) {
    console.log('Artisan accrual guard — FAILED:');
    for (const p of found) console.log('  x ' + p);
    process.exit(1);
  }
  const r = call();
  console.log('Artisan accrual guard — the Hearth\'s fuel run: the fuel is the server\'s, running dry ends the run, no bench '
    + `row is priced, the shape is hr_apply's. fuel_bones over 8 h: ${r.summary.ticks} actions at ${r.tickMs} ms, `
    + `${JSON.stringify(r.delta.xp)}.`);
}
