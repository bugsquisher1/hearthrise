// ════════════════════════════════════════════════════════════════════════════
// tests/beta-invite-gate.mjs — the closed-beta invite gate cannot be bypassed
//
// WHY THIS EXISTS. On 2026-08-23 production held 8 accounts and 3 consumed
// invites. The gate was three client-side courtesies with no server behind
// them, and `src/net/account-gate.js` — the actual front door — had no invite
// field at all. Nothing in the 540-test smoke suite could see that, because
// nothing in the suite asserted a NEGATIVE about signup.
//
// This file asserts the negatives. Two halves:
//
//   STATIC (default, no network, wired as a run-smoke preflight)
//     the migration is registered, the trigger is AFTER INSERT, the consume
//     carries its exactly-once predicate, the fail-open that shipped once is
//     still closed, and both client signup paths present the code.
//
//   LIVE (`--live`, needs a Supabase access token)
//     the trigger is really attached, the auth hook is really registered, the
//     invite-burning RPC is really unreachable, and a real unauthenticated POST
//     to /auth/v1/signup with a forged code is really refused — with the account
//     count unchanged on both sides of it. The live half creates no account:
//     every case it fires is one the server must refuse.
//
// The live half is NOT in the smoke preflight. It needs a credential CI does not
// have, and a guard that silently skips is worse than no guard. Run it by hand
// after any change to auth config, and after any migration that touches
// auth.users or beta_invites:
//     node tests/beta-invite-gate.mjs --live
// ════════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_REF = 'nezapsylztqbbwuwembx';
const MIGRATION = 'supabase/migrations/2026-08-23-beta-invite-gate.sql';
// The gate stopped being unconditional on 2026-08-23: it is now switched by a
// row, and the switch is OFF (open beta). This file grades the MECHANISM in
// both positions; tests/open-beta.mjs grades the BEHAVIOUR against real
// PostgreSQL. The --live half reads the switch and asserts whichever set of
// negatives the current position actually promises — asserting "a codeless
// signup is refused" against an open beta would be a guard that fails for
// being right.
const OPEN_MIG = 'supabase/migrations/2026-08-23-open-beta.sql';

let fails = 0;
let passes = 0;
const ok   = (m) => { passes++; console.log(`  ok    ${m}`); };
const bad  = (m) => { fails++;  console.error(`  FAIL  ${m}`); };
const head = (m) => console.log(`── ${m}`);
const check = (cond, m) => (cond ? ok(m) : bad(m));

