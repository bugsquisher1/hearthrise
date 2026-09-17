// ============================================================================
// tests/settle-carry-loss.mjs — HOW MUCH OF AN ATTENDED SESSION THE SETTLE
// CADENCE THROWS AWAY.
//
// MEASUREMENT LANE, REPORT-ONLY. Headless, fixtures only, no network, no
// Supabase client, no production read. Prints a table and exits 0.
//
// ⚠ STATUS, 2026-09-16: THE DEFECT THIS FILE PRICED IS FIXED. `computeAccrual`
//   now advances `accrued_to` to the last instant the simulation ACCOUNTED FOR
//   (`settledWatermarkMs`), so the remainder is deferred rather than destroyed,
//   and the columns below read ~0 on a tree that is working. The claim section
//   that follows is preserved AS THE DIAGNOSIS — the arithmetic it describes is
//   still what the engines do; what changed is that the edge no longer throws
//   the remainder away. The INVARIANT is enforced by the sibling
//   tests/settle-carry-defer.mjs, whose `--mutate` arm restores the old `now()`
//   watermark and reprints these numbers as a proof that it can still be red.
//
// ── THE CLAIM UNDER TEST ────────────────────────────────────────────────────
// `simulateSpan` (src/core/combat-sim.js:540) opens every call with
// `let carryMs = 0;` and budgets each UTC segment as
// `seg.ms * rate + carryMs` → `floor(budget / tickMs)` ticks (combat-sim.js
// :689-691). The remainder rides across a MIDNIGHT boundary because the
// segment loop is inside ONE call — but it is a call-local, so it cannot ride
// across a CALL boundary. Meanwhile `computeAccrual` advances the watermark to
// the full end of the window unconditionally
// (`accrued_to: new Date(nowMs).toISOString()`, accrual.js:2480) — so the
// discarded remainder is not deferred, it is FORFEITED.
//
// The live client settles attended combat on a 90 s cadence
// (`SETTLE_INTERVAL_MS = 90000`, src/net/accrue.js:5138; `decideSettle`
// :5227-5264), so a 4-hour attended session is ~160 calls, each forfeiting its
// own sub-tick remainder.
//
// ── THE THREE ARMS ──────────────────────────────────────────────────────────
//   continuous  ONE computeAccrual over the whole span. The ideal.
//   windowed    the span as N wall-clock 90 s windows, chained through the
//               checkpoints the delta actually carries (fight / hp /
//               consec_falls / recovering_until / ammo_carry / tool_carry).
//               This is what the live client does today.
//   threaded    (--mutate) the SAME N windows, but each window's end snapped
//               DOWN to a whole `tickMs` from the session anchor, so the
//               remainder is left UNSETTLED rather than forfeited and the next
//               window starts where this one ended. This is the local,
//               non-shipping wrapper that proves the loss is the carry and
//               nothing else. `combat-sim.js` is NOT touched: it is SHA-pinned
//               and repacked into the edge by tools/pack-edge.mjs.
//
// ⚠ WHY THE MUTATE ARM HOLDS THE SEED STILL. Production labels the stream by
//   the watermark (`hr_seed(user, slot, 'accrue:'||accrued_to)`, index.ts), so
//   moving a window boundary also moves its PRNG stream — which would mix the
//   carry loss with the (separately known, WORLD_TICK_DESIGN.md §11) stream
//   decomposition problem. The threaded arm therefore labels each window by its
//   NOMINAL ordinal instant, so arm 2 and arm 3 draw byte-identical streams per
//   window and the ONLY variable is whether the remainder survived.
//
// ── WHAT IS DELIBERATELY NOT CLAIMED ────────────────────────────────────────
// `continuous` vs `windowed` on VALUE (gold/drops) is confounded: the two arms
// draw different streams. Only the TICK column is a clean comparison against
// `continuous`. The clean VALUE comparison is `windowed` vs `threaded`.
// ============================================================================

import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { sliceSpan } from '../src/core/skill-sim.js';
import { hashSeed } from '../src/core/rng.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const CATALOGUES = { items: ITEMS, monsters: MONSTERS };

