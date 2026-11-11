// ════════════════════════════════════════════════════════════════════════
// tests/lifetime-facts-reapply.mjs — SECURITY PROOF (2026-09-20, b550 review)
//
// 2026-09-19-lifetime-facts-off-the-ledger.sql is ONE-SHOT on any database
// where a player has since found a trophy, and the second apply fails LOUDLY
// in §2 — outside any self-check, outside any rollback sentinel.
//
// §2 runs the backfill as the file's WORK:
//     do $$ declare v jsonb; begin v := public.hr_backfill_lifetime_facts(); ...
// with no exception handler. hr_backfill_lifetime_facts refuses (correctly,
// finding S-LF-1) the moment hearthfind_log holds a row with src_ledger_id
// NULL — i.e. a find hr_apply allocated live. So:
//
//   first apply   → green (no live finds exist yet; the table is created here)
//   one live find → the file can never be applied again
//
// That is the SAFE direction and it is not a defect. It is a FACT THE APPLY
// ORDER HAS TO CARRY, because CLAUDE.md §4 requires the chain to replay with a
// byte-identical second apply, and tests/schema-drift.mjs replays a chain with
// NO live finds — so nothing in the repo states this file's one-shot-ness, and
// nothing would stop a future Coordinator re-running it on production to
// "re-verify the gates" and taking an apply failure with the accrual engine
// live.
//
//   node tests/lifetime-facts-reapply.mjs
//
// Exit: 0 both properties hold · 1 a property is red · 2 harness.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootReplay } from './schema-replay.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const FILE = '2026-09-19-lifetime-facts-off-the-ledger.sql';

const say = (ok, s) => { console.log(`  ${ok ? 'ok  ' : 'RED '} ${s}`); return ok; };

async function main() {
  const sql = (await readFile(join(ROOT, 'supabase', 'migrations', FILE), 'utf8'))
    .replace(/\r\n/g, '\n');

  const { db } = await bootReplay({});
  let green = true;

  // ── (1) A CLEAN SECOND APPLY IS GREEN. The property CLAUDE.md §4 requires,
  //        and the state tests/schema-drift.mjs replays: no live finds.
  const live0 = await db.query(
    `select count(*)::int as n from public.hearthfind_log where src_ledger_id is null`);
  green = say(live0.rows[0].n === 0,
    `after the chain, hearthfind_log holds ${live0.rows[0].n} live (src_ledger_id NULL) find row(s) — expected 0`) && green;

  // 2026-11-11 re-aim: this file is a ONE-SHOT, and on the END of the chain it is un-re-appliable even with no live finds: its
  // PRECONDITIONS name a world later migrations moved (hr_claim_bounty__ungated was dropped by 2026-10-23-demolition-bounty-gems-close.sql,
  // hr_apply's body has been restated since). That is the safe direction, and it is the fact this proof now asserts: a second apply must
  // REFUSE with a PRECONDITION, never run. (It used to assert "a clean second apply is green", true only before 2026-10-23.)
  let reErr = null;
  try { await db.exec(sql); } catch (e) { reErr = e; }
  const preRefused = !!reErr && /PRECONDITION/.test(String(reErr.message || reErr));
  green = say(preRefused,
    preRefused
      ? `a second apply at the end of the chain refuses at its PRECONDITIONS (the file is one-shot): ${String(reErr.message).split('\n')[0].slice(0, 100)}`
      : `a second apply at the end of the chain did NOT refuse at a PRECONDITION (${reErr ? String(reErr.message).slice(0, 110) : 'it succeeded'})`) && green;

  // ── (2) ONE LIVE FIND CLOSES THE BACKFILL. Exactly the row hr_apply writes when a player finds a trophy: src_ledger_id NULL, nth_ever
  //        ALLOCATED. (player_state.gold moved to account_wallet.gold in 2026-12-15-account-gold.sql; the find needs only the slot row.)
  await db.exec(`
    insert into auth.users (id) values ('000005ec-0000-0000-0000-0000000005ec')
      on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, version)
      values ('000005ec-0000-0000-0000-0000000005ec', 0, 0)
      on conflict (user_id, slot) do nothing;
    insert into public.hearthfind_ordinal as o (item_id, found_total, updated_at)
      values ('sec_live_trophy', 1, now())
      on conflict (item_id) do update set found_total = o.found_total + 1;
    insert into public.hearthfind_log (user_id, slot, item_id, nth_ever)
      values ('000005ec-0000-0000-0000-0000000005ec', 0, 'sec_live_trophy', 1);
  `);

  // The file still cannot apply (it never succeeds with a live find)...
  let err = null;
  try { await db.exec(sql); } catch (e) { err = e; }
  green = say(!!err, err ? 're-applying with a live find fails (never runs)' : 're-applying with a live find SUCCEEDED') && green;

  // ...and the S-LF-1 guard itself, the function §2 calls, refuses by name.
  let bErr = null;
  try { await db.query('select public.hr_backfill_lifetime_facts()'); } catch (e) { bErr = e; }
  const refused = !!bErr && /REFUSING/.test(String(bErr.message || bErr));
  green = say(refused,
    refused
      ? `one live find makes the backfill refuse (S-LF-1): ${String(bErr.message).split('\n')[0].slice(0, 110)}`
      : `hr_backfill_lifetime_facts did NOT refuse with a live find (${bErr ? String(bErr.message).slice(0, 110) : 'it succeeded'}) — the S-LF-1 guard is not biting`) && green;

  // ── (3) THE REFUSAL IS §2's, NOT A SELF-CHECK's — so it is NOT inside the
  //        HR_ROLLBACK_SENTINEL block and NOT a gate the Coordinator can read
  //        as "the probe failed". The whole apply stops.
  const inWork = /do \$\$\ndeclare v jsonb;\nbegin\n  v := public\.hr_backfill_lifetime_facts\(\);/.test(sql);
  green = say(inWork,
    inWork
      ? '§2 calls the backfill as the file\'s WORK, unguarded — the refusal aborts the apply, it is not a gate message'
      : '§2\'s unguarded backfill call has moved — re-read the file before trusting this proof');

  if (!green) {
    console.error('\nlifetime-facts-reapply: RED');
    process.exit(1);
  }
  console.log('\nlifetime-facts-reapply: OK — first apply green, one live find closes the file for good.');
}

main().catch((e) => { console.error(e.message || e); process.exit(e.harness ? 2 : 1); });