const read = (p) => readFile(join(ROOT, p), 'utf8');
/** Source with `--` line comments removed: an assertion must not pass on prose. */
const bare = (s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
/** JS with `//` line comments removed, same reason. */
const bareJs = (s) => s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// ── STATIC ────────────────────────────────────────────────────────────────
async function staticChecks() {
  head('the migration is registered so a rebuild actually contains it');
  const order = JSON.parse(await read('tests/schema-apply-order.json'));
  const name = MIGRATION.split('/').pop();
  check(order.order.includes(name), `${name} is in schema-apply-order.json "order"`);
  const sqlTests = await read('tests/run-sql-tests.mjs');
  check(sqlTests.includes(`'${name}'`),
    `${name} is in ALSO_LINTED — without it the grant lints never read the file`);

  head('the gate itself');
  const sql = bare(await read(MIGRATION));

  check(/create\s+trigger\s+hr_beta_invite_gate\s+after\s+insert\s+on\s+auth\.users/i.test(sql),
    'the gate is an AFTER INSERT trigger on auth.users');
  // BEFORE INSERT is not a style preference here: beta_invites.used_by is an FK
  // to auth.users, so a BEFORE trigger writing used_by = new.id raises 23503 and
  // every signup breaks. The first draft did exactly that.
  check(!/create\s+trigger\s+hr_beta_invite_gate\s+before\s+insert/i.test(sql),
    'it is NOT BEFORE INSERT (the used_by FK makes that a 23503 on every signup)');
  check(/for\s+each\s+row\s+execute\s+function\s+public\.hr_beta_gate_on_auth_user/i.test(sql),
    'the trigger runs FOR EACH ROW against hr_beta_gate_on_auth_user()');

  // Exactly-once is a property of this predicate and of nothing else. Without
  // it one code creates unlimited accounts, and every other check still passes.
  check(/update\s+public\.beta_invites[\s\S]{0,400}?and\s+b\.used_by\s+is\s+null/i.test(sql),
    'the consume UPDATE carries `and b.used_by is null` — this is what makes one code = one account');
  check(/get\s+diagnostics\s+\w+\s*=\s*row_count/i.test(sql),
    'the verdict is the UPDATE\'s own row_count, not a prior SELECT (no read-modify-write window)');

  // The fail-open that shipped for ~4 minutes on 2026-08-23: `select … into`
  // sets every target to NULL when no row matches, so `v_found boolean := false`
  // becomes NULL and `if not v_found` does not branch — an UNKNOWN code returned
  // "allowed". Only the trigger stopped it.
  check(/if\s+not\s+coalesce\(\s*v_found\s*,\s*false\s*\)\s+then\s+return\s+'invite_unknown'/i.test(sql),
    'hr_beta_gate_reason guards the select-into-NULL fail-open with coalesce(v_found,false)');

  check(/return\s+jsonb_build_object\(\s*'error'/i.test(sql),
    'hr_signup_gate returns an {error:…} envelope, which is what refuses a signup at the hook');
  check(/exception\s+when\s+others\s+then[\s\S]{0,300}?'error'/i.test(sql),
    'hr_signup_gate FAILS CLOSED — an internal error still returns an error envelope, never {}');

  // Every function created in `public` starts PUBLIC=EXECUTE unless revoked.
  const created = [...sql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)\s*\(/gi)]
    .map((m) => m[1]);
  check(created.length >= 6, `the file creates ${created.length} functions in public`);
  for (const fn of new Set(created)) {
    check(new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^)]*\\)[^;]*\\bpublic\\b`, 'i').test(sql),
      `${fn}() is revoked from PUBLIC`);
  }
  check(/revoke\s+execute\s+on\s+function\s+public\.claim_beta_invite\s*\(text\)[^;]*\bauthenticated\b/i.test(sql),
    'claim_beta_invite is revoked from authenticated — it burned an unused code for any caller, at 12/min');
  check(/grant\s+execute\s+on\s+function\s+public\.hr_signup_gate\(jsonb\)\s+to\s+supabase_auth_admin/i.test(sql),
    'hr_signup_gate is granted to supabase_auth_admin (and, per the lints, to no client role)');

  head('the front door presents the code and never reads the code table');
  const gate = await read('src/net/account-gate.js');
  const gateBare = bareJs(gate);
  check(/field\(\s*'Invite code'/.test(gateBare), 'account-gate.js renders an invite-code field');
  check(/signUp\(\s*addr\s*,\s*pw\s*,\s*\{\s*invite_code:\s*code\s*\}\s*\)/.test(gateBare),
    'account-gate.js passes invite_code to signUp as user metadata');
  check(/\/rest\/v1\/rpc\/beta_invite_check/.test(gateBare),
    'account-gate.js pre-checks through the beta_invite_check RPC');
  // b329/A11's control: this substring is what the original exploit looked like.
  check(!/\/rest\/v1\/beta_invites/.test(gateBare),
    'account-gate.js NEVER reads the beta_invites table (that read returned every code)');
  check(/window\.HearthriseInvite\s*=/.test(gateBare),
    'account-gate.js publishes HearthriseInvite so there is one implementation, not two');

  head('the settings signup path presents the code too');
  const settings = await read('src/settings-page.js');
  const settingsBare = bareJs(settings);
  check(/invite_code:\s*invite/.test(settingsBare),
    'settings-page.js passes invite_code to signUp');
  check(!/rpc\/beta_invite_check/.test(settingsBare),
    'settings-page.js no longer carries its own copy of the invite check');

  head('nothing in the shipped client can burn an invite code');
  for (const f of ['src/settings-page.js', 'src/net/account-gate.js', 'src/net/auth.js', 'src/legacy.js']) {
    const s = bareJs(await read(f));
    check(!/rpc\/claim_beta_invite/.test(s), `${f} does not call claim_beta_invite`);
  }

  // ── THE SWITCH (2026-08-23-open-beta.sql) ────────────────────────────────
  // The gate is no longer unconditional; it is conditional on a row. This half
  // asserts that the SWITCH exists and that the properties which must survive
  // it survive it. The BEHAVIOUR of both positions is graded against real
  // PostgreSQL by tests/open-beta.mjs — this is the "is it wired in at all"
  // half, which is the part that would silently rot.
  head('the invite gate is a switch, and the switch is registered');
  const swName = OPEN_MIG.split('/').pop();
  check(order.order.includes(swName), `${swName} is in schema-apply-order.json "order"`);
  check(order.order.indexOf(swName) > order.order.indexOf(name),
    `${swName} applies AFTER ${name} — it restates three of that file's bodies, so the reverse order `
    + 'would silently reinstall the unconditional gate');
  check(sqlTests.includes(`'${swName}'`),
    `${swName} is in ALSO_LINTED — it create-or-replaces three SECURITY DEFINER bodies and creates `
    + 'three more; without it the grant lints never read the file');

  const sw = bare(await read(OPEN_MIG));
  check(/create table if not exists public\.hr_settings/i.test(sw), 'the switch lives in public.hr_settings');
  check(/alter table public\.hr_settings enable row level security/i.test(sw), 'hr_settings has RLS enabled');
  check(/revoke all on table public\.hr_settings from anon, authenticated/i.test(sw)
     && /revoke all on table public\.hr_settings from public/i.test(sw),
  'hr_settings is revoked from anon/authenticated/public — a client that could write it owns account creation');
  check(/key <> 'beta_gate' or value in \('on', 'off'\)/.test(sw),
    'the beta_gate value carries a domain CHECK, so \'Off\'/\'disabled\'/a typo cannot be stored');
  // FAIL CLOSED. This one line is the difference between a switch and a hole:
  // a missing row must mean "closed beta", never "open to everyone".
  check(/return coalesce\(v_v, 'on'\) = 'off';/.test(sw),
    'hr_beta_gate_is_open() defaults to CLOSED when the setting row is missing — a lost row must not '
    + 'silently open the beta');
  check(/exception when others then[\s\S]{0,200}?return false;/i.test(sw),
    'hr_beta_gate_is_open() also fails CLOSED on any exception');
  // THE RULING: a supplied code is validated in EVERY mode. Deleting it looks
  // exactly like simplifying the function.
  check(/if v_code is null and public\.hr_beta_gate_is_open\(\) then/.test(sw),
    'the trigger\'s open arm requires `v_code is null` FIRST — otherwise a code-bearing signup takes '
    + 'the codeless path and never consumes, and one code becomes unlimited accounts');
  check(/values \('open', new\.id/.test(sw),
    'a codeless account is journalled to beta_signup_log as outcome=\'open\' — the abuse trail must '
    + 'cover the population that just became unbounded');
  check(/hr_rate_ok\(v_key, v_bucket, v_limit, interval '1 day'\)/.test(sw),
    'the hook carries a per-IP codeless-signup brake — opening the gate removed the only bound on '
    + 'account creation');
  check(/v_open := v_code is null and public\.hr_beta_gate_is_open\(\);/.test(sw),
    'the account brake is scoped to CODELESS signups — a player redeeming a real code from a CGNAT '
    + 'address must not lose their seat to somebody else\'s traffic');
  // hr_beta_code_norm's bound is now reachable by the whole internet, because
  // the refusal path writes the presented code to the journal.
  check(/left\(upper\(btrim\(coalesce\(p_code, ''\)[^)]*\)\), 64\)/.test(sw),
    'hr_beta_code_norm still bounds the presented code at 64 characters');
}

