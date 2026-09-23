#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/party-split.mjs — THE PARTY SPLIT IS ARITHMETIC, AND ARITHMETIC IS
//                          PROVABLE (M8 slice S3, 2026-09-23)
//
//   node tests/party-split.mjs            the guard
//   node tests/party-split.mjs --mutate   ten source mutants, each must go RED
//                                         by its own NAMED property
//
// ── WHAT THIS GUARDS ────────────────────────────────────────────────────────
// src/core/party-split.js decides who is paid what out of a party window.
// docs/planning/WORLD_TICK_DESIGN.md §18-SEC.3 rules that the slice's §4
// self-check IS this file — *"the split is a pure function, so its self-check is
// in tests/party-split.mjs --mutate; the migration half has no body"* — so this
// is not a test beside the proof, it is the proof, and §18-SEC-2.3 adds that the
// mutation list must include applying the floor to gold or to the lottery
// weights, *"which is the whole of S-5"*.
//
// ── THE ELEVEN PROPERTIES ───────────────────────────────────────────────────
//   S-SUM      both vectors sum to EXACTLY 10,000 bp, every input, no band
//              (§18.2.6 (P-b): "this is integer arithmetic, not a simulation,
//              and a band would hide a rounding leak in either direction")
//   S-FLOOR    an eligible member below the floor lands ON the floor line; a
//              lifted member is never scaled down; only above-floor members
//              fund the floor
//   S-RAW      dmg_bp is the RAW damage apportionment and carries NO floor and
//              NO threshold — S-5, the whole of it
//   S-PARK     a parked member is paid raw in BOTH vectors and grants and
//              receives no fellowship; a knocked-out member is priced by their
//              damage and by nothing else (§18.1 "A death inside a party")
//   S-DRY      VIGOUR_DRY_MULT hits the member's OWN payout and nobody else's,
//              and the freed value is ACCOUNTED, not redistributed — which is
//              §18.2.6 (P-c) as an inequality with an exact equality underneath
//   S-JOURNAL  journal.meta.party is EXACTLY seven keys (B-A5, as an equality),
//              and the top-level meta allowlist with `party` on it is TWELVE,
//              so a THIRTEENTH is red
//   S-DET      same input → byte-identical output, and there is no attended /
//              away seam to diverge down (§4's both-path rule, and §18.2.3
//              invariant 9: a party member has no attended bucket at all)
//   S-REM      the integer remainder goes to the LOWEST (user_id, slot)
//   S-LOTTO    the lottery weight IS the damage vector, one roll lands in
//              exactly one bag, and sweeping the roll space pays each member
//              exactly dmg_bp rolls
//   S-INT      no float reaches any output
//   S-SQL      §18-SEC.3's one executing assertion, below
//
// ── THE ONE EXECUTING SQL ASSERTION, AND WHY IT IS HERE (§18-SEC.3, S3) ─────
// §18.5's S3 cell asks for *"one executing assertion that both vectors read back
// out of hr_tick_shadow.party sum to 10,000 bp on a planted four-member
// window"*. `hr_tick_shadow.party` DOES NOT EXIST YET: it is a nullable column
// §18.2.1 adds and §18.5 assigns to S2, and S3 *"may run in parallel with S2"*
// (§18-SEC-2.3). A migration whose body waits on another slice's column is a
// migration that cannot self-check, so this lane writes NO migration and the
// assertion lands here instead, against the PGlite chain, on the path the
// attribution ALREADY rides: `delta -> journal -> meta -> party`.
//
// That path is not a substitute for the column, it is the SAME OBJECT one level
// in. §18.2.5 step 7 stores the delta in shadow *"verbatim"* and byte-for-byte
// as `hr_apply` would receive it, and §18.2.1a puts the attribution inside that
// delta's `journal.meta` as one key — the column is the denormalisation of it,
// added so the 48 h parity read groups instead of walking jsonb. So the property
// under test (both vectors read back out of a planted four-member window sum to
// 10,000) is asserted against the authoritative copy today, and S2's lane moves
// the read to the column when the column exists. This file DETECTS the column
// and asserts BOTH the moment it does — S-SQL prints which form it graded, so
// the day the column lands nobody has to remember.
//
// Every planted row is inside a transaction that is ROLLED BACK, and the arm
// then asserts the table is empty again: production is never touched and the
// chain is never left dirty (CLAUDE.md §2 — this is PGlite, in process, no
// credentials, synthetic uuids `gen_random_uuid()` cannot mint).
//
// ── HOW --mutate WORKS ──────────────────────────────────────────────────────
// Each mutant is a TEXT PATCH against a COPY of src/core/party-split.js written
// to a temp dir — never into the tracked file. That is Security finding S-UM-1
// (tests/utc-midnight-replay.mjs once wrote `raise exception` INTO a tracked
// migration and restored it in a `finally`, which a SIGKILL does not run) and it
// is a hard rule here even though this file is JavaScript.
//
// A patch whose anchor is missing or ambiguous exits 2 — a mutation that cannot
// be planted is a HARNESS failure, never a pass. And --mutate runs the CLEAN arm
// first and requires it GREEN before scoring any mutant: that is tests/guard-
// hygiene.mjs R3, the floor under every mutation proof. A driver that scores
// every throw as "caught" cannot tell a caught defect from its own corpse.
//
// Each mutant declares WHICH property must catch it. Catching it by some other
// assertion is recorded as a FAILURE of the named one, because a proof that a
// guard is red somewhere is not a proof that the right thing is watching.
//
// Exit: 0 green · 1 a property (or a mutation proof) failed · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { bootReplay, ROOT } from './schema-replay.mjs';
/* Imported HERE, from hunt.js, so `dryMultBp()` is checked against the SOURCE
   §18.1 names ("derived and not retyped … Tyler may set it to 0.00 in one
   edit") and not against itself. A constant a guard reads out of the module it
   is grading is a constant nothing is guarding. */
import { VIGOUR_DRY_MULT as HUNT_VIGOUR_DRY_MULT } from '../src/core/hunt.js';

const MUTATE = process.argv.slice(2).includes('--mutate');
const SRC = join(ROOT, 'src', 'core', 'party-split.js');

const good = (id, msg) => console.log(`  ✓ ${id} — ${msg}`);
const bad = (id, msg) => console.log(`  ✗ ${id} — ${msg}`);

/* ── loading the module, real or mutated ──────────────────────────────────── */

/** The mutated copy lives outside src/, so its one relative import has to be
    re-pointed at the real file. Everything hunt.js itself imports keeps
    resolving relative to hunt.js, which is where it lives. */
const HUNT_URL = pathToFileURL(join(ROOT, 'src', 'core', 'hunt.js')).href;

