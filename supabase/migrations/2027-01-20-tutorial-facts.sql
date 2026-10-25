-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — TUTORIAL FACTS: the empty account's answer names its slots and
-- the play-at-once limit; a bench resumed with nothing to work on leaves the
-- hero idle (lane c-tutorial-facts, backend-architect, 2026-10-25).
-- STAGED. Game CLOSED: applies on its passing §4 (CLAUDE.md §2), one file via the
-- Coordinator's apply tool, never inside begin/commit, never 00:00–00:10 UTC.
-- Design source: PRIORITY_BOARD "Tutorial polish walkthrough (2026-10-25)", rows 8 and 10.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- (1) ROW 8. A brand-new account (no hero) read "One can play at a time." and ONE empty
--     slot. hr_load(0) with no player_state row fell through to hr_state_of, whose answer
--     is a bare {ok:false, error:'no_character'}: no hero_slots, no account section. The
--     roster (src/session/account-session.js roster()) reads both off slot 0's answer and,
--     told nothing, shows slot 0 alone and keeps the limit at its fail-safe 1. The
--     needs_name refusal already carried them (2026-11-02-hero-creation.sql); the empty
--     slot's did not. The real facts: 2 starter slots (hr_hero_slots_of), 4 at once
--     (hr_hunt_limit('max_concurrent'), the generated row 2027-01-19-play-cap.sql counts).
-- (2) ROW 10. After a hunt's automatic end (the designer: a death in Mosslight Glade) the
--     hero read "In town, working on Cook Shrimp" with 0 Raw Shrimp. hr_hunt_apply_member
--     step (7) resumes player_state.last_activity_* when the activity is in the catalogue
--     and its skill gate passes; it never asked whether a bench has anything to work on.
--     The bench had run dry BEFORE the hunt (8 cooked, 2 burnt: the engine stopped it and
--     set idle), but last_activity still named it (it is noted on every start, kept on a
--     stop: the client's own pre-hunt collect is a stop too, so a stop cannot forget it).
--     With the browser closed nothing clears it (there is no artisan settler), so the hero
--     sat "working" forever AND counted as PLAYING for the play cap (hr_playing: active_kind
--     other than idle). Fix at the source: the resume asks the engine's own question,
--     missingInput, of the server's inventory: a bench resumes only when the hero holds the
--     inputs for ONE action (hr_bench_inputs(), generated from src/data/recipes.js through
--     src/core/artisan.js recipeInputs by tools/gen-catalogues.mjs). Else idle, journalled
--     resumed:false as every other refused resume is.
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- hr_load(p_slot) for a slot with no character answers
--   {ok:false, error:'no_character', slot, hero_slots:[...], account:{max_concurrent,
--    hero_slots_max, hero_slot_offer}}  (the needs_name answer's facts, the caller's own).
--   Signature, volatility, definer, search_path, grants unchanged. hr_state_of untouched.
-- hr_resume_has_inputs(p_user, p_slot, p_kind, p_id) -> boolean (owner-only, stable):
--   true unless p_kind is 'artisan' and some input of p_id (hr_bench_inputs()) is held
--   below its per-action count in player_inventory (the bag the engine's bench reads).
-- hr_hunt_apply_member step (7): v_ok also requires hr_resume_has_inputs(...). ONE
--   anchored edit (patch-chain depth 0 -> 1 since 2026-12-15-account-gold.sql restated it
--   whole); nothing else in the body moves.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- hr_load: a read plus its existing rate row and network note; the new branch is one PK
-- probe. The resume check runs inside hr_hunt_apply_member under the character lock it
-- already holds (hr_hunt_lock), in the settle's one transaction, after this window's loot
-- landed in player_inventory: no new lock, no network hop between read and write. Intent
-- keys and replays are untouched (no verb added).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- hr_load's empty answer states only the caller's own slots and the account limit (both
-- already in its needs_name answer and in every hero's envelope). The resume change can
-- only REFUSE a resume; it starts nothing, moves no value and adds no client grant. The
-- two new functions are owner-only. Shrinks: a dry bench no longer holds a play-cap seat.
--
-- ── KNOWN LIMITS ─────────────────────────────────────────────────────────────
-- · Heroes already "working" on a dry bench at apply stay so until their next accrual
--   (the engine stops a dry bench and sets idle) or their next start (no player row is
--   written here; grandfathered rows are wiped at EA).
-- · A recipe's scroll gate (recipe.gated) is not re-read at the resume (it was not before
--   either); the engine stops a gated bench on its first accrual.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply 2027-01-19-play-cap.sql's hr_load and 2026-12-15-account-gold.sql's
-- hr_hunt_apply_member (or remove the one TUTORIAL-FACTS clause), then drop
-- hr_resume_has_inputs. No player value is touched either way.
-- ORDER: after 2027-01-20-bench-inputs.generated.sql (hr_bench_inputs), which is after
-- 2027-01-19-play-cap.sql (hr_load c2d6868a). No begin/commit. No cron.* write.
-- COST: hr_load +1 PK probe on an empty slot only; a hunt end +1 constant jsonb lookup and
-- at most a few inventory PK probes. Zero new rows, ever.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────
do $mig$
declare v_md5 text; v_src text;
begin
  if to_regprocedure('public.hr_bench_inputs()') is null then
    raise exception 'PRECONDITION: hr_bench_inputs() is absent: apply 2027-01-20-bench-inputs.generated.sql first'; end if;
  if to_regprocedure('public.hr_load(integer)') is null or to_regprocedure('public.hr_hero_slots_of(uuid)') is null
     or to_regprocedure('public.hr_account_view(uuid,integer)') is null or to_regprocedure('public.hr_play_net_note(uuid)') is null
     or to_regprocedure('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)') is null then
    raise exception 'PRECONDITION: the play-cap (2027-01-19) and account-gold (2026-12-15) chain is absent'; end if;
  -- hr_load: the live image (measured read-only 2026-10-25, md5 of prosrc c2d6868a = 2027-01-19-play-cap.sql's) or this file's.
  select md5(prosrc) into v_md5 from pg_proc where oid = 'public.hr_load(integer)'::regprocedure;
  if v_md5 is distinct from 'c2d6868ac1d2ac2cd9a5eb3c728627de' and v_md5 is distinct from '5bb605fb3fe971b3d6ffcdcf1bca7e82' then
    raise exception 'PIN: hr_load moved (md5 %): re-derive this restatement from the new body', v_md5; end if;
  -- hr_hunt_apply_member: the live image (measured read-only 2026-10-25, md5 of prosrc a0bbf225 = 2026-12-15-account-gold.sql's)
  -- or this file's own (its TUTORIAL-FACTS clause).
  select prosrc into v_src from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure;
  if md5(replace(v_src, chr(13), '')) is distinct from 'a0bbf22528611f9c5d939783cb211c9e' and strpos(v_src, 'TUTORIAL-FACTS') = 0 then
    raise exception 'PIN: hr_hunt_apply_member moved (md5 %): re-derive this edit from the new body', md5(v_src); end if;
end $mig$;

-- ── §1 hr_load, RESTATED WHOLE from 2027-01-19-play-cap.sql (c2d6868a) ──────
create or replace function public.hr_load(p_slot integer default 0)
returns jsonb language plpgsql security definer
set search_path = public as $function$
declare v_uid uuid := auth.uid();
begin
  -- CLOSED MODE (2026-10-22-closed-mode-ungated-rpcs.sql, Security R3): this RPC
  -- never calls hr_rpc_gate, so it refuses a non-admitted caller itself.
  -- PLAY-CAP (2027-01-19-play-cap.sql): it notes the network the account plays from (hr_play_net_note).
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if not public.hr_rate_ok(v_uid, 'load', 180, interval '1 minute') then
    -- (C2) A read path; three loads a second sustained is a poller. (S6) Sampled.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'load') - 180) > 0 then
      perform public.hr_record_rejection(v_uid, coalesce(p_slot, 0), 'load', 'rate_limited',
        jsonb_build_object('limit', 180, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'load') - 180));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  -- THE NETWORK THIS ACCOUNT PLAYS FROM (2027-01-19-play-cap.sql): a salted hash of this request's address, stored
  -- when it changed (never the address), for the per-network play cap of a start that is not this account's own
  -- call (a town activity the engine starts, a party leader's Start).
  perform public.hr_play_net_note(v_uid);
  -- AN EMPTY SLOT STILL NAMES THE ACCOUNT'S FACTS (2027-01-20-tutorial-facts.sql): the owned slots and the
  -- play-at-once limit, so the characters screen of an account with no hero shows its real numbers.
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = coalesce(p_slot, 0)) then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', coalesce(p_slot, 0),
      'hero_slots', public.hr_hero_slots_of(v_uid), 'account', public.hr_account_view(v_uid, coalesce(p_slot, 0)));
  end if;
  -- A CHARACTER ENTERS THE WORLD ONLY WITH A CLAIMED NAME (2026-11-02-hero-creation.sql):
  -- the answer still names the owned slots and the account limit, which the roster reads.
  if not exists (select 1 from public.character_names where user_id = v_uid and slot = coalesce(p_slot, 0)) then
    return jsonb_build_object('ok', false, 'error', 'needs_name', 'slot', coalesce(p_slot, 0),
      'hero_slots', public.hr_hero_slots_of(v_uid), 'account', public.hr_account_view(v_uid, coalesce(p_slot, 0)));
  end if;
  return public.hr_state_of(v_uid, coalesce(p_slot, 0));
