-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1051-company-start.sql — THE COMPANY: ONE PLAN A HERO, LINES SET ONCE FOR ALL, ONE START THE SERVER EXPANDS
--   (lane/c-company FB-6, backend-architect, 2026-11-22; docs/design/overhaul/13-build-plan.md FB-6 as re-aimed by
--   docs/design/redesign/02-architecture.md package 9 (approved by Tyler 2026-11-22: "The company plan", "One Start"); designer rulings
--   D-2 (review/05-designer-rulings.md section 2: "Wear upgrades" a standing plan line, the leader is the engine's front hero by ROLE_ORDER and
--   may be pinned) and D-11 (no rest plan ends in a hunt); S-14 a (own heroes: the rest hunt on); RD-Q6 a (a company is 1 to 4 heroes:
--   nothing here assumes four slots).
--
-- STATUS: supabase/migration-notes/1051-company-start.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1024-carry-on.sql (whose press it replaces) and 1025-own-heroes-apart.sql
--   (the nullable party_leave_together the "If one falls" line writes). Applied as ONE transaction; never begin/commit here. Ends with §4.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- TABLES (RLS on, no policy, no client grant; written only by the verbs below, read through the `company` section):
--   company_plans (user_id PK)         the account's standing lines: wear_upgrades (default on: D-2 rule 1, "On for a new account").
--                                      No row = the defaults.
--   hero_plans (user_id, slot PK)      one plan a hero: hunt_id, the plan's ground (a hero with no last hunt goes there; a plan newer than
--                                      its last hunt wins over "what it did last"), party_with, the own hero it hunts beside once both are
--                                      free (the party door with a hunting hero). FK to player_state, cascade.
--   hunt_parties.lead_pin_user/slot    the leader the player pinned (D-2 rule 4). It holds while that hero is a member; otherwise the
--                                      default is back: the front hero by ROLE_ORDER, then the higher Level, then the lower slot (rules 1-2).
-- VERBS (authenticated; each takes a key, answers its receipt on a replay, refuses in machine codes, moves no gold, item or XP):
--   hr_company_line_set(p_line, p_value, p_idem)   a line set once for every hero of the account:
--        wear_upgrades  'on' | 'off'           company_plans.wear_upgrades
--        if_one_falls   'hunt_on' | 'all_home' every hero's party_leave_together: null (the S-14 a default: own heroes hunt on, a party
--                                              with a friend leaves together as 10-22 ruled) or true (all come home)
--   hr_hero_plan_set(p_slot, p_hunt, p_idem)       this hero's plan ground (null clears). A hero in a party edits the party's ground
--                                                  while the party is in town (D-2 rule 6: the leader's row holds the party's ground).
--   hr_ground_setup_set(p_slot, p_hunt, p_preset, p_idem)  this ground points at one of the hero's saved Setups (hunt_density.preset,
--                                                  the pointer every Enter already writes). Setup 0 always exists.
--   hr_party_lead_set(p_slot, p_lead, p_idem)      pin the leader of a party that seats only this account's heroes (p_lead an own slot
--                                                  in it), or null to unpin. In town only.
--   hr_party_seat_own (RESTATED, internal to hr_hunt_party_invite_own): an own hero that is hunting, or an inviter hunting with no
--                                                  party, is no longer refused member_hunting / hunt_open: the joiner's plan holds
--                                                  party_with, the answer says `pending`, and the next Start seats it once both are free.
--   hr_hunt_party_invite_own (RESTATED): the same checks and receipt; its answer carries the inviter's envelope (rule 11).
-- Every verb here answers with the envelope of the hero it names (`envelope`), or of every hero (`envelopes`, the line verb); the receipt
--   a replayed key answers carries none.
--   hr_carry_on(p_slots int[], p_gold bigint, p_idem uuid)  THE ONE START, 1024's press restated with the company's shape.
-- ENGINE-ONLY (granted to hr_engine alone, its c_engine_allow entry is 1032's link 25, tools/derive-grant-hygiene.mjs):
--   hr_company_wear_apply(p_uid, p_slots int[], p_lines jsonb, p_idem uuid)  "WEAR UPGRADES", THE SERVER'S PICK (designer D-2): the
--                                                  hr-accrue verb `company_wear` (supabase/functions/hr-accrue/company-wear.js) reads each
--                                                  named hero's own hr_state_of, makes src/core/upgrade-pick.js's pick (companyWearLines: its
--                                                  own bag first, then a piece another named own hero holds and does not wear) and hands the
--                                                  lines here. Postgres decides whether each may go on: the caller's own heroes only, in town
--                                                  and idle (a running job is never stamped: its unpaid window stays the engine's to pay), each
--                                                  hero's lines ONE hr_apply equip delta (ownership, slot, requirement, two hands), a pass
--                                                  through the account's Storage (hr_bank_move_stack deposit then withdraw, each journalled).
--                                                  A hero whose lines the gate refuses keeps its gear and is named; the others still dress.
--                                                  The client presses it before the Start (carry-on-intents.js carryOn) when the line is on.
--   hr_carry_on_plan(p_slots)                       unchanged signature; its plan now also reads the plan's ground, each ground's Setup,
--                                                  the pending seat (`joins`) and the account's lines.
-- THE START, per go hero, in its own subtransaction, through the doors that already exist:
--   (0) under the locks, before any hero moves: the pending seats (hero_plans.party_with), then each own party's leader (the pin, else
--       the front hero), so the plan read under the locks sees the parties the heroes will hunt in
--   (1) loot by plan  (2) Tamsin pays  (3) Blessings        as 1024
--   (4) THE GROUND'S SETUP: hr_hunt_preset_apply (the player's own Use) when the ground points at a saved Setup other than the one in use
--   (6) Storage first  (7) hunt again through hr_hunt_enter_for  as 1024, with the plan's ground and the ground's Setup
--   (8) TAMSIN'S TASK TAKEN ON ENTRY (GR-78): the ground's task, when the hero does not hold it, has a free place and has picked a weight
-- REFUSAL CODES NEW: none (party_hunting, not_own_party, unknown_preset, bad_line reuse the existing words or are added to refusal-words.js).
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Lock order, the same as 1024 and the party verbs: the parties (sorted ids: every party a hero of the press sits in, or will be seated
--   into), then the heroes (hr_hunt_lock, slot order: the go heroes and the pending joiners that are free), then the account's Storage key.
--   The pending seats and the leader run under those locks; the plan is then read again under them, so what one press starts is what the
--   locked rows say. The press's key answers its first receipt; every door it calls takes a key derived from it (md5(key || step || slot)).
--   The line verbs and the plan verbs take the account's or the hero's rows they write, each under its key (player_intents).
--
-- ── EXPLOIT SURFACE DELTA ────────────────────────────────────────────────────
-- Four authenticated verbs that write the caller's own configuration (a boolean, a ground id checked against hr_hunt_grounds, a Setup
--   number checked against the hero's own rows, a seat of a party of the caller's own heroes). The wear is engine-only: the server picks
--   (src/core/upgrade-pick.js) and every line is a piece the VERIFIED caller's own hero holds, put on through hr_apply's equip gate, or passed
--   between two of the caller's own idle heroes through the account's Storage (the bank door, journalled). No client authors a wear line. Nothing reaches another account: a party that seats another account's hero is never
--   re-led (`not_own_party`), and the pending seat joins only the caller's own heroes. No price, no count and no item is trusted from the
--   client: the press still re-reads the plan under its locks and refuses a gold figure it did not show (quote_changed).
--
-- ── COST ─────────────────────────────────────────────────────────────────────
-- Off the settle path. Two small tables: one row an account, one row a hero (four at most an account). A plan read adds one PK read a hero
--   (hero_plans) and one (hunt_density) for the ground's Setup. The section adds two PK reads and one read of the account's heroes (four
--   rows at most) to an envelope. At 100x players: about 2,400 company rows and 9,600 hero rows, under 2 MB.
--
-- BROWSER: src/session/carry-on-intents.js (the press with the wear list, the lines, the plan ground, the pointer, the pin),
--   src/shell/carry-on.js and src/shell/windows/away.js (the company card's lines), src/shell/needs-you.js (the return card's providers).
-- GUARDS: tests/carry-on.mjs (CO-FOUR, CO-ONE, CO-DOOR, CO-SETUP, CO-DRESS, CO-LINES, CO-LEAD, viewed and closed), tests/needs-you.mjs.
-- REVERSIBLE: drop the four verbs, the section row, the two tables and the two columns; re-apply 1024-carry-on.sql's plan and press and the
--   2026-10-28-party-flow.sql image of hr_party_seat_own (§0 pins it). WIPE: nothing to keep.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ────────────────────────────────────────────────
do $mig$
declare v_src text;
begin
  if to_regprocedure('public.hr_carry_on_plan_of(uuid,integer[])') is null
     or to_regprocedure('public.hr_hunt_preset_apply(integer,integer,uuid)') is null
     or to_regprocedure('public.hr_party_seat_own(uuid,integer,integer)') is null
     or to_regprocedure('public.hr_party_seat_role(uuid,uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_tally_journal(uuid,integer,text,jsonb)') is null
     or to_regclass('public.hunt_density') is null or to_regclass('public.hr_tally_tasks') is null then
    raise exception 'PRECONDITION: a door, helper or table this file reads is missing (apply 1024-carry-on.sql first)'; end if;
  if (select is_nullable from information_schema.columns
       where table_schema = 'public' and table_name = 'player_state' and column_name = 'party_leave_together') <> 'YES' then
    raise exception 'PRECONDITION: party_leave_together is not nullable: apply 1025-own-heroes-apart.sql first'; end if;
  -- hr_party_seat_own: the 2026-10-28-party-flow.sql image (refuses member_hunting) or this file's own.
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_party_seat_own(uuid,integer,integer)'::regprocedure;
  if strpos(v_src, '''member_hunting''') = 0 and strpos(v_src, 'COMPANY-START') = 0 then
    raise exception 'PIN: hr_party_seat_own is neither the party-flow image nor this file''s: another file moved it'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_hunt_party_invite_own(integer,integer,uuid)'::regprocedure;
  if strpos(v_src, 'v_r := public.hr_party_seat_own(v_uid, p_slot, p_other_slot);') = 0 then
    raise exception 'PIN: hr_hunt_party_invite_own does not seat through hr_party_seat_own: another file moved it'; end if;
  select replace(prosrc, chr(13), '') into v_src from pg_proc where oid = 'public.hr_carry_on_plan_of(uuid,integer[])'::regprocedure;
  if strpos(v_src, 'THE PLAYER''S OWN STOP STANDS') = 0 then
    raise exception 'PIN: hr_carry_on_plan_of is not 1024''s plan or this file''s: another file moved it'; end if;
