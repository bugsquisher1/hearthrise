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
//   T6  EVERY apply site in the payload, not the two this file knows by name.
//       T1/T2 grade two paths spelled as literals here, so the third call site —
//       the one a future verb adds — is exactly the site they cannot see, and it
//       would be written by copying one of the two that predate the fix. T6
//       walks the whole deployed directory, finds each `public.hr_apply(...)` by
//       balanced parens, and requires `::text::jsonb` on its last argument. Its
//       mutation PLANTS a new file rather than editing an old one, because a
//       mutation that edits a file T1/T2 already read proves nothing about T6.
//   T7  THE CLAIM VERB, END TO END — the same wire as T3, one verb over, and the
//       first one that MOVES MONEY. It was written because claim-reward.js
//       shipped with the pre-fix `$5::jsonb` shape: the verb was authored against
//       a PGlite-`exec` suite (tests/claim-intent.mjs, the behavioural authority
//       for it) which by construction cannot see the transport, so the P0 was
//       reproduced in a new file within hours of being closed in the old two. T7
//       asserts the MONEY, not the 200 — gold in player_state, version bumped,
//       the progress row 'claimed' — and pins `granted`'s literal key set, which
//       is a documented wire shape the client renders.
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

import { readFile, readdir, cp, writeFile, mkdtemp, rm } from 'node:fs/promises';
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
  /* T7's chain. claim-reward.sql adds hr_claim_lookup and hr_rate_gate's
     `claim` bucket and touches nothing else, so it may sit after tool-carry —
     it is deliberately NOT a file that replaces hr_apply. Without it the claim
     verb cannot be driven at all and T7 would be a harness failure rather than
     a result. */
  ['claim-reward', MIG('2026-08-16-claim-reward.sql')],
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
   The first two entries reinstate the P0 exactly as it shipped. `--selftest`
   demands each one turns the run RED; a guard that cannot demonstrate it sees
   the bug it was written for is decoration, and this whole file exists because
   a 27-mutation suite was decoration for this defect.

   The third is a different shape: it does not edit a file, it PLANTS one. An
   `edit` mutation is caught by T1/T2 whether or not T6 works, so it could never
   show T6 sees anything — the fixture-that-cannot-fail trap this program has
   already paid for. Only a call site in a file no assertion names by hand
   distinguishes them. */
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
  bare_jsonb_claim_reward: {
    file: FN('claim-reward.js'),
    why: 'claim-reward.js binds the pre-stringified delta into a bare $5::jsonb — the shipped P0 on '
       + 'the verb that MOVES MONEY. Every daily claim would 409 bad_delta and the player would be '
       + 'told the reward was not claimable.',
    find: '$4::uuid, $5::text::jsonb) as res',
    repl: '$4::uuid, $5::jsonb) as res',
  },
  third_apply_site: {
    /* How the P0 comes back: not by anyone un-fixing these two lines, but by the
       next verb copying the shape that predates the fix into a new file. */
    plant: 'burn-charge.js',
    why: 'a THIRD apply site enters the payload binding a pre-stringified delta into a bare '
       + '$5::jsonb, in a file T1/T2 do not know by name.',
    text: '// a future verb, written by copying the shape that shipped broken\n'
        + 'export const APPLY_SQL = `\n'
        + '  select public.hr_apply($1::uuid, $2::int, $3::bigint, $4::uuid, $5::jsonb) as res`;\n',
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
    claimReward: (await readFile(FN('claim-reward.js'), 'utf8')).replace(/\r\n/g, '\n'),
    applyEngine: (await readFile(MIG('2026-08-11-apply-engine.sql'), 'utf8')).replace(/\r\n/g, '\n'),
  };
  let importDir = FN('');
  let tempBase = null;

  /** Copy the whole payload (and `src/`, which accrual.js reaches via
   *  ../../../) to the SAME depth under a temp root, so a mutated or planted
   *  module still resolves its siblings. */
  const stage = async () => {
    tempBase = await mkdtemp(join(tmpdir(), 'hr-b7d1-'));
    const dir = join(tempBase, 'supabase', 'functions', 'hr-accrue');
    await cp(FN(''), dir, { recursive: true });
    await cp(join(ROOT, 'src'), join(tempBase, 'src'), { recursive: true });
    return dir;
  };

  if (mutate && MUTATIONS[mutate] && MUTATIONS[mutate].plant) {
    const m = MUTATIONS[mutate];
    const dir = await stage();
    await writeFile(join(dir, m.plant), m.text, 'utf8');
    /* The planted file is never imported — nothing must change about T1–T5, or
       a RED run would not tell us WHICH assertion did the catching. */
    return { src, importDir: dir, tempBase };
  }

  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) { const e = new Error(`unknown mutation "${mutate}"`); e.harness = true; throw e; }
    /* file → the `src` key AND the on-disk basename, in one table, so adding a
       fourth mutable module is a row rather than a ternary that quietly routes
       an unknown file to set-activity.js and mutates the wrong bytes. */
    const FILE_KEYS = {
      [FN('index.ts')]: ['index', 'index.ts'],
      [FN('set-activity.js')]: ['setActivity', 'set-activity.js'],
      [FN('claim-reward.js')]: ['claimReward', 'claim-reward.js'],
    };
    const entry = FILE_KEYS[m.file];
    if (!entry) {
      const e = new Error(`mutation "${mutate}" names ${m.file}, which this harness does not read`);
      e.harness = true; throw e;
    }
    const [key, basename] = entry;
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

    if (key !== 'index') {
      /* A .ts file is never imported here (Node cannot), so only the JS modules
         need a staged, importable copy. */
      const dir = await stage();
      await writeFile(join(dir, basename), after, 'utf8');
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

/* ── T6's scanner ──────────────────────────────────────────────────────────
   Deliberately NOT a regex over the whole call. `hr_apply(...)` spans lines and
   its last argument can itself contain parentheses and braces
   (`${JSON.stringify(delta)}`), so the arguments are taken by balanced-paren
   scan and split on TOP-LEVEL commas only. A regex that got this subtly wrong
   would find zero sites and report GREEN — the exact failure this file exists
   to stop, so the "at least two sites" floor below is load-bearing. */

/** Every `public.hr_apply(...)` argument list in one file's text. */
function applyArgLists(text) {
  const out = [];
  const re = /public\.hr_apply\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length, depth = 1;
    while (i < text.length && depth > 0) {
      const c = text[i];
      if (c === '(') depth++; else if (c === ')') depth--;
      i++;
    }
    out.push(depth === 0 ? text.slice(m.index + m[0].length, i - 1) : null);
  }
  return out;
}

