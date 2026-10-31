-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-11-bag-over-cap.sql — A BAG ALREADY OVER ITS CAP STOPS WEDGING THE HERO:
--   ONLY A NEW STACK IS REFUSED `bank_full` (lane/c-beta-capacity, reliability-engineer,
--   2026-10-31; the vitals line "armed artisan lag: STUCK").
--
-- RESTATEMENT-DEBT-ACK: hr_apply (the economy's single write path, 155k chars) takes THREE
-- anchored edits; restating it whole for a three-line change is the larger risk.
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside
-- begin/commit, never 00:00-00:10 UTC). Pre-EA: applies on its passing §2; on the EA Security
-- list (hr_apply). EDGE: none. CLIENT: none.
--
-- ── THE BUG (measured on production, 2026-10-31 03:50 UTC) ──────────────────
-- Hero bf18bd7f:0 ended a 12 h party hunt on stamina at 18:05:59 UTC 10-30. hr_hunt_close
-- brought its hunt bag home unchecked (correctly: a hero's own supplies are never destroyed):
-- 101 stacks against bank_cap 100. The engine then resumed its last town work, fuel_bones.
-- hr_apply's BANK CAP block counts the bag AFTER the delta and refuses whenever the count is
-- above the cap, whatever the delta did, so EVERY item-touching settle of that hero answers
-- bank_full {stacks: 101, cap: 100}, including a bench that only burns bones. Its own comment
-- states the rule it breaks: "A NEW stack is what costs space."
-- What that cost, on 10-31 at 03:50 UTC:
--   · 9.7 h of the hero's town work unpaid (accrued_to frozen; owed, not lost: the watermark held).
--   · the tick re-leased it every fire and refused: 360 edge POSTs an hour, one engine call each,
--     from one hero, for up to the tick's 24 h fence (8,640 invocations). hr_tick_cron_log: top
--     reason bank_full on 719 of 719 fires in the last 2 h; rostered fires 41/h -> 360/h at 18:07.
--   · the same wedge refuses that hero's equip, sell and any other item delta
--     (0d959747:3 hit it on equip:belt 10-29 22:24; 0d959747:2 on accrue 10-30 07:21).
-- Bags run 83-101 stacks after three weeks on the account that plays most, so a beta sees this
-- on every heavy hero.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────
-- §1 hr_apply counts the bag BEFORE the delta as well, and refuses bank_full only when the bag
-- is over its cap AND this delta made it bigger: stacks_after > cap and stacks_after > stacks_before.
--   stacks before -> after    cap 100   old     new
--   100 -> 101                          refused refused   (the cap still bites at the cap)
--   101 -> 101 (burn, sell, gain more)  REFUSED ok        (the wedge)
--   101 -> 100 (a stack emptied)        ok      ok
--   101 -> 102                          refused refused   (over the cap never grows)
-- An over-cap bag can only shrink or hold. artisan-sim.js bagFullFor is already exactly this
-- test (`stacks - freed + 1 > cap` only when the action OPENS a stack), so the engine and the
-- server stop disagreeing: the next fire pays bf18bd7f:0's owed window and the hammering ends.
-- No player state is touched by this file; the hero heals itself on the next tick.
--
-- ── COST ────────────────────────────────────────────────────────────────────
-- One more index range count per item-touching apply: the PK prefix (user_id, slot), at most a
-- hero's stacks (<= hr_items rows, ~100 in practice), ~50 us against a 46 ms apply.
-- The old count's `limit cap + 1` goes (RL4's "100,000-stack bank" cannot exist: one row per
-- catalogue item), because a saturating count cannot see 102 > 101.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Remove the three BAG-OVER-CAP blocks with the same anchored replace, reversed (pre-image prosrc md5 4feb33b3).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where oid = to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)');
  if v_src is null then raise exception 'PRECONDITION: hr_apply is absent'; end if;
  if strpos(v_src, 'BANK CAP') = 0 or strpos(v_src, 'SKILLS-FROM-STORAGE') = 0 then
    raise exception 'PRECONDITION: hr_apply has no BANK CAP block or no SKILLS-FROM-STORAGE block to anchor on';
  end if;
  if (select count(*) from public.hr_items) < 3 then
    raise exception 'PRECONDITION: the item catalogue is empty';
  end if;
