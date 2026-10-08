// ============================================================================
// tests/world-tick-vigour-scale.mjs — A TIRED HUNT PAYS THE SAME, HOWEVER OFTEN IT IS SETTLED
//
//   node tests/world-tick-vigour-scale.mjs            green = the tick pays what the one-span accrue pays
//   node tests/world-tick-vigour-scale.mjs --mutate   each fix reverted in a copy: its arm must go red (exit 0)
//
// THE MEASUREMENT (production, read-only, 2026-10-05). QA slot 1, Slime, no
// food, already past its Vigour budget (spent 796 of 720 minutes on the UTC day
// 2026-9-29). The one usable combat parity interval, 06:13:52.663 -> 16:12:34.349
// (9.98 h): deaths 9/9 and ate 0/0 exact, but the tick shadow proposed -71.8%
// gold and -35.5% xp against the accrue row. The Coordinator's hypothesis — the
// window alignment is not re-anchored when a knockout ends — is REFUTED by the
// shadow rows themselves: all nine resumes start swinging on `recovering_until`
// to the millisecond. Two causes, both in the Vigour arithmetic:
//
//   V1  `floor(raw x vigMult)` PER SETTLE WINDOW. A 10 s window earning 1 gold
//       at mult 0.25 paid 0, every window. A 200-seed replay of the real span:
//       gold -54.7%, xp -21.9% with every un-tired field inside 0.5%. Fixed by
//       src/core/hunt.js vigourScale (a dithered floor off a salted stream).
//   V2  THE CHAIN NEVER SPENT ITS BUDGET. A 10 s window charges `addMin = 0,
//       remMs = 10000`, and `countersFromProgress` read only the minutes, so a
//       character crossing the line mid-chain kept paying full rate: +269% gold
//       on a replay that starts 20 minutes under the line. Fixed in
//       tick-contract.js (both rows summed, one division) and the shadow carrier.
//
// The kill gap on that interval (68 vs 79, -13.9%) is NOT a third defect: a
// death-bearing span's kill count is set by how long each fight lasts between
// knockouts, which is RNG, and the replay measures the decomposed chain at
// -0.26% over 200 seeds (no vigour) with a per-interval sd of ~12 kills. W1 asserts
// Security's combat bar (SEC_WORLD_TICK_ARM_2026-10-05): deaths/food ±1, ticks/kills/gold/xp ±10%.
//
// Exit: 0 green (or, under --mutate, every mutant caught) · 1 red · 2 harness.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');

/* ── THE MUTANTS. Each reverts ONE fix, in a COPY of the function directory and
   src/ (the same isolation tests/world-tick-perks-parity.mjs uses), and names
   the arm that must go red. A marker that is gone is a harness failure (2): a
   mutation that cannot be applied proves nothing. */
