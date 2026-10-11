#!/usr/bin/env node
// ============================================================================
// tests/account-wallet.mjs — GEMS ARE ONE ACCOUNT WALLET: EVERY GRANT PAYS ONCE
//                            PER ACCOUNT, EVERY SPEND DEBITS IT ONCE, EVERY HERO
//                            SEES THE SAME BALANCE, AND EVERY MOVE IS JOURNALLED.
//
//   node tests/account-wallet.mjs            the guard
//   node tests/account-wallet.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-19-account-wallet.sql, replayed up to the file
// before it; the file always runs inside a rolled-back transaction, so a red
// self-check is a RED arm carrying the self-check's own message.
//
//   W-APPLY  the file applies; its §8 runs every arm green: owner-only choke
//            point (k1), account-keyed tables with RLS forced and no client /
//            engine privilege (k2, k3), the per-hero columns gone (k4), the
//            writer census (k5), a rank grant on hero A paying NO gems on hero B
//            (v1), the engine's login grant paying once per account and never
//            spending (v2), a hero-slot buy debiting the wallet once and every
//            slot projecting it (v3), the account-wide day cap (v4), the wallet
//            equal to its own journal (v5).
//   W-CARRY  two accounts holding per-hero gems BEFORE the file: each wallet is
//            the account's SUM, one kind='wallet' carry row per account names
//            the per-slot balances, an empty account gets no row, and the
//            per-hero columns are gone.
//   W-PRIV   as `authenticated`: no read, insert or update on either wallet
//            table, and no execute on the three helpers.
//   W-IDEM   a second apply is byte-identical (inventory + the eleven bodies).
//   W-EDGE   claim-reward.js reports granted.gems from the apply's gems_paid,
//            never from the price.
//
// --mutate: a per-slot grant key, a credit with no ledger row, the projection
// reading the old per-hero column, a client grant on the wallet table, a claim
// writing the wallet directly, a per-slot day cap, the engine allowed to spend,
// a hero-slot buy debiting twice; + an edge mutant (receipt from the price).
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const MIG = '2026-10-19-account-wallet.sql';
const PREV = '2026-10-16-first-day-seeds.sql';
const SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
const EDGE_FILE = 'supabase/functions/hr-accrue/claim-reward.js';
const EDGE = (await readFile(join(ROOT, EDGE_FILE), 'utf8')).replace(/\r\n/g, '\n');
const SELF = '-- ── §8 SELF-CHECK';
if (SQL.indexOf(SELF) < 0) { console.error('harness: the migration has no §8 marker'); process.exit(2); }
const SIGS = [
  'hr_apply(uuid,integer,bigint,uuid,jsonb)', 'hr_buy_hero_slot__ungated(integer,integer,uuid)',
  'hr_buy_gem_unlock__ungated(text,integer,uuid)', 'hr_claim_goal__ungated(text,boolean,integer,uuid)',
  'hr_claim_milestone__ungated(text,integer)', 'hr_claim_rank__ungated(text,integer)',
  'raid_claim__ungated(text,uuid,text,integer)', 'world_event_claim__ungated(text,integer)',
  'hr_create_character(integer)', 'hr_state_of(uuid,integer)',
  'hr_day_budget_used(uuid,integer,timestamp with time zone)',
].map((s) => `public.${s}`);
const bodies = async (db) => (await db.query(
  `select string_agg(md5(replace(prosrc, chr(13), '')), ',' order by oid::regprocedure::text) as m
     from pg_proc where oid = any (array[${SIGS.map((s) => `'${s}'::regprocedure`).join(',')}])`)).rows[0].m;

async function tryApply(db, sql, after) {
  await db.exec('begin;');
  try {
    await db.exec(sql);
    return after ? await after() : null;
  } catch (e) {
    return String(e.message).split('\n')[0];
  } finally {
    await db.exec('rollback;');
  }
}

