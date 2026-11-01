-- ════════════════════════════════════════════════════════════════════════
-- 2027-02-19-bench-tax.sql — THE WORK BENCH TAX: A PUBLIC BENCH TAKES A SHARE OF WHAT A JOB SELLS FOR, AS EACH ACTION SETTLES
-- (Tyler 2026-11-01: "a 'work bench tax' for all the bench skills in the public area ... because you're right, gold starts
-- to be meaningless very quick"; lane/c-bench-tax, backend-architect; the rule and rows: game designer, src/data/bench-tax.js).
--
-- RESTATEMENT-DEBT-ACK: hr_apply (the economy's single write path, 155k chars) takes SEVEN anchored edits; restating it whole
-- for a tax block is the larger risk. hr_gold_kind takes one.
--
-- STATUS: STAGED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit, never 00:00-00:10
-- UTC). Pre-EA: applies on its passing §5; on the EA Security list (hr_apply, a gold sink).
--
-- ── WHAT "A BENCH IN YOUR HOUSE" IS ─────────────────────────────────────────
-- There is no bench in the house a job runs at: every job runs at the town's stations and a room gives furniture and a bonus.
-- The smallest honest reading: the ACCOUNT owning that skill's room at the row's rung (hr_unlock_levels: the home is the
-- account's) means no tax. Gathering is no bench, its journal is not `craft`, and it never reaches this file.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- FEE (milligold) = permille x the shop's bid for the output (hr_hunt_vendor_value, vendorPriceOf's generated copy) x output count.
-- Exact: the hero carries the part under a gold, nothing is rounded, a run costs the same however it is cut. No bid, no fee; no
-- output (the Great Hearth's fuel), no row; under free_under_mg (the designer's cheap goods line, a data row), no fee.
-- The engine (accrual.js accrueArtisan, src/core/bench-tax.js) takes the running job's fee from the `bench_tax` section, stops the
-- span before a craft it cannot pay (STOP_REASON.GOLD: no material is spent on it) and proposes `gold: -fee` + `bench_tax: {crafts}`.
-- hr_apply re-derives it all under the character lock, on every `craft` window of a hero whose SERVER pointer is a bench:
--   hr_bench_tax_settle   the fee from the catalogue, never the delta; the room from hr_unlock_levels; the carry from the locked
--                         row; fee = floor((carry + crafts x mg) / 1000), carry' = the remainder; the delta's gold must be exactly
--                         -fee; crafts is held to what the delta's own materials and credits prove ran.
--   the GOLD block        the fee moves under the purse lock, against what the hero keeps (hr_bench_tax_keep).
-- REFUSALS, all released so the next settle re-reads (a derived key would otherwise replay them for a day):
--   bench_tax_missing  a taxed window with no count (an edge older than this file): owed, never free
--   bench_tax_bad      a count that is not a whole number, or a count on a window that is not a bench's
--   bench_tax_short    a count below what the delta's own spent inputs or credits prove ran
--   bench_tax_changed  the gold is not the server's fee: the room was built, or a price changed, after the engine read
--   bench_tax_purse    another hero spent the purse after the engine read
--
-- ── THE KEEP RULE ───────────────────────────────────────────────────────────
-- "Keep at least N gold" is the hero's floor under spending nobody is pressing a button for (the store bill per use,
-- 2026-12-15-account-gold.sql R6), and a bench running away is exactly that. So a hero who SET it is held to it. A hero who never
-- touched it keeps nothing here: its default of 300 is the hunt's, and the first-hour path stitches a cloak with less than that.
--
-- ── ROWS AND BYTES ──────────────────────────────────────────────────────────
-- Not one row per craft (the game_events lesson): each settled window's ONE `craft` row carries the gold, gold_kind
-- `bench_tax` and meta.delta.bt {c crafts, mg fee, g gold, cr carry after}; a viewed bench settles at most every 15 s, an unviewed
-- one every 90 s. No new ledger rows at any scale. player_state gains an int and a ~120-byte jsonb. The section is ~250 bytes plus
-- ~30 a recipe the hero's level opens at a skill whose room it lacks (a fresh hero ~10 recipes, level 99 at all four ~130, 4 KB).
--
-- EDGE: moves. SAFE EITHER SIDE (the section is the switch, the skill_inputs pattern): an edge deployed FIRST sees no `bench_tax`
-- section and proposes no tax, as today; this file then turns it on with nothing free in between. An old edge AFTER this file gets
-- taxed windows refused bench_tax_missing, owed and never free, until it deploys.
-- REVERSIBILITY: remove the seven BENCH-TAX blocks with the same anchored replace reversed, drop the section row and the
-- functions; the columns are inert. Gold already taken stays in the ledger. ORDER: after 2027-02-19-bench-tax-rates.generated.sql
-- and 2027-02-18-craft-economy-hunt-sessions-catalogue.generated.sql (the bids a fee reads).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS — FAIL CLOSED ──────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_bench_tax_rates') is null or to_regclass('public.hr_hunt_vendor_value') is null then
    raise exception 'PRECONDITION: hr_bench_tax_rates or hr_hunt_vendor_value is absent: apply 2027-02-19-bench-tax-rates.generated.sql first'; end if;
  if to_regprocedure('public.hr_bench_inputs()') is null or to_regprocedure('public.hr_purse_move(uuid,bigint,bigint)') is null
     or to_regprocedure('public.hr_hunt_active_set(uuid,integer)') is null or to_regprocedure('public.hr_skill_level(text,bigint)') is null
     or to_regprocedure('public.hr_unlock_levels(uuid,integer)') is null or to_regprocedure('public.hr_gold_kind(text,text,uuid)') is null then
    raise exception 'PRECONDITION: a helper this file calls is absent'; end if;
  if position('BAG-OVER-CAP' in (select prosrc from pg_proc where oid = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure)) = 0 then
    raise exception 'PRECONDITION: hr_apply is not 2027-02-11-bag-over-cap.sql''s'; end if;
end $mig$;

-- ── §1 THE HERO'S TWO NUMBERS ───────────────────────────────────────────────
-- bench_tax_carry_mg: the milligold owed under one gold; bench_tax_run: this hero's latest bench run, for its end words.
alter table public.player_state add column if not exists bench_tax_carry_mg int not null default 0;
alter table public.player_state add column if not exists bench_tax_run jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.player_state'::regclass and conname = 'player_state_bench_tax_carry') then
    alter table public.player_state add constraint player_state_bench_tax_carry check (bench_tax_carry_mg >= 0 and bench_tax_carry_mg < 1000);
  end if;
end $$;

-- ── §2 THE FEE, RE-DERIVED ──────────────────────────────────────────────────
create or replace function public.hr_bench_tax_keep(p_user uuid, p_slot int)
returns bigint language sql stable set search_path = public, pg_catalog as $$
  -- The hero's own "Keep at least" on its current setup. An untouched control keeps nothing at a bench (the header).
  select greatest(0, coalesce((select (a.options->>'gold_floor')::bigint from public.player_action_sets a
                                where a.user_id = p_user and a.slot = p_slot and a.preset = public.hr_hunt_active_set(p_user, p_slot)), 0))
$$;
revoke all on function public.hr_bench_tax_keep(uuid, int) from public, anon, authenticated, service_role;

-- One job's fee at a public bench, in milligold, whoever asks: 0 = no fee (no row, no bid, under the cheap goods line).
create or replace function public.hr_bench_tax_mg(p_recipe text)
returns bigint language sql stable set search_path = public, pg_catalog as $$
  select coalesce((select case when r.permille::bigint * v.unit * r.qty < r.free_under_mg then 0 else r.permille::bigint * v.unit * r.qty end
                     from public.hr_bench_tax_rates r join public.hr_hunt_vendor_value v on v.item_id = r.output
                    where r.recipe_id = p_recipe), 0)
$$;
revoke all on function public.hr_bench_tax_mg(text) from public, anon, authenticated, service_role;

-- The fee THIS account pays for a job: 0 when it owns the room at the row's rung.
create or replace function public.hr_bench_tax_due_mg(p_user uuid, p_slot int, p_recipe text)
returns bigint language sql stable set search_path = public, pg_catalog as $$
  select case when exists (select 1 from public.hr_bench_tax_rates r
                             join public.hr_unlock_levels(p_user, p_slot) l on l.unlock_id = 'room:' || r.room and l.level >= r.rung
                            where r.recipe_id = p_recipe) then 0
              else public.hr_bench_tax_mg(p_recipe) end
$$;
revoke all on function public.hr_bench_tax_due_mg(uuid, int, text) from public, anon, authenticated, service_role;

-- Called by hr_apply only, with the row it locked. A refusal raises through hr_reject, so the whole apply rolls back.
create or replace function public.hr_bench_tax_settle(p_user uuid, p_slot int, p_st public.player_state, p_delta jsonb, p_taken jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_max_crafts constant bigint := 1000000;
  v_mg bigint; v_key jsonb; v_c bigint; v_gold bigint; v_total bigint := 0;
  v_fee bigint := 0; v_carry int := p_st.bench_tax_carry_mg; v_per bigint; e record; v_run jsonb; v_prior jsonb;
  v_ticks bigint; v_credit boolean; v_keep bigint := null;
begin
  v_mg := public.hr_bench_tax_due_mg(p_user, p_slot, p_st.active_id);
  v_gold := coalesce((p_delta->>'gold')::bigint, 0);

  if v_mg = 0 then
    if v_gold <> 0 then
      perform public.hr_reject('bench_tax_changed', jsonb_build_object('free', true, 'gold', v_gold)); end if;
  else
    v_key := p_delta->'bench_tax';
    if v_key is null then perform public.hr_reject('bench_tax_missing', jsonb_build_object('recipe', p_st.active_id)); end if;
    if jsonb_typeof(v_key) <> 'object' or (select count(*) from jsonb_object_keys(v_key)) <> 1
       or coalesce(v_key->>'crafts', '') !~ '^[0-9]{1,7}$' or (v_key->>'crafts')::bigint > c_max_crafts then
      perform public.hr_reject('bench_tax_bad', jsonb_build_object('why', 'bench_tax carries one field, crafts, a whole number')); end if;
    v_c := (v_key->>'crafts')::bigint;
    -- THE DELTA'S OWN WITNESSES: a count below what the spent inputs prove ran, or none while it credits a product or XP.
    if p_taken is not null then
      for e in select t.key, (t.value #>> '{}')::bigint as qty from jsonb_each(p_taken) t loop
        v_per := coalesce((public.hr_bench_inputs() -> p_st.active_id ->> e.key)::bigint, 0);
        if v_per > 0 and v_c * v_per < e.qty then
          perform public.hr_reject('bench_tax_short', jsonb_build_object('crafts', v_c, 'item', e.key, 'spent', e.qty, 'per', v_per));
        end if;
      end loop;
    end if;
    if v_c = 0 then
      v_credit := coalesce(p_delta->'xp', '{}'::jsonb) <> '{}'::jsonb
                  or exists (select 1 from jsonb_each_text(case when jsonb_typeof(p_delta->'items') = 'object' then p_delta->'items' else '{}'::jsonb end) i
                              where i.value ~ '^\s*\+?0*[1-9][0-9]*\s*$');
      if v_credit then perform public.hr_reject('bench_tax_short', jsonb_build_object('crafts', 0, 'why', 'a credit with no craft')); end if;
    end if;
    v_total := v_carry + v_c * v_mg;
    v_fee := v_total / 1000;
    v_carry := (v_total % 1000)::int;
    if v_gold <> -v_fee then
      perform public.hr_reject('bench_tax_changed', jsonb_build_object('gold', v_gold, 'fee', v_fee, 'mg', v_mg)); end if;
    if v_fee > 0 then v_keep := public.hr_bench_tax_keep(p_user, p_slot); end if;
  end if;

  -- THE RUN'S TALLY: one run is one (recipe, active_since), so nothing has to reset it at a start.
  v_ticks := coalesce(v_c, case when coalesce(p_delta #>> '{journal,meta,ticks}', '') ~ '^[0-9]{1,9}$' then (p_delta #>> '{journal,meta,ticks}')::bigint else 0 end);
  v_prior := case when p_st.bench_tax_run->>'r' = p_st.active_id
                   and (p_st.bench_tax_run->>'s')::timestamptz = p_st.active_since then p_st.bench_tax_run end;
  v_run := jsonb_build_object('r', p_st.active_id, 's', p_st.active_since,
    'c', coalesce((v_prior->>'c')::bigint, 0) + v_ticks,
    'g', coalesce((v_prior->>'g')::bigint, 0) + v_fee,
    'e', case when p_delta #>> '{activity,kind}' = 'idle' then coalesce(p_delta #>> '{journal,meta,stopped}', 'idle') end,
    'at', now());
  return jsonb_strip_nulls(jsonb_build_object('keep', v_keep, 'carry', v_carry, 'run', v_run,
    'bt', case when v_mg > 0 then jsonb_build_object('c', v_c, 'mg', v_mg, 'g', v_fee, 'cr', v_carry) end));
end $$;
revoke all on function public.hr_bench_tax_settle(uuid, int, public.player_state, jsonb, jsonb) from public, anon, authenticated, service_role;

-- ── §3 THE SECTION: THE ENGINE'S SWITCH AND THE WORK WINDOW'S WORDS ─────────
-- now_mg: the running job's fee, the engine's only input (0: no tax). fees: what each recipe this hero's level opens takes, for
-- the Work window; a skill whose room the account owns sends none. rooms: per skill, the share, the room, owned or not.
create or replace function public.hr_bench_tax_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $$
declare v_st record; v_rooms jsonb; v_fees jsonb;
begin
  select ps.bench_tax_carry_mg as carry, ps.bench_tax_run as run, ps.active_kind as kind, ps.active_id as id into v_st
    from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
  if not found then return null; end if;
  with skills as (
    select r.skill, min(r.permille) as permille, min(r.room) as room, min(r.rung) as rung from public.hr_bench_tax_rates r group by r.skill
  ), owned as (
    select s.*, coalesce((select l.level from public.hr_unlock_levels(p_user, p_slot) l where l.unlock_id = 'room:' || s.room), 0) >= s.rung as free,
           coalesce((select public.hr_skill_level(k.skill_id, k.xp) from public.player_skills k where k.user_id = p_user and k.slot = p_slot and k.skill_id = s.skill), 1) as lv
      from skills s
  ), recipes as (
    select r.recipe_id, public.hr_bench_tax_mg(r.recipe_id) as mg from public.hr_bench_tax_rates r
      join owned o on o.skill = r.skill and not o.free
      join public.hr_activities a on a.kind = 'artisan' and a.activity_id = r.recipe_id
     where coalesce(a.req_lv, 1) <= o.lv
  )
  select (select jsonb_object_agg(o.skill, jsonb_build_object('permille', o.permille, 'room', o.room, 'free', o.free)) from owned o),
         coalesce((select jsonb_object_agg(x.recipe_id, x.mg) from recipes x where x.mg > 0), '{}'::jsonb)
    into v_rooms, v_fees;
  return jsonb_build_object('rooms', v_rooms, 'fees', v_fees, 'carry_mg', v_st.carry, 'run', v_st.run,
    'now_mg', case when v_st.kind = 'artisan' and v_st.id is not null then public.hr_bench_tax_due_mg(p_user, p_slot, v_st.id) else 0 end,
    'keep', public.hr_bench_tax_keep(p_user, p_slot));
end $$;
revoke all on function public.hr_bench_tax_view(uuid, int) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_bench_tax_view(uuid, int) from hr_engine;
    revoke all on function public.hr_bench_tax_keep(uuid, int) from hr_engine;
    revoke all on function public.hr_bench_tax_mg(text) from hr_engine;
    revoke all on function public.hr_bench_tax_due_mg(uuid, int, text) from hr_engine;
    revoke all on function public.hr_bench_tax_settle(uuid, int, public.player_state, jsonb, jsonb) from hr_engine;
  end if;
end $$;
insert into public.hr_state_sections (key, fn, note) values
  ('bench_tax', 'hr_bench_tax_view', '2027-02-19-bench-tax.sql: what a public bench takes per job, whether this account''s room takes it off, the carried remainder, the gold kept, this hero''s latest run')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4a A GOLD ROW OF KIND `craft` IS THE TAX ───────────────────────────────
do $mig$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.hr_gold_kind(text,text,uuid)'::regprocedure), chr(13), '');
  if position('bench_tax' in v_def) = 0 then
    if (length(v_def) - length(replace(v_def, E'select case\n', ''))) / length(E'select case\n') <> 1 then
      raise exception 'bench-tax §4a: hr_gold_kind anchor did not match once'; end if;
    v_def := replace(v_def, E'select case\n', E'select case\n    -- BENCH-TAX (2027-02-19-bench-tax.sql): a bench run has no other gold move.\n    when p_kind = ''craft'' then ''bench_tax''\n');
    execute v_def;
  end if;
end $mig$;
revoke all on function public.hr_gold_kind(text, text, uuid) from public, anon, authenticated, service_role;
do $mig$
begin
  if position('bench_tax' in (select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_gold_kind')) = 0 then
    alter table public.player_ledger drop constraint player_ledger_gold_kind;
    alter table public.player_ledger add constraint player_ledger_gold_kind
      check (gold_kind is null or gold_kind in ('hunt_loot', 'hunt_sale', 'hunt_supply', 'shop', 'house', 'vendor_sale',
        'stamina', 'blessing', 'rename', 'hero_slot', 'storage', 'farm', 'start_kit', 'town_work', 'clan', 'trade', 'trait', 'fold', 'tally', 'other',
        'bench_tax')) not valid;
  end if;
end $mig$;

-- ── §4b hr_apply — SEVEN ANCHORED EDITS (RESTATEMENT-DEBT-ACK in the header) ─
-- Every anchor must match EXACTLY once or the block raises. A body that already carries the BENCH-TAX marker is this
-- file's post-image: skipped.
do $mig$
declare
  v_def text; v_n int; i int;
  a text[] := array[
$a$  v_skill_take jsonb;
$a$,
$a$    'active_left',
$a$,
$a$    -- ── GOLD ─────────────────────────────────────────────────────────────
$a$,
$a$        v_new_gold := public.hr_purse_move(v_uid, v_n, 0);
        if v_new_gold is null then
          perform public.hr_reject('insufficient_gold',
$a$,
$a$       set -- (gold: the ACCOUNT purse, moved at the GOLD block above, 2026-12-15-account-gold.sql)
$a$,
$a$    -- SKILLS-FROM-STORAGE: what the account's Storage paid of this settle's bench inputs (the rest left the bag).
$a$,
$a$          or (v_out->>'error' = 'insufficient_item' and v_out ? 'storage')) then
$a$];
  r text[] := array[
$a$  v_skill_take jsonb;
  -- BENCH-TAX (2027-02-19-bench-tax.sql): hr_bench_tax_settle's answer for this window, and the gold the fee may not go under.
  v_tax jsonb;
  v_tax_keep bigint;
$a$,
$a$    'active_left',
    -- BENCH-TAX: the engine's count of a taxed window's crafts (hr_bench_tax_settle re-derives the fee from it).
    'bench_tax',
$a$,
$a$    -- ── BENCH-TAX (2027-02-19-bench-tax.sql; Tyler 2026-11-01) ──────────────
    -- A `craft` window of a hero whose SERVER pointer is a bench: the fee is re-derived here, whole, before the purse (the
    -- one lock order holds: the take above, then the purse, last). What it answers moves at the GOLD block and the state update.
    v_tax := null;
    v_tax_keep := null;
    if p_delta ? 'accrued_to' and p_delta #>> '{journal,kind}' = 'craft'
       and v_st.active_kind = 'artisan' and v_st.active_id is not null then
      v_tax := public.hr_bench_tax_settle(v_uid, v_slot, v_st, p_delta, v_skill_cost);
      v_tax_keep := (v_tax->>'keep')::bigint;
    elsif p_delta ? 'bench_tax' then
      perform public.hr_reject('bench_tax_bad', jsonb_build_object('why', 'a count on a window that is not a bench''s'));
    end if;

    -- ── GOLD ─────────────────────────────────────────────────────────────
$a$,
$a$        -- BENCH-TAX: the fee stops at what the hero keeps; a shortfall is a statement about the engine's read (released below).
        v_new_gold := public.hr_purse_move(v_uid, v_n, coalesce(v_tax_keep, 0));
        if v_new_gold is null then
          perform public.hr_reject(case when v_tax_keep is not null then 'bench_tax_purse' else 'insufficient_gold' end,
$a$,
$a$       set -- (gold: the ACCOUNT purse, moved at the GOLD block above, 2026-12-15-account-gold.sql)
           -- BENCH-TAX: the carried remainder and this hero's latest run, from the LOCKED row and the server's own fee.
           bench_tax_carry_mg = coalesce((v_tax->>'carry')::int, bench_tax_carry_mg),
           bench_tax_run = coalesce(v_tax->'run', bench_tax_run),
$a$,
$a$    -- BENCH-TAX: the window's crafts, the fee, the gold and the carry after, as the server derived them (one row a window).
    if v_tax ? 'bt' then
      v_meta := v_meta || jsonb_build_object('bt', v_tax->'bt');
    end if;
    -- SKILLS-FROM-STORAGE: what the account's Storage paid of this settle's bench inputs (the rest left the bag).
$a$,
$a$          or (v_out->>'error' = 'insufficient_item' and v_out ? 'storage')
          -- BENCH-TAX: every refusal is about the engine's read (the shared purse, the room, a price, an older edge); stored, the
          -- re-derived key would replay it for a day, because the hero's version did not move.
          or v_out->>'error' like 'bench\_tax\_%') then
$a$];
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if position('BENCH-TAX' in v_def) > 0 then
    raise notice 'bench-tax §4b: hr_apply already carries the tax - patch skipped'; return;
  end if;
  for i in 1 .. array_length(a, 1) loop
    v_n := (length(v_def) - length(replace(v_def, a[i], ''))) / length(a[i]);
    if v_n <> 1 then raise exception 'bench-tax §4b: hr_apply anchor % matched % times', i, v_n; end if;
    v_def := replace(v_def, a[i], r[i]);
  end loop;
  execute v_def;
end $mig$;
revoke all on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) to hr_engine;

-- ── §5 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ─────────
-- Every branch fails on the pre-image. The whole game, the real engine and both paths: tests/bench-tax.mjs.
do $mig$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-00000219f501';
  k   constant text := '000000c0-0000-4000-b000-00000219';
  v jsonb; v_ver bigint; v_recipe text; v_out text; v_in jsonb; v_item text; v_per bigint; v_room text; v_rung int; v_purse bigint;
  c_j constant jsonb := jsonb_build_object('kind', 'craft', 'intent', 'accrue', 'meta', jsonb_build_object('ticks', 4));
  v_fn text;
begin
  -- (a) NO CLIENT REACHES THE NEW SURFACE.
  foreach v_fn in array array['public.hr_bench_tax_settle(uuid,integer,public.player_state,jsonb,jsonb)', 'public.hr_bench_tax_view(uuid,integer)',
                              'public.hr_bench_tax_keep(uuid,integer)', 'public.hr_bench_tax_mg(text)', 'public.hr_bench_tax_due_mg(uuid,integer,text)',
                              'public.hr_apply(uuid,integer,bigint,uuid,jsonb)'] loop
    if has_function_privilege('anon', v_fn::regprocedure, 'execute') or has_function_privilege('authenticated', v_fn::regprocedure, 'execute') then
      raise exception 'bench-tax §5(a): % is reachable by a client', v_fn; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_state' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and 'authenticated' = any (roles)) then
    raise exception 'bench-tax §5(a): a client write policy stands on player_state'; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'bench-tax §5 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'bench-tax §5: hr_create_character refused: %', v; end if;

    -- A one-input Smithing recipe at the probe's own fee, 2.5 g (so this does not break on the designer's next number).
    select r.recipe_id, r.output, b.value, r.room, r.rung into v_recipe, v_out, v_in, v_room, v_rung
      from public.hr_bench_tax_rates r join jsonb_each(public.hr_bench_inputs()) b on b.key = r.recipe_id
     where r.skill = 'smithing' and (select count(*) from jsonb_object_keys(b.value)) = 1 order by r.recipe_id limit 1;
    if v_recipe is null then raise exception 'bench-tax §5-harness: no one-input smithing recipe'; end if;
    update public.hr_bench_tax_rates set permille = 500, qty = 1, free_under_mg = 500 where recipe_id = v_recipe;
    insert into public.hr_hunt_vendor_value (item_id, unit) values (v_out, 5) on conflict (item_id) do update set unit = 5;
    if public.hr_bench_tax_mg(v_recipe) <> 2500 then raise exception 'bench-tax §5: the fee of bid 5 at 50%% is %', public.hr_bench_tax_mg(v_recipe); end if;
    select i.key, (i.value #>> '{}')::bigint into v_item, v_per from jsonb_each(v_in) i;
    update public.player_state set active_kind = 'artisan', active_id = v_recipe, active_since = now() - interval '1 hour',
           accrued_to = now() - interval '1 hour', bench_tax_carry_mg = 0 where user_id = v_u and slot = 0;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty) values (v_u, 0, v_item, 100 * v_per)
      on conflict (user_id, slot, item_id) do update set qty = excluded.qty;
    update public.account_wallet set gold = 1000 where user_id = v_u;

    -- (b) AN OLD EDGE: a taxed window with no count is refused and the key is released; nothing moved.
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0001')::uuid, jsonb_build_object('accrued_to', 'now', 'items', jsonb_build_object(v_item, -v_per), 'journal', c_j));
    if v->>'error' is distinct from 'bench_tax_missing' then raise exception 'bench-tax §5(b): a window with no count answered %', v; end if;
    if exists (select 1 from public.player_intents where user_id = v_u and intent_id = (k || '0001')::uuid) then raise exception 'bench-tax §5(b): the refusal kept its key'; end if;

    -- (c) THE GOLD IS THE SERVER'S: 4 crafts at 2.5 g is 10 g; 9 is refused, and so is a count the spent inputs disprove.
    v := public.hr_apply(v_u, 0, v_ver, (k || '0002')::uuid, jsonb_build_object('accrued_to', 'now', 'gold', -9, 'bench_tax', jsonb_build_object('crafts', 4),
           'items', jsonb_build_object(v_item, -4 * v_per), 'journal', c_j));
    if v->>'error' is distinct from 'bench_tax_changed' then raise exception 'bench-tax §5(c): a short fee answered %', v; end if;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0003')::uuid, jsonb_build_object('accrued_to', 'now', 'gold', -2, 'bench_tax', jsonb_build_object('crafts', 1),
           'items', jsonb_build_object(v_item, -4 * v_per), 'journal', c_j));
    if v->>'error' is distinct from 'bench_tax_short' then raise exception 'bench-tax §5(c): a low count answered %', v; end if;
    if (select gold from public.account_wallet where user_id = v_u) <> 1000 then raise exception 'bench-tax §5(c): a refused window moved gold'; end if;

    -- (d) THE CARRY: 3 crafts at 2.5 g is 7 g and 500 mg over; the next 1 craft is 3 g, carry 0. Nothing lost or minted.
    v := public.hr_apply(v_u, 0, v_ver, (k || '0004')::uuid, jsonb_build_object('accrued_to', 'now', 'gold', -7, 'bench_tax', jsonb_build_object('crafts', 3),
           'items', jsonb_build_object(v_item, -3 * v_per), 'journal', c_j));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'bench-tax §5(d): the honest window answered %', v; end if;
    if (select bench_tax_carry_mg from public.player_state where user_id = v_u and slot = 0) <> 500 then raise exception 'bench-tax §5(d): the carry is wrong'; end if;
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0005')::uuid, jsonb_build_object('accrued_to', 'now', 'gold', -3, 'bench_tax', jsonb_build_object('crafts', 1),
           'items', jsonb_build_object(v_item, -v_per), 'journal', c_j));
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> 990
       or (select bench_tax_carry_mg from public.player_state where user_id = v_u and slot = 0) <> 0 then
      raise exception 'bench-tax §5(d): 4 crafts at 2.5 g were not 10 g: %', v; end if;

    -- (e) THE LEDGER: a gold row filed bench_tax, with the server's own account of the window.
    if not exists (select 1 from public.player_ledger l where l.user_id = v_u and l.kind = 'craft' and l.gold = -3 and l.gold_kind = 'bench_tax'
                    and l.purse = 990 and (l.meta #>> '{delta,bt,c}')::int = 1 and (l.meta #>> '{delta,bt,mg}')::int = 2500) then
      raise exception 'bench-tax §5(e): no bench_tax ledger row'; end if;

    -- (f) THE PURSE NEVER GOES UNDER WHAT THE HERO SET TO KEEP, and that refusal is released too.
    insert into public.player_action_sets (user_id, slot, preset, name, slots, options)
      values (v_u, 0, public.hr_hunt_active_set(v_u, 0), 'probe', '[]'::jsonb, jsonb_build_object('gold_floor', 988))
      on conflict (user_id, slot, preset) do update set options = public.player_action_sets.options || jsonb_build_object('gold_floor', 988);
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0006')::uuid, jsonb_build_object('accrued_to', 'now', 'gold', -5, 'bench_tax', jsonb_build_object('crafts', 2),
           'items', jsonb_build_object(v_item, -2 * v_per), 'journal', c_j));
    if v->>'error' is distinct from 'bench_tax_purse' then raise exception 'bench-tax §5(f): a fee under the keep answered %', v; end if;
    if exists (select 1 from public.player_intents where user_id = v_u and intent_id = (k || '0006')::uuid) then raise exception 'bench-tax §5(f): the refusal kept its key'; end if;

    -- (g) THE ROOM: owned at the rung, no fee; a gold proposal is refused and an untaxed window lands.
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      select v_u, 0, u.progress_kind, 'room:' || v_room, '', v_rung from public.hr_unlocks u where u.unlock_id = 'room:' || v_room
      on conflict do nothing;
    if (public.hr_bench_tax_view(v_u, 0) #>> array['rooms', 'smithing', 'free']) is distinct from 'true'
       or (public.hr_bench_tax_view(v_u, 0) -> 'now_mg') is distinct from '0'::jsonb then
      raise exception 'bench-tax §5(g): the section does not say the room takes it off'; end if;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0007')::uuid, jsonb_build_object('accrued_to', 'now', 'gold', -5, 'bench_tax', jsonb_build_object('crafts', 2),
           'items', jsonb_build_object(v_item, -2 * v_per), 'journal', c_j));
    if v->>'error' is distinct from 'bench_tax_changed' then raise exception 'bench-tax §5(g): gold from a house bench answered %', v; end if;
    v_purse := (select gold from public.account_wallet where user_id = v_u);
    v := public.hr_apply(v_u, 0, v_ver, (k || '0008')::uuid, jsonb_build_object('accrued_to', 'now', 'items', jsonb_build_object(v_item, -2 * v_per), 'journal', c_j));
    if coalesce(v->>'ok', '') <> 'true' or (select gold from public.account_wallet where user_id = v_u) <> v_purse then
      raise exception 'bench-tax §5(g): a house bench window answered %', v; end if;

    -- (h) NOT A BENCH: a count on anything else is refused; gathering and the rest never reach the fee.
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, (k || '0009')::uuid, jsonb_build_object('bench_tax', jsonb_build_object('crafts', 1), 'journal', jsonb_build_object('kind', 'admin', 'intent', 'probe')));
    if v->>'error' is distinct from 'bench_tax_bad' then raise exception 'bench-tax §5(h): a stray count answered %', v; end if;

    raise exception using errcode = 'HRB19', message = 'bench-tax §5 complete - rolling back';
  exception when sqlstate 'HRB19' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from auth.users where id = v_u) then raise exception 'bench-tax §5: LEAKED a probe row'; end if;
  raise notice 'bench-tax: the fee is the server''s, carried to the milligold, under the keep; a house bench is free; no client reaches it; all green';
end $mig$;
