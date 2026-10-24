-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — GEAR IS WORN BY THE HERO'S LEVEL (lane b-gear-by-level,
-- systems-engineer, 2026-10-24). STAGED, NOT APPLIED. Game CLOSED: applies on
-- its passing §4; the equip gate is on the reopen Security review list.
-- RESTATEMENT-DEBT-ACK: hr_apply (the economy's single write path) takes ONE
-- anchored edit here, as 2026-12-15-account-gold.sql §5 took four: the equip
-- block's requirement test moves into hr_item_requirement_unmet. Restating the
-- whole body for one test is the larger risk.
--
-- Tyler 2026-10-24: "I think all gear should just be hero level" (every piece of
-- equipment, armor of every weight, shields, spellbooks, weapons, capes and
-- jewelry), then "Supplies/runes stick to skill level" (ammo and whetstones in the
-- ammo slot keep their skill). Why: a Mage or a Ranger behind a tank earns almost
-- no Defense, so a Defense gate kept them out of their own upgrades (QA mage
-- Fingerguns, Defense 19, refused the Steel Helm "Needs Defense 30").
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
--   hr_item_requirement_unmet(user, slot, item)   NEW. The catalogue row's
--       requirement against the hero: hr_items.req_skill 'level' (src/data/
--       gear-tiers.js LEVEL_REQ) reads the hero's Level (hr_level_of: player_state
--       .level_xp), any other req_skill that skill's level (hr_skill_level over
--       player_skills, unchanged). Answers null when met (or no requirement),
--       else { req, need, have }. Not executable by any client role.
--   hr_apply   the EQUIP block's requirement test reads it, and its refusal says
--       what it read: requirement_not_met with { item_id, req, need, have }, so
--       the screen states the server's own numbers ("Needs Level 30 — you're 28").
--       Before this file a 'level' row would have read as a skill nobody holds
--       (level 1): every gated piece refused.
-- The rows themselves move in 2027-01-14-items-catalogue.generated.sql
-- (tools/gen-catalogues.mjs): every equipment row's req_skill turns 'level' at its
-- tier's Level (1 / 15 / 30 / 45 / 60 / 75 / 88), the number unchanged.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- None added. The gate reads only server rows under hr_apply's character lock
-- (hr_items, player_state.level_xp, player_skills); the client still sends a slot
-- name and an item name. level_xp is credited only by the hunt settle (core
-- bodies: level_xp_outside_hunt), so a Level cannot be forged into a gear gate.
-- The equip stays a TRANSFER (ownership, slot, two hands unchanged). No table,
-- grant, signature or player row moves; seeded rows move in the catalogue file.
--
-- ── ORDER ───────────────────────────────────────────────────────────────────
-- After the APPLIED 2027-01-13-spell-roles.sql and BEFORE
-- 2027-01-14-items-catalogue.generated.sql: with this file first, hr_apply reads
-- the old skill rows exactly as today and the 'level' rows the moment they land;
-- the other order would refuse every gated piece in the seconds between.
-- EDGE: either order (equip.js answers no requirement early; the bundle moved only
-- with src/data rows the engine does not read for gear).
-- REVERSIBILITY: replace this file's marked block in hr_apply with the original
-- inline test (2026-10-27-core-bodies.sql, the EQUIPMENT block) and drop
-- hr_item_requirement_unmet. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_src text; v_md5 text;
begin
  if to_regclass('public.hr_items') is null or to_regclass('public.player_skills') is null
     or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_skill_level(text,bigint)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'player_state' and column_name = 'level_xp') then
    raise exception 'PRECONDITION: hr_items, player_skills, player_state.level_xp, hr_level_of and hr_skill_level must exist (2026-10-27-core-bodies.sql)'; end if;
  -- hr_apply: the LIVE image (tests/live-hash-drift.baseline.json, measured 2026-10-24, the 2026-12-15-account-gold.sql
  -- splice of the 2026-10-27-core-bodies.sql body), or this file's own (its GEAR-BY-LEVEL marker).
  select prosrc into v_src from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 <> '8f26477f5ffbf61fb61ee9b49759b082' and strpos(v_src, 'GEAR-BY-LEVEL') = 0 then
    raise exception 'PIN: hr_apply is neither the live image (8f26477f...) nor this file''s (md5 %)', v_md5; end if;
  -- hr_item_requirement_unmet: absent, or this file's.
  select prosrc into v_src from pg_proc where oid = to_regprocedure('public.hr_item_requirement_unmet(uuid,integer,text)');
  if v_src is not null and strpos(v_src, 'GEAR-BY-LEVEL') = 0 then
    raise exception 'PIN: hr_item_requirement_unmet exists and is not this file''s'; end if;
end $mig$;