/* W-EDGE: the receipt's gems are what the wallet paid. */
function edgeScan(src = EDGE) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const bad = [];
  // The receipt is the `granted: … { … }` object; its gems line is the one that matters.
  const granted = (code.match(/granted: res\.replayed === true \? null : \{[\s\S]*?\n\s*\},/) || [''])[0];
  const line = (granted.match(/^\s*gems: .*$/m) || [''])[0].trim();
  if (line !== "gems: ('gems_paid' in res) ? Number(res.gems_paid) || 0 : (priced.gems || 0),") {
    bad.push(`granted.gems is not "what the wallet paid, the price only when the apply did not say" (${line || 'no receipt gems line'})`);
  }
  return bad;
}

let db;
try { ({ db } = await bootReplay({ upTo: PREV })); } catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
}

const A = '000000a1-0000-4000-a000-0000000c0001';
const B = '000000a1-0000-4000-a000-0000000c0002';
const E = '000000a1-0000-4000-a000-0000000c0003';
const SEED = `
insert into auth.users (id) values ('${A}'), ('${B}'), ('${E}') on conflict (id) do nothing;
insert into public.player_state (user_id, slot, gold, gems, hearth_tokens, version) values
  ('${A}', 0, 0, 14, 0, 1), ('${A}', 1, 0, 534, 2, 1), ('${B}', 0, 0, 3, 0, 1), ('${E}', 0, 0, 0, 0, 1);
`;

if (!MUTATE) {
  console.log('\naccount-wallet: one gem balance per account, paid once, debited once, seen by every hero, journalled');
  const red = [];
  const applied = await tryApply(db, SQL, async () => {
    console.log('  ✓ W-APPLY — applied; §8 k1-k6 + v1-v6 green');
    const inv1 = JSON.stringify(await inventory(db));
    const b1 = await bodies(db);
    try { await db.exec(SQL); } catch (e) { return `W-IDEM: the second apply RAISED: ${String(e.message).split('\n')[0]}`; }
    if (JSON.stringify(await inventory(db)) !== inv1 || (await bodies(db)) !== b1) return 'W-IDEM: the second apply moved the schema or a body';
    console.log('  ✓ W-IDEM — a second apply is byte-identical (§0 accepted its own post-images, §5/§6 skipped)');

    // W-PRIV — the real role, not has_*_privilege.
    const probes = [
      'select 1 from public.account_wallet limit 1',
      `insert into public.account_wallet (user_id, gems) values ('${E}', 1000000)`,
      'update public.account_wallet set gems = gems + 1',
      `insert into public.account_gem_grants (user_id, grant_key, slot, gems) values ('${E}', 'x', 0, 1)`,
      `select public.hr_wallet_credit('${E}', 0, 1, 'x', null)`,
      `select public.hr_wallet_debit('${E}', 0, 1, 'x', null)`,
      `select public.hr_wallet_ensure('${E}')`,
    ];
    for (const p of probes) {
      await db.exec('savepoint p;');
      let refused = false;
      try {
        await db.exec(`set local role authenticated; ${p};`);
      } catch (e) { refused = /permission denied/i.test(String(e.message)); }
      await db.exec('rollback to savepoint p; reset role;');
      if (!refused) return `W-PRIV: authenticated was not refused: ${p}`;
    }
    console.log(`  ✓ W-PRIV — authenticated is refused all ${probes.length} reads / writes / helper calls`);
    return null;
  });
  if (applied) { red.push(applied.startsWith('W-') ? applied.split(':')[0] : 'W-APPLY'); console.log(`  ✗ ${applied}`); }

  const carried = await tryApply(db, SEED + SQL, async () => {
    const w = Object.fromEntries((await db.query(
      `select user_id::text u, gems::int g, hearth_tokens::int t from public.account_wallet where user_id in ('${A}','${B}','${E}')`))
      .rows.map((r) => [r.u, r]));
    if (w[A]?.g !== 548 || w[A]?.t !== 2 || w[B]?.g !== 3 || w[E]?.g !== 0) {
      return `W-CARRY: wallets ${JSON.stringify(w)} — expected A 548 gems / 2 tokens (14 + 534), B 3, E 0`;
    }
    const rows = (await db.query(
      `select user_id::text u, slot, gems_in::int gi, meta from public.player_ledger
        where kind = 'wallet' and intent = 'wallet_carry:2026-10-19' and user_id in ('${A}','${B}','${E}')`)).rows;
    const a = rows.find((r) => r.u === A);
    if (rows.length !== 2 || !a || a.gi !== 0 || Number(a.meta.gems) !== 548
        || Number(a.meta.carry['0'].gems) !== 14 || Number(a.meta.carry['1'].gems) !== 534 || rows.some((r) => r.u === E)) {
      return `W-CARRY: carry journal ${JSON.stringify(rows)} — expected one row each for A and B (none for E), gems_in 0, per-slot carry`;
    }
    const st = (await db.query(`select (public.hr_state_of('${A}', 0)->'state'->>'gems')::int g0,
                                       (public.hr_state_of('${A}', 1)->'state'->>'gems')::int g1`)).rows[0];
    if (st.g0 !== 548 || st.g1 !== 548) return `W-CARRY: A's heroes project ${st.g0} / ${st.g1}, expected 548 on both`;
    console.log('  ✓ W-CARRY — per-hero gems summed into each wallet once (14 + 534 = 548), journalled per account, projected on every hero');
    return null;
  });
  if (carried) { red.push('W-CARRY'); console.log(`  ✗ ${carried}`); }

  const bad = edgeScan();
  if (bad.length) { red.push('W-EDGE'); console.log(`  ✗ W-EDGE — ${bad.join('; ')}`); }
  else console.log('  ✓ W-EDGE — the claim receipt reports what the wallet paid (gems_paid), never the price');
  await db.close();
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: one account wallet — once per account, journalled, the same on every hero');
  process.exit(red.length ? 1 : 0);
}

