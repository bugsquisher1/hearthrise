-- ============================================================================
-- 2026-08-28-client-state.sql — A SERVER HOME FOR THE NON-AUTHORITY RESIDUE.
--
-- ⚠ NOT a money/authority surface. This migration adds a VERBATIM self-only
--   store. A forged value here can never cross into another player's economy or
--   ranking (CLAUDE.md's target property), so it deliberately does NOT use the
--   fail-closed record framework (src/net/record.js) — it needs a HOME so the
--   client-authored save blob can eventually be retired, nothing more.
--
-- ── WHAT THIS DOES ──────────────────────────────────────────────────────────
-- The server-authority program moved every AUTHORITY field (gold, gems, skills,
-- inventory, bank, equipment, rooms, marks, rested XP, farming, companions) into
-- real tables written only by SECURITY DEFINER RPCs. What remains in the client-
-- authored snapshot() blob is NON-AUTHORITY residue: self-only bounty-hunter
-- state (minus marks), display counters (stats), the achievement chronicle, the
-- active-loadout pref (activeStyle), the equipped-food pointer (foodSlot), and a
-- long tail of other self-only prefs/logs (see the census in the handoff). None
-- of it is tradeable, rankable or contributable.
--
-- This gives that residue a server home so the blob can be retired at the
-- capstone WITHOUT stretching the fail-closed record framework over data that
-- does not need it:
--   1. player_state.client_state jsonb NOT NULL DEFAULT '{}' — a VERBATIM store
--      the server PERSISTS but does NOT compute authority on. (add-if-not-exists)
--   2. hr_state_of PROJECTS it back as a top-level `client_state` sibling
--      (programmatic patch — additive, faithful superset, NOT an
--      HR_STATE_OF_CHAIN member).
--   3. hr_put_client_state(p_slot, p_patch, p_idem) — a client-callable SECURITY
--      DEFINER RPC that MERGES the patch into player_state.client_state under the
--      per-character advisory lock, server clock, idempotent (player_intents),
--      rate-gated, size-bounded. NO client write policy on player_state.
--
-- ── WHY A MERGE, AND WHY IDEMPOTENCY IS CHEAP HERE ──────────────────────────
-- The patch is a shallow jsonb merge (`||`) of top-level keys, not a delta. A
-- MERGE of an identical patch is naturally idempotent (unlike `gold -= 5`), so a
-- replay is inherently safe; the p_idem row is belt-and-suspenders and the
-- returned `replayed` flag. The write is NOT journalled to player_ledger on
-- purpose — a verbatim store saved on the client's autosave cadence would be
-- exactly the per-tick ledger explosion CLAUDE.md invariant #6 warns against
-- (game_events hit 1.6M rows from 6 players). The player_intents row is the
-- bounded record of the call.
--
-- ── SIZE BOUND ──────────────────────────────────────────────────────────────
-- Both the incoming patch AND the merged result are capped at 256 KiB
-- (262144 bytes of the jsonb text form). An oversized patch is refused
-- (patch_too_large / state_too_large) so the column cannot be an abuse vector.
--
-- ── IDEMPOTENCY + CONCURRENCY ───────────────────────────────────────────────
-- p_idem (uuid) is stored as a player_intents row; a replay returns the prior
-- result with replayed:true and re-merges nothing. The body runs under the SAME
-- per-character advisory lock hr_apply / hr_bounty_spend take, so a put can never
-- race an accrual settle on one character (no read-modify-write across a hop).
-- The record `version` is deliberately NOT bumped — client_state is outside the
-- record framework's monotonic version, and bumping it would churn the
-- leaderboard matview refresh for a self-only pref write.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive. Reverting means DROP FUNCTION hr_put_client_state(int,jsonb,uuid) +
-- __ungated, and (optionally) re-applying the prior hr_state_of / hr_rpc_gate
-- bodies — but because both are patched PROGRAMMATICALLY and idempotently, the
-- projection/bucket can simply be left in place; nothing reads client_state
-- until the client capstone flips CLIENT_STATE_SERVER_BACKED. The column and
-- every stored value are untouched by a revert.
--
-- ── PROGRAMMATIC PATCH (NOT chain-governed) ─────────────────────────────────
-- hr_state_of and hr_rpc_gate are patched via pg_get_functiondef + a guarded
-- string replace, exactly like 2026-08-22-rested-record.sql / 2026-08-27-bank-
-- store.sql. So this file re-defines them at RUNTIME but carries NO literal
-- create-or-replace header for either function in its authored text (the
-- SETTLE-SQL / chain guards scan for that header, and a programmatic patch is
-- deliberately not one) and is NOT a member of HR_STATE_OF_CHAIN / the rate-gate
-- chain. The patches are NO-OPs on re-apply.
-- ============================================================================

-- ── 0. PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state')   is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_intents') is null then raise exception 'player_intents missing'; end if;
  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate missing — apply the rate-gate chain first'; end if;
  if to_regprocedure('public.hr_state_of(uuid, int)') is null then
    raise exception 'hr_state_of missing — apply 2026-08-11-apply-engine.sql first'; end if;
