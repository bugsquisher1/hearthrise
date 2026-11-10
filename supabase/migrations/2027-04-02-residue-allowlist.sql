-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-02-residue-allowlist.sql — THE SERVER'S RESIDUE IS AN ALLOWLIST TOO
--   (lane/c-server-debt, backend-architect, 2026-11-10; architecture audit 2026-11-09 part 2, F4, P2: CLAUDE.md §6 "the
--   residue is an ALLOWLIST" held only in the browser; the server kept any key not on a deny list, up to 256 KiB a hero,
--   and the baseline lane's test stored a 250 KiB junk key).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §2. On the EA Security list (a client verb's body; it moves no value).
-- ORDER: after 2027-04-02-residue-fields.generated.sql (the list and the total; §0 refuses without them). It touches none
-- of hr_apply, hr_state_of, hr_load or the settle path, and shares no object with 2027-03-27 / -28 / -29 / -30 / -31 or
-- with this lane's rate and town files. DB-ONLY: no hr-accrue change. The client already sends only its listed fields
-- (src/session/character-session.js setResidue); no client change is needed for it to apply.
--
-- ── THE RULE (one rule, where there were two lists) ──────────────────────────
-- A put is a patch {field: value}. EVERY field must be on hr_residue_fields (generated from the client's own
-- RESIDUE_FIELDS by tools/gen-residue-fields.mjs, so the two cannot drift), and each value's JSON text must fit that
-- field's bound. Then the patch is laid over the LISTED fields already stored, and the result must fit the total
-- (hr_residue_total_bytes). Anything else is refused WHOLE, before the row is read:
--     unknown_field    a key no list names (the field named)       field_too_large  a value over its field's bound
--     patch_too_large  the patch itself over the total             state_too_large  the merged bag over the total
-- A REFUSED PUT WRITES NOTHING: the stored bag is the same row version it was. It IS journalled: the gated wrapper
-- hr_put_client_state (not restated here) passes every refusal to hr_note_rejection, one hr_rejections row a hero, day
-- and code, the field in its detail. That wrapper and its rate gate (client_state_put) are untouched.
--
-- ── WHAT THIS REPLACES ───────────────────────────────────────────────────────
--   hr_put_client_state__ungated RESTATED WHOLE from 2026-09-23-client-state-retired-fields.sql's image (§0 pins it).
--   GONE: the authority deny list (gold, gems, skills, inventory, ...: 18 names) and the retired list (buffs, streak, ...:
--   10 names stripped and journalled `retired_field`). Both were lists of what may NOT be stored; every name on them is
--   simply not on the allowlist now and reads `unknown_field`. `forbidden_field`, `retired_field` and the answer's
--   `stripped` key are no longer produced (no client file reads them). The scrapped client whose tabs the strip was
--   written for is gone (2026-10-17), and no back-compat is owed (CLAUDE.md §1).
--   KEPT, line for line: not_signed_in, missing_idem, bad_patch, the character lock, the per-(key, intent, slot) replay,
--   no_character, the answer {ok, slot, bytes} and the intent row.
--   NEW: a key stored under the old rule that no list names is NOT carried into the next accepted value. Nothing reads
--   it (the client hydrates only its listed fields), so the hero's own next put tidies its own bag; no migration or
--   admin statement touches a player's row (CLAUDE.md §2), and a hero that never puts again keeps its old bag unread.
--
-- ── NOT HERE (waits on 2027-03-29, level-from-server) ───────────────────────
-- hr_state_of still projects the whole stored bag into every envelope. Projecting only the listed fields is one line in
-- hr_state_of, which that lane holds; listed for sequencing after it lands. Until then an old junk key still rides the
-- envelope of a hero that has not put since this file (the client ignores it).
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- Narrows the one client write that stores free-form data: from "any key but 28, 256 KiB" to "18 named fields, each
-- bounded, 80 KiB in all". The server still does not read the values (they gate and spend nothing, §6); the bound is on
-- what a forged client can make the server keep and ship back to itself. No new function, grant or policy.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- Unchanged: the per-character advisory lock, `for update` on the hero's row, one intent row a key; a retry of a decided
-- key answers that decision. The allowlist reads (one PK read a patch key, at most 18) happen before the lock. A second
-- apply: §0 accepts this file's own image; `create or replace` (byte-identical).
--
-- ── COST AT 100x ────────────────────────────────────────────────────────────
-- Per put: up to 18 PK reads of an 18-row table and one pass over the stored bag's top-level keys; a put is debounced by
-- the client (one a burst). Storage: at most 80 KiB a hero where it was 256 KiB (8,000 heroes: 640 MB worst, down from
-- 2 GB; at today's 9.9 KB median, 79 MB). No row, index or column.
--
-- REVERSIBILITY: re-apply 2026-09-23-client-state-retired-fields.sql's hr_put_client_state__ungated (the pre-image §0
-- pins). A bag tidied by a put under this file stays tidy (only unlisted keys were dropped). No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hr_residue_fields') is null or to_regprocedure('public.hr_residue_total_bytes()') is null then
    raise exception 'PRECONDITION: the residue allowlist is absent (2027-04-02-residue-fields.generated.sql first)'; end if;
  if not exists (select 1 from public.hr_residue_fields) or public.hr_residue_total_bytes() is null then
    raise exception 'PRECONDITION: the residue allowlist is empty: every put would be refused'; end if;
  if to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null then
    raise exception 'PRECONDITION: hr_intent_replay is absent'; end if;
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_put_client_state__ungated(integer,jsonb,uuid)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 not in ('17ebca77a2158d319b07a7b32f465317', '23a4a76c1945a6d7307031f1c3ee2ce5') then
    raise exception 'PIN: hr_put_client_state__ungated is neither 2026-09-23-client-state-retired-fields.sql''s image (17ebca77a2158d319b07a7b32f465317) nor this file''s: md5 % - another file moved it', v_md5; end if;
  -- the gated wrapper journals every refusal of this body: it must still be the one that does
  if position('hr_note_rejection(''hr_put_client_state'', p_slot, public.hr_put_client_state__ungated(' in
       (select prosrc from pg_proc where oid = 'public.hr_put_client_state(integer,jsonb,uuid)'::regprocedure)) = 0 then
    raise exception 'PIN: hr_put_client_state no longer journals its refusals through hr_note_rejection'; end if;
