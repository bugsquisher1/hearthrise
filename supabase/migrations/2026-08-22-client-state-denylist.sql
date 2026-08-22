-- ============================================================================
-- 2026-08-22-client-state-denylist.sql — HARDEN client_state AGAINST AUTHORITY KEYS.
--
-- WHY (a real authority-forge vector caught by the gold-site census): the
-- blob-retire capstone HYDRATES player_state.client_state straight into the
-- client's G on load. `hr_put_client_state` merged the patch VERBATIM with no
-- field filtering, and RLS lets a player write their OWN row — so a malicious
-- client could store `{gold: 1e12, skills: {...}, inventory: {...}}` in
-- client_state, and under arm the hydrate would splat those AUTHORITY fields into
-- G. The record framework still owns the real balances, but a forged authority
-- value LIVING in G is a latent hole (any direct read, a leaderboard snapshot, a
-- future path) — exactly what the gold census forbids.
--
-- The client fix is the allowlist in src/net/client-state.js hydrateInto (writes
-- ONLY RESIDUE_FIELDS). THIS is the server half of defense-in-depth: client_state
-- must never even STORE a server-owned field, so the hydrate can't be poisoned
-- even if the client allowlist regressed.
--
-- WHAT: redefine hr_put_client_state__ungated to REJECT a patch that names any
-- AUTHORITY key at the top level (returns {ok:false, error:'forbidden_field'}).
-- Everything else about the function is byte-identical to 2026-08-28-client-state.sql
-- §4. `create or replace` does NOT alter the function's ACL, so the existing
-- revoke/grant (authenticated-only, __ungated locked out) is preserved untouched.
--
-- IDEMPOTENT: pure create-or-replace + a transactional self-check that RAISEs on
-- failure and rolls itself back. Safe to re-apply to live any number of times.
--
-- NOTE ON marks: `marks` is authority (server-owned via the record) but lives
-- NESTED under the residue object `bountyHunter`, so the client never sends it as
-- a top-level key (buildResiduePatch strips it). It is on the deny-list anyway, so
-- a top-level `marks` is refused; the nested case is defended client-side
-- (hydrateInto deletes bag marks) and by the fact that the marks READ goes through
-- the record, not client_state.
-- ============================================================================

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
  -- ── THE AUTHORITY DENY-LIST ──────────────────────────────────────────────
  -- Every server-owned field, in BOTH its client (camelCase) and server
  -- (snake_case) spellings, because a patch key is whatever the client sends.
  -- client_state is a SELF-ONLY residue store; none of these may live in it.
  v_deny  constant text[] := array[
    'gold','gems','hearth_tokens','hearthTokens',
    'skills','inventory','bank','equipment','rooms',
    'marks','restedXp','rested_xp','restedAt','rested_at',
    'farmPlots','farm','companions','offlineBudget'
  ];
  v_key   text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'missing_idem'); end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_patch'); end if;
  if octet_length(p_patch::text) > v_cap then
    return jsonb_build_object('ok', false, 'error', 'patch_too_large', 'cap', v_cap); end if;

  -- ── REJECT ANY AUTHORITY KEY (the new deny-list) ─────────────────────────
  -- A residue store must never hold a server-owned field. Refuse the whole
  -- patch (do not silently strip — a client sending gold here is either forging
  -- or badly broken, and a loud refusal surfaces both).
  foreach v_key in array v_deny loop
    if p_patch ? v_key then
      return jsonb_build_object('ok', false, 'error', 'forbidden_field', 'field', v_key);
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  select result into v_prev from public.player_intents
    where user_id = v_uid and intent_id = p_idem;
  if v_prev is not null then return v_prev || jsonb_build_object('replayed', true); end if;

  select coalesce(client_state, '{}'::jsonb) into v_cur from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot); end if;

  v_new := v_cur || p_patch;
  if octet_length(v_new::text) > v_cap then
    return jsonb_build_object('ok', false, 'error', 'state_too_large', 'cap', v_cap); end if;

  update public.player_state set client_state = v_new, updated_at = now()
    where user_id = v_uid and slot = v_slot;

  v_prev := jsonb_build_object('ok', true, 'slot', v_slot, 'bytes', octet_length(v_new::text));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_slot, 'client_state_put', v_prev, now())
    on conflict (user_id, intent_id) do nothing;
  return v_prev;
end $$;

-- Re-state the lockdown (create-or-replace preserves the existing ACL at runtime,
-- but the repo convention — and the grant-hygiene lint — is that every
-- restatement re-states the revoke). __ungated is called only by the SECURITY
-- DEFINER wrapper; no client role may execute it.
revoke execute on function public.hr_put_client_state__ungated(int, jsonb, uuid) from public;
revoke execute on function public.hr_put_client_state__ungated(int, jsonb, uuid) from anon, authenticated, service_role;

-- ── SELF-CHECK (transactional; RAISEs on failure, rolls itself back) ─────────
-- Proves the deny-list is live and the function source carries it. Grants are
-- asserted unchanged: authenticated may call the wrapper, __ungated is locked out.
do $$
declare
  v_src text;
begin
  select pg_get_functiondef('public.hr_put_client_state__ungated(int,jsonb,uuid)'::regprocedure) into v_src;
  if position('forbidden_field' in v_src) = 0 then
    raise exception 'SELFCHECK: the deny-list did not install (no forbidden_field in source)'; end if;
  if position('''gold''' in v_src) = 0 or position('''skills''' in v_src) = 0 then
    raise exception 'SELFCHECK: the deny-list is missing core authority keys'; end if;
  -- grants unchanged: the gated wrapper is callable by authenticated, __ungated is not.
  if not has_function_privilege('authenticated','public.hr_put_client_state(int,jsonb,uuid)','execute') then
    raise exception 'SELFCHECK: authenticated lost execute on hr_put_client_state'; end if;
  if has_function_privilege('authenticated','public.hr_put_client_state__ungated(int,jsonb,uuid)','execute') then
    raise exception 'SELFCHECK: __ungated is unexpectedly callable by authenticated'; end if;
  raise notice 'client-state deny-list: installed, grants unchanged.';
end $$;
