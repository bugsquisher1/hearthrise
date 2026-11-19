-- ════════════════════════════════════════════════════════════════════════
-- 2027-05-19-faction-outfit-path.sql — A FACTION LOOK IS OWNED THROUGH THE HERO'S OWN CLAIMS, AND WORN THROUGH THE ONE OUTFIT PATH
--   (lane/c-faction-outfit-path, backend-architect, 2026-11-18; Tyler 2026-11-14: "more paladin like outfits vs grim reaper type outfit
--   unlocks. (Both can be unlocked by swapping factions)", earned sets kept on a swap; .claude/coordination/CONFLICTS.md 2026-11-16 "two
--   homes for an earned outfit", RESOLVED by this file).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). Pre-EA: applies on
-- its passing §4. ON THE EA SECURITY LIST with the faction verbs (a cosmetic unlock others see).
-- ORDER: after every file on main (it needs 2027-04-22-faction-standing.sql's claims and 2027-04-30-sweeps-coat.sql's reader, both
--   APPLIED), right BEFORE 2027-05-19-faction-outfit-path-outfits-catalogue.generated.sql, which writes the faction looks' hr_outfits rows
--   with their pieces and whose §0 refuses until this file's reader reads the claims: in the other order every hero would own every
--   faction look (the reader before this file owns every non-premium row that carries no bundle).
-- EDGE: none (no engine module reads an outfit; pack-edge --hash does not move). CLIENT: src/data/outfits.js STAGED_OUTFITS and
--   `earnedOnly`, src/shell/windows/character/outfit.js; no new verb, so nothing new is sent.
--
-- ── WHY: ONE READER, THREE DOORS, ONE RECORD PER FACT ───────────────────────
-- A claimed piece (hr_faction_claims, written only by hr_faction_outfit_claim) could not be worn: the one outfit path is hr_outfit_owned
-- (2027-04-30-sweeps-coat.sql), and every consumer of "owned" reads it (hr_outfit_set's not_owned, hr_outfit_view's owned list and worn,
-- the town look, the party and finder views). The two ways to join them were (a) a claim also writes a player_cosmetics 'outfit' row, or
-- (b) hr_outfit_owned reads the claims for rows marked as faction looks. THIS FILE TAKES (b):
--   * ONE RECORD A FACT. The claim row is already the server's record of the earning: keyed (hero, piece), standing-gated, written under
--     the hero's lock and journalled once in hr_faction_ledger. A cosmetics copy would be a second record of the same fact with no
--     constraint between them (a GM tool, a restore or a later verb could move one and not the other): the data double-copy class.
--   * IT SURVIVES A SWAP BY CONSTRUCTION. No faction verb deletes a claim; a swap writes hr_faction_members only. Nothing to re-grant.
--   * NO CLAIM BODY MOVES. hr_faction_outfit_claim, its journal and its guards (tests/faction-standing-db.mjs) stay byte for byte.
--   * AN ADD-ON LOOK NEEDS SEVERAL PIECES, and "holds every one" is a read over the claims either way.
-- hr_outfit_owned stays the single owner of "owned": a free row is everyone's, a premium row the premium hero's, a bundle row its users',
-- a faction look its claimers'.
--
-- ── THE ADD-ONS ARE PART OF THE OUTFIT, NOT A SECOND SLOT ────────────────────
-- An add-on belongs to one outfit (the Hearth Shield on the Emberkeeper means nothing), so it is not a slot of its own. Each set of an
-- outfit and its add-ons is ITS OWN LOOK: one hr_outfits row naming every piece it needs, drawn from one sheet. The Flamebearer alone, with
-- the Hearth Shield, with Holly's Light, with both; the same four for the Emberkeeper. The hero picks which owned look to wear with the
-- one free verb, hr_outfit_set, so showing or hiding an add-on costs nothing and needs no new verb, column or projection: the town look,
-- the party views and the Character window carry the worn look's id as they do today and draw its sheet. (A layer drawn over the body
-- would have to sit behind it in some facings and in front in others, in three renderers; a sheet per look keeps the art's own order.)
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hr_outfits.pieces  text[] NEW COLUMN, null for every row but a faction look: the hr_faction_outfits pieces a hero must hold, EVERY one.
--   CHECK hr_outfits_pieces_shape: one to four piece ids, no null, never premium, never a bundle. Written only by the outfits catalogue
--   (tools/gen-outfits.mjs from src/data/outfits.js; the next file).
-- hr_outfit_owned(p_user, p_slot) -> text[] RESTATED: a faction look is owned iff its pieces are all among the hero's claims (one
--   primary-key-prefix read of hr_faction_claims, then an array containment per row). Every other row exactly as before. Still plpgsql,
--   still internal (no client role executes it), still read by every consumer above, which all follow with no change.
-- No new verb, no new table, no grant. Claiming stays hr_faction_outfit_claim (behind the `factions` switch, standing-gated); wearing
--   stays hr_outfit_set (refuses not_owned). A claim is a fact and is not taken back when the switch is off: the switch closes the doors,
--   never a look a hero already holds (2027-03-21-feature-switches.sql's rule).
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- hr_outfit_owned is a STABLE read: no write, no lock. A claim is an insert under the hero's lock (hr_faction_locked); a claim never
-- leaves, so ownership only ever grows, and hr_outfit_set reading it on its snapshot can at worst answer not_owned for a claim that
-- commits a moment later (the next press sees it). Wearing keeps hr_outfit_set's own key (player_intents, 'outfit_set').
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- No new client verb, argument or grant. For every existing row the reader answers exactly as before (§4(b) holds the free, premium and
-- bundle doors). A faction look is owned only by a hero holding all its pieces; the pieces are written only by the standing-gated claim on
-- the server's clock, and no client value names a hero, a piece count or an owner. What crosses to other players is the worn look's id,
-- read from the server's rows (town look, party view). Cosmetic: no gold, item, XP or power moves.
-- Named for Security: re-applying an OLDER outfits catalogue after the next file would delete the faction looks (player_outfits sets the
-- wearers' outfit to null: they wear their role's look; the claims stay, and the current catalogue puts the rows back).
--
-- ── COST (rows and bytes at 100x players: 600 heroes) ─────────────────────
-- No new row a hero. hr_outfits gains 8 rows (~1 KB). hr_outfit_owned gains one index probe of hr_faction_claims (at most 6 rows a hero)
-- a call; it is called once per hero per look (the outfit section, a town look touch, a party view seat), so at most a few thousand
-- index probes a minute at 100x.
--
-- REVERSIBLE: restate hr_outfit_owned from its pre-image (2027-04-30-sweeps-coat.sql's, §0's md5) AFTER an outfits catalogue without the
--   faction looks has landed (the other order owns them for everyone), then drop the column. No player value moves.
-- IDEMPOTENT: a second apply finds the column and the CHECK, restates the body byte-identical (§0 passes its own image), and §4 rolls back
--   its probes.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PIN ─────────────────────────────────────────────
do $mig$
declare v_md5 text;
begin
  if to_regclass('public.hr_faction_claims') is null or to_regclass('public.hr_faction_outfits') is null
     or to_regprocedure('public.hr_faction_outfit_claim(integer,text,uuid)') is null
     or to_regprocedure('public.hr_faction_swap_finish(integer,uuid)') is null or to_regprocedure('public.hr_faction_section(uuid,integer)') is null then
    raise exception 'PRECONDITION: the factions first (2027-04-22-faction-catalogue.generated.sql, 2027-04-22-faction-standing.sql, 2027-04-23-faction-section.sql)'; end if;
  if to_regclass('public.hr_outfits') is null or to_regclass('public.player_cosmetics') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'hr_outfits' and column_name = 'bundle')
     or to_regprocedure('public.hr_outfit_set(integer,text,jsonb,uuid)') is null or to_regprocedure('public.hr_outfit_view(uuid,integer)') is null
     or to_regprocedure('public.hr_town_look(uuid,integer)') is null or to_regprocedure('public.hr_premium_active(uuid,integer,timestamp with time zone)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: the outfit path first (2027-04-30-sweeps-coat.sql, 2027-03-05-hero-colors.sql)'; end if;
  -- THE PIN: hr_outfit_owned is 2027-04-30-sweeps-coat.sql's image or this file's (md5 of pg_get_functiondef, whitespace runs as one)
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_outfit_owned(uuid,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 not in ('cfe9a082905a659b73b0b9ca8c4e565e', 'e96a36a681fe324d084ce26baa25ac44') then
    raise exception 'PIN: hr_outfit_owned is neither 2027-04-30-sweeps-coat.sql''s image (cfe9a082905a659b73b0b9ca8c4e565e) nor this file''s (e96a36a681fe324d084ce26baa25ac44): md5 % - another file moved it', v_md5; end if;
end $mig$;

-- ── §1 THE SHAPE: the pieces a faction look needs ────────────────────────────
alter table public.hr_outfits add column if not exists pieces text[];
do $mig$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.hr_outfits'::regclass and conname = 'hr_outfits_pieces_shape') then
    alter table public.hr_outfits add constraint hr_outfits_pieces_shape check (pieces is null or (
      cardinality(pieces) between 1 and 4 and array_position(pieces, null) is null
      and array_to_string(pieces, ',') ~ '^[a-z0-9_]{1,32}(,[a-z0-9_]{1,32}){0,3}$' and not premium and bundle is null)); end if;
end $mig$;
comment on column public.hr_outfits.pieces is '2027-05-19-faction-outfit-path.sql: the faction pieces (hr_faction_outfits) a hero must hold, every one, to own this look (hr_faction_claims, read by hr_outfit_owned); null for every row but a faction look. Written by the outfits catalogue.';

-- ── §2 WHO OWNS AN OUTFIT: one reader, three doors ───────────────────────────
-- A bundle row: the heroes who used its bundle (player_cosmetics kind 'outfit'). A faction look: the heroes holding every piece it names
-- (hr_faction_claims, kept across a swap). Every other row as before: a free one is everyone's, a premium one the premium hero's.
create or replace function public.hr_outfit_owned(p_user uuid, p_slot integer)
 returns text[]
 language plpgsql
 stable
 set search_path = public, pg_catalog
as $plc$
-- SWEEPS-COAT (2027-04-30-sweeps-coat.sql): a bundle outfit is the hero's only once it used the bundle. plpgsql, planned once a backend
-- (2027-02-10-settle-plan-cache.generated.sql's reason).
-- FACTION-OUTFIT-PATH (2027-05-19-faction-outfit-path.sql): a faction look is the hero's while it holds every piece the look names.
#variable_conflict use_column
declare
  v_held text[];
begin
  -- THE HERO'S CLAIMS, read once (the primary key's prefix): never taken back, so a swap keeps every look they own
  select coalesce(array_agg(c.piece_id), '{}') into v_held
    from public.hr_faction_claims c where c.user_id = p_user and c.slot = p_slot;
  return (select coalesce(array_agg(o.outfit_id order by o.sort), '{}')
            from public.hr_outfits o
           where case when o.bundle is not null
                      then exists (select 1 from public.player_cosmetics c
                                    where c.user_id = p_user and c.slot = p_slot and c.kind = 'outfit' and c.code = o.outfit_id)
                      when o.pieces is not null
                      then o.pieces <@ v_held
                      else not o.premium or public.hr_premium_active(p_user, p_slot, now()) end);
end
$plc$;

-- ── §3 PRIVILEGES: the owned list is the owner's functions', never a client's ──
revoke all on function public.hr_outfit_owned(uuid, integer) from public, anon, authenticated, service_role;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ─────────
-- (a) the shape and the grants; (b) on real heroes: claim -> owned -> set -> shown (the envelope a reload reads, the town look); the
-- add-on's look needs the outfit's piece too; a swap keeps every look and the one worn; a stranger owns none and can't wear one; the
-- free, premium and bundle doors answer as before; nothing is journalled as value.
do $$
declare
  v_a  constant uuid := '000000c0-0000-4000-a000-0000fa0f0001';   -- claims the outfit and its add-on, wears them, swaps sides
  v_b  constant uuid := '000000c0-0000-4000-a000-0000fa0f0002';   -- the stranger: nothing claimed, then the add-on alone
  k    constant text := '000000c0-0000-4000-b000-fa0f';
  r public.hr_faction_rule%rowtype; v_side text; v_other text; v_scope text; v_base text; v_look text; v_piece text; v_addon text;
  v jsonb; v_role text; v_n bigint; v_need bigint;
begin
  -- (a) THE SHAPE
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(v_role, 'public.hr_outfit_owned(uuid,integer)', 'execute') then
      raise exception 'faction-outfit-path §4(a): % can execute hr_outfit_owned', v_role; end if;
  end loop;
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.hr_faction_claims', 'select,insert,update,delete')
       or has_table_privilege(v_role, 'public.hr_outfits', 'select,insert,update,delete') then
      raise exception 'faction-outfit-path §4(a): % reaches the claims or the outfit catalogue', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('hr_faction_claims', 'hr_outfits')) then
    raise exception 'faction-outfit-path §4(a): a policy opens the claims or the outfit catalogue to a client'; end if;
  if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.hr_outfit_owned(uuid,integer)'::regprocedure) <> 'plpgsql'
     or strpos(pg_get_functiondef('public.hr_outfit_owned(uuid,integer)'::regprocedure), 'from public.hr_faction_claims c where c.user_id = p_user and c.slot = p_slot') = 0
     or strpos(pg_get_functiondef('public.hr_outfit_owned(uuid,integer)'::regprocedure), 'hr_premium_active(p_user, p_slot, now())') = 0
     or strpos(pg_get_functiondef('public.hr_outfit_owned(uuid,integer)'::regprocedure), 'c.kind = ''outfit'' and c.code = o.outfit_id') = 0 then
    raise exception 'faction-outfit-path §4(a): hr_outfit_owned left plpgsql, or lost a door (the claims, premium, the bundle)'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.hr_outfits'::regclass and conname = 'hr_outfits_pieces_shape') then
    raise exception 'faction-outfit-path §4(a): no hr_outfits_pieces_shape'; end if;
  perform public.hr_assert_grant_hygiene(true);

  select * into r from public.hr_faction_rule where id;
  select faction_id into v_side from public.hr_factions order by ord limit 1;
  select faction_id into v_other from public.hr_factions order by ord offset 1 limit 1;
  select scope into v_scope from public.hr_feature_switches where switch_id = 'factions';
  if r.id is null or v_side is null or v_other is null or v_scope is null then
    raise exception 'faction-outfit-path §4: the faction catalogue or its switch is not there to probe with'; end if;
  begin
    -- (b0) THE CHECK refuses a premium faction look and a malformed piece
    begin
      insert into public.hr_outfits (outfit_id, premium, regions, sort, pieces) values ('probe_bad_look', true, '{}', 998, '{flamebearer}');
      raise exception 'faction-outfit-path §4(b): a premium faction look was stored';
    exception when check_violation then null; end;
    begin
      insert into public.hr_outfits (outfit_id, premium, regions, sort, pieces) values ('probe_bad_look', false, '{}', 998, '{Bad Piece}');
      raise exception 'faction-outfit-path §4(b): a malformed piece was stored';
    exception when check_violation then null; end;
    -- THE LOOKS: the side's outfit look and one add-on look on it (the real rows once the outfits catalogue has landed; before it, two
    -- probe rows of the side's first two pieces, rolled back with the rest)
    select o.outfit_id, o.pieces[1] into v_base, v_piece from public.hr_outfits o
     where cardinality(o.pieces) = 1 and exists (select 1 from public.hr_faction_outfits f where f.piece_id = o.pieces[1] and f.faction = v_side)
     order by o.sort limit 1;
    select o.outfit_id, o.pieces[2] into v_look, v_addon from public.hr_outfits o
     where cardinality(o.pieces) = 2 and o.pieces[1] = v_piece order by o.sort limit 1;
    if v_base is null or v_look is null then
      select f.piece_id into v_piece from public.hr_faction_outfits f where f.faction = v_side order by f.ord limit 1;
      select f.piece_id into v_addon from public.hr_faction_outfits f where f.faction = v_side order by f.ord offset 1 limit 1;
      if v_piece is null or v_addon is null then raise exception 'faction-outfit-path §4(b): the side has no two pieces to probe with'; end if;
      v_base := 'probe_look'; v_look := 'probe_look_addon';
      insert into public.hr_outfits (outfit_id, premium, regions, sort, pieces) values
        (v_base, false, '{}', 990, array[v_piece]), (v_look, false, '{}', 991, array[v_piece, v_addon]);
    end if;
    v_need := (select max(f.need_ms) from public.hr_faction_outfits f where f.piece_id in (v_piece, v_addon));
    update public.hr_feature_switches set scope = 'everyone' where switch_id = 'factions';
    foreach v_role in array array[v_a::text, v_b::text] loop
      insert into auth.users (id) values (v_role::uuid) on conflict (id) do nothing;
      insert into public.profiles (id, display_name) values (v_role::uuid, 'Probe Look ' || right(v_role, 1)) on conflict (id) do update set display_name = excluded.display_name;
      insert into public.hr_access_allowlist (user_id, note) values (v_role::uuid, 'faction-outfit-path §4 probe') on conflict (user_id) do nothing;
      perform set_config('request.jwt.claim.sub', v_role, true);
      v := public.hr_create_character(0);
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction-outfit-path §4(b): hr_create_character refused: %', v; end if;
      -- past Krell (the server's own kill count), on the first side, with the standing both pieces need
      insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at)
        values (v_role::uuid, 0, 'stat', 'ev:kill_monster:' || r.join_monster, '', 1, now());
      delete from public.hr_rate_counters where user_id = v_role::uuid;
      v := public.hr_faction_join(0, v_side, gen_random_uuid());
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction-outfit-path §4(b): the join answered %', v; end if;
      insert into public.hr_faction_standing (user_id, slot, faction, ms) values (v_role::uuid, 0, v_side, v_need);
    end loop;
    v_n := (select count(*) from public.player_ledger where user_id in (v_a, v_b));

    -- THE OTHER DOORS ANSWER AS BEFORE: a free row is everyone's, a bundle row nobody's who used none
    if not exists (select 1 from public.hr_outfits o where o.bundle is null and o.pieces is null and not o.premium and o.outfit_id = any (public.hr_outfit_owned(v_b, 0)))
       or exists (select 1 from public.hr_outfits o where o.bundle is not null and o.outfit_id = any (public.hr_outfit_owned(v_b, 0))) then
      raise exception 'faction-outfit-path §4(b): the free or the bundle door moved'; end if;
    -- NOTHING CLAIMED: neither owns a faction look, and the owner-to-be can't wear one
    if v_base = any (public.hr_outfit_owned(v_a, 0)) or v_look = any (public.hr_outfit_owned(v_a, 0)) then
      raise exception 'faction-outfit-path §4(b): a hero owns a faction look with no claim'; end if;
    perform set_config('request.jwt.claim.sub', v_a::text, true);
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_outfit_set(0, v_base, '{}'::jsonb, (k || '00000001')::uuid);
    if v->>'error' is distinct from 'not_owned' then raise exception 'faction-outfit-path §4(b): an unclaimed look was worn: %', v; end if;

    -- CLAIM -> OWNED -> SET -> SHOWN: the outfit's piece owns the outfit's look and not the add-on's
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_faction_outfit_claim(0, v_piece, (k || '00000002')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction-outfit-path §4(b): the claim answered %', v; end if;
    if not (v_base = any (public.hr_outfit_owned(v_a, 0))) or v_look = any (public.hr_outfit_owned(v_a, 0)) or v_base = any (public.hr_outfit_owned(v_b, 0)) then
      raise exception 'faction-outfit-path §4(b): after the outfit''s claim the owned lists are % and %', public.hr_outfit_owned(v_a, 0), public.hr_outfit_owned(v_b, 0); end if;
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_outfit_set(0, v_base, '{}'::jsonb, (k || '00000003')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'outfit'->>'worn' is distinct from v_base then
      raise exception 'faction-outfit-path §4(b): the claimer could not wear its look: %', v; end if;
    if public.hr_state_of(v_a, 0)->'outfit'->>'worn' is distinct from v_base or public.hr_town_look(v_a, 0)->'outfit'->>'id' is distinct from v_base then
      raise exception 'faction-outfit-path §4(b): the envelope (%) or the town look (%) does not show the worn look',
        public.hr_state_of(v_a, 0)->'outfit', public.hr_town_look(v_a, 0)->'outfit'; end if;
    -- THE ADD-ON: claimed, its look is owned and worn
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_faction_outfit_claim(0, v_addon, (k || '00000004')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or not (v_look = any (public.hr_outfit_owned(v_a, 0))) then
      raise exception 'faction-outfit-path §4(b): the add-on''s claim answered % and owns %', v, public.hr_outfit_owned(v_a, 0); end if;
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_outfit_set(0, v_look, '{}'::jsonb, (k || '00000005')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or public.hr_town_look(v_a, 0)->'outfit'->>'id' is distinct from v_look then
      raise exception 'faction-outfit-path §4(b): the add-on''s look was not worn: %', v; end if;

    -- THE SWAP KEEPS IT: the week passed (a fixture), the swap started, its hunting time credited (a fixture), finished; A is on the
    -- other side, still owns both looks, still wears the add-on's, and may wear the outfit's again
    update public.hr_faction_members set changed_at = now() - make_interval(secs => r.cooldown_ms / 1000.0 + 1) where user_id = v_a and slot = 0;
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_faction_swap_start(0, v_other, (k || '00000006')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction-outfit-path §4(b): the swap start answered %', v; end if;
    update public.hr_faction_members set swap_ms = r.swap_ms where user_id = v_a and slot = 0;
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_faction_swap_finish(0, (k || '00000007')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select m.faction from public.hr_faction_members m where m.user_id = v_a and m.slot = 0) is distinct from v_other then
      raise exception 'faction-outfit-path §4(b): the swap finish answered %', v; end if;
    if not (v_base = any (public.hr_outfit_owned(v_a, 0))) or not (v_look = any (public.hr_outfit_owned(v_a, 0)))
       or public.hr_state_of(v_a, 0)->'outfit'->>'worn' is distinct from v_look or public.hr_town_look(v_a, 0)->'outfit'->>'id' is distinct from v_look then
      raise exception 'faction-outfit-path §4(b): the swap took a look away: owned %, worn %', public.hr_outfit_owned(v_a, 0), public.hr_state_of(v_a, 0)->'outfit'->>'worn'; end if;
    delete from public.hr_rate_counters where user_id = v_a;
    v := public.hr_outfit_set(0, v_base, '{}'::jsonb, (k || '00000008')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v->'outfit'->>'worn' is distinct from v_base then
      raise exception 'faction-outfit-path §4(b): after the swap the outfit''s look could not be worn: %', v; end if;

    -- THE STRANGER: no claim, no look; the add-on's piece alone owns no look (its look needs the outfit's piece too)
    perform set_config('request.jwt.claim.sub', v_b::text, true);
    delete from public.hr_rate_counters where user_id = v_b;
    v := public.hr_outfit_set(0, v_look, '{}'::jsonb, (k || '00000009')::uuid);
    if v->>'error' is distinct from 'not_owned' then raise exception 'faction-outfit-path §4(b): a stranger wore a look: %', v; end if;
    delete from public.hr_rate_counters where user_id = v_b;
    v := public.hr_faction_outfit_claim(0, v_addon, (k || '0000000a')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'faction-outfit-path §4(b): the stranger''s claim answered %', v; end if;
    if v_look = any (public.hr_outfit_owned(v_b, 0)) or v_base = any (public.hr_outfit_owned(v_b, 0)) then
      raise exception 'faction-outfit-path §4(b): the add-on''s piece alone owns a look: %', public.hr_outfit_owned(v_b, 0); end if;
    delete from public.hr_rate_counters where user_id = v_b;
    v := public.hr_outfit_set(0, v_look, '{}'::jsonb, (k || '0000000b')::uuid);
    if v->>'error' is distinct from 'not_owned' then raise exception 'faction-outfit-path §4(b): the add-on alone was worn: %', v; end if;
    -- NO VALUE MOVED: claims journal in hr_faction_ledger, a wear in no ledger
    if (select count(*) from public.player_ledger where user_id in (v_a, v_b)) <> v_n then
      raise exception 'faction-outfit-path §4(b): a claim or a wear wrote the value ledger'; end if;
    raise exception using errcode = 'HR519', message = 'faction-outfit-path §4 complete - rolling back';
  exception when sqlstate 'HR519' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if (select scope from public.hr_feature_switches where switch_id = 'factions') is distinct from v_scope then
    raise exception 'faction-outfit-path §4: the probe left the switch moved'; end if;
  if exists (select 1 from public.player_state where user_id in (v_a, v_b)) or exists (select 1 from public.hr_faction_claims where user_id in (v_a, v_b))
     or exists (select 1 from public.hr_outfits where outfit_id in ('probe_look', 'probe_look_addon', 'probe_bad_look')) then
    raise exception 'faction-outfit-path §4: LEAKED a probe row'; end if;
  raise notice 'faction-outfit-path §4: a faction look owned only while every piece is claimed, worn through hr_outfit_set, shown in the envelope and the town look, kept across a swap, refused to a stranger; the other doors unchanged; all green';
end $$;
