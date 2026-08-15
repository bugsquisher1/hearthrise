#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/activity-intent.mjs — THE FIRST PLAYER INTENT, BEHAVIOURALLY.
//
// THE INVARIANTS (each one is a line in the change contract, and each one is
// mutation-proven RED — `--selftest`):
//
//   1. ⚠ AN INTENT COLLECTS BEFORE IT SWITCHES. A character that has been
//      fighting for three hours and then declares a new target is PAID for the
//      three hours first. hr_apply stamps `accrued_to = now()` on any activity
//      delta, so a switch that does not collect confiscates the window — the
//      exact under-payment the S5 over-payment fix creates.
//   2. A REPLAYED INTENT APPLIES NOTHING. Same key, same answer, one effect.
//   3. A MISMATCHED INTENT IS REFUSED. Same key, different target ⇒
//      `intent_mismatch` — not a silent no-op that leaves the player on the
//      wrong monster with ok:true.
//   4. A STALE VERSION IS REFUSED, and the state does not move.
//   5. A WINDOW THE ENGINE CANNOT PRICE REFUSES THE SWITCH rather than eating
//      it (`uncollectable_window`).
//   6. The client authors nothing: the declaration is two allowlisted strings
//      and every number in the outcome came out of a server table.
//
// ── WHERE IT RUNS, AND WHY THAT IS THE STRONGEST AVAILABLE PROOF ────────
// In process against a REAL PostgreSQL (PGlite / PG 18 in WASM) with the REAL
// migration chain applied verbatim — player-state, the generated catalogue,
// daily-budget, apply-engine, character-bootstrap and the new
// 2026-08-15-activity-intent.sql. Nothing server-side is stubbed or modelled.
//
// And, crucially, THE INTENT ITSELF IS NOT PORTED EITHER. `runSetActivity` is
// imported from supabase/functions/hr-accrue/set-activity.js — the same bytes
// tools/pack-edge.mjs ships — behind its one injected seam, `exec`. The Deno
// shell (index.ts) cannot be imported into Node, which is precisely why the
// intent does not live in it: everything that could only be tested by a regex
// over TypeScript has been moved out of it.
//
// ── WHAT THIS DOES **NOT** PROVE ────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend. The advisory lock in hr_apply is
//     EXERCISED and contended by nothing. A6 reaches the state a concurrent
//     caller leaves behind (a version bumped between the read and the switch) by
//     INJECTING it into the `exec` seam at exactly the point a race would
//     produce it — that is a fault injection, not a race.
//   · RLS AND GRANTS. The harness runs as the database owner, so `set local role
//     hr_engine` is not exercised; the migration's own §3 asserts the grants.
//   · THE HTTP SHELL. JWT verification, the pooler and CORS are index.ts's, and
//     they are covered by tests/jwt-verify.mjs, tests/cors-preflight.mjs and
//     tools/switch-on-test.mjs.
//
// ── USAGE ───────────────────────────────────────────────────────────────
//   node tests/activity-intent.mjs               clean run
//   node tests/activity-intent.mjs --list        the mutation catalogue
//   node tests/activity-intent.mjs --selftest    every mutation must be CAUGHT
//   node tests/activity-intent.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1: a guard that
// cannot demonstrate it sees failure is treated as broken, not as a pass.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootChain, ROOT } from './pglite-chain.mjs';
import { computeAccrualInputParity } from './accrual-engine.mjs';

const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);
const FN = (f) => join(ROOT, 'supabase', 'functions', 'hr-accrue', f);

/* Appended to the SHARED chain (tests/pglite-chain.mjs), which already applies
   schema.sql + clan-seat + player-state + accrue-gate. The extras are this
   slice's real dependencies and each is a dependency rather than a preference:
     catalogue           hr_activities / hr_items / the start kit
     daily-budget        apply-engine FAILS CLOSED without hr_day_budget_check
     accrual             hr_offline_cap_ms — the cap the collect reads. It joins
                         clan_members, which is why the clan chain is not
                         optional scaffolding here.
     apply-engine        hr_apply, the one writer
     character-bootstrap hr_create_character, so the character under test is
                         made the way a real player's is
     activity-intent     the file this slice stages */
const EXTRA = [
  ['catalogue', MIG('2026-08-11-catalogue.generated.sql')],
  ['daily-budget', MIG('2026-08-11-daily-budget.sql')],
  ['accrual', MIG('2026-08-11-accrual.sql')],
  ['apply-engine', MIG('2026-08-11-apply-engine.sql')],
  ['character-bootstrap', MIG('2026-08-14-character-bootstrap.sql')],
  ['activity-intent', MIG('2026-08-15-activity-intent.sql')],
];

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Each entry patches a REAL source file — the migration SQL or the intent
   module — with a bug this suite claims to catch. `--selftest` demands every one
   of them turns the run RED. A patch whose anchor does not match, or which
   produces identical text, is a HARNESS failure: a planted bug that was never
   planted is decoration. */
