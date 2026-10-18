#!/usr/bin/env node
// ============================================================================
// tests/closed-rebuild.mjs — THE GAME IS CLOSED TO EVERY ACCOUNT NOT ON THE
//                            ALLOWLIST, AND THE WIPE EMPTIES EVERY PLAYER TABLE
//                            ONCE WHILE KEEPING ACCOUNTS AND CATALOGUES.
//
//   node tests/closed-rebuild.mjs            the guard
//   node tests/closed-rebuild.mjs --mutate   every mutant must go RED
//
// supabase/migrations/2026-10-21-closed-mode.sql then
// supabase/migrations/2026-10-21-closed-rebuild-wipe.sql, replayed on the chain
// up to the file before them. Each scenario runs inside ONE transaction that is
// rolled back, so every mutant starts from the same database.
//
//   C-REFUSE  a signed-in account NOT on the allowlist is refused `hr_closed`
//             (SQLSTATE PGRST, HTTP 403) by the pre-request hook (L1) and by a
//             real client RPC through hr_rpc_gate (L2); the engine's gate refuses
//             its character (L3); RLS refuses its chat write and hides chat from
//             it (L4); it reads no allowlist row.
//   C-ADMIT   an allowlisted account passes every one of those, anon passes the
//             hook, and opening the flag admits everybody.
//   C-HOOK    PostgREST runs public.hr_access_check as its pre-request.
//   C-IDEM    a second apply of closed mode changes nothing (bodies, ACLs,
//             policies, seed rows, baseline rows, the hook setting, inventory).
//   W-WIPE    with real state planted through the real RPCs (two characters,
//             names, a clan, chat, ledger rows inside the retention window), the
//             wipe empties every listed table, resets profiles to the signup
//             shape, and keeps accounts, the allowlist and the catalogues.
//   W-GUARD   the wipe refuses while the game is OPEN and refuses when a table
//             naming a player is on neither list.
//   W-ONCE    a re-apply after the rebuild has started wipes nothing.
//   T-TOOL    tools/access-allow.mjs's generated add file admits an account and
//             its remove file shuts it out again; an email note and a malformed
//             id are refused before anything is written.
//   D-CLIENT  play.html loads the client (src/app/boot.js) once, the client's
//             server link (src/session/server.js) recognises exactly the server's
//             code and status, and the app turns that answer into the notice.
//
// Exit: 0 green · 1 red · 2 harness.
// ============================================================================
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { allowSql, checkInputs } from '../tools/access-allow.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const PREV = '2026-10-20-hunts-rally-kills.sql';
const read = async (p) => (await readFile(join(ROOT, p), 'utf8')).replace(/\r\n/g, '\n');
const CLOSED = await read('supabase/migrations/2026-10-21-closed-mode.sql');
const WIPE = await read('supabase/migrations/2026-10-21-closed-rebuild-wipe.sql');

const A = '000000c1-0000-0000-0000-00000000aaaa';   // allowlisted
const B = '000000c1-0000-0000-0000-00000000bbbb';   // not allowlisted
/* What a second apply must not move: the four bodies, the two ACLs, the
   policies, the seed rows, the baseline rows and the pre-request setting. */
const SNAP = `
  select 'fn' k, p.oid::regprocedure::text n, md5(replace(p.prosrc, chr(13), '')) || coalesce(p.proacl::text, '') v
    from pg_proc p where p.oid in ('public.hr_rpc_gate(text)'::regprocedure, 'public.hr_rate_gate(uuid,integer,text)'::regprocedure,
                                   'public.hr_admitted(uuid)'::regprocedure, 'public.hr_access_check()'::regprocedure)
  union all select 'pol', tablename || '.' || policyname, permissive || cmd || coalesce(qual, '') || coalesce(with_check, '')
    from pg_policies where policyname in ('hr_closed_admit', 'hr_closed_anon', 'hr_access_allowlist_own')
  union all select 'flag', key, enabled::text || coalesce(note, '') from public.hr_flags where key = 'closed_mode'
  union all select 'allow', user_id::text, note from public.hr_access_allowlist
  union all select 'base', proname || '/' || grantee, coalesce(note, '') from public.hr_client_rpc_baseline
   where proname in ('hr_access_check', 'hr_admitted')
  union all select 'hook', 'authenticator', array_to_string(setconfig, ';') from pg_db_role_setting
   where setrole = 'authenticator'::regrole
  order by 1, 2`;