/* party-split.js's own import of hunt.js carries bump-version.sh's CURRENT
   ?v= (src/ is walked and bumped; this file is not) — named by digits, not
   pinned to one, so a bump never rots this anchor the way ?v=552 rotted here. */
const HUNT_ANCHOR_RE = /'\.\/hunt\.js\?v=\d+'/g;

let TMP = null;
let planted = 0;
/* The TEXT of the module the battery is currently grading — the real file on
   the clean arm, the mutated copy on a mutant. §18.1's "derived and not
   retyped" is a claim about the source, not about the value: `return 2500` and
   `Math.round(VIGOUR_DRY_MULT * BP)` are the same NUMBER today, and the whole
   point of the derivation is the day they stop being. A value check cannot see
   that; this is why the source is carried. */
let SRC_TEXT = null;

async function loadSplit(patch) {
  if (!patch) {
    SRC_TEXT = await readFile(SRC, 'utf8');
    return import(pathToFileURL(SRC).href);
  }
  const raw = await readFile(SRC, 'utf8');
  const hits = raw.split(patch.from).length - 1;
  if (hits !== 1) {
    throw new Error(`mutant ${patch.id}: anchor occurs ${hits}× in party-split.js, expected exactly 1`);
  }
  const huntHits = [...raw.matchAll(HUNT_ANCHOR_RE)].length;
  if (huntHits !== 1) {
    throw new Error(`mutant ${patch.id}: the hunt.js import anchor occurs ${huntHits}× in party-split.js, expected exactly 1`);
  }
  const body = raw
    .replace(patch.from, patch.to)
    .replace(HUNT_ANCHOR_RE, JSON.stringify(HUNT_URL));
  SRC_TEXT = body;
  const file = join(TMP, `party-split.${patch.id}.${++planted}.mjs`);
  await writeFile(file, body, 'utf8');
  return import(pathToFileURL(file).href);
}

/* ── the corpus: deterministic, never Math.random ─────────────────────────── */

const U = (n) => `00000000-0000-4000-8000-0000000b${String(n).padStart(4, '0')}`;

/** A tiny LCG so the generated corpus is the SAME corpus on every machine and
    in every re-run. A property that fails on one seed in fifty and passes on the
    next is not a property, it is a rumour. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * The corpus. 1..4 members (§18 caps the party at four; ONE is the degenerate
 * party §18.2.6 (P-a) and §18.5's S5 pre-arm bar both require), damages drawn
 * across the ranges the split actually has corners at — zero, one unit, a
 * member exactly ON the participation threshold, a member exactly ON the floor
 * line, and a whole window with no damage at all.
 */
function corpus() {
  const out = [];
  const mk = (dmgs, opts = {}) => ({
    partyId: 'aaaaaaaa-0000-4000-8000-00000000f001',
    huntId: 'bbbbbbbb-0000-4000-8000-00000000f002',
    roll: opts.roll ?? 4242,
    members: dmgs.map((d, i) => ({
      user: opts.users?.[i] ?? U(i + 1), slot: opts.slots?.[i] ?? 0, damage: d,
      knockedOut: opts.ko?.[i] === true, vigourDry: opts.dry?.[i] === true,
    })),
  });

  /* §18.1's OWN published table — the Fellowship block, as damage counts out of
     10,000: 52.0% / 38.6% / 9.0% / 0.4%. The worked example below asserts the
     numbers the design prints. */
  out.push(mk([5200, 3860, 900, 40]));
  out.push(mk([5200, 3860, 900, 40], { dry: [false, false, true, false] }));
  out.push(mk([5200, 3860, 900, 40], { ko: [false, false, true, true] }));
  /* Corners. */
  out.push(mk([1]));                         // the one-member party
  out.push(mk([0]));                         // a window that produced nothing
  out.push(mk([0, 0]));
  out.push(mk([1, 1, 1]));                   // a remainder of exactly 1
  out.push(mk([1, 1, 1, 1]));
  out.push(mk([1250, 1250, 6875, 625]));     // a member exactly ON the threshold
  out.push(mk([2500, 2500, 2500, 2500]));
  out.push(mk([9999, 1]));                   // one member carries the window
  out.push(mk([1, 1], { slots: [1, 0] }));   // distinct users — the USER half only
  /* THE SLOT HALF OF THE TIE-BREAK, WHICH NEEDS ONE PLAYER ON TWO SLOTS. Two
     characters of the same account in one party is not a hypothetical: it is
     exactly the boxed-alt party §18.4 T-8 prices, so `(user_id, slot)` is a
     two-key ordering in ordinary play and the slot half must be exercised. */
  out.push(mk([600, 400], { users: [U(9), U(9)], slots: [1, 0] }));
  out.push(mk([4000, 3000, 2000, 1000], { users: [U(9), U(9), U(2), U(3)], slots: [3, 1, 0, 0] }));
  out.push(mk([300, 300, 300], { dry: [true, true, true] }));   // EVERY member dry
  out.push(mk([5200, 3860, 900, 40], { dry: [true, true, true, true] }));
  out.push(mk([0], { dry: [true] }));
  /* HOSTILE / GARBAGE DAMAGE. §18.4 T-5 has the settle read damage from the
     simulation and never from a client, so this is depth and not the fence —
     but a sign error upstream must not be able to mint a 200% share, and a
     non-finite must not be able to ABORT the settle (BigInt(Infinity) raises).
     Every one of these floors to 0 and the vectors stay inside [0, 10000]. */
  out.push(mk([-5000, 10000]));
  out.push(mk([Infinity, 100]));
  out.push(mk([-Infinity, 100, 100]));
  out.push(mk([NaN, 100]));
  out.push(mk(['5000', 100]));
  out.push(mk([undefined, 100, null, 7]));
  out.push(mk([7, 5, 3, 1], { dry: [true, false, false, false] }));
  out.push(mk([100, 100, 100], { dry: [false, true, true] }));

  const rnd = lcg(0x5eed1234);
  for (let k = 0; k < 400; k++) {
    const n = 1 + Math.floor(rnd() * 4);
    const dmgs = [];
    for (let i = 0; i < n; i++) {
      const r = rnd();
      dmgs.push(r < 0.12 ? 0 : Math.floor(r * (r < 0.5 ? 200 : 40000)));
    }
    /* THE USER IDS ARE PERMUTED, and that is load-bearing. With members always
       U(1)…U(n) ascending the lowest (user_id, slot) is index 0 in every single
       window, so every assertion about WHERE the remainder lands is vacuously
       true — `apportion(…, 0)` and `apportion(…, lowest)` are the same call. */
    const ids = [1, 2, 3, 4].slice(0, n);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    out.push(mk(dmgs, {
      users: ids.map((x) => U(x)),
      dry: dmgs.map(() => rnd() < 0.25),
      ko: dmgs.map(() => rnd() < 0.2),
      slots: dmgs.map(() => (rnd() < 0.3 ? 1 : 0)),
      roll: Math.floor(rnd() * 1e9),
    }));
  }
  return out;
}