end $mig$;

-- ── §1 THE TABLES ────────────────────────────────────────────────────────────
create table if not exists public.company_plans (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  wear_upgrades boolean not null default true,
  updated_at    timestamptz not null default now()
);
alter table public.company_plans enable row level security;
revoke all on public.company_plans from public, anon, authenticated, service_role;
comment on table public.company_plans is
  '1051-company-start.sql: the account''s standing plan lines (D-2: "Wear upgrades", on for a new account). No row = the defaults. Written only by hr_company_line_set; read by the company section and the Start.';

create table if not exists public.hero_plans (
  user_id    uuid not null,
  slot       int  not null,
  hunt_id    text check (hunt_id is null or hunt_id ~ '^[a-z0-9_]{1,64}$'),
  party_with smallint check (party_with is null or party_with between 0 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  constraint hero_plans_char_fk foreign key (user_id, slot) references public.player_state (user_id, slot) on delete cascade,
  constraint hero_plans_not_self check (party_with is distinct from slot)
);
alter table public.hero_plans enable row level security;
revoke all on public.hero_plans from public, anon, authenticated, service_role;
comment on table public.hero_plans is
  '1051-company-start.sql: one plan a hero: hunt_id (the plan''s ground; wins over the last hunt when newer), party_with (the own hero it hunts beside once both are free). Written by hr_hero_plan_set and hr_party_seat_own; read by the Start.';

alter table public.hunt_parties add column if not exists lead_pin_user uuid;
alter table public.hunt_parties add column if not exists lead_pin_slot smallint;
do $mig$ begin
  if not exists (select 1 from pg_constraint where conname = 'hunt_parties_lead_pin_ck') then
    alter table public.hunt_parties add constraint hunt_parties_lead_pin_ck
      check ((lead_pin_user is null) = (lead_pin_slot is null) and (lead_pin_slot is null or lead_pin_slot between 0 and 5)); end if;
end $mig$;

-- ── §2 THE HELPERS (owner-only) ──────────────────────────────────────────────
-- THE FRONT OF THE PARTY: src/data/hunt-roles.js ROLE_ORDER, the engine's pull leader (src/core/hunt/roles.js pickLeader). tests/carry-on.mjs
-- CO-LEAD holds this list equal to ROLE_ORDER (a drift guard: one row decides both). An unknown role goes last.
create or replace function public.hr_role_rank(p_role text)
returns int language sql immutable set search_path = public, pg_catalog as $fn$
  select coalesce(array_position(array['tank', 'melee_dps', 'ranger', 'mage', 'healer']::text[], p_role), 99)
$fn$;

-- The leader a party of the account's own heroes should have now: the pin while that hero sits in it, else the front hero by role, then
-- the higher Level, then the lower slot (D-2 section 2.2 rules 1, 2, 4).
create or replace function public.hr_party_lead_of(p_party uuid)
returns table (user_id uuid, slot int) language plpgsql stable set search_path = public, pg_catalog as $fn$
declare v_p public.hunt_parties%rowtype;
begin
  select * into v_p from public.hunt_parties where id = p_party;
  if not found then return; end if;
  if v_p.lead_pin_user is not null and exists (select 1 from public.hunt_party_members m
       where m.party_id = p_party and m.user_id = v_p.lead_pin_user and m.slot = v_p.lead_pin_slot) then
    return query select v_p.lead_pin_user, v_p.lead_pin_slot::int; return;
  end if;
  return query select m.user_id, m.slot from public.hunt_party_members m
    where m.party_id = p_party
    order by public.hr_role_rank(public.hr_party_seat_role(p_party, m.user_id, m.slot)),
             coalesce(public.hr_level_of(m.user_id, m.slot), 1) desc, m.slot
    limit 1;
end $fn$;

-- A party that seats only this account's heroes (the only kind the company re-leads or the plan re-grounds).
create or replace function public.hr_party_is_own(p_party uuid, p_uid uuid)
returns boolean language sql stable set search_path = public, pg_catalog as $fn$
  select exists (select 1 from public.hunt_party_members m where m.party_id = p_party)
     and not exists (select 1 from public.hunt_party_members m where m.party_id = p_party and m.user_id <> p_uid)
$fn$;

-- THE PENDING SEAT (party_with), under the caller's locks: a free hero joins its partner's party, or the partner's new party when the
-- partner is free and in none. Answers 'seated', 'waits' (the partner hunts alone), 'full', or null when there is nothing pending.
create or replace function public.hr_company_seat_pending(p_uid uuid, p_slot int)
returns text language plpgsql set search_path = public, pg_catalog as $fn$
declare v_with int; v_target uuid; v_own uuid; v_max int;
begin
  select hp.party_with into v_with from public.hero_plans hp where hp.user_id = p_uid and hp.slot = p_slot;
  if v_with is null then return null; end if;
  if not exists (select 1 from public.player_state where user_id = p_uid and slot = v_with) then
    update public.hero_plans set party_with = null, updated_at = now() where user_id = p_uid and slot = p_slot;
    return null;
  end if;
  if exists (select 1 from public.hunt_sessions h where h.user_id = p_uid and h.slot = p_slot and h.ended_at is null) then return 'waits'; end if;
  v_target := public.hr_hunt_party_of(p_uid, v_with);
  v_own := public.hr_hunt_party_of(p_uid, p_slot);
  if v_target is not null and v_target = v_own then
    update public.hero_plans set party_with = null, updated_at = now() where user_id = p_uid and slot = p_slot;
    return 'seated';
  end if;
  if v_target is null then
    if exists (select 1 from public.hunt_sessions h where h.user_id = p_uid and h.slot = v_with and h.ended_at is null) then return 'waits'; end if;
    v_target := public.hr_party_open(p_uid, v_with);
  end if;
  select max_size into v_max from public.hunt_parties where id = v_target;
  if (select count(*) from public.hunt_party_members m where m.party_id = v_target) >= v_max then return 'full'; end if;
  if v_own is not null then perform public.hr_party_drop(v_own, p_uid, p_slot); end if;
  perform public.hr_party_seat_into(v_target, p_uid, p_slot);
  update public.hero_plans set party_with = null, updated_at = now() where user_id = p_uid and slot = p_slot;
  return 'seated';
end $fn$;

-- TAMSIN'S TASK TAKEN ON ENTRY (GR-78), best effort: the ground's task, when this hero does not hold it, has a free place and a weight.
create or replace function public.hr_tally_take_on_entry(p_uid uuid, p_slot int, p_hunt text)
returns text language plpgsql set search_path = public, pg_catalog as $fn$
declare v_t public.hr_tally_tasks%rowtype; v_cfg public.hr_tally_config%rowtype; v_place int; v_w text; v_verb text;
begin
  select * into v_t from public.hr_tally_tasks t where t.hunt_id = p_hunt and not t.party order by t.ord, t.task_id limit 1;
  if not found then return null; end if;
  if exists (select 1 from public.hero_tally_tasks x where x.user_id = p_uid and x.slot = p_slot and x.task_id = v_t.task_id) then return null; end if;
  select h.weight into v_w from public.hero_tally h where h.user_id = p_uid and h.slot = p_slot;
  if v_w is null then return null; end if;
  select * into v_cfg from public.hr_tally_config where only_row;
  select min(g) into v_place from generate_series(1, v_cfg.held_max) g
   where not exists (select 1 from public.hero_tally_tasks x where x.user_id = p_uid and x.slot = p_slot and x.place = g);
  if v_place is null then return null; end if;
  v_verb := 'tally_accept:' || v_t.task_id;
  insert into public.hero_tally_tasks (user_id, slot, place, task_id, target) values (p_uid, p_slot, v_place, v_t.task_id, v_t.target);
  perform public.hr_tally_journal(p_uid, p_slot, v_verb, jsonb_build_object('task', v_t.task_id, 'place', v_place, 'target', v_t.target,
    'weight', v_w, 'on_entry', true));
  return v_t.task_id;
end $fn$;

-- WHERE A HERO'S PLAN SENDS IT: its plan's ground when set after its last hunt (or it never hunted), else its last hunt's; null for a hero
-- with neither. The plan read and the pending seat both ask it.
create or replace function public.hr_hero_ground_of(p_uid uuid, p_slot int)
returns text language sql stable set search_path = public, pg_catalog as $fn$
  select coalesce(
    (select hp.hunt_id from public.hero_plans hp
      where hp.user_id = p_uid and hp.slot = p_slot and hp.hunt_id is not null
        and hp.updated_at > coalesce((select max(h.entered_at) from public.hunt_sessions h where h.user_id = p_uid and h.slot = p_slot), '-infinity')),
    (select h.hunt_id from public.hunt_sessions h
      where h.user_id = p_uid and h.slot = p_slot
        and not exists (select 1 from public.hr_training_grounds g where g.hunt_id = h.hunt_id)
      order by h.entered_at desc, h.id limit 1))
$fn$;

-- THE SETUP A GROUND POINTS AT for this hero, if it still exists (0 always does); null when the ground has no pointer.
create or replace function public.hr_ground_setup_of(p_uid uuid, p_slot int, p_hunt text)
returns int language sql stable set search_path = public, pg_catalog as $fn$
  select d.preset::int from public.hunt_density d
   where d.user_id = p_uid and d.slot = p_slot and d.hunt_id = p_hunt and d.preset is not null
     and (d.preset = 0 or exists (select 1 from public.player_hunt_presets p where p.user_id = p_uid and p.slot = p_slot and p.preset = d.preset))
$fn$;

-- "If one falls" as the account reads it: every hero's box true = all come home; none true = the rest hunt on; else mixed.
create or replace function public.hr_company_falls_of(p_uid uuid)
returns text language sql stable set search_path = public, pg_catalog as $fn$
  select case when bool_and(coalesce(ps.party_leave_together, false)) then 'all_home'
              when not bool_or(coalesce(ps.party_leave_together, false)) then 'hunt_on' else 'mixed' end
    from public.player_state ps where ps.user_id = p_uid
$fn$;

-- THE SECTION `company`, this hero's view of its company's plan.
create or replace function public.hr_company_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_hp public.hero_plans%rowtype; v_last timestamptz; v_party uuid; v_p public.hunt_parties%rowtype;
begin
  if not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  select * into v_hp from public.hero_plans hp where hp.user_id = p_user and hp.slot = p_slot;
  select max(h.entered_at) into v_last from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot;
  v_party := public.hr_hunt_party_of(p_user, p_slot);
  if v_party is not null then select * into v_p from public.hunt_parties where id = v_party; end if;
  return jsonb_build_object(
    'wear_upgrades', coalesce((select c.wear_upgrades from public.company_plans c where c.user_id = p_user), true),
    'if_one_falls', public.hr_company_falls_of(p_user),
    'plan_hunt', case when v_hp.hunt_id is not null and (v_last is null or v_hp.updated_at > v_last) then v_hp.hunt_id end,
    'joins', case when v_hp.party_with is not null then jsonb_build_object('slot', v_hp.party_with,
                                                         'name', public.hr_character_name(p_user, v_hp.party_with)) end,
    'lead_pinned', v_p.lead_pin_user is not null and v_p.lead_pin_user = v_p.leader_user and v_p.lead_pin_slot = v_p.leader_slot,
    'heroes', (select count(*) from public.player_state ps where ps.user_id = p_user));
end $fn$;

revoke execute on function public.hr_role_rank(text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_party_lead_of(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_party_is_own(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_company_seat_pending(uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_tally_take_on_entry(uuid, int, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_ground_setup_of(uuid, int, text) from public, anon, authenticated, service_role;
revoke execute on function public.hr_hero_ground_of(uuid, int) from public, anon, authenticated, service_role;
revoke execute on function public.hr_company_falls_of(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.hr_company_view(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('company', 'hr_company_view', '1051-company-start.sql: this hero''s company plan: the account''s lines (wear_upgrades, if_one_falls), its plan ground when newer than its last hunt, the own hero it joins, whether its party''s leader is pinned, how many heroes the company holds')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 THE PLAN VERBS ────────────────────────────────────────────────────────
create or replace function public.hr_company_line_set(p_line text, p_value text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare c_verb constant text := 'company_line_set'; v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_slot int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if not ((p_line = 'wear_upgrades' and p_value in ('on', 'off')) or (p_line = 'if_one_falls' and p_value in ('hunt_on', 'all_home'))) then
    return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'bad_line')); end if;
  v_verb := c_verb || ':' || p_line || ':' || p_value;
  v_r := public.hr_intent_replay(v_uid, null, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, null, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid) then
    return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if p_line = 'wear_upgrades' then
    insert into public.company_plans as c (user_id, wear_upgrades, updated_at) values (v_uid, p_value = 'on', now())
      on conflict (user_id) do update set wear_upgrades = excluded.wear_upgrades, updated_at = now();
  else
    -- Every hero of the account, in slot order (the lock order of every hero verb); each envelope's version moves with its box.
    for v_slot in select ps.slot from public.player_state ps where ps.user_id = v_uid order by ps.slot loop
      perform public.hr_hunt_lock(v_uid, v_slot);
      update public.player_state set party_leave_together = case when p_value = 'all_home' then true end,
                                     version = version + 1, updated_at = now()
       where user_id = v_uid and slot = v_slot and party_leave_together is distinct from case when p_value = 'all_home' then true end;
    end loop;
  end if;
  v_r := jsonb_build_object('ok', true, 'line', p_line, 'value', p_value);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, 0, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  -- THE ENVELOPES (rule 11): every hero of the account, by slot, as the line left them; the receipt carries none.
  return v_r || jsonb_build_object('envelopes', (select jsonb_object_agg(ps.slot::text, public.hr_state_of(v_uid, ps.slot))
                                                   from public.player_state ps where ps.user_id = v_uid));
end $fn$;

create or replace function public.hr_hero_plan_set(p_slot int, p_hunt text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare c_verb constant text := 'hero_plan_set'; v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_party uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_hunt is not null and not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_ground')); end if;
  v_verb := c_verb || ':' || coalesce(p_hunt, '-');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is not null then perform 1 from public.hunt_parties where id = v_party for update; end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- A PARTY'S GROUND is its own while it is in town (D-2 rule 6): edited from any of its own heroes; a running party keeps its ground.
  if v_party is not null and p_hunt is not null then
    if exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunting')); end if;
    if public.hr_party_is_own(v_party, v_uid) then
      update public.hunt_parties set hunt_id = p_hunt where id = v_party and hunt_id is distinct from p_hunt;
    end if;
  end if;
  insert into public.hero_plans as hp (user_id, slot, hunt_id, updated_at) values (v_uid, p_slot, p_hunt, now())
    on conflict (user_id, slot) do update set hunt_id = excluded.hunt_id, updated_at = now();
  update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = p_slot;
  v_r := jsonb_build_object('ok', true, 'hunt', p_hunt);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));   -- rule 11
end $fn$;

create or replace function public.hr_ground_setup_set(p_slot int, p_hunt text, p_preset int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare c_verb constant text := 'ground_setup_set'; v_uid uuid := auth.uid(); v_r jsonb; v_verb text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_hunt is null or not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_ground')); end if;
  if p_preset is null or p_preset < 0 or p_preset > 7 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_preset')); end if;
  v_verb := c_verb || ':' || p_hunt || ':' || p_preset;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if p_preset <> 0 and not exists (select 1 from public.player_hunt_presets p where p.user_id = v_uid and p.slot = p_slot and p.preset = p_preset) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'unknown_preset')); end if;
  -- The pointer every Enter writes (2026-12-05-hunt-setup-per-ground.sql); a row written for the pointer alone carries density 0.
  insert into public.hunt_density as d (user_id, slot, hunt_id, density, preset, updated_at) values (v_uid, p_slot, p_hunt, 0, p_preset, now())
    on conflict (user_id, slot, hunt_id) do update set preset = excluded.preset, updated_at = now();
  update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = p_slot;
  v_r := jsonb_build_object('ok', true, 'hunt', p_hunt, 'preset', p_preset);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));   -- rule 11
end $fn$;

create or replace function public.hr_party_lead_set(p_slot int, p_lead int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare c_verb constant text := 'party_lead_set'; v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_party uuid; v_l record;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 or (p_lead is not null and (p_lead < 0 or p_lead > 5)) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_verb := c_verb || ':' || coalesce(p_lead::text, '-');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_party := public.hr_hunt_party_of(v_uid, p_slot);
  if v_party is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_party')); end if;
  perform 1 from public.hunt_parties where id = v_party for update;
  -- A GUEST NEVER LEADS, AND NOBODY RE-LEADS ANOTHER ACCOUNT'S PARTY (D-2 rule 5): only a party of this account's own heroes.
  if not public.hr_party_is_own(v_party, v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_own_party')); end if;
  if p_lead is not null and not exists (select 1 from public.hunt_party_members m where m.party_id = v_party and m.user_id = v_uid and m.slot = p_lead) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_member')); end if;
  if exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'party_hunting')); end if;
  update public.hunt_parties set lead_pin_user = case when p_lead is not null then v_uid end, lead_pin_slot = p_lead where id = v_party;
  select * into v_l from public.hr_party_lead_of(v_party);
  update public.hunt_parties set leader_user = v_l.user_id, leader_slot = v_l.slot
   where id = v_party and (leader_user, leader_slot) is distinct from (v_l.user_id, v_l.slot);
  v_r := jsonb_build_object('ok', true, 'leader', v_l.slot, 'pinned', p_lead is not null);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));   -- rule 11
end $fn$;

-- THE PARTY DOOR WITH A HUNTING HERO (FB-6 "a hunting hero joined at its hunt's end and never refused with no way forward"): RESTATED WHOLE
-- from 2026-10-28-party-flow.sql. Every refusal stays but two: an own hero that is hunting, and an inviter hunting with no party. Each is
-- now the joiner's plan (hero_plans.party_with = the inviter), said `pending`, and the next Start seats it once both are free.
create or replace function public.hr_party_seat_own(p_user uuid, p_slot integer, p_other integer)
returns jsonb language plpgsql set search_path = public, pg_catalog as $fn$
-- COMPANY-START (1051-company-start.sql): a hunting hero is planned in, never refused with no way forward.
declare
  v_pid uuid; v_p public.hunt_parties%rowtype; v_tp uuid; v_sl int;
  v_self public.hunt_sessions%rowtype; v_them public.hunt_sessions%rowtype; v_s public.hunt_sessions%rowtype;
begin
  if p_other is null or p_other < 0 or p_other > 5 then return jsonb_build_object('ok', false, 'error', 'bad_slot'); end if;
  if p_other = p_slot then return jsonb_build_object('ok', false, 'error', 'self'); end if;
  if not exists (select 1 from public.player_state where user_id = p_user and slot = p_other) then
    return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  v_pid := public.hr_hunt_party_of(p_user, p_slot);
  if v_pid is not null then
    select * into v_p from public.hunt_parties where id = v_pid for update;
    if (select count(*) from public.hunt_party_members m where m.party_id = v_pid) >= v_p.max_size then
      return jsonb_build_object('ok', false, 'error', 'party_full', 'max', v_p.max_size); end if;
  end if;
  for v_sl in select unnest(array[least(p_slot, p_other), greatest(p_slot, p_other)]) loop
    v_s := public.hr_hunt_lock(p_user, v_sl);
    if v_sl = p_other then v_them := v_s; else v_self := v_s; end if;
  end loop;
  v_tp := public.hr_hunt_party_of(p_user, p_other);
  if v_tp is not null and v_tp = v_pid then return jsonb_build_object('ok', false, 'error', 'already_member'); end if;
  -- PLANNED IN: the joiner hunts now, or the inviter hunts with no party to seat it in. Seated by the next Start once both are free.
  if v_them.id is not null or (v_pid is null and v_self.id is not null) then
    if v_pid is null and v_self.id is null then v_pid := public.hr_party_open(p_user, p_slot); end if;
    insert into public.hero_plans as hp (user_id, slot, party_with, updated_at) values (p_user, p_other, p_slot, now())
      on conflict (user_id, slot) do update set party_with = excluded.party_with, updated_at = now();
    update public.player_state set version = version + 1, updated_at = now() where user_id = p_user and slot = p_other;
    return jsonb_build_object('ok', true, 'pending', true, 'joins', public.hr_character_name(p_user, p_other),
                              'party', case when v_pid is not null then public.hr_hunt_party_view(p_user, p_slot) end);
  end if;
  if v_tp is not null then return jsonb_build_object('ok', false, 'error', 'already_in_party'); end if;
  if v_pid is null then v_pid := public.hr_party_open(p_user, p_slot); end if;
  perform public.hr_party_seat_into(v_pid, p_user, p_other);
  update public.hero_plans set party_with = null, updated_at = now() where user_id = p_user and slot = p_other and party_with is not null;
  return jsonb_build_object('ok', true, 'joined', public.hr_character_name(p_user, p_other),
                            'party', public.hr_hunt_party_view(p_user, p_slot));
end $fn$;

revoke execute on function public.hr_party_seat_own(uuid, int, int) from public, anon, authenticated, service_role;

-- THE DOOR'S VERB, RESTATED WHOLE from 2026-10-28-party-flow.sql: the same checks and receipt; its answer now carries the inviter's envelope
-- (rule 11): the door may now write a plan (party_with) as well as a seat.
create or replace function public.hr_hunt_party_invite_own(p_slot integer, p_other_slot integer, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- COMPANY-START (1051-company-start.sql): the answer carries the inviter's envelope.
declare
  c_verb constant text := 'hunt_party_invite_own';
  v_uid uuid := auth.uid(); v_r jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  v_r := public.hr_party_seat_own(v_uid, p_slot, p_other_slot);
  if coalesce(v_r->>'ok', 'false') <> 'true' then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('envelope', public.hr_state_of(v_uid, p_slot));
end $fn$;
revoke execute on function public.hr_hunt_party_invite_own(int, int, uuid) from public, anon, service_role;
grant  execute on function public.hr_hunt_party_invite_own(int, int, uuid) to authenticated;
revoke execute on function public.hr_company_line_set(text, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_company_line_set(text, text, uuid) to authenticated;
revoke execute on function public.hr_hero_plan_set(int, text, uuid) from public, anon, service_role;
grant  execute on function public.hr_hero_plan_set(int, text, uuid) to authenticated;
revoke execute on function public.hr_ground_setup_set(int, text, int, uuid) from public, anon, service_role;
grant  execute on function public.hr_ground_setup_set(int, text, int, uuid) to authenticated;
revoke execute on function public.hr_party_lead_set(int, int, uuid) from public, anon, service_role;
grant  execute on function public.hr_party_lead_set(int, int, uuid) to authenticated;

-- ── §4 THE ONE START ─────────────────────────────────────────────────────────
-- THE PLAN (owner-only, read only): 1024's, plus the plan's ground, each ground's Setup and the pending seat.
create or replace function public.hr_carry_on_plan_of(p_uid uuid, p_slots int[])
returns jsonb language plpgsql set search_path = public, pg_catalog as $fn$
-- COMPANY-START (1051-company-start.sql): a hero with no last hunt goes to its plan's ground; a plan newer than the last hunt wins; the
-- Setup is the ground's pointer (else the first); a pending seat is named (`joins`).
declare
  v_st      record;
  v_s       public.hunt_sessions%rowtype;
  v_t       public.hunt_sessions%rowtype;
  v_p       public.hunt_parties%rowtype;
  v_party   uuid;
  v_hunt    text;
  v_planned boolean;
  v_preset  int;
  v_hours   int;
  v_why     text;
  v_detail  jsonb;
  v_r       jsonb;
  v_b       record;
  v_avail   bigint;
  v_take    bigint;
  v_stacks  int;
  v_storage jsonb;
  v_short   jsonb;
  v_tiers   int[];
  v_tier    int;
  v_lv      int;
  v_price   bigint;
  v_bless   jsonb;
  v_bgold   bigint;
  v_drawn   jsonb := '{}'::jsonb;              -- Storage an earlier hero of this press already takes, per item
  v_purse   bigint := public.hr_purse_of(p_uid);
  v_gold    bigint := 0;
  v_go      int := 0;
  v_heroes  jsonb := '[]'::jsonb;
begin
  if p_uid is null then return jsonb_build_object('heroes', v_heroes, 'go', 0, 'gold', 0); end if;
  for v_st in select ps.slot, ps.active_kind, ps.bank_cap, ps.after_choice, hp.hunt_id as plan_hunt, hp.updated_at as plan_at, hp.party_with
                from public.player_state ps
                left join public.hero_plans hp on hp.user_id = ps.user_id and hp.slot = ps.slot
               where ps.user_id = p_uid and (p_slots is null or ps.slot = any (p_slots))
               order by ps.slot loop
    v_why := null; v_detail := null; v_storage := '[]'::jsonb; v_short := '[]'::jsonb; v_bless := null; v_bgold := 0; v_s := null; v_t := null;
    select * into v_s from public.hunt_sessions h where h.user_id = p_uid and h.slot = v_st.slot
     order by h.entered_at desc, h.id limit 1;
    if v_s.id is not null and v_s.ended_at is null then
      v_heroes := v_heroes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('slot', v_st.slot, 'name', public.hr_character_name(p_uid, v_st.slot),
        'state', 'busy', 'hunt', v_s.hunt_id,
        'why', case when exists (select 1 from public.hr_training_grounds g where g.hunt_id = v_s.hunt_id) then 'training' else 'hunting' end,
        'joins', case when v_st.party_with is not null then public.hr_character_name(p_uid, v_st.party_with) end)));
      continue;
    end if;
    -- A YARD SESSION THE HUNT'S OWN PLAN OPENED (hr_hunt_after_start) points back at that hunt: the hunt is what carries on.
    if v_s.id is not null and exists (select 1 from public.hr_training_grounds g where g.hunt_id = v_s.hunt_id) then
      select * into v_t from public.hunt_sessions h
       where h.user_id = p_uid and h.slot = v_st.slot and h.after_done->>'session' = v_s.id::text
       order by h.entered_at desc, h.id limit 1;
      if v_t.id is not null then v_s := v_t; end if;
    end if;
    -- THE PLAN'S GROUND: the newest decision wins: a plan set after the last hunt (or for a hero that never hunted), else what it did last.
    v_planned := v_st.plan_hunt is not null and (v_s.id is null or v_st.plan_at > v_s.entered_at);
    v_hunt := case when v_planned then v_st.plan_hunt else v_s.hunt_id end;
    -- THE PLAYER'S OWN STOP STANDS: on the whole-account press a hero the player took out by hand stays out (its own Hunt again remains),
    -- unless its plan was set since.
    if p_slots is null and not v_planned and v_s.id is not null and v_s.end_reason in ('left', 'changed') then
      v_heroes := v_heroes || jsonb_build_array(jsonb_build_object('slot', v_st.slot, 'name', public.hr_character_name(p_uid, v_st.slot),
        'state', 'parked', 'hunt', v_s.hunt_id, 'why', v_s.end_reason));
      continue;
    end if;
    -- THE PARTY: the one it sits in, or the one its pending seat joins (the partner's): a member goes where its party goes; a party with no
    -- ground yet goes where its leader's plan or last hunt went (a recruit seated beside a hunter goes with it).
    v_p := null;
    v_party := coalesce(case when v_st.party_with is not null then public.hr_hunt_party_of(p_uid, v_st.party_with) end,
                        public.hr_hunt_party_of(p_uid, v_st.slot));
    if v_party is not null then
      select * into v_p from public.hunt_parties where id = v_party;
      v_hunt := coalesce(v_p.hunt_id, public.hr_hero_ground_of(v_p.leader_user, v_p.leader_slot), v_hunt,
                         case when v_st.party_with is not null then public.hr_hero_ground_of(p_uid, v_st.party_with) end);
    end if;
    continue when v_hunt is null;   -- never hunted, no plan and no party with a ground: nothing to start
    if v_party is not null then
      -- PARTY-LEADER-STARTS (2027-02-20): only the leader starts a party's hunt; this press is the leader's when the leader is the
      -- caller's own hero. Another account's party is only joined while it hunts.
      if v_p.leader_user <> p_uid
         and not exists (select 1 from public.hunt_sessions h where h.instance_id = v_party and h.ended_at is null) then
        v_why := 'party_leader';
        v_detail := jsonb_build_object('leader', public.hr_character_name(v_p.leader_user, v_p.leader_slot));
      end if;
    end if;
    -- THE SETUP: the ground's pointer while that Setup exists, else the first (CH11-3: "A ground with no pointer uses the hero's first Setup").
    v_preset := coalesce(public.hr_ground_setup_of(p_uid, v_st.slot, v_hunt), 0);
    v_hours := case when v_s.id is not null and v_s.hunt_id = v_hunt then v_s.hours_limit end;
    -- THE DOOR'S OWN PREDICATE (every refusal hr_hunt_enter_for answers, in its order), the bag aside: its lines are built below.
    if v_why is null then
      v_r := public.hr_hunt_enter_check(p_uid, v_st.slot, v_hunt, '[]'::jsonb, v_preset, v_hours);
      if v_r is not null then v_why := coalesce(v_r->>'error', 'refused'); v_detail := nullif(v_r - 'ok' - 'error', '{}'::jsonb); end if;
    end if;
    -- BLESSINGS: the tiers the last hunt's death used (the death popup's own ledger row, hr_death_log_view) the hero lacks now, each at
    -- the server's price at its Level now; the purse must pay them all.
    if v_why is null and v_s.id is not null and v_s.end_reason = 'died' then
      select array_agg(distinct x.t order by x.t) into v_tiers
        from (select (jsonb_array_elements_text(l.meta->'tiers'))::int as t
                from public.hunt_session_events e
                join public.player_ledger l on l.session_id = e.session_id and l.user_id = p_uid and l.slot = v_st.slot
                 and l.intent = 'blessing_used' and l.at >= e.at and l.at < e.at + interval '2 days'
               where e.session_id = v_s.id and e.type = 'death') x
       where not exists (select 1 from public.player_blessings pb where pb.user_id = p_uid and pb.slot = v_st.slot and pb.tier = x.t);
      if coalesce(cardinality(v_tiers), 0) > 0 then
        v_lv := greatest(1, coalesce(public.hr_level_of(p_uid, v_st.slot), 1));
        v_bless := '[]'::jsonb;
        foreach v_tier in array v_tiers loop
          v_price := public.hr_blessing_price(v_tier, v_lv);
          v_bless := v_bless || jsonb_build_array(jsonb_build_object('tier', v_tier, 'price', v_price));
          v_bgold := v_bgold + coalesce(v_price, 0);
        end loop;
        if v_bgold > v_purse then
          v_why := 'insufficient_gold'; v_detail := jsonb_build_object('need', v_bgold, 'have', v_purse);
        end if;
      end if;
    end if;
    -- STORAGE FIRST, THEN THE STORE (Tyler 10-16; 27-retention.md "26 home"): each line of the last hunt topped up to its loaded count
    -- from the account's Storage, no further than Storage holds after the heroes before this one; a new bag stack needs room. A hero with
    -- no last hunt on this ground brings no lines: the store tops it up inside the hunt, as ever.
    if v_why is null then
      select count(*) into v_stacks from public.player_inventory i where i.user_id = p_uid and i.slot = v_st.slot;
      for v_b in select b.item_id, b.qty_loaded, coalesce(pi.qty, 0)::bigint as held, coalesce(ab.qty, 0)::bigint as stored
                   from public.hunt_bag b
                   left join public.player_inventory pi on pi.user_id = p_uid and pi.slot = v_st.slot and pi.item_id = b.item_id
                   left join public.account_bank ab on ab.user_id = p_uid and ab.item_id = b.item_id
                  where b.session_id = v_s.id and b.qty_loaded > 0
                  order by b.essential desc, b.item_id loop
        v_avail := greatest(0, v_b.stored - coalesce((v_drawn->>v_b.item_id)::bigint, 0));
        v_take := least(greatest(v_b.qty_loaded - v_b.held, 0), v_avail);
        if v_take > 0 and v_b.held = 0 then
          if v_stacks >= coalesce(v_st.bank_cap, 0) then v_take := 0; else v_stacks := v_stacks + 1; end if;
        end if;
        if v_take > 0 then
          v_storage := v_storage || jsonb_build_array(jsonb_build_object('item', v_b.item_id, 'qty', v_take));
          v_drawn := v_drawn || jsonb_build_object(v_b.item_id, coalesce((v_drawn->>v_b.item_id)::bigint, 0) + v_take);
        end if;
        if v_b.qty_loaded - v_b.held - v_take > 0 then
          v_short := v_short || jsonb_build_array(jsonb_build_object('item', v_b.item_id, 'qty', v_b.qty_loaded - v_b.held - v_take));
        end if;
      end loop;
      v_purse := v_purse - v_bgold;
      v_gold := v_gold + v_bgold;
      v_go := v_go + 1;
    end if;
    v_heroes := v_heroes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'slot', v_st.slot, 'name', public.hr_character_name(p_uid, v_st.slot),
      'state', case when v_why is null then 'go' else 'no' end, 'why', v_why, 'detail', v_detail,
      'hunt', v_hunt, 'session', v_s.id, 'ended', v_s.end_reason, 'planned', case when v_planned then true end,
      'tier', coalesce((select d.tier from public.hunt_density d
                         where d.user_id = coalesce(v_p.leader_user, p_uid) and d.slot = coalesce(v_p.leader_slot, v_st.slot)
                           and d.hunt_id = v_hunt), 'normal'),
      'party', v_party is not null, 'preset', v_preset, 'hours', v_hours,
      'joins', case when v_st.party_with is not null then public.hr_character_name(p_uid, v_st.party_with) end,
      'storage', case when v_why is null then v_storage end, 'short', case when v_why is null then v_short end,
      'bless', v_bless, 'bless_gold', case when v_bless is not null then v_bgold end,
      'loot', case when v_why is null then exists (select 1 from public.player_inventory i
                                                     join public.player_item_rules r on r.user_id = i.user_id and r.slot = i.slot and r.item_id = i.item_id
                                                    where i.user_id = p_uid and i.slot = v_st.slot and i.qty > 0 and not r.locked
                                                      and r.loot_rule in ('deposit', 'sell')) end,
      'job', case when v_st.active_kind in ('gather', 'artisan', 'training') then v_st.active_kind end,
      'after', v_st.after_choice)));
  end loop;
  return jsonb_build_object('heroes', v_heroes, 'go', v_go, 'gold', v_gold,
    'wear_upgrades', coalesce((select c.wear_upgrades from public.company_plans c where c.user_id = p_uid), true));
