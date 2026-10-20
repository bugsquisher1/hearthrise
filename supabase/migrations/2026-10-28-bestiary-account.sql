-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE ACCOUNT BESTIARY (Tyler 2026-10-19). STAGED. Game CLOSED:
-- applies on its passing §6; MONEY SURFACE (a gold sink + a relic drop lift),
-- Security reviews it with the reopen gate.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 public.account_bestiary (user_id, monster_id) -> kills, activated_stage.
--    ONE row per ACCOUNT and monster: every character of the account adds to it.
--    RLS on, zero policies, no client / engine / tick privilege.
-- §2 THE COUNT. Kills are still written by the hunt settle only (hr_apply's
--    progress op stat 'ev:kill_monster:<id>', per character, unchanged); an
--    AFTER INSERT / UPDATE OF value trigger on player_progress adds the same
--    increment to the account row in the SAME transaction, for monsters in
--    hr_bestiary_monsters (generated, 2026-10-28-bestiary-catalogue.generated.sql).
--    A character's deletion never lowers the account's count (no delete arm).
--    One-shot fold of the per-character counters that exist today (idempotent:
--    on conflict do nothing, so a re-apply never counts twice).
-- §3 THE SECTION `account_bestiary` (hr_bestiary_view), folded into hr_state_of
--    by the section registry: per monster {monster, level, grounds[{hunt, rarity}],
--    kills, stage, activated_stage, relic_mult, next_stage, next_stage_kills,
--    next_fee, can_activate, has_relic}, plus `stages` and the compact
--    `relic_mult` map {monster: mult} the engine's member assembly reads.
--    (Not `bestiary`: hr-accrue already emits a top-level `bestiary` block after
--    spreading hr_state_of, which would overwrite a section of that name.)
-- §4 THE VERB hr_bestiary_activate(p_slot, p_monster, p_stage, p_price, p_idem)
--    — MONEY. Shape -> idempotency replay -> rate gate -> catalogue -> the
--    CHARACTER lock (hr_hunt_lock: gold is per hero) -> the ACCOUNT bestiary lock
--    (the advisory key the §2 trigger takes) -> the row FOR UPDATE -> refusals:
--      no_relic (the monster drops no relic: no fee for nothing),
--      already_active (stage <= activated), needs_previous_stage (stage > activated+1),
--      not_enough_kills {have, need} (gold never skips kills), quote_changed
--      (p_price is not the server's fee; carries the section) -> ONE hr_apply
--      {gold: -fee} journalled kind shop, intent bestiary_stage:<monster>:<stage>
--      (insufficient_gold is hr_apply's; gold never goes negative) -> the stage
--      written. Idempotent on hr_apply's player_intents row.
--    fee = fee_mult(stage) x (base + per_level x hr_monster_level(monster)).
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   LOCK ORDER: character advisory (uid:slot) [+ its rows] -> account bestiary
--   advisory (uid:bestiary) -> account_bestiary row. The instance settle takes
--   every member's character lock up front (hr_hunt_apply_instance step 4)
--   BEFORE any kill reaches the trigger; the verb takes its character lock before
--   the bestiary lock; nothing takes a character lock after the bestiary lock.
--   The advisory key serialises all of one account's row writes, so two
--   settles that touch the same monsters in different orders cannot deadlock.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- A gold sink (gold never comes back) and a relic-row drop lift capped at x1.25
-- (src/core/drops.js clamps to MAX_RELIC_MULT). No client value prices it or
-- counts a kill; the only writer of activated_stage is §4, of kills §2.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Drop hr_bestiary_activate (+ baseline row), the section row, hr_bestiary_view,
-- hr_bestiary_fee_of, the trigger + hr_bestiary_count, account_bestiary.
-- ORDER: after 2026-10-28-bestiary-catalogue.generated.sql. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_bestiary_stages') is null or to_regclass('public.hr_bestiary_fee') is null
     or to_regclass('public.hr_bestiary_monsters') is null then
    raise exception 'PRECONDITION: the bestiary catalogue (2026-10-28-bestiary-catalogue.generated.sql) is absent'; end if;
  if to_regclass('public.hr_state_sections') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_monster_level(text)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'PRECONDITION: the section registry, the hunt lock, hr_monster_level or hr_apply is absent'; end if;
end $mig$;

-- ── §1 THE ACCOUNT TABLE ─────────────────────────────────────────────────────
create table if not exists public.account_bestiary (
  user_id         uuid not null references auth.users (id) on delete cascade,
  monster_id      text not null check (monster_id ~ '^[a-z0-9_]{1,40}$'),
  kills           bigint not null default 0 check (kills >= 0),
  activated_stage smallint not null default 0 check (activated_stage between 0 and 9),
  activated_at    timestamptz,
  updated_at      timestamptz not null default now(),
  primary key (user_id, monster_id)
);
alter table public.account_bestiary enable row level security;
alter table public.account_bestiary force row level security;
revoke all on public.account_bestiary from public, anon, authenticated, service_role;
comment on table public.account_bestiary is
  '2026-10-28 (Tyler 2026-10-19): the ACCOUNT bestiary. kills: written only by the player_progress trigger '
  'hr_bestiary_count (the hunt settle''s kill counter); activated_stage: written only by hr_bestiary_activate.';

-- ── §2 THE COUNT ─────────────────────────────────────────────────────────────
create or replace function public.hr_bestiary_count()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_m text; v_n bigint;
begin
  v_n := new.value - case when tg_op = 'UPDATE' then old.value else 0 end;
  if v_n is null or v_n <= 0 then return null; end if;
  v_m := substr(new.key, length('ev:kill_monster:') + 1);
  if not exists (select 1 from public.hr_bestiary_monsters b where b.monster_id = v_m) then return null; end if;
  -- THE ACCOUNT BESTIARY LOCK (hr_bestiary_activate takes the same key).
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':bestiary', 0));
  insert into public.account_bestiary as a (user_id, monster_id, kills, updated_at)
    values (new.user_id, v_m, v_n, now())
    on conflict (user_id, monster_id) do update set kills = a.kills + excluded.kills, updated_at = now();
  return null;
