-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1038-start-kits.sql — THE KIT ONCE AN ACCOUNT AND ONCE A SLOT, AND THE WEAPON PICKED AT CREATION
--   (lane/c-first-hour, FB-5, backend-architect, 2026-11-21; CE-10 and GR-24, docs/design/overhaul/08-player-experience.md
--   section 2.1; designer ruling D-1, review/05-designer-rulings.md section 1.2: "The pick must wear the picked row of
--   STARTER_SETS, off hand included").
--
-- STATUS: supabase/migration-notes/1038-start-kits.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): after 1036-four-starter-slots.sql and the generated
--   1037-first-hour-kit-lines.generated.sql, whose hr_start_kit_lines §0 requires.
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §4 self-check. ON THE EA SECURITY LIST (MONEY
--   SURFACE: a grant of gold and items that sell).
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- Four slots are free (1036). hr_create_character paid the WHOLE kit to every hero it made: 500 gold to the account purse and the
--   food, seeds and supplies to the bag, so four heroes paid the account four times, and the kit's food sells. CE-10 splits it:
--     the ACCOUNT kit   once an account, with its first hero: START_CURRENCY.gold to the purse, ACCOUNT_KIT to that hero's bag
--     the HERO kit      once a SLOT: HERO_KIT to the bag of the first hero ever made there
--     the PRACTICE set  every hero, every time: the picked STARTER_SETS row worn, every other practice weapon in the bag. They sell
--                       for nothing, so a hero made again in a paid slot is paid nothing that moves an economy
--   The rows are hr_start_kit_lines (generated from src/data/start-kit.js); the grants are public.account_kits, append-only.
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- §1 public.account_kits (user_id, grant_key, slot, set_id, granted_at), primary key (user_id, grant_key). grant_key 'account' or
--    'hero:<slot>'. Written ONLY inside hr_create_character__as by `insert ... on conflict do nothing`; the kit is paid exactly when
--    that insert wrote a row. RLS on, no policy, no client grant: nothing reads it but the server. Journal: the creation's one
--    player_ledger row says which kits it paid (meta.account_kit, meta.hero_kit, meta.set).
-- §2 L-02, LIVE ACCOUNTS: every existing account is marked 'account' (at its lowest slot) and every existing hero 'hero:<slot>', in
--    this file, so nobody is paid a kit again. §2 asserts every live account and hero is marked when it ends.
-- §3 hr_create_character__as(p_slot integer, p_set text) — SECURITY DEFINER, server-only (no client grant). The old body, whole:
--    access check, slot shape, the ensure fast path, the slot entitlement, the (user, slot) lock, the 6/hour creation budget. Then:
--    the set (p_set, or the default_set row when null; an unknown set answers bad_set before any lock or budget), the hero row,
--    the skills, the practice set (worn in its slots, the rest in the bag), the hero kit if 'hero:<slot>' is new, the account kit if
--    'account' is new (its gold through hr_purse_move under the purse's row lock), and ONE ledger row.
--    hr_create_character(p_slot integer default 0) keeps its signature and grant (every fixture and probe calls it) and now reads
--    `select public.hr_create_character__as(p_slot, null)`: the default set.
-- §4 hr_create_hero(p_slot, p_name, p_colors, p_set, p_idem) REPLACES the 4-argument hr_create_hero (dropped; its baseline row is
--    re-pinned with the new identity). The pick is required: a missing or unknown set answers bad_set, journalled by
--    hr_note_rejection, before the replay cache, the bucket or the lock. Everything else is as before.
-- REFUSAL CODES: bad_set (new). Unchanged: not_signed_in, bad_slot, bad_idem, bad_name, slot_not_owned, rate_limited, name_taken,
--   already_created, no_start_kit.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- Two creations in two slots of one account race for 'account': the primary key admits one row, the second insert waits on the
--   first's transaction and then does nothing, so the account kit is paid once. One slot is serialised by the (user, slot) advisory
--   lock, as before. hr_create_hero keeps its idempotency key (hr_intent_replay); hr_create_character is idempotent by its fast path.
--
-- ── EXPLOIT SURFACE ────────────────────────────────────────────────────────
-- SMALLER: the kit is no longer a per-hero mint. The client sends one more short text (p_set), checked against a server catalogue
--   before anything else; it chooses which practice weapon is worn and nothing else (every hero owns every practice weapon).
-- COST AT 100x: account_kits holds at most 5 rows an account (about 3,500 rows at 700 accounts, under 0.5 MB). No new journal row.
-- REVERSIBILITY: restore hr_create_character's 2026-10-19 body and the 4-argument hr_create_hero from 2026-11-02-hero-creation.sql
--   with its baseline row, then drop hr_create_character__as and account_kits. Kits paid in between stay paid.
-- EDGE: none.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ───────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_start_kit_lines') is null or to_regclass('public.hr_start_kit') is null
     or to_regclass('public.hr_client_rpc_baseline') is null
     or to_regprocedure('public.hr_create_character(integer)') is null
     or to_regprocedure('public.hr_purse_move(uuid,bigint,bigint)') is null
     or to_regprocedure('public.hr_hero_slots_of(uuid)') is null then
    raise exception 'PRECONDITION: hr_start_kit_lines (1037), hr_start_kit, hr_client_rpc_baseline, hr_create_character, hr_purse_move or hr_hero_slots_of is absent';
  end if;
  if (select string_agg(slot_id || ':' || starter, ',' order by slot_id) from public.hr_hero_slots) is distinct from '1:true,2:true,3:true' then
    raise exception 'PRECONDITION: the four starter slots (1036) are not in place';
  end if;
end $mig$;

-- ── §1 THE GRANTS, APPEND-ONLY ─────────────────────────────────────────────
create table if not exists public.account_kits (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  grant_key  text        not null check (grant_key ~ '^(account|hero:[0-5])$'),
  slot       smallint    not null check (slot between 0 and 5),
  set_id     text        check (set_id is null or set_id ~ '^[a-z][a-z0-9_]{0,31}$'),
  granted_at timestamptz not null default now(),
  primary key (user_id, grant_key)
);
alter table public.account_kits enable row level security;
revoke all on public.account_kits from public, anon, authenticated;
comment on table public.account_kits is
  '1038-start-kits.sql: which starting kits an account has been paid (account once, hero:<slot> once a slot). Written only by hr_create_character__as (insert on conflict do nothing); server-only.';

-- ── §2 L-02: EVERY LIVE ACCOUNT AND HERO IS MARKED, SO NOBODY IS PAID AGAIN ──
insert into public.account_kits (user_id, grant_key, slot, set_id)
select ps.user_id, 'hero:' || ps.slot, ps.slot, null
  from public.player_state ps
 where ps.slot between 0 and 5
on conflict (user_id, grant_key) do nothing;

insert into public.account_kits (user_id, grant_key, slot, set_id)
select ps.user_id, 'account', min(ps.slot), null
  from public.player_state ps
 where ps.slot between 0 and 5
 group by ps.user_id
on conflict (user_id, grant_key) do nothing;

do $mig$
declare v_bad bigint;
begin
  select count(*) into v_bad from public.player_state ps
   where ps.slot between 0 and 5
     and (not exists (select 1 from public.account_kits k where k.user_id = ps.user_id and k.grant_key = 'hero:' || ps.slot)
          or not exists (select 1 from public.account_kits k where k.user_id = ps.user_id and k.grant_key = 'account'));
  if v_bad > 0 then
    raise exception 'start-kits §2: % live hero(es) are not marked as paid, so their account or slot would be paid the kit again', v_bad;
  end if;
end $mig$;

-- ── §3 THE CREATION, WITH THE KIT ONCE AND THE PICK ────────────────────────
create or replace function public.hr_create_character__as(p_slot integer, p_set text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_slot  int;
  v_set   text;
  v_kit   public.hr_start_kit%rowtype;
  v_purse bigint;
  v_hero  boolean := false;
  v_acct  boolean := false;
  v_gold  bigint := 0;
  v_n     int;
begin
  -- CLOSED MODE (2026-10-22-closed-mode-ungated-rpcs.sql, Security R3): no hr_rpc_gate here, so the access check is our own.
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  -- Validate the slot and the set BEFORE spending any budget: a malformed request never costs the honest player's allowance.
  v_slot := coalesce(p_slot, 0);
  if v_slot < 0 or v_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;
  v_set := coalesce(p_set, (select l.set_id from public.hr_start_kit_lines l where l.kit = 'practice' and l.default_set limit 1));
  if v_set is null or not exists (select 1 from public.hr_start_kit_lines l where l.kit = 'practice' and l.set_id = v_set) then
    return jsonb_build_object('ok', false, 'error', 'bad_set');
  end if;

  -- TWO BUCKETS: ensure_character 60/min on every call (one indexed lookup), create_character 6/hour only on a path that inserts.
  if not public.hr_rate_ok(v_uid, 'ensure_character', 60, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'ensure_character') - 60) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'ensure_character', 'rate_limited',
        jsonb_build_object('limit', 60, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'ensure_character') - 60));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- FAST PATH: the hero is already there. No lock, no creation budget, no kit.
  if exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false);
  end if;

  -- THE HERO-SLOT ENTITLEMENT GATE (2026-09-08-hero-slot-buy.sql; four starter slots since 1036): after the fast path, so a hero is
  -- never locked out of its own account, and before the lock and the creation budget, so a refusal costs neither.
  if v_slot > 0 and not (public.hr_hero_slots_of(v_uid) @> to_jsonb(v_slot)) then
    perform public.hr_record_rejection(v_uid, v_slot, 'create_character', 'slot_not_owned',
      jsonb_build_object('slot', v_slot, 'owned', public.hr_hero_slots_of(v_uid)), 1);
    return jsonb_build_object('ok', false, 'error', 'slot_not_owned', 'slot', v_slot);
  end if;

  -- SERIALISE (D1): transaction-scoped, per (user, slot), released by commit or rollback on every path.
  perform pg_advisory_xact_lock(hashtextextended('hr_create_character:' || v_uid::text || ':' || v_slot::text, 0));
  if exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false, 'raced', true);
  end if;

  if not public.hr_rate_ok(v_uid, 'create_character', 6, interval '1 hour') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'create_character') - 6) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'create_character', 'rate_limited',
        jsonb_build_object('limit', 6, 'per', '1 hour'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'create_character') - 6));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_kit from public.hr_start_kit;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_start_kit');
  end if;

  -- THE HERO ROW. hp is a Level-1 hero's derived max (nothing worn yet); accrued_to is now(), never a client value.
  begin
    insert into public.player_state
      (user_id, slot, hp, bank_cap, active_kind, active_id, active_since, accrued_to)
      values (v_uid, v_slot, least(v_kit.hp, public.hr_max_hp(1, 0)), v_kit.bank_cap, 'idle', null, null, now());
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false, 'raced', true);
  end;

  perform public.hr_wallet_ensure(v_uid);
  if coalesce(v_kit.gems, 0) > 0 then
    perform public.hr_wallet_credit(v_uid, v_slot, v_kit.gems, 'start_kit', null);
  end if;

  -- Skills: a row per catalogue skill, with the kit's starting XP.
  insert into public.player_skills (user_id, slot, skill_id, xp)
    select v_uid, v_slot, k.skill_id, coalesce(s.xp, 0)
      from public.hr_skills k
      left join public.hr_start_skill_xp s on s.skill_id = k.skill_id;

  -- THE PRACTICE SET, to every hero: the picked set's worn rows in their slots, every other practice row in the bag. CONSERVATION:
  -- a worn item is never also placed in the bag (hr_apply's equip pair conserves the count across the two tables).
  insert into public.player_equipment (user_id, slot, equip_slot, item_id)
    select v_uid, v_slot, l.equip_slot, l.item_id
      from public.hr_start_kit_lines l
     where l.kit = 'practice' and l.set_id = v_set and l.worn;
  insert into public.player_inventory (user_id, slot, item_id, qty)
    select v_uid, v_slot, l.item_id, l.qty
      from public.hr_start_kit_lines l
     where l.kit = 'practice' and not (l.set_id = v_set and l.worn);

  -- THE HERO KIT, once a slot: paid exactly when this insert writes its row.
  insert into public.account_kits (user_id, grant_key, slot, set_id)
    values (v_uid, 'hero:' || v_slot, v_slot, v_set)
  on conflict (user_id, grant_key) do nothing;
  get diagnostics v_n = row_count;
  v_hero := v_n = 1;
  if v_hero then
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select v_uid, v_slot, l.item_id, l.qty from public.hr_start_kit_lines l where l.kit = 'hero';
  end if;

  -- THE ACCOUNT KIT, once an account, with whichever hero is made first: its gold to the account purse under the purse's row lock,
  -- its items to that hero's bag. Paid exactly when this insert writes its row.
  insert into public.account_kits (user_id, grant_key, slot, set_id)
    values (v_uid, 'account', v_slot, v_set)
  on conflict (user_id, grant_key) do nothing;
  get diagnostics v_n = row_count;
  v_acct := v_n = 1;
  if v_acct then
    insert into public.player_inventory (user_id, slot, item_id, qty)
      select v_uid, v_slot, l.item_id, l.qty from public.hr_start_kit_lines l where l.kit = 'account';
    v_gold := coalesce(v_kit.gold, 0);
    if v_gold <> 0 then v_purse := public.hr_purse_move(v_uid, v_gold, 0); end if;
  end if;

  -- ONE ledger row (journal rule 6): which kits this creation paid, and the gold that entered the economy with it.
  select count(*) into v_n from public.player_inventory where user_id = v_uid and slot = v_slot;
  insert into public.player_ledger (user_id, slot, kind, intent, gold, purse, meta)
    values (v_uid, v_slot, 'admin', 'create_character', v_gold, case when v_gold <> 0 then v_purse end,
            jsonb_build_object('slot', v_slot, 'set', v_set, 'account_kit', v_acct, 'hero_kit', v_hero,
                               'kit_gold', v_gold, 'kit_items', v_n, 'plots', v_kit.farm_plots,
                               'catalogue', (select digest from public.hr_catalogue_meta)));

  return jsonb_build_object('ok', true, 'slot', v_slot, 'created', true);
end $function$;

revoke all on function public.hr_create_character__as(integer, text) from public, anon, authenticated;

create or replace function public.hr_create_character(p_slot integer default 0)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- CLOSED MODE: this client door calls no hr_rpc_gate, so it refuses a non-admitted caller itself (hr_assert_grant_hygiene).
  perform public.hr_access_check();
  -- A hero made with no pick wears the default set (hr_start_kit_lines.default_set). A player always picks: hr_create_hero.
  return public.hr_create_character__as(p_slot, null);
end $function$;

-- ── §4 THE PICK AT CREATION ────────────────────────────────────────────────
drop function if exists public.hr_create_hero(integer, text, jsonb, uuid);

create or replace function public.hr_create_hero(p_slot integer, p_name text, p_colors jsonb, p_set text, p_idem uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  c_verb constant text := 'create_hero';
  v_uid  uuid := auth.uid();
  v_r    jsonb;
  v_ok   jsonb;
  v_name text;
  v_canon text;
  v_bad  text;
  v_created boolean;
begin
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  -- THE PICK (GR-24): a set of the server's catalogue, never a client list of items.
  if p_set is null or not exists (select 1 from public.hr_start_kit_lines l where l.kit = 'practice' and l.set_id = p_set) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_set')); end if;
  v_ok := public.hr_validate_display_name(p_name);
  if coalesce(v_ok->>'ok', '') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_name', 'reason', v_ok->>'reason')); end if;
  v_name := v_ok->>'name'; v_canon := v_ok->>'canonical';
  v_bad := public.hr_base_colors_problem(p_colors);
  if v_bad is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', v_bad)); end if;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, c_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  -- The cosmetic bucket (20/min); the kit's own 6/hour creation budget is hr_create_character__as's.
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;

  perform pg_advisory_xact_lock(hashtextextended('hr_create_hero:' || v_uid::text || ':' || p_slot::text, 0));
  if exists (select 1 from public.character_names where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_created')); end if;
  if exists (select 1 from public.character_names n where n.canonical = v_canon)
     or exists (select 1 from public.profiles pr where pr.id <> v_uid and pr.display_name is not null
                  and public.hr_canon_display_name(pr.display_name) = v_canon) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'name_taken')); end if;

  -- ALL OR NOTHING: a name lost to a concurrent claim unwinds the hero and its kit with it.
  begin
    v_r := public.hr_create_character__as(p_slot, p_set);
    if coalesce(v_r->>'ok', '') <> 'true' then
      return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', coalesce(v_r->>'error', 'refused')));
    end if;
    v_created := coalesce((v_r->>'created')::boolean, false);
    insert into public.character_names (user_id, slot, name, canonical, updated_at)
      values (v_uid, p_slot, v_name, v_canon, now());
    insert into public.player_outfits (user_id, slot, outfit_id, colors, base_colors, updated_at)
      values (v_uid, p_slot, null, '{}'::jsonb, p_colors, now())
    on conflict (user_id, slot) do update set base_colors = excluded.base_colors, updated_at = now();
  exception when unique_violation then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'name_taken'));
  end;

  v_r := jsonb_build_object('ok', true, 'slot', p_slot, 'name', v_name, 'created', v_created);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, c_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $function$;

