#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/job-counts.mjs — A COUNTED RUN IS ENDED BY THE SERVER AT ITS COUNT, WINDOW OPEN OR BROWSER CLOSED
//   (plan L08, retention R3; supabase/migrations/1026-job-counts.sql + supabase/functions/hr-accrue).
//   Re-aimed at the Great Hearth's fuel run by lane/bench-cut-edge (09-crafting.md 4.17): the gathering job it drove left with the
//   one-town-work cut, and `bench_run` stays as the hearth run's count. A fuel run takes no THEN.
//
//   node tests/job-counts.mjs            the guard (the whole replayed chain, the shipped edge modules)
//   node tests/job-counts.mjs --mutate   every planted defect in the edge must turn its arm red
//
// mutant-anchors: supabase/functions/hr-accrue/accrue-artisan.js, supabase/functions/hr-accrue/envelope.js, supabase/functions/hr-accrue/set-activity.js
//
// Every hero is made with hr_create_hero and set to work through the REAL set_activity intent (runSetActivity), as hr_engine.
//   J-DATA     src/data/hunt-after.js JOB_NEXTS is valid and its ids are exactly the server's CHECK on active_next.
//   J-REFUSE   the intent refuses a forged count, any THEN and a count on idle, by name and before any write; a good one is
//              stored and the envelope's bench_run says { left, count }.
//   J-OPEN     WINDOW OPEN: a run of 60 settled by the viewed hero's accrue-semantics settle (collectCurrentWindow with the
//              pointer surviving: index.ts's computeAccrual literal, A14) every 16 s of server time: it burns EXACTLY 60 across
//              the cut windows, ends itself, and its end says "count, 60 of 60, waited"; nothing burns after it. One ten-minute
//              settle of a run of 20 also burns exactly 20.
//   J-CLOSED   BROWSER CLOSED: with the hero's last hunt behind it, a THEN of hunt is refused by name (FB-10's re-cut of 1026, D-11:
//              no job's end starts a hunt); a run of 200 settled by the world tick (the shipped runTick, one 90 s window a fire,
//              140 actions): EXACTLY 200 over the fires, the run ends, the hero waits in town, no hunt starts, no sweep exists.
//   J-ONCE     a second fire over the ended job writes nothing.
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
const RUN = 'fuel_bones';
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
  await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'bones', 1000)
                  on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [uid]);
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
          coalesce((select qty from public.player_inventory i where i.user_id = ps.user_id and i.slot = 0 and i.item_id = 'bones'), 0)::int as bones
     from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [uid])).rows[0];
const craftRows = async (db, uid) => (await db.query(
  "select meta from public.player_ledger where user_id = $1 and slot = 0 and kind = 'craft' and intent = 'accrue' order by id", [uid])).rows.map((r) => r.meta);
