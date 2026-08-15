#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/delta-transport.mjs — THE DELTA MUST REACH hr_apply AS A jsonb OBJECT.
//
// ── THE BUG THIS EXISTS FOR (P0, found 2026-08-15 by Tyler, in production) ──
// `hr_apply` had NEVER successfully applied a delta through the Edge Function.
// Every call answered:
//
//     HTTP 409  error:"bad_delta"  stage:"switch"
//
// which is hr_apply's FIRST guard: `jsonb_typeof(p_delta) <> 'object'`.
//
// THE MECHANISM, confirmed at the driver's source and reproduced below:
// postgres.js is configured `prepare: false` (mandatory in transaction pooler
// mode — a named prepared statement outlives the transaction that created it
// but not the backend). With `prepare:false`, `Connection.toBuffer` always
// takes the DESCRIBE-FIRST path: Parse with an UNSPECIFIED parameter type,
// Describe, wait. Postgres replies with a ParameterDescription carrying the
// type it RESOLVED from context — 3802 (jsonb) for `$5::jsonb` — and
// `ParameterDescription()` writes that into `query.statement.types` before
// Bind runs. `Bind()` then looks the type up in `options.serializers`, where
// 3802 maps to `JSON.stringify` (src/types.js, `types.json.from = [114, 3802]`).
// The delta was ALREADY `JSON.stringify`d at the call site, so it is encoded a
// SECOND time and arrives as a jsonb STRING SCALAR. `bad_delta`, every time,
// from the first deploy.
//
// THE FIX is one cast: `::text::jsonb`. Postgres then describes the parameter
// as text (25), whose serializer is `x => '' + x` — a passthrough — and the SQL
// cast does the parse. It is correct under BOTH driver typings, because an
// unspecified type (0) is a passthrough too; binding the raw object instead
// would work only while the driver keeps resolving the type to jsonb.
//
// ── WHY THIS FILE HAD TO BE WRITTEN, WHICH IS THE MORE IMPORTANT HALF ───────
// `tests/activity-intent.mjs` drives THE SAME MODULE BYTES that deploy — which
// is right, and it has caught real bugs — but it injects a **PGlite** `exec`
// (`db.query(text, params)`), while production runs **postgres.js +
// `tx.unsafe`**. Same bytes, different TRANSPORT, and the bug was in the
// transport. 27 mutations all passed against code that had never once worked.
// Instance #18 of the assertion-that-asserts-nothing family.
//
// So this guard changes exactly one thing about that harness: the wire. PGlite
// is exposed over the real PostgreSQL wire protocol
// (`@electric-sql/pglite-socket`) and the REAL `postgres@3.4.5` driver — the
// same version index.ts imports as `npm:postgres@3.4.5` — connects to it with
// the SAME pool options the Edge Function uses. The `exec` seam is a copy of
// index.ts:256-260 in behaviour, and `runSetActivity` is imported off disk.
// Nothing about the delta's journey is modelled.
//
// ── WHAT IT PROVES ─────────────────────────────────────────────────────────
//   T0  CONTROL — the double-encode is still observable with this driver. If a
//       pre-stringified JSON bound into a bare `$1::jsonb` no longer comes back
//       as a jsonb `string`, this guard can no longer see the production
//       failure and every assertion below it is vacuous. That is a FAILURE, not
//       a pass.
//   T1  index.ts — Node cannot import a Deno .ts file, so the cast is read out
//       of its BYTES and then EXECUTED through a real postgres.js tagged
//       template. Both halves matter: the byte read pins the shipped file, the
//       execution proves the shape actually survives the driver.
//   T2  index.ts and set-activity.js use the SAME shape. Two call sites that
//       disagree is how one of them rots unobserved.
//   T3  END TO END — the real `runSetActivity`, over the real driver, against
//       the real `hr_apply` from the real migration chain. Under today's
//       (unfixed) code this returns the verbatim production answer:
//       409 / bad_delta / stage "switch".
//   T4  The guard names the right enemy: hr_apply's first refusal really is
//       `jsonb_typeof(p_delta) <> 'object'`, read from the migration.
//   T5  The driver exercised here IS the driver index.ts deploys, read from its
//       own `npm:postgres@X` specifier. A version-specific claim proven against
//       a different version is the adjacent-proof failure, not a result.
//
// ── WHAT IT DOES NOT PROVE ─────────────────────────────────────────────────
//   · The SUPABASE POOLER. pgbouncer sits between the Edge Function and
//     Postgres in production and is not modelled here. It does not re-encode
//     parameters — it forwards the extended-protocol messages — but that is
//     reasoning, not measurement, and it is stated as such.
//   · JWT, CORS, RLS, true concurrency. Owned by other guards.
//
// ── USAGE ───────────────────────────────────────────────────────────────
//   node tests/delta-transport.mjs               clean run
//   node tests/delta-transport.mjs --list        the mutation catalogue
//   node tests/delta-transport.mjs --selftest    every mutation must be CAUGHT
//   node tests/delta-transport.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1.
// ════════════════════════════════════════════════════════════════════════

