// ============================================================================
// tests/progress-coalesce.mjs — ONE TICK WINDOW FILES ONE OP PER PROGRESS ROW
//
//   node tests/progress-coalesce.mjs            the guard (pure JS + one replay)
//   node tests/progress-coalesce.mjs --mutate   every mutant must turn its arm red
//
// THE FINDING (Security, set/b566, P2 latent availability). hr_apply refuses a
// call carrying more than `c_max_progress_ops` = 64 progress ops. One 90 s
// gather window at the 10 s cadence filed 46 (55 with a utility pet): the
// polls' lists were concatenated and only the S4 fold coalesced them. One more
// per-poll op, or a flush past ~110 s, would refuse EVERY window of that
// character `too_many_progress_ops`. Fix: tick-gather.js writeIntent coalesces
// through tick-contract.js RULE 2b `coalesceProgress`, the ONE coalescer the
// fold and the combat flush use too.
//
//   U1  the coalescer's own rules: per-row sums, distinct (kind, key, period)
//       never merged, a state change starts a new entry, the per-op add cap
//       splits, unknown op keys / bad adds throw
//   O1  BEFORE / AFTER, measured: a 90 s gather window with a utility pet,
//       raw (the polls' concatenation, the old pack) vs shipped; shipped <= 20
//   H1  ★ HEADROOM, from now on: every single 90 s window (ATTENDED: the
//       online visit) of a 30 min chain for every fixture — inline and the
//       services/world-tick/fixtures sessions, gather and combat — and every
//       8-window S4 fold (AWAY) ships <= 32 ops (half of hr_apply's 64)
//   D1  ★ THE DIFFERENTIAL, through the replayed hr_apply, per fixture
//       (gather, gather + utility pet [companion + companion_xp_frac],
//       xp_frac, combat + pet, hearthfind):
//         ATTENDED  one window: shipped (coalesced) == old pack (raw
//                   concatenation): state byte-identical AND ledger rows
//                   byte-identical; == every poll applied on its own
//                   (no fold at all): state identical, ledger totals equal
//         AWAY      one 8-window fold == every poll applied on its own:
//                   state identical, ledger totals equal (gold, gold_in,
//                   xp_in, qty_in, gems_in)
//       Every apply must answer ok (a refused pair is not "equal").
//
// MUTANTS (--mutate): absolute keys coalesced additively (foldDeltas folds
// ABSOLUTE_MAP by addition) · an op dropped · different keys merged · the
// state ignored · the single window stops coalescing.
//
// Exit: 0 green (or, under --mutate, every mutant caught) · 1 red · 2 harness.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { loadGatherSessions, atSpan as gatherAtSpan } from '../services/world-tick/gather.js';
import { loadCombatSessions, atSpan as combatAtSpan } from '../services/world-tick/combat.js';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);

const OPS_TARGET = 20;     // the brief's target for a 90 s gather window with a pet
const FLUSH_MS = 90000;
const CADENCE_MS = 10000;
const GEOM = { cadenceMs: CADENCE_MS, flushMs: FLUSH_MS };
const FOLD_K = 8;          // tick.js MAX_FOLD_WINDOWS

/* THE HEARTHFIND FIXTURE, the same three edits tests/world-tick-scale.mjs F10
   makes (gather has no onHearthfind hook; the fixture adds the combat path's
   own line, a 1-in-25 roll, and the one-per-window collapse). Applied to every
   copy, control included, because it is the fixture, not a mutant. */
const HF_FIND = '  if (!rng.chance(1 / row.oneIn)) return null;';
const HF_REPL = '  if (!rng.chance(1 / 25)) return null;';
const HF_HOOK_FIND = '    /* Still deliberately ABSENT:';
const HF_HOOK_REPL = '    onHearthfind(f) { if (f && f.item) finds.push({ item: f.item, source_kind: f.kind, source_id: f.id }); },\n'
  + '    /* Still deliberately ABSENT:';
const HF_WIN_FIND = '  const folded = foldDeltas(deltas);\n';
const HF_WIN_REPL = '  const folded = foldDeltas(deltas);\n'
  + '  if (Array.isArray(folded.hearthfind)) { const l = folded.hearthfind; '
  + 'folded.hearthfind = l.length > 1 ? { ...l[0], dropped: Math.min(99, l.length - 1) } : l[0]; }\n';

