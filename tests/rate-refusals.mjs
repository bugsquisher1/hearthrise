#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/rate-refusals.mjs — EVERY RATE-LIMITED REFUSAL LEAVES A TRACE, ON A REAL DATABASE.
//
//   node tests/rate-refusals.mjs            the rules, on the whole replayed chain (PGlite, real PostgreSQL)
//   node tests/rate-refusals.mjs --mutate   every planted defect in the migration must be refused, each for its own reason
//
// mutant-anchors: supabase/migrations/2027-04-02-rate-refusals-recorded.sql
//
// supabase/migrations/2027-04-02-rate-refusals-recorded.sql proves its contract inside one
// transaction (its §3, on every replay). This guard plays it the way a client does: call by
// call on a committed database, as `authenticated`, and it reads the WHOLE chain's end, so a
// later file that restates one of the 25 verbs from an old image and loses its recorder line
// is red here by name (a self-check that tests only its own file cannot see that).
//   RJ-1  THE CLASS, OVER EVERY FUNCTION THE CHAIN ENDS WITH: no `if not hr_rate_ok(...) ... end if;`
//         answers without hr_rate_refused, hr_record_rejection or the Game Master journal, and
//         each hr_rate_refused is told the user, bucket, limit and window its hr_rate_ok was asked
//   RJ-2  A VERB WITH NO SLOT (hr_whispers_recent, 20 a minute): 20 answered and nothing written;
//         the 21st refused in the same words as before and ONE row (n 1, slot -1, the bucket named);
//         refusals 2 to 9 over write nothing (sampled, S6); the 10th carries its gap (n 10); the
//         50th makes the day's row an incident (C2: sustained rate limiting is the signal)
//   RJ-3  A VERB WITH A SLOT (hr_chat_recent): the row is the hero's slot
//   RJ-4  THE CRIER'S THREE BUCKETS: asked in order with a short-circuit, journalled under the
//         bucket that refused
//   RJ-5  THE ACCEPTED PATH IS WHAT IT WAS: the same calls answered on the chain before the file
//         and after it are the same answers
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';
import { bootLane } from './_server-debt.mjs';

const FILE = '2027-04-02-rate-refusals-recorded.sql';
const PREV = '2027-03-26-signout-presence.sql';
const U = (i) => '000000c0-0000-4000-a000-00402a' + String(i).padStart(6, '0');

/* As `authenticated`, each call its OWN transaction: the real clock moves between calls. */
async function as(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally { await db.exec('reset role'); }
}
const rows = async (db, sql, params) => (await db.query(sql, params)).rows;

async function person(db, i) {
  const uid = U(i);
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query('insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name', [uid, 'Rate Probe ' + i]);
  await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'rate-refusals test') on conflict (user_id) do nothing", [uid]);
  const c = await as(db, uid, 'select public.hr_create_character(0)');
  if (!c || c.ok !== true) throw new Error('HARNESS: hr_create_character refused: ' + JSON.stringify(c));
  return uid;
}
const journal = (db, uid) => rows(db, "select slot, code, severity, intent, n::int as n, verbs, last_detail from public.hr_rejections where user_id = $1 and code = 'rate_limited' order by slot", [uid]);

