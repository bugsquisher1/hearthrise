-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — CHANGING A HERO'S NAME COSTS GOLD (Tyler 2026-10-22: "Name change
-- should cost a lot of gold (first choice is free)"). STAGED (lane/c-hero-rename,
-- backend-architect, 2026-10-22). Game CLOSED: applies on its passing §6. MONEY
-- SURFACE (a gold sink): Security reviews it in the reopen gate.
-- Numbers: src/data/hero-rename.js HERO_RENAME (tests/hero-rename.mjs holds the
-- §1 row equal to it).
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 public.hr_hero_rename_rule: the one price row {base, per_level, per_day}.
--    Server-only (RLS on, no grant).
-- §2 READERS (server-only):
--      hr_name_held_by_other(user, slot, canonical)  the creation rule: another
--        character holds the name, or another ACCOUNT's display name is it.
--      hr_hero_rename_quote(user, slot)  the `rename` envelope section:
--        {price, level, per_day, today, available, why: null | hunt_open |
--        renamed_today}. price = base + per_level x Level (hr_level_of).
-- §3 hr_character_name_set RESTATED WHOLE (2026-10-25-account-items.sql, §0
--    pinned): it claims the FIRST name of an unnamed character only (free, as
--    hr_create_hero is); a named character is refused `already_named`. Until
--    this file it renamed for free, which the ruling closes.
-- §4 THE VERB hr_hero_rename(p_slot, p_name, p_price, p_idem) — MONEY.
--    The stamina-refill shape: shape -> the name rules (hr_validate_display_name:
--    length 3-20, charset, reserved, the moderation blocklist) -> idempotency
--    replay (key, 'hero_rename:<canonical>', slot) -> rate gate -> the hero's
--    lock (hr_hunt_lock + its row) -> refusals: no_character, not_named (the
--    first name is free elsewhere), same_name, name_taken, then the quote's
--    hunt_open / renamed_today {rename}, quote_changed {rename} -> ONE hr_apply {gold: -price}
--    journalled kind 'shop', intent 'hero_rename:<canonical>' (hr_apply refuses
--    insufficient_gold and moves nothing) -> the name row updated in place, so
--    the OLD canonical is released in the same statement. Server clock.
--    Clamps: one rename per call; per_day renames per hero per UTC day, counted
--    from the append-only ledger.
--
-- ── CONCURRENCY ─────────────────────────────────────────────────────────────
--   The hero's advisory lock (hr_hunt_lock) serialises every rename / hunt open /
--   settle of THIS hero; the per-day count and the in-hunt check are read under
--   it. Two DIFFERENT heroes claiming one name race only on the unique index
--   character_names_canonical: the charge and the name update run in ONE
--   subtransaction, so the loser's unique_violation unwinds its charge, its
--   ledger row and its intent claim and answers name_taken (nothing paid).
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
--   Gold leaves one hero and goes nowhere (a sink); nothing crosses an account.
--   The client names (slot, name, price, key); the name is re-validated by the
--   server's own rules and the price must EQUAL the server's quote. A replayed
--   key charges nothing (hr_intent_replay, then hr_apply's own claim). The free
--   path (hr_character_name_set) can no longer rename.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Re-apply hr_character_name_set from 2026-10-25-account-items.sql (§0 accepts
-- its image); drop hr_hero_rename (+ baseline row), the `rename` section row,
-- hr_hero_rename_quote, hr_name_held_by_other, hr_hero_rename_rule. Gold spent
-- stays in the ledger (intent hero_rename:<canonical>).
-- ORDER: after 2026-12-02-old-rewards-cut.sql (last in the chain). No begin/commit.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS ────────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.character_names') is null or to_regclass('public.hr_state_sections') is null
     or to_regprocedure('public.hr_validate_display_name(text)') is null or to_regprocedure('public.hr_canon_display_name(text)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_level_of(uuid,integer)') is null
     or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null then
    raise exception 'PRECONDITION: the character names, the section registry, the name rules, hr_hunt_lock, hr_level_of, hr_apply or hr_utc_day_start is absent'; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure('public.hr_character_name_set(integer,text,uuid)');
  if v_md5 is distinct from '9028d7b641fca4c72fb4c3288efcacde' and v_md5 is distinct from 'ce0156796ba67ad2d5df35e7760079fd' then
    raise exception 'PIN: hr_character_name_set is neither 2026-10-25-account-items.sql''s image nor this file''s - md5 %', v_md5; end if;
end $mig$;

-- ── §1 THE PRICE ROW (src/data/hero-rename.js HERO_RENAME) ───────────────────
create table if not exists public.hr_hero_rename_rule (
  id        boolean primary key default true check (id),
  base      bigint  not null check (base between 1 and 1000000000),
  per_level bigint  not null check (per_level between 0 and 10000000),
  per_day   int     not null check (per_day between 1 and 10)
);
alter table public.hr_hero_rename_rule enable row level security;
revoke all on public.hr_hero_rename_rule from public, anon, authenticated, service_role;
comment on table public.hr_hero_rename_rule is
  '2026-12-04 (Tyler 2026-10-22): the price of changing a hero''s name: base + per_level x Level, per_day changes a hero a UTC day. '
  'Mirrors src/data/hero-rename.js HERO_RENAME (tests/hero-rename.mjs). Read only by hr_hero_rename_quote.';
-- ⟦hero-rename-rule⟧ HERO_RENAME = { base: 20000, perLevel: 500, perDay: 1 }
insert into public.hr_hero_rename_rule (id, base, per_level, per_day) values (true, 20000, 500, 1)
  on conflict (id) do update set base = excluded.base, per_level = excluded.per_level, per_day = excluded.per_day;

-- ── §2 THE READERS ───────────────────────────────────────────────────────────
-- THE NAME RULE OF CREATION: unique among characters (but this one), and never ANOTHER account's display name.
create or replace function public.hr_name_held_by_other(p_user uuid, p_slot int, p_canon text)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (select 1 from public.character_names n
                  where n.canonical = p_canon and not (n.user_id = p_user and n.slot = p_slot))
      or exists (select 1 from public.profiles pr
                  where pr.id <> p_user and pr.display_name is not null
                    and public.hr_canon_display_name(pr.display_name) = p_canon)
$$;
revoke execute on function public.hr_name_held_by_other(uuid, int, text) from public, anon, authenticated, service_role;

-- THE `rename` SECTION: what a name change costs this hero now, and whether it may.
create or replace function public.hr_hero_rename_quote(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare r public.hr_hero_rename_rule%rowtype; v_lv int; v_n int; v_hunt boolean;
begin
  select * into r from public.hr_hero_rename_rule where id;
  if not found or not exists (select 1 from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot) then return null; end if;
  v_lv := greatest(1, coalesce(public.hr_level_of(p_user, p_slot), 1));
  v_n := (select count(*) from public.player_ledger l
           where l.user_id = p_user and l.slot = p_slot and l.kind = 'shop' and l.intent like 'hero\_rename:%'
             and l.at >= public.hr_utc_day_start(now()))::int;
  v_hunt := exists (select 1 from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null);
  return jsonb_build_object('price', r.base + r.per_level * v_lv, 'level', v_lv, 'per_day', r.per_day, 'today', v_n,
    'available', not v_hunt and v_n < r.per_day,
    'why', case when v_hunt then 'hunt_open' when v_n >= r.per_day then 'renamed_today' end);
end $$;
revoke execute on function public.hr_hero_rename_quote(uuid, int) from public, anon, authenticated, service_role;
insert into public.hr_state_sections (key, fn, note) values
  ('rename', 'hr_hero_rename_quote', '2026-12-04-hero-rename.sql: what changing this hero''s name costs now, and whether it may (in a hunt, renamed today)')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §3 hr_character_name_set — RESTATED WHOLE: THE FIRST NAME ONLY ───────────
create or replace function public.hr_character_name_set(p_slot int, p_name text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
-- FIRST-NAME-ONLY (2026-12-04-hero-rename.sql): an unnamed character claims its first name here,
-- free. A named one is refused already_named; a change of name is hr_hero_rename, paid in gold.
declare
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ok jsonb; v_name text; v_canon text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  v_ok := public.hr_validate_display_name(p_name);
  if coalesce(v_ok->>'ok', '') <> 'true' then
    return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'bad_name', 'reason', v_ok->>'reason')); end if;
  v_name := v_ok->>'name'; v_canon := v_ok->>'canonical';
  v_verb := 'character_name_set:' || v_canon;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection('character_name_set', p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  if exists (select 1 from public.character_names where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'already_named')); end if;
  if public.hr_name_held_by_other(v_uid, p_slot, v_canon) then
    return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'name_taken')); end if;
  begin
    insert into public.character_names (user_id, slot, name, canonical, updated_at) values (v_uid, p_slot, v_name, v_canon, now());
  exception when unique_violation then
    return public.hr_note_rejection('character_name_set', p_slot, jsonb_build_object('ok', false, 'error', 'name_taken'));
  end;
  v_r := jsonb_build_object('ok', true, 'name', v_name);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $$;
