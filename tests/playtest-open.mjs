#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/playtest-open.mjs — OPENING THE GAME ADMITS A BRAND-NEW ACCOUNT ALL THE
//   WAY TO ITS FIRST HUNT, TEN AT ONCE, AND NOTHING ELSE MOVES.
//
//   node tests/playtest-open.mjs            the guard
//   node tests/playtest-open.mjs --mutate   every planted defect must turn its arm red
//
// supabase/migrations/2027-02-10-playtest-open.sql is STAGED in
// tests/schema-apply-order.json `excluded` (an exposure-widening operator
// switch: a rebuilt database comes back CLOSED). So this guard replays the chain
// with the game CLOSED, as production is today (keepClosed), and applies the
// file itself, twice, inside one transaction per scenario that is rolled back.
//
//   O-ORDER   the file is in `excluded`, not `order`, and the replayed chain lands CLOSED.
//   O-CLOSED  before the flip a brand-new account (GoTrue's hook + insert, the profile
//             trigger) is refused `hr_closed` by hr_load as `authenticated` (the control).
//   O-APPLY   the file applies (its §2 self-check passes) and the flag reads open.
//   O-IDEM    a second apply moves nothing: the flag row keeps its tuple, every gate
//             body, policy and the allowlist are byte-identical.
//   O-PATH    the new account's whole first path, as PostgREST and the engine call it:
//             hr_load, hr_create_hero, hr_hunt_enter mill_cellar, hr_rate_gate (the
//             edge's door) — each admitted.
//   O-TEN     ten more brand-new accounts at once, each from its own address, each
//             signs up, loads, creates a hero and enters the first hunt: none refused
//             (no global bucket, no allowlist read on the path).
//   O-ANON    anon still cannot write: hr_create_hero and a chat insert are refused.
//   O-CLOSE   the reverse UPDATE shuts the new account out again (reversibility).
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, manifest, ROOT } from './schema-replay.mjs';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const CONTROL = Boolean(process.env.HR_MUTANT_CONTROL);
const FILE = '2027-02-10-playtest-open.sql';
const SQL = (await readFile(join(ROOT, 'supabase', 'migrations', FILE), 'utf8')).replace(/\r\n/g, '\n');

const U = (n) => `000000c1-0000-4000-8000-0000000f${String(n).padStart(4, '0')}`;
const IP = (n) => `198.51.100.${10 + n}`;
const idem = () => crypto.randomUUID();
const COLORS = '{"head": 13, "body": 5, "legs": 3, "feet": 0}';

const one = async (db, sql, params) => { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; };

/* As PostgREST calls it: the JWT subject, the request headers, `set role <role>`; a refusal raised as
   SQLSTATE PGRST comes back as { RAISED } so an arm can read the code. */
async function as(db, uid, ip, sql, params, role = 'authenticated') {
  await db.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.headers', $3, true)",
    [uid || '', JSON.stringify(uid ? { sub: uid, role } : { role }), ip ? JSON.stringify({ 'cf-connecting-ip': ip }) : '']);
  await db.query('savepoint as_call');
  await db.exec(`set role ${role}`);
  try {
    const r = (await db.query(sql, params)).rows[0];
    await db.query('release savepoint as_call');
    return r ? Object.values(r)[0] : undefined;
  } catch (e) {
    await db.query('rollback to savepoint as_call');
    return { RAISED: String(e.message), code: e.code };
  } finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true), set_config('request.headers', '', true)");
  }
}
const js = (v) => String(JSON.stringify(v === undefined ? null : v));
const closedRefusal = (r) => !!(r && r.RAISED && r.RAISED.includes('"code":"hr_closed"'));

/* A brand-new account the way GoTrue makes one: the before-user-created hook first (it may refuse), then the
   auth.users insert (the beta-gate and profile triggers run on it). No invite code: the client sends none. */