import { readFile, cp, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { bootChain, ROOT } from './pglite-chain.mjs';

const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);
const FN = (f) => join(ROOT, 'supabase', 'functions', 'hr-accrue', f);

/* The same EXTRA chain tests/activity-intent.mjs appends, and for the same
   reasons — hr_apply fails closed without the daily budget, the collect reads
   hr_offline_cap_ms, key-hygiene must be LAST of anything that replaces
   hr_apply. Kept as a literal rather than imported so a change to that file's
   ordering cannot silently change what this one runs against. */
const EXTRA = [
  ['catalogue', MIG('2026-08-11-catalogue.generated.sql')],
  ['daily-budget', MIG('2026-08-11-daily-budget.sql')],
  ['accrual', MIG('2026-08-11-accrual.sql')],
  ['apply-engine', MIG('2026-08-11-apply-engine.sql')],
  ['character-bootstrap', MIG('2026-08-14-character-bootstrap.sql')],
  ['activity-intent', MIG('2026-08-15-activity-intent.sql')],
  ['key-hygiene', MIG('2026-08-15-intent-key-hygiene.sql')],
  ['auto-eat', MIG('2026-08-15-auto-eat.sql')],
  ['tool-carry', MIG('2026-08-15-tool-carry.sql')],
];

const UID = '00000000-0000-4000-b7d1-000000000001';

const FIXTURE = `
insert into auth.users (id) values ('${UID}') on conflict (id) do nothing;
create or replace function public.__b7d1_create(p_uid uuid, p_slot int)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  v := public.hr_create_character(p_slot);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end $$;
`;

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Both entries reinstate the P0 exactly as it shipped. `--selftest` demands
   each one turns the run RED; a guard that cannot demonstrate it sees the bug
   it was written for is decoration, and this whole file exists because a
   27-mutation suite was decoration for this defect. */
const MUTATIONS = {
  bare_jsonb_set_activity: {
    file: FN('set-activity.js'),
    why: 'set-activity.js binds the pre-stringified delta into a bare $5::jsonb — the shipped P0. '
       + 'postgres.js re-serialises it and hr_apply answers bad_delta.',
    find: '$4::uuid, $5::text::jsonb) as res',
    repl: '$4::uuid, $5::jsonb) as res',
  },
  bare_jsonb_index: {
    file: FN('index.ts'),
    why: 'index.ts binds the pre-stringified delta into a bare ::jsonb — the shipped P0 on the '
       + 'accrue verb, which is the one that pays the night.',
    find: '${JSON.stringify(delta)}::text::jsonb) as res',
    repl: '${JSON.stringify(delta)}::jsonb) as res',
  },
};

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.slice(n.length + 3);
};
const has = (n) => argv.includes(`--${n}`);

const problems = [];
class Red extends Error {}
function ok(cond, msg) { if (!cond) { problems.push(msg); throw new Red(msg); } }
function note(cond, msg) { if (!cond) problems.push(msg); }

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

/* The delta the failure was found with: the shape `activityDelta` produces plus
   a value transfer, so a jsonb string scalar cannot be mistaken for anything
   benign. */
const PROBE_DELTA = { gold: 4, xp: { attack: 26 }, items: { rat_tail: 1 } };

/**
 * Read the sources under test, applying a mutation if one is named. JS/TS text
 * is returned; an importable copy of the whole function directory is produced
 * only when a JS module actually has to be mutated (Node cannot import a
 * string, and set-activity.js imports its siblings by relative path).
 */
