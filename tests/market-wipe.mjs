#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/market-wipe.mjs — A DECLARED WIPE EMPTIES THE MARKET WITH ITS SWEEP PAUSED, ONCE, AND
//   TOUCHES NOTHING ELSE (Security market review change 3, threat model #12).
//
//   node tests/market-wipe.mjs            the guard
//   node tests/market-wipe.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: supabase/migrations/2027-02-20-market-wipe.sql, supabase/migrations/2027-02-20-market-wipe-resume.sql
//
// supabase/migrations/2027-02-20-market-wipe.sql and -resume.sql are STAGED in
// tests/schema-apply-order.json `excluded`: they run only on Tyler's word. So this guard replays the
// chain CLOSED, as production is, opens the market with its real file, trades through the real verbs,
// and applies each file itself inside one transaction that is rolled back.
//
//   W-ORDER    both files are in `excluded` with a STAGED note, not in `order`; the chain lands with the
//              market off and the sweep scheduled.
//   W-EARLY    the resume file refuses before any wipe ran.
//   W-CONTROL  the threat is real: before the wipe a backdated listing IS returned to Storage by the sweep.
//   W-REFUSE   the wipe refuses with the market ON, and refuses with closed_mode OFF; nothing moved.
//   W-APPLY    with the market off it applies: the three tables are empty, the sweep is unscheduled, one
//              hr_wipe_log row counts what went, and NO character, bag, Storage, purse or ledger row moved.
//   W-BACK     pre-wipe goods cannot come back: the cancel of a pre-wipe listing moves nothing, the sweep
//              returns nothing.
//   W-ONCE     a second apply is a no-op (log row, job and tables identical).
//   W-LOCK     2027-02-14-market-on.sql refuses while the sweep is paused.
//   W-RESUME   the resume file puts the job back exactly as it was; a second resume moves nothing.
//   W-REOPEN   market-on then applies, a new listing lands, and a third apply of the wipe leaves it alone.
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, manifest, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const WIPE = '2027-02-20-market-wipe.sql';
const RESUME = '2027-02-20-market-wipe-resume.sql';
const read = async (f) => (await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8')).replace(/\r\n/g, '\n');
const SRC = { wipe: await read(WIPE), resume: await read(RESUME), on: await read('2027-02-14-market-on.sql'), off: await read('2027-02-14-market-off.sql') };

const A = '000000c1-0000-4000-8000-0000000d0001';
const B = '000000c1-0000-4000-8000-0000000d0002';
const js = (v) => String(JSON.stringify(v === undefined ? null : v));
const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };
const idem = () => crypto.randomUUID();
const asUser = (db, u) => db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)", [u, JSON.stringify({ sub: u, role: 'authenticated' })]);

/* Every table the file must never touch: a player's value and the journal of it. */
const VALUE = ['player_state', 'player_inventory', 'player_equipment', 'player_skills', 'player_ledger', 'account_wallet', 'account_bank', 'hunt_bag'];
const valueSnap = async (db) => {
  const out = {};
  for (const t of VALUE) {
    if (await one(db, 'select to_regclass($1) is not null', ['public.' + t])) {
      out[t] = await one(db, `select count(*)::text || ':' || coalesce(md5(string_agg(md5(x::text), '' order by md5(x::text))), '') from public.${t} x`);
    }
  }
  return out;
};
const counts = async (db) => (await db.query(`select (select count(*) from public.market_listings)::int l, (select count(*) from public.market_sales)::int s,
                                                     (select count(*) from public.market_item_daily)::int d`)).rows[0];
const job = (db) => one(db, "select jsonb_build_object('s', schedule, 'c', command, 'a', active) from cron.job where jobname = 'hr-market-expire'");

async function applyFile(db, sql) {
  await db.query('savepoint apply_file');
  try { await db.exec(sql); await db.query('release savepoint apply_file'); return null; }
  catch (e) { await db.query('rollback to savepoint apply_file'); return String(e.message).split('\n')[0]; }
}