end $fn$;
revoke execute on function public.hr_carry_on_plan_of(uuid, int[]) from public, anon, authenticated, service_role;

-- The wear list a press may carry: at most 48 lines, each { slot, equip_slot, item[, from] } naming a hero of the press's scope.
create or replace function public.hr_carry_on_wear_ok(p_wear jsonb)
returns boolean language sql immutable set search_path = public, pg_catalog as $fn$
  select p_wear is null
      or (jsonb_typeof(p_wear) = 'array' and jsonb_array_length(p_wear) <= 48
          and not exists (select 1 from jsonb_array_elements(p_wear) w
                           where jsonb_typeof(w) <> 'object'
                              or jsonb_typeof(w->'slot') <> 'number' or (w->>'slot') !~ '^[0-5]$'
                              or jsonb_typeof(w->'equip_slot') <> 'string' or (w->>'equip_slot') !~ '^[a-z0-9_]{1,24}$'
                              or jsonb_typeof(w->'item') <> 'string' or (w->>'item') !~ '^[a-z0-9_]{1,64}$'
                              or (w ? 'from' and (jsonb_typeof(w->'from') <> 'number' or (w->>'from') !~ '^[0-5]$' or w->>'from' = w->>'slot'))
                              or exists (select 1 from jsonb_object_keys(w) k where k not in ('slot', 'equip_slot', 'item', 'from'))))
