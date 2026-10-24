#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/server-perf.mjs — EACH HERO HAS ITS OWN ACCRUE BUDGET, THE HUNT ROSTERS
//                         READ THE LIVE PRESENCE STAMP, AND THE CRON DETECTOR
//                         KEEPS PG_CRON'S RUN HISTORY TO A WEEK.
//
//   node tests/server-perf.mjs           # the guard
//   node tests/server-perf.mjs --mutate  # plant each defect, require its named refusal
//
// Ships with supabase/migrations/2027-01-01-server-perf.sql (lane/c-server-perf).
//
// ── THE CLAIMS ─────────────────────────────────────────────────────────
//   G1  ★ THE REGRESSION, EXECUTED on the replayed chain's LAST hr_rate_gate:
//       one account, two heroes. Hero 0 spends its 30 accrue calls and is
//       refused the 31st; hero 1 STILL gets all 30 of its own. On the per-
//       account gate this file replaced, hero 1 got 0 (the shared counter), so
//       this claim is red without the fix. Control: `activity` stays shared.
//   G2  FINAL STATE, CATALOG: both hunt rosters (hr_hunt_roster and the live
//       tick's hr_hunt_roster_sharded) read character_presence and never
//       player_state.last_seen_at; hr_cron_health_ex deletes from
//       cron.job_run_details and logs phase_ms. So a later file restating any
//       of them from an older text is red here, not silent (the file's own §4
//       only runs at its own position).
//   G3  IDEMPOTENT: a second apply of the file moves no definition and no ACL, judged on the chain AS OF
//       this file (the chain before it is append-only). A later file that restates one of its pinned
//       bodies (2027-01-16-cron-health-fast.sql: hr_cron_health_ex) is refused by this file's §0 at the
//       chain END by design — that pin is what makes a re-apply over a moved body fail loudly.
//   --mutate  plants fifteen defects into the migration and requires its §4
//       to refuse each by NAME (an apply that fails for another reason is not a
//       catch).
//
// Exit: 0 green · 1 a finding · 2 a harness problem.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT, LAST_PATCHED } from './schema-replay.mjs';

const OWN = '2027-01-01-server-perf.sql';
const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const problems = [];
const ok = (cond, claim, msg) => { if (!cond) problems.push(claim + ': ' + msg); };

const strip = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((line) => {
  let inStr = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === "'") inStr = !inStr;
    else if (!inStr && line[i] === '-' && line[i + 1] === '-') return line.slice(0, i);
  }
  return line;
}).join('\n');

const A = '000000c0-0000-4000-a000-00005e2f0101';

// ── G1: THE PER-HERO BUDGET, EXECUTED ───────────────────────────────────
async function perHero(db) {
  const one = async (s, p) => (await db.query(s, p)).rows[0];
  await db.query('begin');
  try {
    await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [A]);
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'server-perf G1') on conflict (user_id) do nothing`, [A]);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [A]);
    for (const slot of [0, 1]) {
      const c = (await one('select public.hr_create_character($1) as r', [slot])).r;
      if (!c || !(c.created === true || c.ok === true)) throw Object.assign(new Error('probe hero refused: ' + JSON.stringify(c)), { harness: true });
    }
    await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
    await db.query('delete from public.hr_rate_counters where user_id = $1', [A]);
    const gate = async (slot, bucket) => (await one('select public.hr_rate_gate($1::uuid, $2::int, $3::text) as ok', [A, slot, bucket])).ok;
    let h0 = 0; for (let i = 0; i < 31; i += 1) if (await gate(0, 'accrue')) h0 += 1;
    ok(h0 === 30, 'G1', `hero 0 got ${h0} of 31 accrue calls in a minute, expected exactly 30 (the limit)`);
    let h1 = 0; for (let i = 0; i < 31; i += 1) if (await gate(1, 'accrue')) h1 += 1;
    ok(h1 === 30, 'G1', `after hero 0 spent its 30, hero 1 of the SAME account got ${h1} of 31 accrue calls, expected its own 30 `
      + '(the accrue budget is shared per account again: four heroes queue on one counter row)');
    let a0 = 0; for (let i = 0; i < 30; i += 1) if (await gate(0, 'activity')) a0 += 1;
    const a1 = await gate(1, 'activity');
    ok(a0 === 30 && a1 === false, 'G1', `activity is no longer the account's: hero 0 got ${a0}/30, then hero 1 ${a1 ? 'was allowed' : 'was refused'}`);
    const keys = (await db.query(`select bucket from public.hr_rate_counters where user_id = $1 and bucket like 'accrue%' order by bucket`, [A])).rows.map((r) => r.bucket);
    ok(JSON.stringify(keys) === JSON.stringify(['accrue:0', 'accrue:1']), 'G1', `the accrue counters are [${keys}], expected [accrue:0, accrue:1]`);
  } finally {
    await db.query('rollback');
  }
}

