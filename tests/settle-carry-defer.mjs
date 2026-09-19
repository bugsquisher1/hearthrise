// ============================================================================
// tests/settle-carry-defer.mjs — THE GATE ON `accrued_to` (2026-09-16).
//
// A GUARD, not a measurement. Its sibling tests/settle-carry-loss.mjs PRICED
// the defect (1.3-1.7% of a 4 h combat session at the live 90 s cadence, up to
// 6.66% on a 7 s gathering node) and its own entry in
// tests/guards-unregistered.json wrote down the succession plan verbatim:
//
//     "If the carry is ever threaded for real … the forfeited-time property
//      becomes a real invariant and THIS FILE'S --mutate arm is the guard to
//      register then."
//
// It has been. `settledWatermarkMs` (supabase/functions/hr-accrue/accrual.js)
// now advances an uncapped window's `accrued_to` to the last instant the
// SIMULATION ACCOUNTED FOR rather than to `now()`, so the sub-tick remainder of
// the action that was in flight when the settle fired is DEFERRED to the next
// window instead of destroyed. This file is that invariant, executed.
//
// ── WHAT IS DIFFERENT FROM THE SIBLING ──────────────────────────────────────
// settle-carry-loss.mjs proves a property of the PRIMITIVE by wrapping it: its
// `threaded` arm snaps window ends outside the engine and never crosses the
// edge's own delta. This file measures THE EDGE PATH — it chains real
// `computeAccrual` calls through the real `delta.accrued_to`, exactly as the
// live settle loop chains them through hr_apply, and asserts on the result.
//
// ── THE CONSERVATION LAW (RNG-free; this is the whole guard) ────────────────
// It is NOT `Σ grantMs == Σ accounted`, and getting that wrong is the obvious
// trap: a deferred millisecond appears in window k's grant AND again in window
// k+1's, so summing grants double-counts exactly the thing under test and a
// working fix still reads as a loss. The law that telescopes is the WATERMARK's
// own travel. For window k over `[mark_k, to_k]`:
//
//     mark_{k+1} − mark_k  ==  accounted_k        for every k
//   ⇒ (mark_final − T0)    ==  Σ accounted        over the chain
//   ⇒ forfeited            ==  (mark_final − T0) − Σ accounted  ==  0
//
// Every millisecond the watermark passes over is a millisecond the simulation
// actually ran, and the only time not covered is the tail still OPEN at the end
// of the span — which is under one tick and is paid by the next window.
//
// No die roll appears in either side. A window that ACCOUNTED for more time
// than its watermark travelled would make this negative, which is the over-pay
// half of the same test: the brief's requirement (3) is one equality, not two
// inequalities.
//
// ── THE FOUR REFUSALS ARE ASSERTED SEPARATELY ───────────────────────────────
// The snap is deliberately NOT universal. D3..D6 below execute each refusal,
// because every one of them is a mint or a stall if it is ever dropped:
//   capped → the b307 per-absence cap becomes drainable in instalments;
//   finalWindow → a collect-before-switch destroys the remainder AND the
//                 pointer (the b531 defect, sign-flipped);
//   stopped-early → a bench that ran out is re-simulated every window forever;
//   attended floor → security condition C6, a kill credit paid twice.
//
// ── --mutate ────────────────────────────────────────────────────────────────
// Re-runs the chain with the watermark forced back to `now()` — i.e. the code
// that shipped before this change — and REQUIRES the conservation law to break.
// A guard that has never been red is not a guard.
//
// Headless, fixtures only. No network, no Supabase client, no production read.
// ============================================================================

import { computeAccrual, settledWatermarkMs } from '../supabase/functions/hr-accrue/accrual.js';
import { hashSeed } from '../src/core/rng.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';
import { TREES } from '../src/data/gathering.js';
/* The SAME derived index index.ts and set-activity.js pass (the A14 rule:
   one derivation, two callers). Importing it rather than rebuilding one here is
   the difference between testing the engine and testing a second catalogue. */
import { GATHER_NODES, ARTISAN_RECIPES_ALL } from '../supabase/functions/hr-accrue/catalogue.js';
import { readFileSync } from 'node:fs';

let fails = 0;
const ok = (id, cond, msg) => {
  if (cond) { console.log(`  ✓ ${id} ${msg}`); return true; }
  fails++; console.log(`  ✗ ${id} ${msg}`); return false;
};