end $mig$;

-- ── §1 hr_apply — THREE ANCHORED EDITS (RESTATEMENT-DEBT-ACK in the header) ─
-- Every anchor must match EXACTLY once or the block raises. A body that already carries the
-- BAG-OVER-CAP marker is this file's post-image: skipped.
do $mig$
declare
  v_def text; v_n int; i int;
  a text[] := array[
$a$  k text; v_n bigint; v_have bigint; v_stacks int;
$a$,
$a$    -- ── SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql; Tyler 2026-10-25, a universal truth) ──
$a$,
$a$    --   BOUNDED COUNT (reliability RL4): the question is "> cap?", not "how
    --   many?", so the scan stops at cap+1 rows instead of walking a 100,000-
    --   stack bank on every item-touching apply.
    if (p_delta ? 'items') or (p_delta ? 'equip') then
      select count(*) into v_stacks from (
        select 1 from public.player_inventory
         where user_id = v_uid and slot = v_slot
         limit v_st.bank_cap + 1) s;
      if v_stacks > v_st.bank_cap then
        perform public.hr_reject('bank_full',
          jsonb_build_object('stacks', v_stacks, 'cap', v_st.bank_cap));
      end if;
    end if;
$a$];
  r text[] := array[
$a$  k text; v_n bigint; v_have bigint; v_stacks int;
  -- BAG-OVER-CAP (2027-02-11-bag-over-cap.sql): the bag's stacks before this delta wrote anything.
  v_stacks_before int;
$a$,
$a$    -- BAG-OVER-CAP (2027-02-11-bag-over-cap.sql): counted before ANY write to the bag (the bench take below is the first).
    if (p_delta ? 'items') or (p_delta ? 'equip') then
      select count(*) into v_stacks_before from public.player_inventory
       where user_id = v_uid and slot = v_slot;
    end if;

    -- ── SKILLS-FROM-STORAGE (2027-01-24-skills-from-storage.sql; Tyler 2026-10-25, a universal truth) ──
$a$,
$a$    --   BAG-OVER-CAP (2027-02-11-bag-over-cap.sql): refused only when THIS delta made an over-cap bag bigger. A bag
    --   can sit above its cap (a hunt's bag comes home unchecked, hr_hunt_close): it may shrink or hold, never grow,
    --   and a hero who holds 101 stacks still burns, sells and gains more of what it holds. One row per catalogue
    --   item, so an exact count is a short PK range; a saturating count could not see 102 > 101.
    if (p_delta ? 'items') or (p_delta ? 'equip') then
      select count(*) into v_stacks from public.player_inventory
       where user_id = v_uid and slot = v_slot;
      if v_stacks > v_st.bank_cap and v_stacks > v_stacks_before then
        perform public.hr_reject('bank_full',
          jsonb_build_object('stacks', v_stacks, 'cap', v_st.bank_cap));
      end if;
    end if;
$a$];
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if position('BAG-OVER-CAP' in v_def) > 0 then
    raise notice 'bag-over-cap §1: hr_apply already carries the fix - patch skipped'; return;
  end if;
  for i in 1 .. array_length(a, 1) loop
    v_n := (length(v_def) - length(replace(v_def, a[i], ''))) / length(a[i]);
    if v_n <> 1 then raise exception 'bag-over-cap §1: hr_apply anchor % matched % times', i, v_n; end if;
    v_def := replace(v_def, a[i], r[i]);
  end loop;
  execute v_def;
end $mig$;
revoke all on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) to hr_engine;

-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ─────────
do $mig$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-00000115f502';
  k   constant text := '000000c0-0000-4000-b000-00000116';
  v jsonb; v_ver bigint; v_cap int; v_held text; v_new text; v_n int; v_src text;
  -- one settled-window delta over this hero's own bag
  c_kind constant jsonb := jsonb_build_object('kind', 'craft', 'intent', 'accrue');