end $$;
revoke execute on function public.hr_bestiary_count() from public, anon, authenticated, service_role;
create or replace trigger player_progress_account_bestiary
  after insert or update of value on public.player_progress
  for each row when (new.kind = 'stat' and new.period_key = '' and new.key like 'ev:kill\_monster:%')
  execute function public.hr_bestiary_count();

-- THE FOLD of today's per-character counters (once: a row that exists is never touched again).
insert into public.account_bestiary (user_id, monster_id, kills)
select pp.user_id, substr(pp.key, length('ev:kill_monster:') + 1), sum(pp.value)
  from public.player_progress pp
 where pp.kind = 'stat' and pp.period_key = '' and pp.key like 'ev:kill\_monster:%' and pp.value > 0
   and exists (select 1 from public.hr_bestiary_monsters b where b.monster_id = substr(pp.key, length('ev:kill_monster:') + 1))
 group by 1, 2
on conflict (user_id, monster_id) do nothing;

-- ── §3 THE FEE AND THE SECTION ───────────────────────────────────────────────
create or replace function public.hr_bestiary_fee_of(p_stage int, p_monster text)
returns bigint language sql stable security definer set search_path = public, pg_catalog as $$
  select s.fee_mult::bigint * (f.base + f.per_level * greatest(1, public.hr_monster_level(p_monster)))
    from public.hr_bestiary_stages s, public.hr_bestiary_fee f
   where s.stage = p_stage and f.id
$$;
revoke execute on function public.hr_bestiary_fee_of(int, text) from public, anon, authenticated, service_role;

create or replace function public.hr_bestiary_view(p_user uuid, p_slot int)
returns jsonb language sql stable security definer set search_path = public, pg_catalog as $$
  with mon as (
    select m.monster_id, min(m.ord) as ord, bool_or(m.has_relic) as has_relic,
           jsonb_agg(jsonb_build_object('hunt', m.hunt_id, 'rarity', m.rarity) order by m.ord) as grounds
      from public.hr_bestiary_monsters m group by m.monster_id),
  row_ as (
    select mon.*, coalesce(a.kills, 0) as kills, coalesce(a.activated_stage, 0) as act,
           coalesce((select max(s.stage) from public.hr_bestiary_stages s where s.kills <= coalesce(a.kills, 0)), 0) as stage
      from mon left join public.account_bestiary a on a.user_id = p_user and a.monster_id = mon.monster_id),
  full_ as (
    select r.*, nx.stage as next_stage, nx.kills as next_kills, public.hr_bestiary_fee_of(nx.stage, r.monster_id) as next_fee,
           coalesce((select round(s.relic_permille / 1000.0, 3) from public.hr_bestiary_stages s where s.stage = r.act), 1.000) as relic_mult
      from row_ r left join public.hr_bestiary_stages nx on nx.stage = r.act + 1)
  select jsonb_build_object(
    'stages', (select jsonb_agg(jsonb_build_object('stage', s.stage, 'kills', s.kills, 'relic_mult', round(s.relic_permille / 1000.0, 3))
                                order by s.stage) from public.hr_bestiary_stages s),
    'relic_mult', coalesce((select jsonb_object_agg(f.monster_id, f.relic_mult) from full_ f where f.act > 0), '{}'::jsonb),
    'monsters', coalesce((select jsonb_agg(jsonb_build_object(
        'monster', f.monster_id, 'level', public.hr_monster_level(f.monster_id), 'grounds', f.grounds,
        'kills', f.kills, 'stage', f.stage, 'activated_stage', f.act, 'relic_mult', f.relic_mult,
        'next_stage', f.next_stage, 'next_stage_kills', f.next_kills, 'next_fee', f.next_fee,
        'can_activate', f.next_stage is not null and f.kills >= f.next_kills and f.has_relic, 'has_relic', f.has_relic)
      order by f.ord) from full_ f), '[]'::jsonb))
   where exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot)