/* The real client cadence, quoted not retyped-by-guess: src/net/accrue.js:5138
   `export const SETTLE_INTERVAL_MS = 90000;`. Kept as a local constant because
   accrue.js is a browser module with `?v=` imports and cannot be imported in
   Node; `--cadence=` overrides it for sensitivity runs. */
const SETTLE_INTERVAL_MS = 90000;
const SPAN_MS = 4 * 3600000;               // "a 4-hour attended session"

/* A fixed, arbitrary wall-clock start that is NOT near a UTC midnight, so the
   `utcDaySegments` split inside a single call does not itself appear in the
   measurement. 2026-09-16T04:00:00Z + 4h ends at 08:00Z. */
const T0 = Date.parse('2026-09-16T04:00:00.000Z');

// ── FIXTURES ────────────────────────────────────────────────────────────────
// The sibling lane's three (services/world-tick/fixtures/characters.json in
// worktree agent-a46a5a00), reproduced here so this test stands alone on this
// branch, PLUS a slow-kill and a fast-kill case the brief asks for. Every id is
// validated against src/data below: a fixture naming an item the game no longer
// has does not "still test the engine", it tests a weapon with no speed.
const MAXED = {
  attack: 13034431, strength: 13034431, defense: 13034431, hitpoints: 13034431,
  ranged: 13034431, magic: 13034431, prayer: 13034431,
};

const FIXTURES = [
  {
    name: 'early-game goblin, no food',
    userId: '00000000-0000-4000-8000-000000000001', slot: 0,
    activeKind: 'combat', activeId: 'goblin', capMs: 43200000, seed: 1592269876,
    hp: 60, maxHp: 60, gold: 1234,
    skills: { attack: 30000, strength: 28000, defense: 22000, hitpoints: 26000,
              ranged: 1000, magic: 1000, prayer: 500,
              woodcutting: 4000, mining: 4000, fishing: 4000 },
    inventory: {},
    equipment: { weapon: 'dawn_sword', helmet: 'regent_helm', body: 'slagheart_platebody',
                 pants: 'abyssal_greaves', boots: 'dawn_boots' },
    autoEatEnabled: false,
  },
  {
    name: 'maxed, auto-eat on, slime',
    userId: '00000000-0000-4000-8000-000000000002', slot: 0,
    activeKind: 'combat', activeId: 'slime', capMs: 43200000, seed: 305419896,
    hp: 99, maxHp: 99, gold: 0, skills: { ...MAXED },
    inventory: { hearthbread: 4000 },
    equipment: { weapon: 'dragonfang_pike', helmet: 'regent_helm', body: 'slagheart_platebody',
                 pants: 'abyssal_greaves', boots: 'dawn_boots', gloves: 'choirbone_gauntlets',
                 belt: 'warden_girdle', cape: 'wyrmgilt_mantle' },
    autoEatEnabled: true, autoEatPct: 50, autoEatFood: 'hearthbread',
  },
  {
    name: 'bow user vs rat',
    userId: '00000000-0000-4000-8000-000000000003', slot: 0,
    activeKind: 'combat', activeId: 'rat', capMs: 43200000, seed: 2596069104,
    hp: 40, maxHp: 40, gold: 500,
    skills: { attack: 5000, strength: 5000, defense: 3000, hitpoints: 8000,
              ranged: 60000, magic: 1000, prayer: 0 },
    inventory: {},
    equipment: { weapon: 'duskwood_bow', helmet: 'regent_helm' },
    autoEatEnabled: false,
  },
  {
    /* SLOW KILL. 518 hp: a kill spans many ticks and straddles many 90 s
       windows, which is the case where "the fight in progress is discarded"
       would hurt most if the `fight` checkpoint did not carry it. */
    name: 'slow kill — bronze sword vs iron_colossus',
    userId: '00000000-0000-4000-8000-000000000004', slot: 0,
    activeKind: 'combat', activeId: 'iron_colossus', capMs: 43200000, seed: 77777777,
    hp: 990, maxHp: 990, gold: 0, skills: { ...MAXED },
    inventory: { hearthbread: 9000 },
    /* Maxed defence and the best armour so the character SURVIVES (this fixture
       must measure kill LENGTH, not the recovery ladder), with the game's
       weakest weapon so a 518 hp foe takes many minutes and every kill straddles
       several 90 s settle windows. */
    equipment: { weapon: 'bronze_sword', helmet: 'regent_helm', body: 'slagheart_platebody',
                 pants: 'abyssal_greaves', boots: 'dawn_boots', gloves: 'choirbone_gauntlets',
                 belt: 'warden_girdle', cape: 'wyrmgilt_mantle' },
    autoEatEnabled: true, autoEatPct: 50, autoEatFood: 'hearthbread',
  },
  {
    /* FAST KILL. 9 hp vs a maxed melee character: a kill per swing, so the
       kill count is the tick count and the carry loss is fully visible in
       gold and drops rather than diluted by partial fights. */
    name: 'fast kill — maxed vs rat (9 hp)',
    userId: '00000000-0000-4000-8000-000000000005', slot: 0,
    activeKind: 'combat', activeId: 'rat', capMs: 43200000, seed: 24681357,
    hp: 99, maxHp: 99, gold: 0, skills: { ...MAXED },
    inventory: { hearthbread: 4000 },
    equipment: { weapon: 'dragonfang_pike', helmet: 'regent_helm', body: 'slagheart_platebody',
                 pants: 'abyssal_greaves', boots: 'dawn_boots', gloves: 'choirbone_gauntlets',
                 belt: 'warden_girdle', cape: 'wyrmgilt_mantle' },
    autoEatEnabled: true, autoEatPct: 50, autoEatFood: 'hearthbread',
  },
];

