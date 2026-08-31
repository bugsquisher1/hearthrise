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
     activity-intent     the file this slice stages
     key-hygiene         b346 — the C1/C3 conditions from the adversarial
                         review. It `create or replace`s hr_apply, so it must be
                         LAST: applied before apply-engine it would simply be
                         deleted. A15 and A16 measure its behaviour. */
const EXTRA = [
  ['catalogue', MIG('2026-08-11-catalogue.generated.sql')],
  ['daily-budget', MIG('2026-08-11-daily-budget.sql')],
  ['accrual', MIG('2026-08-11-accrual.sql')],
  ['apply-engine', MIG('2026-08-11-apply-engine.sql')],
  ['character-bootstrap', MIG('2026-08-14-character-bootstrap.sql')],
  ['activity-intent', MIG('2026-08-15-activity-intent.sql')],
  ['key-hygiene', MIG('2026-08-15-intent-key-hygiene.sql')],
  /* b348. ORDER IS LOAD-BEARING and each file says so in its own §0:
     auto-eat replaces hr_state_of and adds the three columns tool-carry's
     restated hr_state_of reads; tool-carry replaces hr_apply and must be LAST
     of anything that does, or its delta key is silently deleted while the Edge
     Function keeps proposing it. Both are here so A3b drives the WITH-column
     configuration — which is what production will be. */
  ['auto-eat', MIG('2026-08-15-auto-eat.sql')],
  ['tool-carry', MIG('2026-08-15-tool-carry.sql')],
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
    why: 'the switch stops collecting first — the elapsed window is confiscated. (Distinct from '
       + 'registry_collects_first_false: there the REGISTRY lies, here the CODE ignores it.)',
    find: '  const collect = collectsFirst(VERB)',
    repl: '  const collect = false /* mutated: the code stops asking the registry */',
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
    /* `farm` is a real `player_state.active_kind` value the engine has no
       simulation for, so this plants exactly the failure the derivation
       prevents. It used to plant `artisan`, which stopped being a mutation the
       day artisan became payable — a mutation that produces identical text is
       caught by the harness, but a mutation that produces DIFFERENT text and
       tests nothing would not have been. */
    repl: "export const SETTABLE_KINDS = Object.freeze(['idle', 'combat', 'gather', 'artisan', 'farm']);",
  },
  /* b348, and it is the OPPOSITE failure to `widen_settable`. That one plants a
     kind the engine cannot pay; this one takes away a kind it CAN — which is
     what a careless revert of the gather work looks like, and it is silent:
     gathering simply answers `unsupported_activity` again, which is a REFUSING
     reason, so nothing errors and nobody's night is confiscated. It just stops
     paying, for 23 of the 344 catalogue activities. A3b is the only thing that
     notices. */
  narrow_payable: {
    file: FN('accrual.js'),
    why: 'gathering silently stops being payable again',
    find: "export const PAYABLE_KINDS = Object.freeze(['combat', 'gather', 'artisan']);",
    repl: "export const PAYABLE_KINDS = Object.freeze(['combat']);",
  },
  /* b356's mirror of `no_gather_nodes`: the artisan index reaching the engine.
     Drop it and every artisan pointer answers `unknown_recipe` — refusing, so
     the window is deferred rather than confiscated, but 261 of the 344
     catalogue activities silently stop paying and no unit test sees it, because
     tests/artisan-accrual.mjs calls computeAccrual directly with its own index. */
  /* Security C3. The escape hatch itself, and its partition — two mutations,
     because they fail in OPPOSITE directions and only one of them is loud.
     Removing the hatch re-freezes every character on an unpriceable pointer;
     widening it turns a STOP into a confiscation of a window that waiting would
     have paid, which is silent. */
  no_force_close: {
    file: FN('set-activity.js'),
    why: 'an unpriceable pointer can no longer be escaped, not even by stopping',
    find: '      && mayForceCloseWindow(decl.kind, collect.detail && collect.detail.reason)) {',
    repl: '      && false) {',
  },
  force_close_everything: {
    file: FN('intents.js'),
    why: 'a STOP forfeits TRANSIENT windows too — the confiscation the contract forbids',
    find: '  return kind === \'idle\' && POINTER_SKIP_REASONS.indexOf(reason) !== -1;',
    repl: '  return kind === \'idle\';',
  },
  no_artisan_recipes: {
    file: FN('set-activity.js'),
    why: 'the collect is not given the artisan catalogue',
    find: '    recipes: ARTISAN_RECIPES_ALL,',
    repl: '    recipes: {},',
  },
  /* The gather index reaching the engine. Drop it and every gathering pointer
     answers `unknown_node` — refusing, so the window is deferred rather than
     confiscated, but the player never accrues from gathering again and no unit
     test sees it, because accrual-engine.mjs calls computeAccrual directly. */
  no_gather_nodes: {
    file: FN('set-activity.js'),
    why: 'the collect is not given the gather catalogue',
    find: '    nodes: GATHER_NODES,',
    repl: '    nodes: {},',
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
    find: '  if (requiresKey(VERB) && !intentId) {\n    return { status: 400, body: { ok: false, error: INTENT_ERRORS.MISSING_INTENT_ID } };\n  }',
    repl: '  /* mutated: the shape check is gone, so a keyless intent spends the gate */',
  },

  /* ── b346 — the adversarial review's conditions ────────────────────────── */

  no_key_release: {
    file: MIG('2026-08-15-intent-key-hygiene.sql'),
    migration: 'key-hygiene',
    why: 'C1 — a version_conflict STICKS to its key again, so the retry the error asks for can '
       + 'never succeed and the DERIVED accrual key is locked out for 25 hours',
    find: "     and v_out->>'error' = 'version_conflict' then",
    repl: "     and v_out->>'error' = 'a_code_that_never_happens' then",
  },
  key_ignores_version: {
    file: FN('intents.js'),
    why: 'C1 — the derived key drops `version`, so a REFUSED accrual re-derives a byte-identical, '
       + 'permanently-poisoned key (the half that does not need the migration to be applied)',
    find: '  const label = `hr-accrue|${o.user}|${o.slot}|${o.watermark}|${o.version}|${o.salt}|${o.attempt}`;',
    repl: '  const label = `hr-accrue|${o.user}|${o.slot}|${o.watermark}|${o.salt}|${o.attempt}`;',
  },
  call_site_drops_version: {
    file: FN('set-activity.js'),
    why: 'C1 — the collect stops passing `version` to intentIdFor, so the two verbs derive '
       + 'different keys for one window',
    find: '    user, slot, watermark: String(st.accrued_to), version: env.version, salt, attempt: 0,',
    repl: '    user, slot, watermark: String(st.accrued_to), salt, attempt: 0,',
  },
  no_slot_scope: {
    file: MIG('2026-08-15-intent-key-hygiene.sql'),
    migration: 'key-hygiene',
    why: 'C3 — hr_apply stops comparing the slot, so one key means one thing on two characters',
    find: '    if v_prev_intent is distinct from v_this_intent\n       or v_prev_slot is distinct from v_slot then',
    repl: '    if v_prev_intent is distinct from v_this_intent then',
  },
  /* b349 — the anchor MOVED FILE. C2's mechanics now live in the shared
     ./envelope.js, because claim_reward is the second intent to need them and
     eight private copies of one rule is eight chances for the eighth to forget.
     The mutation follows the code: an anchor left pointing at set-activity.js
     would have matched zero times, which this harness reports as a HARNESS
     failure rather than a pass — deliberately, because a planted bug that was
     never planted is decoration. */
  refusal_no_state: {
    file: FN('envelope.js'),
    why: 'C2 — a refusal stops carrying the envelope, so "put the local pointer back to what the '
       + 'envelope says" is unexecutable on the path that needs it',
    find: '  if (!env) return { ok: false, verb, ...refusal };',
    repl: '  return { ok: false, verb, ...refusal };\n  /* mutated */ if (!env) return null;',
  },
  registry_bucket_bogus: {
    file: FN('intents.js'),
    why: 'C4 — the registry names a bucket the database does not have; if nothing READS the '
       + 'registry this is invisible',
    find: "  set_activity: Object.freeze({ bucket: 'activity', needsKey: true, collectsFirst: true }),",
    repl: "  set_activity: Object.freeze({ bucket: 'activity_typo', needsKey: true, collectsFirst: true }),",
  },
  registry_needs_key_false: {
    file: FN('intents.js'),
    why: 'C4 — the registry says this intent needs no idempotency key',
    find: "  set_activity: Object.freeze({ bucket: 'activity', needsKey: true, collectsFirst: true }),",
    repl: "  set_activity: Object.freeze({ bucket: 'activity', needsKey: false, collectsFirst: true }),",
  },
  registry_collects_first_false: {
    file: FN('intents.js'),
    why: 'C4 — the registry says this intent does not collect first, and the code believes it, so '
       + 'the elapsed window is confiscated',
    find: "  set_activity: Object.freeze({ bucket: 'activity', needsKey: true, collectsFirst: true }),",
    repl: "  set_activity: Object.freeze({ bucket: 'activity', needsKey: true, collectsFirst: false }),",
  },
  gate_literal_bucket: {
    file: FN('set-activity.js'),
    why: 'C4 — the rate bucket becomes a literal at the call site again. Behaviourally IDENTICAL '
       + 'today, so only the source assertion can see it — which is the whole point',
    find: '  const [read] = await exec(READ_SQL, [user, slot, rateBucketFor(VERB)]);',
    repl: "  const [read] = await exec(READ_SQL, [user, slot, 'activity']);",
  },
  collected_dropped_on_replay: {
    file: FN('set-activity.js'),
    why: 'C5 — a replayed SWITCH nulls the receipt for a collect that genuinely applied '
       + '(measured: 3,809 gold / 744 kills reported as null)',
    /* ANCHORED ON THE ONE LINE, not on the pair it used to sit in: b356's C3
       receipt (`forfeited`) landed between `collected` and `replayed`, and a
       two-line anchor broke on a change that had nothing to do with it. An
       anchor that spans a neighbour is an anchor a neighbour can break. */
    find: '      activity: activityOf(res),\n      collected: collect.receipt || null,',
    repl: '      activity: activityOf(res),\n'
        + '      collected: res.replayed === true ? null : (collect.receipt || null),',
  },
  activity_echoed: {
    file: FN('set-activity.js'),
    why: 'C5 — the response echoes the CLIENT\'s declaration as `activity` while `state` reports '
       + 'what the server actually holds',
    find: '      activity: activityOf(res),',
    repl: '      activity: { kind: decl.kind, id: decl.id },',
  },
  catalogue_truthy: {
    file: FN('set-activity.js'),
    why: 'C6 — the catalogue guard goes back to truthiness, so `constructor` and `__proto__` walk '
       + 'past it and reach the database',
    find: "  if (decl.kind === 'combat' && !catalogueHas(MONSTERS, decl.id)) {",
    repl: "  if (decl.kind === 'combat' && !MONSTERS[decl.id]) {",
  },
  skip_bare_literal: {
    file: FN('accrual.js'),
    why: 'C6 — a skip reason is produced as a bare literal again, so the contract\'s partition '
       + 'cannot see it (this is exactly how `no_cap` was right only by accident)',
    find: "  if (!(capMs > 0)) return { accrued: false, reason: SKIP.NO_CAP };",
    repl: "  if (!(capMs > 0)) return { accrued: false, reason: 'no_cap' };",
  },
  skip_unclassified: {
    file: FN('accrual.js'),
    why: 'C6 — the engine gains a skip reason that neither group classifies',
    find: "  NO_CAP: 'no_cap',",
    repl: "  NO_CAP: 'no_cap',\n  FROM_THE_FUTURE: 'a_reason_from_the_future',",
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
    const cat = await import(pathToFileURL(FN('catalogue.js')).href + bust);
    return { sa, it, ac, cat, fnDir: FN('') };
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
  const cat = await import(pathToFileURL(join(dir, 'catalogue.js')).href);
  /* SOURCE-READING ASSERTIONS MUST READ THE SOURCE THAT RAN. A14 originally read
     the repo path while a mutation ran from this temp copy, so its own mutation
     SLIPPED — an assertion pointed at a file nobody executed. */
  return { sa, it, ac, cat, fnDir: dir };
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
    /* `qty_in` joined the three stamp columns the daily budget sums over. It was
       missing from this projection, so A3b read `undefined` and reported it as a
       ledger bug — a helper that silently drops a column turns a real assertion
       into a false red, and the pressure that creates is to delete the
       assertion. All three stamps, or none. */
    'select kind, intent, gold, gold_in, xp_in, qty_in, meta from public.player_ledger '
    + 'where user_id = $1 and slot = $2 order by at, id', [uid, slot])).rows;
