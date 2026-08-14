// ════════════════════════════════════════════════════════════════════════
// tests/pglite-chain.mjs — boot a REAL PostgreSQL with the REAL clan-domain
// migration chain applied, in process, for the behavioural guards.
//
// WHY THIS EXISTS SEPARATELY FROM tests/conservation-fuzz.mjs: that harness
// boots the PLAYER-STATE bundle (player-state / catalogue / daily-budget /
// apply-engine / grant-hygiene / market-v2). The clan domain is a different,
// older stack — schema.sql, clan-seat, governance, membership-authority, the
// A9 retrofit — and none of it is in that bundle. Same technique, same fixture,
// different chain. Nothing here is reimplemented: every file below is read off
// disk and applied verbatim.
//
// PGlite is real PostgreSQL 18 compiled to WASM, in process. No Docker, no
// credentials, no network, production untouched.
//
// ── WHAT THIS SCAFFOLDS, AND WHY EACH STUB IS FAITHFUL ──────────────────
// tests/sql/pglite-fixture.sql supplies auth.users / auth.uid / profiles / the
// pg_cron shim / the four Supabase roles. The clan chain needs four more things
// that the fixture does not have, added by SCAFFOLD below:
//
//   · Supabase's BASE TABLE GRANTS. A real Supabase project grants
//     select/insert/update/delete on public tables to anon + authenticated +
//     service_role at setup, and sets default privileges so new tables inherit
//     them. RLS is then the thing that decides. Without this the clan policies
//     are untestable — a probe running as `authenticated` gets
//     `42501 permission denied for table` from the GRANT layer and never
//     reaches RLS at all, which reads as "refused" and would make every
//     refusal-shaped assertion pass for the wrong reason. That is exactly the
//     always-null-probe family, so it is called out here rather than buried.
//     (Found the hard way: 2026-08-11-clan-membership-authority.sql's own §12
//     self-check fails on a fixture without it, reporting that an OPEN clan
//     join was refused. The file is fine; the fixture was not.)
//   · auth.users.instance_id / aud / role — real columns of Supabase's table
//     that several migrations' self-check fixtures insert into.
//   · publication supabase_realtime — created by Supabase at project setup;
//     supabase/schema.sql adds tables to it.
//   · public.bug_reports, public.beta_invites, public.claim_beta_invite —
//     ⚠ THESE THREE EXIST IN PRODUCTION AND IN NO MIGRATION FILE IN THIS REPO.
//     A clean replay of supabase/migrations/** cannot reconstruct production
//     without them, and 2026-08-11-authenticated-surface-lockdown.sql's A9
//     retrofit fails closed on the missing claim_beta_invite. The shapes here
//     were read off production 2026-08-13 (bug_reports in its PRE-relay shape,
//     i.e. without idem_key/source, which the relay migration then adds). This
//     is scaffolding for a repo gap, not for a design decision — the gap is
//     reported to the Coordinator.
//
// ── WHAT IT DOES NOT PROVE ──────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend. The advisory locks in the
//     clan RPCs are EXERCISED and contended by nothing. A real race needs a
//     multi-connection database.
//   · The PostgREST request path. `request.headers` is set here with
//     set_config, which is how PostgREST sets it — but that the Supabase
//     gateway actually populates `cf-connecting-ip` / `x-forwarded-for` is
//     NOT proven by this file and cannot be. See the header of
//     2026-08-13-anon-rate-gate.sql.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);

// Dependency order, NOT filename order — filename order does not apply
// (clan-write-policy-pin asserts against a policy clan-membership-authority
// installs, and 'm' sorts after 'w'... no: 'me' sorts before 'wr', which is why
// membership-authority must come first and does).
export const CHAIN = [
  ['schema', join(ROOT, 'supabase', 'schema.sql')],
  ['clan-seat', MIG('2026-08-08-clan-seat.sql')],
  ['clan-seat-2', MIG('2026-08-08-clan-seat-2.sql')],
  ['hunt', MIG('2026-08-08-hunt.sql')],
  ['leaderboards', MIG('2026-08-08-leaderboards.sql')],
  ['muster', MIG('2026-08-08-muster.sql')],
  ['raid-hardening', MIG('2026-08-08-raid-hardening.sql')],
  ['unique-names', MIG('2026-08-08-unique-names.sql')],
  ['bonus-rebase', MIG('2026-08-09-bonus-rebase.sql')],
  ['clan-governance', MIG('2026-08-09-clan-governance.sql')],
  ['rally-preselect', MIG('2026-08-09-rally-preselect.sql')],
  ['rally-v2', MIG('2026-08-09-rally-v2.sql')],
  ['save-integrity', MIG('2026-08-10-save-integrity.sql')],
  ['session-claims', MIG('2026-08-10-session-claims.sql')],
  ['player-state', MIG('2026-08-11-player-state.sql')],
  ['accrue-gate', MIG('2026-08-11-accrue-gate.sql')],
  ['bug-report-relay', MIG('2026-08-11-bug-report-relay.sql')],
  ['chat-name-authority', MIG('2026-08-11-chat-name-authority.sql')],
  ['anon-execute-lockdown', MIG('2026-08-11-anon-execute-lockdown.sql')],
  ['clan-member-cap', MIG('2026-08-11-clan-member-cap.sql')],
  ['clan-membership-authority', MIG('2026-08-11-clan-membership-authority.sql')],
  ['clan-write-policy-pin', MIG('2026-08-11-clan-write-policy-pin.sql')],
  ['clan-browser-door', MIG('2026-08-11-clan-browser-door.sql')],
  ['raid-claim-authority', MIG('2026-08-11-raid-claim-authority.sql')],
  ['authenticated-surface-lockdown', MIG('2026-08-11-authenticated-surface-lockdown.sql')],
  // ── the files under test ────────────────────────────────────────────────
  ['clan-contribute-authority', MIG('2026-08-13-clan-contribute-authority.sql')],
  ['clan-board-attribution', MIG('2026-08-13-clan-board-attribution.sql')],
  ['anon-rate-gate', MIG('2026-08-13-anon-rate-gate.sql')],
];