function validateFixtures() {
  const problems = [];
  for (const c of FIXTURES) {
    if (!Object.prototype.hasOwnProperty.call(MONSTERS, c.activeId)) {
      problems.push(`${c.name}: monster "${c.activeId}" is not in src/data/monsters.js`);
    }
    for (const slot of Object.keys(c.equipment || {})) {
      if (!Object.prototype.hasOwnProperty.call(ITEMS, c.equipment[slot])) {
        problems.push(`${c.name}: equipment ${slot}="${c.equipment[slot]}" is not in src/data/items.js`);
      }
    }
    for (const id of Object.keys(c.inventory || {})) {
      if (!Object.prototype.hasOwnProperty.call(ITEMS, id)) problems.push(`${c.name}: item "${id}" missing`);
    }
    if (c.autoEatFood && !Object.prototype.hasOwnProperty.call(ITEMS, c.autoEatFood)) {
      problems.push(`${c.name}: autoEatFood "${c.autoEatFood}" missing`);
    }
  }
  if (problems.length) throw new Error('fixture drift against src/data:\n  - ' + problems.join('\n  - '));
}

// ── THE HARNESS (no production, no writes) ──────────────────────────────────

/* The production seed LABEL SHAPE — `hr_seed(user, slot, 'accrue:'||accrued_to)`
   — reproduced with `hashSeed` over the same label. This test has no server
   secret and must not invent one: it reproduces the property being measured
   (a distinct stream per watermark) and not the one it is not (unpredictability). */
function seedFor(userId, slot, watermarkMs) {
  return hashSeed(String(userId), String(slot), 'accrue:' + new Date(watermarkMs).toISOString());
}

function hydrate(f) {
  const c = JSON.parse(JSON.stringify(f));
  c.accruedToMs = T0;
  c.activeSinceMs = T0;
  c.fight = {};
  c.consecFalls = 0;
  c.recoveringUntilMs = 0;
  c.bestiaryKills = {};
  return c;
}

function callEngine(char, fromMs, toMs, seedMs) {
  return computeAccrual({
    userId: char.userId, slot: char.slot,
    nowMs: toMs, accruedToMs: fromMs, activeSinceMs: char.activeSinceMs,
    activeKind: char.activeKind, activeId: char.activeId, capMs: char.capMs,
    seed: seedFor(char.userId, char.slot, seedMs),
    hp: char.hp, maxHp: char.maxHp, gold: char.gold,
    skills: char.skills, inventory: char.inventory, equipment: char.equipment,
    fight: char.fight, consecFalls: char.consecFalls,
    recoveringUntilMs: char.recoveringUntilMs, bestiaryKills: char.bestiaryKills,
    autoEatEnabled: char.autoEatEnabled, autoEatPct: char.autoEatPct, autoEatFood: char.autoEatFood,
    ammoCarry: char.ammoCarry, toolCarry: char.toolCarry,
    items: CATALOGUES.items, monsters: CATALOGUES.monsters,
  });
}