async function loadSources(mutate) {
  const src = {
    index: (await readFile(FN('index.ts'), 'utf8')).replace(/\r\n/g, '\n'),
    setActivity: (await readFile(FN('set-activity.js'), 'utf8')).replace(/\r\n/g, '\n'),
    applyEngine: (await readFile(MIG('2026-08-11-apply-engine.sql'), 'utf8')).replace(/\r\n/g, '\n'),
  };
  let importDir = FN('');
  let tempBase = null;

  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) { const e = new Error(`unknown mutation "${mutate}"`); e.harness = true; throw e; }
    const key = m.file === FN('index.ts') ? 'index' : 'setActivity';
    const before = src[key];
    const n = before.split(m.find).length - 1;
    if (n !== 1) {
      const e = new Error(`mutation "${mutate}" anchor matched ${n} times (need exactly 1) in ${m.file}`);
      e.harness = true; throw e;
    }
    const after = before.replace(m.find, m.repl);
    if (after === before) {
      const e = new Error(`mutation "${mutate}" produced identical text`); e.harness = true; throw e;
    }
    src[key] = after;

    if (key === 'setActivity') {
      /* Same depth relative to ROOT, because accrual.js reaches
         ../../../src/core/**. Copy src/ too. */
      tempBase = await mkdtemp(join(tmpdir(), 'hr-b7d1-'));
      const dir = join(tempBase, 'supabase', 'functions', 'hr-accrue');
      await cp(FN(''), dir, { recursive: true });
      await cp(join(ROOT, 'src'), join(tempBase, 'src'), { recursive: true });
      await writeFile(join(dir, 'set-activity.js'), after, 'utf8');
      importDir = dir;
    }
  }
  return { src, importDir, tempBase };
}

/** The cast applied to the delta argument of an `hr_apply(...)` call, read out
 *  of real source text. Returns e.g. '::text::jsonb'. */
function deltaCastOf(text, label) {
  const call = /public\.hr_apply\(([\s\S]{0,400}?)\)\s*as\s+res/.exec(text);
  if (!call) return { error: `${label}: no \`public.hr_apply(...) as res\` call found — this guard is `
    + 'pointed at a file that no longer contains the site it grades' };
  const args = call[1];
  const m = /(?:\$5|\$\{JSON\.stringify\(delta\)\})((?:::[a-z]+)+)\s*$/.exec(args.trim());
  if (!m) return { error: `${label}: could not read the cast on the delta argument of hr_apply — `
    + `the call reads \`${args.replace(/\s+/g, ' ').trim().slice(-90)}\``  };
  return { cast: m[1] };
}

/** A real postgres.js tagged-template invocation built from a strings array we
 *  own — `sql(strings, ...args)` IS what the parser desugars a tagged template
 *  to, so this exercises `stringify()`/`handleValue()`, not `unsafe()`. */
function tagged(sql, parts, ...args) {
  const strings = parts.slice();
  strings.raw = parts.slice();
  return sql(strings, ...args);
}