/* The real client cadence: `export const SETTLE_INTERVAL_MS = 90000;`
   (src/net/accrue.js). A browser module with `?v=` imports, so it cannot be
   imported in Node; the sibling keeps the same local constant for the same
   reason and tests/no-new-prediction.mjs reads the file textually — D7 below
   does the same, so the constant here cannot silently drift off the client's. */
const SETTLE_INTERVAL_MS = 90000;
const T0 = Date.parse('2026-09-16T04:00:00.000Z');   // not near a UTC midnight

const MAXED = 13034431;
function baseChar(over) {
  return {
    userId: '00000000-0000-4000-8000-0000000000aa', slot: 0,
    activeKind: 'combat', activeId: 'slime', capMs: 43200000,
    hp: 99, maxHp: 99, gold: 0,
    skills: { attack: MAXED, strength: MAXED, defense: MAXED, hitpoints: MAXED,
              ranged: MAXED, magic: 1000, prayer: 1000,
              woodcutting: MAXED, mining: MAXED, fishing: MAXED },
    inventory: { hearthbread: 50000 },
    equipment: { weapon: 'dragonfang_pike' },
    fight: {}, consecFalls: 0, recoveringUntilMs: 0, bestiaryKills: {},
    autoEatEnabled: true, autoEatPct: 50, autoEatFood: 'hearthbread',
    ...over,
  };
}

function call(char, fromMs, toMs, extra) {
  return computeAccrual({
    userId: char.userId, slot: char.slot,
    nowMs: toMs, accruedToMs: fromMs, activeSinceMs: char.activeSinceMs ?? T0,
    activeKind: char.activeKind, activeId: char.activeId, capMs: char.capMs,
    /* The PRODUCTION seed label: `hr_seed(user, slot, 'accrue:'||accrued_to)`
       (index.ts). Keyed on the window's START, which is why deferring the END
       cannot move a stream — asserted by D8. */
    seed: hashSeed(String(char.userId), String(char.slot),
                   'accrue:' + new Date(fromMs).toISOString()),
    hp: char.hp, maxHp: char.maxHp, gold: char.gold,
    skills: char.skills, inventory: char.inventory, equipment: char.equipment,
    fight: char.fight, consecFalls: char.consecFalls,
    recoveringUntilMs: char.recoveringUntilMs, bestiaryKills: char.bestiaryKills,
    autoEatEnabled: char.autoEatEnabled, autoEatPct: char.autoEatPct,
    autoEatFood: char.autoEatFood,
    ammoCarry: char.ammoCarry, toolCarry: char.toolCarry,
    items: ITEMS, monsters: MONSTERS,
    nodes: GATHER_NODES, recipes: ARTISAN_RECIPES_ALL,
    ...(extra || {}),
  });
}

/* The SHADOW half of hr_apply: assignments only, no clamp, no catalogue, no
   authority. A RULE appearing here would be a second copy of hr_apply and would
   be wrong; this exists only so a chain can carry a character forward without a
   database. Copied in shape from the sibling for exactly that reason. */
function advance(char, res) {
  if (!res || !res.accrued) return char;
  const d = res.delta || {};
  if (typeof d.gold === 'number') char.gold = Math.max(0, Math.floor((char.gold || 0) + d.gold));
  for (const k of Object.keys(d.xp || {})) char.skills[k] = (char.skills[k] || 0) + Number(d.xp[k] || 0);
  for (const k of Object.keys(d.items || {})) {
    const q = (char.inventory[k] || 0) + Number(d.items[k] || 0);
    if (q > 0) char.inventory[k] = q; else delete char.inventory[k];
  }
  if (typeof d.hp === 'number') char.hp = d.hp;
  if (typeof d.fight !== 'undefined') char.fight = d.fight;
  if (typeof d.ammo_carry !== 'undefined') char.ammoCarry = d.ammo_carry;
  if (typeof d.tool_carry !== 'undefined') char.toolCarry = d.tool_carry;
  if (typeof d.consec_falls !== 'undefined') char.consecFalls = d.consec_falls;
  if (typeof d.recovering_until !== 'undefined') {
    char.recoveringUntilMs = d.recovering_until ? Date.parse(d.recovering_until) : 0;
  }
  if (d.activity && d.activity.kind) { char.activeKind = d.activity.kind; char.activeId = d.activity.id; }
  return char;
}