const C = 'supabase/functions/hr-accrue/tick-contract.js';
const G = 'supabase/functions/hr-accrue/tick-gather.js';
const MUTANTS = [
  { id: 'absolute-additive', name: 'absolute keys coalesced additively (ABSOLUTE_MAP folded by addition)',
    arms: ['D1'], file: C,
    find: '      if (ABSOLUTE_MAP.includes(k)) { out[k] = Object.assign(out[k] || {}, v || {}); continue; }',
    repl: '      if (ABSOLUTE_MAP.includes(k)) { const m = out[k] || (out[k] = {}); for (const id of Object.keys(v || {})) m[id] = (m[id] || 0) + Number(v[id] || 0); continue; }' },
  { id: 'drop-op', name: 'a merged op is dropped (its add lost)', arms: ['U1', 'D1'], file: C,
    find: '      prev.add += add;\n', repl: '' },
  { id: 'merge-keys', name: 'different keys merged (the row id is the kind alone)', arms: ['U1', 'D1'], file: C,
    find: '    const id = `${op.kind}\\u0000${op.key}\\u0000${op.period ?? \'\'}`;',
    repl: '    const id = `${op.kind}`;' },
  { id: 'ignore-state', name: 'the state is ignored (a done summed into an active)', arms: ['U1'], file: C,
    find: '    if (prev && (prev.state ?? null) === (op.state ?? null) && prev.add + add <= MAX_PROGRESS_ADD) {',
    repl: '    if (prev && prev.add + add <= MAX_PROGRESS_ADD) {' },
  { id: 'single-window-raw', name: 'the single window stops coalescing (the old pack)', arms: ['O1', 'H1'], file: G,
    find: '  if (Array.isArray(folded.progress)) folded.progress = coalesceProgress(folded.progress);\n', repl: '' },
];

/** A copy of the edge + src, the hearthfind fixture applied to a SEPARATE module
    set, and (under a mutant, unless the control is on) one edit. */