revoke all on function public.hr_create_hero(integer, text, jsonb, text, uuid) from public, anon;
grant execute on function public.hr_create_hero(integer, text, jsonb, text, uuid) to authenticated;

delete from public.hr_client_rpc_baseline where proname = 'hr_create_hero';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note)
values ('hr_create_hero', 'p_slot integer, p_name text, p_colors jsonb, p_set text, p_idem uuid', 'authenticated',
        'added 2026-11-01, the pick 2026-11-21 (1038-start-kits.sql): create a hero with its name, base colours and starter set id (checked against hr_start_kit_lines), all or nothing; the kit is hr_create_character__as''s, once an account and once a slot');

-- ── §5 SELF-CHECK (CLAUDE.md §4): properties asserted by EXECUTING ─────────
-- Every probe is its own account and rolled back. Nothing here reads or counts a real player's row.
do $check$
declare
  c_new  uuid := gen_random_uuid();   -- a brand-new account
  c_old  uuid := gen_random_uuid();   -- an account shaped like a live one: its account kit and slots 0 and 1 already paid
  v      jsonb;
  v_role text;
  v_gold0 bigint;
  v_bag  jsonb;
  v_worn jsonb;
  v_acct jsonb := (select jsonb_object_agg(item_id, qty) from public.hr_start_kit_lines where kit = 'account');
  v_hero jsonb := (select jsonb_object_agg(item_id, qty) from public.hr_start_kit_lines where kit = 'hero');
  v_kitg bigint := (select gold from public.hr_start_kit);
