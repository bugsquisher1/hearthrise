// ============================================================================
// tests/world-tick-maxhp-carry.mjs — A HITPOINTS LEVEL-UP INSIDE THE CHAIN RAISES MAX HP
//
//   node tests/world-tick-maxhp-carry.mjs            green = the chain fights at the ceiling a settle would
//   node tests/world-tick-maxhp-carry.mjs --mutate   each half of the carry reverted in a copy: its arm goes red
//
// THE FINDING (lane world-tick-parity-probe, tests/world-tick-probe-bar.mjs
// PB-2, 2026-10-05). The armed write raises `max_hp` with the hitpoints level
// (2026-09-06-max-hp-tracks-hitpoints.sql, `hr_sync_max_hp`), and a single-span
// accrual does the same inside the engine (accrual.js `state.playerMaxHp =
// ev.to`). The tick CHAIN did neither between its own windows: `advance()`
// moved the hitpoints xp and not the ceiling, and the shadow carrier
// (tick-contract.js shadowStateOf -> applyShadowState) re-seeded every fire at
// the frozen row's max. A character still gaining Hitpoints levels fought the
// rest of the night at the old ceiling — about -13.6% ticks against the
// one-span answer, the shape of the production combat parity miss and
// Security's known underpay (b) (SEC_WORLD_TICK_VIGOUR_2026-10-05).
//
//   H1  in-memory chain: after a window that crosses a Hitpoints level, the
//       next window's max HP is the level — and hp is the delta's, never a heal.
//   H2  the carrier: a carried hitpoints xp that crosses a level raises the
//       ceiling on the re-seeded session; hp is the carried hp; raise-only.
//   H3  parity: 4 h spans that cross Hitpoints level-ups, through the shipped
//       shadow composition (one 90 s fire per hop, the carrier between) AND the
//       in-memory chain, against the one-span accrual — ticks/kills/xp within
//       Security's ±10% combat bar, deaths within ±1 a probe on average; and
//       the chain stops early only where the one span changes activity.
//       H3p (2026-10-10): the SAME chain on the SAME seeds, shipped vs the ceiling
//       raised per window by this file — 0.00% by construction, cap ±0.25%;
//       the no-carry mutant reads -23.2% ticks (the ±10% span bar read -3.1%).
//
// Exit: 0 green (or, under --mutate, every mutant caught) · 1 red · 2 harness.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');

/* ── THE MUTANTS. Each removes ONE half of the carry in a COPY of the function
   directory and src/ (the world-tick-vigour-scale isolation), and names the arm
   that must go red. A marker that is gone is a harness failure (2). */
const ADVANCE_LINE = "  if (d.xp && 'hitpoints' in d.xp) raiseMaxHpToLevel(char);\n";
const CARRIER_LINE = "    if ('hitpoints' in st.xp) raiseMaxHpToLevel(s);\n";
const MUTANTS = [
  { name: 'advance() drops the ceiling', arm: 'H1',
    edits: [['supabase/functions/hr-accrue/tick-shadow.js', ADVANCE_LINE, '']] },
  { name: 'carrier drops the ceiling', arm: 'H2',
    edits: [['supabase/functions/hr-accrue/tick-contract.js', CARRIER_LINE, '']] },
  { name: 'no max_hp carry at all (the PB-2 composition)', arm: 'H3',
    edits: [
      ['supabase/functions/hr-accrue/tick-shadow.js', ADVANCE_LINE, ''],
      ['supabase/functions/hr-accrue/tick-contract.js', CARRIER_LINE, ''],
    ] },
  /* The carry must be raise-only and never heal: a derivation that also
     topped hp up to the new ceiling is the b509 free heal. In advance() the
     delta's hp is assigned AFTER the raise, so the heal is inert there; on the
     carrier the hp is laid down BEFORE the xp, so it is H2 that must see it. */
  { name: 'level-up heals', arm: 'H2',
    edits: [['supabase/functions/hr-accrue/tick-contract.js',
      '  if (char.maxHp < lvl) char.maxHp = lvl;\n',
      '  if (char.maxHp < lvl) { char.maxHp = lvl; char.hp = lvl; }\n']] },
];