async function copyTree(mut) {
  const base = await mkdtemp(join(tmpdir(), 'hr-pcoal-'));
  await cp(join(ROOT, 'supabase', 'functions', 'hr-accrue'), join(base, 'supabase', 'functions', 'hr-accrue'), { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  const edit = async (rel, find, repl, what) => {
    const p = join(base, rel);
    const src = (await readFile(p, 'utf8')).replace(/\r\n/g, '\n');
    if (src.split(find).length !== 2) {
      throw Object.assign(new Error(`${what}: anchor matched ${src.split(find).length - 1}x in ${rel}`), { harness: true });
    }
    await writeFile(p, src.replace(find, () => repl), 'utf8');
  };
  if (mut && !CONTROL) await edit(mut.file, mut.find, mut.repl, `mutant ${mut.id}`);
  /* The hearthfind twin: a second tree with the fixture, the mutant included. */
  const hf = await mkdtemp(join(tmpdir(), 'hr-pcoal-hf-'));
  await cp(base, hf, { recursive: true });
  const editHf = async (rel, find, repl, what) => {
    const p = join(hf, rel);
    const src = (await readFile(p, 'utf8')).replace(/\r\n/g, '\n');
    if (src.split(find).length !== 2) throw Object.assign(new Error(`${what}: fixture anchor moved in ${rel}`), { harness: true });
    await writeFile(p, src.replace(find, () => repl), 'utf8');
  };
  await editHf('src/core/hearthfind.js', HF_FIND, HF_REPL, 'hearthfind rate');
  await editHf('supabase/functions/hr-accrue/accrual.js', HF_HOOK_FIND, HF_HOOK_REPL, 'gather hearthfind hook');
  await editHf(G, HF_WIN_FIND, HF_WIN_REPL, 'window hearthfind collapse');
  return { base, hf };
}

async function load(base) {
  const at = (p) => import(pathToFileURL(join(base, p)).href);
  const [contract, gather, combat, xp] = await Promise.all([
    at(C), at(G), at('supabase/functions/hr-accrue/tick-combat.js'), at('src/core/xp.js'),
  ]);
  return { contract, gather, combat, xp };
}

// ── FIXTURES ───────────────────────────────────────────────────────────────
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function gatherSession(M, t0, { pet = null, frac = false, node = 'normal_tree', skill = 'woodcutting', lv = 5, n = 1 } = {}) {
  return {
    userId: uid(n), slot: 0, shard: 0, version: 1,
    activeKind: 'gather', activeId: node, activeSinceMs: t0, accruedToMs: t0,
    capMs: 43200000, hp: 40, maxHp: 40, gold: 0,
    skills: { [skill]: M.xp.xpForLevel(lv), hitpoints: 1200 }, inventory: {}, equipment: {}, toolCarry: null,
    ...(frac ? { xpFrac: {} } : {}),
    ...(pet && frac ? { companionXpFrac: {} } : {}),
    perks: { ok: true, companion: pet ? { id: pet, xp: 0 } : null },
  };
}

function combatSession(M, t0, { pet = null, frac = false, n = 2 } = {}) {
  return {
    userId: uid(n), slot: 0, shard: 0, version: 1,
    activeKind: 'combat', activeId: 'goblin', activeSinceMs: t0, accruedToMs: t0,
    accruedToText: M.combat.pgTimestamptzText(t0),
    capMs: 43200000, hp: 99, maxHp: 99, gold: 0,
    skills: { attack: 1300000, strength: 1300000, defence: 1300000, hitpoints: 1300000 },
    inventory: {}, equipment: {},
    ...(frac ? { xpFrac: {} } : {}),
    perks: { ok: true, companion: pet ? { id: pet, xp: 0 } : null },
  };
}

/** The named fixtures of D1 (and H1's inline half). `hf` selects the hearthfind tree. */
const FIXTURES = [
  { id: 'gather', kind: 'gather', make: (M, t0, n) => gatherSession(M, t0, { n }) },
  { id: 'gather+pet', kind: 'gather', pet: 'fox', make: (M, t0, n) => gatherSession(M, t0, { pet: 'fox', frac: true, n }) },
  { id: 'xp_frac', kind: 'gather', make: (M, t0, n) => gatherSession(M, t0, { frac: true, node: 'mithril_rock', skill: 'mining', lv: 61, n }) },
  { id: 'combat+pet', kind: 'combat', pet: 'wolf_pup', make: (M, t0, n) => combatSession(M, t0, { pet: 'wolf_pup', frac: true, n }) },
  { id: 'hearthfind', kind: 'gather', hf: true,
    make: (M, t0, n) => Object.assign(gatherSession(M, t0, { frac: true, n }), { hearthfindReady: true }) },
];

const settle = (M, s, from, to) => (s.activeKind === 'combat'
  ? M.combat.settleCombatSession(s, from, to, GEOM)
  : M.gather.settleGatherSession(s, from, to, GEOM));

/** The polls an intent's window settled, in order (their own deltas, unfolded). */
function pollsOf(chain, intent) {
  const from = intent.window ? intent.window.fromMs : Date.parse(intent.args.p_window_from);
  const to = intent.window ? intent.window.toMs : Date.parse(intent.args.p_window_to);
  return chain.results
    .filter((r) => r.res && r.res.accrued && r.watermarkMs >= from && Date.parse(r.res.delta.accrued_to) <= to
      && r.watermarkMs < to)
    .map((r) => r.res.delta);
}
const rawProgress = (polls) => polls.flatMap((d) => d.progress || []);
const opsOf = (intent) => (intent.args.p_delta.progress || []).length;

// ── PURE ARMS ─────────────────────────────────────────────────────────────
function pureArms(M, ok, log) {
  const { coalesceProgress, MAX_PROGRESS_ADD, MAX_PROGRESS_OPS } = M.contract;
  const HEADROOM = Math.floor(MAX_PROGRESS_OPS / 2);

  // U1 — the rules, unit by unit.
  {
    const op = (kind, key, period, add, state = 'active') => ({ kind, key, period, add, state });
    const ops = [
      op('stat', 'gathered', '', 3), op('daily', 'ev:gather', '2026-10-8', 2), op('stat', 'gathered', '', 4),
      op('daily', 'ev:gather', '2026-10-9', 5), op('stat', 'chopped', '', 1),
      op('daily', 'goal', '2026-10-8', 1, 'active'), op('daily', 'goal', '2026-10-8', 1, 'done'),
      op('daily', 'goal', '2026-10-8', 1, 'active'),
    ];
    let out; let threw = null;
    try { out = coalesceProgress(ops); } catch (e) { threw = e; out = []; }
    const find = (k, key, p, st) => out.filter((o) => o.kind === k && o.key === key && o.period === p && (!st || o.state === st));
    const sum = (l) => l.reduce((a, o) => a + Number(o.add || 0), 0);
    ok('U1', !threw && sum(out) === sum(ops), `sum(add) kept: ${sum(ops)}`, `sum(add) ${sum(out)} != ${sum(ops)} (${threw && threw.message})`);
    ok('U1', find('stat', 'gathered', '').length === 1 && find('stat', 'gathered', '')[0].add === 7
      && find('stat', 'chopped', '').length === 1 && find('stat', 'chopped', '')[0].add === 1,
    'one row, one op, summed (gathered 3+4 = 7); a different key stays its own op',
    `rows merged wrongly: ${JSON.stringify(out)}`);
    ok('U1', find('daily', 'ev:gather', '2026-10-8').length === 1 && find('daily', 'ev:gather', '2026-10-9').length === 1,
      'two UTC days of one daily key stay two ops', `periods merged: ${JSON.stringify(out)}`);
    const goal = out.filter((o) => o.key === 'goal').map((o) => `${o.state}:${o.add}`).join(',');
    ok('U1', goal === 'active:1,done:1,active:1',
      'a state change starts a new entry: the row\'s state sequence active -> done -> active is kept',
      `the state sequence became ${goal}`);
    const big = coalesceProgress([op('daily', 'ev:vigour_rem_ms', 'd', MAX_PROGRESS_ADD - 5), op('daily', 'ev:vigour_rem_ms', 'd', 10)]);
    ok('U1', big.length === 2 && big.every((o) => o.add <= MAX_PROGRESS_ADD),
      `a sum past c_max_progress_add (${MAX_PROGRESS_ADD}) splits, never refused`, `cap not honoured: ${JSON.stringify(big)}`);
    const throws = (l) => { try { coalesceProgress(l); return false; } catch { return true; } };
    ok('U1', throws([{ ...op('stat', 'x', '', 1), extra: 1 }]) && throws([op('stat', 'x', '', -1)])
      && throws([op('stat', 'x', '', 1.5)]) && throws([null]),
    'an unknown op key, a negative, a fractional add and a non-object all throw',
    'the coalescer accepted an op hr_apply would refuse');
    const one = op('stat', 'x', '', 3);
    ok('U1', JSON.stringify(coalesceProgress([one])) === JSON.stringify([one]), 'one op comes back unchanged',
      'a lone op was rewritten');
  }

  // O1 — before / after, the window Security measured.
  const t0 = Date.parse('2026-10-08T12:00:00.000Z');
  {
    const s = gatherSession(M, t0, { pet: 'fox', frac: true });
    const ch = M.gather.settleGatherSession(s, t0, t0 + FLUSH_MS, GEOM);
    const it = ch.intents[0];
    const raw = rawProgress(pollsOf(ch, it)).length;
    const shipped = it ? opsOf(it) : Infinity;
    log(`  · O1 90 s gather window + utility pet: ${raw} raw ops -> ${shipped} shipped (cap ${MAX_PROGRESS_OPS}, target <= ${OPS_TARGET})`);
    ok('O1', raw > OPS_TARGET && shipped <= OPS_TARGET,
      `${raw} -> ${shipped} ops (<= ${OPS_TARGET})`,
      `${raw} raw -> ${shipped} shipped ops, target <= ${OPS_TARGET}`);
  }

  // H1 — headroom, every window of every fixture, both paths.
  {
    const SPAN = 30 * 60 * 1000;
    const sessions = [];
    for (const f of FIXTURES) if (!f.hf) sessions.push([f.id, f.make(M, t0, 9)]);
    for (const s of loadGatherSessions()) sessions.push([`file:${s.name}`, gatherAtSpan(s, t0)]);
    for (const s of loadCombatSessions()) sessions.push([`file:${s.name}`, combatAtSpan(s, t0)]);
    let worstA = 0; let worstAway = 0; let at = ''; let atAway = ''; let windows = 0;
    for (const [id, s] of sessions) {
      const ch = settle(M, s, t0, t0 + SPAN);
      for (const it of ch.intents) {
        windows++;
        if (opsOf(it) > worstA) { worstA = opsOf(it); at = id; }
      }
      if (s.activeKind === 'gather') {
        for (let i = 0; i + FOLD_K <= ch.intents.length; i += FOLD_K) {
          const f = M.gather.foldWindowIntents({ userId: s.userId, slot: 0, shard: 0, version: 1, holder: null },
            ch.intents.slice(i, i + FOLD_K));
          if (opsOf(f) > worstAway) { worstAway = opsOf(f); atAway = id; }
        }
      }
    }
    log(`  · H1 ${sessions.length} fixtures, ${windows} single 90 s windows: worst ${worstA} ops (${at}); `
      + `worst ${FOLD_K}-window fold ${worstAway} (${atAway}); headroom line ${HEADROOM}`);
    ok('H1', windows > 0 && worstA <= HEADROOM, `ATTENDED: every single window <= ${HEADROOM} ops (worst ${worstA})`,
      `ATTENDED: a single 90 s window ships ${worstA} ops (${at}) > ${HEADROOM}, half of hr_apply's ${MAX_PROGRESS_OPS}`);
    ok('H1', worstAway > 0 && worstAway <= HEADROOM, `AWAY: every ${FOLD_K}-window fold <= ${HEADROOM} ops (worst ${worstAway})`,
      `AWAY: a fold ships ${worstAway} ops (${atAway}) > ${HEADROOM}`);
  }
}

// ── THE DIFFERENTIAL (D1) ──────────────────────────────────────────────────
/* Not compared: identity only. Every apply of one comparison runs in ONE
   transaction, so hr_apply's own `now()` stamps (updated_at, rested_at,
   workers_accrued_to, combat_xp_accrued_to …) are one instant and compared. */
const STRIP = new Set(['user_id', 'id']);
/* PER POLL: `version` counts applies (N polls vs 1 window), by construction. */
const STRIP_POLL = new Set([...STRIP, 'version']);
/* AWAY, PER POLL: also `combat_settle_span`, stamped from the APPLY's span
   length (2026-09-17-attended-xp-on-settle.sql: 180 s < span <= 1 h), so a
   12 min fold and a 10 s poll differ there by construction, coalesced or not;
   it carries the delta's combat xp (0 on gather) and the next delta clears it. */
const STRIP_AWAY = new Set([...STRIP_POLL, 'combat_settle_span']);
const clean = (o, strip = STRIP) => Object.fromEntries(Object.entries(o).filter(([k]) => !strip.has(k)).sort(([a], [b]) => (a < b ? -1 : 1)));
const TABLES = ['player_state', 'player_inventory', 'player_skills', 'player_progress', 'player_equipment', 'player_bank'];

async function dbArms(db, Ms, ok, log, run) {
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const now = Number((await q("select (extract(epoch from date_trunc('second', now())) * 1000)::bigint as n"))[0].n);
  const t0 = now - 3 * 3600 * 1000;
  let n = 1000 * run;

  const mkChar = async (s, pet, u) => {
    await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
    await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                              active_kind, active_id, active_since, companion_equipped)
             values ($1, 0, 0, 0, $2, $3, 1, to_timestamp($4::double precision / 1000), $5, $6,
                     to_timestamp($7::double precision / 1000), $8)`,
    [u, s.hp, s.maxHp, s.accruedToMs, s.activeKind, s.activeId, s.activeSinceMs, pet || null]);
    return u;
  };
  /* A deterministic intent id per (comparison step), SHARED by the characters
     of one comparison: player_intents is keyed (user_id, intent_id), and the
     ledger row carries the id, so a random one would differ for no reason. */
  let step = 0;
  const intentId = () => `00000000-0000-4000-9000-${String(run * 1000000 + (++step)).padStart(12, '0')}`;
  /* ONE CLOCK PER COMPARISON: `now()` is the transaction's, so every
     character of a comparison is written at the same instant. */
  const clock = async (fn) => {
    await db.exec('begin');
    try { const r = await fn(); await db.exec('commit'); return r; } catch (e) { await db.exec('rollback'); throw e; }
  };
  const apply = async (u, delta, iid) => {
    const v = (await q('select version from public.player_state where user_id = $1 and slot = 0', [u]))[0].version;
    await db.exec('savepoint pc_apply'); await db.exec('set local role hr_engine');
    try {
      const r = (await q('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as r',
        [u, v, iid || intentId(), JSON.stringify(delta)]))[0].r;
      await db.exec('reset role'); await db.exec('release savepoint pc_apply');
      return r;
    } catch (e) {
      await db.exec('rollback to savepoint pc_apply'); await db.exec('reset role');
      return { ok: false, error: `threw: ${String(e.message).slice(0, 120)}` };
    }
  };
  const applyAll = async (u, deltas, ids) => {
    for (let i = 0; i < deltas.length; i++) {
      const r = await apply(u, deltas[i], ids && ids[i]);
      if (!r || r.ok !== true) return r || { ok: false, error: 'no answer' };
    }
    return { ok: true };
  };
  const stateOf = async (u, strip = STRIP) => {
    const out = {};
    for (const t of TABLES) {
      const rows = await q(`select to_jsonb(t) as j from public.${t} t where user_id = $1`, [u]);
      out[t] = rows.map((r) => JSON.stringify(clean(r.j, strip))).sort();
    }
    return JSON.stringify(out);
  };
  /* `nth_ever` on a hearthfind row is the WORLD's count of that item, so the
     second character of a comparison is the second finder by construction. */
  const ledgerOf = async (u) => (await q(
    'select kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta from public.player_ledger where user_id = $1 order by id', [u]))
    .map((r) => { if (r.meta && typeof r.meta === 'object') delete r.meta.nth_ever; return JSON.stringify(r); });
  const totalsOf = async (u) => JSON.stringify((await q(
    `select coalesce(sum(gold), 0)::bigint as gold, coalesce(sum(gold_in), 0)::bigint as gold_in,
            coalesce(sum(xp_in), 0)::bigint as xp_in, coalesce(sum(qty_in), 0)::bigint as qty_in,
            coalesce(sum(gems_in), 0)::bigint as gems_in from public.player_ledger where user_id = $1`, [u]))[0]);
  /* The first difference, named to the column: `table.column: a vs b`. */
  const diff = (a, b) => {
    const A = JSON.parse(a); const B = JSON.parse(b);
    for (const t of Object.keys(A)) {
      if (JSON.stringify(A[t]) === JSON.stringify(B[t])) continue;
      const ra = A[t].map((r) => JSON.parse(r)); const rb = B[t].map((r) => JSON.parse(r));
      if (ra.length !== rb.length) return `${t}: ${ra.length} rows vs ${rb.length}`;
      for (let i = 0; i < ra.length; i++) {
        for (const c of new Set([...Object.keys(ra[i]), ...Object.keys(rb[i])])) {
          if (JSON.stringify(ra[i][c]) !== JSON.stringify(rb[i][c])) {
            return `${t}.${c}: ${JSON.stringify(ra[i][c]).slice(0, 120)} vs ${JSON.stringify(rb[i][c]).slice(0, 120)}`;
          }
        }
      }
    }
    return 'equal';
  };
  const ldiff = (a, b) => {
    if (a.length !== b.length) return `${a.length} rows vs ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const x = JSON.parse(a[i]); const y = JSON.parse(b[i]);
      for (const c of Object.keys(x)) if (JSON.stringify(x[c]) !== JSON.stringify(y[c])) return `${c}: ${JSON.stringify(x[c]).slice(0, 200)} vs ${JSON.stringify(y[c]).slice(0, 200)}`;
    }
    return 'equal';
  };

  for (const f of FIXTURES) {
    const M = f.hf ? Ms.hf : Ms.main;
    const s = f.make(M, t0, 1);
    /* The hearthfind fixture rolls 1 in 25 per action (~half the windows find
       one): an hour of windows makes "no window found one" a 1-in-10^12 event,
       so the arm is never blind by luck of the clock. */
    const span = f.hf ? 40 * FLUSH_MS : f.kind === 'gather' ? FOLD_K * FLUSH_MS : FLUSH_MS;
    const ch = settle(M, s, t0, t0 + span);
    if (!ch.intents.length) { ok('D1', false, '', `${f.id}: the fixture settled nothing`); continue; }

    // ATTENDED — one window: shipped vs old pack vs every poll on its own.
    const w = f.hf ? (ch.intents.find((i) => i.args.p_delta.hearthfind) || null) : ch.intents[0];
    if (!w) { ok('D1', false, '', `${f.id}: no window carried a hearthfind (the fixture is blind)`); continue; }
    const wi = ch.intents.indexOf(w);
    const polls = pollsOf(ch, w);
    const shipped = w.args.p_delta;
    const oldPack = { ...shipped, progress: rawProgress(polls) };
    if (!oldPack.progress.length) delete oldPack.progress;
    /* Characters start where the window starts: the windows before it are
       applied first, identically, to every character of the comparison. */
    const prefix = ch.intents.slice(0, wi).map((i) => i.args.p_delta);
    /* Created INSIDE the comparison's clock too: player_state's defaults are now(). */
    const [uShip, uOld, uPoll] = [uid(++n + 500), uid(++n + 500), uid(++n + 500)];
    const preIds = prefix.map(() => intentId());
    const wId = intentId();
    const rawN = (oldPack.progress || []).length;
    const oldComparable = f.kind === 'gather' || rawN <= M.contract.MAX_PROGRESS_OPS;
    const [pre, rShip, rOld, rPoll] = await clock(async () => {
      for (const u of [uShip, uOld, uPoll]) await mkChar(s, f.pet, u);
      return [
      [await applyAll(uShip, prefix, preIds), await applyAll(uOld, prefix, preIds), await applyAll(uPoll, prefix, preIds)],
      await apply(uShip, shipped, wId),
      /* THE OLD PACK, where it can be applied at all. A combat flush already
         coalesced before this change (foldProgressOps), so its raw list is not
         what shipped and can exceed 64 — then hr_apply refuses it, which is
         the cliff itself, measured and not compared. */
      oldComparable ? await apply(uOld, oldPack, wId) : { ok: true, skipped: true },
      /* Per-poll applies cannot express a hearthfind window: the collapse to
         one find IS the window's rule, so a window carrying one is compared on
         the old pack only. */
      f.hf ? { ok: true, skipped: true } : await applyAll(uPoll, polls),
      ];
    });
    if (!oldComparable) log && log(`  · ${f.id}: the raw ${rawN}-op list exceeds hr_apply's ${M.contract.MAX_PROGRESS_OPS} (refused whole) — compared per poll only`);
    const answered = pre.every((r) => r.ok === true) && rShip.ok === true && rOld.ok === true && rPoll.ok === true;
    ok('D1', answered, `${f.id} ATTENDED: every apply ok (${polls.length} polls, ${rawProgress(polls).length} -> ${(shipped.progress || []).length} ops)`,
      `${f.id} ATTENDED: an apply was refused — ship ${JSON.stringify(rShip).slice(0, 120)} old ${JSON.stringify(rOld).slice(0, 120)} `
      + `poll ${JSON.stringify(rPoll).slice(0, 120)} prefix ${JSON.stringify(pre).slice(0, 120)}`);
    if (answered) {
      const [stS, stO] = [await stateOf(uShip), await stateOf(uOld)];
      const [lgS, lgO] = [await ledgerOf(uShip), await ledgerOf(uOld)];
      if (oldComparable) ok('D1', stS === stO && JSON.stringify(lgS) === JSON.stringify(lgO),
        `${f.id} ATTENDED: coalesced == old pack — state and ${lgS.length} ledger row(s) byte-identical`,
        `${f.id} ATTENDED: coalesced != old pack — state ${diff(stS, stO)}; ledger ${ldiff(lgS, lgO)}`);
      if (!f.hf) {
        const [stS1, stP] = [await stateOf(uShip, STRIP_POLL), await stateOf(uPoll, STRIP_POLL)];
        const [tS, tP] = [await totalsOf(uShip), await totalsOf(uPoll)];
        ok('D1', stS1 === stP && tS === tP,
          `${f.id} ATTENDED: coalesced == every poll on its own — state identical, ledger totals ${tS}`,
          `${f.id} ATTENDED: coalesced != per-poll — state ${diff(stS1, stP)}; totals ${tS} vs ${tP}`);
      }
    }

    // AWAY — the S4 fold (gather only; combat never folds) vs every poll on its own.
    if (f.kind === 'gather' && !f.hf) {
      const wins = ch.intents.slice(0, FOLD_K);
      if (wins.length < 2) { ok('D1', false, '', `${f.id} AWAY: only ${wins.length} window(s) to fold`); continue; }
      const fold = M.gather.foldWindowIntents({ userId: s.userId, slot: 0, shard: 0, version: 1, holder: null }, wins);
      const allPolls = wins.flatMap((it) => pollsOf(ch, it));
      const [uFold, uEach] = [uid(++n + 500), uid(++n + 500)];
      const [rF, rE] = await clock(async () => {
        await mkChar(s, f.pet, uFold); await mkChar(s, f.pet, uEach);
        return [await apply(uFold, fold.args.p_delta), await applyAll(uEach, allPolls)];
      });
      const okA = rF.ok === true && rE.ok === true;
      ok('D1', okA, `${f.id} AWAY: fold of ${wins.length} (${(fold.args.p_delta.progress || []).length} ops) and ${allPolls.length} polls applied`,
        `${f.id} AWAY: refused — fold ${JSON.stringify(rF).slice(0, 160)} polls ${JSON.stringify(rE).slice(0, 160)}`);
      if (okA) {
        const [stF, stE] = [await stateOf(uFold, STRIP_AWAY), await stateOf(uEach, STRIP_AWAY)];
        const [tF, tE] = [await totalsOf(uFold), await totalsOf(uEach)];
        ok('D1', stF === stE && tF === tE,
          `${f.id} AWAY: fold == every poll on its own — state identical, ledger totals ${tF}`,
          `${f.id} AWAY: fold != per-poll — state ${diff(stF, stE)}; totals ${tF} vs ${tE}`);
      }
    }
  }
  if (log) log(`  · D1 replayed ${FIXTURES.length} fixtures through hr_apply`);
}

