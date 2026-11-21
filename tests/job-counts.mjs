#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/job-counts.mjs — EVERY JOB TAKES A COUNT AND A "THEN", AND THE SERVER ENDS IT AT THE COUNT, WINDOW OPEN OR BROWSER
//   CLOSED (plan L08, retention R3; supabase/migrations/1009-job-counts.sql + supabase/functions/hr-accrue).
//
//   node tests/job-counts.mjs            the guard (the whole replayed chain, the shipped edge modules)
//   node tests/job-counts.mjs --mutate   every planted defect in the edge must turn its arm red
//
// mutant-anchors: supabase/functions/hr-accrue/accrue-gather.js, supabase/functions/hr-accrue/tick-shadow.js, supabase/functions/hr-accrue/set-activity.js
//
// Every hero is made with hr_create_hero and set to work through the REAL set_activity intent (runSetActivity), as hr_engine.
//   J-DATA     src/data/hunt-after.js JOB_NEXTS is valid and its ids are exactly the server's CHECK on active_next.
//   J-REFUSE   the intent refuses a gathering job with no count, a forged count, a forged THEN and a THEN with no count, by
//              name and before any write; a good one is stored and the envelope's bench_run says { left, count, next }.
//   J-OPEN     WINDOW OPEN: a gathering job of 20, THEN wait, settled by the viewed hero's accrue-semantics settle
//              (collectCurrentWindow with the pointer surviving: index.ts's computeAccrual literal, A14) every 20 s of
//              server time: the job swings EXACTLY 20 times across the cut windows, ends itself, and its end says
//              "count, 20 of 20, waited"; nothing pays after it.
//   J-CLOSED   BROWSER CLOSED: the same job, THEN hunt, with the hero's last hunt behind it, settled by the world tick (the
//              shipped runTick, 10 s polls folded into a 90 s flush): EXACTLY 20 swings, the job ends, its THEN is pending;
//              the minute sweep starts the hero's last hunt again, once, journalled once; the hunt it starts will not resume
//              the job (no count is remembered at Enter: never a loop).
//   J-ONCE     a second fire and a second sweep over the ended job write nothing.
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { isMain } from './_is-main.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const FN = 'supabase/functions/hr-accrue';
const NODE = 'normal_tree';
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';

let seq = 0;
const nextUid = () => `000000c1-0000-4000-8000-0000001009${String(++seq).padStart(2, '0')}`;
const idem = () => crypto.randomUUID();
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
const js = (v) => String(JSON.stringify(v === undefined ? null : v));

