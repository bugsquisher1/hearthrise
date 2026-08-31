#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/live-hash-drift.mjs — DOES PRODUCTION CARRY THE FUNCTION BODIES THE
//                             REPO BELIEVES IT CARRIES?
//
//   node tests/live-hash-drift.mjs               the credential-free half (CI)
//   node tests/live-hash-drift.mjs --list        the tracked set + how it was derived
//   node tests/live-hash-drift.mjs --selftest    plant defects, require each caught
//   node tests/live-hash-drift.mjs --mutate      plant defects in the REAL migrations
//   node tests/live-hash-drift.mjs --live-sql            read-only SQL for production
//   node tests/live-hash-drift.mjs --live-compare r.json grade a saved result
//   node tests/live-hash-drift.mjs --live                fetch + grade in one step
//   node tests/live-hash-drift.mjs --codediff [name]     is a divergence only comments?
//   node tests/live-hash-drift.mjs --write [--no-live]   re-seed the baseline
//
// ── THE FAILURE THIS EXISTS TO KILL ─────────────────────────────────────────
// 2026-08-30: the renown-faucet migration RAN ON PRODUCTION while the repo went
// on recording it as staged for a full day. Nothing in this repository compared
// repo belief against a live function body, and three separate mechanisms that
// look like they would have are each blind to it:
//
//   · tests/schema-drift.mjs fingerprints SIGNATURES, not bodies. Its own header
//     names this as blind spot (C): "a signature-identical / behaviour-different
//     function is invisible here."
//   · supabase_migrations.schema_migrations is FROZEN on this project — applies
//     go through execute_sql, so the platform's own ledger records nothing.
//   · The hash pins inside the migrations (c_baseline / c_self / c_applied) fire
//     only AT APPLY TIME. They answer "may I install?", never "what is installed
//     right now?", and a body that drifts between two applies is unobserved
//     until the next migration happens to touch it.
//
// So "what the repo thinks is deployed" was PROSE. This file makes it a MEASURED
// FACT, and the baseline diff becomes the deployment record the project does not
// otherwise keep.
//
// ── RED IN BOTH DIRECTIONS ──────────────────────────────────────────────────
// A one-way check ("prod still matches") rots the moment the repo moves. Every
// arm below is symmetric:
//   live         a tracked body on production is not the md5 the baseline records
//   live-missing the baseline expects a body on production and it is not there
//   live-unexpected  the baseline records a body as ABSENT (its migration is
//                staged) and production HAS it — i.e. THE NAMED FAILURE: a
//                staged migration was applied and nobody updated the repo
//   live-extra   production carries a signature under a tracked NAME that the
//                baseline does not list. This is the OVERLOAD class: a pin names
//                hr_credit_kills__ungated(int,text,bigint,text) exactly, and a
//                hand-added five-argument overload is invisible to it while
//                being what PostgREST might resolve
//   replay       the repo chain no longer rebuilds to the body the baseline
//                records — a migration FILE was edited after it was applied
//   replay-missing / replay-extra  the same two directions, repo-side
//   untracked    the sweep derived a hash-pinned / programmatically-patched
//                function that has no baseline entry at all
//   unexplained  an entry whose live and replay hashes disagree with no reason
//                recorded. Silence is not a measurement
//   encoding     a production body carries double-encoded UTF-8 (see §ENCODING)
//
// ── THE TRACKED SET IS DERIVED, NOT HAND-GUESSED ────────────────────────────
// `sweep()` reads supabase/migrations/** and returns every function whose LIVE
// BODY the repo has an opinion about, by three rules — see RULES below. A hand
// list would be one migration away from being wrong, and the function that fell
// off it would be exactly the one nobody was watching. The sweep additionally
// FAILS AS A HARNESS ERROR if a file uses pg_get_functiondef and yields no
// signature: a new patcher idiom must be taught to the sweep loudly, never drop
// a function silently. (The "a bug that was never planted is the same defect as
// a probe that is always null" rule, from schema-drift.mjs.)
//
// ── NORMALISATION: '[[:space:]]+', NEVER '\s+' ──────────────────────────────
// The hash is md5(regexp_replace(pg_get_functiondef(oid), '[[:space:]]+', ' ',
// 'g')) and it is computed IN SQL on both sides, never reimplemented in JS.
// The class must be the POSIX one. Measured 2026-08-29 by the kill-daily
// migration: the same '\s+' expression normalised whitespace on production and
// ATE EVERY LETTER `s` under the PGlite replay, producing two different hashes
// for one identical body — a backslash class in a single-quoted literal is
// parsed differently depending on standard_conforming_strings and the two
// runtimes do not agree. Collapsing [[:space:]]+ also subsumes the CR problem
// (production stores bodies applied from a CRLF working copy with CRLF in them),
// so no separate chr(13) strip is needed and none is done.
//
// The consequence, stated: this hash is WHITESPACE- AND COMMENT-SENSITIVE. A
// comment added to a migration file after it was applied moves the replay hash
// and not the live one, and that is a true divergence — the repo and the
// database really are different text. It is graded, not ignored: the entry
// carries agree:false plus a `why` that says what was measured.
//
// ── §ENCODING: A REAL DEFECT, FOUND BY THIS GUARD'S FIRST MEASUREMENT ───────
// hr_put_client_state__ungated is on production with its box-drawing comment
// characters DOUBLE-ENCODED (`── THE AUTHORITY DENY-LIST` stored as
// `â€œ...`-class bytes). Its executable code is byte-identical to the repo, so it
// is cosmetic TODAY — but it proves at least one apply path mangled UTF-8, and
// the same path applied to a string literal (an error code, a jsonb key, an item
// id) is a behaviour change that no test in this repo would see. Probe is
// backslash-free and literal-free on purpose: position(chr(226) …), because chr()
// cannot be re-broken by the very encoding problem it looks for. Measured on
// nezapsylztqbbwuwembx 2026-08-30: 1 of 264 functions, and 0 for chr(195)/chr(194).
//
// ── WHAT TO DO WHEN THIS GOES RED — THE RITUAL ──────────────────────────────
// It is SUPPOSED to go red when you author a migration that patches a tracked
// body: the repo's belief just moved and nobody has said whether the database
// moved with it. Never edit a hash to clear it. Instead:
//
//   the migration is STAGED, not applied yet
//     node tests/live-hash-drift.mjs --write --no-live
//     …then replace the `REVIEW …` placeholder --write leaves in `why` with what
//     you actually measured. The placeholder is TREATED AS NO REASON, so the
//     guard stays red until the sentence is real.
//
//   the migration has been APPLIED to production
//     node tests/live-hash-drift.mjs --live --write
//     …and let the baseline diff be the deploy record in the commit.
//
//   live and replay disagree and you do not know why
//     node tests/live-hash-drift.mjs --codediff <name>
//     …which strips SQL comments from both bodies and says whether the
//     executable text is identical. If it is NOT, production is running
//     different code from the repo: that is an incident, not a docs gap.
//
// Exit: 0 green · 1 a real problem · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ROOT, bootReplay } from './schema-replay.mjs';

const MIGDIR = join(ROOT, 'supabase', 'migrations');
const BASELINE = join(ROOT, 'tests', 'live-hash-drift.baseline.json');
const PROJECT = 'nezapsylztqbbwuwembx';
const argv = process.argv.slice(2);

const harness = (msg) => { const e = new Error(msg); e.harness = true; return e; };