// ── G2 ──────────────────────────────────────────────────────────────────
async function finalState(db) {
  const def = async (sig) => {
    const r = (await db.query(`select replace(pg_get_functiondef(to_regprocedure('${sig}')), chr(13), '') as d`)).rows[0];
    return r && r.d ? strip(r.d) : '';
  };
  for (const sig of ['public.hr_hunt_roster(text,integer,integer)', 'public.hr_hunt_roster_sharded(text,integer,integer)']) {
    const d = await def(sig);
    ok(/public\.character_presence/.test(d), 'G2', `${sig} no longer reads character_presence (every hunter reads as unwatched)`);
    ok(!/last_seen_at/.test(d), 'G2', `${sig} reads player_state.last_seen_at again (nothing writes it since the old client)`);
  }
  const gate = await def('public.hr_rate_gate(uuid,integer,text)');
  ok(gate.includes("v_key := 'accrue:' || p_slot::text;") && gate.includes('public.hr_rate_ok(p_user, v_key, v_limit, v_window)'), 'G2',
    'hr_rate_gate no longer keys the accrue budget per hero');
  const cron = await def('public.hr_cron_health_ex(interval,numeric)');
  ok(/delete from cron\.job_run_details/.test(cron), 'G2', 'hr_cron_health_ex no longer prunes pg_cron\'s run history (it grows ~16k rows a day, scanned twice an hour)');
  ok(/'phase_ms', v_ph/.test(cron), 'G2', 'hr_cron_health_ex no longer logs phase_ms');
}

// ── G3 ──────────────────────────────────────────────────────────────────
async function idempotent(db, text) {
  const look = async () => JSON.stringify((await db.query(`
    select p.oid::regprocedure::text as fn, md5(pg_get_functiondef(p.oid)) as def, p.proacl::text as acl
      from pg_proc p where p.oid in ('public.hr_rate_gate(uuid,integer,text)'::regprocedure,
        'public.hr_hunt_roster(text,integer,integer)'::regprocedure, 'public.hr_hunt_roster_sharded(text,integer,integer)'::regprocedure,
        'public.hr_cron_health_ex(interval,numeric)'::regprocedure)
     order by 1`)).rows);
  const before = await look();
  try { await db.exec(text); } catch (e) { problems.push('G3: the second apply raised: ' + String(e.message).slice(0, 300)); return; }
  ok(await look() === before, 'G3', 'the second apply moved a definition or an ACL');
}

/** The mutation catalogue: each plants one defect in the migration; its §4 must refuse it with `expect`. */
const PRESENCE = "                 case when exists (select 1 from public.character_presence cp\n"
  + "                                    where cp.user_id = h.user_id and cp.slot = h.slot\n"
  + "                                      and cp.seen_at >  now() - interval '75 seconds'\n"
  + "                                      and cp.seen_at <= now() + interval '60 seconds')\n";
const LAST_SEEN = "                 case when coalesce(ps.last_seen_at >  now() - interval '75 seconds'\n"
  + "                                and ps.last_seen_at <= now() + interval '60 seconds', false)\n";