end $mig$;

-- ── §1 THE PUT, RESTATED WHOLE ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_put_client_state__ungated(p_slot integer, p_patch jsonb, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_slot  int  := coalesce(p_slot, 0);
  v_cur   jsonb;
  v_new   jsonb;
  v_prev  jsonb;
  -- RESIDUE-ALLOWLIST (2027-04-02-residue-allowlist.sql): the total and each field's bound are the generated catalogue's
  -- (hr_residue_fields, hr_residue_total_bytes: src/session/residue.js). The deny list and the retired list are gone:
  -- a key is stored when the list names it, and only then.
  v_cap   int := public.hr_residue_total_bytes();
  v_key   text;
  v_max   int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null then return jsonb_build_object('ok', false, 'error', 'missing_idem'); end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_patch'); end if;
  if v_cap is null then return jsonb_build_object('ok', false, 'error', 'catalogue_missing'); end if;
  -- The whole patch first, so nothing below walks a megabyte of keys.
  if octet_length(p_patch::text) > v_cap then
    return jsonb_build_object('ok', false, 'error', 'patch_too_large', 'cap', v_cap); end if;

  -- ── THE ALLOWLIST ────────────────────────────────────────────────────────
  -- Every key is a field the list names, and its value fits that field's bound. One key that is not refuses the WHOLE
  -- patch: nothing is stored, nothing is stripped, and the stored bag is not read. An honest client sends only its
  -- listed fields, so a refusal here is a forged request or a client shipped ahead of its catalogue; the wrapper
  -- journals it with the field named.
  for v_key in select k from jsonb_object_keys(p_patch) k order by k loop
    select f.max_bytes into v_max from public.hr_residue_fields f where f.field = v_key;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'unknown_field', 'field', left(v_key, 64)); end if;
    if octet_length((p_patch -> v_key)::text) > v_max then
      return jsonb_build_object('ok', false, 'error', 'field_too_large', 'field', v_key, 'cap', v_max); end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY.
  -- player_intents is ONE namespace for every verb in this database, so a key
  -- claimed by another intent (or the same intent on another slot) must be
  -- REFUSED, not answered with that intent's decision. Same comparison hr_apply
  -- has carried since apply-engine §S6; the helper is the one copy of the rule.
  -- A NULL answer means "no cached decision" and the body proceeds as before.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, 'client_state_put') into v_prev;
  if v_prev ->> 'error' = 'intent_mismatch' then return v_prev; end if;
  if v_prev is not null then return v_prev || jsonb_build_object('replayed', true); end if;

  select coalesce(client_state, '{}'::jsonb) into v_cur from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot); end if;

  -- WHAT IS KEPT: the listed fields already stored, then the patch over them. A key stored under the old deny-list
  -- rule that no list names is not carried into the new value (nothing reads it); a put that is refused never gets
  -- here, so it never drops one.
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_new
    from jsonb_each(case when jsonb_typeof(v_cur) = 'object' then v_cur else '{}'::jsonb end) e
   where exists (select 1 from public.hr_residue_fields f where f.field = e.key);
  v_new := v_new || p_patch;
  if octet_length(v_new::text) > v_cap then
    return jsonb_build_object('ok', false, 'error', 'state_too_large', 'cap', v_cap); end if;

  update public.player_state set client_state = v_new, updated_at = now()
    where user_id = v_uid and slot = v_slot;

  v_prev := jsonb_build_object('ok', true, 'slot', v_slot, 'bytes', octet_length(v_new::text));
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_slot, 'client_state_put', v_prev, now())
    on conflict (user_id, intent_id) do nothing;
  return v_prev;