/* The SHADOW half of hr_apply: assignments only, no clamp, no catalogue, no
   authority. It exists so a chain of windows can carry a character forward
   without a database. If a RULE ever appears here it is a second copy of
   hr_apply and it is wrong. */
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
  if (d.accrued_to) char.accruedToMs = Date.parse(d.accrued_to);
  if (res.summary && res.summary.kills > 0 && char.activeKind === 'combat' && char.activeId) {
    char.bestiaryKills[char.activeId] = (char.bestiaryKills[char.activeId] || 0) + res.summary.kills;
  }
  return char;
}

const ZERO = () => ({ ticks: 0, kills: 0, gold: 0, drops: 0, xp: 0, deaths: 0,
                      calls: 0, grantMs: 0, forfeitMs: 0 });

/* ── THE RNG-FREE METRIC ────────────────────────────────────────────────────
   `grantMs` is the window the engine declared PAID and advanced `accrued_to`
   over. `ticks*tickMs + recoverMs + idleMs` is the part of it the simulation
   actually accounted for (`survivedMs + recoverMs + idleMs === awayMs` is the
   equality combat-sim.js:886 states, modulo the sub-tick remainder). The
   difference is time the player was CHARGED for and never simulated — the
   carry, forfeited. This number does not depend on any die roll, which is why
   it and not gold is the primary measurement.

   ⚠ MINUS `res.deferredMs` SINCE 2026-09-16, AND THAT IS NOT A WEAKENING.
     `computeAccrual` no longer stamps `accrued_to` at `now()` on an uncapped
     window: `settledWatermarkMs` leaves the sub-tick remainder UNSETTLED, so
     the next window's grant contains it and it is simulated then. Time that is
     DEFERRED was not forfeited, and a metric that kept counting it would report
     a loss the player no longer takes — the table would be wrong in exactly the
     direction that gets a correct fix reverted.
     The pre-fix numbers this file was written to show are still printed, by
     `node tests/settle-carry-defer.mjs --mutate`, which re-runs the chain with
     the old `now()` watermark and REQUIRES it to go red. That sibling is the
     GATE; this file stays what it always was, a measurement that exits 0. */
function accumulate(acc, res, tickMs) {
  acc.calls++;
  if (!res || !res.accrued) return acc;
  const s = res.summary || {}; const d = res.delta || {};
  const ticks = Number(s.ticks || 0);
  acc.ticks += ticks;
  acc.kills += Number(s.kills || 0);
  acc.gold += Number(d.gold || 0);
  for (const k of Object.keys(d.items || {})) { const q = Number(d.items[k] || 0); if (q > 0) acc.drops += q; }
  for (const k of Object.keys(d.xp || {})) acc.xp += Number(d.xp[k] || 0);
  acc.deaths += Array.isArray(d.deaths) ? d.deaths.length : 0;
  const grantMs = Number(res.grantMs || 0);
  acc.grantMs += grantMs;
  const accounted = ticks * (Number(res.tickMs) || tickMs || 1)
    + Number(s.recoverMs || 0) + Number(s.idleMs || 0);
  acc.forfeitMs += Math.max(0, grantMs - accounted - Number(res.deferredMs || 0));
  return acc;
}

// ── THE THREE ARMS ──────────────────────────────────────────────────────────

function runContinuous(fixture) {
  const char = hydrate(fixture);
  const res = callEngine(char, T0, T0 + SPAN_MS, T0);
  const tickMs = Number(res.tickMs) || 0;
  return { totals: accumulate(ZERO(), res, tickMs), tickMs };
}