const MUTATIONS = {
  no_collect: {
    file: FN('set-activity.js'),
    why: 'the switch stops collecting first — the elapsed window is confiscated',
    find: '  const collect = await collectCurrentWindow({',
    repl: '  const collect = { outcome: \'nothing\', version: env.version }; const _unused = ({',
  },
  gate_open: {
    file: FN('intents.js'),
    why: 'collectGate proceeds even when the collect was refused',
    find: "  if (outcome === 'refused') {\n    return { proceed: false, version: null, error: (v && v.error) || 'collect_failed' };",
    repl: "  if (outcome === 'refused') {\n    return { proceed: true, version: null, error: null };",
  },
  skip_all_safe: {
    file: FN('intents.js'),
    why: 'every accrued:false is treated as "nothing owed" — an unpriceable window is eaten',
    find: "  return SAFE_SKIP_REASONS.includes(reason) ? 'nothing' : 'refused';",
    repl: "  return 'nothing';",
  },
  no_restart: {
    file: FN('set-activity.js'),
    why: 'the delta stops stamping active_since, so the second watermark never moves',
    find: '    activity: { kind, id: kind === \'idle\' ? null : id, restart: true },',
    repl: '    activity: { kind, id: kind === \'idle\' ? null : id },',
  },
  intent_name_untargeted: {
    file: FN('intents.js'),
    why: 'journal.intent drops the target, so one key reused for two targets silently no-ops',
    find: '  return `${verb}:${kind}:${id}`;',
    repl: '  return `${verb}`;',
  },
  widen_settable: {
    file: FN('set-activity.js'),
    why: 'the intent accepts a kind the accrual engine cannot pay',
    find: "export const SETTABLE_KINDS = Object.freeze(['idle', ...PAYABLE_KINDS]);",
    repl: "export const SETTABLE_KINDS = Object.freeze(['idle', 'combat', 'gather', 'artisan']);",
  },
  no_version_from_collect: {
    file: FN('set-activity.js'),
    why: 'the switch reuses the pre-collect version, so every paid switch conflicts',
    find: '  const version = gate.version ?? env.version;',
    repl: '  const version = env.version;',
  },
  active_since_fallback: {
    file: FN('accrual.js'),
    why: 'a payable activity with no active_since is priced anyway (the clamp is gone)',
    find: '  if (!Number.isFinite(Number(inp.activeSinceMs)) || Number(inp.activeSinceMs) <= 0) {\n    return { accrued: false, reason: SKIP.NO_ACTIVE_SINCE };\n  }',
    repl: '  /* mutated */',
  },
  gate_bucket_missing: {
    file: MIG('2026-08-15-activity-intent.sql'),
    migration: 'activity-intent',
    why: 'hr_rate_gate loses the activity bucket, so every intent call is rate_limited',
    find: "    when 'activity' then v_limit := 30; v_window := interval '1 minute';",
    repl: '    -- mutated: bucket removed',
  },
  input_set_drift: {
    file: FN('set-activity.js'),
    why: 'the collect loses an engine input the accrue verb still passes — two verbs, two prices '
       + 'for one window (this is the shape the auto-eat merge would have produced)',
    find: '    gold: Number(st.gold) || 0,\n',
    repl: '',
  },
  no_shape_check: {
    file: FN('set-activity.js'),
    why: 'a malformed request reaches the database and spends the player\'s rate budget',
    find: '  if (!intentId) {\n    return { status: 400, body: { ok: false, error: INTENT_ERRORS.MISSING_INTENT_ID } };\n  }',
    repl: '  /* mutated: the shape check is gone, so a keyless intent spends the gate */',
  },
};

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.slice(n.length + 3);
};
const has = (n) => argv.includes(`--${n}`);

const UID = '00000000-0000-4000-a345-000000000001';
const UID2 = '00000000-0000-4000-a345-000000000002';

/* Two identities and a helper that runs a statement AS a signed-in caller —
   which is how PostgREST sets identity, and how every other guard in this repo
   drives a SECURITY DEFINER function. */
const FIXTURE = `
insert into auth.users (id) values ('${UID}'), ('${UID2}') on conflict (id) do nothing;

create or replace function public.__a345_create(p_uid uuid, p_slot int)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  v := public.hr_create_character(p_slot);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end $$;
`;

class Red extends Error {}
const fails = [];
function ok(cond, msg) { if (!cond) { fails.push(msg); throw new Red(msg); } }

async function boot(mutate) {
  /* Sources are read off disk and, under a mutation, patched. The patch must
     match EXACTLY ONCE and must change the text — a planted bug that was never
     planted is decoration. SQL patches go through bootChain (which enforces
     exactly that); JS patches are written to a temp copy of the function
     directory, because Node cannot import a string. */
  const patchedJs = new Map();
  let sqlPatches;
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) { const e = new Error(`unknown mutation "${mutate}"`); e.harness = true; throw e; }
    if (m.file.endsWith('.sql')) {
      sqlPatches = new Map([[m.migration, [[m.find, m.repl]]]]);
    } else {
      const src = (await readFile(m.file, 'utf8')).replace(/\r\n/g, '\n');
      const n = src.split(m.find).length - 1;
      if (n !== 1) {
        const e = new Error(`mutation "${mutate}" anchor matched ${n} times (need exactly 1) in ${m.file}`);
        e.harness = true; throw e;
      }
      const after = src.replace(m.find, m.repl);
      if (after === src) {
        const e = new Error(`mutation "${mutate}" produced identical text`); e.harness = true; throw e;
      }
      patchedJs.set(m.file, after);
    }
  }

  let db;
  try {
    ({ db } = await bootChain({ extra: EXTRA, patches: sqlPatches }));
  } catch (e) {
    if (e.harness) throw e;
    /* A mutation that makes a migration refuse to install IS the guard working —
       the migration's own do$$ self-check is a commit gate, and a bug that
       cannot be installed beats one that is detected at runtime. */
    throw new Red(`migration chain refused: ${e.message}`);
  }
  await db.exec(FIXTURE);

  const mods = await loadModules(patchedJs);
  return { db, ...mods };
}