$$;
revoke execute on function public.hr_bestiary_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('account_bestiary', 'hr_bestiary_view', '2026-10-28-bestiary-account.sql: the ACCOUNT bestiary - kills, stages, activated stage, relic multiplier, next fee per ground monster')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 THE ACTIVATION ────────────────────────────────────────────────────────
create or replace function public.hr_bestiary_activate(p_slot int, p_monster text, p_stage int, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_a jsonb;
  v_b public.account_bestiary%rowtype; v_kills bigint; v_act int; v_need bigint; v_fee bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('bestiary_activate', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('bestiary_activate', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_monster is null or p_monster !~ '^[a-z0-9_]{1,40}$' or p_stage is null or p_stage < 1 or p_stage > 9
     or p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection('bestiary_activate', p_slot, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_verb := 'bestiary_stage:' || p_monster || ':' || p_stage;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('bestiary_activate', p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.hr_bestiary_monsters m where m.monster_id = p_monster) then
    return public.hr_note_rejection('bestiary_activate', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_monster')); end if;
  -- A STAGE BUYS ONLY A RELIC LIFT: a monster that drops no relic takes no fee for nothing.
  if not exists (select 1 from public.hr_bestiary_monsters m where m.monster_id = p_monster and m.has_relic) then
    return public.hr_note_rejection('bestiary_activate', p_slot, jsonb_build_object('ok', false, 'error', 'no_relic')); end if;
  select s.kills into v_need from public.hr_bestiary_stages s where s.stage = p_stage;
  if v_need is null then
    return public.hr_note_rejection('bestiary_activate', p_slot, jsonb_build_object('ok', false, 'error', 'unknown_stage')); end if;
  -- THE CHARACTER LOCK (its gold), then THE ACCOUNT BESTIARY LOCK (the §2 trigger's key), then the row.
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection('bestiary_activate', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':bestiary', 0));
  select * into v_b from public.account_bestiary where user_id = v_uid and monster_id = p_monster for update;
  v_kills := coalesce(v_b.kills, 0);
  v_act := coalesce(v_b.activated_stage, 0);
  if p_stage <= v_act then
    return public.hr_note_rejection('bestiary_activate', p_slot, jsonb_build_object('ok', false, 'error', 'already_active', 'activated_stage', v_act)); end if;
  if p_stage > v_act + 1 then
    return public.hr_note_rejection('bestiary_activate', p_slot, jsonb_build_object('ok', false, 'error', 'needs_previous_stage', 'activated_stage', v_act)); end if;
  if v_kills < v_need then
    return public.hr_note_rejection('bestiary_activate', p_slot, jsonb_build_object('ok', false, 'error', 'not_enough_kills', 'have', v_kills, 'need', v_need)); end if;
  v_fee := public.hr_bestiary_fee_of(p_stage, p_monster);
  if v_fee is null or v_fee <> p_price then
    return public.hr_note_rejection('bestiary_activate', p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed',
      'account_bestiary', public.hr_bestiary_view(v_uid, p_slot))); end if;
  v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
           'gold', -v_fee,
           'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                         'meta', jsonb_build_object('reason', 'bestiary_stage', 'monster', p_monster, 'stage', p_stage,
                                                                    'kills', v_kills, 'level', public.hr_monster_level(p_monster), 'fee', v_fee))));
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection('bestiary_activate', p_slot, v_a || jsonb_build_object('ok', false)); end if;
  update public.account_bestiary set activated_stage = p_stage, activated_at = now(), updated_at = now()
   where user_id = v_uid and monster_id = p_monster;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'gold', -v_fee, 'stage', p_stage,
                            'account_bestiary', public.hr_bestiary_view(v_uid, p_slot));