async function signUp(db, uid, ip, n) {
  const ev = { user: { id: uid, email: `playtester${n}@example.test`, user_metadata: {}, app_metadata: {} },
               metadata: { ip_address: ip } };
  const hook = await one(db, 'select public.hr_signup_gate($1::jsonb)', [JSON.stringify(ev)]);
  if (hook && hook.error) return { hook };
  /* (the replay's auth.users carries id and email; GoTrue's metadata columns are not in the fixture, and the
     beta-gate trigger reads them through to_jsonb(new), so a missing column reads as no code) */
  await db.query('insert into auth.users (id, email) values ($1, $2)', [uid, `playtester${n}@example.test`]);
  const profile = await one(db, 'select count(*)::int from public.profiles where id = $1', [uid]);
  return { hook, profile };
}

/* A brand-new account's first path, every step through the door the real client uses. */
async function firstPath(db, uid, ip, n) {
  const out = {};
  out.load = await as(db, uid, ip, 'select public.hr_load(0)');
  out.hero = await as(db, uid, ip, 'select public.hr_create_hero(0, $1, $2::jsonb, $3::uuid)',
    [`Tester${String.fromCharCode(97 + (n % 26))}${String.fromCharCode(97 + Math.floor(n / 26) % 26)}x`, COLORS, idem()]);
  out.hunt = await as(db, uid, ip, "select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, $1::uuid)", [idem()]);
  /* the edge's door: every hr-accrue verb's first read (closed-mode L3) */
  out.engine = await one(db, "select public.hr_rate_gate($1::uuid, 0, 'accrue')", [uid]);
  out.ok = !!(out.load && !out.load.RAISED && out.hero && out.hero.ok === true
    && out.hunt && out.hunt.ok === true && out.engine === true);
  return out;
}

/* What a second apply must not move. */
const SNAP = `
  select 'flag' k, f.key n, f.enabled::text || '|' || coalesce(f.note, '') || '|' || f.ctid::text v from public.hr_flags f
  union all select 'fn', p.oid::regprocedure::text, md5(replace(p.prosrc, chr(13), '')) || coalesce(p.proacl::text, '')
    from pg_proc p where p.oid in ('public.hr_rpc_gate(text)'::regprocedure, 'public.hr_rate_gate(uuid,integer,text)'::regprocedure,
                                   'public.hr_admitted(uuid)'::regprocedure, 'public.hr_access_check()'::regprocedure,
                                   'public.hr_load(integer)'::regprocedure)
  union all select 'pol', tablename || '.' || policyname, permissive || coalesce(qual, '') || coalesce(with_check, '')
    from pg_policies where policyname in ('hr_closed_admit', 'hr_closed_anon', 'hr_access_allowlist_own')
  union all select 'allow', user_id::text, note from public.hr_access_allowlist
  order by 1, 2`;

const MUTANTS = [
  { id: 'no_flip', arm: 'O-PATH',
    why: 'the file "applies" but never opens the game (its own k1 neutered too, so only the path arms can see it)',
    edits: [[' where public.hr_flags.enabled;', ' where false;'],
            ["  if v_flag then raise exception 'playtest-open §2 k1: closed_mode still reads CLOSED'; end if;",
             '  null;'],
            ['    if v_r is null or jsonb_typeof', '    if false and jsonb_typeof'],
            ["    update public.hr_flags set enabled = false where key = 'closed_mode';\n    if not public.hr_admitted(v_new) then",
             "    update public.hr_flags set enabled = false where key = 'closed_mode';\n    if false then"],
            ['    if not public.hr_rate_gate(v_new, 0,', '    if false and public.hr_rate_gate(v_new, 0,'],
            ["    if not public.hr_rpc_gate('hunt') then", "    if false then"],
            ['    if v_err is not null then\n      raise exception \'playtest-open §2 k2: open, a new account was refused',
             '    if false then\n      raise exception \'playtest-open §2 k2: open, a new account was refused'],
            ["    if v_n <> 1 then raise exception 'playtest-open §2 k2: open, the L4", "    if false then raise exception 'playtest-open §2 k2: open, the L4"],
            ["  if (select enabled from public.hr_flags where key = 'closed_mode')\n     or", '  if false and (select enabled from public.hr_flags where key = \'closed_mode\')\n     or']] },
  { id: 'churn', arm: 'O-IDEM', why: 'every apply rewrites the flag row (a re-apply is not a no-op)',
    edits: [[' where public.hr_flags.enabled;', ';']] },
  { id: 'reclose_on_conflict', arm: 'O-APPLY', why: 'the upsert writes the row CLOSED (its own k1 must refuse it)',
    edits: [['   set enabled = false, updated_at = now()', '   set enabled = true, updated_at = now()']] },
];

