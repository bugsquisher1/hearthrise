-- ============================================================================
-- 2026-08-10-dr-beta-invites-base.sql
--
-- RECONSTRUCTION, NOT A CHANGE. `public.beta_invites` and
-- `public.claim_beta_invite(text)` exist in production and are created by NO
-- file in this repo. This file closes that gap.
--
-- ── WHAT BREAKS WITHOUT IT, MEASURED ────────────────────────────────────────
-- A clean replay of supabase/schema.sql + supabase/migrations/**:
--
--   live-market-rls              fails: relation "public.beta_invites" does not exist
--     └─ beta-invite-check-volatile  fails: public.beta_invite_check(text) does not exist
--     └─ market-offers-authority     fails: trg_market_listing_stamp is GONE
--                                    (live-market-rls installs it; it never ran)
--
-- and separately, A9's retrofit list in
-- 2026-08-11-authenticated-surface-lockdown.sql names
-- 'public.claim_beta_invite(text)' explicitly (line ~477) and fails closed on
-- it. So the missing FUNCTION is a hard dependency of the authenticated-surface
-- lockdown, not merely a cosmetic gap.
--
-- ── SHOULD THIS EXIST AT ALL? YES — CHECKED, NOT ASSUMED ────────────────────
-- The reflex answer is "beta gating dies at the wipe, so delete it rather than
-- enshrine it." That answer is wrong TODAY, on evidence:
--   · src/settings-page.js:322 calls POST /rest/v1/rpc/claim_beta_invite. It is
--     granted to `authenticated` and it is on the live sign-up path.
--   · src/settings-page.js:182 calls beta_invite_check, which reads this table.
--     That RPC is created by 2026-08-11-live-market-rls.sql §3, an APPLIED
--     migration, and is asserted anon-callable by its own self-check.
--   · Production holds 20 invite codes with 0 rows of player progression. This
--     is operational scaffolding, not beta player data — the cutover wipe does
--     not reach it.
-- Deleting these objects is therefore a PRODUCTION CHANGE that takes sign-up
-- offline and forces an edit to an already-applied migration's retrofit list.
-- That is a separate decision with its own file, deliberately not smuggled into
-- a reconstruction. The honest recommendation is recorded at the foot of this
-- header.
--
-- ── ⚠ THE TRAP THIS FILE IS BUILT AROUND ────────────────────────────────────
-- `beta_invites` was created with `for select using (true)` to PUBLIC. That was
-- vulnerability A11 — an anon key returned every code — and it is CLOSED in
-- production: 2026-08-11-live-market-rls.sql §3b was applied a second time on
-- 2026-08-13 with `hearthrise.beta_invites_lockdown_ok = 'yes'`, which dropped
-- policy "invites world readable" and revoked select from anon/authenticated.
-- Verified 2026-08-14: beta_invites has ZERO policies and no anon/authenticated
-- grant.
--
-- A reconstruction file that recreates the historical shape UNCONDITIONALLY
-- would therefore REOPEN A11 the moment it was applied to production. A
-- "make the repo match production" file that silently un-fixes a P0 is worse
-- than the gap it closes. Hence the same construction as its sibling: the whole
-- body sits inside `if v_fresh then`, v_fresh = `to_regclass(...) is null`, so
-- on production this file provably does nothing at all. On a fresh rebuild it
-- lays down the PRE-lockdown state, and live-market-rls §3b — with the GUC set,
-- as production had it — closes A11 exactly as it did the first time. The
-- rebuild walks the same path production walked; it does not shortcut to the
-- end state, because a shortcut would leave §3b's drop untested forever.
--
-- ── FIDELITY OF claim_beta_invite ───────────────────────────────────────────
-- The body below is transcribed from
-- `pg_get_functiondef('public.claim_beta_invite__ungated(text)'::regprocedure)`
-- on 2026-08-14. Note it is defined here under the BARE name
-- `claim_beta_invite`, with `search_path` pinned. A9's retrofit in
-- 2026-08-11-authenticated-surface-lockdown.sql is what renames it to
-- `claim_beta_invite__ungated` and installs the `hr_rpc_gate`-calling wrapper
-- at the bare name — which is precisely the production layout:
--   claim_beta_invite(text)            → gate, then delegate     [authenticated]
--   claim_beta_invite__ungated(text)   → the body below          [postgres only]
-- So this file must NOT create the wrapper, and must NOT create the __ungated
-- name. Creating either would give two files one definition.
--
-- ROLLBACK: no-op on production (the file did nothing). On a fresh rebuild:
--   drop function if exists public.claim_beta_invite(text);
--   drop table if exists public.beta_invites cascade;
--
-- ── RECOMMENDATION, RECORDED HERE SO IT IS NOT LOST ─────────────────────────
-- At cutover, once the closed beta ends, `beta_invites` / `claim_beta_invite` /
-- `beta_invite_check` should be DROPPED, in one file, together with the two
-- client call sites — not left as dead authenticated surface. They are 3 of the
-- 47 client-callable RPCs Security still has to cover. If the launch is instead
-- a closed one, keep them and ROTATE the codes: production's 20 codes are 9–11
-- characters and memorable, and per the handoff, code entropy — not the rate
-- limit — is the load-bearing defence of the invite oracle.
-- ============================================================================

do $$
declare
  v_fresh boolean := to_regclass('public.beta_invites') is null;
begin
  if not v_fresh then
    raise notice 'dr-beta-invites-base: public.beta_invites already exists — no-op (this is the expected result on production, and it is what keeps A11 closed)';
    return;
  end if;

  raise notice 'dr-beta-invites-base: reconstructing public.beta_invites in its PRE-A11-lockdown shape; live-market-rls §3b closes it';

  create table public.beta_invites (
    code       text primary key,
    note       text,
    used_by    uuid references auth.users(id) on delete set null,
    used_at    timestamptz,
    created_at timestamptz not null default now()
  );

  alter table public.beta_invites enable row level security;

  -- ⚠ THIS POLICY IS VULNERABILITY A11. It is reproduced ONLY so that
  -- 2026-08-11-live-market-rls.sql §3b has the real pre-state to drop, which is
  -- the only way that drop is ever exercised on a rebuild. §3b refuses to run
  -- without `hearthrise.beta_invites_lockdown_ok = 'yes'`, so a rebuild that
  -- forgets the GUC gets a loud raise from that file, not a quiet hole here.
  create policy "invites world readable" on public.beta_invites
    for select using (true);
end $$;

-- The pre-A9 body, at the bare name. A9 renames this to __ungated and wraps it.
-- Guarded the same way: on production the wrapper already occupies this name and
-- `create or replace` here would OVERWRITE THE RATE GATE with an ungated body.
do $$
begin
  if to_regprocedure('public.claim_beta_invite(text)') is not null then
    raise notice 'dr-beta-invites-base: claim_beta_invite(text) already exists — no-op (on production this is A9''s gate wrapper; replacing it would delete the rate gate)';
    return;
  end if;

  execute $fn$
    create function public.claim_beta_invite(code_in text)
    returns json
    language plpgsql
    security definer
    set search_path to 'public'
    as $body$
    declare
      inv record;
      uid uuid := auth.uid();
    begin
      if uid is null then
        return json_build_object('ok', false, 'reason', 'Must be signed in');
      end if;
      select * into inv from beta_invites where code = code_in for update;
      if inv is null then
        return json_build_object('ok', false, 'reason', 'Invalid code');
      end if;
      if inv.used_by is not null then
        return json_build_object('ok', false, 'reason', 'Code already used');
      end if;
      update beta_invites set used_by = uid, used_at = now() where code = code_in;
      return json_build_object('ok', true);
    end;
    $body$
  $fn$;

  -- Supabase's default ACL grants EXECUTE to PUBLIC on every new function, and
  -- only a GLOBAL `alter default privileges` suppresses it (HANDOFF #4). Revoke
  -- first, then grant the one role that needs it — the 2026-08-11 lockdown
  -- discipline. A9 re-does this for the wrapper; doing it here means a rebuild
  -- is never briefly PUBLIC-executable between two files.
  revoke execute on function public.claim_beta_invite(text) from public;
  revoke execute on function public.claim_beta_invite(text) from anon;
  grant  execute on function public.claim_beta_invite(text) to authenticated;
end $$;

-- ── self-check: the commit gate ─────────────────────────────────────────────
do $$
declare
  v_missing text[] := '{}';
  v_cols    int;
begin
  if to_regclass('public.beta_invites') is null then
    raise exception 'dr-beta-invites-base: public.beta_invites does not exist after this file';
  end if;

  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'beta_invites'
     and column_name in ('code','note','used_by','used_at','created_at');
  if v_cols <> 5 then
    raise exception 'dr-beta-invites-base: expected 5 columns on beta_invites, found %', v_cols;
  end if;

  if not exists (select 1 from pg_class where oid = 'public.beta_invites'::regclass and relrowsecurity) then
    raise exception 'dr-beta-invites-base: row level security is not enabled on beta_invites';
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.beta_invites'::regclass and contype = 'p') then
    v_missing := v_missing || 'beta_invites_pkey';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.beta_invites'::regclass
                    and contype = 'f' and confrelid = 'auth.users'::regclass) then
    v_missing := v_missing || 'FK beta_invites.used_by -> auth.users';
  end if;

  -- The FUNCTION must resolve as a regprocedure, not merely by name.
  -- `to_regproc` with an argument list is always NULL (HANDOFF "HOW TO WORK ON
  -- THIS" #1, first instance of the always-null-probe family) — to_regprocedure
  -- is the form that actually resolves a signature.
  if to_regprocedure('public.claim_beta_invite(text)') is null then
    v_missing := v_missing || 'claim_beta_invite(text)';
  end if;

  if array_length(v_missing, 1) is not null then
    raise exception 'dr-beta-invites-base: missing after apply: %', array_to_string(v_missing, ', ');
  end if;

  -- Anti-regression: this file must never leave claim_beta_invite executable by
  -- anon or PUBLIC. On production the assertion runs against A9's wrapper, so it
  -- is a live check of the deployed grant, not only of what this file wrote.
  if has_function_privilege('anon', 'public.claim_beta_invite(text)', 'execute') then
    raise exception 'dr-beta-invites-base: claim_beta_invite(text) is anon-executable — an anonymous caller could burn invite codes';
  end if;

  raise notice 'dr-beta-invites-base: OK';
end $$;
