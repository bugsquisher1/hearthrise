// ============================================================================
// tests/vitals-armed-parity.mjs — VITALS' ARMED STALL JUDGE NEVER DISAGREES
//                                 WITH THE DATABASE'S
//
//   node tests/vitals-armed-parity.mjs            the guard
//   node tests/vitals-armed-parity.mjs --mutate   every mutant must go RED by name
//
// Security G1 (party-fences review): tools/vitals.mjs runs as
// supabase_read_only_user, which cannot execute hr_tick_stall_status() (42501),
// so its armed judge is a RESTATEMENT — the ARMED_TICK query plus
// armedStallVerdict(). A restatement that drifts reports STALL for an online
// player while the DB reads armed_judged = false: the "two sources disagree"
// class. This guard makes the restatement unable to drift. On the replayed
// chain (whole chain: the LATEST hr_tick_stall_status body is the reference)
// it builds fixtures, then for each one runs, at the same judged instant,
//   DB      public.hr_tick_stall_status(t, 2, 30) -> armed[ch].{judged, stalled}
//   VITALS  ARMED_TICK lifted verbatim from tools/vitals.mjs (now() bound to t)
//           -> armedStallVerdict() lifted from its STALL RULE block
// and goes RED, by fixture name, on any disagreement. Each fixture also pins
// the expected answer, so both sides agreeing on a wrong answer is RED too.
//
//   V1  offline sentinel, 0 tick windows                 judged, STALLED
//   V2 ★ F2b: the only sentinel ONLINE (client rows)     online, NOT judged
//   V3  one online + one offline sentinel, 0 windows     judged, STALLED
//   V4  offline sentinel, >= 30 tick windows every hour  judged, ok
//   V5  client rows of ANOTHER kind (craft)              still a sentinel: judged, STALLED
//   V6  client rows older than the window                still a sentinel: judged, STALLED
//   V7  activity restarted inside the window             no sentinel: NOT judged
//   V8  no owner on the channel                          NOT judged
//   V9  an hour with nothing rostered                    judged, not stalled
//   V10 the tick disabled                                NOT judged
//   V11 raw mark 25 h old (fenced_24h), at real now      NOT judged
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const VITALS_SRC = (await readFile(join(ROOT, 'tools', 'vitals.mjs'), 'utf8')).replace(/\r\n/g, '\n');
const harness = (msg) => Object.assign(new Error(msg), { harness: true });

/** The two halves of vitals' armed judge, lifted from (possibly mutated) source text. */
function liftVitals(src) {
  const m = src.match(/\nconst ARMED_TICK = `([\s\S]*?)`;\n/);
  if (!m) throw harness('ARMED_TICK not found in tools/vitals.mjs');
  if (m[1].includes('${')) throw harness('ARMED_TICK interpolates; the lift would not be verbatim');
  const a = src.indexOf('// ── STALL RULE BEGIN');
  const b = src.indexOf('// ── STALL RULE END');
  if (a < 0 || b < 0) throw harness('the STALL RULE markers are gone from tools/vitals.mjs');
  const { armedStallVerdict } = new Function(`${src.slice(a, b)}\nreturn { armedStallVerdict };`)();
  const ruleM = src.match(/const STALL_RULE = \{ hours: (\d+), minRowsPerHour: (\d+) \};/);
  if (!ruleM) throw harness('STALL_RULE not found in tools/vitals.mjs');
  const rule = { hours: Number(ruleM[1]), minRowsPerHour: Number(ruleM[2]) };
  // The judged instant replaces the endpoint's now(); every now() in the text is it.
  const sql = m[1].replace(/now\(\)/g, '$1::timestamptz');
  if (sql === m[1]) throw harness('ARMED_TICK no longer reads now(); re-anchor the guard');
  return { sql, armedStallVerdict, rule };
}

const U = (n) => `00000000-0000-4000-8000-0000000f${String(n).padStart(4, '0')}`;
const H = 3600;

