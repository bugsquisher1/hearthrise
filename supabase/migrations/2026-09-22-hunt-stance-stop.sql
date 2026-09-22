-- ════════════════════════════════════════════════════════════════════════════
-- RESTATEMENT-DEBT-ACK: this file adds 2 anchored patches to hr_apply (chain depth 3 since the 2026-09-14 restatement) and 1 to hr_state_of. A restatement was considered and is the WRONG trade here: hr_apply is ~3,000 lines this lane did not author, and a wholesale copy of it inside a feature migration is a diff no reviewer can read - which is exactly the review failure the Security gate on this set exists to prevent. Both anchors are asserted to match EXACTLY ONCE and RAISE otherwise, so neither can no-op in silence, and the patched text is 20 lines. A joint restatement of hr_apply and hr_state_of is owed BEFORE the next patch on either body and is named in this lane's report as debt for the Coordinator to schedule.
-- 2026-09-22-hunt-stance-stop.sql — A HUNT IS THE POINTER, PLUS TWO COLUMNS.
--
-- docs/design/HUNTS_AND_ANALYZER.md §1: four columns on player_state already
-- ARE a hunt (active_kind, active_id, active_since, accrued_to). This file adds
-- the only two things they do not say — HOW to fight and WHEN to stop — and
-- nothing else.
--
--   player_state.hunt_stance  text  null   -> hr_hunt_stances (the catalogue)
--   player_state.hunt_stop    jsonb null   -> hr_hunt_stop_valid (the shape)
--
-- ── NO NEW INTENT VERB (design §9) ──────────────────────────────────────────
-- `set_activity` grows two OPTIONAL fields. A new verb would duplicate the
-- whole refusal, journal, rate-gate and catalogue path for no new capability,
-- and would be a second place "what is this character doing" is written.
-- hr_apply's `activity` arm is patched at two anchors to accept them; the
-- allowlist that arm already enforces (`array['kind','id','restart']`) is what
-- kept them out, which is exactly the behaviour that made this safe to grow.
--
-- ── A STANCE NEVER CARRIES A MULTIPLIER (design §2.2, and §7(b) proves it) ──
-- hr_hunt_stances holds THREE columns and they are the three shipped knobs:
-- the auto-eat threshold, what to do when the quiver is dry, and how many
-- consecutive falls end the hunt. There is no damage column, no rate column and
-- no bonus column, and the self-check asserts that by reading information_schema
-- rather than by believing this comment. The moment a stance pays power it is a
-- balance surface, a thing to sell, and a second combat path to keep at AWAY-1.
--
-- ── WHAT A FORGED CALL CAN DO: CHANGE ITS OWN BEDTIME ───────────────────────
-- Stance and stop carry no power, so forging one buys a player a different
-- auto-eat threshold and a different stopping rule (design §5). Both are
-- re-validated here against a server catalogue and a server CHECK; a value
-- outside the published bounds is REFUSED, never clamped, so a client cannot
-- discover a hidden maximum by pushing at one.
--
-- ── LANE C. STAGED, NOT APPLIED. No money moves in this file (the gold sink is
--    2026-09-22-vigour-refill.sql), but it writes player_state and patches
--    hr_apply, so it takes a Security review before apply like every other
--    body change.
--
-- REVERSIBILITY
--   alter table public.player_state drop column hunt_stop, drop column hunt_stance;
--   drop function public.hr_hunt_stop_valid(jsonb);
--   drop table public.hr_hunt_stances;
--   -- then re-apply 2026-09-14-hr-apply-restatement.sql and
--   -- 2026-09-14-hr-state-of-restatement.sql to drop the two patches.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.player_state') is null then
    raise exception 'player_state is missing'; end if;
  if to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'PRECONDITION: hr_apply is absent - apply 2026-09-14-hr-apply-restatement.sql FIRST'; end if;
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'PRECONDITION: hr_state_of is absent - apply 2026-09-14-hr-state-of-restatement.sql FIRST'; end if;
end $$;

