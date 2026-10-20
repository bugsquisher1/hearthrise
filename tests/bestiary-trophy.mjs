#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bestiary-trophy.mjs — THE DORMANT TROPHY CLAIM: CLAIMED ONCE, MINTS
// NOTHING, TRUSTS NO CLIENT COUNT.
//
//   node tests/bestiary-trophy.mjs             the guard (wire arm + SQL arm)
//   node tests/bestiary-trophy.mjs --pure      the wire arm only (no pglite)
//   node tests/bestiary-trophy.mjs --report    print what it measured, gate too
//   node tests/bestiary-trophy.mjs --selftest  mutation proof: each defect caught
//
// ── WHAT IS LEFT, AND WHY (2026-10-19) ─────────────────────────────────────
// Tyler's account bestiary (src/data/bestiary-stages.js, 2026-10-28-bestiary-
// account.sql, tests/bestiary-account.mjs) replaced the per-character trophy
// ladder: src/data/bestiary.js, bestiary-charms.js, src/core/trophies.js and
// charms.js are deleted, and with them this file's pure ladder arm (T1-T8). The
// SERVER half of the old claim is still installed and still reachable by the
// engine's dormant `trophy_claim` verb (hr_trophy_claim, hr_trophy_of,
// hr-accrue/trophy-claim.js; no client sends it) until the edge lane retires
// the verb and a migration drops the two functions. Until then this keeps
// guarding it: its ladder now lives only in its own SQL (`c_at`), read out of
// the migration, and:
//   THE WIRE ARM — T9 the wire's stage bound equals that ladder's length, T10
//   a forged count has nowhere to travel, T11 the verb's registry row;
//   THE SQL ARM (a real PostgreSQL, via tests/schema-replay.mjs) —
//   hr_trophy_claim refuses below the threshold, refuses a second claim, writes
//   exactly one progress row and exactly one ledger row, and cannot be told a
//   kill count because its signature has nowhere to put one.
//
// ── WHY THE SQL ARM EXISTS AT ALL, GIVEN §5 OF THE MIGRATION ────────────────
// 2026-09-22-trophy-claim.sql asserts these properties in its own self-check
// and tests/schema-drift.mjs executes that on every replay. What this file adds
// is the thing a self-check structurally cannot do: it MUTATES the migration
// and requires each defect to be caught.
// Exit: 0 green · 1 a finding · 2 harness (a module would not load, pglite is
// absent, or --selftest could not plant a defect).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readTrophy } from '../supabase/functions/hr-accrue/request.js';
import { resolveTrophyClaim } from '../supabase/functions/hr-accrue/trophy-claim.js';
import { INTENT_REGISTRY } from '../supabase/functions/hr-accrue/intents.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CLAIM_SQL_FILE = join(ROOT, 'supabase', 'migrations', '2026-09-22-trophy-claim.sql');

/* player_progress.key is `check (length(key) between 1 and 64)`. */
const KEY_MAX = 64;
/* The chain name tests/schema-apply-order.json gives the file under test. */
const CLAIM_FILE = '2026-09-22-trophy-claim.sql';


/* An RPC answer, reduced to the fact a finding is about. A successful claim
   returns the WHOLE hr_state_of envelope — every skill, the bag, the farm — and
   a message that printed it would bury the verdict under a character sheet. */
const verdict = (r) => JSON.stringify({
  ok: r?.ok, error: r?.error, replayed: r?.replayed, detail: r?.detail, claimed: r?.claimed,
});
/* The dormant claim's row key, as hr_trophy_of splits it back (split_part(key, ':', 2|3)). */
const trophyKey = (monsterId, stage) => `trophy:${monsterId}:${stage}`;

// ════════════════════════════════════════════════════════════════════════
// THE WIRE ARM — over an INJECTABLE world so a mutation can be planted and the
// NAMED assertion required to be the one that reports it.
// ════════════════════════════════════════════════════════════════════════

/** The world the wire assertions read: the SQL ladder and the wire's stage bound, both read off disk. */
function realPureWorld() {
  return { sqlThresholds: null, wireMax: -1 };
}

