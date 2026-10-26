#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/farm-harvest-clear.mjs — "HARVEST AND CLEAR PLOT" ON A CROP THAT REGROWS (report #66:
// "When I select 'harvest only' it is still replanting them", tomatoes).
//
//   node tests/farm-harvest-clear.mjs             the guard
//   node tests/farm-harvest-clear.mjs --list      the mutation catalogue
//   node tests/farm-harvest-clear.mjs --mutate    every mutation must be CAUGHT
//   node tests/farm-harvest-clear.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/2027-01-26-farm-harvest-clear.sql
//
// Ships with: supabase/migrations/2027-01-26-farm-harvest-clear.sql. The client half
// (the Farm window's labels and verbs) is tests/farm-window.mjs FW-8.
//
// A real hero on the fully replayed PGlite chain, every verb called as the signed-in player:
//   FC-1 A REGROWING VINE, HARVESTED AND CLEARED: paid once (bag = the answer's qty, one
//        farm_harvest journal row), the plot row is GONE, one farm_clear row journals it.
//   FC-2 THE SAME KEY is the cached answer and moves nothing.
//   FC-3 A PLAIN HARVEST of the same crop is unchanged: the vine stays and grows again.
//   FC-4 THE ENVELOPE agrees: farm_land has no plot 0 and plot 1 with the server's regrows_left.
//   FC-5 ANOTHER ACCOUNT's clear on the same plot index is empty_plot and touches nothing.
//   FC-6 THE ACL: authenticated only, never anon or PUBLIC; on hr_client_rpc_baseline.
//   FC-7 A SECOND APPLY IS A NO-OP: the schema fingerprint, the body and the rows are byte-identical.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MIG = '2027-01-26-farm-harvest-clear.sql';
const idem = () => crypto.randomUUID();

/* The file's §2 self-check would refuse most mutants at apply; it is blinded so THIS guard's arms judge them. */
const GATE_BLIND = [
  ['  v_n bigint; v_inv bigint;\nbegin\n', '  v_n bigint; v_inv bigint;\nbegin\n  if true then return; end if;   -- selftest: §2 short-circuited\n'],
];
const MUTANTS = {
  no_clear: {
    why: 'the clear harvests but leaves the vine in the ground (report #66 again)',
    find: "    delete from public.account_farm_plots\n     where user_id = v_uid and plot_idx = p_plot_idx and crop_id = v_h ->> 'crop';\n",
    repl: '',
  },
  no_replay: {
    why: 'the answer is not stored under the key: a retried press is a second, different decision',
    find: "    values (v_uid, p_idem, p_slot, 'farm_clear', v_out, now())\n    on conflict (user_id, intent_id) do nothing;\n",
    repl: "    values (v_uid, gen_random_uuid(), p_slot, 'farm_clear', v_out, now())\n    on conflict (user_id, intent_id) do nothing;\n",
  },
  unjournalled: {
    why: 'the vine is thrown away with no journal row',
    find: "    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold_in, xp_in, qty_in, meta)\n      values (v_uid, p_slot, 'farm', 'farm_clear',",
    repl: "    if false then insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold_in, xp_in, qty_in, meta)\n      values (v_uid, p_slot, 'farm', 'farm_clear',",
    more: [["'regrows_left', v_left, 'field', 'account'));\n", "'regrows_left', v_left, 'field', 'account')); end if;\n"]],
  },
  anon_grant: {
    why: 'the clear is granted to anon',
    find: 'grant  execute on function public.hr_farm_harvest_clear(int, int, uuid) to authenticated;',
    repl: 'grant  execute on function public.hr_farm_harvest_clear(int, int, uuid) to authenticated, anon;',
  },
};
const ALL = Object.keys(MUTANTS);