const PLAYER_TABLES = ['player_state', 'player_skills', 'player_inventory', 'player_ledger',
  'display_names', 'clans', 'clan_members', 'chat_messages'];

let db;
try { ({ db } = await bootReplay({ upTo: PREV })); } catch (e) {
  console.error(`harness: ${e.message}`); process.exit(2);
}

/* Run `sql` as a PostgREST request role with `uid` as the JWT subject. Returns
   { rows } or { err: { code, message } }. Role and claims are reset after. */
async function as(role, uid, sql) {
  const claims = JSON.stringify(uid ? { sub: uid, role } : { role });
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`,
    [uid || '', claims]);
  await db.exec(`savepoint as_call; set role ${role};`);
  try {
    const r = await db.query(sql);
    await db.exec('reset role; release savepoint as_call;');
    return { rows: r.rows };
  } catch (e) {
    await db.exec('rollback to savepoint as_call; reset role; release savepoint as_call;');
    return { err: { code: e.code, message: String(e.message) } };
  } finally {
    await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)`);
  }
}
const closedErr = (r) => r.err && r.err.code === 'PGRST' && r.err.message.includes('"code":"hr_closed"')
  && r.err.message.length > 0;
const one = async (sql) => (await db.query(sql)).rows[0];
const count = async (t) => Number((await one(`select count(*)::int as n from public.${t}`)).n);

/* One full scenario on the given file texts. Returns the first failure as
   'ARM: message', or null. Always rolled back. */