-- ── §1 THE REQUIREMENT, READ ONCE ────────────────────────────────────────────
create or replace function public.hr_item_requirement_unmet(p_user uuid, p_slot int, p_item text)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- GEAR-BY-LEVEL (2027-01-14-gear-by-level.sql, Tyler 2026-10-24): 'level' is the hero's Level (every piece of
  -- gear), any other req_skill a skill (ammo in the ammo slot). Null when met or when the row names no requirement.
  select jsonb_build_object('req', r.req, 'need', r.need, 'have', r.have)
    from (select i.req_skill as req, i.req_lv as need,
                 case when i.req_skill = 'level' then public.hr_level_of(p_user, p_slot)
                      else coalesce((select public.hr_skill_level(i.req_skill, s.xp) from public.player_skills s
                                      where s.user_id = p_user and s.slot = p_slot and s.skill_id = i.req_skill), 1)
                 end as have
            from public.hr_items i
           where i.item_id = p_item and i.req_skill is not null and i.req_lv is not null) r
   where r.have < r.need
$$;
revoke all on function public.hr_item_requirement_unmet(uuid, integer, text) from public, anon, authenticated, service_role;

-- ── §2 hr_apply — ONE ANCHORED EDIT (RESTATEMENT-DEBT-ACK in the header) ───────
-- The anchor must match EXACTLY once or the block raises. A body that already carries
-- the GEAR-BY-LEVEL marker is this file's post-image: skipped.
do $mig$
declare
  v_def text; v_n int;
  a1 text := $a$        if exists (
          select 1 from public.hr_items i
           where i.item_id = v_item and i.req_skill is not null and i.req_lv is not null
             and coalesce((select public.hr_skill_level(i.req_skill, s.xp) from public.player_skills s
                            where s.user_id = v_uid and s.slot = v_slot
                              and s.skill_id = i.req_skill), 1) < i.req_lv)
        then
          perform public.hr_reject('requirement_not_met', jsonb_build_object('item_id', v_item));
        end if;
$a$;
  r1 text := $a$        -- GEAR-BY-LEVEL (2027-01-14-gear-by-level.sql, Tyler 2026-10-24): the catalogue row's requirement,
        -- read by hr_item_requirement_unmet: the hero's Level for every piece of gear, a skill for ammo.
        -- The refusal says what it read (req, need, have): the screen states the server's own numbers.
        if public.hr_item_requirement_unmet(v_uid, v_slot, v_item) is not null then
          perform public.hr_reject('requirement_not_met', jsonb_build_object('item_id', v_item)
                                   || public.hr_item_requirement_unmet(v_uid, v_slot, v_item));
        end if;
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if position('GEAR-BY-LEVEL' in v_def) > 0 then
    raise notice 'gear-by-level §2: hr_apply already reads hr_item_requirement_unmet - patch skipped'; return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, a1, ''))) / length(a1);
  if v_n <> 1 then raise exception 'gear-by-level §2: the hr_apply anchor matched % times', v_n; end if;
  execute replace(v_def, a1, r1);
end $mig$;

