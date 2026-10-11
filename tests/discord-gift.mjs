#!/usr/bin/env node
// ============================================================================
// tests/discord-gift.mjs — THE DISCORD GIFT PAYS ONCE PER ACCOUNT, FROM A
//                          WEEKLY SERVER-DERIVED CODE, A SERVER AMOUNT, AND A
//                          JOURNAL ROW.
//
//   node tests/discord-gift.mjs            the guard
//   node tests/discord-gift.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-18-discord-gift.sql, replayed up to the file
// before it; the file always runs inside a rolled-back transaction, so a red
// self-check is a RED arm carrying the self-check's own message. Two states,
// both executed, because the file's §8 proves a different half in each:
//
//   D-CLOSED  no Vault (the credential-free replay, or production before the
//             secret is stored): §8 v0 — the claim answers gift_unavailable,
//             the operator read answers no_secret, nothing is paid.
//   D-OPEN    Vault + the pgcrypto shim (tests/world-tick-token-shims.mjs, RFC
//             2104 over core sha256, pinned there against node:crypto): §8
//             v2-v7 — wrong / over-long / two-weeks-old codes refused (wrong
//             journalled), this week's code pays 25 once, a second character
//             of the same account is refused, last week's code is honoured,
//             one ledger row, rate limited.
//   D-DERIVE  the server's code equals an independent Node derivation (HMAC-
//             SHA256 of the secret over 'hearthrise-discord-gift:<ISO week>',
//             bytes 0-5 mod 31 into the alphabet) and the operator read prints it.
//   D-IDEM    a second apply is byte-identical (inventory + the bodies).
//   D-CLIENT  the transport sends (slot, code) only; the sheet writes no
//             currency; its display GIFT_GEMS equals the server's c_gift_gems;
//             the operator tool sends one read-only query.
//
// --mutate: per-character once-row, no once-row, a client-sent amount, an
// expired code paying, any code paying, no journal, wrong codes not journalled,
// fail-open without a secret, gate bypassed, the inner or the operator read
// granted to a client or hr_engine, a dropped gate bucket; + client mutants.
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { SHIM_CRYPTO, lit } from './world-tick-token-shims.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const MIG = '2026-10-18-discord-gift.sql';
const PREV = '2026-10-10-w0a-catalogue-cuts.sql';
const SQL = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
const SELF = '-- ── §8 SELF-CHECK';
if (SQL.indexOf(SELF) < 0) { console.error('harness: the migration has no §8 marker'); process.exit(2); }
const SECRET = 'discord-gift-test-secret-'.padEnd(64, 'x');
const VAULT = SHIM_CRYPTO + `
create schema if not exists vault;
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets (name, decrypted_secret) values ('hr_discord_gift_secret', ${lit(SECRET)})
on conflict (name) do update set decrypted_secret = excluded.decrypted_secret;`;
const SIGS = [
  'public.hr_claim_discord_gift(integer,text)', 'public.hr_claim_discord_gift__ungated(integer,text)',
  'public.hr_discord_code_for(text)', 'public.hr_discord_code_current()', 'public.hr_rpc_gate(text)',
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

/* The derivation, written again in Node: the server must agree with it. */
function nodeCode(week) {
  const mac = createHmac('sha256', SECRET).update(`hearthrise-discord-gift:${week}`).digest();
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c = 'HEARTH';
  for (let i = 0; i < 6; i++) c += A[mac[i] % A.length];
  return c;
}

/* D-CLIENT: what crosses the wire, what the sheet may write, the display copy
   of the amount, and the operator tool's one query. */
async function clientScan(override = {}) {
  const read = async (f) => (f in override ? override[f] : await readFile(join(ROOT, f), 'utf8'));
  const bad = [];
  const gc = await read('src/net/goal-claim.js');
  const m = gc.match(/claimDiscordGift: function \(code\) \{([^\n]*)\}/);
  if (!m) bad.push('goal-claim.js has no one-line claimDiscordGift(code)');
  else if (!/call\('hr_claim_discord_gift', \{ p_slot: activeSlot\(\), p_code: String\(code \|\| ''\) \}\)/.test(m[1])) {
    bad.push(`claimDiscordGift sends more than (p_slot, p_code): ${m[1].trim()}`);
  }
  const dc = (await read('src/features/discord-invite.js'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  if (/\.gems\s*(=|\+=|-=)|\bG\.gems\b/.test(dc)) bad.push('discord-invite.js writes or reads G.gems');
  const shown = (dc.match(/var GIFT_GEMS = (\d+);/) || [])[1];
  const paid = (SQL.match(/c_gift_gems constant integer := (\d+);/) || [])[1];
  if (!shown || !paid || shown !== paid) bad.push(`the invite copy says ${shown} gems, the server pays ${paid}`);
  const tool = await read('tools/discord-gift-code.mjs');
  const sends = tool.match(/JSON\.stringify\(\{ query: (\w+) \}\)/g) || [];
  if (sends.length !== 1 || !/const QUERY = 'select public\.hr_discord_code_current\(\) as r';/.test(tool)) {
    bad.push('tools/discord-gift-code.mjs sends something other than the one read-only operator query');
  }
  return bad;
}

let db;
try { ({ db } = await bootReplay({ upTo: PREV })); } catch (e) {
  console.error(`harness: the migration chain did not replay — ${e.message}`); process.exit(2);
}

if (!MUTATE) {
  console.log('\ndiscord-gift: a weekly server-derived code pays a server amount once per account, journalled');
  const red = [];
  const closed = await tryApply(db, SQL, async () => {
    console.log('  ✓ D-CLOSED — no Vault: applied; §8 k1-k6 + v0 (gift_unavailable, no_secret, nothing paid)');
    const inv1 = JSON.stringify(await inventory(db));
    const b1 = await bodies(db);
    try { await db.exec(SQL); } catch (e) { return `D-IDEM: the second apply RAISED: ${String(e.message).split('\n')[0]}`; }
    if (JSON.stringify(await inventory(db)) !== inv1 || (await bodies(db)) !== b1) return 'D-IDEM: the second apply moved the schema or a body';
    console.log('  ✓ D-IDEM — a second apply is byte-identical (§2 skipped, §3 pin accepted its own body)');
    return null;
  });
  if (closed) { red.push(closed.startsWith('D-') ? closed.split(':')[0] : 'D-CLOSED'); console.log(`  ✗ ${closed}`); }
  const open = await tryApply(db, VAULT + SQL, async () => {
    console.log('  ✓ D-OPEN — Vault + secret: applied; §8 v2-v7 paid once per account, refused the rest');
    const week = (await db.query(`select to_char(now() at time zone 'utc', 'IYYY"W"IW') w`)).rows[0].w;
    const got = (await db.query(`select public.hr_discord_code_for(${lit(week)}) c, public.hr_discord_code_current() r`)).rows[0];
    const want = nodeCode(week);
    if (got.c !== want) return `D-DERIVE: the server derived ${got.c}, Node derives ${want}`;
    if (got.r.code !== `${want.slice(0, 6)}-${want.slice(6)}` || got.r.week !== week) return `D-DERIVE: the operator read answered ${JSON.stringify(got.r)}`;
    console.log(`  ✓ D-DERIVE — the server code for ${week} equals the Node HMAC derivation, and the operator read prints it`);
    return null;
  });
  if (open) { red.push(open.startsWith('D-') ? open.split(':')[0] : 'D-OPEN'); console.log(`  ✗ ${open}`); }
  const bad = await clientScan();
  if (bad.length) { red.push('D-CLIENT'); console.log(`  ✗ D-CLIENT — ${bad.join('; ')}`); }
  else console.log('  ✓ D-CLIENT — (slot, code) only, no currency write, copy matches the server amount, the tool only reads');
  await db.close();
  console.log(red.length ? `\nRED: ${red.join(', ')}` : '\nGREEN: one gift per account, from the server\'s weekly code and amount');
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
      ['  insert into public.hr_discord_gift_claims (user_id, slot, week, gems)\n  values (v_uid, p_slot, v_used, c_gift_gems)\n  on conflict (user_id) do nothing;\n  get diagnostics v_rows = row_count;\n',
       '  v_rows := 1;\n'],
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
  { name: 'expiredStillPays', why: 'the grace window reaches two weeks back: an expired code pays', expect: /§8 v6/,
    edits: [["    v_prev := public.hr_discord_code_for(to_char((v_now - interval '7 days')", "    v_prev := public.hr_discord_code_for(to_char((v_now - interval '14 days')"]] },
  { name: 'anyCodePays', why: 'a wrong code is not refused', expect: /§8 v2/,
    edits: [["      perform public.hr_record_rejection(v_uid, p_slot, 'discord_gift', 'wrong_code', '{}'::jsonb, 1);\n      return jsonb_build_object('ok', false, 'error', 'wrong_code');\n",
             "      v_used := v_week;\n"]] },
  { name: 'wrongNotJournalled', why: 'wrong-code attempts leave no trace', expect: /§8 v2: a wrong code was not journalled/,
    edits: [["      perform public.hr_record_rejection(v_uid, p_slot, 'discord_gift', 'wrong_code', '{}'::jsonb, 1);\n", '']] },
  { name: 'noJournal', why: 'the gift is paid with no ledger row', expect: /§8 v5/,
    edits: [["  values\n    (v_uid, p_slot, 'discord_gift', 'discord_gift', 0, 0, 0, 0, 0,\n     jsonb_build_object('gems', c_gift_gems, 'week', v_used));\n",
             "  select\n    v_uid, p_slot, 'discord_gift', 'discord_gift', 0, 0, 0, 0, 0,\n     jsonb_build_object('gems', c_gift_gems, 'week', v_used) where false;\n"]] },
  { name: 'failOpen', why: 'with no secret the claim falls back to a fixed code instead of closing', closed: true, expect: /§8 v0/,
    edits: [["    return jsonb_build_object('ok', false, 'error', 'gift_unavailable');   -- no secret: closed\n",
             "    v_cur := 'HEARTHAAAAAA';\n"]] },
  { name: 'rateGateBypassed', why: 'the gate is named but never refuses', expect: /§8 v7/,
    edits: [["  if not public.hr_rpc_gate('hr_claim_discord_gift') then\n", "  if false and not public.hr_rpc_gate('hr_claim_discord_gift') then\n"]] },
  { name: 'ungatedGranted', why: 'the ungated inner is client-executable', expect: /§8 k1/,
    edits: [[GRANT, GRANT + 'grant execute on function public.hr_claim_discord_gift__ungated(integer, text) to authenticated;\n']] },
  { name: 'operatorReadToEngine', why: 'the operator code read is granted to hr_engine (Security #12)', expect: /§8 k1/,
    edits: [[GRANT, GRANT + 'grant execute on function public.hr_discord_code_current() to hr_engine;\n']] },
  { name: 'oracleToService', why: 'the derivation is executable by service_role', expect: /§8 k1/,
    edits: [[GRANT, GRANT + 'grant execute on function public.hr_discord_code_for(text) to service_role;\n']] },
  { name: 'gateDropsBucket', why: 'the restated gate silently loses another lane\'s bucket (the b484 class)', expect: /§8 k4/,
    edits: [["    when 'party_hunt_view' then v_limit := 20;\n    when 'hr_claim_discord_gift'", "    when 'hr_claim_discord_gift'"]] },
];

async function scanMutants() {
  const gc = await readFile(join(ROOT, 'src/net/goal-claim.js'), 'utf8');
  const dc = await readFile(join(ROOT, 'src/features/discord-invite.js'), 'utf8');
  const tool = await readFile(join(ROOT, 'tools/discord-gift-code.mjs'), 'utf8');
  const one = (src, a) => { if (src.split(a).length !== 2) { console.error(`harness: client mutant anchor moved: ${a}`); process.exit(2); } };
  const a = "p_code: String(code || '') }); },", b = 'status.textContent = r.text;', c = 'var GIFT_GEMS = 25;';
  const d = "const QUERY = 'select public.hr_discord_code_current() as r';";
  [[gc, a], [dc, b], [dc, c], [tool, d]].forEach(([s, x]) => one(s, x));
  return [
    { name: 'clientSendsAmount', why: 'the transport sends a gem amount with the code',
      over: { 'src/net/goal-claim.js': gc.replace(a, () => "p_code: String(code || ''), p_gems: 25 }); },") } },
    { name: 'sheetPaysLocally', why: 'the sheet adds the gift to G.gems itself',
      over: { 'src/features/discord-invite.js': dc.replace(b, () => b + ' window.G.gems += 25;') } },
    { name: 'copyDrifts', why: 'the invite promises a different amount than the server pays',
      over: { 'src/features/discord-invite.js': dc.replace(c, () => 'var GIFT_GEMS = 50;') } },
    { name: 'toolWrites', why: 'the operator tool sends a write',
      over: { 'tools/discord-gift-code.mjs': tool.replace(d, () => "const QUERY = 'update public.player_state set gems = gems + 1';") } },
  ];
}

console.log('\ndiscord-gift --mutate: every mutant must go RED on its named arm');
if ((await clientScan()).length) { console.error('harness: the unmutated client scan is red'); process.exit(2); }
for (const pre of ['', VAULT]) {
  const control = await tryApply(db, pre + SQL);
  if (control) { console.error(`harness: the unmutated file is red (${pre ? 'open' : 'closed'}: ${control})`); process.exit(2); }
}
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
  for (const [find, repl] of m.edits) {
    const n = mutated.split(find).length - 1;
    if (n !== 1) { console.error(`harness: ${m.name}: anchor matched ${n}x: ${find.slice(0, 60)}`); process.exit(2); }
    if (!CONTROL) mutated = mutated.replace(find, () => repl);
  }
  const cut = mutated.indexOf(SELF);
  const got = await tryApply(db, (m.closed ? '' : VAULT) + mutated.slice(0, cut), async () => {
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