/* Arm 2: the live client. Wall-clock windows at the real settle cadence. */
function runWindowed(fixture, cadenceMs, tickMs) {
  const char = hydrate(fixture);
  const acc = ZERO();
  /* `from` is the character's WATERMARK, not the loop cursor — that is what
     production sends (`accrued_to`), and it is the difference that makes a
     cadence BELOW `ACCRUE_MIN_MS` (60 s) behave correctly: the engine refuses
     the short window (SKIP.TOO_SOON, accrual.js:1348), `accrued_to` does not
     move, and the next call sees the accumulated span. */
  for (let mark = T0; mark < T0 + SPAN_MS; mark += cadenceMs) {
    const to = Math.min(mark + cadenceMs, T0 + SPAN_MS);
    const from = Number(char.accruedToMs) || T0;
    if (to <= from) continue;
    const res = callEngine(char, from, to, from);
    accumulate(acc, res, tickMs);
    advance(char, res);
  }
  return { totals: acc };
}

/* Arm 3 (--mutate): carry threaded through, WITHOUT touching combat-sim.js.
   Threading the remainder forward is exactly equivalent to snapping each
   window's end down to a whole `tickMs` from the session anchor and starting
   the next window there — the remainder is then still UNSETTLED rather than
   forfeited, and the `rate` is 1 on this path (`rateMult`, src/core/away.js:112
   with AWAY_RATE_MULT = 1.00) so the equivalence is exact.
   The seed label stays NOMINAL so both arms draw identical streams per window. */
function runThreaded(fixture, cadenceMs, tickMs) {
  const char = hydrate(fixture);
  const acc = ZERO();
  const snap = (ms) => T0 + Math.floor((ms - T0) / tickMs) * tickMs;
  let cursor = T0;
  for (let k = 0; ; k++) {
    const nominalFrom = T0 + k * cadenceMs;
    const nominalTo = Math.min(nominalFrom + cadenceMs, T0 + SPAN_MS);
    if (nominalFrom >= T0 + SPAN_MS) break;
    const to = snap(nominalTo);
    if (to <= cursor) continue;                      // not a whole tick yet; wait
    const res = callEngine(char, cursor, to, nominalFrom);
    accumulate(acc, res, tickMs);
    advance(char, res);
    /* Only an ACCEPTED window moves the watermark. A window the engine refuses
       (shorter than ACCRUE_MIN_MS) leaves `accrued_to` where it was, so the
       next call sees the accumulated span — the same rule the windowed arm
       follows, and the reason a sub-60 s cadence is not a free lunch. */
    if (res && res.accrued) cursor = to;
  }
  return { totals: acc, unsettledTailMs: (T0 + SPAN_MS) - cursor };
}

// ── GATHER / ARTISAN (question 2) ───────────────────────────────────────────
/* `accrueGather` and `accrueArtisan` do NOT have their own loop: both call
   `sliceSpan` (src/core/skill-sim.js:307), which opens with `let carryMs = 0;`
   at :318 and does `floor(budget / stepMs)` at :332 — the same shape, the same
   call-local. `toolCarry` (skill-sim.js:237-246, artisan-sim.js:185-198) is the
   fractional TOOL-DURABILITY remainder, a different quantity entirely; it is
   persisted (`tool_carry`) and it does not rescue the TIME remainder.
   Measured directly on `sliceSpan`, which is the shared primitive. */
function gatherLikeLoss(stepMs, cadenceMs) {
  const one = sliceSpan(SPAN_MS, { stepMs: () => stepMs, run: (n) => n });
  let windowed = 0;
  for (let from = 0; from < SPAN_MS; from += cadenceMs) {
    const ms = Math.min(cadenceMs, SPAN_MS - from);
    windowed += sliceSpan(ms, { stepMs: () => stepMs, run: (n) => n }).ticks;
  }
  return { stepMs, continuous: one.ticks, windowed, lost: one.ticks - windowed };
}

// ── REPORT ──────────────────────────────────────────────────────────────────
const pct = (lost, base) => (base > 0 ? (100 * lost / base) : 0);
const f2 = (n) => n.toFixed(2);
function row(cells, widths) {
  return cells.map((c, i) => String(c).padEnd(widths[i])).join('  ').replace(/\s+$/, '');
}

