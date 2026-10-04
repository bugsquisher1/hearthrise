#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bounty-abandon-fee.mjs — THE ABANDON FEE IS THE SERVER'S, AT CHAIN END.
//
//   node tests/bounty-abandon-fee.mjs           the guard
//   node tests/bounty-abandon-fee.mjs --mutate  every planted defect must be CAUGHT
//
// Ships with supabase/migrations/2026-10-04-bounty-abandon-server-fee.sql. Its
// §5 block runs ONCE, at apply. This adds what a §4 block structurally cannot:
//   B1  the file RE-APPLIES byte-identically (full schema inventory + both
//       bodies' md5 + the baseline row, before and after a second apply);
//   B2  as `authenticated`, through the RATE-GATED wrapper PostgREST calls, the
//       retired (slot, reason, LEVEL, REWARD, idem) call does not resolve;
//   B3  an honest abandon is priced from the server's rows (level-15 BH, a
//       40-Mark contract -> 10) and ENDS the contract, so a second abandon is
//       refused and pays nothing; a level-9 BH pays 0;
//   B4  privileges: the ungated body reaches no client role.
// The whole chain is replayed (no upTo): a later migration that restates the
// body back to a client-priced shape must fail HERE.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MIG = '2026-10-04-bounty-abandon-server-fee.sql';
const S5 = '-- ── 5. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) — EXECUTED ─────────────────\ndo $$';
/* Every mutation also turns §5 into an UNCALLED function, so the planted defect
   reaches this file's arms instead of being refused at apply (a mutant the
   migration refuses proves the migration, not this guard). */
const offS5 = [S5, S5.replace('do $$', () => 'create or replace function pg_temp.bafee_s5_off() returns void language plpgsql as $$')];
const MUTATIONS = {
  free_abandon: { why: 'the fee ignores the server level (the forged-level outcome: every abandon free)', expect: 'B3',
    pairs: [offS5, ['    if v_bh_lvl < 10 then\n      v_fee := 0;', '    if true then\n      v_fee := 0;']] },
  contract_survives: { why: 'abandon no longer deletes active_bounty: a second abandon pays twice', expect: 'B3',
    pairs: [offS5, ['    delete from public.active_bounty where user_id = v_uid and slot = v_slot;\n', '']] },
  inner_granted: { why: 'the ungated body is granted to authenticated: the rate gate is decoration', expect: 'B4',
    pairs: [offS5, ['grant  execute on function public.hr_bounty_spend(int, text, text, uuid)           to authenticated;',
      'grant  execute on function public.hr_bounty_spend(int, text, text, uuid)           to authenticated;\n'
      + 'grant  execute on function public.hr_bounty_spend__ungated(int, text, text, uuid) to authenticated;']] },
  not_reentrant: { why: 'the baseline row is inserted without its delete: a second apply is not idempotent', expect: 'B1',
    pairs: [offS5, ["delete from public.hr_client_rpc_baseline where proname = 'hr_bounty_spend';\n", '']] },
};

