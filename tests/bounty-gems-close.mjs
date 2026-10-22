#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bounty-gems-close.mjs — AT CHAIN END THE BOUNTY BOARD PAYS NOTHING
//                               AND NO GEM CAN BE MINTED (BETA_PLAN K4 + K37).
//
//   node tests/bounty-gems-close.mjs           the guard (whole chain)
//   node tests/bounty-gems-close.mjs --mutate  every planted defect must be CAUGHT
//
// Ships with supabase/migrations/2026-10-23-demolition-bounty-gems-close.sql.
// Its §4 runs once, at apply. This adds what a §4 cannot:
//   G1  the file RE-APPLIES byte-identically (schema inventory + the wallet
//       body + the baseline rows, before and after a second apply);
//   G2  as `authenticated`, hr_accept_bounty / hr_claim_bounty / hr_bounty_spend
//       do not resolve (a devtools call pays nothing), and no bounty function
//       is client-executable at all;
//   G3  a REAL mint path is refused end to end: the start kit is set to pay
//       one gem and hr_create_character runs as the player; the credit refuses
//       gems_retired and the account wallet holds 0 gems with 0 grant rows;
//   G4  hr_wallet_credit is owner-only (no client, no hr_engine).
// --mutate plants the defects this lane is about into the file and requires
// each to be refused at install by its §4 (a bug that cannot be applied beats
// one that is detected) or caught by a named arm here.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MIG = '2026-10-23-demolition-bounty-gems-close.sql';
const WALLET = 'public.hr_wallet_credit(uuid,integer,bigint,text,timestamp with time zone)';

const MUTATIONS = {
  credit_still_pays: {
    why: 'hr_wallet_credit keeps a working body: gems can still be minted',
    pairs: [["  perform public.hr_reject('gems_retired',\n    jsonb_build_object('gems', p_gems, 'key', p_key, 'why', 'gems are not in the game'));\n  return null;",
      "  update public.account_wallet set gems = gems + p_gems where user_id = p_uid;\n  return jsonb_build_object('ok', true, 'paid', p_gems);"]],
  },
  claim_survives: {
    why: 'hr_claim_bounty is left in place: the turn-in still pays gold and XP',
    pairs: [['drop function if exists public.hr_claim_bounty(integer);\n', '']],
  },
  baseline_row_kept: {
    why: 'a dropped RPC keeps its client baseline row (an approval for a body that is gone)',
    pairs: [["\n where proname in ('hr_accept_bounty', 'hr_claim_bounty', 'hr_bounty_spend');",
      "\n where proname in ('hr_accept_bounty', 'hr_bounty_spend');"]],
  },
  credit_client_callable: {
    why: 'the gem credit is granted to authenticated',
    pairs: [['  from public, anon, authenticated, service_role;\n\n-- ── §2',
      '  from public, anon, authenticated, service_role;\ngrant execute on function public.hr_wallet_credit(uuid, integer, bigint, text, timestamp with time zone) to authenticated;\n\n-- ── §2']],
  },
};