end $function$;

revoke all on function public.hr_put_client_state__ungated(integer, jsonb, uuid) from public, anon, authenticated, service_role;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED through the gated wrapper a client calls, every probe row rolled back ──
do $chk$
declare
  c_u   constant uuid := '000000c0-0000-4000-a000-0000402c0001';
  c_fn  constant text := 'public.hr_put_client_state__ungated(integer,jsonb,uuid)';
  c_put constant text := 'public.hr_put_client_state(integer,jsonb,uuid)';
  k     text := '000000c0-0000-4000-a000-0000402c';
  v jsonb; r text; v_md5 text; v_tid tid; v_cap int := public.hr_residue_total_bytes(); v_row public.hr_rejections%rowtype; v_bag jsonb;
  v_f1 text; v_m1 int;
begin
  -- (a) THE SHAPE: the body is server-only behind its gated wrapper; a signed-in client asks the wrapper, nobody else does.
  foreach r in array array['anon', 'authenticated', 'service_role', 'hr_engine'] loop
    if has_function_privilege(r, c_fn, 'execute') then raise exception 'residue-allowlist §2(a): % can execute the ungated put', r; end if;
  end loop;
  if not has_function_privilege('authenticated', c_put, 'execute') or has_function_privilege('anon', c_put, 'execute') then
    raise exception 'residue-allowlist §2(a): the gated put''s grants moved'; end if;
  if not exists (select 1 from pg_proc p where p.oid = c_fn::regprocedure and p.prosecdef and p.proconfig @> array['search_path=public, pg_catalog']) then
    raise exception 'residue-allowlist §2(a): the put is not a security definer with a pinned search_path'; end if;
  perform public.hr_assert_grant_hygiene(true);
  -- the smallest bound on the list, for the per-field probe
  select f.field, f.max_bytes into v_f1, v_m1 from public.hr_residue_fields f order by f.max_bytes, f.field limit 1;

  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (c_u, 'Probe Residue') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'residue-allowlist §2 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'residue-allowlist §2-harness: hr_create_character(0) refused: %', v; end if;
    delete from public.hr_rejections where user_id = c_u;

    -- (b) AN HONEST PUT: listed fields, stored as sent, the answer {ok, slot, bytes} and nothing else.
    v := public.hr_put_client_state(0, jsonb_build_object('townZoom', jsonb_build_object('z', 2, 'at', 5), 'panelAlpha', 80), (k || '0001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select array_agg(x order by x) from jsonb_object_keys(v) x) is distinct from array['bytes', 'ok', 'slot'] then
      raise exception 'residue-allowlist §2(b): an honest put answered %', v; end if;
    select ps.client_state, ps.ctid into v_bag, v_tid from public.player_state ps where ps.user_id = c_u and ps.slot = 0;
    if v_bag is distinct from '{"townZoom": {"z": 2, "at": 5}, "panelAlpha": 80}'::jsonb then
      raise exception 'residue-allowlist §2(b): the honest put stored %', v_bag; end if;

    -- (c) ★ A KEY NO LIST NAMES refuses the WHOLE patch, the honest field beside it too: nothing stored, the row the same
    --     version, and the refusal journalled with the field. An old authority name and an old retired name read the same.
    foreach r in array array['junk', 'gold', 'inventory', 'buffs', 'hudlayout', ''] loop
      perform set_config('hearthrise.rejection_noted', '', true);   -- one transaction here, one request each in play
      delete from public.hr_rate_counters where user_id = c_u;
      v := public.hr_put_client_state(0, jsonb_build_object('panelAlpha', 60, r, 'x'), gen_random_uuid());
      if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'unknown_field' or v->>'field' is distinct from r or v ? 'stripped' then
        raise exception 'residue-allowlist §2(c): a put naming "%" answered %', r, v; end if;
      if (select ps.ctid from public.player_state ps where ps.user_id = c_u and ps.slot = 0) is distinct from v_tid then
        raise exception 'residue-allowlist §2(c): a refused put (key "%") wrote the hero''s row', r; end if;
    end loop;
    select * into v_row from public.hr_rejections where user_id = c_u and code = 'unknown_field';
    if not found or v_row.n <> 6 or v_row.slot <> 0 or not (v_row.verbs ? 'hr_put_client_state') or v_row.severity <> 'normal' then
      raise exception 'residue-allowlist §2(c): six refusals are not one journalled row of the put: %', to_jsonb(v_row); end if;
    if exists (select 1 from public.hr_rejections where user_id = c_u and code in ('forbidden_field', 'retired_field')) then
      raise exception 'residue-allowlist §2(c): an old list still answers'; end if;

    -- (d) ★ A LISTED FIELD OVER ITS OWN BOUND: field_too_large, the bound named, nothing stored.
    perform set_config('hearthrise.rejection_noted', '', true);
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_put_client_state(0, jsonb_build_object(v_f1, repeat('x', v_m1)), gen_random_uuid());   -- the quotes make it v_m1 + 2 bytes
    if v->>'error' is distinct from 'field_too_large' or v->>'field' is distinct from v_f1 or (v->>'cap')::int is distinct from v_m1 then
      raise exception 'residue-allowlist §2(d): a % of % bytes (bound %) answered %', v_f1, v_m1 + 2, v_m1, v; end if;
    v := public.hr_put_client_state(0, jsonb_build_object(v_f1, repeat('x', v_m1 - 2)), (k || '0002')::uuid);       -- exactly at the bound
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'residue-allowlist §2(d): a % exactly at its bound answered %', v_f1, v; end if;
    --     THE WHOLE PATCH OVER THE TOTAL is refused before a key is read.
    perform set_config('hearthrise.rejection_noted', '', true);
    v := public.hr_put_client_state(0, jsonb_build_object('bagSeen', repeat('x', v_cap)), gen_random_uuid());
    if v->>'error' is distinct from 'patch_too_large' or (v->>'cap')::int is distinct from v_cap then
      raise exception 'residue-allowlist §2(d): a patch over the total answered %', v; end if;
    --     THE MERGED BAG OVER THE TOTAL: every field inside its own bound, the sum past the total; the last one is refused
    --     state_too_large and the bag keeps what it held.
    declare v_f record; v_sum int := 0; v_hit boolean := false;
    begin
      for v_f in select f.field, f.max_bytes from public.hr_residue_fields f order by f.max_bytes desc, f.field loop
        perform set_config('hearthrise.rejection_noted', '', true);
        delete from public.hr_rate_counters where user_id = c_u;
        select ps.ctid into v_tid from public.player_state ps where ps.user_id = c_u and ps.slot = 0;
        v := public.hr_put_client_state(0, jsonb_build_object(v_f.field, repeat('y', v_f.max_bytes - 2)), gen_random_uuid());
        if coalesce(v->>'ok', '') = 'true' then
          if (v->>'bytes')::int > v_cap then raise exception 'residue-allowlist §2(d): a bag of % bytes was stored over the total %', v->>'bytes', v_cap; end if;
        elsif v->>'error' = 'state_too_large' and (v->>'cap')::int = v_cap then
          v_hit := true;
          if (select ps.ctid from public.player_state ps where ps.user_id = c_u and ps.slot = 0) is distinct from v_tid then
            raise exception 'residue-allowlist §2(d): a put refused state_too_large wrote the hero''s row'; end if;
          exit;
        else
          raise exception 'residue-allowlist §2(d): filling the bag with % answered %', v_f.field, v;
        end if;
      end loop;
      if not v_hit then raise exception 'residue-allowlist §2(d): every field at its bound fits the total: the total bounds nothing (it must be under the sum of the bounds)'; end if;
    end;
    if (select octet_length(ps.client_state::text) from public.player_state ps where ps.user_id = c_u and ps.slot = 0) > v_cap then
      raise exception 'residue-allowlist §2(d): the stored bag is over the total'; end if;

    -- (e) ★ A BAG STORED UNDER THE OLD RULE: a refused put leaves it byte for byte; an accepted put keeps its listed
    --     fields and does not carry the keys no list names.
    update public.player_state set client_state = '{"panelAlpha": 70, "oldJunk": "zzzz", "gold": 123, "coach": {"min": true}}'::jsonb
     where user_id = c_u and slot = 0;
    select ps.ctid into v_tid from public.player_state ps where ps.user_id = c_u and ps.slot = 0;
    perform set_config('hearthrise.rejection_noted', '', true);
    delete from public.hr_rate_counters where user_id = c_u;
    v := public.hr_put_client_state(0, '{"nope": 1}'::jsonb, gen_random_uuid());
    if v->>'error' is distinct from 'unknown_field'
       or (select ps.ctid from public.player_state ps where ps.user_id = c_u and ps.slot = 0) is distinct from v_tid then
      raise exception 'residue-allowlist §2(e): a refused put touched a bag stored under the old rule: %', v; end if;
    v := public.hr_put_client_state(0, '{"panelAlpha": 90}'::jsonb, (k || '0003')::uuid);
    select ps.client_state into v_bag from public.player_state ps where ps.user_id = c_u and ps.slot = 0;
    if coalesce(v->>'ok', '') <> 'true' or v_bag is distinct from '{"panelAlpha": 90, "coach": {"min": true}}'::jsonb then
      raise exception 'residue-allowlist §2(e): after an accepted put the old bag is % (wanted its listed fields and the patch, nothing else): %', v_bag, v; end if;

    -- (f) ONE KEY, ONE EFFECT: the same key again answers the first decision and writes nothing.
    delete from public.hr_rate_counters where user_id = c_u;
    select ps.ctid into v_tid from public.player_state ps where ps.user_id = c_u and ps.slot = 0;
    v := public.hr_put_client_state(0, '{"panelAlpha": 40}'::jsonb, (k || '0003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->>'replayed' is distinct from 'true'
       or (select ps.ctid from public.player_state ps where ps.user_id = c_u and ps.slot = 0) is distinct from v_tid then
      raise exception 'residue-allowlist §2(f): a replayed key answered % or wrote the row', v; end if;
    --     the shapes refused before the list is read are what they were
    if public.hr_put_client_state(0, '[1]'::jsonb, gen_random_uuid())->>'error' is distinct from 'bad_patch'
       or public.hr_put_client_state(0, '{"panelAlpha": 1}'::jsonb, null)->>'error' is distinct from 'missing_idem'
       or public.hr_put_client_state(3, '{"panelAlpha": 1}'::jsonb, gen_random_uuid())->>'error' is distinct from 'no_character' then
      raise exception 'residue-allowlist §2(f): bad_patch / missing_idem / no_character moved'; end if;

    raise exception using errcode = 'HRR42', message = 'residue-allowlist §2 complete - rolling back';
  exception when sqlstate 'HRR42' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) or exists (select 1 from public.player_state where user_id = c_u)
     or exists (select 1 from public.hr_rejections where user_id = c_u) or exists (select 1 from public.player_intents where user_id = c_u) then
    raise exception 'residue-allowlist §2: LEAKED a probe row'; end if;
  -- (g) THE IMAGE, judged last so a changed rule is refused above by what it breaks.
  v_md5 := md5(regexp_replace(pg_get_functiondef(c_fn::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 is distinct from '23a4a76c1945a6d7307031f1c3ee2ce5' then raise exception 'residue-allowlist §2(g): the put is not this file''s image (md5 %)', v_md5; end if;
  raise notice 'residue-allowlist: a listed field is stored; a key no list names, a field over its bound and a bag over the total are refused whole, journalled, and write nothing; an old bag is tidied only by an accepted put; all green';
end $chk$;