function auditPure(w) {
  const f = [];
  const say = (id, msg) => f.push({ id, msg });

  /* T9 — THE WIRE BOUND AND THE LADDER AGREE. request.js refuses a stage
     outside 1..MAX_TROPHY_STAGE_WIRE so an unbounded integer never reaches a
     `::int` cast; if that bound fell BEHIND the claim's own ladder, the top rung
     would be unclaimable and the refusal would read "malformed request". */
  if (w.wireMax !== w.sqlThresholds.length) {
    say('T9', `the wire admits stages 1..${w.wireMax}, but hr_trophy_claim's ladder has ${w.sqlThresholds.length} rungs`);
  }

  /* T10 — A FORGED KILL COUNT HAS NOWHERE TO TRAVEL. The wire's whole
     caller-supplied surface for this verb is `{monster, stage}`: anything else
     in the object is DROPPED by the parser, so a client that sends a count is
     not disbelieved — it is unheard (design §5). Proven on the parser AND on
     the intent's own resolver, because either one could grow a field. */
  {
    const parsed = readTrophy({ trophy: { monster: 'slime', stage: 1, kills: 999999, earned: true, mult: 9 } });
    if (!parsed) {
      say('T10', 'readTrophy refused an otherwise-valid claim that carried extra keys — a forged field must be dropped, not fatal');
    } else {
      for (const k of Object.keys(parsed)) {
        if (k !== 'monster' && k !== 'stage') {
          say('T10', `readTrophy carried "${k}" through to the intent layer — the wire has grown a field the server would have to disbelieve`);
        }
      }
    }
    const resolved = resolveTrophyClaim({ monster: 'slime', stage: 1, kills: 999999 });
    if (!resolved.ok) {
      say('T10', 'resolveTrophyClaim refused a valid claim carrying an extra key');
    } else {
      for (const k of Object.keys(resolved.claim)) {
        if (k !== 'monster' && k !== 'stage') {
          say('T10', `the intent forwards "${k}" to the commit statement — a client value reaching the claim decision`);
        }
      }
    }
    /* …and the STAGE is never rounded into range. A parser that rounded would
       turn a garbage request into a claim for a trophy nobody asked for. */
    for (const bad of [0, 5, 1.5, -1, '1', null, undefined, NaN]) {
      if (readTrophy({ trophy: { monster: 'slime', stage: bad } }) !== null) {
        say('T10', `readTrophy accepted stage ${String(bad)} — an out-of-range or non-integer stage must refuse the whole gesture`);
      }
    }
  }

  /* T11 — THE VERB'S REGISTRY ROW. `collectsFirst:false` is derived (the verb
     builds no delta, so there is no key that could stamp `accrued_to`), and the
     bucket must be one that already exists in hr_rate_gate's frozen `case` —
     a row naming an unknown bucket is a verb that 429s forever. */
  {
    const row = INTENT_REGISTRY.trophy_claim;
    if (!row) {
      say('T11', 'trophy_claim has no INTENT_REGISTRY row — the verb cannot be rate-gated and fails closed');
    } else {
      if (row.needsKey !== true) say('T11', 'trophy_claim does not require an idempotency key — a double-click would be a second claim attempt');
      if (row.collectsFirst !== false) say('T11', 'trophy_claim is marked collectsFirst — it proposes no delta, so collecting first costs a round trip and buys nothing');
      const buckets = new Set(Object.values(INTENT_REGISTRY).map((r) => r.bucket));
      if (!buckets.has(row.bucket)) say('T11', `trophy_claim names bucket "${row.bucket}", which no other verb uses — hr_rate_gate's case is frozen and an unknown bucket fails closed`);
    }
  }

  return f;
}

// ── The wire arm's mutations ─────────────────────────────────────────────
const PURE_MUTATIONS = [
  ['T9', 'the wire bound falls behind the ladder',
    (w) => { w.wireMax = w.sqlThresholds.length - 1; }],
];

/* NEGATIVE CONTROL — a change that must stay SILENT. */
const PURE_NEGATIVE = [
  ['a rung of the SQL ladder is re-priced (the count, not the length)', (w) => { w.sqlThresholds[0] += 1; }],
];

function mutantPureWorld(plant, base) {
  const w = base || realPureWorld();
  plant(w);
  return w;
}