const SCAFFOLD = `
-- Supabase's base grants (see the header). Default privileges FIRST so every
-- table the migrations create inherits them, exactly as on a real project.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public
  to anon, authenticated, service_role;

create publication supabase_realtime;

alter table auth.users add column if not exists instance_id uuid;
alter table auth.users add column if not exists aud  text;
alter table auth.users add column if not exists role text;

-- ⚠ Production objects with NO migration file in this repo. See the header.
create table if not exists public.beta_invites (
  code       text primary key,
  note       text,
  used_by    uuid references auth.users(id) on delete set null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
alter table public.beta_invites enable row level security;

create or replace function public.claim_beta_invite(code_in text) returns json
language plpgsql security definer set search_path to 'public' as $fn$
declare inv record; uid uuid := auth.uid();
begin
  if uid is null then return json_build_object('ok', false, 'reason', 'Must be signed in'); end if;
  select * into inv from beta_invites where code = code_in for update;
  if inv is null then return json_build_object('ok', false, 'reason', 'Invalid code'); end if;
  if inv.used_by is not null then return json_build_object('ok', false, 'reason', 'Code already used'); end if;
  update beta_invites set used_by = uid, used_at = now() where code = code_in;
  return json_build_object('ok', true);
end; $fn$;

create table if not exists public.bug_reports (
  id            bigserial primary key,
  user_id       uuid references auth.users(id) on delete set null,
  build_version text,
  summary       text not null,
  description   text,
  state         jsonb,
  errors        jsonb,
  resolved      boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table public.bug_reports enable row level security;
`;

/**
 * Boot a database with the whole chain applied.
 *
 * @param {object}   opts
 * @param {Array<[string,string]>} [opts.extra]  additional [name, absPath]
 *        migrations appended AFTER the chain above. Additive on purpose: the
 *        b338 character-bootstrap guard needs the catalogue, which the clan
 *        chain does not, and silently growing the shared CHAIN would change
 *        the environment every other guard runs in. Patches address these by
 *        name exactly like chain entries.
 * @param {Map<string,string>} [opts.patches]  name -> [[find, replace], ...]
 *        applied to that migration's TEXT before it is executed. Every anchor
 *        must match EXACTLY ONCE and must change the text, or this throws —
 *        a planted bug that was never planted is decoration.
 * @returns {Promise<{db: any, applied: string[]}>}
 */
export async function bootChain({ patches, extra } = {}) {
  const chain = [...CHAIN, ...(extra || [])];
  let PGlite;
  try { ({ PGlite } = await import('@electric-sql/pglite')); }
  catch {
    const e = new Error(
      '@electric-sql/pglite is not installed. These guards run a real PostgreSQL\n'
      + '  in process; without it there is nothing to assert against and a "pass"\n'
      + '  would be meaningless.  npm i -D @electric-sql/pglite');
    e.harness = true;
    throw e;
  }

  const sources = new Map();
  for (const [name, path] of chain) {
    // LF in memory only. The migrations are checked in with CRLF on this box;
    // patch anchors are written with LF, and an anchor that silently fails to
    // match is the "planted bug that was never planted" failure.
    sources.set(name, (await readFile(path, 'utf8')).replace(/\r\n/g, '\n'));
  }

  if (patches) {
    for (const [name, list] of patches) {
      let sql = sources.get(name);
      if (sql === undefined) {
        const e = new Error(`patch names an unknown migration "${name}"`);
        e.harness = true; throw e;
      }
      for (const [find, replace] of list) {
        const n = sql.split(find).length - 1;
        if (n !== 1) {
          const e = new Error(
            `patch anchor matched ${n} times in ${name} (need exactly 1).\n`
            + '  The migration text has moved. Fix the anchor rather than letting the\n'
            + '  mutation silently no-op.');
          e.harness = true; throw e;
        }
        const after = sql.replace(find, replace);
        if (after === sql) {
          const e = new Error(`patch on ${name} produced identical SQL`);
          e.harness = true; throw e;
        }
        sql = after;
      }
      sources.set(name, sql);
    }
  }

  const db = await PGlite.create();
  const fixture = await readFile(join(ROOT, 'tests', 'sql', 'pglite-fixture.sql'), 'utf8');
  await db.exec("select set_config('hearthrise.market_wipe_ok','yes',false)");
  await db.exec(fixture);
  await db.exec(SCAFFOLD);

  const applied = [];
  for (const [name] of chain) {
    // Wrapped, because that is how apply_migration runs a file on this project:
    // atomically. A self-check `raise` must abort the whole file, not leave
    // half of it installed.
    await db.exec(`begin;\n${sources.get(name)}\ncommit;`);
    applied.push(name);
  }
  return { db, applied };
}