async function load(base) {
  const at = (p) => import(pathToFileURL(join(base, p)).href);
  const [acc, combat, contract, shadow, xp, env] = await Promise.all([
    at('supabase/functions/hr-accrue/accrual.js'),
    at('supabase/functions/hr-accrue/tick-combat.js'),
    at('supabase/functions/hr-accrue/tick-contract.js'),
    at('supabase/functions/hr-accrue/tick-shadow.js'),
    at('src/core/xp.js'),
    at('supabase/functions/hr-accrue/envelope.js'),
  ]);
  const svc = await import(pathToFileURL(join(ROOT, 'services', 'world-tick', 'combat.js')).href);
  return {
    ...acc, ...combat, ...contract, advance: shadow.advance, levelFromXp: xp.levelFromXp, xpForLevel: xp.xpForLevel,
    engineStateOf: env.engineStateOf,
    /* The fixture half reads node:fs; the same file for every engine copy. */
    loadSessions: () => svc.loadCombatSessions(),
    atSpan: (s, fromMs) => { const c = svc.atSpan(s, fromMs); c.accruedToText = combat.pgTimestamptzText(fromMs); return c; },
  };
}

async function mutantBase(m) {
  const base = await mkdtemp(join(tmpdir(), 'hr-wtmh-'));
  await cp(join(ROOT, 'supabase', 'functions', 'hr-accrue'),
    join(base, 'supabase', 'functions', 'hr-accrue'), { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  for (const [file, from, to] of m.edits) {
    const path = join(base, file);
    const src = await readFile(path, 'utf8');
    if (!src.includes(from)) {
      console.error(`--mutate ${m.name}: marker gone from ${file} — "${from.trim()}"`);
      process.exit(2);
    }
    await writeFile(path, src.split(from).join(to), 'utf8');
  }
  return base;
}

// ═══════════════════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

/* The C6 combat sessions NORMALISED to the production invariant max_hp =
   hitpoints level (2026-09-06-max-hp-tracks-hitpoints.sql), the probe-bar's
   own normalisation: the raw fixtures carry max_hp 60 on level 36, which no
   live row can hold. Minus the ATTENDED one (the tick refuses it by design). */
function fixtures(L) {
  const out = [];
  for (const raw of L.loadSessions()) {
    if (/ATTENDED/.test(raw.name)) continue;
    const s = JSON.parse(JSON.stringify(raw));
    const lvl = Math.max(1, L.levelFromXp(Number((s.skills || {}).hitpoints) || 0));
    s.hp = Math.max(1, Math.round((Number(s.hp) || 0) / (Number(s.maxHp) || lvl) * lvl));
    s.maxHp = lvl;
    s.version = 1;
    out.push(s);
  }
  return out;
}

const FROM = Date.UTC(2026, 2, 14, 20, 0, 0);
const START_STEP_MS = 7 * 3600 * 1000;
const STARTS = 3;
const SPAN_MS = 4 * 3600 * 1000;
const CADENCE_MS = 10000;
const FLUSH_MS = 90000;
const OPTS = { cadenceMs: CADENCE_MS, flushMs: FLUSH_MS, holder: 'guard' };

const hpLevel = (L, c) => Math.max(1, L.levelFromXp(Number((c.skills || {}).hitpoints) || 0));

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

/* THE SHIPPED SHADOW COMPOSITION: each fire rebuilt from the FROZEN row c0,
   the previous fire's carrier laid over it, ONE flush window settled. */
function shadowChain(L, c0, from, to) {
  const v = { ticks: 0, kills: 0, deaths: 0, xp: 0 };
  let carrier = null; let mark = from; let markText = c0.accruedToText;
  while (mark < to) {
    const base = JSON.parse(JSON.stringify(c0));
    base.accruedToMs = mark; base.accruedToText = markText;
    const sess = carrier ? L.applyShadowState(base, carrier) : base;
    const run = L.settleCombatSession(sess, mark, Math.min(to, mark + FLUSH_MS), OPTS);
    addRun(L, v, run);
    if (run.settled === 0) break;
    carrier = L.shadowStateOf(run.char, { baseVersion: c0.version, atMs: run.watermarkMs });
    mark = run.watermarkMs; markText = run.watermarkText;
    if (run.stoppedBy === 'activity') break;
  }
  return { v, endMs: mark };
}

function addRun(L, v, run) {
  for (const r of run.results) {
    if (!r.res.accrued) continue;
    const s = r.res.summary || {};
    v.ticks += Number(s.ticks || 0);
    v.kills += Number(s.kills || 0);
    v.deaths += (r.res.delta.deaths || []).length;
    v.xp += Object.values(r.res.delta.xp || {}).reduce((a, b) => a + Number(b), 0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// THE ARMS
// ═══════════════════════════════════════════════════════════════════════════

const ARMS = {
  /* H1 — the in-memory chain. Walk the windows of every fixture span; at each
     window whose delta crossed a Hitpoints level the char must now hold
     maxHp >= that level, and hp must equal the delta's hp (no heal). */
  H1(L, fail) {
    let crossed = 0;
    for (const fx of fixtures(L)) {
      for (let i = 0; i < STARTS; i++) {
        const from = FROM + i * START_STEP_MS;
        const c = L.atSpan(fx, from);
        const char = JSON.parse(JSON.stringify(c));
        char.skills = char.skills || {}; char.inventory = char.inventory || {}; char.equipment = char.equipment || {};
        let wm = from; let wmText = c.accruedToText; let clock = from;
        while (clock < from + SPAN_MS) {
          clock = Math.min(clock + CADENCE_MS, from + SPAN_MS);
          const lvlBefore = hpLevel(L, char);
          const maxBefore = char.maxHp;
          const res = L.combatTick(char, wm, wmText, clock, {});
          if (!res.accrued) continue;
          L.advance(char, res);
          const lvlAfter = hpLevel(L, char);
          if (char.hp !== res.delta.hp) {
            return fail('H1', `${fx.name.slice(0, 30)}: after a window hp is ${char.hp}, the delta said `
              + `${res.delta.hp} — the chain healed (max ${maxBefore} -> ${char.maxHp}).`);
          }
          if (lvlAfter > lvlBefore) {
            crossed++;
            if (!(char.maxHp >= lvlAfter)) {
              return fail('H1', `${fx.name.slice(0, 30)}: a window took Hitpoints ${lvlBefore} -> ${lvlAfter} `
                + `and the next window fights at max HP ${char.maxHp}. advance() moved the xp and not the `
                + 'ceiling (tick-shadow.js -> raiseMaxHpToLevel).');
            }
          }
          if (char.maxHp < maxBefore) return fail('H1', `max HP fell ${maxBefore} -> ${char.maxHp}: raise-only broke`);
          wm = Date.parse(res.delta.accrued_to); wmText = L.pgTimestamptzText(wm);
          if (res.delta.activity) break;
        }
      }
    }
    if (crossed === 0) return fail('H1', 'harness: no window crossed a Hitpoints level — the arm sees nothing');
    return `${crossed} Hitpoints level-ups inside the chain, each fought at the new ceiling; hp always the delta's`;
  },

  /* H2 — the carrier. A session at Hitpoints level N with max N, a carrier
     holding enough hitpoints xp for N+2 and hp 3: the re-seeded session fights
     at N+2 with hp 3. A carrier with no hitpoints xp leaves max alone, and a
     ceiling already above the level is never lowered. */
  H2(L, fail) {
    const fx = fixtures(L).find((s) => /goblin grind/.test(s.name));
    if (!fx) return fail('H2', 'harness: the goblin grind fixture is gone');
    const s0 = L.atSpan(fx, FROM);
    const lvl = hpLevel(L, s0);
    let need = 0;
    while (L.levelFromXp(Number(s0.skills.hitpoints) + need) < lvl + 2) need += 50;
    const carry = (xp) => ({ v: L.SHADOW_STATE_V, base_version: s0.version, hp: 3, xp });
    const a = L.applyShadowState(JSON.parse(JSON.stringify(s0)), carry({ hitpoints: need }));
    if (a.maxHp !== lvl + 2) {
      fail('H2', `a carrier holding +${need} hitpoints xp (level ${lvl} -> ${lvl + 2}) re-seeded the session at `
        + `max HP ${a.maxHp}. The carrier holds the xp but the ceiling is not re-derived (applyShadowState).`);
    }
    if (a.hp !== 3) fail('H2', `the carried hp was 3 and the re-seeded session holds ${a.hp} — a heal`);
    const b = L.applyShadowState(JSON.parse(JSON.stringify(s0)), carry({ attack: 999999 }));
    if (b.maxHp !== s0.maxHp) fail('H2', `a carrier with no hitpoints xp moved max HP ${s0.maxHp} -> ${b.maxHp}`);
    const high = JSON.parse(JSON.stringify(s0)); high.maxHp = lvl + 50;
    const c = L.applyShadowState(high, carry({ hitpoints: need }));
    if (c.maxHp !== lvl + 50) fail('H2', `a ceiling above the level was LOWERED ${lvl + 50} -> ${c.maxHp}: raise-only broke`);
    /* No new carrier key: max HP rides as the function of the xp it is. */
    const st = L.shadowStateOf(Object.assign(JSON.parse(JSON.stringify(s0)), { _chain: { xp: { hitpoints: need } } }),
      { baseVersion: s0.version });
    if (st && ('max_hp' in st || 'maxHp' in st)) fail('H2', 'the carrier grew a max_hp key — the fence stores verbatim and hr_apply derives it');
    return `carried +${need} hitpoints xp re-seeds at max ${a.maxHp} (was ${lvl}), hp 3 kept; raise-only`;
  },

  /* H3 — parity across Hitpoints level-ups, both chain shapes vs one span. */
  H3(L, fail) {
    const one = { ticks: 0, kills: 0, deaths: 0, xp: 0 };
    const sh = { ticks: 0, kills: 0, deaths: 0, xp: 0 };
    const mem = { ticks: 0, kills: 0, deaths: 0, xp: 0 };
    let probes = 0; let levelUps = 0; const retreats = [];
    for (const fx of fixtures(L)) {
      for (let i = 0; i < STARTS; i++) {
        const from = FROM + i * START_STEP_MS;
        const c0 = L.atSpan(fx, from);
        const { v, endMs } = shadowChain(L, c0, from, from + SPAN_MS);
        /* RETREAT PARITY: the chain stops early only where the one span over
           the same 4 h also changes activity. Under the defence curve (b563) a
           stale ceiling barely moves ticks on the probes that close; it shows
           as a hero the chain RETREATS (out of food, knocked out at the old
           max) while the one span keeps fighting — and that probe never closes. */
        const closed = endMs - from >= SPAN_MS - FLUSH_MS;
        const res = accrueOnce(L, L.atSpan(fx, from), from, closed ? endMs : from + SPAN_MS);
        if (!res.accrued) return fail('H3', `harness: one-span accrue refused (${res.reason})`);
        if (closed === !!res.delta.activity) {
          retreats.push(`${fx.name.slice(0, 24)}@${i}: chain ${closed ? 'fought on' : `stopped at ${((endMs - from) / 36e5).toFixed(2)} h`}, `
            + `one span ${res.delta.activity ? 'changed activity' : 'fought 4 h'}`);
        }
        /* A pointer that ENDS inside the span closes no probe in production. */
        if (!closed) continue;
        const run = L.settleCombatSession(L.atSpan(fx, from), from, endMs, OPTS);
        probes++;
        const lv0 = hpLevel(L, c0);
        const lv1 = L.levelFromXp(Number(c0.skills.hitpoints || 0) + Number((res.delta.xp || {}).hitpoints || 0));
        levelUps += Math.max(0, lv1 - lv0);
        const m = res.delta.journal.meta;
        one.ticks += Number(m.ticks || 0); one.kills += Number(m.kills || 0);
        one.deaths += (res.delta.deaths || []).length;
        one.xp += Object.values(res.delta.xp || {}).reduce((a, b) => a + Number(b), 0);
        for (const k of Object.keys(sh)) sh[k] += v[k];
        addRun(L, mem, run);
      }
    }
    if (probes < 6 || levelUps === 0) {
      return fail('H3', `harness: ${probes} probes and ${levelUps} Hitpoints level-ups — the arm sees nothing`);
    }
    const pct = (a, b) => (b ? 100 * (a - b) / b : 0);
    if (retreats.length) {
      fail('H3', `${retreats.length} span(s) where the chain and the one span disagree on stopping — ${retreats.join('; ')}. `
        + 'The chain fought at a stale ceiling: max_hp is not carried (raiseMaxHpToLevel).');
    }
    const out = [];
    for (const [label, got] of [['shadow composition', sh], ['in-memory chain', mem]]) {
      for (const k of ['ticks', 'kills', 'xp']) {
        const d = pct(got[k], one[k]);
        if (!(Math.abs(d) <= 10)) {
          fail('H3', `${label}: ${k} ${got[k]} vs one-span ${one[k]} (${d.toFixed(1)}%) over ${probes} 4 h probes `
            + `crossing ${levelUps} Hitpoints levels — outside the ±10% combat bar. The chain fights at the `
            + 'ceiling it started at: max_hp is not carried (raiseMaxHpToLevel).');
        }
      }
      if (Math.abs(got.deaths - one.deaths) > probes) {
        fail('H3', `${label}: ${got.deaths} deaths vs one-span ${one.deaths} over ${probes} probes (bar ±1 a probe)`);
      }
      out.push(`${label} ticks ${pct(got.ticks, one.ticks).toFixed(2)}% kills ${pct(got.kills, one.kills).toFixed(2)}% `
        + `deaths ${got.deaths}/${one.deaths}`);
    }
    /* ── H3p THE PAIRED READ (2026-10-10) ──────────────────────────────────
       The ±10 % bar above compares the chain against ONE SPAN, i.e. two seed
       families, so its noise is the whole fight's: the "no max_hp carry"
       mutant reads -3.1 % there since the fractional-XP carry moved where the
       Hitpoints levels land, and it was only ever caught through a borderline
       early stop. This read is PAIRED: the same chain, window for window, on
       the SAME seeds, once as shipped and once with the ceiling raised to the
       Hitpoints level by THIS FILE between windows (the armed write's own
       rule, hr_sync_max_hp, derived here, not borrowed from advance()). With
       the carry the two are the same computation, so the delta is 0 by
       construction; without it every window after a level-up fights at the
       old ceiling. Capped absolutely (0.25 %), like PB-2p, so it never rests
       on a standard error. */
    const shipped = { ticks: 0, kills: 0, xp: 0, deaths: 0 };
    const armed = { ticks: 0, kills: 0, xp: 0, deaths: 0 };
    let pairedLevels = 0;
    for (const c0 of pairedFixtures(L)) {
      pairedChain(L, c0, shipped, false);
      pairedLevels += pairedChain(L, c0, armed, true);
    }
    if (pairedLevels === 0) return fail('H3', 'harness: the paired fixtures crossed no Hitpoints level — H3p sees nothing');
    const pd = {};
    for (const k of ['ticks', 'kills', 'xp', 'deaths']) {
      pd[k] = pct(shipped[k], armed[k]);
      if (!(Math.abs(pd[k]) <= 0.25)) {
        fail('H3', `H3p paired: shipped chain ${k} ${shipped[k]} vs the same chain with the ceiling raised per window `
          + `${armed[k]} (${pd[k].toFixed(2)}%, cap ±0.25%) on the same seeds across ${pairedLevels} Hitpoints levels — `
          + 'the chain fights at a stale ceiling: max_hp is not carried (raiseMaxHpToLevel).');
      }
    }
    out.push(`paired ticks ${pd.ticks.toFixed(2)}% kills ${pd.kills.toFixed(2)}% xp ${pd.xp.toFixed(2)}% `
      + `deaths ${shipped.deaths}/${armed.deaths} over ${pairedLevels} levels`);
    return `${probes} probes, ${levelUps} Hitpoints levels crossed: ${out.join('; ')}`;
  },
};

/* H3p's fixtures: a FRESH hero (Hitpoints 10, bronze sword, 60 shrimp) on the
   goblin and the rat — the food runs out and the hero is knocked out, so the ceiling decides each
   fight — 8 users x 4 h each. Deterministic: every number is a function of the
   seeds alone. */
function pairedFixtures(L) {
  const out = [];
  for (const mon of ['goblin', 'rat']) {
    for (let i = 0; i < 8; i++) {
      const from = FROM + i * START_STEP_MS;
      out.push({
        userId: `00000000-0000-4000-8000-${String(0x3a3000 + i + (mon === 'rat' ? 64 : 0)).padStart(12, '0')}`,
        slot: 1, shard: 0, version: 1, activeKind: 'combat', activeId: mon,
        activeSinceMs: from - 3600000, accruedToMs: from, accruedToText: L.pgTimestamptzText(from),
        capMs: 43200000, hp: 10, maxHp: 10, gold: 0,
        skills: { attack: 0, defense: 0, strength: 0, hitpoints: L.xpForLevel(10) },
        inventory: { cooked_shrimp: 60 }, equipment: { weapon: 'bronze_sword' }, fight: {},
        consecFalls: 0, recoveringUntilMs: 0, ammoCarry: null,
        autoEatEnabled: true, autoEatFood: 'cooked_shrimp', autoEatPct: 50,
        deathsTodayBefore: 0, deathsLifetimeBefore: 0, combatXpAccruedToMs: 0, hearthfindReady: false,
        enchant: null, combatStyle: {}, buffs: [], xpFrac: {}, bestiaryKills: {}, perks: null,
      });
    }
  }
  return out;
}

/* One 4 h chain, one flush window at a time. `raise` applies the armed
   write's ceiling rule between windows; returns the Hitpoints levels crossed. */
function pairedChain(L, c0, acc, raise) {
  let s = JSON.parse(JSON.stringify(c0));
  const from = c0.accruedToMs; const to = from + SPAN_MS;
  const lv0 = hpLevel(L, s);
  let m = from;
  while (m < to) {
    const run = L.settleCombatSession(s, m, Math.min(to, m + FLUSH_MS), OPTS);
    addRun(L, acc, run);
    if (run.settled === 0) break;
    s = Object.assign({}, run.char, { accruedToMs: run.watermarkMs, accruedToText: run.watermarkText });
    if (raise) s.maxHp = Math.max(Number(s.maxHp) || 0, hpLevel(L, s));
    m = run.watermarkMs;
    if (run.stoppedBy === 'activity') break;
  }
  return hpLevel(L, s) - lv0;
}

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
    console.log('world-tick-maxhp-carry');
    const fails = await runArms(await load(ROOT));
    for (const f of fails) console.log(`  ✗ ${f}`);
    console.log(fails.length ? `world-tick-maxhp-carry: RED (${fails.length})` : 'world-tick-maxhp-carry: green');
    process.exit(fails.length ? 1 : 0);
  }
  console.log('world-tick-maxhp-carry --mutate');
  let escaped = 0;
  for (const m of MUTANTS) {
    const fails = await runArms(await load(await mutantBase(m)), m.arm);
    const caught = fails.some((f) => f.startsWith(`${m.arm}:`) && !f.includes('harness:'));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  ${m.name} -> ${m.arm}${caught ? '' : ' stayed green'}`);
    if (caught) console.log(`           ${fails[0].slice(0, 240)}`);
    if (!caught) escaped++;
  }
  console.log(escaped ? `--mutate: ${escaped} mutant(s) ESCAPED` : '--mutate: every mutant caught');
  process.exit(escaped ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