// ════════════════════════════════════════════════════════════════════════
// THE SQL ARM — a real PostgreSQL, the real chain, the real RPC.
// ════════════════════════════════════════════════════════════════════════

const PROBE = '00000000-0000-4000-c000-770f180a3333';
const OTHER = '00000000-0000-4000-c000-770f180a4444';

/** One statement, rows out. `db.query` is pglite's parameterised path. */
async function q(db, sql, params = []) {
  const r = await db.query(sql, params);
  return r.rows || [];
}

/**
 * Drive the real RPC against a probe character and return the findings.
 *
 * ⚠ EVERY ROW THIS TOUCHES IS ONE IT CREATED, under two uuids nothing else
 *   holds — the same rule the migrations' self-checks follow, for the same
 *   reason (tests/selfcheck-no-global-dml.mjs, the 2026-09-19 incident). It
 *   runs against a throwaway in-process database either way, but a harness that
 *   learned a different habit is a harness somebody copies.
 */
async function auditSql(db) {
  const f = [];
  const say = (id, msg) => f.push({ id, msg });
  const [{ activity_id: mon }] = await q(db,
    `select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1`);
  const first = (await withSqlThresholds(realPureWorld())).sqlThresholds[0];

  await q(db, `select set_config('request.jwt.claim.sub', $1, false)`, [PROBE]);
  await q(db, `insert into auth.users (id) values ($1) on conflict (id) do nothing`, [PROBE]);
  await q(db, `select public.hr_create_character(0)`);

  const claim = async (user, monster, stage, idem) => {
    const rows = await q(db,
      `select public.hr_trophy_claim($1::uuid, 0, $2::text, $3::int, $4::text) as res`,
      [user, monster, stage, idem]);
    return rows[0].res;
  };
  const uuid = () => crypto.randomUUID();
  const counts = async (user) => {
    const [p] = await q(db,
      `select count(*)::int as n from public.player_progress
        where user_id = $1 and kind = 'collection' and key like 'trophy:%'`, [user]);
    const [l] = await q(db,
      `select count(*)::int as n from public.player_ledger
        where user_id = $1 and intent = 'trophy_claim'`, [user]);
    return { progress: p.n, ledger: l.n };
  };

  /* S1 — AN UNKNOWN MONSTER IS REFUSED, NEVER INSERTED. Inventing a monster
     from a client string is how a capability becomes forgeable from a stale
     save (design §4.2(2)). */
  {
    const r = await claim(PROBE, 'not_a_monster_at_all', 1, uuid());
    if (r?.ok !== false || r?.error !== 'unknown_monster') {
      say('S1', `an unknown monster was answered ${verdict(r)}, expected unknown_monster`);
    }
    if ((await counts(PROBE)).progress !== 0) say('S1', 'an unknown monster still wrote a trophy row');
  }

  /* S2 — BELOW THE THRESHOLD IS `not_yet`, AND NOTHING IS WRITTEN. One kill
     short, so the refusal is about the ladder and not about an empty counter. */
  await q(db,
    `insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
     values ($1, 0, 'stat', 'ev:kill_monster:' || $2, '', $3, 'active')
     on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value`,
    [PROBE, mon, first - 1]);
  {
    const r = await claim(PROBE, mon, 1, uuid());
    if (r?.ok !== false || r?.error !== 'not_yet') {
      /* `verdict`, not the whole answer: a successful claim returns the entire
         hr_state_of envelope, and a finding that printed it would bury the one
         fact the reader needs under a character sheet. */
      say('S2', `a claim at ${first - 1} kills was answered ${verdict(r)}, expected not_yet`);
    }
    /* THE REFUSAL STATES THE SERVER'S OWN COUNT, which is how a client whose
       idea of the number ran ahead reconciles instead of arguing (CLAUDE.md §6). */
    if (Number(r?.detail?.have) !== first - 1 || Number(r?.detail?.need) !== first) {
      say('S2', `the not_yet refusal did not state the server's count: ${JSON.stringify(r?.detail)}`);
    }
    const c = await counts(PROBE);
    if (c.progress !== 0 || c.ledger !== 0) {
      say('S2', `a refused claim wrote ${c.progress} progress row(s) and ${c.ledger} ledger row(s)`);
    }
  }

  /* S3 — A FORGED KILL COUNT CANNOT TRAVEL. The RPC's signature has five
     parameters and none of them is a count, so the executable statement of
     "ignored" is that the SAME refusal stands until the SERVER's own counter
     moves — and then the identical call succeeds. */
  {
    const [sig] = await q(db,
      `select pg_get_function_identity_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'hr_trophy_claim'`);
    if (/kill|count|value|qty|amount/i.test(String(sig?.args ?? ''))) {
      say('S3', `hr_trophy_claim's signature has grown a count-shaped parameter: ${sig.args} — a client number can now reach the claim decision`);
    }
    await q(db,
      `update public.player_progress set value = $3
        where user_id = $1 and slot = 0 and kind = 'stat' and period_key = ''
          and key = 'ev:kill_monster:' || $2`, [PROBE, mon, first]);
    const r = await claim(PROBE, mon, 1, '22222222-2222-4222-8222-222222222222');
    if (r?.ok !== true) {
      say('S3', `the claim at exactly ${first} kills was refused: ${verdict(r)}`);
    }
    if (Number(r?.claimed?.kills_at_claim) !== first) {
      say('S3', `the receipt reports kills_at_claim ${r?.claimed?.kills_at_claim}, but the server's counter reads ${first} — the receipt is not built from what was read`);
    }
  }

  /* S4 — EXACTLY ONE PROGRESS ROW AND EXACTLY ONE LEDGER ROW. The journal is
     append-only and a trophy is once-ever, so "one" is the whole contract. */
  {
    const c = await counts(PROBE);
    if (c.progress !== 1) say('S4', `a successful claim wrote ${c.progress} progress rows, expected 1`);
    if (c.ledger !== 1) say('S4', `a successful claim wrote ${c.ledger} ledger rows, expected 1`);
    const [row] = await q(db,
      `select key, value, state from public.player_progress
        where user_id = $1 and kind = 'collection' and key like 'trophy:%'`, [PROBE]);
    if (row?.key !== trophyKey(mon, 1) || Number(row?.value) !== 1 || row?.state !== 'claimed') {
      say('S4', `the trophy row is ${JSON.stringify(row)}, expected key ${trophyKey(mon, 1)} value 1 state claimed`);
    }
    /* THE MULTIPLIER IS NOT STORED. Design §4.1: a stored stage (or rate) is a
       second copy of a derivable fact and a thing that can disagree. */
    const [led] = await q(db,
      `select meta, gold, xp, qty from public.player_ledger
        where user_id = $1 and intent = 'trophy_claim'`, [PROBE]);
    for (const k of ['drop', 'mult', 'multiplier', 'bonus', 'rate']) {
      if (JSON.stringify(led?.meta ?? {}).toLowerCase().includes(k)) {
        say('S4', `the ledger meta stores "${k}" — the multiplier is supposed to be derived on every read, never stored`);
      }
    }
    if (Number(led?.gold) !== 0 || Number(led?.xp) !== 0 || Number(led?.qty) !== 0) {
      say('S4', `the trophy journal moved value: gold ${led?.gold}, xp ${led?.xp}, qty ${led?.qty} — a claim mints nothing`);
    }
  }

  /* S5 — A SECOND CLAIM IS REFUSED, AND IT DOES NOT JOURNAL. Two shapes, kept
     apart on purpose: a NEW key naming a held trophy is `already_owned`; a
     REPLAY of the same key is `replayed`, because a double-click is not an
     error. Both must leave the ledger at one row. */
  {
    const again = await claim(PROBE, mon, 1, uuid());
    if (again?.ok !== false || again?.error !== 'already_owned') {
      say('S5', `a second claim was answered ${verdict(again)}, expected already_owned`);
    }
    const replay = await claim(PROBE, mon, 1, '22222222-2222-4222-8222-222222222222');
    if (replay?.ok !== true || replay?.replayed !== true) {
      say('S5', `a replay of the ORIGINAL key was answered ${JSON.stringify({ ok: replay?.ok, error: replay?.error })}, expected ok with replayed:true`);
    }
    const c = await counts(PROBE);
    if (c.progress !== 1 || c.ledger !== 1) {
      say('S5', `after a second claim and a replay the character holds ${c.progress} trophy row(s) and ${c.ledger} ledger row(s), expected 1 and 1`);
    }
  }

  /* S6 — THE PROJECTION IS PARSED AND SCOPED. It must read the key back to
     (monster, stage), exclude a non-trophy collection row, and show a second
     character nothing — a trophy is not a public fact about somebody else. */
  {
    await q(db,
      `insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
       values ($1, 0, 'collection', 'hunter10', '', 1, 'claimed')
       on conflict (user_id, slot, kind, key, period_key) do nothing`, [PROBE]);
    const rows = await q(db, `select monster_id, stage from public.hr_trophy_of($1::uuid, 0)`, [PROBE]);
    if (rows.length !== 1 || rows[0].monster_id !== mon || Number(rows[0].stage) !== 1) {
      say('S6', `hr_trophy_of returned ${JSON.stringify(rows)}, expected exactly [{${mon}, 1}] — a decoy collection row leaked, or the key did not parse`);
    }
    await q(db, `select set_config('request.jwt.claim.sub', $1, false)`, [OTHER]);
    await q(db, `insert into auth.users (id) values ($1) on conflict (id) do nothing`, [OTHER]);
    await q(db, `select public.hr_create_character(0)`);
    const theirs = await q(db, `select 1 from public.hr_trophy_of($1::uuid, 0)`, [OTHER]);
    if (theirs.length !== 0) {
      say('S6', `a second character read ${theirs.length} trophies that are not theirs`);
    }
    const r = await claim(OTHER, mon, 1, uuid());
    if (r?.ok !== false || r?.error !== 'not_yet') {
      say('S6', `a second character's claim was answered ${verdict(r)} — it read the FIRST character's counter`);
    }
  }

  /* S7 — THE GRANTS. hr_engine only, and ABSENT from the client RPC baseline:
     registering an engine-only function on the approved client surface would
     declare a grant nobody granted, and the next "restore the baseline" would
     grant it (design §4.2(1)). */
  {
    for (const fn of ['public.hr_trophy_claim(uuid,integer,text,integer,text)',
      'public.hr_trophy_of(uuid,integer)']) {
      for (const role of ['authenticated', 'anon', 'service_role']) {
        const [{ ok }] = await q(db, `select has_function_privilege($1, $2, 'execute') as ok`, [role, fn]);
        if (ok) say('S7', `${role} can execute ${fn} — a second, unfiltered path over every character's trophies`);
      }
      const [{ ok }] = await q(db, `select has_function_privilege('hr_engine', $1, 'execute') as ok`, [fn]);
      if (!ok) say('S7', `hr_engine cannot execute ${fn} — the feature is dead`);
    }
    const [{ n }] = await q(db,
      `select count(*)::int as n from public.hr_client_rpc_baseline
        where proname in ('hr_trophy_claim','hr_trophy_of')`);
    if (n > 0) say('S7', `${n} trophy RPC(s) are registered in hr_client_rpc_baseline — these are engine-only`);
  }

  /* S8 — THE ENVELOPE NO LONGER CARRIES THE TROPHY POPULATION. The
     prerequisite, measured on a character that actually holds one: 108 kill rows
     + up to 432 trophies + the collection log breach hr_state_of's LIMIT 1000,
     and the failure is silent truncation of whatever sorts last (design §6). */
  {
    const [{ state }] = await q(db, `select public.hr_state_of($1::uuid, 0) as state`, [PROBE]);
    const keys = (state?.progress || []).map((r) => r.key);
    if (keys.some((k) => String(k).startsWith('trophy:'))) {
      say('S8', 'a trophy row is still inside hr_state_of\'s generic envelope — the 1000-row cap is unprotected');
    }
    if (!keys.includes('hunter10')) {
      say('S8', 'the collection-log milestone row was excluded too — the exclusion is keying on kind, not on the trophy prefix');
    }
  }

  return f;
}