end $$;
revoke execute on function public.hr_bestiary_activate(int, text, int, bigint, uuid) from public;
revoke execute on function public.hr_bestiary_activate(int, text, int, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_bestiary_activate(int, text, int, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_bestiary_activate';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_bestiary_activate', 'p_slot integer, p_monster text, p_stage integer, p_price bigint, p_idem uuid', 'authenticated',
   'added 2026-10-28 (Tyler 2026-10-19): MONEY (a gold sink) - activate the next reached account bestiary stage of a monster at the server''s fee; refuses quote_changed / not_enough_kills');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_u constant uuid := '000000c0-0000-0000-0000-0000b0570001';
  v jsonb; s jsonb; m jsonb; v_role text; v_fee bigint; v_ver bigint; v_gold bigint;
  c_rat constant text := 'rat';
begin
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'bestiary-account §6 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(0) refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(1) refused: %', v; end if;
    -- (a) the section rides hr_state_of, every ground monster at zero.
    s := public.hr_state_of(v_u, 0)->'account_bestiary';
    if s is null or jsonb_array_length(s->'monsters') <> (select count(distinct monster_id) from public.hr_bestiary_monsters)
       or (s->'relic_mult') <> '{}'::jsonb then raise exception 'VERIFY(a): the empty section is %', s; end if;
    -- (a2) a monster with no relic takes no fee (no shipped row carries a relic yet: the probe's rat is given one).
    v := public.hr_bestiary_activate(0, c_rat, 1, public.hr_bestiary_fee_of(1, c_rat), '000000c0-0000-4000-a000-0000b0570100');
    if v->>'error' is distinct from 'no_relic' then raise exception 'VERIFY(a2): a relic-less monster answered %', v; end if;
    update public.hr_bestiary_monsters set has_relic = true where monster_id = c_rat;
    -- (b) kills from BOTH characters land on ONE account count (the settle's progress op, through hr_apply).
    select version into v_ver from public.player_state where user_id = v_u and slot = 0;
    v := public.hr_apply(v_u, 0, v_ver, '000000c0-0000-4000-a000-0000b0570101',
           jsonb_build_object('progress', jsonb_build_array(jsonb_build_object('kind', 'stat', 'key', 'ev:kill_monster:' || c_rat, 'add', 1000))));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the slot-0 kills were refused: %', v; end if;
    -- (c) below the threshold: not_enough_kills with the server's count, nothing charged.
    update public.player_state set gold = 1000000 where user_id = v_u and slot in (0, 1);
    v_fee := public.hr_bestiary_fee_of(1, c_rat);
    v := public.hr_bestiary_activate(0, c_rat, 1, v_fee, '000000c0-0000-4000-a000-0000b0570102');
    if v->>'error' is distinct from 'not_enough_kills' or (v->>'have')::bigint <> 1000 or (v->>'need')::bigint <> 1250 then
      raise exception 'VERIFY(c): 1,000 kills answered %', v; end if;
    select version into v_ver from public.player_state where user_id = v_u and slot = 1;
    v := public.hr_apply(v_u, 1, v_ver, '000000c0-0000-4000-a000-0000b0570103',
           jsonb_build_object('progress', jsonb_build_array(jsonb_build_object('kind', 'stat', 'key', 'ev:kill_monster:' || c_rat, 'add', 300))));
    if (select kills from public.account_bestiary where user_id = v_u and monster_id = c_rat) <> 1300 then
      raise exception 'VERIFY(b): two characters'' 1,000 + 300 kills count %', (select kills from public.account_bestiary where user_id = v_u and monster_id = c_rat); end if;
    select e into m from jsonb_array_elements(public.hr_state_of(v_u, 1)->'account_bestiary'->'monsters') e where e->>'monster' = c_rat;
    if (m->>'kills')::bigint <> 1300 or (m->>'stage')::int <> 1 or (m->>'activated_stage')::int <> 0 or (m->>'can_activate')::boolean is not true
       or (m->>'next_fee')::bigint <> v_fee or (m->>'next_stage_kills')::bigint <> 1250 then
      raise exception 'VERIFY(b): the second character reads %', m; end if;
    -- (d) a wrong price is quote_changed; an empty purse is hr_apply's insufficient_gold; neither charges.
    v := public.hr_bestiary_activate(0, c_rat, 1, v_fee + 1, '000000c0-0000-4000-a000-0000b0570104');
    if v->>'error' is distinct from 'quote_changed' then raise exception 'VERIFY(d): a wrong price answered %', v; end if;
    update public.player_state set gold = v_fee - 1 where user_id = v_u and slot = 0;
    v := public.hr_bestiary_activate(0, c_rat, 1, v_fee, '000000c0-0000-4000-a000-0000b0570105');
    if v->>'error' is distinct from 'insufficient_gold' or (select gold from public.player_state where user_id = v_u and slot = 0) <> v_fee - 1
       or (select activated_stage from public.account_bestiary where user_id = v_u and monster_id = c_rat) <> 0 then
      raise exception 'VERIFY(d): a short purse answered %', v; end if;
    -- (e) the activation: the fee, once, journalled; the stage is the account's.
    update public.player_state set gold = 1000000 where user_id = v_u and slot = 0;
    v := public.hr_bestiary_activate(0, c_rat, 1, v_fee, '000000c0-0000-4000-a000-0000b0570106');
    v_gold := (select gold from public.player_state where user_id = v_u and slot = 0);
    if coalesce(v->>'ok', '') <> 'true' or v_gold <> 1000000 - v_fee
       or (select count(*) from public.player_ledger where user_id = v_u and slot = 0 and kind = 'shop' and intent = 'bestiary_stage:rat:1' and gold = -v_fee) <> 1 then
      raise exception 'VERIFY(e): the activation answered %', v; end if;
    if (public.hr_state_of(v_u, 1)->'account_bestiary'->'relic_mult'->>c_rat)::numeric <> 1.05 then
      raise exception 'VERIFY(e): the other character does not read the stage: %', public.hr_state_of(v_u, 1)->'account_bestiary'->'relic_mult'; end if;
    -- (f) a replay charges nothing; the next stage needs its kills; a skip and a repeat are refused.
    v := public.hr_bestiary_activate(0, c_rat, 1, v_fee, '000000c0-0000-4000-a000-0000b0570106');
    if (select gold from public.player_state where user_id = v_u and slot = 0) <> v_gold
       or (select count(*) from public.player_ledger where user_id = v_u and intent like 'bestiary\_stage:%') <> 1 then
      raise exception 'VERIFY(f): a replay charged again: %', v; end if;
    v := public.hr_bestiary_activate(1, c_rat, 2, public.hr_bestiary_fee_of(2, c_rat), '000000c0-0000-4000-a000-0000b0570107');
    if v->>'error' is distinct from 'not_enough_kills' then raise exception 'VERIFY(f): stage 2 at 1,300 kills answered %', v; end if;
    v := public.hr_bestiary_activate(1, c_rat, 3, public.hr_bestiary_fee_of(3, c_rat), '000000c0-0000-4000-a000-0000b0570108');
    if v->>'error' is distinct from 'needs_previous_stage' then raise exception 'VERIFY(f): skipping to stage 3 answered %', v; end if;
    v := public.hr_bestiary_activate(1, c_rat, 1, v_fee, '000000c0-0000-4000-a000-0000b0570109');
    if v->>'error' is distinct from 'already_active' then raise exception 'VERIFY(f): a second stage 1 answered %', v; end if;
    raise exception using errcode = 'HR877', message = 'bestiary-account §6 complete - rolling back';
  exception when sqlstate 'HR877' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.account_bestiary where user_id = v_u) then
    raise exception 'VERIFY(g): §6 LEAKED a probe row'; end if;
  -- (g) THE GRANTS: no client reaches the table or the readers; anon cannot activate.
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.account_bestiary', 'select,insert,update,delete') then
      raise exception 'VERIFY(g): % reaches account_bestiary', v_role; end if;
    if has_function_privilege(v_role, 'public.hr_bestiary_view(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_bestiary_fee_of(integer,text)', 'execute')
       or has_function_privilege(v_role, 'public.hr_bestiary_count()', 'execute') then
      raise exception 'VERIFY(g): % reaches a bestiary reader', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_bestiary_activate(integer,text,integer,bigint,uuid)', 'execute') then
    raise exception 'VERIFY(g): anon reaches hr_bestiary_activate'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'account_bestiary') then
    raise exception 'VERIFY(g): account_bestiary has a policy'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'bestiary-account: kills counted per account, stages activated once for the server''s fee; all green';
end $$;