/**
 * Chain a span as the live settle loop chains it: N wall-clock windows, each
 * starting at the character's ACTUAL watermark (what hr_apply just wrote) and
 * ending at the nominal cadence instant.
 *
 * @param mutate when true the watermark is forced to `now()` — the code that
 *               shipped before 2026-09-16. This is the --mutate arm.
 */
function chain(char0, spanMs, cadenceMs, mutate) {
  const char = JSON.parse(JSON.stringify(char0));
  const end = T0 + spanMs;
  let mark = T0;            // the watermark, as the database would hold it
  let grant = 0, accounted = 0, ticks = 0, calls = 0, accepted = 0, stepMs = 0;
  let lastDeferred = 0;
  let minWatermarkGap = Infinity;
  let pastNow = 0;
  for (let k = 0; ; k++) {
    const to = Math.min(T0 + (k + 1) * cadenceMs, end);
    if (to <= mark) { if (to >= end) break; continue; }
    const res = call(char, mark, to);
    calls++;
    if (res && res.accrued) {
      accepted++;
      const step = Number(res.tickMs) || 0;
      stepMs = step;
      const s = res.summary || {};
      grant += Number(res.grantMs || 0);
      accounted += Number(s.ticks || 0) * step + Number(s.recoverMs || 0) + Number(s.idleMs || 0);
      ticks += Number(s.ticks || 0);
      lastDeferred = Number(res.deferredMs || 0);
      const wm = mutate ? to : Date.parse(res.delta.accrued_to);
      if (wm > to) pastNow++;
      minWatermarkGap = Math.min(minWatermarkGap, wm - mark);
      advance(char, res);
      mark = wm;
    }
    if (to >= end) break;
  }
  return {
    grant, accounted, ticks, calls, accepted, lastDeferred, pastNow, stepMs,
    minWatermarkGap,
    openTailMs: end - mark,
    /* THE TELESCOPING LAW — see the header. The watermark's total travel minus
       the time the simulation actually ran. Summing `grantMs` instead would
       double-count every deferred millisecond and read a correct fix as a loss. */
    forfeited: (mark - T0) - accounted,
  };
}

// ── D1/D2: the conservation law on the edge path ────────────────────────────
console.log('settle-carry-defer — the watermark defers the sub-tick carry, it does not forfeit it');
console.log('');
const SPAN_MS = 4 * 3600000;
const CASES = [
  { name: 'combat, dragonfang pike (2328 ms)', over: {} },
  { name: 'combat, bronze sword (2400 ms)', over: { equipment: { weapon: 'bronze_sword' }, activeId: 'goblin' } },
  { name: 'combat, duskwood bow (2112 ms)', over: { equipment: { weapon: 'duskwood_bow' }, activeId: 'rat' } },
];
/* The gather arm uses the WORST remainder in src/data/gathering.js rather than
   an invented number: the node whose interval divides 90 000 least evenly is
   where the defect was largest (settle-carry-loss's 6.66% row). Picked from the
   catalogue so a content change moves the fixture instead of dating it. */
{
  const worst = TREES
    .map((t) => ({ id: t.id, ms: Number(t.ms) || 0 }))
    .filter((t) => t.ms > 0 && t.id)
    .sort((a, b) => (SETTLE_INTERVAL_MS % b.ms) - (SETTLE_INTERVAL_MS % a.ms))[0];
  if (!worst) { fails++; console.log('  ✗ D0 src/data/gathering.js TREES has no node with an interval'); }
  else CASES.push({ name: `gather, ${worst.id} (${worst.ms} ms)`,
                    over: { activeKind: 'gather', activeId: worst.id } });
}
/* The artisan arm, chosen the same way and for the same reason: it is the THIRD
   caller of `sliceSpan` (artisan-sim.js:355) and a fix that covered only two of
   the three channels would be a silent hole in the one that burns inputs.
   Stocked far past what 4 h can consume, so the run never STOPS — a supplies
   stop is D5's case, not this one. */
{
  const cand = Object.entries(ARTISAN_RECIPES_ALL)
    .map(([id, e]) => ({ id, ms: Number(e.recipe && e.recipe.ms) || 0,
                         inputs: (e.recipe && e.recipe.inputs) || null }))
    .filter((r) => r.ms > 0 && r.inputs && Object.keys(r.inputs).length === 1)
    .sort((a, b) => (SETTLE_INTERVAL_MS % b.ms) - (SETTLE_INTERVAL_MS % a.ms))[0];
  if (!cand) { fails++; console.log('  ✗ D0b no single-input artisan recipe in the catalogue'); }
  else {
    const inv = {}; for (const k of Object.keys(cand.inputs)) inv[k] = 1000000;
    CASES.push({ name: `artisan, ${cand.id} (${cand.ms} ms)`,
                 over: { activeKind: 'artisan', activeId: cand.id, inventory: inv } });
  }
}

