#!/usr/bin/env node
// ============================================================================
// tests/discord-gift.mjs — THE DISCORD GIFT PAYS ONCE PER ACCOUNT, FROM A
//                          SERVER CODE, A SERVER AMOUNT, AND A JOURNAL ROW.
//
//   node tests/discord-gift.mjs            the guard
//   node tests/discord-gift.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-18-discord-gift.sql. The chain is replayed up to
// the file before it; the file runs inside a transaction that is always rolled
// back, so a red self-check is a RED arm carrying the self-check's own message.
//
//   D-APPLY   the file applies and its §8 passes: the right code pays the
//             server constant into the named character; the same character
//             and ANOTHER character of the same account are refused
//             already_claimed and paid nothing; a wrong code, a malformed code
//             and a ROTATED code are refused; exactly one discord_gift ledger
//             row carries +50 in meta.gems; the wrapper is rate limited; the
//             tables are RLS-forced with no client privilege; the once-row is
//             keyed on the account alone; no amount argument exists.
//   D-IDEM    a second apply is byte-identical (inventory + the four bodies).
//   D-CLIENT  the client sends a code and a slot and nothing else: the
//             transport's claimDiscordGift body names no amount, and the gift
//             sheet writes no currency.
//
// --mutate: per-character once-row, no once-row, a client-sent amount (server
// overload + client transport), rotated code still pays, no journal, gate
// bypassed, inner granted to clients.
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const MIG = '2026-10-18-discord-gift.sql';
const PREV = '2026-10-17-bestiary-target.sql';
const SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
const SELF = '-- ── §8 SELF-CHECK';
if (SQL.indexOf(SELF) < 0) { console.error('harness: the migration has no §8 marker'); process.exit(2); }
const SIGS = [
  'public.hr_claim_discord_gift(integer,text)',
  'public.hr_claim_discord_gift__ungated(integer,text)',
  'public.hr_discord_code_rotate(text)',
  'public.hr_rpc_gate(text)',
];
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

/* D-CLIENT: what crosses the wire, and what the sheet may write. */
async function clientScan(override = {}) {
  const read = async (f) => (f in override ? override[f] : await readFile(join(ROOT, f), 'utf8'));
  const bad = [];
  const gc = await read('src/net/goal-claim.js');
  const m = gc.match(/claimDiscordGift: function \(code\) \{([^\n]*)\}/);
  if (!m) bad.push('goal-claim.js has no one-line claimDiscordGift(code)');
  else {
    if (!/call\('hr_claim_discord_gift', \{ p_slot: activeSlot\(\), p_code: String\(code \|\| ''\) \}\)/.test(m[1])) {
      bad.push(`claimDiscordGift sends more than (p_slot, p_code): ${m[1].trim()}`);
    }
  }
  const dc = (await read('src/features/discord-invite.js'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  if (/\.gems\s*(=|\+=|-=)|\bG\.gems\b/.test(dc)) bad.push('discord-invite.js writes or reads G.gems');
  if (/\b50\b/.test(dc)) bad.push('discord-invite.js types the gift amount');
  return bad;
}

let db;
try { ({ db } = await bootReplay({ upTo: PREV })); } catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
}

if (!MUTATE) {
  console.log('\ndiscord-gift: a server code pays a server amount once per account, journalled');
  const red = [];
  const err = await tryApply(db, SQL, async () => {
    const inv1 = JSON.stringify(await inventory(db));
    const b1 = await bodies(db);
    console.log('  ✓ D-APPLY — applied; §8 passed (k1-k6, v1-v7)');
    try { await db.exec(SQL); } catch (e) { return `D-IDEM: the second apply RAISED: ${String(e.message).split('\n')[0]}`; }
    if (JSON.stringify(await inventory(db)) !== inv1 || (await bodies(db)) !== b1) {
      return 'D-IDEM: the second apply moved the schema or a body';
    }
    console.log('  ✓ D-IDEM — a second apply is byte-identical (§3 skipped, §4 pin accepted its own body, §8 passed twice)');
    return null;
  });
  if (err) { red.push(err.startsWith('D-') ? err.split(':')[0] : 'D-APPLY'); console.log(`  ✗ ${err}`); }
  const bad = await clientScan();
  if (bad.length) { red.push('D-CLIENT'); console.log(`  ✗ D-CLIENT — ${bad.join('; ')}`); }
  else console.log('  ✓ D-CLIENT — the client sends (slot, code) only and writes no currency');
  await db.close();
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: one gift per account, from the server\'s code and amount');
  process.exit(red.length ? 1 : 0);
}

