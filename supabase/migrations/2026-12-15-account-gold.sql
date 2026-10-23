-- ════════════════════════════════════════════════════════════════════════
-- 2026-12-15-account-gold.sql — ONE GOLD PURSE PER ACCOUNT (Tyler 2026-10-23:
-- "it should just be account gold"; "items should be transferrable only through
-- storage" (or trading)). STAGED (lane/c-account-gold, backend-architect,
-- 2026-10-23). Game CLOSED: applies on its passing §7 (CLAUDE.md §2); MONEY
-- SURFACE (every gold balance, every gold move): on the reopen Security review list.
-- RESTATEMENT-DEBT-ACK: hr_apply (152 kB, the economy's single write path) takes four anchored gold edits here, exactly as 2026-10-19-account-wallet.sql moved gems; restating it whole in the same lane as a currency move is the larger risk, and every other gold body is restated whole and md5-pinned.
--
-- ── THE RULING, AS BUILT ────────────────────────────────────────────────────
--   ONE purse per account: public.account_wallet.gold (beside gems and hearth
--   tokens since 2026-10-19-account-wallet.sql). Every hero of the account reads
--   it and spends it; player_state.gold is FOLDED into it once and DROPPED, so no
--   body can read a stale per-hero balance (a forgotten reader fails loudly).
--   Items stay in each hero's own bag; they cross heroes only through Storage
--   (account_bank, 2026-11-27-account-depot.sql) or a server-owned trade.
--
-- ── THE INVENTORY: EVERY GOLD READ AND WRITE (replayed chain, 2026-10-23) ────
--   SERVER, MOVES THE BALANCE (14 bodies + 1 view; all repointed here):
--     hr_apply                 THE gold block (delta.gold, ±50M clamp, never < 0):
--                              hunt kill coins (edge accrual.js 'accrue'), town work,
--                              Shop buys (edge shop-buy.js), vendor sells (vendor-sell.js),
--                              and the RPCs that pay through it: hr_stamina_refill,
--                              hr_blessing_buy, hr_hero_rename, hr_storage_chest_build,
--                              hr_hunt_loot_rules (loot sold on pickup). §5 below.
--     hr_hunt_apply_member     sell-to-cover credit (vendor_cover), the store bill per
--                              use (supply_buy) and the gold floor ("Keep at least N").
--     hr_hunt_apply_instance   (new here) pays every member's store bill + the floor.
--     hr_hunt_settle_session   the gold_out end proof (a read).
--     hr_hunt_loot_rules       the loot filter's sale (journal kind -> 'hunt', session-stamped).
--     hr_buy_hero_slot__ungated  hero slots (the client's "Paid from <hero>").
--     hr_farm_purse_pay        THE FARM'S ONE PURSE (2026-12-14-shared-farm.sql): plot tiers and the
--                              replant seed (hr_farm_upgrade_plot, hr_farm_harvest_replant) pay through it.
--     hr_unlock_buy            Shop offers through the edge unlock-buy.js: house deeds
--                              and rooms (2026-11-29-house-home.sql), gold ladders, tools.
--     hr_create_character      the start kit's 500 gold.
--     hr_market_buy            the old market v2 (buyer debit, seller credit; no caller).
--     hr_trait_buy__ungated    the old trait shop (authenticated through hr_trait_buy; no UI).
--     clan_contribute__ungated the old clan treasury (authenticated through clan_contribute; no UI).
--     hr_state_of              THE projection: state.gold (+ state.gold_v, new).
--     hr_renown_of             renown's goldLog term, read on EVERY hr_apply (renown ratchet).
--     leaderboard_ranked       (materialized view) the `wealth` board read slot 0's gold; now
--                              the ACCOUNT purse (its boards were per account already). §3d.
--   SERVER, NAMES GOLD BUT MOVES NO BALANCE (unchanged): hr_day_budget_check/_used/_limits
--     (gross gold_in per HERO per UTC day: each hero's own activity mints, so the ceiling
--     stays per hero), hr_ledger_prune (rollup gold_in/out), hr_hunt_stats_of /
--     hr_hunt_analyzer_basic / hr_hunt_best_fold / hr_hunt_bests_view (the analyzer's gold
--     lines come from hunt_session_tally, never the purse), hr_party_hunt_tally_on_ledger,
--     hr_hunt_member_read / hr_hunt_supply_of / hr_hunt_settings_view (the floor SETTING),
--     hr_account_view / hr_depot_view / hr_home_view / hr_farm_land_view (catalogue prices),
--     hr_tick_settle (would_gold shadow), hr_put_client_state (denylist), the 0-gold journal
--     rows of hr_quartermaster_buy, hr_dungeon_settle, hr_recipe_learn__ungated,
--     hr_buy_gem_unlock__ungated, hr_claim_discord_gift__ungated, hr_trophy_claim,
--     hr_blessing_buy (free tier), hr_market_list/cancel/expire.
--   NOT ON THE SERVER: the client calls hr_bestiary_activate (the bestiary's gold fee) and no
--     such function exists; when it is built it pays through hr_purse_move like the rest.
--   EDGE (supabase/functions/hr-accrue): envelope.js:200 state.gold -> every engine input;
--     hunt-settle.js:111/420 member gold (the purse), RETRYABLE (+gold_short and a gold_out
--     end refused); accrual.js:1276/1335 kill coins delta.gold; shop-buy.js / vendor-sell.js /
--     unlock-buy.js / spend.js propose, the server prices; tick-contract.js:409/454/495 and
--     tick-shadow.js:82 fold deltas on a local copy only.
--   CORE (src/core): member.js:157/182/214-221 the session purse; action-rules.js:90-148
--     buyFromShop / sellToCover / canAfford / floorOf; hunt/consumables.js, hunt/abilities.js
--     (gold_short -> goldOut); hunt-rewards.js:86 kill gold; combat-sim.js:311 the gold_out end.
--   CLIENT (src): session/item-sections.js:86 goldOf; session/account-session.js:68-75 heroOf
--     gold, buySlot(paySlot); app/slot-offer.js:42-67 + app/boot.js:313 the payer picker;
--     shell/windows/characters.js:107-127 (rename "paid by"/"<name> has"), shop.js:86/138/170-192,
--     services.js:56-96, house.js:57-187, farm.js:157-172, inventory/index.js:60, inventory/
--     actions.js:86/141, readiness.js:75, away-recap.js:48-73; hunt-view/live-engine.js:147.
--   ITEMS BETWEEN HEROES: Storage (hr_bank_move) — the ruling. The only other path is the old
--     market v2 (hr_market_list/buy/cancel/expire: hr_engine-executable, NO edge or client
--     caller today); its own_listing guard refuses only the same (user, slot), so one hero
--     can buy another own hero's listing (stamped self_trade). Server-owned trade, kept, flagged
--     for the reopen review. clan_deposit / clan_feast_deposit / clan_work_supply move items OUT
--     to a clan (one way, no withdraw exists): not a hero-to-hero path.
--
-- ── THE CONCURRENCY RULE ────────────────────────────────────────────────────
--   R1 EVERY GOLD MOVE goes through hr_purse_move(uid, gold, floor) (§2): it takes the
--      account purse's ROW LOCK (held to commit) and lands a debit only when the purse
--      stays >= greatest(0, floor); otherwise NULL and nothing moved. account_wallet
--      CHECK (gold >= 0) backs it. No body decides on a purse it read before the lock.
--   R2 LOCK ORDER (house order + the purse as a leaf): account advisory (uid:0) ->
--      character advisory / row -> the account PURSE (account_wallet row) -> nothing that
--      takes a character lock. A hunt instance locks every member's purse in USER ORDER
--      right after its character locks, before any other shared row (hearthfind ordinal,
--      tallies); the market locks both accounts' purses in user order. Two settles or a
--      settle and a purchase that share an account QUEUE on its purse; none can cycle.
--   R3 THE ENGINE READS THE PURSE AT EACH SETTLE (hr_state_of state.gold in the instance
--      read) and spends it in time order: heroes of ONE account in ONE instance share ONE
--      purse object (coins any of them loots, a sale any of them makes, a buy any of them
--      makes); each buy keeps the purse at its OWN hero's floor.
--   R4 THE SERVER RE-PROVES THE WINDOW, NOT THE INSTANT: every member's coins, cover and
--      sales land first, then hr_hunt_apply_instance pays each member's store bill under
--      the purse lock (never below 0) and holds each account to the LOWEST floor of its
--      heroes that bought this window (one hero: its floor, exactly the old rule). Under
--      R3 every intermediate balance is >= the window's end balance >= 0.
--   R5 TWO WINDOWS RACE (two heroes of one account in two instances, or a hunt and a
--      purchase): the server NEVER clamps a store bill — the engine already ate the food
--      and swung the rune it bought, so a clamped bill would pay for half a fight. A bill
--      the purse can no longer pay (another hero spent it since this window was read) is
--      refused gold_short and NOTHING of the window lands; a gold_out the purse no longer
--      proves (another hero's coins arrived) is refused end_not_proven; the edge re-reads
--      at once and re-runs the window on the fresh purse (hunt-settle.js retry), so the
--      hero that cannot pay ends gold_out exactly where the fresh purse runs dry. A
--      refusal is counted toward the six-in-a-row forfeit; the re-read in the same fire
--      lands and resets it.
--   R6 THE FLOOR ("Keep at least N gold", per hero, per action set) applies to the ACCOUNT
--      purse: a hero's store use never takes the purse below ITS floor (engine), and the
--      window's end purse never sits below the lowest floor of the heroes that bought (server).
--   R7 A PURCHASE (shop, refill, blessing, rename, slot, chest, deed, farm) is one guarded
--      debit under the lock: of two heroes buying at once, the second sees the first's
--      debit and is refused insufficient_gold when the purse cannot pay both. Idempotency
--      is unchanged: each verb's own key; a replay moves nothing.
--
-- ── THE LEDGER (and what the gold-history lane may rely on) ─────────────────
--   Every player_ledger row whose gold <> 0, written after this file, carries:
--     user_id, slot   the ACTING hero (provenance; the purse is the account's)
--     at              server clock
--     gold            the SIGNED move of the ACCOUNT purse by this row
--     purse    (new)  the account purse AFTER this row's move. ENFORCED: the BEFORE
--                     INSERT trigger hr_ledger_stamp_purse refuses (HR000 ledger_purse)
--                     a STATED purse that is not exactly the wallet's balance at insert
--                     (the row lock the move took is held to commit) and FILLS an
--                     unstated one from it (the farm's rows), so per account (rows by id)
--                     every row's purse = the previous row's purse + its gold.
--     gold_kind (new) a plain code (hr_gold_kind, set by the trigger when the writer did not):
--                     hunt_loot · hunt_sale · hunt_supply · shop · house · vendor_sale ·
--                     stamina · blessing · rename · hero_slot · storage · farm · start_kit ·
--                     town_work · clan · trade · trait · fold · other
--     session_id      THE GROUPING KEY of every move inside a hunt (kill coins, loot sold on
--                     pickup — stamped from here on — sell-to-cover, store buys); NULL outside
--                     a hunt, where the row itself is the purchase (intent names the offer).
--   Index (new): player_ledger_gold_idx (user_id, at desc) WHERE gold <> 0 — an account's
--   gold history by day across every hero; by hunt, player_ledger_session (session_id, id)
--   exists. Rows older than hr_ledger_config.retain_days (90) roll up and are pruned; the
--   fold rows (kind 'wallet') never are.
--   LEDGER = PURSE: purse_now = fold row's purse + Σ gold of the account's later rows (§7 (f)).
--
-- ── THE FOLD (§3) ───────────────────────────────────────────────────────────
--   account purse = Σ player_state.gold over the account's heroes, ONCE, nothing capped
--   or lost (numeric sum, past bigint RAISES); one kind='wallet' row per account,
--   intent 'gold_fold:2026-12-15', gold 0 (a carry is not a move), purse = the folded
--   purse, meta.carry = the per-slot balances. Proven on a probe first (§3a), then
--   conservation is asserted globally (§3c), then player_state.gold is DROPPED.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
--   +0 client RPCs, +0 engine RPCs: the four helpers are owner-only (asserted, §7).
--   NEW: gold earned by one hero is spendable by every hero of its account — the
--   ruling. It crosses no account: the purse is keyed by auth.uid() / the session's
--   user, and only the market (no caller) moves gold between accounts.
--   Mint ceilings unchanged and per HERO (each hero's own activity mints); per-call
--   clamps unchanged. Start-kit gold: 500 per hero created into the shared purse,
--   bounded by the slot count (slots past the starters cost far more).
--   CLOSED: a per-hero purse read (the column is gone); a ledger gold row that states
--   a purse other than the true one (the trigger refuses it).
--
-- ── COST (100x players, ~4,400 accounts) ───────────────────────────────────
--   account_wallet +8 bytes a row. player_ledger +2 nullable columns (~12 bytes on
--   gold rows, nothing on the rest); NO new rows except one fold row per account, once.
--   The trigger: one wallet PK probe per gold row (~3 per hunt settle). Index: gold
--   rows only (~40% of the ledger).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   NOT reversible by re-running an older file (the column is dropped). The way back
--   is a forward file: re-add player_state.gold, give each account's purse to its
--   lowest slot, re-apply the pinned pre-images (§0 md5s; the chain without this file
--   reproduces them byte for byte), drop the helpers, the trigger and the columns.
--   Which hero held what before the fold is in the fold rows' meta.carry.
--
-- ORDER: after 2026-12-17-beta-premium.sql and 2026-12-16-own-drinks-settle.sql (both applied first, though
--   dated later: 12-16's hr_hunt_settle_session 07d806dc is the pinned pre-image; 12-17 restates none of
--   these bodies and no body here reads premium_until or the beta switch) and 2026-12-14-shared-farm.sql
--   (its hr_state_of / hr_create_character / hr_apply splices are). A later lane that restates a body
--   pinned here re-derives it.
-- AFTER APPLYING: live-hash-drift wants the 14 restated bodies + hr_apply + the helpers;
--   deploy hr-accrue (the shared purse + the retry); the client half rides the next release.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
-- Each body this file restates or patches must be EXACTLY the replayed pre-image or
-- this file's own post-image (a second apply). Anything else means another lane moved
-- it in the meantime: refuse, never clobber.
do $mig$
declare v_md5 text; r record;
begin
  if to_regclass('public.account_wallet') is null or to_regclass('public.player_ledger') is null
     or to_regclass('public.player_state') is null or to_regclass('public.hunt_instances') is null then
    raise exception 'PRECONDITION: account_wallet / player_ledger / player_state / hunt_instances absent'; end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null or to_regprocedure('public.hr_wallet_ensure(uuid)') is null then
    raise exception 'PRECONDITION: hr_reject / hr_wallet_ensure absent'; end if;
  for r in select * from (values
    ('public.hr_state_of(uuid,integer)', '0bda8ab35a0f4d0330a8955fb2a2f37b', '0506754710c98788248a27b230168e59'),
    ('public.hr_renown_of(uuid,integer)', '31c65df856055839e4311516c099db7e', '45e723cbfa0d9339c04098b562b60018'),
    ('public.hr_create_character(integer)', '5be6cc15ed35bc74be9b229134b09110', '6cfec25bf4f82ec0a9e5927960aa6603'),
    ('public.hr_buy_hero_slot__ungated(integer,integer,uuid)', '746516d5b7ec73c53b59f3dd667a3d78', 'edf5a7aa9f1efeef02f2f8f1ca5156e4'),
    ('public.hr_farm_purse_pay(uuid,integer,bigint)', '0ccc182aad4bf1ed2223aecf2f935d35', 'a8d70b18926e10157c873126aab36fdb'),
    ('public.hr_trait_buy__ungated(text,integer,uuid)', 'baff89cd94b662677fe4cbf30c31a74e', 'ca4ab8c1965afc46378f5cee229d010b'),
    ('public.clan_contribute__ungated(uuid,bigint,integer)', '1787a3471b2d52d0977f4225edfe714f', '40aacafcceb1c814fad203054055eff4'),
    ('public.hr_unlock_buy(uuid,integer,bigint,uuid,text)', '8bee328f72b0dde9b43c3663b680fa19', '560e254057af74da83dee08b013c0b48'),
    ('public.hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)', '9b33cfeb4986d3d9861ce1d9eaa09276', '97e38b8e3c7185487d0447111b9e3c64'),
    ('public.hr_hunt_loot_rules(uuid,integer,uuid,uuid,jsonb,timestamp with time zone)', 'effca80aec36c617539fcbcdecc6fc0e', 'bf314f41f2ae45588d212e62ee2c7ce6'),
    ('public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)', '07d806dc20d0aec69469eab02984cc8e', '446456a4c99e80763279b3c463b5cd29'),
    ('public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)', '1ced9ef2c45f893c892245982e570f36', 'a0bbf22528611f9c5d939783cb211c9e'),
    ('public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', '465885606fde6e457bef4e45977c2615', '0badf6bfafe9a9cc85fe059fc9f35497'),
    ('public.hr_apply(uuid,integer,bigint,uuid,jsonb)', '466bde57a7bf2ca516266fdd9c4f339a', '34291a5ae8e42247255c416ae02aacdb')
  ) p(sig, pre, post) loop
    select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = to_regprocedure(r.sig);
    if v_md5 is null then raise exception 'PIN: % is missing', r.sig; end if;
    if v_md5 is distinct from r.pre and v_md5 is distinct from r.post then
      raise exception 'PIN: % is neither its pre-image (%) nor this file''s (%) - md5 %: another file moved it; restate from the new image',
        r.sig, left(r.pre, 8), left(r.post, 8), v_md5; end if;
  end loop;
end $mig$;

-- ── §1 THE SCHEMA ────────────────────────────────────────────────────────────
alter table public.account_wallet add column if not exists gold bigint not null default 0;
do $mig$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.account_wallet'::regclass and conname = 'account_wallet_gold_check') then
    alter table public.account_wallet add constraint account_wallet_gold_check check (gold >= 0);
  end if;
end $mig$;
comment on column public.account_wallet.gold is
  '2026-12-15 (Tyler 2026-10-23 "it should just be account gold"): THE gold purse, one per account, shared by every hero. '
  'Moved ONLY by hr_purse_move (row lock, never below 0); journalled on player_ledger (gold, purse).';

alter table public.player_ledger add column if not exists purse bigint;
alter table public.player_ledger add column if not exists gold_kind text;
comment on column public.player_ledger.purse is
  '2026-12-15-account-gold.sql: the ACCOUNT purse after this row''s gold move. Required (and equal to the locked wallet) on every new gold row: hr_ledger_stamp_purse.';
comment on column public.player_ledger.gold_kind is
  '2026-12-15-account-gold.sql: a plain code for the gold history (hr_gold_kind), set on every new gold row.';
do $mig$ begin
  -- NOT VALID: they bind every row written from here on; the rows before this file carry no purse.
  if not exists (select 1 from pg_constraint where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_gold_purse') then
    alter table public.player_ledger add constraint player_ledger_gold_purse
      check (coalesce(gold, 0) = 0 or (purse is not null and gold_kind is not null)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_gold_kind') then
    alter table public.player_ledger add constraint player_ledger_gold_kind
      check (gold_kind is null or gold_kind in ('hunt_loot', 'hunt_sale', 'hunt_supply', 'shop', 'house', 'vendor_sale',
        'stamina', 'blessing', 'rename', 'hero_slot', 'storage', 'farm', 'start_kit', 'town_work', 'clan', 'trade',
        'trait', 'fold', 'other')) not valid;
  end if;
end $mig$;
-- THE GOLD HISTORY'S READ: an account's gold rows by day, across its heroes.
create index if not exists player_ledger_gold_idx on public.player_ledger (user_id, at desc) where gold <> 0;

-- ── §2 THE PURSE: FOUR OWNER-ONLY HELPERS AND THE LEDGER TRIGGER ─────────────
-- hr_purse_of: the account purse, 0 for an account the wallet has not met. No lock (a read).
create or replace function public.hr_purse_of(p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce((select w.gold from public.account_wallet w where w.user_id = p_user), 0)::bigint
$$;
-- hr_purse_lock: the account's wallet row, made if missing, LOCKED (for update) to commit; its gold.
create or replace function public.hr_purse_lock(p_user uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if p_user is null then raise exception 'hr_purse_lock: no account'; end if;
  insert into public.account_wallet (user_id) values (p_user) on conflict (user_id) do nothing;
  select w.gold into v from public.account_wallet w where w.user_id = p_user for update;
  return v;
end $$;
-- hr_purse_move: THE ONE GOLD MOVE. Under the row lock: a credit always lands; a debit lands only
-- when the purse stays >= greatest(0, p_floor), else NULL and nothing moved. Returns the purse AFTER.
-- Every move bumps the wallet version (state.gold_v), so a client keeps the newest purse it has seen.
create or replace function public.hr_purse_move(p_user uuid, p_gold bigint, p_floor bigint default 0)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if p_user is null or p_gold is null then raise exception 'hr_purse_move: no account or amount'; end if;
  v := public.hr_purse_lock(p_user);
  if p_gold = 0 then return v; end if;
  if p_gold < 0 and v + p_gold < greatest(0, coalesce(p_floor, 0)) then return null; end if;
  update public.account_wallet w
     set gold = w.gold + p_gold, version = w.version + 1, updated_at = now()
   where w.user_id = p_user
  returning w.gold into v;
  return v;
end $$;
-- hr_gold_kind: the plain code of a gold row, from what the server itself wrote (kind, intent, session).
create or replace function public.hr_gold_kind(p_kind text, p_intent text, p_session uuid)
returns text language sql immutable set search_path = public as $$
  select case
    when p_intent = 'supply_buy' then 'hunt_supply'
    when p_intent in ('vendor_cover', 'loot_sell') then 'hunt_sale'
    when p_session is not null then 'hunt_loot'
    when p_kind = 'wallet' then 'fold'
    when p_kind = 'hero_slot' then 'hero_slot'
    when p_intent like 'stamina\_refill:%' then 'stamina'
    when p_intent like 'blessing\_buy:%' then 'blessing'
    when p_intent like 'hero\_rename:%' then 'rename'
    when p_intent like 'storage\_chest:%' then 'storage'
    when p_kind = 'farm' or p_intent like 'farm\_%' then 'farm'
    when p_intent like 'vendor\_sell%' then 'vendor_sale'
    when p_kind = 'shop' then 'shop'
    when p_intent = 'create_character' then 'start_kit'
    when p_kind = 'clan' then 'clan'
    when p_kind = 'trade' then 'trade'
    when p_kind = 'trait' then 'trait'
    when p_kind in ('accrue', 'worker', 'gather', 'craft', 'combat', 'farm') then 'town_work'
    else 'other' end
$$;
-- THE LEDGER STATES THE TRUE PURSE. Fires after hr_ledger_session_stamp (BEFORE triggers run in
-- name order: 'hr_ledger_se…' < 'hr_ledger_st…'), so a hunt row's session_id is already stamped.
-- A writer that STATES the purse (every body this file restates) is held to the locked wallet; one that
-- does not (2026-12-14-shared-farm.sql's farm rows, written right after hr_farm_purse_pay) has it
-- filled from the same wallet row, which its own move locked to commit.
create or replace function public.hr_ledger_stamp_purse()
returns trigger language plpgsql set search_path = public, pg_catalog as $$
declare v bigint;
begin
  if coalesce(new.gold, 0) = 0 and new.purse is null then return new; end if;
  select w.gold into v from public.account_wallet w where w.user_id = new.user_id;
  if v is null or (new.purse is not null and new.purse <> v) then
    perform public.hr_reject('ledger_purse', jsonb_build_object('gold', new.gold, 'purse', new.purse, 'wallet', v,
      'intent', left(coalesce(new.intent, ''), 64)));
  end if;
  new.purse := v;
  new.gold_kind := coalesce(new.gold_kind, public.hr_gold_kind(new.kind, new.intent, new.session_id));
  return new;
end $$;
drop trigger if exists hr_ledger_stamp_purse on public.player_ledger;
create trigger hr_ledger_stamp_purse before insert on public.player_ledger
  for each row execute function public.hr_ledger_stamp_purse();
revoke all on function public.hr_purse_of(uuid) from public, anon, authenticated, service_role;
revoke all on function public.hr_purse_lock(uuid) from public, anon, authenticated, service_role;
revoke all on function public.hr_purse_move(uuid, bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function public.hr_gold_kind(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.hr_ledger_stamp_purse() from public, anon, authenticated, service_role;

-- ── §3 THE FOLD (once), PROVEN ON A PROBE FIRST, THEN player_state.gold IS DROPPED ──
-- One fold text, as a session-temporary function, so the probe and the real fold run the SAME
-- statements. p_user scopes it (the probe); null = every account.
create or replace function pg_temp.hr_gold_fold(p_user uuid)
returns int language plpgsql as $f$
declare v_n int;
begin
  -- (i) THE PURSE: every account's heroes summed into its wallet (numeric: past bigint RAISES).
  insert into public.account_wallet as aw (user_id, gold, version, updated_at)
  select ps.user_id, sum(ps.gold)::bigint, 1, now()
    from public.player_state ps
   where (p_user is null or ps.user_id = p_user)
     and exists (select 1 from auth.users u where u.id = ps.user_id)
   group by ps.user_id
  on conflict (user_id) do update set gold = aw.gold + excluded.gold, version = aw.version + 1, updated_at = now();
  get diagnostics v_n = row_count;
  -- (ii) THE JOURNAL: one row per account, on its lowest hero, stating the purse it now holds.
  insert into public.player_ledger (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, gold_kind, meta)
  select ps.user_id, min(ps.slot), 'wallet', 'gold_fold:2026-12-15', 0, 0, 0, 0, 0,
         (select w.gold from public.account_wallet w where w.user_id = ps.user_id), 'fold',
         jsonb_build_object('gold_fold', sum(ps.gold), 'carry', jsonb_object_agg(ps.slot::text, ps.gold),
                            'balance', (select w.gold from public.account_wallet w where w.user_id = ps.user_id))
    from public.player_state ps
   where (p_user is null or ps.user_id = p_user)
     and exists (select 1 from auth.users u where u.id = ps.user_id)
   group by ps.user_id;
  return v_n;
end $f$;

do $mig$
declare
  v_u constant uuid := '000000c0-0000-4000-a000-00000901d001';
  v_n int; v_before numeric; v_wallet0 numeric; v_orph bigint; v_accts bigint;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'player_state' and column_name = 'gold') then
    raise notice 'account-gold §3: player_state.gold is gone already (a re-apply) - nothing to fold';
    return;
  end if;
  -- NO MOVE MAY LAND BETWEEN THE FOLD'S READ AND THE DROP: the file applies as one transaction
  -- (tools/apply-migration.mjs, one query), so this lock is held to commit; an old-body gold move
  -- waits, then fails on the dropped column (a refused click, never lost gold).
  lock table public.player_state in access exclusive mode;
  lock table public.account_wallet in share row exclusive mode;
  -- (§3a) THE FOLD RULE, EXECUTED ON A PROBE: slot 0 holds 300, slot 1 holds 700, the wallet already
  --       holds 5 gems: the purse is 1,000, the gems untouched, one fold row stating it.
  begin
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold) values (v_u, 0, 300), (v_u, 1, 700);
    insert into public.account_wallet (user_id, gems) values (v_u, 5);
    v_n := pg_temp.hr_gold_fold(v_u);
    if v_n <> 1 or (select gold from public.account_wallet where user_id = v_u) <> 1000
       or (select gems from public.account_wallet where user_id = v_u) <> 5 then
      raise exception 'VERIFY(fold): 300 + 700 folded to % (gems %)', (select gold from public.account_wallet where user_id = v_u),
        (select gems from public.account_wallet where user_id = v_u); end if;
    if (select count(*) from public.player_ledger where user_id = v_u and intent = 'gold_fold:2026-12-15'
          and kind = 'wallet' and gold = 0 and purse = 1000 and gold_kind = 'fold' and slot = 0
          and meta->'carry' = '{"0": 300, "1": 700}'::jsonb) <> 1 then
      raise exception 'VERIFY(fold): the probe''s fold row is %', (select jsonb_agg(to_jsonb(l)) from public.player_ledger l where user_id = v_u); end if;
    raise exception using errcode = 'HR901', message = 'account-gold fold probe complete - rolling back';
  exception when sqlstate 'HR901' then null;
  end;
  if exists (select 1 from public.account_wallet where user_id = v_u) or exists (select 1 from public.player_state where user_id = v_u)
     or exists (select 1 from public.player_ledger where user_id = v_u) then
    raise exception 'VERIFY(fold): the probe LEAKED a row'; end if;

  -- (§3b) THE REAL FOLD: every account, once.
  select coalesce(sum(ps.gold), 0) into v_before from public.player_state ps
   where exists (select 1 from auth.users u where u.id = ps.user_id);
  select count(*) into v_orph from public.player_state ps where not exists (select 1 from auth.users u where u.id = ps.user_id);
  select coalesce(sum(w.gold), 0) into v_wallet0 from public.account_wallet w;
  select count(distinct ps.user_id) into v_accts from public.player_state ps;
  v_n := pg_temp.hr_gold_fold(null);
  raise notice 'account-gold §3: % gold over % accounts folded into % purses (% hero rows of deleted users not kept)',
    v_before, v_accts, v_n, v_orph;
  -- (§3c) CONSERVATION: every account's purse is exactly its heroes' sum; the fleet total is unchanged.
  if exists (
    select 1 from (select ps.user_id, sum(ps.gold) as g from public.player_state ps
                    where exists (select 1 from auth.users u where u.id = ps.user_id) group by 1) s
     left join public.account_wallet w on w.user_id = s.user_id
    where w.gold is distinct from s.g) then
    raise exception 'VERIFY(fold): an account purse does not equal its heroes'' summed gold'; end if;
  if (select coalesce(sum(w.gold), 0) from public.account_wallet w) - v_wallet0 <> v_before then
    raise exception 'VERIFY(fold): the purses gained % for % per-hero gold', (select coalesce(sum(w.gold), 0) from public.account_wallet w) - v_wallet0, v_before; end if;
  if (select count(*) from public.player_ledger where intent = 'gold_fold:2026-12-15') <> v_n then
    raise exception 'VERIFY(fold): % fold rows for % accounts', (select count(*) from public.player_ledger where intent = 'gold_fold:2026-12-15'), v_n; end if;
end $mig$;
drop function if exists pg_temp.hr_gold_fold(uuid);

-- (§3d) THE LEADERBOARD, restated from 2026-10-27-core-bodies.sql §4: the one other object that
--       reads player_state.gold. Its boards are per ACCOUNT already (slot 0's row); `wealth` now
--       ranks the ACCOUNT purse. Everything else in it is byte-for-byte the core-bodies text.
drop materialized view if exists public.leaderboard_ranked cascade;
create materialized view public.leaderboard_ranked as
with base as (
  select ps.user_id,
         coalesce(w.gold, 0)                        as gold,
         ps.level_xp,
         null::timestamptz                          as saved_at,
         coalesce(p.display_name, 'Adventurer')     as name,
         c.name                                     as clan_name
  from public.player_state ps
  left join public.account_wallet w on w.user_id = ps.user_id
  left join public.profiles p on p.id = ps.user_id
  left join public.clans    c on c.id = p.clan_id
  where ps.slot = 0
),
lv as (
  select s.user_id, s.skill_id, s.xp, public.hr_skill_level(s.skill_id, s.xp) as level
  from public.player_skills s
  where s.slot = 0
    and s.skill_id = any (public.hr_lb_skills())
),
agg as (
  select b.user_id, coalesce(sum(l.level), 0)::bigint as total_level
  from base b
  left join lv l on l.user_id = b.user_id
  group by b.user_id
),
scores as (
  select 'total_level'::text as board, b.user_id as subject_id, b.name, b.clan_name,
         a.total_level as score, b.saved_at
  from base b join agg a on a.user_id = b.user_id
  union all
  select 'level', b.user_id, b.name, b.clan_name, b.level_xp, b.saved_at
  from base b
  union all
  select 'wealth', b.user_id, b.name, b.clan_name, b.gold, b.saved_at
  from base b
  union all
  select 'skill:' || l.skill_id, l.user_id, b.name, b.clan_name, l.xp, b.saved_at
  from lv l join base b on b.user_id = l.user_id
  union all
  select 'clan_power', c.id, c.name, c.name,
         (coalesce(c.castle_tier, 0)::bigint * 1000000000)
           + least(greatest(coalesce(c.treasury, 0), 0), 999999999)::bigint,
         null::timestamptz
  from public.clans c
  -- NOTE: no 'renown' branch and no 'bosses' branch.
  -- (2026-08-18-leaderboard-server-source.sql's header: neither has a server source, so neither ranks anybody.)
)
select board, subject_id, name, clan_name, score, saved_at,
       row_number() over (partition by board order by score desc, subject_id) as rank
from scores
where score is not null
  and score > 0;
create unique index if not exists leaderboard_ranked_subject_idx on public.leaderboard_ranked (board, subject_id);
create index if not exists leaderboard_ranked_rank_idx on public.leaderboard_ranked (board, rank);
revoke all on public.leaderboard_ranked from public, anon, authenticated, service_role;

alter table public.player_state drop column if exists gold;

-- ── §4 THE GOLD BODIES, RESTATED WHOLE (each from its replayed pre-image, §0-pinned) ──
-- ── public.hr_state_of(uuid,integer) ──
CREATE OR REPLACE FUNCTION public.hr_state_of(p_user uuid, p_slot integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- hr_state_of restated 2026-09-14 (2026-09-14-hr-state-of-restatement.sql) — chain depth 0;
-- restated again WHOLE by 2026-10-19-account-wallet.sql (gems + hearth_tokens read
-- from public.account_wallet, the ACCOUNT's balance, identical on every slot).
-- restated again WHOLE by 2026-11-27-account-depot.sql: `bank` reads the ACCOUNT depot
-- (public.account_bank), identical on every slot. Nothing else moved.
-- restated again WHOLE by 2026-12-15-account-gold.sql: `state.gold` is the ACCOUNT purse
-- (public.account_wallet.gold, Tyler 2026-10-23 "it should just be account gold") and
-- `state.gold_v` the wallet version it was read at, identical on every slot; the client keeps
-- the newest one it has seen across its open heroes (raise-only). Nothing else moved.
-- This body is AUTHORED HERE. Do not add an anchored programmatic patch to it:
-- tests/patch-chain-guard.mjs refuses a third one, and twenty-four of them are
-- how the envelope every client renders came to exist in no file at all.
declare v_st public.player_state%rowtype;
        v_w  public.account_wallet%rowtype;
        v_vit jsonb;
begin
  -- ── THE CHARACTER ROW, AND THE ENVELOPE ROOT (ok / version / now) ──
  --    introduced by 2026-08-11-apply-engine.sql
  select * into v_st from public.player_state
   where user_id = p_user and slot = coalesce(p_slot, 0);
  if not found then return jsonb_build_object('ok', false, 'error', 'no_character'); end if;
  -- THE ACCOUNT WALLET. One PK probe; a missing row reads 0 (never NULL), so an
  -- account the wallet has not met yet renders an honest zero, not "unknown".
  select * into v_w from public.account_wallet where user_id = p_user;
  -- THE CORE MODEL'S VITALS (2026-10-27): Level, max HP / mana and the regen rate, derived.
  v_vit := public.hr_vitals_of(p_user, v_st.slot);

  -- ── THE SECTION REGISTRY (architecture contracts X7; 2026-10-23-character-premium.sql):
  --    every hr_state_sections row, folded UNDER the hand-written keys below.
  return public.hr_state_sections_of(p_user, v_st.slot) || jsonb_build_object(
    'ok', true,
    'version', v_st.version,
    'now', now(),
    -- CONSUMABLE BUFFS (2026-09-13). The character's own timed-consumable queue,
    -- written only by hr_apply's buff_apply block from hr_item_buffs + now().
    -- `until` is the authority; `remaining_ms` is the server's own subtraction
    -- against the same now() this envelope reports, so no client clock is ever an
    -- input to how long a buff has left. Ordered by expiry so the soonest is
    -- first. Expired entries are carried with remaining_ms = 0 — the away engine
    -- needs a buff that was alive at the START of the window it prices, and the
    -- renderer filters on remaining_ms > 0.
    -- ── buffs — THE CONSUMABLE QUEUE, with a SERVER-derived remaining_ms ──
    --    introduced by 2026-09-13-consumable-buffs.sql
    --    `scale` was added by 2026-09-13-buff-cellar-scale.sql
    -- ── level / vitals — THE CORE MODEL (2026-10-27-core-bodies.sql; CORE_MODEL.md §2-3) ──
    --    Level from kills only (player_state.level_xp), endless; max HP and max mana from
    --    Level and armour weight, the regen rate from Prayer: all DERIVED, never stored.
    'level', public.hr_level_block(v_st.level_xp),
    'vitals', v_vit,
    'buffs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', e.v->>'type',
               'magnitude', (e.v->>'magnitude')::numeric,
               'until', e.v->>'until',
               -- THE SEGMENT'S START (2026-09-28-buff-segment-from.sql). The
               -- engine does not pay a segment before it; null on a row written
               -- before the key existed (the engine then assumes the earliest
               -- start the one-hour ceiling allows).
               'from', e.v->>'from',
               -- THE PERK MULTIPLIER THIS SEGMENT WAS STAMPED WITH (step 3).
               -- Display only — the time it bought is already in `until`, and a
               -- segment written before the Cellar was priced has no key and is
               -- honestly 1.0 rather than absent, because an absent number is one
               -- a renderer has to guess at.
               'scale', coalesce((e.v->>'scale')::numeric, 1),
               'remaining_ms', greatest(0, floor(
                 extract(epoch from ((e.v->>'until')::timestamptz - now())) * 1000))::bigint)
               order by (e.v->>'until')::timestamptz)
        from jsonb_array_elements(coalesce(v_st.buffs, '[]'::jsonb)) as e(v)
    ), '[]'::jsonb),
    -- place (2026-09-13): the character's OWN position in the live world, and
    -- nothing about anybody else. Week 1 has one zone, so `zone` is a server
    -- constant (hr_town_zone) rather than a column — Week 2 adds player_state
    -- .zone_id and this line reads it instead. `quiet` is the stalking opt-out,
    -- projected so the toggle survives a reload without living in the residue (a
    -- client-held privacy flag is a privacy flag a reload loses). PEERS ARE NOT
    -- HERE AND MUST NEVER BE: this envelope is version-gated, and peer motion in
    -- it would be a version_conflict storm. They come from hr_town_of.
    -- ── place — THE CHARACTER'S OWN POSITION. PEERS ARE NEVER HERE ──
    --    introduced by 2026-09-13-town-presence.sql
    'place', jsonb_build_object(
      'zone', public.hr_town_zone(),
      'quiet', coalesce(v_st.presence_quiet, false)),
    -- dungeon re-entry cooldown (2026-09-12): the ACTIVE windows only, PER DUNGEON
    -- and PER MODE — { dungeon_id: { auto: ISO, manual: ISO, scavenger: ISO } },
    -- each mode waiting cooldown_s / its divisor (Designer ruling: scavenger is a
    -- quarter window, not an exemption). Derived by hr_dungeon_cooldowns from the
    -- append-only ledger + the catalogue — THE SAME function hr_dungeon_settle's
    -- gate (c) refuses on, so the countdown shown and the window enforced are one
    -- number. Was a client-clock `G.dungeons.lastRun` in the residue, which the
    -- armed path had stopped stamping at all. An expired mode is omitted, a dungeon
    -- with no active mode is omitted, a fresh character gets {}; an absent key on
    -- the client means READY, which is safe because the SERVER refuses — the worst
    -- case is one refused intent. The client reads map[dungeon_id][mode].
    -- ── dungeon_cooldowns — the ACTIVE windows, per dungeon and per mode ──
    --    introduced by 2026-09-12-dungeon-cooldown.sql
    -- ── stamina — THE HUNT POOL (ms / at / max_ms / hunting) ──
    --    introduced by 2026-10-22-hunt-sessions-settle.sql §4c
    'stamina', public.hr_stamina_view(p_user, v_st.slot),
    'dungeon_cooldowns', public.hr_dungeon_cooldowns(p_user, v_st.slot),
    -- ── state — THE FLAT SCALAR BAG (opens here, closes at streak_day_key) ──
    --    introduced by 2026-08-11-apply-engine.sql
    'state', jsonb_build_object(
      -- ACCOUNT GOLD (2026-12-15-account-gold.sql): ONE purse per account, every slot reads it.
      'slot', v_st.slot, 'gold', coalesce(v_w.gold, 0), 'gold_v', coalesce(v_w.version, 0), 'gems', coalesce(v_w.gems, 0),
      -- Bounty-Marks server-of-record slice: the marks currency the bounty
      -- turn-in (hr_claim_bounty) already credits into player_state.marks. Flat
      -- scalar beside gold/gems so src/net/record.js reads it the SAME way it
      -- reads gold — a moved-but-UNKNOWN marks balance renders a pending glyph,
      -- never a forgeable local number. Additive; nothing else changes.
      -- ── state.marks — the Bounty-Marks currency ──
      --    introduced by 2026-08-26-marks-record.sql
      'marks', v_st.marks,
      -- dungeon-scrip: the server-owned Dungeon Scrip currency, credited by
      -- hr_dungeon_settle. Flat scalar beside marks so src/net/record.js reads it
      -- the SAME way it reads gold/marks — a moved-but-UNKNOWN scrip balance
      -- renders a pending glyph, never a forgeable local number. Never an
      -- inventory item, never a residue mirror (dungeon-settlement.md §1).
      -- ── state.dungeon_scrip — the Dungeon Scrip currency ──
      --    introduced by 2026-09-10-dungeon-scrip.sql
      'dungeon_scrip', v_st.dungeon_scrip,
      -- ── state — tokens, hit points, the bank cap and the activity pointer ──
      --    introduced by 2026-08-11-apply-engine.sql
      'hearth_tokens', coalesce(v_w.hearth_tokens, 0),
      'hp', least(v_st.hp, (v_vit->>'max_hp')::int), 'max_hp', (v_vit->>'max_hp')::int, 'level_xp', v_st.level_xp,
      'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
      -- worker-settlement slice: the hired crew's own accrual watermark. The
      -- accrual shell reads it as `st.workers_accrued_to` and settles
      -- [workers_accrued_to, now()] alongside the pointer. Flat, like the other
      -- watermarks, so a nested bag cannot hide a missing column behind a default.
      -- ── state.workers_accrued_to — the hired crew's own watermark ──
      --    introduced by 2026-08-25-workers.sql
      'workers_accrued_to', v_st.workers_accrued_to,
      -- ── state.combat_xp_accrued_to — the combat-XP cadence watermark ──
      --    introduced by 2026-08-31-combat-xp-credit.sql
      'combat_xp_accrued_to', v_st.combat_xp_accrued_to,
      -- rested-record (b437): the bank charge count + its wall-clock watermark,
      -- flat like the other watermarks so a nested bag cannot hide a missing
      -- column behind a default. The accrual shell reads them as st.rested_xp /
      -- st.rested_at and settles [rested_at, now()] alongside the pointer.
      -- ── state.rested_xp / rested_at — the rested bank and its watermark ──
      --    introduced by 2026-08-22-rested-record.sql
      'rested_xp', v_st.rested_xp,
      'rested_at', v_st.rested_at,
      -- b348: THE GATHERING TOOL CARRY. Its presence here is what tells the
      -- accrual engine the server owns the carry — `st.tool_carry ?? null`, and
      -- the null branch omits the delta key. Never nested, for the same reason
      -- the auto-eat keys are flat.
      -- ── state.tool_carry — the gathering carry the SERVER owns ──
      --    introduced by 2026-08-15-tool-carry.sql
      'tool_carry', v_st.tool_carry,
      -- THE HEARTHFIND's self-configuring switch. Always true once
      -- 2026-09-08-hearthfind.sql has run; read by hr-accrue to decide whether
      -- to propose delta.hearthfind at all. Not a feature flag.
      -- ── state.hearthfind_* — the switch, the day’s find, the titles, the plinth ──
      --    introduced by 2026-09-08-hearthfind.sql
      'hearthfind_ready', true,
      -- THE DAY'S LATEST FIND, so a RETRIED SETTLE DOES NOT LOSE THE REVEAL.
      -- hr_apply's replay path returns `hr_state_of(...) || {replayed:true}` --
      -- a FRESH envelope, deliberately, because storing the receipt would put a
      -- full snapshot in player_intents (revision 2 did, at ~690 MB per player
      -- per day). The consequence is that the `hearthfind` field of the
      -- ORIGINAL receipt exists only on the first response: a settle whose
      -- reply is lost to a dropped connection is retried, comes back ok, and
      -- the player is never told about the rarest thing that has ever happened
      -- to them. The trophy and the ledger row were never at risk; only the
      -- MOMENT was, and the moment is the entire feature.
      --
      -- Projected from the append-only journal (the only durable record) rather
      -- than from world_finds, because the public row is suppressed by the
      -- 60-second broadcast clamp while the ledger row never is. Scoped to the
      -- UTC day so it is self-expiring: there is no state to clear, no flag to
      -- reset, and a client that has already revealed it simply sees the same
      -- object again (it carries `at`, so the client can tell). One index probe
      -- on player_ledger_hearthfind_idx; null on the ~100% of reads with no
      -- find today.
      'hearthfind_last', (
        select jsonb_build_object('item', l.item_id, 'at', l.at) || coalesce(l.meta, '{}'::jsonb)
          from public.player_ledger l
         where l.user_id = p_user and l.slot = p_slot and l.kind = 'hearthfind'
           and l.at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'
         order by l.at desc limit 1),
      -- THE COSMETICS THE CHARACTER OWNS. Projected from the server table, not
      -- carried in the residue: a title is earned state, and CLAUDE.md §6 is
      -- explicit that anything a player would miss after a reload lives in a
      -- server row and is projected. Two arrays and one boolean, all derived:
      --   hearthfind_titles  every title unlocked, newest last
      --   hearthfind_plinth  whether the homestead plinth is unlocked
      -- The EQUIPPED title is deliberately absent until an equip intent exists;
      -- a client that picked one would be authoring it, and there is no RPC yet
      -- that would let the server own that choice. Stated as a known limitation
      -- rather than shipped as a residue field.
      'hearthfind_titles', coalesce((
        select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'at', c.granted_at)
                         order by c.granted_at)
          from public.player_cosmetics c
         where c.user_id = p_user and c.slot = p_slot and c.kind = 'title'), '[]'::jsonb),
      'hearthfind_plinth', exists (
        select 1 from public.player_cosmetics c
         where c.user_id = p_user and c.slot = p_slot and c.kind = 'plinth'),
      -- Phase 0: THE IN-FLIGHT FIGHT. Its presence here is what tells the
      -- accrual engine the server owns the fight — `st.fight ?? null`, and the
      -- null branch omits the delta key, exactly as tool_carry does. Never
      -- nested, for the same reason the auto-eat keys are flat.
      -- ── state.fight — the IN-FLIGHT fight the server owns ──
      --    introduced by 2026-08-17-fight-carry.sql
      'fight', v_st.fight,
      -- THE TWO DEATH COUNTERS, projected as SCALARS.
      -- They are the same two player_progress rows the accrual delta writes
      -- (kind='stat' key='deaths', period='' and period=<UTC day>), read here
      -- DIRECTLY rather than left to be dug out of the 'progress' array above
      -- - that array is `limit 1000` and carries `progress_truncated`, and a
      -- character with enough collection rows would silently read as one who
      -- has never died. A survival counter must not depend on a truncatable read. The day key is
      -- hr_utc_day_key, the SAME spelling src/core/goals.js utcDayKey
      -- produces, so the row the engine writes is the row this reads.
      -- ── state.deaths_* — the two death counters, read DIRECTLY (never off the truncatable `progress` array) ──
      --    introduced by 2026-09-06-recovering-until.sql
      'deaths_lifetime', coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = ''), 0),
      'deaths_today',    coalesce((select pp.value from public.player_progress pp
                                    where pp.user_id = p_user and pp.slot = v_st.slot
                                      and pp.kind = 'stat' and pp.key = 'deaths'
                                      and pp.period_key = public.hr_utc_day_key(now())), 0),
      -- Slice 3: the daily settle STREAK, server-owned, advanced only inside
      -- hr_apply from now(). Projected so the client can render it; never read
      -- for authority, and there is no present:true field anywhere.
      -- ── state.streak_days — the daily settle streak ──
      --    introduced by 2026-08-21-streak-state.sql
      'streak_days', v_st.streak_days,
      -- farm-projection (Q-2): the SERVER-owned farm plot tier, written ONLY by
      -- hr_farm_upgrade_plot. Flat scalar like the other server-owned scalars, so
      -- accrue.js reconcileFarm mirrors it into G.plotLevels on every load. Before
      -- this key existed an armed client fell back to getPlotLevel()'s Lv 1
      -- fail-safe on every reload: unlocked seeds vanished and the Upgrade button
      -- quoted the wrong tier's price. The client NEVER computes this.
      -- ── state.plot_level — the SERVER-owned farm plot tier ──
      --    introduced by 2026-09-06-state-of-farm-projection.sql
      -- SHARED-FARM (2026-12-14-shared-farm.sql): the ACCOUNT's plot tier (account_farm), the same on every hero.
      'plot_level', public.hr_farm_plot_level(p_user),
      -- ── state.streak_day_key — the streak’s UTC day key ──
      --    introduced by 2026-08-21-streak-state.sql
      -- ── state.streak_day_key — CLOSES `state` (the combat style left with the core rebuild) ──
      'streak_day_key', v_st.streak_day_key),
    -- ── skills / inventory — the two maps the client renders from ──
    --    introduced by 2026-08-11-apply-engine.sql
    'skills', coalesce((
      select jsonb_object_agg(skill_id, jsonb_build_object(
               'xp', xp, 'level', public.hr_skill_level(skill_id, xp),
               -- THE CARRIED XP REMAINDER (2026-10-09-xp-frac-carry.sql). The
               -- engine's input (envelope.js xpFrac); the client renders `xp`.
               'frac', xp_frac))
        from public.player_skills where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    'inventory', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.player_inventory where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ── bank — THE ACCOUNT DEPOT (Tyler 2026-10-15 / 2026-10-22: the depot is shared
    --    by every character of the account). public.account_bank, written only by
    --    hr_bank_move, projected as a flat {item_id:qty} map beside `inventory`:
    --    the SAME map on every slot of the account. Absent row = real zero
    --    (qty>0 invariant + delete-on-zero in hr_bank_move).
    --    introduced by 2026-08-27-bank-store.sql; account-scoped by 2026-11-27-account-depot.sql
    'bank', coalesce((
      select jsonb_object_agg(item_id, qty)
        from public.account_bank where user_id = p_user), '{}'::jsonb),
    -- ── equipment — the worn set ──
    --    introduced by 2026-08-11-apply-engine.sql
    'equipment', coalesce((
      select jsonb_object_agg(equip_slot, item_id)
        from public.player_equipment where user_id = p_user and slot = v_st.slot), '{}'::jsonb),
    -- ELEMENTS/ENCHANTING v1: the server-owned weapon enchant,
    -- `{ <equip_slot>: <element> }`. Read here so the client renders it and the
    -- accrual shell builds `eq` from equipment + this (accrual.js weakness()),
    -- never from a client value. `{}` when nothing is enchanted.
    -- ── enchant — ELEMENTS v1, the server-owned weapon enchant ──
    --    introduced by 2026-08-18-enchant.sql
    'enchant', coalesce(v_st.enchant, '{}'::jsonb),
    -- worker-settlement slice: the hired crew, server-owned (player_workers, no
    -- client write policy). The accrual shell reads this as `env.workers` and
    -- settles each assigned worker; the client renders it and computes no yield.
    -- ── workers — the hired crew (hired_at added 2026-09-12-worker-hired-at-projection.sql) ──
    --    introduced by 2026-08-25-workers.sql
    'workers', coalesce((
      select jsonb_agg(jsonb_build_object('uid', uid, 'name', name,
                                          'skill', skill, 'target_id', target_id,
                                          'xp', xp, 'acc_ms', acc_ms,
                                          -- worker hire floor (2026-09-09 P0): the engine pays a
                                          -- worker only for time it has EXISTED. The shared
                                          -- workers_accrued_to watermark is stale by construction
                                          -- for a character who never had a crew, so without this
                                          -- the first hire collects a 24h backlog.
                                          'hired_at', hired_at)
                       order by uid)
        from public.player_workers where user_id = p_user and slot = v_st.slot), '[]'::jsonb),
    -- ── farm — the plots, with the FULL waterings array (Q-5) ──
    --    introduced by 2026-08-11-apply-engine.sql
    --    `waterings` was added by 2026-09-06-state-of-farm-projection.sql
    'farm', coalesce((
      select jsonb_agg(jsonb_build_object('i', plot_idx, 'crop', crop_id,
                                          'planted_at', planted_at, 'watered_at', watered_at,
                                          -- farm-projection (Q-5): the FULL watering history, the
                                          -- exact array hr_farm_growth_hours() reads. Projected
                                          -- whole because growth is the clipped 2h-window OVERLAP
                                          -- sum, which no count/last pair can reproduce — a lossy
                                          -- shape makes the client's isReady disagree with the
                                          -- server's and strands a ready crop behind a Water
                                          -- button. NOT NULL in the table; coalesce is belt-and-
                                          -- braces so a future nullable column can never emit a
                                          -- json null the client would have to special-case.
                                          'waterings', coalesce(to_jsonb(waterings), '[]'::jsonb))
                       order by plot_idx)
        -- SHARED-FARM (2026-12-14-shared-farm.sql): the ACCOUNT's planted plots, the same on every
        -- hero; watered_at is the last watering (the array is the record).
        from (select af.*, (select max(w) from unnest(af.waterings) w) as watered_at
                from public.account_farm_plots af where af.user_id = p_user) f), '[]'::jsonb),
    -- ── progress / progress_truncated — capped at 1000 rows, and it SAYS when it capped ──
    --    introduced by 2026-08-11-apply-engine.sql
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value,
                                          'period', period_key, 'state', state))
        from (select kind, key, value, period_key, state
                from public.player_progress
               where user_id = p_user and slot = v_st.slot
                 and (period_key = '' or updated_at >= now() - interval '31 days')
                 -- Slices 1+2: the bestiary (ev:kill_monster:%) and collection
                 -- (ev:loot:%) populations are served by hr_bestiary_of /
                 -- hr_collection_of; together they approach the 1000-row cap, so
                 -- they are kept OUT of the generic envelope in one reviewed change.
                 and key not like 'ev:kill_monster:%'
                 and key not like 'ev:loot:%'
                 -- 2026-09-22: the TROPHY population (docs/design/BESTIARY_LADDER.md
                 -- §6). Claimed trophy rows are served by hr_trophy_of, beside
                 -- hr_bestiary_of / hr_collection_of. 108 kills + up to 432 trophies
                 -- + the collection log breach this 1000-row cap, and the failure is
                 -- SILENT: kind='collection' sorts ahead of daily/flag/quest/stat,
                 -- so what falls off the end is a player's quest state.
                 and key not like 'trophy:%'
               order by period_key, kind, key
               limit 1000) p), '[]'::jsonb),
    'progress_truncated', (
      select count(*) > 1000 from (
        select 1 from public.player_progress
         where user_id = p_user and slot = v_st.slot
           and (period_key = '' or updated_at >= now() - interval '31 days')
           and key not like 'ev:kill_monster:%'
           and key not like 'ev:loot:%'
           -- 2026-09-22: the TROPHY population. The SAME predicate as the one
           -- inside `progress` above, and it must stay the same: a flag that
           -- counted rows the array excludes would report truncation that did
           -- not happen, which is the read filter / prune divergence RL3 names.
           and key not like 'trophy:%'
         limit 1001) t),
    -- ── client_state — the denylisted client-preference bag ──
    --    introduced by 2026-08-28-client-state.sql
    'client_state', coalesce(v_st.client_state, '{}'::jsonb),
    -- ── total_level — derived server-side ──
    --    introduced by 2026-08-11-apply-engine.sql
    'total_level', public.hr_total_level(p_user, v_st.slot),
    -- recipe-learn (2026-09-14): the gated recipes THIS CHARACTER has learned,
    -- in the client's own `{ "<scroll_id>": true }` shape. Written only by
    -- hr_recipe_learn (there is no client write policy and no client write grant
    -- on player_progress); the SAME rows hr_perks_of hands the away engine, so
    -- the attended screen and the night finally read one set. `{}` on a fresh
    -- character is a known state, not an error: no row is a LOCKED recipe.
    -- ── unlocked_recipes — the gated recipes THIS character has learned ──
    --    introduced by 2026-09-14-recipe-learn.sql
    'unlocked_recipes', public.hr_recipes_of(p_user, v_st.slot),
    -- gem-unlock-buy (2026-09-14): the themes and cosmetics this ACCOUNT owns,
    -- as a flat array of '<namespace>:<id>'. Written only by hr_buy_gem_unlock
    -- (there is no client write policy and no client write grant on
    -- player_progress), read by src/legacy.js ownsGemUnlock so ownership stops
    -- living in the residue a cloud restore can rewind — the half of the b371
    -- gem dupe that made a free theme STICK. Always contains the FREE rows
    -- (theme:default), so the starting theme stays equippable the moment the
    -- client reads this set server-first. Never truncated: an entitlement must
    -- not be able to read as "you own nothing".
    -- ── gem_unlocks — the ACCOUNT’s entitlements. NEVER truncated ──
    --    introduced by 2026-09-14-gem-unlock-buy.sql
    'gem_unlocks', public.hr_gem_unlocks_of(p_user, v_st.slot),
    -- THE SERVER'S COUNTED RENOWN (2026-09-12). The high-water hr_claim_rank
    -- decides every rank against, cached on player_state by the ratchet §1 added
    -- to hr_apply. Read straight off the row this function already selected, so
    -- the projection is free; the recompute lives on the apply path where it is
    -- floored at one call per intent instead of one per envelope.
    -- DISPLAY + the rank-up card only — the client authors none of it, there is
    -- no client write policy or grant on player_state, and hr_renown_of stays
    -- revoked from every browser role. This is the caller's OWN character (the
    -- whole body is keyed on p_user/v_st.slot); no other player's score is
    -- reachable through it. 0 on a fresh character, never null.
    -- ── renown_high — the SERVER’s counted renown, display only ──
    --    introduced by 2026-09-12-renown-high-projection.sql
    'renown_high', coalesce(v_st.renown_high, 0),
    -- THE ACTIVE BOUNTY, AND THE SERVER'S OWN PROGRESS ARITHMETIC (2026-09-09).
    -- `progress` is the SAME expression hr_claim_bounty judges the turn-in by:
    -- hr_bounty_kills(target) - baseline, i.e. kills since accept, counting the
    -- away/settle kills the client cannot see (ev:kill_monster:% is excluded
    -- from the `progress` array on purpose — the bestiary is hr_bestiary_of's).
    -- Display + turn-in trigger only; the client authors none of it, and
    -- active_bounty is SELECT-only to browser roles. NULL = no active contract.
    -- ── bounty — the active contract and the SERVER’s own progress arithmetic ──
    --    introduced by 2026-09-09-bounty-progress-projection.sql
    'bounty', (select jsonb_build_object(
                 'bounty_id',   b.bounty_id,
                 'b_type',      b.b_type,
                 'difficulty',  b.difficulty,
                 'target',      b.target,
                 'tier',        b.tier,
                 'required',    b.required,
                 'baseline',    b.baseline,
                 'accepted_at', b.accepted_at,
                 'kills_now',   k.v,
                 'progress',    greatest(0, k.v - b.baseline))
                 from public.active_bounty b
                 cross join lateral (select public.hr_bounty_kills(p_user, v_st.slot, b.target) as v) k
                where b.user_id = p_user and b.slot = v_st.slot),
    -- hero-slot-buy: the ACCOUNT's owned hero slots, as a flat int array.
    -- ACCOUNT-scoped (no v_st.slot) because a hero slot is an account
    -- entitlement, unlike every other projection in this envelope. Written only
    -- by hr_buy_hero_slot; read by the client so ownership survives a device
    -- change without the save blob, which is the store the b371 gem dupe lived
    -- in. Never truncated — an entitlement must not become "you own nothing".
    -- `[0]` is a valid known state: a fresh account owns only the free slot.
    -- ── hero_slots — ACCOUNT-scoped entitlement. NEVER truncated ──
    --    introduced by 2026-09-08-hero-slot-buy.sql
    'hero_slots', public.hr_hero_slots_of(p_user),
    -- trait-buy: the character's OWNED PERMANENT TRAITS, as a flat id array.
    -- Written only by hr_trait_buy; read by the client to hydrate G.traits on
    -- boot so ownership survives a device change without the save blob. Read
    -- UNFILTERED (not through the LIMIT-ed `progress` array) — an entitlement
    -- must never be truncated into "you own nothing". `[]` is a valid known
    -- state: a fresh character owns no traits.
    -- ── traits — owned permanent traits, read UNFILTERED ──
    --    introduced by 2026-08-23-trait-buy.sql
    'traits', coalesce((
      select jsonb_agg(substring(pp.key from 7) order by pp.key)
        from public.player_progress pp
       where pp.user_id = p_user and pp.slot = v_st.slot
         and pp.kind = 'flag' and pp.period_key = ''
         and pp.key like 'trait:%' and pp.value > 0), '[]'::jsonb),
    -- companion-record (blob-retire capstone): the FULL roster the client rebuilds
    -- G.companions from under arm — equipped id + owned set + per-id XP. hr_perks_of
    -- carries only the EQUIPPED companion's {id,xp} for pricing; this carries the
    -- whole set so the reconstruction cannot silently reset a player's roster/XP.
    -- The starter 'fox' is owned by grammar (no unlock row) and is unioned in by
    -- the client, so it is deliberately absent from `owned`.
    -- ── companions — the FULL roster (equipped + owned + per-id XP) ──
    --    introduced by 2026-08-22-companion-record.sql
    'companions', jsonb_build_object(
      'equipped', v_st.companion_equipped,
      'owned', coalesce((
        select jsonb_agg(substring(pp.key from 11) order by pp.key)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'unlock' and pp.period_key = ''
           and pp.key like 'companion:%' and pp.value > 0), '[]'::jsonb),
      'xp', coalesce((
        select jsonb_object_agg(substring(pp.key from 14), pp.value)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'stat' and pp.period_key = ''
           and left(pp.key, 13) = 'companion_xp:'), '{}'::jsonb),
      -- ^ an EXACT prefix since 2026-10-12 (was `like`, whose `_` matched any
      -- character): a row is projected as a pet's XP only under the key
      -- hr_apply equipped-checks and caps.
      -- THE PET'S CARRIED XP REMAINDER (2026-10-12-companion-xp-frac.sql). The
      -- engine's input (envelope.js companionXpFrac); non-zero only, absent = 0.
      'frac', coalesce((
        select jsonb_object_agg(substring(pp.key from 14), pp.xp_frac)
          from public.player_progress pp
         where pp.user_id = p_user and pp.slot = v_st.slot
           and pp.kind = 'stat' and pp.period_key = ''
           and left(pp.key, 13) = 'companion_xp:' and pp.xp_frac > 0), '{}'::jsonb)),
    -- ── inventory-flip Step B1: THE SERVER-STAMPED COMPLETENESS SIGNAL ───────
    -- TRUE only when the accrual settle loop has NO pending, un-drained window
    -- that could still grant OWNABLE items — i.e. player_inventory is a complete
    -- statement of the owned set and the dormant absolute-replace flip
    -- (src/net/accrue.js envelopeBaselineComplete) may safely fire. Read
    -- src/net/accrue.js:863 and tools/derive-inventory-complete.mjs's header for
    -- why a false negative merely defers the flip (safe) and a false positive
    -- would DELETE a legit crafted stack (the one irreversible mistake).
    --
    -- SINGLE SOURCE OF TRUTH: this reads the engine's OWN completeness watermark,
    -- accrued_to (advanced to now() by, and only by, a full settle), against the
    -- engine's OWN min-span ACCRUE_MIN_MS = 60000 ms (accrual.js). Below that
    -- span the engine settles nothing (SKIP.TOO_SOON) so no grant is pending;
    -- at/above it there is an un-settled payable window → INCOMPLETE. The 60s
    -- literal is pinned to ACCRUE_MIN_MS by tests/inventory-complete-probe.mjs.
    --
    -- FAIL-CLOSED and CHAINED-CRAFT-SAFE (see the tool header): idle/unknown
    -- pointer → no accrual → complete; a payable pointer with a drained window
    -- (< 60s) → complete, because each settle is atomic and collect-before-switch
    -- leaves no cross-pointer chain mid-flight; a payable pointer with an open
    -- window (>= 60s) OR an inconsistent payable row with no active_since →
    -- INCOMPLETE.
    -- ── inventory_complete — the STAMPED completeness signal, fail-closed ──
    --    introduced by 2026-08-24-inventory-complete.sql
    --    the third (worker) arm was added by 2026-08-25-workers.sql
    -- ── must_rename (2026-10-11-name-moderation.sql) ── the player's own
    --    moderation flag; the client opens a non-dismissable rename prompt.
    'must_rename', coalesce((select pr.must_rename from public.profiles pr
                              where pr.id = p_user), false),
    'inventory_complete', (
      case
        when v_st.active_kind is null
          or v_st.active_kind not in ('combat', 'gather', 'artisan')
          or v_st.active_id is null
          then true
        when v_st.active_since is null
          then false
        else now() - greatest(v_st.accrued_to, v_st.active_since) < interval '60 seconds'
      end)
      -- ── THIRD ARM (worker-settlement slice) ──────────────────────────────
      -- Also INCOMPLETE when the crew is non-empty AND its window is open
      -- (>= 60s since workers_accrued_to). The crew read is in THIS transaction —
      -- a lagging read would be a false-positive that lets the flip delete a
      -- pending worker haul. Pinned to ACCRUE_MIN_MS by the probe test.
      and (not exists (select 1 from public.player_workers pw
                        where pw.user_id = p_user and pw.slot = v_st.slot)
           or now() - v_st.workers_accrued_to < interval '60 seconds')
  );
end $function$;

-- ── public.hr_renown_of(uuid,integer) ──
CREATE OR REPLACE FUNCTION public.hr_renown_of(p_user uuid, p_slot integer)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with ps as (
    select * from public.player_state
     where user_id = p_user and slot = coalesce(p_slot, 0)
  ),
  sk as (
    select skill_id, public.hr_level_from_xp(xp) as lv
      from public.player_skills
     where user_id = p_user and slot = coalesce(p_slot, 0)
  )
  select floor(
      -- totalLevel × 2 (sum of every skill level owned)
      coalesce((select sum(lv) from sk), 0)::float8 * 2::float8
      -- combatLevel × 2 (absent skills default to level 1, matching xp.levelOf)
    + public.hr_lb_combat_level(
        coalesce((select lv from sk where skill_id = 'attack'),    1),
        coalesce((select lv from sk where skill_id = 'strength'),  1),
        coalesce((select lv from sk where skill_id = 'defense'),   1),
        coalesce((select lv from sk where skill_id = 'hitpoints'), 1),
        coalesce((select lv from sk where skill_id = 'prayer'),    1),
        coalesce((select lv from sk where skill_id = 'ranged'),    1),
        coalesce((select lv from sk where skill_id = 'magic'),     1)
      )::float8 * 2::float8
      -- skill99 × 100 (each skill taken to 99)
    + (select count(*) from sk where lv >= 99)::float8 * 100::float8
      -- kill × 0.05 (lifetime aggregate; ev:kill_any == the stats.kills mirror)
      -- ⚠ R5: MINUS the client-credited part. hr_credit_kills adds to
      --   ev:kill_any and records the same delta under ev:kill_credited_any, so
      --   what remains is what the SERVER simulated. greatest(0, …) because the
      --   two rows are written by one statement pair but read independently.
    + greatest(0::bigint,
        coalesce((select value from public.player_progress
                   where user_id = p_user and slot = coalesce(p_slot, 0)
                     and kind = 'stat' and period_key = '' and key = 'ev:kill_any'), 0)
      - coalesce((select value from public.player_progress
                   where user_id = p_user and slot = coalesce(p_slot, 0)
                     and kind = 'stat' and period_key = '' and key = 'ev:kill_credited_any'), 0)
      )::float8
        * 0.05::float8
      -- bossKill × 5 (Slice 1 per-monster kills, filtered to is_boss monsters)
      -- ⚠ R5: PER MONSTER, minus that monster's credited count. The discount has
      --   to be per-id and not an aggregate, because only is_boss ids are scored
      --   here — subtracting a global credited total would let credits against a
      --   NON-boss target erase honest boss renown.
    + coalesce((select sum(greatest(0::bigint, pp.value - coalesce(cr.value, 0)))
                  from public.player_progress pp
                  join public.hr_activities a
                    on a.kind = 'combat' and a.is_boss
                   and a.activity_id = substring(pp.key from 17)
                  left join public.player_progress cr
                    on cr.user_id = pp.user_id and cr.slot = pp.slot
                   and cr.kind = 'stat' and cr.period_key = ''
                   and cr.key = 'ev:kill_credited:' || substring(pp.key from 17)
                 where pp.user_id = p_user and pp.slot = coalesce(p_slot, 0)
                   and pp.kind = 'stat' and pp.period_key = ''
                   and pp.key like 'ev:kill_monster:%'), 0)::float8 * 5::float8
      -- collection × 3 (Slice 2 shape: distinct looted items). No rows → 0.
    + (select count(*) from public.player_progress
        where user_id = p_user and slot = coalesce(p_slot, 0)
          and kind = 'stat' and period_key = '' and key like 'ev:loot:%'
          and value > 0)::float8 * 3::float8
      -- streakBest × 5 (Slice 3 shape: player_state.streak_days). Read via
      -- jsonb so this COMPILES AND RUNS whether or not the column exists yet;
      -- absent column → null → 0. ⚠ Slice 3 owns whether this is CURRENT or
      -- BEST streak; renown.js scores BEST. Flagged in the header.
    + coalesce((select (to_jsonb(ps.*)->>'streak_days')::float8 from ps), 0::float8) * 5::float8
      -- goldLog × 8 (only above 1,000 gold), from the server-owned ACCOUNT purse
      -- (2026-12-15-account-gold.sql: account_wallet.gold, the same on every hero of the account)
    + case when coalesce((select w.gold from public.account_wallet w where w.user_id = p_user), 0) > 1000
           then (ln((select w.gold from public.account_wallet w where w.user_id = p_user)::float8) / ln(10::float8) - 3::float8) * 8::float8
           else 0::float8 end
      -- questDone × 25 : NO SERVER MODEL → 0 (degraded, see header)
    + 0::float8
      -- bountyDone × 2 : NO SERVER MODEL → 0 (degraded, see header)
    + 0::float8
  )::bigint
$function$;

-- ── public.hr_create_character(integer) ──
CREATE OR REPLACE FUNCTION public.hr_create_character(p_slot integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := auth.uid();
  v_slot int;
  v_kit  public.hr_start_kit%rowtype;
  v_purse bigint;
  v_n    int;
begin
  -- CLOSED MODE (2026-10-22-closed-mode-ungated-rpcs.sql, Security R3): this RPC
  -- never calls hr_rpc_gate, so it refuses a non-admitted caller itself.
  perform public.hr_access_check();
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;

  -- Validate the slot BEFORE spending any budget. A malformed request should
  -- not be able to consume the honest player's rate allowance.
  v_slot := coalesce(p_slot, 0);
  if v_slot < 0 or v_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot');
  end if;

  -- ── TWO BUCKETS, AND THE SPLIT IS THE POINT ───────────────────────────
  -- The previous body charged the strict 6/hour CREATION budget on every
  -- call, including calls that create nothing. That was fine while nothing
  -- called it; it is wrong now that the client ENSURES on load, because a
  -- player who reloads seven times in an hour would be refused for doing
  -- nothing unusual, and refusing an ensure is how a real character silently
  -- fails to exist.
  --   ensure_character  60/min  — a cheap guard on one indexed PK lookup, so
  --                               this cannot be used as a free query hammer.
  --   create_character   6/hour — charged ONLY on a path that will actually
  --                               insert. Create-and-delete looping (the abuse
  --                               the original limit was written for) is still
  --                               capped at six.
  if not public.hr_rate_ok(v_uid, 'ensure_character', 60, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'ensure_character') - 60) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'ensure_character', 'rate_limited',
        jsonb_build_object('limit', 60, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'ensure_character') - 60));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- FAST PATH. The overwhelmingly common call is "yes, it is already there".
  -- It takes no lock and spends no creation budget.
  if exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false);
  end if;

  -- ── THE HERO-SLOT ENTITLEMENT GATE (2026-09-08-hero-slot-buy.sql) ────
  -- Until this existed, {"p_slot":4} minted a fifth character with a full
  -- starting kit for free — the whole 3,100-gem hero-slot ladder bypassed by
  -- one fetch, five times over. Slot 0 is free and always owned; every slot
  -- above it must be in hr_hero_slots_of (bought, grandfathered, or waived by
  -- Hearth Hall). Placed AFTER the fast path so an existing character can
  -- never be locked out of its own account, and BEFORE the advisory lock and
  -- the 6/hour creation budget so a refusal costs neither.
  if v_slot > 0 and not (public.hr_hero_slots_of(v_uid) @> to_jsonb(v_slot)) then
    perform public.hr_record_rejection(v_uid, v_slot, 'create_character', 'slot_not_owned',
      jsonb_build_object('slot', v_slot, 'owned', public.hr_hero_slots_of(v_uid)), 1);
    return jsonb_build_object('ok', false, 'error', 'slot_not_owned', 'slot', v_slot);
  end if;

  -- ── SERIALISE (D1) ────────────────────────────────────────────────────
  -- Transaction-scoped, so it is released by COMMIT or ROLLBACK and cannot be
  -- leaked by an early return or an exception — unlike pg_advisory_lock(),
  -- which needs a matching unlock on every path and is held on a POOLED
  -- connection that outlives the request.
  -- The key is namespaced by a literal so it cannot collide with any other
  -- advisory lock in this schema, and keyed per (user, slot) so two players —
  -- or one player's two slots — never queue behind each other.
  perform pg_advisory_xact_lock(
    hashtextextended('hr_create_character:' || v_uid::text || ':' || v_slot::text, 0));

  -- RE-CHECK UNDER THE LOCK. The loser of a race arrives here after the winner
  -- has committed and takes the idempotent branch. This is the line that makes
  -- the handler below unreachable in practice — which is exactly why the
  -- handler is still there.
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
    -- Unreachable given §0, and it stays here anyway: a kitless character is
    -- worse than a refused one, because nothing downstream would ever notice.
    return jsonb_build_object('ok', false, 'error', 'no_start_kit');
  end if;

  -- ── THE INSERT, AND THE SECOND LOCK ───────────────────────────────────
  -- An `exception` clause opens a subtransaction, so if the primary key does
  -- fire, everything inside this block unwinds and the caller still gets a
  -- verdict rather than a 500. `raced` distinguishes it in the ledger of
  -- outcomes without pretending it did not happen.
  begin
    insert into public.player_state
      (user_id, slot, hp, bank_cap,
       active_kind, active_id, active_since, accrued_to)
      values (v_uid, v_slot,
              -- hp is clamped to a Level-1 character's derived max HP (hr_vitals_of,
              -- nothing worn yet) rather than trusted: the kit is generated data.
              least(v_kit.hp, public.hr_max_hp(1, 0)), v_kit.bank_cap,
              -- A new character is idle, and `accrued_to` is NOW. Not
              -- `created_at`, not a client value, not null — an accrual
              -- watermark that starts anywhere but now() is a free grant of
              -- however long the gap is.
              'idle', null, null, now());
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'slot', v_slot, 'created', false, 'raced', true);
  end;

  -- THE ACCOUNT WALLET (2026-10-19-account-wallet.sql). Gems and Hearth Tokens
  -- are ONE balance per account, not per character, so the kit's gems are paid
  -- ONCE PER ACCOUNT under the 'start_kit' grant key: a second, third or fifth
  -- character is created with gold and no gems. hearth_tokens are not paid here
  -- at all: the kit's column is CHECK (= 0) and the bond is IAP-only.
  perform public.hr_wallet_ensure(v_uid);
  if coalesce(v_kit.gems, 0) > 0 then
    perform public.hr_wallet_credit(v_uid, v_slot, v_kit.gems, 'start_kit', null);
  end if;

  -- Skills: a row per skill IN THE CATALOGUE, with the starting XP from the
  -- kit. Adding a skill to src/data/skills.js therefore gives every new
  -- character that skill at 0 with no edit here and no edit to the kit.
  insert into public.player_skills (user_id, slot, skill_id, xp)
    select v_uid, v_slot, k.skill_id, coalesce(s.xp, 0)
      from public.hr_skills k
      left join public.hr_start_skill_xp s on s.skill_id = k.skill_id;

  insert into public.player_inventory (user_id, slot, item_id, qty)
    select v_uid, v_slot, i.item_id, i.qty from public.hr_start_inventory i;

  insert into public.player_equipment (user_id, slot, equip_slot, item_id)
    select v_uid, v_slot, e.equip_slot, e.item_id from public.hr_start_equipment e;

  -- ⚠ CONSERVATION: starting equipment is NOT also placed in the inventory.
  -- hr_apply's equip/unequip pair conserves the total count of an item across
  -- the two tables (player-state.sql §3, review S4), so seeding a sword into
  -- BOTH would let the player unequip it and hold two. The bootstrap is the
  -- one place in the system that legitimately creates items from nothing, and
  -- it must create each of them exactly once.

  -- SHARED-FARM (2026-12-14-shared-farm.sql): no starter plot rows. The field is the
  -- ACCOUNT's (account_farm_plots holds planted plots only); its size is hr_farm_plot_cap.

  -- ONE ledger row, not one per grant. (Journal rule 6: game_events reached
  -- 1.6M rows / 229 MB from six players in four days by journalling per-event.)
  -- `gold` carries the starting grant so the rollup's `gold_in` accounts for
  -- every gold that has ever entered the economy, including this.
  -- ACCOUNT GOLD (2026-12-15-account-gold.sql): the kit's coin joins the ACCOUNT purse,
  -- under its row lock; the row says what the purse holds after it. One per hero the
  -- account makes (at most the slot count; slots past the starters cost far more than it).
  v_purse := public.hr_purse_move(v_uid, coalesce(v_kit.gold, 0), 0);
  select count(*) into v_n from public.hr_start_inventory;
  insert into public.player_ledger (user_id, slot, kind, intent, gold, purse, meta)
    values (v_uid, v_slot, 'admin', 'create_character', v_kit.gold, case when coalesce(v_kit.gold, 0) <> 0 then v_purse end,
            jsonb_build_object('slot', v_slot, 'kit_gold', v_kit.gold,
                               'kit_items', v_n, 'plots', v_kit.farm_plots,
                               'catalogue', (select digest from public.hr_catalogue_meta)));

  return jsonb_build_object('ok', true, 'slot', v_slot, 'created', true);
end $function$;

-- ── public.hr_buy_hero_slot__ungated(integer,integer,uuid) ──
CREATE OR REPLACE FUNCTION public.hr_buy_hero_slot__ungated(p_slot_id integer, p_slot integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- BLAST RADIUS, not balance: three paid slots, each once per account forever.
  c_max_slots_per_day constant int := 5;

  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_top    int;
  v_cat    public.hr_hero_slots%rowtype;
  v_st     public.player_state%rowtype;
  v_owned  jsonb;
  v_cached jsonb;
  v_gold   bigint;
  v_have   bigint;
  v_today  int;
  v_intent text;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- EVERY PURCHASE CARRIES ITS KEY: a retried success must replay, not read as a refusal.
  if p_idem is null then
    return jsonb_build_object('ok', false, 'error', 'idem_required');
  end if;
  -- SHAPE FIRST, for both integers: p_slot is the ACTING hero (the journal's provenance; the gold
  -- is the ACCOUNT's purse, 2026-12-15-account-gold.sql), p_slot_id the slot bought.
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;
  if p_slot_id is null or p_slot_id < 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot_id', p_slot_id);
  end if;
  -- THE CAP is the catalogue's top slot: past it there is nothing to sell.
  select max(slot_id) into v_top from public.hr_hero_slots;
  if p_slot_id > coalesce(v_top, 0) then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'slot_cap',
      jsonb_build_object('slot_id', p_slot_id, 'max', coalesce(v_top, 0) + 1), 1);
    return jsonb_build_object('ok', false, 'error', 'slot_cap', 'slot_id', p_slot_id, 'max', coalesce(v_top, 0) + 1);
  end if;

  -- (1) THE CATALOGUE, BEFORE ANY LOCK.
  select * into v_cat from public.hr_hero_slots where slot_id = p_slot_id;
  if v_cat.slot_id is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'unknown_slot',
      jsonb_build_object('slot_id', p_slot_id), 1);
    return jsonb_build_object('ok', false, 'error', 'unknown_slot', 'slot_id', p_slot_id);
  end if;
  -- FAIL CLOSED ON AN UNPRICED ROW: cost_gold defaults to 0, and a slot that
  -- costs nothing is a mistake, never an offer.
  if coalesce(v_cat.cost_gold, 0) <= 0 then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'slot_unpriced',
      jsonb_build_object('slot_id', p_slot_id), 1);
    return jsonb_build_object('ok', false, 'error', 'slot_unpriced', 'slot_id', p_slot_id);
  end if;
  v_intent := 'hero_slot_buy:' || v_cat.slot_id;

  -- (2) SERIALISE: the ACCOUNT (slot 0) first, then the paying hero.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || '0', 0));
  if v_slot <> 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));
  end if;

  -- (3) IDEMPOTENCY per (key, intent, slot), read inside the lock; successes only are cached.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, v_intent) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then
    return v_cached || jsonb_build_object('replayed', true);
  end if;

  -- (4) THE ACTING HERO'S ROW, LOCKED (its version moves). The gold is the ACCOUNT purse.
  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- (5) THE ACCOUNT'S CANONICAL ROW MUST EXIST (the slot-0 flag row's FK).
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = 0) then
    return jsonb_build_object('ok', false, 'error', 'no_account');
  end if;

  -- (6) OWNERSHIP, FROM THE ONE PREDICATE.
  v_owned := public.hr_hero_slots_of(v_uid);
  if v_owned @> to_jsonb(v_cat.slot_id) then
    return jsonb_build_object('ok', false, 'error', 'already_owned',
      'slot_id', v_cat.slot_id, 'hero_slots', v_owned);
  end if;

  -- (7) THE LADDER: slot N requires N-1, against the server's owned set.
  if not (v_owned @> to_jsonb(v_cat.slot_id - 1)) then
    return jsonb_build_object('ok', false, 'error', 'requires_previous_slot',
      'slot_id', v_cat.slot_id, 'requires', v_cat.slot_id - 1, 'hero_slots', v_owned);
  end if;

  -- (8) THE PER-DAY CLAMP, from the append-only ledger, account-wide.
  select count(*) into v_today from public.player_ledger
   where user_id = v_uid and kind = 'hero_slot'
     and at >= ((date_trunc('day', (now() at time zone 'utc'))) at time zone 'utc');
  if v_today >= c_max_slots_per_day then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'hero_slot_daily_cap',
      jsonb_build_object('used', v_today, 'limit', c_max_slots_per_day), 1);
    return jsonb_build_object('ok', false, 'error', 'hero_slot_daily_cap',
      'used', v_today, 'limit', c_max_slots_per_day);
  end if;

  -- (9) THE DEBIT, FROM THE ACCOUNT PURSE (2026-12-15-account-gold.sql). The price is the
  --     server's own catalogue; hr_purse_move takes the purse's row lock and lands the
  --     debit only when the purse stays >= 0, so gold cannot go negative. Nothing is
  --     written before it, so a refusal here moves nothing.
  v_gold := public.hr_purse_move(v_uid, -v_cat.cost_gold, 0);
  if v_gold is null then
    v_have := public.hr_purse_of(v_uid);
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'insufficient_gold',
      jsonb_build_object('slot_id', v_cat.slot_id, 'cost', v_cat.cost_gold, 'have', v_have), 1);
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
      'slot_id', v_cat.slot_id, 'cost', v_cat.cost_gold, 'have', v_have,
      'short_by', v_cat.cost_gold - v_have);
  end if;
  update public.player_state
     set version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;
  -- accrued_to is NOT touched: a purchase is not an activity change.

  -- (10) THE GRANT, ON THE ACCOUNT'S ROW (slot 0), downstream of the debit.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, 0, 'flag', 'character_slot:' || v_cat.slot_id, 1, '', null, now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = greatest(pp.value, excluded.value), updated_at = now();

  -- (11) THE JOURNAL. One row: the signed gold movement, no inflow.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, meta)
  values
    (v_uid, v_slot, 'hero_slot', v_intent,
     -v_cat.cost_gold, 0, 0, 0, 0, v_gold,
     jsonb_build_object('slot_id', v_cat.slot_id, 'name', v_cat.name,
                        'currency', 'gold', 'cost', v_cat.cost_gold,
                        'charged_slot', v_slot, 'idem', p_idem));

  -- (12) THE ENVELOPE: the account purse after the debit, the account's whole owned set and its next offer.
  select * into v_st from public.player_state where user_id = v_uid and slot = v_slot;
  v_result := jsonb_build_object(
    'ok', true, 'slot_id', v_cat.slot_id, 'name', v_cat.name,
    'currency', 'gold', 'cost', v_cat.cost_gold,
    'gold', v_gold, 'version', v_st.version, 'slot', v_slot,
    'hero_slots', public.hr_hero_slots_of(v_uid))
    || (select jsonb_build_object('hero_slot_offer', a->'hero_slot_offer', 'hero_slots_max', a->'hero_slots_max')
          from public.hr_account_view(v_uid, v_slot) a);

  insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
    values (v_uid, p_idem, v_slot, v_intent, v_result, now())
    on conflict (user_id, intent_id) do nothing;

  return v_result;