end $function$;

-- ── §2 THE RESUME ASKS THE BENCH'S QUESTION ─────────────────────────────────
create or replace function public.hr_resume_has_inputs(p_user uuid, p_slot integer, p_kind text, p_id text)
returns boolean language sql stable set search_path = public, pg_catalog as $$
  -- TUTORIAL-FACTS (2027-01-20-tutorial-facts.sql): the engine's missingInput (src/core/artisan.js) on the server's
  -- bag. True for every kind but a bench, and for a bench that consumes nothing; false while any input of ONE action
  -- is short.
  select p_kind is distinct from 'artisan'
      or not exists (select 1 from jsonb_each(coalesce(public.hr_bench_inputs() -> p_id, '{}'::jsonb)) i
                      where coalesce((select v.qty from public.player_inventory v
                                       where v.user_id = p_user and v.slot = p_slot and v.item_id = i.key), 0)
                            < (i.value #>> '{}')::bigint)
$$;

-- hr_hunt_apply_member step (7): ONE anchored edit, the v_ok expression's last clause.
do $mig$
declare
  a1 constant text := $a$                                        where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv);
    if v_ok then$a$;
  r1 constant text := $a$                                        where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv)
      -- TUTORIAL-FACTS (2027-01-20-tutorial-facts.sql): a bench resumes only with the inputs for one action; else idle.
      and public.hr_resume_has_inputs(p_user, p_slot, v_lk, v_li);
    if v_ok then$a$;
  v_def text; v_n int;