async function loadModules(patched) {
  const { writeFile, mkdtemp, cp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');

  if (!patched.size) {
    const bust = `?t=${Date.now()}${Math.random()}`;
    const sa = await import(pathToFileURL(FN('set-activity.js')).href + bust);
    const it = await import(pathToFileURL(FN('intents.js')).href + bust);
    const ac = await import(pathToFileURL(FN('accrual.js')).href + bust);
    return { sa, it, ac, fnDir: FN('') };
  }
  /* A mutated module has to be imported from disk, and it imports its siblings
     by relative path — so the WHOLE function directory is copied to a temp dir
     at the same depth relative to ROOT, the patched file is overwritten there,
     and the copy is imported. Same depth matters: accrual.js reaches
     ../../../src/core/**. */
  const base = await mkdtemp(join(tmpdir(), 'hr-a345-'));
  const dir = join(base, 'supabase', 'functions', 'hr-accrue');
  await cp(join(ROOT, 'supabase', 'functions', 'hr-accrue'), dir, { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  for (const [file, text] of patched) {
    if (!file.startsWith(join(ROOT, 'supabase', 'functions'))) continue;
    await writeFile(join(dir, file.split(/[\\/]/).pop()), text, 'utf8');
  }
  const sa = await import(pathToFileURL(join(dir, 'set-activity.js')).href);
  const it = await import(pathToFileURL(join(dir, 'intents.js')).href);
  const ac = await import(pathToFileURL(join(dir, 'accrual.js')).href);
  /* SOURCE-READING ASSERTIONS MUST READ THE SOURCE THAT RAN. A14 originally read
     the repo path while a mutation ran from this temp copy, so its own mutation
     SLIPPED — an assertion pointed at a file nobody executed. */
  return { sa, it, ac, fnDir: dir };
}

/** THE SEAM. One statement, rows out — exactly what index.ts hands the module.
 *
 *  `set role hr_engine` around the statement, and that is not cosmetic: it is
 *  the role the Edge Function connects as, it holds ZERO table privileges in
 *  every schema, and it holds EXECUTE on exactly the five functions the engine
 *  needs. So every statement the intent runs here is enforced against the real
 *  grant table — if the intent ever tried to touch a table directly it would be
 *  refused here exactly as it would be in production. (What is still NOT
 *  exercised: RLS, because every statement is a function call, and the pooler.)
 *
 *  Hooks run OUTSIDE the role switch: they are the harness playing the part of a
 *  concurrent writer, which is a privilege the engine does not have and must
 *  not be given in order to be tested against. */
function makeExec(db, hooks = {}) {
  return async (text, params) => {
    if (hooks.before) await hooks.before(text, params);
    if (hooks.intercept) {
      const forced = await hooks.intercept(text, params);
      if (forced !== undefined) return forced;
    }
    await db.exec('set role hr_engine');
    try {
      const r = await db.query(text, params);
      return r.rows;
    } finally {
      await db.exec('reset role');
    }
  };
}

const uuid = () => crypto.randomUUID();
const state = async (db, uid, slot = 0) =>
  (await db.query(
    'select * from public.player_state where user_id = $1 and slot = $2', [uid, slot])).rows[0];
const ledger = async (db, uid, slot = 0) =>
  (await db.query(
    'select kind, intent, gold, gold_in, xp_in, meta from public.player_ledger '
    + 'where user_id = $1 and slot = $2 order by at, id', [uid, slot])).rows;
const skillXp = async (db, uid, sk, slot = 0) => Number((await db.query(
  'select xp from public.player_skills where user_id=$1 and slot=$2 and skill_id=$3',
  [uid, slot, sk])).rows[0]?.xp ?? 0);

// ════════════════════════════════════════════════════════════════════════
async function run(mutate) {
  fails.length = 0;
  const { db, sa, it, ac, fnDir } = await boot(mutate);
  const exec = makeExec(db);
  const call = (o) => sa.runSetActivity({ exec, user: UID, slot: 0, ...o });

  // ── A0. THE ALLOWLIST IS DERIVED, NOT RESTATED ───────────────────────────
  // The intent may never accept a kind the accrual engine cannot pay: that is
  // the structural reason an unpriceable window can't be created in the first
  // place. Checked against the CATALOGUE, so a kind added to hr_activities
  // without a payer shows up here.
  {
    const kinds = (await db.query('select distinct kind from public.hr_activities order by 1')).rows
      .map((r) => r.kind);
    ok(kinds.length >= 2, `A0: the catalogue has only ${kinds.length} kind(s) — nothing to refuse`);
    for (const k of sa.SETTABLE_KINDS) {
      ok(k === 'idle' || ac.PAYABLE_KINDS.includes(k),
        `A0: SETTABLE_KINDS contains '${k}', which computeAccrual cannot pay — a switch would confiscate it`);
    }
    // CONTROL: at least one real catalogue kind must be REFUSED, or A0 is vacuous.
    const unpayable = kinds.filter((k) => !sa.SETTABLE_KINDS.includes(k));
    ok(unpayable.length > 0,
      'A0-CONTROL: every catalogue kind is settable, so the refusal below proves nothing');
    for (const k of unpayable) {
      const r = await call({ intentId: uuid(), activity: { kind: k, id: 'oak' } });
      ok(r.body.error === 'activity_unsupported',
        `A0: declaring kind '${k}' returned ${JSON.stringify(r.body)} — expected activity_unsupported`);
    }
  }

  // ── A1. NO CHARACTER ─────────────────────────────────────────────────────
  {
    const r = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'goblin' } });
    ok(r.status === 409 && r.body.error === 'no_character',
      `A1: an empty slot returned ${r.status} ${JSON.stringify(r.body)}`);
  }

  // Now give the player a character, the server's own way.
  {
    const r = (await db.query('select public.__a345_create($1,0) as v', [UID])).rows[0].v;
    ok(r.ok === true && r.created === true, `A1b: hr_create_character returned ${JSON.stringify(r)}`);
    const st = await state(db, UID);
    ok(st.active_kind === 'idle' && st.active_id === null,
      `A1b: a fresh character is not idle (${st.active_kind}/${st.active_id})`);
    ok(st.active_since === null, 'A1b: a fresh character already has an active_since');
  }

  // ── A2. THE HAPPY PATH: idle → combat ────────────────────────────────────
  let v2;
  {
    const before = await state(db, UID);
    const r = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'goblin' } });
    ok(r.status === 200 && r.body.ok === true, `A2: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    const st = await state(db, UID);
    ok(st.active_kind === 'combat' && st.active_id === 'goblin',
      `A2: the pointer is ${st.active_kind}/${st.active_id}`);
    ok(st.active_since !== null, 'A2: active_since was not stamped — the second watermark is dead');
    ok(Number(st.version) === Number(before.version) + 1,
      `A2: version ${before.version} → ${st.version}, expected exactly one bump`);
    ok(Number(st.gold) === Number(before.gold), 'A2: an idle→combat switch moved gold');
    const rows = await ledger(db, UID);
    const mine = rows.filter((x) => String(x.intent).startsWith('set_activity'));
    ok(mine.length === 1, `A2: ${mine.length} set_activity ledger rows, expected 1`);
    ok(mine[0].intent === 'set_activity:combat:goblin',
      `A2: journal.intent is '${mine[0].intent}' — it must name the TARGET, or one key reused for `
      + 'two targets is a silent no-op instead of intent_mismatch');
    ok(mine[0].kind === 'admin', `A2: the ledger kind is '${mine[0].kind}', expected admin (no value moved)`);
    ok(Number(mine[0].gold_in) === 0, 'A2: a declaration charged the daily gold budget');
    v2 = Number(st.version);
  }

  // ── A3. ⚠ THE RULE: COLLECT BEFORE SWITCH ────────────────────────────────
  // Three hours of goblins, then "now I fight rats". The three hours must be
  // PAID, not confiscated. This is the invariant the whole slice exists for.
  let paidGold, paidXp;
  {
    /* ⚠ THE PROBE HAS TO SURVIVE THE THREE HOURS, OR THIS TEST IS A COIN FLIP.
       Found by the mutation harness, not by reasoning: the FIRST version of A3
       used the character exactly as hr_create_character makes it — hp 10/10, a
       bronze sword — and a fresh character dies to a Goblin in about sixty
       seconds. `simulateSpan` then ends the span, and a three-hour window
       legitimately pays ~0 gold. The clean run passed, and two DIFFERENT
       mutations reported the same "the window was confiscated" failure — one of
       them for the right reason and one because the PRNG seed (hr_seed mixes a
       per-database 256-bit secret, so it differs on every boot) happened to
       kill the probe. An assertion that fails when nothing is wrong is the same
       defect as one that passes when something is: both mean the run carries no
       information.

       So the probe is levelled first, with direct DML as the harness owner —
       fixture setup, not a code path under test — and `died` is asserted false
       so a future flake is LOUD instead of being read as a confiscation. */
    await db.query(
      `update public.player_skills set xp = 800000
        where user_id = $1 and slot = 0
          and skill_id in ('attack','strength','defence','hitpoints')`, [UID]);
    await db.query(
      `update public.player_state
          set max_hp = 900, hp = 900,
              accrued_to = now() - interval '3 hours', active_since = now() - interval '3 hours'
        where user_id = $1 and slot = 0`, [UID]);
    const before = await state(db, UID);
    const beforeXp = await skillXp(db, UID, 'attack');
    const beforeLedger = (await ledger(db, UID)).length;

    const r = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'rat' } });
    ok(r.status === 200 && r.body.ok === true, `A3: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    /* THE CONTROL IS "IT FOUGHT", NOT "IT SURVIVED". The probe is EXPECTED to
       die eventually: the server has no autoEat handler (food_slot /
       auto_eat_pct are not columns on player_state), so nothing heals it and
       three unhealed hours end in a death for any level. That is a documented,
       deliberate under-pay, not a bug in this test. What must hold is that the
       window was FOUGHT before it ended — which is what makes "gold > 0" a
       statement about the collect rather than about the PRNG. */
    ok(r.body.collected,
      'A3: the response carries NO collection receipt — the switch did not collect at all, so the '
      + 'three-hour window was confiscated. An intent must COLLECT BEFORE IT SWITCHES.');
    ok(r.body.collected.kills > 0,
      `A3-CONTROL: the probe landed ${r.body.collected.kills} kills in three hours, so "paid 0 `
      + 'gold" would be honest and the assertion below would be measuring the PRNG rather than the '
      + 'collect. Level the fixture, do not relax the assertion.');

    const st = await state(db, UID);
    paidGold = Number(st.gold) - Number(before.gold);
    paidXp = (await skillXp(db, UID, 'attack')) - beforeXp;
    ok(paidGold > 0,
      `A3: THE WINDOW WAS CONFISCATED — three hours of combat paid ${paidGold} gold. `
      + 'An intent must COLLECT BEFORE IT SWITCHES; hr_apply stamps accrued_to = now() on any '
      + 'activity delta, so a switch that does not collect first destroys the elapsed window.');
    ok(paidXp > 0, `A3: three hours of combat paid ${paidXp} attack XP`);
    ok(st.active_id === 'rat', `A3: the switch did not happen (${st.active_id})`);

    // TWO applies, two ledger rows — the payment and the declaration, separately
    // auditable. One merged row would be neither.
    const rows = (await ledger(db, UID)).slice(beforeLedger);
    ok(rows.length === 2, `A3: ${rows.length} ledger rows for collect+switch, expected 2`);
    const accrue = rows.find((x) => x.intent === 'accrue');
    const decl = rows.find((x) => x.intent === 'set_activity:combat:rat');
    ok(!!accrue, `A3: no 'accrue' ledger row — the collect did not happen (${rows.map((x) => x.intent)})`);
    ok(!!decl, 'A3: no set_activity ledger row');
    ok(accrue.kind === 'combat', `A3: the collect was journalled as '${accrue.kind}', expected combat`);
    ok(Number(accrue.gold_in) === paidGold,
      `A3: the ledger stamped gold_in=${accrue.gold_in} but ${paidGold} gold arrived — the daily `
      + 'budget would be charged the wrong amount');
    // The receipt the client renders, stated by the server.
    ok(r.body.collected && r.body.collected.gold === paidGold,
      `A3: the response receipt says ${JSON.stringify(r.body.collected)} but ${paidGold} gold was paid`);

    // AND THE WINDOW IS CLOSED: accrued_to is now(), so the same span cannot be
    // paid twice.
    ok(new Date(st.accrued_to).getTime() > new Date(before.accrued_to).getTime(),
      'A3: accrued_to did not advance — the same window could be collected again');
  }

  // ── A4. A REPLAYED INTENT APPLIES NOTHING ────────────────────────────────
  {
    const key = uuid();
    const first = await call({ intentId: key, activity: { kind: 'combat', id: 'bear' } });
    ok(first.body.ok === true, `A4: the first call failed: ${JSON.stringify(first.body).slice(0, 200)}`);
    const mid = await state(db, UID);
    const midLedger = (await ledger(db, UID)).length;

    const again = await call({ intentId: key, activity: { kind: 'combat', id: 'bear' } });
    ok(again.body.ok === true, `A4: the replay was not ok:true: ${JSON.stringify(again.body).slice(0, 200)}`);
    ok(again.body.replayed === true, 'A4: the replay was not reported as a replay');
    const after = await state(db, UID);
    ok(Number(after.version) === Number(mid.version),
      `A4: the replay bumped version ${mid.version} → ${after.version} — it applied something`);
    ok(Number(after.gold) === Number(mid.gold), 'A4: the replay moved gold');
    ok((await ledger(db, UID)).length === midLedger, 'A4: the replay wrote a ledger row');
    ok(again.body.collected === null,
      'A4: the replay returned a collection RECEIPT for work this invocation did not do');
  }

  // ── A5. A MISMATCHED INTENT IS REFUSED ───────────────────────────────────
  // Same key, DIFFERENT target. Without the target in journal.intent this
  // answers replayed:true and silently leaves the player on the old monster.
  {
    const key = uuid();
    const first = await call({ intentId: key, activity: { kind: 'combat', id: 'wolf' } });
    ok(first.body.ok === true, `A5: the control call failed: ${JSON.stringify(first.body).slice(0, 200)}`);
    const mid = await state(db, UID);

    const clash = await call({ intentId: key, activity: { kind: 'combat', id: 'goblin' } });
    ok(clash.body.ok === false && clash.body.error === 'intent_mismatch',
      `A5: reusing one key for a different target returned ${JSON.stringify(clash.body).slice(0, 200)} `
      + '— expected intent_mismatch. A silent replay here leaves the player fighting the wrong monster.');
    const after = await state(db, UID);
    ok(after.active_id === mid.active_id,
      `A5: the mismatched call still switched (${mid.active_id} → ${after.active_id})`);
    ok(Number(after.version) === Number(mid.version), 'A5: the mismatched call bumped version');
  }

  // ── A6. A STALE VERSION IS REFUSED ───────────────────────────────────────
  // Injected at exactly the point a concurrent apply would produce it: after the
  // read, before the switch. PGlite is one backend, so this is a fault
  // injection and not a race — stated, not implied.
  {
    const before = await state(db, UID);
    let bumped = false;
    const racingExec = makeExec(db, {
      before: async (text) => {
        if (!bumped && /hr_apply/.test(text)) {
          bumped = true;
          await db.query(
            'update public.player_state set version = version + 1 where user_id = $1 and slot = 0', [UID]);
        }
      },
    });
    const r = await sa.runSetActivity({
      exec: racingExec, user: UID, slot: 0, intentId: uuid(),
      activity: { kind: 'combat', id: 'goblin' },
    });
    ok(bumped, 'A6-CONTROL: the injector never fired — no hr_apply statement was seen, so A6 proves nothing');
    ok(r.body.ok === false && r.body.error === 'version_conflict',
      `A6: a stale version returned ${JSON.stringify(r.body).slice(0, 200)} — expected version_conflict`);
    const after = await state(db, UID);
    ok(after.active_id === before.active_id,
      `A6: the conflicted call still switched (${before.active_id} → ${after.active_id})`);
  }

  // ── A7. A REFUSED COLLECT DOES NOT CONFISCATE ────────────────────────────
  // The collect's apply is forced to fail. The switch must be refused, the
  // watermark must not move, and the pointer must not change.
  {
    await db.query(
      `update public.player_state
          set accrued_to = now() - interval '2 hours', active_since = now() - interval '2 hours',
              active_kind = 'combat', active_id = 'goblin'
        where user_id = $1 and slot = 0`, [UID]);
    const before = await state(db, UID);

    let sawCollect = false;
    const brokenExec = makeExec(db, {
      intercept: async (text, params) => {
        if (/hr_apply/.test(text) && String(params[4]).includes('"intent":"accrue"')) {
          sawCollect = true;
          return [{ res: { ok: false, error: 'daily_budget', dim: 'gold' } }];
        }
        return undefined;
      },
    });
    const r = await sa.runSetActivity({
      exec: brokenExec, user: UID, slot: 0, intentId: uuid(),
      activity: { kind: 'combat', id: 'rat' },
    });
    ok(sawCollect, 'A7-CONTROL: no collect apply was attempted, so the injection proves nothing');
    ok(r.body.ok === false && r.body.stage === 'collect' && r.body.error === 'daily_budget',
      `A7: a refused collect returned ${JSON.stringify(r.body).slice(0, 200)} — the switch must be refused `
      + 'with the collect\'s own code and stage:collect');
    const after = await state(db, UID);
    ok(after.active_id === before.active_id && after.active_kind === before.active_kind,
      `A7: the switch happened anyway (${before.active_id} → ${after.active_id})`);
    ok(new Date(after.accrued_to).getTime() === new Date(before.accrued_to).getTime(),
      'A7: accrued_to MOVED after a refused collect — that is the confiscation this rule exists to prevent');

    // CONTROL: the identical call WITHOUT the injection succeeds, so A7 is not
    // measuring a call that was broken for some other reason.
    const good = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'rat' } });
    ok(good.body.ok === true, `A7-CONTROL: the uninjected call also failed: ${JSON.stringify(good.body).slice(0, 200)}`);
  }

  // ── A8. AN UNPRICEABLE WINDOW REFUSES THE SWITCH ─────────────────────────
  // An inconsistent row (payable kind, no active_since). The engine cannot bound
  // the span, so the honest answer is to refuse rather than to eat it.
  {
    await db.query(
      `update public.player_state
          set accrued_to = now() - interval '4 hours', active_since = null,
              active_kind = 'combat', active_id = 'goblin'
        where user_id = $1 and slot = 0`, [UID]);
    const before = await state(db, UID);
    const r = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'rat' } });
    ok(r.body.ok === false && r.body.error === 'uncollectable_window',
      `A8: returned ${JSON.stringify(r.body).slice(0, 250)} — expected uncollectable_window`);
    ok(r.body.detail && r.body.detail.reason === 'no_active_since',
      `A8: the refusal did not name why (${JSON.stringify(r.body.detail)})`);
    const after = await state(db, UID);
    ok(new Date(after.accrued_to).getTime() === new Date(before.accrued_to).getTime(),
      'A8: the four-hour window was confiscated by a switch that could not price it');
    // Repair, and CONTROL that the same call then works.
    await db.query(
      'update public.player_state set active_since = accrued_to where user_id = $1 and slot = 0', [UID]);
    const good = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'rat' } });
    ok(good.body.ok === true, `A8-CONTROL: after repair the call still failed: ${JSON.stringify(good.body).slice(0, 200)}`);
  }

  // ── A9. STOPPING ─────────────────────────────────────────────────────────
  {
    const r = await call({ intentId: uuid(), activity: { kind: 'idle', id: null } });
    ok(r.body.ok === true, `A9: 'I stopped' failed: ${JSON.stringify(r.body).slice(0, 200)}`);
    const st = await state(db, UID);
    ok(st.active_kind === 'idle' && st.active_id === null,
      `A9: after stopping the pointer is ${st.active_kind}/${st.active_id}`);
    const last = (await ledger(db, UID)).at(-1);
    ok(last.intent === 'set_activity:idle', `A9: journalled as '${last.intent}'`);
    // idle + an id is a contradiction and must be named, not silently ignored.
    const bad = await call({ intentId: uuid(), activity: { kind: 'idle', id: 'goblin' } });
    ok(bad.body.error === 'bad_activity', `A9: idle+id returned ${JSON.stringify(bad.body)}`);
  }

  // ── A10. THE CLIENT AUTHORS NOTHING ──────────────────────────────────────
  {
    const r = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'not_a_monster' } });
    ok(r.body.ok === false && r.body.error === 'unknown_activity',
      `A10: a forged activity id returned ${JSON.stringify(r.body).slice(0, 200)}`);

    // No key ⇒ refused BEFORE any database work. Measured, not assumed: the
    // rate counter must not have moved.
    const n0 = Number((await db.query(
      'select count(*) as n from public.hr_rate_counters where user_id = $1', [UID2])).rows[0].n);
    const r2 = await sa.runSetActivity({
      exec, user: UID2, slot: 0, intentId: null, activity: { kind: 'combat', id: 'goblin' },
    });
    ok(r2.status === 400 && r2.body.error === 'missing_intent_id',
      `A10: a keyless intent returned ${JSON.stringify(r2.body)}`);
    const n1 = Number((await db.query(
      'select count(*) as n from public.hr_rate_counters where user_id = $1', [UID2])).rows[0].n);
    ok(n1 === n0,
      'A10: a malformed request spent rate budget — the shape check must precede the gate, or a '
      + 'broken client can exhaust a real player\'s allowance');
  }

  // ── A11. THE RATE GATE ───────────────────────────────────────────────────
  {
    await db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
    let limited = 0; let allowed = 0;
    for (let i = 0; i < 40; i++) {
      const r = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'goblin' } });
      if (r.status === 429) limited++; else allowed++;
    }
    ok(limited > 0, `A11: 40 calls in a minute produced ${limited} refusals — the gate is not applied`);
    ok(allowed > 0, 'A11-CONTROL: every call was refused, so the limit is not what is being measured');
  }

  // ── A12. THE PARSER ──────────────────────────────────────────────────────
  // The exact function the shell calls, on the exact shapes an attacker sends.
  {
    const req = await import(
      (await import('node:url')).pathToFileURL(FN('request.js')).href + `?t=${Date.now()}`);
    const hostile = [
      null, 0, 'slot', [], { slot: 2, verb: 'set_activity', capMs: 9e9, tickMs: 1, gold: 1e12 },
      { verb: 'DROP TABLE' }, { verb: 42 }, { intentId: 'nope' },
      { intentId: '../../etc/passwd' }, { activity: 'combat' }, { activity: { kind: 'COMBAT' } },
      { activity: { kind: 'combat', id: 'a'.repeat(200) } },
      { activity: { kind: 'combat', id: "goblin'; drop table player_state; --" } },
      JSON.parse('{"__proto__":{"verb":"set_activity"},"slot":1}'),
    ];
    for (const b of hostile) {
      const r = req.parseIntent(b);
      ok(Object.getPrototypeOf(r) === null, 'A12: parseIntent returned an object with a prototype');
      const keys = Object.keys(r).sort().join(',');
      ok(keys === [...req.INTENT_KEYS].sort().join(','),
        `A12: parseIntent returned [${keys}] — the contract is [${req.INTENT_KEYS}]`);
      ok(Number.isInteger(r.slot) && r.slot >= 0 && r.slot <= req.MAX_SLOT,
        `A12: slot escaped its bound (${r.slot})`);
      ok(r.verb === null || req.VERBS.includes(r.verb), `A12: verb '${r.verb}' is not allowlisted`);
      ok(r.intentId === null || req.UUID_RE.test(r.intentId), `A12: intentId '${r.intentId}' is not a uuid`);
      if (r.activity) {
        ok(r.activity.kind === null || req.ACTIVITY_KINDS.includes(r.activity.kind),
          `A12: activity.kind '${r.activity.kind}' is not allowlisted`);
        ok(r.activity.id === null || req.ACTIVITY_ID_RE.test(r.activity.id),
          `A12: activity.id '${r.activity.id}' escaped the id shape`);
      }
    }
    ok(({}).verb === undefined, 'A12: Object.prototype was polluted');
    // A MISSING verb is `accrue` — the deployed client posts {slot} and nothing
    // else, and a build that stopped understanding it takes away time off
    // everybody at once.
    ok(req.parseIntent({ slot: 1 }).verb === 'accrue',
      'A12: an absent verb is not accrue — the deployed client would break');
    // An UNKNOWN verb is null, never silently accrue.
    ok(req.parseIntent({ verb: 'set_activty' }).verb === null,
      'A12: a typo\'d verb was defaulted instead of refused');
    // The legal values survive, so none of the above is "always null".
    const good = req.parseIntent({
      slot: 3, verb: 'set_activity', intentId: '11111111-2222-4333-8444-555555555555',
      activity: { kind: 'combat', id: 'goblin' },
    });
    ok(good.slot === 3 && good.verb === 'set_activity'
      && good.intentId === '11111111-2222-4333-8444-555555555555'
      && good.activity.kind === 'combat' && good.activity.id === 'goblin',
      `A12-CONTROL: a legitimate request was mangled: ${JSON.stringify(good)}`);
  }

  // ── A13. THE COLLECT-GATE RULE, EXHAUSTIVELY ─────────────────────────────
  {
    ok(it.collectGate({ outcome: 'paid', version: 7 }).proceed === true, 'A13: paid must proceed');
    ok(it.collectGate({ outcome: 'nothing', version: 7 }).proceed === true, 'A13: nothing must proceed');
    ok(it.collectGate({ outcome: 'refused', error: 'x' }).proceed === false, 'A13: refused must not proceed');
    ok(it.collectGate({ outcome: 'something_new' }).proceed === false,
      'A13: an UNKNOWN outcome must fail closed — "I do not know whether the window was paid" '
      + 'must never mean "then confiscate it"');
    ok(it.collectGate(undefined).proceed === false, 'A13: an absent verdict must fail closed');
    ok(it.classifySkip('unsupported_activity') === 'refused',
      'A13: an unpayable activity classified as "nothing owed" — three hours of mining would vanish');
    ok(it.classifySkip('idle') === 'nothing', 'A13-CONTROL: idle must be safe, or every switch refuses');
    ok(it.classifySkip('a_reason_from_the_future') === 'refused',
      'A13: an unrecognised skip reason must fail closed');
  }

  // ── A14. TWO CALLERS, ONE ENGINE — THE INPUT SETS MUST MATCH ─────────────
  // `computeAccrual` is now called from index.ts (the accrue verb) and from
  // set-activity.js (the collect a switch runs first). If one gains an input the
  // other does not, the two verbs price the SAME window differently — silently,
  // with no error, in the player's disfavour on whichever side is short. Found
  // the hard way: while this slice was in flight, main landed auto-eat and added
  // `inventory` / `autoEatEnabled` / `autoEatFood` / `autoEatPct` to the accrue
  // literal only, so a collect would have fought three hours with no food.
  //
  // ⚠ NOT REIMPLEMENTED HERE. The check lives in tests/accrual-engine.mjs —
  //   which run-smoke.mjs runs on EVERY push, where this heavy PGlite guard does
  //   not — and is imported. A second copy of a drift detector is the drift it
  //   is detecting. `fnDir` points at the MUTATED temp copy under --mutate, so
  //   the assertion reads the source that actually ran; reading the repo path
  //   instead is how its own mutation SLIPPED the first time.
  {
    const found = await computeAccrualInputParity(fnDir);
    ok(found.length === 0, `A14: ${found[0] || ''}`);
  }

  await db.close();
  return fails;
}