async function run() {
  const { db } = await bootReplay();
  const fails = [];
  const ok = (arm, cond, msg) => { if (!cond) fails.push(`${arm}: ${msg}`); };
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; } finally { await db.query('reset role').catch(() => {}); }
  };
  const tryUser = async (uid, sql, p) => {
    try { return { r: await asUser(uid, sql, p) }; } catch (e) { return { err: String(e.message) }; }
  };

  // ── G1. SECOND APPLY IS BYTE-IDENTICAL ─────────────────────────────────
  /* Re-applied on the chain as it stood when the file landed (upTo: MIG), not at
     head: a later cut (2026-12-02-old-rewards-cut.sql drops hr_quest_rewards,
     which GATE(e) reads) is not this file's second apply. G2-G4 run at head. */
  {
    const { db: db1 } = await bootReplay({ upTo: MIG });
    const q1 = async (sql) => (await db1.query(sql)).rows;
    const snap = async () => JSON.stringify([await inventory(db1),
      await q1(`select md5(pg_get_functiondef('${WALLET}'::regprocedure)) as h`),
      await q1('select proname, identity_args, grantee from public.hr_client_rpc_baseline order by 1, 2, 3')]);
    const sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
    const before = await snap();
    let err = null;
    try { await db1.exec(sql); } catch (e) { err = String(e.message).split('\n')[0]; }
    ok('G1', !err, `a second apply raised: ${err}`);
    ok('G1', before === await snap(), 'a second apply changed the schema inventory, the wallet body or the baseline');
    await db1.close().catch(() => {});
  }

  // ── fixture: one real player through the real character path ───────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q("insert into auth.users (id, instance_id, aud, role, email) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','k37@probe.invalid')", [uid]);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await q("insert into public.hr_access_allowlist (user_id) values ($1) on conflict do nothing", [uid]).catch(() => {});
  await q('delete from public.hr_rate_counters');
  await asUser(uid, 'select public.claim_display_name($1) as r', ['GemProbe']);

  // ── G3. A REAL MINT PATH IS REFUSED END TO END (the start kit) ─────────
  await q('update public.hr_start_kit set gems = 1');
  const cr = await tryUser(uid, 'select public.hr_create_character(0) as r');
  const said = cr.err || JSON.stringify(cr.r);
  ok('G3', /gems_retired/.test(said), `a kit paying 1 gem was not refused gems_retired: ${said}`);
  const w = (await q(`select coalesce((select sum(gems) from public.account_wallet where user_id = $1), 0)::bigint as g,
    (select count(*) from public.account_gem_grants where user_id = $1)::int as n`, [uid]))[0];
  ok('G3', Number(w.g) === 0 && w.n === 0, `gems landed: ${JSON.stringify(w)}`);
  await q('update public.hr_start_kit set gems = 0');
  const cr2 = await tryUser(uid, 'select public.hr_create_character(0) as r');
  ok('G3', cr2.r?.ok === true, `CONTROL: with a 0-gem kit the character is created: ${cr2.err || JSON.stringify(cr2.r)}`);

  // ── G2. THE BOUNTY RPCs DO NOT RESOLVE FOR A PLAYER ────────────────────
  await q('delete from public.hr_rate_counters');
  for (const call of ["select public.hr_claim_bounty(0) as r",
    "select public.hr_accept_bounty(0,'b1','goblin','cull','normal',100::bigint) as r",
    "select public.hr_bounty_spend(0,'abandon','b1',gen_random_uuid()) as r"]) {
    const r = await tryUser(uid, call);
    ok('G2', r.err && /does not exist/.test(r.err), `${call} resolved: ${r.err || JSON.stringify(r.r)}`);
  }
  const exec = (await q(`select count(*)::int as n from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname ~ 'bount' and (has_function_privilege('authenticated', p.oid, 'execute')
    or has_function_privilege('anon', p.oid, 'execute'))`))[0].n;
  ok('G2', exec === 0, `${exec} bounty function(s) are client-executable`);
  const rows = (await q("select count(*)::int as n from public.hr_client_rpc_baseline where proname ~ 'bount'"))[0].n;
  ok('G2', rows === 0, `${rows} bounty row(s) still on the client baseline`);

  // ── G4. THE GEM CREDIT IS OWNER-ONLY ───────────────────────────────────
  const priv = (await q(`select has_function_privilege('authenticated','${WALLET}','execute') as a,
    has_function_privilege('anon','${WALLET}','execute') as n,
    (exists (select 1 from pg_roles where rolname = 'hr_engine')
       and has_function_privilege('hr_engine','${WALLET}','execute')) as e`))[0];
  ok('G4', !priv.a && !priv.n && !priv.e, `privileges widened: ${JSON.stringify(priv)}`);

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
    const hit = !installed && /GATE\(|bounty-gems-close/.test(why);
    console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${id} — ${m.why}${hit ? `\n        refused at install: ${why.slice(0, 160)}` : `\n        saw: ${installed ? 'it installed cleanly' : why}`}`);
    if (!hit) bad += 1;
  }
  return bad;
}

try {
  if (process.argv.includes('--mutate')) process.exit((await mutate()) ? 1 : 0);
  const fails = await run();
  if (fails.length) { console.error('bounty-gems-close: RED\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('bounty-gems-close: OK — second apply byte-identical; bounty RPCs do not resolve for a player and none is '
    + 'client-executable; a 1-gem kit is refused gems_retired with 0 gems landed (0-gem control creates the hero); '
    + 'the gem credit is owner-only');
} catch (e) {
  console.error(`bounty-gems-close: HARNESS — ${e.message}`);
  process.exit(2);
}