console.log('D1/D2 — Σgrant == Σaccounted + deferred(last), over a 4 h span at the 90 s cadence');
for (const c of CASES) {
  const r = chain(baseChar(c.over), SPAN_MS, SETTLE_INTERVAL_MS, false);
  const label = `${c.name}: ${r.accepted}/${r.calls} windows, forfeited ${r.forfeited} ms`;
  ok('D1', r.forfeited === 0, `${label} (must be exactly 0)`);
  /* THE OVER-PAY HALF, and it is the same number read the other way. A window
     that accounted for more time than it was granted would make `forfeited`
     NEGATIVE — no channel may be paid for time it was not granted, and the
     equality above is the only place that can be seen without a die roll. */
  ok('D2', r.forfeited >= 0, `${c.name}: no window accounted past its grant`);
  ok('D2b', r.pastNow === 0, `${c.name}: no watermark landed past its own now()`);
  ok('D2c', r.minWatermarkGap > 0, `${c.name}: every accepted window advanced the watermark strictly (min +${r.minWatermarkGap} ms)`);
  /* The tail is UNDER ONE TICK, and that bound is the point: anything larger
     would mean a whole action was deferred rather than the carry, i.e. the snap
     had started eating real work instead of the remainder. */
  ok('D2d', r.openTailMs >= 0 && r.openTailMs < r.stepMs,
     `${c.name}: the span ends with ${r.openTailMs} ms still open (< one ${r.stepMs} ms tick), deferred not lost`);
}