async function trader(db, u) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
  await db.query("insert into public.hr_access_allowlist (user_id, note) values ($1, 'market-wipe') on conflict (user_id) do nothing", [u]);
  await asUser(db, u);
  const c = await one(db, 'select public.hr_create_character(0)');
  if (!c || c.ok !== true) throw Object.assign(new Error('hr_create_character refused: ' + js(c)), { harness: true });
  await db.query('update public.account_wallet set gold = 1000000 where user_id = $1', [u]);
  await db.query('update public.player_state set level_xp = public.hr_char_xp_for_level((select min_level from public.hr_market_config)) where user_id = $1 and slot = 0', [u]);
}

async function scenario(db, src) {
  const red = new Map();
  const arm = (id, pass, good, bad) => {
    if (!MUTATE) console.log(pass ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`);
    if (!pass) red.set(id, bad);
  };
  await db.exec('begin');
  try {
    /* W-ORDER: the chain lands with the market off and the sweep on. */
    const job0 = await job(db);
    const on0 = await one(db, 'select enabled from public.hr_market_config');
    const closed0 = await one(db, "select enabled from public.hr_flags where key = 'closed_mode'");
    arm('W-ORDER+', on0 === false && closed0 === true && !!job0, 'the replayed chain: market off, closed, sweep scheduled',
      `the chain did not land as expected: ${js({ on0, closed0, job0 })}`);

    /* W-EARLY */
    const early = await applyFile(db, src.resume);
    arm('W-EARLY', !!early && /has not run/.test(early), 'the resume file refuses before any wipe ran', `it answered: ${early}`);

    /* A real market: list, buy (a sale, a daily row), two listings left in escrow. */
    const eOn = await applyFile(db, SRC.on);
    if (eOn) throw Object.assign(new Error('market-on: ' + eOn), { harness: true });
    await trader(db, A); await trader(db, B);
    const it = (await db.query(`select m.item_id, m.floor_each::text f from public.hr_market_items m
                                 where m.listable and m.floor_each > 1 and m.ceiling_each < 1000000000
                                   and m.item_id not in (select item_id from public.hr_item_slots) order by m.item_id limit 1`)).rows[0];
    await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, 20)
                    on conflict (user_id, slot, item_id) do update set qty = excluded.qty`, [A, it.item_id]);
    const list = async (qty) => {
      await asUser(db, A);
      const v = await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [A]);
      const r = await one(db, "select public.hr_market_list($1::uuid, 0, $2::bigint, $3::uuid, 'bag', $4, $5::bigint, $6::bigint)", [A, v, idem(), it.item_id, qty, it.f]);
      if (!r || r.ok !== true) throw Object.assign(new Error('list refused: ' + js(r)), { harness: true });
      return r.listed.listing_id;
    };
    const l1 = await list(3); const l2 = await list(2); const l3 = await list(1);
    await asUser(db, B);
    const bought = await one(db, "select public.hr_market_buy($1::uuid, 0, null, $2::uuid, $3::uuid, 1::bigint, $4::bigint, 'storage')", [B, idem(), l1, it.f]);
    if (!bought || bought.ok !== true) throw Object.assign(new Error('buy refused: ' + js(bought)), { harness: true });
    await asUser(db, A);
    const c0 = await counts(db);
    if (!(c0.l >= 3 && c0.s >= 1 && c0.d >= 1)) throw Object.assign(new Error('the market did not trade: ' + js(c0)), { harness: true });

    /* W-CONTROL: the threat is real. Backdated, the sweep DOES hand the goods to Storage. */
    await db.query('savepoint control');
    await db.query("update public.market_listings set expires_at = now() - interval '1 hour' where id = $1", [l3]);
    const storedBefore = await one(db, "select coalesce(sum(qty), 0)::int from public.account_bank where user_id = $1 and item_id = $2", [A, it.item_id]);
    await db.query('select public.hr_market_expire(200, null)');
    const storedAfter = await one(db, "select coalesce(sum(qty), 0)::int from public.account_bank where user_id = $1 and item_id = $2", [A, it.item_id]);
    await db.query('rollback to savepoint control');
    arm('W-CONTROL', storedAfter === storedBefore + 1, 'before the wipe the sweep returns a lapsed listing to Storage (the threat the wipe closes)',
      `the control did not hold: Storage ${storedBefore} -> ${storedAfter}`);

    /* W-REFUSE */
    const eMarketOn = await applyFile(db, src.wipe);
    const cOn = await counts(db);
    const eOff = await applyFile(db, SRC.off);
    if (eOff) throw Object.assign(new Error('market-off: ' + eOff), { harness: true });
    await db.query("update public.hr_flags set enabled = false where key = 'closed_mode'");
    const eOpen = await applyFile(db, src.wipe);
    const cOpen = await counts(db);
    await db.query("update public.hr_flags set enabled = true where key = 'closed_mode'");
    arm('W-REFUSE', /the market is ON/.test(eMarketOn || '') && /closed_mode is not ON/.test(eOpen || '')
        && js(cOn) === js(c0) && js(cOpen) === js(c0) && !!(await job(db)),
      'the wipe refuses with the market on and with the game open; listings, sales and the sweep unmoved',
      `refusals: ${js({ eMarketOn, eOpen, cOn, cOpen })}`);

    /* W-APPLY */
    const v0 = await valueSnap(db);
    const eApply = await applyFile(db, src.wipe);
    const c1 = await counts(db);
    const job1 = await job(db);
    const v1 = await valueSnap(db);
    const log = (await db.query("select removed, kept from public.hr_wipe_log where wipe_key = 'market-first-wipe'")).rows[0];
    arm('W-APPLY', eApply === null && c1.l === 0 && c1.s === 0 && c1.d === 0 && job1 === undefined
        && !!log && log.removed.market_listings === c0.l && log.removed.market_sales === c0.s && log.removed.market_item_daily === c0.d
        && js(v0) === js(v1) && Object.keys(v0).length >= 6,
      `the three tables are empty (${c0.l} listings, ${c0.s} sales, ${c0.d} daily rows journalled), the sweep is unscheduled, ${Object.keys(v0).length} value tables byte-identical`,
      `apply ${eApply || 'ok'}; ${js({ c1, job1, log, moved: Object.keys(v0).filter((k) => v0[k] !== v1[k]) })}`);

    /* W-BACK */
    await db.query('savepoint back');
    const cancel = await one(db, 'select public.hr_market_cancel($1::uuid, 0, $2::uuid, $3::uuid)', [A, idem(), l2]);
    const swept = await one(db, 'select public.hr_market_expire(200, null)');
    const v2 = await valueSnap(db);
    await db.query('rollback to savepoint back');
    arm('W-BACK', !!cancel && cancel.ok !== true && js(v2) === js(v0),
      `a pre-wipe listing cannot come back: cancel answers ${js(cancel && cancel.error)}, the sweep returns nothing (${js(swept)}), no value table moved`,
      `goods came back: ${js({ cancel, swept, moved: Object.keys(v0).filter((k) => v0[k] !== v2[k]) })}`);

    /* W-ONCE */
    const s1 = js((await db.query("select wipe_key, wiped_at, removed, kept from public.hr_wipe_log where wipe_key = 'market-first-wipe'")).rows);
    const eTwice = await applyFile(db, src.wipe);
    const s2 = js((await db.query("select wipe_key, wiped_at, removed, kept from public.hr_wipe_log where wipe_key = 'market-first-wipe'")).rows);
    arm('W-ONCE', eTwice === null && s1 === s2 && (await job(db)) === undefined, 'a second apply is a no-op: the journal row and the paused sweep unmoved',
      `second apply: ${eTwice || 'ok'}; log ${s1 === s2 ? 'same' : 'MOVED'}`);

    /* W-LOCK */
    const eLocked = await applyFile(db, SRC.on);
    arm('W-LOCK', /sweep is not scheduled/.test(eLocked || ''), 'market-on refuses while the sweep is paused',
      `market-on answered: ${eLocked || 'applied'}`);

    /* W-RESUME */
    const eRes = await applyFile(db, src.resume);
    const job2 = await job(db);
    const eRes2 = await applyFile(db, src.resume);
    const job3 = await job(db);
    arm('W-RESUME', eRes === null && eRes2 === null && js(job2) === js(job0) && js(job3) === js(job0),
      `the sweep is back exactly as it was (${job2 && job2.s}, ${job2 && job2.c}); a second resume moves nothing`,
      `resume ${eRes || 'ok'} / ${eRes2 || 'ok'}; was ${js(job0)}, now ${js(job2)} then ${js(job3)}`);

    /* W-REOPEN */
    const eReopen = await applyFile(db, SRC.on);
    let l4 = null;
    if (eReopen === null) l4 = await list(1);
    const eThird = await applyFile(db, src.wipe);
    const still = await one(db, 'select count(*)::int from public.market_listings where id = $1', [l4]);
    arm('W-REOPEN', eReopen === null && !!l4 && eThird === null && still === 1,
      'market-on applies after the resume, a new listing lands, and a third apply of the wipe leaves it alone',
      `reopen ${eReopen || 'ok'}, listing ${l4}, third ${eThird || 'ok'}, still ${still}`);
  } finally {
    await db.exec('rollback');
  }
  return red;
}