const CREDIT_VALIDATED = "    raise exception 'hr_wallet_credit: every gem credit needs an account grant key';\n  end if;\n";
const CREDIT_LEDGER = `  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (p_uid, p_slot, 'wallet', p_key, 0, 0, 0, 0, p_gems,
     jsonb_build_object('gems', p_gems, 'balance', v_w.gems,
                        'wallet_version', v_w.version, 'key', p_key));
`;
const MUTANTS = [
  { name: 'perSlotGrant', why: 'the grant key is per HERO: a second hero of the account is paid the same reward again', expect: /§8 v1/,
    edits: [[CREDIT_VALIDATED, CREDIT_VALIDATED + "  p_key := p_key || ':slot' || p_slot;\n"]] },
  { name: 'missingLedgerRow', why: 'a credit lands in the wallet with no journal row', expect: /§8 v[45]/,
    edits: [[CREDIT_LEDGER, '']] },
  { name: 'projectionReadsOldColumn', why: 'the per-hero column is kept and the envelope projects it instead of the wallet', expect: /§8 (k4|v3)/,
    edits: [
      ["'gems', coalesce(v_w.gems, 0),", "'gems', v_st.gems,"],
      ['  alter table public.player_state drop column gems;\n', ''],
    ] },
  { name: 'clientGrantOnTable', why: 'authenticated may write the wallet table under a permissive policy', expect: /§8 k2/,
    edits: [['-- ── §2 player_ledger.kind ADMITS', 'grant select, insert, update on public.account_wallet to authenticated;\n'
      + 'create policy "account_wallet own write" on public.account_wallet for all to authenticated '
      + 'using (user_id = auth.uid()) with check (user_id = auth.uid());\n-- ── §2 player_ledger.kind ADMITS']] },
  { name: 'claimWritesWalletDirectly', why: 'a claim credits account_wallet itself, outside the choke point (no key, no cap, no journal)', expect: /§8 k5/,
    edits: [["    v_gems := (public.hr_wallet_credit(auth.uid(), v_slot, v_gems, 'rank:' || p_rank_id, null) ->> 'paid')::int;\n",
             "    update public.account_wallet set gems = gems + v_gems where user_id = auth.uid();\n"]] },
  { name: 'dayCapPerSlot', why: 'the gem day cap is summed per HERO: five heroes get five ceilings', expect: /§8 v4/,
    edits: [['      where l.user_id = p_user and l.gems_in > 0\n', '      where l.user_id = p_user and l.gems_in > 0 and l.slot = p_slot\n']] },
  { name: 'engineSpends', why: 'hr_apply accepts a negative gem delta (the engine spends)', expect: /§8 v2/,
    edits: [["      if v_n < 0 then\n        perform public.hr_reject('bad_delta', jsonb_build_object(\n          'field', 'gems', 'why', 'the engine never spends gems'));\n      end if;\n", '']] },
  { name: 'heroSlotDebitsTwice', why: 'a hero-slot purchase debits the wallet twice', expect: /§8 v3/,
    edits: [["  v_wallet := public.hr_wallet_debit(v_uid, v_slot, v_cat.cost_gems, v_intent,\n                jsonb_build_object('slot_id', v_cat.slot_id, 'idem', p_idem));\n",
             "  perform public.hr_wallet_debit(v_uid, v_slot, v_cat.cost_gems, v_intent || ':x', '{}'::jsonb);\n"
             + "  v_wallet := public.hr_wallet_debit(v_uid, v_slot, v_cat.cost_gems, v_intent,\n                jsonb_build_object('slot_id', v_cat.slot_id, 'idem', p_idem));\n"]] },
];
const EDGE_ANCHOR = "gems: ('gems_paid' in res) ? Number(res.gems_paid) || 0 : (priced.gems || 0),";
if (EDGE.split(EDGE_ANCHOR).length !== 2) { console.error('harness: the edge mutant anchor moved'); process.exit(2); }
const EDGE_MUTANTS = [
  { name: 'receiptFromPrice', why: 'the claim receipt reports the PRICED gems, not what the wallet paid',
    src: EDGE.replace(EDGE_ANCHOR, () => 'gems: priced.gems || 0,') },
];

