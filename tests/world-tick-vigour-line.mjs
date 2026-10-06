// ============================================================================
// tests/world-tick-vigour-line.mjs — A SPAN THAT CROSSES THE VIGOUR LINE PAYS
// IN TIME ORDER, HOWEVER OFTEN IT IS SETTLED
//
//   node tests/world-tick-vigour-line.mjs            green = one span and the 90 s chain agree
//   node tests/world-tick-vigour-line.mjs --mutate   each mutant must turn its arm red (exit 0)
//
// THE MEASUREMENT (production, read-only, 2026-10-06; edge 6205e4e0). The
// first fully-counted combat probes after the b563 defence curve, QA slot 1,
// Slime, no food, three knockouts per 4 h (64-minute rung):
//
//   probe 10  12:39:34 -> 16:40:48  one span 1161 ticks  chain 1649  (+42 %)
//   probe  8  08:39:48 -> 12:41:02  one span  436 ticks  chain  928  (+113 %)
//
// Both inputs are reconstructed EXACTLY, from read-only rows: the envelope is
// player_state/player_skills at version 103 (unchanged across both spans) and
// the carrier at span_from is hr_tick_ownership.shadow_state minus every later
// hr_tick_shadow delta. applyShadowState(ENV, carrier@16:39:19) reproduces the
// stored input of probe 12 key for key, which is the check that the
// reconstruction is the input the probes ran on. Replayed through the shipped
// engine (payload hash equal to the live 6205e4e0), 200-500 seeds per side:
//
//   probe 10 (WHOLLY past the line): one 1124 ± 213, chain 1121 ± 212 ticks,
//     every field within 0.3 %. The live one span sits at z +0.2 and the live
//     chain at z +2.5: chance, in a probe whose ticks are three fight lengths
//     of ten 1-damage hits at a 5 % floor accuracy (per-probe sd of the
//     difference 27 %). VL2 pins that reading.
//   probe 8 (CROSSES the line at ~10:52): chain over one +17.6 % ticks,
//     +20.2 % kills, +15.1 % gold, +15.6 % xp (se ~2.6 %) — a DEFECT. With the
//     Vigour block removed the two agree (+1.0 % ± 1.9 %), so it is Vigour:
//     the one span priced the whole window at ONE time-weighted blend, while
//     the design (HUNTS_AND_ANALYZER §4.3) and the chain spend the budget in
//     time order. The knockout cycle makes earning non-uniform in time (the
//     span opens with 51 minutes of recovery that burn full-rate minutes), so
//     the blend under-paid the two rested fights and over-paid the tired one,
//     and since b563 it also LEVELLED the fight at the blend. That is the
//     live accrue path. Fixed in accrual.js (`vigMultAt`): each payout reads
//     1 or VIGOUR_DRY_MULT at the tick it was earned on. After: +0.7 % ± 1.7 %
//     ticks, -0.1 % ± 1.4 % gold and xp (500 seeds).
//
// The user id is synthetic and the seeds are the offline `hashSeed` stream
// (hr_seed's secret is not readable and must not be). Exit: 0 green (or,
// under --mutate, every mutant caught) · 1 red · 2 harness.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
/* Seeds per side. Deterministic (a fixed seed set), so a pass is a pass; 150
   puts the post-fix worst field ~3 standard errors inside the bar and the
   pre-fix defect ~3 outside it. */
const N = 300;
/* Security's combat bar is ±10 % on a 12-probe aggregate (SEC_WORLD_TICK_ARM);
   these are EXPECTATIONS over 150 seeds of one input, so the band is tighter. */
const BAR_PCT = 6;
const Z_MAX = 3.29;     // two-sided p = 0.001

const MUTANTS = [
  {
    name: 'VL-M1 one blend for the whole span (the engine before this fix)', arm: 'VL1',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [
      ['const vigLineMs = vigDry ? credit.fromMs + vigSplit.fullMs : Infinity;',
        'const vigLineMs = vigDry ? credit.fromMs : Infinity;\n'
        + '  const vigBlend = vigDry ? (vigSplit.fullMs + vigSplit.dryMs * VIGOUR_DRY_MULT) / (vigSplit.fullMs + vigSplit.dryMs) : 1;'],
      ['const vigMultAt = (atMs) => (vigDry && atMs >= vigLineMs ? VIGOUR_DRY_MULT : 1);',
        'const vigMultAt = (atMs) => (vigDry && atMs >= vigLineMs ? vigBlend : 1);'],
      ['const vigMult = VIGOUR_DRY_MULT;', 'const vigMult = vigBlend;'],
    ],
  },
  {
    name: 'VL-M2 the dry part at the FRONT of the window', arm: 'VL1',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [
      ['const vigMultAt = (atMs) => (vigDry && atMs >= vigLineMs ? VIGOUR_DRY_MULT : 1);',
        'const vigMultAt = (atMs) => (vigDry && atMs < credit.fromMs + vigSplit.dryMs ? VIGOUR_DRY_MULT : 1);'],
    ],
  },
  {
    name: 'VL-M3 gold scaled whole, not split at the line', arm: 'VL1',
    file: 'supabase/functions/hr-accrue/accrual.js',
    edits: [
      ['const goldFull = (!vigDry || vigGoldAtLine === null) ? goldAll : Math.min(goldAll, vigGoldAtLine);',
        'const goldFull = !vigDry ? goldAll : 0;'],
    ],
  },
];