/* The file's own §2 would refuse most of these before behaviour runs; the mutants neuter it where the arm is the judge. */
const MUTANTS = [
  { id: 'open_market', arm: 'W-REFUSE', file: 'wipe', why: 'the wipe runs with the market on: a listing can land during it',
    edits: [["  if (select enabled from public.hr_market_config) is distinct from false then\n    raise exception 'PRECONDITION: the market is ON", "  if false then\n    raise exception 'PRECONDITION: the market is ON"]] },
  { id: 'open_game', arm: 'W-REFUSE', file: 'wipe', why: 'the wipe runs in an open game',
    edits: [["  if not coalesce((select enabled from public.hr_flags where key = 'closed_mode'), false) then", '  if false then']] },
  { id: 'sweep_not_paused', arm: 'W-APPLY', file: 'wipe', why: 'the sweep keeps running through the wipe (its own §2 neutered too)',
    edits: [["  perform public.hr_cron_drop('hr-market-expire');\n", ''],
            ["  if exists (select 1 from cron.job where jobname = 'hr-market-expire') then\n    raise exception 'market-wipe §2", "  if false then\n    raise exception 'market-wipe §2"]] },
  { id: 'escrow_left', arm: 'W-BACK', file: 'wipe', why: 'the listings stay behind: a cancel hands the goods back (its own §2 neutered too)',
    edits: [['  truncate table public.market_listings, public.market_sales, public.market_item_daily continue identity restrict;', '  truncate table public.market_sales, public.market_item_daily continue identity restrict;'],
            ["    if v_n <> 0 then raise exception 'market-wipe §2: public.% still holds % rows', t, v_n; end if;", '    null;']] },
  { id: 'history_left', arm: 'W-APPLY', file: 'wipe', why: 'the old economy\'s prices survive (its own §2 neutered too)',
    edits: [['  truncate table public.market_listings, public.market_sales, public.market_item_daily continue identity restrict;', '  truncate table public.market_listings continue identity restrict;'],
            ["    if v_n <> 0 then raise exception 'market-wipe §2: public.% still holds % rows', t, v_n; end if;", '    null;']] },
  { id: 'touches_a_bag', arm: 'W-APPLY', file: 'wipe', why: 'the file reaches into a character\'s bag',
    edits: [['  insert into public.hr_wipe_log (wipe_key, removed, kept)', "  delete from public.player_inventory where qty = 20;\n  insert into public.hr_wipe_log (wipe_key, removed, kept)"]] },
  { id: 'touches_a_purse', arm: 'W-APPLY', file: 'wipe', why: 'the file moves an account\'s gold',
    edits: [['  insert into public.hr_wipe_log (wipe_key, removed, kept)', "  update public.account_wallet set gold = gold + 1 where gold > 0;\n  insert into public.hr_wipe_log (wipe_key, removed, kept)"]] },
  { id: 'no_fence', arm: 'W-ONCE', file: 'wipe', why: 'a re-apply is not a no-op',
    edits: [['  if exists (select 1 from public.hr_wipe_log where wipe_key = c_key) then\n', '  if false then\n']] },
  { id: 'wrong_schedule', arm: 'W-RESUME', file: 'resume', why: 'the sweep comes back on another schedule (its own check neutered too)',
    edits: [["perform public.hr_cron_ensure(v_was->>'jobname', v_was->>'schedule', v_was->>'command');", "perform public.hr_cron_ensure(v_was->>'jobname', '0 0 1 1 *', v_was->>'command');"],
            ["  if not found or not v_job.active or v_job.schedule is distinct from v_was->>'schedule'\n     or v_job.command is distinct from v_was->>'command' then", '  if false then']] },
  { id: 'resume_anywhere', arm: 'W-EARLY', file: 'resume', why: 'the resume runs with no wipe behind it',
    edits: [["  if not found then\n    raise exception 'PRECONDITION: 2027-02-20-market-wipe.sql has not run", "  if false then\n    raise exception 'PRECONDITION: 2027-02-20-market-wipe.sql has not run"]] },
];