async function run(mutant) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const m = mutant && MUTANTS[mutant];
  const { db } = await bootReplay({ patches: m ? new Map([[MIG, [[m.find, m.repl], ...(m.more || []), ...GATE_BLIND]]]) : undefined, upTo: MIG });
  try {
    const q = async (sql, p) => (await db.query(sql, p)).rows;
    const one = async (sql, p) => { const r = (await q(sql, p))[0]; return r ? Object.values(r)[0] : undefined; };
    /* As PostgREST calls it: the JWT subject set, `set role authenticated`. */
    const as = async (uid, sql, params) => {
      await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
      await db.exec('set role authenticated');
      try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
      finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)"); }
    };
    const gate = () => q('delete from public.hr_rate_counters');
    const clear = async (uid, plot, key) => { await gate(); return as(uid, 'select public.hr_farm_harvest_clear(0, $1, $2::uuid)', [plot, key]); };
    const harvest = async (uid, plot) => { await gate(); return as(uid, 'select public.hr_farm_harvest(0, $1, $2::uuid)', [plot, idem()]); };

    const A = '000000c0-0000-4000-a000-0000fc000001';
    const B = '000000c0-0000-4000-a000-0000fc000002';
    for (const u of [A, B]) {
      await q('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
      await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'farm-harvest-clear guard') on conflict (user_id) do nothing", [u]);
      const c = await as(u, 'select public.hr_create_character(0)');
      if (!c || c.ok !== true) { const e = new Error('hr_create_character refused: ' + JSON.stringify(c)); e.harness = true; throw e; }
    }
    // The regrowing crop, by property (never by name), and two ready vines of it on A's field.
    const crop = (await q('select crop_id, prod_item, regrow_limit from public.hr_crops where regrows order by (regrow_limit > 0) desc, crop_id limit 1'))[0];
    if (!crop) { const e = new Error('the catalogue has no regrowing crop'); e.harness = true; throw e; }
    await q(`insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by)
             values ($1, 0, $2, now() - interval '2000 hours', '{}', 0, 0), ($1, 1, $2, now() - interval '2000 hours', '{}', 0, 0)`, [A, crop.crop_id]);
    const plots = async (u) => (await q('select plot_idx, crop_id, regrow_count from public.account_farm_plots where user_id = $1 order by 1', [u]));
    const bag = async (u) => Number(await one('select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)::text', [u, crop.prod_item]));
    const rows = async (u, intent) => Number(await one('select count(*)::text from public.player_ledger where user_id = $1 and intent = $2', [u, intent]));

    // ── FC-1 ──
    const key = idem();
    const v = await clear(A, 0, key);
    ok(v && v.ok === true && v.cleared === true && v.regrew === false && Number(v.qty) >= 1, 'FC-1 harvest-and-clear answered ' + JSON.stringify(v));
    ok(!(await plots(A)).some((p) => p.plot_idx === 0), 'FC-1 the vine is still in plot 0 after Harvest and clear plot: ' + JSON.stringify(await plots(A)));
    ok(await bag(A) === Number(v && v.qty), 'FC-1 the bag holds ' + (await bag(A)) + ' ' + crop.prod_item + ', the answer says ' + (v && v.qty));
    ok(await rows(A, 'farm_harvest') === 1, 'FC-1 ' + (await rows(A, 'farm_harvest')) + ' harvest journal rows after one clear');
    ok(await rows(A, 'farm_clear') === 1, 'FC-1 the clear is not journalled (' + (await rows(A, 'farm_clear')) + ' farm_clear rows)');

    // ── FC-2 ──
    const bagBefore = await bag(A);
    const v2 = await clear(A, 0, key);
    ok(JSON.stringify(v2) === JSON.stringify(v), 'FC-2 the same key answered ' + JSON.stringify(v2) + ', first ' + JSON.stringify(v));
    ok(await bag(A) === bagBefore && await rows(A, 'farm_harvest') === 1 && await rows(A, 'farm_clear') === 1,
      'FC-2 a replay moved something (bag ' + (await bag(A)) + ' was ' + bagBefore + ', farm_clear rows ' + (await rows(A, 'farm_clear')) + ')');
    ok(Number(await one("select count(*)::text from public.player_intents where user_id = $1 and intent_id = $2::uuid and intent = 'farm_clear'", [A, key])) === 1,
      'FC-2 the clear\'s answer is not stored under its key');

    // ── FC-3 ──
    const h = await harvest(A, 1);
    const p1 = (await plots(A)).find((p) => p.plot_idx === 1);
    ok(h && h.ok === true && h.regrew === true && p1 && p1.crop_id === crop.crop_id && p1.regrow_count === 1,
      'FC-3 a plain harvest did not keep the vine: ' + JSON.stringify([h, p1]));

    // ── FC-4 ──
    const land = await one('select public.hr_state_of($1, 0) -> \'farm_land\'', [A]);
    const lp = (land && land.plots) || [];
    const want = crop.regrow_limit > 0 ? crop.regrow_limit - 1 : null;
    ok(!lp.some((p) => p.i === 0) && lp.some((p) => p.i === 1 && p.regrows_left === want),
      'FC-4 the envelope\'s field reads ' + JSON.stringify(lp) + ' (want no plot 0, plot 1 regrows_left ' + want + ')');

    // ── FC-5 ──
    const vb = await clear(B, 1, idem());
    ok(vb && vb.error === 'empty_plot' && (await plots(A)).some((p) => p.plot_idx === 1), 'FC-5 another account\'s clear answered ' + JSON.stringify(vb));

    // ── FC-6 ──
    const acl = (await q(`select has_function_privilege('anon', 'public.hr_farm_harvest_clear(integer,integer,uuid)', 'execute') a,
                                 has_function_privilege('authenticated', 'public.hr_farm_harvest_clear(integer,integer,uuid)', 'execute') u,
                                 exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_farm_harvest_clear' and grantee = 'authenticated') b`))[0];
    ok(acl.a === false && acl.u === true && acl.b === true, 'FC-6 the ACL reads ' + JSON.stringify(acl));

    // ── FC-7 ── (clean run only: a mutant's body is planted on purpose)
    if (!mutant) {
      const body = () => one("select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_farm_harvest_clear(integer,integer,uuid)'::regprocedure");
      const state = async () => JSON.stringify([await inventory(db), await body(), await plots(A),
        await q("select proname, identity_args, grantee, note from public.hr_client_rpc_baseline where proname = 'hr_farm_harvest_clear'"),
        await q('select count(*)::int n from public.player_ledger where user_id = $1', [A])]);
      const before = await state();
      await db.exec((await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n'));
      ok(await state() === before, 'FC-7 a second apply changed the schema, the body or a row');
    }
  } finally {
    try { await db.close(); } catch { /* the replay owns its lifetime */ }
  }
  return problems;
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--mutate'));
  if (process.argv.includes('--list')) { for (const id of ALL) console.log('  ' + id + ' — ' + MUTANTS[id].why); return 0; }
  if (!arg) {
    const p = await run(null);
    for (const x of p) console.log('  ✗ ' + x);
    console.log(p.length ? `farm-harvest-clear: ${p.length} RED` : 'farm-harvest-clear: green — a regrowing vine is harvested once and cleared (plot empty, journalled), a plain harvest still regrows, a replay is cached, another account touches nothing, authenticated only, a second apply is a no-op');
    return p.length ? 1 : 0;
  }
  const only = arg.includes('=') ? arg.split('=')[1] : null;
  if (only && !ALL.includes(only)) { console.log('unknown mutation: ' + only); return 2; }
  const clean = await run(null);
  if (clean.length) { for (const x of clean) console.log('  ✗ clean control RED: ' + x); return 1; }
  let bad = 0;
  for (const id of (only ? [only] : ALL)) {
    const p = await run(id);
    if (p.length) console.log('  ✓ ' + id + ' — caught: ' + p[0].slice(0, 160));
    else { console.log('  ✗ ' + id + ' — NOT caught'); bad++; }
  }
  const n = only ? 1 : ALL.length;
  console.log(bad ? `farm-harvest-clear --mutate: ${bad} escaped` : `farm-harvest-clear --mutate: ${n}/${n} mutants caught`);
  return bad ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e && e.harness ? 'HARNESS: ' + e.message : e); process.exit(2); });