revoke execute on function public.hr_character_name_set(int, text, uuid) from public;
revoke execute on function public.hr_character_name_set(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_character_name_set(int, text, uuid) to authenticated;
update public.hr_client_rpc_baseline set note =
  'added 2026-10-25 (lane S2); 2026-12-04-hero-rename.sql: claims an UNNAMED character''s first name only (free, display-name rules, unique); a rename is hr_hero_rename'
 where grantee = 'authenticated' and proname = 'hr_character_name_set';

-- ── §4 THE VERB: CHANGE A HERO'S NAME FOR GOLD ───────────────────────────────
create or replace function public.hr_hero_rename(p_slot int, p_name text, p_price bigint, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  c_verb constant text := 'hero_rename';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ok jsonb; v_name text; v_canon text;
  v_ver bigint; v_old public.character_names%rowtype; v_q jsonb; v_a jsonb; v_price bigint;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_price is null or p_price < 1 or p_price > 1000000000 then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_quote')); end if;
  -- THE NAME RULES OF CREATION: length, characters, reserved words, the moderation blocklist.
  v_ok := public.hr_validate_display_name(p_name);
  if coalesce(v_ok->>'ok', '') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_name', 'reason', v_ok->>'reason')); end if;
  v_name := v_ok->>'name'; v_canon := v_ok->>'canonical';
  v_verb := 'hero_rename:' || v_canon;
  -- IDEMPOTENCY per (key, intent, slot): a replay answers the first call's result and charges nothing.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('party') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  -- THE HERO'S LOCK (its advisory key, its row, its open session): the quote below reads the hunt and
  -- the day's renames under it.
  perform public.hr_hunt_lock(v_uid, p_slot);
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  select * into v_old from public.character_names where user_id = v_uid and slot = p_slot;
  if v_old.user_id is null then
    -- The first name is free (hr_create_hero, hr_character_name_set): nothing to change, nothing to charge.
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'not_named')); end if;
  if v_old.name = v_name then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'same_name')); end if;
  if public.hr_name_held_by_other(v_uid, p_slot, v_canon) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'name_taken')); end if;
  v_q := public.hr_hero_rename_quote(v_uid, p_slot);
  if v_q is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'catalogue_missing')); end if;
  -- NOT IN A HUNT (hunt_open), NOT TWICE A DAY (renamed_today): the quote's one rule, read under the lock.
  if not (v_q->>'available')::boolean then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', v_q->>'why', 'rename', v_q)); end if;
  v_price := (v_q->>'price')::bigint;
  if v_price <> p_price then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'quote_changed', 'rename', v_q)); end if;
  -- THE PAYMENT AND THE NAME, ALL OR NOTHING: a name lost to another hero's concurrent claim (the
  -- unique canonical index) unwinds the charge, its ledger row and the intent claim.
  begin
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'gold', -v_price,
             'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', 'hero_rename', 'from', v_old.name, 'to', v_name,
                                                                      'level', (v_q->>'level')::int, 'gold', v_price))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      return public.hr_note_rejection(c_verb, p_slot, v_a || jsonb_build_object('ok', false)); end if;
    -- The old canonical is released by this same update (the unique index holds one row per canonical).
    update public.character_names set name = v_name, canonical = v_canon, updated_at = now()
     where user_id = v_uid and slot = p_slot;
  exception when unique_violation then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'name_taken'));
  end;
  return jsonb_build_object('ok', true, 'version', v_a->'version', 'name', v_name, 'from', v_old.name, 'gold', -v_price,
                            'rename', public.hr_hero_rename_quote(v_uid, p_slot));