function plant(sql, edits) {
  let s = sql;
  for (const [find, repl] of edits) {
    const n = s.split(find).length - 1;
    if (n !== 1) throw Object.assign(new Error(`mutant anchor matched ${n} times: ${find.slice(0, 70)}`), { harness: true });
    s = s.replace(find, () => repl);
  }
  return s;
}

async function main() {
  const m = await manifest();
  let db;
  try { ({ db } = await bootReplay({ keepClosed: true })); }
  catch (e) { console.error(`market-wipe: HARNESS — ${e.message}`); process.exit(2); }
  try {
    if (!MUTATE) {
      console.log('\nmarket-wipe — the market\'s half of a declared wipe, on the replayed chain\n');
      const staged = (f) => Object.prototype.hasOwnProperty.call(m.excluded || {}, f) && /\bSTAGED\b/.test(String(m.excluded[f] || ''))
        && !(m.order || []).includes(f) && !(m.pre_schema || []).includes(f);
      const orderOk = staged(WIPE) && staged(RESUME);
      console.log(orderOk ? `  ✓ W-ORDER — ${WIPE} and ${RESUME} are STAGED in \`excluded\`, never replayed`
        : '  ✗ W-ORDER — both files must be in `excluded` with a STAGED note and not in `order`');
      let red;
      try { red = await scenario(db, SRC); }
      catch (e) { console.error(`market-wipe: HARNESS — ${String(e.message).split('\n')[0]}`); process.exit(2); }
      const n = red.size + (orderOk ? 0 : 1);
      console.log(n ? `\nmarket-wipe: RED (${n})` : '\nmarket-wipe: green');
      process.exitCode = n ? 1 : 0;
      return;
    }
    console.log('\nmarket-wipe --mutate\n');
    let survived = 0;
    for (const mu of MUTANTS) {
      const src = { ...SRC };
      try { if (!CONTROL) src[mu.file] = plant(SRC[mu.file], mu.edits); }
      catch (e) { console.error(`market-wipe: HARNESS — ${e.message}`); process.exit(2); }
      let red;
      try { red = await scenario(db, src); }
      catch (e) {
        if (e.harness) { console.error(`market-wipe: HARNESS — ${mu.id}: ${String(e.message).split('\n')[0]}`); process.exit(2); }
        throw e;
      }
      const caught = red.has(mu.arm);
      console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})`
        : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red arms: ${[...red.keys()].join(', ') || 'none'}`);
      if (!caught) survived++;
    }
    console.log(survived ? `\nmarket-wipe --mutate: ${survived} survived` : `\nmarket-wipe --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
    process.exitCode = survived ? 1 : 0;
  } finally {
    await db.close().catch(() => {});
  }
}

await main();