// ── The SQL arm's mutations ──────────────────────────────────────────────
// Each patches the migration UNDER TEST and names the assertion that must go
// red. A self-check can only prove its own file correct as written; only a
// mutation proves its guards bite.
const SQL_MUTATIONS = [
  ['S2', 'the kill threshold check is removed from hr_trophy_claim',
    ['    if v_kills < v_need then', '    if false then']],
  ['S5', 'the once-guard stops refusing a second claim',
    ['    if v_rows = 0 then\n      perform public.hr_reject(\'already_owned\'',
      '    if false then\n      perform public.hr_reject(\'already_owned\'']],
  ['S1', 'the server-side monster catalogue check is removed',
    ['  if not exists (select 1 from public.hr_activities\n                  where kind = \'combat\' and activity_id = p_monster) then',
      '  if false then']],
  ['S7', 'the claim RPC is granted to authenticated',
    ['grant  execute on function public.hr_trophy_claim(uuid, int, text, int, text) to hr_engine;',
      'grant  execute on function public.hr_trophy_claim(uuid, int, text, int, text) to hr_engine;\ngrant execute on function public.hr_trophy_claim(uuid, int, text, int, text) to authenticated;']],
];

/* ⚠ EVERY SQL MUTATION ALSO DEFEATS THE MIGRATION'S OWN §5 SELF-CHECK, which
   runs inside the same apply and would abort the file before this guard could
   drive it. So the self-check block is removed ALONGSIDE each planted defect —
   the whole `do $mig$ … end $mig$;` that begins with the §5 marker. That is not
   a weakening: §5's job is to stop a broken file from applying to production,
   and this arm's job is to prove the FUNCTION's guards bite, which needs the
   broken file to install. The two are checked in opposite directions and
   tests/schema-drift.mjs runs the unpatched file with its self-check intact on
   every replay. */