// ── THE FLOOR ──────────────────────────────────────────────────────────────
// Named by the server-authority program rather than derived, because a function
// can be load-bearing without any migration reading its body back. Each entry
// states WHY it is here so the list can be argued with instead of inherited.
const FLOOR = {
  hr_apply: 'the only writer; every delta is re-validated here',
  hr_rpc_gate: 'the rate bucket every client-callable RPC passes through',
  hr_state_of: 'the envelope the client renders; a dropped key is a reset field',
  hr_credit_kills__ungated: 'kill credit — the renown faucet lived here',
  hr_renown_of: 'scores renown, which gates hr_claim_rank and renownAllXp',
  hr_claim_daily__ungated: 'pays gold on a server-owned catalogue',
  hr_claim_quest__ungated: 'pays gold on a server-owned catalogue',
  hr_accept_bounty__ungated: 'sets the required-kill count a turn-in is graded on',
  hr_create_character: 'mints the starting kit',
  hr_import_apply: 'the cutover importer — writes a whole character',
  hr_set_auto_eat: 'the food/pct authority the accrual engine prices survival on',
  hr_credit_combat_xp__ungated: 'mints XP from a client-reported fight. One '
    + 'authoring migration and no hash pin, so nothing else in this repo would '
    + 'notice a later file restating it',
};

const RULES = {
  pin: 'a migration READS this body back with pg_get_functiondef — to hash-pin it '
     + '(c_baseline/c_self/c_applied) or to patch it programmatically at an anchor',
  chain: 'restated by three or more migrations, so the repo alone cannot name which '
       + 'revision is installed (the b484-b487 "a later file silently deletes a '
       + 'hardening" class)',
  floor: 'named by the server-authority program — see FLOOR in this file',
};

// ════════════════════════════════════════════════════════════════════════
// THE SWEEP
// ════════════════════════════════════════════════════════════════════════
const SIGLIT = /^public\.[a-z_][a-z0-9_]*\([^()]*\)$/;
const CHAIN_AT = 3;

/** Strip whole-line `--` comments so prose about a function is not a hit. */
const codeOnly = (src) => src.replace(/\r\n/g, '\n').split('\n')
  .filter((l) => !/^\s*--/.test(l)).join('\n');

/**
 * Every function whose LIVE body this repo has an opinion about.
 * @param {Map<string,string>} [sources] filename -> SQL, for the selftest. Reading
 *        from disk by default keeps the production path honest; being able to
 *        inject lets the shape guard below be PROVEN without writing to a real
 *        migration file.
 * @returns {Promise<Map<string,{rules:Set<string>, files:Set<string>}>>} name -> provenance
 */