async function mutantBase(m) {
  const base = await mkdtemp(join(tmpdir(), 'hr-wtvl-'));
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

async function load(base) {
  const at = (p) => import(pathToFileURL(join(base, p)).href);
  const [probe, combat, contract, rng] = await Promise.all([
    at('supabase/functions/hr-accrue/tick-probe.js'),
    at('supabase/functions/hr-accrue/tick-combat.js'),
    at('supabase/functions/hr-accrue/tick-contract.js'),
    at('src/core/rng.js'),
  ]);
  return { ...probe, ...combat, ...contract, ...rng };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE TWO INPUTS (see the header for how they were reconstructed)
// ═══════════════════════════════════════════════════════════════════════════

/* hr_state_of at version 103, as the tick's session builder sees it before the
   shadow overlay (sessionFromRoster). Pointer/watermark keys are overwritten
   per window by `session()`. */
const ENV = Object.freeze({
  slot: 1, shard: 0, version: 103, capMs: 43200000,
  activeKind: 'combat', activeId: 'slime', activeSinceMs: 1790444865564,
  hp: 9, maxHp: 21, gold: 7028, fight: {}, consecFalls: 1, recoveringUntilMs: 1791267232800,
  skills: { magic: 0, attack: 5662, mining: 0, prayer: 0, ranged: 0, cooking: 0, defense: 5656,
    farming: 112, fishing: 0, crafting: 0, smithing: 0, strength: 5655, hitpoints: 5247,
    stonemason: 0, woodcutting: 280, bountyHunter: 0, runecrafting: 0 },
  inventory: { bones: 260, bone_key: 1, slime_gel: 868, normal_log: 56, carrot_seed: 3, sticky_core: 23, turnip_seed: 18 },
  equipment: { weapon: 'bronze_sword' }, enchant: {}, combatStyle: {}, traits: ['auto_eat'],
  buffs: [{ from: null, type: 'gather_speed', scale: 1, until: '2026-09-26T17:50:11.475001+00:00', magnitude: 1, remaining_ms: 0 }],
  perks: { ok: true, plots: {}, rooms: {}, castle: null, clanPerks: {}, companion: null, renownAllXp: 0, propertyTier: 0, unlockedRecipes: {} },
  vigour: { level: 25, day_key: '2026-10-6', refills: 0, dry_mult: 0.25, grant_min: 720, spent_min: 416,
    bought_min: 0, budget_min: 720, refill_min: 120, ceiling_min: 1320, refills_max: 5, refills_left: 5,
    remaining_min: 304, next_refill_gold: 12750 },
  huntStop: null, huntStance: null, ammoCarry: null, toolCarry: {},
  autoEatEnabled: true, autoEatFood: 'cooked_shrimp', autoEatPct: 25, hearthfindReady: true,
  combatXpAccruedToMs: 1791214224985, bestiaryKills: { slime: 1350 },
  deathsTodayBefore: 11, deathsLifetimeBefore: 115,
});

const PROBES = Object.freeze({
  /* hr_tick_probe id 8: crosses the Vigour line (spent 416 + 171 at open, budget 720). */
  p8: {
    fromText: '2026-10-06T08:39:48.505+00:00', to: '2026-10-06T12:41:02.905Z',
    carrier: { v: 1, base_version: 103, hp: 9, xp: { attack: 375, defense: 375, strength: 375, hitpoints: 287 }, gold: 110,
      items: { bones: 13, slime_gel: 57, sticky_core: 3 }, deaths_today: 3, deaths_lifetime: 3, vigour_rem_ms: 10300800,
      bestiary_kills: { slime: 60 }, fight: { hp: 8, kills: 0, monster: 'slime' }, consec_falls: 1,
      recovering_until: 1791279062905, ammo_carry: null, tool_carry: {} },
  },
  /* hr_tick_probe id 10: wholly past the line (spent 416 + 411 at open). */
  p10: {
    fromText: '2026-10-06T12:39:34.105+00:00', to: '2026-10-06T16:40:48.505Z',
    carrier: { v: 1, base_version: 103, hp: 10, xp: { attack: 1993, defense: 1994, strength: 2006, hitpoints: 1523 }, gold: 624,
      items: { bones: 98, slime_gel: 297, sticky_core: 10 }, deaths_today: 6, deaths_lifetime: 6, vigour_rem_ms: 24686400,
      bestiary_kills: { slime: 511 }, fight: { hp: 8, kills: 0, monster: 'slime' }, consec_falls: 1,
      recovering_until: 1791292810105, ammo_carry: null, tool_carry: {} },
    /* What production journalled: hr_tick_probe.result and the sum of the 163
       hr_tick_shadow windows of the span. */
    live: {
      one: { ticks: 1161, kills: 567, gold: 285, xp: 895 * 3 + 673 },
      chain: { ticks: 1649, kills: 829, gold: 420, xp: 1320 + 1316 + 1322 + 996 },
    },
  },
});

const FIELDS = ['ticks', 'kills', 'gold', 'xp'];
const sumMap = (m) => Object.values(m || {}).reduce((a, b) => a + Number(b), 0);

function session(L, i, markMs, markText, carrier) {
  const s = JSON.parse(JSON.stringify(ENV));
  s.userId = `00000000-0000-4000-8000-${String(0x610000 + i).padStart(12, '0')}`;
  s.accruedToMs = markMs;
  s.accruedToText = markText;
  return L.applyShadowState(s, JSON.parse(JSON.stringify(carrier)));
}

/* THE ONE SPAN, through the probe's own driver (tick-probe.js oneSpan), on the
   seed of the span's start label — what the accrue path runs. */
function oneSpanRun(L, p, i) {
  const from = Date.parse(p.fromText); const to = Date.parse(p.to);
  const s = session(L, i, from, p.fromText, p.carrier);
  const r = L.probeResultOf(L.oneSpan('combat', s, from, to, L.offlineSeedFor(s.userId, s.slot, p.fromText)));
  return { ticks: r.ticks, kills: r.kills, gold: r.gold, xp: sumMap(r.xp), deaths: r.deaths, xpk: r.kills ? sumMap(r.xp) / r.kills : 0, gpk: r.kills ? r.gold / r.kills : 0 };
}

/* THE CHAIN, FIRE BY FIRE, as tick.js runs it in shadow: every 90 s window is a
   fresh session from the SAME envelope plus the carrier the previous fire
   stored (applyShadowState -> settleCombatSession -> shadowStateOf). */
function chainRun(L, p, i) {
  const from = Date.parse(p.fromText); const to = Date.parse(p.to);
  let carrier = p.carrier; let mark = from; let text = p.fromText;
  const intents = [];
  while (mark + 90000 <= to) {
    const s = session(L, i, mark, text, carrier);
    const run = L.settleCombatSession(s, mark, mark + 90000, { cadenceMs: 10000, flushMs: 90000, holder: 'guard' });
    if (run.intents.length === 0) throw new Error(`chain settled nothing at ${new Date(mark).toISOString()}`);
    const it = run.intents[0];
    intents.push(it);
    const end = Date.parse(it.args.p_window_to);
    if (run.watermarkMs !== end) throw new Error('chain ran past its first intent — the carrier would be ahead');
    carrier = JSON.parse(JSON.stringify(L.shadowStateOf(run.char, { baseVersion: ENV.version, atMs: end })));
    mark = end; text = L.pgTimestamptzText(end);
  }
  const v = L.intentValue(intents);
  return { ticks: v.ticks, kills: v.kills, gold: v.gold, xp: sumMap(v.xp), deaths: v.deaths, xpk: v.kills ? sumMap(v.xp) / v.kills : 0, gpk: v.kills ? v.gold / v.kills : 0 };
}

function stats(rows, f) {
  const m = rows.reduce((a, r) => a + r[f], 0) / rows.length;
  const sd = Math.sqrt(rows.reduce((a, r) => a + (r[f] - m) ** 2, 0) / Math.max(1, rows.length - 1));
  return { m, sd };
}

function replay(L, p) {
  const one = []; const chain = [];
  for (let i = 0; i < N; i++) { one.push(oneSpanRun(L, p, i)); chain.push(chainRun(L, p, i)); }
  const out = {};
  for (const f of [...FIELDS, 'deaths', 'xpk', 'gpk']) {
    const a = stats(one, f); const b = stats(chain, f);
    const se = Math.sqrt((a.sd ** 2 + b.sd ** 2) / N);
    out[f] = { one: a, chain: b, pct: a.m ? 100 * (b.m / a.m - 1) : 0, sePct: a.m ? 100 * se / a.m : 0 };
  }
  return out;
}

const fmt = (r) => [...FIELDS, 'xpk', 'gpk'].map((f) => `${f} ${r[f].pct >= 0 ? '+' : ''}${r[f].pct.toFixed(1)}%±${r[f].sePct.toFixed(1)}`).join(', ');

const ARMS = {
  /* VL1 — THE SPAN THAT CROSSES THE LINE (probe 8). The one span and the
     carried 90 s chain must agree in expectation on every payout field, and
     on deaths. Red before the fix: +17.6 % ticks, +15 % gold and xp. */
  VL1(L, fail) {
    const r = replay(L, PROBES.p8);
    for (const f of FIELDS) {
      if (!(Math.abs(r[f].pct) <= BAR_PCT)) {
        fail('VL1', `probe 8 replay (crosses the Vigour line): chain vs one span ${f} `
          + `${r[f].pct.toFixed(1)}% (se ${r[f].sePct.toFixed(1)}%) outside ±${BAR_PCT}% — the one span is not `
          + 'paying the budget in time order (accrual.js vigMultAt). ' + fmt(r));
        return null;
      }
    }
    if (Math.abs(r.deaths.one.m - r.deaths.chain.m) > 0.25) {
      fail('VL1', `probe 8 replay: mean deaths ${r.deaths.one.m.toFixed(2)} vs ${r.deaths.chain.m.toFixed(2)}`);
    }
    return fmt(r);
  },
  /* VL2 — THE SPAN WHOLLY PAST THE LINE (probe 10). Parity in expectation,
     AND the live pair inside the replay's noise: if a change ever made the
     journalled 1161 / 1649 impossible for this input, this arm names it. */
  VL2(L, fail) {
    const p = PROBES.p10;
    const r = replay(L, p);
    for (const f of FIELDS) {
      if (!(Math.abs(r[f].pct) <= BAR_PCT)) {
        fail('VL2', `probe 10 replay (wholly tired): chain vs one span ${f} ${r[f].pct.toFixed(1)}% outside ±${BAR_PCT}%. ` + fmt(r));
        return null;
      }
      for (const side of ['one', 'chain']) {
        const z = (p.live[side][f] - r[f][side].m) / (r[f][side].sd || 1);
        if (!(Math.abs(z) <= Z_MAX)) {
          fail('VL2', `probe 10 live ${side} ${f} ${p.live[side][f]} is z ${z.toFixed(2)} against its own `
            + `replay (${r[f][side].m.toFixed(0)} ± ${r[f][side].sd.toFixed(0)}) — no longer explained by chance`);
        }
      }
    }
    const zc = (p.live.chain.ticks - r.ticks.chain.m) / r.ticks.chain.sd;
    return `${fmt(r)}; live chain ticks z ${zc.toFixed(2)}`;
  },
};

async function runArms(L, only) {
  const fails = [];
  const fail = (arm, msg) => { fails.push(`${arm}: ${msg}`); };
  for (const [name, arm] of Object.entries(ARMS)) {
    if (only && name !== only) continue;
    const before = fails.length;
    let note = '';
    try { note = arm(L, fail) || ''; } catch (e) { fail(name, `threw: ${e.stack || e.message}`); }
    if (fails.length === before) console.log(`  ok  ${name}  ${note}`);
  }
  return fails;
}

async function main() {
  if (!MUTATE) {
    console.log(`world-tick-vigour-line (${N} seeds per side)`);
    const fails = await runArms(await load(ROOT));
    for (const f of fails) console.log(`  ✗ ${f}`);
    console.log(fails.length ? `world-tick-vigour-line: RED (${fails.length})` : 'world-tick-vigour-line: green');
    process.exit(fails.length ? 1 : 0);
  }
  console.log('world-tick-vigour-line --mutate');
  let escaped = 0;
  for (const m of MUTANTS) {
    const fails = await runArms(await load(await mutantBase(m)), m.arm);
    const caught = fails.some((f) => f.startsWith(`${m.arm}:`));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  ${m.name} -> ${m.arm}${caught ? '' : ' stayed green'}`);
    if (caught) console.log(`           ${fails[0].slice(0, 420)}`);
    if (!caught) escaped++;
  }
  console.log(escaped ? `--mutate: ${escaped} mutant(s) ESCAPED` : '--mutate: every mutant caught');
  process.exit(escaped ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