const MUTANTS = [
  /* V3 (b563): a tired span fought at the RAW xp's levels while the chain
     re-reads the banked ones — -14..-18% ticks/kills/gold/xp on W1 once a
     defence level is worth 0.02 monster accuracy. Reverting the banked-skills
     view must turn W5 red.
     Re-anchored after the Vigour-line split (e22f0f4e): the view is keyed on
     `vigDry` (any instant past the line) instead of the blended `vigMult`;
     `fightSkills === state.skills` still switches off both the banked-gain
     fold and the Hitpoints ceiling, so this edit restores the b563 defect
     exactly. Its arm moved W1 -> W5: once xp is paid on damage dealt (b565) a
     level-16 hunter gains too little in 10 h for the defect to leave W1's ±10%
     bar (measured -7.5% ticks / -9.4% kills, vs -13.7% before) — W5 is the
     fixture where levels move. */
  {
    name: 'V3 tired fight levels on unbanked xp', arm: 'W5',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [
      ['const fightSkills = vigDry ? { ...skills0 } : state.skills;',
        'const fightSkills = state.skills;'],
    ],
  },
  {
    name: 'V1 floor per window', arm: 'W1',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [
      ['vigourScale(raw, vigMult, vigRng)', 'Math.floor(raw * vigMult)'],
      /* The Vigour-line split (e22f0f4e) scales only the gold earned past the
         line; flooring THAT per window is the same V1 defect. */
      ['vigourScale(goldAll - goldFull, vigMult, vigRng)',
        'Math.floor((goldAll - goldFull) * vigMult)'],
    ],
  },
  {
    name: 'V2 remainder unread', arm: 'W3',
    file: 'supabase/functions/hr-accrue/tick-contract.js',
    edits: [["if (op.kind === 'daily' && op.key === VIGOUR_REMAINDER_KEY) vigourRemMs += add;", '']],
  },
  {
    name: 'V2 remainder not carried', arm: 'W4',
    file: 'supabase/functions/hr-accrue/tick-contract.js',
    edits: [['if (chain.vigourRemMs) st.vigour_rem_ms = Math.floor(chain.vigourRemMs);', '']],
  },
  /* SEC_WORLD_TICK_VIGOUR_2026-10-05 (a): the charge billed `grantMs`, including
     the sub-swing tail the next window re-simulates — 132 min for 120 (W3). */
  {
    name: 'tail charged twice', arm: 'W3',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [['vigourCharge(grantMs - deferredMs)', 'vigourCharge(grantMs)']],
  },
  {
    name: 'tail charged twice (carried)', arm: 'W4',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [['vigourCharge(grantMs - deferredMs)', 'vigourCharge(grantMs)']],
  },
  /* SEC (same review, LOW): a non-finite or negative multiplier paid the full
     rested `r`. The fail-closed lines removed must turn W2 red. */
  {
    name: 'vigourScale fails open', arm: 'W2',
    file: 'src/core/hunt.js',
    edits: [
      ["  const n = typeof mult === 'number' ? mult : NaN;\n  if (!Number.isFinite(n)) return 0;\n  const m = Math.min(1, Math.max(0, n));\n  if (m === 1) return r;",
        '  const m = Number(mult);\n  if (!(m >= 0) || m >= 1) return r;'],
    ],
  },
];

async function load(base) {
  const at = (p) => import(pathToFileURL(join(base, p)).href);
  const [acc, combat, contract, rng, hunt] = await Promise.all([
    at('supabase/functions/hr-accrue/accrual.js'),
    at('supabase/functions/hr-accrue/tick-combat.js'),
    at('supabase/functions/hr-accrue/tick-contract.js'),
    at('src/core/rng.js'),
    at('src/core/hunt.js'),
  ]);
  const env = await at('supabase/functions/hr-accrue/envelope.js');
  return { ...acc, ...combat, ...contract, ...rng, hunt, engineStateOf: env.engineStateOf };
}