async function scenario(closedSql, wipeSql, tool = allowSql) {
  await db.exec('begin;');
  try {
    /* A minimal Supabase Storage shape (the replay has none): the avatars
       bucket's own-folder insert policy, as 2026-08-08-unique-names.sql writes
       it, so §7b's restrictive policy is exercised, not only asserted. */
    await db.exec(`create schema if not exists storage;
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select, insert, update on storage.objects to authenticated;
      create policy "hr avatars owner insert" on storage.objects for insert to authenticated
        with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);`);
    try { await db.exec(closedSql); } catch (e) { return `APPLY-CLOSED: ${String(e.message).split('\n')[0]}`; }
    // C-IDEM: a second apply of closed mode is byte-identical (objects, bodies, ACLs, seed rows).
    const state = async () => JSON.stringify([await inventory(db), (await db.query(SNAP)).rows]);
    const once = await state();
    try { await db.exec(closedSql); } catch (e) { return `C-IDEM: the second apply raised (${String(e.message).split('\n')[0]})`; }
    if (await state() !== once) return 'C-IDEM: a second apply of closed mode changed the database';

    // ── plant the old game, while it was OPEN, through the real client RPCs ──
    await db.exec(`update public.hr_flags set enabled = false where key = 'closed_mode';
      insert into auth.users (id) values ('${A}'), ('${B}') on conflict do nothing;
      insert into public.profiles (id) values ('${A}'), ('${B}') on conflict do nothing;
      insert into public.hr_access_allowlist (user_id, note) values ('${A}', 'test: allowlisted');`);
    for (const [u, name] of [[A, 'Alphaone'], [B, 'Bravotwo']]) {
      for (const q of ['select public.hr_create_character(0)', `select public.claim_display_name('${name}')`]) {
        const r = await as('authenticated', u, q);
        if (r.err) return `HARNESS-PLANT: ${q} as ${name}: ${r.err.message}`;
      }
      const c = await as('authenticated', u,
        `insert into public.chat_messages (channel, from_id, from_name, body) values ('global', '${u}', '${name}', 'hello')`);
      if (c.err) return `HARNESS-PLANT: chat as ${name}: ${c.err.message}`;
    }
    const cc = await as('authenticated', B, `select public.clan_create('Bravo Hold', 'open')`);
    if (cc.err) return `HARNESS-PLANT: clan_create: ${cc.err.message}`;
    await db.exec(`insert into public.player_ledger (user_id, slot, kind, gold, meta)
                   select '${B}', 0, 'accrue', 5, '{}'::jsonb;`);
    for (const t of PLAYER_TABLES) {
      if (await count(t) === 0) return `HARNESS-PLANT: nothing planted in ${t}`;
    }
    await db.exec(`update public.hr_flags set enabled = true where key = 'closed_mode';`);

    // ── C-REFUSE ─────────────────────────────────────────────────────────────
    let r = await as('authenticated', B, 'select public.hr_access_check()');
    if (!closedErr(r)) return `C-REFUSE L1: the hook let a non-allowlisted caller through (${JSON.stringify(r)})`;
    r = await as('authenticated', B, 'select public.hr_server_now()');
    if (!closedErr(r)) return `C-REFUSE L2: hr_server_now (via hr_rpc_gate) answered a non-allowlisted caller (${JSON.stringify(r)})`;
    if ((await one(`select public.hr_rate_gate('${B}', 0, 'accrue') as ok`)).ok !== false) {
      return 'C-REFUSE L3: hr_rate_gate admitted a non-allowlisted character';
    }
    r = await as('authenticated', B,
      `insert into public.chat_messages (channel, from_id, from_name, body) values ('global', '${B}', 'Bravotwo', 'let me in')`);
    if (!(r.err && r.err.code === '42501')) return `C-REFUSE L4: RLS let a non-allowlisted caller post chat (${JSON.stringify(r)})`;
    r = await as('authenticated', B, 'select count(*)::int as n from public.chat_messages');
    if (r.err || r.rows[0].n !== 0) return `C-REFUSE L4: a non-allowlisted caller can read chat (${JSON.stringify(r)})`;
    r = await as('authenticated', B, 'select count(*)::int as n from public.hr_access_allowlist');
    if (r.err || r.rows[0].n !== 0) return `C-REFUSE: a non-allowlisted caller reads allowlist rows (${JSON.stringify(r)})`;
    // R1: anon passes the hook (sign-in must work) but reads nothing players wrote.
    for (const t of ['chat_messages', 'display_names', 'clans', 'clan_members']) {
      r = await as('anon', null, `select count(*)::int as n from public.${t}`);
      if (r.err || r.rows[0].n !== 0) return `C-REFUSE anon: anon reads ${t} while closed (${JSON.stringify(r)})`;
    }
    r = await as('authenticated', B, `insert into storage.objects (bucket_id, name) values ('avatars', '${B}/a.webp')`);
    if (!(r.err && r.err.code === '42501')) return `C-REFUSE L4 storage: a non-allowlisted caller uploaded an avatar (${JSON.stringify(r)})`;

    // ── C-ADMIT ──────────────────────────────────────────────────────────────
    r = await as('authenticated', A, 'select public.hr_access_check()');
    if (r.err) return `C-ADMIT L1: the hook refused the allowlisted caller (${r.err.message})`;
    r = await as('anon', null, 'select public.hr_access_check()');
    if (r.err) return `C-ADMIT L1: the hook refused anon (${r.err.message})`;
    r = await as('authenticated', A, 'select public.hr_server_now()');
    if (r.err) return `C-ADMIT L2: hr_rpc_gate refused the allowlisted caller (${r.err.message})`;
    if ((await one(`select public.hr_rate_gate('${A}', 0, 'accrue') as ok`)).ok !== true) {
      return 'C-ADMIT L3: hr_rate_gate refused the allowlisted character';
    }
    r = await as('authenticated', A,
      `insert into public.chat_messages (channel, from_id, from_name, body) values ('global', '${A}', 'Alphaone', 'still here')`);
    if (r.err) return `C-ADMIT L4: RLS refused the allowlisted caller's chat (${r.err.message})`;
    r = await as('authenticated', A, `insert into storage.objects (bucket_id, name) values ('avatars', '${A}/a.webp')`);
    if (r.err) return `C-ADMIT L4 storage: the allowlisted caller cannot upload an avatar (${r.err.message})`;
    r = await as('authenticated', A, 'select count(*)::int as n from public.hr_access_allowlist');
    if (r.err || r.rows[0].n !== 1) return `C-ADMIT: the allowlisted caller should read exactly its own row (${JSON.stringify(r)})`;
    await db.exec(`update public.hr_flags set enabled = false where key = 'closed_mode';`);
    r = await as('authenticated', B, 'select public.hr_access_check()');
    if (r.err) return `C-ADMIT open: an OPEN game still refused an account (${r.err.message})`;
    r = await as('anon', null, 'select count(*)::int as n from public.chat_messages');
    if (r.err || !(r.rows[0].n > 0)) return `C-ADMIT open: anon cannot read public chat in an OPEN game (${JSON.stringify(r)})`;
    await db.exec(`delete from public.hr_flags where key = 'closed_mode';`);
    r = await as('authenticated', B, 'select public.hr_access_check()');
    if (!closedErr(r)) return 'C-REFUSE missing-flag: a missing closed_mode row reads as OPEN';
    await db.exec(`insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'test');`);

    // ── C-HOOK ───────────────────────────────────────────────────────────────
    const hook = await one(`select count(*)::int as n from pg_db_role_setting s, unnest(s.setconfig) c
                             where s.setrole = 'authenticator'::regrole and c = 'pgrst.db_pre_request=public.hr_access_check'`);
    if (hook.n !== 1) return 'C-HOOK: authenticator does not run public.hr_access_check as its pre-request';

    // ── W-GUARD (each probe rolled back to a savepoint) ─────────────────────
    const tryWipe = async (prep) => {
      await db.exec('savepoint probe;');
      try { if (prep) await db.exec(prep); await db.exec(wipeSql); return null; }
      catch (e) { return String(e.message).split('\n')[0]; }
      finally { await db.exec('rollback to savepoint probe; release savepoint probe;'); }
    };
    let w = await tryWipe(`update public.hr_flags set enabled = false where key = 'closed_mode';`);
    if (w === null || !/closed_mode is not ON/.test(w)) return `W-GUARD open: the wipe ran on an OPEN game (${w})`;
    w = await tryWipe('create table public.zz_unclassified (user_id uuid, note text); insert into public.zz_unclassified values (gen_random_uuid(), \'x\');');
    if (w === null || !/unclassified table/.test(w)) return `W-GUARD unknown: the wipe ran past an unclassified player table (${w})`;

    // ── W-WIPE ───────────────────────────────────────────────────────────────
    const users0 = await count('profiles');
    const auth0 = Number((await one('select count(*)::int as n from auth.users')).n);
    const items0 = await count('hr_items');
    try { await db.exec(wipeSql); } catch (e) { return `APPLY-WIPE: ${String(e.message).split('\n')[0]}`; }
    for (const t of PLAYER_TABLES) {
      const n = await count(t);
      if (n !== 0) return `W-WIPE: ${t} still holds ${n} row(s)`;
    }
    if (Number((await one('select count(*)::int as n from auth.users')).n) !== auth0) return 'W-WIPE: auth.users changed';
    if (await count('profiles') !== users0) return 'W-WIPE: a profile row was deleted';
    if ((await one(`select count(*)::int as n from public.profiles where display_name is not null or clan_id is not null`)).n !== 0) {
      return 'W-WIPE: a profile still carries an old name or clan';
    }
    if (await count('hr_access_allowlist') !== 1) return 'W-WIPE: the allowlist changed';
    if (await count('hr_items') !== items0 || items0 === 0) return 'W-WIPE: the item catalogue changed';
    const trg = await one(`select count(*)::int as n from pg_trigger where tgrelid = 'public.player_ledger'::regclass
                             and tgname in ('hr_ledger_immutable', 'hr_ledger_no_truncate') and tgenabled = 'O'`);
    if (trg.n !== 2) return 'W-WIPE: the ledger immutability triggers are not both enabled after the wipe';
    const log = await one(`select (removed ->> 'player_state')::int as ps, (removed ->> 'player_ledger')::int as pl
                             from public.hr_wipe_log where wipe_key = 'closed-rebuild-2026-10'`);
    if (!log || !(log.ps >= 2) || !(log.pl >= 1)) return `W-WIPE: hr_wipe_log does not journal what was removed (${JSON.stringify(log)})`;

    // ── W-SLOT (P1 2026-10-15): after the wipe every account owns slot 0 and only
    //    slot 0; a device still addressing a pre-wipe hero slot is refused
    //    slot_not_owned (the client re-addresses to 0 — CLOSED/DEAD-SLOT-1 in-page),
    //    and slot 0 is created through the real RPC.
    const owned = (await one(`select public.hr_hero_slots_of('${A}')::text as s`)).s;
    if (owned !== '[0]') return `W-SLOT: a wiped account owns ${owned}, expected [0]`;
    r = await as('authenticated', A, 'select public.hr_create_character(2) as v');
    if (r.err || r.rows[0].v.error !== 'slot_not_owned') return `W-SLOT: a dead hero slot was not refused slot_not_owned (${JSON.stringify(r)})`;
    // ── W-ONCE: the allowlisted player starts the rebuild; a re-apply wipes nothing ──
    r = await as('authenticated', A, 'select public.hr_create_character(0) as v');
    if (!r.err && r.rows[0].v.ok !== true) return `W-SLOT: slot 0 was not created after the wipe (${JSON.stringify(r.rows[0].v)})`;
    if (r.err) return `W-ONCE: the allowlisted player cannot start again after the wipe (${r.err.message})`;
    const ps1 = await count('player_state');
    try { await db.exec(wipeSql); } catch (e) { return `W-ONCE: the re-apply raised (${String(e.message).split('\n')[0]})`; }
    if (await count('player_state') !== ps1 || ps1 === 0) return 'W-ONCE: a re-apply wiped the rebuilt game';

    // ── T-TOOL: the operator's generated file admits B, its twin removes B ──
    if (checkInputs('add', B, 'friend@example.com') === null) return 'T-TOOL: the tool accepts an email address as a note';
    if (checkInputs('add', 'not-a-uuid', 'Friend') === null) return 'T-TOOL: the tool accepts a malformed user id';
    try { await db.exec(tool('add', B, "Bravo (friend)", 'test-add.sql')); }
    catch (e) { return `T-TOOL: the generated add file failed (${String(e.message).split('\n')[0]})`; }
    r = await as('authenticated', B, 'select public.hr_access_check()');
    if (r.err) return `T-TOOL: the generated add file did not admit the account (${r.err.message})`;
    try { await db.exec(tool('remove', B, null, 'test-remove.sql')); }
    catch (e) { return `T-TOOL: the generated remove file failed (${String(e.message).split('\n')[0]})`; }
    r = await as('authenticated', B, 'select public.hr_access_check()');
    if (!closedErr(r)) return 'T-TOOL: the generated remove file left the account admitted';
    return null;
  } finally {
    await db.exec('rollback;');
    await db.exec('reset role;');
  }
}