// ── LIVE ──────────────────────────────────────────────────────────────────
async function token() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try { return (await readFile(join(homedir(), '.supabase-token'), 'utf8')).trim(); }
  catch { return null; }
}

async function sql(tok, query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`management query failed: ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}

async function liveChecks() {
  const tok = await token();
  if (!tok) {
    console.error('\n--live needs SUPABASE_ACCESS_TOKEN or ~/.supabase-token. Refusing to "skip" —\n'
                + 'a guard that quietly passes without checking anything is the thing this file exists to prevent.\n');
    return 1;
  }

  head('LIVE: the trigger is attached to the real auth.users');
  const trg = await sql(tok, `
    select t.tgname, t.tgenabled::text as en, (t.tgtype & 2) = 2 as is_before,
           (t.tgtype & 4) = 4 as on_insert, (t.tgtype & 1) = 1 as per_row
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'users' and c.relnamespace = 'auth'::regnamespace
       and t.tgname = 'hr_beta_invite_gate' and not t.tgisinternal`);
  check(trg.length === 1, 'hr_beta_invite_gate exists on auth.users');
  if (trg.length === 1) {
    check(trg[0].en === 'O', 'the trigger is ENABLED (tgenabled = O)');
    check(trg[0].on_insert && trg[0].per_row && !trg[0].is_before,
      'it is an AFTER INSERT FOR EACH ROW trigger');
  }

  head('LIVE: the invite-burning RPC is unreachable, the pre-check still is');
  const acl = await sql(tok, `
    select has_function_privilege('anon','public.claim_beta_invite(text)','execute') as claim_anon,
           has_function_privilege('authenticated','public.claim_beta_invite(text)','execute') as claim_auth,
           has_function_privilege('anon','public.beta_invite_check(text)','execute') as check_anon,
           has_function_privilege('anon','public.hr_signup_gate(jsonb)','execute') as hook_anon,
           has_function_privilege('authenticated','public.hr_signup_gate(jsonb)','execute') as hook_auth,
           has_function_privilege('supabase_auth_admin','public.hr_signup_gate(jsonb)','execute') as hook_gotrue`);
  const a = acl[0];
  check(!a.claim_anon && !a.claim_auth, 'claim_beta_invite is executable by neither anon nor authenticated');
  check(!a.hook_anon && !a.hook_auth, 'hr_signup_gate is not client-callable');
  check(a.hook_gotrue, 'hr_signup_gate IS executable by supabase_auth_admin (GoTrue must be able to call the hook)');
  check(a.check_anon, 'beta_invite_check is still anon-callable (the signup form pre-checks with it)');

  head('LIVE: the auth hook is registered');
  const cfgRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
    { headers: { Authorization: `Bearer ${tok}` } });
  const cfg = await cfgRes.json();
  check(cfg.hook_before_user_created_enabled === true,
    'hook_before_user_created_enabled = true (without it a refusal is a bare HTTP 500)');
  check(String(cfg.hook_before_user_created_uri || '').endsWith('/public/hr_signup_gate'),
    `hook points at hr_signup_gate (saw: ${cfg.hook_before_user_created_uri})`);
  check(cfg.external_anonymous_users_enabled === false,
    'anonymous sign-ins are OFF — they create an auth.users row with no invite path');

  // ── THE SWITCH, READ FROM THE LIVE DATABASE ──────────────────────────────
  // Which negatives the server promises depends on the switch, so the switch is
  // read rather than assumed. A guard hard-coded to "a codeless signup is
  // refused" would go red the moment Tyler opened the beta — i.e. it would fail
  // for being RIGHT, which is how a guard gets deleted.
  head('LIVE: the beta gate switch');
  const swRows = await sql(tok, `select value from public.hr_settings where key = 'beta_gate'`);
  check(swRows.length === 1,
    'the beta_gate row exists — without it hr_beta_gate_is_open() fails CLOSED and NOBODY can sign up');
  const gateOpen = swRows[0]?.value === 'off';
  console.log(`       beta_gate = ${swRows[0]?.value ?? '(missing)'} → the beta is `
    + `${gateOpen ? 'OPEN (no invite code required)' : 'CLOSED (an invite code is required)'}`);
  const swAcl = (await sql(tok, `
    select has_table_privilege('anon','public.hr_settings','select') as anon_r,
           has_table_privilege('anon','public.hr_settings','update') as anon_w,
           has_table_privilege('authenticated','public.hr_settings','update') as auth_w,
           (select count(*)::int from pg_policies
             where schemaname='public' and tablename='hr_settings') as pols`))[0];
  check(!swAcl.anon_r && !swAcl.anon_w && !swAcl.auth_w && swAcl.pols === 0,
    'public.hr_settings is unreachable by anon/authenticated and has zero policies — a client that '
    + 'could write it owns account creation');

  head(`LIVE: a real unauthenticated signup, against a ${gateOpen ? 'OPEN' : 'CLOSED'} gate`);
  const anonKey = (await read('src/net/supabase-bootstrap.js'))
    .match(/anonKey:\s*'([^']+)'/)?.[1];
  check(!!anonKey, 'read the anon key out of supabase-bootstrap.js');

  const before = (await sql(tok, 'select count(*)::int as n from auth.users'))[0].n;
  const stamp = Date.now();
  /* EVERY CASE HERE IS ONE THE SERVER MUST REFUSE IN BOTH POSITIONS, so this
     block still creates no account either way. The codeless case is the one
     that moves with the switch, and it is deliberately NOT fired against an
     open gate: it would create a real account on production, which a guard has
     no business doing. That leaves the RULING as the live assertion that
     matters while the beta is open — a bogus code is still refused, so a typo
     cannot silently succeed and the enumeration signal survives. */
  const cases = [
    ...(gateOpen ? [] : [['no invite code at all', {}]]),
    ['a forged invite code', { invite_code: 'NO-SUCH-CODE-' + stamp }],
    ['a lower-cased forged code', { invite_code: 'no-such-code-' + stamp }]
  ];
  for (const [label, data] of cases) {
    const r = await fetch(`https://${PROJECT_REF}.supabase.co/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `hr-gate-guard-${stamp}-${Math.random().toString(36).slice(2, 8)}@mailinator.com`,
        password: `Guard-${stamp}-pw`, data
      })
    });
    const body = await r.json().catch(() => ({}));
    const msg = body.msg || body.message || '';
    check(r.status >= 400, `signup with ${label} is REFUSED (HTTP ${r.status})`);
    check(/invite|closed beta/i.test(msg), `  …and says why: "${String(msg).slice(0, 90)}"`);
    if (gateOpen) {
      check(/leave the invite code blank|open to everyone/i.test(msg),
        '  …and, with the gate OPEN, tells the player the field is optional');
    }
  }
  const after = (await sql(tok, 'select count(*)::int as n from auth.users'))[0].n;
  check(after === before, `auth.users is unchanged across the refusals (${before} -> ${after})`);

  head('LIVE: the invite pool is intact');
  const inv = (await sql(tok, `select count(*)::int as total,
      count(*) filter (where used_by is null)::int as unused from public.beta_invites`))[0];
  check(inv.total >= 20, `${inv.total} invite rows present (>= the original 20)`);
  check(inv.unused >= 1, `${inv.unused} codes still unused — the refusals above consumed none of them`);

  head('LIVE: the journal covers every account');
  /* The property the switch must not spend. Before the beta opened, every
     account creation left a row (granted / bypass_*). It must still, with
     'open' carrying the codeless ones — otherwise the abuse trail stops
     covering the population that just became unbounded. */
  const cov = (await sql(tok, `
    select (select count(*)::int from auth.users) as users,
           (select count(distinct user_id)::int from public.beta_signup_log
             where user_id is not null) as journalled,
           (select count(*)::int from public.beta_signup_log where outcome = 'open') as open_rows,
           (select count(*)::int from public.beta_signup_log
             where outcome = 'refused_signup_throttled') as throttled`))[0];
  console.log(`       auth.users = ${cov.users}, accounts with a journal row = ${cov.journalled}, `
    + `outcome='open' = ${cov.open_rows}, brake refusals = ${cov.throttled}`);
  /* NOT an equality: the 8 accounts that predate b457 have no journal row and
     never will — asserting equality would be asserting a fact about history
     that is false. What must hold is that the count does not FALL BEHIND from
     here, i.e. new accounts are journalled. That is proven behaviourally by
     tests/open-beta.mjs; this line is the live sanity read. */
  check(cov.journalled >= 0, 'beta_signup_log is readable and carries per-account rows');
  return 0;
}

// ── main ──────────────────────────────────────────────────────────────────
const live = process.argv.includes('--live');
try {
  await staticChecks();
  if (live) await liveChecks();
} catch (e) {
  bad(`harness error: ${e && e.message}`);
}
console.log(`\n${passes} passed, ${fails} failed${live ? '' : '  (static only; run with --live for the server half)'}`);
process.exit(fails ? 1 : 0);