const CORPUS = corpus();

/* The eleven top-level journal meta keys the engine writes today
   (tests/accrual-engine.mjs META_KEYS), plus `party` — TWELVE, which is B-A5's
   corrected number and the reason the key that must still go red is a
   THIRTEENTH. This list is a COPY on purpose: accrual-engine.mjs owns the
   engine's allowlist, and S2 widens it; if the two ever disagree that is a
   finding for S2's guard, not a silent merge here. */
const META_KEYS_12 = ['ms', 'ticks', 'kills', 'capped', 'ate', 'att', 'spent',
  'w', 'from', 'to', 'stopped', 'party'];

/* ── the property battery ─────────────────────────────────────────────────── */

const isInt = (x) => typeof x === 'number' && Number.isInteger(x);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/**
 * Every property, as data: `{ id, problems: [] }`. PURE over the module it is
 * handed, which is what lets --mutate run the identical battery against a
 * mutated copy and require a NAMED id to be the one that goes red.
 */
function battery(api) {
  const fail = [];
  const note = (id, msg) => fail.push({ id, msg });
  const {
    splitParty, partyPayout, partyJournal, assignDrop,
    participationThresholdBp, xpFloorBp, fellowshipBp, dryMultBp,
    PARTY_JOURNAL_KEYS, BP,
  } = api;

  for (const input of CORPUS) {
    let s;
    try { s = splitParty(input); } catch (e) { note('S-SUM', `splitParty threw on ${JSON.stringify(input.members.map((m) => m.damage))}: ${e.message}`); continue; }
    const n = s.n;
    const ms = s.members;
    const tag = `n=${n} dmg=[${ms.map((m) => m.damage).join(',')}]`;

    // ── S-SUM ────────────────────────────────────────────────────────────
    if (sum(ms.map((m) => m.dmg_bp)) !== BP) note('S-SUM', `dmg_bp sums to ${sum(ms.map((m) => m.dmg_bp))}, not ${BP} (${tag})`);
    if (sum(ms.map((m) => m.xp_bp)) !== BP) note('S-SUM', `xp_bp sums to ${sum(ms.map((m) => m.xp_bp))}, not ${BP} (${tag})`);

    // ── S-INT ────────────────────────────────────────────────────────────
    for (const m of ms) {
      for (const k of ['dmg_bp', 'xp_bp', 'floor', 'fellow_bp', 'lottery_bp', 'dry_bp', 'damage', 'slot']) {
        if (!isInt(m[k])) note('S-INT', `member.${k} is ${JSON.stringify(m[k])}, not an integer (${tag})`);
      }
    }
    for (const k of ['thresholdBp', 'floorBp', 'fellowBp', 'eligibleCount', 'totalDamage', 'roll', 'n']) {
      if (!isInt(s[k])) note('S-INT', `split.${k} is ${JSON.stringify(s[k])}, not an integer (${tag})`);
    }
    /* S-INT SHORT-CIRCUITS, and that is the point. `partyPayout` does
       `BigInt(m.dmg_bp)`, which RAISES on a float — and the driver refuses to
       score a throw as a named property ("red, but not by a named property").
       Without this `continue` a float leaking into the VECTORS is red on
       `<threw>` instead of on S-INT, so the one mutant S-INT exists to catch
       would be recorded as a failure of the mutation proof. Stop at the
       property that owns the finding; nothing downstream of a non-integer bp
       is meaningful anyway. */
    if (fail.some((f) => f.id === 'S-INT' && f.msg.endsWith(`(${tag})`))) continue;

    // ── S-RAW — the damage vector carries no floor and no threshold ───────
    const total = ms.reduce((a, m) => a + m.damage, 0);
    const lowest = s.lowest;
    const expectRaw = ms.map((m) => (total > 0 ? Math.floor((BP * m.damage) / total) : Math.floor(BP / n)));
    expectRaw[lowest] += BP - sum(expectRaw);
    for (let i = 0; i < n; i++) {
      if (ms[i].dmg_bp !== expectRaw[i]) {
        note('S-RAW', `dmg_bp[${i}] = ${ms[i].dmg_bp}, raw damage share is ${expectRaw[i]} — something adjusted the gold vector (${tag})`);
      }
      if (ms[i].lottery_bp !== ms[i].dmg_bp) {
        note('S-LOTTO', `lottery_bp[${i}] = ${ms[i].lottery_bp} but dmg_bp[${i}] = ${ms[i].dmg_bp} — the lottery must follow damage EXACTLY (${tag})`);
      }
    }

    /* NO SHARE OUTSIDE [0, 10,000] — the bound a NEGATIVE damage breaks. A
       forged or sign-flipped -5,000 against a +10,000 apportions to
       [-10,000, +20,000]: one member paid 200% of the window's gold and one
       paid a debt, with both vectors still summing to 10,000, so (P-b) alone
       does NOT see it. The clamp in splitParty is what holds this, and this is
       the assertion that the clamp is load-bearing (§18.4 T-5, depth). */
    for (let i = 0; i < n; i++) {
      for (const k of ['dmg_bp', 'xp_bp', 'lottery_bp']) {
        if (ms[i][k] < 0 || ms[i][k] > BP) {
          note('S-RAW', `member ${i}'s ${k} is ${ms[i][k]}, outside [0, ${BP}] — a share was minted or a debt was dealt (${tag})`);
        }
      }
      if (ms[i].damage < 0 || !Number.isFinite(ms[i].damage)) {
        note('S-RAW', `member ${i}'s damage read back as ${ms[i].damage} — garbage must floor to 0, never propagate (${tag})`);
      }
    }

    // ── S-FLOOR ──────────────────────────────────────────────────────────
    const floorLine = xpFloorBp(n);
    const thresholdLine = participationThresholdBp(n);
    if (thresholdLine * 2 > floorLine + 1) note('S-FLOOR', `the threshold (${thresholdLine}) is not half the floor (${floorLine}) for n=${n}`);
    for (let i = 0; i < n; i++) {
      const m = ms[i];
      const raw = m.dmg_bp;
      if (!m.parked && raw < floorLine) {
        if (m.xp_bp < floorLine) note('S-FLOOR', `member ${i} is eligible at ${raw} bp and below the ${floorLine} bp floor, but was paid ${m.xp_bp} bp (${tag})`);
        if (m.xp_bp < raw) note('S-FLOOR', `member ${i} was LIFTED to the floor and then scaled down to ${m.xp_bp} (${tag})`);
      }
      if (raw > floorLine && m.xp_bp > raw + 1) {
        note('S-FLOOR', `member ${i} is above the floor at ${raw} bp and GAINED xp (${m.xp_bp}) — only above-floor members fund the floor (${tag})`);
      }
      if (m.floor !== m.xp_bp - m.dmg_bp) note('S-JOURNAL', `member ${i}'s floor field (${m.floor}) is not xp_bp - dmg_bp (${tag})`);
    }
    if (sum(ms.map((m) => m.floor)) !== 0) {
      note('S-FLOOR', `Σ floor = ${sum(ms.map((m) => m.floor))}, not 0 — the floor minted or burned basis points (${tag})`);
    }

    // ── S-PARK — parked and knocked-out ──────────────────────────────────
    const eligibleExpected = ms.map((m) => (total <= 0 ? true : 4 * n * m.damage >= total));
    for (let i = 0; i < n; i++) {
      if (ms[i].parked === eligibleExpected[i]) {
        note('S-PARK', `member ${i} at ${ms[i].damage}/${total} is parked=${ms[i].parked}, the 25%-of-equal threshold says eligible=${eligibleExpected[i]} (${tag})`);
      }
      if (ms[i].parked) {
        if (Math.abs(ms[i].xp_bp - ms[i].dmg_bp) > 1) {
          note('S-PARK', `parked member ${i} was paid ${ms[i].xp_bp} xp bp against ${ms[i].dmg_bp} raw — a parked member is paid their raw share in everything (${tag})`);
        }
        if (ms[i].fellow_bp !== 0) note('S-PARK', `parked member ${i} was paid a ${ms[i].fellow_bp} bp fellowship bonus (${tag})`);
      } else if (ms[i].fellow_bp !== s.fellowBp) {
        note('S-PARK', `eligible member ${i} carries ${ms[i].fellow_bp} bp of fellowship, the party line is ${s.fellowBp} (${tag})`);
      }
    }
    /* §18.1's LITERALS, written here and not read out of the module: "+5% per
       member beyond the first, maximum +15% at four". `expectFellow` used to be
       `fellowshipBp(eligible)` — the module's own function on both sides of the
       equals sign, which is green for ANY value of FELLOWSHIP_MAX_BP. The cap is
       what makes §18.4 T-8 true ("four boxed alts … strictly worse than four solo
       hunts"), so it is pinned to 1500 by this table and by nothing else. */
    const FELLOW_18_1 = [0, 0, 500, 1000, 1500];
    const eligibleN = eligibleExpected.filter(Boolean).length;
    const expectFellow = FELLOW_18_1[eligibleN];
    if (s.fellowBp !== expectFellow) note('S-PARK', `fellowship is ${s.fellowBp} bp over ${eligibleN} eligible; §18.1's +5% per member beyond the first, capped at +15%, says ${expectFellow} (${tag})`);
    if (fellowshipBp(eligibleN) !== expectFellow) note('S-PARK', `fellowshipBp(${eligibleN}) = ${fellowshipBp(eligibleN)}, §18.1 says ${expectFellow} (${tag})`);
    /* AND THE CEILING WHERE IT ACTUALLY BINDS. At four members the cap is not
       binding — three steps of 500 IS 1500 — so `FELLOWSHIP_MAX_BP` can be set
       to any number above 1500 and every in-range assertion stays green. The
       ceiling is therefore asserted ABOVE the roster cap, which is the only
       place the constant does any work and the only place a raised cap shows. */
    for (const k of [4, 5, 9]) {
      if (fellowshipBp(k) !== 1500) note('S-PARK', `fellowshipBp(${k}) = ${fellowshipBp(k)} — §18.1 caps the fellowship bonus at +15% (1500 bp), and the ceiling must hold above the roster cap too`);
    }

    // ── S-DRY and (P-c) ──────────────────────────────────────────────────
    const produced = { gold: 240000 + total, xp: 730000 + total * 3 };
    const pay = partyPayout({ split: s, produced });
    if (pay.preMultiplier.gold !== produced.gold) note('S-DRY', `Σ pre-multiplier gold = ${pay.preMultiplier.gold}, produced ${produced.gold} — (P-c)'s exact equality (${tag})`);
    if (pay.preMultiplier.xp !== produced.xp) note('S-DRY', `Σ pre-multiplier xp = ${pay.preMultiplier.xp}, produced ${produced.xp} — (P-c)'s exact equality (${tag})`);
    if (pay.paid.gold > produced.gold) note('S-DRY', `paid ${pay.paid.gold} gold against ${produced.gold} produced — a party may never pay out more than it produced (${tag})`);
    if (pay.paid.xp > produced.xp + pay.fellowship.xp) note('S-DRY', `paid ${pay.paid.xp} xp against ${produced.xp} + ${pay.fellowship.xp} fellowship (${tag})`);
    if (pay.paid.gold !== produced.gold - pay.dryLost.gold) note('S-DRY', `gold: paid ${pay.paid.gold} ≠ produced ${produced.gold} − dry ${pay.dryLost.gold}; the deficit must be exactly the declared reduction (${tag})`);
    if (pay.paid.xp !== produced.xp + pay.fellowship.xp - pay.dryLost.xp) note('S-DRY', `xp: paid ${pay.paid.xp} ≠ produced ${produced.xp} + fellowship ${pay.fellowship.xp} − dry ${pay.dryLost.xp} (${tag})`);
    /* DERIVED, NOT RETYPED (§18.1, and the module header's own claim). Checked
       against `VIGOUR_DRY_MULT` imported straight from hunt.js, so a literal
       2500 written here — which every other assertion in this file would accept,
       because they all read the number back out of the module — is red. This is
       the line that keeps "Tyler may set it to 0.00 in one edit" true. */
    if (dryMultBp() !== Math.round(HUNT_VIGOUR_DRY_MULT * BP)) {
      note('S-DRY', `dryMultBp() = ${dryMultBp()}, hunt.js's VIGOUR_DRY_MULT derives ${Math.round(HUNT_VIGOUR_DRY_MULT * BP)} — the multiplier was retyped instead of derived`);
    }
    if (!/import\s*\{[^}]*\bVIGOUR_DRY_MULT\b[^}]*\}\s*from\s*'\.\/hunt\.js\?v=\d+'/.test(SRC_TEXT || '')
      || !/function dryMultBp\(\)\s*\{[^}]*\bVIGOUR_DRY_MULT\b/.test(SRC_TEXT || '')) {
      note('S-DRY', 'dryMultBp() does not derive its value from the VIGOUR_DRY_MULT it imports from hunt.js — §18.1: derived and not retyped, "precisely so dry means a quarter is learned once and true twice"');
    }
    const anyDry = ms.some((m) => m.vigourDry);
    /* Only a dry member who actually HELD a share can have one reduced: a dry
       member at zero damage is paid zero either way, and demanding a withholding
       there would be demanding the multiplier mint a debt. */
    const dryHoldsShare = pay.members.some((pm, i) => ms[i].vigourDry && pm.preGold > 0);
    if (dryHoldsShare && dryMultBp() < BP && pay.dryLost.gold <= 0) {
      note('S-DRY', `a Vigour-dry member held ${pay.members.filter((pm, i) => ms[i].vigourDry).map((pm) => pm.preGold).join('+')} gold of share and nothing was withheld — VIGOUR_DRY_MULT was not applied (${tag})`);
    }
    if (!anyDry && (pay.dryLost.gold !== 0 || pay.dryLost.xp !== 0)) {
      note('S-DRY', `no member was dry and ${pay.dryLost.gold} gold / ${pay.dryLost.xp} xp was withheld (${tag})`);
    }
    /* THE REMAINDER RULE ON THE PAYOUT VECTORS, WHICH IS WHERE THE MONEY IS.
       S-REM below pins `split.lowest`; it does not pin where partyPayout sends
       its own two remainders, and `apportion(gold, …, 0)` conserves perfectly
       while handing every window's spare gold and xp to whoever happens to sit
       at index 0. Every member but `lowest` must hold EXACTLY their floored
       share, and `lowest` must hold the whole shortfall — which is structurally
       < n units, and that bound is the entire size of the S-6 lever. */
    for (const [label, vec, tot, bpk] of [['gold', pay.members.map((m) => m.preGold), produced.gold, 'dmg_bp'],
      ['xp', pay.members.map((m) => m.preXp), produced.xp, 'xp_bp']]) {
      const exact = ms.map((m) => Math.floor((tot * m[bpk]) / BP));
      const rem = tot - exact.reduce((a, b) => a + b, 0);
      for (let i = 0; i < n; i++) {
        const want = exact[i] + (i === s.lowest ? rem : 0);
        if (vec[i] !== want) note('S-REM', `pre-multiplier ${label}[${i}] = ${vec[i]}, the ${bpk} apportionment with the remainder on the lowest (user_id, slot) says ${want} (${tag})`);
      }
      if (rem < 0 || rem >= n) note('S-REM', `the ${label} remainder is ${rem}, which is not in [0, ${n}) — the shortfall must be smaller than the party (${tag})`);
    }

    /* The reduction lands on the DRY MEMBER and on nobody else: a non-dry
       member's payout must be identical with and without a dry co-member. */
    if (anyDry) {
      const wet = splitParty({ ...input, members: input.members.map((m) => ({ ...m, vigourDry: false })) });
      const wetPay = partyPayout({ split: wet, produced });
      for (let i = 0; i < n; i++) {
        if (ms[i].vigourDry) {
          if (pay.members[i].gold > wetPay.members[i].gold) note('S-DRY', `dry member ${i} was paid MORE than the same member undried (${tag})`);
        } else if (pay.members[i].gold !== wetPay.members[i].gold || pay.members[i].xp !== wetPay.members[i].xp) {
          note('S-DRY', `member ${i} is not dry but their payout moved when a co-member was — the multiplier hit somebody else's share (${tag})`);
        }
      }
    }

    // ── S-JOURNAL ────────────────────────────────────────────────────────
    for (let i = 0; i < n; i++) {
      const j = partyJournal(s, i);
      const keys = Object.keys(j).sort();
      const want = [...PARTY_JOURNAL_KEYS].sort();
      if (keys.join(',') !== want.join(',')) {
        note('S-JOURNAL', `journal.meta.party keys are {${keys.join(',')}}, the frozen set is {${want.join(',')}} (${tag})`);
      }
      if (j.dmg_bp !== ms[i].dmg_bp || j.xp_bp !== ms[i].xp_bp || j.floor !== ms[i].floor
        || j.fellow_bp !== ms[i].fellow_bp || j.roll !== s.roll) {
        note('S-JOURNAL', `journal.meta.party for member ${i} does not carry the member's own numbers (${tag})`);
      }
    }

    /* THE SEED SEAM (§18.4 T-1, "the whole distribution is replayable"). The
       roll is an INPUT, and the number the ledger carries must be the number the
       caller handed in — otherwise the window replays to a different bag than
       the one it paid. S-JOURNAL checks the journal against `split.roll`; both
       are the module's, so only this line pins either to the caller. */
    if (s.roll !== Math.floor(Number(input.roll) || 0)) {
      note('S-DET', `the split carries roll ${s.roll}, the caller passed ${input.roll} — the seed seam belongs to the caller (${tag})`);
    }

    // ── S-REM — the remainder goes to the LOWEST (user_id, slot) ─────────
    const order = ms.map((m, i) => [String(m.user).toLowerCase(), Number(m.slot), i])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
    if (s.lowest !== order[0][2]) {
      note('S-REM', `the remainder went to index ${s.lowest}; the lowest (user_id, slot) is index ${order[0][2]} (${tag})`);
    }

    // ── S-LOTTO — one roll, one bag, and the win line IS the damage vector
    const weights = ms.map((m) => m.lottery_bp);
    const hit = assignDrop({ weights, roll: s.roll });
    if (!isInt(hit) || hit < 0 || hit >= n) note('S-LOTTO', `assignDrop returned ${JSON.stringify(hit)} for a party of ${n} — one kill's drop lands in exactly one bag (${tag})`);
  }

  // ── S-LOTTO, the exact distribution ────────────────────────────────────
  {
    const s = splitParty(CORPUS[0]);
    const weights = s.members.map((m) => m.lottery_bp);
    const wins = weights.map(() => 0);
    for (let r = 0; r < BP; r++) wins[assignDrop({ weights, roll: r })] += 1;
    for (let i = 0; i < wins.length; i++) {
      if (wins[i] !== weights[i]) {
        note('S-LOTTO', `sweeping the roll space pays member ${i} ${wins[i]} of ${BP} rolls, their damage weight is ${weights[i]} — expected item value must track damage dealt`);
      }
    }
    /* THE PER-MEMBER ROLL, PLANTED INLINE (§18.1: "once per kill, never once per
       member"). A caller that rolled per member hands out `n` assignments for one
       kill; the property that refuses it is that a kill produces exactly one. */
    const perMember = s.members.map((_, i) => assignDrop({ weights, roll: s.roll + i * 991 }));
    if (new Set(perMember).size === 1 && s.n > 1) {
      note('S-LOTTO', 'the per-member-roll planting produced one winner — the inline mutation is not planting anything');
    }
    if (perMember.length === 1) note('S-LOTTO', 'the per-member-roll planting produced one assignment — it is not the shape it exists to refuse');
  }

  // ── S-JOURNAL, the top-level allowlist (B-A5) ──────────────────────────
  {
    const metaProblems = (m) => {
      const out = [];
      const keys = Object.keys(m);
      for (const k of keys) if (!META_KEYS_12.includes(k)) out.push(`unknown meta key '${k}'`);
      if (keys.length > META_KEYS_12.length) out.push(`${keys.length} keys > ${META_KEYS_12.length}`);
      return out;
    };
    const s = splitParty(CORPUS[0]);
    const meta = Object.fromEntries(META_KEYS_12.map((k) => [k, 1]));
    meta.party = partyJournal(s, 0);
    if (metaProblems(meta).length !== 0) note('S-JOURNAL', `the twelve-key meta with party on it was refused: ${metaProblems(meta).join('; ')}`);
    if (metaProblems({ ...meta, kill_log: [1, 2, 3] }).length === 0) note('S-JOURNAL', 'a THIRTEENTH top-level meta key was accepted — B-A5');
    if (Object.isFrozen(PARTY_JOURNAL_KEYS) !== true) note('S-JOURNAL', 'PARTY_JOURNAL_KEYS is not frozen — the nested set must be an equality, not a suggestion');
  }

  // ── S-SUM — the roster range the split will price at all ───────────────
  {
    /* §18.1 caps a party at FOUR and the module throws outside 1..4. Membership
       is S1's CHECK and this function cannot police a roster it never sees —
       but what it IS handed, it must refuse rather than silently price, because
       a five-member split conserves perfectly (apportion is structural) and so
       nothing downstream would ever notice. ONE is accepted, deliberately:
       §18.2.6 (P-a) and §18.5's S5 pre-arm bar both require a real one-member
       party. */
    const call = (k) => splitParty({ partyId: 'p', huntId: 'h', roll: 1,
      members: Array.from({ length: k }, (_, i) => ({ user: U(i + 1), slot: 0, damage: 100 })) });
    for (const k of [0, 5, 8]) {
      let threw = null;
      try { call(k); } catch (e) { threw = e; }
      if (!(threw instanceof RangeError)) note('S-SUM', `a ${k}-member roster was priced instead of refused (got ${threw ? threw.constructor.name : 'a split'}) — §18.1 caps the party at ${4}`);
    }
    for (const k of [1, 2, 3, 4]) {
      try { call(k); } catch (e) { note('S-SUM', `a ${k}-member roster was refused: ${e.message}`); }
    }
  }

  // ── S-DET — determinism, and the both-path rule (§4) ───────────────────
  {
    for (const input of CORPUS.slice(0, 40)) {
      const a = JSON.stringify(splitParty(input));
      const b = JSON.stringify(splitParty(JSON.parse(JSON.stringify(input))));
      if (a !== b) note('S-DET', `the same window split two ways: ${a.slice(0, 120)} vs ${b.slice(0, 120)}`);
    }
    /* THE BOTH-PATH TEST, at the only grain a pure function has one. §18.2.3
       invariant 9 rules that attended kill credit is NOT ACCEPTED for a partied
       character, so §16.6's attended bucket is EMPTY for every party member and
       there is no second path to diverge down. The assertion is therefore that
       the ATTENDED caller and the AWAY caller are the same call — identical
       inputs, identical bytes out — and that no attended seam exists to be
       passed one: an `attended` field on the input must change NOTHING. */
    const input = CORPUS[0];
    const attended = splitParty({ ...input, members: input.members.map((m) => ({ ...m, attended: true, attendedDamage: 99999 })) });
    const away = splitParty({ ...input, members: input.members.map((m) => ({ ...m, away: true })) });
    if (JSON.stringify(attended) !== JSON.stringify(away)) {
      note('S-DET', 'the attended caller and the away caller got different splits — there is a second path, and AWAY-12 forbids one');
    }
    const clean = splitParty(input);
    if (JSON.stringify(attended) !== JSON.stringify(clean)) {
      note('S-DET', 'an attended field on the input changed the split — a party member has no attended bucket (invariant 9)');
    }
  }

  // ── The worked four-member example, hand-computed from §18.1 ───────────
  {
    /* §18.1's OWN Fellowship block. Damage 52.0 / 38.6 / 9.0 / 0.4 percent.
       Ilse is eligible (9.0% ≥ 6.25%) and under the floor, so she is lifted to
       12.5%; Tomas is parked (0.4% < 6.25%) and keeps his raw 0.4% in both
       vectors; Kaya and Bram fund the lift by scaling 87.1/90.6 = 0.96137…,
       giving 50.0% and 37.1%. Three fought, so the fellowship line is +10%.
       The design prints 1,186 g / 880 g / 205 g / 9 g against a 2,280 g window,
       and the gold column below is those four numbers. */
    const s = splitParty(CORPUS[0]);
    const want = {
      dmg: [5200, 3860, 900, 40],
      xp: [5000, 3710, 1250, 40],
      floor: [-200, -150, 350, 0],
      fellow: [1000, 1000, 1000, 0],
      parked: [false, false, false, true],
    };
    const got = {
      dmg: s.members.map((m) => m.dmg_bp),
      xp: s.members.map((m) => m.xp_bp),
      floor: s.members.map((m) => m.floor),
      fellow: s.members.map((m) => m.fellow_bp),
      parked: s.members.map((m) => m.parked),
    };
    for (const k of Object.keys(want)) {
      if (JSON.stringify(got[k]) !== JSON.stringify(want[k])) {
        note('S-SUM', `§18.1's worked example: ${k} is ${JSON.stringify(got[k])}, the design prints ${JSON.stringify(want[k])}`);
      }
    }
    /* S-INT owns a non-integer vector, and everything downstream of one RAISES
       (`partyPayout` does `BigInt(m.dmg_bp)`). The per-input loop short-circuits
       on S-INT; this block is outside it, so it stops here too — otherwise a
       float leaking into the vectors is scored `<threw>` rather than red on the
       property that found it, and the driver rightly refuses to count a throw. */
    if (fail.some((f) => f.id === 'S-INT')) return fail;
    const pay = partyPayout({ split: s, produced: { gold: 2280, xp: 6443 } });
    const goldWant = [1186, 880, 205, 9];
    if (JSON.stringify(pay.members.map((m) => m.gold)) !== JSON.stringify(goldWant)) {
      note('S-RAW', `§18.1's worked example: gold is ${JSON.stringify(pay.members.map((m) => m.gold))}, the design prints ${JSON.stringify(goldWant)}`);
    }
    if (s.thresholdBp !== 625 || s.floorBp !== 1250 || s.fellowBp !== 1000) {
      note('S-PARK', `§18.1's worked example: threshold/floor/fellowship are ${s.thresholdBp}/${s.floorBp}/${s.fellowBp}, the design says 625/1250/1000`);
    }
  }

  return fail;
}