-- ── 1. THE STANCE CATALOGUE — three rows, three knobs, no fourth column ────
-- A TABLE and not a CHECK list, because "validated against a server catalogue"
-- is the property the design asks for and a CHECK list is a second copy of
-- src/core/hunt.js STANCES that no query can compare against. The FK below is
-- what makes a forged stance a 23503 rather than a silent write.
--
-- ⚠ EVERY COLUMN HERE IS A KNOB THAT ALREADY SHIPPED:
--     eat_at    src/core/auto-eat.js  DEFAULT_THRESHOLD is steady's value
--     ammo_dry  src/core/ammo.js      'swing' pays AMMO_DRY_MULT, as today
--     falls     player_state.consec_falls, read by src/core/away.js
--   A column that is not one of those three is a multiplier wearing a name, and
--   §7(b) fails the apply on one.
create table if not exists public.hr_hunt_stances (
  stance_id text primary key,
  eat_at    numeric not null check (eat_at >= 0 and eat_at <= 1),
  ammo_dry  text    not null check (ammo_dry in ('stop','swing')),
  falls     int              check (falls is null or falls >= 1)
);

insert into public.hr_hunt_stances (stance_id, eat_at, ammo_dry, falls) values
  ('careful',  0.75, 'stop',  2),
  ('steady',   0.50, 'swing', null),
  ('reckless', 0.25, 'swing', null)
on conflict (stance_id) do update
  set eat_at = excluded.eat_at, ammo_dry = excluded.ammo_dry, falls = excluded.falls;

comment on table public.hr_hunt_stances is
  'HUNT STANCES (2026-09-22). The server catalogue player_state.hunt_stance is validated against. THREE columns, and each is a knob that already shipped (auto-eat threshold, dry-quiver policy, consecutive-fall stop). A stance NEVER carries a multiplier, a rate or a bonus - design HUNTS_AND_ANALYZER.md 2.2; the migration''s section-4 self-check asserts the column set. Mirrors src/core/hunt.js STANCES, which is the runtime copy both the live tick and the away replay read.';

alter table public.hr_hunt_stances enable row level security;
revoke all on public.hr_hunt_stances from public, anon, authenticated, service_role;
-- READ-ONLY to signed-in clients: the panel renders three buttons and must not
-- hold its own copy of what they mean (CLAUDE.md 6, residue-ahead).
grant select on public.hr_hunt_stances to authenticated;
drop policy if exists hr_hunt_stances_read on public.hr_hunt_stances;
create policy hr_hunt_stances_read on public.hr_hunt_stances for select to authenticated using (true);

-- ── 2. THE STOP SHAPE — one definition, used by the CHECK and by §7 ────────
-- A FLOOR, NEVER AN ESCROW (design 2.3). A reservation would be a second copy
-- of an inventory quantity, which is the exact shape of a dupe.
--
-- IMMUTABLE so it may be used in a CHECK constraint. Every bound is the one
-- src/core/hunt.js STOP_BOUNDS publishes; the two are compared by
-- tests/hunt-stance-stop.mjs rather than trusted to agree.
create or replace function public.hr_hunt_stop_valid(p_stop jsonb)
returns boolean language sql immutable set search_path = public, pg_catalog as $$
  select case
    when p_stop is null then true
    when jsonb_typeof(p_stop) <> 'object' then false
    -- every key is a known rule
    when exists (select 1 from jsonb_object_keys(p_stop) as t(k)
                  where k <> all (array['hours','food_floor','ammo_floor','falls','bag_full'])) then false
    -- the four integers: correct type and INSIDE their bounds (refused, not clamped)
    when (p_stop ? 'hours') and not (jsonb_typeof(p_stop->'hours') = 'number'
          and (p_stop->>'hours') ~ '^\d+$'
          and (p_stop->>'hours')::bigint between 1 and 24) then false
    when (p_stop ? 'food_floor') and not (jsonb_typeof(p_stop->'food_floor') = 'number'
          and (p_stop->>'food_floor') ~ '^\d+$'
          and (p_stop->>'food_floor')::bigint between 0 and 10000) then false
    when (p_stop ? 'ammo_floor') and not (jsonb_typeof(p_stop->'ammo_floor') = 'number'
          and (p_stop->>'ammo_floor') ~ '^\d+$'
          and (p_stop->>'ammo_floor')::bigint between 0 and 100000) then false
    when (p_stop ? 'falls') and not (jsonb_typeof(p_stop->'falls') = 'number'
          and (p_stop->>'falls') ~ '^\d+$'
          and (p_stop->>'falls')::bigint between 1 and 10) then false
    when (p_stop ? 'bag_full') and jsonb_typeof(p_stop->'bag_full') <> 'boolean' then false
    else true
  end