// ── driver ──────────────────────────────────────────────────────────────
(async () => {
  if (has('list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(26)} ${m.why}`);
    process.exit(0);
  }

  const one = argOf('mutate', null);
  if (one) {
    let red = false; let why = '';
    try { const f = await run(one); red = f.length > 0; why = f[0] || ''; }
    catch (e) { if (e.harness) { console.error(e.message); process.exit(2); } red = true; why = e.message; }
    console.log(`${one}: ${red ? 'CAUGHT' : 'SLIPPED'}${red ? ` — ${why.slice(0, 160)}` : ''}`);
    process.exit(red ? 0 : 1);
  }

  let clean = [];
  try { clean = await run(null); }
  catch (e) {
    if (e.harness) { console.error(e.message); process.exit(2); }
    if (!(e instanceof Red)) { console.error(e.stack || e.message); process.exit(2); }
    clean = fails.length ? fails : [e.message];
  }
  if (clean.length) {
    console.log('activity-intent: RED');
    for (const f of clean) console.log('  ✗ ' + f);
    process.exit(1);
  }
  console.log('activity-intent: OK — collect-before-switch, replay, mismatch, stale version, '
    + 'uncollectable window, gate, parser (13 groups, real PG18 + the deployed intent module)');

  if (has('selftest')) {
    let slipped = 0;
    for (const id of Object.keys(MUTATIONS)) {
      let red = false; let why = '';
      try { const f = await run(id); red = f.length > 0; why = f[0] || ''; }
      catch (e) { if (e.harness) { console.error(e.message); process.exit(2); } red = true; why = e.message; }
      console.log(`  ${red ? 'CAUGHT ' : 'SLIPPED'} ${id.padEnd(26)} ${red ? why.slice(0, 110) : MUTATIONS[id].why}`);
      if (!red) slipped++;
    }
    if (slipped) { console.log(`\n${slipped} mutation(s) SLIPPED — the guard cannot see them.`); process.exit(1); }
    console.log(`\nall ${Object.keys(MUTATIONS).length} mutations CAUGHT.`);
  }
})();