const burns = (rows) => rows.reduce((a, m) => a + Number(m.ticks || 0), 0);

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
    { kind: 'artisan', id: RUN, count: null },
    { kind: 'artisan', id: RUN, count: 20, next: 'nap' },
    { kind: 'artisan', id: RUN, count: 20, next: 'wait' },
    { kind: 'artisan', id: RUN, count: 20, next: null },
    { kind: 'idle', id: null, count: 20 },
  ];
  const answers = [];
  for (const a of bad) {
    const res = await startJob(db, edge, r, a);
    answers.push([res.status, res.body && res.body.error]);
  }
  const r1 = await stateOf(db, r);
  const good = await startJob(db, edge, r, { kind: 'artisan', id: RUN, count: 20 });
  const r2 = await stateOf(db, r);
  const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [r]);
  const br = env && env.bench_run;
  arm('J-REFUSE', answers.every(([st, e]) => st === 400 && e === 'bad_activity') && r1.version === r0.version
      && good.status === 200 && r2.active_kind === 'artisan' && r2.active_left === 20 && r2.active_count === 20
      && br && br.left === 20 && br.count === 20,
    'a forged count, any THEN and a count on idle are refused bad_activity before any write; a run of 20 is stored and projected',
    `answers ${js(answers)}, version ${r0.version} -> ${r1.version}, good ${good.status} ${js(good.body && good.body.error)}, row ${js(r2)}, bench_run ${js(br)}`);

  /* ── J-OPEN: window open, the viewed hero's settle every 16 s (25 actions; the town floor is 15 s) ── */
  const o = await makeHero(db);
  const os = await startJob(db, edge, o, { kind: 'artisan', id: RUN, count: 60 });
  if (os.status !== 200) throw Object.assign(new Error('J-OPEN start refused: ' + js(os.body)), { harness: true });
  let settles = 0;
  for (let i = 0; i < 12; i++) {
    const s = await stateOf(db, o);
    if (s.active_kind !== 'artisan') break;
    await passes(db, o, 16);
    await viewedSettle(db, edge, o);
    settles++;
  }
  const oa = await stateOf(db, o);
  const orows = await craftRows(db, o);
  await passes(db, o, 300);
  await viewedSettle(db, edge, o).catch(() => null);
  const ob = await stateOf(db, o);
  const oe = oa.job_end || {};
  arm('J-OPEN', oa.active_kind === 'idle' && burns(orows) === 60 && orows.length >= 2 && oa.bones === 940
      && oe.end === 'count' && oe.done === 60 && oe.count === 60 && oe.next === 'wait' && oe.next_state === 'waited'
      && orows[orows.length - 1].stopped === 'count' && orows[orows.length - 1].left === 0
      && ob.version === oa.version && ob.bones === oa.bones,
    `window open: 60 burnt exactly over ${orows.length} settles (${settles} asked), the run ended itself, "60 of 60, waited"; nothing burnt after`,
    `window open: ${burns(orows)} burnt in ${orows.length} rows, row ${js(oa)}, last meta ${js(orows[orows.length - 1])}, after ${js({ v: ob.version, bones: ob.bones })}`);
  /* ...and ONE settle that covers ten minutes (about 937 actions of time) still burns exactly 20: the count caps the span itself. */
  const o2 = await makeHero(db);
  const os2 = await startJob(db, edge, o2, { kind: 'artisan', id: RUN, count: 20 });
  if (os2.status !== 200) throw Object.assign(new Error('J-OPEN-ONE start refused: ' + js(os2.body)), { harness: true });
  await passes(db, o2, 600);
  await viewedSettle(db, edge, o2);
  const o2a = await stateOf(db, o2);
  const o2rows = await craftRows(db, o2);
  arm('J-OPEN', o2a.active_kind === 'idle' && burns(o2rows) === 20 && o2a.bones === 980 && o2rows.length === 1 && (o2a.job_end || {}).done === 20,
    'window open: one ten-minute settle of a run of 20 burnt exactly 20 and ended it',
    `window open: one ten-minute settle burnt ${burns(o2rows)} in ${o2rows.length} row(s), row ${js(o2a)}`);

  /* ── J-CLOSED: browser closed, the world tick ── */
  const c = await makeHero(db);
  const hunt = await huntBehind(db, c);
  /* a THEN of hunt is refused by name since FB-10's re-cut (D-11: no job's end starts a hunt) */
  const ch = await startJob(db, edge, c, { kind: 'artisan', id: RUN, count: 200, next: 'hunt' });
  const cs = await startJob(db, edge, c, { kind: 'artisan', id: RUN, count: 200 });
  if (cs.status !== 200) throw Object.assign(new Error('J-CLOSED start refused: ' + js(cs.body)), { harness: true });
  await db.query('update public.player_state set last_seen_at = null where user_id = $1 and slot = 0', [c]);
  await db.query('select public.hr_tick_enrol(200)');
  await passes(db, c, 600);
  /* the tick settles one 90 s flush window a fire (artisan-tick A-RUNNING): 140 actions, then what the count has left */
  let f1 = null;
  for (let i = 0; i < 6; i++) {
    f1 = await fire(db, edge, [c]);
    if ((await stateOf(db, c)).active_kind !== 'artisan') break;
  }
  const ca = await stateOf(db, c);
  const crows = await craftRows(db, c);
  const ce = ca.job_end || {};
  const closedEnd = ca.active_kind === 'idle' && burns(crows) === 200 && ca.bones === 800 && crows.length >= 2 && crows.every((m) => m.src === 'tick')
    && ce.end === 'count' && ce.done === 200 && ce.next === 'wait' && ce.next_state === 'waited';
  const open = await one(db, 'select hunt_id from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [c]);
  const sweep = await one(db, "select to_regprocedure('public.hr_job_next_sweep(integer)')::text");
  arm('J-CLOSED', closedEnd && ch.status === 400 && ch.body && ch.body.error === 'bad_activity' && open === undefined && sweep === null,
    `browser closed: a THEN of hunt is refused by name, the tick burnt exactly 200 in ${crows.length} row(s) and ended the run, and the hero waits in town (no sweep, no hunt starts; its last was ${hunt})`,
    `browser closed: then-hunt ${js([ch.status, ch.body && ch.body.error])}, fire ${js(f1).slice(0, 200)}, ${burns(crows)} burnt, end ${js(ce)}, open hunt ${js(open)}, sweep ${js(sweep)}`);

  /* ── J-ONCE ── */
  const ledger0 = await one(db, 'select count(*)::int from public.player_ledger where user_id = $1', [c]);
  await fire(db, edge, [c]);
  const ledger1 = await one(db, 'select count(*)::int from public.player_ledger where user_id = $1', [c]);
  const ov = (await stateOf(db, o)).version;
  await fire(db, edge, [o]);
  const ov1 = (await stateOf(db, o)).version;
  arm('J-ONCE', ledger1 === ledger0 && ov1 === ov,
    'a second fire over an ended job writes nothing',
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
}

const JS_MUTANTS = [
  { id: 'no_cap', arm: 'J-OPEN', file: `${FN}/accrue-artisan.js`, why: 'the run\'s count does not cap the span (937 bones for 20)',
    from: '    maxActions: runCap(inp.actionBudget, left0),', to: '    maxActions: inp.actionBudget,' },
  /* (no_carry, the count carried between a gather flush's 10 s polls, retired with the poll fold; what carries it across fires is
     the countdown the window writes, and its mutant is no_countdown.) */
  { id: 'no_countdown', arm: 'J-CLOSED', file: `${FN}/accrue-artisan.js`, why: 'a window short of the count writes no countdown: every fire burns the whole count again',
    from: '|| (!runOver && left1 < left0)))', to: '|| false))' },
  { id: 'no_end', arm: 'J-OPEN', file: `${FN}/accrue-artisan.js`, why: 'the count reached does not end the run',
    from: '  const stopped = summary.stoppedBy === FUEL_STOP.SUPPLIES || counted;', to: '  const stopped = summary.stoppedBy === FUEL_STOP.SUPPLIES;' },
  { id: 'count_unread', arm: 'J-CLOSED', file: `${FN}/envelope.js`, why: 'the envelope\'s count reaches no window',
    from: '    activeLeft: (e.bench_run && Number.isInteger(e.bench_run.left) && e.bench_run.left > 0) ? e.bench_run.left : null,', to: '    activeLeft: null,' },
  { id: 'count_dropped', arm: 'J-REFUSE', file: `${FN}/set-activity.js`, why: 'the statement hr_apply stores carries no count',
    from: '      ...(n !== null ? { count: n } : {}),\n    },', to: '    },' },
  { id: 'idle_counted', arm: 'J-REFUSE', file: `${FN}/set-activity.js`, why: 'an unreadable count is dropped instead of refused: the run burns the stack',
    from: "  if (a.count !== undefined && (kind !== 'artisan' || a.count === null)) {", to: '  if (false) {' },
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
