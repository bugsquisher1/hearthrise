#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/farm-tend.mjs — "TEND THE FIELD", PLAYED ON A REAL SESSION AGAINST THE REAL SERVER (build plan L09).
//
//   node tests/farm-tend.mjs             the guard
//   node tests/farm-tend.mjs --list      the mutation catalogue
//   node tests/farm-tend.mjs --mutate    every mutation must be CAUGHT
//   node tests/farm-tend.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/1017-tend-the-field.sql
//
// Ships with: supabase/migrations/1017-tend-the-field.sql (its §4 self-check is the server's own proof) and the client half,
// src/session/farm-tend.js + src/shell/windows/farm-tend.js. On the fully replayed PGlite chain, a signed-in player's own
// CharacterSession (src/session/character-session.js) reads the envelope through hr_load and presses through the client's
// own tendField; every rpc it sends runs as that player (`set role authenticated`, the JWT subject set).
//   FT-1 THE BILL ON SCREEN: the session's farm_tend section is the field's (a ready plot, a growing one, an EXTRA one past
//        the cap): harvest 0 and 7, plant 0 again with its own crop from the bag, water 0 and 1, no gold; the press the
//        window would send (tendPress) is exactly that bill's crop and gold.
//   FT-2 ONE PRESS: ONE hr_farm_tend is sent and NO hr_load after it (its answer carries the envelope, rule 11); the field
//        shows plot 0 planted again and both plots watered, plot 7 gone; the bag holds the harvest; the next bill has
//        nothing to do and the window's press is off.
//   FT-3 THE SAME KEY answers the same receipt and moves nothing; a NEW key right after is nothing_to_tend.
//   FT-4 THE SEED BILL: no seed and gold for one: the bill buys one seed (its Shop price, read off the server's catalogue: K-3 prices a
//        seed at the store's ask, lane/prices-wage-hours) and says plot 2 stays empty for want of
//        gold; a press at a stale price is refused quote_changed, moves nothing, and the session re-reads the server's
//        bill before the refusal resolves; the press at the bill's gold buys it, plants it and journals the purchase.
//   FT-5 THE CHOSEN CROP: an empty plot, "Plant with: Turnip": the server's compact bill for it, then one press plants it.
//   FT-6 FORGED: a crop above the hero's Farming, an unknown crop, a negative price: refused, nothing moves; ANOTHER
//        account's press leaves this field byte-identical.
//   FT-7 THE WORDS: each seed row says what its crop makes (Turnip Juice's mana, Moonbloom's elixir), from the data.
//   FT-8 THE ACL: authenticated only, the plan and the view the owner's; on hr_client_rpc_baseline.
//   FT-9 A SECOND APPLY IS A NO-OP: the schema fingerprint, the three bodies, the section and the baseline row.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MIG = '1017-tend-the-field.sql';
const idem = () => crypto.randomUUID();
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);

/* The file's §4 self-check would refuse most mutants at apply; it is blinded so THIS guard's arms judge them. */
const GATE_BLIND = [
  ['  v jsonb; v2 jsonb; b jsonb; v_who uuid; v_xp0 bigint; v_xp1 bigint; v_led bigint; v_plots text; v_p bigint;\nbegin\n',
   '  v jsonb; v2 jsonb; b jsonb; v_who uuid; v_xp0 bigint; v_xp1 bigint; v_led bigint; v_plots text; v_p bigint;\nbegin\n  if true then return; end if;   -- selftest: §4 short-circuited\n'],
];
const MUTANTS = {
  no_water: {
    why: 'the press harvests and plants but never waters (the second half of every visit is still by hand)',
    find: '    continue when v_i = any (v_skip);\n',
    repl: '    continue when true;\n',
  },
  price_unchecked: {
    why: 'the gold the player saw is not compared: a stale bill is charged the server\'s new sum',
    find: "  if (v_plan ->> 'gold')::bigint <> p_gold then\n",
    repl: "  if false then\n",
  },
  extra_replanted: {
    why: 'an extra plot past the field\'s cap is planted again (the field grows by a forged bed)',
    find: '        null;                                     -- an extra plot is gone after its harvest\n',
    repl: '        v_sow_i := v_sow_i || r.i; v_sow_c := v_sow_c || coalesce(p_crop, r.crop);\n',
  },
  no_receipt: {
    why: 'the answer is not stored under the key: a retried press is a second decision',
    find: '    values (v_uid, p_idem, p_slot, c_verb, v_out, now())\n',
    repl: '    values (v_uid, gen_random_uuid(), p_slot, c_verb, v_out, now())\n',
  },
  storage_skipped: {
    why: 'the plan never counts Storage: a seed the account holds is bought again',
    find: "    elsif (v_l ->> 'storage')::bigint < (v_l ->> 'storage_held')::bigint then\n",
    repl: "    elsif false then\n",
  },
  anon_grant: {
    why: 'the verb is granted to anon',
    find: 'grant  execute on function public.hr_farm_tend(integer, text, bigint, uuid) to authenticated;',
    repl: 'grant  execute on function public.hr_farm_tend(integer, text, bigint, uuid) to authenticated, anon;',
  },
};
const ALL = Object.keys(MUTANTS);