/** The last top-level argument of an argument list — the delta. */
function lastArg(args) {
  let depth = 0, start = 0;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) start = i + 1;
  }
  return args.slice(start).trim();
}

/** Every .js/.ts/.mjs file in the deployed payload directory, recursively. */
async function payloadFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { out.push(...await payloadFiles(p)); continue; }
    if (/\.(js|mjs|ts)$/.test(e.name)) out.push(p);
  }
  return out;
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

  // ── T1/T2. The named call sites, from their bytes. ──────────────────────
  const idx = deltaCastOf(src.index, 'index.ts');
  const sa = deltaCastOf(src.setActivity, 'set-activity.js');
  const cr = deltaCastOf(src.claimReward, 'claim-reward.js');
  for (const r of [idx, sa, cr]) if (r.error) problems.push(r.error);
  {
    /* Every named site must state the SAME shape. Two that disagree is how one
       of them rots unobserved — and with three verbs the odds of a copy from
       the wrong one go up, not down. */
    const casts = [['index.ts', idx.cast], ['set-activity.js', sa.cast], ['claim-reward.js', cr.cast]]
      .filter(([, c]) => !!c);
    const distinct = [...new Set(casts.map(([, c]) => c))];
    note(distinct.length <= 1,
      'T2: the apply sites bind the delta differently — '
      + casts.map(([f, c]) => `${f} uses \`${c}\``).join(', ')
      + '. One shape or the other will rot unobserved; every call site must state the same '
      + 'constraint.');
  }

  /* ── T6. EVERY apply site in the payload, including ones added later. ─────
     T1/T2 name two files. The site that reintroduces this P0 will be the third,
     written by copying a shape from before the fix, in a file nothing here
     spells. So census the directory that actually deploys. */
  {
    const seen = [];
    for (const file of await payloadFiles(importDir)) {
      const rel = file.slice(importDir.length + 1).replace(/\\/g, '/');
      /* Grade the SAME bytes T1/T2 graded for the two files they read, so the
         census can never disagree with the assertions above it. */
      const text = rel === 'index.ts' ? src.index
                 : rel === 'set-activity.js' ? src.setActivity
                 : rel === 'claim-reward.js' ? src.claimReward
                 : (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
      for (const args of applyArgLists(text)) {
        if (args === null) {
          problems.push(`T6: ${rel} contains an unbalanced \`public.hr_apply(\` — this scanner `
            + 'cannot read its delta argument, so it cannot vouch for it');
          continue;
        }
        seen.push(rel);
        const delta = lastArg(args);
        if (!/::text::jsonb$/.test(delta)) {
          problems.push(`T6: ${rel} binds hr_apply's delta as \`${delta.replace(/\s+/g, ' ')}\` — `
            + 'it must end `::text::jsonb`. A pre-stringified delta bound into a bare `::jsonb` is '
            + 'described to postgres.js as type 3802, whose serialiser is JSON.stringify, so the '
            + 'value is encoded twice and reaches hr_apply as a jsonb STRING SCALAR — bad_delta, '
            + 'every call, silently, exactly as it shipped on 2026-08-15.');
        }
      }
    }
    note(seen.length >= 3,
      `T6: the payload census found ${seen.length} \`public.hr_apply(\` call site(s), expected at `
      + 'least the three known ones (index.ts, set-activity.js, claim-reward.js). Either the '
      + 'scanner stopped matching the real syntax or the apply '
      + 'sites moved out of the deployed directory — either way this assertion is now vacuous and '
      + 'a green run means nothing.');
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

    /* ── T7. THE CLAIM VERB, END TO END, OVER THE REAL DRIVER. ──────────────
       tests/claim-intent.mjs drives runClaimReward through a PGlite `exec` and
       is the behavioural authority for this verb — 30+ mutations, the streak,
       the double-claim lock, the replay. What it CANNOT see is the wire, which
       is the exact blind spot that let the P0 ship: set-activity.js had a
       27-mutation suite and had never once applied anything in production.
       claim-reward.js was written after that fix and copied the pre-fix shape
       anyway, which is the whole reason T6 exists.

       This is the same seam as T3, one verb over: the real module off disk, the
       real postgres driver, the real hr_apply. It is deliberately the MONEY
       assertion — the gold has to be in player_state afterwards, because a
       receipt without a balance change is what a re-encoded delta looks like
       from the outside on the day someone "fixes" the 409 by ignoring it. */
    {
      const { runClaimReward } = await import(
        pathToFileURL(join(importDir, 'claim-reward.js')).href + `?t=${Date.now()}${Math.random()}`);

      const exec = async (text, params) => await sql.begin(async (tx) => {
        await tx`set local role hr_engine`;
        return await tx.unsafe(text, params);
      });

      const [before] = (await db.query(
        'select gold, gems, version from public.player_state where user_id=$1 and slot=0',
        [UID])).rows;

      const res = await runClaimReward({
        exec, user: UID, slot: 0,
        intentId: crypto.randomUUID(),
        reward: { kind: 'daily', key: 'login' },
      });

      const verdict = res.body?.ok === true
        ? 'ok'
        : `error=${JSON.stringify(res.body?.error)} stage=${JSON.stringify(res.body?.stage)} `
          + `detail=${JSON.stringify(res.body?.detail)}`;
      ok(res.status === 200 && res.body?.ok === true,
        `T7: the real claim_reward intent, over the real postgres driver, answered `
        + `${res.status} ${verdict}. `
        + "409/bad_delta at stage 'claim' is the verbatim production P0 on the verb that MOVES "
        + 'MONEY: the delta reached hr_apply as a jsonb string scalar because postgres.js '
        + 're-serialised a value that was already JSON.stringify-d. Cast the parameter '
        + '::text::jsonb, exactly as index.ts and set-activity.js do.');

      /* THE GRANT RECEIPT'S LITERAL KEY SET (Security G3). The header at the top
         of claim-reward.js documents this object and the client renders it, so a
         silent rename between the two is a receipt the client cannot read. The
         set is asserted EXACTLY — a new key must move the header with it. */
      const g = res.body?.granted;
      ok(g && typeof g === 'object',
        `T7: a non-replay claim returned granted=${JSON.stringify(g)} — the receipt is the half of `
        + 'this response the client renders, and null here means the player is paid with no '
        + 'explanation of what for');
      {
        const want = ['cycle_day', 'gems', 'gold', 'kind', 'key', 'mult', 'period', 'streak', 'weeks']
          .sort().join(',');
        const have = Object.keys(g).sort().join(',');
        note(have === want,
          `T7: granted's key set is [${have}] but the contract in claim-reward.js's header and in `
          + `tests/claim-intent.mjs says [${want}]. The receipt is a documented wire shape: a key `
          + 'renamed in the pricer\'s `meta` silently renames a field the client reads, and the '
          + 'header stops being true. Change both, or neither.');
      }

      const [after] = (await db.query(
        'select gold, gems, version from public.player_state where user_id=$1 and slot=0',
        [UID])).rows;
      ok(Number(after.gold) === Number(before.gold) + Number(g.gold),
        `T7: player_state.gold went ${before.gold} → ${after.gold}, but the receipt claims `
        + `${g.gold} gold was granted. The 200 above is not evidence that any value moved.`);
      ok(Number(after.version) === Number(before.version) + 1,
        `T7: player_state.version is ${after.version} after the claim (was ${before.version}) — the `
        + 'apply did not commit, so the receipt describes work that did not happen');

      const [row] = (await db.query(
        "select state, value from public.player_progress where user_id=$1 and slot=0 "
        + "and kind='daily' and key='login'", [UID])).rows;
      ok(row && row.state === 'claimed',
        `T7: player_progress for daily:login is ${JSON.stringify(row)} — the claim block is the `
        + "double-claim lock, and a row that is not 'claimed' means today can be claimed again");
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