$fn$;
revoke execute on function public.hr_carry_on_wear_ok(jsonb) from public, anon, authenticated, service_role;

-- The four-argument press an earlier image of this staged file carried (a wear list from the browser) is gone: the server picks the wear.
drop function if exists public.hr_carry_on(int[], bigint, jsonb, uuid);
delete from public.hr_client_rpc_baseline where proname = 'hr_carry_on' and identity_args = 'p_slots integer[], p_gold bigint, p_wear jsonb, p_idem uuid';

create or replace function public.hr_carry_on(p_slots int[], p_gold bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- COMPANY-START (1051-company-start.sql): 1024's press, plus the pending seats and the leader under the locks, the ground's Setup and
-- Tamsin's task taken on entry. The wear went on before it (hr_company_wear_apply, the server's own pick).
declare
  c_verb  constant text := 'carry_on';
  v_uid   uuid := auth.uid();
  v_r     jsonb;
  v_plan  jsonb;
  v_h     jsonb;
  v_x     jsonb;
  v_slot  int;
  v_id    uuid;
  v_cap   int;
  v_moved boolean;
  v_bag   jsonb;
  v_loot  jsonb;
  v_paid  jsonb;
  v_took  jsonb;
  v_task  text;
  v_seat  text;
  v_l     record;
  v_seats jsonb := '{}'::jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_went  int := 0;
  v_slots int[];
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if not public.hr_carry_on_scope_ok(p_slots) then
    return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_gold is null or p_gold < 0 or p_gold > 1000000000 then
    return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'bad_intent')); end if;
  v_r := public.hr_intent_replay(v_uid, null, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, null, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

  -- THE LOCKS: every party a free hero of the press sits in or is planned into, then every free hero of the press (no open session: the
  -- ones that may go, be seated or be re-led; slot order), then the account's Storage (hr_bank_move's key). A hunting hero is not taken
  -- (1024's rule: the settle's own locks stay its). The doors below take the same rows again (held), the purse and play locks after them.
  select array_agg(ps.slot order by ps.slot) into v_slots from public.player_state ps
   where ps.user_id = v_uid and (p_slots is null or ps.slot = any (p_slots))
     and not exists (select 1 from public.hunt_sessions x where x.user_id = v_uid and x.slot = ps.slot and x.ended_at is null);
  for v_id in select distinct p from (
      select public.hr_hunt_party_of(v_uid, s) p from unnest(coalesce(v_slots, '{}'::int[])) s
      union select public.hr_hunt_party_of(v_uid, hp.party_with) from public.hero_plans hp
             where hp.user_id = v_uid and hp.party_with is not null and hp.slot = any (coalesce(v_slots, '{}'::int[]))) q
    where p is not null order by 1 loop
    perform 1 from public.hunt_parties where id = v_id for update;
  end loop;
  foreach v_slot in array coalesce(v_slots, '{}'::int[]) loop
    perform public.hr_hunt_lock(v_uid, v_slot);
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
  -- ...the key again under them: a press racing this one on its key has committed by now.
  v_r := public.hr_intent_replay(v_uid, null, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, null, v_r); end if;

  -- (0) THE COMPANY'S SHAPE UNDER THE LOCKS: the pending seats, then each own party in town led by its pin or its front hero.
  foreach v_slot in array coalesce(v_slots, '{}'::int[]) loop
    v_seat := public.hr_company_seat_pending(v_uid, v_slot);
    if v_seat is not null then v_seats := v_seats || jsonb_build_object(v_slot::text, v_seat); end if;
  end loop;
  for v_id in select distinct public.hr_hunt_party_of(v_uid, s) from unnest(coalesce(v_slots, '{}'::int[])) s loop
    continue when v_id is null or not public.hr_party_is_own(v_id, v_uid)
               or exists (select 1 from public.hunt_sessions h where h.instance_id = v_id and h.ended_at is null);
    select * into v_l from public.hr_party_lead_of(v_id);
    update public.hunt_parties set leader_user = v_l.user_id, leader_slot = v_l.slot
     where id = v_id and (leader_user, leader_slot) is distinct from (v_l.user_id, v_l.slot);
    -- A PARTY WITH NO GROUND YET takes its leader's (its plan's or its last hunt's), else the first member's that has one.
    update public.hunt_parties set hunt_id = coalesce(public.hr_hero_ground_of(v_l.user_id, v_l.slot),
        (select g from (select public.hr_hero_ground_of(m.user_id, m.slot) g, m.slot from public.hunt_party_members m where m.party_id = v_id) x
          where g is not null order by x.slot limit 1))
     where id = v_id and hunt_id is null;
  end loop;

  -- THE PLAN UNDER THE LOCKS, and the gold the player was shown for it.
  v_plan := public.hr_carry_on_plan_of(v_uid, p_slots);
  if (v_plan->>'gold')::bigint is distinct from p_gold then
    return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'quote_changed', 'plan', v_plan)); end if;
  if coalesce((v_plan->>'go')::int, 0) = 0 then
    return public.hr_note_rejection(c_verb, null, jsonb_build_object('ok', false, 'error', 'nothing_to_carry_on', 'plan', v_plan)); end if;

  for v_h in select h from jsonb_array_elements(v_plan->'heroes') h order by (h->>'slot')::int loop
    if v_h->>'state' is distinct from 'go' then v_out := v_out || jsonb_build_array(v_h); continue; end if;
    v_slot := (v_h->>'slot')::int;
    v_loot := null; v_paid := null; v_took := '[]'::jsonb; v_task := null;
    begin
      -- (1) LOOT BY PLAN: the hero's own Dispatch, best effort.
      if coalesce((v_h->>'loot')::boolean, false) then
        v_x := public.hr_loot_dispatch(v_slot, md5(p_idem::text || ':carry_on:loot:' || v_slot)::uuid);
        if coalesce(v_x->>'ok', '') = 'true' then
          v_loot := jsonb_build_object('sold', coalesce((v_x->'sold'->>'gold')::bigint, 0), 'stored', coalesce((v_x->'stored'->>'stacks')::int, 0));
        end if;
      end if;
      -- (2) TAMSIN: what is done and due is paid, a Repeat task taken again.
      v_x := public.hr_tally_claim(v_uid, v_slot, null);
      if jsonb_array_length(coalesce(v_x->'paid', '[]'::jsonb)) > 0 then v_paid := v_x->'paid'; end if;
      -- (3) BLESSINGS, tier by tier at the planned price.
      for v_x in select e from jsonb_array_elements(coalesce(v_h->'bless', '[]'::jsonb)) e order by (e->>'tier')::int loop
        v_r := public.hr_blessing_buy(v_slot, (v_x->>'tier')::int, (v_x->>'price')::bigint,
                                      md5(p_idem::text || ':carry_on:bless:' || v_slot || ':' || (v_x->>'tier'))::uuid);
        if coalesce(v_r->>'ok', '') <> 'true' then raise exception using errcode = 'HRC70', message = coalesce(v_r->>'error', 'refused'); end if;
      end loop;
      -- (4) THE GROUND'S SETUP: the player's own Use (switch, then its gear), when the ground points at another Setup than the one in use.
      if (v_h->>'preset')::int <> public.hr_hunt_active_set(v_uid, v_slot)
         and exists (select 1 from public.player_hunt_presets p where p.user_id = v_uid and p.slot = v_slot and p.preset = (v_h->>'preset')::int) then
        v_r := public.hr_hunt_preset_apply(v_slot, (v_h->>'preset')::int, md5(p_idem::text || ':carry_on:setup:' || v_slot)::uuid);
        if coalesce(v_r->>'ok', '') <> 'true' then raise exception using errcode = 'HRC70', message = 'setup_' || coalesce(v_r->>'error', 'refused'); end if;
      end if;
      -- (6) STORAGE FIRST, line by line; a line the bag has no room for is skipped (the store tops it up in the hunt).
      select ps.bank_cap into v_cap from public.player_state ps where ps.user_id = v_uid and ps.slot = v_slot;
      v_moved := false;
      for v_x in select e from jsonb_array_elements(coalesce(v_h->'storage', '[]'::jsonb)) e loop
        if public.hr_bank_move_stack(v_uid, v_slot, v_x->>'item', (v_x->>'qty')::bigint, 'withdraw', v_cap) is null then
          v_moved := true; v_took := v_took || jsonb_build_array(v_x);
        end if;
      end loop;
      if v_moved then update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = v_slot; end if;
      -- (7) HUNT through the door every start uses: the last hunt's lines on its own ground, each at most what the bag holds now.
      select coalesce(jsonb_agg(jsonb_build_object('item', b.item_id, 'qty', least(b.qty_loaded, pi.qty), 'essential', b.essential)
                                order by b.essential desc, b.item_id), '[]'::jsonb)
        into v_bag
        from public.hunt_bag b
        join public.hunt_sessions hs on hs.id = b.session_id and hs.hunt_id = v_h->>'hunt'
        join public.player_inventory pi on pi.user_id = v_uid and pi.slot = v_slot and pi.item_id = b.item_id and pi.qty > 0
       where b.session_id = (v_h->>'session')::uuid and b.qty_loaded > 0;
      v_r := public.hr_hunt_enter_for(v_uid, v_slot, v_h->>'hunt', v_bag, (v_h->>'preset')::int, (v_h->>'hours')::int);
      if coalesce(v_r->>'ok', '') <> 'true' then raise exception using errcode = 'HRC70', message = coalesce(v_r->>'error', 'refused'); end if;
      -- (8) TAMSIN'S TASK TAKEN ON ENTRY (GR-78), best effort.
      v_task := public.hr_tally_take_on_entry(v_uid, v_slot, v_h->>'hunt');
      v_went := v_went + 1;
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls(v_h || jsonb_build_object('state', 'went', 'went_session', v_r->'session_id',
                 'storage', v_took, 'loot_done', v_loot, 'tally_paid', v_paid, 'task', v_task, 'seat', v_seats->(v_slot::text))));
    exception when sqlstate 'HRC70' then
      v_out := v_out || jsonb_build_array(jsonb_strip_nulls((v_h - 'storage' - 'short') || jsonb_build_object('state', 'no', 'why', sqlerrm)));
    end;
  end loop;

  v_r := jsonb_build_object('ok', true, 'went', v_went, 'gold', p_gold, 'heroes', v_out);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, coalesce((select min((h->>'slot')::int) from jsonb_array_elements(v_out) h), 0), c_verb, v_r, now())
    on conflict (user_id, intent_id) do nothing;
  -- THE ENVELOPES (rule 11): every hero the press touched, as it left them, keyed by slot; the receipt carries none.
  return v_r || jsonb_build_object('envelopes', coalesce((select jsonb_object_agg(h->>'slot', public.hr_state_of(v_uid, (h->>'slot')::int))
    from jsonb_array_elements(v_out) h where h->>'state' in ('went', 'no')), '{}'::jsonb));