end $function$;

-- ── public.hr_farm_purse_pay(uuid,integer,bigint) ──
CREATE OR REPLACE FUNCTION public.hr_farm_purse_pay(p_user uuid, p_slot integer, p_gold bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_gold bigint;
begin
  if p_gold is null or p_gold < 0 then
    raise exception 'hr_farm_purse_pay: a price is a whole number >= 0, got %', p_gold; end if;
  -- ACCOUNT GOLD (2026-12-15-account-gold.sql): the farm's one purse is the ACCOUNT's. hr_purse_move takes
  -- the purse's row lock LAST (after the hero row, hr_farm_lock and the field) and lands the debit only
  -- when the purse stays >= 0; `gold` is the account purse after (or as it stands on a refusal). The
  -- acting hero's version still moves on a paid debit (its envelope's gold changed).
  v_gold := public.hr_purse_move(p_user, -p_gold, 0);
  if v_gold is not null then
    if p_gold > 0 then
      update public.player_state set version = version + 1, updated_at = now() where user_id = p_user and slot = p_slot;
    end if;
    return jsonb_build_object('ok', true, 'purse', 'account', 'paid', p_gold, 'gold', v_gold);
  end if;
  return jsonb_build_object('ok', false, 'purse', 'account', 'paid', 0, 'gold', public.hr_purse_of(p_user));