console.log('\naccount-wallet --mutate: every mutant must go RED on its named arm');
if (edgeScan().length) { console.error('harness: the unmutated edge scan is red'); process.exit(2); }
const control = await tryApply(db, SQL);
if (control) { console.error(`harness: the unmutated file is red (${control})`); process.exit(2); }
console.log(`[mutants] ${MUTANTS.length + EDGE_MUTANTS.length}`);
let survived = 0;
for (const m of EDGE_MUTANTS) {
  const bad = edgeScan(CONTROL ? EDGE : m.src);
  const hit = bad.length > 0;
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via W-EDGE: ${bad[0]}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: SURVIVED`); }
}
for (const m of MUTANTS) {
  let mutated = SQL;
  for (const [find, repl] of m.edits) {
    const n = mutated.split(find).length - 1;
    if (n !== 1) { console.error(`harness: ${m.name}: anchor matched ${n}x: ${find.slice(0, 80)}`); process.exit(2); }
    if (!CONTROL) mutated = mutated.replace(find, () => repl);
  }
  const cut = mutated.indexOf(SELF);
  const got = await tryApply(db, mutated.slice(0, cut), async () => {
    try { await db.exec(mutated.slice(cut)); return null; } catch (e) { return String(e.message).split('\n')[0]; }
  });
  const hit = got !== null && m.expect.test(got);
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${got.slice(0, 160)}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${got === null ? 'SURVIVED' : `red only via ${got.slice(0, 300)}`}`); }
}
await db.close();
const total = MUTANTS.length + EDGE_MUTANTS.length;
if (CONTROL) {
  console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${total - survived} arm(s) read caught`);
  process.exit(survived === total ? 0 : 1);
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${total} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