end $fn$;
revoke execute on function public.hr_carry_on(int[], bigint, uuid) from public, anon, service_role;
grant  execute on function public.hr_carry_on(int[], bigint, uuid) to authenticated;

-- ── §4b "WEAR UPGRADES": THE SERVER'S PICK, PUT ON (engine-only) ─────────────
create or replace function public.hr_company_wear_apply(p_uid uuid, p_slots int[], p_lines jsonb, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
-- COMPANY-START (1051-company-start.sql): the lines are the engine's pick (src/core/upgrade-pick.js companyWearLines over hr_state_of);
-- every invariant is this body's: own heroes, in town and idle, each delta through hr_apply's equip gate, passes through Storage.
declare
  c_verb  constant text := 'company_wear';
  v_r     jsonb;
  v_slot  int;
  v_s     public.hunt_sessions%rowtype;
  v_kind  text;
  v_free  int[] := '{}'::int[];
  v_order int[];
  v_lines jsonb;
  v_x     jsonb;
  v_cap   int;
  v_ver   bigint;
  v_delta jsonb;
  v_out   jsonb := '[]'::jsonb;
begin
  if p_uid is null or p_idem is null or p_slots is null or not public.hr_carry_on_scope_ok(p_slots) or not public.hr_carry_on_wear_ok(p_lines) then
    return jsonb_build_object('ok', false, 'error', 'bad_intent'); end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) w
              where not ((w->>'slot')::int = any (p_slots)) or (w ? 'from' and not ((w->>'from')::int = any (p_slots)))) then
    return jsonb_build_object('ok', false, 'error', 'bad_intent'); end if;
  v_r := public.hr_intent_replay(p_uid, null, p_idem, c_verb);
  if v_r is not null then return v_r; end if;
  select array_agg(x order by x) into v_order from unnest(p_slots) x;
  -- THE LOCKS: each named hero (slot order, the order of every hero verb), then the account's Storage (hr_bank_move's key).
  foreach v_slot in array v_order loop
    v_s := public.hr_hunt_lock(p_uid, v_slot);
    select ps.active_kind into v_kind from public.player_state ps where ps.user_id = p_uid and ps.slot = v_slot;
    -- IN TOWN AND IDLE: a hunt runs on the kit it entered with (D-2 rule 7), and an equip stamps accrued_to (hr_apply), so a running
    -- job's unpaid window would be confiscated: such a hero is named, never dressed.
    if v_kind = 'idle' and v_s.id is null then v_free := v_free || v_slot; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || p_uid::text, 0));
  v_r := public.hr_intent_replay(p_uid, null, p_idem, c_verb);
  if v_r is not null then return v_r; end if;
  foreach v_slot in array v_order loop
    select jsonb_agg(w) into v_lines from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) w where (w->>'slot')::int = v_slot;
    continue when v_lines is null;
    if not (v_slot = any (v_free)) then
      v_out := v_out || jsonb_build_array(jsonb_build_object('slot', v_slot, 'why',
        case when exists (select 1 from public.player_state ps where ps.user_id = p_uid and ps.slot = v_slot) then 'busy' else 'no_character' end));
      continue;
    end if;
    begin
      v_delta := '{}'::jsonb;
      for v_x in select w from jsonb_array_elements(v_lines) w loop
        if v_x ? 'from' then
          -- A PASS ACROSS THE COMPANY (D-2 rule 4): from one idle own hero's bag, through the account's Storage, to this one's.
          if not ((v_x->>'from')::int = any (v_free)) then raise exception using errcode = 'HRC72', message = 'wear_from_busy'; end if;
          select ps.bank_cap into v_cap from public.player_state ps where ps.user_id = p_uid and ps.slot = (v_x->>'from')::int;
          if public.hr_bank_move_stack(p_uid, (v_x->>'from')::int, v_x->>'item', 1, 'deposit', v_cap) is not null then
            raise exception using errcode = 'HRC72', message = 'wear_pass_refused'; end if;
          select ps.bank_cap into v_cap from public.player_state ps where ps.user_id = p_uid and ps.slot = v_slot;
          if public.hr_bank_move_stack(p_uid, v_slot, v_x->>'item', 1, 'withdraw', v_cap) is not null then
            raise exception using errcode = 'HRC72', message = 'wear_pass_refused'; end if;
          update public.player_state set version = version + 1, updated_at = now() where user_id = p_uid and slot = (v_x->>'from')::int;
        end if;
        v_delta := v_delta || jsonb_build_object(v_x->>'equip_slot', v_x->>'item');
      end loop;
      select version into v_ver from public.player_state where user_id = p_uid and slot = v_slot;
      v_r := public.hr_apply(p_uid, v_slot, v_ver, md5(p_idem::text || ':company_wear:' || v_slot)::uuid,
               jsonb_build_object('equip', v_delta, 'journal', jsonb_build_object('kind', 'equip', 'intent', c_verb)));
      if coalesce(v_r->>'ok', '') <> 'true' then raise exception using errcode = 'HRC72', message = coalesce(v_r->>'error', 'refused'); end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('slot', v_slot, 'wore', v_delta));
    exception when sqlstate 'HRC72' then
      v_out := v_out || jsonb_build_array(jsonb_build_object('slot', v_slot, 'refused', sqlerrm));
    end;
  end loop;
  v_r := jsonb_build_object('ok', true, 'heroes', v_out);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (p_uid, p_idem, v_order[1], c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  -- THE ENVELOPES (rule 11): every named hero as the wear left it; the receipt carries none.
  return v_r || jsonb_build_object('envelopes', coalesce((select jsonb_object_agg(x::text, public.hr_state_of(p_uid, x))
    from unnest(v_order) x where exists (select 1 from public.player_state ps where ps.user_id = p_uid and ps.slot = x)), '{}'::jsonb));
end $fn$;
revoke execute on function public.hr_company_wear_apply(uuid, int[], jsonb, uuid) from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    grant execute on function public.hr_company_wear_apply(uuid, int[], jsonb, uuid) to hr_engine;
  end if;
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_carry_on(int[], bigint, uuid) from hr_engine;
    revoke all on function public.hr_company_line_set(text, text, uuid) from hr_engine;
    revoke all on function public.hr_hero_plan_set(int, text, uuid) from hr_engine;
    revoke all on function public.hr_ground_setup_set(int, text, int, uuid) from hr_engine;
    revoke all on function public.hr_party_lead_set(int, int, uuid) from hr_engine;
  end if;
end $$;

-- ── §5 THE CLIENT SURFACE ────────────────────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated'
  and proname in ('hr_carry_on', 'hr_company_line_set', 'hr_hero_plan_set', 'hr_ground_setup_set', 'hr_party_lead_set');
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_carry_on', 'p_slots integer[], p_gold bigint, p_idem uuid', 'authenticated',
   'added 1024-carry-on, restated 1051-company-start (lane/c-company): THE ONE START: the caller''s own heroes through the existing doors; the pending seats and the leader under the locks; the ground''s Setup; Tamsin on entry; p_gold only refuses (quote_changed)'),
  ('hr_company_line_set', 'p_line text, p_value text, p_idem uuid', 'authenticated',
   'added 1051-company-start (lane/c-company): a plan line set once for the caller''s whole company: wear_upgrades on/off, if_one_falls hunt_on/all_home; moves no value'),
  ('hr_hero_plan_set', 'p_slot integer, p_hunt text, p_idem uuid', 'authenticated',
   'added 1051-company-start (lane/c-company): the caller''s own hero''s plan ground (a ground of the catalogue), or its own party''s while in town; moves no value'),
  ('hr_ground_setup_set', 'p_slot integer, p_hunt text, p_preset integer, p_idem uuid', 'authenticated',
   'added 1051-company-start (lane/c-company): a ground points at one of the caller''s own hero''s saved Setups; moves no value'),
  ('hr_party_lead_set', 'p_slot integer, p_lead integer, p_idem uuid', 'authenticated',
   'added 1051-company-start (lane/c-company): pin (or unpin) the leader of a party of the caller''s own heroes, in town; moves no value');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) a company of ONE: a brand-new hero with no last hunt and no plan has nothing to start; given a plan ground, ONE press starts it there
