-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1071-trait-pieces.sql — THE TRAIT PIECE: ONE ACCOUNT-OWNED ROW A PIECE, WHAT A HERO WEARS OF THEM IN THE FIGHT,
--   AND THE SETTLE'S TRAIT ROLL LANDED UNDER THE SERVER'S OWN BOUNDS, DARK (lane/t1-traits-drop, backend-architect, 2026-11-26;
--   docs/design/redesign/20-v030-the-roads.md section 4 Band 3 T1, 12-targets.md 3.3 / 8 / 8.1 / 8.2, 14-trait-candidates.md,
--   19-power-ledger.md row 5, 13-security-list.md N-11 / N-12 / N-13; the catalogue is 1071-trait-pieces-catalogue.generated.sql).
--
-- STATUS: supabase/migration-notes/1071-trait-pieces.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12), after 1071-trait-pieces-catalogue.generated.sql (the rules it reads).
--   Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §7 self-check.
--
-- ── DARK ─────────────────────────────────────────────────────────────────────
-- Three hr_flags switches, OFF at apply (insert do nothing: a re-apply never flips a live one):
--   trait_pieces   the piece table's readers: the `pieces` section and the worn projection (`worn_traits`) the engine plays
--   signatures     the worn Signature projection (`worn_signature`)
--   trait_drops    the settle's Trait roll: the read hands the engine each hero's pity and luck, the commit lands what it found
-- Off, every reader answers null, the read hands the engine nothing to play or roll (src/core/hunt/trait-rules.js, signature-rules.js and
-- trait-roll.js play exactly what they are handed), and a commit that carries a roll is refused `traits_dark`. They flip with wave 4's
-- wear verb and the pre-EA Security review (GEAR_STEPS.traitsLive and SIGNATURE_RULES.live are the data's twin of the same line).
--
-- ── THE CONTRACT ─────────────────────────────────────────────────────────────
-- TABLE trait_pieces (RLS on; the account reads its own rows; NO client write; the settle's land is the only writer today):
--   id uuid pk · user_id (the owning account) · found_slot (the hero that found it) · base (the item, hr_items) · slot (the Trait slot,
--   gear-steps.js traitSlots) · item_level (the ground's gearLevel: the ground fixes the base) · rarity rare | very_rare | signature ·
--   traits [{ id, rank }] (1 on a Rare, 2 on a Very Rare, none on a Signature) · signature (a Signature piece's id, else null) · hunt_id,
--   step, depth (where it was found: the step the swing stood at, the depth the SERVER derives from it) · instance_id, session_id,
--   kill_unit, at_ms (THE KILL THAT MADE IT: the monster's unit and the instant) · escrow (the market's hold, null = free) ·
--   worn_slot, worn_equip_slot, worn_at (the hero and equip slot that wears it, and when it was put on) · created_at.
--   UNIQUE (instance_id, user_id, found_slot, at_ms, kill_unit): one piece a kill a hero, so no replay or retry can land a kill twice.
--   UNIQUE (user_id, worn_slot, worn_equip_slot) where worn: one piece an equip slot a hero, and a piece is one row, so never worn twice.
-- THE WORN PROJECTION (hr_hunt_instance_read, RESTATED WHOLE: its chain was 6 patches deep since 1053-lever-gates.sql, the patch-chain rule):
--   each member's `worn_traits` = hr_worn_traits_of (the Traits of every piece the hero wears whose base is the item its equip slot holds
--   in player_equipment, and which no escrow holds) and `worn_signature` = hr_worn_signature_of (the Signature of the FIRST such piece the
--   hero put on, by worn_at: 15 "one a hero"). A piece whose base left the slot (the plain equip verb) plays nothing: the join is the rule.
--   hunt-settle.js memberInput hands both to heroSetup; the frozen peer row (src/core/member.js) and the viewer's live start point carry
--   the hero, so the browser plays the same list the settle does.
-- THE ROLL'S INPUTS (the same read): instance `trait_drops` (hr_flag_on) and each member's `drops` = hr_trait_drops_of: { pity: { rare,
--   very_rare } (hero_pity, the roller's missed rolls since its last find), luck_pm (the company flame's luck, 0 while inner_flame is
--   off) }, null while dark. Read at the window's start, never after it.
-- THE LAND (hr_trait_pieces_land, owner-only; hr_hunt_apply_instance RESTATED WHOLE, its chain 4 deep since 2027-03-21-scaled-hunts.sql):
--   a member's `traits` { found: [piece], pity: { rare, very_rare } } is proved under every lock the settle holds, after every member's
--   hr_hunt_apply_member landed (so its kills are the kill bound's), and refused whole on any breach (HR000, counted on that seat):
--     dark                 traits_dark (the switch is off)
--     shape                bad_traits (keys, types, a piece's keys)
--     count                traits_over (more pieces than the member's journalled kills, or past c_found_max)
--     ground               traits_ground (the instance's ground rolls no Trait: no hr_piece_grounds row, or max_rank 0; or off the scale)
--     the piece            piece_who (its hero or unit is not the member's), piece_when (its kill outside the window), piece_where (its
--                          step past the window's proven ceiling, hr_danger_prove `hi`), piece_base (not a piece the ground drops in that
--                          slot at its base item Level), piece_rarity, piece_traits (count, an unknown id, another slot, a first Trait not
--                          of this ground's pool, two of one key, a banned pair), piece_rank (outside [max(1, top - 1), top] at the
--                          depth the SERVER derives from the step, top held to the ground's max_rank), piece_depth (the edge's depth is
--                          not the server's), piece_twice (the same kill twice)
--     pity                 pity_over (a count that grew past the window's kills, or a negative one)
--   then inserts each piece, upserts the hero's pity, and journals ONE player_ledger row a piece (kind 'trait', intent 'trait_piece',
--   no gold, no item quantity: a piece is no stack). The member's answer (hunt_settle.found) names what landed, the drop moment.
-- THE SECTION `pieces` (hr_trait_pieces_view): the account's pieces, newest first, each with its session (the return card's line reads
--   the pieces its session found). null while trait_pieces is off.
--
-- ── CONCURRENCY / IDEMPOTENCY ────────────────────────────────────────────────
-- The land runs inside hr_hunt_apply_instance's one subtransaction, under the instance lock and every member's hr_hunt_lock (taken in
-- (user_id, slot) order before anything else), so a hero's pity and pieces move with its window or not at all. A replayed commit stops at
-- the instance's world CAS before any member lands (stage 'replayed'); the kill key's UNIQUE is the second fence. Pity is a count the
-- engine carries (trait-roll.js rollKillFor), read at the window's start and written at its end under the hero's lock: a cut anywhere
-- draws the same dice (tests/drop-formula.mjs DF-5), so a viewed hunt and a closed one store the same rows (tests/trait-pieces-db.mjs).
--
-- ── EXPLOIT SURFACE ──────────────────────────────────────────────────────────
-- A piece is tradeable value (the market's top; N-11, N-13). No client verb is added and no client role reaches a table write or a helper.
-- The edge proposes; Postgres re-proves every property a piece states against the server's catalogue and clocks, and bounds the count by
-- the kills it already holds. What it cannot re-prove is the dice (the server-only `t:<unit>` stream, never sent to a browser): that is
-- the same trust every other drop rests on. ON THE PRE-EA SECURITY LIST (13-security-list.md N-12, N-13).
--
-- ── COST (100x: 2,000 accounts x 4 heroes x 12 h) ────────────────────────────
-- Dark: three hr_flag_on reads a member a read, nothing written. Lit: two indexed reads a member a read; a hero-pity upsert (two rows) a
-- member a settle that killed; a Rare every 40 hunted hours a hero (DROP_HOURS), so ~2,400 piece rows and ~2,400 ledger rows a day at
-- 96,000 hero-hours a day (Very Rares a tenth of that), ~300 B a piece: ~0.7 MB a day, every row a value object (never a tick or a kill).
-- The `pieces` section grows ~150 B a piece an account in every envelope: a sell / salvage verb keeps it bounded (wave 4, noted).
--
-- EDGE: hr-accrue (hunt-settle.js memberInput reads worn_traits / worn_signature / drops, proposeHuntSettle hands the roll and carries
--   `traits` a member). An older edge proposes no `traits` and reads none of the new keys: nothing worn, nothing rolled. An older database
--   carries none of them: the new edge plays and rolls nothing. Either order of deploy is safe.
-- REVERSIBLE: restate hr_hunt_instance_read and hr_hunt_apply_instance from their pre images (1053-lever-gates.sql's read + 1056's splice;
--   2027-03-31-watched-settle-cost.sql's apply + 1056's two splices), drop the section row, the four functions and trait_pieces; the
--   flags may stay. hero_pity rows written while lit are the roller's carry and may be truncated.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_piece_rules') is null or to_regclass('public.hr_piece_traits') is null or to_regclass('public.hr_piece_grounds') is null
     or to_regclass('public.hr_piece_depths') is null or to_regclass('public.hr_piece_bases') is null or to_regclass('public.hr_piece_signatures') is null then
    raise exception 'PRECONDITION: the catalogue first (1071-trait-pieces-catalogue.generated.sql)'; end if;
  if to_regclass('public.hero_pity') is null or to_regprocedure('public.hr_flame_luck_pm(bigint)') is null or to_regclass('public.company_flame') is null then
    raise exception 'PRECONDITION: 1063-flame-temper.sql first (hero_pity, company_flame, hr_flame_luck_pm)'; end if;
  if to_regprocedure('public.hr_danger_prove(uuid,text,bigint)') is null or to_regclass('public.hr_danger_grounds') is null then
    raise exception 'PRECONDITION: 1056-danger-scale.sql first (hr_danger_prove)'; end if;
  if to_regprocedure('public.hr_flag_on(text)') is null or to_regclass('public.hr_flags') is null or to_regclass('public.hr_state_sections') is null
     or to_regprocedure('public.hr_reject(text,jsonb)') is null or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regclass('public.player_equipment') is null
     or to_regclass('public.hr_items') is null or to_regclass('public.hunt_sessions') is null or to_regclass('public.hunt_instances') is null then
    raise exception 'PRECONDITION: a helper or table this file reads is missing'; end if;
end $mig$;

-- ── §0b THE PINS: the two bodies this file restates, as the chain holds them before it (or this file's own, a second apply) ──
do $mig$
declare v_r record; v_md5 text;
begin
  for v_r in select * from (values
    ('public.hr_hunt_instance_read(uuid,integer)', '3097347b88e3a5187f2f12cf0d7fbcae'),
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', '3a6748518733987584b75e42e1d204d5')) t(fn, pre) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(v_r.fn);
    if v_md5 is null then raise exception 'PIN: % is missing', v_r.fn; end if;
    if v_md5 is distinct from v_r.pre
       and position('TRAIT-PIECES (1071-trait-pieces.sql)' in (select replace(prosrc, chr(13), '') from pg_proc where oid = to_regprocedure(v_r.fn))) = 0 then
      raise exception 'PIN: % is neither the image this file restates (%) nor its own: md5 % - another file moved it; re-derive this restatement', v_r.fn, v_r.pre, v_md5;
    end if;
  end loop;
end $mig$;

-- ── §1 THE SWITCHES (off at apply; never flipped back by a re-apply) ──────────
insert into public.hr_flags (key, enabled, note) values
  ('trait_pieces', false, '1071-trait-pieces.sql: the piece table''s readers (the pieces section, the worn Traits the engine plays). Lit with wave 4''s wear verb.'),
  ('signatures', false, '1071-trait-pieces.sql: the worn Signature the engine plays (worn_signature). Lit with the Signatures'' drop and their review.'),
  ('trait_drops', false, '1071-trait-pieces.sql: the settle''s Trait roll (pity and luck handed to the engine, the pieces it found landed).')
  on conflict (key) do nothing;

-- ── §2 THE TABLE ─────────────────────────────────────────────────────────────
create table if not exists public.trait_pieces (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  found_slot      int  not null check (found_slot >= 0),
  base            text not null check (base ~ '^[a-z0-9_]{1,64}$'),
  slot            text not null check (slot ~ '^[a-z0-9_]{1,32}$'),
  item_level      int  not null check (item_level >= 0),
  rarity          text not null check (rarity in ('rare', 'very_rare', 'signature')),
  traits          jsonb not null default '[]'::jsonb check (jsonb_typeof(traits) = 'array' and jsonb_array_length(traits) <= 2),
  signature       text check (signature is null or signature ~ '^[a-z0-9_]{1,64}$'),
  hunt_id         text not null check (hunt_id ~ '^[a-z0-9_]{1,64}$'),
  step            int  not null check (step >= 0),
  depth           int  not null check (depth >= 1),
  instance_id     uuid not null,
  session_id      uuid,
  kill_unit       int  not null check (kill_unit >= 0),
  at_ms           bigint not null check (at_ms > 0),
  escrow          text check (escrow is null or escrow ~ '^[a-z_]{1,32}$'),
  worn_slot       int  check (worn_slot is null or worn_slot >= 0),
  worn_equip_slot text check (worn_equip_slot is null or worn_equip_slot ~ '^[a-z0-9_]{1,32}$'),
  worn_at         timestamptz,
  created_at      timestamptz not null default now(),
  constraint trait_pieces_kill_once unique (instance_id, user_id, found_slot, at_ms, kill_unit),
  constraint trait_pieces_rarity_shape check (
    (rarity = 'rare' and jsonb_array_length(traits) = 1 and signature is null)
    or (rarity = 'very_rare' and jsonb_array_length(traits) = 2 and signature is null)
    or (rarity = 'signature' and jsonb_array_length(traits) = 0 and signature is not null)),
  constraint trait_pieces_worn_shape check ((worn_slot is null) = (worn_equip_slot is null) and (worn_slot is null) = (worn_at is null)),
  constraint trait_pieces_escrow_unworn check (escrow is null or worn_slot is null)
);
create unique index if not exists trait_pieces_worn_once on public.trait_pieces (user_id, worn_slot, worn_equip_slot) where worn_slot is not null;
create index if not exists trait_pieces_by_account on public.trait_pieces (user_id, at_ms desc);
comment on table public.trait_pieces is '1071-trait-pieces.sql: one Trait or Signature piece a row, owned by an account (12-targets 8, 13-market 2.3). Written by the settle''s land only (hr_trait_pieces_land); no client write.';
alter table public.trait_pieces enable row level security;
revoke all on public.trait_pieces from public, anon, authenticated, service_role;
grant select on public.trait_pieces to authenticated;
drop policy if exists trait_pieces_own on public.trait_pieces;
create policy trait_pieces_own on public.trait_pieces for select to authenticated using (user_id = auth.uid());
comment on column public.hero_pity.misses is '1071-trait-pieces.sql: the Trait roller''s missed rolls of this rarity since the hero''s last find (src/core/trait-roll.js rollKillFor: whole rolls, its pityChance reads them), written by hr_trait_pieces_land only.';

-- ── §3 THE READERS: what a hero wears, what it rolls with, the account's pieces ──
create or replace function public.hr_worn_traits_of(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  -- TRAIT-PIECES (1071-trait-pieces.sql): the Traits hero (p_user, p_slot) wears, [{ id, rank }] by equip slot then the piece's own order:
  -- every piece whose base is the item its equip slot holds and which no escrow holds, and every named piece it wears that always carries
  -- a Trait (hr_piece_fixed, traits.js fixedOn: a plain item, so its equip slot is the whole rule). null while dark or none.
  if not public.hr_flag_on('trait_pieces') then return null; end if;
  return (select jsonb_agg(x.w order by x.equip_slot, x.n) from (
            select p.worn_equip_slot as equip_slot, t.n, jsonb_build_object('id', t.value->>'id', 'rank', (t.value->>'rank')::int) as w
              from public.trait_pieces p
              join public.player_equipment e on e.user_id = p.user_id and e.slot = p.worn_slot and e.equip_slot = p.worn_equip_slot and e.item_id = p.base
              cross join lateral jsonb_array_elements(p.traits) with ordinality t(value, n)
             where p.user_id = p_user and p.worn_slot = p_slot and p.escrow is null
            union all
            select e.equip_slot, 0, jsonb_build_object('id', f.trait_id, 'rank', f.rank)
              from public.player_equipment e join public.hr_piece_fixed f on f.item_id = e.item_id
             where e.user_id = p_user and e.slot = p_slot) x);
end $fn$;

create or replace function public.hr_worn_signature_of(p_user uuid, p_slot int)
returns text language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  -- TRAIT-PIECES (1071-trait-pieces.sql): the Signature of the FIRST Signature piece hero (p_user, p_slot) put on (worn_at; 15 "one a
  -- hero": a second worn Signature plays nothing), held as its piece is (the base in its equip slot, no escrow). null while dark or none.
  if not public.hr_flag_on('signatures') then return null; end if;
  return (select p.signature from public.trait_pieces p
            join public.player_equipment e on e.user_id = p.user_id and e.slot = p.worn_slot and e.equip_slot = p.worn_equip_slot and e.item_id = p.base
           where p.user_id = p_user and p.worn_slot = p_slot and p.escrow is null and p.signature is not null
           order by p.worn_at, p.id limit 1);
end $fn$;

create or replace function public.hr_trait_drops_of(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_h bigint;
begin
  -- TRAIT-PIECES (1071-trait-pieces.sql): what the roller reads for this hero at the window's start: its pity by rarity (hero_pity, 0 for
  -- none) and its company's flame luck (21 section 1.2: after depth, before pity; 0 while inner_flame is off). null while trait_drops is off.
  if not public.hr_flag_on('trait_drops') then return null; end if;
  if public.hr_flag_on('inner_flame') then select f.height_mpts into v_h from public.company_flame f where f.user_id = p_user; end if;
  return jsonb_build_object(
    'pity', jsonb_build_object(
      'rare', coalesce((select misses from public.hero_pity where user_id = p_user and slot = p_slot and rarity = 'rare'), 0),
      'very_rare', coalesce((select misses from public.hero_pity where user_id = p_user and slot = p_slot and rarity = 'very_rare'), 0)),
    'luck_pm', case when v_h is null then 0 else public.hr_flame_luck_pm(v_h) end);
end $fn$;

create or replace function public.hr_trait_pieces_view(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
begin
  -- THE SECTION `pieces` (1071-trait-pieces.sql): the account's Trait and Signature pieces as the server holds them, newest first. Each
  -- names its session (the return card's line: what that hunt found), where it was found and who wears it. null while trait_pieces is off.
  if not public.hr_flag_on('trait_pieces') then return null; end if;
  return jsonb_build_object('pieces', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'base', p.base, 'slot', p.slot, 'rarity', p.rarity, 'traits', p.traits, 'signature', p.signature, 'il', p.item_level,
      'ground', p.hunt_id, 'depth', p.depth, 'found_by', p.found_slot, 'session', p.session_id, 'at_ms', p.at_ms,
      'worn', case when p.worn_slot is null then null else jsonb_build_object('slot', p.worn_slot, 'equip_slot', p.worn_equip_slot) end,
      'escrow', p.escrow) order by p.at_ms desc, p.id)
    from public.trait_pieces p where p.user_id = p_user), '[]'::jsonb));
end $fn$;

do $mig$
declare v_sig text; v_role text;
begin
  foreach v_sig in array array['public.hr_worn_traits_of(uuid,integer)', 'public.hr_worn_signature_of(uuid,integer)',
      'public.hr_trait_drops_of(uuid,integer)', 'public.hr_trait_pieces_view(uuid,integer)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated, service_role', v_sig);
    foreach v_role in array array['hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) then execute format('revoke execute on function %s from %I', v_sig, v_role); end if;
    end loop;
  end loop;
end $mig$;
insert into public.hr_state_sections (key, fn, note) values
  ('pieces', 'hr_trait_pieces_view', '1071-trait-pieces.sql: the account''s Trait and Signature pieces (base, Traits, where found, its session, who wears it); null while trait_pieces is off')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;

-- ── §4 hr_hunt_instance_read, RESTATED WHOLE (its chain was 6 patches deep since 1053-lever-gates.sql; this file's lines: TRAIT-PIECES) ──
CREATE OR REPLACE FUNCTION public.hr_hunt_instance_read(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_role text;
  v_s    public.hunt_sessions%rowtype;
  v_i    public.hunt_instances%rowtype;
begin
  -- PARTY-LEADER (2026-11-01-party-leader-density.sql): each member says whether it leads the instance's party.
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): every member plays the density frozen on the instance
  -- (its options.density overlaid), the one the settle bounds count; NULL (opened before the freeze) = as stored.
  -- SETTLE-COST (2027-02-02-settle-cost.sql): each member's `state` is its ENGINE INPUTS (hr_hunt_member_state),
  -- never its whole envelope: the engine reads eleven fields of it, and nine envelopes a settle were its cost.
  -- HUNT-TIERS (2027-02-27-hunt-tiers.sql): every member plays the tier frozen on the instance too (options.tier), beside the pull it froze with it.
  -- TARGET-KIND (2027-04-22-target-kind.sql): RESTATED WHOLE (the two splices below folded in). Each member's options carry its own
  -- First target on this ground (options.target_kind, hunt-spawn.js heroSetup), read afresh every settle, never frozen.
  -- SESSION-MODES (2027-04-23-session-modes.sql): the instance carries the session mode the server froze at its start (session_mode),
  -- the engine's only source of it (hunt-settle.js; none, or one it has no row for, and it proposes nothing).
  -- TOWER-CLIMB (2027-04-24-tower-climb.sql): the instance carries the Burning Tower's floor whose room stands or stands next (tower_floor:
  -- hr_tower_floor_of, the server's own record), the engine's only source of it; null on every other ground.
  -- LEVER-HORIZON (1005-lever-horizon.sql): RESTATED WHOLE. The First target is the member read's (the window's setup, held past a
  -- lever inside the seed horizon), still only a kind the ground fields; its key is dropped from the session, which is byte-identical.
  -- TRAIT-PIECES (1071-trait-pieces.sql): RESTATED WHOLE (1053-lever-gates.sql's body and 1056-danger-scale.sql's splice folded in). Each
  -- member carries the pieces it wears (worn_traits, worn_signature) and what its Trait roll reads (drops); the instance whether the roll
  -- is on (trait_drops). Each is null or false while its switch is off, so the engine plays and rolls exactly what it always did.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_instance_read: not callable by %', v_role using errcode = '42501';
  end if;
  if p_user is null or p_slot is null then return null; end if;
  select * into v_s from public.hunt_sessions h where h.user_id = p_user and h.slot = p_slot and h.ended_at is null;
  if not found then return jsonb_build_object('open', false); end if;
  select * into v_i from public.hunt_instances i where i.id = v_s.instance_id;
  if not found then return jsonb_build_object('open', false); end if;
  return jsonb_build_object(
    'open', true,
    'instance', jsonb_build_object(
      'id', v_i.id, 'hunt', v_i.hunt_id, 'kind', v_i.kind, 'world', v_i.world, 'world_swing', v_i.world_swing,
      'density', v_i.density,
      'tier', v_i.tier,
      'session_mode', v_i.session_mode,
      'tower_floor', public.hr_tower_floor_of(v_i.id),
      -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): the server's own scale of the next window (hr_scaled_hunt_of: { level, banked_ms,
      -- user, slot } of the leader, or null) and the Level the stored world was built on (the engine restarts a world built on another).
      'scale', public.hr_scaled_hunt_of(v_i.id), 'scale_level', v_i.scale_level,
      -- PARTY-HOLD (2026-12-08-party-hold.sql): the seat whose tank holds every lap (hunt_parties.hold_seat), null = take turns.
      'hold_seat', (select public.hr_party_hold_played(p, v_i.settled_to) from public.hunt_parties p where p.id = v_i.id and p.closed_at is null),
      -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): the catalogue's world shape; an engine of another proposes nothing.
      'world_shape', (select jsonb_build_object('v', w.version, 's', w.shape) from public.hr_hunt_world_shape w where w.id),
      'settled_to_ms', ceil(extract(epoch from v_i.settled_to) * 1000)::bigint,
      'next_swing_at_ms', ceil(extract(epoch from v_i.next_swing_at) * 1000)::bigint,
      'enabled', coalesce((select c.enabled from public.hr_hunt_config c where c.id), false),
      -- TRAIT-PIECES (1071-trait-pieces.sql): whether this window's kills roll Traits (the switch trait_drops; hunt-settle.js traitDropsOf).
      'trait_drops', public.hr_flag_on('trait_drops'),
      -- THE INSTANCE'S KEYED SEED SECRET (hunt-seed.js): reachable by the engine only.
      'secret', public.hr_seed(null, 0, 'hunt:' || v_i.id::text)::text),
    'members', coalesce((select jsonb_agg(jsonb_build_object(
                 'user', h.user_id, 'slot', h.slot, 'seat', h.seat, 'unit_id', h.unit_id,
                 -- LEAVE-TOGETHER (2026-12-18-party-leave-together.sql): the member's own box (combat-sim.js cascadeFrom).
                 'leave_together', public.hr_party_leave_together_of(h.user_id, h.slot, v_i.id),
                 -- KICKED: still hunting in its party's instance but no longer seated in that party: only the leader's
                 -- hr_hunt_party_kick does that (Leave party and Disband refuse while hunting, the sweep skips
                 -- hunters). Its end sends nobody home (Coordinator ruling 2026-10-23).
                 'kicked', exists (select 1 from public.hunt_parties p where p.id = v_i.id)
                           and not exists (select 1 from public.hunt_party_members pm
                                            where pm.party_id = v_i.id and pm.user_id = h.user_id and pm.slot = h.slot),
                 -- THE PARTY LEADER (hunt_parties.leader_*; a party instance's id is its party's): its density sets the pull.
                 'leads', exists (select 1 from public.hunt_parties p where p.id = v_i.id and p.closed_at is null
                                    and p.leader_user = h.user_id and p.leader_slot = h.slot),
                 'session', case when v_i.density is null then mr.r
                                 else jsonb_set(mr.r, '{options}', coalesce(mr.r->'options', '{}'::jsonb) || jsonb_build_object('density', v_i.density, 'tier', coalesce(v_i.tier, 'normal'))
                                   -- DANGER-SCALE (1056-danger-scale.sql): the stance and start step the instance froze, null on a tier hunt (overlaid last)
                                   || jsonb_build_object('risk', v_i.risk, 'danger', v_i.danger)) end,
                 -- LIVE-EVENTS (2027-03-22-live-events.sql): the member's own Level XP windows from the instance's clock to an hour past now
                 -- (hr_live_xp_windows: its switches, its ground, summed and capped); [] when none, so the engine sets no hook.
                 'live_xp', public.hr_live_xp_windows(h.user_id, v_i.hunt_id, v_i.settled_to, now() + interval '1 hour'),
                 -- BOSS-DAILY (2027-04-25-boss-daily.sql): in a keyed hall, whether this hero's daily prize is still to take today
                 -- (hr_boss_prize_left: no player_boss_loot_day row of today's); null on every other hunt. The engine rolls only on true.
                 'prize_left', public.hr_boss_prize_left(h.user_id, h.slot, v_i.hunt_id),
                 -- ...and whether that roll is this hero's FIRST on the boss, ever (hr_boss_prize_first): the engine makes it a sure one.
                 'prize_first', public.hr_boss_prize_first(h.user_id, h.slot, v_i.hunt_id),
                 -- TRAIT-PIECES (1071-trait-pieces.sql): the Traits of the pieces this hero wears ([{ id, rank }]) and the Signature of the first
                 -- one it put on, the server's own rows only; and what its Trait roll reads at this window's start (pity, luck). Null while dark.
                 'worn_traits', public.hr_worn_traits_of(h.user_id, h.slot),
                 'worn_signature', public.hr_worn_signature_of(h.user_id, h.slot),
                 'drops', public.hr_trait_drops_of(h.user_id, h.slot),
                 'state', public.hr_hunt_member_state(h.user_id, h.slot))
                 order by h.user_id, h.slot)
               from public.hunt_sessions h cross join lateral (select public.hr_hunt_member_read(h) as r0 offset 0) m0
               -- TARGET-KIND: the member's OWN First target on this ground (LEVER-HORIZON: the window's, from the member read), only a kind
               -- the catalogue holds there; none, no key. Any options.target_kind is dropped first (hr_action_set_options refuses the key;
               -- this read does not lean on that alone), and so is the member read's own target_kind key.
               cross join lateral (select jsonb_set(m0.r0 - 'target_kind', '{options}', (coalesce(m0.r0->'options', '{}'::jsonb) - 'target_kind') || coalesce(
                   (select jsonb_build_object('target_kind', g.monster_id) from public.hr_hunt_ground_spawns g
                     where g.hunt_id = v_i.hunt_id and g.monster_id = m0.r0->>'target_kind'), '{}'::jsonb)) as r offset 0) mr
              where h.instance_id = v_i.id and h.ended_at is null), '[]'::jsonb),
    'now_ms', floor(extract(epoch from now()) * 1000)::bigint);
end $function$;
revoke all on function public.hr_hunt_instance_read(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_hunt_instance_read(uuid, integer) to hr_engine;

-- ── §5 THE LAND: one member's found pieces and pity, re-proved and written (owner-only; hr_hunt_apply_instance's member loop) ──
create or replace function public.hr_trait_pieces_land(p_hunt text, p_user uuid, p_slot int, p_session uuid, p_instance uuid,
                                                       p_traits jsonb, p_meta jsonb, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  r       public.hr_piece_rules%rowtype;
  g       public.hr_piece_grounds%rowtype;
  v_gid   text;
  v_win   jsonb;
  v_hi    bigint;
  v_kills bigint;
  v_n     int;
  v_from  bigint; v_to bigint;
  v_pc    jsonb; v_tr jsonb;
  v_step  int; v_depth int; v_top int; v_rank int; v_at bigint; v_kill int;
  v_t     public.hr_piece_traits%rowtype; v_t1 public.hr_piece_traits%rowtype;
  v_ids   text[];
  v_id    uuid;
  v_out   jsonb := '[]'::jsonb;
  v_found text[] := '{}';
  v_rar   text; v_before bigint; v_after bigint;
  c_piece_keys constant text[] := array['rarity', 'slot', 'base', 'traits', 'ground', 'step', 'depth', 'il', 'at_ms', 'kill'];
  c_num constant text := '^[0-9]{1,15}$';
begin
  -- TRAIT-PIECES (1071-trait-pieces.sql): what this member's kills made this window, re-proved against the server's catalogue, clocks and
  -- the kill bound hr_hunt_apply_member already held its journal to, then written once. Any breach refuses the whole settle (hr_reject).
  if not public.hr_flag_on('trait_drops') then perform public.hr_reject('traits_dark'); end if;
  if jsonb_typeof(p_traits) is distinct from 'object' or exists (select 1 from jsonb_object_keys(p_traits) k where k not in ('found', 'pity'))
     or jsonb_typeof(p_traits->'found') is distinct from 'array' or jsonb_typeof(p_traits->'pity') is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_traits->'pity') k where k not in ('rare', 'very_rare')) then
    perform public.hr_reject('bad_traits', jsonb_build_object('why', 'shape')); end if;
  select * into r from public.hr_piece_rules where id;
  if r.id is null then perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'hr_piece_rules')); end if;
  -- THE COUNT: one piece a kill at most (trait-roll.js rollKillFor ends a kill's roll on a hit), and the fuse
  v_kills := case when jsonb_typeof(p_meta->'kills') = 'number' and (p_meta->>'kills') ~ '^[0-9]{1,9}$' then (p_meta->>'kills')::bigint else 0 end;
  v_n := jsonb_array_length(p_traits->'found');
  if v_n > v_kills or v_n > r.found_max then
    perform public.hr_reject('traits_over', jsonb_build_object('found', v_n, 'kills', v_kills, 'max', r.found_max)); end if;
  -- THE GROUND: the instance's own, one the catalogue rolls a rank on, and this window on the scale (hr_danger_prove's proof of it)
  select hg.ground_id into v_gid from public.hr_hunt_grounds hg where hg.hunt_id = p_hunt;
  select * into g from public.hr_piece_grounds tg where tg.hunt_id = v_gid;
  v_win := nullif(current_setting('hr.danger_window', true), '')::jsonb;
  if v_n > 0 and (g.hunt_id is null or g.max_rank < 1 or v_win is null or v_win ? 'tier' or jsonb_typeof(v_win->'hi') <> 'number') then
    perform public.hr_reject('traits_ground', jsonb_build_object('hunt', p_hunt, 'ground', v_gid, 'max_rank', g.max_rank, 'window', v_win)); end if;
  v_hi := (v_win->>'hi')::bigint;
  v_from := floor(extract(epoch from p_from) * 1000)::bigint;
  v_to := ceil(extract(epoch from p_to) * 1000)::bigint;
  for v_pc in select e.value from jsonb_array_elements(p_traits->'found') e loop
    -- THE SHAPE: exactly the keys the edge sends (hunt-settle.js traitsFor), each of its type
    if jsonb_typeof(v_pc) <> 'object' or exists (select 1 from jsonb_object_keys(v_pc) k where k <> all (c_piece_keys))
       or (select count(*) from jsonb_object_keys(v_pc)) <> array_length(c_piece_keys, 1)
       or jsonb_typeof(v_pc->'rarity') <> 'string' or jsonb_typeof(v_pc->'slot') <> 'string' or jsonb_typeof(v_pc->'base') <> 'string'
       or jsonb_typeof(v_pc->'ground') <> 'string' or jsonb_typeof(v_pc->'traits') <> 'array'
       or jsonb_typeof(v_pc->'step') <> 'number' or (v_pc->>'step') !~ '^[0-9]{1,6}$'
       or jsonb_typeof(v_pc->'depth') <> 'number' or (v_pc->>'depth') !~ '^[0-9]{1,3}$'
       or jsonb_typeof(v_pc->'il') <> 'number' or (v_pc->>'il') !~ '^[0-9]{1,6}$'
       or jsonb_typeof(v_pc->'at_ms') <> 'number' or (v_pc->>'at_ms') !~ c_num
       or jsonb_typeof(v_pc->'kill') <> 'number' or (v_pc->>'kill') !~ '^[0-9]{1,9}$' then
      perform public.hr_reject('bad_traits', jsonb_build_object('why', 'piece', 'piece', v_pc)); end if;
    v_step := (v_pc->>'step')::int; v_at := (v_pc->>'at_ms')::bigint; v_kill := (v_pc->>'kill')::int;
    -- WHERE AND WHEN: this ground, inside this window, at a step this window could stand at
    if v_pc->>'ground' is distinct from v_gid then perform public.hr_reject('piece_who', jsonb_build_object('ground', v_pc->'ground', 'is', v_gid)); end if;
    if v_at < v_from or v_at > v_to then perform public.hr_reject('piece_when', jsonb_build_object('at_ms', v_at, 'from', v_from, 'to', v_to)); end if;
    if v_step > v_hi then perform public.hr_reject('piece_where', jsonb_build_object('step', v_step, 'hi', v_hi)); end if;
    -- THE DEPTH is the server's own reading of the step; the edge's must agree
    v_depth := public.hr_piece_depth_of(v_gid, v_step);
    if v_depth is null or (v_pc->>'depth')::int <> v_depth then
      perform public.hr_reject('piece_depth', jsonb_build_object('step', v_step, 'depth', v_pc->'depth', 'is', v_depth)); end if;
    -- THE BASE: a piece this ground drops in that slot at its base item Level (12-targets 3.3: the ground fixes the base)
    if (v_pc->>'il')::int <> g.gear_level
       or not exists (select 1 from public.hr_piece_bases b where b.hunt_id = v_gid and b.slot = v_pc->>'slot' and b.item_id = v_pc->>'base') then
      perform public.hr_reject('piece_base', jsonb_build_object('slot', v_pc->'slot', 'base', v_pc->'base', 'il', v_pc->'il')); end if;
    -- THE RARITY and its Traits: one on a Rare, two on a Very Rare, each a Trait of the slot at a whole rank
    if v_pc->>'rarity' not in ('rare', 'very_rare') then perform public.hr_reject('piece_rarity', jsonb_build_object('rarity', v_pc->'rarity')); end if;
    if jsonb_array_length(v_pc->'traits') <> (case v_pc->>'rarity' when 'rare' then r.rare_traits else r.very_rare_traits end) then
      perform public.hr_reject('piece_traits', jsonb_build_object('why', 'count', 'traits', v_pc->'traits')); end if;
    v_top := public.hr_piece_top_rank(v_gid, v_depth);
    v_ids := '{}';
    for v_tr in select e.value from jsonb_array_elements(v_pc->'traits') e loop
      if jsonb_typeof(v_tr) <> 'object' or exists (select 1 from jsonb_object_keys(v_tr) k where k not in ('id', 'rank'))
         or jsonb_typeof(v_tr->'id') <> 'string' or jsonb_typeof(v_tr->'rank') <> 'number' or (v_tr->>'rank') !~ '^[0-9]{1,2}$' then
        perform public.hr_reject('piece_traits', jsonb_build_object('why', 'shape', 'trait', v_tr)); end if;
      select * into v_t from public.hr_piece_traits t where t.trait_id = v_tr->>'id';
      if v_t.trait_id is null or v_t.slot is distinct from v_pc->>'slot' then
        perform public.hr_reject('piece_traits', jsonb_build_object('why', 'slot', 'trait', v_tr->'id', 'slot', v_pc->'slot')); end if;
      if cardinality(v_ids) = 0 then
        -- the FIRST Trait is of this ground's pool (the (ground, slot) cell): chasing a Trait means choosing its ground
        if v_t.source is distinct from v_gid then
          perform public.hr_reject('piece_traits', jsonb_build_object('why', 'pool', 'trait', v_t.trait_id, 'source', v_t.source)); end if;
        v_t1 := v_t;
      elsif v_t.key = v_t1.key or v_t.trait_id = v_t1.trait_id
            or least(v_t.trait_id, v_t1.trait_id) || '+' || greatest(v_t.trait_id, v_t1.trait_id) = any (r.very_rare_banned) then
        perform public.hr_reject('piece_traits', jsonb_build_object('why', 'pair', 'traits', v_pc->'traits'));
      end if;
      -- THE RANK: the top open at the server's depth, held to the ground's ceiling, or one under it (trait-roll.js rankRoll)
      v_rank := (v_tr->>'rank')::int;
      if v_top < 1 or v_rank > v_top or v_rank < greatest(1, v_top - 1) then
        perform public.hr_reject('piece_rank', jsonb_build_object('rank', v_rank, 'top', v_top, 'depth', v_depth)); end if;
      v_ids := v_ids || v_t.trait_id;
    end loop;
    -- WRITE IT, ONCE A KILL (the unique key is the kill that made it)
    begin
      insert into public.trait_pieces (user_id, found_slot, base, slot, item_level, rarity, traits, hunt_id, step, depth, instance_id, session_id, kill_unit, at_ms)
        values (p_user, p_slot, v_pc->>'base', v_pc->>'slot', g.gear_level, v_pc->>'rarity',
                (select jsonb_agg(jsonb_build_object('id', e.value->>'id', 'rank', (e.value->>'rank')::int) order by e.n)
                   from jsonb_array_elements(v_pc->'traits') with ordinality e(value, n)),
                v_gid, v_step, v_depth, p_instance, p_session, v_kill, v_at)
        returning id into v_id;
    exception when unique_violation then
      perform public.hr_reject('piece_twice', jsonb_build_object('at_ms', v_at, 'kill', v_kill));
    end;
    -- THE JOURNAL: one row a piece (a value object, never a tick): no gold, no stack quantity
    insert into public.player_ledger (user_id, slot, kind, intent, item_id, meta, session_id)
      values (p_user, p_slot, 'trait', 'trait_piece', v_pc->>'base',
              jsonb_build_object('reason', 'trait_piece', 'piece', v_id, 'rarity', v_pc->>'rarity', 'traits', v_pc->'traits', 'ground', v_gid,
                                 'step', v_step, 'depth', v_depth, 'kill', v_kill, 'at_ms', v_at, 'instance', p_instance), p_session);
    v_found := v_found || (v_pc->>'rarity');
    v_out := v_out || jsonb_build_array(jsonb_build_object('id', v_id, 'rarity', v_pc->>'rarity', 'slot', v_pc->>'slot', 'base', v_pc->>'base',
               'traits', v_pc->'traits', 'depth', v_depth, 'at_ms', v_at));
  end loop;
  -- THE PITY the roller carries: a count of missed rolls, so it grows by at most one a kill and a find this window resets it under the kills
  foreach v_rar in array array['rare', 'very_rare'] loop
    continue when not (p_traits->'pity' ? v_rar);
    if jsonb_typeof(p_traits->'pity'->v_rar) <> 'number' or (p_traits->'pity'->>v_rar) !~ '^[0-9]{1,12}$' then
      perform public.hr_reject('bad_traits', jsonb_build_object('why', 'pity', 'pity', p_traits->'pity')); end if;
    v_after := (p_traits->'pity'->>v_rar)::bigint;
    v_before := coalesce((select hp.misses from public.hero_pity hp where hp.user_id = p_user and hp.slot = p_slot and hp.rarity = v_rar), 0);
    if v_after > v_before + v_kills or (v_rar = any (v_found) and v_after > v_kills) then
      perform public.hr_reject('pity_over', jsonb_build_object('rarity', v_rar, 'before', v_before, 'after', v_after, 'kills', v_kills)); end if;
    insert into public.hero_pity as hp (user_id, slot, rarity, misses) values (p_user, p_slot, v_rar, v_after)
      on conflict (user_id, slot, rarity) do update set misses = excluded.misses, updated_at = now() where hp.misses is distinct from excluded.misses;
  end loop;
  return v_out;
end $fn$;
revoke all on function public.hr_trait_pieces_land(text, uuid, int, uuid, uuid, jsonb, jsonb, timestamptz, timestamptz) from public, anon, authenticated, service_role;
do $mig$
declare v_role text;
begin
  foreach v_role in array array['hr_engine', 'hr_tick'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('revoke all on function public.hr_trait_pieces_land(text, uuid, int, uuid, uuid, jsonb, jsonb, timestamptz, timestamptz) from %I', v_role); end if;
  end loop;
end $mig$;

-- ── §6 hr_hunt_apply_instance, RESTATED WHOLE (its chain was 4 patches deep since 2027-03-21-scaled-hunts.sql; this file's lines: TRAIT-PIECES) ──
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_instance(p_instance uuid, p_world_from bigint, p_settle jsonb, p_members jsonb, p_project_user uuid DEFAULT NULL::uuid, p_project_slot integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_skew constant interval := interval '60 seconds';
  -- A fuse on the deploy gap, not a balance figure: the catalogue and the edge land seconds to minutes apart.
  c_shape_grace constant interval := interval '30 minutes';
  v_role  text;
  v_i     public.hunt_instances%rowtype;
  v_to    timestamptz;
  v_win   bigint; v_tick bigint;
  v_wsw   bigint;
  v_world text; v_wj jsonb;
  v_shape public.hr_hunt_world_shape%rowtype;
  v_move  public.hunt_world_shape_move%rowtype;
  v_ground text;
  v_m     jsonb;
  v_out   jsonb := '[]'::jsonb;
  v_h     jsonb;
  v_n     int;
  v_code  text; v_detail text;
  v_first jsonb;
  v_pend  jsonb := '[]'::jsonb;   -- ACCOUNT GOLD: every member's store bill, paid after every member
  v_p     jsonb; v_u uuid; v_f bigint; v_g bigint;
  v_proj  jsonb;   -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): the caller's projection, for its frame and its answer
  v_cur   jsonb;   -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): the member whose own half is being proved
  v_scale int;            -- SCALED-HUNTS: the Level this window played (null: the ground's own), proved before any member lands
  v_sc    jsonb;          -- SCALED-HUNTS: the server's own scale of the instance (hr_scaled_hunt_of)
  v_sms   bigint := 0;    -- SCALED-HUNTS: the hours this window spends, in ms: its world swings x the swing
  v_tp    jsonb;          -- TRAIT-PIECES (1071-trait-pieces.sql): the pieces a member's kills made, as landed (its answer's `found`)
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): a refusal after the lock is counted; the sixth in a row forfeits.
  -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): a world of the shape the catalogue just replaced is held, not counted.
  -- TALLY (2026-12-23-tally-tasks.sql): step (4c) counts every member's kills onto its held kill tasks and pays a member
  -- whose hunt this settle ended (back in town).
  -- TRAIT-PIECES (1071-trait-pieces.sql): RESTATED WHOLE (2027-03-31-watched-settle-cost.sql's body and 1056-danger-scale.sql's two
  -- splices folded in). A member may carry `traits` { found, pity }: what its kills made, landed by hr_trait_pieces_land after its own
  -- half (so its kills are the kill bound's), under every lock below; a refusal there is the seat's like any other.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_apply_instance: not callable by %', v_role using errcode = '42501';
  end if;
  if p_instance is null or p_world_from is null or p_settle is null or jsonb_typeof(p_settle) <> 'object'
     or p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0
     or jsonb_array_length(p_members) > coalesce(public.hr_hunt_limit('party_max'), 1) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  -- SCALED-HUNTS (2027-03-21-scaled-hunts.sql): `scale` { level } is the Level the edge says the window played, a CLAIM (4) re-proves.
  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world', 'scale'))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where jsonb_typeof(e.value) <> 'object'
                    or exists (select 1 from jsonb_object_keys(e.value) k
                                where k not in ('user', 'slot', 'session', 'version', 'intent', 'delta', 'hunt', 'analyzer', 'traits'))) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments', 'why', 'keys');
  end if;
  v_first := p_members->0;

  -- (1) THE INSTANCE LOCK and its world CAS.
  select * into v_i from public.hunt_instances where id = p_instance for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'no_instance'); end if;
  if v_i.world_swing <> p_world_from then
    -- A settle that already landed under these keys is a replay; anything else lost the race (not counted).
    if not exists (select 1 from jsonb_array_elements(p_members) e
                    where not exists (select 1 from public.player_intents i
                                       where i.user_id = (e.value->>'user')::uuid and i.intent_id = (e.value->>'intent')::uuid)) then
      return jsonb_build_object('ok', true, 'stage', 'replayed', 'replayed', true,
        'state', case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end);
    end if;
    return jsonb_build_object('ok', false, 'error', 'session_moved', 'world_swing', v_i.world_swing);
  end if;

  -- (2) THE WINDOW and THE WORLD.
  begin v_to := date_trunc('milliseconds', (p_settle->>'to')::timestamptz);
  exception when others then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_window')); end;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  v_win := floor(extract(epoch from (v_to - v_i.settled_to)) * 1000)::bigint;
  if v_to is null or v_i.settled_to is null or v_win <= 0 or v_win % v_tick <> 0 then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_window', 'settled_to', v_i.settled_to, 'window_ms', v_win)); end if;
  if v_to > now() + c_skew then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'window_in_future')); end if;
  if jsonb_typeof(p_settle->'world_swing') is distinct from 'number' or (p_settle->>'world_swing') !~ '^[0-9]{1,15}$' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world_swing')); end if;
  v_wsw := (p_settle->>'world_swing')::bigint;
  if v_wsw < v_i.world_swing or v_wsw > v_i.world_swing + v_win / v_tick then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', 'bad_world_swing', 'from', v_i.world_swing, 'to', v_wsw)); end if;
  if jsonb_typeof(p_settle->'world') = 'string' then
    v_world := p_settle->>'world';
    if octet_length(v_world) > public.hr_hunt_limit('world_max_bytes') then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
        jsonb_build_object('ok', false, 'error', 'world_too_big', 'bytes', octet_length(v_world))); end if;
    begin v_wj := v_world::jsonb;
    exception when others then
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'json')); end;
    select * into v_shape from public.hr_hunt_world_shape where id;
    select g.ground_id into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_i.hunt_id;
    -- The encoded world (world-state.js): { v, s, w: [ground, swing, …], u: [...], p: [...] }.
    if jsonb_typeof(v_wj) <> 'object' or (v_wj->>'v')::int is distinct from v_shape.version
       or (v_wj->>'s')::bigint is distinct from v_shape.shape
       or jsonb_typeof(v_wj->'w') <> 'array' or jsonb_typeof(v_wj->'u') <> 'array' or jsonb_typeof(v_wj->'p') <> 'array'
       or v_wj->'w'->>0 is distinct from v_ground or (v_wj->'w'->>1)::bigint is distinct from v_wsw then
      -- THE SERVER'S OWN DEPLOY GAP: a well-formed world of THIS instance written under exactly the field list the
      -- catalogue replaced less than c_shape_grace ago (hunt_world_shape_move, written only by the catalogue's own
      -- trigger) is held: nothing moves, nothing is counted. Every other shape still counts toward the forfeit.
      select * into v_move from public.hunt_world_shape_move where id;
      if v_move.prev_shape is not null and v_move.moved_at > now() - c_shape_grace
         and v_move.version = v_shape.version and v_move.shape = v_shape.shape
         and jsonb_typeof(v_wj) = 'object'
         and v_wj->'v' = to_jsonb(v_move.prev_version) and v_wj->'s' = to_jsonb(v_move.prev_shape)
         and jsonb_typeof(v_wj->'w') = 'array' and jsonb_typeof(v_wj->'u') = 'array' and jsonb_typeof(v_wj->'p') = 'array'
         and v_wj->'w'->>0 is not distinct from v_ground and v_wj->'w'->1 = to_jsonb(v_wsw) then
        return public.hr_hunt_settle_held(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'world_shape_moved',
          'detail', jsonb_build_object('from', jsonb_build_object('v', v_move.prev_version, 's', v_move.prev_shape),
                                       'to', jsonb_build_object('v', v_shape.version, 's', v_shape.shape), 'moved_at', v_move.moved_at)));
      end if;
      return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'shape')); end if;
  elsif jsonb_typeof(p_settle->'world') is distinct from 'null' and p_settle ? 'world' then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'bad_world', 'why', 'type'));
  end if;

  -- (3) THE MEMBER SET: exactly the instance's open sessions that arrived before `to`.
  if (select count(*) from jsonb_array_elements(p_members)) <> (select count(distinct (e.value->>'session')) from jsonb_array_elements(p_members) e)
     or exists (select 1 from public.hunt_sessions h
                 where h.instance_id = p_instance and h.ended_at is null and h.hunt_from < v_to
                   and not exists (select 1 from jsonb_array_elements(p_members) e
                                    where (e.value->>'session')::uuid = h.id and (e.value->>'user')::uuid = h.user_id
                                      and (e.value->>'slot')::int = h.slot))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where not exists (select 1 from public.hunt_sessions h
                                    where h.id = (e.value->>'session')::uuid and h.instance_id = p_instance
                                      and h.user_id = (e.value->>'user')::uuid and h.slot = (e.value->>'slot')::int
                                      and h.ended_at is null and h.hunt_from < v_to)) then
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'member_set'));
  end if;

  -- (4) EVERY MEMBER, IN (user_id, slot) ORDER, IN ONE SUBTRANSACTION.
  for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
    perform public.hr_hunt_lock((v_m->>'user')::uuid, (v_m->>'slot')::int);
  end loop;
  -- ACCOUNT GOLD (2026-12-15-account-gold.sql): every member's ACCOUNT PURSE, locked in user order right
  -- after the character locks and before any other shared row (a hearthfind ordinal, a tally), so two
  -- settles that share an account queue on its purse and can never hold each other's next lock.
  for v_u in select distinct (e.value->>'user')::uuid from jsonb_array_elements(p_members) e order by 1 loop
    perform public.hr_purse_lock(v_u);
  end loop;
  -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): hr_apply's own frame call is DEFERRED while the members land
  -- (hr_frame_send reads hr.frame_defer); the frames go out below, once, from the committed state.
  perform set_config('hr.frame_defer', 'instance', true);
  begin
    -- CALL-SERIES (2027-04-24-boss-call-series.sql): THE ROOM'S NEXT STEP, decided once for the whole room before any member lands
    --   (hr_boss_call_plan, under the locks above): every hero is charged the next fight, or the series ends for everyone on this win. The
    --   plan lives for this settle only (hr.boss_plan): hr_hunt_settle_session holds a won fight's end for it and hr_boss_call_step follows it.
    perform set_config('hr.boss_plan', coalesce(public.hr_boss_call_plan(p_instance, p_members, v_to)::text, ''), true);
    -- SCALED-HUNTS: THE SCALE THIS WINDOW PLAYED, re-proved against the server's own rule before any member lands (each member's kill
    --   bound reads it): a claim stands only if the instance's leader has the switch on, hours banked and a Level that scales the ground
    --   to exactly that Level (hr_scaled_hunt_of), and the window's world swings fit in those hours. No claim is the ground's own rows,
    --   which spend nothing. The Level the stored world is built on is written here.
    v_scale := null;
    if p_settle ? 'scale' and jsonb_typeof(p_settle->'scale') <> 'null' then
      if jsonb_typeof(p_settle->'scale') <> 'object' or exists (select 1 from jsonb_object_keys(p_settle->'scale') k where k <> 'level')
         or jsonb_typeof(p_settle->'scale'->'level') is distinct from 'number' or (p_settle->'scale'->>'level') !~ '^[0-9]{1,4}$' then
        perform public.hr_reject('bad_scale'); end if;
      v_sc := public.hr_scaled_hunt_of(p_instance);
      if v_sc is null or (v_sc->>'level')::int <> (p_settle->'scale'->>'level')::int then
        perform public.hr_reject('scale_moved', jsonb_build_object('claim', p_settle->'scale', 'level', v_sc->'level')); end if;
      v_scale := (v_sc->>'level')::int;
      v_sms := (v_wsw - v_i.world_swing) * v_tick;
      if v_sms > (v_sc->>'banked_ms')::bigint then
        perform public.hr_reject('scale_over', jsonb_build_object('ms', v_sms, 'banked_ms', (v_sc->>'banked_ms')::bigint)); end if;
    end if;
    update public.hunt_instances set scale_level = v_scale where id = p_instance and scale_level is distinct from v_scale;
    -- DANGER-SCALE (1056-danger-scale.sql): THE WINDOW'S WORLD ON THE SCALE, proved once before any member lands, against THIS window's
    --   climb (hr_danger_prove: the world this settle carries and stores, never the one stored before it; a refusal is the instance's);
    --   each member's value bound reads what it proved (hr_danger_bound). Null off the scale. This settle's only: cleared below, and a
    --   refusal's rollback restores what stood before.
    perform set_config('hr.danger_window', coalesce(public.hr_danger_prove(p_instance, v_world, v_win)::text, ''), true);
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_cur := jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session');
      v_h := public.hr_hunt_apply_member(p_instance, (v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid,
        (v_m->>'intent')::uuid, v_m->'delta', v_m->'hunt', v_m->'analyzer');
      if v_h ? '_purse' then
        v_pend := v_pend || jsonb_build_array((v_h->'_purse')
                  || jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session'));
        v_h := v_h - '_purse';
      end if;
      -- TRAIT-PIECES (1071-trait-pieces.sql): THE PIECES THIS MEMBER'S KILLS MADE, re-proved and written after its own half landed (its
      --   journal's kills are the kill bound's now), under every lock above; the answer names them (`found`, the drop moment). A member
      --   with no `traits` lands nothing, and a replayed member is the partial-replay refusal below.
      if v_m ? 'traits' and jsonb_typeof(v_m->'traits') <> 'null' and not coalesce((v_h->>'replayed')::boolean, false) then
        v_tp := public.hr_trait_pieces_land(v_i.hunt_id, (v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid, p_instance,
          v_m->'traits', v_m->'delta'->'journal'->'meta', v_i.settled_to, v_to);
        if jsonb_array_length(v_tp) > 0 then v_h := v_h || jsonb_build_object('found', v_tp); end if;
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot',
        'hunt_settle', v_h, 'session', public.hr_hunt_view((v_m->>'session')::uuid)));
    end loop;
    -- (4b) THE STORE BILLS, PAID FROM THE ACCOUNT PURSES (2026-12-15-account-gold.sql), after EVERY member's
    --      coins, cover and sales have landed: the engine spends one purse per account in time order, so
    --      with every credit in first no bill can take a purse below 0 (the window's whole bill is what
    --      that order kept payable). A bill the purse cannot pay means another hero of the account spent
    --      it since this window was read: gold_short, nothing lands, and the edge re-reads at once.
    for v_p in select e.value from jsonb_array_elements(v_pend) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_cur := jsonb_build_object('user', v_p->'user', 'slot', v_p->'slot', 'session', v_p->'session');
      v_g := public.hr_purse_move((v_p->>'user')::uuid, -(v_p->>'cost')::bigint, 0);
      if v_g is null then
        perform public.hr_reject('gold_short', jsonb_build_object('why', 'purse', 'gold', public.hr_purse_of((v_p->>'user')::uuid),
          'cost', (v_p->>'cost')::bigint, 'floor', (v_p->>'floor')::bigint));
      end if;
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values ((v_p->>'user')::uuid, (v_p->>'slot')::int, 'hunt', 'supply_buy', -(v_p->>'cost')::bigint, -(v_p->>'units')::bigint,
                jsonb_build_object('reason', 'supply_buy', 'source', 'store', 'items', v_p->'items', 'gold', (v_p->>'cost')::bigint),
                (v_p->>'session')::uuid, v_g);
    end loop;
    -- THE FLOOR, per account: after the window, the purse may not sit below the lowest "Keep at least" of
    -- its heroes that bought (one hero: its own floor, the pre-account-gold rule exactly).
    for v_u, v_f in select (e.value->>'user')::uuid, min((e.value->>'floor')::bigint)
                      from jsonb_array_elements(v_pend) e group by 1 order by 1 loop
      if public.hr_purse_of(v_u) < v_f then
        select jsonb_build_object('user', e.value->'user', 'slot', e.value->'slot', 'session', e.value->'session') into v_cur
          from jsonb_array_elements(v_pend) e where (e.value->>'user')::uuid = v_u
         order by (e.value->>'floor')::bigint, (e.value->>'slot')::int limit 1;
        perform public.hr_reject('gold_short', jsonb_build_object('why', 'floor', 'gold', public.hr_purse_of(v_u), 'floor', v_f));
      end if;
    end loop;
    v_cur := null;
    if exists (select 1 from jsonb_array_elements(v_out) o where coalesce((o.value->'hunt_settle'->>'replayed')::boolean, false)) then
      -- A member whose key already landed under a moved instance is a defect (the CAS above passed).
      perform public.hr_reject('session_moved', jsonb_build_object('why', 'partial_replay'));
    end if;
    -- (4c) TAMSIN'S TALLY (2026-12-23-tally-tasks.sql), EVERY member, in (user_id, slot) order, under the character
    --      locks and purses taken above: its own kills by monster (the combat journal hr_apply just wrote, held by the
    --      kill bound) onto its held tasks on this ground; then, for a member whose hunt this settle ended, the
    --      payment of what is done (hr_tally_claim: the per-day cap, the bag, the purse, one session-stamped row).
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_cur := jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session');
      perform public.hr_tally_count((v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid, v_m->'delta'->'journal'->'meta');
      if exists (select 1 from public.hunt_sessions h where h.id = (v_m->>'session')::uuid and h.ended_at is not null) then
        perform public.hr_tally_claim((v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid);
      end if;
    end loop;
    -- SCALED-HUNTS: THE HOURS SPENT, from the leader's bank, under every member's lock and purse taken above (a purchase takes its
    --   hero's lock, then the purse, then this row: the same order). They tick down only while the party is in the spawn: the window's
    --   world swings, never town or travel. Refused, never clamped, if the bank no longer holds them.
    if v_scale is not null and v_sms > 0 then
      update public.player_scaled_hours h
         set banked_ms = h.banked_ms - v_sms, spent_ms = h.spent_ms + v_sms, updated_at = now()
       where h.user_id = (v_sc->>'user')::uuid and h.slot = (v_sc->>'slot')::int and h.hunt_id = v_i.hunt_id and h.banked_ms >= v_sms;
      if not found then perform public.hr_reject('scale_over', jsonb_build_object('ms', v_sms)); end if;
    end if;
    -- PARTY-ISOLATION (2027-01-22-party-settle-isolation.sql): every member's half landed, so each committed seat's
    --      own count starts over too (the fuse counts consecutive refusals only).
    v_cur := null;
    update public.hunt_sessions set refusals = 0
     where id in (select (e.value->>'session')::uuid from jsonb_array_elements(p_members) e) and refusals > 0;
    -- THE INSTANCE: its world (none once no session of it is open), swing counter and clock; the count starts over.
    select count(*) into v_n from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null;
    -- CALL-SERIES: the next fight starts in a fresh room (no stored world) with no record of the last one (hunt_session_tally.fight is ONE
    -- fight's: the losing line reads it; each member's own tally write landed after its step, so it is cleared here), and the plan ends with this settle.
    if coalesce((nullif(current_setting('hr.boss_plan', true), '')::jsonb->>'next')::boolean, false) then
      v_world := null;
      update public.hunt_session_tally t set fight = null
        from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null and t.session_id = h.id and t.fight is not null;
    end if;
    perform set_config('hr.boss_plan', '', true);
    perform set_config('hr.danger_window', '', true);  -- DANGER-SCALE (1056-danger-scale.sql): the proof was this settle's members' only
    update public.hunt_instances
       set world = case when v_n > 0 then v_world end, world_swing = v_wsw,
           settled_to = v_to, next_swing_at = v_to, refusals = 0, version = version + 1
     where id = p_instance;
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
    perform set_config('hr.hunt_session', '', true);
    perform set_config('hr.frame_defer', '', true);   -- FRAME-PUSH: a refused settle sends nothing
    perform set_config('hr.boss_plan', '', true);     -- CALL-SERIES: a refused settle plans nothing
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', v_code, 'stage', 'instance',
        'detail', case when v_detail ~ '^\{.*\}$' then v_detail::jsonb end)
      -- PARTY-ISOLATION: the member whose own half raised it; hr_hunt_settle_refused counts it on that seat alone.
      || case when v_cur is not null then jsonb_build_object('member', v_cur) else '{}'::jsonb end);
  end;
  -- FRAME-PUSH (2026-12-25-frame-push-revive.sql): THE COMMIT POINT. Every member's rows, the purse bills and the
  -- instance row have landed: ONE frame per member, in lock order, of the state the database now holds (hr_frame_send:
  -- only to a character open in a client, never the requester's own echo, a fresh projection only for a watched one).
  -- A push failure never fails the settle: hr_frame_send swallows its own errors, and this handler stands behind it.
  perform set_config('hr.frame_defer', '', true);
  v_proj := case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end;
  begin
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      -- WATCHED-SETTLE-COST (2027-03-31-watched-settle-cost.sql): the frame to a hero of the asker's own account that is not
      -- on its screen waits for the next mark of hr_tick_config.frame_own_s (0 = never held); its news never waits.
      continue when public.hr_frame_own_held(v_m, p_project_user, p_project_slot, v_i.settled_to, v_to);
      perform public.hr_frame_send((v_m->>'user')::uuid, (v_m->>'slot')::int,
        case when (v_m->>'user')::uuid = p_project_user and (v_m->>'slot')::int = p_project_slot then v_proj end);
    end loop;
  exception when others then
    raise warning 'hr_hunt_apply_instance: frames for % not sent (%) — the settle is committed anyway', p_instance, sqlerrm;
  end;
  return jsonb_build_object('ok', true, 'members', v_out,
    'instance', jsonb_build_object('id', p_instance, 'world_swing', v_wsw, 'settled_to', v_to),
    'state', v_proj);
end $function$;
revoke all on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) to hr_engine;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
-- (a) DARK: with the switches off every reader answers null, and a roll is refused traits_dark.
-- (b) THE WORN PROJECTION, lit: a worn piece's Traits project; a base that left its slot, or a piece worn elsewhere, projects nothing; a
--     named piece's fixed Trait projects; a second piece on one equip slot is refused by the table; the FIRST Signature put on plays.
-- (c) THE LAND, lit: a Muster Rare at rank I lands one row and one journal row and is answered; the same kill again, too many pieces, a
--     forged rank, base, pool, step, instant, depth, ground or pity is refused and lands nothing; pity is written as the window left it.
-- (d) THE READ AND THE COMMIT carry the projection, the roll's inputs and the land (their bodies), and the grants: no client reaches a
--     helper or writes the table; the table reads only its owner's rows; grant hygiene is quiet; no probe row leaked; every switch off.
do $$
declare
  v_u   constant uuid := '000000c0-0000-4000-a000-0000071a1071';
  v_ins constant uuid := '000000c0-0000-4000-a000-0000071a1072';
  v jsonb; v_code text; v_wpn text; v_d int; v_step int; v_hunt text := 'muster_barrows'; v_t0 timestamptz := now() - interval '10 minutes';
  v_ok jsonb; v_belt text; v_neck text;   -- v_ok: one probe proposal, varied below (a Rare weapon of Muster's cell at the step v_step)
begin
  select min(b.item_id) into v_wpn from public.hr_piece_bases b where b.hunt_id = v_hunt and b.slot = 'weapon';
  select min(b.item_id) into v_belt from public.hr_piece_bases b where b.hunt_id = v_hunt and b.slot = 'belt';
  select min(i.item_id) into v_neck from public.hr_item_slots i where i.equip_slot = 'necklace';
  if v_wpn is null or v_belt is null or v_neck is null then raise exception 'VERIFY(c): Muster has no weapon or belt base, or no necklace exists'; end if;
  select min(d.step_from) into v_step from public.hr_piece_depths d where d.hunt_id = v_hunt and d.depth = 3;
  v_d := public.hr_piece_depth_of(v_hunt, v_step);
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'trait-pieces §7 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character refused: %', v; end if;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_u, 0, 'weapon', v_wpn)
      on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
    insert into public.trait_pieces (user_id, found_slot, base, slot, item_level, rarity, traits, hunt_id, step, depth, instance_id, kill_unit, at_ms,
                                     worn_slot, worn_equip_slot, worn_at)
      values (v_u, 0, v_wpn, 'weapon', 60, 'rare', '[{"id": "file_breaker", "rank": 1}]', v_hunt, v_step, v_d, v_ins, 1, 1, 0, 'weapon', now());
    -- (a) dark
    update public.hr_flags set enabled = false where key in ('trait_pieces', 'signatures', 'trait_drops');
    if public.hr_worn_traits_of(v_u, 0) is not null or public.hr_worn_signature_of(v_u, 0) is not null
       or public.hr_trait_drops_of(v_u, 0) is not null or public.hr_trait_pieces_view(v_u, 0) is not null then
      raise exception 'VERIFY(a): a dark reader answered something'; end if;
    v_code := null;
    begin
      perform public.hr_trait_pieces_land(v_hunt, v_u, 0, null, v_ins, '{"found": [], "pity": {}}', '{"kills": 1}', v_t0, now());
    exception when sqlstate 'HR000' then v_code := sqlerrm; end;
    if v_code is distinct from 'traits_dark' then raise exception 'VERIFY(a): a dark land answered %', coalesce(v_code, 'ok'); end if;

    -- (b) the worn projection, lit
    update public.hr_flags set enabled = true where key in ('trait_pieces', 'signatures', 'trait_drops');
    if public.hr_worn_traits_of(v_u, 0) is distinct from '[{"id": "file_breaker", "rank": 1}]'::jsonb then
      raise exception 'VERIFY(b): the worn piece projects %', public.hr_worn_traits_of(v_u, 0); end if;
    if jsonb_array_length(public.hr_trait_pieces_view(v_u, 0)->'pieces') <> 1 or public.hr_worn_traits_of(v_u, 1) is not null then
      raise exception 'VERIFY(b): the section or another hero reads % / %', public.hr_trait_pieces_view(v_u, 0), public.hr_worn_traits_of(v_u, 1); end if;
    update public.player_equipment set item_id = (select min(i.item_id) from public.hr_item_slots i where i.equip_slot = 'weapon' and i.item_id <> v_wpn)
     where user_id = v_u and slot = 0 and equip_slot = 'weapon';
    if public.hr_worn_traits_of(v_u, 0) is not null then raise exception 'VERIFY(b): a piece whose base left its slot still plays'; end if;
    update public.player_equipment set item_id = v_wpn where user_id = v_u and slot = 0 and equip_slot = 'weapon';
    begin
      insert into public.trait_pieces (user_id, found_slot, base, slot, item_level, rarity, traits, hunt_id, step, depth, instance_id, kill_unit, at_ms,
                                       worn_slot, worn_equip_slot, worn_at)
        values (v_u, 0, v_wpn, 'weapon', 60, 'rare', '[{"id": "snuffed", "rank": 1}]', v_hunt, v_step, v_d, v_ins, 2, 2, 0, 'weapon', now());
      raise exception 'VERIFY(b): a second piece on one equip slot was taken';
    exception when unique_violation then null; end;
    begin
      insert into public.trait_pieces (user_id, found_slot, base, slot, item_level, rarity, traits, hunt_id, step, depth, instance_id, kill_unit, at_ms)
        values (v_u, 0, v_wpn, 'weapon', 60, 'rare', '[]', v_hunt, v_step, v_d, v_ins, 3, 3);
      raise exception 'VERIFY(b): a Rare with no Trait was taken';
    exception when check_violation then null; end;
    if exists (select 1 from public.hr_piece_fixed f join public.hr_item_slots s on s.item_id = f.item_id) then
      insert into public.player_equipment (user_id, slot, equip_slot, item_id) select v_u, 0, s.equip_slot, f.item_id
        from public.hr_piece_fixed f join public.hr_item_slots s on s.item_id = f.item_id order by f.item_id limit 1
        on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
      if not exists (select 1 from jsonb_array_elements(public.hr_worn_traits_of(v_u, 0)) e join public.hr_piece_fixed f
                      on f.trait_id = e.value->>'id' and f.rank = (e.value->>'rank')::int) then
        raise exception 'VERIFY(b): a named piece''s fixed Trait does not play: %', public.hr_worn_traits_of(v_u, 0); end if;
    end if;
    insert into public.player_equipment (user_id, slot, equip_slot, item_id) values (v_u, 0, 'belt', v_belt), (v_u, 0, 'necklace', v_neck)
      on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id;
    insert into public.trait_pieces (user_id, found_slot, base, slot, item_level, rarity, signature, hunt_id, step, depth, instance_id, kill_unit, at_ms,
                                     worn_slot, worn_equip_slot, worn_at)
      values (v_u, 0, v_neck, 'necklace', 60, 'signature', 'lurchers_collar', v_hunt, v_step, v_d, v_ins, 4, 4, 0, 'necklace', now() - interval '1 hour'),
             (v_u, 0, v_belt, 'belt', 60, 'signature', 'cairn_belt', v_hunt, v_step, v_d, v_ins, 5, 5, 0, 'belt', now());
    if public.hr_worn_signature_of(v_u, 0) is distinct from 'lurchers_collar' then
      raise exception 'VERIFY(b): the first Signature put on is not the one that plays: %', public.hr_worn_signature_of(v_u, 0); end if;

    -- (c) the land, lit: a window on the scale whose ceiling is past the probe's step
    perform set_config('hr.danger_window', jsonb_build_object('instance', v_ins, 'step', v_step, 'top', v_step, 'hi', v_step + 5)::text, true);
    v_ok := jsonb_build_object('rarity', 'rare', 'slot', 'weapon', 'base', v_wpn, 'traits', '[{"id": "file_breaker", "rank": 1}]'::jsonb, 'ground', v_hunt,
                               'step', v_step, 'depth', v_d, 'il', 60, 'at_ms', floor(extract(epoch from now() - interval '1 minute') * 1000)::bigint, 'kill', 77);
    v := public.hr_trait_pieces_land(v_hunt, v_u, 0, null, v_ins, jsonb_build_object('found', jsonb_build_array(v_ok), 'pity', '{"rare": 0, "very_rare": 4}'::jsonb),
                                     '{"kills": 5}', v_t0, now());
    if jsonb_array_length(v) <> 1 or v->0->>'base' is distinct from v_wpn
       or (select count(*) from public.trait_pieces where user_id = v_u and kill_unit = 77) <> 1
       or (select count(*) from public.player_ledger where user_id = v_u and kind = 'trait' and intent = 'trait_piece') <> 1
       or (select misses from public.hero_pity where user_id = v_u and slot = 0 and rarity = 'very_rare') is distinct from 4 then
      raise exception 'VERIFY(c): a good Rare landed %', v; end if;
    declare
      c record;
    begin
      for c in select * from (values
        ('piece_twice', v_ok, '{"kills": 5}'::jsonb, '{}'::jsonb),
        ('traits_over', v_ok || '{"kill": 78}', '{"kills": 0}', '{}'),
        ('piece_rank', v_ok || jsonb_build_object('kill', 79, 'traits', '[{"id": "file_breaker", "rank": 2}]'::jsonb), '{"kills": 5}', '{}'),
        ('piece_traits', v_ok || jsonb_build_object('kill', 80, 'traits', '[{"id": "worrier", "rank": 1}]'::jsonb), '{"kills": 5}', '{}'),
        ('piece_traits', v_ok || jsonb_build_object('kill', 81, 'traits', '[{"id": "last_file", "rank": 1}]'::jsonb), '{"kills": 5}', '{}'),
        ('piece_base', v_ok || jsonb_build_object('kill', 82, 'base', v_belt), '{"kills": 5}', '{}'),
        ('piece_base', v_ok || '{"kill": 83, "il": 80}', '{"kills": 5}', '{}'),
        ('piece_where', v_ok || jsonb_build_object('kill', 84, 'step', v_step + 6), '{"kills": 5}', '{}'),
        ('piece_when', v_ok || '{"kill": 85, "at_ms": 1}', '{"kills": 5}', '{}'),
        ('piece_depth', v_ok || jsonb_build_object('kill', 86, 'depth', v_d + 1), '{"kills": 5}', '{}'),
        ('piece_who', v_ok || '{"kill": 87, "ground": "pyre_field"}', '{"kills": 5}', '{}'),
        ('piece_rarity', v_ok || '{"kill": 88, "rarity": "signature"}', '{"kills": 5}', '{}'),
        ('bad_traits', v_ok || '{"kill": 89, "extra": 1}', '{"kills": 5}', '{}'),
        ('pity_over', null, '{"kills": 5}', '{"rare": 99}')) t(want, piece, meta, pity) loop
        v_code := null;
        begin
          perform public.hr_trait_pieces_land(v_hunt, v_u, 0, null, v_ins,
            jsonb_build_object('found', case when c.piece is null then '[]'::jsonb else jsonb_build_array(c.piece) end, 'pity', c.pity), c.meta, v_t0, now());
        exception when sqlstate 'HR000' then v_code := sqlerrm; end;
        if v_code is distinct from c.want then raise exception 'VERIFY(c): % answered % (piece %, pity %)', c.want, coalesce(v_code, 'ok'), c.piece, c.pity; end if;
      end loop;
    end;
    if (select count(*) from public.trait_pieces where user_id = v_u and kill_unit between 78 and 89) <> 0
       or (select count(*) from public.player_ledger where user_id = v_u and kind = 'trait') <> 1 then
      raise exception 'VERIFY(c): a refused land wrote a row'; end if;
    -- off the scale (a tier or scaled window): nothing may land
    perform set_config('hr.danger_window', jsonb_build_object('instance', v_ins, 'tier', true)::text, true);
    v_code := null;
    begin
      perform public.hr_trait_pieces_land(v_hunt, v_u, 0, null, v_ins, jsonb_build_object('found', jsonb_build_array(v_ok || '{"kill": 90}'), 'pity', '{}'::jsonb), '{"kills": 5}', v_t0, now());
    exception when sqlstate 'HR000' then v_code := sqlerrm; end;
    if v_code is distinct from 'traits_ground' then raise exception 'VERIFY(c): a piece off the scale answered %', coalesce(v_code, 'ok'); end if;
    perform set_config('hr.danger_window', '', true);
    -- the roll's inputs: the pity it left and no luck while the flame is dark
    if public.hr_trait_drops_of(v_u, 0) is distinct from '{"pity": {"rare": 0, "very_rare": 4}, "luck_pm": 0}'::jsonb then
      raise exception 'VERIFY(c): the roll reads %', public.hr_trait_drops_of(v_u, 0); end if;
    raise exception using errcode = 'HRT71', message = 'trait-pieces §7 complete - rolling back';
  exception when sqlstate 'HRT71' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  -- (d) the bodies, the grants, nothing leaked, every switch off
  if position('hr_worn_traits_of' in (select prosrc from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure)) = 0
     or position('hr_worn_signature_of' in (select prosrc from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure)) = 0
     or position('hr_trait_drops_of' in (select prosrc from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure)) = 0
     or position('''trait_drops'', public.hr_flag_on(''trait_drops'')' in (select prosrc from pg_proc where oid = 'public.hr_hunt_instance_read(uuid,integer)'::regprocedure)) = 0 then
    raise exception 'VERIFY(d): hr_hunt_instance_read does not carry the worn pieces and the roll''s inputs'; end if;
  if position('hr_trait_pieces_land' in (select prosrc from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure)) = 0
     or position('''analyzer'', ''traits''' in (select prosrc from pg_proc where oid = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)'::regprocedure)) = 0 then
    raise exception 'VERIFY(d): hr_hunt_apply_instance does not land a member''s traits'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) g(r)
              where has_function_privilege(g.r, 'public.hr_trait_pieces_land(text,uuid,integer,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_worn_traits_of(uuid,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_worn_signature_of(uuid,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_trait_drops_of(uuid,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_trait_pieces_view(uuid,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_hunt_instance_read(uuid,integer)', 'execute')
                 or has_function_privilege(g.r, 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'execute')) then
    raise exception 'VERIFY(d): a client role reaches a trait-piece helper or the settle'; end if;
  if has_function_privilege('hr_engine', 'public.hr_trait_pieces_land(text,uuid,integer,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone)', 'execute') then
    raise exception 'VERIFY(d): the engine reaches the land past the settle'; end if;
  if exists (select 1 from unnest(array['anon', 'authenticated', 'service_role']) g(r)
              where has_table_privilege(g.r, 'public.trait_pieces', 'insert') or has_table_privilege(g.r, 'public.trait_pieces', 'update')
                 or has_table_privilege(g.r, 'public.trait_pieces', 'delete') or has_table_privilege(g.r, 'public.trait_pieces', 'truncate'))
     or has_table_privilege('anon', 'public.trait_pieces', 'select')
     or not (select relrowsecurity from pg_class where oid = 'public.trait_pieces'::regclass)
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'trait_pieces' and cmd <> 'SELECT')
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'trait_pieces') <> 1 then
    raise exception 'VERIFY(d): trait_pieces is writable or readable past its owner'; end if;
  perform public.hr_assert_grant_hygiene(true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.trait_pieces where user_id = v_u)
     or exists (select 1 from public.hero_pity where user_id = v_u) then
    raise exception 'VERIFY(d): §7 LEAKED a probe row'; end if;
  if exists (select 1 from public.hr_flags where key in ('trait_pieces', 'signatures', 'trait_drops') and enabled) then
    raise exception 'VERIFY(d): a switch is lit after the apply'; end if;
  raise notice 'trait-pieces: three switches dark; a worn piece plays only while its base is worn, the first Signature put on plays; a found piece lands once, inside every bound, journalled; all green';
end $$;