// ── RUN ────────────────────────────────────────────────────────────────────
async function runAll(db, tree, run, log) {
  const red = new Set();
  const ok = (id, cond, okMsg, badMsg) => {
    if (cond) { if (log) log(`  ✓ ${id} — ${okMsg}`); } else { red.add(id); if (log) log(`  ✗ ${id} — ${badMsg}`); }
  };
  const Ms = { main: await load(tree.base), hf: await load(tree.hf) };
  pureArms(Ms.main, ok, log || (() => {}));
  await dbArms(db, Ms, ok, log, run);
  return red;
}

let db;
try { ({ db } = await bootReplay({})); } catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
}

if (!MUTATE) {
  console.log('\nprogress-coalesce: one tick window files one op per progress row, and pays exactly what its polls pay');
  let red; const tree = await copyTree(null);
  try { red = await runAll(db, tree, 1, console.log); } catch (e) {
    console.error(`harness: ${e && e.stack || e}`); process.exit(2);
  } finally { await rm(tree.base, { recursive: true, force: true }); await rm(tree.hf, { recursive: true, force: true }); }
  if (red.size) { console.log(`\nprogress-coalesce: RED — ${[...red].join(', ')}`); process.exit(1); }
  console.log('\nprogress-coalesce: green — coalesced windows land the same state and ledger as raw ones, under half the op cap.');
  process.exit(0);
}

console.log('\nprogress-coalesce --mutate');
console.log(`[mutants] ${MUTANTS.length}`);
let missed = 0; let run = 2;
for (const m of MUTANTS) {
  const tree = await copyTree(m);
  let red;
  try { red = await runAll(db, tree, run++, null); } catch (e) {
    console.error(`harness: mutant "${m.id}" threw: ${e && e.stack || e}`); process.exit(2);
  } finally { await rm(tree.base, { recursive: true, force: true }); await rm(tree.hf, { recursive: true, force: true }); }
  const caught = m.arms.every((a) => red.has(a));
  console.log(`[mutant] ${m.id} ${caught ? 'caught' : 'survived'}`);
  console.log(`  ${caught ? '✓' : '✗'} ${m.name} → red [${[...red].join(', ')}], wanted [${m.arms.join(', ')}]`);
  if (!caught && !CONTROL) missed++;
}
if (CONTROL) { console.log('\nprogress-coalesce --mutate: control run (nothing planted).'); process.exit(0); }
if (missed) { console.log(`\nprogress-coalesce --mutate: RED — ${missed} mutant(s) survived`); process.exit(1); }
console.log('\nprogress-coalesce --mutate: green — every mutant caught by name.');
process.exit(0);