end $function$;

-- ── public.hr_trait_buy__ungated(text,integer,uuid) ──
CREATE OR REPLACE FUNCTION public.hr_trait_buy__ungated(p_trait_id text, p_slot integer, p_idem uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- BLAST RADIUS, not balance. Two traits exist today and each is
  -- once-per-character FOREVER, so this ceiling is structurally unreachable and
  -- says so out loud. It is here because the clamp is the house pattern
  -- (clan_deposit, hr_unlock_buy) and because the day a third trait lands nobody
  -- will re-derive it: a character acquiring 8 permanent traits in one day is
  -- not play, whatever the catalogue grows to.
  c_max_traits_per_day constant int := 8;

  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_cat    public.hr_traits%rowtype;
  v_st     public.player_state%rowtype;
  v_cached jsonb;
  v_have   bigint;
  v_purse  bigint;
  v_owned  bigint;
  v_today  int;
  v_ae     jsonb := null;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;

  -- ── (1) THE CATALOGUE, BEFORE ANY LOCK. A refusal that is a fact about the
  --        CATALOGUE needs no character, no lock and no row, so a client looping
  --        on a bad id cannot contend on a real player's state row.
  select * into v_cat from public.hr_traits where trait_id = p_trait_id;
  if v_cat.trait_id is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'trait_buy', 'unknown_trait',
      jsonb_build_object('trait', p_trait_id), 1);
    return jsonb_build_object('ok', false, 'error', 'unknown_trait', 'trait_id', p_trait_id);
  end if;

  -- ── (2) SERIALISE THIS CHARACTER — the SAME advisory lock key hr_apply,
  --        hr_unlock_buy, hr_bounty_spend and hr_set_auto_eat take. A lock on a
  --        different key is not a lock. Transaction-scoped, so it is released at
  --        commit, which is what makes it safe under the transaction pooler; and
  --        re-entrant, which is what lets §(8) call hr_set_auto_eat inside it.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- ── (3) IDEMPOTENCY, INSIDE THE LOCK. Read here rather than before it so two
  --        simultaneous retries of one gesture cannot both miss the cache: the
  --        loser waits on the advisory lock and then sees the winner's row.
  --        ONLY SUCCESSES ARE CACHED (see §8 of the write path), so "you are 5
  --        Marks short" stays retryable the moment the Marks arrive.
  if p_idem is not null then
    -- IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY.
    -- player_intents is ONE namespace for every verb in this database, so a key
    -- claimed by another intent (or the same intent on another slot) must be
    -- REFUSED, not answered with that intent's decision. Same comparison hr_apply
    -- has carried since apply-engine §S6; the helper is the one copy of the rule.
    -- A NULL answer means "no cached decision" and the body proceeds as before.
    select public.hr_intent_replay(v_uid, v_slot, p_idem, 'trait_buy:' || v_cat.trait_id) into v_cached;
    if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
    if v_cached is not null then
      return v_cached || jsonb_build_object('replayed', true);
    end if;
  end if;

  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── (4) ALREADY OWNED — A REFUSAL, NOT A NO-OP. A no-op that charged would
  --        be a refund ticket; a no-op that did not would still answer ok:true
  --        and the client would render a purchase that never happened.
  select coalesce(value, 0) into v_owned from public.player_progress
   where user_id = v_uid and slot = v_slot
     and kind = 'flag' and key = 'trait:' || v_cat.trait_id and period_key = '';
  if coalesce(v_owned, 0) > 0 then
    return jsonb_build_object('ok', false, 'error', 'already_owned', 'trait_id', v_cat.trait_id);
  end if;

  -- ── (5) THE PREREQUISITE, read from the catalogue and compared against the
  --        character's OWN server-side rows. A tiered trait is priced as an
  --        UPGRADE, so selling tier II to someone who skipped tier I hands out
  --        the entry tier for free. The error carries the required id in its
  --        NAME (`requires:<id>`) because the client renders it directly.
  if v_cat.req_trait is not null then
    select coalesce(value, 0) into v_have from public.player_progress
     where user_id = v_uid and slot = v_slot
       and kind = 'flag' and key = 'trait:' || v_cat.req_trait and period_key = '';
    if coalesce(v_have, 0) <= 0 then
      return jsonb_build_object('ok', false, 'error', 'requires:' || v_cat.req_trait,
        'trait_id', v_cat.trait_id, 'requires', v_cat.req_trait);
    end if;
  end if;

  -- ── (6) THE PER-DAY CLAMP, read from the APPEND-ONLY LEDGER rather than from
  --        a counter this function maintains (the clan_deposit pattern — a
  --        counter is a second source of truth that can be reset). Range-scanned
  --        on `at` so it uses the (user_id, slot, at) index rather than calling a
  --        function on every row.
  select count(*) into v_today from public.player_ledger
   where user_id = v_uid and slot = v_slot and kind = 'trait'
     and at >= ((date_trunc('day', (now() at time zone 'utc'))) at time zone 'utc');
  if v_today >= c_max_traits_per_day then
    perform public.hr_record_rejection(v_uid, v_slot, 'trait_buy', 'trait_daily_cap',
      jsonb_build_object('used', v_today, 'limit', c_max_traits_per_day), 1);
    return jsonb_build_object('ok', false, 'error', 'trait_daily_cap',
      'used', v_today, 'limit', c_max_traits_per_day);
  end if;

  -- ── (7) THE DEBIT. Computed under the lock, from the server's OWN row and the
  --        server's OWN catalogue. Nothing here is a number the caller supplied,
  --        and neither balance can go negative: the check and the update are one
  --        statement apart inside one transaction holding the row lock.
  if v_cat.currency = 'marks' then
    v_have := coalesce(v_st.marks, 0);
    if v_have < v_cat.cost then
      perform public.hr_record_rejection(v_uid, v_slot, 'trait_buy', 'insufficient_marks',
        jsonb_build_object('trait', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have), 1);
      return jsonb_build_object('ok', false, 'error', 'insufficient_marks',
        'trait_id', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have);
    end if;
    update public.player_state
       set marks = marks - v_cat.cost, version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;
  else
    -- THE ACCOUNT PURSE pays (2026-12-15-account-gold.sql), under its row lock, never below 0.
    v_purse := public.hr_purse_move(v_uid, -v_cat.cost, 0);
    v_have := coalesce(v_purse, public.hr_purse_of(v_uid));
    if v_purse is null then
      perform public.hr_record_rejection(v_uid, v_slot, 'trait_buy', 'insufficient_gold',
        jsonb_build_object('trait', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have), 1);
      return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
        'trait_id', v_cat.trait_id, 'cost', v_cat.cost, 'have', v_have);
    end if;
    update public.player_state
       set version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;
  end if;
  -- ⚠ accrued_to IS NOT TOUCHED. A purchase is not an activity change, so the
  --   unpaid accrual window survives it; stamping it here would confiscate every
  --   buyer's elapsed time, silently.

  -- ── (8) THE GRANT. kind='flag', period_key='' — the EXACT shape
  --        hr_auto_eat_tier reads, and the shape the player_progress_unlock_guard
  --        trigger independently polices against hr_unlocks. `greatest` is
  --        written out even though (4) already refuses a re-buy: (4) is the
  --        PURCHASE decision, this is the STORAGE rule.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, v_slot, 'flag', 'trait:' || v_cat.trait_id, 1, '', null, now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = greatest(pp.value, excluded.value), updated_at = now();

  -- ── (9) THE JOURNAL. ONE row per purchase. gold_in/xp_in/qty_in/gems_in are
  --        ZERO and written explicitly: this transaction MINTED nothing, which
  --        is a different fact from "unstamped". For a marks purchase the signed
  --        amount rides meta.marks — the same place hr_bounty_spend files a
  --        marks movement, so the two cannot be summed differently.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, meta)
  values
    (v_uid, v_slot, 'trait', 'trait_buy:' || v_cat.trait_id,
     case when v_cat.currency = 'gold' then -v_cat.cost else 0 end, 0, 0, 0, 0,
     case when v_cat.currency = 'gold' and v_cat.cost <> 0 then v_purse end,
     jsonb_build_object('trait', v_cat.trait_id, 'name', v_cat.name,
                        'currency', v_cat.currency, 'cost', v_cat.cost,
                        'marks', case when v_cat.currency = 'marks' then -v_cat.cost else 0 end,
                        'idem', p_idem));

  -- ── (10) Auto-Eat left with the away model (2026-10-22-hunt-sessions-delete-away.sql):
  --         a trait switches nothing on; the answer's `auto_eat` is null.

  -- ── (11) THE ENVELOPE. Balances are RE-READ from the row (not arithmetic on a
  --         pre-update snapshot) because hr_set_auto_eat may have bumped the
  --         version between them. `owned` is the character's WHOLE trait set, so
  --         one answer hydrates the client rather than one delta.
  select * into v_st from public.player_state where user_id = v_uid and slot = v_slot;
  v_result := jsonb_build_object(
    'ok', true, 'trait_id', v_cat.trait_id, 'name', v_cat.name,
    'currency', v_cat.currency, 'cost', v_cat.cost,
    'marks', v_st.marks, 'gold', public.hr_purse_of(v_uid), 'version', v_st.version, 'slot', v_slot,
    'auto_eat', v_ae,
    'owned', coalesce((
      select jsonb_agg(substring(pp.key from 7) order by pp.key)
        from public.player_progress pp
       where pp.user_id = v_uid and pp.slot = v_slot
         and pp.kind = 'flag' and pp.period_key = ''
         and pp.key like 'trait:%' and pp.value > 0), '[]'::jsonb));

  -- ⚠ SUCCESSES ONLY. A cached refusal would make "not enough Marks" permanent
  --   for that key; the client generates a fresh key per gesture, so a genuine
  --   retry of the SAME gesture still replays this envelope and debits nothing.
  if p_idem is not null then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, v_slot, 'trait_buy:' || v_cat.trait_id, v_result, now())
      on conflict (user_id, intent_id) do nothing;
  end if;

  return v_result;