async function run(mutate) {
  problems.length = 0;
  const { src, importDir, tempBase } = await loadSources(mutate);

  /* ── T5. THE DRIVER UNDER TEST MUST BE THE DRIVER IN PRODUCTION. ─────────
     This whole guard is a claim about ONE library's parameter binding. If the
     devDependency drifts away from the `npm:postgres@X` index.ts imports, the
     run still goes green while proving something about a driver nobody ships —
     the adjacent-proof failure this program has already paid for once (the
     local `deno bundle` that passed while the hosted bundler 400'd). Hence the
     EXACT pin in package.json, asserted here against the SHIPPED import
     specifier rather than against a second copy of the number. */
  {
    const want = (/from\s+'npm:postgres@([0-9.]+)'/.exec(src.index) || [])[1];
    note(!!want, 'T5: index.ts no longer imports `npm:postgres@<version>` — this guard cannot tell '
      + 'whether the driver it is exercising is the one that deploys');
    if (want) {
      const have = JSON.parse(
        await readFile(join(ROOT, 'node_modules', 'postgres', 'package.json'), 'utf8')).version;
      note(have === want,
        `T5: the Edge Function deploys postgres@${want} but this harness is exercising `
        + `postgres@${have}. The binding behaviour under test is version-specific (the serializer `
        + 'lookup in Bind), so a green run here would say nothing about production. Pin the '
        + 'devDependency in package.json to the version index.ts imports.');
    }
  }

  // ── T4. The guard must name the real enemy. ─────────────────────────────
  note(/jsonb_typeof\s*\(\s*p_delta\s*\)\s*<>\s*'object'/.test(src.applyEngine),
    "T4: apply-engine.sql no longer refuses on `jsonb_typeof(p_delta) <> 'object'` — this guard is "
    + 'grading a failure mode the database no longer has, so its RED and GREEN mean nothing');

  // ── T1/T2. The two call sites, from their bytes. ────────────────────────
  const idx = deltaCastOf(src.index, 'index.ts');
  const sa = deltaCastOf(src.setActivity, 'set-activity.js');
  if (idx.error) problems.push(idx.error);
  if (sa.error) problems.push(sa.error);
  if (idx.cast && sa.cast) {
    note(idx.cast === sa.cast,
      `T2: the two apply sites bind the delta differently — index.ts uses \`${idx.cast}\` and `
      + `set-activity.js uses \`${sa.cast}\`. One shape or the other will rot unobserved; both `
      + 'call sites must state the same constraint.');
  }

  let db = null, server = null, sql = null;
  try {
    ({ db } = await bootChain({ extra: EXTRA }));
    await db.exec(FIXTURE);
    const made = (await db.query('select public.__b7d1_create($1,0) as v', [UID])).rows[0].v;
    ok(made.ok === true, `harness: hr_create_character returned ${JSON.stringify(made)}`);

    const port = await freePort();
    const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
    server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 4 });
    await server.start();

    /* THE REAL DRIVER, THE REAL OPTIONS. `prepare: false` is not a detail: it
       is what puts every statement on the describe-first path where the driver
       learns the resolved parameter type, which is the whole bug. These are
       index.ts's pool options. */
    const { default: postgres } = await import('postgres');
    sql = postgres(`postgres://postgres@127.0.0.1:${port}/postgres`, {
      max: 2, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => {},
    });

    // ── T0. THE CONTROL. ──────────────────────────────────────────────────
    {
      /* TWO PARAMETERS, NOT ONE USED TWICE. Postgres resolves a parameter's
         type ONCE for the whole statement, so `jsonb_typeof($1::jsonb)` in the
         same statement as `jsonb_typeof($1::text::jsonb)` forces $1 to jsonb
         and the second reading is a lie. Cost me a false red writing this. */
      const [r] = await sql.unsafe(
        'select jsonb_typeof($1::jsonb) as bare, jsonb_typeof($2::text::jsonb) as viatext',
        [JSON.stringify(PROBE_DELTA), JSON.stringify(PROBE_DELTA)]);
      ok(r.bare === 'string',
        `T0-CONTROL: binding a pre-stringified delta into a bare $1::jsonb produced jsonb_typeof `
        + `'${r.bare}', not 'string'. The double-encode this guard exists to catch is no longer `
        + 'reproducible with this driver, so every assertion below passes for free. Do not delete '
        + 'the ::text::jsonb casts on the strength of a green run — find out what changed first.');
      ok(r.viatext === 'object',
        `T0-CONTROL: $1::text::jsonb produced '${r.viatext}', not 'object' — the fix itself does `
        + 'not hold on this driver, and nothing below can be trusted');
    }

    // ── T1. index.ts's cast, EXECUTED. ────────────────────────────────────
    if (idx.cast) {
      const [r] = await tagged(sql, ['select jsonb_typeof(', `${idx.cast}) as t`],
        JSON.stringify(PROBE_DELTA));
      ok(r.t === 'object',
        `T1: index.ts binds the delta as \`\${JSON.stringify(delta)}${idx.cast}\`, and through the `
        + `real postgres driver that arrives at hr_apply as a jsonb '${r.t}', not an 'object'. `
        + "hr_apply's first guard refuses it as bad_delta — the accrue verb pays NOTHING, ever. "
        + 'A `::jsonb`-described parameter makes postgres.js re-serialise a pre-stringified value; '
        + 'cast to ::text first.');
    }

    // ── T3. END TO END, over the wire, through the real module bytes. ─────
    {
      const { runSetActivity } = await import(
        pathToFileURL(join(importDir, 'set-activity.js')).href + `?t=${Date.now()}${Math.random()}`);

      /* index.ts:256-260, verbatim in behaviour: one statement, its own
         transaction, `set local role hr_engine` re-issued inside it. This is
         the seam the intent modules are written against, and it is the ONE
         thing tests/activity-intent.mjs substitutes. */
      const exec = async (text, params) => await sql.begin(async (tx) => {
        await tx`set local role hr_engine`;
        return await tx.unsafe(text, params);
      });

      const res = await runSetActivity({
        exec, user: UID, slot: 0,
        intentId: crypto.randomUUID(),
        activity: { kind: 'combat', id: 'goblin' },
      });

      /* The refusal envelope carries a whole hr_state_of, so a raw dump buries
         the three fields that name the fault. Report those first. */
      const verdict = res.body?.ok === true
        ? 'ok'
        : `error=${JSON.stringify(res.body?.error)} stage=${JSON.stringify(res.body?.stage)} `
          + `detail=${JSON.stringify(res.body?.detail)}`;
      ok(res.status === 200 && res.body?.ok === true,
        `T3: the real set_activity intent, over the real postgres driver, answered `
        + `${res.status} ${verdict}. `
        + "409/bad_delta at stage 'switch' is the verbatim production P0: the delta reached "
        + 'hr_apply as a jsonb string scalar because postgres.js re-serialised a value that was '
        + 'already JSON.stringify-d. Cast the parameter ::text::jsonb.');

      const [st] = (await db.query(
        'select active_kind, active_id, version from public.player_state where user_id=$1 and slot=0',
        [UID])).rows;
      ok(st && st.active_kind === 'combat' && st.active_id === 'goblin',
        `T3: hr_apply reported success but the pointer is ${st && st.active_kind}/${st && st.active_id} `
        + '— the write did not land, so the 200 above is not evidence of anything');
      ok(Number(st.version) === 1,
        `T3: player_state.version is ${st.version} after exactly one apply from a fresh character `
        + '(expected 1) — the version did not advance, so nothing was committed');
    }
  } catch (e) {
    if (e.harness) throw e;
    if (!(e instanceof Red)) problems.push(`harness/runtime failure: ${e.message}`);
  } finally {
    try { if (sql) await sql.end({ timeout: 5 }); } catch { /* closing */ }
    try { if (server) await server.stop(); } catch { /* closing */ }
    try { if (db) await db.close(); } catch { /* closing */ }
    if (tempBase) await rm(tempBase, { recursive: true, force: true }).catch(() => {});
  }
  return problems.slice();
}