const GRANT = 'grant execute on function public.hr_claim_discord_gift(integer, text) to authenticated;\n';
const MUTANTS = [
  { name: 'perCharacter', why: 'the once-row is keyed per CHARACTER: a second hero of the same account claims again', expect: /§8 (k3|v4)/,
    edits: [
      ['  user_id    uuid        primary key references auth.users (id) on delete cascade,\n  slot       integer     not null check (slot between 0 and 5),\n',
       '  user_id    uuid        not null references auth.users (id) on delete cascade,\n  slot       integer     not null check (slot between 0 and 5),\n  primary key (user_id, slot),\n'],
      ['  if exists (select 1 from public.hr_discord_gift_claims where user_id = v_uid) then\n',
       '  if exists (select 1 from public.hr_discord_gift_claims where user_id = v_uid and slot = p_slot) then\n'],
      ['  on conflict (user_id) do nothing;\n', '  on conflict (user_id, slot) do nothing;\n'],
    ] },
  { name: 'noOnceRow', why: 'no once-row: the same code pays every time it is typed', expect: /§8 v4/,
    edits: [
      ['  if exists (select 1 from public.hr_discord_gift_claims where user_id = v_uid) then\n',
       '  if false and exists (select 1 from public.hr_discord_gift_claims where user_id = v_uid) then\n'],
      ['  insert into public.hr_discord_gift_claims (user_id, slot, code_hash, gems)\n  values (v_uid, p_slot, v_hash, c_gift_gems)\n  on conflict (user_id) do nothing;\n  get diagnostics v_rows = row_count;\n  if v_rows = 0 then\n',
       '  v_rows := 1;\n  if v_rows = 0 then\n'],
    ] },
  { name: 'clientAmount', why: 'a client-sent amount: an overload takes p_gems from the caller and pays it', expect: /§8 (k5|k6)/,
    edits: [[GRANT, GRANT
      + 'create or replace function public.hr_claim_discord_gift(p_slot integer, p_code text, p_gems integer)\n'
      + ' returns jsonb language plpgsql volatile security definer set search_path to \'public\', \'pg_catalog\' as $m$\n'
      + 'begin\n  if not public.hr_rpc_gate(\'hr_claim_discord_gift\') then return null; end if;\n'
      + '  update public.player_state set gems = gems + p_gems where user_id = auth.uid() and slot = p_slot;\n'
      + '  return jsonb_build_object(\'ok\', true);\nend $m$;\n'
      + 'revoke execute on function public.hr_claim_discord_gift(integer, text, integer) from public, anon;\n'
      + 'grant execute on function public.hr_claim_discord_gift(integer, text, integer) to authenticated;\n']] },
  { name: 'rotatedStillPays', why: 'a retired code still pays', expect: /§8 v6/,
    edits: [['  if not v_active then\n    return jsonb_build_object(\'ok\', false, \'error\', \'code_expired\');\n',
             '  if false then\n    return jsonb_build_object(\'ok\', false, \'error\', \'code_expired\');\n']] },
  { name: 'anyCodePays', why: 'the code is not checked against the server table', expect: /§8 v2/,
    edits: [['  if v_active is null then\n    return jsonb_build_object(\'ok\', false, \'error\', \'wrong_code\');\n',
             '  if false then\n    return jsonb_build_object(\'ok\', false, \'error\', \'wrong_code\');\n']] },
  { name: 'noJournal', why: 'the gift is paid with no ledger row', expect: /§8 v5/,
    edits: [['  insert into public.player_ledger\n    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)\n  values\n    (v_uid, p_slot, \'discord_gift\'',
             '  insert into public.player_ledger\n    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)\n  select\n    v_uid, p_slot, \'discord_gift\'']] ,
    // `select … where false` keeps the statement valid and writes nothing.
    tail: [['     jsonb_build_object(\'gems\', c_gift_gems, \'code\', left(v_hash, 12)));\n',
            '     jsonb_build_object(\'gems\', c_gift_gems, \'code\', left(v_hash, 12)) where false;\n']] },
  { name: 'rateGateBypassed', why: 'the gate is named but never refuses', expect: /§8 v7/,
    edits: [["  if not public.hr_rpc_gate('hr_claim_discord_gift') then\n", "  if false and not public.hr_rpc_gate('hr_claim_discord_gift') then\n"]] },
  { name: 'ungatedGranted', why: 'the ungated inner is client-executable', expect: /§8 k1/,
    edits: [[GRANT, GRANT + 'grant execute on function public.hr_claim_discord_gift__ungated(integer, text) to authenticated;\n']] },
  { name: 'gateDropsBucket', why: 'the restated gate silently loses another lane\'s bucket (the b484 class)', expect: /§8 k4/,
    edits: [["    when 'party_hunt_view' then v_limit := 20;\n    when 'hr_claim_discord_gift'", "    when 'hr_claim_discord_gift'"]] },
];