async function selfcheckStripPatch() {
  const src = (await readFile(CLAIM_SQL_FILE, 'utf8')).replace(/\r\n/g, '\n');
  const start = src.indexOf('-- ── 5. SELF-CHECK');
  if (start < 0) { const e = new Error('the §5 self-check marker moved in ' + CLAIM_SQL_FILE); e.harness = true; throw e; }
  const block = src.slice(start);
  if (!block.trimEnd().endsWith('end $$;')) {
    const e = new Error('the §5 self-check block does not end where this harness expects'); e.harness = true; throw e;
  }
  return [block, '-- §5 removed by tests/bestiary-trophy.mjs --selftest\n'];
}

async function bootAndAudit(extraPatch) {
  const { bootReplay, LAST_PATCHED } = await import('./schema-replay.mjs');
  const patchList = [];
  if (extraPatch) {
    patchList.push(await selfcheckStripPatch());
    patchList.push(extraPatch);
  }
  const { db, failures } = await bootReplay(
    patchList.length ? { patches: new Map([[CLAIM_FILE, patchList]]), upTo: LAST_PATCHED } : {});
  if (failures && failures.length) {
    const e = new Error(`the chain did not replay: ${failures[0].file}: ${failures[0].error}`);
    e.harness = !extraPatch;   // a PATCHED chain failing to apply is a bad mutation, not a finding
    throw e;
  }
  try { return await auditSql(db); } finally { await db.close?.(); }
}