end $function$;

-- ── public.clan_contribute__ungated(uuid,bigint,integer) ──
CREATE OR REPLACE FUNCTION public.clan_contribute__ungated(p_clan_id uuid, p_amount bigint, p_slot integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_call_clamp constant bigint := 10000000;
  c_day_clamp  constant bigint := 10000000;
  v_uid      uuid := auth.uid();
  v_slot     int  := coalesce(p_slot, 0);
  v_spent    bigint;
  v_budget   bigint;
  v_amount   bigint;
  v_gold     bigint;
  v_treasury bigint;
  v_level    int;
  v_next     bigint;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > c_call_clamp then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  if not exists (select 1 from public.clan_members
                  where clan_id = p_clan_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  -- One advisory lock per (member, slot): serialises this member's day-budget
  -- read against their own concurrent contributions. Keyed on slot too so two
  -- characters of one account do not share a lock.
  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hr:clan_contribute:' || v_uid::text || ':' || v_slot::text, 0));

  -- Per-member per-UTC-day budget, read from the append-only ledger (the same
  -- clamp discipline as clan_deposit / the market's transfer caps).
  select coalesce(sum(l.qty), 0) into v_spent
    from public.clan_ledger l
   where l.clan_id = p_clan_id and l.user_id = v_uid and l.kind = 'contribute'
     and l.at >= (date_trunc('day', (now() at time zone 'utc')) at time zone 'utc');

  v_budget := greatest(0, c_day_clamp - v_spent);
  if v_budget <= 0 then
    return jsonb_build_object('ok', false, 'error', 'daily_cap',
      'spent_today', v_spent, 'day_cap', c_day_clamp);
  end if;
  v_amount := least(p_amount, v_budget);

  -- ── VALIDATE EVERYTHING BEFORE THE FIRST WRITE ──
  -- Lock the clan row first so a missing clan is refused with nothing debited
  -- (an early return AFTER a debit would destroy the caller's gold — the trade
  -- must be all-or-nothing, exactly like hr_market_buy).
  select treasury, level into v_treasury, v_level
    from public.clans where id = p_clan_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_clan');
  end if;

  -- The acting hero's row (it must exist), then the ACCOUNT purse (2026-12-15-account-gold.sql):
  -- the debit lands under the purse's row lock only when it stays >= 0.
  perform 1 from public.player_state where user_id = v_uid and slot = v_slot for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── APPLY (conserving): debit payer, credit treasury, journal both sides ──
  v_gold := public.hr_purse_move(v_uid, -v_amount, 0);
  if v_gold is null then
    return jsonb_build_object('ok', false, 'error', 'insufficient_gold',
      'have', public.hr_purse_of(v_uid), 'need', v_amount);
  end if;
  update public.player_state set updated_at = now()
   where user_id = v_uid and slot = v_slot;

  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, purse, meta)
  values
    (v_uid, v_slot, 'clan', 'clan_contribute:' || p_clan_id::text,
     -v_amount, v_gold,
     jsonb_build_object('clan_id', p_clan_id, 'transfer', true));

  update public.clans set treasury = treasury + v_amount
    where id = p_clan_id returning treasury, level into v_treasury, v_level;

  update public.clan_members set contributed = contributed + v_amount
    where clan_id = p_clan_id and user_id = v_uid;

  insert into public.clan_ledger (clan_id, user_id, kind, qty)
    values (p_clan_id, v_uid, 'contribute', v_amount);

  -- Level cascade preserved verbatim: 10000 * 4^(level-1).
  v_next := 10000 * (4 ^ (v_level - 1))::bigint;
  while v_treasury >= v_next and v_level < 10 loop
    v_level := v_level + 1;
    update public.clans set level = v_level where id = p_clan_id;
    v_next := 10000 * (4 ^ (v_level - 1))::bigint;
  end loop;

  return jsonb_build_object('ok', true,
    'treasury', v_treasury, 'level', v_level,
    'accepted', v_amount, 'requested', p_amount,
    'gold_spent', v_amount, 'gold_left', v_gold,
    'spent_today', v_spent + v_amount, 'day_cap', c_day_clamp);
end $function$;

-- ── public.hr_unlock_buy(uuid,integer,bigint,uuid,text) ──
CREATE OR REPLACE FUNCTION public.hr_unlock_buy(p_user uuid, p_slot integer, p_version bigint, p_intent_id uuid, p_offer_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- BLAST RADIUS, not balance (the clan_deposit rule, and hr_apply's own).
  -- 45 sellable offers exist in the entire game and each one is once per
  -- character forever, so the LIFETIME ceiling for an honest character is 45.
  -- A day in which one character acquires 20 permanent unlocks is not play; it
  -- is an engine that has stopped being told no. Set far above honest play and
  -- far below "the whole ladder in an afternoon".
  -- per-NAMESPACE now (bank ladder is 30/lifetime) — the count in §(b) is
  -- scoped to the offer's own namespace, so a legitimate 30-rung bank climb in
  -- one day cannot be starved by (or starve) purchases in another namespace.
  c_max_unlocks_per_day constant int := 32;

  v_uid    uuid;
  v_role   text;
  v_slot   int := coalesce(p_slot, 0);
  v_off    public.hr_unlock_offers%rowtype;
  v_cat    public.hr_unlocks%rowtype;
  v_st     public.player_state%rowtype;
  v_prev   jsonb;
  v_prev_intent text;
  v_prev_slot   int;
  v_claimed boolean := false;
  v_intent text;
  v_out    jsonb;
  v_msg    text; v_det text; v_sqlstate text;
  v_cur    bigint;
  v_next   bigint;
  v_tier   int;
  v_have   bigint;
  v_purse  bigint;
  v_n      bigint;
  k        text;
  v_day    text;
  v_today  int;
  v_rungs  int[];
  v_lvl    int;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_of(coalesce(p_user, auth.uid()), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  -- ── (0) THE IDENTITY SEAM. hr_apply's, verbatim in effect: the engine may
  --        act for a user it names because it has already verified that user's
  --        JWT and holds no table privilege of its own. Nobody else may name a
  --        user at all. current_user is the OWNER inside a definer function, so
  --        the ROLE GUC is what is read.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      perform public.hr_record_rejection(v_uid, v_slot, 'unlock_buy', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_intent_id');
  end if;

  -- ── (1) THE OFFER, BEFORE ANY LOCK. A refusal that is a fact about the
  --        CATALOGUE needs no character, no lock and no row: answering it here
  --        means a client looping on a bad id cannot contend on a real player's
  --        state row. `unknown` and `unsupported` are two different answers on
  --        purpose — a player told "no such offer" about a gem-priced cosmetic
  --        files a bug against the wrong system.
  if p_offer_id is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_offer');
  end if;
  select * into v_off from public.hr_unlock_offers where offer_id = p_offer_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_offer',
                              'detail', jsonb_build_object('offer', p_offer_id));
  end if;
  if v_off.refusal is not null then
    return jsonb_build_object('ok', false, 'error', 'offer_unsupported',
             'detail', jsonb_build_object('offer', p_offer_id, 'reason', v_off.refusal));
  end if;
  select * into v_cat from public.hr_unlocks where unlock_id = v_off.unlock_id;
  if not found or v_cat.progress_kind is null then
    -- The generated cross-check makes this unreachable; it is a REFUSAL rather
    -- than an assertion because the two catalogues are generated by two tools
    -- from two sources, and the failure mode of trusting that is a player
    -- charged for a row the storage guard then refuses.
    return jsonb_build_object('ok', false, 'error', 'offer_unsupported',
             'detail', jsonb_build_object('offer', p_offer_id, 'reason', 'uncatalogued_unlock'));
  end if;

  -- ── (2) RATE. The `apply` budget, deliberately NOT a new namespace: a second
  --        writer with its own 240/min would double a compromised engine's
  --        reachable write rate. Outside the protected block, like hr_apply's,
  --        so spamming refusals is not free.
  --        (C2) RECORDED BEFORE THE RETURN, and before the intent claim, or a
  --        rate-limited caller leaves no durable trace anywhere: this return is
  --        ahead of player_intents, and player_intents is pruned after 24h
  --        regardless. Sustained rate limiting is the loudest automation signal
  --        this server produces.
  --        (S6) …but SAMPLED — the 1st, 10th and 50th rejection in the window,
  --        then every 1000th — because under the retry storm this exists to
  --        detect, one write per rejected call is a row lock plus a WAL record
  --        per request, all serialised on one tuple.
  if not public.hr_rate_ok(v_uid, 'apply', 240, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'unlock_buy', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ── (3) SERIALISE THIS CHARACTER — the SAME advisory lock key hr_apply
  --        takes. Two different keys would let a purchase and an accrual run
  --        concurrently on one character, which is exactly the read-modify-write
  --        this whole architecture exists to prevent.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));

  -- HOUSE-HOME (2026-11-29-house-home.sql): the home (property tiers and rooms) is
  -- the ACCOUNT's, one per account (Tyler 2026-10-15). A home purchase also takes
  -- the account home lock AFTER the character lock (order: character -> home), so
  -- two heroes of one account buying one rung serialise: one pays, one is told
  -- already_owned.
  if v_cat.namespace in ('room', 'property') then
    perform pg_advisory_xact_lock(hashtextextended('hr:home:' || v_uid::text, 0));
  end if;

  -- ── (4) IDEMPOTENCY, hr_apply's rules on hr_apply's table. The name carries
  --        the offer AND the rung, because `intent_mismatch` compares exactly
  --        this string and the rung is what changes what the write DOES.
  v_intent := 'unlock_buy:' || v_off.offer_id || ':' || v_off.value;
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;
  v_claimed := true;

  -- ══ THE PROTECTED BLOCK ═══════════════════════════════════════════════
  -- All-or-nothing. Every rejection raises through hr_reject (SQLSTATE HR000)
  -- and the handler undoes the whole block, so there is no state in which the
  -- gold left and the rung did not arrive.
  begin
    select * into v_st from public.player_state
      where user_id = v_uid and slot = v_slot for update;
    if not found then perform public.hr_reject('no_character'); end if;

    -- (a) OPTIMISTIC CONCURRENCY — MANDATORY. A missing version IS a conflict.
    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict', jsonb_build_object('version', v_st.version));
    end if;

    -- (b) THE PER-DAY CLAMP, read from the APPEND-ONLY LEDGER rather than from a
    --     counter this function maintains — the clan_deposit pattern. A counter
    --     is a second source of truth that can be reset; the ledger is the
    --     record the audit reads anyway. Bounded by the user+slot+at index.
    --     ⚠ NAMESPACE-SCOPED (b354.1). The ceiling is per NAMESPACE, not per
    --     character-day: the bank ladder alone is 30 rungs and a player is
    --     entitled to climb it in one sitting, so a global 20/day would refuse a
    --     legitimate bank run. The count therefore joins the ledger's
    --     meta->>'unlock' back to public.hr_unlocks and keeps only rows in the
    --     SAME namespace as the offer being bought (v_cat.namespace). Cross-
    --     namespace purchases no longer contend for one budget, and each
    --     namespace still cannot exceed c_max_unlocks_per_day on its own.
    v_day := public.hr_utc_day_key(now());
    select count(*) into v_today from public.player_ledger pl
      join public.hr_unlocks u on u.unlock_id = pl.meta->>'unlock'
     where pl.user_id = v_uid and pl.slot = v_slot
       and pl.kind = 'shop' and pl.intent like 'unlock\_buy:%'
       and public.hr_utc_day_key(pl.at) = v_day
       and u.namespace = v_cat.namespace;
    if v_today >= c_max_unlocks_per_day then
      perform public.hr_reject('unlock_daily_cap',
        jsonb_build_object('used', v_today, 'limit', c_max_unlocks_per_day,
                           'day', v_day, 'namespace', v_cat.namespace));
    end if;

    -- (c) THE MERGE, AND IT IS THE WHOLE POINT: GREATEST, NEVER +=.
    --     `v_cur` is read under the row lock taken above, so two concurrent
    --     purchases of the same rung cannot both see 0.
    -- HOUSE-HOME: a home rung already held is the account's highest (any hero's row).
    select max(value) into v_cur from public.player_progress
     where user_id = v_uid and (slot = v_slot or v_cat.namespace in ('room', 'property'))
       and kind = v_cat.progress_kind and key = v_off.unlock_id and period_key = '';
    v_cur := coalesce(v_cur, 0);

    if v_cur >= v_off.value then
      -- ⚠ A REFUSAL, NOT A NO-OP. GREATEST would make a second purchase
      --   harmless to the ROW and still charge for it; a silent no-op that did
      --   not charge would still bump the version and answer ok:true, so the
      --   client would render a purchase that never happened. Both are worse
      --   than a name.
      perform public.hr_reject('already_owned',
        jsonb_build_object('unlock', v_off.unlock_id, 'have', v_cur, 'wanted', v_off.value));
    end if;

    -- (d) RUNG ORDER. The ladder is the CATALOGUE's, never a number here: the
    --     next legal rung is the smallest one above what the character holds.
    --     Without this, a player buys rung 5 with rung 5's gold and skips four
    --     purchases — which is not free, but it IS the ladder not being a
    --     ladder. `merge='max'` is the only shape with a ladder; a flag or a
    --     count has none and this check is correctly vacuous for it.
    if v_cat.merge = 'max' then
      v_rungs := coalesce(v_cat.rungs, array[]::int[]);
      select min(r) into v_next from unnest(v_rungs) r where r > v_cur;
      if v_next is null or v_off.value <> v_next then
        perform public.hr_reject('rung_skipped',
          jsonb_build_object('unlock', v_off.unlock_id, 'have', v_cur,
                             'wanted', v_off.value, 'next', v_next));
      end if;
    end if;

    -- (e) THE PREREQUISITES. Read from the generated catalogue, compared
    --     against the character's OWN server-side state.
    --
    --     ⚠ THE PROPERTY TIER IS DERIVED THE SAME WAY hr_perks_of DERIVES IT —
    --       max over the `property` namespace — rather than from a column
    --       somebody keeps in step. A second definition of "what tier is this
    --       player" is a second answer.
    if coalesce(v_off.req_property_tier, 0) > 0 then
      -- HOUSE-HOME: the property tier is the ACCOUNT's home (the chests' gate too).
      v_tier := public.hr_account_property_tier(v_uid);
      if v_tier < v_off.req_property_tier then
        perform public.hr_reject('prereq_property_tier',
          jsonb_build_object('have', v_tier, 'need', v_off.req_property_tier,
                             'offer', v_off.offer_id));
      end if;
    end if;

    -- ⚠ THE SKILL PREREQUISITE (companion unlocks, slice 4, 2026-08-19).
    --   The FIRST gold spend gated on a SKILL LEVEL. It mirrors the property-
    --   tier gate directly above and reads the character's OWN server-side level
    --   the EXACT way hr_apply's equip and activity gates do — hr_level_from_xp
    --   over player_skills — never a client value. A missing skill row is level
    --   1 (coalesce), the same default those gates use.
    --
    --   ⚠ ORDERED AFTER RUNG-ORDER (§d), like the tier gate, ON PURPOSE: a
    --     skipped rung must answer 'rung_skipped', not 'prereq_skill_level', so
    --     the ladder failure is diagnosed as a ladder failure. (Companions are
    --     single-rung today, so this ordering is currently only a discipline —
    --     but it is the discipline the tier gate follows and the next multi-rung
    --     skill-gated ladder will depend on it.)
    --
    --   Both columns are NULL for an ungated offer, so the whole block is
    --   skipped and every existing offer is unaffected.
    if v_off.req_skill is not null then
      select public.hr_level_from_xp(s.xp) into v_lvl
        from public.player_skills s
       where s.user_id = v_uid and s.slot = v_slot and s.skill_id = v_off.req_skill;
      if coalesce(v_lvl, 1) < coalesce(v_off.req_skill_level, 0) then
        perform public.hr_reject('prereq_skill_level',
          jsonb_build_object('skill', v_off.req_skill, 'have', coalesce(v_lvl, 1),
                             'need', v_off.req_skill_level, 'offer', v_off.offer_id));
      end if;
    end if;

    -- The blueprint is REQUIRED and CONSUMED, exactly as src/legacy.js
    -- upgradeRoom consumes it. It is charged below with the rest of the item
    -- cost; here it only has to be present, so that "you need a blueprint" is a
    -- different answer from "you are short of oak logs".
    if v_off.req_item is not null then
      select coalesce(qty, 0) into v_have from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = v_off.req_item;
      if coalesce(v_have, 0) < 1 then
        perform public.hr_reject('prereq_item',
          jsonb_build_object('item_id', v_off.req_item, 'offer', v_off.offer_id));
      end if;
    end if;

    -- (f) THE DEBITS. Gold first, then every item line, then the blueprint.
    --     Nothing here is a number the caller supplied. The gold is the ACCOUNT purse
    --     (2026-12-15-account-gold.sql): hr_purse_move takes its row lock and lands the
    --     debit only when it stays >= 0; a refusal rolls the block back.
    if coalesce(v_off.gold, 0) > 0 then
      v_purse := public.hr_purse_move(v_uid, -v_off.gold, 0);
      if v_purse is null then
        perform public.hr_reject('insufficient_gold',
          jsonb_build_object('have', public.hr_purse_of(v_uid), 'need', v_off.gold));
      end if;
    end if;

    for k, v_n in select key, coalesce(nullif(value,'')::bigint, 0)
                    from jsonb_each_text(coalesce(v_off.items, '{}'::jsonb)) loop
      if v_n <= 0 then continue; end if;
      select qty into v_have from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = k for update;
      v_have := coalesce(v_have, 0);
      if v_have < v_n then
        perform public.hr_reject('insufficient_item',
          jsonb_build_object('item_id', k, 'have', v_have, 'need', v_n));
      end if;
      if v_have = v_n then
        delete from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = k;
      else
        update public.player_inventory set qty = v_have - v_n
         where user_id = v_uid and slot = v_slot and item_id = k;
      end if;
    end loop;

    if v_off.req_item is not null then
      select qty into v_have from public.player_inventory
       where user_id = v_uid and slot = v_slot and item_id = v_off.req_item for update;
      v_have := coalesce(v_have, 0);
      if v_have < 1 then
        -- Reachable only if the blueprint was ALSO an item cost line and the
        -- loop above spent the last one. Refused rather than silently skipped:
        -- a consumed prerequisite that was not there is a free upgrade.
        perform public.hr_reject('insufficient_item',
          jsonb_build_object('item_id', v_off.req_item, 'have', v_have, 'need', 1));
      end if;
      if v_have = 1 then
        delete from public.player_inventory
         where user_id = v_uid and slot = v_slot and item_id = v_off.req_item;
      else
        update public.player_inventory set qty = v_have - 1
         where user_id = v_uid and slot = v_slot and item_id = v_off.req_item;
      end if;
    end if;

    -- (g) THE GRANT. `greatest` is written out even though (c) already refuses
    --     a downgrade, because the two protect different things: (c) is the
    --     PURCHASE decision ("you own this"), this is the STORAGE rule ("a
    --     level never goes backwards"), and the storage guard trigger will
    --     refuse a regression whatever this statement says. Three independent
    --     statements of one invariant, none of them load-bearing alone.
    insert into public.player_progress as pp (user_id, slot, kind, key, period_key, value)
      values (v_uid, v_slot, v_cat.progress_kind, v_off.unlock_id, '', v_off.value)
    on conflict (user_id, slot, kind, key, period_key)
      do update set value = greatest(pp.value, excluded.value), updated_at = now();

    -- (h) THE STATE ROW. Version, updated_at — and NOTHING ELSE (the gold moved at (f)).
    --     ⚠ accrued_to IS NOT TOUCHED. A purchase is not an activity change, so
    --       the unpaid accrual window survives it; stamping it here would
    --       confiscate every buyer's elapsed time, silently (intents.js rule 3).
    update public.player_state
       set version = version + 1,
           updated_at = now()
     where user_id = v_uid and slot = v_slot;

    -- (i) THE JOURNAL. ONE row, kind='shop' — the same kind shop_buy and
    --     vendor_sell file under, because the rollup groups on `kind` and this
    --     is the same surface: the NPC shop. The direction is in the signed
    --     gold. `gold_in`/`xp_in`/`qty_in` are ZERO and written explicitly:
    --     NULL in those columns means "not written by hr_apply", and this row
    --     WAS written by an engine RPC — it consumed no inflow budget because
    --     it minted nothing, which is a different fact from "unstamped".
    insert into public.player_ledger
      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, purse, gold_kind, meta)
    values
      (v_uid, v_slot, 'shop', v_intent, -v_off.gold, 0, 0, 0,
       case when coalesce(v_off.gold, 0) <> 0 then v_purse end,
       case when coalesce(v_off.gold, 0) = 0 then null
            when v_off.unlock_id like 'property:%' or v_off.unlock_id like 'room:%' then 'house'
            else 'shop' end,
       jsonb_build_object('offer', v_off.offer_id, 'unlock', v_off.unlock_id,
                          'rung', v_off.value, 'prev', v_cur,
                          'items', coalesce(v_off.items, '{}'::jsonb),
                          'blueprint', v_off.req_item));

    -- (j) WHAT THE SERVER CHARGED, STATED BY THE SERVER (Security C4).
    --     The Edge Function renders a receipt for this purchase and it must not
    --     build one out of its own catalogue: two copies of a price is one copy
    --     too many, and the copy the player SEES would then be the one nobody
    --     re-validates. A receipt built from this object is correct even when
    --     the Edge catalogue is stale, wrong, or has drifted from the table the
    --     charge came out of — tests/unlock-buy.mjs proves exactly that by
    --     mutating the Edge price and requiring the receipt to stay right.
    v_out := public.hr_state_of(v_uid, v_slot)
             || jsonb_build_object('charged', jsonb_build_object(
                  'offer',  v_off.offer_id,
                  'name',   v_off.name,
                  'unlock', v_off.unlock_id,
                  'rung',   v_off.value,
                  -- POSITIVE here (what was taken); the Edge renders it
                  -- negative, the same sign its delta would have carried.
                  'gold',   v_off.gold,
                  'items',  coalesce(v_off.items, '{}'::jsonb),
                  'blueprint', v_off.req_item));

  exception
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    -- The storage guard raises check_violation ON PURPOSE (artisan model §3) so
    -- that it lands here rather than escaping as a 500. If it ever fires, this
    -- function proposed a row the guard refused — an engine bug, reported with
    -- its sqlstate rather than swallowed.
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_unlock_write',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  -- ── (5) RECORD THE DECISION under the key, OUTSIDE the protected block so it
  --        survives a rejection — and RELEASE the key on a version conflict,
  --        b346's rule and for b346's reason: a version conflict is a statement
  --        about the caller's READ, it rolled back in full, and the defined
  --        recovery is "re-read and try again". Storing it turns an ordinary
  --        concurrency outcome into a 25-hour lockout for that key. Narrow:
  --        `v_claimed` means THIS call inserted the row, so a mismatch against
  --        somebody's stored SUCCESS can never free it.
  if v_claimed
     and coalesce(v_out->>'ok', 'false') <> 'true'
     and v_out->>'error' = 'version_conflict' then
    delete from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  else
    update public.player_intents
       set result = case when coalesce(v_out->>'ok','false') = 'true'
                         then jsonb_build_object('ok', true)
                         else v_out end
     where user_id = v_uid and intent_id = p_intent_id;
  end if;

  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, v_out->>'error',
                                       v_out - 'ok' - 'error');
  end if;

  return v_out;
end $function$;

-- ── public.hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint) ──
CREATE OR REPLACE FUNCTION public.hr_market_buy(p_user uuid, p_slot integer, p_version bigint, p_intent_id uuid, p_listing_id uuid, p_qty bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- ⚠ BLAST RADIUS, NOT BALANCE — and these are NOT hr_day_budget_check.
  --   That ceiling exists to bound a compromised engine MINTING gold, and it is
  --   deliberately not consulted here, for a reason that would otherwise be a
  --   live griefing vector: market gold is CONSERVED (buyer -gross, seller +net,
  --   tax burned), so charging a sale against the seller's daily INFLOW budget
  --   would let a stranger buy a seller's cheap listings and lock them out of
  --   their own accrual for the rest of the day. Transfers get their own
  --   dimension, on both sides, so that a runaway loop is still bounded without
  --   one player's spending being able to consume another's mint budget.
  c_max_spend_per_day    constant bigint := 1000000000;   -- gold a buyer may send
  c_max_proceeds_per_day constant bigint := 1000000000;   -- gold a seller may receive

  v_uid   uuid;
  v_role  text;
  v_slot  int := coalesce(p_slot, 0);
  v_route public.market_listings%rowtype;
  v_row   public.market_listings%rowtype;
  v_cfg   public.hr_market_config%rowtype;
  v_st    public.player_state%rowtype;
  v_gross_n numeric;
  v_gross bigint; v_tax bigint; v_net bigint;
  v_stacks int; v_rows int;
  v_day   text; v_spent bigint; v_recv bigint;
  v_bpurse bigint; v_spurse bigint;
  v_prev  jsonb; v_prev_intent text; v_prev_slot int;
  v_claimed boolean := false;
  v_intent text;
  v_out   jsonb;
  v_msg text; v_det text; v_sqlstate text;
begin
  -- SETTLE-BEFORE-MUTATE (2026-09-28-settle-before-mutate.sql, Security F2). An
  -- unpaid window is priced at the state that existed during it, so nothing that
  -- moves a priced input lands while one is open. Refuses before anything else
  -- and writes nothing to the character. (A nested block, not an exception
  -- block: no subtransaction on the accepted path.)
  declare v_settle jsonb := public.hr_settle_first_of(coalesce(p_user, auth.uid()), p_slot);
  begin
    if v_settle is not null then return v_settle; end if;
  end;
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role = 'hr_engine' then
    v_uid := coalesce(p_user, auth.uid());
  else
    v_uid := auth.uid();
    if p_user is not null and p_user is distinct from v_uid then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_buy', 'forbidden_impersonation',
        jsonb_build_object('claimed_user', p_user, 'role', v_role));
      return jsonb_build_object('ok', false, 'error', 'forbidden_impersonation');
    end if;
  end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'not_signed_in'); end if;
  if p_intent_id is null then return jsonb_build_object('ok', false, 'error', 'missing_intent_id'); end if;
  if p_listing_id is null then return jsonb_build_object('ok', false, 'error', 'gone'); end if;
  if p_qty is null or p_qty <= 0 then return jsonb_build_object('ok', false, 'error', 'bad_qty'); end if;

  select * into v_cfg from public.hr_market_config;

  if not public.hr_rate_ok(v_uid, 'apply', 240, interval '1 minute') then
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, 'market_buy', 'rate_limited',
        jsonb_build_object('limit', 240, 'per', '1 minute'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply') - 240));
    end if;
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ⚠ (R) THE REPLAY PRE-CHECK, AHEAD OF THE ROUTING READ. See the long note in
  --   §6: a buy that consumed the whole listing DELETES it, so a retry of that
  --   exact intent reached the routing read first and answered `gone` — the
  --   client asking "did my purchase land?" and being told "somebody else bought
  --   it". Nothing was applied twice and the ANSWER was still wrong, which is
  --   the half a conservation check cannot see. Found by tests/market-v2.mjs M6.
  --   Unlocked and safe: it short-circuits only on an ALREADY-DECIDED intent and
  --   never claims. The intent name is derivable from the request alone.
  v_intent := 'market_buy:' || p_listing_id::text || ':' || p_qty::text;
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;

  -- ROUTING READ, UNLOCKED (§4c) — it exists only to learn WHOSE advisory lock
  -- to take second. Everything is re-read under the locks.
  select * into v_route from public.market_listings where id = p_listing_id;
  if not found then
    -- (M9) A SILENT REFUSAL LEAVES NO TRACE. `gone` is ordinary contention —
    --   someone bought the listing out from under this caller — so it is SAMPLED,
    --   the rate-limit branch's mechanism reused: hr_record_rejection aggregates
    --   one row per (character, code, day), but the UPDATE still costs a row lock,
    --   and a hot market makes `gone` frequent. hr_rate_sample_weight fires only
    --   at the caller's 1st, 10th, 50th, 1,000th… apply-bucket call this window
    --   (the gate already bumped it above), carrying a weight so the aggregate `n`
    --   still counts real events. Enough to see a pattern, cheap enough not to
    --   amplify (the game_events 1.6M-row lesson).
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'gone',
        jsonb_build_object('listing', p_listing_id, 'stage', 'routing'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'gone');
  end if;
  if v_route.seller_user_id = v_uid and v_route.seller_slot = v_slot then
    -- (S9) JOURNALLED. Buying your own listing is refused, but a refusal that
    -- leaves no trace is a refusal nobody can investigate: repeated
    -- `own_listing` is the wash-trading signature — someone establishing a fake
    -- price history, or probing whether the self-trade guard can be raced into
    -- paying the house tax to themselves. Aggregated per (character, code, day).
    perform public.hr_record_rejection(v_uid, v_slot, 'market_buy', 'own_listing',
      jsonb_build_object('listing', p_listing_id, 'item', v_route.item_id,
                         'qty', p_qty, 'ask_each', v_route.ask_each));
    return jsonb_build_object('ok', false, 'error', 'own_listing');
  end if;

  -- (1) BOTH ADVISORY LOCKS, IN CANONICAL ORDER (S16), AS TWO EXPLICIT CALLS
  --     UNDER AN EXPLICIT BRANCH (Security M8). Ordered by (user_id::text, slot)
  --     ascending so two players buying from each other request the SAME two locks
  --     in the SAME order and one waits instead of deadlocking.
  --     ⚠ WHY NOT AN ORDERED SUBQUERY. The first revision acquired both locks in
  --       one `perform pg_advisory_xact_lock(k) from (… order by u, s)`. That
  --       relies on the planner acquiring the lock function in the SORTED order —
  --       i.e. on volatile-function postponement past the Sort — which is planner
  --       behaviour, not a guarantee: a plan that evaluated the lock before the
  --       sort would take them in scan order, and two buyers crossing would then
  --       deadlock (40P01), an unhandled 500 in the MIDDLE of a value transfer.
  --       The comparison is spelled out and the two locks are separate statements
  --       so the order is the code's, not the optimiser's.
  --     ⚠ SAME-USER, DIFFERENT-SLOT is a real case (a player's slot 0 buying
  --       from their own slot 2) and it is allowed: they are different characters
  --       with different bags. The pair is DISTINCT by construction because the
  --       self-trade guard above rejected the equal (user, slot) case, so exactly
  --       one branch runs and two distinct keys are taken.
  if (v_uid::text, v_slot) < (v_route.seller_user_id::text, v_route.seller_slot) then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));
    perform pg_advisory_xact_lock(
      hashtextextended(v_route.seller_user_id::text || ':' || v_route.seller_slot::text, 0));
  else
    perform pg_advisory_xact_lock(
      hashtextextended(v_route.seller_user_id::text || ':' || v_route.seller_slot::text, 0));
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));
  end if;

  -- (2) THE LISTING, UNDER THE LOCKS. Everything from here is the row's, not
  --     the routing read's — including ask_each, which is the price the buyer
  --     is charged and the one number the caller most wants to author.
  select * into v_row from public.market_listings where id = p_listing_id for update;
  if not found then
    -- (M9) sampled — see the routing `gone` above for the mechanism and why.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'gone',
        jsonb_build_object('listing', p_listing_id, 'stage', 'locked'),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'gone');
  end if;
  if v_row.seller_user_id <> v_route.seller_user_id
     or v_row.seller_slot <> v_route.seller_slot then
    -- Unreachable: the columns are immutable (§1b trigger + §11(j)). Refused
    -- rather than asserted, because the failure mode of trusting it is a trade
    -- settled under one player's lock and credited to another's row. (M9) It is
    -- ALSO recorded UNCONDITIONALLY, not sampled: unlike `gone`/`expired`/
    -- `not_enough` this is not ordinary contention — reaching it means the
    -- immutability trigger was somehow bypassed, which is an incident.
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'listing_moved',
      jsonb_build_object('listing', p_listing_id,
                         'route', jsonb_build_object('u', v_route.seller_user_id, 's', v_route.seller_slot),
                         'locked', jsonb_build_object('u', v_row.seller_user_id, 's', v_row.seller_slot)));
    return jsonb_build_object('ok', false, 'error', 'listing_moved');
  end if;
  if v_row.expires_at <= now() then
    -- (M9) sampled — expiry racing a buy is ordinary contention.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'expired',
        jsonb_build_object('listing', p_listing_id),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if v_row.qty < p_qty then
    -- (M9) sampled — a partial-buy race that leaves fewer than asked is contention.
    if public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')) > 0 then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'not_enough',
        jsonb_build_object('listing', p_listing_id, 'available', v_row.qty, 'need', p_qty),
        public.hr_rate_sample_weight(public.hr_rate_over(v_uid, 'apply')));
    end if;
    return jsonb_build_object('ok', false, 'error', 'not_enough',
             'detail', jsonb_build_object('available', v_row.qty));
  end if;

  -- (3) THE CLAIM, under both locks. The intent name carries the LISTING and the
  --     COUNT — but NOT the price, deliberately: the price is a property of the
  --     listing id and cannot change while the row exists (no statement updates
  --     ask_each, §11(j)), so including it would only create a spurious mismatch
  --     class. The branches are repeated from the (R) pre-check because that one
  --     was unlocked: another call may have claimed this key in between, and the
  --     answer to that is `intent_in_flight`, not a second trade.
  select result, intent, slot into v_prev, v_prev_intent, v_prev_slot
    from public.player_intents
   where user_id = v_uid and intent_id = p_intent_id;
  if found then
    if v_prev_intent is distinct from v_intent or v_prev_slot is distinct from v_slot then
      perform public.hr_record_rejection(v_uid, v_slot, v_intent, 'intent_mismatch',
        jsonb_build_object('stored', v_prev_intent, 'sent', v_intent,
                           'stored_slot', v_prev_slot, 'sent_slot', v_slot));
      return jsonb_build_object('ok', false, 'error', 'intent_mismatch');
    end if;
    if v_prev is null then
      return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
    end if;
    if coalesce(v_prev->>'ok', 'false') = 'true' then
      return public.hr_state_of(v_uid, v_slot) || (v_prev - 'ok') || jsonb_build_object('replayed', true);
    end if;
    return v_prev || jsonb_build_object('replayed', true);
  end if;
  insert into public.player_intents (user_id, intent_id, slot, intent)
    values (v_uid, p_intent_id, v_slot, v_intent)
  on conflict (user_id, intent_id) do nothing;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'intent_in_flight');
  end if;
  v_claimed := true;

  begin
    -- (4) BOTH player_state ROWS, in canonical order, in ONE statement. The
    --     LockRows node sits above the Sort, so the rows really are locked in
    --     the sorted order rather than in whatever order the scan produced them.
    perform 1 from public.player_state
      where (user_id, slot) in ((v_uid, v_slot), (v_row.seller_user_id, v_row.seller_slot))
      order by user_id, slot
      for update;

    select * into v_st from public.player_state
     where user_id = v_uid and slot = v_slot;
    if not found then perform public.hr_reject('no_character'); end if;
    if p_version is null or p_version <> v_st.version then
      perform public.hr_reject('version_conflict', jsonb_build_object('version', v_st.version));
    end if;

    -- (5) THE ARITHMETIC (N2). In NUMERIC, which cannot overflow at all, and
    --     bounded against the config's gross ceiling BEFORE any cast to bigint.
    --     The superseded revision computed `v_gross * house_tax_bp` in bigint:
    --     at the config's own legal ceiling that is 1.5e19, past bigint's
    --     9.22e18, raising 22003 as an unhandled 500 for the BUYER — so any
    --     seller could craft a listing that 500s everyone who touched it.
    v_gross_n := p_qty::numeric * v_row.ask_each::numeric;
    if v_gross_n > v_cfg.max_gross::numeric then
      perform public.hr_reject('trade_too_large',
        jsonb_build_object('gross', v_gross_n, 'max_gross', v_cfg.max_gross));
    end if;
    v_gross := v_gross_n::bigint;
    -- THE GOLD SINK, ROUNDED UP (Game Designer ruling on Security cond. 12). ceil,
    -- not trunc: trunc lets a whole-number split to zero (sixty 1-gold buys paid 0
    -- tax; ceil makes them pay 60), and rounding in the SINK's favour is correct
    -- for an anti-inflation drain. NO max(1,…) floor — ceil(0)=0 keeps a disabled
    -- tax (house_tax_bp=0) disabled, which a floor would wrongly override. The §7(5)
    -- overflow guard is unaffected: ceil adds at most 1 to an already-bounded product.
    v_tax   := ceil(v_gross_n * v_cfg.house_tax_bp::numeric / 10000)::bigint;
    v_net   := v_gross - v_tax;

    -- (6) THE PER-DAY TRANSFER CLAMPS, both from the append-only ledger.
    v_day := public.hr_utc_day_key(now());
    select coalesce(sum(-gold), 0) into v_spent from public.player_ledger
     where user_id = v_uid and slot = v_slot
       and kind = 'trade' and intent like 'market\_buy:%'
       and public.hr_utc_day_key(at) = v_day;
    if v_spent + v_gross > c_max_spend_per_day then
      perform public.hr_reject('market_spend_daily_cap',
        jsonb_build_object('used', v_spent, 'need', v_gross,
                           'limit', c_max_spend_per_day, 'day', v_day));
    end if;
    select coalesce(sum(gold), 0) into v_recv from public.player_ledger
     where user_id = v_row.seller_user_id and slot = v_row.seller_slot
       and kind = 'trade' and intent like 'market\_sold:%'
       and public.hr_utc_day_key(at) = v_day;
    if v_recv + v_net > c_max_proceeds_per_day then
      -- ⚠ THE BUYER IS TOLD, because the buyer is the caller. Named distinctly
      --   from the spend cap so a support ticket can tell "you have spent
      --   enough today" from "this seller has been paid enough today".
      perform public.hr_reject('market_proceeds_daily_cap',
        jsonb_build_object('seller_used', v_recv, 'need', v_net,
                           'limit', c_max_proceeds_per_day, 'day', v_day));
    end if;

    -- (7) BUYER: funds, from the buyer's ACCOUNT purse (2026-12-15-account-gold.sql). Both
    --     accounts' purses are locked in user order first (one lock when a hero buys from
    --     its own account), so two trades between the same two accounts queue, never cycle.
    perform public.hr_purse_lock(least(v_uid, v_row.seller_user_id));
    perform public.hr_purse_lock(greatest(v_uid, v_row.seller_user_id));
    v_bpurse := public.hr_purse_move(v_uid, -v_gross, 0);
    if v_bpurse is null then
      perform public.hr_reject('insufficient_gold',
        jsonb_build_object('have', public.hr_purse_of(v_uid), 'need', v_gross));
    end if;
    -- THE BUYER'S JOURNAL ROW, written at once: it states the purse after THIS move (the
    -- seller's credit below may be the same purse).
    insert into public.player_ledger
      (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, gems_in, purse, meta)
    values
      (v_uid, v_slot, 'trade', v_intent, v_row.item_id, p_qty, -v_gross, 0, 0, 0, 0,
       case when v_gross <> 0 then v_bpurse end,
       jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each,
                          'counterparty', v_row.seller_user_id, 'transfer', true,
                          'self_trade', v_row.seller_user_id = v_uid));

    update public.player_state set version = version + 1, updated_at = now()
     where user_id = v_uid and slot = v_slot;
    insert into public.player_inventory as pi (user_id, slot, item_id, qty)
      values (v_uid, v_slot, v_row.item_id, p_qty)
      on conflict (user_id, slot, item_id) do update set qty = pi.qty + excluded.qty;

    select count(*) into v_stacks from (
      select 1 from public.player_inventory
       where user_id = v_uid and slot = v_slot
       limit coalesce(v_st.bank_cap, 100) + 1) s;
    if v_stacks > coalesce(v_st.bank_cap, 100) then
      perform public.hr_reject('bank_full',
        jsonb_build_object('stacks', v_stacks, 'cap', v_st.bank_cap));
    end if;

    -- (8) SELLER: PAID NOW, online or not. No collect step, so no collect
    --     exploit. row_count IS CHECKED (S11): if the seller has no state row
    --     for that slot the superseded revision 1 silently DESTROYED the gold —
    --     buyer debited, nobody credited. Money must not evaporate; the trade
    --     is refused instead, and the whole block rolls back.
    update public.player_state set version = version + 1, updated_at = now()
     where user_id = v_row.seller_user_id and slot = v_row.seller_slot;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      perform public.hr_reject('seller_unavailable',
        jsonb_build_object('listing', p_listing_id, 'rows', v_rows));
    end if;
    v_spurse := public.hr_purse_move(v_row.seller_user_id, v_net, 0);
    insert into public.player_ledger
      (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, gems_in, purse, meta)
    values
      (v_row.seller_user_id, v_row.seller_slot, 'trade',
       'market_sold:' || p_listing_id::text || ':' || p_qty::text,
       v_row.item_id, -p_qty, v_net, 0, 0, 0, 0,
       case when v_net <> 0 then v_spurse end,
       jsonb_build_object('listing', p_listing_id, 'each', v_row.ask_each, 'tax', v_tax,
                          'counterparty', v_uid, 'transfer', true,
                          'self_trade', v_row.seller_user_id = v_uid));

    -- (9) CONSUME THE LISTING under the lock already held.
    if v_row.qty = p_qty then
      delete from public.market_listings where id = p_listing_id;
    else
      update public.market_listings set qty = qty - p_qty where id = p_listing_id;
    end if;

    insert into public.market_sales
      (listing_id, seller_user_id, seller_slot, buyer_user_id, buyer_slot,
       item_id, qty, gold_gross, tax, gold_net)
    values
      (p_listing_id, v_row.seller_user_id, v_row.seller_slot, v_uid, v_slot,
       v_row.item_id, p_qty, v_gross, v_tax, v_net);

    -- (10) TWO JOURNAL ROWS, ONE PER PARTY. gold_in is ZERO on BOTH — see the
    --      clamp note at the top of this function: a transfer mints nothing, and
    --      stamping the seller's side as inflow would spend their mint budget on
    --      somebody else's purchase. `transfer:true` in meta is what lets the
    --      audit tell conserved gold from minted gold without reading intents.
    -- ⚠ `self_trade` STAMPS BOTH ROWS (Security M3). A buyer whose auth account
    --   is the seller's (a same-account, cross-slot wash — the own_listing guard
    --   already refused same (user, slot)) settles a real, conserved sale, but the
    --   price is fictional. The boolean is the audit's handle on that: it is the
    --   condition market_price_history filters on, and it lets an investigation
    --   count a character's wash volume without re-joining seller to buyer. It is
    --   the ACCOUNT comparison, not the slot, because the account is the only
    --   granularity a wash can hide behind.
    -- (both rows were written beside their own purse moves, (7) and (8): each states the
    --  purse after its move, which a single two-row insert here could not for a self-trade)

    -- (11) THE RECEIPT, STATED BY THE SERVER (C4's rule, applied here). The
    --      Edge Function renders it and must not build one out of its own
    --      numbers: the copy the player SEES would then be the copy nobody
    --      re-validates. Everything below came out of the locked listing row and
    --      the arithmetic that actually charged.
    v_out := public.hr_state_of(v_uid, v_slot)
             || jsonb_build_object('bought', jsonb_build_object(
                  'listing_id', p_listing_id,
                  'item_id', v_row.item_id,
                  'qty', p_qty,
                  'each', v_row.ask_each,
                  'gold_gross', v_gross,
                  'tax', v_tax,
                  'seller_name', v_row.seller_name));

  exception
    when sqlstate 'HR000' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      v_out := jsonb_build_object('ok', false, 'error', v_msg)
               || coalesce(nullif(v_det, '')::jsonb, '{}'::jsonb);
    when invalid_text_representation or numeric_value_out_of_range
      or check_violation or not_null_violation or foreign_key_violation
      or unique_violation or datatype_mismatch then
      get stacked diagnostics v_sqlstate = returned_sqlstate, v_msg = message_text;
      v_out := jsonb_build_object('ok', false, 'error', 'bad_market_write',
                                  'sqlstate', v_sqlstate, 'detail', v_msg);
  end;

  if v_claimed
     and coalesce(v_out->>'ok', 'false') <> 'true'
     and v_out->>'error' = 'version_conflict' then
    delete from public.player_intents where user_id = v_uid and intent_id = p_intent_id;
  else
    update public.player_intents
       set result = case when coalesce(v_out->>'ok','false') = 'true'
                         then jsonb_build_object('ok', true, 'bought', v_out->'bought')
                         else v_out end
     where user_id = v_uid and intent_id = p_intent_id;
  end if;

  if coalesce(v_out->>'ok', 'false') <> 'true' then
    perform public.hr_record_rejection(v_uid, v_slot, v_intent, v_out->>'error',
                                       v_out - 'ok' - 'error');
  end if;
  return v_out;
end $function$;

-- ── public.hr_hunt_loot_rules(uuid,integer,uuid,uuid,jsonb,timestamp with time zone) ──
CREATE OR REPLACE FUNCTION public.hr_hunt_loot_rules(p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_items jsonb, p_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_r record; v_have bigint; v_q bigint;
  v_sold jsonb := '{}'::jsonb; v_sitems jsonb := '{}'::jsonb; v_gold bigint := 0;
  v_left jsonb := '{}'::jsonb; v_litems jsonb := '{}'::jsonb;
  v_a jsonb; v_b jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'object' or p_intent is null then return null; end if;
  for v_r in
    select e.key as item, (e.value #>> '{}')::numeric::bigint as n, r.loot_rule as rule, vv.unit
      from jsonb_each(p_items) e
      join public.player_item_rules r on r.user_id = p_user and r.slot = p_slot and r.item_id = e.key
      left join public.hr_hunt_vendor_value vv on vv.item_id = e.key
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric >= 1
       and r.loot_rule in ('sell', 'ignore') and not r.locked
     order by e.key
  loop
    continue when v_r.rule = 'sell' and v_r.unit is null;
    select qty into v_have from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_r.item;
    v_q := least(v_r.n, coalesce(v_have, 0));
    continue when v_q <= 0;
    if v_r.rule = 'sell' then
      v_sold := v_sold || jsonb_build_object(v_r.item, jsonb_build_object('qty', v_q, 'unit', v_r.unit));
      v_sitems := v_sitems || jsonb_build_object(v_r.item, -v_q);
      v_gold := v_gold + v_q * v_r.unit;
    else
      v_left := v_left || jsonb_build_object(v_r.item, v_q);
      v_litems := v_litems || jsonb_build_object(v_r.item, -v_q);
    end if;
  end loop;
  -- SELL: the one gold credit path (hr_apply stamps gold_in; its day budget refuses past the ceiling).
  -- ACCOUNT GOLD (2026-12-15-account-gold.sql): the sale is a HUNT gold move, so its row is stamped
  -- with the session (the gold history groups a hunt by it) under kind 'hunt', which the session
  -- fold leaves out exactly as it leaves out vendor_cover: the coins tally stays kills' coins.
  if v_gold > 0 then
    perform set_config('hr.hunt_session', p_session::text, true);
    v_a := public.hr_apply(p_user, p_slot, (select version from public.player_state where user_id = p_user and slot = p_slot),
             md5(p_intent::text || ':loot_sell')::uuid,
             jsonb_build_object('gold', v_gold, 'items', v_sitems,
               'journal', jsonb_build_object('kind', 'hunt', 'intent', 'loot_sell',
                 'meta', jsonb_build_object('reason', 'loot_sell', 'items', v_sold, 'gold', v_gold, 'session', p_session, 'at', p_at))));
    perform set_config('hr.hunt_session', '', true);
  end if;
  if v_litems <> '{}'::jsonb then
    v_b := public.hr_apply(p_user, p_slot, (select version from public.player_state where user_id = p_user and slot = p_slot),
             md5(p_intent::text || ':loot_ignore')::uuid,
             jsonb_build_object('items', v_litems,
               'journal', jsonb_build_object('kind', 'admin', 'intent', 'loot_ignore',
                 'meta', jsonb_build_object('reason', 'loot_ignore', 'items', v_left, 'session', p_session, 'at', p_at))));
  end if;
  return jsonb_build_object('sold', case when coalesce(v_a->>'ok', '') = 'true' then v_sold else '{}'::jsonb end,
                            'left', case when coalesce(v_b->>'ok', '') = 'true' then v_left else '{}'::jsonb end,
                            'refused', coalesce(v_a->>'error', v_b->>'error'));
end $function$;

-- ── public.hr_hunt_settle_session(uuid,integer,uuid,jsonb) ──
CREATE OR REPLACE FUNCTION public.hr_hunt_settle_session(p_user uuid, p_slot integer, p_session uuid, p_delta jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  c_skew       constant interval := interval '60 seconds';
  c_max_window constant bigint   := 24 * 3600000;   -- the outage fuse, never a gameplay cap
  c_min_swing_ms constant bigint := 500;            -- fuse on the swing count, not a balance figure
  c_keys constant text[] := array['swing_from', 'swing_to', 'to', 'next_swing_at', 'uses', 'paid_ms', 'raw_xp', 'hints', 'ended'];
  v_s      public.hunt_sessions%rowtype;
  v_to     timestamptz; v_next timestamptz;
  v_win    bigint;
  v_from_i bigint; v_to_i bigint;
  v_k text; v_v jsonb; v_kind text; v_left bigint; v_n bigint;
  v_deaths int; v_lx bigint;
  v_end text; v_end_at timestamptz;
  v_hwm bigint; v_new_hwm bigint;
  v_coins bigint; v_kills bigint;
  v_xp jsonb; v_loot jsonb; v_sup jsonb;
  v_ev int := 0; v_r record; v_hint jsonb; v_at timestamptz; v_i int;
  v_next_id uuid;
  v_raw jsonb;
  v_used   jsonb := '{}'::jsonb;
  v_used_n bigint := 0;
  v_supply jsonb;
  v_store  boolean;
  -- THE FOLD'S TIME BOUND: every row this folds was stamped in the transaction
  -- of a settle, and a window is at most c_max_window.
  v_fold_from timestamptz := now() - interval '25 hours';
begin
  -- ── VALIDATE (no writes) ───────────────────────────────────────────────
  if p_user is null or p_slot is null or p_session is null or p_delta is null or jsonb_typeof(p_delta) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  if exists (select 1 from jsonb_object_keys(p_delta) k where k <> all (c_keys)) then
    perform public.hr_reject('unknown_delta_key'); end if;
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session then perform public.hr_reject('no_hunt'); end if;

  if jsonb_typeof(p_delta->'swing_from') is distinct from 'number' or jsonb_typeof(p_delta->'swing_to') is distinct from 'number'
     or (p_delta->>'swing_from') !~ '^[0-9]{1,15}$' or (p_delta->>'swing_to') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  v_from_i := (p_delta->>'swing_from')::bigint; v_to_i := (p_delta->>'swing_to')::bigint;
  if v_from_i <> v_s.swing_index then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  begin
    v_to := (p_delta->>'to')::timestamptz;
    v_next := (p_delta->>'next_swing_at')::timestamptz;
  exception when others then
    perform public.hr_reject('bad_window');
  end;
  if v_to is null or v_next is null or v_to <= v_s.settled_to then
    perform public.hr_reject('bad_window', jsonb_build_object('settled_to', v_s.settled_to)); end if;
  if v_to > now() + c_skew then perform public.hr_reject('window_in_future'); end if;
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  if v_win > c_max_window then perform public.hr_reject('window_too_long'); end if;
  if v_next < v_to or v_next > v_to + c_skew then perform public.hr_reject('bad_next_swing'); end if;
  if v_to_i < v_from_i or v_to_i - v_from_i > v_win / c_min_swing_ms + 1 then
    perform public.hr_reject('bad_swing'); end if;

  -- OWN USES: packed bag lines only, of a kind a hunt spends, never more than is left.
  if p_delta ? 'uses' then
    if jsonb_typeof(p_delta->'uses') <> 'object' or (select count(*) from jsonb_object_keys(p_delta->'uses')) > 10 then
      perform public.hr_reject('bad_uses'); end if;
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') loop
      if jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,9}$' then
        perform public.hr_reject('bad_uses', jsonb_build_object('item', left(v_k, 64))); end if;
      v_n := (v_v #>> '{}')::bigint;
      select b.qty_left, p.kind into v_left, v_kind
        from public.hunt_bag b left join public.hr_hunt_supplies p on p.item_id = b.item_id
       where b.session_id = p_session and b.item_id = v_k;
      if v_left is null then perform public.hr_reject('not_in_bag', jsonb_build_object('item', left(v_k, 64))); end if;
      if v_n > v_left then perform public.hr_reject('bag_short', jsonb_build_object('item', v_k, 'left', v_left)); end if;
      -- OWN-DRINKS (2026-12-16-own-drinks-settle.sql): a drink (`mana`) is spent from the bag exactly as food is,
      -- the kinds the member applier's lane caps count; a feast (`buff`) never is.
      if v_n > 0 and v_kind is distinct from 'heal' and v_kind is distinct from 'mana' and v_kind is distinct from 'ammo' then
        perform public.hr_reject('kind_not_used', jsonb_build_object('item', v_k, 'kind', v_kind)); end if;
      v_left := null; v_kind := null;
    end loop;
  end if;

  -- THE DEATH: the death rows hr_apply stamped with this session since the last fold (at most one).
  select t.ledger_hwm into v_hwm from public.hunt_session_tally t where t.session_id = p_session;
  v_hwm := coalesce(v_hwm, 0);
  select count(*) into v_deaths from public.player_ledger l
   where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death';
  if v_deaths > 1 then perform public.hr_reject('bad_counts', jsonb_build_object('deaths', v_deaths)); end if;
  if (p_delta ? 'paid_ms' and (jsonb_typeof(p_delta->'paid_ms') <> 'number' or (p_delta->>'paid_ms')::numeric < 0
                                  or (p_delta->>'paid_ms')::numeric > v_win)) then
    perform public.hr_reject('bad_counts'); end if;
  v_raw := coalesce(p_delta->'raw_xp', '{}'::jsonb);
  if jsonb_typeof(v_raw) <> 'object' or (select count(*) from jsonb_object_keys(v_raw)) > 24
     or exists (select 1 from jsonb_each(v_raw) x where x.key !~ '^[a-zA-Z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number'
                   or (x.value #>> '{}')::numeric < 0 or (x.value #>> '{}')::numeric > 1e12) then
    perform public.hr_reject('bad_counts'); end if;

  -- THE END, re-proved from server state as it will stand after the uses.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_store := v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch';
  if p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') = 'object' then
    v_end := p_delta->'ended'->>'reason';
    begin v_end_at := (p_delta->'ended'->>'at')::timestamptz;
    exception when others then perform public.hr_reject('bad_end'); end;
    if v_end is null or not exists (select 1 from public.hr_hunt_end_reasons where reason = v_end)
       or v_end_at is null or v_end_at < v_s.settled_to or v_end_at > v_to then
      perform public.hr_reject('bad_end'); end if;
    if not coalesce(case v_end
      -- DIED (Tyler 2026-10-19): this settle journalled the hero's death.
      when 'died' then v_deaths >= 1
      -- PARTY_MEMBER_DIED: another member of this instance died, which ends the whole party's hunt;
      -- provable only as "the instance holds another member": the end can only stop value, never mint it.
      when 'party_member_died' then exists (select 1 from public.hunt_sessions o
                                             where o.instance_id = v_s.instance_id and o.id <> v_s.id)
      -- heals_out / ammo_out: every essential line of the kind empty after the
      -- uses, and the store closed to it (the hero's explicit `end`) or holding
      -- no row it could buy instead.
      when 'heals_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                         where b.session_id = p_session and p.kind = 'heal' and b.essential
                                           and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                        and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                     where b.session_id = p_session and p.kind = 'heal' and b.essential)
                        -- STORE-BY-SLOT (2026-11-04): any store food a slot may name (the player picks it).
                        and not (v_store and exists (select 1 from public.hr_hunt_basic_supplies q where q.kind = 'heal'))
      when 'ammo_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                        where b.session_id = p_session and p.kind = 'ammo' and b.essential
                                          and b.qty_left - coalesce((p_delta->'uses'->>b.item_id)::bigint, 0) > 0)
                       and exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id
                                    where b.session_id = p_session and p.kind = 'ammo' and b.essential)
                       and not (v_store and exists (select 1 from public.hunt_bag b join public.hr_hunt_basic_supplies q
                                                     on q.kind = 'ammo' and q.partner = b.item_id
                                                    where b.session_id = p_session and b.essential))
      -- GOLD_OUT: the store was open to the hero, and the gold left over its floor
      -- (after this window's coins and cover, written before this call, and its own
      -- store bill, hr.purse_pending, which hr_hunt_apply_instance pays after every
      -- member) is below the dearest store row it could need. ACCOUNT GOLD
      -- (2026-12-15-account-gold.sql): the purse is the ACCOUNT's. A hero sharing this
      -- instance with another hero of its own account spent the one purse in time order
      -- with it, which no per-member read can re-prove: then, like party_member_died,
      -- the end is provable only as "the store was open" — it can only stop value.
      when 'gold_out' then v_store
                       and (exists (select 1 from public.hunt_sessions o
                                     where o.instance_id = v_s.instance_id and o.id <> v_s.id
                                       and o.user_id = p_user and o.hunt_from < v_to
                                       and (o.ended_at is null or o.ended_at > v_s.settled_to))
                            or public.hr_purse_of(p_user)
                           - coalesce(nullif(current_setting('hr.purse_pending', true), '')::bigint, 0)
                           - (v_supply->>'gold_floor')::bigint
                         < coalesce((select max(q.price) from public.hr_hunt_basic_supplies q
                                      where q.kind in ('heal', 'mana')
                                         or (q.kind = 'ammo' and (q.partner in (select b.item_id from public.hunt_bag b where b.session_id = p_session)
                                                                  or q.partner = (select pe.item_id from public.player_equipment pe
                                                                                   where pe.user_id = p_user and pe.slot = p_slot
                                                                                     and pe.equip_slot = 'ammo')))), 0))
      -- STAMINA: hr_hunt_apply_member wrote this window's end value at `to` before this call.
      when 'stamina' then coalesce((select ps.stamina_ms from public.player_state ps
                                     where ps.user_id = p_user and ps.slot = p_slot), 1) <= 0
      when 'hours' then v_s.hours_limit is not null and v_end_at >= v_s.hunt_from + make_interval(hours => v_s.hours_limit)
      when 'left' then v_s.leave_at is not null and v_end_at >= v_s.leave_at
      when 'changed' then v_s.change_at is not null and v_end_at >= v_s.change_at
      when 'server' then not coalesce((select enabled from public.hr_hunt_config where id), false)
      -- RULE (lane action-engine): one of the hero's own stop rules held (src/core/hunt/conditions.js);
      -- provable only as "the preset carries a stop rule": the end can only stop value, never mint it.
      when 'rule' then exists (select 1 from public.player_action_sets a where a.user_id = p_user and a.slot = p_slot
                                 and a.preset = v_s.preset and jsonb_typeof(a.options->'stop_rules') = 'array'
                                 and jsonb_array_length(a.options->'stop_rules') > 0)
      else false end, false) then
      perform public.hr_reject('end_not_proven', jsonb_build_object('reason', v_end));
    end if;
  elsif p_delta ? 'ended' and jsonb_typeof(p_delta->'ended') <> 'null' then
    perform public.hr_reject('bad_end');
  else
    -- AN END THE ENGINE OWED: a death journalled, a leave/change/hours
    -- instant more than one skew behind the window end.
    if v_deaths >= 1
       or (v_s.leave_at is not null and v_to > v_s.leave_at + c_skew)
       or (v_s.change_at is not null and v_to > v_s.change_at + c_skew)
       or (v_s.hours_limit is not null and v_to > v_s.hunt_from + make_interval(hours => v_s.hours_limit) + c_skew) then
      perform public.hr_reject('end_missing'); end if;
  end if;
  v_hint := coalesce(p_delta->'hints', '{}'::jsonb);
  if jsonb_typeof(v_hint) <> 'object' then perform public.hr_reject('bad_hints'); end if;

  -- ── APPLY ──────────────────────────────────────────────────────────────
  -- (1) OWN USES: the bag, and ONE `supply_own` row per settle carrying every
  --     unit used in meta.items (qty = the units destroyed, negative, gold 0).
  if p_delta ? 'uses' then
    for v_k, v_v in select key, value from jsonb_each(p_delta->'uses') order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      update public.hunt_bag set qty_left = qty_left - v_n where session_id = p_session and item_id = v_k
        returning qty_left into v_left;
      v_used := v_used || jsonb_build_object(v_k, v_n);
      v_used_n := v_used_n + v_n;
      if v_left = 0 then
        v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'slot_dry'->v_k), v_to), v_s.settled_to), v_to);
        insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
          values (p_session, p_user, p_slot, 'slot_dry', v_at, jsonb_build_object('item', v_k));
        v_ev := v_ev + 1;
      end if;
    end loop;
    if v_used_n > 0 then
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id)
        values (p_user, p_slot, 'hunt', 'supply_own', 0, -v_used_n,
                jsonb_build_object('side', 'bag', 'source', 'own', 'items', v_used), p_session);
    end if;
  end if;

  -- (2) THE FOLD: every row stamped with this session since the high-water mark.
  select coalesce(sum(case when l.kind <> 'hunt' then coalesce(l.gold, 0) else 0 end), 0),
         coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then greatest(0, (l.meta->>'kills')::numeric) else 0 end), 0)::bigint,
         max(l.id)
    into v_coins, v_kills, v_new_hwm
    from public.player_ledger l where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from;
  -- THE LEVEL XP the fold credited (hr_apply's ledger meta `lx`), tallied under `level`.
  select coalesce(sum((l.meta->'delta'->>'lx')::numeric), 0)::bigint into v_lx
    from public.player_ledger l
   where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
     and jsonb_typeof(l.meta->'delta'->'lx') = 'number';
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_xp from (
    select x.key as k, sum(x.value::numeric) as v
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'x') = 'object'
                                                         then l.meta->'delta'->'x' else '{}'::jsonb end) x
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
     group by x.key) a;
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_loot from (
    select k, sum(v) as v from (
      select i.key as k, i.value::numeric as v
        from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'delta'->'i') = 'object'
                                                           then l.meta->'delta'->'i' else '{}'::jsonb end) i
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
      union all
      select '*', (l.meta->'delta'->>'i_sum')::numeric
        from public.player_ledger l
       where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind <> 'hunt'
         and jsonb_typeof(l.meta->'delta'->'i_sum') = 'number') u
    group by k) a;
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_sup from (
    select i.key as k, sum(i.value::numeric) as n
      from public.player_ledger l, jsonb_each_text(case when jsonb_typeof(l.meta->'items') = 'object'
                                                         then l.meta->'items' else '{}'::jsonb end) i
     where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'hunt' and l.intent = 'supply_own'
     group by i.key) a;
  update public.hunt_session_tally t
     set coins = t.coins + v_coins, kills = t.kills + v_kills, deaths = t.deaths + v_deaths,
         xp = public.hr_jsonb_add(t.xp, v_xp || case when v_lx > 0 then jsonb_build_object('level', v_lx) else '{}'::jsonb end),
         loot = public.hr_jsonb_add(t.loot, v_loot),
         supplies = public.hr_jsonb_add(t.supplies, v_sup), raw_xp = public.hr_jsonb_add(t.raw_xp, v_raw),
         paid_ms = t.paid_ms + coalesce((p_delta->>'paid_ms')::numeric, 0)::bigint,
         ledger_hwm = greatest(t.ledger_hwm, coalesce(v_new_hwm, 0)), updated_at = now()
   where t.session_id = p_session;

  -- (3) DERIVED EVENTS. The death from its row; Level- and level-ups from the XP the
  --     fold credited; rare drops only for items this fold looted.
  v_i := 0;
  for v_r in select l.at, l.meta->>'monster' as monster from public.player_ledger l
              where l.session_id = p_session and l.id > v_hwm and l.at >= v_fold_from and l.kind = 'combat' and l.intent = 'death' order by l.id loop
    v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_hint->'death'->v_i), v_r.at), v_s.settled_to), v_to);
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'death', v_at, jsonb_build_object('monster', left(coalesce(v_r.monster, ''), 64)));
    v_i := v_i + 1; v_ev := v_ev + 1;
  end loop;
  if v_lx > 0 then
    select public.hr_char_level(ps.level_xp), public.hr_char_level(greatest(0, ps.level_xp - v_lx))
      into v_n, v_left from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    if v_n > v_left then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'level_up', v_to, jsonb_build_object('skill', 'level', 'level', v_n));
      v_ev := v_ev + 1;
    end if;
  end if;
  for v_r in select x.key as skill, public.hr_skill_level(x.key, ps.xp) as lv_now,
                    public.hr_skill_level(x.key, greatest(0, ps.xp - floor(x.value::numeric)::bigint)) as lv_then
               from jsonb_each_text(v_xp) x
               join public.player_skills ps on ps.user_id = p_user and ps.slot = p_slot and ps.skill_id = x.key
              where x.value::numeric > 0 loop
    if v_r.lv_now > v_r.lv_then then
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'level_up', v_to, jsonb_build_object('skill', left(v_r.skill, 64), 'level', v_r.lv_now));
      v_ev := v_ev + 1;
    end if;
  end loop;
  if jsonb_typeof(v_hint->'rare_drop') = 'array' then
    for v_r in select distinct on (e.value->>'item') e.value->>'item' as item, e.value->'at' as at_ms
                 from jsonb_array_elements(v_hint->'rare_drop') with ordinality e(value, o)
                where jsonb_typeof(e.value) = 'object' and coalesce((v_loot->>(e.value->>'item'))::numeric, 0) > 0
                order by e.value->>'item', e.o limit 10 loop
      v_at := least(greatest(coalesce(public.hr_hunt_hint_at(v_r.at_ms), v_to), v_s.settled_to), v_to);
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'rare_drop', v_at, jsonb_build_object('item', left(v_r.item, 64)));
      v_ev := v_ev + 1;
    end loop;
  end if;

  -- (4) THE SESSION CLOCK.
  update public.hunt_sessions
     set swing_index = v_to_i, settled_to = v_to, next_swing_at = v_next, version = version + 1
   where id = p_session;

  -- (5) THE END.
  if v_end = 'changed' then
    v_next_id := public.hr_hunt_swap(p_session, v_end_at);
  elsif v_end is not null then
    perform public.hr_hunt_close(p_session, v_end, v_end_at, true);
  end if;

  return jsonb_build_object('ok', true, 'session', p_session, 'swing_index', v_to_i, 'settled_to', v_to,
                            'ended', v_end, 'next_session', v_next_id, 'events', v_ev,
                            'version', (select version from public.hunt_sessions where id = p_session));
