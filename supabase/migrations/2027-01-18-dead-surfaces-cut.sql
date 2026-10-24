-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — DEAD SURFACES CUT: the worker crew doors, the per-hero `farm`
-- and crew projection in the envelope, and the clans' client doors (lane
-- c-dead-surfaces, backend-architect, 2026-10-24).
-- STAGED. Game CLOSED: applies on its passing §4 (CLAUDE.md §2), one file via
-- tools/apply-migration.mjs, never inside begin/commit, never 00:00–00:10 UTC.
-- It SHRINKS the surface Security reviews at the reopen gate by 25 client RPCs.
--
-- ── WHY ──────────────────────────────────────────────────────────────────────
-- Each of these has no screen and no player (measured live 2026-10-24, read-only):
--   · hr_worker_hire / hr_worker_assign: player_workers holds 0 rows; player_ledger
--     has no kind 'worker' row in its retained window; vitals `workers` read 0 for
--     eight days; nothing under src/ or supabase/functions/ names either verb. The
--     hire door is the dangerous half: a forged client holding a worker_hire rung
--     got a crew the engine settles into free gathered items at an unreviewed rate.
--   · hr_state_of `farm` (the per-plot array with waterings) and the crew keys
--     (`workers`, `state.workers_accrued_to`, inventory_complete's crew arm): the
--     rebuilt client reads the field through the `farm_land` section
--     (hr_farm_land_view, 2026-12-14-shared-farm.sql: readiness judged by the
--     server's clock); tests/envelope-contract.mjs clientReadKeys() finds no
--     reader of `farm` or `workers`; the edge reads `env.workers` and
--     `st.workers_accrued_to` only behind Array.isArray / a null fallback and settles
--     nothing for an empty crew (accrual.js accrueWorkers: no_crew), so its
--     behaviour is identical with the keys gone. No edge change.
--   · the clan doors (clan_* and hr_clan_browser, 23 authenticated RPCs, two of
--     them sinks: clan_contribute debits gold, clan_deposit takes items): 0 clans
--     and 0 members live, no client screen calls any of them, and clan_invite still
--     matches profiles.display_name, which no live player sets. Tyler's rulings keep
--     GUILD CHAT for Early Access (rulings-of-record, Social: "Guild chat at EA;
--     guilds/halls post-EA") — a feature not built yet ("no guild row ships until
--     they do", src/data/chat-channels.js) — and nothing keeps THESE doors. So the
--     client grants are revoked and the tables and bodies stay as the base a guild
--     lane may re-grant from, after its own Security review.
--
-- ── WHAT ─────────────────────────────────────────────────────────────────────
-- §1 THE CREW DOORS: hr_worker_hire(int,uuid) and hr_worker_assign(int,text,text,
--    text,uuid) are dropped with their two hr_client_rpc_baseline rows. KEPT:
--    public.player_workers (empty; hr_apply's `workers` delta branch still names it,
--    and hr_apply is not restated here) and the inert 'worker_hire' / 'worker_assign'
--    case labels in hr_rpc_gate (the 2026-12-04 cut's precedent: a quoted label is
--    not a call).
-- §2 hr_state_of RESTATED WHOLE from the live image (md5 05067547…), removing exactly
--    `state.workers_accrued_to`, `workers`, `farm` and inventory_complete's crew arm.
--    Every other key, expression and comment is byte-identical (derived
--    mechanically from the live text). `state.plot_level` and the `farm_land`
--    section stay.
-- §3 THE CLAN DOORS: EXECUTE revoked from public, anon, authenticated and
--    service_role on all 23, and their 23 baseline rows deleted (grant hygiene
--    stays green: a baseline row whose grant is gone would read as a broken
--    feature). Bodies, __ungated bodies, helpers, triggers and every clan table stay.
--
-- ── NOT IN THIS FILE, AND WHY ────────────────────────────────────────────────
-- The worker_hire (6) and plot:farm_land (12) GOLD LADDER ROWS in hr_unlock_offers
-- stay sellable here. tests/unlock-buy.mjs U1 holds the SQL sellable set EQUAL to
-- the edge's forward set, which it reads from src/data/gold-ladders.js, and that
-- file is vendored into hr-accrue (gold-ladder-catalogue.js imports
-- GOLD_LADDER_OFFER_IDS). Deleting the rows without the data is a red U1; cutting
-- the data moves the edge payload. Both halves ride the next hr-accrue deploy
-- together: gold-ladders.js (bank only), tools/gen-gold-ladders.mjs on a --new
-- forward file that also deletes the rows it no longer emits, and the hr_unlocks
-- rows worker_hire and plot:farm_land. Until then a rung bought by a forged client
-- buys nothing (no hire door, no plot reader): a self-harm, not a faucet.
--
-- ── EXPLOIT SURFACE ─────────────────────────────────────────────────────────
-- Only shrinks: 25 client RPCs fewer (one unreviewed item faucet, two value sinks
-- into another player's reach: clan stores and treasuries), and an envelope that
-- carries less. Nothing is granted, no price, clamp or ledger rule moves.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- §1: re-apply hr_worker_hire / hr_worker_assign from their last files
-- (tests/live-hash-drift.baseline.json `touched_by`) with their baseline rows.
-- §2: re-apply the 2026-12-15-account-gold.sql hr_state_of body. §3: re-grant
-- EXECUTE to authenticated and re-insert the baseline rows (in a reviewed file).
-- No row of player data is touched, so nothing is lost either way.
-- ORDER: after 2027-01-15-social-resolve-character-names.sql (the sibling lanes'
-- 2027-01-16 / -17 had not landed at staging). No begin/commit.
-- COST: per envelope, one subquery on account_farm_plots and one on player_workers
-- fewer; per account at 100× players nothing grows (no row is written).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS AND THE PINS ───────────────────────────────────────────
do $mig$
declare v_md5 text; v_n int;
begin
  if to_regprocedure('public.hr_state_of(uuid,integer)') is null
     or to_regprocedure('public.hr_state_sections_of(uuid,integer)') is null
     or to_regprocedure('public.hr_farm_land_view(uuid,integer)') is null
     or to_regprocedure('public.hr_farm_plot_level(uuid)') is null
     or to_regclass('public.account_wallet') is null or to_regclass('public.account_farm_plots') is null
     or to_regclass('public.hr_client_rpc_baseline') is null then
    raise exception 'PRECONDITION: apply 2026-12-14-shared-farm.sql and 2026-12-15-account-gold.sql first'; end if;
  select md5(prosrc) into v_md5 from pg_proc where oid = 'public.hr_state_of(uuid,integer)'::regprocedure;
  -- 05067547… is the 2026-12-15-account-gold.sql body (the replay chain and live, measured 2026-10-24);
  -- e0a71bfea1bf596df13f9cbfc59f5cf3 is this file's image (a re-apply). Any other body is a concurrent restatement: refuse,
  -- never silently revert it.
  if v_md5 not in ('0506754710c98788248a27b230168e59', 'e0a71bfea1bf596df13f9cbfc59f5cf3') then
    raise exception 'PIN: hr_state_of moved (md5 %): re-derive this restatement from the new body', v_md5; end if;
  -- A crew that exists would be stranded by §1 and §2 (no door to manage it, no projection to settle it).
  -- Measured 0 live. Never evict on uncertainty: refuse and let a human decide.
  if to_regclass('public.player_workers') is not null then
    execute 'select count(*) from public.player_workers' into v_n;
    if v_n <> 0 then raise exception 'PRECONDITION: % hired worker(s) exist; the crew cut would strand them', v_n; end if;
  end if;
end $mig$;

-- ── §1 THE CREW DOORS ───────────────────────────────────────────────────────
drop function if exists public.hr_worker_hire(integer, uuid);
drop function if exists public.hr_worker_assign(integer, text, text, text, uuid);
delete from public.hr_client_rpc_baseline where proname in ('hr_worker_hire', 'hr_worker_assign');

-- ── §2 THE ENVELOPE, WITHOUT THE CREW AND THE PER-PLOT ARRAY ─────────────────
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

-- ── §3 THE CLAN DOORS ───────────────────────────────────────────────────────
revoke execute on function public.clan_contribute(uuid, bigint, integer) from public, anon, authenticated, service_role;
revoke execute on function public.clan_create(text, text) from public, anon, authenticated, service_role;
revoke execute on function public.clan_deposit(uuid, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.clan_feast_call(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.clan_feast_deposit(uuid, text, integer, integer) from public, anon, authenticated, service_role;
revoke execute on function public.clan_invite(text) from public, anon, authenticated, service_role;
revoke execute on function public.clan_invite_revoke(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.clan_invites_list() from public, anon, authenticated, service_role;
revoke execute on function public.clan_join(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.clan_join_policy_set(text) from public, anon, authenticated, service_role;
revoke execute on function public.clan_kick(uuid, integer) from public, anon, authenticated, service_role;
revoke execute on function public.clan_leave() from public, anon, authenticated, service_role;
revoke execute on function public.clan_rested_grant(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.clan_seat_read(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.clan_vice_set(uuid, uuid, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.clan_vote_cast(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.clan_vote_close(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.clan_vote_open(uuid, jsonb, integer) from public, anon, authenticated, service_role;
revoke execute on function public.clan_vote_read(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.clan_work_labour(uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke execute on function public.clan_work_post(uuid, text, integer) from public, anon, authenticated, service_role;
revoke execute on function public.clan_work_supply(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.hr_clan_browser(integer) from public, anon, authenticated, service_role;
delete from public.hr_client_rpc_baseline
 where proname in ('clan_contribute', 'clan_create', 'clan_deposit', 'clan_feast_call', 'clan_feast_deposit',
                   'clan_invite', 'clan_invite_revoke', 'clan_invites_list', 'clan_join', 'clan_join_policy_set',
                   'clan_kick', 'clan_leave', 'clan_rested_grant', 'clan_seat_read', 'clan_vice_set',
                   'clan_vote_cast', 'clan_vote_close', 'clan_vote_open', 'clan_vote_read', 'clan_work_labour',
                   'clan_work_post', 'clan_work_supply', 'hr_clan_browser');

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
do $$
declare
  c_cut constant text[] := array['hr_worker_hire', 'hr_worker_assign'];
  c_top constant text[] := array['ok', 'version', 'now', 'level', 'vitals', 'buffs', 'place', 'stamina',
    'dungeon_cooldowns', 'state', 'skills', 'inventory', 'bank', 'equipment', 'enchant', 'progress',
    'progress_truncated', 'client_state', 'total_level', 'unlocked_recipes', 'gem_unlocks', 'renown_high',
    'bounty', 'hero_slots', 'traits', 'companions', 'must_rename', 'inventory_complete', 'farm_land'];
  c_state constant text[] := array['slot', 'gold', 'gold_v', 'gems', 'marks', 'dungeon_scrip', 'hearth_tokens',
    'hp', 'max_hp', 'level_xp', 'bank_cap', 'active_kind', 'active_id', 'active_since', 'accrued_to',
    'combat_xp_accrued_to', 'rested_xp', 'rested_at', 'tool_carry', 'hearthfind_ready', 'hearthfind_last',
    'hearthfind_titles', 'hearthfind_plinth', 'fight', 'deaths_lifetime', 'deaths_today', 'streak_days',
    'plot_level', 'streak_day_key'];
  v_u    constant uuid := '000000d5-0000-0000-0000-0000dead0001';
  v      jsonb;
  v_set  text;
  v_name text;
  v_n    int;
  v_txt  text;
  v_code text;
begin
  -- (a) THE CREW DOORS ARE GONE, under any signature, with their baseline rows; nothing kept calls them.
  select string_agg(p.oid::regprocedure::text, ', ') into v_set
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (c_cut);
  if v_set is not null then raise exception 'dead-surfaces §4(a): still defined: %', v_set; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname = any (c_cut)) then
    raise exception 'dead-surfaces §4(a): a crew door keeps its client-baseline row'; end if;
  foreach v_name in array c_cut loop
    select string_agg(p.proname, ',') into v_set
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and regexp_replace(regexp_replace(coalesce(p.prosrc, ''), '/\*.*?\*/', '', 'g'), '--[^\n]*', '', 'g')
           ~ ('\m' || v_name || '\s*\(');
    if v_set is not null then raise exception 'dead-surfaces §4(a): % still calls the dropped %', v_set, v_name; end if;
  end loop;
  if to_regclass('cron.job') is not null then
    execute $q$select count(*) from cron.job where command ~ '\mhr_worker_(hire|assign)\M'$q$ into v_n;
    if v_n <> 0 then raise exception 'dead-surfaces §4(a): % pg_cron job(s) name a dropped crew door', v_n; end if;
  end if;

  -- (b) THE ENVELOPE'S SHAPE: this file's image, definer, pinned search_path, engine-only.
  if (select md5(prosrc) from pg_proc where oid = 'public.hr_state_of(uuid,integer)'::regprocedure) <> 'e0a71bfea1bf596df13f9cbfc59f5cf3' then
    raise exception 'dead-surfaces §4(b): hr_state_of is not this file''s image'; end if;
  if exists (select 1 from pg_proc p where p.oid = 'public.hr_state_of(uuid,integer)'::regprocedure
              and (not p.prosecdef or p.prorettype <> 'jsonb'::regtype
                   or not (p.proconfig @> array['search_path=public']))) then
    raise exception 'dead-surfaces §4(b): hr_state_of changed shape'; end if;
  if has_function_privilege('anon', 'public.hr_state_of(uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_state_of(uuid,integer)', 'execute')
     or exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                 where p.oid = 'public.hr_state_of(uuid,integer)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE')
     or (exists (select 1 from pg_roles where rolname = 'hr_engine')
         and not has_function_privilege('hr_engine', 'public.hr_state_of(uuid,integer)', 'execute')) then
    raise exception 'dead-surfaces §4(b): hr_state_of grants moved (a client reaches it, or the engine lost it)'; end if;
  v_code := regexp_replace((select prosrc from pg_proc where oid = 'public.hr_state_of(uuid,integer)'::regprocedure), '--[^\n]*', '', 'g');
  if v_code ~ '\mplayer_workers\M' or v_code ~ '\mworkers_accrued_to\M' or v_code ~ '''(farm|workers)''' then
    raise exception 'dead-surfaces §4(b): hr_state_of still reads the crew or projects the per-plot array'; end if;

  -- (c) THE ENVELOPE, EXECUTED, on a real hero with a planted plot on its account's field.
  begin
    insert into public.hr_flags (key, enabled, note) values ('closed_mode', true, 'dead-surfaces §4')
      on conflict (key) do update set enabled = true;
    insert into auth.users (id) values (v_u) on conflict (id) do nothing;
    insert into public.profiles (id, display_name) values (v_u, null) on conflict (id) do update set display_name = null;
    insert into public.hr_access_allowlist (user_id, note) values (v_u, 'dead-surfaces §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', v_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'dead-surfaces §4(c): hr_create_character(0) refused: %', v; end if;
    insert into public.account_farm_plots (user_id, plot_idx, crop_id, planted_at, waterings, regrow_count, planted_by)
      select v_u, 0, c.crop_id, now(), array[]::timestamptz[], 0, 0 from public.hr_crops c order by c.base_hours desc, c.crop_id limit 1;
    v := public.hr_state_of(v_u, 0);
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'dead-surfaces §4(c): hr_state_of refused a real hero: %', v; end if;
    -- the cut keys are gone ...
    if v ? 'farm' or v ? 'workers' or (v->'state') ? 'workers_accrued_to' then
      raise exception 'dead-surfaces §4(c): the envelope still carries a cut key'; end if;
    -- ... and nothing else moved: every kept top-level key, and EXACTLY the kept state scalars.
    select string_agg(k, ', ') into v_set from unnest(c_top) k where not (v ? k);
    if v_set is not null then raise exception 'dead-surfaces §4(c): the envelope lost %', v_set; end if;
    select string_agg(k, ', ' order by k) into v_set from (
      (select jsonb_object_keys(v->'state') except select unnest(c_state))
      union all (select unnest(c_state) except select jsonb_object_keys(v->'state'))) d(k);
    if v_set is not null then raise exception 'dead-surfaces §4(c): state scalars moved: %', v_set; end if;
    if jsonb_typeof(v->'inventory_complete') <> 'boolean' or (v->>'inventory_complete')::boolean is not true then
      raise exception 'dead-surfaces §4(c): an idle hero''s inventory_complete is %', v->'inventory_complete'; end if;
    -- THE LIVE FARM READER: the field arrives through farm_land (the Farm window's section), plot and all.
    if coalesce((v->'farm_land'->>'cap')::int, 0) < 2 or jsonb_array_length(coalesce(v->'farm_land'->'plots', '[]'::jsonb)) <> 1
       or (v->'farm_land'->'plots'->0->>'i')::int <> 0 or (v->'farm_land'->'plots'->0->>'ready')::boolean is not false
       or v->'state'->>'plot_level' is null then
      raise exception 'dead-surfaces §4(c): farm_land does not carry the account''s field: %', v->'farm_land'; end if;

    -- (d) A CLAN DOOR REFUSES A PLAYER BY PRIVILEGE, while a kept player door still answers.
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_u, 'role', 'authenticated')::text, true);
    v_n := 1;
    begin
      execute 'set local role authenticated';
      perform public.clan_leave();
    exception
      when insufficient_privilege then v_n := 0;
      when others then v_n := -1; v_txt := sqlerrm;
    end;
    execute 'reset role';
    if v_n = 1 then raise exception 'dead-surfaces §4(d): a player still runs clan_leave'; end if;
    if v_n = -1 then raise exception 'dead-surfaces §4(d)-harness: clan_leave failed for another reason (%)', v_txt; end if;
    v := null;
    begin
      execute 'set local role authenticated';
      v := public.hr_farm_water(0, 127, gen_random_uuid());
    exception when others then v_txt := sqlerrm;
    end;
    execute 'reset role';
    if v is null or jsonb_typeof(v) <> 'object' then
      raise exception 'dead-surfaces §4(d): the kept farm door no longer answers a player (%)', coalesce(v_txt, 'null'); end if;
    raise exception using errcode = 'HRD18', message = 'dead-surfaces §4 complete - rolling back';
  exception when sqlstate 'HRD18' then null;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from auth.users where id = v_u) then raise exception 'dead-surfaces §4: LEAKED a probe row'; end if;

  -- (e) NO CLAN FUNCTION IS CLIENT-EXECUTABLE (any signature, any door this file did not list) and no
  --     clan baseline row is left; the tables and bodies a guild lane would build on stay.
  select string_agg(p.oid::regprocedure::text, ', ') into v_set
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname ~ '^clan_' or p.proname ~ '^hr_clan_')
     and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
          or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  if v_set is not null then raise exception 'dead-surfaces §4(e): a client still reaches %', v_set; end if;
  if exists (select 1 from public.hr_client_rpc_baseline where proname ~ '^clan_' or proname ~ '^hr_clan_') then
    raise exception 'dead-surfaces §4(e): a clan door keeps its client-baseline row'; end if;
  select string_agg(t, ', ') into v_set
    from unnest(array['clans', 'clan_members', 'clan_ledger', 'clan_stores', 'clan_invites', 'player_workers']) t
   where to_regclass('public.' || t) is null;
  if v_set is not null then raise exception 'dead-surfaces §4(e): kept table(s) missing: %', v_set; end if;
  select string_agg(k, ', ') into v_set
    from unnest(array['clan_create', 'clan_join', 'clan_deposit', 'clan_contribute', 'hr_clan_browser']) k
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = k);
  if v_set is not null then raise exception 'dead-surfaces §4(e): kept clan bodies missing: %', v_set; end if;

  -- (f) GRANT HYGIENE IS CLEAN: nothing unapproved, nothing ungated, no baseline row left without its grant.
  v := public.hr_assert_grant_hygiene(false);
  if jsonb_array_length(coalesce(v->'unapproved_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'ungated_client_rpcs', '[]'::jsonb)) <> 0
     or jsonb_array_length(coalesce(v->'baseline_rows_no_longer_live', '[]'::jsonb)) <> 0 then
    raise exception 'dead-surfaces §4(f): grant hygiene is red: %', v; end if;
  raise notice 'dead-surfaces-cut: the crew doors dropped, the envelope without the crew and the per-plot array '
               '(farm_land carries the field), 23 clan doors closed to clients with their tables kept; all green';
end $$;