begin
  -- v1 the pre-count stands before every write to the bag, the bench's take included.
  select regexp_replace(prosrc, '--[^' || chr(10) || ']*', '', 'g') into v_src from pg_proc
   where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure;
  if strpos(v_src, 'into v_stacks_before') = 0
     or strpos(v_src, 'into v_stacks_before') > strpos(v_src, 'public.hr_materials_take(v_uid, v_slot, v_skill_cost, true)')
     or strpos(v_src, 'into v_stacks_before') > strpos(v_src, 'insert into public.player_inventory') then
    raise exception 'bag-over-cap §2 v1: the bag is not counted before the delta writes it'; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'bag-over-cap §2 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'bag-over-cap §2: hr_create_character refused: %', v; end if;

    -- The bag set to exactly its cap, of real items, with one more real item left unheld.
    update public.player_state
       set active_kind = 'artisan', active_id = (select a.activity_id from public.hr_activities a where a.kind = 'artisan' order by a.activity_id limit 1),
           active_since = now() - interval '1 hour', accrued_to = now() - interval '1 hour'
     where user_id = v_u and slot = 0;
    select bank_cap into v_cap from public.player_state where user_id = v_u and slot = 0;
    delete from public.player_inventory where user_id = v_u and slot = 0;
    if (select count(*) from public.hr_items) < v_cap + 3 then
      -- The catalogue is too small to fill the bag here: shrink the probe's own cap to fit.
      v_cap := greatest(1, (select count(*)::int from public.hr_items) - 3);
      update public.player_state set bank_cap = v_cap where user_id = v_u and slot = 0;
    end if;
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select v_u, 0, i.item_id, 5 from (select item_id from public.hr_items order by item_id limit v_cap) i;
    select min(item_id) into v_held from public.player_inventory where user_id = v_u and slot = 0;
    select i.item_id into v_new from public.hr_items i
     where not exists (select 1 from public.player_inventory p where p.user_id = v_u and p.slot = 0 and p.item_id = i.item_id)
     order by i.item_id limit 1;

    -- v2 AT THE CAP: a NEW stack is still refused, and nothing moves.
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0001')::uuid, jsonb_build_object('accrued_to', 'now',
           'items', jsonb_build_object(v_new, 1), 'journal', c_kind));
    if v->>'error' is distinct from 'bank_full' then
      raise exception 'bag-over-cap §2 v2: a new stack at the cap answered %', v; end if;

    -- OVER THE CAP, as a hunt's bag brings it home: one stack more than the cap.
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 0, v_new, 5);
    select i.item_id into v_new from public.hr_items i
     where not exists (select 1 from public.player_inventory p where p.user_id = v_u and p.slot = 0 and p.item_id = i.item_id)
     order by i.item_id limit 1;

    -- v3 THE WEDGE: spending part of a stack (a bench burning its input) lands.
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0002')::uuid, jsonb_build_object('accrued_to', 'now',
           'items', jsonb_build_object(v_held, -1), 'journal', c_kind));
    if coalesce(v->>'ok', '') <> 'true' then
      raise exception 'bag-over-cap §2 v3: a spend from an over-cap bag answered % (the wedge)', v; end if;

    -- v4 GAINING MORE OF WHAT IT HOLDS lands (the block's own stated rule).
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0003')::uuid, jsonb_build_object('accrued_to', 'now',
           'items', jsonb_build_object(v_held, 1), 'journal', c_kind));
    if coalesce(v->>'ok', '') <> 'true' then
      raise exception 'bag-over-cap §2 v4: more of a held stack from an over-cap bag answered %', v; end if;

    -- v5 OVER THE CAP NEVER GROWS: a new stack is refused and leaves the count where it was.
    select count(*) into v_n from public.player_inventory where user_id = v_u and slot = 0;
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0004')::uuid, jsonb_build_object('accrued_to', 'now',
           'items', jsonb_build_object(v_new, 1), 'journal', c_kind));
    if v->>'error' is distinct from 'bank_full'
       or (select count(*) from public.player_inventory where user_id = v_u and slot = 0) <> v_n then
      raise exception 'bag-over-cap §2 v5: a new stack over the cap answered %', v; end if;

    raise exception 'bag-over-cap §2 rollback';
  exception when others then
    if sqlerrm <> 'bag-over-cap §2 rollback' then raise; end if;
  end;
end $mig$;