end $function$;

-- ── public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb) ──
CREATE OR REPLACE FUNCTION public.hr_hunt_apply_member(p_instance uuid, p_user uuid, p_slot integer, p_session uuid, p_intent uuid, p_delta jsonb, p_hunt jsonb, p_analyzer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  -- The combat skills a death costs (src/data/skills.js COMBAT_SKILLS); the Level is priced as `level`.
  c_xp_skills constant text[] := array['defense', 'magic', 'melee', 'prayer', 'ranged'];
  c_day_ms    constant bigint := 86400000;
  v_s     public.hunt_sessions%rowtype;
  v_ver   bigint;
  v_a     jsonb;
  v_h     jsonb;
  v_hunt  jsonb;
  v_to    timestamptz;
  v_dx    jsonb; v_nd int; v_el jsonb; v_k text; v_v jsonb;
  v_lost  jsonb := '{}'::jsonb; v_rate int;
  v_xp0   jsonb := '{}'::jsonb; v_ev0 bigint := 0;
  v_n bigint; v_cur bigint; v_lv int; v_lv0 int; v_fin int; v_fi int; v_r record;
  v_stam  jsonb; v_cap bigint; v_sat timestamptz; v_s0 bigint; v_e bigint;
  v_win bigint; v_paid bigint; v_nsw bigint; v_tick bigint;
  v_lx0 bigint; v_lxb bigint; v_base int; v_lvl int; v_xfloor bigint; v_vit jsonb; v_mana bigint; v_def bigint;
  v_buys jsonb; v_cost bigint := 0; v_units bigint := 0; v_items jsonb := '{}'::jsonb;
  v_price bigint; v_kind text; v_bk jsonb := '{}'::jsonb; v_day jsonb := '{}'::jsonb; v_ukind jsonb := '{}'::jsonb;
  v_cons int; v_off int; v_ammo_max int;
  v_gold_now bigint; v_cover jsonb; v_cgold bigint := 0; v_cunits bigint := 0; v_citems jsonb := '{}'::jsonb;
  v_unit bigint; v_avail bigint; v_supply jsonb; v_floor bigint;
  v_kills bigint; v_ground public.hr_hunt_grounds%rowtype; v_kmax bigint;
  v_dmax bigint; v_pass bigint;  -- DENSITY-BOUNDS: the catalogue's ceiling on any pick; what the ground presents at once
  v_vb_gold bigint; v_vb_xp bigint; v_vb_h bigint; v_vb_item text; v_magic bigint;
  v_unit_id int;
  v_bless jsonb;  -- the blessing hook's answer (hr_blessing_take, 2026-10-25-blessings.sql)
  v_loot  jsonb;  -- the loot filter's answer (hr_hunt_loot_rules, 2026-10-25-bag-rules.sql)
  v_end text; v_lk text; v_li text; v_home timestamptz; v_ok boolean;
begin
  if p_user is null or p_slot is null or p_session is null or p_intent is null
     or p_delta is null or jsonb_typeof(p_delta) <> 'object' or p_hunt is null or jsonb_typeof(p_hunt) <> 'object' then
    perform public.hr_reject('bad_arguments'); end if;
  -- (1) THE CHARACTER LOCK (hr_apply's key) and the session — of THIS instance.
  v_s := public.hr_hunt_lock(p_user, p_slot);
  if v_s.id is null or v_s.id <> p_session or v_s.instance_id <> p_instance then
    perform public.hr_reject('no_hunt', jsonb_build_object('session', p_session)); end if;
  -- (2a) THE STORED INDEX (a key that already landed falls through: hr_apply replays it).
  if jsonb_typeof(p_hunt->'swing_from') is distinct from 'number' or (p_hunt->>'swing_from') !~ '^[0-9]{1,15}$' then
    perform public.hr_reject('bad_swing'); end if;
  if (p_hunt->>'swing_from')::bigint <> v_s.swing_index
     and not exists (select 1 from public.player_intents i where i.user_id = p_user and i.intent_id = p_intent) then
    perform public.hr_reject('session_moved', jsonb_build_object('swing_index', v_s.swing_index)); end if;
  select version into v_ver from public.player_state where user_id = p_user and slot = p_slot;
  if v_ver is null then perform public.hr_reject('no_character'); end if;
  begin v_to := (p_hunt->>'to')::timestamptz;
  exception when others then perform public.hr_reject('bad_window'); end;
  if v_to is null then perform public.hr_reject('bad_window'); end if;

  -- (2b) THE PRICE OF THE DEATH, shape only: at most one death a settle (it ends the hunt),
  --      priced as `level` and the combat skills.
  v_dx := p_hunt->'death_xp';
  v_hunt := p_hunt - 'death_xp' - 'stamina' - 'buys' - 'cover' - 'unit_id' - 'tick_ms';
  v_nd := case when jsonb_typeof(p_delta->'deaths') = 'array' then jsonb_array_length(p_delta->'deaths') else 0 end;
  if v_dx is null and v_nd = 0 then v_dx := '[]'::jsonb; end if;
  if v_dx is null or jsonb_typeof(v_dx) <> 'array' or jsonb_array_length(v_dx) <> v_nd or v_nd > 1 then
    perform public.hr_reject('bad_death_xp'); end if;
  for v_el in select value from jsonb_array_elements(v_dx) loop
    if jsonb_typeof(v_el) <> 'object' then perform public.hr_reject('bad_death_xp'); end if;
    for v_k, v_v in select key, value from jsonb_each(v_el) loop
      if (v_k <> 'level' and v_k <> all (c_xp_skills)) or jsonb_typeof(v_v) <> 'number' or (v_v #>> '{}') !~ '^[0-9]{1,12}$' then
        perform public.hr_reject('bad_death_xp'); end if;
      if (v_v #>> '{}')::bigint > 0 then
        v_lost := v_lost || jsonb_build_object(v_k, coalesce((v_lost->>v_k)::bigint, 0) + (v_v #>> '{}')::bigint);
      end if;
    end loop;
  end loop;
  if v_lost <> '{}'::jsonb then
    v_rate := public.hr_hunt_limit('death_xp_permille');
    v_base := public.hr_hunt_limit('death_xp_base');
    if v_rate is null or v_base is null then perform public.hr_reject('catalogue_missing'); end if;
  end if;
  -- (2c) THE STAMINA POOL, shape only; the start value is the DATABASE's.
  v_stam := p_hunt->'stamina';
  if v_stam is null or jsonb_typeof(v_stam) <> 'number' or (v_stam #>> '{}') !~ '^[0-9]{1,12}$' then
    perform public.hr_reject('bad_stamina'); end if;
  -- The cap over the window: premium_until only ever rises, so it is the
  -- larger of the caps at its two ends.
  v_cap := greatest(public.hr_stamina_cap(p_user, p_slot, v_s.settled_to), public.hr_stamina_cap(p_user, p_slot, v_to));
  if v_cap is null then perform public.hr_reject('catalogue_missing'); end if;
  select stamina_at, level_xp into v_sat, v_lx0 from public.player_state where user_id = p_user and slot = p_slot;
  if v_sat is not null and v_sat > v_s.settled_to then perform public.hr_reject('stamina_ahead'); end if;
  v_s0 := public.hr_stamina_of(p_user, p_slot, v_s.settled_to);
  -- (2d) THE STORE, shape only (re-priced and debited below).
  v_buys := coalesce(p_hunt->'buys', '{}'::jsonb);
  if jsonb_typeof(v_buys) <> 'object' or (select count(*) from jsonb_object_keys(v_buys)) > 20
     or exists (select 1 from jsonb_each(v_buys) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_buys'); end if;
  v_cover := coalesce(p_hunt->'cover', '{}'::jsonb);
  if jsonb_typeof(v_cover) <> 'object' or (select count(*) from jsonb_object_keys(v_cover)) > 64
     or exists (select 1 from jsonb_each(v_cover) x
                 where x.key !~ '^[a-z0-9_]{1,64}$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}') !~ '^[0-9]{1,9}$') then
    perform public.hr_reject('bad_cover'); end if;
  -- (2e) THE HERO'S UNIT and the analyzer tally, shape only.
  if p_hunt ? 'unit_id' and jsonb_typeof(p_hunt->'unit_id') <> 'null'
     and (jsonb_typeof(p_hunt->'unit_id') <> 'number' or (p_hunt->>'unit_id') !~ '^[0-9]{1,6}$') then
    perform public.hr_reject('bad_unit'); end if;
  v_unit_id := case when jsonb_typeof(p_hunt->'unit_id') = 'number' then (p_hunt->>'unit_id')::int end;
  if p_analyzer is not null and jsonb_typeof(p_analyzer) <> 'null'
     and (jsonb_typeof(p_analyzer) <> 'object'
          or exists (select 1 from jsonb_object_keys(p_analyzer) k where k not in ('dealt', 'taken', 'healed'))
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'dealt', '{}'::jsonb), array['byAbility', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'taken', '{}'::jsonb), array['byMonster', 'byElement'])
          or not public.hr_hunt_tally_ok(coalesce(p_analyzer->'healed', '{}'::jsonb), array['bySource'])) then
    perform public.hr_reject('bad_analyzer'); end if;
  select * into v_ground from public.hr_hunt_grounds g where g.hunt_id = v_s.hunt_id;
  if not found then perform public.hr_reject('no_ground', jsonb_build_object('hunt', v_s.hunt_id)); end if;
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): what the ground can present at once is its as-built
  -- rows plus every pocket's pull at the density the SERVER froze for this instance when it opened
  -- (hunt_instances.density, hr_hunt_density_freeze; the engine plays exactly it, hr_hunt_instance_read).
  -- An instance opened before the freeze existed reads the catalogue's ceiling (density_max). Never a
  -- client or edge number, never today's action-set row.
  v_dmax := coalesce((select i.density from public.hunt_instances i where i.id = p_instance)::bigint,
                     public.hr_hunt_limit('density_max'));
  if v_dmax is null or v_dmax < 0 then perform public.hr_reject('catalogue_missing', jsonb_build_object('limit', 'density_max')); end if;
  v_pass := v_ground.spawns::bigint + v_ground.pockets::bigint * v_dmax;
  select coalesce(jsonb_object_agg(skill_id, xp), '{}'::jsonb) into v_xp0
    from public.player_skills where user_id = p_user and slot = p_slot and skill_id = any (c_xp_skills);
  select coalesce(max(id), 0) into v_ev0 from public.hunt_session_events where session_id = p_session;

  -- (3) THE VALUE HALF: hr_apply, every row it writes stamped with the session.
  perform set_config('hr.hunt_session', p_session::text, true);
  v_a := public.hr_apply(p_user, p_slot, v_ver, p_intent, p_delta);
  perform set_config('hr.hunt_session', '', true);
  if coalesce(v_a->>'ok', 'false') <> 'true' then
    perform public.hr_reject(coalesce(v_a->>'error', 'apply_failed'), v_a);
  end if;
  if coalesce(v_a->>'replayed', 'false') = 'true' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  -- (4) THE KILL BOUND: the kills THIS settle's stamped rows journal, held to
  --     what the ground presents at once (v_pass) times the respawns the window's time admits.
  v_win := floor(extract(epoch from (v_to - v_s.settled_to)) * 1000)::bigint;
  select coalesce(sum(case when jsonb_typeof(l.meta->'kills') = 'number' then (l.meta->>'kills')::numeric else 0 end), 0)::bigint
    into v_kills
    from public.player_ledger l
   where l.session_id = p_session and l.kind <> 'hunt'
     and l.id > coalesce((select t.ledger_hwm from public.hunt_session_tally t where t.session_id = p_session), 0)
     and l.at >= now() - interval '25 hours';
  v_kmax := v_pass * (greatest(v_win, 0) / v_ground.respawn_ms + 2);
  if v_kills > v_kmax then
    perform public.hr_reject('kills_over', jsonb_build_object('kills', v_kills, 'max', v_kmax, 'window_ms', v_win, 'pass', v_pass));
  end if;
  -- (4c) THE VALUE BOUND, against the ground's own monsters.
  v_vb_h := public.hr_hunt_limit('value_headroom');
  select coalesce(max(b.gold_max), 0), coalesce(max(b.xp_max), 0) into v_vb_gold, v_vb_xp
    from public.hr_hunt_kill_bounds b
   where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id);
  -- THE MAGIC BOUND reads the hero's OWN max mana (hr_vitals_of): a full pool, then its regen at the
  -- Prayer rate plus the most a drink every lane restores, every minute; x the largest ability
  -- multiplier (hr_hunt_abilities) on top of the per-mana rate.
  v_vit := public.hr_vitals_of(p_user, p_slot);
  v_mana := (v_vit->>'max_mana')::bigint;
  v_magic := ceil((v_mana + (greatest(v_win, 0) / 60000 + 1)
                   * (ceil(v_mana * public.hr_hunt_limit('mana_regen_pct_min') * (v_vit->>'regen_pm')::int / 100000.0)
                      + public.hr_hunt_limit('drink_mana_per_min_max')))
                  * public.hr_hunt_limit('magic_xp_permille') / 1000.0
                  * greatest(1000, coalesce(public.hr_hunt_limit('magic_xp_mult_max'), 1000)) / 1000.0)::bigint;
  -- THE DEFENSE BOUND: every swing interval of the window, every foe the ground can engage at once
  -- (what it presents at once, at most a full box twice over or the density ceiling), at the highest level it spawns, the block multiple.
  v_def := ceil((greatest(v_win, 0) / public.hr_hunt_limit('swing_interval_ms') + 1)
                * least(v_pass, greatest(v_dmax, 16))
                * coalesce((select max(public.hr_monster_level(sp.monster_id)) from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id), 0)
                * public.hr_hunt_limit('defense_xp_level_permille') / 1000.0 * public.hr_hunt_limit('block_mult'))::bigint;
  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'gold', 'gold', p_delta->'gold', 'kills', v_kills,
      'max', v_kills * v_vb_gold * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'xp') = 'object'
     and (select coalesce(sum(greatest(0, (e.value #>> '{}')::numeric)), 0) from jsonb_each(p_delta->'xp') e
           where jsonb_typeof(e.value) = 'number') > ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'xp', 'kills', v_kills, 'pass', v_pass,
      'max', ((v_kills + v_pass) * v_vb_xp + v_magic + v_def) * v_vb_h)); end if;
  -- THE LEVEL XP BOUND (kills only): the journalled kills x the most one kill of the ground pays.
  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric > v_kills * v_vb_xp * v_vb_h then
    perform public.hr_reject('value_over', jsonb_build_object('what', 'level_xp', 'level_xp', p_delta->'level_xp', 'kills', v_kills,
      'max', v_kills * v_vb_xp * v_vb_h)); end if;
  if jsonb_typeof(p_delta->'items') = 'object' then
    select e.key into v_vb_item from jsonb_each(p_delta->'items') e
     where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0
       and (e.value #>> '{}')::numeric > v_kills * coalesce((
             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b
              where b.monster_id in (select sp.monster_id from public.hr_hunt_ground_spawns sp where sp.hunt_id = v_s.hunt_id)), 0)
     limit 1;
    if v_vb_item is not null then
      perform public.hr_reject('value_over', jsonb_build_object('what', 'item', 'item', left(v_vb_item, 64),
        'qty', p_delta->'items'->v_vb_item, 'kills', v_kills)); end if;
  end if;

  -- (5a) THE STAMINA POOL, RE-PROVED AND WRITTEN (before the session half,
  --      whose `stamina` end proof reads this row). Every swing of a hunt drains
  --      (there is no knockout to rest in): P = swings x interval, the window is
  --      P to the millisecond, and E = max(0, S0 − P) exactly; an empty pool walks
  --      no swing.
  if jsonb_typeof(p_hunt->'paid_ms') is distinct from 'number'
     or jsonb_typeof(p_hunt->'swing_to') is distinct from 'number'
     or (p_hunt->>'paid_ms')::numeric not between 0 and 1e12
     or (p_hunt->>'swing_to')::numeric not between 0 and 1e15 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'shape')); end if;
  v_e    := (v_stam #>> '{}')::bigint;
  v_paid := (p_hunt->>'paid_ms')::numeric::bigint;
  v_nsw  := (p_hunt->>'swing_to')::numeric::bigint - v_s.swing_index;
  if v_win < 0 or v_nsw < 0 or v_paid > v_win or v_paid < v_win - 1 then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'window', 'window_ms', v_win, 'paid_ms', v_paid)); end if;
  v_tick := public.hr_hunt_limit('swing_interval_ms');
  if v_tick is null or v_tick <= 0 or v_paid <> v_nsw * v_tick then
    perform public.hr_reject('bad_clock', jsonb_build_object('paid_ms', v_paid, 'swings', v_nsw, 'interval_ms', v_tick)); end if;
  if v_e <> greatest(0, v_s0 - v_paid) then
    perform public.hr_reject('bad_stamina', jsonb_build_object('why', 'bound', 'from_ms', v_s0, 'ms', v_e, 'paid_ms', v_paid)); end if;
  if v_s0 <= 0 and v_nsw > 0 then perform public.hr_reject('end_missing', jsonb_build_object('reason', 'stamina')); end if;
  update public.player_state set stamina_ms = v_e, stamina_at = v_to where user_id = p_user and slot = p_slot;

  -- (5b) THE STORE: sell-to-cover first, then every store use, priced by the
  --      catalogue, under the hero's own setting, capped, debited, journalled.
  v_supply := public.hr_hunt_supply_of(p_user, p_slot, v_s.preset);
  v_floor := (v_supply->>'gold_floor')::bigint;
  if v_cover <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_cover) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select c.unit into v_unit from public.hr_hunt_cover_items c where c.item_id = v_k;
      if v_unit is null then perform public.hr_reject('not_coverable', jsonb_build_object('item', v_k)); end if;
      -- NOTHING SELLS A LOCKED ITEM (hook: hr_item_locked; hr_hunt_member_read never offers one).
      if public.hr_item_locked(p_user, p_slot, v_k) then perform public.hr_reject('item_locked', jsonb_build_object('item', v_k)); end if;
      select least(
               coalesce((select pi.qty from public.player_inventory pi where pi.user_id = p_user and pi.slot = p_slot and pi.item_id = v_k), 0),
               coalesce((select (t.loot->>v_k)::numeric from public.hunt_session_tally t where t.session_id = p_session), 0)::bigint
               + greatest(0, coalesce(case when jsonb_typeof(p_delta->'items'->v_k) = 'number' then (p_delta->'items'->>v_k)::numeric end, 0))::bigint
               - coalesce((select (t.covered->>v_k)::bigint from public.hunt_session_tally t where t.session_id = p_session), 0))
        into v_avail;
      if v_n > coalesce(v_avail, 0) then
        perform public.hr_reject('cover_over', jsonb_build_object('item', v_k, 'units', v_n, 'avail', v_avail)); end if;
      delete from public.player_inventory where user_id = p_user and slot = p_slot and item_id = v_k and qty = v_n;
      update public.player_inventory set qty = qty - v_n where user_id = p_user and slot = p_slot and item_id = v_k;
      v_citems := v_citems || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'unit', v_unit));
      v_cgold := v_cgold + v_n * v_unit;
      v_cunits := v_cunits + v_n;
      v_unit := null; v_avail := null;
    end loop;
    if v_cgold > 0 then
      -- THE ACCOUNT PURSE (2026-12-15-account-gold.sql), locked by hr_hunt_apply_instance.
      v_gold_now := public.hr_purse_move(p_user, v_cgold, 0);
      insert into public.player_ledger (user_id, slot, kind, intent, gold, qty, meta, session_id, purse)
        values (p_user, p_slot, 'hunt', 'vendor_cover', v_cgold, -v_cunits,
                jsonb_build_object('reason', 'vendor_cover', 'items', v_citems, 'gold', v_cgold), p_session, v_gold_now);
      update public.hunt_session_tally t
         set covered = public.hr_jsonb_add(t.covered, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                          from jsonb_each(v_citems) i)),
             cover_gold = t.cover_gold + v_cgold
       where t.session_id = p_session;
      insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
        values (p_session, p_user, p_slot, 'cover', v_to, jsonb_build_object('n', v_cunits, 'gold', v_cgold));
    end if;
    -- Loot is sold only to pay the store: a window that sold and bought nothing is refused.
    if v_buys = '{}'::jsonb then perform public.hr_reject('cover_unspent'); end if;
  end if;
  -- THE LOOT FILTER (hook: hr_hunt_loot_rules): sell / ignore on pickup, online or not, after cover.
  v_loot := public.hr_hunt_loot_rules(p_user, p_slot, p_session, p_intent, p_delta->'items', v_to);
  perform set_config('hr.hunt_session', '', true);
  v_cons := (select l.ms from public.hr_hunt_lanes l where l.lane = 'consumable' and l.active);
  v_off  := (select l.ms from public.hr_hunt_lanes l where l.lane = 'offense' and l.active);
  v_ammo_max := public.hr_hunt_limit('ability_ammo_max');
  if v_cons is null or v_off is null or v_ammo_max is null then perform public.hr_reject('catalogue_missing'); end if;
  -- Own uses per kind (the bag lines the session half will debit).
  select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_ukind from (
    select q.kind as k, sum((u.value #>> '{}')::bigint) as n
      from jsonb_each(case when jsonb_typeof(p_hunt->'uses') = 'object' then p_hunt->'uses' else '{}'::jsonb end) u
      join public.hr_hunt_supplies q on q.item_id = u.key
     where jsonb_typeof(u.value) = 'number' group by q.kind) a;
  if v_buys <> '{}'::jsonb then
    for v_k, v_v in select key, value from jsonb_each(v_buys) order by key loop
      v_n := (v_v #>> '{}')::bigint;
      continue when v_n = 0;
      select q.price, q.kind into v_price, v_kind from public.hr_hunt_basic_supplies q where q.basic_id = v_k;
      if v_price is null then perform public.hr_reject('not_for_sale', jsonb_build_object('item', v_k)); end if;
      -- THE STORE IS USED ONLY ON THE HERO'S OWN SETTING (spec §3.4 #5-7).
      if not (v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch') then
        perform public.hr_reject('store_off', jsonb_build_object('item', v_k)); end if;
      v_bk := v_bk || jsonb_build_object(v_kind, coalesce((v_bk->>v_kind)::bigint, 0) + v_n);
      v_items := v_items || jsonb_build_object(v_k, jsonb_build_object('qty', v_n, 'price', v_price));
      v_cost := v_cost + v_n * v_price;
      v_units := v_units + v_n;
      v_price := null; v_kind := null;
    end loop;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_day from (
      select q.kind as k, sum((x.value->>'qty')::bigint) as n
        from public.player_ledger l, jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
        join public.hr_hunt_basic_supplies q on q.basic_id = x.key
       where l.user_id = p_user and l.slot = p_slot and l.kind = 'hunt' and l.intent = 'supply_buy'
         and l.at >= public.hr_utc_day_start(now()) group by q.kind) a;
    -- PER UTC DAY: the food-and-drink lane's buys, and the shots, over 24 h.
    if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_day->>'heal')::bigint, 0)
         + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_day->>'mana')::bigint, 0) > c_day_ms / v_cons + 1
       or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_day->>'ammo')::bigint, 0)
            > c_day_ms / v_tick + 1 + (c_day_ms / v_off + 1) * (v_ammo_max + 1) then
      perform public.hr_reject('too_many_buys', jsonb_build_object('why', 'day', 'bought', v_bk, 'today', v_day)); end if;
    -- THE STORE BILL IS PAID FROM THE ACCOUNT PURSE AFTER EVERY MEMBER'S CREDITS
    -- (2026-12-15-account-gold.sql). This member's bill rides back to hr_hunt_apply_instance
    -- (`_purse`, stripped there): once every member of the instance has applied, it debits
    -- each bill under the account's row lock (never below 0), journals its supply_buy row
    -- and holds each account to the lowest floor of its heroes that bought. Heroes of one
    -- account in one instance spend the ONE purse in time order (the engine shares it), so
    -- only that whole-window order can be re-proved; any member-by-member order could dip.
    if v_cost > 0 then
      update public.hunt_session_tally t
         set bought = public.hr_jsonb_add(t.bought, (select coalesce(jsonb_object_agg(i.key, (i.value->>'qty')::bigint), '{}'::jsonb)
                                                        from jsonb_each(v_items) i)),
             supply_gold = t.supply_gold + v_cost
       where t.session_id = p_session;
    end if;
  end if;
  -- PER WINDOW, OWN + STORE TOGETHER: food and drink share ONE lane (consumable,
  -- consumables.js laneMs); a shot or a rune is at most one a swing (the ranged
  -- basic) plus every ability cast's on the offense lane.
  if coalesce((v_bk->>'heal')::bigint, 0) + coalesce((v_bk->>'mana')::bigint, 0) + coalesce((v_ukind->>'heal')::bigint, 0)
       + coalesce((v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1
     or coalesce((v_bk->>'ammo')::bigint, 0) + coalesce((v_ukind->>'ammo')::bigint, 0)
       > v_nsw + 1 + (v_win / v_off + 1) * (v_ammo_max + 1) then
    perform public.hr_reject('too_many_uses', jsonb_build_object('bought', v_bk, 'used', v_ukind, 'window_ms', v_win));
  end if;

  -- (5) THE SESSION HALF (2026-10-23-hunt-supply-ledger.sql).
  -- The session half's gold_out proof reads the purse less this window's own bill (paid later).
  perform set_config('hr.purse_pending', v_cost::text, true);
  v_h := public.hr_hunt_settle_session(p_user, p_slot, p_session, v_hunt);
  perform set_config('hr.purse_pending', '', true);
  if coalesce(v_h->>'ok', 'true') = 'false' then perform public.hr_reject(coalesce(v_h->>'error', 'hunt_settle_refused'), v_h); end if;
  -- STAMINA LOW: once per hunt, when the pool this window left is at or under the limits row.
  if v_e <= coalesce(public.hr_hunt_limit('stamina_low_min'), 0)::bigint * 60000
     and not exists (select 1 from public.hunt_session_events e where e.session_id = p_session and e.type = 'stamina_low') then
    insert into public.hunt_session_events (session_id, user_id, slot, type, at, data)
      values (p_session, p_user, p_slot, 'stamina_low', v_to, jsonb_build_object('n', v_e / 60000));
  end if;

  -- BLESSINGS (hook: hr_blessing_take): the death keeps only the unprotected share of its
  -- loss (Level and skills); the tiers it used (held since before the window began) are used up.
  if v_nd > 0 then
    v_bless := public.hr_blessing_take(p_user, p_slot, p_session, v_dx, v_s.settled_to);
    if v_bless is not null then v_dx := v_bless->'dx'; v_lost := v_bless->'lost'; end if;
  end if;
  -- (6) THE PRICE OF THE DEATH, RE-CHECKED AND DEBITED (Tyler 2026-10-19, CORE_MODEL.md §6):
  --     the LEVEL loses at most death_xp_permille of its total XP (death_xp_base 0) or of
  --     its current Level's span (1), the debit never below the current Level's start;
  --     each combat skill loses at most the permille of its progress into its level.
  --     Bounds are read on the CURRENT values, which only grew since the death.
  if v_lost <> '{}'::jsonb then
    for v_k, v_n in select key, (value #>> '{}')::bigint from jsonb_each(v_lost) order by key loop
      if v_k = 'level' then
        select level_xp into v_cur from public.player_state where user_id = p_user and slot = p_slot for update;
        v_lvl := public.hr_char_level(v_cur);
        v_xfloor := public.hr_char_xp_for_level(v_lvl);
        v_lxb := case when v_base = 1 then public.hr_char_xp_for_level(v_lvl + 1) - v_xfloor else v_cur end;
        if v_n > floor(v_lxb * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
          perform public.hr_reject('death_xp_over', jsonb_build_object('skill', 'level', 'level', v_lvl)); end if;
        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;
        continue;
      end if;
      select xp into v_cur from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_k for update;
      if v_cur is null then perform public.hr_reject('bad_death_xp', jsonb_build_object('skill', v_k)); end if;
      v_lv := public.hr_skill_level(v_k, v_cur);
      v_xfloor := public.hr_skill_xp_for_level(v_k, v_lv);
      if v_n > floor((v_cur - v_xfloor) * v_rate / 1000.0) or v_cur - v_n < v_xfloor then
        perform public.hr_reject('death_xp_over', jsonb_build_object('skill', v_k, 'level', v_lv)); end if;
      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;
    end loop;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'death_xp',
              jsonb_build_object('reason', 'death_xp', 'xp', v_lost, 'deaths', v_nd, 'permille', v_rate, 'base', v_base), p_session);
    for v_r in select e.id, e.data->>'skill' as sk, (e.data->>'level')::int as lv
                 from public.hunt_session_events e
                where e.session_id = p_session and e.id > v_ev0 and e.type = 'level_up' and v_lost ? (e.data->>'skill') loop
      if v_r.sk = 'level' then
        v_fin := public.hr_char_level((select level_xp from public.player_state where user_id = p_user and slot = p_slot));
        v_lv0 := public.hr_char_level(coalesce(v_lx0, 0));
      else
        v_fin := public.hr_skill_level(v_r.sk, (select xp from public.player_skills where user_id = p_user and slot = p_slot and skill_id = v_r.sk));
        v_lv0 := public.hr_skill_level(v_r.sk, coalesce((v_xp0->>v_r.sk)::bigint, 0));
      end if;
      if v_r.lv > v_fin then
        if v_fin > v_lv0 then update public.hunt_session_events set data = data || jsonb_build_object('level', v_fin) where id = v_r.id;
        else delete from public.hunt_session_events where id = v_r.id; end if;
      end if;
    end loop;
  end if;
  v_fi := 0;
  for v_r in select e.id from public.hunt_session_events e
              where e.session_id = p_session and e.id > v_ev0 and e.type = 'death' order by e.id loop
    v_el := coalesce(v_dx->v_fi, '{}'::jsonb);
    update public.hunt_session_events
       set data = data || jsonb_build_object('xp_lost', v_el, 'xp', (select coalesce(sum((x.value #>> '{}')::bigint), 0) from jsonb_each(v_el) x))
     where id = v_r.id;
    v_fi := v_fi + 1;
  end loop;

  -- (7) AN AUTOMATIC END RESUMES WHAT THE CHARACTER WAS DOING (after the walk home).
  v_end := v_h->>'ended';
  if v_end is not null and coalesce((select r.resumes from public.hr_hunt_end_reasons r where r.reason = v_end), false) then
    select ps.last_activity_kind, ps.last_activity_id into v_lk, v_li from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;
    select h.ended_at + make_interval(secs => coalesce((select t.travel_s from public.hr_hunt_travel t where t.hunt_id = h.hunt_id), 0))
      into v_home from public.hunt_sessions h where h.id = p_session;
    v_ok := v_lk is not null and v_home is not null
      and exists (select 1 from public.hr_activities a where a.kind = v_lk and a.activity_id = v_li)
      and not exists (select 1 from public.hr_activities a
                       where a.kind = v_lk and a.activity_id = v_li and a.req_skill is not null and a.req_lv is not null
                         and coalesce((select public.hr_skill_level(a.req_skill, sk.xp) from public.player_skills sk
                                        where sk.user_id = p_user and sk.slot = p_slot and sk.skill_id = a.req_skill), 1) < a.req_lv);
    if v_ok then
      update public.player_state
         set active_kind = v_lk, active_id = v_li, active_since = v_home, accrued_to = v_home,
             fight = '{}'::jsonb, version = version + 1, updated_at = now()
       where user_id = p_user and slot = p_slot;
      insert into public.hr_return_anchor (user_id, slot, real_return_at, updated_at)
        values (p_user, p_slot, v_home, now())
        on conflict (user_id, slot) do update
          set real_return_at = greatest(public.hr_return_anchor.real_return_at, excluded.real_return_at), updated_at = now();
    end if;
    insert into public.player_ledger (user_id, slot, kind, intent, meta, session_id)
      values (p_user, p_slot, 'hunt', 'resume',
              jsonb_build_object('reason', v_end, 'resumed', v_ok, 'kind', v_lk, 'id', v_li, 'at', v_home), p_session);
    update public.hunt_session_events e
       set data = e.data || jsonb_build_object('resume', case when v_ok then jsonb_build_object('kind', v_lk, 'id', v_li, 'at', v_home) else null end)
     where e.session_id = p_session and e.id > v_ev0 and e.type = 'ended';
  end if;
  -- THE ANALYZER TALLY (display) and THE HERO'S UNIT (null once it has left).
  if p_analyzer is not null and jsonb_typeof(p_analyzer) = 'object' then
    update public.hunt_session_tally t
       set dealt = public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->'dealt', '{}'::jsonb)),
           taken = public.hr_hunt_tally_add(t.taken, coalesce(p_analyzer->'taken', '{}'::jsonb)),
           healed = public.hr_hunt_tally_add(t.healed, coalesce(p_analyzer->'healed', '{}'::jsonb))
     where t.session_id = p_session;
  end if;
  update public.hunt_sessions set unit_id = case when ended_at is null then v_unit_id end where id = p_session;
  -- The debited (blessed) loss of the death travels back with the answer.
  return coalesce(v_h, '{}'::jsonb) || case when v_nd > 0 then jsonb_build_object('death_xp', v_dx) else '{}'::jsonb end
    -- THE BILL hr_hunt_apply_instance pays (and strips before any answer leaves it).
    || case when v_cost > 0 then jsonb_build_object('_purse', jsonb_build_object('cost', v_cost, 'units', v_units,
                                   'items', v_items, 'floor', v_floor)) else '{}'::jsonb end;
end $function$;

-- ── public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer) ──
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
begin
  -- DENSITY-BOUNDS (2026-11-16-hunt-density-bounds.sql): a refusal after the lock is counted; the sixth in a row forfeits.
  -- DEPLOY-NO-FORFEIT (2026-12-11-hunt-deploy-no-forfeit.sql): a world of the shape the catalogue just replaced is held, not counted.
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  if v_role in ('anon', 'authenticated', 'service_role') then
    raise exception 'hr_hunt_apply_instance: not callable by %', v_role using errcode = '42501';
  end if;
  if p_instance is null or p_world_from is null or p_settle is null or jsonb_typeof(p_settle) <> 'object'
     or p_members is null or jsonb_typeof(p_members) <> 'array' or jsonb_array_length(p_members) = 0
     or jsonb_array_length(p_members) > coalesce(public.hr_hunt_limit('party_max'), 1) then
    return jsonb_build_object('ok', false, 'error', 'bad_arguments');
  end if;
  if exists (select 1 from jsonb_object_keys(p_settle) k where k not in ('to', 'world_swing', 'world'))
     or exists (select 1 from jsonb_array_elements(p_members) e
                 where jsonb_typeof(e.value) <> 'object'
                    or exists (select 1 from jsonb_object_keys(e.value) k
                                where k not in ('user', 'slot', 'session', 'version', 'intent', 'delta', 'hunt', 'analyzer'))) then
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
  begin
    for v_m in select e.value from jsonb_array_elements(p_members) e order by (e.value->>'user')::uuid, (e.value->>'slot')::int loop
      v_h := public.hr_hunt_apply_member(p_instance, (v_m->>'user')::uuid, (v_m->>'slot')::int, (v_m->>'session')::uuid,
        (v_m->>'intent')::uuid, v_m->'delta', v_m->'hunt', v_m->'analyzer');
      if v_h ? '_purse' then
        v_pend := v_pend || jsonb_build_array((v_h->'_purse')
                  || jsonb_build_object('user', v_m->'user', 'slot', v_m->'slot', 'session', v_m->'session'));
        v_h := v_h - '_purse';
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
        perform public.hr_reject('gold_short', jsonb_build_object('why', 'floor', 'gold', public.hr_purse_of(v_u), 'floor', v_f));
      end if;
    end loop;
    if exists (select 1 from jsonb_array_elements(v_out) o where coalesce((o.value->'hunt_settle'->>'replayed')::boolean, false)) then
      -- A member whose key already landed under a moved instance is a defect (the CAS above passed).
      perform public.hr_reject('session_moved', jsonb_build_object('why', 'partial_replay'));
    end if;
    -- THE INSTANCE: its world (none once no session of it is open), swing counter and clock; the count starts over.
    select count(*) into v_n from public.hunt_sessions h where h.instance_id = p_instance and h.ended_at is null;
    update public.hunt_instances
       set world = case when v_n > 0 then v_world end, world_swing = v_wsw,
           settled_to = v_to, next_swing_at = v_to, refusals = 0, version = version + 1
     where id = p_instance;
  exception when sqlstate 'HR000' then
    get stacked diagnostics v_code = message_text, v_detail = pg_exception_detail;
    perform set_config('hr.hunt_session', '', true);
    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first,
      jsonb_build_object('ok', false, 'error', v_code, 'stage', 'instance',
        'detail', case when v_detail ~ '^\{.*\}$' then v_detail::jsonb end));
  end;
  return jsonb_build_object('ok', true, 'members', v_out,
    'instance', jsonb_build_object('id', p_instance, 'world_swing', v_wsw, 'settled_to', v_to),
    'state', case when p_project_user is not null then public.hr_state_of(p_project_user, p_project_slot) end);
end $function$;

-- ── §5 hr_apply — FOUR ANCHORED EDITS (RESTATEMENT-DEBT-ACK in the header) ──
-- Each anchor must match EXACTLY once or the block raises. A body that already reads
-- `public.hr_purse_move(v_uid, v_n, 0)` is this file's post-image: skipped.
do $mig$
declare
  v_def text; v_new text; v_n int; v_a text;
  a1 text := $a$    'quest','equip','admin','iap','clan','raid','enchant','worker'];
$a$;
  r1 text := $a$    'quest','equip','admin','iap','clan','raid','enchant','worker',
    -- ACCOUNT GOLD (2026-12-15-account-gold.sql): the loot filter's sale journals as a hunt gold move.
    'hunt'];
$a$;
  a2 text := $a$    v_new_gold := v_st.gold;
    if p_delta ? 'gold' then
      v_n := coalesce((p_delta->>'gold')::bigint, 0);
      if abs(v_n) > c_max_gold_delta then
        perform public.hr_reject('gold_clamp', jsonb_build_object('limit', c_max_gold_delta));
      end if;
      v_new_gold := v_st.gold + v_n;
      if v_new_gold < 0 then
        perform public.hr_reject('insufficient_gold',
                                 jsonb_build_object('have', v_st.gold, 'need', -v_n));
      end if;
    end if;
$a$;
  r2 text := $a$    -- ACCOUNT GOLD (2026-12-15-account-gold.sql): gold is ONE purse per account
    -- (public.account_wallet.gold), shared by every hero. The move lands HERE, under
    -- the purse's row lock (hr_purse_move), held to commit; a debit never takes the
    -- purse below 0. v_new_gold is the purse AFTER it (this apply's ledger `purse`).
    v_new_gold := null;
    if p_delta ? 'gold' then
      v_n := coalesce((p_delta->>'gold')::bigint, 0);
      if abs(v_n) > c_max_gold_delta then
        perform public.hr_reject('gold_clamp', jsonb_build_object('limit', c_max_gold_delta));
      end if;
      if v_n <> 0 then
        v_new_gold := public.hr_purse_move(v_uid, v_n, 0);
        if v_new_gold is null then
          perform public.hr_reject('insufficient_gold',
                                   jsonb_build_object('have', public.hr_purse_of(v_uid), 'need', -v_n));
        end if;
      end if;
    end if;
$a$;
  a3 text := $a$       set gold = v_new_gold,
           -- CONSUMABLE BUFFS (2026-09-13): the queue rebuilt at (4a-b) from the
$a$;
  r3 text := $a$       set -- (gold: the ACCOUNT purse, moved at the GOLD block above, 2026-12-15-account-gold.sql)
           -- CONSUMABLE BUFFS (2026-09-13): the queue rebuilt at (4a-b) from the
$a$;
  a4 text := $a$      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
    values
      (v_uid, v_slot, v_kind, v_j->>'intent',
       coalesce((p_delta->>'gold')::bigint, 0),
       v_gold_in, v_xp_in, v_qty_in, 0,
$a$;
  r4 text := $a$      (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, purse, meta)
    values
      (v_uid, v_slot, v_kind, v_j->>'intent',
       coalesce((p_delta->>'gold')::bigint, 0),
       v_gold_in, v_xp_in, v_qty_in, 0, v_new_gold,
$a$;
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if position('public.hr_purse_move(v_uid, v_n, 0)' in v_def) > 0 then
    raise notice 'account-gold §5: hr_apply already moves the account purse - patch skipped'; return;
  end if;
  foreach v_a in array array[a1, a2, a3, a4] loop
    v_n := (length(v_def) - length(replace(v_def, v_a, ''))) / length(v_a);
    if v_n <> 1 then raise exception 'account-gold §5: an hr_apply anchor matched % times: %', v_n, left(v_a, 120); end if;
  end loop;
  v_new := replace(v_def, a1, r1);
  v_new := replace(v_new, a2, r2);
  v_new := replace(v_new, a3, r3);
  v_new := replace(v_new, a4, r4);
  execute v_new;
end $mig$;

-- ── §6 GRANTS: revoke-then-grant, every restated body's CURRENT ACL restated ──
revoke all on function public.hr_state_of(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_state_of(uuid, integer) to hr_engine;
revoke all on function public.hr_renown_of(uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_renown_of(uuid, integer) to hr_engine;
revoke all on function public.hr_create_character(integer) from public, anon, service_role;
grant execute on function public.hr_create_character(integer) to authenticated;
revoke all on function public.hr_buy_hero_slot__ungated(integer, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.hr_farm_purse_pay(uuid, integer, bigint) from public, anon, authenticated, service_role;
revoke all on function public.hr_trait_buy__ungated(text, integer, uuid) from public, anon, authenticated, service_role;
revoke all on function public.clan_contribute__ungated(uuid, bigint, integer) from public, anon, authenticated;
grant execute on function public.clan_contribute__ungated(uuid, bigint, integer) to service_role;
revoke all on function public.hr_unlock_buy(uuid, integer, bigint, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.hr_unlock_buy(uuid, integer, bigint, uuid, text) to hr_engine;
revoke all on function public.hr_market_buy(uuid, integer, bigint, uuid, uuid, bigint) from public, anon, authenticated, service_role;
grant execute on function public.hr_market_buy(uuid, integer, bigint, uuid, uuid, bigint) to hr_engine;
revoke all on function public.hr_hunt_loot_rules(uuid, integer, uuid, uuid, jsonb, timestamp with time zone) from public, anon, authenticated, service_role;
revoke all on function public.hr_hunt_settle_session(uuid, integer, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.hr_hunt_apply_member(uuid, uuid, integer, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, integer) to hr_engine;
revoke all on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) to hr_engine;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe rolled back ──────────
do $mig$
declare
  v_u  constant uuid := '000000c0-0000-4000-a000-00000901d002';
  v_u2 constant uuid := '000000c0-0000-4000-a000-00000901d003';
  k    constant text := '000000c0-0000-4000-b000-0901';
  v jsonb; v_kit bigint; v_p bigint; v_g bigint; v_role text; v_sig text; r record;
  v_prev bigint; v_bad int;
begin
  select coalesce(gold, 0) into v_kit from public.hr_start_kit;
  begin
    -- (a) TWO HEROES OF ONE ACCOUNT: the kit's gold joins ONE purse, journalled with it.
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'account-gold §7 probe') on conflict (user_id) do nothing;
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(0) refused: %', v; end if;
    v := public.hr_create_character(1);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'VERIFY(a): hr_create_character(1) refused: %', v; end if;
    if public.hr_purse_of(v_u) <> 2 * v_kit then
      raise exception 'VERIFY(a): two kits of % made a purse of %', v_kit, public.hr_purse_of(v_u); end if;
    -- (b) BOTH HEROES SEE THE SAME GOLD, at the same version.
    if (public.hr_state_of(v_u, 0)->'state'->>'gold')::bigint is distinct from 2 * v_kit
       or public.hr_state_of(v_u, 0)->'state'->'gold' is distinct from public.hr_state_of(v_u, 1)->'state'->'gold'
       or public.hr_state_of(v_u, 0)->'state'->'gold_v' is distinct from public.hr_state_of(v_u, 1)->'state'->'gold_v' then
      raise exception 'VERIFY(b): slot 0 reads % and slot 1 reads %', public.hr_state_of(v_u, 0)->'state', public.hr_state_of(v_u, 1)->'state'; end if;
    -- (c) TWO HEROES SPEND ONE PURSE, slot 0 FIRST: the second spend the purse cannot pay is refused, nothing moves.
    v_p := public.hr_purse_of(v_u);
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), (k || 'c0010001')::uuid,
           jsonb_build_object('gold', -(v_p - 100), 'journal', jsonb_build_object('kind', 'shop', 'intent', 'shop_buy:probe:1')));
    if coalesce(v->>'ok', '') <> 'true' or public.hr_purse_of(v_u) <> 100 then
      raise exception 'VERIFY(c): slot 0 spending % of % answered % (purse %)', v_p - 100, v_p, v, public.hr_purse_of(v_u); end if;
    if (v->'state'->>'gold')::bigint <> 100 then raise exception 'VERIFY(c): the apply''s envelope says % gold, the purse 100', v->'state'->>'gold'; end if;
    v := public.hr_apply(v_u, 1, (select version from public.player_state where user_id = v_u and slot = 1), (k || 'c0010002')::uuid,
           jsonb_build_object('gold', -150, 'journal', jsonb_build_object('kind', 'shop', 'intent', 'shop_buy:probe:2')));
    if v->>'error' is distinct from 'insufficient_gold' or (v->>'have')::bigint is distinct from 100 or public.hr_purse_of(v_u) <> 100 then
      raise exception 'VERIFY(c): slot 1 overspending the purse answered % (purse %)', v, public.hr_purse_of(v_u); end if;
    -- A replayed key moves nothing.
    v := public.hr_apply(v_u, 0, (select version from public.player_state where user_id = v_u and slot = 0), (k || 'c0010001')::uuid,
           jsonb_build_object('gold', -(v_p - 100), 'journal', jsonb_build_object('kind', 'shop', 'intent', 'shop_buy:probe:1')));
    if public.hr_purse_of(v_u) <> 100 then raise exception 'VERIFY(c): a replayed spend moved the purse to %', public.hr_purse_of(v_u); end if;
    -- (c2) THE OTHER ORDER on a second account: slot 1 first, then slot 0 — the same one spend lands.
    perform set_config('request.jwt.claim.sub', v_u2::text, true);
    insert into auth.users (id) values (v_u2) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (v_u2, 'account-gold §7 probe') on conflict (user_id) do nothing;
    perform public.hr_create_character(0); perform public.hr_create_character(1);
    v_p := public.hr_purse_of(v_u2);
    v := public.hr_apply(v_u2, 1, (select version from public.player_state where user_id = v_u2 and slot = 1), (k || 'c0020001')::uuid,
           jsonb_build_object('gold', -(v_p - 100), 'journal', jsonb_build_object('kind', 'shop', 'intent', 'shop_buy:probe:1')));
    if coalesce(v->>'ok', '') <> 'true' or public.hr_purse_of(v_u2) <> 100 then raise exception 'VERIFY(c2): slot 1 first answered %', v; end if;
    v := public.hr_apply(v_u2, 0, (select version from public.player_state where user_id = v_u2 and slot = 0), (k || 'c0020002')::uuid,
           jsonb_build_object('gold', -150, 'journal', jsonb_build_object('kind', 'shop', 'intent', 'shop_buy:probe:2')));
    if v->>'error' is distinct from 'insufficient_gold' or public.hr_purse_of(v_u2) <> 100 then
      raise exception 'VERIFY(c2): slot 0 second answered % (purse %)', v, public.hr_purse_of(v_u2); end if;
    -- (d) A HERO EARNS, ITS SIBLING SPENDS IT: slot 1 credits 400, slot 0 then spends 450 of the 500.
    v := public.hr_apply(v_u2, 1, (select version from public.player_state where user_id = v_u2 and slot = 1), (k || 'c0020003')::uuid,
           jsonb_build_object('gold', 400, 'journal', jsonb_build_object('kind', 'shop', 'intent', 'vendor_sell:probe:1')));
    v := public.hr_apply(v_u2, 0, (select version from public.player_state where user_id = v_u2 and slot = 0), (k || 'c0020004')::uuid,
           jsonb_build_object('gold', -450, 'journal', jsonb_build_object('kind', 'shop', 'intent', 'shop_buy:probe:3')));
    if coalesce(v->>'ok', '') <> 'true' or public.hr_purse_of(v_u2) <> 50 then
      raise exception 'VERIFY(d): slot 0 spending slot 1''s 400 answered % (purse %)', v, public.hr_purse_of(v_u2); end if;
    -- (e) THE FLOOR IS ON THE ACCOUNT PURSE: a debit that would leave less than the floor is refused, one that keeps it lands.
    if public.hr_purse_move(v_u2, -30, 25) is not null or public.hr_purse_of(v_u2) <> 50 then
      raise exception 'VERIFY(e): a debit under the floor moved the purse to %', public.hr_purse_of(v_u2); end if;
    v_g := public.hr_purse_move(v_u2, -25, 25);
    if v_g is distinct from 25 then raise exception 'VERIFY(e): a debit to exactly the floor answered %', v_g; end if;
    insert into public.player_ledger (user_id, slot, kind, intent, gold, purse) values (v_u2, 0, 'admin', 'probe_floor', -25, v_g);
    if public.hr_purse_move(v_u2, -26, 0) is not null or public.hr_purse_of(v_u2) <> 25 then raise exception 'VERIFY(e): a debit past 0 landed'; end if;
    -- (f) THE LEDGER BALANCES: per account, every gold row states the purse after it; their chain
    --     from 0 (a fresh account: no fold row) ends at the purse; every one carries a gold_kind.
    foreach v_role in array array[v_u::text, v_u2::text] loop
      v_prev := 0; v_bad := 0;
      for r in select l.gold, l.purse, l.gold_kind from public.player_ledger l
                where l.user_id = v_role::uuid and coalesce(l.gold, 0) <> 0 order by l.id loop
        if r.purse is null or r.purse <> v_prev + r.gold or r.gold_kind is null then v_bad := v_bad + 1; end if;
        v_prev := coalesce(r.purse, v_prev + r.gold);
      end loop;
      if v_bad > 0 or v_prev <> public.hr_purse_of(v_role::uuid)
         or (select coalesce(sum(gold), 0) from public.player_ledger where user_id = v_role::uuid) <> public.hr_purse_of(v_role::uuid) then
        raise exception 'VERIFY(f): account %: % broken links, chain ends at %, purse %', v_role, v_bad, v_prev, public.hr_purse_of(v_role::uuid); end if;
    end loop;
    if (select count(*) from public.player_ledger where user_id = v_u and gold_kind = 'start_kit') <> 2
       or (select count(*) from public.player_ledger where user_id = v_u2 and gold_kind = 'vendor_sale' and slot = 1) <> 1
       or (select count(*) from public.player_ledger where user_id = v_u2 and gold_kind = 'shop' and slot = 0) <> 1 then
      raise exception 'VERIFY(f): the gold kinds are %', (select jsonb_agg(jsonb_build_array(user_id, slot, gold, gold_kind)) from public.player_ledger where user_id in (v_u, v_u2)); end if;
    -- (g) THE TRIGGER REFUSES A GOLD ROW THAT LIES ABOUT THE PURSE, AND STATES IT FOR ONE THAT SAID NONE.
    begin
      insert into public.player_ledger (user_id, slot, kind, intent, gold, purse) values (v_u2, 0, 'admin', 'probe_lie', 5, 999);
      raise exception 'VERIFY(g): a gold row stating purse 999 (the purse is %) was journalled', public.hr_purse_of(v_u2);
    exception when sqlstate 'HR000' then null; end;
    v_g := public.hr_purse_move(v_u2, 5, 0);
    insert into public.player_ledger (user_id, slot, kind, intent, gold) values (v_u2, 0, 'farm', 'farm_upgrade_plot', 5);
    if (select purse from public.player_ledger where user_id = v_u2 and intent = 'farm_upgrade_plot') is distinct from v_g
       or (select gold_kind from public.player_ledger where user_id = v_u2 and intent = 'farm_upgrade_plot') is distinct from 'farm' then
      raise exception 'VERIFY(g): a gold row that stated no purse reads %', (select to_jsonb(l) from public.player_ledger l where user_id = v_u2 and intent = 'farm_upgrade_plot'); end if;
    -- (h) NO HERO ROW HOLDS GOLD; the projection is the purse.
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'gold') then
      raise exception 'VERIFY(h): player_state.gold still exists - a second copy of the purse'; end if;
    raise exception using errcode = 'HR902', message = 'account-gold §7 complete - rolling back';
  exception when sqlstate 'HR902' then
    null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id in (v_u, v_u2)) or exists (select 1 from public.account_wallet where user_id in (v_u, v_u2))
     or exists (select 1 from public.player_ledger where user_id in (v_u, v_u2)) then
    raise exception 'VERIFY(i): §7 LEAKED a probe row'; end if;
  -- (i) THE GRANTS: no client or engine reaches a helper; no client writes the purse or the ledger.
  foreach v_sig in array array['public.hr_purse_of(uuid)', 'public.hr_purse_lock(uuid)', 'public.hr_purse_move(uuid,bigint,bigint)',
                               'public.hr_gold_kind(text,text,uuid)', 'public.hr_ledger_stamp_purse()'] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'hr_engine', 'hr_tick'] loop
      if exists (select 1 from pg_roles where rolname = v_role) and has_function_privilege(v_role, v_sig, 'execute') then
        raise exception 'VERIFY(i): % can execute %', v_role, v_sig; end if;
    end loop;
  end loop;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if has_table_privilege(v_role, 'public.account_wallet', 'insert,update,delete,truncate')
       or has_table_privilege(v_role, 'public.player_ledger', 'insert,update,delete,truncate') then
      raise exception 'VERIFY(i): % can write account_wallet or player_ledger', v_role; end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'account_wallet') then
    raise exception 'VERIFY(i): account_wallet carries a policy'; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.player_ledger'::regclass and tgname = 'hr_ledger_stamp_purse' and tgenabled = 'O') then
    raise exception 'VERIFY(i): the purse trigger is not armed'; end if;
  -- the money doors kept their own ACLs
  if has_function_privilege('authenticated', 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_unlock_buy(uuid,integer,bigint,uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_buy_hero_slot__ungated(integer,integer,uuid)', 'execute')
     or not has_function_privilege('hr_engine', 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_farm_upgrade_plot(integer,uuid,integer)', 'execute') then
    raise exception 'VERIFY(i): a restated gold body''s ACL moved'; end if;
  perform public.hr_assert_grant_hygiene(true);
end $mig$;