// ── D3..D6: the four refusals ───────────────────────────────────────────────
console.log('');
console.log('D3..D6 — the four cases where the snap is refused BY DESIGN');
{
  // D3 — CAPPED. b307: an over-cap absence forfeits its excess on purpose.
  const now = T0 + 50 * 3600000;                       // far past the 12 h cap
  const r = call(baseChar({}), T0, now);
  ok('D3', r.accrued && Date.parse(r.delta.accrued_to) === now,
     `capped window stamps now() (${r.delta.accrued_to}), so the cap cannot be drained in instalments`);

  /* D4 — THE COLLECT. set-activity.js passes `caller: 'collect'` (it passed
     `finalWindow: true` until 2026-09-18; the boolean was replaced by the
     three-value taxonomy in accrual.js accrualCaller, and this arm is the proof
     the COLLECT's behaviour is byte-identical across that rename). */
  const t = T0 + SETTLE_INTERVAL_MS;
  const fin = call(baseChar({}), T0, t, { caller: 'collect' });
  const acc = call(baseChar({}), T0, t, { caller: 'accrue' });
  ok('D4', fin.accrued && Date.parse(fin.delta.accrued_to) === t,
     'caller=collect (collect-before-switch) still settles to now()');
  ok('D4b', acc.accrued && Number(acc.deferredMs) > 0 && Date.parse(acc.delta.accrued_to) < t,
     `the same window on the accrue verb defers ${acc.deferredMs} ms`);
  /* D4c — THE TICK. The world tick is exempt from ACCRUE_MIN_MS like a collect
     but DEFERS like an accrue, because its next window starts at the watermark
     this one stamps. Borrowing 'collect' for it forfeits the remainder every
     cadence (tests/world-tick-parity.mjs --mutate --callerTick measures it). */
  const tick = call(baseChar({}), T0, t, { caller: 'tick' });
  ok('D4c', tick.accrued && Date.parse(tick.delta.accrued_to) === Date.parse(acc.delta.accrued_to),
     `caller=tick defers identically to accrue (${tick.deferredMs} ms), it does NOT stamp now()`);
  /* D4d — THE FAIL-SAFE. An absent, misspelled or hostile caller must read as
     'accrue': the floor stays on and the remainder is deferred. The direction
     matters — the only caller that LOSES time by being mislabelled is
     'collect', so an unknown value must never fall through to it. */
  for (const bad of [undefined, null, '', 'COLLECT', 'collect ', 'tick\n', 0, 1, true,
                     {}, [], 'accrue', '__proto__', 'constructor']) {
    const r = call(baseChar({}), T0, t, { caller: bad });
    ok('D4d', r.accrued && Date.parse(r.delta.accrued_to) === Date.parse(acc.delta.accrued_to),
       `caller=${JSON.stringify(bad)} settles as 'accrue' (deferred), never as a collect`);
  }
  /* D4e — and the floor moves with it. A 5 s window is below ACCRUE_MIN_MS:
     'accrue' must refuse it (deferred to the next poll), 'collect' and 'tick'
     must price it (neither has a later call that would see a longer span). */
  const shortTo = T0 + 5000;
  ok('D4e', call(baseChar({}), T0, shortTo, { caller: 'accrue' }).accrued === false
         && call(baseChar({}), T0, shortTo, { caller: 'collect' }).accrued === true
         && call(baseChar({}), T0, shortTo, { caller: 'tick' }).accrued === true,
     'ACCRUE_MIN_MS refuses a 5 s window for accrue, exempts collect and tick');
  ok('D4f', call(baseChar({}), T0, shortTo, { caller: 'nonsense' }).accrued === false,
     'an unrecognised caller does NOT buy the floor exemption');

  // D5 — STOPPED EARLY. A bench with no inputs must not be re-simulated forever.
  //     Driven through settledWatermarkMs directly: a summary whose accounted
  //     time is a whole tick short of its grant is a STOP, not a carry.
  const span = { nowMs: t, grantMs: SETTLE_INTERVAL_MS, capped: false };
  const stopped = settledWatermarkMs(span, { ticks: 4 }, 3000, {});   // 12 s of 90 s
  ok('D5', stopped === t,
     'a span the engine stopped early (remainder >= one tick) stamps now(), never re-opens');
  const carried = settledWatermarkMs(span, { ticks: 29 }, 3100, {});  // 89.9 s of 90 s
  ok('D5b', carried === t - 100, `a sub-tick remainder defers exactly it (${t - carried} ms)`);

  // D6 — SECURITY C6. The attended floor: a credit row this settle already ate
  //      may never be newer than the watermark it leaves behind.
  const attTo = t - 200;                               // newest consumed row
  const att = call(baseChar({}), T0, t, {
    attended: { ok: true, kills: { slime: 3 },
                from: new Date(T0 + 1000).toISOString(), to: new Date(attTo).toISOString() },
  });
  ok('D6', att.accrued && Date.parse(att.delta.accrued_to) >= attTo,
     `the watermark is floored at the newest attended row consumed (${att.delta.accrued_to} >= ${new Date(attTo).toISOString()})`);
  ok('D6b', settledWatermarkMs(span, { ticks: 29 }, 3100, { attendedToMs: t - 10 }) === t - 10,
     'the attended floor binds over the carry when it is the later of the two');
}

// ── D9: THE STATED RANGE, EXECUTED (Security review 2026-09-16, F1) ─────────
console.log('');
console.log('D9 — the range the contract header claims, fuzzed rather than asserted');
{
  /* The header claims the return "only ever" lands in `[nowMs - grantMs + 1,
     nowMs]`. That is the whole safety argument: never past `now` (paying for
     time that has not happened) and never at or below the old watermark (hr_apply
     clamps `greatest(old, ...)`, so a non-advancing watermark re-pays the SAME
     span on the next call — a mint, not a loss). A claim that strong is a guard,
     not a comment. `nat()` does not floor, so the hostile set is deliberately
     not integers-only: a fractional `grantMs` below 1 put the strict-advance
     floor ABOVE `nowMs` and returned a FUTURE watermark until the Math.min
     landed. Mutation proof: drop the `Math.min(nowMs, …)` and D9a goes red. */
  const NOW = 1_700_000_000_000;
  const HOSTILE = [0, -1, 1, 0.5, 999.5, NaN, Infinity, -Infinity, 1e18, 2 ** 53,
                   '90000', null, undefined, {}, [], 60_000, 90_000, 43_200_000];
  let past = 0, stalled = 0, nonFinite = 0, n = 0, firstPast = null, firstStall = null;
  for (const g of HOSTILE) for (const st of HOSTILE) for (const tk of HOSTILE) {
    for (const at of HOSTILE) for (const capped of [true, false]) {
      n++;
      const w = settledWatermarkMs({ nowMs: NOW, grantMs: g, capped },
        { ticks: tk, recoverMs: 0, idleMs: 0 }, st, { attendedToMs: at });
      if (!Number.isFinite(w)) { nonFinite++; continue; }
      if (w > NOW) { past++; firstPast = firstPast || { g, st, tk, at, capped, over: w - NOW }; }
      const gN = Number(g);
      if (Number.isFinite(gN) && gN > 0 && !capped && w <= NOW - gN) {
        stalled++; firstStall = firstStall || { g, st, tk, at, w, old: NOW - gN };
      }
    }
  }
  ok('D9a', past === 0,
     `no input pushes the watermark past now (${n} combinations`
     + `${firstPast ? ', e.g. ' + JSON.stringify(firstPast) : ''})`);
  ok('D9b', stalled === 0,
     `the watermark strictly advances on every uncapped window`
     + `${firstStall ? ', broken by ' + JSON.stringify(firstStall) : ''}`);
  ok('D9c', nonFinite === 0, 'the return is always a finite instant');
}