export async function sweep(sources) {
  const files = sources
    ? [...sources.keys()].sort()
    : (await readdir(MIGDIR)).filter((f) => f.endsWith('.sql')).sort();
  const byName = new Map();
  const note = (name, rule, file) => {
    if (!byName.has(name)) byName.set(name, { rules: new Set(), files: new Set() });
    const e = byName.get(name);
    e.rules.add(rule);
    if (file) e.files.add(file);
  };
  const restated = new Map();
  const shapeless = [];

  for (const f of files) {
    const sql = codeOnly(sources ? sources.get(f) : await readFile(join(MIGDIR, f), 'utf8'));

    // (chain) how many distinct migrations restate each body outright
    const authored = new Set();
    for (const m of sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z_0-9]+)\s*\(/gi)) {
      authored.add(m[1]);
    }
    for (const n of authored) restated.set(n, (restated.get(n) || new Set()).add(f));

    if (!sql.includes('pg_get_functiondef')) continue;

    // (pin) the four shapes this repo actually uses to read a body back.
    let hits = 0;
    const sig = (s) => { note(s.replace(/^public\./, '').replace(/\(.*$/s, ''), 'pin', f); hits += 1; };
    for (const m of sql.matchAll(/pg_get_functiondef\(\s*'([^']+)'\s*::\s*regprocedure\s*\)/g)) sig(m[1]);
    for (const m of sql.matchAll(/pg_get_functiondef\(\s*to_regprocedure\(\s*'([^']+)'\s*\)/g)) sig(m[1]);
    for (const m of sql.matchAll(/pg_get_functiondef\(\s*oid\s*\)\s+from\s+pg_proc\s+where\s+proname\s*=\s*'([a-z_0-9]+)'/g)) {
      note(m[1], 'pin', f); hits += 1;
    }
    // …and the indirect shape: pg_get_functiondef(<var>::regprocedure).
    const vars = new Set();
    for (const m of sql.matchAll(/pg_get_functiondef\(\s*([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)\s*::\s*regprocedure\s*\)/g)) {
      vars.add(m[1]);
    }
    for (const v of vars) {
      const base = v.split('.')[0];
      let found = 0;
      for (const m of sql.matchAll(new RegExp(`\\b${base}\\s+constant\\s+text\\s*:=\\s*'([^']+)'`, 'g'))) {
        sig(m[1]); found += 1;
      }
      if (!found) {
        /* A LOOP-DRIVEN PATCHER (2026-09-03-intent-mismatch-class.sql patches
           twelve bodies from a `values` table). The loop variable cannot be
           resolved statically, so every signature literal in the file is taken.
           That DELIBERATELY OVER-COLLECTS — a file's precondition guards get
           swept in alongside its patch targets — and over-collection is the safe
           direction: an extra tracked body costs one baseline row, a missing one
           costs the whole point of the guard. */
        for (const m of sql.matchAll(/'(public\.[a-z_][a-z0-9_]*\([^']*\))'/g)) {
          if (SIGLIT.test(m[1])) { sig(m[1]); found += 1; }
        }
      }
      if (!found) shapeless.push(`${f}: pg_get_functiondef(${v}::regprocedure) — cannot resolve the signature`);
    }
    if (!hits) shapeless.push(`${f}: uses pg_get_functiondef and yielded NO signature`);
  }

  if (shapeless.length) {
    throw harness(
      'THE SWEEP CANNOT READ A MIGRATION IT MUST READ:\n  - '
      + `${shapeless.join('\n  - ')}\n`
      + '  A patcher idiom the sweep does not understand would drop that function\n'
      + '  from the tracked set SILENTLY, which is the one failure mode this guard\n'
      + '  cannot afford. Teach sweep() the new shape; do not widen it to a match-all.');
  }

  for (const [n, fs_] of restated) if (fs_.size >= CHAIN_AT) for (const f of fs_) note(n, 'chain', f);
  for (const n of Object.keys(FLOOR)) note(n, 'floor', null);
  return byName;
}

// ════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT — one query shape, run on production AND on the replay
// ════════════════════════════════════════════════════════════════════════
// Read-only. Filtered by tracked PRONAME (not by signature) precisely so a NEW
// OVERLOAD of a tracked function shows up as a row the baseline does not have.
// The `__census__` row makes a truncated paste a harness error instead of a set
// of silent live-missing findings — schema-drift's partial_measurement lesson.
export function bodyQuery(names) {
  const list = [...names].sort().map((n) => `'${n}'`).join(',');
  const NORM = "regexp_replace(pg_get_functiondef(p.oid), '[[:space:]]+', ' ', 'g')";
  // chr(226)/chr(195)/chr(194) are the lead characters of double-encoded UTF-8 as
  // stored. Written with chr() rather than as literals so this probe cannot be
  // broken by the encoding fault it exists to find, and backslash-free because
  // the two runtimes disagree about backslash classes.
  const MOJI = '(position(chr(226) in p.prosrc) > 0 or position(chr(195) in p.prosrc) > 0'
             + ' or position(chr(194) in p.prosrc) > 0)';
  return `-- READ-ONLY. Generated by: node tests/live-hash-drift.mjs --live-sql
-- Run against production, then: node tests/live-hash-drift.mjs --live-compare <result.json>
-- Every tracked function BODY, normalised exactly as the migrations' own hash
-- pins normalise it: md5(regexp_replace(def, '[[:space:]]+', ' ', 'g')).
with tracked(nm) as (select unnest(array[${list}])),
     f as (
  select p.proname::text||'('||pg_get_function_identity_arguments(p.oid)||')' as sig,
         md5(${NORM}) as body_md5,
         length(${NORM})::int as norm_len,
         ${MOJI} as mojibake
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join tracked t on t.nm = p.proname::text
   where n.nspname = 'public' and p.prokind = 'f')
select '__census__'::text as sig, md5(coalesce(string_agg(sig, chr(10) order by sig), '')) as body_md5,
       count(*)::int as norm_len, false as mojibake
  from f
union all
select sig, body_md5, norm_len, mojibake from f
order by 1;`;
}

/** The same measurement, taken against a full PGlite replay of the repo chain. */
async function measureReplay(patches) {
  const t0 = Date.now();
  const { db } = await bootReplay(patches ? { patches } : undefined);
  const names = [...(await sweep()).keys()];
  const rows = (await db.query(bodyQuery(names))).rows;
  await db.close?.();
  return { rows, ms: Date.now() - t0 };
}

// ════════════════════════════════════════════════════════════════════════
// THE CLASSIFIER — pure, so the selftest can plant defects without a database
// ════════════════════════════════════════════════════════════════════════
const asMap = (rows) => {
  const m = new Map();
  for (const r of rows) if (r.sig !== '__census__') m.set(r.sig, r);
  return m;
};

/** Census check. Throws a HARNESS error on a partial/garbled measurement. */
function censusOk(rows, where) {
  const c = rows.find((r) => r.sig === '__census__');
  if (!c) {
    throw harness(`the ${where} result carries no __census__ row. Re-run the FULL query from\n`
      + '  node tests/live-hash-drift.mjs --live-sql — a truncated paste must not be\n'
      + '  graded, because every missing function would read as "absent on production".');
  }
  const n = rows.length - 1;
  if (Number(c.norm_len) !== n) {
    throw harness(`the ${where} result is PARTIAL: the census counted ${c.norm_len} tracked\n`
      + `  function(s) and only ${n} row(s) came back. Silence about a function must never\n`
      + '  read as agreement. Paste the whole result.');
  }
}

/**
 * Production rows vs the baseline. No IO, no exit.
 * @returns {{findings:{key:string,detail:string}[], checked:number}}
 */
export function classifyLive(prodRows, base) {
  const findings = [];
  const say = (key, detail) => findings.push({ key, detail });
  const prod = asMap(prodRows);
  const tracked = new Set(base.functions.map((e) => e.name));

  for (const e of base.functions) {
    const p = prod.get(e.sig);
    if (!e.live) {
      // The baseline records this body as NOT on production.
      if (p) {
        say(`live-unexpected ${e.sig}`,
          `the baseline records this as ABSENT on production (${e.why || 'no reason recorded'}) `
          + `and production HAS it, md5 ${p.body_md5}. A migration the repo believes is STAGED `
          + 'has been APPLIED. This is the exact failure of 2026-08-30. Re-measure and update '
          + 'the baseline, and check what else that migration moved.');
      }
      continue;
    }
    if (!p) {
      say(`live-missing ${e.sig}`,
        `the baseline expects md5 ${e.live.md5} on production and production has no such `
        + 'function. Either it was dropped, or its signature moved (which is a PostgREST '
        + 'resolution change, i.e. a player-facing outage).');
      continue;
    }
    if (p.body_md5 !== e.live.md5) {
      say(`live ${e.sig}`,
        `production is md5 ${p.body_md5} (normalised length ${p.norm_len}); the baseline `
        + `records ${e.live.md5} (${e.live.norm_len}), measured ${e.live.measured}. The `
        + 'deployed body is not the one this repo believes is deployed. Diff it before '
        + 'applying anything that restates or patches it.');
    }
    const ackMoji = e.live.mojibake === true;
    if (p.mojibake === true && !ackMoji) {
      say(`encoding ${e.sig}`,
        'the production body carries double-encoded UTF-8. Comments only is cosmetic; the '
        + 'same apply path applied to a string literal is a behaviour change. Find the apply '
        + 'that did it before it happens to a literal.');
    }
    if (ackMoji && p.mojibake !== true) {
      say(`encoding-resolved ${e.sig}`,
        'the baseline acknowledges double-encoded UTF-8 here and production no longer has '
        + 'it. Remove the acknowledgement — an ack list that rots in this direction stops '
        + 'being evidence of anything.');
    }
  }

  const known = new Set(base.functions.map((e) => e.sig));
  for (const [sig, r] of prod) {
    if (known.has(sig)) continue;
    const name = sig.split('(')[0];
    if (!tracked.has(name)) continue;   // not ours to police
    say(`live-extra ${sig}`,
      `production carries this signature under the tracked name "${name}" and the baseline `
      + `does not list it (md5 ${r.body_md5}). Every hash pin in this repo names an EXACT `
      + 'signature, so an overload is invisible to all of them while being a candidate for '
      + 'PostgREST resolution. Explain it and baseline it, or drop it.');
  }

  return { findings, checked: base.functions.length };
}

/** The repo replay vs the baseline. Credential-free; this is the CI half. */
export function classifyReplay(replayRows, base, derivedNames) {
  const findings = [];
  const say = (key, detail) => findings.push({ key, detail });
  const rep = asMap(replayRows);
  const byName = new Set(base.functions.map((e) => e.name));

  for (const n of derivedNames) {
    if (byName.has(n)) continue;
    say(`untracked ${n}`,
      'the sweep derives this function as hash-pinned, programmatically patched or restated '
      + `by ${CHAIN_AT}+ migrations, and the baseline has no entry for it. A tracked body with `
      + 'no recorded belief is a body nobody is watching. Re-seed with --write.');
  }

  for (const e of base.functions) {
    const r = rep.get(e.sig);
    if (!r) {
      say(`replay-missing ${e.sig}`,
        'the repo chain no longer builds this function at this signature. Either a migration '
        + 'stopped creating it or its arguments moved — and production still has it.');
      continue;
    }
    if (r.body_md5 !== e.replay.md5) {
      say(`replay ${e.sig}`,
        `the repo chain now rebuilds to md5 ${r.body_md5} (normalised length ${r.norm_len}); `
        + `the baseline records ${e.replay.md5} (${e.replay.norm_len}). A migration FILE `
        + 'changed. If that change was applied to production, re-measure with --live --write '
        + 'so the baseline records the deploy. If it was NOT applied, the repo and the '
        + 'database have just diverged and someone has to decide which is right.');
    }
    /* `!e.why` is not enough, and that gap was real: --write fills a NEW
       divergence with a `REVIEW <date>: …` placeholder so the operator sees it,
       and a placeholder is a non-empty string. Left at that, re-baselining would
       have turned every fresh divergence green while explaining nothing — the
       guard writing its own alibi. A placeholder is treated as no reason. */
    const placeholder = typeof e.why === 'string' && /^REVIEW\b/.test(e.why);
    if (e.live && e.live.md5 !== e.replay.md5 && (!e.why || placeholder)) {
      say(`unexplained ${e.sig}`,
        `live and replay hashes disagree and the entry ${placeholder
          ? 'still carries the --write REVIEW placeholder' : 'records no reason'}. An unexplained `
        + 'divergence is the state this guard exists to end. Run  node tests/live-hash-drift.mjs '
        + `--codediff ${e.name}  and write what it measured into \`why\`.`);
    }
  }

  const known = new Set(base.functions.map((e) => e.sig));
  for (const [sig] of rep) {
    if (known.has(sig)) continue;
    const name = sig.split('(')[0];
    if (!byName.has(name)) continue;
    say(`replay-extra ${sig}`,
      `the repo chain builds this signature under the tracked name "${name}" and the baseline `
      + 'does not list it. A new overload of a hash-pinned function is a resolution hazard '
      + 'even before it reaches production.');
  }

  return { findings };
}

// ════════════════════════════════════════════════════════════════════════
// THE LIVE FETCH (direct mode) — READ-ONLY, and never in CI
// ════════════════════════════════════════════════════════════════════════
// The repository is PUBLIC and CI runs npm lifecycle scripts; a database
// credential has no business in that job. This path is an operator ritual.
// The token goes in a curl --config file rather than argv, so it is not in the
// process table. curl, not fetch/urllib: the API's edge 403s unfamiliar TLS/UA
// signatures, and a 403 that looks like an auth failure wastes an incident.
async function fetchLive(sql) {
  let tok;
  try { tok = (await readFile(join(homedir(), '.supabase-token'), 'utf8')).trim(); }
  catch {
    throw harness('no Supabase token at ~/.supabase-token, so the live half cannot run.\n'
      + '  Use the two-step path instead — it needs no credential in this process:\n'
      + '    node tests/live-hash-drift.mjs --live-sql   > q.sql   (run it read-only)\n'
      + '    node tests/live-hash-drift.mjs --live-compare result.json');
  }
  /* THE READ-ONLY LOCK. This function holds a credential that can write to the
     database that is about to be the only copy of every player's progression, so
     "we only ever pass it a select" is not good enough — it is asserted here,
     against the actual text, on the way out. Comment lines are stripped first so
     prose cannot trip it and, more importantly, cannot HIDE a keyword after a
     `--` that the server would still not see (the query is one statement). */
  const bare = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n').trim();
  if (!/^(with|select)\b/i.test(bare)) {
    throw harness('refusing to send a statement that does not begin with SELECT or WITH');
  }
  const banned = bare.match(/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|call|do|copy|vacuum|refresh|set|reset|comment|reindex|cluster|lock|listen|notify)\b/i);
  if (banned) {
    throw harness(`refusing to send a statement containing "${banned[1]}" — this path is READ-ONLY`);
  }
  const cfg = join(tmpdir(), `hr-lhd-${randomUUID()}.conf`);
  const body = join(tmpdir(), `hr-lhd-${randomUUID()}.json`);
  try {
    await writeFile(body, JSON.stringify({ query: sql }));
    await writeFile(cfg,
      `url = "https://api.supabase.com/v1/projects/${PROJECT}/database/query"\n`
      + 'request = "POST"\n'
      + `header = "Authorization: Bearer ${tok}"\n`
      + 'header = "Content-Type: application/json"\n'
      + `data-binary = "@${body.replace(/\\/g, '/')}"\n`
      + 'silent\n');
    const out = execFileSync('curl', ['-K', cfg, '-w', '\n%{http_code}'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const cut = out.lastIndexOf('\n');
    const code = out.slice(cut + 1).trim();
    if (code !== '200' && code !== '201') {
      throw harness(`the Management API answered HTTP ${code}: ${out.slice(0, 400)}`);
    }
    return JSON.parse(out.slice(0, cut));
  } catch (e) {
    if (e.harness) throw e;
    throw harness(`the live query failed: ${String(e.message || e).split('\n')[0]}`);
  } finally {
    await unlink(cfg).catch(() => {});
    await unlink(body).catch(() => {});
  }
}

// ── --codediff: IS A DIVERGENCE ONLY COMMENTS? ─────────────────────────────
// The hash is deliberately whitespace- and comment-sensitive, which means a
// divergence is a real text difference and says nothing on its own about
// BEHAVIOUR. Answering "is this cosmetic?" by hand is how a divergence ends up
// with a `why` somebody guessed. This makes it one command: fetch the live body,
// rebuild the repo's, strip SQL comments from both (dollar-quote and
// single-quote aware, so a `--` inside a literal is not mistaken for one), and
// say whether the executable text is identical.
export function stripSqlComments(src) {
  const out = [];
  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    let s = raw; let inStr = false; let dq = null; let cut = -1;
    for (let i = 0; i < s.length; i += 1) {
      if (dq) { if (s.startsWith(dq, i)) { i += dq.length - 1; dq = null; } continue; }
      if (inStr) { if (s[i] === "'") inStr = false; continue; }
      if (s[i] === "'") { inStr = true; continue; }
      const m = /^\$[a-zA-Z_0-9]*\$/.exec(s.slice(i));
      if (m) { dq = m[0]; i += m[0].length - 1; continue; }
      if (s[i] === '-' && s[i + 1] === '-') { cut = i; break; }
    }
    if (cut >= 0) s = s.slice(0, cut);
    out.push(s);
  }
  return out.join('\n').replace(/[ \t\r\n\v\f]+/g, ' ').trim();
}

const defQuery = (names) => 'select p.proname::text||\'(\'||pg_get_function_identity_arguments(p.oid)||\')\' as sig,'
  + ' pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace'
  + ` where n.nspname = 'public' and p.prokind = 'f' and p.proname = any(array[${
    [...names].sort().map((n) => `'${n}'`).join(',')}]) order by 1`;

async function codeDiff(only) {
  const base = await loadBaseline();
  const want = base.functions.filter((e) => e.live && !e.agree)
    .filter((e) => !only || e.name === only || e.sig === only);
  if (!want.length) throw harness(only ? `no divergent baseline entry named "${only}"` : 'no divergent entries to check');
  const names = want.map((e) => e.name);
  const live = new Map((await fetchLive(defQuery(names))).map((r) => [r.sig, r.def]));
  const { db } = await bootReplay();
  const rep = new Map((await db.query(defQuery(names))).rows.map((r) => [r.sig, r.def]));
  await db.close?.();

  let real = 0;
  for (const e of want) {
    const L = live.get(e.sig); const R = rep.get(e.sig);
    if (L === undefined || R === undefined) { console.error(`  ?  ${e.sig} — absent on ${L === undefined ? 'production' : 'the replay'}`); real += 1; continue; }
    const lc = stripSqlComments(L); const rc = stripSqlComments(R);
    if (lc === rc) {
      console.log(`  CODE-IDENTICAL  ${e.name.padEnd(30)} ${lc.length} code chars; the whole `
        + `${Math.abs(e.live.norm_len - e.replay.norm_len)}-char delta is comments/whitespace`);
    } else {
      real += 1;
      let i = 0; while (i < lc.length && lc[i] === rc[i]) i += 1;
      console.error(`  CODE DIFFERS >> ${e.name}  live ${lc.length} vs replay ${rc.length} code chars`);
      console.error(`     first divergence at char ${i}:\n       live   …${lc.slice(Math.max(0, i - 60), i + 90)}`);
      console.error(`       replay …${rc.slice(Math.max(0, i - 60), i + 90)}`);
    }
  }
  if (real) {
    console.error(`\n${real} divergence(s) are NOT cosmetic: production is running different code`);
    console.error('from the repo. That is an incident, not a documentation gap.');
    process.exit(1);
  }
  console.log(`\nall ${want.length} recorded divergence(s) are comments/whitespace only — production`);
  console.log('runs the same executable text the repo rebuilds.');
}

const readRows = (raw) => {
  const rows = Array.isArray(raw) ? raw : (raw && (raw.result || raw.rows || raw.data));
  if (!Array.isArray(rows)) throw harness('the live result is not an array of rows');
  return rows.map((r) => ({ ...r, norm_len: Number(r.norm_len), mojibake: r.mojibake === true || r.mojibake === 'true' }));
};

const loadBaseline = async () => {
  try { return JSON.parse(await readFile(BASELINE, 'utf8')); }
  catch { throw harness(`no baseline at ${BASELINE}. Seed it with --live --write.`); }
};

// ════════════════════════════════════════════════════════════════════════
// THE SELFTEST — every planted defect must be caught BY A NAMED ASSERTION
// ════════════════════════════════════════════════════════════════════════
// `expect` is the point, not decoration. Several of these defects trip more than
// one arm, and a guard that reports the wrong finding for the right defect is one
// refactor from reporting nothing. The convention is stated at
// tests/bounty-drift.mjs:52-56; tests/renown-kill-faucet.mjs did NOT follow it
// and graded any throw as a catch, which is how a syntax-only non-defect read as
// "CAUGHT". Needs no credentials: production is SYNTHESIZED from the baseline,
// so the clean case must produce ZERO findings before any defect means anything.
function synth(base, side) {
  const rows = base.functions
    .filter((e) => (side === 'live' ? e.live : true))
    .map((e) => ({
      sig: e.sig,
      body_md5: side === 'live' ? e.live.md5 : e.replay.md5,
      norm_len: side === 'live' ? e.live.norm_len : e.replay.norm_len,
      mojibake: side === 'live' ? e.live.mojibake === true : false,
    }));
  return [{ sig: '__census__', body_md5: 'x', norm_len: rows.length, mojibake: false }, ...rows];
}

const clone = (o) => JSON.parse(JSON.stringify(o));

function selftestCases(base) {
  const liveRows = synth(base, 'live');
  const repRows = synth(base, 'replay');
  const names = new Set(base.functions.map((e) => e.name));
  // Pick real entries so every message names a function that actually exists.
  const pinned = base.functions.find((e) => e.name === 'hr_credit_kills__ungated') || base.functions[0];
  const present = base.functions.find((e) => e.live) || base.functions[0];
  const moji = base.functions.find((e) => e.live && e.live.mojibake === true);

  const cases = {
    live_body_mutated: {
      what: 'a production body is not the one the repo believes is deployed — a hand-patch, a '
          + 'hotfix, or a migration applied from a different revision',
      side: 'live',
      expect: `live ${pinned.sig}`,
      rows: () => liveRows.map((r) => (r.sig === pinned.sig ? { ...r, body_md5: '0'.repeat(32) } : r)),
    },
    live_function_dropped: {
      what: 'a tracked function is GONE from production while the baseline still expects it — '
          + 'a drop, or a signature change, which is a PostgREST resolution outage',
      side: 'live',
      expect: `live-missing ${present.sig}`,
      rows: () => {
        const kept = liveRows.filter((r) => r.sig !== present.sig);
        return kept.map((r) => (r.sig === '__census__' ? { ...r, norm_len: kept.length - 1 } : r));
      },
    },
    overload_on_prod: {
      what: 'production carries an OVERLOAD of a hash-pinned function. Every pin in this repo '
          + 'names an exact signature, so all of them are blind to it — and PostgREST may '
          + 'resolve to it',
      side: 'live',
      expect: `live-extra ${pinned.name}(p_slot integer, p_target text, p_claimed bigint, p_idem text, p_extra text)`,
      rows: () => {
        const extra = {
          sig: `${pinned.name}(p_slot integer, p_target text, p_claimed bigint, p_idem text, p_extra text)`,
          body_md5: 'a'.repeat(32), norm_len: 99, mojibake: false,
        };
        const out = [...liveRows, extra];
        return out.map((r) => (r.sig === '__census__' ? { ...r, norm_len: out.length - 1 } : r));
      },
    },
    new_mojibake: {
      what: 'a production body newly carries double-encoded UTF-8 — the apply path that '
          + 'mangled hr_put_client_state__ungated has struck again, and next time it may hit '
          + 'a string literal rather than a comment',
      side: 'live',
      expect: `encoding ${present.sig}`,
      rows: () => liveRows.map((r) => (r.sig === present.sig ? { ...r, mojibake: true } : r)),
    },
    partial_paste: {
      what: 'the operator pasted back a truncated result. Silence about a function must be a '
          + 'HARNESS error, never a set of quiet live-missing findings',
      side: 'live',
      harnessExpected: true,
      expect: 'PARTIAL',
      rows: () => liveRows.slice(0, Math.max(2, liveRows.length - 3)),
    },
    replay_body_changed: {
      what: 'a migration FILE was edited after it was applied, so the repo no longer rebuilds '
          + 'to the body it records — the credential-free half of the same failure',
      side: 'replay',
      expect: `replay ${pinned.sig}`,
      rows: () => repRows.map((r) => (r.sig === pinned.sig ? { ...r, body_md5: '0'.repeat(32) } : r)),
    },
    baseline_entry_deleted: {
      what: 'a tracked function is quietly deleted from the baseline — the way a red guard gets '
          + 'made green. The sweep re-derives it and the deletion goes red',
      side: 'replay',
      expect: `untracked ${pinned.name}`,
      base: () => {
        const b = clone(base);
        b.functions = b.functions.filter((e) => e.name !== pinned.name);
        return b;
      },
      rows: () => repRows,
      names: () => names,
    },
  };

  /* ⚠ THE NEXT TWO CASES FABRICATE THE STATE THEY NEED INSTEAD OF LOOKING FOR IT.
     The first draft wrote `if (staged) cases.staged_migration_applied = …`, and
     since today's baseline records nothing as absent-on-production that case
     SILENTLY DID NOT RUN — leaving the one arm this whole file was built for
     (a staged migration that turned out to be applied) with no proof at all,
     while the selftest printed a clean "all N caught". A case that only exists
     when the database happens to be in the right shape is not a case. */
  const STAGED = {
    sig: 'hr_selftest_staged_verb(p_slot integer)',
    name: 'hr_selftest_staged_verb',
    tracked_by: ['pin'],
    touched_by: [],
    live: null,
    replay: { md5: 'b'.repeat(32), norm_len: 64, source: 'computed-from-replay' },
    agree: false,
    why: 'created by a migration the repo records as STAGED, not applied',
  };
  cases.staged_migration_applied = {
    what: 'a migration the repo records as STAGED has been APPLIED to production — the exact '
        + 'failure of 2026-08-30, which went unnoticed for a full day',
    side: 'live',
    expect: `live-unexpected ${STAGED.sig}`,
    base: () => { const b = clone(base); b.functions.push(clone(STAGED)); return b; },
    rows: () => {
      const out = [...liveRows, { sig: STAGED.sig, body_md5: STAGED.replay.md5, norm_len: 64, mojibake: false }];
      return out.map((r) => (r.sig === '__census__' ? { ...r, norm_len: out.length - 1 } : r));
    },
  };

  const first = base.functions[0];
  cases.divergence_unexplained = {
    what: 'a live/replay divergence loses its recorded reason, so the baseline stops saying what '
        + 'was actually measured and starts merely asserting it',
    side: 'replay',
    expect: `unexplained ${first.sig}`,
    base: () => {
      const b = clone(base);
      const e = b.functions.find((x) => x.sig === first.sig);
      e.live = { ...e.live, md5: 'c'.repeat(32) };  // force a divergence…
      e.agree = false;
      delete e.why;                                  // …with nothing said about it
      return b;
    },
    rows: () => repRows,
    names: () => names,
  };

  cases.divergence_review_placeholder = {
    what: 'a re-baseline leaves --write\'s own "REVIEW <date>: …" placeholder in `why`. A '
        + 'non-empty string is not an explanation, and treating it as one would let the guard '
        + 'write its own alibi every time it was re-seeded',
    side: 'replay',
    expect: `unexplained ${first.sig}`,
    base: () => {
      const b = clone(base);
      const e = b.functions.find((x) => x.sig === first.sig);
      e.live = { ...e.live, md5: 'e'.repeat(32) };
      e.agree = false;
      e.why = 'REVIEW 2026-08-31: live and replay disagree and nobody has said why.';
      return b;
    },
    rows: () => repRows,
    names: () => names,
  };

  cases.repo_grew_an_overload = {
    what: 'the repo chain starts building a second signature under a tracked name. Every hash '
        + 'pin here names an EXACT signature, so an overload is invisible to all of them — and '
        + 'this catches it before it reaches production rather than after',
    side: 'replay',
    expect: `replay-extra ${pinned.name}(p_user uuid, p_slot integer, p_scale numeric)`,
    rows: () => {
      const out = [...repRows, {
        sig: `${pinned.name}(p_user uuid, p_slot integer, p_scale numeric)`,
        body_md5: 'd'.repeat(32), norm_len: 40, mojibake: false,
      }];
      return out.map((r) => (r.sig === '__census__' ? { ...r, norm_len: out.length - 1 } : r));
    },
  };

  cases.repo_stopped_building_it = {
    what: 'a migration stops creating a tracked function, or moves its arguments — while '
        + 'production still has it. A rebuild or a restore would then not reproduce the database',
    side: 'replay',
    expect: `replay-missing ${present.sig}`,
    rows: () => {
      const kept = repRows.filter((r) => r.sig !== present.sig);
      return kept.map((r) => (r.sig === '__census__' ? { ...r, norm_len: kept.length - 1 } : r));
    },
  };

  cases.mojibake_ack_rotted = {
    what: 'an acknowledged encoding fault is gone from production and the acknowledgement is '
        + 'still in the baseline. An ack list that rots in this direction stops being evidence',
    side: 'live',
    expect: `encoding-resolved ${moji ? moji.sig : present.sig}`,
    base: () => {
      const b = clone(base);
      const e = b.functions.find((x) => x.sig === (moji ? moji.sig : present.sig));
      e.live.mojibake = true;
      return b;
    },
    rows: () => liveRows.map((r) => ({ ...r, mojibake: false })),
  };

  return { cases, liveRows, repRows, names };
}

async function selftest() {
  const base = await loadBaseline();
  const derived = [...(await sweep()).keys()];
  const { cases, liveRows, repRows, names } = selftestCases(base);

  // THE FALSE-POSITIVE FLOOR. If a production identical to the baseline already
  // produces findings, every case below would "pass" on the noise floor.
  censusOk(liveRows, 'synthetic live');
  const cleanLive = classifyLive(liveRows, base).findings;
  const cleanRep = classifyReplay(repRows, base, derived).findings;
  if (cleanLive.length || cleanRep.length) {
    throw harness('--selftest: a database identical to the baseline produced '
      + `${cleanLive.length + cleanRep.length} finding(s), so every planted defect below would `
      + `pass for the wrong reason. First: ${(cleanLive[0] || cleanRep[0]).key}`);
  }
  console.log(`  clean floor: an identical database produces 0 findings over ${base.functions.length} tracked bodies`);

  /* ── THE DERIVATION'S OWN ANTI-VACUITY PROOF ────────────────────────────
     Everything above rests on sweep() finding the right functions. A patcher
     idiom sweep() cannot parse must be a LOUD harness error, never a silently
     shorter tracked set — a function dropped from the sweep is a function nobody
     is watching, and the guard would still print a confident green. Proven here
     against synthetic sources, so nothing writes to a real migration. */
  let bad = 0;
  const SHAPES = {
    unparseable_patcher: {
      what: 'a migration reads a body back through a shape sweep() cannot resolve',
      sql: 'do $$ declare v_src text; begin\n'
         + '  v_src := pg_get_functiondef(some_helper(v_target));\n'
         + '  execute replace(v_src, \'a\', \'b\');\nend $$;',
      expect: 'yielded NO signature',
    },
    unresolvable_variable: {
      what: 'a patcher loops over signatures held somewhere sweep() cannot follow',
      sql: 'do $$ declare r record; begin\n'
         + '  for r in select sig from some_registry loop\n'
         + '    perform pg_get_functiondef(r.sig::regprocedure);\n  end loop;\nend $$;',
      expect: 'cannot resolve the signature',
    },
  };
  for (const [id, s] of Object.entries(SHAPES)) {
    let msg = null;
    try { await sweep(new Map([['9999-99-99-planted.sql', s.sql]])); }
    catch (e) { if (!e.harness) throw e; msg = e.message; }
    if (msg && msg.includes(s.expect)) console.log(`  ok  ${id.padEnd(26)} HARNESS: ${s.expect}`);
    else {
      console.error(`  ✗  ${id} — sweep() accepted a shape it cannot read (expected a harness `
        + `error matching /${s.expect}/).\n     ${s.what}`);
      process.exitCode = 1;
    }
  }
  // …and the same sweep must NOT cry wolf on a file that legitimately never
  // reads a body back, or the guard becomes unrunnable and gets deleted.
  const quiet = await sweep(new Map([['9999-99-99-quiet.sql',
    'create or replace function public.hr_quiet() returns int language sql as $$ select 1 $$;']]));
  if (quiet.size !== Object.keys(FLOOR).length) {
    throw harness('--selftest: sweep() reported a tracked function for a migration that reads no '
      + 'body back — the shape guard has a false-positive floor');
  }
  console.log(`  ok  ${'sweep_no_false_positive'.padEnd(26)} a body-free migration adds nothing`);

  for (const [id, c] of Object.entries(cases)) {
    const b = c.base ? c.base() : base;
    const nm = c.names ? [...c.names()] : derived;
    let got = [];
    let harnessMsg = null;
    try {
      const rows = c.rows();
      if (c.side === 'live') { censusOk(rows, 'planted'); got = classifyLive(rows, b).findings; }
      else got = classifyReplay(rows, b, nm).findings;
    } catch (e) {
      if (!e.harness) throw e;
      harnessMsg = String(e.message);
    }

    if (c.harnessExpected) {
      if (harnessMsg && harnessMsg.includes(c.expect)) {
        console.log(`  ok  ${id.padEnd(26)} HARNESS: ${harnessMsg.split('\n')[0].slice(0, 96)}`);
      } else {
        console.error(`  ✗  ${id} — expected a HARNESS error matching /${c.expect}/, got `
          + `${harnessMsg ? 'a different harness error' : `${got.length} finding(s)`}\n     ${c.what}`);
        bad += 1;
      }
      continue;
    }
    if (harnessMsg) {
      console.error(`  ✗  ${id} — UNEXPECTED HARNESS ERROR: ${harnessMsg.split('\n')[0]}\n     ${c.what}`);
      bad += 1; continue;
    }
    const hit = got.find((f) => f.key === c.expect);
    if (hit) console.log(`  ok  ${id.padEnd(26)} ${hit.key}`);
    else {
      console.error(`  ✗  ${id} — expected a finding keyed "${c.expect}"; got: `
        + `${got.map((f) => f.key).join(', ') || '(nothing)'}\n     ${c.what}`);
      bad += 1;
    }
  }
  if (bad) {
    console.error(`\n${bad} planted defect(s) were not caught by the assertion written for them.`);
    process.exit(1);
  }
  console.log(`\nall ${Object.keys(cases).length + Object.keys(SHAPES).length + 1} planted defects `
    + 'caught by their NAMED assertion');
}

// ── --mutate: the same proof, against the REAL migration text ──────────────
// The selftest above proves the CLASSIFIER sees failure. This proves the whole
// pipeline does: plant a real defect in a real migration, replay it, and require
// the replay arm to report it. Each case costs one full chain replay.
const MUTATIONS = {
  /* ⚠ THIS MUTATION IS A COMMENT ON PURPOSE, AND THAT IS THE WHOLE POINT.
     The first version of it retuned the boss renown weight — and the migration's
     OWN §3 gate caught it before the replay finished, so the case proved nothing
     about THIS guard (the harness said so rather than scoring it, which is the
     behaviour Build 2 of this branch exists to install). A comment edited into a
     body after that body was applied passes every behavioural gate in the repo
     and is INVISIBLE to schema-drift (signatures only), to the migration hash
     pins (they fire at apply time) and to every behavioural suite. It is also
     exactly the shape of all seven divergences this baseline records. This guard
     is the only thing in the repository that can see it. */
  comment_edited_after_apply: {
    file: '2026-09-02-renown-kill-faucet.sql',
    what: 'a comment is edited into hr_renown_of AFTER the file was applied, so the repo stops '
        + 'describing the body production actually runs. Behaviour is unchanged, so every other '
        + 'guard in this repo stays green',
    expect: 'replay hr_renown_of(p_user uuid, p_slot integer)',
    find: '      -- totalLevel × 2 (sum of every skill level owned)',
    repl: '      -- totalLevel x 2 (sum of every skill level owned) [edited after apply]',
  },
  gate_bucket_added: {
    file: '2026-08-29-rpc-gate-bucket-restore.sql',
    what: 'a rate bucket is edited into hr_rpc_gate in the repo — the b487 root-cause class, and '
        + 'a body EVERY client-callable RPC passes through',
    expect: 'replay hr_rpc_gate(p_bucket text)',
    find: "      v_key    := md5('anon-unkeyed')::uuid;",
    repl: "      v_key    := md5('anon-unkeyed-2')::uuid;",
  },
  new_overload_authored: {
    file: '2026-09-02-renown-kill-faucet.sql',
    what: 'a migration grows an OVERLOAD of a hash-pinned function. Every hash pin in this repo '
        + 'names an exact signature and is structurally blind to it',
    expect: 'replay-extra hr_renown_of(p_user uuid, p_slot integer, p_scale numeric)',
    find: '-- ── 0a. ',
    repl: 'create or replace function public.hr_renown_of(p_user uuid, p_slot int, p_scale numeric)\n'
        + 'returns bigint language sql stable as $ovl$ select 0::bigint $ovl$;\n\n-- ── 0a. ',
  },
};

async function mutate() {
  const base = await loadBaseline();
  const derived = [...(await sweep()).keys()];
  let slipped = 0;
  for (const [id, m] of Object.entries(MUTATIONS)) {
    /* LF, always. bootReplay normalises the migration it reads; .gitattributes
       pins supabase/migrations/** to eol=lf but NOT tests/**, so on a CRLF
       checkout an anchor authored here as a multi-line template would match
       nothing and every mutation would fail to plant. No-op on LF. */
    const lf = (s) => s.replace(/\r\n/g, '\n');
    const patches = new Map([[m.file, [[lf(m.find), lf(m.repl)]]]]);
    let got = [];
    try {
      const { rows } = await measureReplay(patches);
      got = classifyReplay(rows, base, derived).findings;
    } catch (e) {
      if (e.harness && !e.replay) { console.error(`HARNESS  ${id}: ${e.message}`); process.exit(2); }
      // A file that stops APPLYING is a catch too, but not the one written down.
      console.error(`  ✗  ${id} — the mutated chain failed to REPLAY (${String(e.message).split('\n')[1] || e.message}).\n`
        + `     Expected the guard to report "${m.expect}". A replay failure is a different\n`
        + '     guard catching it, and proves nothing about this one.');
      slipped += 1; continue;
    }
    const hit = got.find((f) => f.key === m.expect);
    if (hit) console.log(`  ok  ${id.padEnd(24)} ${hit.key}\n       ${m.what}`);
    else {
      console.error(`  ✗  ${id} — expected "${m.expect}"; got: ${got.map((f) => f.key).join(', ') || '(nothing)'}\n       ${m.what}`);
      slipped += 1;
    }
  }
  if (slipped) { console.error(`\n${slipped} planted defect(s) slipped past the guard.`); process.exit(1); }
  console.log(`\nall ${Object.keys(MUTATIONS).length} defects planted in the real migration text were caught`);
}

// ════════════════════════════════════════════════════════════════════════
// --write: re-seed the baseline. A DELIBERATE ACT — the diff is the record.
// ════════════════════════════════════════════════════════════════════════
async function write() {
  let prev = { functions: [] };
  try { prev = JSON.parse(await readFile(BASELINE, 'utf8')); } catch { /* first run */ }
  const prevBy = new Map(prev.functions.map((e) => [e.sig, e]));
  const tracked = await sweep();
  const names = [...tracked.keys()];

  const { rows: repRows, ms } = await measureReplay();
  censusOk(repRows, 'replay');
  const rep = asMap(repRows);

  let live = null;
  if (!argv.includes('--no-live')) {
    live = asMap(readRows(await fetchLive(bodyQuery(names))));
  }

  const today = new Date().toISOString().slice(0, 10);
  const sigs = new Set([...rep.keys(), ...(live ? live.keys() : [])]);
  const functions = [];
  const moved = [];
  for (const sig of [...sigs].sort()) {
    const name = sig.split('(')[0];
    const r = rep.get(sig);
    const p = live ? live.get(sig) : (prevBy.get(sig) || {}).live;
    const old = prevBy.get(sig);
    const t = tracked.get(name) || { rules: new Set(['floor']), files: new Set() };
    const liveBlock = live
      ? (p ? { md5: p.body_md5, norm_len: p.norm_len, measured: today, source: 'measured-live', ...(p.mojibake ? { mojibake: true } : {}) } : null)
      : (old ? old.live : null);
    if (old && liveBlock && old.live && old.live.md5 !== liveBlock.md5) moved.push(`${sig}  live ${old.live.md5} -> ${liveBlock.md5}`);
    if (old && r && old.replay.md5 !== r.body_md5) moved.push(`${sig}  replay ${old.replay.md5} -> ${r.body_md5}`);
    const entry = {
      sig,
      name,
      tracked_by: [...t.rules].sort(),
      touched_by: [...t.files].sort(),
      live: liveBlock,
      replay: r ? { md5: r.body_md5, norm_len: r.norm_len, source: 'computed-from-replay' } : null,
    };
    const agree = !!(entry.live && entry.replay && entry.live.md5 === entry.replay.md5);
    entry.agree = agree;
    if (!agree) {
      const carry = old && old.why && old.live && entry.live && old.live.md5 === entry.live.md5
        && old.replay && entry.replay && old.replay.md5 === entry.replay.md5 ? old.why : null;
      entry.why = carry || `REVIEW ${today}: live and replay disagree and nobody has said why. `
        + 'Strip comments from both bodies and diff them; write what actually differs here. '
        + 'The guard is RED until this sentence is real.';
    }
    functions.push(entry);
  }

  const out = {
    _readme: [
      'WHAT THE REPO BELIEVES IS DEPLOYED, as a measured fact rather than as prose.',
      'One entry per function whose live body this repo has an opinion about — every',
      'hash-pinned / programmatically-patched body (derived by sweep() in',
      'tests/live-hash-drift.mjs), every body three or more migrations restate, and',
      'the program floor. `live` is what production ACTUALLY had when it was last',
      'measured; `replay` is what supabase/schema.sql + supabase/migrations/**',
      'rebuild to. Both hashes are',
      "  md5(regexp_replace(pg_get_functiondef(oid), '[[:space:]]+', ' ', 'g'))",
      "computed IN SQL on each side — POSIX class, never '\\s+' (the two runtimes",
      'disagree about backslash classes; measured 2026-08-29).',
      '',
      'THIS FILE IS THE DEPLOYMENT RECORD. Its diff is how a reviewer sees that a',
      'body on production moved. Regenerate ONLY with --live --write, and only when',
      'the change was intended. Never edit a hash by hand to make a build green —',
      'a red hash is the check working.',
    ],
    generated: new Date().toISOString().slice(0, 10),
    project: PROJECT,
    postgres: { production: '17.x', replay: 'PGlite (PG18) — see tests/schema-replay.mjs' },
    normalisation: "md5(regexp_replace(pg_get_functiondef(oid), '[[:space:]]+', ' ', 'g'))",
    live_measured: live ? new Date().toISOString().slice(0, 10) : (prev.live_measured || null),
    replay_ms: ms,
    counts: { tracked_names: names.length, entries: functions.length },
    functions,
  };
  await writeFile(BASELINE, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`baseline written: ${functions.length} entries over ${names.length} tracked names`);
  console.log(`  agree live==replay: ${functions.filter((e) => e.agree).length}`);
  console.log(`  divergent:          ${functions.filter((e) => !e.agree).length}`);
  console.log(`  absent on prod:     ${functions.filter((e) => !e.live).length}`);
  if (moved.length) {
    console.log('\n⚠ HASHES MOVED SINCE THE LAST BASELINE — every one of these is a deploy or a');
    console.log('  repo edit, and each needs a reason in the commit message:');
    for (const m of moved) console.log(`    ${m}`);
  }
}

// ════════════════════════════════════════════════════════════════════════
function report(findings, label) {
  for (const f of findings) console.error(`  ${label} ${f.key}\n      ${f.detail}`);
}

async function main() {
  if (argv.includes('--list')) {
    const tracked = await sweep();
    console.log(`${tracked.size} tracked function names:\n`);
    for (const [n, t] of [...tracked].sort()) {
      console.log(`${n.padEnd(34)} ${[...t.rules].sort().join('+')}`);
    }
    console.log('\nrules:');
    for (const [k, v] of Object.entries(RULES)) console.log(`  ${k.padEnd(7)} ${v}`);
    return;
  }
  const cdAt = argv.indexOf('--codediff');
  if (cdAt !== -1) { await codeDiff(argv[cdAt + 1] && !argv[cdAt + 1].startsWith('--') ? argv[cdAt + 1] : null); return; }
  if (argv.includes('--selftest')) { await selftest(); return; }
  if (argv.includes('--mutate')) { await mutate(); return; }
  if (argv.includes('--write')) { await write(); return; }

  if (argv.includes('--live-sql')) {
    console.log(bodyQuery([...(await sweep()).keys()]));
    return;
  }

  const cmpAt = argv.indexOf('--live-compare');
  if (cmpAt !== -1 || argv.includes('--live')) {
    const base = await loadBaseline();
    let rows;
    if (cmpAt !== -1) {
      const file = argv[cmpAt + 1];
      if (!file) throw harness('--live-compare needs the JSON produced by running --live-sql on production');
      rows = readRows(JSON.parse(await readFile(file, 'utf8')));
    } else {
      rows = readRows(await fetchLive(bodyQuery([...(await sweep()).keys()])));
    }
    censusOk(rows, 'live');
    const { findings, checked } = classifyLive(rows, base);
    console.log(`live-hash-drift: ${checked} tracked bodies compared against production `
      + `(baseline measured ${base.live_measured}).`);
    if (!findings.length) {
      console.log('OK — every tracked production body is the one this repo believes is deployed.');
      return;
    }
    report(findings, 'RED ');
    console.error(`\n${findings.length} divergence(s) between production and the repo's recorded belief.`);
    console.error('This is the check working. Diff the body, decide which side is right, then');
    console.error('re-measure with  node tests/live-hash-drift.mjs --live --write  so the');
    console.error('baseline diff records the deploy. Do not edit a hash to make this pass.');
    process.exit(1);
  }

  // ── the credential-free half (CI) ────────────────────────────────────────
  const base = await loadBaseline();
  const derived = [...(await sweep()).keys()];
  const { rows, ms } = await measureReplay();
  censusOk(rows, 'replay');
  const { findings } = classifyReplay(rows, base, derived);

  console.log(`live-hash-drift: ${derived.length} tracked names, ${base.functions.length} baselined `
    + `bodies, replayed in ${(ms / 1000).toFixed(1)}s`);
  if (findings.length) {
    report(findings, 'RED ');
    console.error(`\n${findings.length} problem(s). The repo no longer matches its own record of`);
    console.error('what is deployed. Re-measure with --live --write if the change shipped.');
    process.exit(1);
  }
  const div = base.functions.filter((e) => !e.agree && e.live);
  const absent = base.functions.filter((e) => !e.live);
  console.log('OK — the repo chain rebuilds to every body the baseline records.');
  console.log(`  ${base.functions.length - div.length - absent.length} bodies are byte-identical live vs replay`);
  if (div.length) {
    console.log(`  ${div.length} explained divergence(s):`);
    // First sentence only — the full reason lives in the baseline, which is the
    // reviewable artefact. A CI log nobody reads is not documentation.
    for (const e of div) console.log(`    · ${e.name.padEnd(30)} ${String(e.why).replace(/^VERIFIED[^:]*:\s*/, '').split('. ')[0].slice(0, 110)}`);
  }
  if (absent.length) {
    console.log(`  ${absent.length} recorded as NOT on production:`);
    for (const e of absent) console.log(`    · ${e.sig} — ${e.why || '(no reason recorded)'}`);
  }
  const age = base.live_measured
    ? Math.round((Date.now() - Date.parse(base.live_measured)) / 86400000) : null;
  console.log(`\nproduction was last MEASURED ${base.live_measured} (${age} days ago). This run did`);
  console.log('NOT re-check it — a credential-free replay cannot see a live body. Before any');
  console.log('migration, restore or cutover step, run:  node tests/live-hash-drift.mjs --live');
  if (age !== null && age > 14) {
    console.log('\n  ⚠ That measurement is over 14 days old. A stale measurement is not a pass.');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)
    || process.argv[1]?.endsWith('live-hash-drift.mjs')) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(e.harness ? 2 : 1);
  });
}