/* The lint's reading of one body (tests/run-sql-tests.mjs PART 1c-iii), on what the database holds. */
const splitArgs = (s) => {
  const out = []; let depth = 0, q = false, cur = '';
  for (const ch of s) {
    if (ch === "'") q = !q;
    if (!q && (ch === '(' || ch === '[')) depth++;
    if (!q && (ch === ')' || ch === ']')) depth--;
    if (!q && depth === 0 && ch === ',') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((a) => a.replace(/\s+/g, ' ').trim());
};

export async function rules(db) {
  const fails = [];
  const no = (m) => fails.push(m);

  // RJ-1 ─ the class, over the chain's end
  const fns = await rows(db, "select p.proname::text as fn, p.prosrc as src from pg_proc p where p.pronamespace = 'public'::regnamespace");
  let blocks = 0, told = 0;
  for (const { fn, src } of fns) {
    const code = src.replace(/\r/g, '').split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
    for (const m of code.matchAll(/if\s+not\s+public\.hr_rate_ok\([\s\S]*?end if;/gi)) {
      blocks++;
      const t = m[0].match(/public\.hr_rate_refused\(([^;]*)\)\s*;/i);
      if (t) {
        told++;
        const asked = splitArgs((m[0].match(/hr_rate_ok\(([\s\S]*?)\)\s*then/i) || [null, ''])[1]);
        const a = splitArgs(t[1]);
        if (a.length !== 5 || asked.length !== 4 || a[0] !== asked[0] || a[2] !== asked[1] || a[3] !== asked[2] || a[4] !== asked[3]) {
          no(`RJ-1: ${fn}() records (${a.join(', ')}) for a refusal of (${asked.join(', ')})`);
        }
        continue;
      }
      if (/hr_record_rejection|hr_gm_close\(/.test(m[0])) continue;
      if (fn === 'hr_gm_stop_result' && /^if\s+not\s+public\.hr_rate_ok\([^;]*\)\s*then\s+return;\s*end if;$/i.test(m[0])) continue;
      no(`RJ-1: ${fn}() refuses a rate limit and records nothing: ${m[0].replace(/\s+/g, ' ').slice(0, 120)}`);
    }
  }
  if (blocks < 40 || told < 29) no(`RJ-1: only ${blocks} rate refusals and ${told} recorder calls were read (wanted at least 40 and 29): the scan is not reading the bodies`);

  // RJ-2 ─ a verb with no slot, sampled, escalating
  const a = await person(db, 1);
  let v;
  for (let i = 1; i <= 20; i++) v = await as(db, a, 'select public.hr_whispers_recent()');
  if (!v || v.ok !== true) no('RJ-2: the 20th whisper read in a minute answered ' + JSON.stringify(v));
  if ((await journal(db, a)).length) no('RJ-2: an accepted call wrote a rate_limited row');
  v = await as(db, a, 'select public.hr_whispers_recent()');
  if (JSON.stringify(v) !== JSON.stringify({ ok: false, error: 'rate_limited' })) no('RJ-2: the 21st read answered ' + JSON.stringify(v) + ' (the refusal\'s words moved)');
  let j = await journal(db, a);
  if (j.length !== 1 || j[0].n !== 1 || j[0].slot !== -1 || j[0].intent !== 'social:read' || j[0].severity !== 'normal'
      || !j[0].verbs || j[0].verbs['social:read'] !== 1 || !j[0].last_detail || j[0].last_detail.limit !== 20) {
    no('RJ-2: the first refusal is not one normal row on slot -1 naming its bucket and limit: ' + JSON.stringify(j));
  }
  for (let i = 22; i <= 29; i++) await as(db, a, 'select public.hr_whispers_recent()');
  j = await journal(db, a);
  if (!j[0] || j[0].n !== 1) no('RJ-2: refusals 2 to 9 over the limit wrote the journal (n ' + (j[0] && j[0].n) + '): unsampled, S6');
  await as(db, a, 'select public.hr_whispers_recent()');
  j = await journal(db, a);
  if (!j[0] || j[0].n !== 10) no('RJ-2: the 10th refusal did not carry its gap (n ' + (j[0] && j[0].n) + ', wanted 10)');
  for (let i = 31; i <= 70; i++) await as(db, a, 'select public.hr_whispers_recent()');
  j = await journal(db, a);
  if (j.length !== 1 || j[0].n !== 50 || j[0].severity !== 'incident') no('RJ-2: 50 refusals in a day are not one incident row with n 50: ' + JSON.stringify(j));

  // RJ-3 ─ a verb with a slot
  const b = await person(db, 2);
  for (let i = 1; i <= 31; i++) v = await as(db, b, 'select public.hr_chat_recent(0)');
  if (!v || v.error !== 'rate_limited') no('RJ-3: the 31st chat read in a minute answered ' + JSON.stringify(v));
  j = await journal(db, b);
  if (j.length !== 1 || j[0].slot !== 0 || j[0].n !== 1 || !j[0].verbs || j[0].verbs['chat:read'] !== 1) no('RJ-3: a slotted refusal is not one row on its slot: ' + JSON.stringify(j));

  // RJ-4 ─ the Crier's three buckets, in order, short-circuited
  const c = await person(db, 3);
  await db.query("insert into public.hr_flags (key, enabled, note) values ('town_crier', true, 'rate-refusals test') on conflict (key) do update set enabled = true");
  await db.query("insert into public.hr_rate_counters (user_id, bucket, window_start, n) values ($1, 'chat:burst', now(), 5)", [c]);
  v = await as(db, c, "select public.hr_crier_send(0, 'Fresh pies by the gate', 1, $1::uuid)", [U(900)]);
  if (JSON.stringify(v) !== JSON.stringify({ ok: false, error: 'rate_limited' })) no('RJ-4: a Crier line over chat\'s burst bucket answered ' + JSON.stringify(v));
  const counters = Object.fromEntries((await rows(db, 'select bucket, n::int as n from public.hr_rate_counters where user_id = $1', [c])).map((r) => [r.bucket, r.n]));
  if (counters.crier !== 1 || counters['chat:burst'] !== 6 || 'chat:send' in counters) no('RJ-4: the Crier\'s buckets were not asked in order with a short-circuit: ' + JSON.stringify(counters));
  j = await journal(db, c);
  if (j.length !== 1 || j[0].slot !== 0 || j[0].n !== 1 || !j[0].verbs || j[0].verbs['chat:burst'] !== 1 || 'crier' in j[0].verbs) {
    no('RJ-4: the Crier\'s refusal is not journalled under the bucket that refused: ' + JSON.stringify(j));
  }
  return fails;
}

/* RJ-5: the same accepted calls on the chain BEFORE the file and after it (the file applied to that same database). */
const ACCEPTED = [
  ['hr_whispers_recent', 'select public.hr_whispers_recent()'],
  ['hr_chat_recent', 'select public.hr_chat_recent(0)'],
  ['hr_social_state', 'select public.hr_social_state(0)'],
  ['hr_hero_colors_view', 'select public.hr_hero_colors_view(0)'],
  ['hr_town_sinks_view', 'select public.hr_town_sinks_view(0)'],
  ['hr_town_works_view', 'select public.hr_town_works_view(0)'],
  ['hr_block_set', "select public.hr_block_set('Nobody By That Name', true)"],
  ['hr_inspect', "select public.hr_inspect('Nobody By That Name', 0)"],
];
/* The two asks are seconds apart (the file applies between them): a clock the answer carries is not a difference. A
   timestamp reads 'T', and so does a number within a day of now in epoch milliseconds (hr_town_sinks_view's now_ms). */
const scrub = (v) => JSON.stringify(v, (k, x) => ((typeof x === 'string' && /^\d{4}-\d\d-\d\dT/.test(x))
  || (typeof x === 'number' && Math.abs(x - Date.now()) < 86400000) ? 'T' : x));
async function acceptedPath() {
  const fails = [];
  const { db } = await bootReplay({ upTo: PREV });
  const uid = await person(db, 7);
  const ask = async () => {
    const out = {};
    await db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
    for (const [name, sql] of ACCEPTED) out[name] = scrub(await as(db, uid, sql));
    return out;
  };
  const before = await ask();
  const sql = (await readFile(join(ROOT, 'supabase', 'migrations', FILE), 'utf8')).replace(/\r\n/g, '\n');
  await db.exec(`begin;\n${sql}\ncommit;`);
  const after = await ask();
  for (const [name] of ACCEPTED) {
    if (before[name] === undefined || before[name] !== after[name]) fails.push(`RJ-5: ${name} answered ${after[name]} after the file and ${before[name]} before it`);
    if (/rate_limited/.test(before[name] || '')) fails.push(`RJ-5: ${name} was rate limited in the control (it proves nothing)`);
  }
  if ((await journal(db, uid)).length) fails.push('RJ-5: an accepted call wrote a rate_limited row');
  return fails;
}

/* ── THE MUTANTS: each plants one defect in the migration; the replay (its §3) or a rule must refuse it FOR ITS REASON. ── */
export const MUTANTS = [
  { name: 'a refusal loses its recorder line', file: 'supabase/migrations/' + FILE,
    from: "    perform public.hr_rate_refused(v_uid, p_slot, 'chat:read', 30, interval '1 minute');  -- RATE-JOURNAL\n", to: '',
    expect: '§3(b): hr_chat_recent() still refuses a rate limit without a record' },
  { name: 'the recorder writes every refusal (unsampled)', file: 'supabase/migrations/' + FILE,
    from: '  v_weight := public.hr_rate_sample_weight(public.hr_rate_over(p_user, p_bucket) - greatest(1, coalesce(p_limit, 1)));', to: '  v_weight := 1;',
    expect: 'refusals 2 to 9 over wrote the journal' },
  { name: 'the recorder keeps a client slot as a row key', file: 'supabase/migrations/' + FILE,
    from: "case when p_slot between 0 and 5 then p_slot else -1 end, p_bucket, 'rate_limited'", to: "p_slot, p_bucket, 'rate_limited'",
    expect: 'is not journalled as one normal row naming its bucket' },
  { name: 'a recorder is told another bucket', file: 'supabase/migrations/' + FILE,
    from: "perform public.hr_rate_refused(v_uid, p_slot, 'whisper:send', 20, interval '1 minute');", to: "perform public.hr_rate_refused(v_uid, p_slot, 'whisper:burst', 20, interval '1 minute');",
    expect: '§3(b): hr_whisper_send() records (' },
  { name: 'the recorder is left open to clients', file: 'supabase/migrations/' + FILE,
    from: 'revoke all on function public.hr_rate_refused(uuid, integer, text, integer, interval) from public, anon, authenticated, service_role;', to: '',
    expect: 'can execute hr_rate_refused' },
  { name: 'a restated verb changes more than its marked lines (whisper bodies unmasked)', file: 'supabase/migrations/' + FILE,
    from: "    select jsonb_agg(public.hr_whisper_row(x) || jsonb_build_object('body', public.hr_chat_mask(x.body))\n                     order by x.created_at, x.id) from (\n      select * from public.chat_whispers w\n       where (w.to_id = v_uid or w.from_id = v_uid) and w.created_at >= v_floor",
    to: "    select jsonb_agg(public.hr_whisper_row(x)\n                     order by x.created_at, x.id) from (\n      select * from public.chat_whispers w\n       where (w.to_id = v_uid or w.from_id = v_uid) and w.created_at >= v_floor",
    expect: 'is not this file\'s image' },
];

async function main() {
  /* AN EMPTY EVENT LOOP BEFORE THE VERDICT IS RED: a query that never settles must not let node exit 0 mid-run */
  process.on('beforeExit', () => { console.log('  ✗ rate-refusals stopped before its verdict (a query never settled)'); process.exit(1); });
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  /* ONE MUTANT, IN ITS OWN PROCESS (the parent's --mutate spawns this): exit 0 caught, 10 escaped, 20 a harness fault, 30 the wrong reason */
  if (process.argv.includes('--mutant')) {
    const m = MUTANTS[Number(process.argv[process.argv.indexOf('--mutant') + 1])];
    let fails;
    try { fails = await rules((await bootLane({ upTo: FILE, mutant: m })).db); }
    catch (e) {
      /* a HARNESS fault (the anchor moved, the patch did not land) proves nothing: red, never "caught" */
      if (e && e.harness) { console.log('harness: ' + String(e.message).split('\n')[0]); process.exit(20); }
      fails = ['replay refused it: ' + String(e.message).split('\n')[1]];
    }
    if (!fails.length) { console.log('NOT caught: ' + m.name); process.exit(10); }
    if (!fails.some((f) => f.includes(m.expect))) { console.log('refused for ANOTHER reason (wanted "' + m.expect + '"): ' + fails[0].slice(0, 200)); process.exit(30); }
    console.log(fails.find((f) => f.includes(m.expect)).slice(0, 150));
    process.exit(0);
  }
  if (process.argv.includes('--mutate')) {
    const clean = await rules((await bootLane({ upTo: FILE })).db);
    if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
    console.log('  ✓ clean control green');
    let bad = 0, ran = 0;
    for (const [i, m] of MUTANTS.entries()) {
      if (only && !m.name.includes(only)) continue;
      ran++;
      const r = spawnSync(process.execPath, [join(ROOT, 'tests', 'rate-refusals.mjs'), '--mutant', String(i)], { encoding: 'utf8', timeout: 900000 });
      const said = String(r.stdout || '').trim().split('\n').pop() || String(r.stderr || '').trim().split('\n').pop() || '';
      if (r.status === 0) console.log('  ✓ ' + m.name + ' — caught (' + said + ')');
      else { console.log('  ✗ ' + m.name + ' — ' + (r.status === 10 ? 'NOT caught' : r.status === 30 ? said : 'harness (exit ' + r.status + '): ' + said)); bad++; }
    }
    console.log(bad || !ran ? 'rate-refusals --mutate: ' + bad + ' escaped of ' + ran : 'rate-refusals --mutate: ' + ran + '/' + ran + ' mutants caught');
    if (!ran) bad = 1;
    process.exit(bad ? 1 : 0);
  }
  const { db } = await bootReplay();
  const fails = [...await rules(db), ...await acceptedPath()];
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'rate-refusals: ' + fails.length + ' rule(s) RED'
    : 'rate-refusals: no rate refusal at the chain\'s end goes unrecorded; a refused verb writes one sampled row on its slot, the 50th makes an incident; the Crier\'s buckets keep their order; the accepted path answers as before');
  process.exit(fails.length ? 1 : 0);
}

if (isMain(import.meta.url)) main();