$$;

comment on function public.hr_hunt_stop_valid(jsonb) is
  'THE STOP-RULE SHAPE (2026-09-22). One definition, used by player_state''s CHECK and by hr_apply. Bounds mirror src/core/hunt.js STOP_BOUNDS. A value outside a bound is REFUSED, never clamped: a clamp lets a client discover a hidden maximum by pushing at one.';

revoke execute on function public.hr_hunt_stop_valid(jsonb) from public;
revoke execute on function public.hr_hunt_stop_valid(jsonb) from anon, service_role;

-- ── 3. THE TWO COLUMNS ─────────────────────────────────────────────────────
-- BOTH NULLABLE, both defaulting to TODAY'S BEHAVIOUR (design 6): a null stance
-- reads as 'steady' in src/core/hunt.js stanceOf, which is what the engine does
-- now, so nobody is opted into a change by this migration.
alter table public.player_state add column if not exists hunt_stance text;
alter table public.player_state add column if not exists hunt_stop   jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_hunt_stance_fk') then
    alter table public.player_state
      add constraint player_state_hunt_stance_fk
      foreign key (hunt_stance) references public.hr_hunt_stances(stance_id);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.player_state'::regclass
                    and conname = 'player_state_hunt_stop_shape') then
    alter table public.player_state
      add constraint player_state_hunt_stop_shape
      check (public.hr_hunt_stop_valid(hunt_stop));
  end if;
end $$;

comment on column public.player_state.hunt_stance is
  'HOW to fight (2026-09-22). NULL = steady = today''s behaviour. FK to hr_hunt_stances; carries no multiplier.';
comment on column public.player_state.hunt_stop is
  'WHEN to stop (2026-09-22). NULL = no rules. A FLOOR, never an escrow: {hours,food_floor,ammo_floor,falls,bag_full}. Evaluated INSIDE the settle by the one engine - no scheduler, no timer row, no second writer.';