function plant(sql, edits) {
  let s = sql;
  for (const [find, repl] of edits) {
    const n = s.split(find).length - 1;
    if (n !== 1) throw Object.assign(new Error(`mutant anchor matched ${n} times: ${find.slice(0, 60)}`), { harness: true });
    s = s.replace(find, () => repl);
  }
  return s;
}

async function applyFile(db, sql) {
  await db.query('savepoint apply_file');
  try { await db.exec(sql); await db.query('release savepoint apply_file'); return null; }
  catch (e) { await db.query('rollback to savepoint apply_file'); return String(e.message).split('\n')[0]; }
}

async function scenario(db, sql) {
  const red = new Map();
  const arm = (id, pass, good, bad) => {
    if (!MUTATE) console.log(pass ? `  ✓ ${id} — ${good}` : `  ✗ ${id} — ${bad}`);
    if (!pass) red.set(id, bad);
  };
  await db.exec('begin');
  try {
    /* O-CLOSED: the control. The chain lands closed and a new account meets the closed door. */
    const flag0 = await one(db, "select enabled from public.hr_flags where key = 'closed_mode'");
    const a = U(1);
    const su = await signUp(db, a, IP(0), 0);
    const pre = await as(db, a, IP(0), 'select public.hr_load(0)');
    arm('O-CLOSED', flag0 === true && !su.hook?.error && su.profile === 1 && closedRefusal(pre),
      'the replayed chain is CLOSED and a brand-new account (codeless sign-up admitted by the hook, profile written) '
      + 'is refused `hr_closed` by hr_load',
      `the control did not hold: flag ${flag0}, sign-up ${js(su)}, hr_load ${js(pre).slice(0, 160)}`);

    /* O-APPLY */
    const e1 = await applyFile(db, sql);
    const flag1 = await one(db, "select enabled from public.hr_flags where key = 'closed_mode'");
    arm('O-APPLY', e1 === null && flag1 === false,
      'the file applies (its §2 self-check passes) and closed_mode reads OPEN',
      `apply: ${e1 || 'ok'}; closed_mode enabled = ${flag1}`);

    /* O-IDEM */
    const s1 = JSON.stringify((await db.query(SNAP)).rows);
    const e2 = await applyFile(db, sql);
    const s2 = JSON.stringify((await db.query(SNAP)).rows);
    arm('O-IDEM', e2 === null && s1 === s2,
      'a second apply moves nothing (flag tuple, gate bodies, policies, allowlist identical)',
      `second apply: ${e2 || 'ok'}; snapshot ${s1 === s2 ? 'identical' : 'MOVED'}`);

    /* O-PATH */
    const p = await firstPath(db, a, IP(0), 0);
    arm('O-PATH', p.ok,
      'the new account boots (hr_load), creates its first hero, enters mill_cellar and passes the engine door',
      `refused on its first path: ${js(p).slice(0, 400)}`);

    /* O-TEN */
    const ten = [];
    for (let i = 1; i <= 10; i++) {
      const u = U(100 + i);
      const s = await signUp(db, u, IP(i), i);
      const f = s.hook?.error ? { ok: false, hook: s.hook } : await firstPath(db, u, IP(i), i);
      ten.push({ u, ok: !!f.ok, f });
    }
    const bad = ten.filter((t) => !t.ok);
    const hunting = await one(db, `select count(*)::int from public.hunt_sessions where ended_at is null
                                      and user_id = any($1::uuid[])`, [ten.map((t) => t.u)]);
    arm('O-TEN', bad.length === 0 && hunting === 10,
      `ten brand-new accounts at once, each from its own address: all sign up, create a hero and are hunting (${hunting} open sessions)`,
      `${bad.length} of 10 refused, ${hunting} hunting: ${js(bad[0] && bad[0].f).slice(0, 400)}`);

    /* O-ANON */
    const anonHero = await as(db, null, IP(20), "select public.hr_create_hero(0, 'Anonx', $1::jsonb, $2::uuid)", [COLORS, idem()], 'anon');
    const anonChat = await as(db, null, IP(20), "insert into public.chat_messages (channel, from_id, from_name, body) values ('global', $1, 'x', 'x') returning 1", [a], 'anon');
    arm('O-ANON', !!(anonHero && anonHero.code === '42501') && !!(anonChat && anonChat.code === '42501'),
      'anon still cannot write: hr_create_hero and a chat insert are refused 42501',
      `anon wrote or was refused for the wrong reason: hero ${js(anonHero).slice(0, 160)}, chat ${js(anonChat).slice(0, 160)}`);

    /* O-CLOSE */
    await db.query("update public.hr_flags set enabled = true, updated_at = now() where key = 'closed_mode'");
    const after = await as(db, a, IP(0), 'select public.hr_load(0)');
    arm('O-CLOSE', closedRefusal(after),
      'the reverse UPDATE shuts the new account out again (`hr_closed`)',
      `closing again did not refuse it: ${js(after).slice(0, 160)}`);
  } finally {
    await db.exec('rollback');
  }
  return red;
}