--     on its first Setup (the ground has no pointer)
-- (b) the party door with a hunting hero: planned in (pending), not refused; its hunt ends; the next Start seats it beside the inviter
--     and both go as one party (one instance), the shield in front
-- (c) the lines: if_one_falls all_home ticks every hero's box, hunt_on unsays it; wear_upgrades off reads off in the section
-- (d) the ground's Setup: a pointer to a saved Setup is used by the Start (the session plays it)
-- (e) the engine's wear: a piece in the hero's bag goes on through the gate; a piece the hero does not hold is refused by the gate, named,
--     and the hero keeps its gear; a pass from another idle own hero goes through Storage; a key twice answers once; then the Start
-- (f) the grants: authenticated only for the five verbs, the helpers owner-only, the baseline rows, grant hygiene
do $chk$
declare
  v_u    constant uuid := '000000c0-0000-4000-a000-0000c0c00001';
  k      constant text := '000000c0-0000-4000-a000-0000c0c0';
  c_hunt constant text := 'mill_cellar';
  v jsonb; v_plan jsonb; v_s0 uuid; v_s1 uuid; v_n int; v_item text;
  next_key int := 0;
begin
  if not exists (select 1 from public.hr_hunt_grounds where hunt_id = c_hunt) then
    raise exception 'company-start §6: the Mill Cellar is not in the catalogue'; end if;
  begin
    update public.hr_hunt_config set enabled = true where id;
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Company') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'company-start §6 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'company-start §6: hr_create_character(0) refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u;
    -- (a)
    delete from public.hr_rate_counters where user_id = v_u;
    v_plan := public.hr_carry_on_plan(null);
    if (v_plan->>'go')::int is distinct from 0 or jsonb_array_length(v_plan->'heroes') <> 0 then
      raise exception 'company-start §6(a): a hero with no hunt and no plan reads %', v_plan; end if;
    v := public.hr_hero_plan_set(0, c_hunt, (k || '0001')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'company-start §6(a): the plan ground answered %', v; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_carry_on(null, 0, (k || '0002')::uuid);
    if v->>'ok' is distinct from 'true' or (v->>'went')::int is distinct from 1
       or (select hunt_id from public.hunt_sessions where user_id = v_u and slot = 0 and ended_at is null) is distinct from c_hunt
       or (select preset from public.hunt_sessions where user_id = v_u and slot = 0 and ended_at is null) is distinct from 0 then
      raise exception 'company-start §6(a): one press for a company of one answered %', v; end if;
    -- (b) a second hero; the door with the first hunting
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state, updated_at)
      values (v_u, 0, 'flag', 'character_slot:1', 1, '', null, now()) on conflict do nothing;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'company-start §6(b): hr_create_character(1) refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 1;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_party_invite_own(1, 0, (k || '0003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or coalesce(v->>'pending', '') <> 'true'
       or (select party_with from public.hero_plans where user_id = v_u and slot = 0) is distinct from 1::smallint then
      raise exception 'company-start §6(b): the door with a hunting hero answered %', v; end if;
    perform public.hr_hunt_close(h.id, 'stamina', now(), true) from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null;
    update public.hunt_sessions set entered_at = entered_at - interval '1 hour' where user_id = v_u and ended_at is not null;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_carry_on(null, 0, (k || '0004')::uuid);
    select id into v_s0 from public.hunt_sessions where user_id = v_u and slot = 0 and ended_at is null;
    select id into v_s1 from public.hunt_sessions where user_id = v_u and slot = 1 and ended_at is null;
    if v->>'ok' is distinct from 'true' or (v->>'went')::int is distinct from 2 or v_s0 is null or v_s1 is null
       or (select instance_id from public.hunt_sessions where id = v_s0) is distinct from (select instance_id from public.hunt_sessions where id = v_s1)
       or public.hr_hunt_party_of(v_u, 0) is null or public.hr_hunt_party_of(v_u, 0) is distinct from public.hr_hunt_party_of(v_u, 1)
       or (select party_with from public.hero_plans where user_id = v_u and slot = 0) is not null then
      raise exception 'company-start §6(b): the Start after the hunt answered % (sessions % / %)', v, v_s0, v_s1; end if;
    -- (c)
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_company_line_set('if_one_falls', 'all_home', (k || '0005')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.player_state where user_id = v_u and party_leave_together is not true)
       or public.hr_company_view(v_u, 1)->>'if_one_falls' is distinct from 'all_home' then
      raise exception 'company-start §6(c): all come home answered %', v; end if;
    v := public.hr_company_line_set('if_one_falls', 'hunt_on', (k || '0006')::uuid);
    if exists (select 1 from public.player_state where user_id = v_u and party_leave_together is not null)
       or public.hr_company_view(v_u, 0)->>'if_one_falls' is distinct from 'hunt_on' then
      raise exception 'company-start §6(c): the rest hunt on left a box said'; end if;
    v := public.hr_company_line_set('wear_upgrades', 'off', (k || '0007')::uuid);
    if (public.hr_company_view(v_u, 0)->>'wear_upgrades')::boolean is distinct from false then
      raise exception 'company-start §6(c): wear_upgrades off reads %', public.hr_company_view(v_u, 0); end if;
    v := public.hr_company_line_set('wear_upgrades', 'maybe', (k || '0008')::uuid);
    if v->>'error' is distinct from 'bad_line' then raise exception 'company-start §6(c): a bad line answered %', v; end if;
    -- (d) both home; hero 1 saves Setup 1 and points the Cellar at it
    perform public.hr_hunt_close(h.id, 'stamina', now(), true) from public.hunt_sessions h where h.user_id = v_u and h.ended_at is null;
    update public.hunt_sessions set entered_at = entered_at - interval '1 hour' where user_id = v_u and ended_at is not null;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_hunt_preset_save(1, 1, 'Cellar kit', (k || '0009')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'company-start §6(d): saving setup 1 answered %', v; end if;
    v := public.hr_hunt_preset_save(1, 0, 'Plain', (k || '0010')::uuid);
    v := public.hr_ground_setup_set(1, c_hunt, 1, (k || '0011')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'company-start §6(d): the pointer answered %', v; end if;
    v := public.hr_ground_setup_set(1, c_hunt, 4, (k || '0012')::uuid);
    if v->>'error' is distinct from 'unknown_preset' then raise exception 'company-start §6(d): a pointer to no Setup answered %', v; end if;
    -- (e) a piece hero 1 holds and one it does not
    select i.item_id into v_item from public.hr_items i join public.hr_item_slots s on s.item_id = i.item_id
     where s.equip_slot = 'helmet' and not exists (select 1 from public.hr_items x where x.item_id = i.item_id and coalesce(x.req_lv, 1) > 1)
     order by i.item_id limit 1;
    if v_item is null then raise exception 'company-start §6(e): no Level 1 helmet in the catalogue'; end if;
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 1, v_item, 1)
      on conflict (user_id, slot, item_id) do update set qty = 1;
    delete from public.player_equipment where user_id = v_u and slot = 1 and equip_slot = 'helmet';
    delete from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'helmet';
    v := public.hr_company_wear_apply(v_u, array[0, 1], jsonb_build_array(jsonb_build_object('slot', 1, 'equip_slot', 'helmet', 'item', v_item),
                                                                    jsonb_build_object('slot', 0, 'equip_slot', 'helmet', 'item', v_item)), (k || '0013')::uuid);
    if v->>'ok' is distinct from 'true' then raise exception 'company-start §6(e): the wear answered %', v; end if;
    if (select item_id from public.player_equipment where user_id = v_u and slot = 1 and equip_slot = 'helmet') is distinct from v_item then
      raise exception 'company-start §6(e): the held helmet was not worn: %', v; end if;
    if (select h->>'refused' from jsonb_array_elements(v->'heroes') h where (h->>'slot')::int = 0) is null
       or exists (select 1 from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'helmet') then
      raise exception 'company-start §6(e): a piece hero 0 does not hold was not refused: %', v; end if;
    -- a pass: hero 1 holds a second helmet, hero 0 none
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_u, 1, v_item, 1)
      on conflict (user_id, slot, item_id) do update set qty = 1;
    v := public.hr_company_wear_apply(v_u, array[0, 1], jsonb_build_array(jsonb_build_object('slot', 0, 'equip_slot', 'helmet', 'item', v_item, 'from', 1)), (k || '0014')::uuid);
    if (select item_id from public.player_equipment where user_id = v_u and slot = 0 and equip_slot = 'helmet') is distinct from v_item
       or exists (select 1 from public.player_inventory where user_id = v_u and slot = 1 and item_id = v_item)
       or (select count(*) from public.player_ledger where user_id = v_u and kind = 'bank' and item_id = v_item) <> 2 then
      raise exception 'company-start §6(e): the pass answered %', v; end if;
    if public.hr_company_wear_apply(v_u, array[0, 1], '[]'::jsonb, (k || '0014')::uuid) - 'replayed' is distinct from (v - 'envelopes' - 'replayed') then
      raise exception 'company-start §6(e): a key twice answered %', public.hr_company_wear_apply(v_u, array[0, 1], '[]'::jsonb, (k || '0014')::uuid); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_carry_on(null, 0, (k || '0015')::uuid);
    if v->>'ok' is distinct from 'true' or (v->>'went')::int is distinct from 2 then raise exception 'company-start §6(e): the Start answered %', v; end if;
    if (select preset from public.hunt_sessions where user_id = v_u and slot = 1 and ended_at is null) is distinct from 1 then
      raise exception 'company-start §6(d): the Start did not use the ground''s Setup: %', (select preset from public.hunt_sessions where user_id = v_u and slot = 1 and ended_at is null); end if;
    raise exception using errcode = 'HRC51', message = 'company-start §6 complete - rolling back';
  exception when sqlstate 'HRC51' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.hero_plans where user_id = v_u)
     or exists (select 1 from public.company_plans where user_id = v_u) or exists (select 1 from auth.users where id = v_u) then
    raise exception 'company-start §6: a probe row leaked'; end if;
  -- (f)
  if has_function_privilege('anon', 'public.hr_carry_on(integer[],bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_carry_on(integer[],bigint,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_company_wear_apply(uuid,integer[],jsonb,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_company_wear_apply(uuid,integer[],jsonb,uuid)', 'execute')
     or (exists (select 1 from pg_roles where rolname = 'hr_engine')
         and not has_function_privilege('hr_engine', 'public.hr_company_wear_apply(uuid,integer[],jsonb,uuid)', 'execute'))
     or not has_function_privilege('authenticated', 'public.hr_company_line_set(text,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hero_plan_set(integer,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_ground_setup_set(integer,text,integer,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_party_lead_set(integer,integer,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_party_lead_set(integer,integer,uuid)', 'execute')
     or to_regprocedure('public.hr_carry_on(integer[],bigint,jsonb,uuid)') is not null then
    raise exception 'company-start §6(f): a verb''s grant is wrong'; end if;
  if exists (select 1 from unnest(array['public.hr_role_rank(text)', 'public.hr_party_lead_of(uuid)', 'public.hr_party_is_own(uuid,uuid)',
               'public.hr_company_seat_pending(uuid,integer)', 'public.hr_tally_take_on_entry(uuid,integer,text)', 'public.hr_ground_setup_of(uuid,integer,text)',
               'public.hr_company_falls_of(uuid)', 'public.hr_company_view(uuid,integer)', 'public.hr_carry_on_wear_ok(jsonb)', 'public.hr_hero_ground_of(uuid,integer)',
               'public.hr_party_seat_own(uuid,integer,integer)']) f
             where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')) then
    raise exception 'company-start §6(f): a helper is a client''s to call'; end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('company_plans', 'hero_plans'))
     or has_table_privilege('authenticated', 'public.company_plans', 'select,insert,update,delete')
     or has_table_privilege('authenticated', 'public.hero_plans', 'select,insert,update,delete') then
    raise exception 'company-start §6(f): a client reaches a plan table'; end if;
  if (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated'
        and proname in ('hr_carry_on', 'hr_company_line_set', 'hr_hero_plan_set', 'hr_ground_setup_set', 'hr_party_lead_set')) <> 5 then
    raise exception 'company-start §6(f): the client baseline rows are wrong'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'company-start §6 OK: a company of one starts on its plan, a hunting hero is planned in and seated by the next Start, the lines, the ground''s Setup, the engine''s wear through the gate and a pass through Storage, the grants';
end $chk$;
