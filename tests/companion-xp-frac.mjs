#!/usr/bin/env node
// ============================================================================
// tests/companion-xp-frac.mjs — THE PET'S FRACTIONAL XP IS CARRIED, AND ITS CAP
//                               IS THE SERVER'S.
//
//   node tests/companion-xp-frac.mjs            the guard (pure JS + one replay)
//   node tests/companion-xp-frac.mjs --mutate   every mutant must turn its arm red
//                                               (JS mutants in a COPY of src/ and the
//                                               function dir; SQL mutants planted in
//                                               a replay of the chain)
//
// THE RESIDUALS (Security, b566). (a) A utility pet earns 0.5 companion XP an
// action and the engine floored it per settle; the world tick settles every
// 10 s poll, so the QA sentinel's Fox on mithril earned NOTHING from the tick
// and a utility pet's tick chain ran ~4% under one span. (b) COMPANION_XP_CAP was
// enforced only on the edge. supabase/migrations/2026-10-12-companion-xp-frac.sql
// carries a server-owned per-companion remainder (player_progress.xp_frac) the
// xp_frac way, and clamps `stat companion_xp:%` in hr_apply, journalled.
//
// THE ARMS
//   C1  CHAIN == SPAN, BY ARITHMETIC. companionSpanGrant over any split of N
//       actions, the remainder round-tripped between pieces, credits exactly
//       floor(remainder0 + per x N) and leaves the same remainder as one grant
//       over N — for a utility pet (Fox, 0.5) and a combat pet (Wolf Pup, 1), on
//       gather and on kills, and across the cap (one clamp, remainder 0).
//   C2  FOX ON MITHRIL, THE SHIPPED GATHER TICK. settleGatherSession (10 s polls,
//       90 s flushes), 30 min: the Fox earns > 0, exactly floor(0.5 x actions),
//       and the folded remainder is what is left; one accrue span pays its own
//       actions the same rule. Negative control: with no projected remainder
//       (a database without the column) the same chain pays the Fox 0.
//   C3  THE SHIPPED COMBAT TICK. settleCombatSession: a combat pet earns exactly
//       its kills and a utility pet exactly floor(0.5 x kills), chain and span.
//   C4  BOTH PATHS (CLAUDE.md §4). The same span ATTENDED (away:false) and AWAY
//       (away:true) from a remainder of 0.5: identical credit and remainder, and
//       both equal floor(0.5 + 0.5 x kills).
//   C5  THE TICK FOLDS IT PER KEY. companion_xp_frac is a FOLD_CHAIN_KEY, an
//       ABSOLUTE_MAP key (last window per companion wins), and advance() carries
//       it into the next window's input.
//   C6  SERVER-ONLY AND PINNED. The envelope reads it ONLY off companions.frac
//       (presence of key); a projected 900 cannot mint; the SQL cap constant
//       equals COMPANION_XP_CAP.
//   C7  THE MIGRATION'S OWN §4 RUNS GREEN on a replay of the chain, and a second
//       apply is a no-op (byte-identical bodies, one CHECK).
//
// THE MUTANTS (--mutate)
//   JS  remainder not carried -> C1 · advance() drops the remainder -> C2
//       · the S4 fold stops at companion_xp_frac -> C5 · whole-map fold -> C5
//       · envelope reads a state-level remainder -> C6 · remainder unclamped -> C6
//   SQL client-writable (grant update) -> §4(b) · additive upsert -> §4(h)
//       · range refusal gone -> §4(f) · equipped check gone -> §4(f)
//       · cap clamp removed -> §4(i) · clamp not journalled -> §4(i)
//
// Exit: 0 green (or, under --mutate, every mutant caught) · 1 red · 2 harness.
// NO ?v= on the imports (tests/**, b332).
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const OWN_SQL = '2026-10-12-companion-xp-frac.sql';