// ════════════════════════════════════════════════════════════════════════

async function selftest() {
  console.log('── the wire arm ──────────────────────────────────────────────');
  const cleanPure = auditPure(await withSqlThresholds(realPureWorld()));
  if (cleanPure.length) {
    console.error('SELFTEST HARNESS: the CLEAN pure arm is already red, so a caught defect cannot be told from a broken guard.');
    for (const x of cleanPure) console.error(`  ${x.id}  ${x.msg}`);
    process.exit(2);
  }
  console.log('clean arm green (the floor) — planting defects');
  let bad = 0;
  for (const [id, what, plant] of PURE_MUTATIONS) {
    const found = auditPure(mutantPureWorld(plant, await withSqlThresholds(realPureWorld())));
    const byName = found.filter((x) => x.id === id);
    if (!byName.length) {
      console.error(`  ✗ ${id}  ${what} — NOT caught by ${id}`
        + (found.length ? ` (only ${[...new Set(found.map((x) => x.id))].join(',')} fired)` : ' (nothing fired)'));
      bad++;
    } else {
      console.log(`  ✓ ${id}  ${what} — caught: ${byName[0].msg}`);
    }
  }
  for (const [what, plant] of PURE_NEGATIVE) {
    const found = auditPure(mutantPureWorld(plant, await withSqlThresholds(realPureWorld())));
    if (found.length) {
      console.error(`  ✗ NEGATIVE CONTROL "${what}" went red: ${found.map((x) => x.id + ' ' + x.msg).join(' | ')}`);
      bad++;
    } else {
      console.log(`  ✓ NEGATIVE CONTROL "${what}" stayed silent`);
    }
  }

  if (!process.argv.includes('--pure')) {
    console.log('\n── the SQL arm (a real PostgreSQL per mutation) ───────────────');
    const cleanSql = await bootAndAudit(null);
    if (cleanSql.length) {
      console.error('SELFTEST HARNESS: the CLEAN SQL arm is already red.');
      for (const x of cleanSql) console.error(`  ${x.id}  ${x.msg}`);
      process.exit(2);
    }
    console.log('clean SQL arm green (the floor) — planting defects');
    for (const [id, what, patch] of SQL_MUTATIONS) {
      let found;
      try { found = await bootAndAudit(patch); }
      catch (e) {
        if (e.harness) throw e;
        console.log(`  ✓ ${id}  ${what} — caught: the patched chain refused to apply (${e.message})`);
        continue;
      }
      const byName = found.filter((x) => x.id === id);
      if (!byName.length) {
        console.error(`  ✗ ${id}  ${what} — NOT caught by ${id}`
          + (found.length ? ` (only ${[...new Set(found.map((x) => x.id))].join(',')} fired)` : ' (nothing fired)'));
        bad++;
      } else {
        console.log(`  ✓ ${id}  ${what} — caught: ${byName[0].msg}`);
      }
    }
  }

  if (bad) { console.error(`\n${bad} mutation(s) unproven.`); process.exit(1); }
  console.log('\nEvery mutation caught by its named assertion, every negative control silent — non-vacuous.');
  process.exit(0);
}