/* D-CLIENT: the include and the code/status the module matches. */
async function clientScan(over = {}) {
  const get = async (p) => (p in over ? over[p] : await read(p));
  const out = [];
  const html = await get('play.html');
  const inc = html.match(/<script type="module" src="src\/app\/boot\.js\?v=\d[\d.]*"><\/script>/g) || [];
  if (inc.length !== 1) out.push(`D-CLIENT: play.html loads src/app/boot.js ${inc.length} time(s), expected 1`);
  const js = await get('src/session/server.js');
  const code = (js.match(/export const CLOSED_CODE\s*=\s*'([a-z_]+)';/) || [])[1];
  const sqlCode = (CLOSED.match(/"code":"([a-z_]+)"/) || [])[1];
  if (!code || code !== sqlCode) out.push(`D-CLIENT: the client matches code ${code}, the server raises ${sqlCode}`);
  const status = (js.match(/export const CLOSED_STATUS\s*=\s*(\d+);/) || [])[1];
  const sqlStatus = (CLOSED.match(/"status":(\d+)/) || [])[1];
  if (!status || status !== sqlStatus) out.push(`D-CLIENT: the client matches status ${status}, the server answers ${sqlStatus}`);
  const boot = await get('src/app/boot.js');
  if (!/if \(why === 'closed-game'\) showClosed\(\)/.test(boot)) out.push('D-CLIENT: src/app/boot.js no longer shows the closed notice on the closed-game answer');
  return out;
}