async function run(mutant) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const m = mutant && MUTANTS[mutant];
  const { db } = await bootReplay({ patches: m ? new Map([[MIG, [[m.find, m.repl], ...GATE_BLIND]]]) : undefined, upTo: MIG });
  try {
    const q = async (sql, p) => (await db.query(sql, p)).rows;
    const one = async (sql, p) => { const r = (await q(sql, p))[0]; return r ? Object.values(r)[0] : undefined; };
    /* As PostgREST calls it: the JWT subject set, `set role authenticated`; the rate buckets emptied (one press a call here). */
    const as = async (uid, sql, params) => {
      await q('delete from public.hr_rate_counters');
      await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
      await db.exec('set role authenticated');
      try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
      finally { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)"); }
    };
    const SQL = {
      hr_load: ['select public.hr_load($1::int)', ['p_slot']],
      hr_farm_tend: ['select public.hr_farm_tend($1::int, $2::text, $3::bigint, $4::uuid)', ['p_slot', 'p_crop', 'p_gold', 'p_idem']],
    };
    /* The client's server link, as src/session/server.js answers: { ok, status, body }, never a throw. */
    const linkOf = (uid, sent) => ({
      rpc: async (name, args) => {
        sent.push({ name, args });
        const s = SQL[name];
        if (!s) return { ok: false, status: 404, body: { code: 'PGRST202' } };
        return { ok: true, status: 200, body: await as(uid, s[0], s[1].map((k) => args[k])) };
      },
      accrue: async () => ({ ok: false, status: 0, error: 'network' }),
    });
    const CSN = await imp('src/session/character-session.js');
    const FT = await imp('src/session/farm-tend.js');
    const FL = await imp('src/session/farm-sections.js');
    const WT = await imp('src/shell/windows/farm-tend.js');
    let clock = 1e6;
    const sessionOf = (uid, sent) => new CSN.CharacterSession({ slot: 0, uid, server: linkOf(uid, sent), now: () => clock, setTimer: () => null, clearTimer: () => {} });

    const A = '000000c0-0000-4000-a000-0000f1e00001';
    const B = '000000c0-0000-4000-a000-0000f1e00002';
    for (const [u, name] of [[A, 'Tend Farmer'], [B, 'Tend Neighbor']]) {
      await q('insert into auth.users (id) values ($1) on conflict (id) do nothing', [u]);
      await q("insert into public.hr_access_allowlist (user_id, note) values ($1, 'farm-tend guard') on conflict (user_id) do nothing", [u]);
      const c = await as(u, 'select public.hr_create_character(0)');
      if (!c || c.ok !== true) { const e = new Error('hr_create_character refused: ' + JSON.stringify(c)); e.harness = true; throw e; }
      const n = await as(u, 'select public.hr_character_name_set(0, $1, $2::uuid)', [name, idem()]);
      if (!n || n.ok !== true) { const e = new Error('hr_character_name_set refused: ' + JSON.stringify(n)); e.harness = true; throw e; }
    }
    const cap = Number(await one('select public.hr_farm_plot_cap($1)::text', [A]));
    if (cap !== 2) { const e = new Error('a fresh account\'s field is ' + cap + ' plots; the guard plants for 2'); e.harness = true; throw e; }
    const plots = async (u) => q("select plot_idx i, crop_id crop, coalesce(array_length(waterings, 1), 0) w, extract(epoch from now() - planted_at)::int age from public.account_farm_plots where user_id = $1 order by 1", [u]);
    const bag = async (u, item) => Number(await one('select coalesce((select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2), 0)::text', [u, item]));
    const purse = async (u) => Number(await one('select coalesce((select gold from public.account_wallet where user_id = $1), 0)::text', [u]));
    const rows = async (u) => Number(await one('select count(*)::text from public.player_ledger where user_id = $1', [u]));
    const setPurse = (u, g) => q('insert into public.account_wallet as w (user_id, gold, version, updated_at) values ($1, $2, 1, now()) on conflict (user_id) do update set gold = excluded.gold', [u, g]);
    const setSeeds = async (u, n) => {
      await q("delete from public.player_inventory where user_id = $1 and item_id = 'turnip_seed'", [u]);
      await q("delete from public.account_bank where user_id = $1 and item_id = 'turnip_seed'", [u]);
      if (n > 0) await q("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'turnip_seed', $2)", [u, n]);
    };
    const account = { server: null };

    // ── FT-1 ── plot 0 ready, plot 1 growing (an hour in, never watered), plot 7 an EXTRA ready plot; 3 seeds in the bag
    await q('delete from public.account_farm_plots where user_id = $1', [A]);
    await q(`insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by) values
             ($1, 0, 'turnip', now() - interval '2000 hours', '{}', 0, 0), ($1, 1, 'turnip', now() - interval '1 hour', '{}', 0, 0),
             ($1, 7, 'turnip', now() - interval '2000 hours', '{}', 0, 0)`, [A]);
    await setSeeds(A, 3);
    await q("delete from public.player_inventory where user_id = $1 and item_id = 'turnip'", [A]);
    await setPurse(A, 1000);
    const sent = [];
    account.server = linkOf(A, sent);
    const cs = sessionOf(A, sent);
    ok(await cs.load(), 'FT-1 CONTROL: the session\'s first hr_load did not land (' + cs.lastVerdict + ')');
    let bill = FT.farmTendOf(cs);
    const sc = { tendCrop: null, pending: false };
    ok(!!bill && JSON.stringify(bill.harvest) === '[0,7]' && JSON.stringify(bill.plant) === '[{"i":0,"crop":"turnip"}]'
       && JSON.stringify(bill.water) === '[0,1]' && bill.gold === 0 && bill.empty.length === 0
       && bill.seeds.length === 1 && bill.seeds[0].bag === 1 && bill.seeds[0].buy === 0,
      'FT-1 the session reads the bill ' + JSON.stringify(bill && { ...bill, choices: [...bill.choices.values()] }));
    const press1 = WT.tendPress(cs, sc);
    ok(!!press1 && press1.crop === null && press1.gold === 0, 'FT-1 the window would press ' + JSON.stringify(press1));

    // ── FT-2 ──
    const before = sent.length;
    const r = await FT.tendField(account, cs, press1 ? press1.crop : null, press1 ? press1.gold : 0);
    const tends = sent.slice(before).filter((c) => c.name === 'hr_farm_tend');
    ok(r.ok === true && tends.length === 1, 'FT-2 one press sent ' + tends.length + ' hr_farm_tend and answered ' + JSON.stringify(r));
    /* rule 11: the answer carries the hero (1017 `envelope`), taken like a load: no hr_load after the press */
    const reads2 = sent.slice(before).filter((c) => c.name === 'hr_load').length;
    ok(reads2 === 0, 'FT-2 the press read the hero again ' + reads2 + ' time(s): its answer carried the envelope');
    const field = JSON.stringify((await plots(A)).map((p) => [p.i, p.crop, p.w, p.age === 0]));
    ok(field === '[[0,"turnip",1,true],[1,"turnip",1,false]]', 'FT-2 the field after one press is ' + field + ' (want plot 0 planted again and watered, plot 1 watered, plot 7 gone)');
    const land = FL.farmFieldOf(cs);
    ok(!!land && land.plots.size === 2 && land.plots.get(0) && land.plots.get(0).ready === false && !land.plots.has(7),
      'FT-2 the re-read envelope\'s field reads ' + JSON.stringify(land && [...land.plots.values()]));
    const harvested = r.ok ? r.body.harvested.reduce((s, h) => s + h.qty, 0) : -1;
    ok(r.ok && await bag(A, 'turnip') === harvested && (cs.read('inventory') || {}).turnip === harvested && await bag(A, 'turnip_seed') === 2,
      'FT-2 the bag holds ' + (await bag(A, 'turnip')) + ' turnips (the answer harvested ' + harvested + ', the session reads ' + (cs.read('inventory') || {}).turnip + ') and ' + (await bag(A, 'turnip_seed')) + ' seeds');
    ok(r.ok && JSON.stringify(r.body.planted) === '[{"i":0,"crop":"turnip"}]' && JSON.stringify(r.body.watered) === '[0,1]' && r.body.xp > 0,
      'FT-2 the answer reads ' + JSON.stringify(r.body));
    bill = FT.farmTendOf(cs);
    ok(!!bill && !FT.tendHasWork(bill) && WT.tendPress(cs, sc) === null, 'FT-2 the next bill still has work: ' + JSON.stringify(bill));
    ok(r.ok && /^Harvested \d+ Turnips? · Planted 1 plot · Watered 2 plots · \+[\d,]+ Farming XP$/.test(WT.tendLine(r, (x) => x.error)),
      'FT-2 the line after the press reads ' + JSON.stringify(r.ok && WT.tendLine(r, (x) => x.error)));

    // ── FT-3 ──
    const key = idem();
    const k1 = await as(A, SQL.hr_farm_tend[0], [0, null, 0, key]);
    const n3 = await rows(A);
    const k2 = await as(A, SQL.hr_farm_tend[0], [0, null, 0, key]);
    ok(k1 && k1.error === 'nothing_to_tend' && JSON.stringify(k2) === JSON.stringify(k1) && await rows(A) === n3,
      'FT-3 a new key right after the press answered ' + JSON.stringify(k1) + ', again ' + JSON.stringify(k2));
    await q("update public.account_farm_plots set planted_at = now() - interval '2000 hours', waterings = '{}' where user_id = $1", [A]);
    const key2 = idem();
    const v1 = await as(A, SQL.hr_farm_tend[0], [0, null, 0, key2]);
    const n4 = await rows(A);
    const v2 = await as(A, SQL.hr_farm_tend[0], [0, null, 0, key2]);
    /* the press carries the hero (`envelope`, rule 11); the stored receipt a same key answers is the press's answer without it */
    const receipt = v1 && typeof v1 === 'object' ? Object.fromEntries(Object.entries(v1).filter(([k]) => k !== 'envelope')) : v1;
    ok(v1 && v1.ok === true && v1.envelope && v1.envelope.state && JSON.stringify(v2) === JSON.stringify(receipt) && await rows(A) === n4,
      'FT-3 the same key answered ' + JSON.stringify(v2) + ' after ' + JSON.stringify(v1) + ' (journal ' + n4 + ' -> ' + (await rows(A)) + ')');

    // ── FT-4 ── both plots ready, no seed, gold for one seed (P, the server's Shop price) and not two (the purse P + 2)
    const P = Number(await one("select price::text from public.hr_shop_supply_offers where item_id = 'turnip_seed'"));
    await q("update public.account_farm_plots set planted_at = now() - interval '2000 hours', waterings = '{}' where user_id = $1", [A]);
    await setSeeds(A, 0);
    await setPurse(A, P + 2);
    clock += 600000;
    await cs.load();
    bill = FT.farmTendOf(cs);
    ok(P >= 3 && !!bill && bill.gold === P && JSON.stringify(bill.plant) === '[{"i":0,"crop":"turnip"}]' && bill.empty.length === 1
       && bill.empty[0].i === 1 && bill.empty[0].why === 'cannot_afford' && bill.seeds[0] && bill.seeds[0].buy === 1,
      'FT-4 the seed bill reads ' + JSON.stringify(bill && { ...bill, choices: undefined }));
    const n5 = await rows(A);
    const loads = sent.filter((c) => c.name === 'hr_load').length;
    clock += 600000;
    const stale = await FT.tendField(account, cs, null, 0);
    ok(stale.ok === false && stale.error === 'quote_changed' && stale.gold === P && await rows(A) === n5 && await purse(A) === P + 2,
      'FT-4 a press at a stale price answered ' + JSON.stringify(stale) + ' (journal ' + n5 + ' -> ' + (await rows(A)) + ', purse ' + (await purse(A)) + ')');
    ok(sent.filter((c) => c.name === 'hr_load').length === loads + 1, 'FT-4 the refused press did not re-read the server\'s bill once');
    const fresh = WT.tendPress(cs, sc);
    clock += 600000;
    const paid = await FT.tendField(account, cs, null, fresh ? fresh.gold : -1);
    ok(paid.ok === true && JSON.stringify(paid.body.bought) === JSON.stringify([{ seed: 'turnip_seed', qty: 1, gold: P }]) && await purse(A) === 2
       && JSON.stringify((await plots(A)).map((p) => p.i)) === '[0]',
      'FT-4 the press at the bill\'s gold answered ' + JSON.stringify(paid) + ' (purse ' + (await purse(A)) + ', plots ' + JSON.stringify(await plots(A)) + ')');
    ok(Number(await one("select count(*)::text from public.player_ledger where user_id = $1 and intent = 'farm_tend_seed' and qty = 1 and gold = $2 and purse = 2", [A, -P])) === 1,
      'FT-4 the bought seed is not journalled once (qty 1, gold minus its price, the purse after)');
    ok(paid.ok && new RegExp('Bought 1 Turnip Seed for ' + P + ' gp · .*Plot 2: empty \\(no Turnip Seed, not enough gold\\)$').test(WT.tendLine(paid, (x) => x.error)),
      'FT-4 the line after the press reads ' + JSON.stringify(paid.ok && WT.tendLine(paid, (x) => x.error)));

    // ── FT-5 ── plot 1 stands empty; the seeds are in Storage this time
    await setPurse(A, 100);
    await q("insert into public.account_bank (user_id, item_id, qty) values ($1, 'turnip_seed', 4) on conflict (user_id, item_id) do update set qty = 4", [A]);
    clock += 600000;
    await cs.load();
    bill = FT.farmTendOf(cs);
    const pick = bill && bill.choices.get('turnip');
    ok(!!bill && !FT.tendHasWork(bill) && bill.empty.length === 1 && bill.empty[0].why === 'unplanted' && !!pick && pick.plant === 1
       && pick.storage === 1 && pick.buy === 0 && pick.gold === 0,
      'FT-5 the bill for an empty plot reads ' + JSON.stringify(bill && { ...bill, choices: [...bill.choices.values()] }));
    ok(WT.tendPress(cs, sc) === null, 'FT-5 the window would press with no crop picked and nothing to do');
    const sc5 = { tendCrop: 'turnip', pending: false };
    const press5 = WT.tendPress(cs, sc5);
    clock += 600000;
    const sown = await FT.tendField(account, cs, press5 ? press5.crop : null, press5 ? press5.gold : -1);
    ok(sown.ok === true && JSON.stringify(sown.body.planted) === '[{"i":1,"crop":"turnip"}]' && JSON.stringify(sown.body.watered) === '[1]'
       && Number(await one("select qty::text from public.account_bank where user_id = $1 and item_id = 'turnip_seed'", [A])) === 3,
      'FT-5 the chosen crop answered ' + JSON.stringify(sown));

    // ── FT-6 ──
    const n6 = await rows(A);
    const before6 = JSON.stringify(await plots(A));
    const forged = [await FT.tendField(account, cs, 'moonbloom', 0), await FT.tendField(account, cs, 'mandrake', 0),
      await as(A, SQL.hr_farm_tend[0], [0, null, -5, idem()])];
    ok(forged.map((f) => f && f.error).join() === 'level_too_low,unknown_crop,bad_intent', 'FT-6 forged presses answered ' + JSON.stringify(forged));
    ok(await rows(A) === n6 && JSON.stringify(await plots(A)) === before6, 'FT-6 a forged press moved something');
    const otherSent = [];
    const other = await FT.tendField({ server: linkOf(B, otherSent) }, sessionOf(B, otherSent), 'turnip', 0);
    ok(other.ok === true && JSON.stringify(await plots(A)) === before6 && await rows(A) === n6
       && (await plots(B)).length === 2 && other.body.planted.every((p) => p.i < cap),
      'FT-6 another account\'s press answered ' + JSON.stringify(other) + ' and this field reads ' + JSON.stringify(await plots(A)));

    // ── FT-7 ──
    const turnipMakes = WT.cropMakes('turnip');
    const moonMakes = WT.cropMakes('moonbloom');
    ok(/^Makes Turnip Juice \(\+\d+ mana\)$/.test(turnipMakes) && /^Cooked into Moonbloom Elixir/.test(moonMakes),
      'FT-7 the seed rows read ' + JSON.stringify([turnipMakes, moonMakes]));

    // ── FT-8 ──
    const acl = (await q(`select has_function_privilege('anon', 'public.hr_farm_tend(integer,text,bigint,uuid)', 'execute') a,
                                 has_function_privilege('authenticated', 'public.hr_farm_tend(integer,text,bigint,uuid)', 'execute') u,
                                 has_function_privilege('authenticated', 'public.hr_farm_tend_plan(uuid,integer,text,bigint)', 'execute') p,
                                 has_function_privilege('authenticated', 'public.hr_farm_tend_view(uuid,integer)', 'execute') v,
                                 exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_farm_tend' and grantee = 'authenticated') b`))[0];
    ok(acl.a === false && acl.u === true && acl.p === false && acl.v === false && acl.b === true, 'FT-8 the ACL reads ' + JSON.stringify(acl));

    // ── FT-9 ── (clean run only: a mutant's body is planted on purpose)
    if (!mutant) {
      const bodies = () => q("select proname, md5(replace(prosrc, chr(13), '')) m from pg_proc where proname like 'hr_farm_tend%' order by 1");
      /* the field by its stored values (never an age read off now(): two reads straddle the re-apply, a second can pass) */
      const field = () => q('select plot_idx, crop_id, planted_at::text, waterings::text, regrow_count, planted_by from public.account_farm_plots where user_id = $1 order by 1', [A]);
      const state = async () => JSON.stringify([await inventory(db), await bodies(), await field(),
        await q("select key, fn, note from public.hr_state_sections where key = 'farm_tend'"),
        await q("select proname, identity_args, grantee, note from public.hr_client_rpc_baseline where proname = 'hr_farm_tend'"),
        await rows(A)]);
      const was = await state();
      await db.exec((await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n'));
      ok(await state() === was, 'FT-9 a second apply changed the schema, a body or a row');
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
    console.log(p.length ? `farm-tend: ${p.length} RED` : 'farm-tend: green — the session reads the server\'s bill, one press harvests, plants again and waters exactly at that bill\'s gold, a stale price is refused and re-read, a chosen crop fills an empty plot, a replay is the receipt, forged presses and another account move nothing, authenticated only, a second apply is a no-op');
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
  console.log(bad ? `farm-tend --mutate: ${bad} escaped` : `farm-tend --mutate: ${n}/${n} mutants caught`);
  return bad ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(e && e.harness ? 'HARNESS: ' + e.message : e); process.exit(2); });