end $$;

-- ── 1. THE COLUMN — verbatim self-only store, add-if-not-exists ──────────────
alter table public.player_state
  add column if not exists client_state jsonb not null default '{}'::jsonb;

-- ── 2. hr_state_of — PROGRAMMATIC additive patch (project client_state) ──────
-- Insert a top-level `client_state` key before the stable `'total_level',`
-- anchor. Idempotent: skipped if already projected.
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.hr_state_of(uuid, int)'::regprocedure) into v_src;
  if position('''client_state''' in v_src) > 0 then
    raise notice 'hr_state_of already projects client_state — patch skipped'; return;
  end if;
  if position('''total_level'', public.hr_total_level(p_user, v_st.slot)' in v_src) = 0 then
    raise exception 'hr_state_of patch anchor (total_level) not found — refusing to patch blind'; end if;
  v_new := replace(v_src,
    '''total_level'', public.hr_total_level(p_user, v_st.slot)',
    '''client_state'', coalesce(v_st.client_state, ''{}''::jsonb),' || chr(10) ||
    '    ''total_level'', public.hr_total_level(p_user, v_st.slot)');
  execute v_new;
end $$;
-- Re-assert the projection's ACL (create-or-replace preserves it, but be explicit).
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 3. hr_rpc_gate — PROGRAMMATIC additive patch (client_state_put bucket) ───
-- Add a new 60/min when-arm just before the case's `else return false`.
-- Idempotent: skipped if the bucket already exists.
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  if position('''client_state_put''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits client_state_put — patch skipped'; return;
  end if;
  if position('else return false;' in v_src) = 0 then
    raise exception 'hr_rpc_gate patch anchor (else return false) not found — refusing to patch blind'; end if;
  -- Replace only the FIRST occurrence (the case-arm terminator) by anchoring on
  -- the `end case;` that immediately follows it.
  if position('else return false;' || chr(10) || '  end case;' in v_src) = 0 then
    raise exception 'hr_rpc_gate case terminator anchor not found — refusing to patch blind'; end if;
  v_new := replace(v_src,
    'else return false;' || chr(10) || '  end case;',
    'when ''client_state_put'' then v_limit := 60;' || chr(10) ||
    '    else return false;' || chr(10) || '  end case;');
  execute v_new;
end $$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 4. hr_put_client_state__ungated — the verbatim MERGE ─────────────────────
create or replace function public.hr_put_client_state__ungated(
  p_slot int, p_patch jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, 0);
  v_cur   jsonb;
  v_new   jsonb;
  v_prev  jsonb;
  v_cap   constant int := 262144;   -- 256 KiB
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'missing_idem'); end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_patch'); end if;
  if octet_length(p_patch::text) > v_cap then
    return jsonb_build_object('ok', false, 'error', 'patch_too_large', 'cap', v_cap); end if;

  -- Serialise this character — the SAME advisory key hr_apply / hr_bounty_spend
  -- take, so a put can never race an accrual settle on one character.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- IDEMPOTENCY: a completed put with this idem re-merges nothing.
  select result into v_prev from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_prev is not null then return v_prev || jsonb_build_object('replayed', true); end if;

  select coalesce(client_state, '{}'::jsonb) into v_cur from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot); end if;

  -- SHALLOW top-level MERGE. Naturally idempotent for an identical patch.
  v_new := v_cur || p_patch;
  if octet_length(v_new::text) > v_cap then
    return jsonb_build_object('ok', false, 'error', 'state_too_large', 'cap', v_cap); end if;

  -- NB: version is deliberately NOT bumped (see header) — self-only pref write.
  update public.player_state set client_state = v_new, updated_at = now()
    where user_id = v_uid and slot = v_slot;

  v_prev := jsonb_build_object('ok', true, 'slot', v_slot, 'bytes', octet_length(v_new::text));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_slot, 'client_state_put', v_prev, now())
    on conflict (user_id, intent_id) do nothing;
  return v_prev;