const ROSTER_LEASE = '       and (l.session_id is null or l.lease_until < now() or l.holder = v_holder)\n';
const SHARD_LEASE = '       and (l.session_id is null or l.lease_until < now())\n';
const DUE_HEAD = '       and (h.leave_at is not null or h.change_at is not null or not v_enabled\n'
  + '            or h.settled_to <= now() - v_flush * (\n'
  + '                 -- SERVER-PERF (2027-01-01-server-perf.sql): WATCHED = OPEN IN A CLIENT, the stamp the rebuilt\n'
  + "                 -- client writes (character_presence; hr_frame_wanted's 75 s window, never the future).\n";
const SQL_MUTANTS = [
  { id: 'shared_key', expect: 's1b', why: 'the accrue key is the account\'s again: four heroes share 30 a minute and queue on one row',
    patches: [["    v_key := 'accrue:' || p_slot::text;", '    v_key := p_bucket;']] },
  { id: 'mint_any_slot', expect: 's1e', why: 'any slot gets its own key, existing hero or not: a caller can mint counter rows and budgets',
    patches: [["  if p_bucket = 'accrue' and p_slot is not null\n     and exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then",
      "  if p_bucket = 'accrue' and p_slot is not null then"]] },
  { id: 'activity_per_hero', expect: 's1f', why: 'activity is keyed per hero too, beyond what was measured and decided',
    patches: [["  if p_bucket = 'accrue' and p_slot is not null\n", "  if p_bucket in ('accrue', 'activity') and p_slot is not null\n"],
      ["    v_key := 'accrue:' || p_slot::text;", "    v_key := p_bucket || ':' || p_slot::text;"]] },
  { id: 'journal_wrong_slot', expect: 's1d', why: 'a hero\'s refusal is journalled under slot 0, so the refusals report blames the wrong hero',
    patches: [['    perform public.hr_record_rejection(p_user, coalesce(p_slot, 0), p_bucket,', '    perform public.hr_record_rejection(p_user, 0, p_bucket,']] },
  { id: 'sample_wrong_counter', expect: 's1d', why: 'the sampled record reads the account counter, so a hero\'s refusals are never journalled',
    patches: [['public.hr_rate_over(p_user, v_key)', 'public.hr_rate_over(p_user, p_bucket)']] },
  { id: 'closed_gate_dropped', expect: 's1h', why: 'the closed-mode refusal is gone: a non-admitted account spends the engine',
    patches: [['  if not public.hr_admitted(p_user) then return false; end if;\n', '']] },
  { id: 'client_can_gate', expect: 's0a', why: 'authenticated may execute the gate and name its own limits',
    patches: [['grant execute on function public.hr_rate_gate(uuid, int, text) to hr_engine;',
      'grant execute on function public.hr_rate_gate(uuid, int, text) to hr_engine;\ngrant execute on function public.hr_rate_gate(uuid, int, text) to authenticated;']] },
  { id: 'roster_last_seen', expect: 's2a', why: 'hr_hunt_roster reads the dead last_seen_at again: every hunter is unwatched',
    patches: [[ROSTER_LEASE + DUE_HEAD + PRESENCE, ROSTER_LEASE + DUE_HEAD + LAST_SEEN]] },
  { id: 'roster_stale_window', expect: 's2c', why: 'hr_hunt_roster counts a presence 5 minutes old as watched',
    patches: [[ROSTER_LEASE + DUE_HEAD + PRESENCE, ROSTER_LEASE + DUE_HEAD + PRESENCE.replace("interval '75 seconds'", "interval '5 minutes'")]] },
  { id: 'sharded_last_seen', expect: 's2e', why: 'the live tick\'s roster reads the dead last_seen_at again',
    patches: [[SHARD_LEASE + DUE_HEAD + PRESENCE, SHARD_LEASE + DUE_HEAD + LAST_SEEN]] },
  { id: 'sharded_future_counts', expect: 's2f', why: 'the live tick\'s roster counts a presence stamp from the future as watched',
    patches: [[SHARD_LEASE + DUE_HEAD + PRESENCE, SHARD_LEASE + DUE_HEAD + PRESENCE.replace(" and cp.seen_at <= now() + interval '60 seconds')", ')')]] },
  { id: 'no_cron_retention', expect: 's3a', why: 'pg_cron\'s run history is never pruned again: ~16k rows a day, scanned twice an hour',
    patches: [['        delete from cron.job_run_details d\n         where d.runid >= v_lo and d.runid < least(v_hi, v_lo + c_cron_prune_max);\n', '']] },
  { id: 'retention_eats_window', expect: 's3b', why: 'the prune ignores the 7-day floor and deletes runs (b) still needs',
    patches: [['and d.runid < least(v_hi, v_lo + c_cron_prune_max);', 'and d.runid < v_lo + c_cron_prune_max;']] },
  { id: 'no_phase_log', expect: 's3c', why: 'the run no longer logs where its time went',
    patches: [["    'phase_ms', v_ph, 'cron_pruned'", "    'phase_ms', null, 'cron_pruned'"]] },
  { id: 'prune_uncounted', expect: 's3d', why: 'the prune\'s count is not logged, so retention can stop silently',
    patches: [['        get diagnostics v_pruned = row_count;\n', '']] },
];