begin
  v_def := replace(pg_get_functiondef('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure), chr(13), '');
  if position('TUTORIAL-FACTS' in v_def) > 0 then
    raise notice 'tutorial-facts §2: hr_hunt_apply_member already asks hr_resume_has_inputs - edit skipped'; return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, a1, ''))) / length(a1);
  if v_n <> 1 then raise exception 'tutorial-facts §2: the hr_hunt_apply_member anchor matched % times', v_n; end if;
  execute replace(v_def, a1, r1);
end $mig$;

-- ── §3 GRANTS ────────────────────────────────────────────────────────────────
do $grants$
begin
  revoke all on function public.hr_resume_has_inputs(uuid, integer, text, text) from public, anon, authenticated, service_role;
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_resume_has_inputs(uuid, integer, text, text) from hr_engine;
  end if;
  -- hr_hunt_apply_member keeps its ACL through the execute of its own definition; restated anyway (2026-12-15-account-gold.sql).
  revoke all on function public.hr_hunt_apply_member(uuid, uuid, integer, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
end $grants$;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-images: (b) the old hr_load answers an empty account with no hero_slots / account; (c) the helper
-- and the clause do not exist there. The end-to-end resume (a dry bench after a death or a stamina end, the hunt
-- viewed and the browser closed) is tests/hunt-sessions-settle.mjs RESUME on the replayed chain.
do $$
declare
  c_u    constant uuid := '000000d5-0000-4000-a000-00007f0c0001';
  v      jsonb;
  v_sig  text;
  v_bench text;
  v_in   jsonb;
  v_item text;
  v_need bigint;
  v_set  text;
begin
  -- (a) THE SHAPE: hr_load is this file's image and keeps its grants; the helper is owner-only with a pinned search_path;
  --     hr_hunt_apply_member carries the clause exactly once and stays the server's alone.
  if (select md5(prosrc) from pg_proc where oid = 'public.hr_load(integer)'::regprocedure) <> '5bb605fb3fe971b3d6ffcdcf1bca7e82' then
    raise exception 'tutorial-facts §4(a): hr_load is not this file''s image'; end if;
  if not has_function_privilege('authenticated', 'public.hr_load(integer)', 'execute') then
    raise exception 'tutorial-facts §4(a): hr_load lost its client grant'; end if;
  foreach v_sig in array array['hr_resume_has_inputs(uuid,integer,text,text)', 'hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
                               'hr_bench_inputs()'] loop
    if has_function_privilege('anon', ('public.' || v_sig)::regprocedure, 'execute')
       or has_function_privilege('authenticated', ('public.' || v_sig)::regprocedure, 'execute')
       or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                   where p.oid = ('public.' || v_sig)::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      raise exception 'tutorial-facts §4(a): % is reachable by a client', v_sig; end if;
  end loop;
  if not exists (select 1 from pg_proc p where p.oid = 'public.hr_resume_has_inputs(uuid,integer,text,text)'::regprocedure
                  and p.proconfig @> array['search_path=public, pg_catalog']) then
    raise exception 'tutorial-facts §4(a): hr_resume_has_inputs has no pinned search_path'; end if;
  select prosrc into v_set from pg_proc where oid = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure;
  if (length(v_set) - length(replace(v_set, 'and public.hr_resume_has_inputs(p_user, p_slot, v_lk, v_li);', '')))
     / length('and public.hr_resume_has_inputs(p_user, p_slot, v_lk, v_li);') <> 1
     or strpos(v_set, 'and public.hr_resume_has_inputs(p_user, p_slot, v_lk, v_li);') > strpos(v_set, '    if v_ok then') then
    raise exception 'tutorial-facts §4(a): hr_hunt_apply_member''s resume does not ask hr_resume_has_inputs exactly once'; end if;

  begin
    -- THE PROBE: one admitted account with no hero, as a player calls it.
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'tutorial-facts §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', c_u, 'role', 'authenticated')::text, true);

    -- (b) AN EMPTY ACCOUNT'S ANSWER NAMES ITS FACTS: no_character, the owned slots (two to start, Tyler 2026-10-17)
    --     and the play-at-once limit (the generated max_concurrent row).
    execute 'set local role authenticated';
    v := public.hr_load(0);
    execute 'reset role';
    if v->>'error' is distinct from 'no_character' or (v->>'ok')::boolean is distinct from false then
      raise exception 'tutorial-facts §4(b): an empty account loaded as %', v; end if;
    if v->'hero_slots' is distinct from public.hr_hero_slots_of(c_u) or jsonb_array_length(coalesce(v->'hero_slots', '[]'::jsonb)) <> 2 then
      raise exception 'tutorial-facts §4(b): an empty account''s answer names slots % (the server owns %)', v->'hero_slots', public.hr_hero_slots_of(c_u); end if;
    if (v->'account'->>'max_concurrent')::int is distinct from public.hr_hunt_limit('max_concurrent')
       or public.hr_hunt_limit('max_concurrent') is distinct from 4 then
      raise exception 'tutorial-facts §4(b): an empty account''s answer names the limit % (the server holds %)',
        v->'account'->'max_concurrent', public.hr_hunt_limit('max_concurrent'); end if;
    if v ? 'state' or v ? 'version' then raise exception 'tutorial-facts §4(b): an empty slot answered with an envelope'; end if;

    -- (c) A BENCH RESUMES ONLY WITH THE INPUTS FOR ONE ACTION: the probe's hero, its bag emptied of one bench's inputs.
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tutorial-facts §4-harness: hr_create_character refused: %', v; end if;
    select b.key, b.value into v_bench, v_in from jsonb_each(public.hr_bench_inputs()) b
     where exists (select 1 from public.hr_activities a where a.kind = 'artisan' and a.activity_id = b.key)
     order by (select count(*) from jsonb_object_keys(b.value)) desc, b.key limit 1;
    if v_bench is null then raise exception 'tutorial-facts §4-harness: no bench consumes anything'; end if;
    delete from public.player_inventory where user_id = c_u and slot = 0 and item_id in (select jsonb_object_keys(v_in));
    if public.hr_resume_has_inputs(c_u, 0, 'artisan', v_bench) then
      raise exception 'tutorial-facts §4(c): % resumes with none of its inputs %', v_bench, v_in; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select c_u, 0, i.key, (i.value #>> '{}')::bigint from jsonb_each(v_in) i;
    if not public.hr_resume_has_inputs(c_u, 0, 'artisan', v_bench) then
      raise exception 'tutorial-facts §4(c): % does not resume with exactly one action''s inputs %', v_bench, v_in; end if;
    select i.key, (i.value #>> '{}')::bigint into v_item, v_need from jsonb_each(v_in) i order by i.key limit 1;
    if v_need > 1 then
      update public.player_inventory set qty = v_need - 1 where user_id = c_u and slot = 0 and item_id = v_item;
    else
      delete from public.player_inventory where user_id = c_u and slot = 0 and item_id = v_item;
    end if;
    if public.hr_resume_has_inputs(c_u, 0, 'artisan', v_bench) then
      raise exception 'tutorial-facts §4(c): % resumes one % short', v_bench, v_item; end if;
    -- Every other kind, and a bench that consumes nothing, is not this file's business.
    if not public.hr_resume_has_inputs(c_u, 0, 'gather', v_bench) or not public.hr_resume_has_inputs(c_u, 0, 'artisan', 'no_such_bench')
       or not public.hr_resume_has_inputs(c_u, 0, null, null) then
      raise exception 'tutorial-facts §4(c): the check reached past a bench''s inputs'; end if;
    raise exception using errcode = 'HRT20', message = 'tutorial-facts §4 complete - rolling back';
  exception when sqlstate 'HRT20' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = c_u) then raise exception 'tutorial-facts §4: LEAKED a probe row'; end if;

  -- (d) GRANT HYGIENE IS CLEAN.
  v := public.hr_assert_grant_hygiene(false);
  if jsonb_array_length(coalesce(v->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'ungated_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'baseline_rows_no_longer_live', '[]'::jsonb)) <> 0 then
    raise exception 'tutorial-facts §4(d): grant hygiene is red: %', v; end if;
  raise notice 'tutorial-facts: an empty account names its 2 slots and 4 at once; a bench resumes only with one action''s inputs; all green';
end $$;