async function main() {
  const m = await manifest();
  const excluded = Object.prototype.hasOwnProperty.call(m.excluded || {}, FILE);
  const ordered = (m.order || []).includes(FILE) || (m.pre_schema || []).includes(FILE);
  let db;
  try { ({ db } = await bootReplay({ keepClosed: true })); }
  catch (e) { console.error(`playtest-open: HARNESS — ${e.message}`); process.exit(2); }
  try {
    if (!MUTATE) {
      console.log('\nplaytest-open — the Discord playtest switch, on the replayed chain\n');
      const orderOk = excluded && !ordered && /\bSTAGED\b/.test(String(m.excluded[FILE] || ''));
      console.log(orderOk ? `  ✓ O-ORDER — ${FILE} is STAGED in \`excluded\`, not replayed`
        : `  ✗ O-ORDER — ${FILE} must be in \`excluded\` with a STAGED note and not in \`order\``);
      let red;
      try { red = await scenario(db, SQL); }
      catch (e) { console.error(`playtest-open: HARNESS — ${String(e.message).split('\n')[0]}`); process.exit(2); }
      const n = red.size + (orderOk ? 0 : 1);
      console.log(n ? `\nplaytest-open: RED (${n})` : '\nplaytest-open: green');
      process.exitCode = n ? 1 : 0;
      return;
    }
    console.log('\nplaytest-open --mutate\n');
    let survived = 0;
    for (const mu of MUTANTS) {
      let sql;
      try { sql = CONTROL ? SQL : plant(SQL, mu.edits); }
      catch (e) { console.error(`playtest-open: HARNESS — ${e.message}`); process.exit(2); }
      const red = await scenario(db, sql);
      const caught = red.has(mu.arm);
      console.log(caught ? `  ✓ ${mu.id} — caught by ${mu.arm} (${mu.why})`
        : `  ✗ ${mu.id} — SURVIVED (${mu.why}); red arms: ${[...red.keys()].join(', ') || 'none'}`);
      if (!caught) survived++;
    }
    console.log(survived ? `\nplaytest-open --mutate: ${survived} survived` : `\nplaytest-open --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
    process.exitCode = survived ? 1 : 0;
  } finally {
    await db.close().catch(() => {});
  }
}

await main();
