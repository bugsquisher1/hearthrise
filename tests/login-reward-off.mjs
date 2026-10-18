#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/login-reward-off.mjs — THE DAILY LOGIN REWARD PAYS NOTHING (Tyler,
//                              2026-10-17: premium-only; premium is S1's).
//
//   node tests/login-reward-off.mjs           the guard (whole chain)
//   node tests/login-reward-off.mjs --mutate  every planted defect must be CAUGHT
//
// Ships with supabase/migrations/2026-10-23-demolition-login-catalogue.sql.
// Its §4 runs once, at apply. This adds what a §4 cannot:
//   O1  ONE SOURCE: src/data/rewards.js (cycle, week bonus, cap, streak cap)
//       equals the file's GENERATED literal, and priceDailyLogin pays 0 for
//       every streak;
//   O2  a REAL claim through hr_apply (today's daily:login row 'done', a zero
//       and a 300-gold proposal) is refused login_reward_off: gold, bag and
//       the claim row unchanged, the refusal journalled in hr_rejections, and
//       a replay of the same intent answers the same refusal and pays nothing;
//   O3  the file RE-APPLIES byte-identically.
// --mutate plants the defects this ruling is about and requires each to be
// refused at install by the file's §4 or caught by a named arm here.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MIG = '2026-10-23-demolition-login-catalogue.sql';
const VERIFY = 'public.hr_login_claim_verify(uuid,integer,text,jsonb)';

const MUTATIONS = {
  claim_still_accepted: {
    why: 'hr_login_claim_verify returns without refusing: a claim lands',
    pairs: [["  perform public.hr_reject('login_reward_off',\n    jsonb_build_object('why', 'the daily login reward is premium-only and premium is not built yet'));\n",
      '  return;\n']],
  },
  day7_still_pays: {
    why: 'the catalogue keeps a paying day 7 (300 gold)',
    pairs: [['\'{"cycle":[{},{},{},{},{},{},{}],', '\'{"cycle":[{},{},{},{},{},{},{"gold":300}],']],
  },
  verify_client_callable: {
    why: 'the claim verify is granted to authenticated',
    pairs: [['revoke execute on function public.hr_login_claim_verify(uuid, int, text, jsonb) from public, anon, authenticated, service_role;\n',
      'revoke execute on function public.hr_login_claim_verify(uuid, int, text, jsonb) from public, anon, authenticated, service_role;\ngrant execute on function public.hr_login_claim_verify(uuid, int, text, jsonb) to authenticated;\n']],
  },
};

