-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-27-tower-chest.sql — THE HEARTH CHEST: A KEY FROM EVERY LANDING THE SERVER WROTE, AND AN OPEN THAT ROLLS ON THE SERVER'S OWN
--   DICE WITH THE HEARTH'S WARMTH AND THE STOKES (lane/c-tower-chest, backend-architect, 2026-11-15; Tyler 2026-11-14, the board's
--   "2026-11-14 The Burning Tower" §5 keys and the chest, §10 server surface; the coherence pass's C4). Phase 3 of the Tower: phase 1 was
--   2027-04-23-session-modes.sql, phase 2 2027-04-24-tower-climb.sql (whose tower_landings rows are what this file mints keys from).
--   STAGED: tools/apply-migration.mjs, one file, never inside begin/commit. Pre-EA (CLAUDE.md §2): applies on its passing §9.
--   ON THE EA SECURITY LIST: keys minted from a ranked climb, a server roll that pays items, a weapon that will trade.
--   HIDDEN: both verbs answer `feature_off` while the switch `burning_tower` (2027-04-24-tower-climb.sql, seeded OFF) is off for the account;
--   and no key opens until its seven tower weapons are built (`chest_not_ready`: src/data/chests.js chestShipBlockers, none built today).
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- A landing's key is the server's to give: the climb's settle writes one tower_landings row a hero, UTC week and landing (the weekly cap is
-- its primary key) only after re-proving every floor under it, so a key minted from that row's INSERT is minted exactly once per row,
-- whatever retries, whichever door settled (the world tick or the hunt viewed), and from nothing a client sends. The open is the money half:
-- the client names a key, a count and a stoke count; the server prices the stokes from its own catalogue, works the chance out from its own
-- warmth count, rolls it on a seeded stream nobody can read ahead (hr_seed: a 256-bit server secret), pays from its own catalogue, journals
-- every move and answers the result. No intent carries a chance, a warmth, a Cinder count, a weapon or a family.
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hr_tower_key_mint() TRIGGER AFTER INSERT ON tower_landings (owner-only). The key of the highest hr_chest_keys row at or under the landing
--   (the open table: the top row is open-ended), +1 into the hero's bag (past the bag's cap, as a hunt's loot lands: it is minted inside the
--   settle), one player_ledger row (kind hunt, intent tower_key, item_id, qty 1, qty_in 1, meta { reason, key, landing, week, session }).
-- hr_chest_open(p_slot int, p_chest text, p_key text, p_count int, p_stokes int, p_idem uuid) -> jsonb   CLIENT VERB (authenticated;
--   hr_client_rpc_baseline). Uses p_count keys of row p_key at chest p_chest, one after another. p_stokes: 0..3 stokes on each key, or null
--   for the hero's saved default for that key (0 when none). A key goes in with the most stokes the Cinders cover at its turn (the bag, then
--   Storage, then what the keys before it in the same press paid out), never more than asked: the design's "the key goes in with the most
--   stokes they do cover". Each key: its chance (hr_chest_chance_ppm: base x the hero's warmth x the stoke, at most a sure thing), its roll
--   (hr_chest_roll on hr_seed(hero, 'chest:<n>'), n the hero's lifetime key count), a weapon (the family the hero has equipped ownPm of the
--   time, else even over the key's other families; no family worn: even over all) and the key's always-inside haul. A weapon cools the Hearth
--   (dry = 0), a dry key warms it (dry + 1). One chest_opens row a key (append-only: the roll, the chance, the warmth, the stokes, the weapon).
--   The keys and any Cinders the stokes spend over what the press pays are taken from the bag first, then the account's Storage
--   (hr_materials_take), one ledger row an item taken; the haul lands by ONE hr_apply on the caller's key (kind hunt, intent
--   chest_open:<chest>:<key>:<count>:<stokes|d>, meta { reason, chest, key, opens[], took, cinders_spent }).
--   ok: { ok, version, chest, key, count, opens: [{ n, stokes, chance_ppm, weapon, family }], haul: { item: qty }, cinders_spent, dry, opens_total,
--   chest_section }. A replay answers this receipt once more and moves nothing.
--   REFUSALS, each moving nothing: not_signed_in, bad_slot, bad_idem, bad_chest (no hr_chests row), bad_key (no hr_chest_keys row),
--   bad_count (not 1..per_call), bad_stokes (not 0 or an hr_chest_stokes row), rate_limited, feature_off, no_character, in_hunt (the hero is
--   in a hunt session: the chest stands in town), settle_first / party_hunt_running (an unpaid window: hr_settle_first_of), chest_not_ready
--   { key } (the key's seven weapons are not all built), day_limit { today, max } (keys this hero used this UTC day, from chest_opens),
--   no_key { have, need } (bag + Storage), bag_full { stacks, cap, need } (the worst case of the press: every haul item not held, one weapon a
--   family it could roll, less the key's stack it empties: checked BEFORE any roll, so a refusal never says what a key would have found),
--   intent_mismatch, and hr_apply's own (which an honest press under these locks never meets; if one does, the whole press rolls back).
-- hr_chest_stoke_default(p_slot int, p_key text, p_stokes int, p_idem uuid) -> jsonb   CLIENT VERB. The hero's default stoke count for one
--   kind of key (the design's "Save as default"). Moves no value. ok: { ok, key, stokes, chest_section }. Refusals: the shape ones, bad_key,
--   bad_stokes, rate_limited, feature_off, no_character, intent_mismatch.
-- hr_chest_section(p_user uuid, p_slot int) -> jsonb (owner-only; both verbs answer it; the window lane projects it): { on, dry, opens,
--   today, max_day, per_call, own_family, cinders { bag, storage }, warmth_pm, keys: [{ key, item, name, from, held { bag, storage }, base_pm,
--   chance_ppm (now, with the default stokes), stokes_default, stokes: [{ n, pm, cost }], inside { item: qty }, ready, skill_plus }] }:
--   every number the menu shows, the server's own.
-- chest_luck (user_id, slot) NEW: dry (keys since the last weapon), opens (keys used, ever: the roll's index and the Turnkey title's count),
--   stokes (default stokes a key). chest_opens NEW, append-only: one row a key used. Both: RLS on, the owner reads its own rows, NO client
--   write (no policy, no grant but select).
-- Owner-only helpers: hr_chest_chance_ppm, hr_chest_roll, hr_chest_held, hr_chest_section, hr_tower_key_mint, hr_chest_opens_immutable (the
--   trigger that refuses any UPDATE or DELETE of a chest_opens row).
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- The mint runs inside the settle's transaction (hr_tower_write under the hero's lock and the run row's): the landing row's key makes a mint
--   once a row, and a replayed settle intent returns before any of it (hr_apply's replay).
-- The open: hr_intent_replay first; the gate; the hero's lock (hr_hunt_lock: its advisory key, its player_state row, its open session); the
--   key again under the lock (a second press on one key waited and answers the first's receipt); then the account's DEPOT key (Storage is
--   read and taken), then chest_luck's row for update. The order hero -> depot -> bag rows -> Storage rows -> (no purse) is
--   hr_materials_take's and every sink's. Every check reads under those locks; the takes, the rolls, the luck row, the chest_opens rows and
--   the haul are one transaction; a refused hr_apply rolls back all of it (HR001 inside the press's own block). Two heroes of one account
--   opening at once serialise on the depot key; one hero's two presses on its own lock.
-- THE DICE: a key's roll is hr_seed(hero, 'chest:<n>') where n is that hero's lifetime key count. A refused or rolled-back press uses no n,
--   so the same n rolls the same number on the next press: no outcome can be re-rolled by failing a press, and since every refusal comes
--   before the first roll, none of them reveals one.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- TWO new client verbs, behind a switch. p_chest and p_key are catalogue ids; p_count is clamped (per_call, per_day) and spends keys the
--   hero holds; p_stokes only picks a catalogue row, priced by the server, paid from the hero's own Cinders. Nothing a client sends is a
--   chance, a warmth, a price, a quantity paid out, a weapon or a family. Keys and Cinders are bound (hr_items.tradeable false, value 0):
--   the market's listable rule, the shop's bid and the dispatch all refuse them, so gold can't buy keys or odds (the board's Steam line).
--   The weekly cap is tower_landings' key; the mint can't be reached by a client (a trigger, owner-only, on a table no client writes).
-- Risks named for Security: (a) the roll's index is per hero, so the dice are deterministic for a hero by design (disputes are replayable
--   from chest_opens with the secret) and unpredictable without the secret; (b) the worst-case bag check refuses a press a lucky bag would
--   fit (by design: a refusal after a roll would leak it); (c) a tower weapon will trade once built: its market ceiling row ships with it.
--
-- ── COST (rows and bytes at 100x players) ──────────────────────────────────
-- Per landing: one bag upsert and one ledger row (at most six a hero a week, plus new records). Per press: one chest_luck update, one
-- chest_opens row a key (~140 bytes), one ledger row for the haul and one an item taken (two at most). At 100x (say 600 heroes using six
-- keys a week): 3,600 chest_opens rows and about 2,400 ledger rows a week, ~25 MB a year. Never a row per kill or floor (CLAUDE.md §1 law 6).
-- Per settle of a climb: one primary-key probe of hr_chest_keys per landing row inserted, nothing else.
--
-- EDGE: does not move (the mint is a database trigger; the chest is a town verb). The XP share that moved with this lane is
--   2027-04-27-tower-chest-session-modes-catalogue.generated.sql's (src/data/session-modes.js), whose engine deploy follows it.
-- CLIENT: none (the window lane wires both verbs and projects hr_chest_section; the words are src/data/text/tower.js and refusal-words.js).
-- ORDER: after 2027-04-24-tower-climb-hunts-catalogue.generated.sql: 2027-04-27-tower-chest-items-catalogue.generated.sql, then
--   2027-04-27-tower-chest-session-modes-catalogue.generated.sql, then 2027-04-27-tower-chest-catalogue.generated.sql, then THIS file.
-- REVERSIBLE: drop the mint trigger first (no key is minted after it), then the two verbs and their baseline rows, the six helpers, the two
--   tables. Keys and Cinders already in bags stay as items (bound, no value: they move nothing); the wipe empties them.
-- IDEMPOTENT: a second apply finds the tables, restates every body byte-identical, re-creates the trigger and the baseline rows, and §9
--   rolls back its probes.
-- WIPE: chest_luck and chest_opens join 2027-02-25-character-wipe.sql's c_wipe, the seven catalogues its c_no_player.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_chest_keys') is null or to_regclass('public.hr_chest_luck') is null or to_regclass('public.hr_chest_stokes') is null
     or to_regclass('public.hr_chest_weapons') is null or to_regclass('public.hr_chest_weapon_families') is null
     or to_regclass('public.hr_chest_families') is null or to_regclass('public.hr_chests') is null
     or (select count(*) from public.hr_chest_luck) <> 1 or not exists (select 1 from public.hr_chest_keys) then
    raise exception 'PRECONDITION: apply 2027-04-27-tower-chest-catalogue.generated.sql first (the chest''s catalogue)'; end if;
  if to_regclass('public.tower_landings') is null or to_regclass('public.hr_tower_rules') is null then
    raise exception 'PRECONDITION: apply 2027-04-24-tower-climb.sql first (tower_landings, the rows a key is minted from)'; end if;
  if not exists (select 1 from public.hr_feature_switches where switch_id = 'burning_tower') then
    raise exception 'PRECONDITION: no burning_tower switch (2027-04-24-tower-climb.sql seeds it)'; end if;
  if to_regprocedure('public.hr_seed(uuid,integer,text)') is null or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)') is null or to_regprocedure('public.hr_settle_first_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_feature_on(text,uuid)') is null or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null
     or to_regclass('public.hr_client_rpc_baseline') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
end $mig$;

-- ── §1 THE TABLES (no client write: no policy but the owner's read, no grant but select) ─────────
create table if not exists public.chest_luck (
  user_id    uuid        not null,
  slot       int         not null check (slot between 0 and 5),
  dry        int         not null default 0 check (dry >= 0),
  opens      bigint      not null default 0 check (opens >= 0),
  stokes     jsonb       not null default '{}'::jsonb check (jsonb_typeof(stokes) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);
create table if not exists public.chest_opens (
  id            bigint      generated always as identity primary key,
  user_id       uuid        not null,
  slot          int         not null check (slot between 0 and 5),
  n             bigint      not null check (n >= 1),
  chest_id      text        not null,
  key_id        text        not null,
  stokes        int         not null check (stokes >= 0),
  cinders_spent int         not null check (cinders_spent >= 0),
  dry           int         not null check (dry >= 0),
  chance_ppm    int         not null check (chance_ppm between 0 and 1000000),
  roll          int         not null check (roll between 0 and 999999),
  family        text,
  weapon        text,
  intent_id     uuid        not null,
  at            timestamptz not null default now(),
  constraint chest_opens_n unique (user_id, slot, n),
  constraint chest_opens_hit check ((weapon is null) = (family is null) and (weapon is null or roll < chance_ppm))
);
create index if not exists chest_opens_day on public.chest_opens (user_id, slot, at);
do $mig$
declare t text;
begin
  foreach t in array array['chest_luck', 'chest_opens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || ' own read', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || ' own read', t);
  end loop;
end $mig$;
-- APPEND-ONLY: a row of chest_opens is never changed or removed (the character wipe's TRUNCATE is a statement, not a row; no client holds it).
create or replace function public.hr_chest_opens_immutable()
returns trigger language plpgsql set search_path = public, pg_catalog as $fn$
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  raise exception 'chest_opens is append-only (attempted %)', tg_op using errcode = 'check_violation';
end $fn$;
drop trigger if exists hr_chest_opens_immutable on public.chest_opens;
create trigger hr_chest_opens_immutable before update or delete on public.chest_opens
  for each row execute function public.hr_chest_opens_immutable();
comment on table public.chest_luck is '2027-04-27-tower-chest.sql: each hero''s Hearth warmth (dry: keys since its last tower weapon), its lifetime key count (the roll''s index) and its default stokes a key. Written only by hr_chest_open and hr_chest_stoke_default. RLS: own rows readable, no client write.';
comment on table public.chest_opens is '2027-04-27-tower-chest.sql: append-only, one row a key used at the Hearth Chest: its index, chance, roll, warmth, stokes and weapon. The audit a dispute is replayed from, and the Turnkey title''s count. Written only by hr_chest_open. RLS: own rows readable, no client write.';

-- ── §2 THE HELPERS (owner-only) ──────────────────────────────────────────────
-- A key's chance in parts per million: base (permille) x the warmth after p_dry dry keys x the stoke (permille), at most 1,000,000. Null for
-- a stoke count no row has. The same integer sum as src/data/chests.js chestChancePpm (tests/tower-chest.mjs TCH-DATA checks the two agree).
create or replace function public.hr_chest_chance_ppm(p_base_pm int, p_dry int, p_stokes int)
returns int language sql stable set search_path = public, pg_catalog as $$
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  select case when p_stokes is null or p_base_pm is null then null
              when p_stokes <> 0 and s.pm is null then null
              else least(1000000, (p_base_pm::bigint * (1000 + least(greatest(coalesce(p_dry, 0), 0)::bigint * l.warmth_step_pm, l.warmth_cap_pm - 1000))
                                   * (case when p_stokes = 0 then 1000 else s.pm end) / 1000))::int end
    from public.hr_chest_luck l left join public.hr_chest_stokes s on s.stokes = p_stokes
   where l.id
$$;

-- ONE KEY'S ROLL: the hero's n-th key, rolled on the server's seeded stream. { roll (0..999999), weapon (roll < chance), family }: the family
-- the hero wears ownPm of the time when the key has it, else even over the key's other families; no family worn (or one the key lacks): even
-- over all the key's families, in hr_chest_families order. Pure in its inputs and the secret: the same hero, n and chance roll the same.
create or replace function public.hr_chest_roll(p_user uuid, p_slot int, p_n bigint, p_chance int, p_own text, p_families text[])
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  v_r bigint; v_t bigint; v_own int; v_others text[]; v_fam text; v_cut bigint;
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  v_r := ((public.hr_seed(p_user, p_slot, 'chest:' || p_n) % 1000000) + 1000000) % 1000000;
  if v_r >= coalesce(p_chance, 0) or coalesce(cardinality(p_families), 0) = 0 then
    return jsonb_build_object('roll', v_r, 'weapon', false);
  end if;
  v_t := ((public.hr_seed(p_user, p_slot, 'chest:' || p_n || ':family') % 1000000) + 1000000) % 1000000;
  select l.own_pm into v_own from public.hr_chest_luck l where l.id;
  if p_own is not null and p_own = any (p_families) then
    v_others := array(select f from unnest(p_families) f where f <> p_own);
    v_cut := v_own::bigint * 1000;
    if v_t < v_cut or cardinality(v_others) = 0 then
      v_fam := p_own;
    else
      v_fam := v_others[1 + ((v_t - v_cut) * cardinality(v_others)) / (1000000 - v_cut)];
    end if;
  else
    v_fam := p_families[1 + (v_t * cardinality(p_families)) / 1000000];
  end if;
  return jsonb_build_object('roll', v_r, 'weapon', true, 'family', v_fam);
end $fn$;

-- What the hero holds of an item: { bag, storage }.
create or replace function public.hr_chest_held(p_user uuid, p_slot int, p_item text)
returns jsonb language sql stable set search_path = public, pg_catalog as $$
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  select jsonb_build_object(
    'bag', coalesce((select i.qty from public.player_inventory i where i.user_id = p_user and i.slot = p_slot and i.item_id = p_item), 0),
    'storage', coalesce((select b.qty from public.account_bank b where b.user_id = p_user and b.item_id = p_item), 0))
$$;

-- THE MENU'S NUMBERS, the server's own (the design's "One menu that shows all of it"). Reads only.
create or replace function public.hr_chest_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  v_l public.chest_luck%rowtype; v_lk public.hr_chest_luck%rowtype; v_own text; v_cin jsonb; v_today int; v_keys jsonb := '[]'::jsonb;
  v_k record; v_def int; v_fams int;
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  select * into v_l from public.chest_luck where user_id = p_user and slot = p_slot;
  select * into v_lk from public.hr_chest_luck where id;
  select f.family into v_own from public.player_equipment e join public.hr_chest_weapon_families f on f.item_id = e.item_id
   where e.user_id = p_user and e.slot = p_slot and e.equip_slot = 'weapon';
  v_cin := public.hr_chest_held(p_user, p_slot, 'tower_cinders');
  v_today := (select count(*) from public.chest_opens o where o.user_id = p_user and o.slot = p_slot and o.at >= public.hr_utc_day_start(now()))::int;
  select count(*) into v_fams from public.hr_chest_families;
  for v_k in select * from public.hr_chest_keys order by from_landing loop
    v_def := coalesce((v_l.stokes ->> v_k.key_id)::int, 0);
    v_keys := v_keys || jsonb_build_array(jsonb_build_object(
      'key', v_k.key_id, 'item', v_k.item_id, 'name', v_k.name, 'from', v_k.from_landing, 'skill_plus', v_k.skill_plus,
      'held', public.hr_chest_held(p_user, p_slot, v_k.item_id), 'base_pm', v_k.weapon_pm,
      'chance_ppm', public.hr_chest_chance_ppm(v_k.weapon_pm, coalesce(v_l.dry, 0), v_def), 'stokes_default', v_def,
      'stokes', coalesce((select jsonb_agg(jsonb_build_object('n', s.stokes, 'pm', s.pm, 'cost', s.keys * v_k.cinders) order by s.stokes)
                            from public.hr_chest_stokes s), '[]'::jsonb),
      'inside', jsonb_build_object('tower_cinders', v_k.cinders) || jsonb_build_object(v_k.salts_item, v_k.salts_qty)
                || jsonb_build_object(v_k.food_item, v_k.food_qty),
      'ready', (select count(*) from public.hr_chest_weapons w where w.key_id = v_k.key_id) = v_fams));
  end loop;
  return jsonb_build_object('on', public.hr_feature_on('burning_tower', p_user), 'dry', coalesce(v_l.dry, 0), 'opens', coalesce(v_l.opens, 0),
    'warmth_pm', 1000 + least(coalesce(v_l.dry, 0)::bigint * v_lk.warmth_step_pm, v_lk.warmth_cap_pm - 1000),
    'today', v_today, 'max_day', v_lk.per_day, 'per_call', v_lk.per_call, 'own_pm', v_lk.own_pm, 'own_family', v_own,
    'cinders', v_cin, 'keys', v_keys);
end $fn$;

-- THE MINT: a landing row the settle wrote is a key in that hero's bag, once. Runs in the settle's transaction (hr_tower_write).
create or replace function public.hr_tower_key_mint()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_k public.hr_chest_keys%rowtype;
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  select * into v_k from public.hr_chest_keys where from_landing <= new.landing order by from_landing desc limit 1;
  if v_k.key_id is null then return null; end if;
  insert into public.player_inventory as pi (user_id, slot, item_id, qty) values (new.user_id, new.slot, v_k.item_id, 1)
    on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, session_id, meta)
    values (new.user_id, new.slot, 'hunt', 'tower_key', v_k.item_id, 1, 0, 0, 0, 1, new.session_id,
            jsonb_build_object('reason', 'tower_key', 'key', v_k.key_id, 'landing', new.landing, 'week', new.week, 'session', new.session_id));
  return null;
end $fn$;
drop trigger if exists hr_tower_key_mint on public.tower_landings;
create trigger hr_tower_key_mint after insert on public.tower_landings for each row execute function public.hr_tower_key_mint();

-- ── §3 THE VERBS ─────────────────────────────────────────────────────────────
create or replace function public.hr_chest_open(p_slot int, p_chest text, p_key text, p_count int, p_stokes int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'chest_open';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_s public.hunt_sessions%rowtype; v_settle jsonb;
  v_k public.hr_chest_keys%rowtype; v_lk public.hr_chest_luck%rowtype; v_l public.chest_luck%rowtype;
  v_fams text[]; v_own text; v_today int; v_keys jsonb; v_cin jsonb; v_cin_have bigint; v_held bigint;
  v_stacks int; v_cap int; v_new int; v_want int; v_st int; v_cost bigint; v_spent bigint := 0; v_paid bigint := 0;
  v_dry int; v_n bigint; v_chance int; v_roll jsonb; v_weapon text; v_opens jsonb := '[]'::jsonb; v_haul jsonb := '{}'::jsonb;
  v_take jsonb; v_a jsonb; v_out jsonb; i int; v_it record;
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if not exists (select 1 from public.hr_chests c where c.chest_id = p_chest) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_chest')); end if;
  select * into v_k from public.hr_chest_keys where key_id = p_key;
  if not found then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_key')); end if;
  select * into v_lk from public.hr_chest_luck where id;
  if p_count is null or p_count < 1 or p_count > v_lk.per_call then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_count', 'max', v_lk.per_call)); end if;
  if p_stokes is not null and p_stokes <> 0 and not exists (select 1 from public.hr_chest_stokes s where s.stokes = p_stokes) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_stokes')); end if;
  -- The key names the whole press: a replay answers its own receipt, another press under it is intent_mismatch.
  v_verb := c_verb || ':' || p_chest || ':' || p_key || ':' || p_count || ':' || coalesce(p_stokes::text, 'd');
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_feature_on('burning_tower', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  v_s := public.hr_hunt_lock(v_uid, p_slot);
  -- THE KEY AGAIN, UNDER THE LOCK: a second press on one key waited here and answers the first's receipt.
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version into v_ver from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  -- THE CHEST STANDS IN TOWN: a hero out on a hunt (a climb, a training session, any hunt session) opens nothing until it is back.
  if v_s.id is not null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'in_hunt')); end if;
  v_settle := public.hr_settle_first_of(v_uid, p_slot);
  if v_settle is not null then return public.hr_note_rejection(c_verb, p_slot, v_settle); end if;
  -- THE SEVEN WEAPONS: a key whose weapons are not all built is never opened (it stays in the bag); nobody is paid a roll the table can't honour.
  v_fams := array(select f.family from public.hr_chest_weapons w join public.hr_chest_families f on f.family = w.family
                   where w.key_id = v_k.key_id order by f.ord);
  if cardinality(v_fams) <> (select count(*) from public.hr_chest_families) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'chest_not_ready', 'key', v_k.key_id)); end if;
  -- THE ACCOUNT'S DEPOT KEY, after the hero's (Storage is read and may be taken from): hr_bank_move's and hr_materials_take's order.
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
  insert into public.chest_luck (user_id, slot) values (v_uid, p_slot) on conflict (user_id, slot) do nothing;
  select * into v_l from public.chest_luck where user_id = v_uid and slot = p_slot for update;
  -- THE DAY, from the append-only chest_opens.
  v_today := (select count(*) from public.chest_opens o where o.user_id = v_uid and o.slot = p_slot and o.at >= public.hr_utc_day_start(now()))::int;
  if v_today + p_count > v_lk.per_day then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'day_limit', 'today', v_today, 'max', v_lk.per_day)); end if;
  -- THE KEYS: the bag, then Storage.
  v_keys := public.hr_chest_held(v_uid, p_slot, v_k.item_id);
  v_held := (v_keys->>'bag')::bigint + (v_keys->>'storage')::bigint;
  if v_held < p_count then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_key', 'have', v_held, 'need', p_count)); end if;
  -- THE BAG, BEFORE ANY ROLL: the worst case of the press must fit (every haul item the bag doesn't hold, a weapon a family it could roll,
  -- less the key's stack the press empties), so no refusal ever follows a roll and says what a key found.
  select count(*)::int into v_stacks from public.player_inventory where user_id = v_uid and slot = p_slot;
  select bank_cap into v_cap from public.player_state where user_id = v_uid and slot = p_slot;
  v_new := (select count(*) from (values ('tower_cinders'), (v_k.salts_item), (v_k.food_item)) h(item)
             where not exists (select 1 from public.player_inventory i where i.user_id = v_uid and i.slot = p_slot and i.item_id = h.item))::int
           + least(p_count, cardinality(v_fams))
           - case when (v_keys->>'bag')::bigint between 1 and p_count then 1 else 0 end;
  if v_new > 0 and v_stacks + v_new > v_cap then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bag_full', 'stacks', v_stacks, 'cap', v_cap, 'need', v_new)); end if;
  select f.family into v_own from public.player_equipment e join public.hr_chest_weapon_families f on f.item_id = e.item_id
   where e.user_id = v_uid and e.slot = p_slot and e.equip_slot = 'weapon';
  v_cin := public.hr_chest_held(v_uid, p_slot, 'tower_cinders');
  v_cin_have := (v_cin->>'bag')::bigint + (v_cin->>'storage')::bigint;
  v_dry := v_l.dry;
  -- THE PRESS, all or nothing: a refused hr_apply rolls back every take, roll and row below (HR001).
  begin
    for i in 1 .. p_count loop
      -- the stokes: asked (or the saved default), then the most the Cinders cover at this key's turn
      v_want := coalesce(p_stokes, (v_l.stokes ->> v_k.key_id)::int, 0);
      v_st := least(v_want, coalesce((select max(s.stokes) from public.hr_chest_stokes s), 0));
      loop
        v_cost := case when v_st = 0 then 0 else (select s.keys from public.hr_chest_stokes s where s.stokes = v_st)::bigint * v_k.cinders end;
        exit when v_st = 0 or v_cost <= v_cin_have + v_paid - v_spent;
        v_st := v_st - 1;
      end loop;
      v_spent := v_spent + v_cost;
      v_n := v_l.opens + i;
      v_chance := public.hr_chest_chance_ppm(v_k.weapon_pm, v_dry, v_st);
      v_roll := public.hr_chest_roll(v_uid, p_slot, v_n, v_chance, v_own, v_fams);
      v_weapon := null;
      if (v_roll->>'weapon')::boolean then
        select w.item_id into v_weapon from public.hr_chest_weapons w where w.key_id = v_k.key_id and w.family = v_roll->>'family';
        v_haul := jsonb_set(v_haul, array[v_weapon], to_jsonb(coalesce((v_haul->>v_weapon)::bigint, 0) + 1));
      end if;
      insert into public.chest_opens (user_id, slot, n, chest_id, key_id, stokes, cinders_spent, dry, chance_ppm, roll, family, weapon, intent_id)
        values (v_uid, p_slot, v_n, p_chest, v_k.key_id, v_st, v_cost, v_dry, v_chance, (v_roll->>'roll')::int,
                case when v_weapon is null then null else v_roll->>'family' end, v_weapon, p_idem);
      v_opens := v_opens || jsonb_build_array(jsonb_build_object('n', v_n, 'stokes', v_st, 'chance_ppm', v_chance, 'weapon', v_weapon,
                                                                 'family', case when v_weapon is null then null else v_roll->>'family' end));
      v_dry := case when v_weapon is null then v_dry + 1 else 0 end;
      v_paid := v_paid + v_k.cinders;
    end loop;
    -- THE TAKE: the keys, and the Cinders the stokes spent over what the press paid out (the bag first, then Storage). One ledger row an item.
    v_take := public.hr_materials_take(v_uid, p_slot, jsonb_build_object(v_k.item_id, p_count)
                || case when v_spent > v_paid then jsonb_build_object('tower_cinders', v_spent - v_paid) else '{}'::jsonb end, true);
    if coalesce(v_take->>'ok', 'false') <> 'true' then
      raise exception using errcode = 'HR001', message = (v_take || jsonb_build_object('ok', false))::text; end if;
    for v_it in select t.key as item, (coalesce((v_take #>> array['from', 'bag', t.key])::bigint, 0)) as bag,
                       (coalesce((v_take #>> array['from', 'storage', t.key])::bigint, 0)) as sto
                  from jsonb_each(jsonb_build_object(v_k.item_id, 1) || case when v_spent > v_paid then jsonb_build_object('tower_cinders', 1) else '{}'::jsonb end) t loop
      insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
        values (v_uid, p_slot, 'hunt', v_verb, v_it.item, -(v_it.bag + v_it.sto), 0,
                jsonb_build_object('reason', c_verb, 'took', jsonb_build_object('bag', v_it.bag, 'storage', v_it.sto)));
    end loop;
    -- THE HAUL: what every key always holds, the weapons, and the Cinders the press paid over what its stokes spent.
    v_haul := v_haul || jsonb_build_object(v_k.salts_item, v_k.salts_qty::bigint * p_count)
                     || jsonb_build_object(v_k.food_item, coalesce((v_haul->>v_k.food_item)::bigint, 0) + v_k.food_qty::bigint * p_count);
    if v_paid > v_spent then v_haul := v_haul || jsonb_build_object('tower_cinders', v_paid - v_spent); end if;
    v_a := public.hr_apply(v_uid, p_slot, v_ver, p_idem, jsonb_build_object(
             'items', v_haul,
             'journal', jsonb_build_object('kind', 'hunt', 'intent', v_verb,
                                           'meta', jsonb_build_object('reason', c_verb, 'chest', p_chest, 'key', v_k.key_id, 'count', p_count,
                                                                      'opens', v_opens, 'cinders_paid', v_paid, 'cinders_spent', v_spent,
                                                                      'took', v_take->'from'))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      raise exception using errcode = 'HR001', message = (v_a || jsonb_build_object('ok', false))::text; end if;
    update public.chest_luck set dry = v_dry, opens = opens + p_count, updated_at = now() where user_id = v_uid and slot = p_slot;
    v_out := jsonb_build_object('ok', true, 'version', v_a->'version', 'chest', p_chest, 'key', v_k.key_id, 'count', p_count, 'opens', v_opens,
                                'haul', v_haul || jsonb_build_object('tower_cinders', v_paid), 'cinders_spent', v_spent, 'dry', v_dry,
                                'opens_total', v_l.opens + p_count);
    -- the receipt a replay answers is this one, not hr_apply's bare one
    update public.player_intents set result = v_out where user_id = v_uid and intent_id = p_idem;
  exception when sqlstate 'HR001' then
    return public.hr_note_rejection(c_verb, p_slot, sqlerrm::jsonb);
  end;
  return v_out || jsonb_build_object('chest_section', public.hr_chest_section(v_uid, p_slot));
end $fn$;

create or replace function public.hr_chest_stoke_default(p_slot int, p_key text, p_stokes int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'chest_stoke_default';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text;
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if not exists (select 1 from public.hr_chest_keys k where k.key_id = p_key) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_key')); end if;
  if p_stokes is null or (p_stokes <> 0 and not exists (select 1 from public.hr_chest_stokes s where s.stokes = p_stokes)) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_stokes')); end if;
  v_verb := c_verb || ':' || p_key || ':' || p_stokes;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('hunt') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  if not public.hr_feature_on('burning_tower', v_uid) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'feature_off')); end if;
  perform public.hr_hunt_lock(v_uid, p_slot);
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = p_slot) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  insert into public.chest_luck as c (user_id, slot, stokes, updated_at) values (v_uid, p_slot, jsonb_build_object(p_key, p_stokes), now())
    on conflict (user_id, slot) do update set stokes = c.stokes || jsonb_build_object(p_key, p_stokes), updated_at = now();
  v_r := jsonb_build_object('ok', true, 'key', p_key, 'stokes', p_stokes);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r || jsonb_build_object('chest_section', public.hr_chest_section(v_uid, p_slot));
end $fn$;

-- ── §4 PRIVILEGES: the verbs the signed-in client's alone, every helper the owner's ──
revoke all on function public.hr_chest_chance_ppm(int, int, int) from public, anon, authenticated, service_role;
revoke all on function public.hr_chest_roll(uuid, int, bigint, int, text, text[]) from public, anon, authenticated, service_role;
revoke all on function public.hr_chest_held(uuid, int, text) from public, anon, authenticated, service_role;
revoke all on function public.hr_chest_section(uuid, int) from public, anon, authenticated, service_role;
revoke all on function public.hr_tower_key_mint() from public, anon, authenticated, service_role;
revoke all on function public.hr_chest_opens_immutable() from public, anon, authenticated, service_role;
revoke execute on function public.hr_chest_open(int, text, text, int, int, uuid) from public;
revoke execute on function public.hr_chest_open(int, text, text, int, int, uuid) from anon, service_role;
grant  execute on function public.hr_chest_open(int, text, text, int, int, uuid) to authenticated;
revoke execute on function public.hr_chest_stoke_default(int, text, int, uuid) from public;
revoke execute on function public.hr_chest_stoke_default(int, text, int, uuid) from anon, service_role;
grant  execute on function public.hr_chest_stoke_default(int, text, int, uuid) to authenticated;

-- ── §5 THE CLIENT BASELINE AND THE WALL ──────────────────────────────────────
-- an older signature's row goes; the current two are upserted, so a second apply keeps their approved_at (byte-identical)
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_chest_open', 'hr_chest_stoke_default')
  and (proname, identity_args) not in (('hr_chest_open', 'p_slot integer, p_chest text, p_key text, p_count integer, p_stokes integer, p_idem uuid'),
                                        ('hr_chest_stoke_default', 'p_slot integer, p_key text, p_stokes integer, p_idem uuid'));
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_chest_open', 'p_slot integer, p_chest text, p_key text, p_count integer, p_stokes integer, p_idem uuid', 'authenticated',
   'added 2027-04-27 (lane/c-tower-chest): MONEY (a server roll that pays items; a weapon that will trade) - uses Burning Tower keys at the Hearth Chest, the stokes priced and the chance worked out by the server, rolled on hr_seed; behind the switch burning_tower (feature_off) and chest_not_ready; pre-EA Security list'),
  ('hr_chest_stoke_default', 'p_slot integer, p_key text, p_stokes integer, p_idem uuid', 'authenticated',
   'added 2027-04-27 (lane/c-tower-chest): the hero''s own default stoke count for one kind of key; moves no value')
on conflict (proname, identity_args, grantee) do update set note = excluded.note;
do $mig$
begin
  if to_regclass('public.hr_gm_wall_allow') is not null then
    insert into public.hr_gm_wall_allow (rpc, why) values ('hr_chest_stoke_default', 'its own hero')
      on conflict (rpc) do update set why = excluded.why; end if;
end $mig$;

-- ── §9 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ─────────
do $$
declare
  v_u      constant uuid := '000000c0-0000-4000-a000-0000c4e57001';
  k        constant text := '000000c0-0000-4000-b000-c4e5';
  v        jsonb; v2 jsonb; v_sig text; v_role text; t text; v_week date; v_sid uuid; v_fam record; v_w text;
  v_weapons constant bigint := (select count(*) from public.hr_chest_weapons);
begin
  -- (a) PRIVILEGES AND SHAPE: every helper the owner's alone; the verbs the signed-in client's alone and on the baseline; the tables
  --     readable by their owner and written by no client; the mint's trigger on tower_landings.
  foreach v_sig in array array['public.hr_chest_chance_ppm(integer,integer,integer)', 'public.hr_chest_roll(uuid,integer,bigint,integer,text,text[])',
                               'public.hr_chest_held(uuid,integer,text)', 'public.hr_chest_section(uuid,integer)', 'public.hr_tower_key_mint()',
                               'public.hr_chest_opens_immutable()'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_sig, 'execute') then raise exception 'tower-chest §9(a): % can execute %', v_role, v_sig; end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_chest_open(integer,text,text,integer,integer,uuid)', 'public.hr_chest_stoke_default(integer,text,integer,uuid)'] loop
    if not has_function_privilege('authenticated', v_sig, 'execute') or has_function_privilege('anon', v_sig, 'execute')
       or has_function_privilege('service_role', v_sig, 'execute') then
      raise exception 'tower-chest §9(a): % is not the signed-in client''s alone', v_sig; end if;
  end loop;
  if (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_chest_open', 'hr_chest_stoke_default')) <> 2 then
    raise exception 'tower-chest §9(a): a verb is not on the client baseline'; end if;
  foreach t in array array['chest_luck', 'chest_opens'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then raise exception 'tower-chest §9(a): % has no RLS', t; end if;
    if has_table_privilege('authenticated', 'public.' || t, 'insert,update,delete') or has_table_privilege('anon', 'public.' || t, 'select')
       or has_table_privilege('service_role', 'public.' || t, 'insert,update,delete') then
      raise exception 'tower-chest §9(a): a client can write % (or anon read it)', t; end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd <> 'SELECT') then
      raise exception 'tower-chest §9(a): % has a client write policy', t; end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'hr_tower_key_mint' and tgrelid = 'public.tower_landings'::regclass and not tgisinternal) then
    raise exception 'tower-chest §9(a): the mint is not on tower_landings'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'hr_chest_opens_immutable' and tgrelid = 'public.chest_opens'::regclass and not tgisinternal) then
    raise exception 'tower-chest §9(a): chest_opens is not append-only'; end if;
  perform public.hr_assert_grant_hygiene(true);
  -- (b) THE DESIGN'S NUMBERS (the board's §5 warmth and stoke tables, Tyler 2026-11-14), read back through the server's own sum.
  if public.hr_chest_chance_ppm(160, 0, 0) <> 160000 or public.hr_chest_chance_ppm(160, 5, 0) <> 192000
     or public.hr_chest_chance_ppm(160, 35, 0) <> 384000 or public.hr_chest_chance_ppm(160, 50, 0) <> 480000
     or public.hr_chest_chance_ppm(160, 500, 0) <> 480000 or public.hr_chest_chance_ppm(20, 50, 0) <> 60000
     or public.hr_chest_chance_ppm(45, 0, 1) <> 76500 or public.hr_chest_chance_ppm(20, 0, 2) <> 50000
     or public.hr_chest_chance_ppm(20, 0, 3) <> 66000 or public.hr_chest_chance_ppm(160, 50, 3) <> 1000000
     or public.hr_chest_chance_ppm(160, 0, 9) is not null then
    raise exception 'tower-chest §9(b): the chance is not the design''s (base x warmth x stoke)'; end if;
  if (select string_agg(key_id || '@' || from_landing || '=' || weapon_pm, ',' order by from_landing) from public.hr_chest_keys)
     is distinct from 'bronze@10=160,silver@40=80,gold@70=45,platinum@100=20' then
    raise exception 'tower-chest §9(b): the key table is not Tyler''s 16 / 8 / 4.5 / 2%%'; end if;
  -- (c) THE MINT AND THE OPEN on a real hero (both doors of the climb's settle are tests/tower-chest.mjs TCH-MINT).
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Chest') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'tower-chest §9 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-chest §9(c): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    v_week := public.hr_tower_week(now());
    v_sid := gen_random_uuid();
    -- the mint: landings 10, 40 and 130 are a Bronze, a Silver and a Platinum key (the top row is open-ended); a second row is no key
    insert into public.tower_landings (user_id, slot, week, landing, session_id, at) values
      (v_u, 0, v_week, 10, v_sid, now()), (v_u, 0, v_week, 40, v_sid, now()), (v_u, 0, v_week, 130, v_sid, now());
    insert into public.tower_landings (user_id, slot, week, landing, session_id, at) values (v_u, 0, v_week, 10, v_sid, now()) on conflict do nothing;
    if (select string_agg(item_id || '=' || qty, ',' order by item_id) from public.player_inventory where user_id = v_u and slot = 0 and item_id like 'tower\_key\_%')
       is distinct from 'tower_key_bronze=1,tower_key_platinum=1,tower_key_silver=1' then
      raise exception 'tower-chest §9(c): the mint gave %', (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = v_u and item_id like 'tower\_key\_%'); end if;
    if (select count(*) from public.player_ledger where user_id = v_u and intent = 'tower_key' and qty = 1 and session_id = v_sid) <> 3 then
      raise exception 'tower-chest §9(c): the mint did not journal one row a key'; end if;
    -- the switch off: refused, nothing moved
    update public.hr_feature_switches set scope = 'off' where switch_id = 'burning_tower';
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '00000001')::uuid);
    if v->>'error' is distinct from 'feature_off' then raise exception 'tower-chest §9(c): the switch off answered %', v; end if;
    update public.hr_feature_switches set scope = 'accounts', accounts = array[v_u] where switch_id = 'burning_tower';
    -- forged values: no chest, no key, a count past the clamp, a stoke no row has
    if (public.hr_chest_open(0, 'nowhere', 'bronze', 1, 0, (k || '00000002')::uuid))->>'error' is distinct from 'bad_chest'
       or (public.hr_chest_open(0, 'great_hearth', 'diamond', 1, 0, (k || '00000003')::uuid))->>'error' is distinct from 'bad_key'
       or (public.hr_chest_open(0, 'great_hearth', 'bronze', 21, 0, (k || '00000004')::uuid))->>'error' is distinct from 'bad_count'
       or (public.hr_chest_open(0, 'great_hearth', 'bronze', 0, 0, (k || '00000005')::uuid))->>'error' is distinct from 'bad_count'
       or (public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 4, (k || '00000006')::uuid))->>'error' is distinct from 'bad_stokes'
       or (public.hr_chest_open(0, 'great_hearth', 'bronze', 1, -1, (k || '00000007')::uuid))->>'error' is distinct from 'bad_stokes' then
      raise exception 'tower-chest §9(c): a forged chest, key, count or stoke was not refused'; end if;
    delete from public.hr_rate_counters where user_id = v_u;
    -- no weapon is built: chest_not_ready, the key kept
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '00000008')::uuid);
    if v->>'error' is distinct from 'chest_not_ready'
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'tower_key_bronze') <> 1 then
      raise exception 'tower-chest §9(c): a key with no weapons answered % (or was taken)', v; end if;
    -- seven stand-in weapons for the Bronze Key (rolled back with the probe): the open plays
    for v_fam in select family from public.hr_chest_families order by ord loop
      select w.item_id into v_w from public.hr_chest_weapon_families w where w.family = v_fam.family order by w.item_id limit 1;
      insert into public.hr_chest_weapons (key_id, family, item_id) values ('bronze', v_fam.family, v_w) on conflict do nothing;
    end loop;
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 2, 0, (k || '00000009')::uuid);
    if v->>'error' is distinct from 'no_key' or (v->>'have')::int <> 1 then raise exception 'tower-chest §9(c): two keys from one answered %', v; end if;
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '0000000a')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->'haul'->>'tower_cinders')::int <> 50 or (v->'haul'->>'temper_salts')::int <> 15
       or (v->'haul'->>'cooked_shrimp')::int < 20 or exists (select 1 from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'tower_key_bronze')
       or (select count(*) from public.chest_opens where user_id = v_u and slot = 0 and n = 1 and chance_ppm = 160000 and dry = 0) <> 1
       or (select opens from public.chest_luck where user_id = v_u and slot = 0) <> 1
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'chest_open:great_hearth:bronze:1:0') <> 2 then
      raise exception 'tower-chest §9(c): one Bronze Key answered % (key, row, luck or ledger off)', v; end if;
    -- the same key again: the same receipt, nothing moved twice
    v2 := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '0000000a')::uuid);
    if v2->'opens' is distinct from v->'opens' or (select count(*) from public.chest_opens where user_id = v_u) <> 1 then
      raise exception 'tower-chest §9(c): a replay answered % (or opened again)', v2; end if;
    -- the journal of keys used is append-only
    begin
      update public.chest_opens set roll = 0 where user_id = v_u;
      raise exception 'tower-chest §9(c): a chest_opens row was changed';
    exception when check_violation then null;
    end;
    -- a key used is gone: the next press has none
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '0000000b')::uuid);
    if v->>'error' is distinct from 'no_key' then raise exception 'tower-chest §9(c): a used key answered %', v; end if;
    -- the default stoke: saved, read back
    v := public.hr_chest_stoke_default(0, 'silver', 2, (k || '0000000c')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select stokes->>'silver' from public.chest_luck where user_id = v_u and slot = 0) is distinct from '2' then
      raise exception 'tower-chest §9(c): the default stoke answered %', v; end if;
    raise exception 'tower-chest §9: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'tower-chest §9: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.chest_opens where user_id = v_u)
     or exists (select 1 from public.tower_landings where user_id = v_u) or (select count(*) from public.hr_chest_weapons) <> v_weapons then
    raise exception 'tower-chest §9: LEAKED a probe row'; end if;
  raise notice 'tower-chest: the mint once a landing, the open on the server''s dice, every forged value refused; all green';
end $$;
