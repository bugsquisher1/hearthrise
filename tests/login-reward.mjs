#!/usr/bin/env node
// ============================================================================
// tests/login-reward.mjs — THE DAILY LOGIN REWARD: SUPPLIES, A x3 CAP, AND A
//                          MISSED DAY COSTS ONE STEP. BOTH HALVES AGREE, AND
//                          THE DATABASE REFUSES ANY OTHER PRICE.
//
//   node tests/login-reward.mjs            the guard (one replay of the chain)
//   node tests/login-reward.mjs --mutate   every mutant must turn its arm red
//                                          (JS mutants in a COPY of src/ and the
//                                          function dir; SQL mutants planted in a
//                                          replay of the chain)
//
// supabase/migrations/2026-10-16-login-reward.sql re-prices every daily:login
// claim inside hr_apply; src/data/rewards.js prices it for the edge and for the
// sheet. Two implementations of one rule, so this file holds them together by
// RUNNING both, not by reading either.
//
// THE ARMS
//   L1  THE GENERATED CATALOGUE. The jsonb literal between the migration's
//       BEGIN/END GENERATED markers is byte-equal to the one rewards.js
//       produces, and every id it pays is a real ITEMS row.
//   L2  PRICE PARITY. hr_login_price(s) equals priceDailyLogin(s) for every
//       streak 1..120 — gold, gems, items, cycle day, weeks, multiplier — and
//       the multiplier never passes x3.
//   L3  STREAK PARITY. For every (last value 1..40, gap 1..9) and for an
//       unclaimed last row, hr_login_streak equals deriveLoginStreak over the
//       `last` hr_claim_lookup returns. A missed day costs one step; a long
//       streak wraps one week back past the ceiling.
//   L4  THE PLAYED PATH (CLAUDE.md §4 both paths: the edge's claim through the
//       real hr_apply, and the database's own re-price). A fresh character
//       claims day 1; a day passes and it claims day 2; it MISSES a day and the
//       next claim is day 2 again (one step back, not day 1); the claim after
//       the miss is day 3. Every claim pays exactly the catalogue price, in gold
//       and in the bag, and the receipt says so.
//   L5  THE DATABASE REFUSES ANY OTHER PRICE. After the miss, the old rule's
//       reset-to-day-1 price, an uncapped week-15 price and a forged extra item
//       are each refused login_price_mismatch by hr_apply and move nothing.
//   L6  BOTH W0 FILES RE-APPLY BYTE-IDENTICALLY on the chain end (this file and
//       2026-10-16-goal-board-retire.sql), their own §4 passing a second time.
//
// THE MUTANTS (--mutate)
//   JS  a missed day resets the streak -> L3 · the multiplier loses its cap
//       (overflow) -> L2 · the streak never wraps -> L3 · an unclaimed row
//       counts -> L3 · the edge stops sending the supplies -> L4
//   SQL a missed day resets the streak · the multiplier loses its cap · the
//       verify is unwired from hr_apply -> the migration's own §4 refuses
//
// Exit: 0 green (or, under --mutate, every mutant caught) · 1 red · 2 harness.
// NO ?v= on the imports (tests/**, b332).
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const OWN_SQL = '2026-10-16-login-reward.sql';
const UID = '00000000-0000-4000-c000-0000010a1d77';

const JS_MUTANTS = [
  { name: 'a missed day resets the streak to day 1', arm: 'L3', file: 'src/data/rewards.js',
    edits: [['  const s = v + 1 - (gap - 1);', '  const s = gap > 1 ? 1 : v + 1;']] },
  { name: 'the multiplier loses its cap (overflow)', arm: 'L2', file: 'src/data/rewards.js',
    edits: [['  const mult = Math.min(DAILY_LOGIN_MAX_WEEK_MULT, 1 + weeksDone * DAILY_LOGIN_WEEK_BONUS);',
      '  const mult = 1 + weeksDone * DAILY_LOGIN_WEEK_BONUS;']] },
  { name: 'the streak never wraps past the ceiling', arm: 'L3', file: 'src/data/rewards.js',
    edits: [['  if (s <= DAILY_LOGIN_STREAK_CAP) return s;', '  return s;']] },
  { name: 'an unclaimed last row continues the streak', arm: 'L3', file: 'src/data/rewards.js',
    edits: [["  if (!last || typeof last !== 'object' || last.state !== 'claimed') return 1;",
      "  if (!last || typeof last !== 'object') return 1;"]] },
  { name: 'the edge stops sending the supplies', arm: 'L4', file: 'supabase/functions/hr-accrue/claim-reward.js',
    edits: [['  if (priced.items && Object.keys(priced.items).length) delta.items = { ...priced.items };', '']] },
];