-- ── §3 GRANTS: hr_apply's CURRENT ACL restated (an execute of its definition keeps it; restated anyway) ──
revoke all on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) to hr_engine;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- The probe's own catalogue row (a hat worn at Level 30) and its own hero; the
-- real rows' proof (Scholar Hat and Steel Helm on a Level-30, Defense-19 Mage)
-- is tests/equip-intent.mjs E2g, on the replayed chain with the catalogue file.
do $mig$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-0000000a1e01';
  k   constant text := '000000c0-0000-4000-b000-0a1e';
  v jsonb; v_src text;
  ver bigint;
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Gear') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'gear-by-level §4 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(0): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    insert into public.hr_items (item_id, name, tradeable, kind, value, req_skill, req_lv, armour_weight)
      values ('zz_gbl_probe_hat', 'Probe Hat', true, 'armor', 1, 'level', 30, 'light');
    insert into public.hr_item_slots (item_id, equip_slot) values ('zz_gbl_probe_hat', 'helmet');
    if not exists (select 1 from public.hr_items where item_id = 'barbed_arrows' and req_skill = 'ranged' and req_lv = 15) then
      raise exception 'VERIFY(0): barbed_arrows is not the Ranged-15 supply this check reads'; end if;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty) values (v_u, 0, 'zz_gbl_probe_hat', 1), (v_u, 0, 'barbed_arrows', 5)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    -- Level 30, Defense 19 (Fingerguns, 10-24), Ranged 1.
    update public.player_state set level_xp = public.hr_char_xp_for_level(30) where user_id = v_u and slot = 0;
    insert into public.player_skills as ps (user_id, slot, skill_id, xp) values (v_u, 0, 'defense', public.hr_skill_xp_for_level('defense', 19))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    if public.hr_level_of(v_u, 0) <> 30 then raise exception 'VERIFY(0): the probe hero is Level %, not 30', public.hr_level_of(v_u, 0); end if;

    -- (a) Level 30 with Defense 19 wears a Level-30 piece.
    if public.hr_item_requirement_unmet(v_u, 0, 'zz_gbl_probe_hat') is not null then
      raise exception 'VERIFY(a): Level 30 reads as short of a Level-30 piece: %', public.hr_item_requirement_unmet(v_u, 0, 'zz_gbl_probe_hat'); end if;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, ver, (k || '00000001')::uuid,
           jsonb_build_object('equip', jsonb_build_object('helmet', 'zz_gbl_probe_hat'), 'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:helmet')));
    if coalesce(v->>'ok', '') <> 'true'
       or (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'helmet') is distinct from 'zz_gbl_probe_hat' then
      raise exception 'VERIFY(a): a Level-30, Defense-19 hero putting on a Level-30 piece answered %', v; end if;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, ver, (k || '00000002')::uuid,
           jsonb_build_object('equip', jsonb_build_object('helmet', null), 'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:helmet')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): taking the hat off answered %', v; end if;

    -- (b) Level 28 is refused with the Level words' numbers, even at Defense 99, and nothing moves.
    update public.player_state set level_xp = public.hr_char_xp_for_level(28) where user_id = v_u and slot = 0;
    update public.player_skills set xp = public.hr_skill_xp_for_level('defense', 99) where user_id = v_u and slot = 0 and skill_id = 'defense';
    if public.hr_item_requirement_unmet(v_u, 0, 'zz_gbl_probe_hat') is distinct from jsonb_build_object('req', 'level', 'need', 30, 'have', 28) then
      raise exception 'VERIFY(b): a Level-28 hero reads %', public.hr_item_requirement_unmet(v_u, 0, 'zz_gbl_probe_hat'); end if;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, ver, (k || '00000003')::uuid,
           jsonb_build_object('equip', jsonb_build_object('helmet', 'zz_gbl_probe_hat'), 'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:helmet')));
    if v->>'error' is distinct from 'requirement_not_met' or v->>'item_id' is distinct from 'zz_gbl_probe_hat'
       or v->>'req' is distinct from 'level' or (v->>'need')::int is distinct from 30 or (v->>'have')::int is distinct from 28 then
      raise exception 'VERIFY(b): a Level-28 (Defense-99) hero putting on a Level-30 piece answered %', v; end if;
    if exists (select 1 from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'helmet')
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'zz_gbl_probe_hat') is distinct from 1 then
      raise exception 'VERIFY(b): the refused equip moved the bag or the slot'; end if;

    -- (c) A SUPPLY KEEPS ITS SKILL: Barbed Arrows need Ranged 15 at any Level.
    update public.player_state set level_xp = public.hr_char_xp_for_level(99) where user_id = v_u and slot = 0;
    if public.hr_item_requirement_unmet(v_u, 0, 'barbed_arrows') is distinct from jsonb_build_object('req', 'ranged', 'need', 15, 'have', 1) then
      raise exception 'VERIFY(c): a Level-99, Ranged-1 hero reads Barbed Arrows as %', public.hr_item_requirement_unmet(v_u, 0, 'barbed_arrows'); end if;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, ver, (k || '00000004')::uuid,
           jsonb_build_object('equip', jsonb_build_object('ammo', 'barbed_arrows'), 'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:ammo')));
    if v->>'error' is distinct from 'requirement_not_met' or v->>'req' is distinct from 'ranged' then
      raise exception 'VERIFY(c): Barbed Arrows at Ranged 1 (Level 99) answered %', v; end if;
    insert into public.player_skills as ps (user_id, slot, skill_id, xp) values (v_u, 0, 'ranged', public.hr_skill_xp_for_level('ranged', 15))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    select version into ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, ver, (k || '00000005')::uuid,
           jsonb_build_object('equip', jsonb_build_object('ammo', 'barbed_arrows'), 'journal', jsonb_build_object('kind', 'equip', 'intent', 'equip:ammo')));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): Barbed Arrows at Ranged 15 answered %', v; end if;
    if public.hr_item_requirement_unmet(v_u, 0, 'zz_no_such_item') is not null then
      raise exception 'VERIFY(c): an id with no row reads as a requirement'; end if;

    -- (d) THE BODY: hr_apply reads the helper once, the old skill-only test is gone; no client may call the helper.
    select prosrc into v_src from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
    if (length(v_src) - length(replace(v_src, 'GEAR-BY-LEVEL', ''))) / length('GEAR-BY-LEVEL') <> 1
       or strpos(v_src, 'and s.skill_id = i.req_skill), 1) < i.req_lv)') > 0 then
      raise exception 'VERIFY(d): hr_apply does not carry exactly this file''s requirement test'; end if;
    if has_function_privilege('anon', 'public.hr_item_requirement_unmet(uuid,integer,text)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_item_requirement_unmet(uuid,integer,text)', 'execute')
       or has_function_privilege('service_role', 'public.hr_item_requirement_unmet(uuid,integer,text)', 'execute')
       or has_function_privilege('hr_engine', 'public.hr_item_requirement_unmet(uuid,integer,text)', 'execute')
       or has_function_privilege('authenticated', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
       or not has_function_privilege('hr_engine', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute') then
      raise exception 'VERIFY(d): a grant is wrong'; end if;
    raise exception using errcode = 'HR964', message = 'gear-by-level §4 complete - rolling back';
  exception when sqlstate 'HR964' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.hr_items where item_id = 'zz_gbl_probe_hat') then
    raise exception 'VERIFY(e): §4 LEAKED a probe row'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'gear-by-level: gear reads the hero''s Level, a supply its skill, the refusal says need and have; all green';
end $mig$;
