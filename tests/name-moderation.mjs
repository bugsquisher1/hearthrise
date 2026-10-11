#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/name-moderation.mjs — A NAME OTHER PLAYERS SEE IS THE SERVER'S TO REFUSE.
//
//   node tests/name-moderation.mjs            the guard (whole chain)
//   node tests/name-moderation.mjs --mutate   every planted defect must be CAUGHT
//                                 [--only=<id>]  one mutant
//
// Ships with supabase/migrations/2026-10-11-name-moderation.sql, whose §13
// self-check executes the matcher, the triggers, the claim, the moderator
// rename and the re-stamp. This guard drives the same surface AS THE CLIENT
// ROLES (set role authenticated / anon), which the self-check (running as the
// definer) cannot: what a forged client can actually reach.
//
// ARMS
//   B1  a second apply is byte-identical (schema, bodies, blocklist)
//   P1  authenticated cannot EXECUTE hr_mod_force_rename / hr_name_blocked,
//       cannot read hr_name_blocklist / hr_name_holds / profiles.must_rename
//   P2  authenticated cannot INSERT a clan directly (the dropped policy)
//   C1  claim_display_name refuses every blocked variant with name_blocked and
//       never echoes it; the Scunthorpe set claims fine
//   C2  clan_create refuses a blocked name (journalled)
//   M1  moderator rename: placeholder on the board, ledger row, stamped copies,
//       envelope must_rename; the held name cannot come back; a new claim clears
// MUTANTS (--mutate; each must turn a §13 gate or an arm red)
//   no_fold, no_clans_trigger, mod_granted, no_ledger_row, exact_as_substring
// --mutate replays only UP TO this file (tests/schema-replay.mjs replayScopeError).
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';

const MIG = '2026-10-11-name-moderation.sql';

const MUTATIONS = {
  no_fold: { why: 'hr_name_fold is a bare lower(): no leet, homoglyph, separator or repeat folding',
    pairs: [[`           '([a-z])\\1\\1+', '\\1\\1', 'g')
$$;`, `           '([a-z])\\1\\1+', '\\1\\1', 'g') where false
  union all select lower(coalesce(p_text, ''))
$$;`]] },
  no_clans_trigger: { why: 'the clans name trigger is not installed: a definer-side insert takes any name',
    pairs: [[`create trigger hr_clans_name_guard
  before insert or update of name on public.clans
  for each row execute function public.hr_name_guard();`, '']] },
  mod_granted: { why: 'hr_mod_force_rename is granted to authenticated',
    pairs: [[`revoke execute on function public.hr_mod_force_rename(uuid, text) from anon, authenticated, service_role;`,
      `revoke execute on function public.hr_mod_force_rename(uuid, text) from anon, service_role;
grant execute on function public.hr_mod_force_rename(uuid, text) to authenticated;`]] },
  no_ledger_row: { why: 'the moderator rename writes no player_ledger row',
    pairs: [[`  insert into public.player_ledger (user_id, slot, kind, intent, meta)
  values (p_user, 0, 'moderation_rename', 'moderation_rename',`, `  perform (p_user, 0, 'moderation_rename', 'moderation_rename',`],
      [`  returning id into v_ledger;\n`, `;\n`]] },
  exact_as_substring: { why: "'cock' is matched as a substring (Peacock / Cockburn / Hancock refused)",
    pairs: [[`('cock','obscene','exact')`, `('cock','obscene','substring')`]] },
};

// The fixtures a CLIENT can type into the name field (charset: A-Z a-z 0-9 space _ ' ’ . -).
const BLOCKED = ['nigger', 'NIGGER', 'n1gg3r', 'n i g g e r', 'n.i.g.g.e.r', 'niiiggggerrr', 'xXniggerXx',
  'ni99er', 'f a g g o t', 'F4GG0T', 'FuCk Face', 'kike', 'CUNTS', 'Sh1thead', 'Dlck'];
const CLEAN = ['Raccoon', 'Dickens', 'Spicer', 'Peacock', 'Scunthorpe', 'Cockburn', 'Essex', 'Shitake',
  'Hancock', 'Finnigan', 'Therapist', 'Analyst', 'Matsushita'];

async function migText(mutate) {
  let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  if (mutate) for (const [f, r] of MUTATIONS[mutate].pairs) sql = sql.replace(f, () => r);
  return sql;
}

