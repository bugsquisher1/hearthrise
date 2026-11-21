-- ════════════════════════════════════════════════════════════════════════
-- supabase/migrations/1032-approved-cuts.sql — THE APPROVED CUTS: the old dungeons and the scrip whole, the gem rows and the
--   gem RPC, the premium bond, and the Discord gift code (lane/c-approved-cuts, backend-architect, 2026-11-20).
--
-- STATUS: supabase/migration-notes/1032-approved-cuts.sql.json (STAGED until the Coordinator applies it).
-- ORDER: the sequence in this file's name (CLAUDE.md rule 12): it runs after every file on its base (the set's 1009-1031 included).
--   This lane's items, tally and unlock catalogues (1033, 1034, 1035) run AFTER it, so the bond's start-kit column is gone before a
--   catalogue upserts the kit without it; the Shop's bids on the cut items leave earlier, folded into the STAGED hunt-sessions
--   forward files 1012-approved-rows, 1021-tohit-ratio and 1028-spell-rule (one forward file per generator).
-- Applied as ONE transaction by the apply tool; never begin/commit here. Ends with its §7 self-check.
--
-- ── WHY (Tyler 2026-11-20, the balance program's rulings; build plan L10) ─────────────────────────────────────────────────
-- 22-10  THE OLD DUNGEONS, CUT WHOLE (docs/design/balance-program/22-endgame.md, card `old-dungeons`): six hr_dungeons rows,
--        hr_dungeon_loot (empty), five functions and the scrip (player_state.dungeon_scrip, the Quartermaster's hr_qm_offers
--        (empty) and its spend verb). No player can reach any of it: no edge path calls hr_dungeon_settle or
--        hr_quartermaster_buy since lane C2 deleted dungeon-settle.js, and no screen reads `dungeon_cooldowns` or
--        `state.dungeon_scrip`. hr_muster_window (the old clan raid's twice-daily window) answered only hr_server_now's
--        `live_event_key`, which no client reads (src/ has no reader).
-- 24-5   THE GEM ROWS, THE GEM RPC AND THE BOND, CUT FIRST (24-economy.md Q8): hr_gem_unlocks (ten rows: four cosmetics and six
--        house themes priced in gems), the client RPC hr_buy_gem_unlock (+ __ungated), hr_gem_unlocks_of, account_gem_grants,
--        the gem prices on hero slots (hr_hero_slots.cost_gems: nothing reads it, slots are sold for gold), and the bond
--        `hearth_token` (tradeable, worth 25,000, bid on by the Shop: the house printing gold for money). The bond leaves
--        hr_items in this lane's items catalogue; here its other halves go: account_wallet.hearth_tokens,
--        hr_start_kit.hearth_tokens, and hr_market_premium_items (the market's list of premium:true items, whose only row
--        was the bond), with the view hr_market_items restated without it. Crowns come later as a number on the account.
-- 27-7   THE DISCORD GIFT AS BUILT (27-retention.md, card `discord-gift`; the plan audit moved it into L10): hr_claim_discord_gift
--        (+ __ungated), hr_discord_code_current, hr_discord_code_for and hr_discord_gift_claims. It paid 25 gems, and the gem
--        mint already refuses (hr_wallet_credit: "gems are not in the game"), so a claim could only fail after its row.
-- MEASURED LIVE, read-only (2026-11-21): no account holds the bond or a boss-forged piece in any bag, depot, worn slot, hunt
--   bag or listing; every account_wallet.hearth_tokens, account_wallet.gems and player_state.dungeon_scrip is 0;
--   account_gem_grants and hr_discord_gift_claims hold 0 rows; player_ledger holds no 'dungeon', 'gem_unlock' or
--   'discord_gift' row. §0 re-measures every one of those at apply time and refuses rather than strand a value.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- §0 preconditions, the three pins (hr_state_of, hr_server_now, hr_assert_grant_hygiene: the chain end's body or this file's
--    image, nothing else), and NOTHING STRANDED.
-- §1 THE ENVELOPE: hr_state_of restated WHOLE from the live image (md5 e0a71bfe…, 2027-01-18-dead-surfaces-cut.sql's),
--    removing exactly `dungeon_cooldowns`, `state.dungeon_scrip`, `state.hearth_tokens` and `gem_unlocks` with their comment
--    blocks (tests/chain-removals/1032-approved-cuts.mjs, generated from the diff). hr_server_now restated without
--    `live_event_key`. Every other key, expression and comment is byte-identical.
-- §2 THE OLD DUNGEONS AND THE SCRIP: six functions, three tables, the ledger's partial index for kind 'dungeon', and
--    player_state.dungeon_scrip. The journal's old 'dungeon' rows (none live) stay: the ledger is append-only.
-- §3 THE GEM ROWS AND THE GEM RPC: three functions, two tables, hr_hero_slots.cost_gems, and the RPC's baseline row. The gem
--    BALANCE (account_wallet.gems, the ledger's gems_in, hr_apply's refusal of a gem delta, the day budget's gem dimension)
--    is NOT cut here: it is the wallet the Crowns build (plan L49) reshapes, and every gem mint already refuses.
-- §4 THE BOND: hr_market_items restated without hr_market_premium_items (same columns, same order); the table dropped;
--    account_wallet.hearth_tokens and hr_start_kit.hearth_tokens dropped.
-- §5 THE DISCORD GIFT: four functions, the table (its hr_gm_wall trigger goes with it), the RPC's baseline row. The Vault
--    secret hr_discord_gift_secret, if one was stored, is an operator's to delete (a migration does not touch the Vault).
-- §6 THE DETECTOR: link 25 of HR_GRANT_HYGIENE_CHAIN, DERIVED (tools/derive-grant-hygiene.mjs): the c_engine_allow entries of
--    hr_quartermaster_buy and hr_dungeon_settle (and the claim comments above them) are replaced by a two-line note, so a
--    re-created function of either signature granted to hr_engine reads engine_execute_outside_allowlist; with the two
--    baseline rows gone, a re-granted hr_buy_gem_unlock or hr_claim_discord_gift reads unapproved_client_rpcs. Nothing can
--    quietly regrant them (§7(c) proves both by planting them).
-- KEPT, on purpose: hr_rpc_gate's case labels 'hr_buy_gem_unlock' and 'hr_claim_discord_gift' (a quoted label is not a call:
--    the 2026-12-04 and 2027-01-18 cuts' precedent; restating the gate for two inert labels is a wider diff than the cut);
--    hr_unlocks' theme:* rows leave in this lane's unlock catalogue (tools/gen-unlocks.mjs RETIRED_UNLOCKS), not here.
--
-- ── CONCURRENCY / IDEMPOTENCY ──────────────────────────────────────────────────────────────────────────────────────────────
-- DDL in one transaction: every drop takes its ACCESS EXCLUSIVE lock and the restatements are create-or-replace. No player row
--   is written. A second apply: every drop is `if exists`, the restatements are this file's images (the pins accept them),
--   the baseline deletes match nothing: byte-identical (tests/schema-drift.mjs). No intent, no idempotency key: nothing a
--   player sends moves here.
--
-- ── EXPLOIT SURFACE DELTA ──────────────────────────────────────────────────────────────────────────────────────────────────
-- Only shrinks: two client RPCs fewer (hr_buy_gem_unlock: a gem spend; hr_claim_discord_gift: a code-gated grant), two engine
--   writers fewer (hr_dungeon_settle: a scrip and item mint; hr_quartermaster_buy: a scrip-for-item trade), a tradeable item
--   the Shop bid 25,000 gold on, and an envelope that carries four keys fewer. No grant is added, no price, clamp or ledger
--   rule moves.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────────────────────────────────────────────────────
-- Re-apply each object's last defining file (tests/live-hash-drift.baseline.json `touched_by`: 2026-09-10-dungeon-*.sql,
--   2026-09-11-quartermaster-buy.sql, 2026-09-12-dungeon-cooldown.sql, 2026-08-08-muster.sql, 2026-09-14-gem-unlock*.sql,
--   2026-10-19-account-wallet.sql, 2027-02-13-market-premium-bond.sql, 2026-10-18-discord-gift.sql) and the restated bodies
--   from 2027-01-18-dead-surfaces-cut.sql (hr_state_of), 2026-08-11-authenticated-surface-lockdown.sql (hr_server_now),
--   2027-03-14-jewelry-hallmark.sql (hr_market_items) and 1004-tick-pack-heroes.sql (the detector). The dropped tables held
--   no row on production and the dropped columns held only zeros (§0), so nothing is lost either way.
--
-- ── COST (at 100x players) ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Per envelope: two function calls (hr_dungeon_cooldowns: a ledger scan over the account's 'dungeon' rows; hr_gem_unlocks_of:
--   a union over hr_gem_unlocks and player_progress) and three scalars fewer. Per market read: one anti-join fewer. Per
--   replay: six tables, one index and fifteen functions fewer at the chain end. Nothing grows.
--
-- EDGE: none for this file (no edge path names a dropped function, table or key; tests/envelope-contract.mjs reads the
--   client's keys). The lane's items catalogue (1017) and the folded 1012 move the edge's item rows: deploy hr-accrue with them.
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS, THE PINS, AND NOTHING STRANDED ────────────────────────────────────────────────────────────────────────
do $mig$
declare
  v_md5 text;
  v_n   bigint;
  c_cut_items constant text[] := array['hearth_token', 'elderscale_platebody', 'riftmaw_carapace', 'voidheart_robe'];
  t     text;
begin
  if to_regprocedure('public.hr_state_of(uuid,integer)') is null or to_regprocedure('public.hr_server_now()') is null
     or to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is null or to_regprocedure('public.hr_create_character(integer)') is null
     or to_regclass('public.account_wallet') is null or to_regclass('public.hr_hero_slots') is null
     or to_regclass('public.hr_start_kit') is null or to_regclass('public.hr_market_items') is null
     or to_regclass('public.hr_client_rpc_baseline') is null or to_regclass('public.player_ledger') is null then
    raise exception 'PRECONDITION: apply 2027-01-18-dead-surfaces-cut.sql, 2027-03-14-jewelry-hallmark.sql and 1004-tick-pack-heroes.sql first'; end if;
  -- THE PINS. Any other body is a concurrent restatement: refuse, never silently revert it (re-derive this file from it).
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_state_of(uuid,integer)'::regprocedure;
  if v_md5 not in ('e0a71bfea1bf596df13f9cbfc59f5cf3', '5934b4ec0826b5af3ad64a226ef8b4ea') then
    raise exception 'PIN: hr_state_of moved (md5 %): re-derive this restatement from the new body', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_server_now()'::regprocedure;
  if v_md5 not in ('da61e5f17e005006466464900f8100ac', 'c2f9a557ce4b6f3eb51a110d5167bdd8') then
    raise exception 'PIN: hr_server_now moved (md5 %): re-derive this restatement from the new body', v_md5; end if;
  select md5(replace(prosrc, chr(13), '')) into v_md5 from pg_proc where oid = 'public.hr_assert_grant_hygiene(boolean)'::regprocedure;
  if v_md5 not in ('e941ed280b7c9e6fbd4fd20f87b4ee11', '1cf0b8fa714f8b567abb7d52bbdda7f0') then
    raise exception 'PIN: hr_assert_grant_hygiene is neither link 24''s body nor this file''s own: md5 % - re-derive (tools/derive-grant-hygiene.mjs)', v_md5; end if;

  -- NOTHING STRANDED (measured 0 live). A value held in a cut thing would be lost with it: refuse and let a human decide.
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_state' and column_name = 'dungeon_scrip') then
    execute 'select count(*) from public.player_state where dungeon_scrip <> 0' into v_n;
    if v_n <> 0 then raise exception 'STRANDED: % hero(es) hold Dungeon Scrip', v_n; end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'account_wallet' and column_name = 'hearth_tokens') then
    execute 'select count(*) from public.account_wallet where hearth_tokens <> 0' into v_n;
    if v_n <> 0 then raise exception 'STRANDED: % account(s) hold Hearth Tokens', v_n; end if;
  end if;
  foreach t in array array['account_gem_grants', 'hr_discord_gift_claims'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into v_n;
      if v_n <> 0 then raise exception 'STRANDED: public.% holds % row(s) of a grant this file cuts', t, v_n; end if;
    end if;
  end loop;
  -- a theme or cosmetic BOUGHT with gems (a flag on player_progress naming a priced hr_gem_unlocks row)
  if to_regclass('public.hr_gem_unlocks') is not null then
    execute 'select count(*) from public.player_progress pp join public.hr_gem_unlocks g on g.unlock_id = pp.key
              where pp.kind = ''flag'' and pp.value > 0 and not g.free' into v_n;
    if v_n <> 0 then raise exception 'STRANDED: % gem unlock(s) were bought', v_n; end if;
  end if;
  -- the bond and the three boss-forged pieces, wherever an item can be held
  select (select count(*) from public.player_inventory where item_id = any (c_cut_items))
       + (select count(*) from public.account_bank where item_id = any (c_cut_items))
       + (select count(*) from public.player_equipment where item_id = any (c_cut_items))
       + (select count(*) from public.hunt_bag where item_id = any (c_cut_items))
       + (select count(*) from public.market_listings where item_id = any (c_cut_items))
    into v_n;
  if v_n <> 0 then raise exception 'STRANDED: % holding(s) of the bond or a boss-forged piece', v_n; end if;
end $mig$;

-- ── §1 THE ENVELOPE, WITHOUT THE CUT KEYS; THE CLOCK, WITHOUT THE MUSTER WINDOW ───────────────────────────────────────────────
create or replace function public.hr_state_of(p_user uuid, p_slot integer)
returns jsonb language plpgsql security definer set search_path = public as $function$
-- hr_state_of restated 2026-09-14 (2026-09-14-hr-state-of-restatement.sql) — chain depth 0;
-- restated again WHOLE by 2026-10-19-account-wallet.sql (gems + hearth_tokens read
-- from public.account_wallet, the ACCOUNT's balance, identical on every slot).
-- restated again WHOLE by 2026-11-27-account-depot.sql: `bank` reads the ACCOUNT depot
-- (public.account_bank), identical on every slot. Nothing else moved.
-- restated again WHOLE by 2026-12-15-account-gold.sql: `state.gold` is the ACCOUNT purse
-- (public.account_wallet.gold, Tyler 2026-10-23 "it should just be account gold") and
-- `state.gold_v` the wallet version it was read at, identical on every slot; the client keeps
-- the newest one it has seen across its open heroes (raise-only). Nothing else moved.
-- restated again WHOLE by 2027-01-18-dead-surfaces-cut.sql: the hired crew (`workers`,
-- `state.workers_accrued_to`, inventory_complete's crew arm; the hire/assign doors are dropped)
-- and the per-hero `farm` array (the Farm window reads the `farm_land` section) leave the
-- envelope. Nothing else moved.
-- restated again WHOLE by lane/c-approved-cuts (Tyler 2026-11-20, build plan L10): the old dungeons' `dungeon_cooldowns`
-- and `state.dungeon_scrip`, the bond's `state.hearth_tokens` and the gem rows' `gem_unlocks` leave the envelope with
-- the functions, tables and columns they read. Nothing else moved.
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
    -- ── stamina — THE HUNT POOL (ms / at / max_ms / hunting) ──
    --    introduced by 2026-10-22-hunt-sessions-settle.sql §4c
    'stamina', public.hr_stamina_view(p_user, v_st.slot),
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
      -- ── state — hit points, the bank cap and the activity pointer ──
      --    introduced by 2026-08-11-apply-engine.sql
      'hp', least(v_st.hp, (v_vit->>'max_hp')::int), 'max_hp', (v_vit->>'max_hp')::int, 'level_xp', v_st.level_xp,
      'bank_cap', v_st.bank_cap,
      'active_kind', v_st.active_kind, 'active_id', v_st.active_id,
      'active_since', v_st.active_since, 'accrued_to', v_st.accrued_to,
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
  );
end $function$;
revoke execute on function public.hr_state_of(uuid, integer) from public, anon, authenticated;

create or replace function public.hr_server_now()
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $function$
begin
  if not public.hr_rpc_gate('hr_server_now') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  return jsonb_build_object(
    'ok', true,
    'epoch_ms', (extract(epoch from now()) * 1000)::bigint,
    'day_key', public.hr_utc_day_key()
  );
end $function$;
revoke execute on function public.hr_server_now() from public, anon;

-- ── §2 THE OLD DUNGEONS AND THE SCRIP ───────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.hr_dungeon_settle(uuid, integer, bigint, uuid, text, text, numeric);
drop function if exists public.hr_quartermaster_buy(uuid, integer, bigint, uuid, text);
drop function if exists public.hr_dungeon_cooldowns(uuid, integer);
drop function if exists public.hr_dungeon_cooldown_divisor(text);
drop function if exists public.hr_dungeon_cooldown_modes();
drop function if exists public.hr_muster_window(timestamptz);
drop table if exists public.hr_dungeon_loot;
drop table if exists public.hr_dungeons;
drop table if exists public.hr_qm_offers;
drop index if exists public.player_ledger_dungeon_idx;
alter table public.player_state drop column if exists dungeon_scrip;

-- ── §3 THE GEM ROWS AND THE GEM RPC ─────────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.hr_buy_gem_unlock(text, integer, uuid);
drop function if exists public.hr_buy_gem_unlock__ungated(text, integer, uuid);
drop function if exists public.hr_gem_unlocks_of(uuid, integer);
drop table if exists public.hr_gem_unlocks;
drop table if exists public.account_gem_grants;
alter table public.hr_hero_slots drop column if exists cost_gems;
delete from public.hr_client_rpc_baseline where proname = 'hr_buy_gem_unlock';

-- ── §4 THE BOND ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- THE ONE LISTABLE RULE, restated from 2027-03-14-jewelry-hallmark.sql without the bond's list. Same columns in the same order;
-- the premium login reward keeps its `why` ('premium'), the only premium item the market still refuses.
create or replace view public.hr_market_items with (security_invoker = true) as
  select i.item_id,
         (i.tradeable and i.value > 0 and v.item_id is not null
          and not exists (select 1 from public.hr_start_inventory k where k.item_id = i.item_id)
          and not exists (select 1 from public.hr_start_equipment e where e.item_id = i.item_id)
          and not exists (select 1 from public.hr_premium_login_reward p where p.item_id = i.item_id)) as listable,
         case when not i.tradeable then 'untradeable'
              when i.value <= 0 then 'no_value'
              when v.item_id is null then 'no_shop_price'
              when exists (select 1 from public.hr_start_inventory k where k.item_id = i.item_id)
                or exists (select 1 from public.hr_start_equipment e where e.item_id = i.item_id) then 'start_kit'
              when exists (select 1 from public.hr_premium_login_reward p where p.item_id = i.item_id) then 'premium'
         end as why,
         v.unit as floor_each,
         least(1000000000::bigint, greatest(c.ceiling_min, i.value * c.ceiling_mult, coalesce(mc.ceiling, 0::bigint)))::bigint as ceiling_each,
         i.value as book
    from public.hr_items i
    left join public.hr_hunt_vendor_value v on v.item_id = i.item_id
    left join public.hr_market_ceilings mc on mc.item_id = i.item_id
    cross join public.hr_market_config c;
drop table if exists public.hr_market_premium_items;
alter table public.account_wallet drop column if exists hearth_tokens;
alter table public.hr_start_kit drop column if exists hearth_tokens;

-- ── §5 THE DISCORD GIFT ─────────────────────────────────────────────────────────────────────────────────────────────────────
drop function if exists public.hr_claim_discord_gift(integer, text);
drop function if exists public.hr_claim_discord_gift__ungated(integer, text);
drop function if exists public.hr_discord_code_current();
drop function if exists public.hr_discord_code_for(text);
drop table if exists public.hr_discord_gift_claims;
delete from public.hr_client_rpc_baseline where proname = 'hr_claim_discord_gift';

-- ── §6 THE DETECTOR: link 25 of HR_GRANT_HYGIENE_CHAIN, DERIVED ──────────────────────────────────────────────────────────────
-- tools/derive-grant-hygiene.mjs extracts 1004-tick-pack-heroes.sql's detector (link 24) and REPLACES one block: the
-- c_engine_allow entries of hr_quartermaster_buy and hr_dungeon_settle with their claim comments (declared removals in
-- tests/run-sql-tests.mjs PART 1f-ii), by a two-line note. Nothing else moves.
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ⟦DERIVED hr_assert_grant_hygiene — tools/derive-grant-hygiene.mjs, do not hand-edit⟧
create or replace function public.hr_assert_grant_hygiene(p_strict boolean default true)
returns jsonb language plpgsql stable security definer set search_path = public, pg_catalog as $$
declare
  v_public_exec   jsonb;   -- D1 + D3: PUBLIC holds EXECUTE (functions AND procedures)
  v_unapproved    jsonb;   -- D2: client-executable but not in the baseline
  v_lost          jsonb;   -- baseline rows whose function is gone (reported)
  v_client_trunc  jsonb;   -- TRUNCATE/REFERENCES/TRIGGER on any relation
  v_defacl_open   jsonb;   -- D4: owners with no fail-closed GLOBAL default ACL
  v_platform      jsonb;   -- residual, reported only
  v_engine_extra  jsonb;   -- S9: hr_engine EXECUTE outside its allowlist
  v_engine_tables jsonb;   -- S9: hr_engine holding any table privilege
  v_ungated       jsonb;   -- A9: client-callable SECURITY DEFINER with no rate gate
  v_ops_reach     jsonb;   -- T-5: the pg_net sink hr_ops reachable by a client/engine role
  v_report jsonb;

  -- ══════════════════════════════════════════════════════════════════════
  -- S9 — THE hr_engine CAPABILITY PIN, MOVED HERE (Security, 2026-08-11)
  -- ──────────────────────────────────────────────────────────────────────
  -- It used to live in 2026-08-11-market-v2.sql §9(i), which is three defects
  -- at once and the reason it is now here:
  --
  --   1. IT DOES NOT RUN. market-v2 is UNAPPLIED and cannot be applied until
  --      the server owns gold and inventory. A pin inside an unapplied
  --      migration is a comment. hr_assert_grant_hygiene runs at every apply
  --      AND nightly via pg_cron, and its failures surface as maintenance_alerts.
  --   2. IT MATCHED ON `proname`. `p.proname <> all (array[...])` accepts ANY
  --      overload of an approved name — `hr_seed(text)` added next to
  --      `hr_seed(uuid,int,text)` would pass silently. Keyed on
  --      `p.oid::regprocedure::text` an overload is a different string and is
  --      therefore a finding, which is the correct answer.
  --   3. IT FILTERED `prokind = 'f'`. A PROCEDURE was invisible to it — exactly
  --      defect D1 that this file's own rewrite was written to fix, reproduced
  --      one section later.
  --
  -- ⚠ EVERY ENTRY CARRIES A ONE-LINE JUSTIFICATION. In the old list only entry
  --   8 did, which meant the first seven were "bounded and fine" by tradition.
  --   Adding an entry is a CLAIM: read-only or self-validating, and it accepts
  --   no target the caller is not already authorised for. Re-derive that for
  --   the whole list every time it changes.
  c_engine_allow constant text[] := array[
    -- ── ADDED 2026-11-19 — THE DEFERRED LEASE (lane/c-server-cost) ────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- SELF-VALIDATING, and it moves no value: it only ENDS leases (lease_until just
    -- before now()) of the hunt body whose holder it derives server-side from p_body, of
    -- the sessions named (at most 500), still live. A lease only keeps a second body
    -- off an instance while one may be settling it; hr_hunt_apply_instance's swing
    -- and version CAS decide whether any settle lands, so a lease freed too early
    -- (even by a compromised engine) costs a refused race, never a double credit.
    'hr_hunt_lease_free(integer,uuid[])',
    -- ── ADDED 2027-03-05 — THE GAME MASTER'S STOP (lane/c-gm-tools) ───────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- SELF-VALIDATING: p_gm is the engine's VERIFIED subject, and both refuse unless
    -- it holds a row of hr_gm_accounts, which only a migration writes. The gate ends a
    -- hunt by the statement hr_hunt_leave runs and journals; it moves no value. The
    -- result journals one row. A town job's stop is then the player's own
    -- runSetActivity on that hero: collect, then switch.
    'hr_gm_stop_gate(uuid,uuid,integer,text,uuid)',
    'hr_gm_stop_result(uuid,uuid,integer,text)',
    -- ── ADDED 2027-02-10 — THE ACCRUE READ (lane/c-settle-cost-2) ─────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- READ-ONLY: index.ts's accrue read for the VERIFIED subject's own hero (the
    -- slot is a row the caller owns). With no open hunt it is hr_state_of, the
    -- envelope the engine already reads; with one, seven of that envelope's own
    -- scalars (the pointer, the version, the clock, the rested bank). It writes
    -- nothing, takes no value, names no other player.
    'hr_accrue_read(uuid,integer)',
    -- ── ADDED 2027-01-12 — THE ACCOUNT MARKET (lane c-market-account) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. The v2 entries below keep their
    -- stale TEXT (their functions are dropped). Each claim re-derived:
    --
    -- SELF-VALIDATING, the v2 claim on the account: the caller names a slot, a
    -- key, a version, a source (bag|storage), an item, a count and an ASK about
    -- its OWN goods. Listable comes from the generated catalogues (hr_market_items),
    -- the floor is the shop's bid, the ceiling the config's; the fee, the TTL and
    -- every cap are server config; the per-account caps are read under the
    -- account's Storage lock. Moves the account's own goods into escrow and burns
    -- a fee through hr_purse_move. Target (p_user, p_slot), the hr_apply pair.
    'hr_market_list(uuid,integer,bigint,uuid,text,text,bigint,bigint)',
    -- SELF-VALIDATING: a listing id of the caller's OWN account (refused
    -- not_yours otherwise); the delete is the arbiter and the units return to the
    -- account's Storage. No price, no count, no target beyond (p_user, p_slot).
    'hr_market_cancel(uuid,integer,uuid,uuid)',
    -- SELF-VALIDATING, the one cross-account transfer: a listing id, a count, a
    -- MAX price and a destination. The price comes off the LOCKED row; the same
    -- account (any hero) is refused; both purses lock in user order, LAST; the
    -- buyer's spend and the seller's proceeds are capped per ACCOUNT per day under
    -- those locks; conserved (buyer -gross, seller +net, cut burned), journalled
    -- with no counterparty in any client-readable row (market_sales holds both).
    -- A compromised engine names both sides only inside those caps.
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint,bigint,text)',
    -- read-only in value (it spends a rate counter): per-item summaries of open
    -- asks and sales, no account id or name; <= 50 items a call; switch-gated.
    'hr_market_browse(uuid,integer,text[],text,integer)',
    -- read-only in value: one item's cheapest 50 asks (listing ids only; "mine"
    -- marks the caller's own account), its daily line and its last 10 sales.
    'hr_market_item(uuid,integer,text)',
    -- read-only in value: the caller's OWN account's listings, 30-day market
    -- history from its own ledger rows and today's cap usage.
    'hr_market_mine(uuid,integer)',
    -- ── ADDED 2026-10-25 — THE CHARACTER SHEET (lane character-window) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only (STABLE): the md5 of the character's skill levels, worn set,
    -- combat style, active buffs and hr_perks_of — values hr_state_of and
    -- hr_perks_of already answer the engine. Target (p_user, p_slot), the
    -- hr_state_of pair.
    'hr_character_sheet_inputs(uuid,integer)',
    -- SELF-VALIDATING: writes ONE display row (hr_character_sheets) for the
    -- (p_user, p_slot) the engine already reads, only when the fingerprint it
    -- is handed equals the current one, stamped with the calling engine's
    -- payload hash, bounded (an object, <= 2 KB). No fight,
    -- price, gate or other player reads the row; it moves no value. Answers
    -- hr_state_of, which the engine already holds.
    'hr_character_sheet_put(uuid,integer,text,text,jsonb)',
    -- ── ADDED 2026-10-23 — THE INSTANCE SETTLE (lane S1, HUNT_SCREEN_SPEC §1.3) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only (STABLE): the instance the caller's OPEN session hunts in — its
    -- clock, world, the keyed-seed secret hr_seed(null, 0, 'hunt:' || instance)
    -- — and every OPEN member's session and hr_state_of. Its target argument is
    -- (p_user, p_slot), the hr_state_of pair; the members it adds are characters
    -- the engine already reads and settles (it holds hr_state_of / hr_apply).
    'hr_hunt_instance_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: under the instance lock and its
    -- world_swing CAS, with the member set held to the instance's open sessions,
    -- it CALLS hr_apply (every invariant of each member's value half, under that
    -- member's character lock) and the session applier (swing CAS, window, bag,
    -- per-lane use caps, falls journalled, every end re-proved), plus the kill
    -- bound, the value bound, the store's catalogue prices, the stamina bound
    -- and the world's shape and byte bound — in ONE subtransaction; a refusal
    -- anywhere rolls every member back. It pays nothing hr_apply would refuse.
    'hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
    -- ── ADDED 2026-10-22 — THE HUNT SETTLE (ruling HR-2026-10-14, lane C2) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Each claim re-derived:
    --
    -- read-only: the id of the character's OPEN session or null. Same target
    -- argument as hr_state_of (p_user, p_slot), one indexed row.
    'hr_hunt_open_of(uuid,integer)',
    -- read-only (STABLE): one open session — clock, bag, action bar — and the
    -- session secret hr_seed(user, slot, 'hunt:' || id), i.e. a value the
    -- engine could already ask hr_seed for. Accepts no target the engine is
    -- not already authorised for (the hr_apply/hr_state_of pair).
    'hr_hunt_engine_read(uuid,integer)',
    -- SELF-VALIDATING, the hr_apply claim: it CALLS hr_apply (which re-checks
    -- every invariant of the value half under its own version CAS) and
    -- hr_hunt_settle_session (swing CAS, window, bag, use caps, presses only
    -- shrink, falls journalled, every end re-proved), in ONE subtransaction —
    -- a refusal in either half rolls both back. Its own writes are the press
    -- (validated as hr_hunt_use validates one) and a buff queue admitted only
    -- when this window's bag uses paid for every new segment. It pays nothing
    -- hr_apply would refuse.
    'hr_hunt_apply(uuid,integer,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,boolean)',
    -- NOT READ-ONLY, bounded: the CLOSED-MODE answer for a refused edge call
    -- (Security, closed-mode review item 4). Asked only after hr_rate_gate
    -- refused (p_user, p_slot) — the pair the engine already passes it. It
    -- reads hr_admitted for that user and, when not admitted, writes ONE
    -- hr_rejections aggregate upsert (code 'closed') for that user; it moves
    -- no value and names no other target.
    'hr_engine_closed(uuid,integer,text)',
    -- ── ADDED 2026-10-10 — THE PRESENCE HORIZON (Game Designer ruling on B1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list.
    --
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING: the caller names
    -- only (p_user, p_slot), the pair it already passes to hr_state_of. The
    -- answer is hr_offline_cap_ms bounded by the character's own
    -- hr_return_anchor; its ONE write is a forfeit of an absence whose horizon
    -- is spent and past, made THROUGH hr_apply (version CAS, journalled
    -- intent horizon_forfeit, key derived from the anchor) and moving only
    -- accrued_to forward to now(). It can pay nothing: no gold, no item, no XP.
    'hr_accrue_cap_ms(uuid,integer)',
    -- ── ADDED 2026-10-06 — THE SHADOW PARITY PROBE (Security ruling 1) ──
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- READ-ONLY (STABLE): the fetch returns ONE open probe row of ONE
    -- character, and only to the holder the ROSTER leased that character to,
    -- inside the lease. Its payload is a snapshot the engine itself built from
    -- hr_state_of, which hr_engine already reads for any character it names.
    -- NO NEW TARGET: (p_user, p_slot) is the pair the engine already passes to
    -- hr_state_of and hr_tick_settle.
    'hr_tick_probe_fetch(text,uuid,integer,text)',
    -- NOT READ-ONLY, and the claim rests on its WRITE TARGET: its only write
    -- is the operator table the probe owns (RLS forced, no policy, no client
    -- or engine grant, classified operational + player_value_exempt). It
    -- writes no player_state, no ledger, no inventory, no hr_tick_ownership
    -- (it takes no row lock either), no shadow row and no frame — proved by
    -- execution over EVERY user table's transaction tuple counters in its
    -- migration's p3. SELF-VALIDATING: the caller names a holder, a character
    -- and a window, and the window must be the character's journalled SHADOW
    -- CHAIN HEAD under a lease the roster stamped — so it can only measure a
    -- span the fence actually tiled, never invent one, and an armed channel
    -- cannot reach it at all. Nothing reads its rows to decide a number a
    -- player can spend, rank or trade. NO NEW TARGET.
    'hr_tick_probe_commit(text,uuid,integer,text,timestamp with time zone,timestamp with time zone,text,bigint,jsonb,jsonb)',
    -- ── ADDED 2026-09-23 — THE PARTY FENCE AND ITS PREDICATE (M8 S2) ────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ hr_party_tick_settle IS NOT READ-ONLY, and the claim rests on
    -- SELF-VALIDATING, re-derived rather than carried across from
    -- hr_tick_settle's entry. It is the world tick's ONE door to player value
    -- for a PARTY, and its whole caller-supplied surface is a holder name, a
    -- party id, a window [from,to), an idempotency uuid and an array of 1..4
    -- member objects — every one of which is CHECKED AGAINST THE DATABASE
    -- before a value moves:
    --   * THE LEASE, at party grain. The caller must name a party the ROSTER
    --     handed it, in its own holder name, inside the lease window.
    --     hr_party_roster is executable by `hr_tick` and by NOTHING ELSE, and
    --     hr_engine is asserted NOT to hold it, so a settling role
    --     structurally cannot stamp its own lease.
    --   * THE PARTY LOCK, taken FIRST, which is what serialises a settle
    --     against a join, a leave and a kick.
    --   * THE WATERMARK CAS, the PARTY's, computed once under that lock and
    --     byte-identical in every term to hr_tick_settle's own.
    --   * INVARIANT 8, PER MEMBER: `player_state.accrued_to` must EQUAL the
    --     party watermark. An inequality either way is a broken invariant and
    --     the whole call is refused — there is no branch that reconciles.
    --   * THE LIVE MEMBER SET, re-counted UNDER THE LOCK and asserted equal to
    --     the declared set with no member named twice. A subset is a partial
    --     settle, which pays some members a split computed from all of them —
    --     a mint, and the one defect that cannot be recovered after the fact.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE per member
    --     (`delta->>'accrued_to' = p_window_to`), and the delta's top-level
    --     key set is asserted to be a solo combat settle's, so attribution
    --     cannot ride in the delta and no unknown key can reach hr_apply.
    --   * AND THEN hr_apply RE-VALIDATES EVERY INVARIANT regardless of caller.
    --     It is the only money writer; this function computes and fences and
    --     never moves a value except through it, once per member, inside ONE
    --     transaction whose savepoint rolls the whole fan-out back if any
    --     member cannot be paid.
    -- NO NEW TARGET: the members it names are (user, slot) pairs the engine
    -- already passes to hr_apply and hr_state_of. The holder of hr_apply can
    -- already WRITE any character it names; this is strictly NARROWER.
    --
    -- ⚠ hr_partied IS READ-ONLY, which is the strongest form an entry here can
    -- take: `stable sql`, one EXISTS over party_member joined to party_hunt,
    -- no row written, so it cannot be replayed into a gain. NO NEW TARGET —
    -- (p_user, p_slot), the same pair again. WHY THE ENGINE NEEDS IT: it is
    -- invariant 8's fence at the intent door. A partied character's own
    -- `accrue` is refused `party_settle_required` and every other
    -- collectsFirst verb `party_hunt_running`, because the timing of an
    -- ordinary client intent would otherwise re-price a window three other
    -- players are paid from — CLAUDE.md §1's target property failing by timing
    -- rather than by number. No client role holds it: a client-callable
    -- membership predicate is an oracle it can sweep.
    'hr_party_tick_settle(text,uuid,timestamp with time zone,timestamp with time zone,uuid,jsonb)',
    'hr_partied(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE HUNT'S TWO READS (M6) ───────────────────
    -- At the HEAD, an INSERTION: it removes nothing, so PART 1f-ii grades this
    -- link with an EMPTY declared-removals list. Position carries no meaning —
    -- check (7) tests membership with `<> all (...)`.
    --
    -- ⚠ BOTH ARE READ-ONLY, WHICH IS THE WHOLE CLAIM, and it is the strongest
    -- form an entry on this list can take: neither writes a row, so neither can
    -- be replayed into a gain, and a forged call returns another shape of data
    -- the caller can already reach. Both are asserted STABLE and both are
    -- asserted free of INSERT/UPDATE/DELETE by their own migrations' section-4
    -- gates, which run at apply time and refuse to install a body that grew a
    -- write.
    --
    -- NO NEW TARGET. Each takes (p_user, p_slot) — the SAME pair the engine
    -- already passes to hr_state_of and hr_apply, both of which it already
    -- holds. The holder of hr_apply can already WRITE any character it names;
    -- these are strictly NARROWER than what it already has, and they exist so
    -- the ONE envelope the client renders carries the hunt readout rather than
    -- the browser growing a second read of its own (HUNT_ANALYZER_UI.md §6).
    --
    -- WHY THE ENGINE NEEDS THEM: hr_state_of calls both, and hr_state_of is
    -- itself engine-only. They are granted to hr_engine ONLY — no client role
    -- holds either, which tests/hunt-analyzer.mjs A5 and the vigour guard both
    -- assert by executing has_function_privilege rather than by reading a grant
    -- line.
    'hr_hunt_analyzer(uuid,integer)',
    'hr_vigour_of(uuid,integer)',
    -- ── ADDED 2026-09-22 — THE BESTIARY TROPHY PAIR ─────────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- read-only (STABLE) projection of the CLAIMED trophy rows for ONE
    -- character: kind='collection', period_key='', key like 'trophy:%'. It
    -- writes nothing and calls nothing that writes. SELF-VALIDATING: the row
    -- set is bounded STRUCTURALLY by the key prefix and by (user, slot) — there
    -- is no parameter through which a caller can widen it. WHY THE ENGINE NEEDS
    -- IT: 2026-09-22-state-of-trophy-prefix.sql removed the trophy population
    -- from hr_state_of's generic envelope (it would breach the 1000-row cap and
    -- silently truncate a player's quest state), so this is now the ONLY door
    -- to it — the same position hr_bestiary_of and hr_collection_of are in.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of.
    'hr_trophy_of(uuid,integer)',
    -- NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived. Its
    -- whole caller-supplied surface is: a character slot, a MONSTER ID
    -- (validated against hr_activities kind='combat', the generated,
    -- client-unwritable catalogue), a STAGE (bounded 1..4 against the server's
    -- own ladder) and an idempotency uuid. THERE IS NO KILL-COUNT PARAMETER —
    -- the threshold is judged against a counter the function reads itself from
    -- player_progress, under the SAME advisory lock hr_apply takes — so a
    -- forged count is not refused, it is unrepresentable.
    -- ⚠ AND IT MINTS NOTHING: no gold, no gems, no items, no XP, no multiplier.
    -- It writes ONE flag row (value 1, on conflict do nothing, so a replay is a
    -- refusal) and ONE zero-valued ledger row. The trophy's power is DERIVED
    -- from the kill counters on every read (src/core/trophies.js) and is
    -- already on before this is called, so there is no value here for a forged
    -- or replayed call to move — which is why the CLAUDE.md §1 target property
    -- holds by construction rather than by a clamp. Measured, not asserted:
    -- the migration's §5(e) compares gold/gems/xp/inventory AND accrued_to
    -- across a real claim. NO NEW TARGET: p_user again.
    'hr_trophy_claim(uuid,integer,text,integer,text)',
    -- ── ADDED 2026-09-21 — THE WORLD TICK'S ONE DOOR ───────────────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1/2/5/6/8/9:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim rests on SELF-VALIDATING, re-derived.
    -- hr_tick_settle is the FENCE in front of hr_apply for the world tick, and
    -- it is the ONLY route the tick has to player value: the roster WITHDREW
    -- the tick's raw hr_apply grant and this function replaced it. Its whole
    -- caller-supplied surface is a holder name, a (user, slot, channel), a
    -- version, a window [from,to), an idempotency uuid and a delta — and every
    -- one of those is CHECKED AGAINST THE DATABASE before a value moves:
    --   * THE LEASE. The caller must name a character the ROSTER handed it, in
    --     its own holder name, inside the lease window. hr_tick_roster is
    --     executable by `hr_tick` and by NOTHING ELSE, and hr_engine is
    --     asserted NOT to hold it (fence e19), so a settling role structurally
    --     cannot stamp its own lease. "Choose whose world ticks" is closed one
    --     level deeper than a grant.
    --   * THE WATERMARK CAS, under `select ... for update` on player_state
    --     taken BEFORE any comparison: a window at or after the settled mark is
    --     accepted, a window behind it is refused whatever its version and
    --     whatever its key. This holds against a client accrue, a client
    --     collect, a second tick process and a replay of the same call.
    --   * THE DECLARED WINDOW IS BOUND TO THE PAID ONE
    --     (`p_delta->>'accrued_to' = p_window_to`), so a caller cannot name
    --     ten seconds and hand over an hour.
    --   * THE VERSION, and then hr_apply re-validates every invariant regardless
    --     of caller — ONE call site, after every check, no tick-specific clamp
    --     and no fast path.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this is strictly NARROWER than what it already has.
    -- WHY THE ENGINE NEEDS IT: hr_apply's impersonation seam tests
    -- `v_role = 'hr_engine'` literally, so the tick cannot reach hr_apply as
    -- `hr_tick` at all (S-1, proved by execution); the edge arrives as
    -- hr_engine and this is the door it knocks on. Granted to hr_engine ONLY —
    -- fence e18c asserts `hr_tick` does NOT hold it, because that would be
    -- a door that cannot open and would journal a forgery alert every fire.
    -- ── RESTATED 2026-09-23 — THE TENTH ARGUMENT (M3 shadow-state chain) ─
    -- A REPLACEMENT, not an insertion: this chain's first, and the removed
    -- line is declared in tests/run-sql-tests.mjs PART 1f-ii. The entry is
    -- keyed on `regprocedure`, so a signature change is a DIFFERENT string
    -- and the old one now names a function that does not exist — reported
    -- under `lost` while the real door raises
    -- `engine_execute_outside_allowlist` on the nightly cron every night.
    --
    -- ⚠ THE CLAIM IS UNCHANGED, AND IT IS RE-DERIVED RATHER THAN CARRIED.
    -- The tenth argument is `p_shadow_state jsonb`, and it is the ONLY
    -- caller-supplied value on this function that is neither checked against
    -- the database nor handed to hr_apply. It does not need to be, because it
    -- cannot reach player value at all:
    --   * IT IS WRITTEN ONLY ON THE SHADOW BRANCH, the branch with no
    --     hr_apply call in it, under the same row lock as the watermark it
    --     chains. On the ARMED branch a non-null one is REFUSED
    --     (`shadow_state_while_armed`) before hr_apply is reached — never
    --     ignored, because a carrier silently dropped on the branch that pays
    --     is how a stale proposal would be believed.
    --   * IT IS STORED VERBATIM AND READ BACK BY THE SAME ROLE that wrote it,
    --     into `hr_tick_ownership.shadow_state` — a column on an operator
    --     table that no client role can read or write, bounded by its own
    --     CHECK constraint, and CLEARED together with `shadow_accrued_to`
    --     the moment an armed settle succeeds.
    --   * NOTHING READS IT TO DECIDE A NUMBER A PLAYER CAN SPEND. Its only
    --     consumer is the next SHADOW window, whose entire output is
    --     `hr_tick_shadow` — classified `operational` +
    --     `player_value_exempt` in tests/restore-census.baseline.json on
    --     exactly the basis that losing every row of it costs a measurement
    --     and not a progression.
    -- NO NEW TARGET: p_user is still the parameter the engine already passes
    -- to hr_apply and hr_state_of, and every other check of the fence — the
    -- lease, the watermark CAS under `for update`, the declared-window
    -- binding, the version — is untouched and runs in the same order.
    'hr_tick_settle(text,uuid,integer,text,bigint,timestamp with time zone,timestamp with time zone,uuid,jsonb,jsonb)',
    -- (hr_quartermaster_buy and hr_dungeon_settle left this list 2026-11-20 with the old dungeons and the scrip, plan L10:
    --  the approved cuts (lane/c-approved-cuts) drop both, so either re-created and granted to hr_engine reads
    --  engine_execute_outside_allowlist.)
    -- ── ADDED 2026-09-10 — THE ATTENDED KILL LEDGER PROJECTION ──────────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2, 5 and
    -- 6: it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- READ-ONLY: `language sql`, `stable` — three CTEs over hr_kill_credit_log
    -- and player_state and a jsonb_build_object. No PL/pgSQL body through which a
    -- later edit could smuggle a write without the language keyword changing,
    -- which is the same strongest-available shape the three link-6 projections
    -- carry. The authoring migration's GATE(b) asserts that shape rather than
    -- describing it.
    -- SELF-VALIDATING: fixed output, its own per-target and per-key ceilings, and
    -- it sums `credit` (what hr_bounty_kill_cap allowed) and never `claimed`
    -- (what the client sent). GATE(e2) executes that distinction.
    -- NO NEW TARGET: (p_user, p_slot) — the exact pair the engine already hands
    -- hr_apply and hr_state_of. The holder of hr_apply can already WRITE any
    -- character it names; this lets it READ one integer per monster for one of
    -- them, out of a table hr_engine holds no privilege on (GATE(c)). The third
    -- argument, p_upto, is the engine's own hr_state_of now() and is CLAMPED with
    -- least(p_upto, now()), so it can only ever SHRINK the projected window —
    -- Security condition C6, executed by that migration's GATE(e6).
    -- WHY THE ENGINE NEEDS IT: the settle is the ONE writer of loot and gold, and
    -- it priced attended windows by re-simulating them as unattended — measured
    -- 9 kills against 15 the server had already accepted, i.e. 38% of a session's
    -- drops confiscated. See docs/design/attended-loot-credit.md.
    'hr_attended_kills(uuid,integer,timestamp with time zone)',
    -- ── ADDED 2026-08-20 — THE THREE LIVE-PROGRESS READ PROJECTIONS ─────
    -- At the HEAD again, an INSERTION, for the same reason as links 1, 2 and 5:
    -- it removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- All three are READ-ONLY (`stable sql`) dedicated projections for ONE
    -- character, added by 2026-08-20-bestiary.sql / 2026-08-21-collection.sql /
    -- 2026-08-20-renown.sql. hr_state_of stopped serving the ev:kill_monster:%
    -- and ev:loot:% populations (2026-08-21-streak-state.sql) because together
    -- they approach its 1000-row envelope cap, so the engine reads them through
    -- these instead. SELF-VALIDATING and NO NEW TARGET, the same claim
    -- hr_state_of / hr_perks_of make: each takes (p_user, p_slot) — the exact
    -- pair the engine already passes to hr_apply and hr_state_of — reads a
    -- STRICT SUBSET of what hr_state_of's envelope used to carry, writes nothing,
    -- calls nothing that writes, and exposes no target the holder of hr_apply
    -- could not already reach.
    'hr_bestiary_of(uuid,integer)',
    'hr_collection_of(uuid,integer)',
    'hr_renown_of(uuid,integer)',
    -- ── ADDED 2026-08-17 — THE THREE MARKET WRITERS ─────────────────────
    -- At the HEAD, an insertion, for the same reason as links 1 and 2: it
    -- removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ THE LARGEST SINGLE WIDENING SINCE hr_apply: three writers at once, and
    -- ONE OF THEM MOVES VALUE BETWEEN TWO PLAYERS. The c_engine_allow claim is
    -- "read-only or SELF-VALIDATING, and it accepts no target the caller is not
    -- already authorised for". None of these is read-only, so the whole claim
    -- rests on the other two clauses, re-derived rather than asserted:
    --
    --   SELF-VALIDATING. The entire caller-supplied surface of the three is a
    --   character slot, an idempotency uuid, a version, and then: an ITEM ID +
    --   COUNT + ASK (list), a LISTING ID (cancel), a LISTING ID + COUNT (buy).
    --   No price crosses on a buy — ask_each is read off the listing row under
    --   its own lock — no timestamp, no name, no fee rate, no counterparty. The
    --   item must be `tradeable` in the generated, client-unwritable hr_items;
    --   the tax rate and every ceiling come from hr_market_config; the seller
    --   name is derived from profiles; every clock is now(). Each function
    --   re-reads its listing FOR UPDATE and re-validates under hr_apply's own
    --   advisory lock, refuses a stale version, and is clamped per call (a gross
    --   ceiling) AND per DAY (list churn; gold sent; gold received) from the
    --   append-only ledger — the dimension a rate limit does not bound.
    --
    --   THE TARGET CLAUSE, STATED HONESTLY (Security M2). The earlier draft
    --   claimed "the engine cannot select a victim". That is FALSE and is the
    --   correction: the engine holds hr_market_list(p_user, …) for ANY user, so a
    --   compromised engine can open a listing FOR a victim it names and then
    --   settle it to itself with hr_market_buy — it can choose both sides of a
    --   trade. What admits these three is therefore NOT "no victim" but BOUNDED
    --   BLAST RADIUS: every path is a CONSERVED transfer of TRADEABLE items
    --   (buyer -gross, seller +net, tax burned — nothing minted, nothing an
    --   honest player did not already own), the item must be `tradeable` in the
    --   client-unwritable hr_items, BOTH SIDES ARE JOURNALLED (transfer +
    --   self_trade in meta), and the flows are CLAMPED PER DAY off the
    --   append-only ledger on three dimensions the engine cannot widen: escrowed
    --   item quantity (list), gold sent (buy) and gold received (buy).
    --   ⚠ THOSE CLAMPS ARE THE MARKET'S OWN, NOT hr_day_budget_check. A market
    --   transfer is conserved, so it is deliberately absent from the mint
    --   budget's qty dimension — charging a sale to the seller's daily inflow
    --   would let a stranger drain their accrual (the griefing vector in
    --   hr_market_buy's header). So the item-drain and gold-move ceilings live
    --   here and only here. p_user is the parameter the engine already passes to
    --   hr_apply.
    --
    --   WHY THE ENGINE NEEDS THEM: hr_apply is single-character by construction
    --   — one lock, one version, one journal target — so a delta shape that
    --   could move a second player's gold would be the most dangerous key in the
    --   engine's vocabulary. Without these three, the only writer of a
    --   cross-player transfer is the client, which is the hole this whole
    --   program was opened to close.
    'hr_market_list(uuid,integer,bigint,uuid,text,bigint,bigint)',
    'hr_market_cancel(uuid,integer,bigint,uuid,uuid)',
    'hr_market_buy(uuid,integer,bigint,uuid,uuid,bigint)',
    -- ── ADDED 2026-08-16 — THE FIRST WRITER ADDED SINCE hr_apply ────────
    -- At the HEAD again, and for the same reason as the link above: an
    -- insertion removes nothing, so PART 1f-ii grades this link with an EMPTY
    -- declared-removals list. Position carries no meaning — check (7) tests
    -- membership with `<> all (...)`.
    --
    -- ⚠ NOT READ-ONLY, and the claim is made on the OTHER clause. It writes
    -- one player_progress unlock row, one player_state gold/version update and
    -- one player_ledger row. SELF-VALIDATING is what admits it, and concretely:
    -- its whole caller-supplied surface is ONE OFFER ID (a primary key in the
    -- generated, client-unwritable hr_unlock_offers) — no price, no quantity,
    -- no item, no rung, no timestamp; every number it writes comes from that
    -- table or from the character's own row read under the SAME advisory lock
    -- hr_apply takes; the row it writes is independently policed by the
    -- player_progress_unlock_guard trigger, which refuses an off-ladder rung, a
    -- regression and a mis-filed kind whatever this function proposes; and it
    -- is clamped per call (one rung) and per DAY (20 unlocks, counted from the
    -- append-only ledger), which is the dimension a rate limit does not bound.
    -- NO NEW TARGET: p_user is the parameter the engine already passes to
    -- hr_apply and hr_state_of. WHY THE ENGINE NEEDS IT: hr_apply structurally
    -- cannot write a level ('unlock' is deliberately absent from its delta
    -- allowlist), so without this the only writer of a permanent capability is
    -- the client.
    'hr_unlock_buy(uuid,integer,bigint,uuid,text)',
    -- ── ADDED 2026-08-16 — TWO REVIEWED ENGINE READS ────────────────────
    -- At the HEAD, not appended: this array is DERIVED from
    -- 2026-08-11-grant-hygiene.sql by tools/derive-grant-hygiene.mjs, and an
    -- append would have to rewrite the previous last entry to add a comma —
    -- a MODIFIED line. An insertion removes nothing, which is why this chain's
    -- declared-removals list in PART 1f-ii is empty. Position carries no
    -- meaning here: check (7) tests membership with `<> all (...)`.
    --
    -- read-only (STABLE, and 2026-08-16-claim-reward.sql §4 asserts the
    -- declaration rather than trusting it) claim lookup for ONE character.
    -- SELF-VALIDATING in the dimension that matters: the period keys it reads
    -- are the server's own hr_utc_day_key(now()), never an argument, so the
    -- row set is structurally bounded to '' + today + yesterday and no call
    -- can widen it into a history scan. It adds NO TARGET the engine could
    -- not already reach — the engine already holds hr_apply(uuid,…) and
    -- hr_state_of(uuid,int), both of which take the same p_user — so this is
    -- strictly a narrower read of data hr_state_of's envelope is the peer of.
    'hr_claim_lookup(uuid,integer,text,text)',
    -- read-only permanent-capability read for one character: rooms, plots,
    -- property tier and unlocked recipes. Writes nothing and calls nothing
    -- that writes. On the list for the same reason hr_offline_cap_ms is —
    -- a perk multiplies a whole night's grant, so the engine must be TOLD its
    -- capabilities rather than compute them. Same target argument as above:
    -- p_user is a parameter the engine already passes to hr_apply.
    'hr_perks_of(uuid,integer)',
    -- the only writer; bounded by its own re-validation, which is the design
    'hr_apply(uuid,integer,bigint,uuid,jsonb)',
    -- returns the post-write envelope for one character the engine was told to act for
    'hr_state_of(uuid,integer)',
    -- the accrual PRNG seed; returns a hash, never the 256-bit server secret
    'hr_seed(uuid,integer,text)',
    -- derived leaderboard value; read-only, one character
    'hr_total_level(uuid,integer)',
    -- pure function of its argument
    'hr_level_from_xp(bigint)',
    -- pure function of its argument
    'hr_xp_for_level(integer)',
    -- read-only, one integer, bounded at 24h by its own ceiling; on the list because
    -- capMs multiplies a whole night's grant, so the engine must not own its own cap
    'hr_offline_cap_ms(uuid,integer)',
    -- writes one UNLOGGED counter row for the user it was handed; on the list because
    -- the alternative, granting hr_rate_ok, lets the caller name its own limit
    'hr_rate_gate(uuid,integer,text)'
  ];
begin
  -- (1) PUBLIC=EXECUTE, asked directly.
  --     `proacl is null` is NOT "no grants" — it means the ACL is the hardwired
  --     acldefault('f', owner), which contains PUBLIC=X. That is the exact
  --     state a `create function` with no revoke lands in, so it is the single
  --     most important row of this whole function.
  select coalesce(jsonb_agg(format('%s(%s)', p.proname,
                                   pg_get_function_identity_arguments(p.oid))
                            order by p.proname), '[]'::jsonb)
    into v_public_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p')
     and (p.proacl is null or p.proacl::text ~ '(\{|,)=[a-zA-Z*]*X');

  -- (2) Client-executable and NOT approved. Covers anon and authenticated, and
  --     covers procedures, and covers a new overload of an approved name.
  select coalesce(jsonb_agg(format('%s(%s) → %s', x.proname, x.identity_args, x.grantee)
                            order by x.proname, x.grantee), '[]'::jsonb)
    into v_unapproved
    from (
      select p.proname, pg_get_function_identity_arguments(p.oid) as identity_args, g.grantee
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('anon'),('authenticated')) g(grantee)
       where n.nspname = 'public' and p.prokind in ('f','p')
         and has_function_privilege(g.grantee, p.oid, 'execute')
    ) x
   where not exists (select 1 from public.hr_client_rpc_baseline b
                      where b.proname = x.proname and b.identity_args = x.identity_args
                        and b.grantee = x.grantee);

  -- (3) An approved RPC that is no longer reachable. Not a security failure —
  --     a BROKEN FEATURE — so it is reported, loudly, and never fatal.
  select coalesce(jsonb_agg(format('%s(%s) → %s', b.proname, b.identity_args, b.grantee)
                            order by b.proname), '[]'::jsonb)
    into v_lost
    from public.hr_client_rpc_baseline b
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = b.proname
        and pg_get_function_identity_arguments(p.oid) = b.identity_args
        and has_function_privilege(b.grantee, p.oid, 'execute'));

  -- (4) TRUNCATE bypasses row-level security entirely, so RLS is not a backstop
  --     for it. No client ever needs TRUNCATE, REFERENCES or TRIGGER.
  --     b354 (Security C3) — WIDENED, and the second half is the interesting
  --     one. A client WRITE grant on a table that has RLS ON and NO WRITE
  --     POLICY AT ALL is a grant nothing intends to use: the only thing between
  --     it and the table is row-level security, and one `create policy` — or
  --     one `alter table ... disable row level security` typed during an
  --     incident — turns it into a client-writable table. Security found six of
  --     them live (hr_castle_*, hr_hunt_*): pure content catalogues carrying
  --     anon/authenticated INSERT/UPDATE/DELETE.
  --     WHY IT IS A BASELINE AND NOT A BAN: 21 further tables were in this class
  --     when the check was written (clan_*, world_event_*, raid_*, maintenance_*,
  --     display_names, leaderboard_meta) — all written only by SECURITY DEFINER
  --     RPCs, all dead grants, and none of them safe to sweep in the same change
  --     that introduced the detector. They are RECORDED in
  --     hr_client_write_baseline, which makes each one a claim somebody has to
  --     justify, and makes anything NEW fatal.
  --     service_role is deliberately NOT in the grantee list: Supabase's platform
  --     default grants it every privilege on every table in public, so including
  --     it would report all 40-odd tables and the check could never be strict.
  --     That is a platform posture and a separate program; stated here so its
  --     absence is a decision rather than an oversight.
  --     b350 (Security batch 5) — THE DETECTOR TAKEOVER. This query no longer
  --     reads information_schema.role_table_grants, which reports SQL-standard
  --     privileges ONLY: it cannot see MAINTAIN (the PG17 VACUUM/ANALYZE/CLUSTER/
  --     REINDEX/REFRESH privilege) and it OMITS materialized views entirely. Both
  --     are exactly where dead client write grants hid — 28 MAINTAIN pairs and the
  --     leaderboard_ranked matview were invisible to every nightly run.
  --     has_table_privilege over pg_class sees the full PG17 vocabulary AND every
  --     relkind. Two arms, the same meaning check (4) has always had:
  --       ARM 1 — a verb NO CLIENT EVER NEEDS, on ANY relation (table, partition
  --               or MATVIEW): TRUNCATE, REFERENCES, TRIGGER, and now MAINTAIN. A
  --               write policy is no defence against any of these, so the grant is
  --               a finding wherever it lives.
  --       ARM 2 — INSERT/UPDATE/DELETE on a table with RLS ON and NO write policy,
  --               minus hr_client_write_baseline. Unchanged. Matviews carry no RLS
  --               and cannot be written through any path, so an i/u/d bit on one is
  --               inert and deliberately NOT arm 2's business.
  --     PUBLIC is not enumerated separately: a grant to PUBLIC makes
  --     has_table_privilege true for anon AND authenticated, so it surfaces under
  --     both without a third grantee.
  select coalesce(jsonb_agg(distinct x.g order by x.g), '[]'::jsonb) into v_client_trunc from (
    select c.relname || ':' || gg || ':' || pv as g
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','m')
       and has_table_privilege(gg, c.oid, pv)
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and c.relrowsecurity
       and has_table_privilege(gg, c.oid, pv)
       and not exists (select 1 from pg_policies pp
                        where pp.schemaname = 'public' and pp.tablename = c.relname
                          and pp.cmd in ('INSERT','UPDATE','DELETE','ALL'))
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
    -- ARM 3 (1003-dead-client-writes.sql, 2026-11-19) — THE LIVE CLIENT WRITE SET. Any
    --       INSERT/UPDATE/DELETE an anon or authenticated client holds on a table, WHATEVER ITS
    --       POLICIES SAY, unless it is one of the live pairs below or recorded in
    --       hr_client_write_baseline. Arm 2 exempts a table with any write policy, and the
    --       closed-mode RESTRICTIVE "for all" policy counted as one, so a regrant on game_events,
    --       session_claims or clan_members (or a re-applied old file carrying its permissive
    --       policy) was invisible to it. The live set is a CLAIM: a client writes the table
    --       directly, under a policy written for that, and no RPC could do it instead.
    union all
    select c.relname || ':' || gg || ':' || pv
      from pg_class c
      cross join unnest(array['anon','authenticated']) gg
      cross join unnest(array['INSERT','UPDATE','DELETE']) pv
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
       and has_table_privilege(gg, c.oid, pv)
       and (c.relname || ':' || gg || ':' || pv) <> all (array[
             -- the bug report form: one row a press, its own policy ("bugs anyone submits")
             'bug_reports:authenticated:INSERT'])
       and not exists (select 1 from public.hr_client_write_baseline bl
                        where bl.table_name = c.relname and bl.grantee = gg)
  ) x;

  -- (5) D4 — THE POSITIVE ASSERTION. For every role that owns a function in
  --     public there must be a GLOBAL default-ACL row (defaclnamespace = 0)
  --     for functions, and it must grant EXECUTE to none of PUBLIC / anon /
  --     authenticated. Only a GLOBAL row replaces acldefault(); a schema-scoped
  --     one can only ADD to it, which is why the 2026-08-10 attempt at this
  --     changed nothing. Absence of the row IS the finding.
  select coalesce(jsonb_agg(r.rolname order by r.rolname), '[]'::jsonb)
    into v_defacl_open
    from (select distinct p.proowner from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind in ('f','p')) o
    join pg_roles r on r.oid = o.proowner
   where not exists (
     select 1 from pg_default_acl d
      where d.defaclrole = o.proowner
        and d.defaclnamespace = 0
        and d.defaclobjtype = 'f'
        and not exists (
          select 1 from aclexplode(d.defaclacl) a
          left join pg_roles rr on rr.oid = a.grantee   -- grantee 0 = PUBLIC
           where a.privilege_type = 'EXECUTE'
             and (a.grantee = 0 or rr.rolname in ('anon','authenticated'))));

  -- (6) Residual: platform-owned SCHEMA default ACLs we genuinely cannot edit
  --     (supabase_admin). Reported so the residual stays visible. This is the
  --     check revision 1 mistook for the real one — kept, demoted, labelled.
  select coalesce(jsonb_agg(d.defaclrole::regrole::text || ':' || n.nspname
                            order by d.defaclrole::regrole::text), '[]'::jsonb)
    into v_platform
    from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
   where n.nspname = 'public' and d.defaclobjtype = 'f'
     and d.defaclacl::text ~ '(anon|authenticated)=[a-zA-Z*]*X';

  -- (7) S9 — hr_engine's EXECUTE surface, keyed on the FULL SIGNATURE and with
  --     no prokind filter, so an overload and a procedure are both visible.
  --     Skipped silently if the role does not exist: this file must stand alone
  --     on a database that has not had the server-authority bundle applied.
  if exists (select 1 from pg_roles where rolname = 'hr_engine') then
    select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
      into v_engine_extra
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f','p')
       and has_function_privilege('hr_engine', p.oid, 'execute')
       and p.oid::regprocedure::text <> all (c_engine_allow);
    -- "Zero table privileges" is the other half of the capability claim, and
    -- column grants are invisible to role_table_grants, so both are asked.
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_engine_tables from (
      select table_name || ':' || privilege_type as g
        from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'hr_engine'
      union all
      select table_name || '.' || column_name || ':' || privilege_type
        from information_schema.role_column_grants
       where table_schema = 'public' and grantee = 'hr_engine') x;
  else
    v_engine_extra  := '[]'::jsonb;
    v_engine_tables := '[]'::jsonb;
  end if;

  -- (8) A9 — every client-callable SECURITY DEFINER function must reference a
  --     rate gate. This is the RUNTIME twin of the static lint in
  --     tests/run-sql-tests.mjs, and it exists for one specific reason: the A9
  --     retrofit in 2026-08-11-authenticated-surface-lockdown.sql installs thin
  --     wrappers over renamed `__ungated` bodies, so RE-APPLYING an older
  --     migration that `create or replace`s a wrapped name would silently
  --     replace the wrapper with the ungated body and delete the gate. A repo
  --     lint cannot see that; this can, within a day.
  --     Matching on prosrc is deliberately crude — it proves the gate is
  --     MENTIONED, not that it is reached. It catches the whole class this is
  --     written for (a body that has never heard of a gate) and nothing subtler.
  select coalesce(jsonb_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text), '[]'::jsonb)
    into v_ungated
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f','p') and p.prosecdef
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'))
     and p.prosrc !~ 'hr_rpc_gate|hr_rate_gate|hr_rate_ok';

  -- (9) T-5 — hr_ops STAYS A SINK (2026-09-28). hr_ops holds the operator-only
  --     routines that read net._http_response, a table PUBLIC can read and our
  --     roles cannot revoke. Keeping hr_ops out of PostgREST's exposed list is
  --     half the property; the other half is that no client or engine role can
  --     USE the schema, CREATE in it, or EXECUTE anything in it — reachability
  --     is the arming condition. tests/pg-net-queue-unreachable.mjs Q-5 guards
  --     the repo; this asks the CATALOGUE, so a grant typed in the dashboard, by
  --     support or by a platform migration is a finding by the next nightly run.
  --     The roles are the six the sink was built against — PUBLIC, anon,
  --     authenticated, service_role, hr_engine, hr_tick — and the two LOGIN
  --     roles those are reached through before SET ROLE: authenticator
  --     (PostgREST) and hr_engine_login (the edge); both are NOINHERIT, so only
  --     a DIRECT grant to them reads here (Security, 2026-09-28). Superusers
  --     and pg_read_all_data (USAGE on every schema, no EXECUTE) are the owner
  --     class and are out of scope by construction. A role that does not
  --     exist is skipped (this file must stand alone), and so is a database
  --     with no hr_ops at all: no sink, nothing to reach. prokind is NOT
  --     filtered — a procedure or an aggregate in hr_ops is reachable too.
  if exists (select 1 from pg_namespace where nspname = 'hr_ops') then
    select coalesce(jsonb_agg(x.g order by x.g), '[]'::jsonb) into v_ops_reach from (
      select 'schema:' || r.role || ':' || pv as g
        from (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
        cross join unnest(array['USAGE','CREATE']) pv
       where (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_schema_privilege(r.role, 'hr_ops', pv)
      union all
      select p.oid::regprocedure::text || ':' || r.role
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (values ('public'),('anon'),('authenticated'),('service_role'),('hr_engine'),('hr_tick'),
                     ('authenticator'),('hr_engine_login')) r(role)
       where n.nspname = 'hr_ops'
         and (r.role = 'public' or exists (select 1 from pg_roles where rolname = r.role))
         and has_function_privilege(r.role, p.oid, 'execute')) x;
  else
    v_ops_reach := '[]'::jsonb;
  end if;

  v_report := jsonb_build_object(
    'public_execute_functions',        v_public_exec,
    'unapproved_client_rpcs',          v_unapproved,
    'baseline_rows_no_longer_live',    v_lost,
    'client_truncate_grants',          v_client_trunc,
    'owners_without_failclosed_defacl',v_defacl_open,
    'platform_schema_defacls_open',    v_platform,
    'engine_execute_outside_allowlist',v_engine_extra,
    'engine_table_privileges',         v_engine_tables,
    'hr_ops_reachable',                v_ops_reach,
    'ungated_client_rpcs',             v_ungated);

  if jsonb_array_length(v_lost) > 0 then
    raise warning 'GRANT HYGIENE: % approved client RPC(s) are no longer reachable — %',
      jsonb_array_length(v_lost), v_lost::text;
  end if;

  if p_strict and (jsonb_array_length(v_public_exec) > 0
                or jsonb_array_length(v_unapproved) > 0
                or jsonb_array_length(v_client_trunc) > 0
                or jsonb_array_length(v_defacl_open) > 0
                or jsonb_array_length(v_engine_extra) > 0
                or jsonb_array_length(v_engine_tables) > 0
                or jsonb_array_length(v_ops_reach) > 0
                or jsonb_array_length(v_ungated) > 0) then
    raise exception 'GRANT HYGIENE FAILED: %', v_report::text;
  end if;
  return v_report;
end $$;
-- ⟦/DERIVED hr_assert_grant_hygiene⟧
revoke execute on function public.hr_assert_grant_hygiene(boolean)
  from public, anon, authenticated, service_role;

-- ── §7 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────────────────────────────────────────────────────
--   (a) every cut function is gone under any signature, every cut table, column and index is gone, and no kept function body,
--       view or cron job names one (comments and quoted literals stripped: a quoted label is not a call)
--   (b) the three restated bodies are this file's images, definer, pinned search_path; hr_state_of engine-only, hr_server_now
--       still the player's (and rate-gated)
--   (c) NOTHING CAN REGRANT THEM: no baseline row names a cut RPC, hygiene is clean, and a planted hr_buy_gem_unlock granted to
--       a player reads unapproved_client_rpcs while a planted hr_dungeon_settle granted to the engine reads
--       engine_execute_outside_allowlist
--   (d) A LIVE SYSTEM STILL WORKS: a real hero is created from the kit, its envelope carries every kept key and exactly the
--       kept state scalars and none of the four cut keys; the clock answers a player without live_event_key; the market's
--       rule still lists an item and still refuses the premium login reward as 'premium'; the hero slots still sell for gold
do $$
declare
  c_fns   constant text[] := array['hr_dungeon_settle', 'hr_quartermaster_buy', 'hr_dungeon_cooldowns', 'hr_dungeon_cooldown_divisor',
    'hr_dungeon_cooldown_modes', 'hr_muster_window', 'hr_buy_gem_unlock', 'hr_buy_gem_unlock__ungated', 'hr_gem_unlocks_of',
    'hr_claim_discord_gift', 'hr_claim_discord_gift__ungated', 'hr_discord_code_current', 'hr_discord_code_for'];
  c_tbls  constant text[] := array['hr_dungeons', 'hr_dungeon_loot', 'hr_qm_offers', 'hr_gem_unlocks', 'account_gem_grants',
    'hr_market_premium_items', 'hr_discord_gift_claims'];
  c_cols  constant text[] := array['player_state.dungeon_scrip', 'hr_hero_slots.cost_gems', 'account_wallet.hearth_tokens',
    'hr_start_kit.hearth_tokens'];
  c_top   constant text[] := array['ok', 'version', 'now', 'level', 'vitals', 'buffs', 'place', 'stamina', 'state', 'skills',
    'inventory', 'bank', 'equipment', 'enchant', 'progress', 'progress_truncated', 'client_state', 'total_level',
    'unlocked_recipes', 'renown_high', 'bounty', 'hero_slots', 'traits', 'companions', 'must_rename', 'inventory_complete',
    'farm_land'];
  c_state constant text[] := array['slot', 'gold', 'gold_v', 'gems', 'marks', 'hp', 'max_hp', 'level_xp', 'bank_cap',
    'active_kind', 'active_id', 'active_since', 'accrued_to', 'combat_xp_accrued_to', 'rested_xp', 'rested_at', 'tool_carry',
    'hearthfind_ready', 'hearthfind_last', 'hearthfind_titles', 'hearthfind_plinth', 'fight', 'deaths_lifetime', 'deaths_today',
    'streak_days', 'plot_level', 'streak_day_key'];
  v_u     constant uuid := '000000d5-0000-0000-0000-0000c0ffee10';
  v       jsonb;
  v_set   text;
  v_name  text;
  v_n     int;
  v_txt   text;
  v_code  text;
begin
  -- (a) GONE, AND NOTHING KEPT NAMES THEM.
  select string_agg(p.oid::regprocedure::text, ', ') into v_set
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (c_fns);
  if v_set is not null then raise exception 'approved-cuts §7(a): still defined: %', v_set; end if;
  select string_agg(t, ', ') into v_set from unnest(c_tbls) t where to_regclass('public.' || t) is not null;
  if v_set is not null then raise exception 'approved-cuts §7(a): table(s) still here: %', v_set; end if;
  select string_agg(c.table_name || '.' || c.column_name, ', ') into v_set
    from information_schema.columns c
   where c.table_schema = 'public' and (c.table_name || '.' || c.column_name) = any (c_cols);
  if v_set is not null then raise exception 'approved-cuts §7(a): column(s) still here: %', v_set; end if;
  if to_regclass('public.player_ledger_dungeon_idx') is not null then
    raise exception 'approved-cuts §7(a): the ledger''s dungeon index is still here'; end if;
  foreach v_name in array c_fns || c_tbls || array['dungeon_scrip', 'cost_gems', 'hearth_tokens'] loop
    select string_agg(p.oid::regprocedure::text, ', ') into v_set
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prolang not in (12, 13)  -- not internal, not C
       -- block comments, then line comments, then quoted literals (that order: an apostrophe in a comment is not a quote)
       and regexp_replace(regexp_replace(regexp_replace(coalesce(p.prosrc, ''), '/\*.*?\*/', ' ', 'g'), '--[^\n]*', ' ', 'g'),
                          '''([^'']|'''')*''', ' ', 'g') ~ ('\m' || v_name || '\M');
    if v_set is not null then raise exception 'approved-cuts §7(a): % still name(s) the cut %', v_set, v_name; end if;
    select string_agg(c.relname, ', ') into v_set
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v', 'm') and pg_get_viewdef(c.oid) ~ ('\m' || v_name || '\M');
    if v_set is not null then raise exception 'approved-cuts §7(a): view(s) % still name the cut %', v_set, v_name; end if;
  end loop;
  if to_regclass('cron.job') is not null then
    execute $q$select count(*) from cron.job where command ~ '\m(hr_dungeon_|hr_quartermaster_buy|hr_muster_window|hr_buy_gem_unlock|hr_gem_unlocks_of|hr_claim_discord_gift|hr_discord_code_)'$q$ into v_n;
    if v_n <> 0 then raise exception 'approved-cuts §7(a): % pg_cron job(s) name a cut function', v_n; end if;
  end if;

  -- (b) THE THREE RESTATED BODIES.
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_state_of(uuid,integer)'::regprocedure) <> '5934b4ec0826b5af3ad64a226ef8b4ea'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_server_now()'::regprocedure) <> 'c2f9a557ce4b6f3eb51a110d5167bdd8'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = 'public.hr_assert_grant_hygiene(boolean)'::regprocedure) <> '1cf0b8fa714f8b567abb7d52bbdda7f0' then
    raise exception 'approved-cuts §7(b): a restated body is not this file''s image'; end if;
  if exists (select 1 from pg_proc p where p.oid in ('public.hr_state_of(uuid,integer)'::regprocedure, 'public.hr_server_now()'::regprocedure)
              and (not p.prosecdef or p.prorettype <> 'jsonb'::regtype or p.proconfig is null)) then
    raise exception 'approved-cuts §7(b): hr_state_of or hr_server_now changed shape'; end if;
  if has_function_privilege('anon', 'public.hr_state_of(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_state_of(uuid,integer)', 'execute')
     or (exists (select 1 from pg_roles where rolname = 'hr_engine')
         and not has_function_privilege('hr_engine', 'public.hr_state_of(uuid,integer)', 'execute')) then
    raise exception 'approved-cuts §7(b): hr_state_of grants moved (a client reaches it, or the engine lost it)'; end if;
  if has_function_privilege('anon', 'public.hr_server_now()', 'execute')
     or not has_function_privilege('authenticated', 'public.hr_server_now()', 'execute')
     or not exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_server_now') then
    raise exception 'approved-cuts §7(b): hr_server_now is no longer the player''s clock (or anon reaches it)'; end if;
  v_code := regexp_replace((select prosrc from pg_proc where oid = 'public.hr_assert_grant_hygiene(boolean)'::regprocedure), '--[^\n]*', '', 'g');
  if v_code ~ 'hr_dungeon_settle\(' or v_code ~ 'hr_quartermaster_buy\(' then
    raise exception 'approved-cuts §7(b): the detector still allows a cut engine writer'; end if;

  -- (c) NOTHING CAN REGRANT THEM.
  if exists (select 1 from public.hr_client_rpc_baseline where proname = any (c_fns)) then
    raise exception 'approved-cuts §7(c): a cut RPC keeps its client-baseline row'; end if;
  v := public.hr_assert_grant_hygiene(false);
  if jsonb_array_length(coalesce(v->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'ungated_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'baseline_rows_no_longer_live', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'engine_execute_outside_allowlist', '[]'::jsonb)) <> 0 then
    raise exception 'approved-cuts §7(c): grant hygiene is red: %', v; end if;
  begin
    execute $p$create function public.hr_buy_gem_unlock(p_unlock_id text, p_slot integer, p_idem uuid)
               returns jsonb language plpgsql security definer set search_path = public as $b$
               begin if not public.hr_rpc_gate('hr_buy_gem_unlock') then return null; end if; return '{}'::jsonb; end $b$ $p$;
    execute 'revoke execute on function public.hr_buy_gem_unlock(text, integer, uuid) from public, anon';
    execute 'grant execute on function public.hr_buy_gem_unlock(text, integer, uuid) to authenticated';
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then
      execute $p$create function public.hr_dungeon_settle(p_user uuid, p_slot integer, p_version bigint, p_intent_id uuid,
                   p_dungeon_id text, p_mode text, p_quality numeric)
                 returns jsonb language plpgsql security definer set search_path = public as $b$ begin return '{}'::jsonb; end $b$ $p$;
      execute 'revoke execute on function public.hr_dungeon_settle(uuid, integer, bigint, uuid, text, text, numeric) from public, anon, authenticated, service_role';
      execute 'grant execute on function public.hr_dungeon_settle(uuid, integer, bigint, uuid, text, text, numeric) to hr_engine';
    end if;
    v := public.hr_assert_grant_hygiene(false);
    if not (coalesce(v->'unapproved_client_rpcs', '[]'::jsonb)::text ~ 'hr_buy_gem_unlock') then
      raise exception 'approved-cuts §7(c): a re-granted hr_buy_gem_unlock reads as approved: %', v->'unapproved_client_rpcs'; end if;
    if exists (select 1 from pg_roles where rolname = 'hr_engine')
       and not (coalesce(v->'engine_execute_outside_allowlist', '[]'::jsonb)::text ~ 'hr_dungeon_settle') then
      raise exception 'approved-cuts §7(c): a re-granted hr_dungeon_settle reads as allowed: %', v->'engine_execute_outside_allowlist'; end if;
    /* THE PROBES LEAVE AS THEY CAME. The rollback below undoes them anyway; the drops are written out so the probe reads
       create-then-drop in this file (tests/live-hash-drift.mjs sweep(): a body created after this file's §2 drop and never
       dropped again would read as re-created, and the cut body as still built). */
    drop function public.hr_buy_gem_unlock(text, integer, uuid);
    if exists (select 1 from pg_roles where rolname = 'hr_engine') then
      drop function public.hr_dungeon_settle(uuid, integer, bigint, uuid, text, text, numeric);
    end if;
    raise exception using errcode = 'HRC10', message = 'approved-cuts §7(c) regrant probe - rolling back';
  exception when sqlstate 'HRC10' then null;
  end;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = any (c_fns)) then
    raise exception 'approved-cuts §7(c): LEAKED a planted function'; end if;

  -- (d) A LIVE SYSTEM STILL WORKS.
  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'approved-cuts §7')
      on conflict (key) do update set enabled = true;
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, null) on conflict (id) do update set display_name = null;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'approved-cuts §7 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'approved-cuts §7(d): hr_create_character(0) refused: %', v; end if;
    v := public.hr_state_of(v_u, 0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'approved-cuts §7(d): hr_state_of refused a real hero: %', v; end if;
    if v ? 'dungeon_cooldowns' or v ? 'gem_unlocks' or (v->'state') ? 'dungeon_scrip' or (v->'state') ? 'hearth_tokens' then
      raise exception 'approved-cuts §7(d): the envelope still carries a cut key'; end if;
    select string_agg(k, ', ') into v_set from unnest(c_top) k where not (v ? k);
    if v_set is not null then raise exception 'approved-cuts §7(d): the envelope lost %', v_set; end if;
    select string_agg(k, ', ' order by k) into v_set from (
      (select jsonb_object_keys(v->'state') except select unnest(c_state))
      union all (select unnest(c_state) except select jsonb_object_keys(v->'state'))) d(k);
    if v_set is not null then raise exception 'approved-cuts §7(d): state scalars moved: %', v_set; end if;
    if (v->'state'->>'gold')::bigint is distinct from (select gold from public.hr_start_kit) then
      raise exception 'approved-cuts §7(d): the kit''s gold did not reach the purse: %', v->'state'->'gold'; end if;
    -- the clock, as the player
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'role', 'authenticated')::text, true);
    v := null;
    begin
      execute 'set local role authenticated';
      v := public.hr_server_now();
    exception when others then v_txt := sqlerrm;
    end;
    execute 'reset role';
    if v is null or coalesce(v->>'ok', '') <> 'true' or not (v ? 'epoch_ms') or not (v ? 'day_key') or v ? 'live_event_key' then
      raise exception 'approved-cuts §7(d): the clock answered % (%)', v, coalesce(v_txt, '-'); end if;
    -- the market's one listable rule
    if not exists (select 1 from public.hr_market_items where listable) then
      raise exception 'approved-cuts §7(d): the market lists nothing'; end if;
    if exists (select 1 from public.hr_premium_login_reward p join public.hr_market_items m using (item_id) where m.listable) then
      raise exception 'approved-cuts §7(d): the premium login reward became listable'; end if;
    -- every hero slot is paid in gold or free (all four free since 1036-four-starter-slots.sql, FB-5): none is priced in gems
    if exists (select 1 from public.hr_hero_slots where cost_gold is null or cost_gold < 0 or (cost_gold = 0 and not starter)) then
      raise exception 'approved-cuts §7(d): a hero slot is neither sold for gold nor a free starter'; end if;
    raise exception using errcode = 'HRC11', message = 'approved-cuts §7(d) complete - rolling back';
  exception when sqlstate 'HRC11' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = v_u) then raise exception 'approved-cuts §7: LEAKED a probe row'; end if;
  raise notice 'approved-cuts: the old dungeons and the scrip, the gem rows and the gem RPC, the bond and the Discord gift '
               'are gone; the envelope, the clock, the market rule and the hero slots answer; nothing can regrant a cut door';
end $$;