async function arms(db, V, { log = true } = {}) {
  const red = [];
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const cfg = (set) => db.exec(`update public.hr_tick_config set ${set} where id;`);
  const gact = (await one("select activity_id from public.hr_activities where kind = 'gather' order by activity_id limit 1"))?.activity_id;
  if (!gact) throw harness('no gather activity in hr_activities');
  await cfg("enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['gather']");

  /** A gatherer on slot 0: active since `since`, raw mark `acc` (default: 5 min before real now). */
  const gatherer = async (u, { since = '2000-01-01 00:00:00+00', acc = null } = {}) => {
    await db.exec(`insert into auth.users (id) values ('${u}') on conflict do nothing;`);
    await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                                              active_kind, active_id, active_since)
             values ($1, 0, 0, 0, 10, 10, 1, coalesce($3::timestamptz, now() - interval '5 minutes'), 'gather', $2, $4::timestamptz)`,
    [u, gact, acc, since]);
    await q("insert into public.hr_tick_ownership (user_id, slot, channel, owned) values ($1, 0, 'gather', false)", [u]);
  };
  const onlyOwners = (us) => q("update public.hr_tick_ownership set owned = (user_id = any($1::uuid[])) where channel = 'gather'", [us]);
  /* 719 posted fires, 10 s apart, over the 2 h before `at`; `skipHour0` leaves the newest hour unrostered. */
  const fires = (at, skipHour0 = false) => q(`insert into public.hr_tick_cron_log (at, outcome, ms, rostered, effective_cadence_seconds)
       select $1::timestamptz - make_interval(secs => g * 10), 'posted', 5, 2, 10
         from generate_series(case when $2 then 361 else 1 end, 719) g`, [at, skipHour0]);
  /* `n` ledger rows for `u`, one per `step` s, ending `offset` s before `at`. */
  const ledger = (at, u, kind, tick, n, step = 90, offset = 0) => q(`insert into public.player_ledger (user_id, slot, kind, intent, meta, at)
       select $2::uuid, 0, $3, 'accrue',
              case when $4 then jsonb_build_object('src', 'tick', 'qty', 1) else jsonb_build_object('qty', 1) end,
              $1::timestamptz - make_interval(secs => $7::int + g * $6::int)
         from generate_series(1, $5::int) g`, [at, u, kind, tick, n, step, offset]);

  /** Both judges at the same instant, inside one transaction (one now()). */
  const judge = async (at) => {
    await db.exec('begin;');
    try {
      const t = at || (await one('select now() as t')).t;
      const dbS = (await one('select public.hr_tick_stall_status($1::timestamptz, 2, 30) as s', [t])).s;
      const rows = await q(V.sql, [t]);
      return { dbS, rows };
    } finally { await db.exec('commit;'); }
  };
  const fixture = async (id, what, at, want) => {
    const { dbS, rows } = await judge(at);
    const d = (dbS.armed || []).find((x) => x.channel === 'gather') || { judged: false, stalled: false };
    const vr = rows.filter((r) => r.channel === 'gather').sort((x, y) => Number(x.i) - Number(y.i))
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
    const v = vr.length ? V.armedStallVerdict(vr, V.rule) : { judged: false, stalled: false, verdict: 'NO ROW' };
    const dbAns = { judged: d.judged === true, stalled: d.stalled === true };
    const vAns = { judged: v.judged === true, stalled: v.stalled === true };
    const agree = dbAns.judged === vAns.judged && dbAns.stalled === vAns.stalled;
    const right = dbAns.judged === want.judged && dbAns.stalled === want.stalled;
    const fmt = (x) => `${x.judged ? 'judged' : 'not judged'}${x.stalled ? ', STALLED' : ''}`;
    if (agree && right) { if (log) console.log(`  ✓ ${id} — ${what}: both read ${fmt(dbAns)} (vitals: ${v.verdict})`); return; }
    red.push(id);
    if (log) {
      console.log(`  ✗ ${id} — ${what}: DB ${fmt(dbAns)}, vitals ${fmt(vAns)} (${v.verdict} — ${v.why}), want ${fmt(want)}`);
    }
  };
  const STALL = { judged: true, stalled: true };
  const NOJ = { judged: false, stalled: false };

  // Each fixture owns its instant (tick rows are counted channel-wide, and the
  // ledger is immutable), and its own characters; ownership is set per fixture.
  const T = (y) => `${y}-07-01 12:00:00+00`;
  for (let i = 1; i <= 12; i++) await gatherer(U(i));
  await gatherer(U(20), { since: `${2008}-07-01 11:00:00+00` });                    // V7: restarted 1 h before
  await gatherer(U(21), { acc: null });
  await q("update public.player_state set accrued_to = now() - interval '25 hours' where user_id = $1", [U(21)]);

  await fires(T(2001));
  await onlyOwners([U(1)]);
  await fixture('V1', 'offline sentinel, 2 h rostered, 0 tick windows', T(2001), STALL);

  await fires(T(2002)); await ledger(T(2002), U(2), 'gather', false, 79);
  await onlyOwners([U(2)]);
  await fixture('V2', 'F2b: the only sentinel is ONLINE (79 client accrue rows, 0 tick windows) -> online, not judged', T(2002), NOJ);

  await fires(T(2003)); await ledger(T(2003), U(3), 'gather', false, 79);
  await onlyOwners([U(3), U(4)]);
  await fixture('V3', 'one ONLINE + one OFFLINE sentinel, 0 tick windows', T(2003), STALL);

  await fires(T(2004)); await ledger(T(2004), U(5), 'gather', true, 100, 70);
  await onlyOwners([U(5)]);
  await fixture('V4', 'offline sentinel, >= 30 tick windows every hour', T(2004), { judged: true, stalled: false });

  await fires(T(2005)); await ledger(T(2005), U(6), 'craft', false, 79);
  await onlyOwners([U(6)]);
  await fixture('V5', 'client rows of ANOTHER kind (craft) do not unseat a gather sentinel', T(2005), STALL);

  await fires(T(2006)); await ledger(T(2006), U(7), 'gather', false, 40, 90, 2 * H);
  await onlyOwners([U(7)]);
  await fixture('V6', 'client rows all older than the 2 h window: still a sentinel', T(2006), STALL);

  await fires(T(2008));
  await onlyOwners([U(20)]);
  await fixture('V7', 'activity restarted 1 h ago: not a sentinel', T(2008), NOJ);

  await fires(T(2009));
  await onlyOwners([]);
  await fixture('V8', 'nobody owns the gather channel', T(2009), NOJ);

  await fires(T(2010), true);
  await onlyOwners([U(8)]);
  await fixture('V9', 'the newest hour had nothing rostered', T(2010), { judged: true, stalled: false });

  await fires(T(2011));
  await onlyOwners([U(9)]);
  await cfg('enabled = false');
  await fixture('V10', 'the tick disabled', T(2011), NOJ);
  await cfg('enabled = true');

  // V11 at REAL now: hr_tick_admit's 24 h fence reads now(), not p_now.
  await fires((await one('select now() as t')).t);
  await onlyOwners([U(21)]);
  await fixture('V11', 'raw mark 25 h old (fenced_24h): not a sentinel', null, NOJ);

  await onlyOwners([]);
  return red;
}

async function run(src, opts) {
  const V = liftVitals(src);
  const { db } = await bootReplay();
  try { return await arms(db, V, opts); } finally { await db.close(); }
}

if (!MUTATE) {
  console.log('\nvitals-armed-parity: tools/vitals.mjs\'s armed stall judge == hr_tick_stall_status, fixture by fixture');
  let red;
  try { red = await run(VITALS_SRC, { log: true }); } catch (e) {
    if (e.harness) { console.error(`harness: ${e.message}`); process.exit(2); }
    throw e;
  }
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: vitals and the DB judge agree on every armed fixture (F2b included)');
  process.exit(red.length ? 1 : 0);
}

// ── --mutate: tools/vitals.mjs's text with one line broken; each mutant must
//    turn its named fixture RED. The DB side is never touched.
const MUTANTS = [
  { name: 'noF2bInQuery', why: 'the online exclusion removed from ARMED_TICK (G1 as found)', expect: /^V2$/,
    find: "and pl.meta ->> 'src' is distinct from 'tick')) as online_sentinels",
    repl: "and false)) as online_sentinels" },
  { name: 'noF2bInRule', why: 'online sentinels not subtracted in armedStallVerdict', expect: /^V2$/,
    find: 'const offline = Number(win[0].sentinels) - Number(win[0].online_sentinels);',
    repl: 'const offline = Number(win[0].sentinels);' },
  { name: 'f2bAnyKind', why: 'a client row of any kind unseats the sentinel', expect: /^V5$/,
    find: "                          and pl.kind = (case c.ch when 'artisan' then 'craft' else c.ch end)\n", repl: '' },
  { name: 'f2bUnbounded', why: 'client rows before the window still unseat the sentinel', expect: /^V6$/,
    find: "and pl.at >= now() - interval '2 hours' and pl.at < now()", repl: 'and true' },
  { name: 'f2bTickRowsUnseat', why: 'tick rows also unseat a sentinel', expect: /^V4$/,
    find: "and pl.meta ->> 'src' is distinct from 'tick')) as online_sentinels", repl: ')) as online_sentinels' },
  { name: 'noRestartFence', why: 'active_since ignored', expect: /^V7$/,
    find: "           and ps.active_since <= now() - interval '2 hours'\n           and ps.accrued_to > now() - interval '24 hours') as sentinels,",
    repl: "           and ps.accrued_to > now() - interval '24 hours') as sentinels," },
  { name: 'no24hFence', why: 'the 24 h raw-mark fence dropped', expect: /^V11$/, all: true,
    find: "           and ps.accrued_to > now() - interval '24 hours'", repl: '' },
  { name: 'enabledIgnored', why: 'the tick disabled still judges', expect: /^V10$/,
    find: "history`);\n  if (String(win[0].enabled) !== 'true') return no('the tick is disabled (hr_tick_config.enabled)');",
    repl: 'history`);' },
  { name: 'floorMoved', why: 'the 30-window floor restated wrong', expect: /^V4$/,
    find: 'const stalled = win.every((r) => Number(r.tick_rows) + Number(r.shadow_rows) < rule.minRowsPerHour);',
    repl: 'const stalled = win.every((r) => Number(r.tick_rows) < 300);' },
];

console.log('\nvitals-armed-parity --mutate: every vitals mutant must go RED on its named fixture');
let survived = 0;
for (const m of MUTANTS) {
  const n = VITALS_SRC.split(m.find).length - 1;
  if (n < 1 || (!m.all && n !== 1)) { console.error(`harness: ${m.name}: anchor matched ${n}x`); process.exit(2); }
  const src = m.all ? VITALS_SRC.split(m.find).join(m.repl) : VITALS_SRC.replace(m.find, () => m.repl);
  let red;
  try { red = await run(src, { log: false }); } catch (e) {
    if (e.harness) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); }
    red = [`threw: ${e.message}`];
  }
  const hit = red.some((id) => m.expect.test(id));
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${red.join(', ')}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${red.length ? `red only via ${red.join(', ')}` : 'SURVIVED'}`); }
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named fixture`);
process.exit(survived ? 1 : 0);
