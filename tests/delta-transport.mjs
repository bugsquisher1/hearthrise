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
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
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
     a result.

     ⚠ gold-intents AND gem-daily-budget ARE REQUIRED PREDECESSORS as of
       2026-08-16, and their absence is a REFUSAL rather than a subtle
       divergence. claim-reward's gate body is derived from gold-intents' (it
       carries the `shop` arm) and its §0 refuses to install against a live gate
       that has none — precisely so that staging it onto a database production
       does not resemble cannot silently delete that arm. gem-daily-budget is
       here because it is the CURRENT last toucher of hr_apply, so the body this
       harness drives is the one production runs rather than one revision back. */
  ['gold-intents', MIG('2026-08-15-gold-intents.sql')],
  ['gem-daily-budget', MIG('2026-08-15-gem-daily-budget.sql')],
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
  /* ── T8's mutation. A THIRD shape again: it edits neither the payload nor a
     file this harness reads into `src`, but a VENDORED CORE MODULE in the
     staged tree — because the thing T8 grades that nothing else does is the
     PRICING of the span, and the price lives in src/core, three directories
     above the payload.

     Halving the derived action interval is the single highest-leverage forgery
     available against a gathering night: `n = floor(sliceMs / stepMs)` makes
     the interval a DIVISOR, so 6,400 ms → 3,200 ms doubles the logs and doubles
     the XP with nothing else in the delta looking wrong. It stays clear of
     MIN_ACTION_MS (500), so the clamp cannot mask it, and it does not touch the
     transport at all — which is the point: T3/T7 and T1/T2/T6 all still pass
     under it. Only an INDEPENDENTLY transcribed expectation can see it. */
  gather_interval_halved: {
    stagedFile: 'src/core/skill-sim.js',
    why: 'the gather action interval is derived at HALF its honest value — a night pays twice the '
       + 'logs and twice the XP, with a perfectly well-formed delta and a 200 from hr_apply.',
    find: '  return actionIntervalMs(skill, (node && node.ms) || 3000, {',
    repl: '  return 0.5 * actionIntervalMs(skill, (node && node.ms) || 3000, {',
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

  /* A mutation that edits a VENDORED CORE MODULE rather than a payload file.
     Nothing in `src` is re-read for it and no assertion above T8 changes: the
     staged copy of src/core is what the staged accrual.js imports (it reaches
     it by `../../../src/...`, which is why `stage()` copies both trees to the
     same relative depth), so only code that actually RUNS the engine can see
     it. That is exactly the coverage claim T8 makes. */
  if (mutate && MUTATIONS[mutate] && MUTATIONS[mutate].stagedFile) {
    const m = MUTATIONS[mutate];
    const dir = await stage();
    const target = join(tempBase, ...m.stagedFile.split('/'));
    const before = (await readFile(target, 'utf8')).replace(/\r\n/g, '\n');
    const n = before.split(m.find).length - 1;
    if (n !== 1) {
      const e = new Error(`mutation "${mutate}" anchor matched ${n} times (need exactly 1) in ${m.stagedFile}`);
      e.harness = true; throw e;
    }
    await writeFile(target, before.replace(m.find, m.repl), 'utf8');
    return { src, importDir: dir, tempBase };
  }

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
      /* Resolve postgres through Node's own module resolution rather than a
         hardcoded `ROOT/node_modules` join. A git worktree has no node_modules
         of its own; resolution walks up from this file and finds the main
         checkout's copy (the worktree is nested under it), so the guard runs in
         a worktree instead of aborting the whole suite at exitCode 2 — the
         papercut that cost five agents their suite tally. postgres blocks
         './package.json' in its exports map, so resolve the entry point and walk
         up to the package root (the segment ending in node_modules/postgres). */
      const entry = createRequire(import.meta.url).resolve('postgres');
      const marker = `${sep}node_modules${sep}postgres${sep}`;
      const pgRoot = entry.slice(0, entry.lastIndexOf(marker) + marker.length);
      const have = JSON.parse(await readFile(join(pgRoot, 'package.json'), 'utf8')).version;
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

    /* ── T8. THE ACCRUE VERB, GATHERING, END TO END OVER THE REAL DRIVER. ────
       The gap this closes is narrow and load-bearing, so it is worth naming
       precisely what covered what before it existed:

         tests/accrual-engine.mjs   calls computeAccrual directly and proves the
                                    gather PRICE matches the client's own replay
                                    for the same seed. It never opens a database.
         tests/activity-intent.mjs  drives a gather collect through the real
                                    hr_apply — but over a PGlite `exec`, and via
                                    the set_activity verb.
         T1 above                   executes index.ts's cast, but only far enough
                                    to read `jsonb_typeof`. Nothing is applied.

       So the ACCRUE verb — the one that pays the night — has never been driven
       end to end over the transport it deploys on. It cannot be imported (it is
       Deno .ts), so this reproduces index.ts's flow with its OWN bytes where it
       matters: the read is index.ts's read, the engine is the real
       `computeAccrual` off disk, and the apply is built from `idx.cast`, the
       cast READ OUT OF index.ts. The `bare_jsonb_index` mutation therefore
       turns this RED end to end rather than at a `jsonb_typeof` probe.

       ⚠ AND IT ASSERTS THE PRICE, NOT ONLY THE 200. A delta that transports
         perfectly and prices wrong is a 200 with the wrong number of logs in it,
         and every assertion in T1–T7 passes on it — they all compare the engine
         against itself. The pin below is derived from the AUTHORED NODE and the
         pacing dials, never from the simulation, which is what lets it see the
         `gather_interval_halved` mutation that nothing else in this file can. */
    {
      const SLOT = 1;
      const SPAN_H = 4;
      /* oak_tree, not normal_tree: `req: 15` means the fixture must satisfy a
         level gate the server re-checks, so a pass is not available to a
         character that simply ignored it. `qty: [1,1]` means the yield draws no
         random number, so the expected item count is the action count exactly
         — the pin below would otherwise be a distribution, not a number. */
      const NODE = { id: 'oak_tree', ms: 4000, product: 'oak_log', skill: 'woodcutting' };

      const made1 = (await db.query('select public.__b7d1_create($1,$2) as v', [UID, SLOT])).rows[0].v;
      ok(made1.ok === true, `T8: hr_create_character(slot ${SLOT}) returned ${JSON.stringify(made1)}`);

      /* The fixture. Level 16 woodcutting (3,000 XP) clears oak's 15, and the
         inventory is EMPTIED so the character owns no axe — the transcription
         below assumes a tool-less interval and that assumption is asserted, not
         hoped for, a few lines down. */
      await db.query(
        "update public.player_skills set xp = 3000 "
        + "where user_id=$1 and slot=$2 and skill_id='woodcutting'", [UID, SLOT]);
      await db.query('delete from public.player_inventory where user_id=$1 and slot=$2', [UID, SLOT]);
      await db.query(
        "update public.player_state set active_kind='gather', active_id=$3, "
        + "accrued_to = now() - ($4 || ' hours')::interval, "
        + "active_since = now() - ($4 || ' hours')::interval "
        + 'where user_id=$1 and slot=$2', [UID, SLOT, NODE.id, String(SPAN_H)]);

      // ── index.ts's READ, over the real driver, in the engine role. ────────
      const read = await sql.begin(async (tx) => {
        await tx`set local role hr_engine`;
        const [r] = await tx`
          select public.hr_state_of(${UID}::uuid, ${SLOT}::int)       as state,
                 public.hr_offline_cap_ms(${UID}::uuid, ${SLOT}::int) as cap_ms,
                 now()                                                as now`;
        return r;
      });
      const env = read?.state;
      ok(env && env.ok === true, `T8: hr_state_of answered ${JSON.stringify(env)?.slice(0, 200)}`);
      const st = env.state;
      ok(st.active_kind === 'gather' && st.active_id === NODE.id,
        `T8: the fixture pointer reads ${st.active_kind}/${st.active_id} — nothing below is a `
        + 'gathering test');

      /* THE SEED, from the server. `hr_seed` mixes a 256-bit secret held in a
         table with RLS on and no client grant, so this also proves the engine
         role can reach it — the determinism half of the contract is only worth
         anything if the seed is server-derived. */
      const seedRow = await sql.begin(async (tx) => {
        await tx`set local role hr_engine`;
        const [r] = await tx`
          select (public.hr_seed(${UID}::uuid, ${SLOT}::int,
                                 ${'accrue:' + String(st.accrued_to)}) & 4294967295)::bigint as seed`;
        return r;
      });
      ok(Number(seedRow?.seed) > 0,
        `T8: hr_seed returned ${JSON.stringify(seedRow)} — a zero/absent seed makes every roll `
        + 'below run off the engine default rather than off server state, and the determinism '
        + 'claim would be about a constant');

      // ── The engine, off disk, exactly as index.ts calls it. ───────────────
      const bust = `?t=${Date.now()}${Math.random()}`;
      const CORE = (rel) => pathToFileURL(join(importDir, '..', '..', '..', rel)).href + bust;
      const { computeAccrual } = await import(
        pathToFileURL(join(importDir, 'accrual.js')).href + bust);
      const { GATHER_NODES } = await import(
        pathToFileURL(join(importDir, 'catalogue.js')).href + bust);
      const { ITEMS } = await import(CORE('src/data/items.js'));
      const { MONSTERS } = await import(CORE('src/data/monsters.js'));
      const { PACE, MIN_ACTION_MS } = await import(CORE('src/core/pacing.js'));
      const { toolFor } = await import(CORE('src/core/skill-sim.js'));

      const skills = {};
      for (const k of Object.keys(env.skills || {})) skills[k] = Number(env.skills[k].xp) || 0;
      const nowMs = new Date(read.now).getTime();

      /* THE FIXTURE'S OWN VACUITY CHECK. `bestTool` reads inventory AND
         equipment, and a tool adds a speed term straight into the interval —
         which would make the transcription below quietly wrong and this whole
         assertion a coin flip. Assert the premise. */
      const tool = toolFor({ inventory: env.inventory || {}, equipment: env.equipment || {} },
        NODE.skill, ITEMS);
      ok(!tool,
        `T8: the fixture character owns a ${NODE.skill} tool (${JSON.stringify(tool)}), so the `
        + 'tool-less interval this test transcribes is not the interval the engine will derive. '
        + 'Clear it, or the pricing pin below passes or fails for the wrong reason.');

      const out = computeAccrual({
        userId: UID,
        slot: SLOT,
        nowMs,
        accruedToMs: st.accrued_to ? new Date(st.accrued_to).getTime() : nowMs,
        activeSinceMs: st.active_since ? new Date(st.active_since).getTime() : null,
        activeKind: st.active_kind,
        activeId: st.active_id,
        capMs: Number(read.cap_ms) || 0,
        seed: Number(seedRow?.seed) || 0,
        hp: Number(st.hp) || 0,
        maxHp: Number(st.max_hp) || 0,
        gold: Number(st.gold) || 0,
        skills,
        equipment: env.equipment || {},
        inventory: env.inventory || {},
        autoEatEnabled: st.auto_eat_enabled === true,
        autoEatFood: st.auto_eat_food ?? null,
        autoEatPct: Number(st.auto_eat_pct),
        toolCarry: st.tool_carry ?? null,
        perks: null,
        items: ITEMS,
        monsters: MONSTERS,
        nodes: GATHER_NODES,
      });
      ok(out.accrued === true,
        `T8: the engine refused a ${SPAN_H}h gathering window with reason '${out.reason}'. `
        + "`unsupported_activity` means 'gather' left PAYABLE_KINDS, which silently returns every "
        + 'gathering player to a zero night.');
      ok(out.delta?.journal?.kind === 'gather',
        `T8: the delta is journalled as '${out.delta?.journal?.kind}', expected 'gather' — a `
        + 'gathering night filed under another kind is unauditable');

      /* ── THE PRICING PIN, TRANSCRIBED FROM THE AUTHORED NODE. ──────────────
         Deliberately a SECOND EXPRESSION of the interval, not a call to
         `actionIntervalMs`: every other assertion in this file compares the
         engine's output against the engine's own arithmetic, so none of them
         can see a mispriced span. This one can.

         The DIALS are imported (PACE.actionMs, MIN_ACTION_MS) and the
         EXPRESSION is written out, which is the boundary that matters: a
         Designer re-tuning `PACE.actionMs` moves both sides together and this
         stays green, while a change to how the SIMULATION derives or consumes
         the interval moves only one side and turns it red. With no perk stack,
         no tool and no buff, `speedClamp(0) === 1`, so the honest interval is
         `max(500, floor(4000 * 1.60)) = 6,400 ms` and the honest yield of a
         `qty:[1,1]` node is one product per action, exactly. */
      const intervalMs = Math.max(MIN_ACTION_MS, Math.floor(NODE.ms * PACE.actionMs));
      const expectedQty = Math.floor(Number(out.grantMs) / intervalMs);
      ok(expectedQty > 1000,
        `T8: the fixture budgets only ${expectedQty} actions — too few for a rounding error to be `
        + 'distinguishable from a pricing error');
      ok(out.delta.items && out.delta.items[NODE.product] === expectedQty,
        `T8 PRICING: ${SPAN_H}h on ${NODE.id} proposed `
        + `${JSON.stringify(out.delta.items)}, but ${out.grantMs} ms at the authored `
        + `${NODE.ms} ms x PACE.actionMs ${PACE.actionMs} = ${intervalMs} ms per action is exactly `
        + `${expectedQty} ${NODE.product}. The action interval is a DIVISOR of elapsed time and the `
        + 'largest single lever in the grant (design section 3), so a wrong one is a silent mint or '
        + 'a silent confiscation with a perfectly well-formed delta.');

      // ── index.ts's APPLY, with index.ts's OWN cast, over the real driver. ─
      const beforeLedger = Number((await db.query(
        'select count(*) as n from public.player_ledger where user_id=$1 and slot=$2',
        [UID, SLOT])).rows[0].n);
      const applied = await sql.begin(async (tx) => {
        await tx`set local role hr_engine`;
        const [r] = await tagged(tx,
          ['select public.hr_apply(', '::uuid, ', '::int, ', '::bigint, ', '::uuid, ',
            `${idx.cast || '::text::jsonb'}) as res`],
          UID, SLOT, env.version, crypto.randomUUID(), JSON.stringify(out.delta));
        return r;
      });
      const res = applied?.res;
      ok(res && res.ok === true,
        `T8: the accrue apply answered ${JSON.stringify(res)?.slice(0, 240)}. `
        + "`bad_delta` here is the verbatim production P0 on the verb that PAYS THE NIGHT: "
        + 'index.ts binds a pre-stringified delta and postgres.js re-serialises it into a jsonb '
        + 'string scalar unless the parameter is described as text. Cast it ::text::jsonb.');

      // ── THE MONEY. A receipt without a balance change proves nothing. ─────
      const gotQty = Number((await db.query(
        'select qty from public.player_inventory where user_id=$1 and slot=$2 and item_id=$3',
        [UID, SLOT, NODE.product])).rows[0]?.qty ?? 0);
      ok(gotQty === expectedQty,
        `T8: hr_apply reported success but player_inventory holds ${gotQty} ${NODE.product}, not `
        + `the ${expectedQty} the engine priced — the 200 above is not evidence that anything landed`);

      const gotXp = Number((await db.query(
        'select xp from public.player_skills where user_id=$1 and slot=$2 and skill_id=$3',
        [UID, SLOT, NODE.skill])).rows[0]?.xp ?? 0);
      ok(gotXp === 3000 + Number(out.delta.xp?.[NODE.skill] ?? 0),
        `T8: ${NODE.skill} XP is ${gotXp} after a night the delta priced at `
        + `+${out.delta.xp?.[NODE.skill]} from 3000`);

      const [after] = (await db.query(
        'select version, accrued_to from public.player_state where user_id=$1 and slot=$2',
        [UID, SLOT])).rows;
      ok(Number(after.version) === Number(env.version) + 1,
        `T8: player_state.version is ${after.version} (was ${env.version}) — the apply did not commit`);
      ok(new Date(after.accrued_to).getTime() > new Date(st.accrued_to).getTime(),
        'T8: accrued_to did not advance, so the same four hours can be collected again');

      /* ── THE DAILY BUDGET'S QTY DIMENSION, MEASURED. ───────────────────────
         `hr_apply` stamps gold_in/xp_in/qty_in itself, from the same three
         variables `hr_day_budget_check` was called with, so the ledger row is
         the only honest evidence of what the day was CHARGED. Asserting it here
         answers the question by measurement rather than by reading the SQL:
         gathering's item grants consume the UNITS dimension, and only that one.

         ONE ROW, not one per action — a 4h night is 2,250 actions, and
         `game_events` reaching 1.6M rows / 229 MB from six players in four days
         is the receipt for what per-action journalling costs. */
      const rows = (await db.query(
        'select kind, intent, gold_in, xp_in, qty_in from public.player_ledger '
        + 'where user_id=$1 and slot=$2 order by at', [UID, SLOT])).rows.slice(beforeLedger);
      ok(rows.length === 1,
        `T8: the accrual wrote ${rows.length} ledger rows for one night (expected exactly 1). `
        + 'The journal is an AGGREGATE by contract; a row per action is the failure that took the '
        + 'database to 229 MB on six players.');
      const led = rows[0];
      ok(led.kind === 'gather' && led.intent === 'accrue',
        `T8: the ledger row is ${led.kind}/${led.intent}, expected gather/accrue`);
      ok(Number(led.qty_in) === expectedQty,
        `T8 BUDGET: the ledger stamped qty_in=${led.qty_in} for ${expectedQty} items. Gathering's `
        + 'yield MUST charge the units dimension of the daily budget — an item grant that stamps 0 '
        + 'is an uncapped mint against the one ceiling that is derived from an append-only ledger '
        + 'rather than stored as a counter.');
      ok(Number(led.xp_in) === Number(out.delta.xp?.[NODE.skill] ?? 0),
        `T8 BUDGET: the ledger stamped xp_in=${led.xp_in} against a delta of `
        + `${JSON.stringify(out.delta.xp)}`);
      ok(Number(led.gold_in) === 0,
        `T8 BUDGET: a gathering night stamped gold_in=${led.gold_in} — gathering mints no gold, so `
        + "a non-zero here is another kind's value being charged to this window");
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