/** The suite entry point, matching the other node guards run-smoke.mjs wires in. */
export async function runAll() {
  const found = await run(null);
  return {
    problems: found,
    note: 'the real postgres@3.4.5 driver binds the delta to hr_apply as a jsonb OBJECT at both '
      + 'call sites, end to end through runSetActivity — with a control proving the double-encode '
      + 'is still visible',
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  if (has('list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`  ${id.padEnd(26)} ${m.why}`);
    process.exitCode = 0;
  } else if (has('selftest')) {
    let bad = 0;
    const clean = await run(null);
    if (clean.length) {
      console.log('CLEAN RUN IS RED — the selftest cannot distinguish a planted bug from the baseline:');
      for (const p of clean) console.log(`  ✗ ${p}`);
      bad++;
    } else {
      console.log('clean run: GREEN (control)');
    }
    for (const id of Object.keys(MUTATIONS)) {
      const found = await run(id);
      if (found.length) {
        console.log(`  CAUGHT  ${id} — ${found[0].split(':')[0]}`);
      } else {
        console.log(`  SLIPPED ${id} — ${MUTATIONS[id].why}`);
        bad++;
      }
    }
    console.log(bad ? `\n${bad} problem(s).` : '\nEvery mutation caught.');
    process.exitCode = bad ? 1 : 0;
  } else {
    const mutate = argOf('mutate', null);
    const found = await run(mutate);
    if (found.length) {
      console.log(`delta-transport guard${mutate ? ` [--mutate=${mutate}]` : ''} — RED:`);
      for (const p of found) console.log(`  ✗ ${p}`);
      process.exitCode = mutate ? 0 : 1;
    } else {
      console.log(`delta-transport guard${mutate ? ` [--mutate=${mutate}]` : ''} — GREEN`);
      process.exitCode = mutate ? 1 : 0;
    }
  }
}
