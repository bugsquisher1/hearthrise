#!/usr/bin/env node
// ============================================================================
// tests/absence-claim-wallet.mjs — THE ABSENCE CLAIM PAYS ITS GOLD ON THE
//                                  PLEDGE'S CHARACTER AND ITS GEM INTO THE
//                                  ACCOUNT WALLET, ONCE PER ACCOUNT PER DAY.
//
//   node tests/absence-claim-wallet.mjs            the guard
//   node tests/absence-claim-wallet.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-19-absence-claim-wallet.sql (Security F1 on the
// account wallet), replayed up to the file before it and applied inside a
// rolled-back transaction. The file's §2 is the executed proof: an ATTENDED
// claim through the real wrapper — gold delta = receipt on char_slot, wallet
// +1 = gems_paid, decoy and bystander unmoved, one claim row (gems_in 0,
// meta.gems_paid) and one kind='wallet' row, replay refused, a second hero of
// the account paid 0 gems. A red §2 is a red arm carrying its own message.
//
//   A-APPLY   the file applies on the chain and its §2 passes.
//   A-IDEM    a second apply is byte-identical (§0 accepts its own body).
//   A-ORDER   tests/schema-apply-order/ runs it right after the wallet.
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { loadApplyOrder } from '../tools/lib/apply-order.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const MIG = '2026-10-19-absence-claim-wallet.sql';
const PREV = '2026-10-19-account-wallet.sql';
const SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
const SELF = '-- ── §2 SELF-CHECK';
if (SQL.indexOf(SELF) < 0) { console.error('harness: the migration has no §2 marker'); process.exit(2); }
const BODY = `select md5(replace(prosrc, chr(13), '')) m from pg_proc
               where oid = 'public.world_event_absence_claim__ungated(text)'::regprocedure`;

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

let db;
try { ({ db } = await bootReplay({ upTo: PREV })); } catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
}

if (!MUTATE) {
  console.log('\nabsence-claim-wallet: gold on char_slot, the gem into the account wallet, once per account');
  const red = [];
  const order = loadApplyOrder(ROOT).order;
  if (order.indexOf(MIG) !== order.indexOf(PREV) + 1) {
    red.push('A-ORDER'); console.log(`  ✗ A-ORDER — ${MIG} must run immediately after ${PREV}`);
  } else console.log('  ✓ A-ORDER — runs immediately after the wallet that drops player_state.gems');
  const got = await tryApply(db, SQL, async () => {
    console.log('  ✓ A-APPLY — applied; §2 attended claim: gold = receipt on char_slot, wallet +1 = gems_paid, once per account');
    const inv1 = JSON.stringify(await inventory(db));
    const b1 = (await db.query(BODY)).rows[0].m;
    try { await db.exec(SQL); } catch (e) { return `A-IDEM: the second apply RAISED: ${String(e.message).split('\n')[0]}`; }
    if (JSON.stringify(await inventory(db)) !== inv1 || (await db.query(BODY)).rows[0].m !== b1) {
      return 'A-IDEM: the second apply moved the schema or the body';
    }
    console.log('  ✓ A-IDEM — a second apply is byte-identical (§0 accepted its own post-image)');
    return null;
  });
  if (got) { red.push(got.startsWith('A-') ? got.split(':')[0] : 'A-APPLY'); console.log(`  ✗ ${got}`); }
  await db.close();
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: the absence gem lands in the account wallet, once');
  process.exit(red.length ? 1 : 0);
}

const MUTANTS = [
  { name: 'perCharacterKey', why: 'the grant key names the character: a second hero of the account is paid a second gem',
    expect: /§2\(e\)/,
    edits: [["'world_event_absence:' || v_day_key, now() + interval '3 days')", "'world_event_absence:' || v_day_key || ':' || v_cs, now() + interval '3 days')"]] },
  { name: 'noWalletCredit', why: 'the receipt says 1 gem and the wallet is never credited (the F1 lie, again)',
    expect: /§2\((b|c)\)/,
    edits: [["  if v_gems_out > 0 then\n    v_gems_out := (public.hr_wallet_credit(auth.uid(), v_cs, v_gems_out,\n                     'world_event_absence:' || v_day_key, now() + interval '3 days') ->> 'paid')::int;\n  end if;\n", '']] },
  { name: 'claimRowCarriesGems', why: 'the claim row carries meta.gems: the account gem history sums twice',
    expect: /§2\(c\)/,
    edits: [["'window', v_p.slot, 'gems_paid', v_gems_out, 'absence_gold', c_gold,", "'window', v_p.slot, 'gems', v_gems_out, 'absence_gold', c_gold,"]] },
  { name: 'claimRowGemsIn', why: 'the claim row journals the gem inflow as well as the wallet row',
    expect: /§2\(c\)/,
    edits: [['     v_gold_out, v_gold_out, v_xp_total, 0, 0,\n', '     v_gold_out, v_gold_out, v_xp_total, 0, v_gems_out,\n']] },
  { name: 'paysTheWindow', why: 'the gold goes to world_event_pledges.slot (the rally WINDOW), not char_slot',
    expect: /§2\(c\)/,
    edits: [["   where user_id = auth.uid() and slot = v_cs;\n\n  -- ── THE GEMS", "   where user_id = auth.uid() and slot = v_p.slot;\n\n  -- ── THE GEMS"]] },
  { name: 'innerGranted', why: 'the ungated inner is client-executable',
    expect: /§2\(a\)/,
    edits: [['revoke execute on function public.world_event_absence_claim__ungated(text) from anon, authenticated, service_role;\n',
             'revoke execute on function public.world_event_absence_claim__ungated(text) from anon, authenticated, service_role;\n'
             + 'grant execute on function public.world_event_absence_claim__ungated(text) to authenticated;\n']] },
];

console.log('\nabsence-claim-wallet --mutate: every mutant must go RED on its named arm');
const control = await tryApply(db, SQL);
if (control) { console.error(`harness: the unmutated file is red (${control})`); process.exit(2); }
console.log(`[mutants] ${MUTANTS.length}`);
let survived = 0;
for (const m of MUTANTS) {
  let mutated = SQL;
  for (const [find, repl] of m.edits) {
    const n = mutated.split(find).length - 1;
    if (n !== 1) { console.error(`harness: ${m.name}: anchor matched ${n}x: ${find.slice(0, 60)}`); process.exit(2); }
    if (!CONTROL) mutated = mutated.replace(find, () => repl);
  }
  /* The §0 pin would refuse a mutated body on a second apply only; the first
     apply of a mutant reaches §2, which is the arm under test. */
  const got = await tryApply(db, mutated);
  const hit = got !== null && m.expect.test(got);
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${got.slice(0, 160)}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: ${got === null ? 'SURVIVED' : `red only via ${got.slice(0, 300)}`}`); }
}
await db.close();
if (CONTROL) {
  console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${MUTANTS.length - survived} arm(s) read caught`);
  process.exit(survived === MUTANTS.length ? 0 : 1);
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