if (!MUTATE) {
  const bad = await scenario(CLOSED, WIPE);
  const scan = await clientScan();
  await db.close();
  if (bad || scan.length) {
    if (bad) console.log(`  ✗ ${bad}`);
    for (const s of scan) console.log(`  ✗ ${s}`);
    process.exit(/^HARNESS/.test(bad || '') ? 2 : 1);
  }
  console.log('  ✓ C-REFUSE  a non-allowlisted account is refused hr_closed at L1/L2, its character at L3, its chat at L4');
  console.log('  ✓ C-REFUSE  anon reads no player-written table (chat, names, clans) while closed');
  console.log('  ✓ C-ADMIT   the allowlisted account and anon pass; an open flag admits all; a missing flag is closed');
  console.log('  ✓ C-HOOK    PostgREST pre-request = public.hr_access_check');
  console.log('  ✓ C-IDEM    a second apply of closed mode is byte-identical');
  console.log('  ✓ W-GUARD   the wipe refuses an open game and an unclassified player table');
  console.log('  ✓ W-WIPE    every player table empty; accounts, allowlist, catalogues, ledger triggers intact');
  console.log('  ✓ W-ONCE    a re-apply after the rebuild started wipes nothing');
  console.log('  ✓ T-TOOL    the generated allowlist add file admits an account; the remove file shuts it out');
  console.log('  ✓ D-CLIENT  play.html loads the client once; it matches the server code and status and shows the notice');
  console.log('closed-rebuild: green');
  process.exit(0);
}