end $$;
revoke execute on function public.hr_hero_rename(int, text, bigint, uuid) from public;
revoke execute on function public.hr_hero_rename(int, text, bigint, uuid) from anon, service_role;
grant  execute on function public.hr_hero_rename(int, text, bigint, uuid) to authenticated;
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_hero_rename';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_hero_rename', 'p_slot integer, p_name text, p_price bigint, p_idem uuid', 'authenticated',
   'added 2026-12-04 (Tyler 2026-10-22): MONEY (a gold sink) - change a named hero''s name at the server''s quoted price (base + per Level), the creation name rules, out of a hunt, per_day a UTC day; refuses quote_changed');

-- ── §6 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $$
declare
  v_a constant uuid := '000000c0-0000-4000-a000-0000e1a40001';
  v_b constant uuid := '000000c0-0000-4000-a000-0000e1a40002';
  k   constant text := '000000c0-0000-4000-b000-0000e1a4';
  v jsonb; q jsonb; v_n1 text; v_n2 text; v_n3 text; v_price bigint; v_role text; v_i int;
begin
  -- Probe names the RPCs would accept: valid, no character's, no account's display name.
  for v_i in 1..3 loop
    loop
      v_n3 := 'Zr' || translate(substr(md5(gen_random_uuid()::text), 1, 8), '0123456789', 'ghijklmnop');
      exit when coalesce(public.hr_validate_display_name(v_n3)->>'ok', '') = 'true'
        and v_n3 is distinct from v_n1 and v_n3 is distinct from v_n2
        and not public.hr_name_held_by_other('00000000-0000-0000-0000-000000000000'::uuid, -1, public.hr_canon_display_name(v_n3));
    end loop;
    if v_i = 1 then v_n1 := v_n3; elsif v_i = 2 then v_n2 := v_n3; end if;
  end loop;
  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'hero-rename §6')
      on conflict (key) do update set enabled = true;
    insert into auth.users (id) values (v_a), (v_b) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_a, 'hero-rename §6 probe'), (v_b, 'hero-rename §6 probe')
      on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    -- (a) THE FIRST NAME IS FREE; hr_character_name_set no longer renames.
    v := public.hr_hero_rename(0, v_n2, 1, (k || '0001')::uuid);
    if v->>'error' is distinct from 'not_named' then raise exception 'VERIFY(a): renaming an unnamed hero answered %', v; end if;
    update public.player_state set gold = 0 where user_id = v_a and slot = 0;
    v := public.hr_character_name_set(0, v_n1, (k || '0002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_character_name(v_a, 0) <> v_n1 then raise exception 'VERIFY(a): the free first name answered %', v; end if;
    v := public.hr_character_name_set(0, v_n2, (k || '0003')::uuid);
    if v->>'error' is distinct from 'already_named' or public.hr_character_name(v_a, 0) <> v_n1 then
      raise exception 'VERIFY(a): a free second name answered %', v; end if;
    -- (b) THE QUOTE: base + per Level; the section carries it.
    q := public.hr_state_of(v_a, 0)->'rename';
    select base + per_level * greatest(1, public.hr_level_of(v_a, 0)) into v_price from public.hr_hero_rename_rule;
    if (q->>'price')::bigint is distinct from v_price or (q->>'available')::boolean is not true then
      raise exception 'VERIFY(b): the rename section reads %', q; end if;
    -- (c) REFUSALS move nothing: short of gold, a wrong price, the same name, bad names, a taken name.
    update public.player_state set gold = v_price - 1 where user_id = v_a and slot = 0;
    v := public.hr_hero_rename(0, v_n2, v_price, (k || '0004')::uuid);
    if v->>'error' is distinct from 'insufficient_gold' or public.hr_character_name(v_a, 0) <> v_n1
       or (select gold from public.player_state where user_id = v_a and slot = 0) <> v_price - 1 then
      raise exception 'VERIFY(c): a short purse answered %', v; end if;
    update public.player_state set gold = v_price + 7 where user_id = v_a and slot = 0;
    v := public.hr_hero_rename(0, v_n2, v_price + 1, (k || '0005')::uuid);
    if v->>'error' is distinct from 'quote_changed' then raise exception 'VERIFY(c): a wrong price answered %', v; end if;
    v := public.hr_hero_rename(0, v_n1, v_price, (k || '0006')::uuid);
    if v->>'error' is distinct from 'same_name' then raise exception 'VERIFY(c): the same name answered %', v; end if;
    v := public.hr_hero_rename(0, 'ab', v_price, (k || '0007')::uuid);
    if v->>'error' is distinct from 'bad_name' then raise exception 'VERIFY(c): a two-letter name answered %', v; end if;
    v := public.hr_hero_rename(0, 'Admin', v_price, (k || '0008')::uuid);
    if v->>'error' is distinct from 'bad_name' then raise exception 'VERIFY(c): a reserved name answered %', v; end if;
    v := public.hr_hero_rename(0, repeat('a', 21), v_price, (k || '0009')::uuid);
    if v->>'error' is distinct from 'bad_name' then raise exception 'VERIFY(c): a 21-letter name answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_create_character(0);
    v := public.hr_character_name_set(0, v_n3, (k || '0010')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(c): B''s first name answered %', v; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_hero_rename(0, upper(v_n3), v_price, (k || '0011')::uuid);
    if v->>'error' is distinct from 'name_taken' then raise exception 'VERIFY(c): another hero''s name answered %', v; end if;
    if (select gold from public.player_state where user_id = v_a and slot = 0) <> v_price + 7 then
      raise exception 'VERIFY(c): a refusal moved gold'; end if;
    -- (d) ANOTHER USER'S HERO: B cannot rename A's slot; B's own call renames only B's hero.
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    update public.player_state set gold = 0 where user_id = v_b and slot = 0;
    v := public.hr_hero_rename(0, v_n2, v_price, (k || '0012')::uuid);
    if coalesce(v->>'error', '') not in ('insufficient_gold', 'quote_changed') or public.hr_character_name(v_a, 0) <> v_n1 then
      raise exception 'VERIFY(d): B''s rename reached A or answered %', v; end if;
    v := public.hr_hero_rename(1, v_n2, v_price, (k || '0013')::uuid);
    if v->>'error' is distinct from 'no_character' then raise exception 'VERIFY(d): B on a slot it does not hold answered %', v; end if;
    -- (e) THE RENAME: exactly the price, once, one ledger row; the old name is free again.
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    v := public.hr_hero_rename(0, v_n2, v_price, (k || '0014')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_character_name(v_a, 0) <> v_n2
       or (select gold from public.player_state where user_id = v_a and slot = 0) <> 7
       or (select count(*) from public.player_ledger where user_id = v_a and slot = 0 and kind = 'shop'
             and intent like 'hero\_rename:%' and gold = -v_price) <> 1 then
      raise exception 'VERIFY(e): the rename answered %', v; end if;
    if public.hr_name_held_by_other(v_b, 0, public.hr_canon_display_name(v_n1)) then raise exception 'VERIFY(e): the old name is still held'; end if;
    -- (f) A REPLAY CHARGES NOTHING; a second rename today is refused; in a hunt it is refused.
    update public.player_state set gold = v_price * 3 where user_id = v_a and slot = 0;
    v := public.hr_hero_rename(0, v_n2, v_price, (k || '0014')::uuid);
    if (select gold from public.player_state where user_id = v_a and slot = 0) <> v_price * 3
       or (select count(*) from public.player_ledger where user_id = v_a and kind = 'shop' and intent like 'hero\_rename:%') <> 1 then
      raise exception 'VERIFY(f): a replay charged again: %', v; end if;
    if (select per_day from public.hr_hero_rename_rule) = 1 then
      v := public.hr_hero_rename(0, v_n1, v_price, (k || '0015')::uuid);
      if v->>'error' is distinct from 'renamed_today' then raise exception 'VERIFY(f): a second rename today answered %', v; end if;
    end if;
    raise exception using errcode = 'HR894', message = 'hero-rename §6 complete - rolling back';
  exception when sqlstate 'HR894' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) then raise exception 'VERIFY(g): §6 LEAKED a probe row'; end if;
  -- (g) THE GRANTS: the rule and the readers are server-only; the verb is authenticated-only.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.hr_hero_rename_rule', 'select,insert,update,delete,truncate') then
      raise exception 'VERIFY(g): % reaches hr_hero_rename_rule', v_role; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_function_privilege(v_role, 'public.hr_hero_rename_quote(uuid,integer)', 'execute')
       or has_function_privilege(v_role, 'public.hr_name_held_by_other(uuid,integer,text)', 'execute') then
      raise exception 'VERIFY(g): % reaches a rename reader', v_role; end if;
  end loop;
  if has_function_privilege('anon', 'public.hr_hero_rename(integer,text,bigint,uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_hero_rename(integer,text,bigint,uuid)', 'execute') then
    raise exception 'VERIFY(g): hr_hero_rename is not authenticated-only'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'hero-rename: the first name is free, a rename costs the server''s price once, refusals move nothing; all green';
end $$;