/** Read hr_trophy_claim's own ladder out of the migration, for T8. */
async function withSqlThresholds(w) {
  const src = await readFile(CLAIM_SQL_FILE, 'utf8');
  const m = src.match(/c_at\s+constant\s+bigint\[\]\s*:=\s*array\[([^\]]*)\]/);
  w.sqlThresholds = m ? m[1].split(',').map((s) => Number(s.trim())) : null;
  if (!w.sqlThresholds) {
    const e = new Error('hr_trophy_claim\'s `c_at` ladder could not be read out of ' + CLAIM_SQL_FILE
      + ' — T8 would pass vacuously');
    e.harness = true; throw e;
  }
  const wire = await readFile(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'request.js'), 'utf8');
  const mw = wire.match(/MAX_TROPHY_STAGE_WIRE\s*=\s*(\d+)/);
  w.wireMax = mw ? Number(mw[1]) : -1;
  return w;
}

function report(pure, sql) {
  console.log(`dormant trophy claim: hr_trophy_claim ladder [${pureWorld.sqlThresholds.join(', ')}], wire bound ${pureWorld.wireMax}`);
  console.log(`  wire findings ${pure.length}, sql findings ${sql === null ? 'skipped' : sql.length}`);
}

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) await selftest();

const pureWorld = await withSqlThresholds(realPureWorld());
const pure = auditPure(pureWorld);
const sql = argv.includes('--pure') ? null : await bootAndAudit(null);
if (argv.includes('--report')) report(pure, sql);

const findings = [...pure, ...(sql || [])];
if (findings.length) {
  console.error('bestiary-trophy: RED');
  for (const x of findings) console.error(`  ${x.id}  ${x.msg}`);
  process.exit(1);
}
console.log(`bestiary-trophy: green — the dormant claim's wire carries no count, its bound matches its ladder,`
  + ` and the claim refuses, journals once and mints nothing${sql === null ? ' (SQL arm skipped: --pure)' : ''}.`);