const JS_MUTANTS = [
  { name: 'remainder not carried', arm: 'C1', file: 'src/core/companion-xp.js',
    edits: [['  return { add: whole, frac: (total - whole * XP_FRAC_SCALE) / XP_FRAC_SCALE };',
      '  return { add: whole, frac: 0 };']] },
  { name: "advance() drops the pet's remainder", arm: 'C2', file: 'supabase/functions/hr-accrue/tick-shadow.js',
    edits: [['    char.companionXpFrac = Object.assign({}, char.companionXpFrac, d.companion_xp_frac);\n', '']] },
  { name: 'the S4 fold stops at companion_xp_frac', arm: 'C5', file: 'supabase/functions/hr-accrue/tick.js',
    edits: [["'xp_frac', 'companion_xp_frac', 'gold',", "'xp_frac', 'gold',"]] },
  { name: 'companion_xp_frac folded whole-map last-wins', arm: 'C5', file: 'supabase/functions/hr-accrue/tick-contract.js',
    edits: [["export const ABSOLUTE_MAP = Object.freeze(['xp_frac', 'companion_xp_frac']);",
      "export const ABSOLUTE_MAP = Object.freeze(['xp_frac']);\nexport const ABSOLUTE_X = ['companion_xp_frac'];"],
      ['      if (ABSOLUTE.includes(k)) { out[k] = v; continue; }',
        '      if (ABSOLUTE.includes(k) || ABSOLUTE_X.includes(k)) { out[k] = v; continue; }']] },
  { name: 'the envelope also reads a state-level remainder (client-shaped input)', arm: 'C6',
    file: 'supabase/functions/hr-accrue/envelope.js',
    edits: [['  const comps = e.companions;', '  const comps = e.companions || (st.companion_xp_frac ? { frac: st.companion_xp_frac } : null);']] },
  { name: 'remainder unclamped (900 mints)', arm: 'C6', file: 'src/core/companion-xp.js',
    edits: [['  const f0 = carried ? xpFracUnits(o.frac) : 0;',
      '  const f0 = carried ? Math.round(Number(o.frac) * XP_FRAC_SCALE) || 0 : 0;']] },
];

const SQL_MUTANTS = [
  { name: 'remainder client-writable (grant update to authenticated)', expect: /self-check \(b\)/,
    from: "comment on column public.player_progress.xp_frac is",
    to: "grant update (xp_frac) on public.player_progress to authenticated;\ncomment on column public.player_progress.xp_frac is" },
  /* (d) writes 0.5 then 0.25 onto one row, so it is the first arm an additive
     upsert meets; (h) is the dedicated 0.6-then-0.3 arm behind it. */
  { name: 'additive upsert (the remainder accumulates)', expect: /self-check \((d|h)\)/,
    from: "          set xp_frac = excluded.xp_frac, updated_at = now();",
    to: "          set xp_frac = least(0.999999, pp.xp_frac + excluded.xp_frac), updated_at = now();" },
  { name: 'range refusal gone', expect: /self-check \(f\)/,
    from: "           or (p_delta->'companion_xp_frac'->>k)::numeric < 0\n           or (p_delta->'companion_xp_frac'->>k)::numeric >= 1 then",
    to: "           or false then" },
  { name: 'equipped check gone', expect: /self-check \(f\)/,
    from: "        if k is distinct from v_st.companion_equipped then",
    to: "        if false then" },
  { name: 'cap clamp removed', expect: /self-check \(i\)/,
    from: "            v_n := greatest(0, c_companion_xp_cap - v_cxp_have);\n",
    to: "" },
  { name: 'clamp not journalled', expect: /self-check \(i\)/,
    from: "      v_meta := v_meta || jsonb_build_object('cxc', v_cxp_clamp);",
    to: "      null;" },
];