async function run() {
  const fails = [];
  const ok = (arm, cond, msg) => { if (!cond) fails.push(`${arm}: ${msg}`); };

  // ── O1. ONE SOURCE ─────────────────────────────────────────────────────
  const rw = await import(pathToFileURL(join(ROOT, 'src', 'data', 'rewards.js')).href);
  const sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  const lit = /-- BEGIN GENERATED login-catalogue[^\n]*\n\s*'([^']*)'/.exec(sql);
  ok('O1', !!lit, 'the GENERATED login-catalogue literal is missing');
  if (lit) {
    const want = JSON.stringify({ cycle: rw.DAILY_LOGIN_CYCLE, week_bonus: rw.DAILY_LOGIN_WEEK_BONUS,
      max_mult: rw.DAILY_LOGIN_MAX_WEEK_MULT, streak_cap: rw.DAILY_LOGIN_STREAK_CAP });
    ok('O1', lit[1] === want, `the SQL literal ${lit[1]} is not rewards.js ${want}`);
  }
  for (let s = 1; s <= 40; s++) {
    for (const bonus of [true, false]) {
      const p = rw.priceDailyLogin(s, { bonus });
      ok('O1', p.gold === 0 && p.gems === 0 && Object.keys(p.items).length === 0,
        `priceDailyLogin(${s}, bonus ${bonus}) pays ${JSON.stringify(p)}`);
    }
  }

  const { db } = await bootReplay();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const asUser = async (uid, s, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(s, p)).rows[0]?.r; } finally { await db.query('reset role').catch(() => {}); }
  };

  // ── O3. SECOND APPLY IS BYTE-IDENTICAL ─────────────────────────────────
  {
    const snap = async () => JSON.stringify([await inventory(db),
      await q(`select md5(pg_get_functiondef('${VERIFY}'::regprocedure)) as v,
                      md5(pg_get_functiondef('public.hr_login_catalogue()'::regprocedure)) as c`)]);
    const before = await snap();
    let err = null;
    try { await db.exec(sql); } catch (e) { err = String(e.message).split('\n')[0]; }
    ok('O3', !err, `a second apply raised: ${err}`);
    ok('O3', before === await snap(), 'a second apply changed the schema inventory or a login body');
  }

  // ── fixture: one real player through the real character path ───────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q("insert into auth.users (id, instance_id, aud, role, email) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','loginoff@probe.invalid')", [uid]);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await q('insert into public.hr_access_allowlist (user_id) values ($1) on conflict do nothing', [uid]).catch(() => {});
  await q('delete from public.hr_rate_counters');
  await asUser(uid, 'select public.claim_display_name($1) as r', ['LoginProbe']);
  const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
  ok('O2', cr?.ok === true, `CONTROL: the character was not created: ${JSON.stringify(cr)}`);

  // ── O2. A REAL CLAIM IS REFUSED, JOURNALLED, AND PAYS NOTHING ──────────
  const today = (await q('select public.hr_utc_day_key(now()) as d'))[0].d;
  await q(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, state, updated_at)
           values ($1, 0, 'daily', 'login', $2, 1, 'done', now())
           on conflict (user_id, slot, kind, key, period_key) do update set state = 'done', value = 1`, [uid, today]);
  const look = async () => (await q(`select ps.gold::bigint as gold, ps.version::bigint as v,
      (select coalesce(sum(qty), 0)::bigint from public.player_inventory i where i.user_id = ps.user_id and i.slot = ps.slot) as bag,
      (select state from public.player_progress pp where pp.user_id = ps.user_id and pp.slot = ps.slot
         and pp.kind = 'daily' and pp.key = 'login' and pp.period_key = $2) as claim,
      (select coalesce(sum(n), 0)::int from public.hr_rejections r where r.user_id = ps.user_id and r.code = 'login_reward_off') as refused
    from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [uid, today]))[0];
  const start = await look();
  const intent = (await q('select gen_random_uuid() as i'))[0].i;
  const claim = (gold, key) => q('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as r',
    [uid, start.v, key, JSON.stringify({ gold,
      progress_claim: [{ kind: 'daily', key: 'login', period: today }],
      journal: { kind: 'quest', intent: `claim_reward:daily:login:${today}` } })]).then((r) => r[0].r);
  const r1 = await claim(0, intent);
  ok('O2', r1?.ok === false && r1?.error === 'login_reward_off', `a zero claim answered ${JSON.stringify(r1).slice(0, 200)}`);
  const r2 = await claim(300, (await q('select gen_random_uuid() as i'))[0].i);
  ok('O2', r2?.ok === false && r2?.error === 'login_reward_off', `a 300-gold claim answered ${JSON.stringify(r2).slice(0, 200)}`);
  const r3 = await claim(0, intent);
  ok('O2', r3?.ok === false && r3?.error === 'login_reward_off', `a replay answered ${JSON.stringify(r3).slice(0, 200)}`);
  const end = await look();
  ok('O2', end.gold === start.gold && end.bag === start.bag && end.v === start.v,
    `the claim moved state: ${JSON.stringify(start)} -> ${JSON.stringify(end)}`);
  ok('O2', end.claim === 'done', `the claim row is '${end.claim}', not rolled back to 'done'`);
  ok('O2', end.refused - start.refused >= 2, `hr_rejections journalled ${end.refused - start.refused} login_reward_off refusal(s), expected >= 2`);

  await db.close().catch(() => {});
  return fails;
}

async function mutate() {
  let bad = 0;
  for (const [id, m] of Object.entries(MUTATIONS)) {
    let installed = false;
    let why = '';
    try {
      const { db } = await bootReplay({ patches: new Map([[MIG, m.pairs]]), upTo: MIG });
      installed = true;
      await db.close().catch(() => {});
    } catch (e) {
      if (!e.replay) throw e;                         // a harness fault is exit 2, never a catch
      why = String((e.failures || [])[0]?.error || e.message).split('\n')[0];
    }
    const hit = !installed && /demolition-login-catalogue self-check/.test(why);
    console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${id} — ${m.why}${hit ? `\n        refused at install: ${why.slice(0, 160)}` : `\n        saw: ${installed ? 'it installed cleanly' : why}`}`);
    if (!hit) bad += 1;
  }
  return bad;
}

try {
  if (process.argv.includes('--mutate')) process.exit((await mutate()) ? 1 : 0);
  const fails = await run();
  if (fails.length) { console.error('login-reward-off: RED\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('login-reward-off: OK — rewards.js is the literal and pays 0; a real claim is refused login_reward_off, journalled, replay-safe, pays nothing; second apply byte-identical');
} catch (e) {
  console.error('login-reward-off: harness fault —', e?.stack || e);
  process.exit(2);
}