async function mutantBase(m) {
  const base = await mkdtemp(join(tmpdir(), 'hr-wtvs-'));
  await cp(join(ROOT, 'supabase', 'functions', 'hr-accrue'),
    join(base, 'supabase', 'functions', 'hr-accrue'), { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  const path = join(base, m.file);
  let src = await readFile(path, 'utf8');
  for (const [from, to] of m.edits) {
    if (!src.includes(from)) {
      console.error(`--mutate ${m.name}: marker gone from ${m.file} — "${from}"`);
      process.exit(2);
    }
    src = src.split(from).join(to);
  }
  await writeFile(path, src, 'utf8');
  return base;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

/* THE 09-29 INTERVAL'S STARTING STATE, reconstructed from read-only journal
   rows (player_ledger 26553..26572, hr_tick_shadow 7760, player_progress) — an
   in-memory replay input, never written anywhere. Skills are today's xp minus
   every later credit; max_hp is the hitpoints LEVEL at that xp (16), which the
   resume_hp 7 on every death row confirms; recovering_until is the shadow's
   re-seed off the real row. The user id is synthetic: the seed is the offline
   `offlineSeedFor` stream (hr_seed's secret is not readable and must not be). */
const SPAN_FROM = Date.parse('2026-09-29T06:13:52.663Z');
const SPAN_TO = Date.parse('2026-09-29T16:12:34.349Z');
function qa0929(L, i, vigour) {
  return {
    userId: `00000000-0000-4000-8000-${String(0x929000 + i).padStart(12, '0')}`,
    slot: 1, shard: 0, version: 70,
    activeKind: 'combat', activeId: 'slime',
    activeSinceMs: Date.parse('2026-09-26T17:47:45.564Z'),
    accruedToMs: SPAN_FROM, accruedToText: L.pgTimestamptzText(SPAN_FROM),
    capMs: 43200000,
    hp: 7, maxHp: 16, gold: 6000,
    skills: { attack: 2703, defense: 2696, strength: 2696, hitpoints: 3042, woodcutting: 280, farming: 112 },
    inventory: { bones: 100, slime_gel: 400, sticky_core: 10, bone_key: 1, normal_log: 56 },
    equipment: { weapon: 'bronze_sword' },
    fight: { hp: 8, kills: 0, monster: 'slime' },
    consecFalls: 1,
    recoveringUntilMs: Date.parse('2026-09-29T07:07:09.463Z'),
    ammoCarry: null,
    autoEatEnabled: true, autoEatFood: 'cooked_shrimp', autoEatPct: 25,
    deathsTodayBefore: 17, deathsLifetimeBefore: 72,
    combatXpAccruedToMs: 0, hearthfindReady: false, enchant: null, combatStyle: {},
    buffs: [],
    vigour: vigour || { day_key: '2026-9-29', spent_min: 796, budget_min: 720, offline_cap_ms: 43200000, refills: 0 },
    bestiaryKills: { slime: 350 },
    perks: null,
  };
}

/* A NO-DEATH CHARACTER, so the payout is a smooth function of time and the
   comparison has almost no variance: the ordinary goblin grind fixture the
   combat parity guard already uses, put 20 minutes under its Vigour line. */
function goblinUnderLine(L, sessions, fromMs, spentMin) {
  const s = L.atSpanOffline(sessions.find((x) => x.activeId === 'goblin'), fromMs);
  s.vigour = { day_key: '2026-9-29', spent_min: spentMin, budget_min: 720, offline_cap_ms: 43200000, refills: 0 };
  return s;
}

/* A FRESH FIGHTER, WHOLLY TIRED: level-1 attack/strength/defence, Hitpoints
   10, a bronze sword on Slimes with a deep stack of shrimp under auto-eat, so
   it never dies and every tick is a swing. At these levels a tired span's raw
   xp crosses many levels its banked quarter does not, which is exactly the
   gap V3 fought in. `fight: {}` is a real row's empty checkpoint (null would
   mean "no column" and restart the fight every 10 s window). Synthetic ids;
   in-memory only. */
const FRESH_FROM = Date.UTC(2026, 8, 29, 6, 0, 0);
const FRESH_TO = FRESH_FROM + 2 * 3600000;
function freshTired(L, i) {
  return {
    userId: `00000000-0000-4000-8000-${String(0x5c0000 + i).padStart(12, '0')}`,
    slot: 1, shard: 0, version: 70,
    activeKind: 'combat', activeId: 'slime',
    activeSinceMs: FRESH_FROM - 3600000,
    accruedToMs: FRESH_FROM, accruedToText: L.pgTimestamptzText(FRESH_FROM),
    capMs: 43200000,
    hp: 10, maxHp: 10, gold: 0,
    skills: { attack: 0, defense: 0, strength: 0, hitpoints: 1154 },
    inventory: { cooked_shrimp: 5000 },
    equipment: { weapon: 'bronze_sword' },
    fight: {},
    consecFalls: 0, recoveringUntilMs: 0, ammoCarry: null,
    autoEatEnabled: true, autoEatFood: 'cooked_shrimp', autoEatPct: 25,
    deathsTodayBefore: 0, deathsLifetimeBefore: 0,
    combatXpAccruedToMs: 0, hearthfindReady: false, enchant: null, combatStyle: {},
    buffs: [],
    vigour: { day_key: '2026-9-29', spent_min: 796, budget_min: 720, offline_cap_ms: 43200000, refills: 0 },
    bestiaryKills: {},
    perks: null,
  };
}

function accrueOnce(L, c, fromMs, toMs) {
  return L.computeAccrual({
    userId: c.userId, slot: c.slot, nowMs: toMs, accruedToMs: fromMs,
    activeSinceMs: c.activeSinceMs, activeKind: c.activeKind, activeId: c.activeId, capMs: c.capMs,
    seed: L.offlineSeedFor(c.userId, c.slot, c.accruedToText),
    ...L.engineStateOf(c), bestiaryKills: c.bestiaryKills,
    items: L.COMBAT_CATALOGUES.items, monsters: L.COMBAT_CATALOGUES.monsters,
    perks: c.perks, companionXpBacked: undefined, attended: null,
    caller: 'accrue', callerAuthority: L.CALLER_AUTHORITY,
  });
}

const sumMap = (m) => Object.values(m || {}).reduce((a, b) => a + Number(b), 0);

// ═══════════════════════════════════════════════════════════════════════════
// THE ARMS
// ═══════════════════════════════════════════════════════════════════════════

const ARMS = {
  /* W1 — the 09-29 interval through both paths, 48 seeds. Deaths and meals
     EXACT per run; gold and xp per kill, summed over the seeds, within ±10%
     (Security's 8c band). */
  W1(L, fail) {
    const N = 48;
    const a = { gold: 0, xp: 0, kills: 0 }; const t = { gold: 0, xp: 0, kills: 0 };
    for (let i = 0; i < N; i++) {
      const one = accrueOnce(L, qa0929(L, i), SPAN_FROM, SPAN_TO);
      if (!one.accrued) return fail('W1', `harness: the one-span accrue did not settle (${one.reason})`);
      const run = L.settleCombatSession(qa0929(L, i), SPAN_FROM, SPAN_TO,
        { cadenceMs: 10000, flushMs: 90000, holder: 'guard' });
      const v = L.intentValue(run.intents);
      const m = one.delta.journal.meta;
      const oneDeaths = (one.delta.deaths || []).length;
      /* Security's combat bar (SEC_WORLD_TICK_ARM_2026-10-05): deaths and
         food within ±1 per probe; ticks/kills/gold/xp ±10% in aggregate. */
      if (Math.abs(v.deaths - oneDeaths) > 1) fail('W1', `seed ${i}: the tick filed ${v.deaths} deaths, the accrue ${oneDeaths}`);
      if (Math.abs(v.ate - Number(m.ate || 0)) > 1) fail('W1', `seed ${i}: the tick ate ${v.ate}, the accrue ${m.ate}`);
      a.ticks = (a.ticks || 0) + Number(m.ticks || 0); t.ticks = (t.ticks || 0) + v.ticks;
      a.gold += Number(one.delta.gold || 0); t.gold += v.gold;
      a.xp += sumMap(one.delta.xp); t.xp += sumMap(v.xp);
      a.kills += Number(m.kills || 0); t.kills += v.kills;
    }
    if (!(a.kills > 0 && t.kills > 0)) return fail('W1', 'harness: no kills on either path');
    /* PER KILL. How many kills a death-bearing span lands is set by how long
       each fight lasts between knockouts (RNG, ±12 a run); what a kill PAYS is
       the rounding under test. Broken: -55% gold / -20% xp a kill. */
    const perKill = (k) => 100 * ((t[k] / t.kills) / (a[k] / a.kills) - 1);
    for (const k of ['gold', 'xp']) {
      if (!(Math.abs(perKill(k)) <= 10)) {
        fail('W1', `a tired 9.98 h hunt settled every 10 s paid ${perKill(k).toFixed(1)}% ${k} PER KILL against `
          + `the same span settled once (${t[k]}/${t.kills} vs ${a[k]}/${a.kills} over ${N} seeds). The tired `
          + 'multiplier is being floored per window, so the payout is a function of the settle cadence (V1).');
      }
    }
    const agg = (k) => 100 * (t[k] - a[k]) / a[k];
    for (const k of ['ticks', 'kills', 'gold', 'xp']) {
      if (!(Math.abs(agg(k)) <= 10)) {
        fail('W1', `aggregate ${k} over ${N} seeds: tick ${t[k]} vs accrue ${a[k]} (${agg(k).toFixed(1)}%), `
          + 'outside the ±10% combat bar');
      }
    }
    const kp = agg('kills');
    return `${N} seeds of the real 09-29 span: per kill gold ${perKill('gold').toFixed(1)}%, `
      + `xp ${perKill('xp').toFixed(1)}%; ticks ${agg("ticks").toFixed(1)}%, kills ${kp.toFixed(1)}%; deaths and meals within ±1`;
  },

  /* W2 — vigourScale's own contract: bounded, never above the rested payout,
     no draw when the product is integral, and unbiased under subdivision. */
  W2(L, fail) {
    const { vigourScale } = L.hunt;
    const noDraw = { next() { throw new Error('drew'); } };
    for (const mult of [0.25, 0.5, 0.999]) {
      const r = L.createRng(7);
      for (let raw = 0; raw <= 60; raw++) {
        const got = vigourScale(raw, mult, r);
        const x = raw * mult;
        if (!(got >= Math.floor(x) && got <= Math.ceil(x) && got <= raw)) {
          fail('W2', `vigourScale(${raw}, ${mult}) = ${got}, outside [floor, ceil] of ${x} or above ${raw}`);
        }
      }
    }
    try {
      if (vigourScale(9, 1, noDraw) !== 9 || vigourScale(8, 0.25, noDraw) !== 2 || vigourScale(0, 0.25, noDraw) !== 0) {
        fail('W2', 'vigourScale changed an integral product');
      }
    } catch (e) { fail('W2', `vigourScale drew on an integral product (${e.message})`); }
    /* FAIL CLOSED (SEC_WORLD_TICK_VIGOUR_2026-10-05, LOW). A multiplier that is
       not a finite Number pays 0 (the old floor's answer), never the rested
       `raw`; a finite one is clamped into [0, 1]. Each of these used to pay 9. */
    const closed = [NaN, undefined, null, -0.5, -Infinity, Infinity, '0.5', {}];
    for (const bad of closed) {
      let got;
      try { got = vigourScale(9, bad, noDraw); } catch (e) { got = `threw ${e.message}`; }
      if (got !== 0) fail('W2', `vigourScale(9, ${String(bad)}) = ${got}; a non-finite or negative multiplier must pay 0`);
    }
    try {
      if (vigourScale(9, 1.5, noDraw) !== 9) fail('W2', 'vigourScale(9, 1.5) must clamp to the rested 9, never above');
      if (vigourScale(9, 0, noDraw) !== 0) fail('W2', 'vigourScale(9, 0) must pay 0');
    } catch (e) { fail('W2', `vigourScale drew on a clamped integral product (${e.message})`); }
    const r = L.createRng(11);
    let paid = 0; const windows = 40000;
    for (let i = 0; i < windows; i++) paid += vigourScale(1, 0.25, r);
    const want = windows * 0.25; const sd = Math.sqrt(windows * 0.25 * 0.75);
    if (Math.abs(paid - want) > 4 * sd) {
      fail('W2', `${windows} one-gold windows at 0.25 paid ${paid}, want ${want} ± ${Math.round(4 * sd)}`);
    }
    return `bounded, integral products untouched, ${windows} one-gold windows paid ${paid} (want ${want})`;
  },

  /* W3 — the chain spends its own budget. A no-death goblin grind starting 20
     minutes under the line, 2 h at the 10 s cadence: the chain's spent_min must
     be exactly what the engine charged, and the payout must match the one-span
     accrue's (the broken chain stays rested: +150% or more). */
  W3(L, fail, ctx) {
    const from = Date.UTC(2026, 8, 29, 8, 0, 0); const to = from + 2 * 3600000;
    const one = accrueOnce(L, goblinUnderLine(L, ctx.sessions, from, 700), from, to);
    const run = L.settleCombatSession(goblinUnderLine(L, ctx.sessions, from, 700), from, to,
      { cadenceMs: 10000, flushMs: 90000, holder: 'guard' });
    let chargedMs = 0;
    for (const w of run.results) {
      for (const op of (w.res.accrued && w.res.delta.progress) || []) {
        if (op.kind !== 'daily') continue;
        if (op.key === L.hunt.VIGOUR_PROGRESS_KEY) chargedMs += op.add * 60000;
        if (op.key === L.hunt.VIGOUR_REMAINDER_KEY) chargedMs += op.add;
      }
    }
    const spent = run.char.vigour && run.char.vigour.spent_min;
    const want = 700 + Math.floor(chargedMs / 60000);
    if (spent !== want) {
      fail('W3', `after ${run.settled} ten-second windows charging ${(chargedMs / 60000).toFixed(1)} minutes `
        + `the chain believes ${spent} minutes are spent, want ${want}. A window files its charge as a `
        + 'quotient and a remainder and the chain read only the quotient, so the budget never ran out (V2).');
    }
    /* AND THE CHARGE IS THE TIME CONSUMED, to the millisecond
       (SEC_WORLD_TICK_VIGOUR_2026-10-05 (a)). Each window leaves its half-wound
       swing open for the next one to re-simulate; charging `grantMs` billed
       that tail twice — 132 minutes for this 120-minute chain. */
    const consumedMs = run.watermarkMs - from;
    if (chargedMs !== consumedMs) {
      fail('W3', `${run.settled} ten-second windows consumed ${(consumedMs / 60000).toFixed(3)} minutes `
        + `and charged ${(chargedMs / 60000).toFixed(3)} — the charge billed the sub-swing tail the next `
        + 'window re-simulates (charge grantMs - deferredMs).');
    }
    const v = L.intentValue(run.intents);
    const g = 100 * (v.gold - one.delta.gold) / one.delta.gold;
    const x = 100 * (sumMap(v.xp) - sumMap(one.delta.xp)) / sumMap(one.delta.xp);
    if (!(Math.abs(g) <= 10 && Math.abs(x) <= 10)) {
      fail('W3', `crossing the Vigour line mid-chain the tick paid gold ${g.toFixed(1)}% / xp ${x.toFixed(1)}% `
        + 'against the one-span accrue — the chain is not spending its budget (V2).');
    }
    return `spent ${spent} = 700 + ${Math.floor(chargedMs / 60000)} charged; gold ${g.toFixed(1)}%, xp ${x.toFixed(1)}%`;
  },

  /* W4 — the shadow carrier keeps the remainder across a fire. Two fires of 30
     minutes through shadowStateOf/applyShadowState must end on the spent_min
     one 60-minute chain ends on. */
  W4(L, fail, ctx) {
    const from = Date.UTC(2026, 8, 29, 8, 0, 0); const mid = from + 1800000; const to = from + 3600000;
    const opts = { cadenceMs: 10000, flushMs: 90000, holder: 'guard' };
    const whole = L.settleCombatSession(goblinUnderLine(L, ctx.sessions, from, 0), from, to, opts);
    const first = L.settleCombatSession(goblinUnderLine(L, ctx.sessions, from, 0), from, mid, opts);
    const carrier = L.shadowStateOf(first.char, { baseVersion: first.char.version, atMs: first.watermarkMs });
    const s2 = L.applyShadowState(goblinUnderLine(L, ctx.sessions, from, 0), carrier);
    s2.accruedToMs = first.watermarkMs;
    s2.accruedToText = first.watermarkText;
    const second = L.settleCombatSession(s2, first.watermarkMs, to, opts);
    const a = whole.char.vigour.spent_min; const b = second.char.vigour.spent_min;
    /* THE HOUR COSTS THE TIME IT CONSUMED (2026-10-05 (a): it cost 66). */
    for (const [label, run] of [['one chain', whole], ['two carried fires', second]]) {
      const want = Math.floor((run.watermarkMs - from) / 60000);
      if (run.char.vigour.spent_min !== want) {
        fail('W4', `${label} consumed ${((run.watermarkMs - from) / 60000).toFixed(3)} minutes and ends on `
          + `spent_min ${run.char.vigour.spent_min}, want ${want} — the sub-swing tail is charged twice.`);
      }
    }
    if (a !== b || !(a > 0)) {
      fail('W4', `one 60-minute chain ends on spent_min ${a}; the same hour as two fires through the `
        + `shadow carrier ends on ${b}. The carrier dropped the sub-minute charge (V2).`);
    }
    return `one chain and two carried fires both end on spent_min ${a}`;
  },

  /* W5 — a tired hunt fights at the levels it BANKS (V3). The fresh fighter,
     2 h wholly past the line, 8 seeds: the 10 s chain re-reads banked skills
     every window, so the one-span accrue must fight at them too. Same ±10%
     aggregate combat bar as W1 (SEC_WORLD_TICK_ARM_2026-10-05); deaths ±1 per
     seed. MEALS are held to the aggregate bar, not ±1 per seed: this fighter
     eats ~140 times in 2 h on two independent RNG streams (W1's fixture
     carries no food, so its ±1 never bites), and the engine has no regen, so
     a fighter that levels must take damage and eat. Measured: fixed -1.8%
     kills; the b563 defect -33% kills / -31% xp. */
  W5(L, fail) {
    const N = 8;
    const a = { ticks: 0, kills: 0, xp: 0, ate: 0 }; const t = { ticks: 0, kills: 0, xp: 0, ate: 0 };
    for (let i = 0; i < N; i++) {
      const one = accrueOnce(L, freshTired(L, i), FRESH_FROM, FRESH_TO);
      if (!one.accrued) return fail('W5', `harness: the one-span accrue did not settle (${one.reason})`);
      const run = L.settleCombatSession(freshTired(L, i), FRESH_FROM, FRESH_TO,
        { cadenceMs: 10000, flushMs: 90000, holder: 'guard' });
      const v = L.intentValue(run.intents);
      const m = one.delta.journal.meta;
      const oneDeaths = (one.delta.deaths || []).length;
      if (Math.abs(v.deaths - oneDeaths) > 1) fail('W5', `seed ${i}: the tick filed ${v.deaths} deaths, the accrue ${oneDeaths}`);
      a.ate += Number(m.ate || 0); t.ate += v.ate;
      a.ticks += Number(m.ticks || 0); t.ticks += v.ticks;
      a.kills += Number(m.kills || 0); t.kills += v.kills;
      a.xp += sumMap(one.delta.xp); t.xp += sumMap(v.xp);
    }
    if (!(a.kills > 0 && t.kills > 0)) return fail('W5', 'harness: no kills on either path');
    const agg = (k) => 100 * (t[k] - a[k]) / a[k];
    if (!(a.ate > 0 && t.ate > 0)) return fail('W5', 'harness: the fresh fighter never ate on one path');
    for (const k of ['ticks', 'kills', 'xp', 'ate']) {
      if (!(Math.abs(agg(k)) <= 10)) {
        fail('W5', `a fresh fighter hunting 2 h tired: ${k} tick ${t[k]} vs accrue ${a[k]} (${agg(k).toFixed(1)}%) `
          + `over ${N} seeds. The one span fought at the RAW xp's levels while the chain re-reads the banked `
          + 'ones — a tired fight must level on the xp it banks (V3).');
      }
    }
    return `${N} seeds, fresh fighter 2 h tired: ticks ${agg('ticks').toFixed(1)}%, kills ${agg('kills').toFixed(1)}%, `
      + `xp ${agg('xp').toFixed(1)}%, meals ${agg('ate').toFixed(1)}%`;
  },
};

async function runArms(L, only) {
  const fails = [];
  const fail = (arm, msg) => { fails.push(`${arm}: ${msg}`); };
  const ctx = { sessions: L.loadSessions() };
  for (const [name, arm] of Object.entries(ARMS)) {
    if (only && name !== only) continue;
    const before = fails.length;
    let note = '';
    try { note = arm(L, fail, ctx) || ''; } catch (e) { fail(name, `threw: ${e.stack || e.message}`); }
    if (fails.length === before) console.log(`  ok  ${name}  ${note}`);
  }
  return fails;
}

async function withFixtures(base) {
  const L = await load(base);
  const svc = await import(pathToFileURL(join(ROOT, 'services', 'world-tick', 'combat.js')).href);
  /* The fixture half reads node:fs and lives in services/ (never in a payload);
     it is the same file for every engine copy, so it is taken from ROOT. */
  L.loadSessions = () => svc.loadCombatSessions();
  L.atSpanOffline = (s, fromMs) => {
    const c = svc.atSpan(s, fromMs);
    c.accruedToText = L.pgTimestamptzText(fromMs);
    return c;
  };
  return L;
}

async function main() {
  if (!MUTATE) {
    console.log('world-tick-vigour-scale');
    const fails = await runArms(await withFixtures(ROOT));
    for (const f of fails) console.log(`  ✗ ${f}`);
    console.log(fails.length ? `world-tick-vigour-scale: RED (${fails.length})` : 'world-tick-vigour-scale: green');
    process.exit(fails.length ? 1 : 0);
  }
  console.log('world-tick-vigour-scale --mutate');
  let escaped = 0;
  for (const m of MUTANTS) {
    const fails = await runArms(await withFixtures(await mutantBase(m)), m.arm);
    const caught = fails.some((f) => f.startsWith(`${m.arm}:`));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  ${m.name} -> ${m.arm}${caught ? '' : ' stayed green'}`);
    if (caught) console.log(`           ${fails[0].slice(0, 220)}`);
    if (!caught) escaped++;
  }
  console.log(escaped ? `--mutate: ${escaped} mutant(s) ESCAPED` : '--mutate: every mutant caught');
  process.exit(escaped ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