async function as(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)",
    [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)");
  }
}
/* The seam index.ts hands the engine: one statement, its own transaction, as hr_engine. */
const engineExec = (db) => async (text, params) => {
  await db.exec('begin'); await db.exec('set local role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('commit'); }
};

async function makeHero(db) {
  const uid = nextUid();
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query("insert into public.profiles (id, display_name) values ($1, $2) on conflict (id) do update set display_name = excluded.display_name",
    [uid, 'Counter ' + seq]);
  const name = 'Counter' + String.fromCharCode(97 + (seq % 26)) + String.fromCharCode(97 + Math.floor(seq / 26) % 26);
  const h = await as(db, uid, 'select public.hr_create_hero(0, $1, $2::jsonb, $3::uuid)', [name, COLORS, idem()]);
  if (!h || h.ok !== true) throw Object.assign(new Error('hr_create_hero refused: ' + js(h)), { harness: true });
  return uid;
}

/* The hero's last hunt, behind it: entered through the one door and closed on its own end, the hero idle in town again. */
async function huntBehind(db, uid) {
  const hunt = await one(db, "select hunt_id from public.hr_hunts where hunt_id = 'mill_cellar'");
  if (!hunt) throw Object.assign(new Error('the chain has no mill_cellar hunt'), { harness: true });
  const r = await one(db, "select public.hr_hunt_enter_for($1::uuid, 0, $2, '[]'::jsonb, 0, null)", [uid, hunt]);
  if (!r || r.ok !== true) throw Object.assign(new Error('hr_hunt_enter_for refused: ' + js(r)), { harness: true });
  await db.query("select public.hr_hunt_close($1::uuid, 'stamina', now() - interval '1 hour', true)", [r.session_id]);
  await db.query(`update public.hunt_sessions set entered_at = entered_at - interval '2 hours' where id = $1`, [r.session_id]);
  await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0", [uid]);
  return hunt;
}

const stateOf = async (db, uid) => (await db.query(
  `select ps.active_kind, ps.active_id, ps.active_left, ps.active_count, ps.active_next, ps.job_end, ps.accrued_to, ps.version,
          ps.last_activity_left,
          coalesce((select qty from public.player_inventory i where i.user_id = ps.user_id and i.slot = 0 and i.item_id = 'normal_log'), 0)::int as logs
     from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [uid])).rows[0];
const gatherRows = async (db, uid) => (await db.query(
  "select meta from public.player_ledger where user_id = $1 and slot = 0 and kind = 'gather' and intent = 'accrue' order by id", [uid])).rows.map((r) => r.meta);
const swings = (rows) => rows.reduce((a, m) => a + Number(m.ticks || 0), 0);

/* Server time passes for this hero's town job: both watermarks move back together (local-world's WAIT). */
async function passes(db, uid, s) {
  await db.query(`update public.player_state set active_since = active_since - make_interval(secs => $2),
                         accrued_to = accrued_to - make_interval(secs => $2) where user_id = $1 and slot = 0`, [uid, s]);
  await db.query('update public.hr_return_anchor set real_return_at = real_return_at - make_interval(secs => $2) where user_id = $1 and slot = 0', [uid, s]);
}

async function startJob(db, edge, uid, activity) {
  await db.query('delete from public.hr_rate_counters');
  return edge.sa.runSetActivity({ exec: engineExec(db), user: uid, slot: 0, intentId: idem(), activity });
}

/* The viewed hero's settle: index.ts's accrue semantics (the pointer survives; A14 holds the engine literal to index.ts's). */
async function viewedSettle(db, edge, uid) {
  await db.query('delete from public.hr_rate_counters');
  const exec = engineExec(db);
  const [read] = await exec(edge.sa.READ_SQL, [uid, 0, 'accrue']);
  const env = read && read.state;
  if (!env || env.ok !== true) throw Object.assign(new Error('no envelope: ' + js(read)), { harness: true });
  return edge.sa.collectCurrentWindow({ exec, user: uid, slot: 0, env, st: env.state, nowMs: new Date(read.now).getTime(),
    capMs: Number(read.cap_ms) || 0, pointerSurvives: true });
}

/* One world-tick fire for these heroes, the way the cron drives it: enrol, roster under the edge's holder, runTick. */
async function fire(db, edge, uids) {
  await db.query('select public.hr_tick_enrol(200)');
  const holder = await one(db, "select left('cron:' || coalesce(current_database(), 'db'), 64)");
  await db.query("select count(*) from public.hr_tick_roster((select channels from public.hr_tick_config where id), 0, 200, $1, 30000, null, null, null)", [holder]);
  try {
    return (await edge.tick.runTick({ exec: engineExec(db),
      body: { op: 'tick', roster: uids.map((u) => ({ user_id: u, slot: 0 })), cadence_ms: 10000, flush_ms: 90000 } })).body;
  } catch (e) { return { RAISED: String(e.message).slice(0, 200) }; }
}

async function arms(db, edge) {
  const red = new Map();
  const arm = (id, pass, good, bad) => {
    if (!MUTATE) console.log(pass ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`);
    if (!pass) red.set(id, bad);
  };

  /* ── J-DATA ── */
  const ck = await one(db, "select pg_get_constraintdef(oid) from pg_constraint where conname = 'player_state_active_next_ck'");
  const sqlIds = [...String(ck || '').matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
  const dataIds = edge.data.JOB_NEXTS.map((c) => c.id).sort();
  arm('J-DATA', edge.data.validateJobNexts().length === 0 && js(sqlIds) === js(dataIds),
    `JOB_NEXTS is valid and its ids (${dataIds.join(', ')}) are the server's CHECK`,
    `JOB_NEXTS problems ${js(edge.data.validateJobNexts())}, data ${js(dataIds)} vs CHECK ${js(sqlIds)} (${ck})`);

  /* ── J-REFUSE ── */
  const r = await makeHero(db);
  const r0 = await stateOf(db, r);
  const bad = [
    { kind: 'gather', id: NODE },
    { kind: 'gather', id: NODE, count: null },
    { kind: 'gather', id: NODE, count: 20, next: 'nap' },
    { kind: 'gather', id: NODE, count: 20, next: null },
    { kind: 'idle', id: null, count: 20 },
  ];
  const answers = [];
  for (const a of bad) {
    const res = await startJob(db, edge, r, a);
    answers.push([res.status, res.body && res.body.error]);
  }
  const r1 = await stateOf(db, r);
  const good = await startJob(db, edge, r, { kind: 'gather', id: NODE, count: 20, next: 'wait' });
  const r2 = await stateOf(db, r);
  const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [r]);
  const br = env && env.bench_run;
  arm('J-REFUSE', answers.every(([st, e]) => st === 400 && e === 'bad_activity') && r1.version === r0.version
      && good.status === 200 && r2.active_kind === 'gather' && r2.active_left === 20 && r2.active_count === 20 && r2.active_next === 'wait'
      && br && br.left === 20 && br.count === 20 && br.next === 'wait',
    'no count, a forged count, a forged THEN and a count on idle are refused bad_activity before any write; "20, then wait" is stored and projected',
    `answers ${js(answers)}, version ${r0.version} -> ${r1.version}, good ${good.status} ${js(good.body && good.body.error)}, row ${js(r2)}, bench_run ${js(br)}`);

  /* ── J-OPEN: window open, the viewed hero's settle every 20 s ── */
  const o = await makeHero(db);
  const os = await startJob(db, edge, o, { kind: 'gather', id: NODE, count: 20, next: 'wait' });
  if (os.status !== 200) throw Object.assign(new Error('J-OPEN start refused: ' + js(os.body)), { harness: true });
  let settles = 0;
  for (let i = 0; i < 12; i++) {
    const s = await stateOf(db, o);
    if (s.active_kind !== 'gather') break;
    await passes(db, o, 20);
    await viewedSettle(db, edge, o);
    settles++;
  }
  const oa = await stateOf(db, o);
  const orows = await gatherRows(db, o);
  await passes(db, o, 300);
  await viewedSettle(db, edge, o).catch(() => null);
  const ob = await stateOf(db, o);
  const oe = oa.job_end || {};
  arm('J-OPEN', oa.active_kind === 'idle' && swings(orows) === 20 && orows.length >= 2 && oa.logs >= 20
      && oe.end === 'count' && oe.done === 20 && oe.count === 20 && oe.next === 'wait' && oe.next_state === 'waited'
      && orows[orows.length - 1].stopped === 'count' && orows[orows.length - 1].left === 0
      && ob.version === oa.version && ob.logs === oa.logs,
    `window open: 20 swings exactly over ${orows.length} settles (${settles} asked), the job ended itself, "20 of 20, waited"; nothing paid after`,
    `window open: ${swings(orows)} swings in ${orows.length} rows, row ${js(oa)}, last meta ${js(orows[orows.length - 1])}, after ${js({ v: ob.version, logs: ob.logs })}`);

  /* ── J-CLOSED: browser closed, the world tick ── */
  const c = await makeHero(db);
  const hunt = await huntBehind(db, c);
  const cs = await startJob(db, edge, c, { kind: 'gather', id: NODE, count: 20, next: 'hunt' });
  if (cs.status !== 200) throw Object.assign(new Error('J-CLOSED start refused: ' + js(cs.body)), { harness: true });
  await db.query('update public.player_state set last_seen_at = null where user_id = $1 and slot = 0', [c]);
  await db.query('select public.hr_tick_enrol(200)');
  await passes(db, c, 600);
  /* the tick settles one 90 s flush window a fire (artisan-tick A-RUNNING); a Level 1 hero with no axe swings about every 5 s */
  let f1 = null;
  for (let i = 0; i < 6; i++) {
    f1 = await fire(db, edge, [c]);
    if ((await stateOf(db, c)).active_kind !== 'gather') break;
  }
  const ca = await stateOf(db, c);
  const crows = await gatherRows(db, c);
  const ce = ca.job_end || {};
  const closedEnd = ca.active_kind === 'idle' && swings(crows) === 20 && crows.every((m) => m.src === 'tick')
    && ce.end === 'count' && ce.done === 20 && ce.next === 'hunt' && ce.next_state === 'pending';
  const n1 = await one(db, 'select public.hr_job_next_sweep(500)');
  const cb = await stateOf(db, c);
  const thenRows = await one(db, "select count(*)::int from public.player_ledger where user_id = $1 and slot = 0 and intent = 'job_next'", [c]);
  const open = await one(db, 'select hunt_id from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [c]);
  const cbe = cb.job_end || {};
  arm('J-CLOSED', closedEnd && n1 >= 1 && cb.active_kind === 'combat' && open === hunt && cbe.next_state === 'started' && cbe.hunt === hunt
      && thenRows === 1 && cb.last_activity_left === null,
    `browser closed: the tick swung exactly 20 in ${crows.length} row(s), ended the job, and the sweep sent the hero back to ${hunt}, once, with no job to loop back to`,
    `browser closed: fire ${js(f1).slice(0, 200)}, ${swings(crows)} swings, end ${js(ce)}, after sweep ${js({ n1, kind: cb.active_kind, open, end: cbe, thenRows, lastLeft: cb.last_activity_left })}`);

  /* ── J-ONCE ── */
  const ledger0 = await one(db, 'select count(*)::int from public.player_ledger where user_id = $1', [c]);
  await one(db, 'select public.hr_job_next_sweep(500)');
  const ledger1 = await one(db, 'select count(*)::int from public.player_ledger where user_id = $1', [c]);
  const ov = (await stateOf(db, o)).version;
  await fire(db, edge, [o]);
  const ov1 = (await stateOf(db, o)).version;
  arm('J-ONCE', ledger1 === ledger0 && ov1 === ov,
    'a second sweep and a second fire over an ended job write nothing',
    `ledger ${ledger0} -> ${ledger1}, version ${ov} -> ${ov1}`);
  return red;
}

async function loadEdge(dir) {
  const tick = await import(pathToFileURL(join(dir, FN, 'tick.js')).href + `?m=${seq}`);
  const sa = await import(pathToFileURL(join(dir, FN, 'set-activity.js')).href + `?m=${seq}`);
  const data = await import(pathToFileURL(join(dir, 'src/data/hunt-after.js')).href + `?m=${seq}`);
  return { tick, sa, data };
}

async function prepare(db) {
  await db.query("insert into public.hr_flags (key, enabled, note) values ('town_presence', true, 'job-counts') on conflict (key) do update set enabled = true");
  await db.query('update public.hr_tick_config set enabled = true where id');
  await db.query("update public.hr_tick_config set armed_channels = (select array_agg(distinct x) from unnest(armed_channels || 'gather'::text) x) where id");
}

const JS_MUTANTS = [
  { id: 'no_cap', arm: 'J-OPEN', file: `${FN}/accrue-gather.js`, why: 'the job count does not cap the span (6,001 ore for 20)',
    from: '    maxActions: left0,', to: '    maxActions: null,' },
  { id: 'no_carry', arm: 'J-CLOSED', file: `${FN}/tick-shadow.js`, why: 'the tick forgets the count between its 10 s polls',
    from: "  if (typeof d.active_left === 'number') char.activeLeft = d.active_left > 0 ? d.active_left : null;", to: '' },
  { id: 'no_end', arm: 'J-OPEN', file: `${FN}/accrue-gather.js`, why: 'the count reached does not end the job',
    from: "  const nodeStopped = summary.stoppedBy === STOP_REASON.LEVEL || summary.stoppedBy === STOP_REASON.BAG_FULL || counted;",
    to: "  const nodeStopped = summary.stoppedBy === STOP_REASON.LEVEL || summary.stoppedBy === STOP_REASON.BAG_FULL;" },
  { id: 'uncounted_ok', arm: 'J-REFUSE', file: `${FN}/set-activity.js`, why: 'a gathering job with no count is accepted',
    from: "  if (kind === 'gather' && a.count === undefined) {", to: '  if (false) {' },
];

async function main() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error(`job-counts: HARNESS — ${String(e.message).split('\n').slice(0, 2).join(' ')}`); process.exit(2); }
  try {
    await prepare(db);
    if (!MUTATE) {
      console.log('\njob-counts — a job of 20 stops at 20 and does its THEN, window open and browser closed\n');
      const red = await arms(db, await loadEdge(ROOT));
      console.log(red.size ? `\njob-counts: RED (${red.size})` : '\njob-counts: green');
      process.exitCode = red.size ? 1 : 0;
      return;
    }
    console.log('\njob-counts --mutate\n');
    let survived = 0;
    for (const mu of JS_MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-jobcount-'));
      try {
        for (const d of ['src/core', 'src/data', FN]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
        const p = join(dir, mu.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(mu.from).length !== 2) { console.error(`job-counts: HARNESS — mutant ${mu.id}: anchor not found once in ${mu.file}`); process.exit(2); }
        if (!CONTROL) writeFileSync(p, src.replace(mu.from, () => mu.to));
        seq += 1;
        const red = await arms(db, await loadEdge(dir));
        const caught = red.has(mu.arm);
        console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})` : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red: ${[...red.keys()].join(', ') || 'none'}`);
        if (!caught) survived++;
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    console.log(survived ? `\njob-counts --mutate: RED (${survived} survived)` : '\njob-counts --mutate: green (every mutant caught)');
    process.exitCode = survived ? 1 : 0;
  } catch (e) {
    console.error(`job-counts: HARNESS — ${String(e.stack || e.message).slice(0, 600)}`); process.exitCode = 2;
  } finally { await db.close().catch(() => {}); }
}

if (isMain(import.meta.url)) await main();
