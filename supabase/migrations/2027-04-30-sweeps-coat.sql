-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-30-sweeps-coat.sql — A BUNDLE OUTFIT IS OWNED ONLY BY THE HERO WHO USED ITS BUNDLE: THE KEY WARDEN, THE HEARTH CHEST'S
--   SUPER-RARE (lane/c-sweeps-coat-drop, backend-architect, 2026-11-16; Tyler 2026-11-14: "a super rare outfit that can drop from any chest
--   would be cool too", the designer's Sweep's Coat, named Key Warden by Tyler 2026-11-16 (ids kept), the board's "2026-11-14 The Burning Tower" §5 and §10 hr_chest_outfits row:
--   "It trades, until someone wears it ... Use it and that hero owns the outfit for good (the server's hr_outfit_owned)").
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §9. ON THE EA SECURITY LIST with the Tower (an item turned into a permanent unlock; the item trades).
-- ORDER: after 2027-04-28-tower-section.sql (the Tower's files, whose 2027-04-27-tower-chest.sql rolls the bundle and whose
--   2027-05-02-tower-items-catalogue holds it; lane/c-tower-all 2026-11-17), right BEFORE 2027-04-30-sweeps-coat-outfits-catalogue.generated.sql, which writes the
--   coat's hr_outfits row with its bundle and whose §0 refuses until THIS file's hr_outfit_owned reads bundles: in the other order every
--   hero would own the coat (the old body owns every non-premium row) for as long as the gap lasted.
-- EDGE: does not move for this file (no engine reads an outfit's ownership). CLIENT: src/session/outfit-intents.js sends the verb.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- Until now an outfit was everyone's (free) or the premium hero's: hr_outfit_owned owned every non-premium hr_outfits row for everyone.
-- A bundle outfit is a FIND: it must be owned by exactly the heroes who used its bundle, recorded by the server, never by a client flag.
-- The record is the table that already holds server-owned cosmetic unlocks (player_cosmetics, 2026-09-08-hearthfind.sql: no numeric
-- column, no client write, append-only in practice, read-own RLS, on the character wipe's list), with one more kind, 'outfit'.
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hr_outfits.bundle (text, null) NEW COLUMN: the bag item whose use owns this outfit; null for a free or premium outfit. Unique; a bundle
--   row is never premium (CHECK). Written by the outfits catalogue (tools/gen-outfits.mjs from src/data/outfits.js `bundle`).
-- player_cosmetics.kind admits 'outfit' (code = the outfit id, name = the bundle's item name).
-- hr_outfit_owned(p_user, p_slot) RESTATED: a bundle row is owned iff the hero has its player_cosmetics 'outfit' row; every other row as
--   before (free: everyone; premium: hr_premium_active). Still plpgsql (planned once a backend: 2027-02-10-settle-plan-cache's reason).
--   Its callers (hr_outfit_set's not_owned, hr_outfit_view's owned list and worn, the town look, the party and finder views) all follow.
-- hr_outfit_bundle_use(p_slot int, p_item text, p_idem uuid) -> jsonb   CLIENT VERB (authenticated; hr_client_rpc_baseline). Takes ONE
--   bundle (the hero's bag first, then the account's Storage, hr_materials_take) and makes its outfit this hero's for good: one
--   player_cosmetics row, one player_ledger row (kind shop, intent outfit_bundle_use:<item>, item_id, qty -1, meta { reason, outfit,
--   from }), the version bumped. Wearing it is the existing hr_outfit_set.
--   ok: { ok, version, item, outfit, from, outfit_section }. A replay answers this receipt once more and moves nothing.
--   REFUSALS, each moving nothing: not_signed_in, bad_slot, bad_idem, bad_item (no hr_outfits row has this bundle), rate_limited (the
--   cosmetic bucket), no_character, already_owned { outfit } (this hero owns it: the bundle is kept, it trades), none_held { item } (not in
--   the bag or the account's Storage), intent_mismatch.
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- hr_intent_replay first; the hero's lock (hr_hunt_lock: its advisory key, its player_state row); the key again under the lock (a second
--   press on one key waited and answers the first's receipt); already_owned read under the lock (two presses with two keys: the second
--   waits, finds the row and keeps its bundle); then hr_materials_take takes the account's DEPOT key and the bag and Storage rows (hero ->
--   depot -> rows, every sink's order). The take, the cosmetic row, the ledger row, the version and the receipt are one transaction.
--   Two heroes of one account using the account's one stored bundle serialise on the depot key: the second finds none_held.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- ONE new client verb. p_item is a catalogue id (only a bundle row's item passes); it spends an item the hero's own account holds; no
--   client value names an outfit, a hero, a count or a price. The grant is one row a hero an outfit (the primary key), so a bundle can't
--   own an outfit twice or for another hero, and an owned outfit keeps its bundle (already_owned) rather than burning a tradeable item.
-- hr_outfit_owned NARROWS (a bundle row is no longer everyone's): it widens nothing. The only value in play is the bundle item, which only
--   hr_chest_open mints (2027-04-27-tower-chest.sql, behind the burning_tower switch) and the market moves at its own caps and escrow.
-- Risk named for Security: the bundle trades (the designer's call, the board's "NO BOUND GEAR is about equipment"); its book value (20,000,
--   src/data/chests.js CHEST_OUTFITS) is the shop's bid and the market's ceiling base (100x: 2,000,000, the market's daily spend cap).
--
-- ── COST (rows and bytes at 100x players) ──────────────────────────────────
-- A use: one player_cosmetics row (~90 bytes), one ledger row, a version bump. At 0.2 to 0.5% a key and six keys a hero a week, a server of
-- 600 climbing heroes finds about 10 a week: nothing measurable. hr_outfit_owned gains one primary-key probe of player_cosmetics per
-- bundle row (one today) on each call; it is called once a hero per look (town walkers, party views, the outfit section).
--
-- REVERSIBLE: restate hr_outfit_owned from its pre-image (§0's md5; the image is 2027-02-10-settle-plan-cache.generated.sql's), drop
--   hr_outfit_bundle_use and its baseline and wall rows; the coat's hr_outfits row goes with the next outfits catalogue that omits it; the
--   'outfit' rows of player_cosmetics are cosmetic and leave with the character wipe (the kind may stay admitted).
-- IDEMPOTENT: a second apply finds the column, the widened kind and the baseline rows, restates every body byte-identical, and §9 rolls
--   back its probes.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.player_cosmetics') is null or to_regclass('public.hr_outfits') is null or to_regclass('public.player_outfits') is null then
    raise exception 'PRECONDITION: player_cosmetics (2026-09-08-hearthfind.sql) and hr_outfits / player_outfits (2026-10-25-character-sheet.sql) first'; end if;
  if to_regclass('public.hr_chest_outfits') is null or to_regprocedure('public.hr_chest_open(integer,text,text,integer,integer,uuid)') is null then
    raise exception 'PRECONDITION: apply 2027-04-27-tower-chest.sql first (the chest that rolls the bundle)'; end if;
  if to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null
     or to_regprocedure('public.hr_rpc_gate(text)') is null or to_regprocedure('public.hr_outfit_view(uuid,integer)') is null
     or to_regprocedure('public.hr_outfit_set(integer,text,jsonb,uuid)') is null or to_regprocedure('public.hr_premium_active(uuid,integer,timestamp with time zone)') is null
     or to_regclass('public.hr_client_rpc_baseline') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
  -- THE PIN: hr_outfit_owned is 2027-02-10-settle-plan-cache.generated.sql's image or this file's (md5 of pg_get_functiondef, whitespace
  -- runs as one)
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_outfit_owned(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 not in ('50401421bb677006e8fee7339acd83a2', 'cfe9a082905a659b73b0b9ca8c4e565e') then
    raise exception 'PIN: hr_outfit_owned is neither 2027-02-10-settle-plan-cache.generated.sql''s image (50401421bb677006e8fee7339acd83a2) nor this file''s (cfe9a082905a659b73b0b9ca8c4e565e): md5 % - another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE SHAPE: the bundle column, the 'outfit' cosmetic kind ──────────────
alter table public.hr_outfits add column if not exists bundle text;
do $mig$
declare v_kinds text[]; v_con text;
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hr_outfits'::regclass and conname = 'hr_outfits_bundle_shape') then
    alter table public.hr_outfits add constraint hr_outfits_bundle_shape check (bundle is null or (bundle ~ '^[a-z0-9_]{1,40}$' and not premium)); end if;
  -- player_cosmetics' kind CHECK, widened by union (the set it admits read out of the live definition, 'outfit' added): idempotent, and safe
  -- against a kind another file has added since 2026-09-08-hearthfind.sql
  select c.conname, array(select distinct btrim(k, '''') from unnest(regexp_split_to_array(
           regexp_replace(pg_get_constraintdef(c.oid), '::text|ARRAY|[()\[\]]|[[:space:]]|CHECK|kind|=|ANY|IN', '', 'g'), ',')) k where btrim(k, '''') <> '')
    into v_con, v_kinds
    from pg_constraint c
   where c.conrelid = 'public.player_cosmetics'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ~ '\mkind\M';
  if v_con is null or not ('title' = any (v_kinds)) or not ('plinth' = any (v_kinds)) then
    raise exception 'sweeps-coat §1: could not read player_cosmetics'' kind CHECK (% %) - refusing to replace a constraint I cannot reproduce', v_con, v_kinds; end if;
  if not ('outfit' = any (v_kinds)) then
    execute format('alter table public.player_cosmetics drop constraint %I', v_con);
    execute 'alter table public.player_cosmetics add constraint player_cosmetics_kind_check check (kind in ('
            || (select string_agg(quote_literal(k), ', ' order by k) from unnest(array_append(v_kinds, 'outfit')) k) || '))';
  end if;
end $mig$;
create unique index if not exists hr_outfits_bundle_one on public.hr_outfits (bundle) where bundle is not null;
comment on column public.hr_outfits.bundle is '2027-04-30-sweeps-coat.sql: the bag item whose use (hr_outfit_bundle_use) owns this outfit for that hero; null for a free or premium outfit. hr_outfit_owned owns a bundle row only for a hero with its player_cosmetics ''outfit'' row.';

-- ── §2 WHO OWNS AN OUTFIT ────────────────────────────────────────────────────
-- A bundle row: the heroes who used its bundle (player_cosmetics kind 'outfit'). Every other row as before: a free one is everyone's, a
-- premium one the premium hero's (the one check, hr_premium_active).
create or replace function public.hr_outfit_owned(p_user uuid, p_slot integer)
 returns text[]
 language plpgsql
 stable
 set search_path = public, pg_catalog
as $plc$
-- SWEEPS-COAT (2027-04-30-sweeps-coat.sql): a bundle outfit is the hero's only once it used the bundle. plpgsql, planned once a backend
-- (2027-02-10-settle-plan-cache.generated.sql's reason).
#variable_conflict use_column
begin
  return (select coalesce(array_agg(o.outfit_id order by o.sort), '{}')
            from public.hr_outfits o
           where case when o.bundle is not null
                      then exists (select 1 from public.player_cosmetics c
                                    where c.user_id = p_user and c.slot = p_slot and c.kind = 'outfit' and c.code = o.outfit_id)
                      else not o.premium or public.hr_premium_active(p_user, p_slot, now()) end);
end
$plc$;

-- ── §3 THE VERB ──────────────────────────────────────────────────────────────
create or replace function public.hr_outfit_bundle_use(p_slot int, p_item text, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'outfit_bundle_use';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_o public.hr_outfits%rowtype; v_ver bigint; v_take jsonb; v_from text;
begin
  -- SWEEPS-COAT (2027-04-30-sweeps-coat.sql)
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  select * into v_o from public.hr_outfits o where o.bundle is not null and o.bundle = p_item;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_item')); end if;
  v_verb := c_verb || ':' || p_item;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('outfit') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  -- THE KEY AGAIN, UNDER THE LOCK: a second press on one key waited here and answers the first's receipt.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- OWNED ALREADY: the bundle stays (it trades); nothing is burnt for an outfit the hero has.
  if exists (select 1 from public.player_cosmetics c where c.user_id = v_uid and c.slot = p_slot and c.kind = 'outfit' and c.code = v_o.outfit_id) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'already_owned', 'outfit', v_o.outfit_id)); end if;
  -- ONE BUNDLE: the bag first, then the account's Storage (hr_materials_take takes the depot key after the hero's).
  v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(p_item, 1), true);
  if coalesce(v_take->>'ok', 'false') <> 'true' then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'none_held', 'item', p_item)); end if;
  v_from := case when coalesce((v_take #>> array['from', 'bag', p_item])::bigint, 0) > 0 then 'bag' else 'storage' end;
  insert into public.player_cosmetics (user_id, slot, kind, code, name)
    values (v_uid, p_slot, 'outfit', v_o.outfit_id, coalesce((select i.name from public.hr_items i where i.item_id = p_item), v_o.outfit_id));
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
    values (v_uid, p_slot, 'shop', v_verb, p_item, -1, 0, jsonb_build_object('reason', c_verb, 'outfit', v_o.outfit_id, 'from', v_from));
  update public.player_state set version = version + 1, updated_at = now() where user_id = v_uid and slot = p_slot returning version into v_ver;
  v_r := jsonb_build_object('ok', true, 'version', v_ver, 'item', p_item, 'outfit', v_o.outfit_id, 'from', v_from);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('outfit_section', public.hr_outfit_view(v_uid, p_slot));
end $fn$;

-- ── §4 PRIVILEGES: the verb the signed-in client's alone; the owned list the owner's ──
revoke all on function public.hr_outfit_owned(uuid, integer) from public, anon, authenticated, service_role;
revoke execute on function public.hr_outfit_bundle_use(int, text, uuid) from public;
revoke execute on function public.hr_outfit_bundle_use(int, text, uuid) from anon, service_role;
grant  execute on function public.hr_outfit_bundle_use(int, text, uuid) to authenticated;

-- ── §5 THE CLIENT BASELINE AND THE WALL ──────────────────────────────────────
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_outfit_bundle_use'
  and identity_args <> 'p_slot integer, p_item text, p_idem uuid';
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_outfit_bundle_use', 'p_slot integer, p_item text, p_idem uuid', 'authenticated',
   'added 2027-04-30 (lane/c-sweeps-coat-drop): ITEMS (a tradeable bundle turned into a permanent outfit unlock) - takes one of this hero''s own bundles (bag, then its account''s Storage) and owns its outfit for that hero (player_cosmetics); refuses already_owned; pre-EA Security list')
on conflict (proname, identity_args, grantee) do update set note = excluded.note;
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_outfit_bundle_use', 'its own hero')
      on conflict (rpc) do update set why = excluded.why; end if;
end $mig$;

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ─────────
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-00005c0a7001';   -- finds and uses the bundle
  v_b  constant uuid := '000000c0-0000-4000-a000-00005c0a7002';   -- never has one
  k    constant text := '000000c0-0000-4000-b000-5c0a';
  v jsonb; v_role text; v_out text; v_item text; v_n bigint;
begin
  -- (a) THE SHAPE: the verb the signed-in client's alone and on the baseline; the owned list nobody's but the owner's; player_cosmetics
  --     still read-own with no client write and no numeric column; the bundle column's CHECK; hygiene STRICT
  if not has_function_privilege('authenticated', 'public.hr_outfit_bundle_use(integer,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.hr_outfit_bundle_use(integer,text,uuid)', 'execute')
     or has_function_privilege('service_role', 'public.hr_outfit_bundle_use(integer,text,uuid)', 'execute') then
    raise exception 'sweeps-coat §9(a): hr_outfit_bundle_use is not the signed-in client''s alone'; end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_outfit_owned(uuid,integer)', 'execute') then
      raise exception 'sweeps-coat §9(a): % can execute hr_outfit_owned', v_role; end if;
    if has_table_privilege(v_role, 'public.player_cosmetics', 'insert,update,delete') then
      raise exception 'sweeps-coat §9(a): % can write player_cosmetics', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_cosmetics' and cmd <> 'SELECT')
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_cosmetics'
                 and data_type in ('integer', 'bigint', 'numeric', 'smallint', 'real', 'double precision') and column_name <> 'slot') then
    raise exception 'sweeps-coat §9(a): player_cosmetics grew a client write policy or a numeric column'; end if;
  if (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname = 'hr_outfit_bundle_use') <> 1 then
    raise exception 'sweeps-coat §9(a): the verb is not on the client baseline once'; end if;
  if strpos(pg_get_functiondef('public.hr_outfit_owned(uuid,integer)'::regprocedure), 'hr_premium_active(p_user, p_slot, now())') = 0
     or (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.hr_outfit_owned(uuid,integer)'::regprocedure) <> 'plpgsql' then
    raise exception 'sweeps-coat §9(a): hr_outfit_owned left the one premium check or plpgsql'; end if;
  perform public.hr_assert_grant_hygiene(true);
  -- (b) ON REAL HEROES: a bundle outfit (the real one when the outfits catalogue has landed, else a probe row rolled back with the rest) is
  --     owned by nobody; a free outfit by everybody; the use takes ONE bundle and owns it for that hero alone; the hero can wear it, a hero
  --     without one can't; a replay moves nothing; a second use is already_owned and keeps the bundle; a forged item is bad_item; none held
  --     is none_held; a bundle in the account's Storage is used from there
  begin
    select o.outfit_id, o.bundle into v_out, v_item from public.hr_outfits o where o.bundle is not null order by o.outfit_id limit 1;
    if v_out is null then
      v_out := 'probe_coat'; v_item := (select i.item_id from public.hr_items i where i.tradeable and i.value > 0 order by i.item_id limit 1);
      insert into public.hr_outfits (outfit_id, premium, regions, sort, bundle) values (v_out, false, '{}', 999, v_item);
    end if;
    foreach v_role in array array[v_a::text, v_b::text] loop
      insert into auth.users (id) values (v_role::uuid) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_role::uuid, 'Probe Coat ' || right(v_role, 1)) on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_role::uuid, 'sweeps-coat §9 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_role, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'sweeps-coat §9(b): hr_create_character refused: %', v; end if;
    end loop;
    if v_out = any (public.hr_outfit_owned(v_a, 0)) or v_out = any (public.hr_outfit_owned(v_b, 0)) then
      raise exception 'sweeps-coat §9(b): a hero owns % with no bundle used', v_out; end if;
    if not exists (select 1 from public.hr_outfits o where o.bundle is null and not o.premium and o.outfit_id = any (public.hr_outfit_owned(v_b, 0))) then
      raise exception 'sweeps-coat §9(b): a free outfit is no longer everyone''s'; end if;
    -- the bundle-less hero can't wear it
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    v := public.hr_outfit_set(0, v_out, '{}'::jsonb, (k || '00000001')::uuid);
    if v->>'error' is distinct from 'not_owned' then raise exception 'sweeps-coat §9(b): a hero with no bundle wore it: %', v; end if;
    v := public.hr_outfit_bundle_use(0, v_item, (k || '00000002')::uuid);
    if v->>'error' is distinct from 'none_held' then raise exception 'sweeps-coat §9(b): a use with no bundle answered %', v; end if;
    -- the finder: two bundles in the bag
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    insert into public.player_inventory (user_id, slot, item_id, qty) values (v_a, 0, v_item, 2)
      on conflict (user_id, slot, item_id) do update set qty = 2;
    if (public.hr_outfit_bundle_use(0, 'tower_cinders', (k || '00000003')::uuid))->>'error' is distinct from 'bad_item'
       or (public.hr_outfit_bundle_use(0, null, (k || '00000004')::uuid))->>'error' is distinct from 'bad_item'
       or (public.hr_outfit_bundle_use(9, v_item, (k || '00000005')::uuid))->>'error' is distinct from 'bad_slot' then
      raise exception 'sweeps-coat §9(b): a forged item or slot was not refused'; end if;
    delete from public.hr_rate_counters where user_id = v_a;
    v_n := (select count(*) from public.player_ledger where user_id = v_a);
    v := public.hr_outfit_bundle_use(0, v_item, (k || '00000006')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->>'outfit' is distinct from v_out or v->>'from' is distinct from 'bag'
       or (select qty from public.player_inventory where user_id = v_a and slot = 0 and item_id = v_item) is distinct from 1
       or not (v_out = any (public.hr_outfit_owned(v_a, 0))) or v_out = any (public.hr_outfit_owned(v_b, 0))
       or not (v->'outfit_section'->'owned' ? v_out)
       or (select count(*) from public.player_cosmetics where user_id = v_a and slot = 0 and kind = 'outfit' and code = v_out) <> 1
       or (select count(*) from public.player_ledger where user_id = v_a) <> v_n + 1
       or (select count(*) from public.player_ledger where user_id = v_a and intent = 'outfit_bundle_use:' || v_item and item_id = v_item and qty = -1) <> 1 then
      raise exception 'sweeps-coat §9(b): the use answered % (the take, the grant, the owned list or the ledger is off)', v; end if;
    -- a replay: the same receipt, nothing moved twice
    if (public.hr_outfit_bundle_use(0, v_item, (k || '00000006')::uuid))->>'version' is distinct from v->>'version'
       or (select qty from public.player_inventory where user_id = v_a and slot = 0 and item_id = v_item) is distinct from 1 then
      raise exception 'sweeps-coat §9(b): a replay moved the bundle again'; end if;
    -- the second bundle: already owned, kept
    v := public.hr_outfit_bundle_use(0, v_item, (k || '00000007')::uuid);
    if v->>'error' is distinct from 'already_owned' or (select qty from public.player_inventory where user_id = v_a and slot = 0 and item_id = v_item) is distinct from 1 then
      raise exception 'sweeps-coat §9(b): a second use answered % (or burnt the bundle)', v; end if;
    -- now it is worn
    v := public.hr_outfit_set(0, v_out, '{}'::jsonb, (k || '00000008')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'outfit'->>'worn' is distinct from v_out then
      raise exception 'sweeps-coat §9(b): the owner could not wear it: %', v; end if;
    -- the other hero, its account's Storage holding the kept bundle (deposited by hand for the probe): used from Storage
    delete from public.player_inventory where user_id = v_a and slot = 0 and item_id = v_item;
    insert into public.account_bank (user_id, item_id, qty) values (v_b, v_item, 1) on conflict (user_id, item_id) do update set qty = 1;
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    delete from public.hr_rate_counters where user_id = v_b;
    v := public.hr_outfit_bundle_use(0, v_item, (k || '00000009')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->>'from' is distinct from 'storage'
       or exists (select 1 from public.account_bank where user_id = v_b and item_id = v_item)
       or not (v_out = any (public.hr_outfit_owned(v_b, 0))) then
      raise exception 'sweeps-coat §9(b): a stored bundle answered %', v; end if;
    raise exception 'sweeps-coat §9: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'sweeps-coat §9: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) or exists (select 1 from public.player_cosmetics where user_id in (v_a, v_b))
     or exists (select 1 from public.hr_outfits where outfit_id = 'probe_coat') then
    raise exception 'sweeps-coat §9: LEAKED a probe row'; end if;
  raise notice 'sweeps-coat: a bundle outfit owned only by the hero who used its bundle, one bundle a use, kept when owned, worn through hr_outfit_set; all green';
end $$;