/* ── S-SQL: the one executing assertion, on the PGlite chain ──────────────── */

const SHADOW_U = (n) => `00000000-0000-4000-8000-0000000c${String(n).padStart(4, '0')}`;
const KEY = (n) => `0000cccc-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function sqlArm(api) {
  const fail = [];
  const note = (msg) => fail.push({ id: 'S-SQL', msg });
  const { db, failures } = await bootReplay({});
  if (failures?.length) { await db.close?.(); throw new Error(`the schema replay did not complete: ${failures.join('; ')}`); }
  try {
    const hasCol = Number((await db.query(`
      select count(*)::int as n from information_schema.columns
       where table_schema = 'public' and table_name = 'hr_tick_shadow' and column_name = 'party'`)).rows[0].n) > 0;

    const s = api.splitParty({
      partyId: 'aaaaaaaa-0000-4000-8000-00000000f001',
      huntId: 'bbbbbbbb-0000-4000-8000-00000000f002',
      roll: 4242,
      members: [0, 1, 2, 3].map((i) => ({ user: SHADOW_U(i + 1), slot: 0, damage: [5200, 3860, 900, 40][i] })),
    });

    await db.exec('begin');
    for (let i = 0; i < 4; i++) {
      const party = api.partyJournal(s, i);
      /* The delta a party settle hands hr_apply is key-for-key a solo combat
         settle's, and the party rides inside journal.meta as ONE key
         (§18.2.1a). It is planted here exactly that way — no top-level party
         key — so what is read back is the object hr_apply would receive. */
      const delta = {
        gold: 100, xp: 250, accrued_to: '2026-09-23T12:00:00Z',
        journal: { kind: 'combat', intent: 'accrue', meta: { ms: 600000, ticks: 250, kills: 9, src: 'tick', party } },
      };
      const col = hasCol ? ', party' : '';
      const val = hasCol ? `, ${db.escapeLiteral ? db.escapeLiteral(JSON.stringify(party)) : `'${JSON.stringify(party)}'`}::jsonb` : '';
      await db.exec(`
        insert into public.hr_tick_shadow
          (user_id, slot, channel, holder, window_from, window_to, version, intent_id, delta${col})
        values ('${SHADOW_U(i + 1)}', 0, 'combat', 'cron:party-split-guard',
                '2026-09-23T11:50:00Z'::timestamptz, '2026-09-23T12:00:00Z'::timestamptz,
                1::bigint, '${KEY(i + 1)}'::uuid, '${JSON.stringify(delta)}'::jsonb${val});`);
    }

    /* §18.2.6's read, at the grain S3 owns: BOTH vectors, on the planted
       four-member window, must come back at exactly 10,000 bp. */
    const read = async (path) => (await db.query(`
      select s.window_from, s.window_to, count(*)::int as members,
             sum((${path}->>'dmg_bp')::int) as dmg_bp_total,
             sum((${path}->>'xp_bp')::int)  as xp_bp_total
        from public.hr_tick_shadow s
       where s.holder = 'cron:party-split-guard'
       group by 1, 2`)).rows;

    const forms = [['delta->\'journal\'->\'meta\'->\'party\'', "s.delta->'journal'->'meta'->'party'"]];
    if (hasCol) forms.push(['the party column', 's.party']);
    for (const [label, path] of forms) {
      const rows = await read(path);
      if (rows.length !== 1) { note(`${label}: the planted window grouped into ${rows.length} rows, expected 1`); continue; }
      const r = rows[0];
      if (Number(r.members) !== 4) note(`${label}: ${r.members} members read back, planted 4`);
      if (Number(r.dmg_bp_total) !== 10000) note(`${label}: dmg_bp sums to ${r.dmg_bp_total} out of hr_tick_shadow, not 10000`);
      if (Number(r.xp_bp_total) !== 10000) note(`${label}: xp_bp sums to ${r.xp_bp_total} out of hr_tick_shadow, not 10000`);
    }
    if (!fail.length) {
      good('S-SQL', `both vectors read back at 10,000 bp on a planted four-member window, via ${forms.map((f) => f[0]).join(' and ')}`
        + (hasCol ? '' : ' — hr_tick_shadow.party does not exist yet (S2 owns it); the read moves to the column the day it does'));
    }

    await db.exec('rollback');
    const left = Number((await db.query(
      "select count(*)::int as n from public.hr_tick_shadow where holder = 'cron:party-split-guard'")).rows[0].n);
    if (left !== 0) note(`${left} planted rows survived the rollback — this arm must leave the chain exactly as it found it`);
    else good('S-SQL-ROLLBACK', 'every planted row is rolled back; hr_tick_shadow is empty again');
  } finally {
    await db.close?.();
  }
  return fail;
}

/* ── the mutants ──────────────────────────────────────────────────────────── */

const MUTANTS = [
  {
    id: 'M1', catches: 'S-RAW',
    what: 'the XP floor applied to GOLD (dmg_bp) — S-5, the whole of it',
    from: 'const dmgBp = apportion(BP, total > 0n ? dmg : dmg.map(() => 1n), lowest);',
    to: 'const dmgBp = apportion(BP, xpWeights(dmg, total, n, eligible), lowest);',
  },
  {
    id: 'M2', catches: 'S-LOTTO',
    what: 'the XP floor applied to the item-LOTTERY weights — S-5',
    from: '      lottery_bp: dmgBp[i],',
    to: '      lottery_bp: xpBp[i],',
  },
  {
    id: 'M3', catches: 'S-REM',
    what: 'the remainder to the HIGHEST (user_id, slot) instead of the lowest — S-6',
    from: '    if (au < bu || (au === bu && Number(a.slot) < Number(b.slot))) best = i;',
    to: '    if (au > bu || (au === bu && Number(a.slot) > Number(b.slot))) best = i;',
  },
  {
    id: 'M4', catches: 'S-SUM',
    what: 'a vector that sums to 9,999 — (P-b) admits no band',
    from: '  out[lowest] += rem;',
    to: '  out[lowest] += rem - 1n;',
  },
  {
    id: 'M5', catches: 'S-JOURNAL',
    what: 'an EIGHTH key on journal.meta.party — B-A5, the nested set as an equality',
    from: '    roll: split.roll,\n  };',
    to: '    roll: split.roll,\n    dry_bp: m.dry_bp,\n  };',
  },
  {
    id: 'M6', catches: 'S-DRY',
    what: 'VIGOUR_DRY_MULT not applied — S-10, and (P-c) loses its declared reduction',
    from: '      dry_bp: dry ? dryBp : BP,',
    to: '      dry_bp: BP,',
  },
  {
    id: 'M7', catches: 'S-INT',
    what: 'float leakage — a dropped Math.floor on the floor line',
    from: '  return Math.floor((BP / 2) / n);',
    to: '  return (BP / 2) / n;',
  },
  {
    id: 'M8', catches: 'S-FLOOR',
    what: 'the XP floor removed — §18.5 S3',
    from: '    if (lifted[i]) return F * poolA;',
    to: '    if (lifted[i]) return r * poolA;',
  },
  {
    id: 'M9', catches: 'S-PARK',
    what: 'the participation threshold removed — §18.5 S3',
    from: '  return 4n * BigInt(n) * damage >= total;',
    to: '  return true;',
  },
  {
    id: 'M10', catches: 'S-LOTTO',
    what: 'the lottery weight line detached from the damage vector (loot rolled per member, not per kill) — §18.5 S3',
    from: '  const sum = weights.reduce((a, b) => a + b, 0);',
    to: '  const sum = Math.max(...weights);',
  },
  {
    id: 'M11', catches: 'S-PARK',
    what: 'the +15% fellowship CAP removed — §18.1\'s ceiling and §18.4 T-8 with it',
    from: 'export const FELLOWSHIP_MAX_BP = 1500;',
    to: 'export const FELLOWSHIP_MAX_BP = 150000;',
  },
  {
    id: 'M12', catches: 'S-DRY',
    what: 'VIGOUR_DRY_MULT retyped as a literal instead of derived from hunt.js — §18.1',
    from: '  return Math.round(VIGOUR_DRY_MULT * BP);',
    to: '  return 2500;',
  },
  {
    id: 'M13', catches: 'S-REM',
    what: 'the PAYOUT vectors send gold and xp remainders to index 0, not to the lowest (user_id, slot) — S-6 where the money is',
    from: '  const lowest = split.lowest;',
    to: '  const lowest = 0;',
  },
  {
    id: 'M14', catches: 'S-REM',
    what: 'the SLOT half of the (user_id, slot) tie-break reversed — one player on two slots',
    from: '    if (au < bu || (au === bu && Number(a.slot) < Number(b.slot))) best = i;',
    to: '    if (au < bu || (au === bu && Number(a.slot) > Number(b.slot))) best = i;',
  },
  {
    id: 'M15', catches: 'S-RAW',
    what: 'the damage clamp removed — a forged negative damage mints a 200% share while both vectors still sum to 10,000',
    from: '    return BigInt(Number.isFinite(d) && d > 0 ? d : 0);',
    to: '    return BigInt(Number.isFinite(d) ? d : 0);',
  },
  {
    id: 'M16', catches: 'S-INT',
    what: 'float leakage into the bp VECTORS themselves, not just the reported line',
    from: '  return out.map((x) => Number(x));',
    to: '  return out.map((x) => Number(x) + 0.25);',
  },
  {
    id: 'M17', catches: 'S-DET',
    what: 'the lottery roll re-derived inside the split instead of carried from the caller — §18.4 T-1 replayability',
    from: '    roll: Math.floor(Number(o?.roll) || 0),',
    to: '    roll: (Math.floor(Number(o?.roll) || 0) ^ 1),',
  },
  {
    id: 'M18', catches: 'S-SUM',
    what: 'the 1..4 roster range check removed — a five-member party splits and conserves',
    from: '  if (n < 1 || n > PARTY_MAX) {',
    to: '  if (n < 1 || n > PARTY_MAX + 4) {',
  },
];

/* ── main ─────────────────────────────────────────────────────────────────── */

console.log(`party-split: the split is arithmetic, and arithmetic is provable${MUTATE ? ' (--mutate)' : ''}`);

let exit = 0;
TMP = await mkdtemp(join(tmpdir(), 'hr-party-split-'));
try {
  const real = await loadSplit(null);

  /* THE FLOOR (guard-hygiene R3): the clean arm runs FIRST and must be green,
     in both modes. A mutation proof whose clean run is red proves nothing. */
  const clean = battery(real);
  const byId = new Map();
  for (const f of clean) { if (!byId.has(f.id)) byId.set(f.id, []); byId.get(f.id).push(f.msg); }
  for (const id of ['S-SUM', 'S-FLOOR', 'S-RAW', 'S-PARK', 'S-DRY', 'S-JOURNAL', 'S-DET', 'S-REM', 'S-LOTTO', 'S-INT']) {
    if (byId.has(id)) { bad(id, `${byId.get(id).length} failure(s): ${byId.get(id).slice(0, 3).join(' | ')}`); exit = 1; }
    else good(id, `${CORPUS.length} generated windows, 1..4 members`);
  }

  if (!MUTATE) {
    const sqlFail = await sqlArm(real);
    for (const f of sqlFail) { bad(f.id, f.msg); exit = 1; }
  } else if (exit !== 0) {
    console.error('the CLEAN arm is red, so no mutant can be scored — fix the guard first');
    process.exit(2);
  } else {
    console.log('\nmutation proof — each mutant must go RED by its NAMED property');
    for (const m of MUTANTS) {
      let caught = null;
      try {
        const api = await loadSplit(m);
        const fails = battery(api);
        caught = new Set(fails.map((f) => f.id));
      } catch (e) {
        if (/^mutant /.test(e.message)) { console.error(e.message); process.exit(2); }
        /* A mutant that makes the module THROW is red, but not by a named
           property, and this guard says so rather than counting it. */
        caught = new Set(['<threw>']);
      }
      if (caught.has(m.catches)) good(m.id, `${m.what} → RED on ${m.catches}`);
      else { bad(m.id, `${m.what} → ${m.catches} stayed GREEN (red on: ${[...caught].join(', ') || 'nothing at all'})`); exit = 1; }
    }
  }
} catch (e) {
  console.error(`harness: ${e?.stack || e?.message || e}`);
  await rm(TMP, { recursive: true, force: true });
  process.exit(2);
}
await rm(TMP, { recursive: true, force: true });

console.log(exit === 0 ? '\nparty-split: green' : '\nparty-split: RED');
process.exit(exit);