function main(argv) {
  validateFixtures();
  const mutate = argv.includes('--mutate');
  const cadArg = argv.find((a) => a.startsWith('--cadence='));
  const cadenceMs = cadArg ? Math.max(1000, Math.floor(Number(cadArg.split('=')[1]) * 1000)) : SETTLE_INTERVAL_MS;

  console.log('settle-carry-loss — 4h attended session, settle cadence '
    + (cadenceMs / 1000) + 's (SETTLE_INTERVAL_MS = ' + (SETTLE_INTERVAL_MS / 1000) + 's)');
  console.log('span ' + new Date(T0).toISOString() + ' → ' + new Date(T0 + SPAN_MS).toISOString()
    + '   (' + Math.ceil(SPAN_MS / cadenceMs) + ' settle calls)');
  console.log('');

  /* TABLE 1 — the carry, isolated. `forfeit%` is RNG-free: it is time the
     engine charged and never simulated. The kills/gold/drops columns compare
     the windowed arm against the SAME-SEED carry-threaded arm, so they are the
     value the carry alone costs. */
  const W = [34, 7, 8, 11, 9, 8, 8, 8];
  console.log('TABLE 1 — the carry, isolated (windowed vs the same windows carry-threaded)');
  console.log(row(['fixture', 'tickMs', 'ticks/w', 'forfeit ms', 'forfeit%', 'kills%', 'gold%', 'drops%'], W));
  console.log('-'.repeat(W.reduce((a, b) => a + b + 2, 0)));

  const results = [];
  for (const f of FIXTURES) {
    const cont = runContinuous(f);
    const tickMs = cont.tickMs;
    const win = runWindowed(f, cadenceMs, tickMs);
    const thr = runThreaded(f, cadenceMs, tickMs);
    const r = { f, cont, win, thr, tickMs };
    results.push(r);
    console.log(row([
      f.name.slice(0, 34), tickMs, f2(cadenceMs / tickMs),
      win.totals.forfeitMs, f2(pct(win.totals.forfeitMs, win.totals.grantMs)) + '%',
      f2(pct(thr.totals.kills - win.totals.kills, thr.totals.kills)) + '%',
      f2(pct(thr.totals.gold - win.totals.gold, thr.totals.gold)) + '%',
      f2(pct(thr.totals.drops - win.totals.drops, thr.totals.drops)) + '%',
    ], W));
  }

  /* TABLE 2 — the whole divergence from one continuous span, which is NOT the
     carry and must not be reported as if it were. Each 90 s window draws its
     own stream (`hr_seed(..., 'accrue:'||accrued_to)`), and on a fixture that
     dies the recovery ladder amplifies one different roll into hours. */
  console.log('');
  console.log('TABLE 2 — windowed vs ONE continuous span (carry + per-watermark re-seeding + death-ladder divergence)');
  const V = [34, 10, 10, 9, 10, 10, 9];
  console.log(row(['fixture', 'cont.ticks', 'win.ticks', 'tick Δ%', 'cont.gold', 'win.gold', 'gold Δ%'], V));
  console.log('-'.repeat(V.reduce((a, b) => a + b + 2, 0)));
  for (const r of results) {
    console.log(row([
      r.f.name.slice(0, 34), r.cont.totals.ticks, r.win.totals.ticks,
      f2(pct(r.cont.totals.ticks - r.win.totals.ticks, r.cont.totals.ticks)) + '%',
      r.cont.totals.gold, r.win.totals.gold,
      f2(pct(r.cont.totals.gold - r.win.totals.gold, r.cont.totals.gold)) + '%',
    ], V));
  }
  console.log('');
  console.log('⚠ TABLE 2 IS NOT A CARRY MEASUREMENT. A negative number here means the windowed');
  console.log('  arm did BETTER than one continuous span — which is only possible because the');
  console.log('  streams differ. Read table 1 for the carry.');

  if (mutate) {
    console.log('');
    console.log('── --mutate: PROOF that the number in table 1 is the carry ──');
    console.log('the same windows, the same per-window seeds, remainder left UNSETTLED');
    console.log('instead of forfeited. combat-sim.js is not touched.');
    console.log('');
    const M = [34, 13, 13, 10, 10];
    console.log(row(['fixture', 'win forfeit', 'thr forfeit', 'thr fft%', 'tail ms'], M));
    console.log('-'.repeat(M.reduce((a, b) => a + b + 2, 0)));
    let worst = 0;
    for (const r of results) {
      const p = pct(r.thr.totals.forfeitMs, r.thr.totals.grantMs);
      worst = Math.max(worst, p);
      console.log(row([r.f.name.slice(0, 34), r.win.totals.forfeitMs, r.thr.totals.forfeitMs,
                       f2(p) + '%', r.thr.unsettledTailMs], M));
    }
    console.log('');
    console.log('worst forfeited fraction with the carry threaded: ' + f2(worst) + '%');
    console.log('(`tail ms` is the deliberately-unsettled remainder at the END of the span,');
    console.log(' < one tickMs, deferred to the next window rather than lost.)');
    if (worst > 0.05) {
      console.log('MUTATE FAILED: threading the carry did not close the gap.');
      return 1;
    }
    console.log('MUTATE OK: threading the carry takes the forfeited time to ~0.');
  }

  /* TABLE 3 — the 2026-09-04 attended-settle measurement, re-priced.
     That was a 3-minute attended goblin fight in a BACKGROUND tab, so the
     settle loop was visibility-gated off (`decideSettle` → 'hidden',
     src/net/accrue.js) and the whole fight settled in ONE call at stop
     (`settleBeforeIntent`, :5445). The server credited 16 of 26 client-shown
     drops (~62%). A single call can forfeit AT MOST one tickMs of carry, so the
     carry can explain at most the fraction printed here. */
  console.log('');
  console.log('── TABLE 3 — the 2026-09-04 shape: a 3-minute attended fight settled in ONE call ──');
  {
    let worst = 0;
    for (const f of FIXTURES) {
      const char = hydrate(f);
      const res = callEngine(char, T0, T0 + 180000, T0);
      const tickMs = Number(res.tickMs) || 0;
      const s = res.summary || {};
      const forfeit = Math.max(0, Number(res.grantMs || 0)
        - (Number(s.ticks || 0) * tickMs + Number(s.recoverMs || 0) + Number(s.idleMs || 0)));
      worst = Math.max(worst, pct(forfeit, 180000));
      console.log('  ' + f.name.slice(0, 34).padEnd(36) + 'tickMs ' + String(tickMs).padEnd(6)
        + 'ticks ' + String(s.ticks).padEnd(5) + 'forfeited ' + String(forfeit).padEnd(6) + 'ms = '
        + f2(pct(forfeit, 180000)) + '%');
    }
    console.log('  worst single-call forfeit over 180 s: ' + f2(worst)
      + '% (the ceiling is one tickMs = ' + f2(pct(2400, 180000)) + '%).');
    console.log('  the carry can therefore explain at most ~1.3% of the ~38% of client-shown');
    console.log('  drops that measurement found missing. It is not that bug.');
  }

  console.log('');
  console.log('── gather / artisan: the SAME call-local carry (skill-sim.js:318 sliceSpan) ──');
  const G = [12, 14, 12, 10, 9];
  console.log(row(['stepMs', 'continuous', 'windowed', 'lost', 'loss%'], G));
  console.log('-'.repeat(G.reduce((a, b) => a + b + 2, 0)));
  /* The REAL node intervals from src/data/gathering.js (TREES / ROCKS /
     FISH_SPOTS `ms`), not invented numbers. A `gather_speed` buff moves the
     interval off these values, which is the case with the largest remainder. */
  for (const stepMs of [3000, 4000, 4200, 4500, 5400, 5500, 6200, 7000]) {
    const g = gatherLikeLoss(stepMs, cadenceMs);
    console.log(row([g.stepMs, g.continuous, g.windowed, g.lost, f2(pct(g.lost, g.continuous)) + '%'], G));
  }
  console.log('');
  console.log('`tool_carry` is the TOOL-DURABILITY remainder (skill-sim.js:237), not the time');
  console.log('remainder, and it does not rescue this. Artisan shares the same primitive');
  console.log('(artisan-sim.js:355 calls sliceSpan), so the class covers all three channels.');
  return 0;
}

const code = main(process.argv.slice(2));
if (code !== 0) process.exit(code);