/* The client half's own mutants: an amount on the wire, a currency write in the sheet. */
async function scanMutants() {
  const gc = await readFile(join(ROOT, 'src/net/goal-claim.js'), 'utf8');
  const dc = await readFile(join(ROOT, 'src/features/discord-invite.js'), 'utf8');
  const a = "p_code: String(code || '') }); },";
  if (gc.split(a).length !== 2) { console.error('harness: client mutant anchor moved'); process.exit(2); }
  return [
    { name: 'clientSendsAmount', why: 'the transport sends a gem amount with the code',
      over: { 'src/net/goal-claim.js': gc.replace(a, () => "p_code: String(code || ''), p_gems: 50 }); },") } },
    { name: 'sheetPaysLocally', why: 'the sheet adds the gift to G.gems itself',
      over: { 'src/features/discord-invite.js': dc.replace("status.textContent = r.text;", () => 'status.textContent = r.text; window.G.gems += 50;') } },
  ];
}

console.log('\ndiscord-gift --mutate: every mutant must go RED on its named arm');
if ((await clientScan()).length) { console.error('harness: the unmutated client scan is red'); process.exit(2); }
const control = await tryApply(db, SQL);
if (control) { console.error(`harness: the unmutated file is red (${control})`); process.exit(2); }
const SCAN = await scanMutants();
console.log(`[mutants] ${MUTANTS.length + SCAN.length}`);
let survived = 0;
for (const m of SCAN) {
  const bad = CONTROL ? await clientScan() : await clientScan(m.over);
  const hit = bad.length > 0;
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via D-CLIENT: ${bad[0]}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: SURVIVED`); }
}
for (const m of MUTANTS) {
  let mutated = SQL;
  for (const [find, repl] of [...m.edits, ...(m.tail || [])]) {
    const n = mutated.split(find).length - 1;
    if (n !== 1) { console.error(`harness: ${m.name}: anchor matched ${n}x: ${find.slice(0, 60)}`); process.exit(2); }
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
const total = MUTANTS.length + SCAN.length;
if (CONTROL) {
  console.log(`\nHR_MUTANT_CONTROL: nothing planted; ${total - survived} arm(s) read caught`);
  process.exit(survived === total ? 0 : 1);
}
console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${total} mutants red on their named arm`);
process.exit(survived ? 1 : 0);