async function load(base) {
  const at = (p) => import(pathToFileURL(join(base, p)).href);
  const [cxp, prog, acc, env, gather, combat, shadow, contract, tick] = await Promise.all([
    at('src/core/companion-xp.js'), at('src/core/progression.js'),
    at('supabase/functions/hr-accrue/accrual.js'), at('supabase/functions/hr-accrue/envelope.js'),
    at('supabase/functions/hr-accrue/tick-gather.js'), at('supabase/functions/hr-accrue/tick-combat.js'),
    at('supabase/functions/hr-accrue/tick-shadow.js'), at('supabase/functions/hr-accrue/tick-contract.js'),
    at('supabase/functions/hr-accrue/tick.js'),
  ]);
  const xp = await at('src/core/xp.js');
  return { cxp, prog, acc, env, gather, combat, shadow, contract, tick, xp };
}

async function mutantBase(m) {
  const base = await mkdtemp(join(tmpdir(), 'hr-cxfrac-'));
  await cp(join(ROOT, 'supabase', 'functions'), join(base, 'supabase', 'functions'), { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  const path = join(base, m.file);
  let src = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
  for (const [from, to] of m.edits) {
    if (src.split(from).length !== 2) {
      console.error(`--mutate ${m.name}: marker not exactly once in ${m.file} — "${from.slice(0, 80)}"`);
      process.exit(2);
    }
    src = src.replace(from, () => to);
  }
  await writeFile(path, src, 'utf8');
  return base;
}

// ── FIXTURES ────────────────────────────────────────────────────────────────
const T0 = Date.parse('2026-10-08T12:00:00.000Z');
const SPAN_MS = 30 * 60 * 1000;
const GEOM = { cadenceMs: 10000, flushMs: 90000 };
const SCALE = 1000000;

const companionAdd = (deltas, id) => {
  let n = 0;
  for (const d of deltas) for (const op of (d && d.progress) || []) {
    if (op.kind === 'stat' && op.key === 'companion_xp:' + id) n += Number(op.add) || 0;
  }
  return n;
};
/* The remainder a sequence of deltas leaves, folded as the tick folds it. */
const lastFrac = (L, deltas, id) => {
  const f = L.contract.foldDeltas(deltas.map((d) => ({ companion_xp_frac: d.companion_xp_frac })).filter((d) => d.companion_xp_frac));
  return f.companion_xp_frac ? f.companion_xp_frac[id] : undefined;
};
const units = (v) => Math.round((Number(v) || 0) * SCALE);

function mithrilSession(L, pet, frac) {
  return {
    userId: '00000000-0000-4000-8000-0000000c0f71', slot: 0, shard: 0, version: 1,
    activeKind: 'gather', activeId: 'mithril_rock', activeSinceMs: T0, accruedToMs: T0,
    capMs: 43200000, hp: 40, maxHp: 40, gold: 0,
    skills: { mining: L.xp.xpForLevel(61), hitpoints: 1200 }, inventory: {}, equipment: {}, toolCarry: null,
    ...(frac === undefined ? {} : { companionXpFrac: frac }),
    perks: { ok: true, companion: { id: pet, xp: 0 } },
  };
}

function combatSession(L, pet, frac) {
  return {
    userId: '00000000-0000-4000-8000-0000000c0f72', slot: 0, shard: 0, version: 1,
    activeKind: 'combat', activeId: 'goblin', activeSinceMs: T0, accruedToMs: T0,
    accruedToText: L.combat.pgTimestamptzText(T0),
    capMs: 43200000, hp: 99, maxHp: 99, gold: 0,
    skills: { attack: 1300000, strength: 1300000, defence: 1300000, hitpoints: 1300000 },
    inventory: {}, equipment: {},
    ...(frac === undefined ? {} : { companionXpFrac: frac }),
    perks: { ok: true, companion: { id: pet, xp: 0 } },
  };
}

/* index.ts's literal over one span (the accrue path). */
function accrueSpan(L, s, fromMs, toMs, catalogues, extra) {
  return L.acc.computeAccrual({
    ...L.env.engineStateOf(s),
    userId: s.userId, slot: s.slot, nowMs: toMs, accruedToMs: fromMs,
    activeSinceMs: s.activeSinceMs, activeKind: s.activeKind, activeId: s.activeId,
    capMs: s.capMs, seed: 1, bestiaryKills: null, perks: s.perks,
    companionXpBacked: L.cxp.COMPANION_XP_SERVER_BACKED,
    unlockedRecipes: null, actionBudget: null, attended: null,
    items: catalogues.items, monsters: catalogues.monsters, nodes: catalogues.nodes,
    caller: 'accrue', callerAuthority: L.acc.CALLER_AUTHORITY,
    ...(extra || {}),
  });
}

/* The credit and remainder the per-action rule owes for `n` actions from `f0`. */
function owed(per, n, f0) {
  const total = units(f0) + Math.round(per * n * SCALE);
  return { add: Math.floor(total / SCALE), frac: (total % SCALE) / SCALE };
}

async function runArms(L) {
  const fails = [];
  const fail = (arm, msg) => fails.push(`${arm}: ${msg}`);
  const GC = L.gather.GATHER_CATALOGUES;
  const CC = L.combat.COMBAT_CATALOGUES;
  const CAP = L.cxp.COMPANION_XP_CAP;

  // ── C1 — chain == span, by arithmetic ───────────────────────────────────
  {
    const cases = [
      ['fox', 'gather', 0, 0], ['fox', 'combat-kill', 0.5, 0], ['wolf_pup', 'combat-kill', 0, 0],
      ['fox', 'gather', 0.5, CAP - 40], ['wolf_pup', 'combat-kill', 0, CAP - 7],
    ];
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (const [id, act, f0, xp0] of cases) {
      const N = 997;
      const one = L.cxp.companionSpanGrant({ companionId: id, currentXp: xp0, activityType: act, actionCount: N, frac: f0 });
      for (let trial = 0; trial < 20; trial++) {
        let left = N; let xp = xp0; let f = f0; let paid = 0;
        while (left > 0) {
          const k = Math.min(left, 1 + Math.floor(rnd() * (trial < 10 ? 3 : 60)));
          const g = L.cxp.companionSpanGrant({ companionId: id, currentXp: xp, activityType: act, actionCount: k, frac: f });
          paid += g.add; xp += g.add; f = Number(JSON.parse(JSON.stringify(Number(g.frac.toFixed(6)))));
          left -= k;
        }
        if (paid !== one.add || units(f) !== units(one.frac)) {
          fail('C1', `${id} ${act} from frac ${f0} xp ${xp0}: a chain of pieces paid ${paid} r ${f}, one grant ${one.add} r ${one.frac}`);
          break;
        }
      }
    }
    const fox = L.cxp.companionSpanGrant({ companionId: 'fox', currentXp: 0, activityType: 'gather', actionCount: 1, frac: 0 });
    const fox2 = L.cxp.companionSpanGrant({ companionId: 'fox', currentXp: 0, activityType: 'gather', actionCount: 1, frac: fox.frac });
    if (fox.add !== 0 || units(fox.frac) !== SCALE / 2 || fox2.add !== 1 || units(fox2.frac) !== 0) {
      fail('C1', `one swing then one swing: ${JSON.stringify(fox)} then ${JSON.stringify(fox2)} — expected 0 r 0.5 then 1 r 0`);
    }
    const capped = L.cxp.companionSpanGrant({ companionId: 'wolf_pup', currentXp: CAP - 3, activityType: 'combat-kill', actionCount: 40, frac: 0.5 });
    if (capped.add !== 3 || capped.frac !== 0) fail('C1', `3 under the cap: ${JSON.stringify(capped)}, expected add 3 frac 0`);
  }

  // ── C2 — Fox on mithril, the shipped gather tick ────────────────────────
  {
    const s = mithrilSession(L, 'fox', {});
    const chain = L.gather.settleGatherSession(s, T0, T0 + SPAN_MS, GEOM);
    const deltas = chain.intents.map((i) => i.args.p_delta);
    const acts = chain.results.reduce((n, r) => n + Number((r.res && r.res.accrued && r.res.companionActions) || 0), 0);
    const tickXp = companionAdd(deltas, 'fox');
    const want = owed(0.5, acts, 0);
    const tf = lastFrac(L, deltas, 'fox');
    if (!(tickXp > 0) || tickXp !== want.add || units(tf || 0) !== units(want.frac)) {
      fail('C2', `the Fox on mithril over a 30 min tick chain: ${acts} actions paid ${tickXp} r ${tf} — owed ${want.add} r ${want.frac}`);
    }
    const span = accrueSpan(L, s, T0, chain.watermarkMs, GC);
    const spanActs = Number(span.companionActions || 0);
    const sw = owed(0.5, spanActs, 0);
    const spanXp = span.accrued ? companionAdd([span.delta], 'fox') : 0;
    const sf = span.delta && span.delta.companion_xp_frac ? span.delta.companion_xp_frac.fox : 0;
    if (spanXp !== sw.add || units(sf) !== units(sw.frac) || (spanActs === acts && spanXp !== tickXp)) {
      fail('C2', `one accrue span: ${spanActs} actions paid ${spanXp} r ${sf} — owed ${sw.add} r ${sw.frac} (chain ${tickXp} for ${acts})`);
    }
    // Negative control: no projected remainder (pre-migration database).
    const old = L.gather.settleGatherSession(mithrilSession(L, 'fox', undefined), T0, T0 + SPAN_MS, GEOM);
    const oldDeltas = old.intents.map((i) => i.args.p_delta);
    if (oldDeltas.some((d) => 'companion_xp_frac' in d)) {
      fail('C2', 'a session with no projected remainder proposed companion_xp_frac — hr_apply without the column would refuse it');
    }
    if (!MUTATE) console.log(`  · C2 Fox on mithril, 30 min tick chain: ${acts} actions -> ${tickXp} XP r ${tf} `
      + `(per-poll floor, no column: ${companionAdd(oldDeltas, 'fox')} XP); one span ${spanActs} -> ${spanXp}`);
  }

  // ── C3 — the shipped combat tick: combat pet and utility pet ────────────
  {
    for (const [pet, per] of [['wolf_pup', 1], ['fox', 0.5]]) {
      const s = combatSession(L, pet, {});
      const chain = L.combat.settleCombatSession(s, T0, T0 + SPAN_MS, GEOM);
      const deltas = chain.intents.map((i) => i.args.p_delta);
      const kills = chain.results.reduce((n, r) => n + Number((r.res && r.res.accrued && r.res.summary && r.res.summary.kills) || 0), 0);
      const tickXp = companionAdd(deltas, pet);
      const want = owed(per, kills, 0);
      const tf = lastFrac(L, deltas, pet);
      if (!(kills > 0) || tickXp !== want.add || units(tf || 0) !== units(want.frac)) {
        fail('C3', `${pet} combat tick chain: ${kills} kills paid ${tickXp} r ${tf} — owed ${want.add} r ${want.frac}`);
      }
      const span = accrueSpan(L, s, T0, T0 + SPAN_MS, CC);
      const spanKills = Number((span.summary && span.summary.kills) || 0);
      const sw = owed(per, spanKills, 0);
      const spanXp = span.accrued ? companionAdd([span.delta], pet) : 0;
      if (spanXp !== sw.add) fail('C3', `${pet} one span: ${spanKills} kills paid ${spanXp}, owed ${sw.add}`);
    }
  }

  // ── C4 — both paths, from a carried 0.5 ─────────────────────────────────
  {
    const s = combatSession(L, 'fox', { fox: 0.5 });
    const att = accrueSpan(L, s, T0, T0 + SPAN_MS, CC, { away: false });
    const awy = accrueSpan(L, s, T0, T0 + SPAN_MS, CC, { away: true });
    const pick = (r) => ({ add: r.accrued ? companionAdd([r.delta], 'fox') : 0,
      frac: r.delta && r.delta.companion_xp_frac ? r.delta.companion_xp_frac.fox : undefined,
      kills: Number((r.summary && r.summary.kills) || 0) });
    const a = pick(att); const w = pick(awy);
    const wa = owed(0.5, a.kills, 0.5);
    const wantFrac = (x) => (units(x.frac === undefined ? 0.5 : x.frac) === units(owed(0.5, x.kills, 0.5).frac));
    if (!(a.kills > 0) || a.add !== wa.add || !wantFrac(a)) {
      fail('C4', `ATTENDED: ${a.kills} kills from r 0.5 paid ${a.add} r ${a.frac} — owed ${wa.add} r ${wa.frac}`);
    }
    if (w.kills !== a.kills || w.add !== a.add || units(w.frac) !== units(a.frac)) {
      fail('C4', `AWAY paid ${JSON.stringify(w)}, ATTENDED ${JSON.stringify(a)} — the same span must train the pet the same`);
    }
  }

  // ── C5 — the tick folds it per key and carries it ───────────────────────
  {
    if (!L.tick.FOLD_CHAIN_KEYS.includes('companion_xp_frac')) {
      fail('C5', 'companion_xp_frac is not a FOLD_CHAIN_KEY — every window carrying it would settle alone (the S4 fold stops)');
    }
    let folded;
    try {
      folded = L.contract.foldDeltas([
        { companion_xp_frac: { fox: 0.5 } }, { companion_xp_frac: { raccoon: 0.5 } }, { companion_xp_frac: { fox: 0 } },
      ]).companion_xp_frac;
    } catch (e) { folded = String(e.message); }
    if (JSON.stringify(folded) !== JSON.stringify({ fox: 0, raccoon: 0.5 })) {
      fail('C5', `foldDeltas folded companion_xp_frac to ${JSON.stringify(folded)} — expected per key, last window wins`);
    }
    const ch = { perks: { ok: true, companion: { id: 'fox', xp: 0 } }, companionXpFrac: {}, skills: {} };
    L.shadow.advance(ch, { accrued: true, delta: { accrued_to: new Date(T0).toISOString(), companion_xp_frac: { fox: 0.5 } } });
    if (!ch.companionXpFrac || ch.companionXpFrac.fox !== 0.5) {
      fail('C5', `advance() did not carry the remainder into the next window: ${JSON.stringify(ch.companionXpFrac)}`);
    }
  }

  // ── C6 — server-only and pinned ─────────────────────────────────────────
  {
    const base = { ok: true, state: { accrued_to: new Date(T0).toISOString() }, skills: {} };
    const none = L.env.engineInputsFromEnvelope(base, T0).companionXpFrac;
    const some = L.env.engineInputsFromEnvelope({ ...base, companions: { xp: { fox: 3 }, frac: { fox: 0.5 } } }, T0).companionXpFrac;
    const off = L.env.engineInputsFromEnvelope({ ...base, state: { ...base.state, companion_xp_frac: { fox: 0.9 } } }, T0).companionXpFrac;
    if (none !== null || JSON.stringify(some) !== '{"fox":0.5}' || off !== null) {
      fail('C6', `the envelope must read the remainder ONLY off companions.frac (presence of key): absent ${JSON.stringify(none)}, `
        + `projected ${JSON.stringify(some)}, state-level ${JSON.stringify(off)}`);
    }
    const mint = L.cxp.companionSpanGrant({ companionId: 'fox', currentXp: 0, activityType: 'gather', actionCount: 1, frac: 900 });
    if (mint.add > 1 || !(mint.frac >= 0 && mint.frac < 1)) {
      fail('C6', `a projected remainder of 900 paid ${mint.add} r ${mint.frac} — a remainder is clamped below 1, never a mint`);
    }
    const sql = await readFile(join(ROOT, 'supabase', 'migrations', OWN_SQL), 'utf8');
    const m = sql.match(/c_companion_xp_cap constant bigint := (\d+);/);
    const c = sql.match(/c_cap constant bigint := (\d+);/);
    if (!m || Number(m[1]) !== CAP || !c || Number(c[1]) !== CAP) {
      fail('C6', `the SQL cap (${m && m[1]} / §4 ${c && c[1]}) is not COMPANION_XP_CAP ${CAP} — the server and edge clamp to different ceilings`);
    }
  }
  return fails;
}

/* C7 — the chain replays (the file's own §4 runs inside it) and a second apply
   is a no-op. */
async function secondApply() {
  const fails = [];
  const { bootReplay } = await import('./schema-replay.mjs');
  const { db, failures } = await bootReplay({});
  if (failures && failures.length) {
    return [`C7: the chain does not replay: ${failures.map((f) => `${f.file}: ${String(f.error).split('\n')[0]}`).join('; ')}`];
  }
  const snap = async () => (await db.query(`select
      md5(pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure)) a,
      md5(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure)) s,
      (select count(*) from pg_constraint where conrelid = 'public.player_progress'::regclass
         and contype = 'c' and pg_get_constraintdef(oid) like '%xp_frac%')::int c,
      (select string_agg(column_name || ':' || data_type || ':' || is_nullable, ',')
         from information_schema.columns where table_schema = 'public' and table_name = 'player_progress'
          and column_name = 'xp_frac') col`)).rows[0];
  const before = await snap();
  const sql = (await readFile(join(ROOT, 'supabase', 'migrations', OWN_SQL), 'utf8')).replace(/\r\n/g, '\n');
  try { await db.exec(sql); } catch (e) { fails.push(`C7: a second apply RAISED: ${String(e.message).split('\n')[0]}`); }
  const after = await snap();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    fails.push(`C7: a second apply changed the schema: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  }
  if (before.c !== 1 || !before.col) fails.push(`C7: expected one xp_frac CHECK and the column, saw ${JSON.stringify(before)}`);
  try { await db.close(); } catch { /* the replay owns its lifetime */ }
  return fails;
}

async function sqlMutants() {
  const { bootReplay, LAST_PATCHED } = await import('./schema-replay.mjs');
  let escaped = 0;
  for (const m of SQL_MUTANTS) {
    let verdict = 'APPLIED';
    try {
      const { failures } = await bootReplay({ patches: new Map([[OWN_SQL, [[m.from, m.to]]]]), upTo: LAST_PATCHED, tolerant: true });
      const f = (failures || []).find((x) => x.file === OWN_SQL);
      if (f) verdict = f.error;
    } catch (e) {
      if (e && e.harness) { console.error(`  harness — ${m.name}: ${String(e.message).split('\n')[0]}`); process.exit(2); }
      verdict = String((e && e.message) || e);
    }
    const caught = verdict !== 'APPLIED' && m.expect.test(verdict);
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  SQL ${m.name}${caught ? '' : ` (${String(verdict).split('\n')[0].slice(0, 160)})`}`);
    if (!caught) escaped++;
  }
  return escaped;
}

async function main() {
  if (!MUTATE) {
    const fails = await runArms(await load(ROOT));
    fails.push(...await secondApply());
    for (const f of fails) console.log(`  ✗ ${f}`);
    console.log(fails.length ? `companion-xp-frac: RED (${fails.length})`
      : 'companion-xp-frac: green — a chain pays the pet what one span does (utility and combat, tick and accrue, '
        + 'attended and away), the remainder folds per key and is server-only, and the cap is the server\'s');
    process.exit(fails.length ? 1 : 0);
  }
  console.log('companion-xp-frac --mutate');
  let escaped = 0;
  const clean = await runArms(await load(ROOT));
  if (clean.length) { console.error(`  the unmutated tree is RED (${clean[0]}) — a mutant run proves nothing`); process.exit(1); }
  for (const m of JS_MUTANTS) {
    const fails = await runArms(await load(await mutantBase(m)));
    const caught = fails.some((f) => f.startsWith(`${m.arm}:`));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  JS  ${m.name} -> ${m.arm}${caught ? `   ${fails.find((f) => f.startsWith(m.arm)).slice(0, 140)}` : ' stayed green'}`);
    if (!caught) escaped++;
  }
  escaped += await sqlMutants();
  console.log(escaped ? `--mutate: ${escaped} mutant(s) ESCAPED` : '--mutate: every mutant caught');
  process.exit(escaped ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