async function main() {
  const own = (await readFile(join(ROOT, 'supabase', 'migrations', OWN), 'utf8')).replace(/\r\n/g, '\n');
  let db;
  try { ({ db } = await bootReplay({})); } catch (e) {
    console.error('harness: the chain does not replay: ' + ((e && e.message) || e));
    process.exit(2);
  }
  try { await perHero(db); } catch (e) {
    if (e && e.harness) { console.error('harness: ' + e.message); process.exit(2); }
    problems.push('G1: ' + String((e && e.message) || e).slice(0, 300));
  }
  await finalState(db);
  let own_db;
  try { ({ db: own_db } = await bootReplay({ upTo: OWN })); } catch (e) {
    console.error('harness: the chain does not replay up to ' + OWN + ': ' + ((e && e.message) || e));
    process.exit(2);
  }
  await idempotent(own_db, own);

  if (MUTATE) {
    let bad = 0;
    for (const m of SQL_MUTANTS) {
      const stale = m.patches.find(([from]) => own.split(from).length !== 2);
      if (stale) { bad += 1; console.error('  ✗ ' + m.id + ': anchor matched ' + (own.split(stale[0]).length - 1) + ' times — the guard is stale'); continue; }
      let verdict = 'APPLIED';
      try {
        await bootReplay({ patches: new Map([[OWN, m.patches]]), upTo: LAST_PATCHED });
      } catch (e) {
        verdict = String((e && e.message) || e);
        if (e && e.harness) { console.error('  ✗ ' + m.id + ': harness — ' + verdict.split('\n')[0]); bad += 1; continue; }
      }
      const caught = verdict !== 'APPLIED' && new RegExp('\\b' + m.expect + '\\b').test(verdict);
      if (caught) console.log('  ✓ ' + m.id + ' refused by §4 ' + m.expect + ' — ' + m.why);
      else { bad += 1; console.error('  ✗ ' + m.id + ' NOT refused by §4 ' + m.expect + ' (' + verdict.split('\n')[0].slice(0, 240) + ')'); }
    }
    if (bad) { console.error('server-perf --mutate: ' + bad + ' defect(s) not caught'); process.exit(1); }
  }

  if (problems.length) { for (const p of problems) console.error('  ✗ ' + p); process.exit(1); }
  console.log('server-perf: OK — each hero has its own accrue budget (activity stays the account\'s), both hunt rosters read the '
    + 'live presence stamp, and the cron detector keeps a week of run history' + (MUTATE ? '; every planted defect refused by name.' : '.'));
  process.exit(0);
}

main().catch((e) => { console.error('harness: ' + ((e && e.stack) || e)); process.exit(2); });