// ── D7/D8: the two facts the fix must not have moved ────────────────────────
console.log('');
console.log('D7/D8 — idempotency and the PRNG stream still key on the window START');
{
  /* The idempotency key and the seed are both derived from `st.accrued_to` —
     the watermark the window STARTS at — so moving where a window ENDS cannot
     move a key or a stream. Asserted TEXTUALLY because the derivation lives in
     a Deno module that imports `npm:`/`jsr:` specifiers and cannot be loaded
     here; the property is "the source still reads the start", and that is a
     fact about the source. */
  const idx = readFileSync(new URL('../supabase/functions/hr-accrue/index.ts', import.meta.url), 'utf8');
  ok('D7', /intentIdFor\(\{[\s\S]{0,200}?watermark:\s*String\(st\.accrued_to\)/.test(idx),
     'index.ts still derives the idempotency key from st.accrued_to (the window START)');
  ok('D7b', /'accrue:'\s*\+\s*String\(st\.accrued_to\)/.test(idx),
     "index.ts still labels the PRNG stream 'accrue:'||st.accrued_to (the window START)");
  ok('D7c', idx.includes('const attendedUpto = new Date(nowMs).toISOString();'),
     'hr_attended_kills is still bounded above by the SERVER now(), never by the watermark');

  /* The ledger row still names the PRICED window, not the watermark: `from` and
     `to` are `credit.fromMs`/`credit.toMs`. A dispute is answerable because row
     N+1's `from` IS where row N's watermark landed — which is what D8 checks by
     execution rather than by reading the comment. */
  const a = call(baseChar({}), T0, T0 + SETTLE_INTERVAL_MS);
  const wm = Date.parse(a.delta.accrued_to);
  const b = call(baseChar({}), wm, T0 + 2 * SETTLE_INTERVAL_MS);
  ok('D8', Date.parse(b.delta.journal.meta.from) === wm,
     'the next ledger row opens exactly where the last watermark landed (the deferral is auditable)');
  ok('D8b', Number(b.grantMs) === 2 * SETTLE_INTERVAL_MS - (Number(a.grantMs) - Number(a.deferredMs)),
     `the deferred ${a.deferredMs} ms is RE-GRANTED by the next window, not re-paid on top of it`);
}

// ── --mutate: the old behaviour must break the law ──────────────────────────
if (process.argv.includes('--mutate')) {
  console.log('');
  console.log('── --mutate: the watermark forced back to now(), i.e. the code that shipped ──');
  let caught = 0;
  for (const c of CASES) {
    const r = chain(baseChar(c.over), SPAN_MS, SETTLE_INTERVAL_MS, true);
    const red = r.forfeited > 0;
    if (red) caught++;
    console.log(`  ${red ? 'caught' : 'MISSED'}  ${c.name}: forfeited ${r.forfeited} ms `
      + `(${(100 * r.forfeited / Math.max(1, r.grant)).toFixed(2)}% of the granted span)`);
  }
  if (caught !== CASES.length) {
    console.log(`✗ MUTATE MISSED: ${CASES.length - caught} case(s) stayed green with the old watermark.`);
    fails++;
  } else {
    console.log(`✓ MUTATE OK: all ${CASES.length} cases go red when accrued_to is stamped at now().`);
  }
}

console.log('');
console.log(fails === 0 ? 'settle-carry-defer: PASS' : `settle-carry-defer: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