async function run(mutate) {
  const patches = mutate ? new Map([[MIG, MUTATIONS[mutate].pairs]]) : undefined;
  const { db } = await bootReplay({ patches });
  const fails = [];
  const ok = (arm, cond, msg) => { if (!cond) fails.push(`${arm}: ${msg}`); };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; } finally { await db.query('reset role').catch(() => {}); }
  };
  const bodies = () => q(`select p.proname, md5(p.prosrc) as h, p.proacl::text as acl from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
     and p.proname in ('hr_bounty_spend','hr_bounty_spend__ungated') order by 1`);
  const baseRow = () => q("select identity_args, grantee from public.hr_client_rpc_baseline where proname = 'hr_bounty_spend'");

  // ── B1. SECOND APPLY IS BYTE-IDENTICAL ─────────────────────────────────
  {
    let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
    if (mutate) for (const [f, r] of MUTATIONS[mutate].pairs) sql = sql.replace(f, () => r);
    const before = JSON.stringify([await inventory(db), await bodies(), await baseRow()]);
    let err = null;
    try { await db.exec(sql); } catch (e) { err = String(e.message).split('\n')[0]; }
    ok('B1', !err, `a second apply raised: ${err}`);
    const after = JSON.stringify([await inventory(db), await bodies(), await baseRow()]);
    ok('B1', before === after, 'a second apply changed the schema inventory, a body or the baseline row');
  }

  // ── fixture: one real player through the real character path ───────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q("insert into auth.users (id, instance_id, aud, role, email) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bafee@probe.invalid')", [uid]);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await q('delete from public.hr_rate_counters');
  await asUser(uid, 'select public.claim_display_name($1) as r', ['BafeeProbe']);
  const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
  ok('FIXTURE', cr?.ok === true, `hr_create_character(0) refused: ${JSON.stringify(cr)}`);
  const xpAt = async (lv) => (await q('select xp from public.hr_xp_table where level = $1', [lv]))[0].xp;
  const setUp = async (lv, id, reward, marks) => {
    await q("insert into public.player_skills (user_id, slot, skill_id, xp) values ($1,0,'bountyHunter',$2) on conflict (user_id, slot, skill_id) do update set xp = excluded.xp", [uid, await xpAt(lv)]);
    await q('update public.player_state set marks = $2 where user_id = $1 and slot = 0', [uid, marks]);
    await q(`insert into public.active_bounty (user_id, slot, bounty_id, b_type, difficulty, target, tier, required, baseline, gold_reward, marks_reward, xp_reward)
      values ($1,0,$2,'cull','normal','goblin',1,100,0,100,$3,45)`, [uid, id, reward]);
    await q('delete from public.hr_rate_counters');
  };
  const abandon = (id) => asUser(uid, 'select public.hr_bounty_spend(0, $1, $2, gen_random_uuid()) as r', ['abandon', id]);
  const marks = async () => Number((await q('select marks from public.player_state where user_id = $1 and slot = 0', [uid]))[0].marks);

  // ── B2. THE FORGED-LEVEL CALL DOES NOT RESOLVE ─────────────────────────
  await setUp(15, 'bx-1', 40, 100);
  let forged = null;
  try { await asUser(uid, "select public.hr_bounty_spend(0, 'abandon', 9, 40::bigint, gen_random_uuid()) as r"); }
  catch (e) { forged = String(e.message); }
  ok('B2', /does not exist/.test(forged || ''), `a (slot, reason, level, reward, idem) call resolved: ${forged}`);

  // ── B3. HONEST FEE, FROM THE SERVER'S ROWS; THE CONTRACT ENDS ──────────
  const r1 = await abandon('bx-1');
  ok('B3', r1?.ok === true && Number(r1.fee) === 10 && (await marks()) === 90,
    `level-15 abandon of a 40-Mark contract answered ${JSON.stringify(r1)}, marks ${await marks()} (want fee 10, 90)`);
  await q('delete from public.hr_rate_counters');
  const r2 = await abandon('bx-1');
  ok('B3', r2?.error === 'no_active_bounty' && (await marks()) === 90,
    `a second abandon of the same contract answered ${JSON.stringify(r2)}, marks ${await marks()}`);
  await q('delete from public.active_bounty where user_id = $1', [uid]);
  await setUp(9, 'bx-2', 40, 90);
  const r3 = await abandon('bx-2');
  ok('B3', r3?.ok === true && Number(r3.fee) === 0 && (await marks()) === 90,
    `a level-9 abandon answered ${JSON.stringify(r3)} (want fee 0)`);

  // ── B4. THE UNGATED BODY REACHES NO CLIENT ─────────────────────────────
  const priv = (await q(`select has_function_privilege('authenticated','public.hr_bounty_spend__ungated(int,text,text,uuid)','execute') as a,
    has_function_privilege('anon','public.hr_bounty_spend__ungated(int,text,text,uuid)','execute') as n,
    has_function_privilege('anon','public.hr_bounty_spend(int,text,text,uuid)','execute') as w`))[0];
  ok('B4', !priv.a && !priv.n && !priv.w, `privileges widened: ${JSON.stringify(priv)}`);

  await db.close().catch(() => {});
  return fails;
}

const argv = process.argv.slice(2);
try {
  if (argv.includes('--mutate')) {
    let bad = 0;
    for (const [id, m] of Object.entries(MUTATIONS)) {
      const fails = await run(id);
      const hit = fails.some((f) => f.startsWith(m.expect + ':'));
      console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${id} (${m.expect}) — ${m.why}${hit ? '' : `\n        saw: ${fails.join(' | ') || 'green'}`}`);
      if (!hit) bad++;
    }
    process.exit(bad ? 1 : 0);
  }
  const fails = await run(null);
  if (fails.length) { console.error('bounty-abandon-fee: RED\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('bounty-abandon-fee: OK — second apply byte-identical; forged-level call does not resolve; level-15 abandon pays 10 and ends the contract; second abandon refused; level-9 pays 0; ungated body reaches no client');
} catch (e) {
  console.error('bounty-abandon-fee: HARNESS ERROR — ' + (e && e.message)); process.exit(2);
}