-- ── 4. hr_apply — TWO ANCHORED PATCHES, no restatement ─────────────────────
-- The 2026-08-28-client-state.sql idiom: pg_get_functiondef + a guarded replace
-- asserted to match EXACTLY ONCE, so this file never restates a body it did not
-- author and can never silently delete another file's arm. NO-OP on re-apply.
do $miga$
declare
  v_def text;
  -- A1: the activity arm's KEY ALLOWLIST. This is the line that has been
  --     refusing `stance` and `stop` all along, which is why growing the verb
  --     is a patch here and not a new door anywhere else.
  v_a1 constant text :=
       '      if exists (select 1 from jsonb_object_keys(v_act) as t(ak)' || chr(10)
    || '                  where ak <> all (array[''kind'',''id'',''restart''])) then' || chr(10)
    || '        perform public.hr_reject(''bad_activity'', jsonb_build_object(''why'', ''unknown activity key''));' || chr(10)
    || '      end if;';
  -- A2: the UPDATE's first activity assignment. Both new columns are written
  --     beside it so the pointer and its two standing orders move in ONE
  --     statement under the row lock the apply already holds.
  v_a2 constant text := '           active_kind  = coalesce(v_act->>''kind'', active_kind),';
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');

  if strpos(v_def, 'HUNT STANCE AND STOP (2026-09-22)') > 0 then
    raise notice 'hr_apply already accepts hunt stance/stop - skipping (idempotent no-op)';
  else
    if (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1 then
      raise exception 'ANCHOR A1 (the activity key allowlist) matched % times, expected 1 - refusing to patch blind',
        (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1);
    end if;
    if (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1 then
      raise exception 'ANCHOR A2 (the activity UPDATE assignment) matched % times, expected 1 - refusing to patch blind',
        (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2);
    end if;

    v_def := replace(v_def, v_a1,
      $anc$      -- HUNT STANCE AND STOP (2026-09-22) - the activity statement grows TWO
      -- OPTIONAL FIELDS and no new verb (design 9). The allowlist is still an
      -- allowlist: five keys, and anything else is still bad_activity.
      if exists (select 1 from jsonb_object_keys(v_act) as t(ak)
                  where ak <> all (array['kind','id','restart','stance','stop'])) then
        perform public.hr_reject('bad_activity', jsonb_build_object('why', 'unknown activity key'));
      end if;
      -- THE STANCE IS RE-VALIDATED AGAINST THE SERVER CATALOGUE. The edge asks
      -- the same question one round trip earlier; this is the authority, and it
      -- is what a compromised engine cannot lie to. `null` is legal and means
      -- "clear it" (back to steady, today's behaviour).
      if (v_act ? 'stance') and jsonb_typeof(v_act->'stance') <> 'null' then
        if jsonb_typeof(v_act->'stance') <> 'string'
           or not exists (select 1 from public.hr_hunt_stances
                           where stance_id = v_act->>'stance') then
          perform public.hr_reject('unknown_stance',
            jsonb_build_object('stance', v_act->'stance'));
        end if;
      end if;
      -- THE STOP RULES ARE RE-VALIDATED AGAINST THE PUBLISHED BOUNDS. Refused,
      -- never clamped (design 2.3), and answered BY NAME here so the CHECK on
      -- player_state cannot surface as an opaque 23514 from inside the UPDATE.
      if (v_act ? 'stop') and jsonb_typeof(v_act->'stop') <> 'null' then
        if not public.hr_hunt_stop_valid(v_act->'stop') then
          perform public.hr_reject('bad_stop', jsonb_build_object('stop', v_act->'stop'));
        end if;
      end if;$anc$);

    v_def := replace(v_def, v_a2,
      $anc$           -- HUNT STANCE AND STOP (2026-09-22). Written beside the pointer, in
           -- the SAME statement under the SAME row lock, because they are one
           -- declaration: "fight this, this way, until that". PRESENCE is the
           -- switch - an absent key leaves the standing order alone, and an
           -- explicit json `null` CLEARS it (back to steady / no rules). That
           -- distinction is why `jsonb_typeof(...) = 'null'` appears rather
           -- than a coalesce: a client must be able to turn a rule OFF.
           hunt_stance  = case when v_act ? 'stance'
                               then case when jsonb_typeof(v_act->'stance') = 'null'
                                         then null else v_act->>'stance' end
                               else hunt_stance end,
           hunt_stop    = case when v_act ? 'stop'
                               then case when jsonb_typeof(v_act->'stop') = 'null'
                                         then null else v_act->'stop' end
                               else hunt_stop end,
           active_kind  = coalesce(v_act->>'kind', active_kind),$anc$);

    execute v_def;
    raise notice 'hr_apply patched: the activity statement carries a stance and a stop object';
  end if;
end $miga$;

-- create-or-replace preserves an ACL; be explicit anyway. hr_apply is ENGINE-ONLY.
revoke execute on function public.hr_apply(uuid,integer,bigint,uuid,jsonb)
  from public, anon, authenticated, service_role;

-- ── 5. hr_state_of — PROJECT both, flat, beside consec_falls ───────────────
-- WHY THE ENVELOPE AND NOT A READ: a stance the client holds locally is a
-- residue-ahead gate (CLAUDE.md 6) - the panel would render a selected button
-- the server does not agree with, which is the "browser says one thing, the
-- server says another" class Tyler ruled on 2026-09-14. Flat, like every other
-- scalar, so a missing column cannot hide behind a nested default.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'consec_falls', v_st.consec_falls,$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'hunt_stance', v_st.hunt_stance$q$) > 0 then
    raise notice 'hr_state_of already projects the hunt columns - patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of consec_falls anchor did not match exactly once - its shape is not the one this file was derived against. Do NOT patch a body you cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor, c_anchor || $new$
      -- HUNT STANCE AND STOP (2026-09-22). The two standing orders, projected
      -- RAW: NULL means "no stance chosen" (which the engine reads as steady,
      -- today's behaviour) and an ABSENT KEY means "this database predates
      -- hunts". The client distinguishes those two by PRESENCE, never by
      -- coalescing - so an older deployment renders no Hunt panel rather than
      -- a fabricated one.
      'hunt_stance', v_st.hunt_stance,
      'hunt_stop', v_st.hunt_stop,$new$);
  execute v_def;
  raise notice 'hr_state_of patched: the envelope projects hunt_stance and hunt_stop';
end $$;
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 6. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) ───────────────────────────
-- Properties proven by EXECUTING them, not by matching markers. The apply is
-- atomic, so a raise here reverts every section above it.
--
-- ⚠ EVERY ROW-WRITING PROBE IS INSIDE A SUBTRANSACTION DISCARDED BY A SENTINEL
--   RAISE (HR922), and the probe touches ONLY the synthetic user it created.
--   tests/selfcheck-no-global-dml.mjs is the guard that keeps that true:
--   2026-09-19 shipped a self-check that deleted every player's aged ledger rows
--   to simulate a prune. Nothing here deletes anything it did not insert.
do $$
declare
  v_uid  constant uuid := '00000000-0000-4000-8000-0000b5510001';
  v_cols text[];
  v_n    int;
  v_r    jsonb;
  v_env  jsonb;
  v_ver  bigint;
begin
  -- (a) THE STANCE CATALOGUE CARRIES NO FOURTH KNOB. Read from the catalog,
  --     not from this file's own CREATE TABLE: a later migration that added a
  --     `damage_mult` column would pass a marker check and fail this one.
  --     THIS IS design §2.2 AS AN EXECUTABLE ASSERTION.
  select array_agg(column_name::text order by column_name) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'hr_hunt_stances';
  if v_cols is distinct from array['ammo_dry','eat_at','falls','stance_id'] then
    raise exception 'GATE(a): hr_hunt_stances columns are % - a stance may carry ONLY the three shipped knobs (auto-eat threshold, dry-quiver policy, consecutive falls). A fourth column is a multiplier wearing a name.', v_cols;
  end if;
  select count(*) into v_n from public.hr_hunt_stances;
  if v_n <> 3 then raise exception 'GATE(a): % stance rows, expected exactly 3', v_n; end if;
  if not exists (select 1 from public.hr_hunt_stances where stance_id = 'steady' and eat_at = 0.50) then
    raise exception 'GATE(a): steady is not the shipped DEFAULT_THRESHOLD (0.50) - somebody would be opted into a change by this migration';
  end if;

  -- (b) THE BOUNDS REFUSE, THEY DO NOT CLAMP. Asserted through the one
  --     definition, at both edges of all four integers plus the type rules.
  if not public.hr_hunt_stop_valid(null) then raise exception 'GATE(b): null stop must be legal'; end if;
  if not public.hr_hunt_stop_valid('{}'::jsonb) then raise exception 'GATE(b): an empty stop must be legal'; end if;
  if not public.hr_hunt_stop_valid('{"hours":1}'::jsonb)  then raise exception 'GATE(b): hours=1 is in bounds'; end if;
  if not public.hr_hunt_stop_valid('{"hours":24}'::jsonb) then raise exception 'GATE(b): hours=24 is in bounds'; end if;
  if     public.hr_hunt_stop_valid('{"hours":0}'::jsonb)  then raise exception 'GATE(b): hours=0 was ACCEPTED - the lower bound does not bite'; end if;
  if     public.hr_hunt_stop_valid('{"hours":25}'::jsonb) then raise exception 'GATE(b): hours=25 was ACCEPTED - the upper bound does not bite'; end if;
  if     public.hr_hunt_stop_valid('{"falls":0}'::jsonb)  then raise exception 'GATE(b): falls=0 was ACCEPTED'; end if;
  if     public.hr_hunt_stop_valid('{"falls":11}'::jsonb) then raise exception 'GATE(b): falls=11 was ACCEPTED'; end if;
  if     public.hr_hunt_stop_valid('{"food_floor":10001}'::jsonb)  then raise exception 'GATE(b): food_floor over the bound was ACCEPTED'; end if;
  if     public.hr_hunt_stop_valid('{"ammo_floor":100001}'::jsonb) then raise exception 'GATE(b): ammo_floor over the bound was ACCEPTED'; end if;
  if     public.hr_hunt_stop_valid('{"bag_full":"yes"}'::jsonb)    then raise exception 'GATE(b): a STRING bag_full was ACCEPTED'; end if;
  if     public.hr_hunt_stop_valid('{"hours":2.5}'::jsonb)         then raise exception 'GATE(b): a FRACTIONAL hours was ACCEPTED'; end if;
  if     public.hr_hunt_stop_valid('{"forever":true}'::jsonb)      then raise exception 'GATE(b): an UNKNOWN rule key was ACCEPTED - the allowlist is not one'; end if;
  if     public.hr_hunt_stop_valid('[]'::jsonb)                    then raise exception 'GATE(b): an ARRAY was ACCEPTED as a stop object'; end if;

  -- (c) THE ENVELOPE PROJECTS BOTH, TOP-LEVEL INSIDE `state`. Not "the body
  --     mentions hunt_stance" - the exact spliced expression, because a key
  --     spelled in a comment is not a key the client can read.
  if strpos(replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), ''),
            $q$'hunt_stance', v_st.hunt_stance,$q$) = 0 then
    raise exception 'GATE(c): hr_state_of does not project hunt_stance';
  end if;
  if strpos(replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), ''),
            $q$'hunt_stop', v_st.hunt_stop,$q$) = 0 then
    raise exception 'GATE(c): hr_state_of does not project hunt_stop';
  end if;

  -- (d) THE COLUMNS ARE NULLABLE AND UNDEFAULTED - "today's behaviour" is not a
  --     value this migration wrote onto 36 live characters, it is the absence
  --     of one. A DEFAULT here would be a silent opt-in.
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='player_state'
                and column_name in ('hunt_stance','hunt_stop')
                and (is_nullable <> 'YES' or column_default is not null)) then
    raise exception 'GATE(d): a hunt column is NOT NULL or carries a DEFAULT - every existing character would be opted into a stance nobody chose';
  end if;

  begin  -- ── SUBTRANSACTION: every row below belongs to v_uid ───────────────
    insert into auth.users (id) values (v_uid);
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    v_r := public.hr_create_character(0);
    if v_r->>'created' <> 'true' then raise exception 'GATE(e): no probe character: %', v_r; end if;

    -- (e1) A FRESH CHARACTER CARRIES NEITHER, and the envelope says so with
    --      NULLs rather than with absent keys.
    v_env := public.hr_state_of(v_uid, 0);
    if not (v_env->'state' ? 'hunt_stance') or not (v_env->'state' ? 'hunt_stop') then
      raise exception 'GATE(e1): the envelope omits a hunt key - the client cannot tell "no stance" from "no hunts in this build"';
    end if;
    if jsonb_typeof(v_env->'state'->'hunt_stance') <> 'null' then
      raise exception 'GATE(e1): a fresh character already carries a stance';
    end if;
    v_ver := (v_env->>'version')::bigint;

    -- (e2) THE HAPPY PATH THROUGH hr_apply, which is the ONLY writer. A real
    --      activity statement carrying both fields.
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'activity', jsonb_build_object('kind','combat','id','goblin','restart',true,
                                     'stance','careful','stop', jsonb_build_object('hours',8,'bag_full',true)),
      'journal',  jsonb_build_object('kind','admin','intent','set_activity:combat:goblin')));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(e2): a legal stance+stop was refused: %', v_r;
    end if;
    if (v_r->'state'->>'hunt_stance') <> 'careful' then
      raise exception 'GATE(e2): the stance did not land: %', v_r->'state'->'hunt_stance';
    end if;
    if (v_r->'state'->'hunt_stop'->>'hours') <> '8' then
      raise exception 'GATE(e2): the stop rules did not land: %', v_r->'state'->'hunt_stop';
    end if;
    v_ver := (v_r->>'version')::bigint;

    -- (e3) A FORGED STANCE BUYS NOTHING. Refused BY NAME against the server
    --      catalogue - not clamped to steady, and not written.
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'activity', jsonb_build_object('kind','combat','id','goblin','stance','godmode'),
      'journal',  jsonb_build_object('kind','admin','intent','set_activity:combat:goblin')));
    if v_r->>'error' is distinct from 'unknown_stance' then
      raise exception 'GATE(e3): a forged stance answered % - it must be unknown_stance', v_r;
    end if;
    if (select hunt_stance from public.player_state where user_id = v_uid and slot = 0) <> 'careful' then
      raise exception 'GATE(e3): the REFUSED apply moved the stance anyway';
    end if;

    -- (e4) AN OUT-OF-BOUNDS STOP IS REFUSED, NEVER CLAMPED. This is the
    --      property that stops a client discovering the maximum by pushing.
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'activity', jsonb_build_object('kind','combat','id','goblin','stop', jsonb_build_object('hours',9999)),
      'journal',  jsonb_build_object('kind','admin','intent','set_activity:combat:goblin')));
    if v_r->>'error' is distinct from 'bad_stop' then
      raise exception 'GATE(e4): hours=9999 answered % - it must be bad_stop, and it must NOT be clamped to 24', v_r;
    end if;
    if (select (hunt_stop->>'hours')::int from public.player_state where user_id = v_uid and slot = 0) <> 8 then
      raise exception 'GATE(e4): the refused stop CHANGED the stored rules';
    end if;

    -- (e5) AN UNKNOWN ACTIVITY KEY IS STILL bad_activity. The allowlist grew by
    --      exactly two; it did not become a door.
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'activity', jsonb_build_object('kind','combat','id','goblin','multiplier',10),
      'journal',  jsonb_build_object('kind','admin','intent','set_activity:combat:goblin')));
    if v_r->>'error' is distinct from 'bad_activity' then
      raise exception 'GATE(e5): an unknown activity key answered % - the allowlist stopped being one', v_r;
    end if;

    -- (e6) EXPLICIT NULL CLEARS. A player must be able to turn a rule OFF, and
    --      an absent key must leave it alone - the two are different gestures.
    v_r := public.hr_apply(v_uid, 0, v_ver, gen_random_uuid(), jsonb_build_object(
      'activity', jsonb_build_object('kind','combat','id','goblin','stance', null),
      'journal',  jsonb_build_object('kind','admin','intent','set_activity:combat:goblin')));
    if coalesce(v_r->>'ok','false') <> 'true' then
      raise exception 'GATE(e6): clearing the stance was refused: %', v_r; end if;
    if jsonb_typeof(v_r->'state'->'hunt_stance') <> 'null' then
      raise exception 'GATE(e6): an explicit null did not CLEAR the stance';
    end if;
    if (v_r->'state'->'hunt_stop'->>'hours') <> '8' then
      raise exception 'GATE(e6): clearing the stance also cleared the stop rules - an absent key must leave a standing order alone';
    end if;

    raise exception using errcode = 'HR922', message = 'hunt-stance-stop §6 complete - rolling back';
  exception when sqlstate 'HR922' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  -- ROLLBACK PROOF. Without this the file seeds a character into production as
  -- a side effect of verifying itself, which CLAUDE.md §2 forbids outright.
  if exists (select 1 from public.player_state     where user_id = v_uid)
     or exists (select 1 from public.player_skills    where user_id = v_uid)
     or exists (select 1 from public.player_inventory where user_id = v_uid)
     or exists (select 1 from public.player_equipment where user_id = v_uid)
     or exists (select 1 from public.player_progress  where user_id = v_uid)
     or exists (select 1 from public.player_ledger    where user_id = v_uid)
     or exists (select 1 from public.player_intents   where user_id = v_uid)
     or exists (select 1 from auth.users             where id = v_uid) then
    raise exception 'GATE: §6 LEAKED a probe row';
  end if;

  raise notice 'hunt-stance-stop: the catalogue carries only the three shipped knobs, the bounds refuse rather than clamp, the envelope projects both columns, and EXECUTED - a legal declaration lands, a forged stance is unknown_stance, an out-of-range stop is bad_stop and changes nothing, an unknown key is still bad_activity, and an explicit null clears exactly one standing order - all green, net zero';
end $$;