end $$;

-- ── 5. Gated wrapper + grants (revoke before grant) ─────────────────────────
create or replace function public.hr_put_client_state(
  p_slot int, p_patch jsonb, p_idem uuid)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('client_state_put') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_put_client_state__ungated($1, $2, $3);
end $w$;

revoke execute on function public.hr_put_client_state__ungated(int,jsonb,uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_put_client_state(int,jsonb,uuid)           from public, anon, authenticated, service_role;
grant  execute on function public.hr_put_client_state(int,jsonb,uuid)           to authenticated;

-- ── 5b. Grant-hygiene baseline (if present) ─────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied'; return; end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_put_client_state' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_put_client_state', 'p_slot integer, p_patch jsonb, p_idem uuid',
     'authenticated', 'added 2026-08-28: verbatim self-only client_state merge (non-authority residue home)');
end $$;

-- ── 6. SELF-VERIFYING COMMIT GATE ───────────────────────────────────────────
do $$
declare
  v      jsonb; v_st jsonb;
  v_uid  constant uuid := '000000d0-0000-0000-0000-0000000000d0';
  v_slot constant int  := 0;
  v_i1 uuid; v_i2 uuid; v_state text; v_gate text;
  v_big jsonb; v_cs jsonb;
begin
  -- (a) hr_state_of PROJECTS client_state; hr_rpc_gate admits the bucket.
  select prosrc into v_state from pg_proc where proname='hr_state_of';
  select prosrc into v_gate  from pg_proc where proname='hr_rpc_gate';
  if position('''client_state''' in v_state) = 0 then
    raise exception 'GATE(a): hr_state_of does not project client_state'; end if;
  if position('''marks'', v_st.marks' in v_state) = 0 then
    raise exception 'GATE(a): the client_state patch DROPPED the marks projection'; end if;
  if position('''bank''' in v_state) = 0 then
    raise exception 'GATE(a): the client_state patch DROPPED the bank projection'; end if;
  if position('''client_state_put''' in v_gate) = 0 then
    raise exception 'GATE(a): hr_rpc_gate does not admit client_state_put'; end if;
  if position('''bank_move''' in v_gate) = 0 or position('''hr_bounty_spend''' in v_gate) = 0 then
    raise exception 'GATE(a): the gate patch DROPPED an existing bucket'; end if;

  -- (b) WRAPPER authenticated-only; the inner revoked from clients; anon shut out.
  if has_function_privilege('authenticated','public.hr_put_client_state__ungated(int,jsonb,uuid)','execute') then
    raise exception 'GATE(b): the __ungated inner is client-executable — the gate is decoration'; end if;
  if not has_function_privilege('authenticated','public.hr_put_client_state(int,jsonb,uuid)','execute') then
    raise exception 'GATE(b): the wrapper is not callable by authenticated — the feature is dead'; end if;
  if has_function_privilege('anon','public.hr_put_client_state(int,jsonb,uuid)','execute') then
    raise exception 'GATE(b): the put wrapper is anon-executable'; end if;
  if has_function_privilege('hr_engine','public.hr_put_client_state(int,jsonb,uuid)','execute') then
    raise exception 'GATE(b): the put wrapper is hr_engine-executable — must be client-only'; end if;

  -- (c) NO CLIENT WRITE on player_state — RLS only, no non-SELECT grant.
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_state'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(c): a client write grant exists on player_state — client_state is client-forgeable via PATCH'; end if;

  -- (d) EXECUTED behaviour — discarded subtxn, zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 0, 0, 1)
      on conflict (user_id, slot) do update set client_state = '{}'::jsonb, version = 1;

    -- merge #1: {a:1,b:2}
    v_i1 := gen_random_uuid();
    v := public.hr_put_client_state__ungated(v_slot, '{"a":1,"b":2}'::jsonb, v_i1);
    if coalesce(v->>'ok','') <> 'true' then raise exception 'GATE(d): put#1 not ok: %', v; end if;
    select client_state into v_cs from public.player_state where user_id=v_uid and slot=v_slot;
    if v_cs <> '{"a":1,"b":2}'::jsonb then raise exception 'GATE(d): put#1 wrong state: %', v_cs; end if;

    -- merge #2: {b:9,c:3} — shallow merge overrides b, keeps a, adds c.
    v_i2 := gen_random_uuid();
    v := public.hr_put_client_state__ungated(v_slot, '{"b":9,"c":3}'::jsonb, v_i2);
    select client_state into v_cs from public.player_state where user_id=v_uid and slot=v_slot;
    if v_cs <> '{"a":1,"b":9,"c":3}'::jsonb then raise exception 'GATE(d): merge wrong: %', v_cs; end if;

    -- replay of idem #2: re-merges nothing, flagged replayed.
    v := public.hr_put_client_state__ungated(v_slot, '{"b":9,"c":3}'::jsonb, v_i2);
    if coalesce((v->>'replayed')::boolean,false) is not true then
      raise exception 'GATE(d): replay not idempotent: %', v; end if;

    -- hr_state_of projects the stored client_state.
    v_st := public.hr_state_of(v_uid, v_slot);
    if (v_st->'client_state') <> '{"a":1,"b":9,"c":3}'::jsonb then
      raise exception 'GATE(d): hr_state_of client_state = % (expected merged)', v_st->'client_state'; end if;

    -- bad patch (array / scalar) refused; state unchanged.
    v := public.hr_put_client_state__ungated(v_slot, '[1,2]'::jsonb, gen_random_uuid());
    if v->>'error' <> 'bad_patch' then raise exception 'GATE(d): array patch not refused: %', v; end if;

    -- OVERSIZED patch refused; state unchanged.
    select jsonb_object_agg('k'||g, repeat('x', 400)) into v_big
      from generate_series(1, 800) g;   -- ~ >256KiB of text
    v := public.hr_put_client_state__ungated(v_slot, v_big, gen_random_uuid());
    if v->>'error' <> 'patch_too_large' then raise exception 'GATE(d): oversized patch not refused: %', v; end if;
    select client_state into v_cs from public.player_state where user_id=v_uid and slot=v_slot;
    if v_cs <> '{"a":1,"b":9,"c":3}'::jsonb then raise exception 'GATE(d): a refused put mutated state: %', v_cs; end if;

    raise exception using errcode = 'HR820', message = 'client-state §6 complete — rolling back';
  exception when sqlstate 'HR820' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state   where user_id=v_uid)
     or exists (select 1 from public.player_intents where user_id=v_uid)
     or exists (select 1 from auth.users where id=v_uid) then
    raise exception 'GATE: §6 LEAKED a probe row'; end if;

  raise notice 'client-state: column added, hr_state_of projects client_state (marks+bank intact), '
               'hr_rpc_gate admits client_state_put (bank_move/bounty intact), wrapper authenticated-only + '
               'inner/anon/engine shut out, no client write on player_state, merge is shallow + idempotent, '
               'bad/oversized patch refused — all green';
end $$;