// ── --mutate ─────────────────────────────────────────────────────────────────
const C = (find, repl) => ({ file: 'closed', find, repl });
const W = (find, repl) => ({ file: 'wipe', find, repl });
const MUTANTS = [
  { name: 'hookNeverRaises', why: 'hr_access_check returns for everyone', expect: /k7d|C-REFUSE L1/,
    edits: [C('  if public.hr_admitted(v_uid) then return; end if;\n', '  return;\n')] },
  { name: 'missingFlagOpen', why: 'a missing closed_mode row reads as OPEN', expect: /k7a|missing-flag/,
    edits: [C("f.key = 'closed_mode'), false)", "f.key = 'closed_mode'), true)")] },
  { name: 'rpcGateUnspliced', why: 'hr_rpc_gate is not taught the check', expect: /k4|k7d|C-REFUSE L2/,
    edits: [C("    '  ' || c_line || chr(10) ||\n", '')] },
  { name: 'rateGateOpen', why: 'hr_rate_gate admits any character', expect: /k4|k7b|C-REFUSE L3/,
    edits: [C('  if not public.hr_admitted(p_user) then return false; end if;\n\n', '\n')] },
  { name: 'policyPermissive', why: 'hr_closed_admit is PERMISSIVE (ORed away by the existing policies)', expect: /k5|C-REFUSE L4/,
    edits: [C('as restrictive for all to authenticated', 'as permissive for all to authenticated')] },
  { name: 'anonReadsOpen', why: 'the anon read policy passes whatever the flag says', expect: /k7f|C-REFUSE anon/,
    edits: [C("'using (coalesce((select not f.enabled from public.hr_flags f where f.key = ''closed_mode''), false))', t);",
              "'using (true)', t);")] },
  { name: 'anonPolicyPermissive', why: 'hr_closed_anon is PERMISSIVE (ORed away by the public read policies)', expect: /k5|C-REFUSE anon/,
    edits: [C("'create policy hr_closed_anon on public.%I as restrictive for select to anon '",
              "'create policy hr_closed_anon on public.%I as permissive for select to anon '")] },
  { name: 'storageOpen', why: 'avatar uploads are not closed', expect: /k5|C-REFUSE L4 storage/,
    edits: [C("'create policy hr_closed_admit_insert on storage.objects as restrictive for insert to authenticated '",
              "'create policy hr_closed_admit_insert on storage.objects as permissive for insert to authenticated '")] },
  { name: 'hookNotRegistered', why: 'the pre-request hook is never set', expect: /k6|C-HOOK/,
    edits: [C("  execute 'alter role authenticator set pgrst.db_pre_request = ''public.hr_access_check''';\n", '')] },
  { name: 'allowlistReadable', why: 'every client reads the whole allowlist', expect: /k7c|C-REFUSE:/,
    edits: [C('  using (user_id = (select auth.uid()));', '  using (true);')] },
  { name: 'wipeWhileOpen', why: 'the wipe runs on an open game', expect: /W-GUARD open/,
    edits: [W("  if not coalesce((select enabled from public.hr_flags where key = 'closed_mode'), false) then\n    raise exception 'PRECONDITION: closed_mode",
              "  if false then\n    raise exception 'PRECONDITION: closed_mode")] },
  { name: 'wipeNoFence', why: 'a re-apply wipes the rebuilt game', expect: /W-ONCE/,
    edits: [W('  if exists (select 1 from public.hr_wipe_log where wipe_key = c_key) then\n', '  if false then\n')] },
  { name: 'wipeSkipsInventory', why: 'player_inventory is dropped from the wipe list', expect: /unclassified|W-WIPE/,
    edits: [W("'player_farm', 'player_intents', 'player_inventory', 'player_ledger',", "'player_farm', 'player_intents', 'player_ledger',")] },
  { name: 'wipeTriggerLeftOff', why: 'the ledger TRUNCATE guard is left disabled', expect: /k5|W-WIPE: the ledger/,
    edits: [W('  alter table public.player_ledger enable trigger hr_ledger_no_truncate;\n', '')] },
  { name: 'wipeNoUnknownGuard', why: 'an unclassified player table is wiped past', expect: /W-GUARD unknown/,
    edits: [W('  if v_bad is not null then\n    raise exception \'wipe §2b', '  if false then\n    raise exception \'wipe §2b')] },
  { name: 'wipeKeepsNames', why: 'profiles keep their old names', expect: /k3|W-WIPE: a profile/,
    edits: [W('     set display_name = null, clan_id = null,', '     set clan_id = null,')] },
  { name: 'baselineNotIdempotent', why: 'the baseline rows are inserted without clearing them first', expect: /C-IDEM/,
    edits: [C("delete from public.hr_client_rpc_baseline\n where proname in ('hr_access_check', 'hr_admitted');\n", '')] },
  { name: 'flagReseeded', why: 'a re-apply re-writes the flag (an opened game would be closed again)', expect: /C-IDEM/,
    edits: [C("        'key = ''closed_mode''. A missing row reads as closed.')\non conflict (key) do nothing;",
              "        'key = ''closed_mode''. A missing row reads as closed.')\non conflict (key) do update set note = excluded.note || ' ';")] },
  // The operator tool, mutated as a generator (its text is JS, so the mutant is a wrapper).
  { name: 'toolAddsNobody', why: 'the generated add file inserts nothing', expect: /T-TOOL: the generated add/, edits: [],
    tool: (v, u, n, f) => allowSql(v, u, n, f).replace(/insert into public\.hr_access_allowlist[\s\S]*?do update set note = excluded\.note;/, 'select 1;') },
  { name: 'toolRemovesNobody', why: 'the generated remove file deletes nothing', expect: /T-TOOL: the generated remove/, edits: [],
    tool: (v, u, n, f) => allowSql(v, u, n, f).replace(/delete from public\.hr_access_allowlist where user_id = [^;]+;/, 'select 1;') },
];
const scanOrig = await clientScan();
if (scanOrig.length) { console.error(`harness: the unmutated client scan is red: ${scanOrig[0]}`); process.exit(2); }
const control = await scenario(CLOSED, WIPE);
if (control) { console.error(`harness: the unmutated files are red: ${control}`); process.exit(2); }
const js = await read('src/session/server.js');
const html = await read('play.html');
const SCAN = [
  { name: 'clientCodeDrifts', why: 'the client listens for a different code', over: { 'src/session/server.js': js.replace("export const CLOSED_CODE = 'hr_closed';", "export const CLOSED_CODE = 'closed';") } },
  { name: 'clientNotIncluded', why: 'play.html never loads the client', over: { 'play.html': html.replace(/\s*<script type="module" src="src\/app\/boot\.js\?v=\d[\d.]*"><\/script>/, '') } },
];
console.log(`\nclosed-rebuild --mutate: every mutant must go RED on its named arm\n[mutants] ${MUTANTS.length + SCAN.length}`);
let survived = 0;
for (const m of SCAN) {
  const bad = CONTROL ? await clientScan() : await clientScan(m.over);
  const hit = bad.length > 0;
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${bad[0]}`);
  else { survived++; console.log(`  ✗ ${m.name} — ${m.why}: SURVIVED`); }
}
for (const m of MUTANTS) {
  let c = CLOSED, w = WIPE;
  for (const e of m.edits) {
    const src = e.file === 'closed' ? c : w;
    const n = src.split(e.find).length - 1;
    if (n !== 1) { console.error(`harness: ${m.name}: anchor matched ${n}x: ${e.find.slice(0, 70)}`); process.exit(2); }
    if (!CONTROL) { if (e.file === 'closed') c = c.replace(e.find, () => e.repl); else w = w.replace(e.find, () => e.repl); }
  }
  const got = await scenario(c, w, CONTROL || !m.tool ? allowSql : m.tool);
  const hit = got !== null && m.expect.test(got);
  console.log(`[mutant] ${m.name} ${hit ? 'caught' : 'survived'}`);
  if (hit) console.log(`  ✓ ${m.name} — ${m.why}: RED via ${got.slice(0, 170)}`);
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