const SQL_MUTANTS = [
  { name: 'a missed day resets the streak (hr_login_streak)', expect: /self-check \(f\)/,
    from: '  v_s := v_val + 1 - (v_gap - 1);', to: '  v_s := case when v_gap > 1 then 1 else v_val + 1 end;' },
  { name: 'the multiplier loses its cap (hr_login_price)', expect: /self-check \(a\)/,
    from: "  v_mult  := least((c_cat->>'max_mult')::numeric, 1 + v_weeks * (c_cat->>'week_bonus')::numeric);",
    to: "  v_mult  := 1 + v_weeks * (c_cat->>'week_bonus')::numeric;" },
  { name: 'the re-price is unwired from hr_apply', expect: /self-check \((b|d)\)/,
    from: "          perform public.hr_login_claim_verify(v_uid, v_slot, coalesce(v_prog->>'period', ''), p_delta);",
    to: '          null;' },
];

async function load(base) {
  const bust = `?t=${Date.now()}${Math.random()}`;
  const rw = await import(pathToFileURL(join(base, 'src', 'data', 'rewards.js')).href + bust);
  const cr = await import(pathToFileURL(join(base, 'supabase', 'functions', 'hr-accrue', 'claim-reward.js')).href + bust);
  return { rw, cr };
}

async function mutantBase(m) {
  const base = await mkdtemp(join(tmpdir(), 'hr-login-'));
  await cp(join(ROOT, 'supabase', 'functions'), join(base, 'supabase', 'functions'), { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  const path = join(base, m.file);
  let src = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
  for (const [from, to] of m.edits) {
    if (src.split(from).length !== 2) {
      console.error(`--mutate ${m.name}: marker not exactly once in ${m.file} — "${from.slice(0, 80)}"`);
      process.exit(2);
    }
    src = src.replace(from, () => to);
  }
  await writeFile(path, src, 'utf8');
  return base;
}

const sameItems = (a, b) => {
  const ka = Object.keys(a || {}).sort(); const kb = Object.keys(b || {}).sort();
  return ka.join(',') === kb.join(',') && ka.every((k) => Number(a[k]) === Number(b[k]));
};

/* THE SEAM, as index.ts hands it to the intent: one statement per call, as
   hr_engine, which holds no table privilege anywhere. */
function makeExec(db) {
  return async (text, params) => {
    await db.exec('set role hr_engine');
    try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
  };
}

async function runArms(db, mods) {
  const { rw, cr } = mods;
  const fails = [];
  const fail = (arm, msg) => fails.push(`${arm}: ${msg}`);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  // L1 — the generated literal is rewards.js, byte for byte, and pays real items.
  {
    const want = JSON.stringify({
      cycle: rw.DAILY_LOGIN_CYCLE, week_bonus: rw.DAILY_LOGIN_WEEK_BONUS,
      max_mult: rw.DAILY_LOGIN_MAX_WEEK_MULT, streak_cap: rw.DAILY_LOGIN_STREAK_CAP,
    });
    const sql = (await readFile(join(ROOT, 'supabase', 'migrations', OWN_SQL), 'utf8')).replace(/\r\n/g, '\n');
    const m = /-- BEGIN GENERATED login-catalogue[^\n]*\n\s*'([^']*)'\n\s*-- END GENERATED login-catalogue/.exec(sql);
    if (!m) fail('L1', 'the GENERATED login-catalogue block is missing from the migration');
    else if (m[1] !== want) fail('L1', `the migration's catalogue drifted from src/data/rewards.js:\n      sql ${m[1]}\n      js  ${want}`);
    const { ITEMS } = await import(pathToFileURL(join(ROOT, 'src', 'data', 'items.js')).href);
    for (const d of rw.DAILY_LOGIN_CYCLE) {
      for (const id of Object.keys({ ...(d.items || {}), ...(d.keys || {}) })) {
        if (!ITEMS[id]) fail('L1', `the cycle pays '${id}', which is not an ITEMS row`);
      }
    }
  }

  // L2 — price parity over every streak, and the cap holds.
  for (let s = 1; s <= 120; s++) {
    const js = rw.priceDailyLogin(s);
    const sq = (await one('select public.hr_login_price($1::int) as p', [s])).p;
    if (Number(sq.gold) !== js.gold || Number(sq.gems) !== js.gems || !sameItems(sq.items, js.items)
        || Number(sq.cycle_day) !== js.cycleDay || Number(sq.weeks) !== js.weeksDone || Number(sq.mult) !== js.mult) {
      fail('L2', `streak ${s}: SQL ${JSON.stringify(sq)} vs JS ${JSON.stringify(js)}`);
      break;
    }
    if (js.mult > 3 || Number(sq.mult) > 3) { fail('L2', `streak ${s} multiplies x${js.mult} / x${sq.mult}, past x3`); break; }
  }

  // L3 — the streak rule, both halves, over the server's own `last`.
  await db.query(`insert into auth.users (id) values ($1) on conflict (id) do nothing`, [UID]);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [UID]);
  await db.query('select public.hr_create_character(0)');
  await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  const clearLogin = () => db.query(`delete from public.player_progress where user_id = $1 and kind = 'daily' and key = 'login'`, [UID]);
  const putRow = (daysAgo, value, state) => db.query(
    `insert into public.player_progress (user_id, slot, kind, key, period_key, value, state)
     values ($1, 0, 'daily', 'login', public.hr_utc_day_key(now() - make_interval(days => $2::int)), $3, $4)`,
    [UID, daysAgo, value, state]);
  const lookup = async () => (await one(`select public.hr_claim_lookup($1::uuid, 0, 'daily', 'login') as l`, [UID])).l;
  const sqlStreak = async () => Number((await one('select public.hr_login_streak($1::uuid, 0) as s', [UID])).s);
  l3: for (const state of ['claimed', 'done']) {
    for (let v = 1; v <= 40; v++) {
      for (let gap = 1; gap <= 9; gap++) {
        if (state === 'done' && (v > 3 || gap > 2)) continue;
        await clearLogin(); await putRow(gap, v, state);
        const lk = await lookup();
        const js = rw.deriveLoginStreak(lk);
        const sq = await sqlStreak();
        const rule = state !== 'claimed' ? 1 : (() => {
          const s = v + 1 - (gap - 1);
          if (s < 1) return 1;
          return s <= 35 ? s : 28 + ((s - 1) % 7) + 1;
        })();
        if (js !== sq || js !== rule) {
          fail('L3', `last ${state} value ${v} gap ${gap}: JS ${js}, SQL ${sq}, the rule ${rule} (lookup.last ${JSON.stringify(lk && lk.last)})`);
          break l3;
        }
      }
    }
  }
  {
    await clearLogin();
    if (rw.deriveLoginStreak(await lookup()) !== 1 || await sqlStreak() !== 1) fail('L3', 'no claim history is not day 1');
    /* hr_claim_last returns CLAIMED rows only, so the JS state check never sees
       another state from the server; it is defence in depth for any other
       caller, pinned here directly. */
    if (rw.deriveLoginStreak({ last: { value: 9, gap: 1, state: 'done' } }) !== 1) {
      fail('L3', 'an unclaimed last row continues the JS streak');
    }
  }

  // L4 — the played path, through the edge and the real hr_apply.
  const exec = makeExec(db);
  const claim = async () => {
    await db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);
    return cr.runClaimReward({ exec, user: UID, slot: 0, intentId: crypto.randomUUID(), reward: { kind: 'daily', key: 'login' } });
  };
  const wallet = async () => {
    const st = await one('select gold, gems from public.player_state where user_id = $1 and slot = 0', [UID]);
    const inv = {};
    for (const r of (await db.query('select item_id, qty from public.player_inventory where user_id = $1 and slot = 0', [UID])).rows) inv[r.item_id] = Number(r.qty);
    return { gold: Number(st.gold), gems: Number(st.gems), inv };
  };
  const paid = (a, b) => {
    const items = {};
    for (const k of new Set([...Object.keys(a.inv), ...Object.keys(b.inv)])) {
      const d = (b.inv[k] || 0) - (a.inv[k] || 0); if (d) items[k] = d;
    }
    return { gold: b.gold - a.gold, gems: b.gems - a.gems, items };
  };
  /* A day passing, played by the harness: PGlite has one clock, so today's
     claimed row is MOVED back (older rows dropped first, as only the last claim
     is ever read). The day keys stay the server's own. */
  const shiftToday = async (daysAgo) => {
    await db.query(`delete from public.player_progress where user_id = $1 and kind = 'daily' and key = 'login'
                     and period_key <> public.hr_utc_day_key(now())`, [UID]);
    await db.query(
      `update public.player_progress set period_key = public.hr_utc_day_key(now() - make_interval(days => $2::int))
        where user_id = $1 and kind = 'daily' and key = 'login' and period_key = public.hr_utc_day_key(now())`, [UID, daysAgo]);
  };
  const step = async (label, wantStreak) => {
    const before = await wallet();
    const r = await claim();
    const after = await wallet();
    const want = rw.priceDailyLogin(wantStreak);
    const got = paid(before, after);
    if (r.status !== 200 || !r.body || r.body.ok !== true) {
      fail('L4', `${label}: the claim was refused ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`); return false;
    }
    if (r.body.granted.streak !== wantStreak) fail('L4', `${label}: streak ${r.body.granted.streak}, expected ${wantStreak}`);
    if (got.gold !== want.gold || got.gems !== want.gems || !sameItems(got.items, want.items)) {
      fail('L4', `${label}: paid ${JSON.stringify(got)}, the catalogue says ${JSON.stringify({ gold: want.gold, gems: want.gems, items: want.items })}`);
    }
    if (!sameItems(r.body.granted.items, want.items) || r.body.granted.gold !== want.gold) {
      fail('L4', `${label}: the receipt says ${JSON.stringify(r.body.granted)}`);
    }
    return true;
  };
  await clearLogin();
  if (await step('first claim', 1)) {
    await shiftToday(1);
    if (await step('the next day', 2)) {
      await shiftToday(2);                            // claimed two days ago: yesterday was missed
      if (await step('after a missed day (one step back, not day 1)', 2)) {
        await shiftToday(1);
        await step('the claim after the miss', 3);
      }
    }
  }
  {
    const again = await claim();
    if (again.body && again.body.ok !== false) fail('L4', 'a second claim the same day was paid');
  }

  // L5 — the database refuses any other price, and moves nothing.
  {
    await clearLogin();
    await putRow(2, 5, 'claimed');                     // day 5 two days ago: today is day 5
    const forge = async (label, gold, items, add) => {
      const before = await wallet();
      const v = (await one('select version from public.player_state where user_id = $1 and slot = 0', [UID])).version;
      const day = (await one('select public.hr_utc_day_key(now()) as d')).d;
      const delta = {
        gold, ...(Object.keys(items).length ? { items } : {}),
        progress: [{ kind: 'daily', key: 'login', period: day, add, state: 'done' }],
        progress_claim: [{ kind: 'daily', key: 'login', period: day }],
        journal: { kind: 'quest', intent: `claim_reward:daily:login:${day}` },
      };
      await db.exec('set role hr_engine');
      let res;
      try {
        res = (await db.query('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as r',
          [UID, v, crypto.randomUUID(), JSON.stringify(delta)])).rows[0].r;
      } finally { await db.exec('reset role'); }
      const after = await wallet();
      if (!res || res.error !== 'login_price_mismatch') fail('L5', `${label} returned ${JSON.stringify(res).slice(0, 200)}`);
      if (after.gold !== before.gold || !sameItems(after.inv, before.inv)) fail('L5', `${label} moved value`);
    };
    const one1 = rw.priceDailyLogin(1);
    await forge('the old reset-to-day-1 price after a miss', one1.gold, one1.items, 1);
    const uncapped = Math.round(rw.DAILY_LOGIN_CYCLE[4].gold * (1 + 14 * rw.DAILY_LOGIN_WEEK_BONUS));
    await forge('an uncapped week-15 price', uncapped, rw.priceDailyLogin(5).items, 5);
    const p5 = rw.priceDailyLogin(5);
    await forge('an extra Bone Key on the honest price', p5.gold, { ...p5.items, bone_key: 1 }, 5);
    // CONTROL: the honest price for the same state is paid.
    const before = await wallet();
    const ok5 = await claim();
    const got = paid(before, await wallet());
    if (!(ok5.body && ok5.body.ok === true && ok5.body.granted.streak === 5 && got.gold === p5.gold)) {
      fail('L5', `CONTROL: the honest day-5 claim after the miss was not paid (${JSON.stringify(ok5.body).slice(0, 200)})`);
    }
  }
  // L6 — both W0 files re-apply byte-identically on the chain end (§4 runs again).
  if (mods.secondApply) {
    const snap = async () => (await db.query(`select string_agg(p.proname || ':' || md5(pg_get_functiondef(p.oid)), ',' order by p.proname) s
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('hr_apply', 'hr_claim_lookup', 'hr_rpc_gate', 'hr_tally_state',
         'hr_login_catalogue', 'hr_login_price', 'hr_claim_last', 'hr_login_streak', 'hr_login_claim_verify')`)).rows[0].s;
    const before = await snap();
    for (const file of [OWN_SQL, '2026-10-16-goal-board-retire.sql']) {
      const sql = (await readFile(join(ROOT, 'supabase', 'migrations', file), 'utf8')).replace(/\r\n/g, '\n');
      try { await db.exec(sql); } catch (e) { fail('L6', `a second apply of ${file} RAISED: ${String(e.message).split('\n')[0]}`); }
    }
    const after = await snap();
    if (before !== after) fail('L6', `a second apply changed a body:\n      ${before}\n   -> ${after}`);
  }
  return fails;
}