const skillXp = async (db, uid, sk, slot = 0) => Number((await db.query(
  'select xp from public.player_skills where user_id=$1 and slot=$2 and skill_id=$3',
  [uid, slot, sk])).rows[0]?.xp ?? 0);

// ════════════════════════════════════════════════════════════════════════
async function run(mutate) {
  fails.length = 0;
  const { db, sa, it, ac, cat, fnDir } = await boot(mutate);
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
    /* CONTROL: `activity_unsupported` must actually FIRE, or A0 proves only
       that a list contains itself.

       ⚠ THE CONTROL MOVED DOWN A LEVEL IN b356 AND HAD TO. It used to be "some
         catalogue KIND is refused", which was true while the engine paid one
         kind of three. All three are payable now, so that form goes vacuous and
         reports it — correctly, and uselessly. What is still refused is an
         unpayable RECIPE (cooking, until `noBurn` is server-owned), which is
         where the granularity of the refusal actually lives now. Both arms are
         driven from real data, and the ELSE arm is a real refusal too: a kind
         `hr_activities` does not contain at all. */
    const unpayableKinds = kinds.filter((k) => !sa.SETTABLE_KINDS.includes(k));
    const unpayableRecipes = Object.keys(cat.ARTISAN_RECIPES_ALL)
      .filter((id) => !Object.prototype.hasOwnProperty.call(cat.ARTISAN_RECIPES_PAYABLE, id));
    /* 2026-08-31: the world legitimately became fully payable — every catalogue
       kind is settable and every artisan recipe pays — so the two "real"
       unpayable lists are empty and this control fired for a week with nothing
       running it (found by the ammo lane; the test was not wired into
       run-smoke). Per this control's own original message, the refusal is now
       driven with a SYNTHETIC kind when no real case exists: a kind
       hr_activities does not contain is the ELSE arm's real refusal, so the
       property ("declaring an unpayable activity refuses by name, never
       silently accepts") stays proven on every run. The real-list loops below
       still run whenever a future catalogue change re-creates a genuine
       unpayable, so this cannot rot in the other direction. */
    if (unpayableKinds.length === 0 && unpayableRecipes.length === 0) {
      const r = await call({ intentId: uuid(), activity: { kind: 'zz_synthetic_unsupported_probe', id: 'oak' } });
      ok(r.status === 409 && r.body.error === 'activity_unsupported',
        `A0-CONTROL(synthetic): declaring a kind the catalogue does not contain returned `
        + `${r.status} ${JSON.stringify(r.body)} — expected 409 activity_unsupported; the refusal `
        + `path is gone, not merely undriven`);
    }
    for (const k of unpayableKinds) {
      const r = await call({ intentId: uuid(), activity: { kind: k, id: 'oak' } });
      ok(r.body.error === 'activity_unsupported',
        `A0: declaring kind '${k}' returned ${JSON.stringify(r.body)} — expected activity_unsupported`);
    }
    if (unpayableRecipes.length) {
      const id = unpayableRecipes[0];
      const r = await call({ intentId: uuid(), activity: { kind: 'artisan', id } });
      ok(r.status === 409 && r.body.error === 'activity_unsupported',
        `A0: declaring the unpayable recipe '${id}' returned ${r.status} ${JSON.stringify(r.body)} — `
        + 'expected 409 activity_unsupported, refused on shape before any statement');
    }
    /* AND A KIND THE CATALOGUE HAS NEVER HEARD OF. This arm cannot go vacuous
       whatever the payability model does, which is what makes it worth keeping
       alongside the two above. */
    {
      const r = await call({ intentId: uuid(), activity: { kind: 'farm', id: 'oak' } });
      ok(r.body.error === 'activity_unsupported' || r.body.error === 'bad_activity',
        `A0: an off-catalogue kind returned ${JSON.stringify(r.body)}`);
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

  /* ── A3b. THE OTHER PAYABLE KIND, END TO END (b348) ──────────────────────
     A3 proves the collect-before-switch rule for combat. Gathering is 23 of the
     344 catalogue rows and, until b348, ALL of them answered
     `unsupported_activity` — a REFUSING reason, so a switch was refused and the
     window deferred rather than confiscated. Now it must actually PAY, and the
     chain that has to hold is longer than the engine: the intent's derived
     allowlist has to admit `gather`, request.js has to parse the kind, hr_apply
     has to find the node in the generated hr_activities and re-check the SKILL
     GATE against server XP, and the delta has to carry an item map, an XP map,
     three stat rows and — because this chain now includes the b348 migration —
     a `tool_carry` key that an hr_apply without it would answer with
     `unknown_delta_key`, costing the whole night.

     None of that is provable from accrual-engine.mjs, which calls
     computeAccrual directly and never touches a database. */
  {
    /* Woodcutting 15 is oak's requirement; 3,000 XP is level 16, so the gate is
       SATISFIED rather than skipped — the gate itself is exercised below. */
    await db.query(
      `update public.player_skills set xp = 3000
        where user_id = $1 and slot = 0 and skill_id = 'woodcutting'`, [UID]);
    await db.query(
      `update public.player_state
          set active_kind = 'gather', active_id = 'normal_tree',
              accrued_to = now() - interval '3 hours', active_since = now() - interval '3 hours'
        where user_id = $1 and slot = 0`, [UID]);
    const before = await state(db, UID);
    const beforeXp = await skillXp(db, UID, 'woodcutting');
    const beforeLedger = (await ledger(db, UID)).length;
    ok(before.tool_carry !== undefined,
      'A3b-CONTROL: player_state has no tool_carry column in this chain, so the carry half of this '
      + 'test would be vacuous — 2026-08-15-tool-carry.sql is missing from EXTRA');

    const r = await call({ intentId: uuid(), activity: { kind: 'gather', id: 'oak_tree' } });
    ok(r.status === 200 && r.body.ok === true,
      `A3b: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    ok(r.body.collected,
      'A3b: NO collection receipt — three hours of chopping were confiscated by the switch. This is '
      + 'the exact failure the collect-before-switch rule exists to prevent, and widening '
      + 'PAYABLE_KINDS without a simulation is how it would arrive.');

    const inv = (await db.query(
      'select item_id, qty from public.player_inventory where user_id=$1 and slot=0 order by item_id',
      [UID])).rows;
    const logs = Number(inv.find((x) => x.item_id === 'normal_log')?.qty ?? 0);
    ok(logs > 0, `A3b: three hours of chopping produced ${logs} normal_log — the window paid nothing`);
    const paidXp = (await skillXp(db, UID, 'woodcutting')) - beforeXp;
    ok(paidXp > 0, `A3b: three hours of chopping paid ${paidXp} woodcutting XP`);
    ok(r.body.collected.items && r.body.collected.items.normal_log === logs,
      `A3b: the receipt says ${JSON.stringify(r.body.collected.items)} but ${logs} logs arrived`);

    const st = await state(db, UID);
    ok(st.active_kind === 'gather' && st.active_id === 'oak_tree',
      `A3b: the switch did not happen (${st.active_kind}/${st.active_id})`);
    ok(new Date(st.accrued_to).getTime() > new Date(before.accrued_to).getTime(),
      'A3b: accrued_to did not advance — the same window could be collected again');

    const rows = (await ledger(db, UID)).slice(beforeLedger);
    const accrue = rows.find((x) => x.intent === 'accrue');
    ok(!!accrue, `A3b: no 'accrue' ledger row (${rows.map((x) => x.intent)})`);
    ok(accrue && accrue.kind === 'gather',
      `A3b: the collect was journalled as '${accrue && accrue.kind}', expected gather`);
    ok(accrue && Number(accrue.qty_in) === logs,
      `A3b: the ledger stamped qty_in=${accrue && accrue.qty_in} but ${logs} items arrived — the `
      + 'daily budget would be charged the wrong amount');
    ok(!!rows.find((x) => x.intent === 'set_activity:gather:oak_tree'),
      'A3b: no set_activity ledger row for the gather declaration');

    /* THE CARRY ROUND TRIP, through the real hr_apply. Without a tool the carry
       stays empty, which is correct and is NOT the interesting case — so the
       assertion is that the column is a legal, written-through object rather
       than that it holds a particular number, and the number itself is pinned
       by tests/accrual-engine.mjs where a tool can be given. What this proves
       that no unit test can: hr_apply ACCEPTED the key. Before b348 it answers
       `unknown_delta_key`, which is a 409 that costs the whole night. */
    ok(st.tool_carry && typeof st.tool_carry === 'object' && !Array.isArray(st.tool_carry),
      `A3b: player_state.tool_carry reads ${JSON.stringify(st.tool_carry)} after a gather collect`);

    /* THE SKILL GATE, re-checked against SERVER XP. Woodcutting 16 cannot chop
       Yew (req 60), and the refusal has to come from the DATABASE — a forged
       local level must buy nothing, including the right to start a level-60
       node. This is also the control that A3b's success above was a real gate
       being satisfied and not an absent one. */
    const locked = await call({ intentId: uuid(), activity: { kind: 'gather', id: 'yew_tree' } });
    ok(locked.body.ok !== true && locked.body.error === 'activity_locked',
      `A3b GATE: a woodcutting-16 character was allowed to start Yew (req 60): `
      + `${JSON.stringify(locked.body).slice(0, 200)}`);
    const stillOak = await state(db, UID);
    ok(stillOak.active_id === 'oak_tree',
      `A3b GATE: the refused switch still moved the pointer to ${stillOak.active_id}`);

    /* A node id that is not in the catalogue is refused BY NAME, one round trip
       earlier than hr_apply would, and without spending a collect. */
    const bogus = await call({ intentId: uuid(), activity: { kind: 'gather', id: 'not_a_tree' } });
    ok(bogus.status === 409 && bogus.body.error === 'unknown_activity',
      `A3b: an unknown gathering node returned ${bogus.status} ${JSON.stringify(bogus.body).slice(0, 160)}`);
  }

  /* ── A3c. THE THIRD PAYABLE KIND, END TO END (b356) ──────────────────────
     Artisan is 290 of the 344 catalogue rows — 84% — and until b356 every one
     of them answered `unsupported_activity`. It is the first payable kind whose
     simulation SPENDS: every tick consumes an input, so the chain that has to
     hold is longer again than gathering's. Three things are only provable here,
     against a real hr_apply, and each one costs the player their whole night if
     it is wrong:

       · the SIGNED item map. An artisan delta debits inputs and credits an
         output in the SAME `items` object. hr_apply re-reads player_inventory
         under the row lock and refuses `have + delta < 0` as
         `insufficient_item`, which is NOT on index.ts's DEGRADABLE list.
       · `journal.kind = 'craft'`. `player_ledger_kind_check` allows thirteen
         kinds and `artisan` is not one of them; a journal that named the
         activity's own kind would raise check_violation inside the protected
         block and come back as `bad_delta`. No unit test can see that — the
         constraint lives in SQL.
       · `qty_in`. The daily budget is computed from the delta's GROSS positive
         inflow, so the consumed inputs must not net it down.

     Bronze bars: `smelt_bronze` needs Smithing 8, 2 copper_ore + 1 coal, and
     ~4.2s an action, so a three-hour window is bounded by the SUPPLY rather
     than by the clock — which is the property the exhaustion arm asserts. */
  {
    await db.query(
      `update public.player_skills set xp = 1000
        where user_id = $1 and slot = 0 and skill_id = 'smithing'`, [UID]);
    /* Enough for ~30 bars and no more: the run must STOP on supplies inside the
       three hours, which is what makes the debit observable as a floor rather
       than as an arbitrary number. */
    await db.query(
      `insert into public.player_inventory (user_id, slot, item_id, qty)
       values ($1, 0, 'copper_ore', 60), ($1, 0, 'coal', 40)
       on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [UID]);
    await db.query(
      `update public.player_state
          set active_kind = 'artisan', active_id = 'smelt_bronze',
              accrued_to = now() - interval '3 hours', active_since = now() - interval '3 hours'
        where user_id = $1 and slot = 0`, [UID]);
    const beforeXp = await skillXp(db, UID, 'smithing');
    const beforeLedger = (await ledger(db, UID)).length;

    const r = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'rat' } });
    ok(r.status === 200 && r.body.ok === true,
      `A3c: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    ok(r.body.collected,
      'A3c: NO collection receipt — three hours of smelting were confiscated by the switch. Artisan is '
      + '290 of the 344 catalogue rows; this is the deferral b356 closed.');

    const invRows = (await db.query(
      'select item_id, qty from public.player_inventory where user_id=$1 and slot=0', [UID])).rows;
    const qty = (id) => Number(invRows.find((x) => x.item_id === id)?.qty ?? 0);
    const bars = qty('bronze_bar');
    ok(bars > 0, `A3c: three hours of smelting produced ${bars} bronze_bar — the window paid nothing`);
    /* THE MATERIAL CLAMP, MEASURED AGAINST THE DATABASE. 60 ore and 40 coal buy
       exactly 30 bars; the run must have stopped there rather than smelting for
       three hours off an inventory it only READ. */
    ok(bars === 30,
      `A3c: the run produced ${bars} bars from 60 copper_ore + 40 coal. Two ore and one coal per bar caps `
      + 'it at 30 — anything more means the simulation is not spending the server\'s inventory, and the '
      + 'delta it proposed would be refused by hr_apply as insufficient_item (a 409, not a degrade, so '
      + 'the whole night is lost).');
    ok(qty('copper_ore') === 0 && qty('coal') === 10,
      `A3c: after 30 bars the bag holds ${qty('copper_ore')} copper_ore and ${qty('coal')} coal — expected `
      + '0 and 10. The inputs were not debited through the same signed item map the output rode in on.');
    ok((await skillXp(db, UID, 'smithing')) - beforeXp > 0,
      'A3c: the smelting paid no smithing XP');

    const rows = (await ledger(db, UID)).slice(beforeLedger);
    const accrue = rows.find((x) => x.intent === 'accrue');
    ok(!!accrue, `A3c: no 'accrue' ledger row (${rows.map((x) => x.intent)})`);
    ok(accrue && accrue.kind === 'craft',
      `A3c: the collect was journalled as '${accrue && accrue.kind}', expected 'craft'. `
      + 'player_ledger_kind_check does not accept `artisan`; naming the activity kind here raises '
      + 'check_violation inside hr_apply\'s protected block and the player loses the whole night.');
    ok(accrue && Number(accrue.qty_in) === bars,
      `A3c: the ledger stamped qty_in=${accrue && accrue.qty_in} but ${bars} items arrived — the consumed `
      + 'inputs must not net down the GROSS inflow the daily budget is charged on');

    /* THE RUN IS OVER, SO THE POINTER MOVED ON. The switch to `rat` is what
       proves the collect ran first; the pointer being `rat` rather than a
       smelting bench with an empty bag is what proves the two applies happened
       in the right order. */
    const st = await state(db, UID);
    ok(st.active_kind === 'combat' && st.active_id === 'rat',
      `A3c: the switch did not happen (${st.active_kind}/${st.active_id})`);

    /* THE SKILL GATE, re-checked against SERVER XP — the artisan mirror of
       A3b's Yew probe. `hr_activities` carries `req_skill`/`req_lv` for every
       one of the 290 recipes, and a forged local level must buy nothing,
       including the right to START a recipe the character cannot make. This is
       also the control that the successful switch above satisfied a real gate
       rather than an absent one. */
    const topSmith = (await db.query(
      `select activity_id, req_lv from public.hr_activities
        where kind = 'artisan' and req_skill = 'smithing' order by req_lv desc limit 1`)).rows[0];
    ok(!!topSmith && Number(topSmith.req_lv) > 20,
      `A3c GATE: the catalogue's highest smithing recipe is ${JSON.stringify(topSmith)} — with the `
      + 'probe at smithing 1,000 XP (level ~10) there is nothing here the gate can refuse');
    if (topSmith) {
      const locked = await call({ intentId: uuid(), activity: { kind: 'artisan', id: topSmith.activity_id } });
      ok(locked.body.ok !== true && locked.body.error === 'activity_locked',
        `A3c GATE: a smithing-10 character was allowed to start '${topSmith.activity_id}' `
        + `(req ${topSmith.req_lv}): ${JSON.stringify(locked.body).slice(0, 200)}`);
    }

    /* A recipe that does not exist is refused BY NAME, before any statement. */
    const bogus = await call({ intentId: uuid(), activity: { kind: 'artisan', id: 'not_a_recipe' } });
    ok(bogus.status === 409 && bogus.body.error === 'unknown_activity',
      `A3c: an unknown recipe returned ${bogus.status} ${JSON.stringify(bogus.body).slice(0, 160)}`);

    /* ── AND THE HELD-BACK BENCH. Cooking is settable-shaped and NOT payable
       until `noBurn` is server-owned, so it must be refused as
       `activity_unsupported` — the code that means "real, and not server-side
       yet" — and the pointer must not move. If this ever starts succeeding
       WITHOUT SERVER_OWNED_BONUS_KEYS gaining `noBurn`, the server is cooking
       at the base 25% burn against a client whose Kitchen says 0%. */
    const cook = await call({ intentId: uuid(), activity: { kind: 'artisan', id: 'cook_shrimp' } });
    const artisanSim = await import('../src/core/artisan-sim.js');
    if (artisanSim.benchPayable('cooking')) {
      ok(cook.status === 200 && cook.body.ok === true,
        `A3c: cooking is payable (\`noBurn\` is server-owned) but the intent refused it: `
        + JSON.stringify(cook.body).slice(0, 200));
    } else {
      ok(cook.status === 409 && cook.body.error === 'activity_unsupported',
        `A3c: an unpayable bench returned ${cook.status} ${JSON.stringify(cook.body).slice(0, 200)} — `
        + 'expected 409 activity_unsupported, refused on SHAPE. If the pointer can hold it, the engine '
        + 'refuses the COLLECT with `unpayable_bench`, which refuses the SWITCH, and the player is locked '
        + 'on that bench until a deploy.');
      const stillRat = await state(db, UID);
      ok(stillRat.active_id === 'rat',
        `A3c: the refused cooking switch still moved the pointer to ${stillRat.active_id}`);
    }
  }

  /* ── A3d. THE ESCAPE HATCH FROM AN UNPRICEABLE POINTER (Security C3) ─────
     A REFUSING skip defers the window rather than confiscating it, which is
     right and has one consequence nobody had written down: the collect refuses,
     the refusal refuses the SWITCH, and that includes a switch to `idle`. Roll
     an Edge deploy back, or rename a recipe, while players hold artisan
     pointers and every one of those characters is frozen — unable even to stop
     — until a deploy goes forward again.

     `idle`, and only `idle`, may now force-close such a window as a JOURNALLED
     FORFEIT. The partition (POINTER_SKIP_REASONS) is the whole design: reasons
     that are a property of the POINTER forfeit, because waiting would never
     have paid them; reasons that are a property of the ABSENCE do NOT, because
     waiting WOULD, and forfeiting there is exactly the confiscation the
     collect-before-switch rule exists to prevent. Both arms are driven here. */
  {
    /* THE ROLLBACK, SIMULATED HONESTLY: the pointer holds an id THIS BUILD
       cannot price, which is precisely what a rename or a payload rollback
       produces. Written by direct SQL because the intent surface correctly
       refuses to create it. 2026-08-31: `cook_shrimp` (the original fixture)
       became payable when cooking completed, which left this section vacuous
       and RED for a week with nothing running it. Per the control's own
       message, the stuck id is now CHOSEN: the first real recipe this build
       refuses, or — when the world is fully payable — a synthetic id absent
       from the catalogue entirely, which is the RENAME arm of the same rollback
       class. The real-recipe arm re-arms itself the moment a future build
       carries an unpayable recipe again. */
    const stuckId = Object.keys(cat.ARTISAN_RECIPES_ALL)
      .find((id) => !Object.prototype.hasOwnProperty.call(cat.ARTISAN_RECIPES_PAYABLE, id))
      || 'zz_renamed_recipe_probe';
    await db.query(
      `update public.player_state
          set active_kind = 'artisan', active_id = $2,
              accrued_to = now() - interval '3 hours', active_since = now() - interval '3 hours'
        where user_id = $1 and slot = 0`, [UID, stuckId]);

    const stuckIsUnpriceable = !Object.prototype.hasOwnProperty.call(
      cat.ARTISAN_RECIPES_PAYABLE, stuckId);
    ok(stuckIsUnpriceable,
      `A3d: chosen stuck id '${stuckId}' is payable in this build — the chooser above is broken, `
      + 'because a synthetic id can never be payable.');

    if (stuckIsUnpriceable) {
      /* (i) THE LOCKOUT IS REAL — anything that is NOT a stop still refuses.
         Without this the forfeit below could be "the pointer was never stuck". */
      const sideways = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'rat' } });
      ok(sideways.status === 409 && sideways.body.error === 'uncollectable_window',
        `A3d(i): switching off an unpriceable pointer returned ${sideways.status} `
        + `${JSON.stringify(sideways.body).slice(0, 200)} — expected 409 uncollectable_window. If this `
        + 'succeeds the escape hatch is not needed and (ii) is measuring nothing.');
      const stillStuck = await state(db, UID);
      ok(stillStuck.active_id === stuckId,
        `A3d(i): the refused switch moved the pointer to ${stillStuck.active_id}`);

      /* (ii) …AND A STOP GETS OUT. */
      const beforeGold = Number(stillStuck.gold);
      const beforeLedger = (await ledger(db, UID)).length;
      const stop = await call({ intentId: uuid(), activity: { kind: 'idle', id: null } });
      ok(stop.status === 200 && stop.body.ok === true,
        `A3d(ii): a STOP could not close an unpriceable window: ${stop.status} `
        + `${JSON.stringify(stop.body).slice(0, 250)}. The character is frozen on an activity this `
        + 'build cannot price, with no client-side recovery at all.');
      const after = await state(db, UID);
      ok(after.active_kind === 'idle' && after.active_id === null,
        `A3d(ii): the pointer is still ${after.active_kind}/${after.active_id}`);
      ok(Number(after.gold) === beforeGold,
        `A3d(ii): the forfeit MOVED GOLD (${beforeGold} -> ${after.gold}). It must move no value at `
        + 'all — a watermark and a journal row, nothing else.');
      /* The expected reason follows the chosen arm: a REAL unpayable recipe is
         the bench/rollback shape (`unpayable_bench`); the synthetic id is the
         rename shape (`unknown_recipe`). Both are POINTER_SKIP_REASONS by
         design — what this asserts is that the forfeit NAMES its reason, not
         which arm the fixture happened to take. */
      const expectReason = Object.prototype.hasOwnProperty.call(cat.ARTISAN_RECIPES_ALL, stuckId)
        ? 'unpayable_bench' : 'unknown_recipe';
      ok(stop.body.forfeited && stop.body.forfeited.reason === expectReason,
        `A3d(ii): the response reports forfeited=${JSON.stringify(stop.body.forfeited)} — expected `
        + `reason '${expectReason}' for stuck id '${stuckId}'. A stop that silently discarded three `
        + 'hours is the same defect class as a payment nobody is told about.');

      /* (iii) IT IS JOURNALLED, as its OWN row, separate from the declaration.
         One merged row would show neither the forfeit nor the switch. */
      const rows = (await ledger(db, UID)).slice(beforeLedger);
      const forfeit = rows.find((x) => x.intent === 'set_activity:forfeit');
      ok(!!forfeit,
        `A3d(iii): no forfeit ledger row (${rows.map((x) => x.intent)}). An unaudited write that `
        + 'discards a player\'s window is indistinguishable from an incident later.');
      ok(forfeit && forfeit.kind === 'admin',
        `A3d(iii): the forfeit was journalled as '${forfeit && forfeit.kind}' — it moves no value, so `
        + 'filing it under an earning kind puts a zero row in the rollup\'s buckets');
      ok(forfeit && forfeit.meta && forfeit.meta.reason === expectReason
         && forfeit.meta.from_id === stuckId,
        `A3d(iii): the forfeit row does not say what was given up (expected reason '${expectReason}', `
        + `from_id '${stuckId}'): ${JSON.stringify(forfeit && forfeit.meta)}`);
      ok(!!rows.find((x) => x.intent === 'set_activity:idle'),
        'A3d(iii): the stop itself was not journalled — the forfeit and the declaration are two '
        + 'applies and must be two rows');
    }

    /* (iv) THE PARTITION'S OTHER HALF. `no_active_since` is a property of the
       ABSENCE, not of the pointer: it is transient and waiting would pay. A
       stop must NOT forfeit it, or the escape hatch has quietly become the
       confiscation the whole contract exists to prevent — and the same
       reasoning covers `no_cap`, which is unreachable to drive here (the cap
       function floors at 12h) and shares this list. */
    await db.query(
      `update public.player_state
          set active_kind = 'combat', active_id = 'rat',
              accrued_to = now() - interval '3 hours', active_since = null
        where user_id = $1 and slot = 0`, [UID]);
    const transient = await call({ intentId: uuid(), activity: { kind: 'idle', id: null } });
    ok(transient.status === 409 && transient.body.error === 'uncollectable_window',
      `A3d(iv): a STOP force-closed a \`no_active_since\` window (${transient.status} `
      + `${JSON.stringify(transient.body).slice(0, 200)}). That reason is transient — the next intent `
      + 'restamps the watermark and the window becomes payable — so forfeiting it destroys time the '
      + 'player would otherwise have been paid for. Only POINTER reasons may forfeit.');
    const untouched = await state(db, UID);
    ok(untouched.active_kind === 'combat' && untouched.active_id === 'rat',
      `A3d(iv): the refused stop moved the pointer to ${untouched.active_kind}/${untouched.active_id}`);

    /* Restore a sane pointer for the sections that follow. */
    await db.query(
      `update public.player_state
          set active_kind = 'combat', active_id = 'rat',
              accrued_to = now(), active_since = now()
        where user_id = $1 and slot = 0`, [UID]);
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

  /* ══ b346 — THE ADVERSARIAL REVIEW'S CONDITIONS ═══════════════════════════
     Everything below was named by the Security Engineer's review of this intent
     and measured against PRODUCTION first, rolled back. The measurements are
     quoted in the assertion messages so a future reader knows the failure is a
     regression of a KNOWN defect and not a hypothesis. */

  /** hr_apply, driven directly as the engine. Some of these probes are about
      the KEY rather than about the intent, and going through runSetActivity
      would only be able to reach two of hr_apply's dozen rejection codes. */
  const applyRaw = async (o) => {
    const [r] = await exec(
      'select public.hr_apply($1::uuid, $2::int, $3::bigint, $4::uuid, $5::jsonb) as res',
      [o.user ?? UID, o.slot ?? 0, o.version, o.key, JSON.stringify(o.delta)]);
    return r && r.res;
  };
  const clearGate = () => db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
  /** Bump the version between the READ and the switch's apply — the state a
      concurrent writer leaves behind. A fault injection, not a race (PGlite is
      one backend); stated, not implied. */
  const conflictingExec = (fired) => makeExec(db, {
    before: async (text) => {
      if (!fired.hit && /hr_apply/.test(text)) {
        fired.hit = true;
        await db.query(
          'update public.player_state set version = version + 1 where user_id = $1 and slot = 0', [UID]);
      }
    },
  });

  // ── A15. A REJECTED INTENT IS RETRIED WITH A NEW KEY — AND THE ONE KEY
  //         THAT CANNOT CHANGE IS RELEASED INSTEAD. (Review C1.)
  //
  // The contract used to say two things that could not both be true: hr_apply
  // step (5) records a rejection under the key and replays it, while the client
  // seam said "keep the key for every RETRY of that tap". Measured on
  // production, rolled back: (1) stale version → version_conflict; (2) the SAME
  // key at the CORRECT version → version_conflict, replayed:true; (3) a NEW key
  // at the same correct version → ok:true.
  {
    await clearGate();
    await db.query(
      `update public.player_state
          set accrued_to = now(), active_since = now(), active_kind = 'combat', active_id = 'goblin'
        where user_id = $1 and slot = 0`, [UID]);

    // (a) THE REFUSAL. accrued_to = now() so the collect exits at below_min_span
    //     without an apply — the only hr_apply in this call is the switch, which
    //     is what makes the injector's target unambiguous.
    const key = uuid();
    const fired = { hit: false };
    const r1 = await sa.runSetActivity({
      exec: conflictingExec(fired), user: UID, slot: 0, intentId: key,
      activity: { kind: 'combat', id: 'rat' },
    });
    ok(fired.hit, 'A15-CONTROL: the injector never fired — no hr_apply was seen, so A15 proves nothing');
    ok(r1.body.ok === false && r1.body.error === 'version_conflict' && r1.body.stage === 'switch',
      `A15-CONTROL: expected a version_conflict at the switch, got ${JSON.stringify(r1.body).slice(0, 200)}`);

    // (b) THE RETRY. Same key, correct version, nothing injected.
    const r2 = await call({ intentId: key, activity: { kind: 'combat', id: 'rat' } });
    ok(r2.body.ok === true,
      `A15: THE REJECTED KEY IS STILL POISONED — retrying it at the CORRECT version returned `
      + `${JSON.stringify(r2.body).slice(0, 200)}. A version conflict is a statement about the `
      + 'caller\'s READ, it applied nothing, and the recovery it names is "re-read and try again". '
      + 'Storing it locks out every caller whose key cannot change — which is the accrual engine, '
      + 'whose key is DERIVED — for up to 25 hours.');
    ok(r2.body.replayed !== true,
      'A15: the retry was answered as a REPLAY — the key was re-read, not released');
    ok((await state(db, UID)).active_id === 'rat', 'A15: the successful retry did not actually switch');

    // (c) CONTROL — THE RELEASE IS NARROW. A rejection about the DELTA must
    //     still be sticky, or (b) only proves hr_apply stopped recording
    //     rejections at all.
    const st = await state(db, UID);
    const gold = Number(st.gold);
    ok(gold < 10000000, `A15-CONTROL: the probe holds ${gold} gold — the overspend below would clamp`);
    const stickyKey = uuid();
    const spend = { gold: -(gold + 1000), journal: { kind: 'admin', intent: 'a15:overspend' } };
    const s1 = await applyRaw({ version: Number(st.version), key: stickyKey, delta: spend });
    ok(s1 && s1.error === 'insufficient_gold',
      `A15-CONTROL: the overspend probe returned ${JSON.stringify(s1).slice(0, 160)} — expected `
      + 'insufficient_gold, so the stickiness assertion below is not measuring what it says');
    const s2 = await applyRaw({ version: Number(st.version), key: stickyKey, delta: spend });
    ok(s2 && s2.replayed === true && s2.error === 'insufficient_gold',
      `A15: a NON-version rejection was released too (${JSON.stringify(s2).slice(0, 160)}). `
      + '"Same key, same answer" is the right contract for a decision about the DELTA — the caller '
      + 'must change something, and changing the key is how it says "this is a new attempt".');

    // (d) THE DERIVED HALF. `version` is in the key, so a refused accrual cannot
    //     re-derive a byte-identical one; everything else about the derivation
    //     is unchanged, which is what keeps two racing verbs on ONE key.
    const base = { user: UID, slot: 0, watermark: 'w', version: 1, salt: 's', attempt: 0 };
    const k0 = await it.intentIdFor({ ...base });
    const k0again = await it.intentIdFor({ ...base });
    const kVer = await it.intentIdFor({ ...base, version: 2 });
    ok(k0 === k0again,
      'A15: the derived key is not stable for identical inputs — two verbs racing on one window '
      + 'would stop sharing a key, and the window would be priced twice');
    ok(k0 !== kVer,
      'A15: the derived key IGNORES `version`. A rejection does not move `accrued_to`, so the next '
      + 'call re-derives a byte-identical, already-refused key — for both the accrue verb and every '
      + 'set_activity, whose collect derives the same one. That is the deadlock C1 names.');
    let threw = false;
    try { await it.intentIdFor({ user: UID, slot: 0, watermark: 'w', salt: 's', attempt: 0 }); }
    catch { threw = true; }
    ok(threw,
      'A15: intentIdFor accepted a call with a missing field. Six positional-shaped values across '
      + 'two call sites in two languages is exactly how the two verbs silently stop sharing a key.');

    // (e) BOTH CALL SITES PASS THE WHOLE FIELD SET. A drift here does not fail,
    //     it just pays twice or conflicts — so it is asserted on the source.
    for (const f of ['index.ts', 'set-activity.js']) {
      const src = (await readFile(join(fnDir, f), 'utf8')).replace(/\r\n/g, '\n');
      const at = src.indexOf('intentIdFor({');
      ok(at >= 0, `A15-CONTROL: no intentIdFor({…}) call site in ${f} — the scan is blind`);
      const lit = src.slice(at, src.indexOf('}', at));
      const missing = [...it.INTENT_ID_FIELDS].filter((k) => !new RegExp(`\\b${k}\\b`).test(lit));
      ok(missing.length === 0,
        `A15: ${f}'s intentIdFor call omits [${missing}] — the two verbs would derive different `
        + 'keys for one window');
    }
  }

  // ── A16. ONE KEY, TWO SLOTS. (Review C3.)
  // `intentNameFor` yields `set_activity:idle` for EVERY stop on EVERY
  // character, and `player_intents` is keyed (user_id, intent_id) with no slot.
  // Measured on production, rolled back: the same key on slot 1 answered
  // ok:true, replayed:true and applied nothing (gold 500 → 500) while a control
  // with a fresh key applied (500 → 507).
  {
    await clearGate();
    const made = (await db.query('select public.__a345_create($1,1) as v', [UID])).rows[0].v;
    ok(made.ok === true && made.created === true,
      `A16-CONTROL: could not create a second character: ${JSON.stringify(made)}`);
    await db.query(
      'update public.player_state set accrued_to = now(), active_since = now() where user_id = $1', [UID]);

    const key = uuid();
    const first = await sa.runSetActivity({
      exec, user: UID, slot: 0, intentId: key, activity: { kind: 'idle', id: null },
    });
    ok(first.body.ok === true, `A16-CONTROL: the slot-0 claim failed: ${JSON.stringify(first.body).slice(0, 200)}`);

    const before1 = await state(db, UID, 1);
    const second = await sa.runSetActivity({
      exec, user: UID, slot: 1, intentId: key, activity: { kind: 'idle', id: null },
    });
    ok(second.body.ok === false && second.body.error === 'intent_mismatch',
      `A16: THE SAME KEY WAS ACCEPTED ON A SECOND CHARACTER — ${JSON.stringify(second.body).slice(0, 200)}. `
      + 'The intent NAME cannot carry the slot (it is also player_ledger.intent, which the rollup '
      + 'groups on), so without hr_apply comparing player_intents.slot this answers ok:true, '
      + 'replayed:true and applies NOTHING, silently, on the character the player is looking at.');
    const after1 = await state(db, UID, 1);
    ok(Number(after1.version) === Number(before1.version), 'A16: the refused cross-slot call applied something');

    const third = await sa.runSetActivity({
      exec, user: UID, slot: 1, intentId: uuid(), activity: { kind: 'idle', id: null },
    });
    ok(third.body.ok === true,
      `A16-CONTROL: a FRESH key on slot 1 was also refused (${JSON.stringify(third.body).slice(0, 200)}) — `
      + 'the refusal above would then prove nothing about the key');
    ok(Number((await state(db, UID, 1)).version) === Number(before1.version) + 1,
      'A16-CONTROL: the fresh-key call on slot 1 applied nothing either');
  }

  // ── A17. THE SKIP PARTITION COVERS THE ENGINE — DERIVED, NOT RESTATED.
  // The contract's comment said SIX reasons and the engine had SEVEN: `no_cap`
  // was a bare literal, absent from SKIP and from both groups, and landed in the
  // right one only because classifySkip fails closed. Right by accident.
  {
    const engine = Object.values(ac.SKIP);
    ok(engine.length >= 6,
      `A17-CONTROL: accrual.js SKIP holds ${engine.length} reasons — the comparison would be trivial`);
    const classified = [...it.SAFE_SKIP_REASONS, ...it.REFUSING_SKIP_REASONS];
    const dupes = classified.filter((r, i) => classified.indexOf(r) !== i);
    ok(dupes.length === 0, `A17: [${dupes}] is in BOTH the safe and the refusing group`);
    const unclassified = engine.filter((r) => !classified.includes(r));
    ok(unclassified.length === 0,
      `A17: the engine can return [${unclassified}] and the contract has no opinion about it. `
      + 'classifySkip fails closed, so it would REFUSE every switch — which is the safe direction '
      + 'and also a total lockout if the reason is ordinary. Decide which group it is in.');
    const phantom = classified.filter((r) => !engine.includes(r));
    ok(phantom.length === 0,
      `A17: [${phantom}] is classified but accrual.js cannot produce it — a rule about nothing`);

    /* And every `reason:` the engine returns must NAME a SKIP member. A bare
       literal is invisible to the partition above, which is precisely how
       `no_cap` escaped it for four builds. */
    const src = (await readFile(join(fnDir, 'accrual.js'), 'utf8')).replace(/\r\n/g, '\n');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    /* 2026-08-31 (found when the ammo lane surfaced this test as orphaned-red):
       two SIDE-BANK accruers were added to accrual.js after this scan was
       written — `accrueRested` (reasons 'absent'/'nothing') and `accrueWorkers`
       ('no_crew'/'no_span'/'nothing_accrued'). Their `reason:` fields are their
       OWN envelope contracts: they never reach classifySkip or the pointer
       partition, so demanding SKIP members of them would couple two unrelated
       vocabularies. Exempted BY ENCLOSING FUNCTION, not by literal, so a new
       side-bank reason doesn't reopen this file — with two tripwires: the
       exempt functions must exist (else the exemption is stale), and no
       exempted literal may appear in the partition's own vocabulary (else a
       side-bank word has leaked into the activity contract and the exemption
       is hiding exactly what A17 hunts). */
    const A17_EXEMPT_FNS = ['accrueRested', 'accrueWorkers'];
    const fnSpans = [...code.matchAll(/(?:export )?(?:async )?function\s+([A-Za-z_][A-Za-z0-9_]*)/g)]
      .map((m) => ({ name: m[1], at: m.index }));
    for (const fn of A17_EXEMPT_FNS) {
      ok(fnSpans.some((f) => f.name === fn),
        `A17-EXEMPT: exempt function '${fn}' no longer exists in accrual.js — stale exemption`);
    }
    const enclosing = (at) => { let cur = '?'; for (const f of fnSpans) { if (f.at < at) cur = f.name; else break; } return cur; };
    const allSites = [...code.matchAll(/reason:\s*([^,}\n]+)/g)]
      .map((m) => ({ s: m[1].trim(), fn: enclosing(m.index) }));
    /* Only BARE LITERALS in the exempt functions need the vocabulary tripwire —
       a site that names a SKIP member (e.g. accrueWorkers' SKIP.NOTHING) is
       already speaking the partition's language by name, which is the whole
       point; it is checked by the main loop's membership assertion instead. */
    const exempted = allSites.filter((x) => A17_EXEMPT_FNS.includes(x.fn) && !/SKIP\./.test(x.s));
    for (const x of exempted) {
      const word = (x.s.match(/^'([a-z_]+)'$/) || [])[1];
      ok(word && !it.POINTER_SKIP_REASONS.includes(word) && it.classifySkip(word) === 'refused',
        `A17-EXEMPT: side-bank reason ${x.s} (in ${x.fn}) appears in — or is classified by — the `
        + 'activity partition; the two vocabularies have merged and the exemption must fall');
    }
    /* …and a SKIP.* site inside an exempt function must still name a REAL member. */
    for (const x of allSites.filter((y) => A17_EXEMPT_FNS.includes(y.fn) && /SKIP\./.test(y.s))) {
      for (const ref of x.s.match(/SKIP\.([A-Za-z_]+)/g) || []) {
        const k = ref.slice(5);
        ok(Object.prototype.hasOwnProperty.call(ac.SKIP, k),
          `A17-EXEMPT: ${x.fn} names SKIP.${k}, which does not exist — undefined at runtime`);
      }
    }
    const sites = allSites.filter((x) => !A17_EXEMPT_FNS.includes(x.fn)).map((x) => x.s);
    ok(sites.length >= 6,
      `A17-CONTROL: the scan found ${sites.length} \`reason:\` sites in accrual.js — it is blind`);
    for (const s of sites) {
      ok(!/['"`]/.test(s),
        `A17: accrual.js produces a reason as a BARE LITERAL (\`reason: ${s}\`). It must name a SKIP `
        + 'member, or the contract\'s partition cannot see it and classifies it by luck.');
      ok(/SKIP\./.test(s), `A17: \`reason: ${s}\` does not name a SKIP member`);
      for (const ref of s.match(/SKIP\.([A-Za-z_]+)/g) || []) {
        const k = ref.slice(5);
        ok(Object.prototype.hasOwnProperty.call(ac.SKIP, k),
          `A17: a reason names SKIP.${k}, which does not exist — it would be undefined at runtime`);
      }
    }
    ok(it.classifySkip('no_cap') === 'refused',
      'A17: no_cap must refuse — with capMs = 0 NOTHING in the window can be priced, so switching '
      + 'confiscates a window that will become payable');
  }

  // ── A18. EVERY REFUSAL THAT REACHED THE DATABASE CARRIES THE ENVELOPE.
  // (Review C2.) The seam tells the client to put its optimistic local pointer
  // back to what the envelope says. Measured: a switch-stage refusal carried no
  // `state` at all, which makes that instruction unexecutable on exactly the
  // path that needs it.
  {
    await clearGate();
    const hasEnvelope = (b) => !!(b && b.state && typeof b.state === 'object' && b.state.active_kind);
    const withState = []; const without = [];

    // (1) stage:'collect' — an unpriceable window.
    await db.query(
      `update public.player_state
          set accrued_to = now() - interval '4 hours', active_since = null,
              active_kind = 'combat', active_id = 'goblin'
        where user_id = $1 and slot = 0`, [UID]);
    const c = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'rat' } });
    ok(c.body.error === 'uncollectable_window' && c.body.stage === 'collect',
      `A18-CONTROL: expected a stage:collect refusal, got ${JSON.stringify(c.body).slice(0, 200)}`);
    ok(hasEnvelope(c.body),
      'A18: a stage:collect refusal carries NO state envelope, so the client cannot reconcile the '
      + 'pointer it moved optimistically to anything but its own guess');
    ok(c.body.ok === false,
      'A18: the envelope spread overwrote ok — a refusal that says ok:true is worse than no envelope');
    ok(c.body.activity && c.body.activity.id === 'goblin',
      `A18: the refusal reports activity ${JSON.stringify(c.body.activity)} — it must be the pointer `
      + 'the SERVER holds, which is what the client reconciles to');
    ok(Number.isFinite(Number(c.body.version)), 'A18: the refusal carries no version');
    withState.push('collect');

    // (2) stage:'switch' — a version conflict.
    await db.query(
      'update public.player_state set active_since = accrued_to where user_id = $1 and slot = 0', [UID]);
    await db.query(
      `update public.player_state set accrued_to = now(), active_since = now()
        where user_id = $1 and slot = 0`, [UID]);
    const fired = { hit: false };
    const s = await sa.runSetActivity({
      exec: conflictingExec(fired), user: UID, slot: 0, intentId: uuid(),
      activity: { kind: 'combat', id: 'rat' },
    });
    ok(fired.hit && s.body.stage === 'switch' && s.body.error === 'version_conflict',
      `A18-CONTROL: expected a stage:switch version_conflict, got ${JSON.stringify(s.body).slice(0, 200)}`);
    ok(hasEnvelope(s.body),
      'A18: a stage:switch refusal carries NO state envelope. This is the one that most needs it: a '
      + 'version conflict MEANS the state moved, so the envelope the call started from is stale by '
      + 'definition and the client has nothing correct to fall back to.');
    ok(Number(s.body.version) === Number((await state(db, UID)).version),
      'A18: the refusal carries a STALE version — it must be re-read, not echoed from the failed call');
    withState.push('switch');

    // (3) THE DOCUMENTED EXCEPTIONS, and they are exceptions on purpose.
    const keyless = await sa.runSetActivity({
      exec, user: UID2, slot: 0, intentId: null, activity: { kind: 'combat', id: 'goblin' },
    });
    ok(keyless.body.error === 'missing_intent_id' && !hasEnvelope(keyless.body),
      'A18: a SHAPE refusal carried an envelope — reading one is the database work the shape check '
      + 'exists to avoid, and it would let a malformed client spend a real player\'s rate budget');
    without.push('missing_intent_id');
    const noChar = await sa.runSetActivity({
      exec, user: UID2, slot: 4, intentId: uuid(), activity: { kind: 'combat', id: 'goblin' },
    });
    ok(noChar.body.error === 'no_character' && !hasEnvelope(noChar.body),
      'A18: no_character carried an envelope — hr_state_of itself said there is no state');
    without.push('no_character');

    ok(withState.length >= 2 && without.length >= 1,
      `A18-CONTROL: ${withState.length} refusals with state and ${without.length} without — the `
      + 'assertion is vacuous unless both sides are populated');
    /* The contract's own predicate must agree with what the code does, or the
       client is told one thing by a doc and another by the wire. */
    ok(it.refusalCarriesState('version_conflict') === true
      && it.refusalCarriesState('uncollectable_window') === true
      && it.refusalCarriesState('rate_limited') === false
      && it.refusalCarriesState('missing_intent_id') === false
      && it.refusalCarriesState('no_character') === false,
      'A18: refusalCarriesState disagrees with the behaviour measured above');
  }

  // ── A19. THE REGISTRY IS READ, NOT DECORATION. (Review C4.)
  // Its three columns were read by NOTHING: READ_SQL hard-coded 'activity', the
  // key check and the collect were hand-written branches. Intent #2 could have
  // declared collectsFirst:true, never collected, spent the wrong bucket, and
  // every guard would have stayed green.
  {
    await clearGate();
    const req = await import(
      (await import('node:url')).pathToFileURL(FN('request.js')).href + `?t=${Date.now()}`);
    const verbs = [...req.VERBS].sort().join(',');
    const rows = Object.keys(it.INTENT_REGISTRY).sort().join(',');
    ok(verbs === rows,
      `A19: request.js accepts [${verbs}] but the registry describes [${rows}]. A verb the parser `
      + 'admits and the registry does not describe has no rate bucket, no key rule and no collect '
      + 'rule — it would fail closed at intentSpec, which is right, but it should never be reachable.');
    for (const v of Object.keys(it.INTENT_REGISTRY)) {
      for (const f of it.REGISTRY_FIELDS) {
        ok(Object.prototype.hasOwnProperty.call(it.INTENT_REGISTRY[v], f),
          `A19: registry row '${v}' has no '${f}' — a column REGISTRY_FIELDS names and no row carries`);
      }
      ok(typeof it.rateBucketFor(v) === 'string' && it.rateBucketFor(v).length > 0,
        `A19: registry row '${v}' names no rate bucket`);
    }
    let threw = false;
    try { it.intentSpec('not_a_verb'); } catch { threw = true; }
    ok(threw,
      'A19: intentSpec DEFAULTED an unknown verb. A default here is how a new intent silently '
      + 'inherits accrue\'s budget and skips the collect.');

    // BEHAVIOURAL: the bucket the registry names is the counter the call spends.
    await db.query(
      `update public.player_state set accrued_to = now(), active_since = now()
        where user_id = $1 and slot = 0`, [UID]);
    const r = await call({ intentId: uuid(), activity: { kind: 'combat', id: 'goblin' } });
    ok(r.body.ok === true || r.status === 429,
      `A19-CONTROL: the probe call failed for an unrelated reason: ${JSON.stringify(r.body).slice(0, 200)}`);
    const spent = (await db.query(
      'select bucket from public.hr_rate_counters where user_id = $1', [UID])).rows.map((x) => x.bucket);
    ok(spent.includes(it.rateBucketFor(sa.VERB)),
      `A19: the call spent [${spent}] but the registry names '${it.rateBucketFor(sa.VERB)}'. The `
      + 'registry does not describe the code, which means it describes nothing.');

    // SOURCE: no bucket LITERAL at any hr_rate_gate call site, and every file
    // that gates goes through rateBucketFor. A literal is behaviourally
    // identical today, so only this can see it — which is the whole point.
    for (const f of ['index.ts', 'set-activity.js']) {
      const src = (await readFile(join(fnDir, f), 'utf8'))
        .replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      const at = src.indexOf('hr_rate_gate(');
      ok(at >= 0, `A19-CONTROL: no hr_rate_gate call site in ${f} — the scan is blind`);
      let d = 0; let end = -1;
      for (let i = src.indexOf('(', at); i < src.length; i++) {
        if (src[i] === '(') d++;
        else if (src[i] === ')') { d--; if (d === 0) { end = i; break; } }
      }
      const args = src.slice(at, end + 1).replace(/rateBucketFor\([^)]*\)/g, 'REGISTRY');
      ok(!/['"]/.test(args),
        `A19: ${f} names a rate bucket as a LITERAL at the gate (${args.trim().slice(0, 120)}). `
        + 'A literal at a call site is a second registry.');
      ok(/rateBucketFor\(/.test(src),
        `A19: ${f} calls hr_rate_gate but never calls rateBucketFor — the value it passes came from `
        + 'somewhere other than the registry');
    }
  }

  // ── A20. THE BODY SPEAKS FOR THE SERVER. (Review C5.)
  {
    await clearGate();
    // (a) `activity` is READ OUT OF state, not echoed from the request.
    await db.query(
      `update public.player_state
          set accrued_to = now(), active_since = now(), active_kind = 'combat', active_id = 'goblin'
        where user_id = $1 and slot = 0`, [UID]);
    const key = uuid();
    const first = await call({ intentId: key, activity: { kind: 'combat', id: 'bear' } });
    ok(first.body.ok === true && first.body.activity && first.body.activity.id === 'bear',
      `A20-CONTROL: the first switch did not report bear: ${JSON.stringify(first.body.activity)}`);
    // A concurrent writer moves the pointer. The harness plays that part, which
    // is a privilege the engine does not have and must not be given.
    await db.query(
      "update public.player_state set active_id = 'wolf' where user_id = $1 and slot = 0", [UID]);
    const replay = await call({ intentId: key, activity: { kind: 'combat', id: 'bear' } });
    ok(replay.body.replayed === true, 'A20-CONTROL: the second call was not a replay');
    ok(replay.body.activity && replay.body.activity.id === 'wolf',
      `A20: the response reported activity '${replay.body.activity && replay.body.activity.id}' — the `
      + `CLIENT's own declaration — while state says '${replay.body.state.active_id}'. Two fields in `
      + 'one body disagreeing, with the client-authored one on top. Read it out of state.');

    // (b) `collected` survives a REPLAYED SWITCH whose collect genuinely paid.
    //     Measured: 3,809 gold and 744 kills of applied payment reported as null.
    await clearGate();
    await db.query(
      `update public.player_state
          set max_hp = 900, hp = 900, active_kind = 'combat', active_id = 'goblin',
              accrued_to = now() - interval '2 hours', active_since = now() - interval '2 hours'
        where user_id = $1 and slot = 0`, [UID]);
    const goldBefore = Number((await state(db, UID)).gold);
    const again = await call({ intentId: key, activity: { kind: 'combat', id: 'bear' } });
    const goldAfter = Number((await state(db, UID)).gold);
    ok(again.body.replayed === true,
      `A20-CONTROL: the switch was not a replay (${JSON.stringify(again.body).slice(0, 200)}) — the `
      + 'assertion below would then be about an ordinary success');
    ok(goldAfter > goldBefore,
      `A20-CONTROL: the collect paid ${goldAfter - goldBefore} gold for two hours, so "the receipt `
      + 'was dropped" would be indistinguishable from "there was nothing to receipt"');
    ok(again.body.collected && again.body.collected.gold === goldAfter - goldBefore,
      `A20: a REPLAYED switch reported collected=${JSON.stringify(again.body.collected)} while `
      + `${goldAfter - goldBefore} gold was genuinely applied by THIS invocation's collect. The test `
      + 'is "did this collect apply", never "was the switch a replay" — the two halves are separate '
      + 'applies precisely so that they can differ.');
    ok(again.body.collected.kills > 0,
      `A20-CONTROL: the receipt reports ${again.body.collected.kills} kills, so gold could have come `
      + 'from somewhere other than the collect');
  }

  // ── A21. A CATALOGUE LOOKUP IS `hasOwnProperty`, NEVER TRUTHINESS.
  // (Review C6.) The id shape is /^[a-z0-9_]{1,64}$/, which matches both
  // `constructor` and `__proto__`; both are truthy on any plain object, so
  // `if (!MONSTERS[id]) refuse` ADMITS them. Harmless here because hr_apply
  // re-validates — and a free craft the day an intent writes
  // `if (!RECIPES[id]) refuse` and then reads `RECIPES[id].cost.gold`.
  {
    await clearGate();
    ok(it.catalogueHas({ goblin: { hp: 1 } }, 'goblin') === true,
      'A21-CONTROL: catalogueHas refuses a real entry — every lookup would fail');
    ok(it.catalogueHas({}, 'constructor') === false, 'A21: catalogueHas admits `constructor`');
    ok(it.catalogueHas({}, '__proto__') === false, 'A21: catalogueHas admits `__proto__`');
    ok(it.catalogueGet({}, 'toString') === undefined, 'A21: catalogueGet returns an inherited member');
    ok(it.catalogueHas({ x: 1 }, 42) === false, 'A21: catalogueHas accepted a non-string id');

    /* BEHAVIOURAL, and the measurement is the STATEMENT COUNT: a prototype id
       that reaches the database has walked past the guard. A genuinely unknown
       id is the control — it must cost the same nothing. */
    const probe = async (id) => {
      let stmts = 0;
      const counting = makeExec(db, { before: async () => { stmts++; } });
      const r = await sa.runSetActivity({
        exec: counting, user: UID, slot: 0, intentId: uuid(), activity: { kind: 'combat', id },
      });
      return { stmts, body: r.body };
    };
    for (const id of ['constructor', '__proto__']) {
      const p = await probe(id);
      ok(p.body.error === 'unknown_activity',
        `A21: declaring '${id}' returned ${JSON.stringify(p.body).slice(0, 160)} — expected unknown_activity`);
      ok(p.stmts === 0,
        `A21: declaring '${id}' issued ${p.stmts} database statement(s). A genuinely unknown id `
        + 'issues none, so this one walked past the catalogue guard — MONSTERS[\'' + id + '\'] is '
        + 'truthy. Today that is a wasted round trip; the day a lookup is followed by a property '
        + 'read it is a free craft.');
    }
    const control = await probe('not_a_monster_at_all');
    ok(control.body.error === 'unknown_activity' && control.stmts === 0,
      `A21-CONTROL: a genuinely unknown id issued ${control.stmts} statement(s) — the count is not `
      + 'discriminating');
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
    + 'uncollectable window, gate, parser, retry-after-rejection, two-slot key reuse, skip '
    + 'coverage, refusal envelopes, registry-vs-implementation, server-stated body, own-property '
    + 'catalogue lookups (22 groups, real PG18 + the deployed intent module)');

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