async function run(mutate) {
  const fails = [];
  const ok = (arm, cond, msg) => { if (!cond) fails.push(`${arm}: ${msg}`); };
  const sqlText = await migText(mutate);
  const patches = mutate ? new Map([[MIG, MUTATIONS[mutate].pairs]]) : undefined;
  let boot;
  // The plain run judges at MIG too: B1 re-applies this file, whose §13 fixture
  // inserts player_state.gems, which 2026-10-19-account-wallet.sql (next) drops.
  try { boot = await bootReplay(mutate ? { patches, upTo: MIG } : { upTo: MIG }); }
  catch (e) {
    if (e && e.replay && mutate) return { fails: [`REPLAY: ${String(e.failures?.at(-1)?.error || e.message).slice(0, 200)}`] };
    throw e;
  }
  const { db } = boot;
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const as = async (role, uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid || '']);
    await q(`set role ${role}`);
    try { return { r: (await db.query(sql, p)).rows[0]?.r }; }
    catch (e) { return { err: String(e.message).split('\n')[0], code: e.code }; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const gate = () => q('delete from public.hr_rate_counters');
  try {
    // ── B1. SECOND APPLY IS BYTE-IDENTICAL ─────────────────────────────────
    const bodies = () => q(`select p.proname, md5(p.prosrc) h, p.proacl::text acl from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
       and p.proname in ('hr_name_fold','hr_name_blocked','hr_validate_display_name','claim_display_name__ungated',
         'clan_create','hr_mod_force_rename','hr_chat_immutable','hr_market_offer_immutable','hr_name_restamp','hr_state_of')
      order by 1`);
    const rows = () => q('select stem, kind, match, pattern from public.hr_name_blocklist order by 1');
    {
      const before = JSON.stringify([await inventory(db), await bodies(), await rows()]);
      let err = null;
      try { await db.exec(`begin;\n${sqlText}\ncommit;`); } catch (e) { err = String(e.message).split('\n')[0]; await db.exec('rollback').catch(() => {}); }
      ok('B1', !err, `a second apply raised: ${err}`);
      ok('B1', before === JSON.stringify([await inventory(db), await bodies(), await rows()]),
        'a second apply changed the schema, a body or the blocklist');
    }

    const mk = async (tag) => {
      const uid = (await q('select gen_random_uuid() as i'))[0].i;
      await q("insert into auth.users (id, instance_id, aud, role, email) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
        [uid, `${tag}@probe.invalid`]);
      await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
      return uid;
    };
    const U = await mk('nm-a');

    // ── P1 / P2. WHAT A CLIENT CAN REACH ──────────────────────────────────
    for (const role of ['authenticated', 'anon']) {
      const m = await as(role, U, "select public.hr_mod_force_rename($1::uuid, 'x') as r", [U]);
      ok('P1', !!m.err, `${role} executed hr_mod_force_rename: ${JSON.stringify(m)}`);
      const b = await as(role, U, "select public.hr_name_blocked('x') as r");
      ok('P1', !!b.err, `${role} executed hr_name_blocked`);
      const l = await as(role, U, 'select count(*)::int as r from public.hr_name_blocklist');
      ok('P1', !!l.err, `${role} read hr_name_blocklist`);
      const h = await as(role, U, 'select count(*)::int as r from public.hr_name_holds');
      ok('P1', !!h.err, `${role} read hr_name_holds`);
      const f = await as(role, U, 'select must_rename as r from public.profiles limit 1');
      ok('P1', !!f.err, `${role} read profiles.must_rename`);
      const n = await as(role, U, 'select display_name as r from public.profiles limit 1');
      ok('P1', !n.err, `CONTROL: ${role} can no longer read profiles.display_name: ${n.err}`);
    }
    const ci = await as('authenticated', U, "insert into public.clans (name, created_by) values ('Quiet Hold', $1) returning id as r", [U]);
    ok('P2', !!ci.err, 'authenticated inserted a clan directly (the clans creatable policy is back)');

    // ── C1. THE CLAIM ──────────────────────────────────────────────────────
    for (const name of BLOCKED) {
      await gate();
      const c = await as('authenticated', U, 'select public.claim_display_name($1) as r', [name]);
      ok('C1', c.r?.error === 'name_blocked' && !('name' in (c.r || {})) && !('canonical' in (c.r || {})),
        `claim of blocked fixture #${BLOCKED.indexOf(name)} answered ${c.err || JSON.stringify(c.r?.error)}`);
    }
    const leak = await q("select count(*)::int n from public.hr_rejections where user_id = $1 and last_detail::text ~* 'nigg|fuck|kike|cunt'", [U]);
    ok('C1', leak[0].n === 0, 'a refusal journalled the refused name');
    const jr = await q("select coalesce(sum(n),0)::int n from public.hr_rejections where user_id = $1 and code = 'name_blocked'", [U]);
    ok('C1', jr[0].n >= BLOCKED.length, `name_blocked journalled ${jr[0].n} of ${BLOCKED.length} refusals`);
    for (const name of CLEAN) {
      await gate();
      const c = await as('authenticated', U, 'select public.claim_display_name($1) as r', [name]);
      ok('C1', c.r?.ok === true, `the clean name ${name} was refused: ${c.err || JSON.stringify(c.r)}`);
    }

    // ── C2. clan_create ───────────────────────────────────────────────────
    await gate();
    const cc = await as('authenticated', U, "select public.clan_create('B1tch Hold','open') as r");
    ok('C2', cc.r?.error === 'name_blocked', `clan_create of a blocked name answered ${cc.err || JSON.stringify(cc.r)}`);
    await gate();
    const cg = await as('authenticated', U, "select public.clan_create('Peacock Hold','open') as r");
    ok('C2', cg.r?.ok === true, `CONTROL: clan_create of a clean name answered ${cg.err || JSON.stringify(cg.r)}`);

    // ── M1. THE MODERATOR ─────────────────────────────────────────────────
    const V = await mk('nm-b');
    await gate();
    await as('authenticated', V, 'select public.claim_display_name($1) as r', ['Bramble Probe']);
    await q('insert into public.player_state (user_id, slot, gold, marks, version) values ($1,0,777777,0,1) on conflict do nothing', [V]);
    await as('authenticated', V, "insert into public.chat_messages (channel, from_id, from_name, body) values ('global', $1, 'spoof', 'hi') returning id as r", [V]);
    const mr = (await q("select public.hr_mod_force_rename($1::uuid, 'guard probe') as r", [V]))[0].r;
    const place = mr?.placeholder;
    ok('M1', mr?.ok === true && /^Adventurer-\d{4,}$/.test(place || ''), `hr_mod_force_rename answered ${JSON.stringify(mr)}`);
    const lb = await q("select name from public.leaderboard_ranked where board = 'wealth' and subject_id = $1", [V]);
    ok('M1', lb[0]?.name === place, `the board shows ${JSON.stringify(lb[0]?.name)} not the placeholder`);
    const led = await q("select count(*)::int n from public.player_ledger where user_id = $1 and kind = 'moderation_rename'", [V]);
    ok('M1', led[0].n === 1, `${led[0].n} moderation_rename ledger rows`);
    const chat = await as('anon', null, 'select from_name as r from public.chat_messages where from_id = $1', [V]);
    ok('M1', chat.r === place, `chat from_name read by anon is ${JSON.stringify(chat.r)}`);
    const env = await as('authenticated', V, 'select public.hr_load(0) as r');
    const envMr = env.r?.must_rename ?? env.r?.state?.must_rename;
    ok('M1', envMr === true, `the boot envelope must_rename is ${JSON.stringify(envMr)} (${env.err || 'ok'})`);
    await gate();
    const back = await as('authenticated', V, 'select public.claim_display_name($1) as r', ['Bramble_Pr0be']);
    ok('M1', back.r?.error === 'name_blocked', `the held name came back: ${JSON.stringify(back.r)}`);
    await gate();
    const keep = await as('authenticated', V, 'select public.claim_display_name($1) as r', [place]);
    ok('M1', keep.r?.reason === 'reserved', `the placeholder was claimable: ${JSON.stringify(keep.r)}`);
    await gate();
    const fresh = await as('authenticated', V, 'select public.claim_display_name($1) as r', ['Thistle Probe']);
    const st = await q('select must_rename, name_state from public.profiles where id = $1', [V]);
    ok('M1', fresh.r?.ok === true && st[0].must_rename === false && st[0].name_state === 'ok',
      `a new claim answered ${JSON.stringify(fresh.r)} and left ${JSON.stringify(st[0])}`);
  } finally {
    await db.close().catch(() => {});
  }
  return { fails };
}

const argv = process.argv.slice(2);
try {
  if (argv.includes('--mutate')) {
    const only = (argv.find((a) => a.startsWith('--only=')) || '').slice(7);
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      if (only && id !== only) continue;
      const { fails } = await run(id);
      const caught = fails.length > 0;
      console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${id.padEnd(20)} ${MUTATIONS[id].why}\n         ${caught ? fails[0].slice(0, 220) : ''}`);
      if (!caught) bad++;
    }
    console.log(bad ? `name-moderation --mutate: RED (${bad} survived)` : 'name-moderation --mutate: OK (every mutant caught)');
    process.exit(bad ? 1 : 0);
  }
  const { fails } = await run(null);
  if (fails.length) { console.error('name-moderation: RED\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('name-moderation: OK (B1 second apply, P1 client reach, P2 no direct clan insert, '
    + `C1 ${BLOCKED.length} blocked / ${CLEAN.length} clean claims, C2 clan_create, M1 moderator rename)`);
} catch (e) {
  console.error('name-moderation: HARNESS ERROR — ' + (e && e.stack || e)); process.exit(2);
}
