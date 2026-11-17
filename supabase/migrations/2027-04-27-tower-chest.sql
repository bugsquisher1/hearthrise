-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-27-tower-chest.sql — THE HEARTH CHEST: A KEY FROM EVERY LANDING A CLIMB CLEARS (UNDER ITS FAMILY'S HELD LIMIT), AND AN OPEN THAT
--   ROLLS ON THE SERVER'S OWN DICE WITH THE HEARTH'S WARMTH AND THE STOKES, SIX A FAMILY A WEEK (lane/c-tower-chest, backend-architect,
--   2026-11-15, the caps 2026-11-16; Tyler 2026-11-14, the board's "2026-11-14 The Burning Tower" §5 keys and the chest, §10 server surface;
--   the coherence pass's C4; Tyler 2026-11-16 KEY FAMILIES: the weekly cap is CHESTS OPENED per family, not keys earned, with a held limit).
--   Phase 3 of the Tower: phase 1 was 2027-04-23-session-modes.sql, phase 2 2027-04-24-tower-climb.sql (whose tower_runs rows, the floors a
--   climb cleared, are what this file mints keys from).
--   STAGED: tools/apply-migration.mjs, one file, never inside begin/commit. Pre-EA (CLAUDE.md §2): applies on its passing §9.
--   ON THE EA SECURITY LIST: keys minted from a ranked climb, a server roll that pays items, a weapon that will trade.
--   HIDDEN: both verbs answer `feature_off` while the switch `burning_tower` (2027-04-24-tower-climb.sql, seeded OFF) is off for the account;
--   and no key opens until its seven tower weapons are built (`chest_not_ready`: src/data/chests.js chestShipBlockers, none built today).
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- A landing's key is the server's to give: the climb's settle raises its tower_runs row's top floor only after re-proving every floor under
-- it, and only ever up, so the landings between the old top and the new one are exactly the ones that window cleared: a key minted for each
-- is minted once per landing a run clears, whatever retries, whichever door settled (the world tick or the hunt viewed), and from nothing a
-- client sends. KEYS KEEP DROPPING with no weekly earn cap (Tyler 2026-11-16, superseding 2026-11-14's "6 a week" earn cap): a hero may
-- climb the same landings again for more. What bounds them is the key's FAMILY (hr_chest_key_families: 'tower' today, 'catacomb' when the
-- Unmarked Catacombs are built, every key of a family sharing its caps): a hero USES at most opens_per_week keys of a family a UTC week
-- (Monday 00:00, counted from the append-only chest_opens), and a new key of a family does NOT DROP while the hero already holds held_max of
-- it (its bag plus the account's Storage: the keys it could open; the skip is journalled). The open is the money half:
-- the client names a key, a count and a stoke count; the server prices the stokes from its own catalogue, works the chance out from its own
-- warmth count, rolls it on a seeded stream nobody can read ahead (hr_seed: a 256-bit server secret), pays from its own catalogue, journals
-- every move and answers the result. No intent carries a chance, a warmth, a Cinder count, a weapon or a family.
--
-- ── THE CONTRACT ───────────────────────────────────────────────────────────
-- hr_tower_key_mint() TRIGGER AFTER UPDATE OF top_floor ON tower_runs, WHEN the top floor rises (owner-only). For each landing in (old top
--   (or start - 1), new top]: the key of the highest 'tower' hr_chest_keys row at or under it (the family's open table: its top row is
--   open-ended). Held (hr_chest_family_held: the family's keys in the bag plus the account's Storage) under the family's held_max: +1 into the
--   hero's bag (past the bag's cap, as a hunt's loot lands: it is minted inside the settle), one player_ledger row (kind hunt, intent
--   tower_key, item_id, qty 1, qty_in 1, meta { reason, key, family, landing, held, session }). At held_max or over: NO KEY (the cleaner of the
--   two: a settle is never refused for a key), one journal-only player_ledger row (intent tower_key_withheld, no item, meta { reason, key,
--   family, landing, held, max, session }) so "where is my key" is answered from the ledger.
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
--   ok: { ok, version, chest, key, count, opens: [{ n, stokes, chance_ppm, weapon, family, outfit, bundle }], haul: { item: qty }, cinders_spent, dry, opens_total,
--   chest_section }. A replay answers this receipt once more and moves nothing.
--   REFUSALS, each moving nothing: not_signed_in, bad_slot, bad_idem, bad_chest (no hr_chests row), bad_key (no hr_chest_keys row),
--   bad_count (not 1..per_call), bad_stokes (not 0 or an hr_chest_stokes row), rate_limited, feature_off, no_character, in_hunt (the hero is
--   in a hunt session: the chest stands in town), settle_first / party_hunt_running (an unpaid window: hr_settle_first_of), chest_not_ready
--   { key } (the key's seven weapons are not all built), week_limit { family, used, limit } (this hero has used `used` keys of the key's
--   family since Monday 00:00 UTC, from chest_opens, and `used` + p_count would pass the family's opens_per_week),
--   no_key { have, need } (bag + Storage), bag_full { stacks, cap, need } (the worst case of the press: every haul item not held, one weapon a
--   family it could roll, less the key's stack it empties: checked BEFORE any roll, so a refusal never says what a key would have found),
--   intent_mismatch, and hr_apply's own (which an honest press under these locks never meets; if one does, the whole press rolls back).
-- THE SUPER-RARE OUTFIT (lane/c-sweeps-coat-drop, backend-architect, 2026-11-16; Tyler 2026-11-14: "a super rare outfit that can drop from
--   any chest", the designer's Sweep's Coat, named Key Warden by Tyler 2026-11-16; src/data/chests.js CHEST_OUTFITS, hr_chest_outfits): every key used rolls ONCE more on its own
--   stream (hr_chest_outfit_roll: hr_seed(hero, 'chest:<n>:outfit'), never the weapon's), and the chest's outfit rows for that key, stacked
--   in outfit order, each cover pm x 1000 of the million: at most one outfit a key, each at exactly its chance (Bronze 2, Silver 3, Gold 4,
--   Platinum 5 permille). A hit pays the outfit's BUNDLE item (tradeable, book value: the board's "it trades, until someone wears it") into
--   the haul, is recorded on the key's chest_opens row (outfit, outfit_roll) and answered in opens[] { outfit, bundle }; the bag's worst
--   case counts a bundle stack the bag lacks. THE CALL-OUT: once the press has applied, each find posts one System line (chat_messages,
--   channel system, from the finder: hr_chat_name_authority stamps the hero's name) "found the [[item:<bundle>]] in the Hearth Chest (<the key's
--   name>)" unless the hero is quiet (player_state.presence_quiet), outside the rare-drop daily cap (hr_world_notices counts the
--   settle's rare_drop events only). The line is in the press's transaction: a refused press posts nothing. Using the bundle is
--   2027-04-30-sweeps-coat.sql's hr_outfit_bundle_use.
-- hr_chest_stoke_default(p_slot int, p_key text, p_stokes int, p_idem uuid) -> jsonb   CLIENT VERB. The hero's default stoke count for one
--   kind of key (the design's "Save as default"). Moves no value. ok: { ok, key, stokes, chest_section }. Refusals: the shape ones, bad_key,
--   bad_stokes, rate_limited, feature_off, no_character, intent_mismatch.
-- THE KEY RING (lane/c-key-ring, Tyler 2026-11-16): a hero-bound storage for every chest key (all families), bought once per hero for gold
--   through the ONE spend RPC (hr_unlock_buy: offer key_ring.0, src/data/gold-ladders.js, a PLACEHOLDER price for the designer; ownership is
--   player_progress unlock/key_ring = 1). Before it, keys sit in the bag; from the purchase on, every chest key in the bag moves onto the
--   ring at once (hr_key_ring_on_unlock) and every NEW bag stack of one moves there as it lands (hr_key_ring_on_bag: the mint, a Storage
--   withdraw, whatever wrote it), so keys take no bag slot. Ring keys count toward the family's held limit and open exactly as bag keys do
--   (the ring first, then the bag, then Storage). player_key_ring (user_id, slot, item_id, qty) NEW: RLS own read, no client write.
-- THE RING STAYS HIDDEN WITH THE TOWER (CLAUDE.md §3.5): a BEFORE trigger on its ownership row (hr_key_ring_gate) refuses it while
--   burning_tower is off for the account, through hr_reject, so hr_unlock_buy's protected block answers feature_off and its purse debit
--   rolls back with the grant (a hand-made unlock_buy of key_ring.0 buys nothing and costs nothing while the Tower is hidden).
-- A KEY WITHDRAWN INTO A FULL BAG goes onto the ring: hr_bank_move_stack RESTATED (2027-04-13-bank-move-many.sql's live image, §0 pins it,
--   one condition more): a chest key withdrawn by a hero with a ring opens no bag stack, so the bag fuse is not asked; without a ring a full
--   bag still answers bag_full. AFTER APPLYING: live-hash-drift wants hr_bank_move_stack re-measured (Coordinator).
-- hr_key_ring_store(p_slot int, p_item text, p_qty int, p_idem uuid) -> jsonb   CLIENT VERB. Ring keys into the account's Storage (Tyler
--   2026-11-14: keys pass between one account's heroes through Storage), through the bank's own per-stack deposit (hr_bank_move_stack: its
--   room check and its bank_deposit ledger row). Refusals, each moving nothing: not_signed_in, bad_slot, bad_idem, bad_qty (not 1..1e6),
--   bad_key (no chest key), rate_limited (the bank_move bucket), settle_first / party_hunt_running, no_character, insufficient_item
--   { have, need } (the ring's count), bank_full and the deposit's other refusals, intent_mismatch. ok: { ok, item, qty, version }.
-- hr_key_ring_section(p_user uuid, p_slot int) -> jsonb   the `key_ring` STATE SECTION (every envelope): null while burning_tower is
--   off for the account; else { unlocked, offer: { offer, gold } | null (the server's price while it is locked), keys: [{ item, qty }] }.
-- hr_chest_section(p_user uuid, p_slot int) -> jsonb (owner-only; both verbs answer it; the window lane projects it): { on, dry, opens,
--   per_call, own_pm, own_family, cinders { bag, storage, ring }, warmth_pm, week_ends (the next Monday 00:00 UTC), families: [{ family, name,
--   opened (this week), max (opens_per_week), held, held_max }], keys: [{ key, family, item, name, from, held { bag, storage, ring }, base_pm,
--   chance_ppm (now, with the default stokes), stokes_default, stokes: [{ n, pm, cost }], inside { item: qty }, ready, skill_plus,
--   outfits: [{ outfit, item, pm }] }] }: every number the menu shows, the server's own.
-- chest_luck (user_id, slot) NEW: dry (keys since the last weapon), opens (keys used, ever: the roll's index and the Turnkey title's count),
--   stokes (default stokes a key). chest_opens NEW, append-only: one row a key used, with its key family (the week's count reads it) and its
--   outfit roll and find (the row a shareable card is built from: the key number, the date, the hero). Both:
--   RLS on, the owner reads its own rows, NO client write (no policy, no grant but select).
-- Owner-only helpers: hr_chest_chance_ppm, hr_chest_roll, hr_chest_outfit_roll, hr_chest_held, hr_chest_family_held, hr_chest_week_start, hr_chest_section,
--   hr_tower_key_mint, hr_chest_opens_immutable (the trigger that refuses any UPDATE or DELETE of a chest_opens row).
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────
-- The mint runs inside the settle's transaction (hr_tower_write under the hero's lock and the run row's `for update`): the run's top floor
--   only rises, so a landing is minted once a run, and a replayed settle intent returns before any of it (hr_apply's replay). The held
--   count reads the hero's bag (under its lock) and the account's Storage WITHOUT the depot key (the settle takes no depot lock): another
--   hero of the account depositing keys in the same instant can let one landing's key past held_max. Accepted: the limit gates a new drop,
--   not what a hero may hold (Storage moves keys past it by design), and the next landing reads the new count.
-- The open: hr_intent_replay first; the gate; the hero's lock (hr_hunt_lock: its advisory key, its player_state row, its open session); the
--   key again under the lock (a second press on one key waited and answers the first's receipt); then the account's DEPOT key (Storage is
--   read and taken), then chest_luck's row for update. The week's count reads chest_opens under the hero's lock, the only lock its rows are
--   written under, so two presses can never both fit under one week's cap. The order hero -> depot -> bag rows -> Storage rows -> (no purse) is
--   hr_materials_take's and every sink's. Every check reads under those locks; the takes, the rolls, the luck row, the chest_opens rows and
--   the haul are one transaction; a refused hr_apply rolls back all of it (HR001 inside the press's own block). Two heroes of one account
--   opening at once serialise on the depot key; one hero's two presses on its own lock.
-- THE DICE: a key's roll is hr_seed(hero, 'chest:<n>') where n is that hero's lifetime key count. A refused or rolled-back press uses no n,
--   so the same n rolls the same number on the next press: no outcome can be re-rolled by failing a press, and since every refusal comes
--   before the first roll, none of them reveals one.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────
-- TWO new client verbs, behind a switch. p_chest and p_key are catalogue ids; p_count is clamped (per_call, the family's week) and spends
--   keys the hero holds; p_stokes only picks a catalogue row, priced by the server, paid from the hero's own Cinders. Nothing a client sends is a
--   chance, a warmth, a price, a quantity paid out, a weapon or a family. Keys and Cinders are bound (hr_items.tradeable false, value 0):
--   the market's listable rule, the shop's bid and the dispatch all refuse them, so gold can't buy keys or odds (the board's Steam line).
--   The weekly cap is the family's opens, counted from the append-only chest_opens with the server clock; the held limit is read by the mint;
--   the mint can't be reached by a client (a trigger, owner-only, on a table no client writes). No intent names a family, a week or a count.
-- Risks named for Security: (a) the roll's index is per hero, so the dice are deterministic for a hero by design (disputes are replayable
--   from chest_opens with the secret) and unpredictable without the secret; (b) the worst-case bag check refuses a press a lucky bag would
--   fit (by design: a refusal after a roll would leak it); (c) a tower weapon will trade once built: its market ceiling row ships with it.
--
-- ── COST (rows and bytes at 100x players) ──────────────────────────────────
-- Per landing a climb clears: one bag upsert and one ledger row, or one journal-only ledger row at the held limit (a landing is ten floors of
-- three to ten minutes each: a few rows an hour of climbing at most, never a row per kill or floor, CLAUDE.md §1 law 6). Per press: one
-- chest_luck update, one chest_opens row a key (~150 bytes), one ledger row for the haul and one an item taken (two at most). At 100x (say
-- 600 heroes using six Tower keys a week, climbing an hour a day): 3,600 chest_opens rows and about 2,400 press ledger rows a week, plus
-- ~25,000 landing rows a week (~80 bytes): ~130 MB a year in player_ledger, ~25 MB in chest_opens. The week's count: an index range of
-- the hero's family since Monday (chest_opens_week), at most a family's six rows. Per settle of a climb: nothing unless the top floor
-- crosses a landing (the trigger's WHEN), then a catalogue probe, two summed lookups (bag, Storage) and two writes a landing.
--
-- EDGE: does not move (the mint is a database trigger; the chest is a town verb). The XP share that moved with this lane is
--   folded into 2027-04-24-tower-climb-session-modes-catalogue.generated.sql (src/data/session-modes.js), whose engine deploy follows it.
-- CLIENT: none (the window lane wires both verbs and projects hr_chest_section; the words are src/data/text/tower.js and refusal-words.js).
-- ORDER: after 2027-05-02-tower-hunts-catalogue.generated.sql (the Tower's keys and Cinders came with 2027-05-02-tower-items-catalogue,
--   the Tower's first file, lane/c-tower-all 2026-11-17), then 2027-04-27-tower-chest-bench-inputs.generated.sql, then 2027-04-27-tower-chest-catalogue.generated.sql, then
--   2027-04-28-key-ring-gold-ladders.generated.sql (the Key Ring's offer and unlock row: §9 owns a ring), then THIS file.
-- REVERSIBLE: drop the mint trigger on tower_runs first (no key is minted after it), then the two verbs and their baseline rows, the eight
--   helpers, the two tables. Keys and Cinders already in bags stay as items (bound, no value: they move nothing); the wipe empties them.
-- IDEMPOTENT: a second apply finds the tables, restates every body byte-identical, re-creates the trigger and the baseline rows, and §9
--   rolls back its probes.
-- WIPE: chest_luck and chest_opens join 2027-02-25-character-wipe.sql's c_wipe, the seven catalogues its c_no_player.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_chest_keys') is null or to_regclass('public.hr_chest_luck') is null or to_regclass('public.hr_chest_stokes') is null
     or to_regclass('public.hr_chest_key_families') is null or not exists (select 1 from public.hr_chest_key_families where key_family = 'tower')
     or to_regclass('public.hr_chest_weapons') is null or to_regclass('public.hr_chest_weapon_families') is null
     or to_regclass('public.hr_chest_families') is null or to_regclass('public.hr_chests') is null
     or to_regclass('public.hr_chest_outfits') is null
     or (select count(*) from public.hr_chest_luck) <> 1 or not exists (select 1 from public.hr_chest_keys) then
    raise exception 'PRECONDITION: apply 2027-04-27-tower-chest-catalogue.generated.sql first (the chest''s catalogue)'; end if;
  if to_regclass('public.tower_runs') is null or to_regclass('public.hr_tower_rules') is null then
    raise exception 'PRECONDITION: apply 2027-04-24-tower-climb.sql first (tower_runs, the floors a key is minted from)'; end if;
  if not exists (select 1 from public.hr_feature_switches where switch_id = 'burning_tower') then
    raise exception 'PRECONDITION: no burning_tower switch (2027-04-24-tower-climb.sql seeds it)'; end if;
  if to_regprocedure('public.hr_seed(uuid,integer,text)') is null or to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null
     or to_regprocedure('public.hr_materials_take(uuid,integer,jsonb,boolean)') is null or to_regprocedure('public.hr_settle_first_of(uuid,integer)') is null
     or to_regprocedure('public.hr_hunt_lock(uuid,integer)') is null or to_regprocedure('public.hr_intent_replay(uuid,integer,uuid,text)') is null
     or to_regprocedure('public.hr_note_rejection(text,integer,jsonb)') is null or to_regprocedure('public.hr_rpc_gate(text)') is null
     or to_regprocedure('public.hr_reject(text,jsonb)') is null
     or to_regprocedure('public.hr_feature_on(text,uuid)') is null or to_regprocedure('public.hr_utc_day_start(timestamp with time zone)') is null
     or to_regclass('public.hr_client_rpc_baseline') is null or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null then
    raise exception 'PRECONDITION: a helper this file calls is missing'; end if;
end $mig$;

-- §0 THE PIN: hr_bank_move_stack is exactly 2027-04-13-bank-move-many.sql's live image, or this file's own (a second apply): md5 of
-- pg_get_functiondef, whitespace runs as one.
do $mig$
declare v_md5 text;
begin
  v_md5 := md5(regexp_replace(pg_get_functiondef('public.hr_bank_move_stack(uuid,integer,text,bigint,text,integer)'::regprocedure), '[[:space:]]+', ' ', 'g'));
  if v_md5 not in ('4d9192c9a31f1818fee1fabf8bceb95f', '3ad648b1b268eb3e7916b4167efad3cf') then
    raise exception 'PIN: hr_bank_move_stack is neither 2027-04-13-bank-move-many.sql''s image (4d9192c9a31f1818fee1fabf8bceb95f) nor this file''s (3ad648b1b268eb3e7916b4167efad3cf): md5 % - another file moved it', v_md5; end if;
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
  key_family    text        not null,
  stokes        int         not null check (stokes >= 0),
  cinders_spent int         not null check (cinders_spent >= 0),
  dry           int         not null check (dry >= 0),
  chance_ppm    int         not null check (chance_ppm between 0 and 1000000),
  roll          int         not null check (roll between 0 and 999999),
  family        text,
  weapon        text,
  outfit_roll   int         check (outfit_roll between 0 and 999999),
  outfit        text        check (outfit ~ '^[a-z0-9_]{1,40}$'),
  intent_id     uuid        not null,
  at            timestamptz not null default now(),
  constraint chest_opens_n unique (user_id, slot, n),
  constraint chest_opens_hit check ((weapon is null) = (family is null) and (weapon is null or roll < chance_ppm)),
  constraint chest_opens_outfit check (outfit is null or outfit_roll is not null)
);
create index if not exists chest_opens_week on public.chest_opens (user_id, slot, key_family, at);
create table if not exists public.player_key_ring (
  user_id    uuid        not null,
  slot       int         not null check (slot between 0 and 5),
  item_id    text        not null,
  qty        bigint      not null check (qty > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot, item_id)
);
do $mig$
declare t text;
begin
  foreach t in array array['chest_luck', 'chest_opens', 'player_key_ring'] loop
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
comment on table public.player_key_ring is '2027-04-27-tower-chest.sql (lane/c-key-ring): a hero''s Key Ring, its chest keys by item, once the ring is bought (player_progress unlock/key_ring). Written only by the ring''s triggers (a key landing in the bag), hr_chest_open (a key used) and hr_key_ring_store (keys into Storage). RLS: own rows readable, no client write.';
comment on table public.chest_opens is '2027-04-27-tower-chest.sql: append-only, one row a key used at the Hearth Chest: its index, key family, chance, roll, warmth, stokes, weapon, and its outfit roll and outfit found (the super-rare). The audit a dispute is replayed from, a family''s weekly open count (hr_chest_open) and the Turnkey title''s count. Written only by hr_chest_open. RLS: own rows readable, no client write.';

-- ── §2 THE HELPERS (owner-only) ──────────────────────────────────────────────
-- PLANNED ONCE: every read helper here is plpgsql, never `language sql` with a SET clause, which PostgreSQL 17 re-plans on every call. The
-- `tower` and `key_ring` sections read them on every envelope and settle once the switch is on (tests/settle-budget.mjs SB-3 named five).
-- A key's chance in parts per million: base (permille) x the warmth after p_dry dry keys x the stoke (permille), at most 1,000,000. Null for
-- a stoke count no row has. The same integer sum as src/data/chests.js chestChancePpm (tests/tower-chest.mjs TCH-DATA checks the two agree).
create or replace function public.hr_chest_chance_ppm(p_base_pm int, p_dry int, p_stokes int)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  return (select case when p_stokes is null or p_base_pm is null then null
              when p_stokes <> 0 and s.pm is null then null
              else least(1000000, (p_base_pm::bigint * (1000 + least(greatest(coalesce(p_dry, 0), 0)::bigint * l.warmth_step_pm, l.warmth_cap_pm - 1000))
                                   * (case when p_stokes = 0 then 1000 else s.pm end) / 1000))::int end
    from public.hr_chest_luck l left join public.hr_chest_stokes s on s.stokes = p_stokes
   where l.id);
end $fn$;

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

-- ONE KEY'S OUTFIT ROLL (lane/c-sweeps-coat-drop): the hero's n-th key on its OWN stream (never the weapon's, so an outfit row never moves a
-- weapon's odds), 0..999999. The open walks the key's hr_chest_outfits rows in outfit order, each covering pm x 1000 of the million: at most
-- one outfit a key, each at exactly its chance. Pure in its inputs and the secret: the same hero and n roll the same.
create or replace function public.hr_chest_outfit_roll(p_user uuid, p_slot int, p_n bigint)
returns int language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  return (((public.hr_seed(p_user, p_slot, 'chest:' || p_n || ':outfit') % 1000000) + 1000000) % 1000000)::int;
end $fn$;

-- What the hero holds of an item: { bag, storage, ring }.
create or replace function public.hr_chest_held(p_user uuid, p_slot int, p_item text)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  return jsonb_build_object(
    'bag', coalesce((select i.qty from public.player_inventory i where i.user_id = p_user and i.slot = p_slot and i.item_id = p_item), 0),
    'storage', coalesce((select b.qty from public.account_bank b where b.user_id = p_user and b.item_id = p_item), 0),
    'ring', coalesce((select r.qty from public.player_key_ring r where r.user_id = p_user and r.slot = p_slot and r.item_id = p_item), 0));
end $fn$;

-- What the hero holds of a key FAMILY: every key of it in the bag, on its Key Ring and in the account's Storage (the keys it could open). The
-- mint's held limit.
create or replace function public.hr_chest_family_held(p_user uuid, p_slot int, p_family text)
returns bigint language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  return coalesce((select sum(i.qty) from public.player_inventory i join public.hr_chest_keys k on k.item_id = i.item_id
                    where i.user_id = p_user and i.slot = p_slot and k.key_family = p_family), 0)::bigint
       + coalesce((select sum(r.qty) from public.player_key_ring r join public.hr_chest_keys k on k.item_id = r.item_id
                    where r.user_id = p_user and r.slot = p_slot and k.key_family = p_family), 0)::bigint
       + coalesce((select sum(b.qty) from public.account_bank b join public.hr_chest_keys k on k.item_id = b.item_id
                    where b.user_id = p_user and k.key_family = p_family), 0)::bigint;
end $fn$;

-- THE KEY RING (lane/c-key-ring): does this hero own one (hr_unlock_buy's ownership row, GREATEST-merged)?
create or replace function public.hr_key_ring_owned(p_user uuid, p_slot int)
returns boolean language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- KEY-RING (2027-04-27-tower-chest.sql)
  return exists (select 1 from public.player_progress g where g.user_id = p_user and g.slot = p_slot and g.kind = 'unlock'
                  and g.key = 'key_ring' and g.period_key = '' and g.value >= 1);
end $fn$;

-- Every chest key in the hero's bag onto its ring (the purchase's sort). The number of keys moved.
create or replace function public.hr_key_ring_sweep(p_user uuid, p_slot int)
returns bigint language plpgsql set search_path = public, pg_catalog as $fn$
declare v_n bigint;
begin
  -- KEY-RING (2027-04-27-tower-chest.sql)
  with moved as (
    delete from public.player_inventory i using public.hr_chest_keys k
     where i.user_id = p_user and i.slot = p_slot and i.item_id = k.item_id
    returning i.item_id, i.qty),
  put as (
    insert into public.player_key_ring as r (user_id, slot, item_id, qty)
      select p_user, p_slot, m.item_id, m.qty from moved m
    on conflict (user_id, slot, item_id) do update set qty = r.qty + excluded.qty, updated_at = now()
    returning 1)
  select coalesce(sum(m.qty), 0) into v_n from moved m;
  return v_n;
end $fn$;

-- THE PURCHASE SORTS THE BAG: the ring's ownership row written (hr_unlock_buy), every bag key goes onto it; one journal row (no value moves).
create or replace function public.hr_key_ring_on_unlock()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_n bigint;
begin
  -- KEY-RING (2027-04-27-tower-chest.sql)
  v_n := public.hr_key_ring_sweep(new.user_id, new.slot);
  insert into public.player_ledger (user_id, slot, kind, intent, meta)
    values (new.user_id, new.slot, 'bank', 'key_ring_sort', jsonb_build_object('reason', 'key_ring_sort', 'moved', v_n));
  return null;
end $fn$;
drop trigger if exists hr_key_ring_on_unlock on public.player_progress;
create trigger hr_key_ring_on_unlock after insert or update of value on public.player_progress for each row
  when (new.kind = 'unlock' and new.key = 'key_ring' and new.period_key = '' and new.value >= 1)
  execute function public.hr_key_ring_on_unlock();

-- A KEY LANDS ON THE RING: a NEW bag stack of a chest key, for a hero with a ring, moves onto it as it is written (whoever wrote it: the
-- mint, a Storage withdraw). Only an INSERT is a new stack (an upsert onto an existing stack fires UPDATE), and with a ring no key stack
-- stays in the bag, so a key always arrives as one. hr_key_ring_store's own bag row (`hr.key_ring_out`, its transaction) is let be.
create or replace function public.hr_key_ring_on_bag()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare v_q bigint;
begin
  -- KEY-RING (2027-04-27-tower-chest.sql)
  if coalesce(current_setting('hr.key_ring_out', true), '') = '1' then return null; end if;
  if not exists (select 1 from public.hr_chest_keys k where k.item_id = new.item_id) then return null; end if;
  if not public.hr_key_ring_owned(new.user_id, new.slot) then return null; end if;
  delete from public.player_inventory where user_id = new.user_id and slot = new.slot and item_id = new.item_id returning qty into v_q;
  if v_q is null or v_q <= 0 then return null; end if;
  insert into public.player_key_ring as r (user_id, slot, item_id, qty) values (new.user_id, new.slot, new.item_id, v_q)
    on conflict (user_id, slot, item_id) do update set qty = r.qty + excluded.qty, updated_at = now();
  return null;
end $fn$;
drop trigger if exists hr_key_ring_on_bag on public.player_inventory;
create trigger hr_key_ring_on_bag after insert on public.player_inventory for each row execute function public.hr_key_ring_on_bag();

-- THE RING STAYS HIDDEN WITH THE TOWER: its ownership row is refused while burning_tower is off for the account (hr_unlock_buy catches the
-- HR000 and answers feature_off; its purse debit rolls back with the grant).
create or replace function public.hr_key_ring_gate()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
begin
  -- KEY-RING (2027-04-27-tower-chest.sql)
  if not public.hr_feature_on('burning_tower', new.user_id) then
    perform public.hr_reject('feature_off', jsonb_build_object('feature', 'burning_tower', 'unlock', 'key_ring')); end if;
  return new;
end $fn$;
drop trigger if exists hr_key_ring_gate on public.player_progress;
create trigger hr_key_ring_gate before insert or update of value on public.player_progress for each row
  when (new.kind = 'unlock' and new.key = 'key_ring')
  execute function public.hr_key_ring_gate();

-- A KEY WITHDRAWN INTO A FULL BAG GOES ONTO THE RING: the bank's per-stack body, RESTATED WHOLE (2027-04-13-bank-move-many.sql's live image
-- with one condition more on its bag fuse; §0 pins it). Nothing else in it moves.
create or replace function public.hr_bank_move_stack(p_user uuid, p_slot integer, p_item text, p_qty bigint, p_dir text, p_bag_cap integer)
returns jsonb language plpgsql set search_path = public, pg_catalog as $$
declare
  v_cap    int;
  v_have   bigint;
  v_stacks int;
begin
  if p_dir = 'deposit' then
    -- ── BAG → DEPOT ─────────────────────────────────────────────────────────
    -- DEBIT the bag (this select-for-update IS the ownership check).
    select qty into v_have from public.player_inventory
      where user_id = p_user and slot = p_slot and item_id = p_item for update;
    if coalesce(v_have, 0) < p_qty then
      return jsonb_build_object('ok', false, 'error', 'insufficient_item',
        'item_id', p_item, 'have', coalesce(v_have, 0), 'need', p_qty);
    end if;
    -- THE DEPOT'S ROOM: only when this deposit adds a NEW kind to the account's room
    -- (kinds in Storage + kinds it has listed on the market, which come back here).
    -- The account's own capacity (base + storage chests), never above the fuse.
    if not public.hr_storage_room_fits(p_user, p_item) then
      v_cap := public.hr_storage_room_cap(p_user);
      v_stacks := public.hr_storage_room_used(p_user);
      return jsonb_build_object('ok', false, 'error', 'bank_full', 'cap', v_cap,
        'listed', v_stacks - (select count(*)::int from public.account_bank where user_id = p_user));
    end if;
    if v_have = p_qty then
      delete from public.player_inventory
        where user_id = p_user and slot = p_slot and item_id = p_item;
    else
      update public.player_inventory set qty = qty - p_qty
        where user_id = p_user and slot = p_slot and item_id = p_item;
    end if;
    insert into public.account_bank as b (user_id, item_id, qty, updated_at)
      values (p_user, p_item, p_qty, now())
      on conflict (user_id, item_id) do update set qty = b.qty + excluded.qty, updated_at = now();
  else
    -- ── DEPOT → BAG ─────────────────────────────────────────────────────────
    -- DEBIT the depot (ownership check: the account's own row, locked).
    select qty into v_have from public.account_bank
      where user_id = p_user and item_id = p_item for update;
    if coalesce(v_have, 0) < p_qty then
      return jsonb_build_object('ok', false, 'error', 'insufficient_bank',
        'item_id', p_item, 'have', coalesce(v_have, 0), 'need', p_qty);
    end if;
    -- BAG STACK FUSE: mirror hr_apply's bank_cap ceiling on player_inventory
    -- stacks (bank_cap is the BAG's stack cap, per character), only when this
    -- withdraw opens a NEW bag stack.
    -- KEY-RING (2027-04-27-tower-chest.sql): a chest key withdrawn by a hero who owns a Key Ring opens no bag stack (hr_key_ring_on_bag puts
    -- it on the ring as it is written), so the fuse is not asked for it; without a ring it is a bag stack like any other.
    if not exists (select 1 from public.player_inventory
                    where user_id = p_user and slot = p_slot and item_id = p_item)
       and not (exists (select 1 from public.hr_chest_keys k where k.item_id = p_item) and public.hr_key_ring_owned(p_user, p_slot)) then
      select count(*) into v_stacks from (
        select 1 from public.player_inventory
         where user_id = p_user and slot = p_slot limit p_bag_cap + 1) s;
      if v_stacks >= p_bag_cap then
        return jsonb_build_object('ok', false, 'error', 'bag_full', 'cap', p_bag_cap);
      end if;
    end if;
    if v_have = p_qty then
      delete from public.account_bank
        where user_id = p_user and item_id = p_item;
    else
      update public.account_bank set qty = qty - p_qty, updated_at = now()
        where user_id = p_user and item_id = p_item;
    end if;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (p_user, p_slot, p_item, p_qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
  end if;

  -- JOURNAL: one aggregate row per move (rule 6 — never per-tick). qty carries
  -- the BAG-side signed delta (deposit removes from bag = negative); the slot is
  -- the acting character's, meta.depot says the other side is the account's.
  insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, meta)
    values (p_user, p_slot, 'bank', 'bank_' || p_dir, p_item,
            case when p_dir = 'deposit' then -p_qty else p_qty end,
            jsonb_build_object('dir', p_dir, 'qty', p_qty, 'depot', 'account'));
  return null;
end $$;

-- THE `key_ring` SECTION (every envelope; plpgsql: the settle reads every section, tests/settle-budget.mjs SB-3). Null while the Tower is
-- off for the account (no tab, no button).
create or replace function public.hr_key_ring_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $fn$
declare v_on boolean; v_gold bigint;
begin
  -- KEY-RING (2027-04-27-tower-chest.sql)
  if not public.hr_feature_on('burning_tower', p_user) then return null; end if;
  v_on := public.hr_key_ring_owned(p_user, p_slot);
  if not v_on then select o.gold into v_gold from public.hr_unlock_offers o where o.offer_id = 'key_ring.0' and o.refusal is null; end if;
  return jsonb_build_object('unlocked', v_on,
    'offer', case when v_on or v_gold is null then null else jsonb_build_object('offer', 'key_ring.0', 'gold', v_gold) end,
    'keys', coalesce((select jsonb_agg(jsonb_build_object('item', r.item_id, 'qty', r.qty) order by r.item_id)
                        from public.player_key_ring r where r.user_id = p_user and r.slot = p_slot), '[]'::jsonb));
end $fn$;

-- The key week an instant is in: its Monday 00:00 UTC (the board: the Tower's week; every family's week).
create or replace function public.hr_chest_week_start(p_at timestamptz)
returns timestamptz language plpgsql stable set search_path = public, pg_catalog as $fn$
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  return date_trunc('week', p_at at time zone 'UTC') at time zone 'UTC';
end $fn$;

-- THE MENU'S NUMBERS, the server's own (the design's "One menu that shows all of it"). Reads only.
create or replace function public.hr_chest_section(p_user uuid, p_slot int)
returns jsonb language plpgsql stable set search_path = public, pg_catalog as $fn$
declare
  v_l public.chest_luck%rowtype; v_lk public.hr_chest_luck%rowtype; v_own text; v_cin jsonb; v_wk timestamptz; v_keys jsonb := '[]'::jsonb;
  v_k record; v_def int; v_fams int; v_kf jsonb;
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  select * into v_l from public.chest_luck where user_id = p_user and slot = p_slot;
  select * into v_lk from public.hr_chest_luck where id;
  select f.family into v_own from public.player_equipment e join public.hr_chest_weapon_families f on f.item_id = e.item_id
   where e.user_id = p_user and e.slot = p_slot and e.equip_slot = 'weapon';
  v_cin := public.hr_chest_held(p_user, p_slot, 'tower_cinders');
  v_wk := public.hr_chest_week_start(now());
  select coalesce(jsonb_agg(jsonb_build_object('family', f.key_family, 'name', f.name, 'max', f.opens_per_week, 'held_max', f.held_max,
           'opened', (select count(*) from public.chest_opens o where o.user_id = p_user and o.slot = p_slot and o.key_family = f.key_family
                                                                   and o.at >= v_wk)::int,
           'held', public.hr_chest_family_held(p_user, p_slot, f.key_family)) order by f.key_family), '[]'::jsonb)
    into v_kf from public.hr_chest_key_families f;
  select count(*) into v_fams from public.hr_chest_families;
  for v_k in select * from public.hr_chest_keys order by key_family, from_landing loop
    v_def := coalesce((v_l.stokes ->> v_k.key_id)::int, 0);
    v_keys := v_keys || jsonb_build_array(jsonb_build_object(
      'key', v_k.key_id, 'family', v_k.key_family, 'item', v_k.item_id, 'name', v_k.name, 'from', v_k.from_landing, 'skill_plus', v_k.skill_plus,
      'held', public.hr_chest_held(p_user, p_slot, v_k.item_id), 'base_pm', v_k.weapon_pm,
      'chance_ppm', public.hr_chest_chance_ppm(v_k.weapon_pm, coalesce(v_l.dry, 0), v_def), 'stokes_default', v_def,
      'stokes', coalesce((select jsonb_agg(jsonb_build_object('n', s.stokes, 'pm', s.pm, 'cost', s.keys * v_k.cinders) order by s.stokes)
                            from public.hr_chest_stokes s), '[]'::jsonb),
      'inside', jsonb_build_object('tower_cinders', v_k.cinders) || jsonb_build_object(v_k.salts_item, v_k.salts_qty)
                || jsonb_build_object(v_k.food_item, v_k.food_qty),
      'ready', (select count(*) from public.hr_chest_weapons w where w.key_id = v_k.key_id) = v_fams,
      -- the super-rare outfits this key can find and their chance (permille), in the order the open stacks them
      'outfits', coalesce((select jsonb_agg(jsonb_build_object('outfit', o.outfit_id, 'item', o.item_id, 'pm', o.pm) order by o.outfit_id collate "C")
                             from public.hr_chest_outfits o where o.key_id = v_k.key_id), '[]'::jsonb)));
  end loop;
  return jsonb_build_object('on', public.hr_feature_on('burning_tower', p_user), 'dry', coalesce(v_l.dry, 0), 'opens', coalesce(v_l.opens, 0),
    'warmth_pm', 1000 + least(coalesce(v_l.dry, 0)::bigint * v_lk.warmth_step_pm, v_lk.warmth_cap_pm - 1000),
    'per_call', v_lk.per_call, 'own_pm', v_lk.own_pm, 'own_family', v_own, 'week_ends', v_wk + interval '7 days', 'families', v_kf,
    'cinders', v_cin, 'keys', v_keys);
end $fn$;

-- THE MINT: every landing a climb clears is a Tower key in that hero's bag, once a run, unless the hero already holds the family's held_max.
-- A trigger on tower_runs' top floor, which only hr_tower_write moves (inside the settle, under the character's lock and the run row's) and
-- only ever up: the landings in (old top, new top] are exactly the ones this window cleared. No weekly earn cap (Tyler 2026-11-16).
create or replace function public.hr_tower_key_mint()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_family constant text := 'tower';
  v_every int; v_f public.hr_chest_key_families%rowtype; v_k public.hr_chest_keys%rowtype; v_l int; v_held bigint;
begin
  -- TOWER-CHEST (2027-04-27-tower-chest.sql)
  select r.landing_every into v_every from public.hr_tower_rules r where r.id;
  select * into v_f from public.hr_chest_key_families f where f.key_family = c_family;
  if v_every is null or v_f.key_family is null then
    perform public.hr_reject('catalogue_missing', jsonb_build_object('what', 'tower_key_family')); end if;
  for v_l in select f from generate_series(coalesce(old.top_floor, new.start_floor - 1) + 1, new.top_floor) f where f % v_every = 0 order by f loop
    select * into v_k from public.hr_chest_keys k where k.key_family = c_family and k.from_landing <= v_l order by k.from_landing desc limit 1;
    continue when v_k.key_id is null;
    v_held := public.hr_chest_family_held(new.user_id, new.slot, c_family);
    if v_held >= v_f.held_max then
      -- AT THE LIMIT: no key drops; the skip is journalled (no item, no value) so the hero's ledger says why.
      insert into public.player_ledger (user_id, slot, kind, intent, session_id, meta)
        values (new.user_id, new.slot, 'hunt', 'tower_key_withheld', new.session_id,
                jsonb_build_object('reason', 'tower_key_withheld', 'key', v_k.key_id, 'family', c_family, 'landing', v_l, 'held', v_held,
                                   'max', v_f.held_max, 'session', new.session_id));
      continue;
    end if;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty) values (new.user_id, new.slot, v_k.item_id, 1)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + 1;
    insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, session_id, meta)
      values (new.user_id, new.slot, 'hunt', 'tower_key', v_k.item_id, 1, 0, 0, 0, 1, new.session_id,
              jsonb_build_object('reason', 'tower_key', 'key', v_k.key_id, 'family', c_family, 'landing', v_l, 'held', v_held + 1,
                                 'session', new.session_id));
  end loop;
  return null;
end $fn$;
drop trigger if exists hr_tower_key_mint on public.tower_runs;
create trigger hr_tower_key_mint after update of top_floor on public.tower_runs for each row
  when (new.top_floor is not null and new.top_floor > coalesce(old.top_floor, new.start_floor - 1))
  execute function public.hr_tower_key_mint();

-- ── §3 THE VERBS ─────────────────────────────────────────────────────────────
create or replace function public.hr_chest_open(p_slot int, p_chest text, p_key text, p_count int, p_stokes int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'chest_open';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_s public.hunt_sessions%rowtype; v_settle jsonb;
  v_k public.hr_chest_keys%rowtype; v_lk public.hr_chest_luck%rowtype; v_l public.chest_luck%rowtype; v_f public.hr_chest_key_families%rowtype;
  v_fams text[]; v_own text; v_week int; v_keys jsonb; v_cin jsonb; v_cin_have bigint; v_held bigint;
  v_stacks int; v_cap int; v_new int; v_want int; v_st int; v_cost bigint; v_spent bigint := 0; v_paid bigint := 0;
  v_dry int; v_n bigint; v_chance int; v_roll jsonb; v_weapon text; v_opens jsonb := '[]'::jsonb; v_haul jsonb := '{}'::jsonb;
  v_take jsonb; v_a jsonb; v_out jsonb; i int; v_it record; v_ring bigint; v_rest bigint; v_need jsonb;
  v_oroll int; v_cum int; v_orow record; v_outfit text; v_bundle text; v_finds jsonb := '[]'::jsonb; v_find jsonb;
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
  -- THE WEEK, from the append-only chest_opens: the keys of this key's FAMILY this hero used since Monday 00:00 UTC (Tyler 2026-11-16: six
  -- chests opened a family a hero a week). A key whose family has no row opens nothing (0).
  select * into v_f from public.hr_chest_key_families f where f.key_family = v_k.key_family;
  v_week := (select count(*) from public.chest_opens o where o.user_id = v_uid and o.slot = p_slot and o.key_family = v_k.key_family
                                                        and o.at >= public.hr_chest_week_start(now()))::int;
  if v_week + p_count > coalesce(v_f.opens_per_week, 0) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'week_limit', 'family', v_k.key_family,
                                                                       'used', v_week, 'limit', coalesce(v_f.opens_per_week, 0))); end if;
  -- THE KEYS: the Key Ring, then the bag, then Storage.
  v_keys := public.hr_chest_held(v_uid, p_slot, v_k.item_id);
  v_held := (v_keys->>'bag')::bigint + (v_keys->>'storage')::bigint + (v_keys->>'ring')::bigint;
  v_ring := least((v_keys->>'ring')::bigint, p_count);
  v_rest := p_count - v_ring;
  if v_held < p_count then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_key', 'have', v_held, 'need', p_count)); end if;
  -- THE BAG, BEFORE ANY ROLL: the worst case of the press must fit (every haul item the bag doesn't hold, a weapon a family it could roll,
  -- an outfit bundle it could find and the bag lacks, less the key's stack the press empties), so no refusal ever follows a roll and says
  -- what a key found.
  select count(*)::int into v_stacks from public.player_inventory where user_id = v_uid and slot = p_slot;
  select bank_cap into v_cap from public.player_state where user_id = v_uid and slot = p_slot;
  v_new := (select count(*) from (values ('tower_cinders'), (v_k.salts_item), (v_k.food_item)) h(item)
             where not exists (select 1 from public.player_inventory i where i.user_id = v_uid and i.slot = p_slot and i.item_id = h.item))::int
           + least(p_count, cardinality(v_fams))
           + least(p_count, (select count(*) from public.hr_chest_outfits o where o.key_id = v_k.key_id
                              and not exists (select 1 from public.player_inventory i where i.user_id = v_uid and i.slot = p_slot and i.item_id = o.item_id))::int)
           - case when (v_keys->>'bag')::bigint between 1 and v_rest then 1 else 0 end;
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
      -- THE SUPER-RARE OUTFIT: one more roll on the key's own outfit stream; the key's outfit rows stacked in outfit order, each pm x 1000
      -- of the million (at most one a key). A find pays its bundle, never a weapon's odds.
      v_outfit := null; v_bundle := null; v_cum := 0;
      v_oroll := public.hr_chest_outfit_roll(v_uid, p_slot, v_n);
      for v_orow in select o.outfit_id, o.item_id, o.pm from public.hr_chest_outfits o where o.key_id = v_k.key_id order by o.outfit_id collate "C" loop
        v_cum := v_cum + v_orow.pm * 1000;
        if v_oroll < v_cum then v_outfit := v_orow.outfit_id; v_bundle := v_orow.item_id; exit; end if;
      end loop;
      if v_bundle is not null then
        v_haul := jsonb_set(v_haul, array[v_bundle], to_jsonb(coalesce((v_haul->>v_bundle)::bigint, 0) + 1));
        v_finds := v_finds || jsonb_build_array(jsonb_build_object('n', v_n, 'bundle', v_bundle));
      end if;
      insert into public.chest_opens (user_id, slot, n, chest_id, key_id, key_family, stokes, cinders_spent, dry, chance_ppm, roll, family, weapon,
                                      outfit_roll, outfit, intent_id)
        values (v_uid, p_slot, v_n, p_chest, v_k.key_id, v_k.key_family, v_st, v_cost, v_dry, v_chance, (v_roll->>'roll')::int,
                case when v_weapon is null then null else v_roll->>'family' end, v_weapon, v_oroll, v_outfit, p_idem);
      v_opens := v_opens || jsonb_build_array(jsonb_build_object('n', v_n, 'stokes', v_st, 'chance_ppm', v_chance, 'weapon', v_weapon,
                                                                 'family', case when v_weapon is null then null else v_roll->>'family' end,
                                                                 'outfit', v_outfit, 'bundle', v_bundle));
      v_dry := case when v_weapon is null then v_dry + 1 else 0 end;
      v_paid := v_paid + v_k.cinders;
    end loop;
    -- THE TAKE: the keys (the Key Ring first, then the bag, then Storage), and the Cinders the stokes spent over what the press paid out (the
    -- bag first, then Storage). One ledger row an item.
    if v_ring > 0 then
      delete from public.player_key_ring where user_id = v_uid and slot = p_slot and item_id = v_k.item_id and qty <= v_ring;
      update public.player_key_ring set qty = qty - v_ring, updated_at = now() where user_id = v_uid and slot = p_slot and item_id = v_k.item_id;
    end if;
    v_need := case when v_rest > 0 then jsonb_build_object(v_k.item_id, v_rest) else '{}'::jsonb end
              || case when v_spent > v_paid then jsonb_build_object('tower_cinders', v_spent - v_paid) else '{}'::jsonb end;
    v_take := case when v_need = '{}'::jsonb then jsonb_build_object('ok', true, 'from', '{}'::jsonb)
                   else public.hr_materials_take(v_uid, p_slot, v_need, true) end;
    if coalesce(v_take->>'ok', 'false') <> 'true' then
      raise exception using errcode = 'HR001', message = (v_take || jsonb_build_object('ok', false))::text; end if;
    for v_it in select t.key as item, (coalesce((v_take #>> array['from', 'bag', t.key])::bigint, 0)) as bag,
                       (coalesce((v_take #>> array['from', 'storage', t.key])::bigint, 0)) as sto,
                       case when t.key = v_k.item_id then v_ring else 0 end as ring
                  from jsonb_each(v_need || case when v_ring > 0 then jsonb_build_object(v_k.item_id, 1) else '{}'::jsonb end) t loop
      insert into public.player_ledger (user_id, slot, kind, intent, item_id, qty, gold, meta)
        values (v_uid, p_slot, 'hunt', v_verb, v_it.item, -(v_it.bag + v_it.sto + v_it.ring), 0,
                jsonb_build_object('reason', c_verb, 'took', jsonb_build_object('bag', v_it.bag, 'storage', v_it.sto, 'ring', v_it.ring)));
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
                                                                      'took', coalesce(v_take->'from', '{}'::jsonb) || jsonb_build_object('ring', v_ring)))));
    if coalesce(v_a->>'ok', 'false') <> 'true' then
      raise exception using errcode = 'HR001', message = (v_a || jsonb_build_object('ok', false))::text; end if;
    update public.chest_luck set dry = v_dry, opens = opens + p_count, updated_at = now() where user_id = v_uid and slot = p_slot;
    -- THE CALL-OUT (the board's "super-rare drop moments"): each outfit found is told to every chat tab on the System channel, from the
    -- finder (hr_chat_name_authority stamps the hero's own name), with the key's number; never for a quiet hero; never counted by the
    -- rare-drop daily cap. Inside the press's transaction: a press that rolls back posts nothing.
    if jsonb_array_length(v_finds) > 0
       and not coalesce((select ps.presence_quiet from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot), false) then
      for v_find in select value from jsonb_array_elements(v_finds) loop
        insert into public.chat_messages (id, channel, from_id, from_name, from_slot, body)
          values (gen_random_uuid(), 'system', v_uid, 'Adventurer', p_slot,
                  'found the [[item:' || (v_find->>'bundle') || ']] in the Hearth Chest (' || v_k.name || ')');
      end loop;
    end if;
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

-- RING KEYS INTO STORAGE (lane/c-key-ring): the bank's own deposit of the stack, so the room check and the bank_deposit ledger row are its.
create or replace function public.hr_key_ring_store(p_slot int, p_item text, p_qty int, p_idem uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $fn$
declare
  c_verb constant text := 'key_ring_store';
  v_uid uuid := auth.uid(); v_r jsonb; v_verb text; v_ver bigint; v_cap int; v_have bigint; v_settle jsonb;
begin
  -- KEY-RING (2027-04-27-tower-chest.sql)
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_slot')); end if;
  if p_idem is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_idem')); end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000000 then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_qty')); end if;
  if not exists (select 1 from public.hr_chest_keys k where k.item_id = p_item) then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'bad_key')); end if;
  v_verb := c_verb || ':' || p_item || ':' || p_qty;
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  if not public.hr_rpc_gate('bank_move') then return jsonb_build_object('ok', false, 'error', 'rate_limited'); end if;
  v_settle := public.hr_settle_first_of(v_uid, p_slot);
  if v_settle is not null then return public.hr_note_rejection(c_verb, p_slot, v_settle); end if;
  -- THE HERO, THEN THE DEPOT (the bank's order), THEN THE RING'S ROW
  perform public.hr_hunt_lock(v_uid, p_slot);
  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);
  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;
  select version, bank_cap into v_ver, v_cap from public.player_state where user_id = v_uid and slot = p_slot;
  if v_ver is null then return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_character')); end if;
  perform pg_advisory_xact_lock(hashtextextended('hr:depot:' || v_uid::text, 0));
  select qty into v_have from public.player_key_ring where user_id = v_uid and slot = p_slot and item_id = p_item for update;
  if coalesce(v_have, 0) < p_qty then
    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'insufficient_item', 'item_id', p_item,
                                                                       'have', coalesce(v_have, 0), 'need', p_qty)); end if;
  begin
    -- off the ring and through the bag for this statement's length only: the deposit is the bank's (hr_bank_move_stack), whole
    perform set_config('hr.key_ring_out', '1', true);
    delete from public.player_key_ring where user_id = v_uid and slot = p_slot and item_id = p_item and qty <= p_qty;
    update public.player_key_ring set qty = qty - p_qty, updated_at = now() where user_id = v_uid and slot = p_slot and item_id = p_item;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty) values (v_uid, p_slot, p_item, p_qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;
    v_r := public.hr_bank_move_stack(v_uid, p_slot, p_item, p_qty, 'deposit', v_cap);
    perform set_config('hr.key_ring_out', '', true);
    if v_r is not null then raise exception using errcode = 'HR001', message = v_r::text; end if;
  exception when sqlstate 'HR001' then
    perform set_config('hr.key_ring_out', '', true);
    return public.hr_note_rejection(c_verb, p_slot, sqlerrm::jsonb);
  end;
  update public.player_state set version = v_ver + 1, updated_at = now() where user_id = v_uid and slot = p_slot;
  v_r := jsonb_build_object('ok', true, 'item', p_item, 'qty', p_qty, 'version', v_ver + 1);
  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, p_slot, v_verb, v_r, now()) on conflict (user_id, intent_id) do nothing;
  return v_r;
end $fn$;

-- ── §4 PRIVILEGES: the verbs the signed-in client's alone, every helper the owner's ──
revoke all on function public.hr_chest_chance_ppm(int, int, int) from public, anon, authenticated, service_role;
revoke all on function public.hr_chest_roll(uuid, int, bigint, int, text, text[]) from public, anon, authenticated, service_role;
revoke all on function public.hr_chest_outfit_roll(uuid, int, bigint) from public, anon, authenticated, service_role;
revoke all on function public.hr_chest_held(uuid, int, text) from public, anon, authenticated, service_role;
revoke all on function public.hr_chest_family_held(uuid, int, text) from public, anon, authenticated, service_role;
revoke all on function public.hr_chest_week_start(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.hr_key_ring_owned(uuid, int) from public, anon, authenticated, service_role;
revoke all on function public.hr_key_ring_sweep(uuid, int) from public, anon, authenticated, service_role;
revoke all on function public.hr_key_ring_on_unlock() from public, anon, authenticated, service_role;
revoke all on function public.hr_key_ring_on_bag() from public, anon, authenticated, service_role;
revoke all on function public.hr_key_ring_gate() from public, anon, authenticated, service_role;
revoke all on function public.hr_key_ring_section(uuid, int) from public, anon, authenticated, service_role;
do $mig$ begin
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    revoke all on function public.hr_key_ring_section(uuid, int) from hr_engine;
  end if;
end $mig$;
revoke execute on function public.hr_key_ring_store(int, text, int, uuid) from public;
revoke execute on function public.hr_key_ring_store(int, text, int, uuid) from anon, service_role;
grant  execute on function public.hr_key_ring_store(int, text, int, uuid) to authenticated;
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
delete from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_chest_open', 'hr_chest_stoke_default', 'hr_key_ring_store')
  and (proname, identity_args) not in (('hr_chest_open', 'p_slot integer, p_chest text, p_key text, p_count integer, p_stokes integer, p_idem uuid'),
                                        ('hr_chest_stoke_default', 'p_slot integer, p_key text, p_stokes integer, p_idem uuid'),
                                        ('hr_key_ring_store', 'p_slot integer, p_item text, p_qty integer, p_idem uuid'));
insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
  ('hr_chest_open', 'p_slot integer, p_chest text, p_key text, p_count integer, p_stokes integer, p_idem uuid', 'authenticated',
   'added 2027-04-27 (lane/c-tower-chest): MONEY (a server roll that pays items; a weapon that will trade) - uses Burning Tower keys at the Hearth Chest, the stokes priced and the chance worked out by the server, rolled on hr_seed; behind the switch burning_tower (feature_off) and chest_not_ready; pre-EA Security list'),
  ('hr_chest_stoke_default', 'p_slot integer, p_key text, p_stokes integer, p_idem uuid', 'authenticated',
   'added 2027-04-27 (lane/c-tower-chest): the hero''s own default stoke count for one kind of key; moves no value'),
  ('hr_key_ring_store', 'p_slot integer, p_item text, p_qty integer, p_idem uuid', 'authenticated',
   'added 2027-04-27 (lane/c-key-ring): ITEMS (bound keys, value 0) - moves this hero''s Key Ring keys into its own account''s Storage through the bank''s deposit (hr_bank_move_stack); never another account''s')
on conflict (proname, identity_args, grantee) do update set note = excluded.note;
insert into public.hr_state_sections (key, fn, note) values
  ('key_ring', 'hr_key_ring_section', '2027-04-27-tower-chest.sql (lane/c-key-ring): this hero''s Key Ring: owned or its price, and its keys; null while the Tower is off for the account')
  on conflict (key) do update set fn = excluded.fn, note = excluded.note;
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
  v        jsonb; v2 jsonb; v_sig text; v_role text; t text; v_sid uuid; v_sid2 uuid; v_sid3 uuid; v_fam record; v_w text;
  v_stacks bigint; v_keys bigint; v_sid4 uuid; v_hit bigint; v_lines bigint;
  v_weapons constant bigint := (select count(*) from public.hr_chest_weapons);
begin
  -- (a) PRIVILEGES AND SHAPE: every helper the owner's alone; the verbs the signed-in client's alone and on the baseline; the tables
  --     readable by their owner and written by no client; the mint's trigger on tower_runs.
  foreach v_sig in array array['public.hr_chest_chance_ppm(integer,integer,integer)', 'public.hr_chest_roll(uuid,integer,bigint,integer,text,text[])',
                               'public.hr_chest_outfit_roll(uuid,integer,bigint)', 'public.hr_chest_held(uuid,integer,text)', 'public.hr_chest_family_held(uuid,integer,text)',
                               'public.hr_chest_week_start(timestamp with time zone)', 'public.hr_chest_section(uuid,integer)', 'public.hr_tower_key_mint()',
                               'public.hr_key_ring_owned(uuid,integer)', 'public.hr_key_ring_sweep(uuid,integer)', 'public.hr_key_ring_on_unlock()',
                               'public.hr_key_ring_on_bag()', 'public.hr_key_ring_section(uuid,integer)',
                               'public.hr_chest_opens_immutable()'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_sig, 'execute') then raise exception 'tower-chest §9(a): % can execute %', v_role, v_sig; end if;
    end loop;
  end loop;
  foreach v_sig in array array['public.hr_chest_open(integer,text,text,integer,integer,uuid)', 'public.hr_chest_stoke_default(integer,text,integer,uuid)',
                               'public.hr_key_ring_store(integer,text,integer,uuid)'] loop
    if not has_function_privilege('authenticated', v_sig, 'execute') or has_function_privilege('anon', v_sig, 'execute')
       or has_function_privilege('service_role', v_sig, 'execute') then
      raise exception 'tower-chest §9(a): % is not the signed-in client''s alone', v_sig; end if;
  end loop;
  if (select count(*) from public.hr_client_rpc_baseline where grantee = 'authenticated' and proname in ('hr_chest_open', 'hr_chest_stoke_default', 'hr_key_ring_store')) <> 3 then
    raise exception 'tower-chest §9(a): a verb is not on the client baseline'; end if;
  foreach t in array array['chest_luck', 'chest_opens', 'player_key_ring'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then raise exception 'tower-chest §9(a): % has no RLS', t; end if;
    if has_table_privilege('authenticated', 'public.' || t, 'insert,update,delete') or has_table_privilege('anon', 'public.' || t, 'select')
       or has_table_privilege('service_role', 'public.' || t, 'insert,update,delete') then
      raise exception 'tower-chest §9(a): a client can write % (or anon read it)', t; end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd <> 'SELECT') then
      raise exception 'tower-chest §9(a): % has a client write policy', t; end if;
  end loop;
  if (select count(*) from pg_trigger where tgname = 'hr_tower_key_mint' and not tgisinternal) <> 1
     or not exists (select 1 from pg_trigger where tgname = 'hr_tower_key_mint' and tgrelid = 'public.tower_runs'::regclass and not tgisinternal) then
    raise exception 'tower-chest §9(a): the mint is not on tower_runs alone'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'hr_chest_opens_immutable' and tgrelid = 'public.chest_opens'::regclass and not tgisinternal) then
    raise exception 'tower-chest §9(a): chest_opens is not append-only'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'hr_key_ring_on_bag' and tgrelid = 'public.player_inventory'::regclass and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgname = 'hr_key_ring_on_unlock' and tgrelid = 'public.player_progress'::regclass and not tgisinternal)
     or not exists (select 1 from pg_trigger where tgname = 'hr_key_ring_gate' and tgrelid = 'public.player_progress'::regclass and not tgisinternal)
     or strpos(pg_get_functiondef('public.hr_bank_move_stack(uuid,integer,text,bigint,text,integer)'::regprocedure), 'hr_key_ring_owned(p_user, p_slot)') = 0
     or (select fn from public.hr_state_sections where key = 'key_ring') is distinct from 'hr_key_ring_section' then
    raise exception 'tower-chest §9(a): the Key Ring''s triggers or its section are missing'; end if;
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
  if exists (select 1 from public.hr_chest_keys where key_family <> 'tower')
     or (select opens_per_week from public.hr_chest_key_families where key_family = 'tower') is distinct from 6 then
    raise exception 'tower-chest §9(b): the Tower''s keys are not one family opening six a week (Tyler 2026-11-16)'; end if;
  if public.hr_chest_week_start('2026-11-18 13:00+00'::timestamptz) <> '2026-11-16 00:00+00'::timestamptz
     or public.hr_chest_week_start('2026-11-16 00:00+00'::timestamptz) <> '2026-11-16 00:00+00'::timestamptz
     or public.hr_chest_week_start('2026-11-15 23:59:59+00'::timestamptz) <> '2026-11-09 00:00+00'::timestamptz then
    raise exception 'tower-chest §9(b): the key week does not start Monday 00:00 UTC'; end if;
  -- (c) THE MINT AND THE OPEN on a real hero (both doors of the climb's settle are tests/tower-chest.mjs TCH-MINT).
  begin
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, 'Probe Chest') on conflict (id) do update set display_name = excluded.display_name;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'tower-chest §9 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-chest §9(c): hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = v_u and slot = 0;
    -- THE MINT, on the climb's own row (hr_tower_write's write): a run from floor 1 to 40 in two windows clears landings 10, 20 and 30 (Bronze)
    -- and 40 (Silver); a window that raises no floor mints nothing; a second run from 121 to 130 is a Platinum (the family's top row open-ended)
    v_sid := gen_random_uuid(); v_sid2 := gen_random_uuid(); v_sid3 := gen_random_uuid();
    insert into public.tower_runs (session_id, user_id, slot, instance_id, start_floor) values (v_sid, v_u, 0, gen_random_uuid(), 1);
    update public.tower_runs set top_floor = 25, floors = 25 where session_id = v_sid;
    update public.tower_runs set top_floor = 40, floors = 40 where session_id = v_sid;
    update public.tower_runs set top_floor = 40, floors = 40, kills = kills + 5 where session_id = v_sid;
    insert into public.tower_runs (session_id, user_id, slot, instance_id, start_floor) values (v_sid2, v_u, 0, gen_random_uuid(), 121);
    update public.tower_runs set top_floor = 130, floors = 10 where session_id = v_sid2;
    if (select string_agg(item_id || '=' || qty, ',' order by item_id) from public.player_inventory where user_id = v_u and slot = 0 and item_id like 'tower\_key\_%')
       is distinct from 'tower_key_bronze=3,tower_key_platinum=1,tower_key_silver=1' then
      raise exception 'tower-chest §9(c): the mint gave %', (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = v_u and item_id like 'tower\_key\_%'); end if;
    if (select count(*) from public.player_ledger where user_id = v_u and intent = 'tower_key' and qty = 1 and session_id in (v_sid, v_sid2)) <> 5 then
      raise exception 'tower-chest §9(c): the mint did not journal one row a key'; end if;
    -- NO WEEKLY EARN CAP, AND THE HELD LIMIT: 24 Gold Keys in the account's Storage make 29 held; a third run over landings 10 and 20 again
    -- drops 10's Bronze (30 held) and withholds 20's (a journal row, no item)
    insert into public.account_bank (user_id, item_id, qty) values (v_u, 'tower_key_gold', 24) on conflict (user_id, item_id) do update set qty = 24;
    insert into public.tower_runs (session_id, user_id, slot, instance_id, start_floor) values (v_sid3, v_u, 0, gen_random_uuid(), 1);
    update public.tower_runs set top_floor = 20, floors = 20 where session_id = v_sid3;
    if (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'tower_key_bronze') <> 4
       or public.hr_chest_family_held(v_u, 0, 'tower') <> 30
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'tower_key' and session_id = v_sid3) <> 1
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'tower_key_withheld' and session_id = v_sid3 and item_id is null
             and (meta->>'landing')::int = 20 and (meta->>'held')::int = 30 and (meta->>'max')::int = 30) <> 1 then
      raise exception 'tower-chest §9(c): the held limit let % through (held %)',
        (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = v_u and item_id like 'tower\_key\_%'), public.hr_chest_family_held(v_u, 0, 'tower'); end if;
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
    -- a key short of its seven: chest_not_ready, the key kept (the Bronze Key's own rows taken away for the probe, rolled back with it)
    delete from public.hr_chest_weapons where key_id = 'bronze';
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '00000008')::uuid);
    if v->>'error' is distinct from 'chest_not_ready'
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'tower_key_bronze') <> 4 then
      raise exception 'tower-chest §9(c): a key with no weapons answered % (or was taken)', v; end if;
    -- seven stand-in weapons for the Bronze Key (rolled back with the probe), none another key already names (an item is one key's): the
    -- open plays
    for v_fam in select family from public.hr_chest_families order by ord loop
      select w.item_id into v_w from public.hr_chest_weapon_families w where w.family = v_fam.family
        and not exists (select 1 from public.hr_chest_weapons x where x.item_id = w.item_id) order by w.item_id limit 1;
      insert into public.hr_chest_weapons (key_id, family, item_id) values ('bronze', v_fam.family, v_w) on conflict do nothing;
    end loop;
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 5, 0, (k || '00000009')::uuid);
    if v->>'error' is distinct from 'no_key' or (v->>'have')::int <> 4 then raise exception 'tower-chest §9(c): five keys from four answered %', v; end if;
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '0000000a')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (v->'haul'->>'tower_cinders')::int <> 50 or (v->'haul'->>'temper_salts')::int <> 15
       or (v->'haul'->>'cooked_shrimp')::int < 20 or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'tower_key_bronze') <> 3
       or (select count(*) from public.chest_opens where user_id = v_u and slot = 0 and n = 1 and chance_ppm = 160000 and dry = 0 and key_family = 'tower') <> 1
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
    -- THE WEEK (six a family a hero, from chest_opens): one used, four more this week, three last week and six of another family this week
    -- make five that count; the sixth opens, the seventh is week_limit and moves nothing
    insert into public.chest_opens (user_id, slot, n, chest_id, key_id, key_family, stokes, cinders_spent, dry, chance_ppm, roll, intent_id, at)
      select v_u, 0, 1000 + g, 'great_hearth', 'bronze', case when g > 20 then 'catacomb' else 'tower' end, 0, 0, 0, 0, 999999, gen_random_uuid(),
             case when g between 11 and 13 then now() - interval '8 days' else now() end
        from generate_series(1, 26) g where g <= 4 or g between 11 and 13 or g > 20;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '0000000b')::uuid);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'tower-chest §9(c): the sixth key of the week answered %', v; end if;
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '0000000d')::uuid);
    if v->>'error' is distinct from 'week_limit' or v->>'family' is distinct from 'tower' or (v->>'used')::int <> 6 or (v->>'limit')::int <> 6
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = 'tower_key_bronze') <> 2
       or (select opens from public.chest_luck where user_id = v_u and slot = 0) <> 2 then
      raise exception 'tower-chest §9(c): the seventh key of the week answered % (or moved)', v; end if;
    -- (d) THE KEY RING (lane/c-key-ring): bought (the ownership row hr_unlock_buy writes), the bag's keys go onto it in one journalled sort;
    --     a new key lands on it and takes no bag slot; the held count still counts it; ring keys go into Storage through the bank's deposit
    if public.hr_key_ring_section(v_u, 0)->>'unlocked' is distinct from 'false' then raise exception 'tower-chest §9(d): a hero owns a ring unbought'; end if;
    v_stacks := (select count(*) from public.player_inventory where user_id = v_u and slot = 0);
    v_keys := (select coalesce(sum(i.qty), 0) from public.player_inventory i join public.hr_chest_keys ck on ck.item_id = i.item_id where i.user_id = v_u and i.slot = 0);
    -- the Tower hidden: no ring can be stored (hr_unlock_buy answers feature_off, the purse untouched: tests/tower-chest.mjs TCH-RING)
    update public.hr_feature_switches set scope = 'off' where switch_id = 'burning_tower';
    begin
      insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values (v_u, 0, 'unlock', 'key_ring', '', 1, now());
      raise exception 'tower-chest §9(d): a ring was stored while the Tower was hidden';
    exception when sqlstate 'HR000' then
      if sqlerrm <> 'feature_off' then raise; end if;
    end;
    update public.hr_feature_switches set scope = 'accounts', accounts = array[v_u] where switch_id = 'burning_tower';
    insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values (v_u, 0, 'unlock', 'key_ring', '', 1, now());
    if exists (select 1 from public.player_inventory i join public.hr_chest_keys ck on ck.item_id = i.item_id where i.user_id = v_u and i.slot = 0)
       or (select coalesce(sum(qty), 0) from public.player_key_ring where user_id = v_u and slot = 0) <> v_keys or v_keys < 1
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'key_ring_sort' and (meta->>'moved')::bigint = v_keys) <> 1 then
      raise exception 'tower-chest §9(d): the purchase did not sort % bag keys onto the ring', v_keys; end if;
    v_stacks := (select count(*) from public.player_inventory where user_id = v_u and slot = 0);
    v_keys := public.hr_chest_family_held(v_u, 0, 'tower');
    v_sid4 := gen_random_uuid();
    insert into public.tower_runs (session_id, user_id, slot, instance_id, start_floor) values (v_sid4, v_u, 0, gen_random_uuid(), 1);
    update public.tower_runs set top_floor = 10, floors = 10 where session_id = v_sid4;
    if (select count(*) from public.player_inventory where user_id = v_u and slot = 0) <> v_stacks
       or not exists (select 1 from public.player_key_ring where user_id = v_u and slot = 0 and item_id = 'tower_key_bronze')
       or public.hr_chest_family_held(v_u, 0, 'tower') <> v_keys + 1 then
      raise exception 'tower-chest §9(d): a key minted with a ring took a bag slot or missed the ring (held % -> %)', v_keys, public.hr_chest_family_held(v_u, 0, 'tower'); end if;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_key_ring_store(0, 'tower_key_platinum', 1, (k || '0000000e')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or exists (select 1 from public.player_key_ring where user_id = v_u and item_id = 'tower_key_platinum')
       or (select qty from public.account_bank where user_id = v_u and item_id = 'tower_key_platinum') is distinct from 1
       or exists (select 1 from public.player_inventory where user_id = v_u and item_id = 'tower_key_platinum')
       or (select count(*) from public.player_ledger where user_id = v_u and intent = 'bank_deposit' and item_id = 'tower_key_platinum') <> 1 then
      raise exception 'tower-chest §9(d): a ring key into Storage answered %', v; end if;
    if (public.hr_key_ring_store(0, 'tower_key_platinum', 1, (k || '0000000f')::uuid))->>'error' is distinct from 'insufficient_item'
       or (public.hr_key_ring_store(0, 'tower_cinders', 1, (k || '00000010')::uuid))->>'error' is distinct from 'bad_key' then
      raise exception 'tower-chest §9(d): a ring key it lacks, or no key at all, went to Storage'; end if;
    if public.hr_key_ring_section(v_u, 0)->>'unlocked' is distinct from 'true' or jsonb_array_length(public.hr_key_ring_section(v_u, 0)->'keys') < 1 then
      raise exception 'tower-chest §9(d): the section reads %', public.hr_key_ring_section(v_u, 0); end if;
    -- the default stoke: saved, read back
    v := public.hr_chest_stoke_default(0, 'silver', 2, (k || '0000000c')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or (select stokes->>'silver' from public.chest_luck where user_id = v_u and slot = 0) is distinct from '2' then
      raise exception 'tower-chest §9(c): the default stoke answered %', v; end if;
    -- (e) THE SUPER-RARE OUTFIT (lane/c-sweeps-coat-drop): the hero's next key set to the first index past 100,000 whose outfit roll finds
    --     the Bronze Key's first outfit (the week lifted for the probe): one key pays its bundle into the bag, records the outfit and its roll
    --     on the key's row, and posts ONE System line from the hero naming the key's metal; the next find, the hero quiet, posts none
    select o.outfit_id, o.item_id, o.pm into v_fam from public.hr_chest_outfits o where o.key_id = 'bronze' order by o.outfit_id collate "C" limit 1;
    if v_fam.item_id is null then raise exception 'tower-chest §9(e) CANNOT RUN: the Bronze Key finds no outfit'; end if;
    update public.hr_chest_key_families set opens_per_week = 1000, held_max = 1000 where key_family = 'tower';
    v_hit := 100000;
    loop v_hit := v_hit + 1; exit when public.hr_chest_outfit_roll(v_u, 0, v_hit) < v_fam.pm * 1000 or v_hit > 400000; end loop;
    update public.chest_luck set opens = v_hit - 1 where user_id = v_u and slot = 0;
    v_lines := (select count(*) from public.chat_messages where from_id = v_u and channel = 'system');
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '00000011')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v #>> '{opens,0,outfit}' is distinct from v_fam.outfit_id or v #>> '{opens,0,bundle}' is distinct from v_fam.item_id
       or (v->'haul'->>v_fam.item_id)::int is distinct from 1
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_fam.item_id) is distinct from 1
       or (select count(*) from public.chest_opens where user_id = v_u and slot = 0 and n = v_hit and outfit = v_fam.outfit_id
             and outfit_roll < v_fam.pm * 1000) <> 1
       or (select count(*) from public.chat_messages where from_id = v_u and from_slot = 0 and channel = 'system'
             and body = 'found the [[item:' || v_fam.item_id || ']] in the Hearth Chest (' || (select k2.name from public.hr_chest_keys k2 where k2.key_id = 'bronze') || ')') <> 1
       or (select count(*) from public.chat_messages where from_id = v_u and channel = 'system') <> v_lines + 1 then
      raise exception 'tower-chest §9(e): key % answered % (the bundle, the row or the one call-out is off)', v_hit, v; end if;
    update public.player_state set presence_quiet = true where user_id = v_u and slot = 0;
    loop v_hit := v_hit + 1; exit when public.hr_chest_outfit_roll(v_u, 0, v_hit) < v_fam.pm * 1000 or v_hit > 800000; end loop;
    update public.chest_luck set opens = v_hit - 1 where user_id = v_u and slot = 0;
    delete from public.hr_rate_counters where user_id = v_u;
    v := public.hr_chest_open(0, 'great_hearth', 'bronze', 1, 0, (k || '00000012')::uuid);
    if coalesce(v->>'ok', '') <> 'true' or v #>> '{opens,0,outfit}' is distinct from v_fam.outfit_id
       or (select qty from public.player_inventory where user_id = v_u and slot = 0 and item_id = v_fam.item_id) is distinct from 2
       or (select count(*) from public.chat_messages where from_id = v_u and channel = 'system') <> v_lines + 1 then
      raise exception 'tower-chest §9(e): a quiet hero''s find answered % (or was called out)', v; end if;
    raise exception 'tower-chest §9: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'tower-chest §9: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = v_u) or exists (select 1 from public.chest_opens where user_id = v_u)
     or exists (select 1 from public.tower_runs where user_id = v_u) or exists (select 1 from public.account_bank where user_id = v_u)
     or exists (select 1 from public.player_key_ring where user_id = v_u)
     or (select count(*) from public.hr_chest_weapons) <> v_weapons then
    raise exception 'tower-chest §9: LEAKED a probe row'; end if;
  raise notice 'tower-chest: a key a landing a run under the held limit, six a family a week, the open on the server''s dice, every forged value refused; all green';
end $$;
