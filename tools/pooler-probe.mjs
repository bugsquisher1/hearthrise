#!/usr/bin/env node
// tools/pooler-probe.mjs — settle a Supavisor pooler USERNAME SHAPE without a password.
//
// WHY THIS EXISTS
// ───────────────
// docs/design/restore-runbook.md §6a-iii step 2 rebuilds HR_ENGINE_DB_URL by hand after a
// restore. That string embeds the pooler username, and the shape for a CUSTOM role
// (`hr_engine_login.<ref>`, not `postgres.<ref>`) was INFERRED for a long time and never
// verified, because the live secret's value is deliberately unreadable. The runbook's own
// connect test was written as a `psql` one-liner — and psql is not installed on the machine
// this project is developed on, which made the single most important verification step in
// the restore path unrunnable at 3am. This is that test, in node, using the `postgres`
// dependency the repo already has.
//
// WHY IT IS SAFE TO RUN AGAINST PRODUCTION
// ────────────────────────────────────────
// Every attempt uses a deliberately WRONG password. Nothing authenticates, so nothing can
// run SQL, read a row, or occupy one of hr_engine_login's 20 connection slots. All we read
// is WHICH failure comes back. Postgres has no login lockout, so a failed attempt has no
// lasting effect.
//
// THE SIGNATURES (measured 2026-08-15 against nezapsylztqbbwuwembx)
// ────────────────────────────────────────────────────────────────
//   28P01  password authentication failed for user "X"
//        -> ROUTED and RESOLVED. The username shape is CORRECT; only the password is wrong.
//   XX000  (EAUTHQUERY) user not found in the database
//        -> tenant routed, but the role before the dot does not exist OR CANNOT LOG IN.
//   XX000  (ENOIDENTIFIER) no tenant identifier provided
//        -> the `.<ref>` suffix is missing entirely.
//
// The EAUTHQUERY case is the one worth knowing at 3am: a NOLOGIN role (hr_engine) is
// indistinguishable from a role that does not exist. If you accidentally put the capability
// role in the URL instead of the login role, the pooler does NOT tell you "cannot log in" —
// it tells you the user does not exist, and you will go looking for the wrong problem.
//
// USAGE
//   node tools/pooler-probe.mjs <project-ref> [pooler-host] [role ...]
//   node tools/pooler-probe.mjs nezapsylztqbbwuwembx
//
// Exit 0 if the primary candidate routed+resolved (28P01), 1 otherwise.

import postgres from 'postgres';

const REF = process.argv[2];
const HOST = process.argv[3] || 'aws-1-us-west-2.pooler.supabase.com';
const PORT = 6543; // transaction pooler. NEVER 5432 — design §2a-ii, and the whole reason
                   // hr-accrue fails closed on the port. Not configurable here on purpose.

if (!REF) {
  console.error('usage: node tools/pooler-probe.mjs <project-ref> [pooler-host] [role ...]');
  console.error('  get the host from: GET /v1/projects/<ref>/config/database/pooler');
  process.exit(2);
}

// A password that cannot be right. Fixed, not random, so the probe is reproducible.
const WRONG_PW = 'probe-not-a-real-password-0000000000';

const extraRoles = process.argv.slice(4);
const cases = [
  ['CANDIDATE  hr_engine_login.<ref>  (the shape HR_ENGINE_DB_URL must use)', `hr_engine_login.${REF}`, true],
  ['control    postgres.<ref>         (known-good shape — proves probe discriminates)', `postgres.${REF}`, false],
  ['control    hr_engine_login        (no tenant suffix)', 'hr_engine_login', false],
  ['control    hr_engine.<ref>        (NOLOGIN capability role — must NOT resolve)', `hr_engine.${REF}`, false],
  ['control    nosuchrole_zzz.<ref>   (role that does not exist)', `nosuchrole_zzz.${REF}`, false],
  ...extraRoles.map((r) => [`extra      ${r}`, r, false]),
];

function classify(err) {
  const msg = (err && (err.message || String(err))) || '';
  const code = (err && err.code) || '';
  if (code === '28P01' || /password authentication failed/i.test(msg)) return 'ROUTED+RESOLVED';
  if (/user not found in the database/i.test(msg)) return 'ROLE-NOT-RESOLVED';
  if (/no tenant identifier/i.test(msg) || /Tenant or user not found/i.test(msg)) return 'TENANT-NOT-ROUTED';
  if (/timeout|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ECONNRESET/i.test(msg)) return 'NETWORK';
  return 'OTHER';
}

console.log(`pooler-probe: ${HOST}:${PORT} ref=${REF}`);
console.log('  (every attempt uses a deliberately wrong password — nothing authenticates)\n');

let candidateOk = false;
for (const [label, user, isCandidate] of cases) {
  const url = `postgresql://${encodeURIComponent(user)}:${WRONG_PW}@${HOST}:${PORT}/postgres`;
  const sql = postgres(url, { ssl: 'require', max: 1, connect_timeout: 15, idle_timeout: 1, onnotice: () => {} });
  let verdict, detail = '';
  try {
    await sql`select 1`;
    // Reaching here means a wrong password authenticated. That is a security finding,
    // not a probe result.
    verdict = 'CONNECTED';
    detail = 'WRONG PASSWORD AUTHENTICATED — STOP AND ESCALATE';
  } catch (e) {
    verdict = classify(e);
    detail = ((e && e.message) || '').slice(0, 120);
  } finally {
    try { await sql.end({ timeout: 2 }); } catch { /* probe teardown, never fatal */ }
  }
  console.log(`  ${verdict.padEnd(18)} ${label}`);
  if (verdict === 'OTHER' || verdict === 'NETWORK' || verdict === 'CONNECTED') console.log(`      ${detail}`);
  if (isCandidate && verdict === 'ROUTED+RESOLVED') candidateOk = true;
}

console.log('');
if (candidateOk) {
  console.log(`pooler-probe: OK — hr_engine_login.${REF} routes and resolves.`);
  console.log(`  HR_ENGINE_DB_URL = postgresql://hr_engine_login.${REF}:<PW>@${HOST}:${PORT}/postgres`);
  process.exit(0);
}
console.log('pooler-probe: FAILED — the candidate username did not route+resolve.');
console.log('  Do NOT set HR_ENGINE_DB_URL from a shape this probe could not confirm.');
process.exit(1);