begin
  begin
    insert into auth.users (id) values (c_new), (c_old) on conflict (id) do nothing;
    insert into public.profiles (id) values (c_new), (c_old) on conflict do nothing;
    insert into public.hr_access_allowlist (user_id, note)
      values (c_new, 'start-kits §5 probe'), (c_old, 'start-kits §5 probe') on conflict (user_id) do nothing;

    -- (a) the FIRST hero of a new account, made in slot 2 as a Mage: the account kit and the hero kit, the wand and the spellbook in
    --     hand, every other practice weapon in the bag, the kit's gold in the purse, one ledger row saying so.
    perform set_config('request.jwt.claim.sub', c_new::text, true);
    v := public.hr_create_hero(2, 'Kitprobe Mage', '{"head":0,"body":0,"legs":0,"feet":0}'::jsonb, 'mage', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): the first hero answered %', v; end if;
    select jsonb_object_agg(equip_slot, item_id) into v_worn from public.player_equipment where user_id = c_new and slot = 2;
    if v_worn is distinct from (select jsonb_object_agg(equip_slot, item_id) from public.hr_start_kit_lines where set_id = 'mage' and worn) then
      raise exception 'VERIFY(a): the Mage wears %', v_worn; end if;
    select jsonb_object_agg(item_id, qty) into v_bag from public.player_inventory where user_id = c_new and slot = 2;
    if v_bag is distinct from (v_acct || v_hero || (select jsonb_object_agg(item_id, qty) from public.hr_start_kit_lines
                                                     where kit = 'practice' and not (set_id = 'mage' and worn))) then
      raise exception 'VERIFY(a): the first hero''s bag is %', v_bag; end if;
    v_gold0 := (select gold from public.account_wallet where user_id = c_new);
    if v_gold0 is distinct from v_kitg then raise exception 'VERIFY(a): the purse holds %, the kit pays %', v_gold0, v_kitg; end if;
    if (select count(*) from public.player_ledger where user_id = c_new and intent = 'create_character') <> 1
       or (select meta->>'account_kit' from public.player_ledger where user_id = c_new and intent = 'create_character') <> 'true' then
      raise exception 'VERIFY(a): the creation is not journalled as paying the account kit'; end if;

    -- (b) the SECOND hero, slot 0 as a Healer: the hero kit and the staff, no account kit and no gold.
    v := public.hr_create_hero(0, 'Kitprobe Healer', '{"head":0,"body":0,"legs":0,"feet":0}'::jsonb, 'healer', gen_random_uuid());
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(b): the second hero answered %', v; end if;
    select jsonb_object_agg(item_id, qty) into v_bag from public.player_inventory where user_id = c_new and slot = 0;
    if v_bag is distinct from (v_hero || (select jsonb_object_agg(item_id, qty) from public.hr_start_kit_lines
                                          where kit = 'practice' and not (set_id = 'healer' and worn))) then
      raise exception 'VERIFY(b): the second hero''s bag is %', v_bag; end if;
    if (select jsonb_object_agg(equip_slot, item_id) from public.player_equipment where user_id = c_new and slot = 0)
       is distinct from (select jsonb_object_agg(equip_slot, item_id) from public.hr_start_kit_lines where set_id = 'healer' and worn) then
      raise exception 'VERIFY(b): the Healer wears the wrong set'; end if;
    if (select gold from public.account_wallet where user_id = c_new) <> v_gold0 then
      raise exception 'VERIFY(b): the second hero paid gold'; end if;

    -- (c) THE PICK IS THE SERVER'S: no set and an unknown set are refused and nothing is made; a slot past four is refused.
    v := public.hr_create_hero(1, 'Kitprobe None', '{"head":0,"body":0,"legs":0,"feet":0}'::jsonb, null, gen_random_uuid());
    if v->>'error' is distinct from 'bad_set' then raise exception 'VERIFY(c): no set answered %', v; end if;
    v := public.hr_create_hero(1, 'Kitprobe Bogus', '{"head":0,"body":0,"legs":0,"feet":0}'::jsonb, 'practice_sword', gen_random_uuid());
    if v->>'error' is distinct from 'bad_set' or exists (select 1 from public.player_state where user_id = c_new and slot = 1) then
      raise exception 'VERIFY(c): an unknown set answered %', v; end if;

    -- (d) AN ACCOUNT LIKE A LIVE ONE (L-02): its account kit and slots 0 and 1 marked paid, as §2 marks every live account. A hero in
    --     slot 1 (a slot paid before: a remade hero) gets the practice set only; a hero in slot 2 gets the hero kit and no account kit.
    perform set_config('request.jwt.claim.sub', c_old::text, true);
    insert into public.account_kits (user_id, grant_key, slot) values (c_old, 'account', 0), (c_old, 'hero:0', 0), (c_old, 'hero:1', 1);
    v := public.hr_create_character(1);
    if coalesce(v->>'created', '') <> 'true' then raise exception 'VERIFY(d): the remade hero answered %', v; end if;
    if exists (select 1 from public.player_inventory i where i.user_id = c_old and i.slot = 1
                and not exists (select 1 from public.hr_start_kit_lines l where l.kit = 'practice' and l.item_id = i.item_id)) then
      raise exception 'VERIFY(d): a hero remade in a paid slot was given more than practice weapons'; end if;
    v := public.hr_create_character(2);
    select jsonb_object_agg(item_id, qty) into v_bag from public.player_inventory i where i.user_id = c_old and i.slot = 2
       and not exists (select 1 from public.hr_start_kit_lines l where l.kit = 'practice' and l.item_id = i.item_id);
    if v_bag is distinct from v_hero or coalesce((select gold from public.account_wallet where user_id = c_old), 0) <> 0 then
      raise exception 'VERIFY(d): a new slot of a paid account got % and the purse %', v_bag, (select gold from public.account_wallet where user_id = c_old); end if;
    if (select count(*) from public.account_kits where user_id = c_old) <> 4 then
      raise exception 'VERIFY(d): the paid account holds % kit marks', (select count(*) from public.account_kits where user_id = c_old); end if;

    raise exception using errcode = 'HR946', message = 'start-kits §5 complete - rolling back';
  exception when sqlstate 'HR946' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);

  -- (e) ZERO LEAK; the grants table and the creation body stay out of every client's reach; the pick is on the client surface.
  if exists (select 1 from public.player_state where user_id in (c_new, c_old))
     or exists (select 1 from public.account_kits where user_id in (c_new, c_old))
     or exists (select 1 from public.player_ledger where user_id in (c_new, c_old))
     or exists (select 1 from auth.users where id in (c_new, c_old)) then
    raise exception 'VERIFY(e): §5 LEAKED a probe row';
  end if;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.account_kits', 'select,insert,update,delete')
       or has_function_privilege(v_role, 'public.hr_create_character__as(integer,text)', 'execute') then
      raise exception 'VERIFY(e): % can read the kit grants or reach the creation body', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_create_hero(integer,text,jsonb,text,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_create_hero(integer,text,jsonb,text,uuid)', 'execute')
     or to_regprocedure('public.hr_create_hero(integer,text,jsonb,uuid)') is not null then
    raise exception 'VERIFY(e): the pick''s create is not the one client door';
  end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'start-kits: the account kit once, the hero kit once a slot, practice weapons to every hero with the picked set worn; '
               'every live account and hero marked paid; the pick is a server set id; zero leak.';
end $check$;