async function boot(patches) {
  const { bootReplay, LAST_PATCHED } = await import('./schema-replay.mjs');
  return bootReplay(patches ? { patches, upTo: LAST_PATCHED, tolerant: true } : {});
}

async function main() {
  if (!MUTATE) {
    const { db, failures } = await boot();
    if (failures && failures.length) {
      console.log(`  ✗ the chain does not replay: ${failures.map((f) => `${f.file}: ${String(f.error).split('\n')[0]}`).join('; ')}`);
      process.exit(1);
    }
    const fails = await runArms(db, { ...(await load(ROOT)), secondApply: true });
    try { await db.close(); } catch { /* the replay owns its lifetime */ }
    for (const f of fails) console.log(`  ✗ ${f}`);
    console.log(fails.length ? `login-reward: RED (${fails.length})`
      : 'login-reward: green — the generated cycle is rewards.js, SQL and JS price and streak alike over every case, '
        + 'a played claim / missed day / claim after the miss pays exactly the catalogue, and hr_apply refuses any other price');
    process.exit(fails.length ? 1 : 0);
  }
  console.log('login-reward --mutate');
  let escaped = 0;
  {
    const { db, failures } = await boot();
    if (failures && failures.length) { console.error('  the unmutated chain does not replay — a mutant run proves nothing'); process.exit(1); }
    const clean = await runArms(db, await load(ROOT));
    try { await db.close(); } catch { /* */ }
    if (clean.length) { console.error(`  the unmutated tree is RED (${clean[0]}) — a mutant run proves nothing`); process.exit(1); }
  }
  for (const m of JS_MUTANTS) {
    const { db } = await boot();
    const fails = await runArms(db, await load(await mutantBase(m)));
    try { await db.close(); } catch { /* */ }
    const caught = fails.some((f) => f.startsWith(`${m.arm}:`));
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  JS  ${m.name} -> ${m.arm}${caught ? `   ${fails.find((f) => f.startsWith(m.arm)).slice(0, 140)}` : ' stayed green'}`);
    if (!caught) escaped++;
  }
  for (const m of SQL_MUTANTS) {
    let verdict = 'APPLIED';
    try {
      const { failures, db } = await boot(new Map([[OWN_SQL, [[m.from, m.to]]]]));
      const f = (failures || []).find((x) => x.file === OWN_SQL);
      if (f) verdict = f.error;
      try { await db.close(); } catch { /* */ }
    } catch (e) {
      if (e && e.harness) { console.error(`  harness — ${m.name}: ${String(e.message).split('\n')[0]}`); process.exit(2); }
      verdict = String((e && e.message) || e);
    }
    const caught = verdict !== 'APPLIED' && m.expect.test(verdict);
    console.log(`  ${caught ? 'caught ' : 'ESCAPED'}  SQL ${m.name}${caught ? '' : ` (${String(verdict).split('\n')[0].slice(0, 160)})`}`);
    if (!caught) escaped++;
  }
  console.log(escaped ? `--mutate: ${escaped} mutant(s) ESCAPED` : '--mutate: every mutant caught');
  process.exit(escaped ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
