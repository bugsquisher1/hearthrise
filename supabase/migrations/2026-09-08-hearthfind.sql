-- ============================================================================
-- 2026-09-08-hearthfind.sql — THE FOUR HEARTHFINDS (Feature Slate §2,
--   as ruled by the Game Designer 2026-09-08; the ruling is final authority and
--   this file implements it exactly).
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. Applied by the Coordinator after a
--     Security GO, via tools/apply-migration.mjs, in this order:
--       2026-08-11-catalogue.generated.sql   (regenerated: +4 trophy items)
--       2026-09-08-hearthfind-catalogue.generated.sql
--       THIS FILE
--     …and the hr-accrue redeploy in the same breath (see REVERSIBILITY).
--
-- "Once in a very long while the realm stops what it is doing to look at what
-- you found." DROP_BAND_MAX.rare is 5% and the rarest shipped drop is 0.5%:
-- before this file there is no such thing as a rare drop in Hearthrise.
--
-- Governing rule: CLAUDE.md §1 "Mission constraints". Nothing here is authored
-- by the client, and nothing here is authored by the Edge Function either: the
-- engine proposes a PAIR (source_kind, source_id) and an item id, and this
-- function looks all three up in a generated catalogue before it pays anything.
--
-- Engine halves that ship with this file (EDGE REDEPLOY REQUIRED):
--   src/data/hearthfind.js                   the table (12 sources, 4 trophies),
--                                            authored in EXPECTED HOURS (100-400)
--   tools/gen-hearthfind.mjs                 derives one_in + expected_hours
--   src/data/items.js                        the 4 trophies, hearthfind:true
--   src/core/hearthfind.js                   the seeded roll — the ONE engine
--   src/core/combat-sim.js                   the monster roll site (resolveKill)
--   src/core/skill-sim.js                    the node roll site (resolveGatherTick)
--   supabase/functions/hr-accrue/accrual.js  proposes delta.hearthfind
--
-- ── WHAT IS ADDED ───────────────────────────────────────────────────────────
--   §1  world_finds — the public board. PUBLIC READ, RPC-INSERT-ONLY.
--   §1b player_ledger_kind_check gains 'hearthfind'.
--   §1a2 player_ledger_hearthfind_idx — a partial index (kind='hearthfind'),
--       so §1c's projection is one probe and not a scan of the character's day.
--   §1a3 player_ledger_hearthfind_item_idx — partial, by item, for the GLOBAL
--       ordinal ("the 4th ever found in Hearthrise"). Counted from the journal,
--       never from world_finds, which the broadcast clamp suppresses.
--   §1d player_cosmetics — SERVER-OWNED cosmetic unlocks (title, plinth).
--       No numeric column, by design and by self-check: a cosmetic that can
--       carry a number is one migration from being a stat.
--   §1c hr_state_of — projects `hearthfind_ready` (the engine's order-safety
--       switch), `hearthfind_last` (the retried reveal) AND the cosmetic
--       unlocks (`hearthfind_titles`, `hearthfind_plinth`) — programmatic,
--       ONE anchored replace, exactly-once. NO NEW ANCHOR is introduced by the
--       ruling's cosmetics: the projections are added inside the SAME
--       exactly-once replace the staged file already made, so the restatement
--       debt below is UNCHANGED by this revision.
--   §2  hr_apply — allowlists 'hearthfind', re-derives it from the catalogue,
--       re-asserts the 100-400 hour band on the row it is about to pay, grants
--       the trophy, grants the cosmetic unlocks, computes the global ordinal,
--       journals it, broadcasts it (30 s clamp), and returns it on the receipt
--       (programmatic, anchored, exactly-once — the same three replaces the
--       staged file made; the ruling added no anchor).
--   §3  hr_world_finds_prune — the retention valve.
--   §4  self-check — every load-bearing property, proven by executing SQL,
--       including (a) the 100-400 EXPECTED-HOURS band on the stored rows,
--       (a3) combat sources are bosses only, (r3) player_cosmetics carries no
--       numeric column, and (s2) hr_apply hand-types no cosmetic code.
--
-- ── WHAT A FIND PAYS (ruling §6) — AND WHAT IT DOES NOT ─────────────────────
-- It pays ONE bind-on-pickup, v:0 trophy; a permanent collection-log row
-- (DERIVED, not stored: date and odds from player_ledger.meta, "Nth ever found"
-- from the ordinal at (ii-b), lifetime action count on that source from the
-- character's own progress rows); an equippable TITLE; and a homestead PLINTH.
-- It pays NO gold, NO XP, NO renown, NO gems, NO stat and NO rate — asserted by
-- the journal row's gold_in/xp_in = 0, by hr_items.value = 0 and tradeable =
-- false on every trophy (§4 l/m), and by player_cosmetics having no numeric
-- column at all (§4 r3).
--
-- ── ANTI-P2W (ruling §7) ────────────────────────────────────────────────────
-- The roll site reads ONLY (source_kind, source_id, server seed). No purchase,
-- bond, currency, buff, potion, gear stat, prestige perk or event modifier can
-- change the odds, the roll count or the daily clamp. The SERVER half of that
-- property is here (the odds come from the catalogue under the lock, never from
-- the delta); the ENGINE half is proven by tests/hearthfind-mint-guard.mjs,
-- which greps the roll site for every multiplier term and carries a --selftest
-- mutation proof.
--
-- ── RESTATEMENT-DEBT-ACK ────────────────────────────────────────────────────
-- §2 is PROGRAMMATIC, not a `create or replace`. It edits `pg_get_functiondef`
-- output at guarded exactly-once anchors (the 2026-08-22-rested-record.sql /
-- 2026-09-06-recovering-until.sql idiom), so this file is a member of NO
-- derivation chain and takes over NO last-toucher role. That is deliberate and
-- it is the ONLY safe shape here: hr_apply's live body is
-- 2026-08-25-workers.sql's restatement PLUS the rested allowlist, the
-- recovering_until arm and the death-ledger fan-out, all applied
-- programmatically on top of it. A restated `create or replace` derived from
-- the last static link would compile, self-check green, and silently erase
-- every one of them — the single most destructive statement in this repo.
--
-- THE DEBT IS ACKNOWLEDGED AND NAMED: hr_apply's body now exists only as the
-- accumulated result of five programmatic patches over one static ancestor.
-- Its patch depth is FIVE after this file (rested-record, combat-style,
-- recovering_until ×3 arms counted as one, farm-plant-lifetime, THIS). Reading
-- the live body requires `pg_get_functiondef`, not a file. The repayment is a
-- single audited restatement in a dedicated lane-C slice with a byte-diff of
-- the live body against the restated one — it is NOT this file's to pay, and
-- paying it here would put a 1,400-line rewrite inside a feature review.
--
-- Every patch NO-OPS on re-apply (each tests for its own marker first), so the
-- file is idempotent and `node tests/schema-drift.mjs` replays it byte-identically.
--
-- ── WHY THE ENGINE DOES NOT GRANT THE ITEM ──────────────────────────────────
-- The roll happens in src/core, which the Edge Function runs — so the find is a
-- CLAIM made by code the server operates but does not, in the threat model,
-- trust with a mint. The engine therefore does NOT call `addItem`, and the
-- trophy does NOT appear in `delta.items`. §2 refuses a hearthfind item id
-- inside `delta.items` outright (`bad_hearthfind`), so there is EXACTLY ONE
-- DOOR through which a trophy can be created and it is the one that writes the
-- ledger row and the broadcast row in the same transaction. "Broadcast what the
-- ledger journalled" is then true by construction rather than by discipline —
-- the Feature Slate's explicit "must NOT".
--
-- ── THE THREE CLAMPS, AND WHY TWO OF THEM DROP RATHER THAN REFUSE ───────────
--   (i)  SHAPE — malformed, unknown item, unknown source, wrong pair, more than
--        one find in a delta: HARD REFUSAL, `bad_hearthfind`. The whole apply
--        rolls back. These are states an honest engine cannot produce, so
--        proceeding would mean paying an apply we know to be wrong.
--   (ii) ≤3 FINDS PER CHARACTER PER UTC DAY — counted from player_ledger, the
--        append-only journal, under the character lock. Over the cap the FIND IS
--        DROPPED (no item, no ledger row, no broadcast) and a rejection is
--        recorded; THE REST OF THE APPLY PROCEEDS. Refusing the whole apply
--        would cost the player their entire night's accrual because they got
--        lucky a fourth time, which is the wrong failure direction. The clamp is
--        an anti-automation ceiling, not a balance number: at the shipped odds a
--        fourth find in one UTC day is not reachable by playing.
--  (iii) ONE BROADCAST PER 30 s PER CHARACTER — the world_finds insert only.
--        The trophy and the ledger row are still written; only the public line
--        is suppressed. The board is a social surface and a burst on it is
--        indistinguishable from a spam attack on every other player's screen.
--
-- ── WHY THE ODDS ARE RE-DERIVED AND NOT ACCEPTED ────────────────────────────
-- `one_in` is journalled ("the odds it beat" is the reveal's headline) and is
-- therefore a number a player will read and compare. It is looked up from
-- hr_hearthfind_sources under the lock, never taken from the delta — there is
-- no delta field for it at all. The floor (5,000) is asserted in §4 against the
-- stored rows, so an operator cannot make a find common by hand.
--
-- ── WHY world_finds STORES NO NAME ──────────────────────────────────────────
-- A display name that crossed to another player from a client value is the
-- exact shape CLAUDE.md §1 forbids. The row holds `user_id` only; the reader
-- joins `profiles` for the name at read time, so a rename is retroactive and a
-- forged name is not expressible.
--
-- ── COST, AT 100× PLAYERS ───────────────────────────────────────────────────
-- world_finds is bounded by (ii): ≤3 rows per character per day, and the real
-- rate at the shipped odds is a small number of rows per day across the whole
-- server. At 100× today's population (≈3,600 characters) the CEILING is 10,800
-- rows/day (~1.5 MB/day) and the EXPECTATION is under 20. §3 prunes to 90 days
-- and 20,000 rows. This is the opposite end of the scale from game_events (1.6M
-- rows / 229 MB from six players in four days, by journalling every kill), and
-- it is journal rule 6's permitted class: rare, aggregate-free, audit-relevant.
-- No per-tick row is added anywhere. hr_apply gains at most three catalogue
-- lookups on the vanishingly rare applies that carry the key, and ZERO on the
-- ~100% that do not (`p_delta ? 'hearthfind'` short-circuits).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Additive. The two patches are anchored inserts, so reverting is
-- `pg_get_functiondef` minus the inserted blocks; world_finds may be left in
-- place (an engine that never proposes the key never writes it). THE TWO HALVES
-- ARE SAFE IN EITHER ORDER: an engine that proposes `hearthfind` against an
-- hr_apply that does not know it gets `unknown_delta_key` — a 409 that costs a
-- player their night — so the ENGINE'S SWITCH IS THE KEY'S ACCEPTANCE, not a
-- deploy flag: accrual.js omits `delta.hearthfind` unless the envelope reports
-- the feature (see its `hearthfind_ready` note). DB-first is therefore the safe
-- order and edge-first is merely inert.
--
-- ⚠ KNOWN LIMITATION, TRACKED, NOT FIXED HERE. The 'crop' source kind has no
--   roll site: the farm harvest is settled by a Postgres RPC, not by src/core,
--   so a crop find would have to be rolled in SQL — a SECOND engine, which
--   AWAY-12 forbids. The catalogue's CHECK constraint admits only
--   ('monster','node') so a crop row cannot be added silently. Wiring crops
--   means moving the harvest roll into src/core first; it is a separate slice.
-- ============================================================================

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────────
do $mig$
declare v_apply text; v_n int;
  c_anchor_keys  constant text := $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$;
  c_anchor_codes constant text := $anc$    'version_conflict',$anc$;
  c_anchor_decl  constant text := $anc$  v_fight jsonb;$anc$;
  c_anchor_valid constant text := $anc$    if p_delta ? 'workers' then$anc$;
  c_anchor_post  constant text := $anc$    v_out := public.hr_state_of(v_uid, v_slot);$anc$;
  -- EXACTLY-ONCE, asserted for every anchor before a single byte is written. A
  -- `replace()` whose anchor is absent is a silent no-op that leaves a function
  -- half-patched and a migration reporting success; an anchor that matches
  -- TWICE inserts the block into the wrong arm as well as the right one.
  procedure_once text;
begin
  if to_regclass('public.hr_hearthfind_items') is null
     or to_regclass('public.hr_hearthfind_sources') is null then
    raise exception 'the hearthfind catalogue is absent - apply 2026-09-08-hearthfind-catalogue.generated.sql first';
  end if;
  if to_regclass('public.hr_items') is null then
    raise exception 'hr_items is absent - apply 2026-08-11-catalogue.generated.sql first';
  end if;
  if to_regclass('public.player_ledger') is null or to_regclass('public.player_state') is null then
    raise exception 'player_state/player_ledger missing - run the player-state chain first';
  end if;
  if to_regprocedure('public.hr_reject(text,jsonb)') is null
     or to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_reject / hr_record_rejection missing - apply the apply-engine chain first';
  end if;
  select pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) into v_apply;
  if v_apply is null then raise exception 'hr_apply missing - apply the player-state chain first'; end if;

  foreach procedure_once in array array[c_anchor_keys, c_anchor_codes, c_anchor_decl,
                                        c_anchor_valid, c_anchor_post] loop
    v_n := (length(v_apply) - length(replace(v_apply, procedure_once, ''))) / length(procedure_once);
    if v_n <> 1 then
      raise exception 'hr_apply: anchor % occurs % times, expected exactly 1', procedure_once, v_n;
    end if;
  end loop;

  -- The catalogue must not be vacuous. An allowlist with no rows accepts nothing
  -- and rejects everything, which reads as a control in review while the feature
  -- is silently dead. (apply-engine.sql:110, the same reasoning.)
  if (select count(*) from public.hr_hearthfind_sources) = 0
     or (select count(*) from public.hr_hearthfind_items) = 0 then
    raise exception 'the hearthfind catalogue is empty - the allowlist would be vacuous';
  end if;

  -- §1b widens player_ledger_kind_check by UNION, not by restatement. Measured
  -- on the replayed chain: the live constraint already admits 24 kinds, nine of
  -- which (trait, hero_slot, dungeon, daily, collection, renown, bounty, rally,
  -- bank) were added by later migrations. A hardcoded list here would silently
  -- NARROW it and break whichever feature owns the dropped kind - which is
  -- exactly what the first revision of this file did, and what this check
  -- caught on the PGlite replay. So §1b READS the existing set and adds one
  -- element to it; this precondition only proves the set is READABLE.
  select count(*) into v_n from pg_constraint
   where conname = 'player_ledger_kind_check' and conrelid = 'public.player_ledger'::regclass;
  if v_n <> 1 then
    raise exception 'player_ledger_kind_check is missing or ambiguous (% found) - §1b cannot widen what it cannot read', v_n;
  end if;
end $mig$;

-- ── 1. world_finds — THE PUBLIC BOARD ────────────────────────────────────────
-- PUBLIC READ, RPC-INSERT-ONLY. There is NO insert/update/delete policy and no
-- client write grant, so the ONLY writer is a SECURITY DEFINER function running
-- as the owner (hr_apply). A player cannot post a find they did not make, edit
-- one, or delete someone else's — not because a policy says so but because no
-- policy grants it at all, which is the stronger form.
--
-- `one_in` is stored so the board can say "1 in 30,000" without re-reading a
-- catalogue that a future retune will change: a find's odds are a FACT ABOUT
-- THAT MOMENT and must not silently restate themselves when the table is
-- rebalanced. Same reason `item_id` is stored rather than joined at read time.
create table if not exists public.world_finds (
  id          bigserial primary key,
  user_id     uuid        not null,
  slot        int         not null,
  item_id     text        not null,
  source_kind text        not null check (source_kind in ('monster','node')),
  source_id   text        not null,
  one_in      bigint      not null check (one_in > 0),
  found_at    timestamptz not null default now()
);
-- The board's own read pattern (newest first) and the 30-second broadcast
-- clamp's lookup (this character, newest first). Two indexes, both narrow.
create index if not exists world_finds_at_idx   on public.world_finds (found_at desc);
create index if not exists world_finds_char_idx on public.world_finds (user_id, slot, found_at desc);

alter table public.world_finds enable row level security;

-- READ: everyone signed in, plus anon (the board is the shareable surface — the
-- whole point of the feature is that it is seen). No name is stored, so nothing
-- personal crosses; the reader joins profiles for the display name.
drop policy if exists world_finds_read on public.world_finds;
create policy world_finds_read on public.world_finds for select to anon, authenticated using (true);

-- WRITE: revoked, explicitly and BEFORE anything is granted (§3 of the house
-- rules). SELECT is the only privilege any client role holds.
--
-- ⚠ service_role IS IN THE REVOKE LIST. Supabase's default ACL hands every new
--   public table to anon, authenticated AND service_role; revoking three of the
--   four leaves the privilege intact on the fourth, and service_role bypasses
--   RLS entirely -- so a leaked service key would be a direct INSERT into the
--   public board: a forged world-record find with no ledger row and no grant
--   behind it. The board is written by hr_apply (SECURITY DEFINER, owner) or by
--   nothing at all. Same idiom, same reason, as
--   2026-08-11-catalogue.generated.sql:1544-1545.
do $$
begin
  revoke all on public.world_finds from public, anon, authenticated, service_role;
  grant select on public.world_finds to anon, authenticated;
  -- The sequence is NOT granted: a client with insert revoked has no use for it,
  -- and a granted sequence is a free row-count oracle.
  revoke all on sequence public.world_finds_id_seq
    from public, anon, authenticated, service_role;
end $$;

-- ── 1a2. THE REVEAL INDEX ────────────────────────────────────────────────────
-- A PARTIAL index over the hearthfind ledger rows ONLY, so hr_state_of's
-- projection below (§1c) is a single index probe rather than a scan of the
-- character's day.
--
-- WHY IT MUST BE PARTIAL. player_ledger_user_idx is (user_id, slot, at desc)
-- with no kind, so "the latest hearthfind for this character" would walk every
-- ledger row the character wrote today until it found one -- on the HOTTEST
-- read in the system (hr_state_of runs on every load and every apply, up to 240
-- applies/min/player at the rate limit). The partial index contains at most 3
-- rows per character per UTC day by the clamp at (i), i.e. it is smaller than
-- the pruned world_finds board, and it costs one entry on the vanishingly rare
-- insert that journals a find and NOTHING on every other ledger write.
create index if not exists player_ledger_hearthfind_idx
  on public.player_ledger (user_id, slot, at desc)
  where kind = 'hearthfind';

-- ── 1a3. THE ORDINAL INDEX ───────────────────────────────────────────────────
-- "The 4th ever found in Hearthrise" is a GLOBAL count over one item id, and it
-- is counted from the journal rather than from world_finds because the broadcast
-- clamp suppresses public rows: a world_finds count would drift below the truth
-- and the chat line would re-use an ordinal. PARTIAL on kind='hearthfind', so
-- the whole index holds the realm's entire find history -- at the ruled cadence
-- (~2 finds per realm-week) that is single-digit rows per week, and it costs one
-- entry on the vanishingly rare insert that journals a find and nothing on any
-- other ledger write. It is read ONCE per find, never per tick.
create index if not exists player_ledger_hearthfind_item_idx
  on public.player_ledger (item_id)
  where kind = 'hearthfind';

-- ── 1d. player_cosmetics — SERVER-OWNED COSMETIC UNLOCKS ─────────────────────
-- The Designer's ruling §6: a hearthfind "pays a moment and nothing else" --
-- and the moment is durable. It pays a permanent collection-log row (derivable
-- from player_ledger + world_finds, no new storage), an equippable TITLE and a
-- homestead PLINTH. The last two are STATE, so they are SERVER state.
--
-- ⚠ WHY THIS IS A TABLE AND NOT RESIDUE. RESIDUE_FIELDS (src/net/client-state.js)
--   is an allowlist for client-only PREFERENCES. A title a player earned by
--   beating 1-in-22,750 is exactly the thing CLAUDE.md §6 says must live in a
--   server row and be projected: "anything a player would miss after a reload
--   must live in a server column/row". A residue title would also be forgeable
--   by hand-editing local state, which turns the rarest achievement in the game
--   into a text field.
--
-- ⚠ WHY IT CANNOT BECOME POWER. There is NO numeric column here, deliberately.
--   A cosmetic table with a `bonus` or `tier` column is one migration away from
--   being a stat, and the anti-P2W property (ruling §7) would then depend on a
--   convention instead of a shape. `kind` is constrained to the two cosmetic
--   families; adding a third is a migration a reviewer sees.
--
-- APPEND-ONLY IN PRACTICE: hr_apply INSERTs ... ON CONFLICT DO NOTHING and
-- nothing in this file ever updates or deletes a row, so an unlock is
-- idempotent (a replayed apply cannot double-grant) and permanent.
create table if not exists public.player_cosmetics (
  user_id    uuid        not null,
  slot       int         not null,
  kind       text        not null check (kind in ('title','plinth')),
  code       text        not null,
  name       text        not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, slot, kind, code)
);

alter table public.player_cosmetics enable row level security;

-- READ-OWN ONLY, and even that is a courtesy: the value reaches the client
-- through hr_state_of, which is the envelope the client applies. WRITE is
-- revoked BEFORE anything is granted, service_role INCLUDED -- it bypasses RLS,
-- so a leaked service key would otherwise be able to hand itself Wonderkeeper
-- with no find and no ledger row behind it.
do $$
begin
  revoke all on public.player_cosmetics from public, anon, authenticated, service_role;
  grant select on public.player_cosmetics to authenticated;
end $$;
drop policy if exists player_cosmetics_read_own on public.player_cosmetics;
create policy player_cosmetics_read_own on public.player_cosmetics
  for select to authenticated using (user_id = auth.uid());

-- ── 1b. THE LEDGER KIND ──────────────────────────────────────────────────────
-- journal kind 'hearthfind' must be a legal player_ledger.kind or the insert in
-- §2 violates player_ledger_kind_check and the WHOLE apply comes back bad_delta
-- (23514) — i.e. the luckiest moment in the game would cost the player their
-- night. The table constraint mirrors hr_apply's c_ledger_kinds; both gain
-- 'hearthfind'. §0 has already proven the live list holds nothing this drops.
do $$
declare v_kinds text[]; v_sql text;
begin
  -- Read the CURRENT admitted set out of the live constraint definition, add
  -- 'hearthfind', re-add. Widening by union is the only shape that is safe
  -- against a constraint some other migration has already extended - and it is
  -- idempotent, because 'hearthfind' is added to a set.
  select array(
    select distinct btrim(k, '''')
      from unnest(regexp_split_to_array(
             regexp_replace(pg_get_constraintdef(c.oid), '::text|ARRAY|[()\[\]]|[[:space:]]|CHECK|kind|=|ANY|IN', '', 'g'),
             ',')) as k
     where btrim(k, '''') <> '')
    into v_kinds
    from pg_constraint c
   where c.conname = 'player_ledger_kind_check'
     and c.conrelid = 'public.player_ledger'::regclass;
  if v_kinds is null or array_length(v_kinds, 1) < 13 then
    raise exception 'could not read player_ledger_kind_check (% kinds parsed) - refusing to replace a constraint I cannot reproduce', coalesce(array_length(v_kinds,1), 0);
  end if;
  if not ('hearthfind' = any (v_kinds)) then v_kinds := array_append(v_kinds, 'hearthfind'); end if;
  alter table public.player_ledger drop constraint player_ledger_kind_check;
  v_sql := 'alter table public.player_ledger add constraint player_ledger_kind_check check (kind in ('
           || (select string_agg(quote_literal(k), ',' order by k) from unnest(v_kinds) as k) || '))';
  execute v_sql;
end $$;

-- ── 1c. hr_state_of — THE SELF-CONFIGURING SWITCH (programmatic, additive) ───
-- One boolean, always true once this file has run. It is not a feature flag and
-- nothing can turn it off: it exists so the ENGINE can tell whether the database
-- it is talking to allowlists the `hearthfind` delta key.
--
-- WHY IT MATTERS. An edge deployed BEFORE this migration that proposed the key
-- would get `unknown_delta_key` - a 409 that rolls back the WHOLE settle and
-- costs the player their night, on the one apply they most want to keep. With
-- the switch the engine simply omits the key on an old database and the accrual
-- is byte-for-byte its pre-Hearthfind self. The two halves are therefore safe in
-- EITHER order, and the switch is the envelope rather than a deploy flag - the
-- recovering_until idiom, for the same reason.
--
-- PROGRAMMATIC for the reason §2 is: hr_state_of's live body carries rested_xp,
-- bank, client_state, combat_style, dungeon_scrip, recovering_until and the
-- death counters, every one applied on top of the last static link. A restated
-- create-or-replace here would erase all of them.
do $mig$
declare v_def text; v_n int;
  c_anchor constant text := $anc$      'fight', v_st.fight,$anc$;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, 'hearthfind_ready') > 0 then
    raise notice 'hr_state_of already projects hearthfind_ready - skipping';
  else
    v_n := (length(v_def) - length(replace(v_def, c_anchor, ''))) / length(c_anchor);
    if v_n <> 1 then
      raise exception 'hr_state_of: the projection anchor occurs % times, expected exactly 1', v_n;
    end if;
    v_def := replace(v_def, c_anchor,
      $anc$      -- THE HEARTHFIND's self-configuring switch. Always true once
      -- 2026-09-08-hearthfind.sql has run; read by hr-accrue to decide whether
      -- to propose delta.hearthfind at all. Not a feature flag.
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
      'fight', v_st.fight,$anc$);
    execute v_def;
  end if;
end $mig$;

-- ── 2. hr_apply — ALLOWLIST + RE-DERIVE + GRANT + JOURNAL + BROADCAST ────────
-- PROGRAMMATIC. See RESTATEMENT-DEBT-ACK in the header.
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);
  if strpos(v_def, 'hearthfind') > 0 then
    raise notice 'hr_apply already handles hearthfind - skipping';
  else
    -- 2a. THE ALLOWLIST. Inserted at the HEAD of the array, never appended to
    --     its terminator: the terminator is whatever the most recent
    --     programmatic patcher left there, and an anchor that moves with every
    --     future slice is one that eventually matches nothing in silence.
    v_def := replace(v_def,
      $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',$anc$,
      $anc$    'gold','gems','hp','items','xp','equip','activity','accrued_to',
    -- THE HEARTHFIND (Feature Slate §2). An OBJECT: {item, source_kind,
    -- source_id, dropped?}. AT MOST ONE PER APPLY; `dropped` is the COUNT the
    -- engine had to throw away in the same span and grants nothing at all - it
    -- exists so a discarded find is journalled instead of vanishing. Everything
    -- else about the find - the
    -- odds, the trophy's legitimacy, the pairing, the day count, the broadcast
    -- window and the instant - is re-derived server-side at (4a-h)/(4z-h).
    -- There is no quantity field: a find is exactly one trophy, always.
    'hearthfind',$anc$);

    -- 2b. THE RELEASE CODE. `bad_hearthfind` is a SHAPE refusal whose answer
    --     depends on nothing but the delta and the catalogue, so it takes the
    --     bad_fight / bad_recovering posture: releasing the idempotency key is
    --     harmless (the block rolled back) and withholding it would brick a key
    --     for up to 25 hours on an engine bug a redeploy fixes.
    v_def := replace(v_def,
      $anc$    'version_conflict',$anc$,
      $anc$    'version_conflict', 'bad_hearthfind',$anc$);

    -- 2c. THE DECLARE.
    v_def := replace(v_def,
      $anc$  v_fight jsonb;$anc$,
      $anc$  -- THE HEARTHFIND. v_hf_* are all SERVER-DERIVED: the only values that
  -- come from the delta are the item id and the (kind,id) pair, and each of
  -- those is used ONLY as a lookup key against a generated catalogue.
  v_hf        jsonb;
  v_hf_item   text;
  v_hf_kind   text;
  v_hf_src    text;
  v_hf_one    bigint;
  v_hf_today  bigint;
  v_hf_last   timestamptz;
  v_hf_have   bigint;
  v_hf_out    jsonb;
  -- THE BAND, IN THE UNIT IT IS RULED IN. Read from the catalogue beside the
  -- odds so the runtime check and the migration-time self-check assert the same
  -- column, never two numbers that can drift.
  v_hf_hours     numeric;
  -- THE COSMETICS, ALL READ FROM THE CATALOGUE. No string literal for a title
  -- code or the plinth appears anywhere in this body: hand-typing them here
  -- would be the src/main.js unifyObject data double-copy, with the copy on the
  -- side that GRANTS.
  v_hf_title     text;
  v_hf_titlename text;
  v_hf_set       int;      -- distinct trophies this character has found, after this one
  v_hf_setneed   int;      -- how many distinct trophies the full set is
  v_hf_settitle  text;
  v_hf_setname   text;
  v_hf_plinth    text;
  v_hf_cosm      jsonb;    -- the cosmetics UNLOCKED BY THIS FIND, for the receipt
  -- THE GLOBAL ORDINAL - "the 4th ever found in Hearthrise". Counted across ALL
  -- characters from the append-only journal under this character's lock. It is
  -- NOT counted from world_finds: the broadcast clamp suppresses public rows, so
  -- a world_finds count would drift below the truth and the chat line would
  -- claim an ordinal that had already been used.
  v_hf_nth    bigint;
  -- THE DISCARD COUNT. Advisory only: it is journalled and never read by any
  -- arithmetic that grants, so a forged value costs the player nothing and buys
  -- the forger nothing but a rejection row against their own character.
  v_hf_drop   int;
  -- AT MOST ONE FIND PER APPLY. The engine's own roll cannot produce two in one
  -- action, and a window that legitimately contained two is settled as two
  -- applies. Accepting an array would make the daily clamp a per-array clamp.
  c_max_hf_per_apply constant int := 1;
  -- THREE PER CHARACTER PER UTC DAY (Feature Slate §2). An anti-automation
  -- ceiling, not a balance number: at 1-in-6,000 to 1-in-40,000 a fourth find in
  -- one day is not reachable by playing.
  c_max_hf_per_day   constant int := 3;
  -- ONE BROADCAST PER 30 s PER CHARACTER (Designer ruling 2026-09-08 §9; the
  -- 60 s form was REJECTED). Suppresses the world_finds ROW ONLY; the trophy,
  -- the ledger row, the cosmetic unlocks and the receipt are unaffected, so a
  -- suppressed broadcast never costs value -- only a duplicate chat line. At the
  -- ruled cadence (~2 finds per realm-week) the clamp exists solely to stop a
  -- pathological retry storm from spamming global chat; halving it costs
  -- nothing and keeps a genuine back-to-back double find visible.
  c_hf_broadcast     constant interval := interval '30 seconds';
  v_fight jsonb;$anc$);

    -- 2d. THE VALIDATION BLOCK (4a-h), inserted before the worker block, i.e.
    --     INSIDE the protected block and under the character row lock. Server
    --     authority §1: the Edge Function decides WHAT should happen, Postgres
    --     decides WHETHER IT MAY. Nothing below is taken on the engine's word.
    v_def := replace(v_def,
      $anc$    if p_delta ? 'workers' then$anc$,
      $anc$    -- (4a-h) THE HEARTHFIND. Shape first, then the catalogue, then the pair.
    if p_delta ? 'hearthfind' then
      v_hf := p_delta->'hearthfind';
      if jsonb_typeof(v_hf) <> 'object' then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'not an object', 'type', jsonb_typeof(v_hf)));
      end if;
      -- Unknown sub-keys are an error, not a shrug - the same rule the top-level
      -- delta follows. A field this arm does not implement must never look like
      -- it worked (there is deliberately no `one_in`, no `qty` and no `at`:
      -- the odds come from the catalogue and the instant comes from now()).
      if exists (select 1 from jsonb_object_keys(v_hf) as t(hk)
                  where hk <> all (array['item','source_kind','source_id','dropped'])) then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'unknown key',
            'keys', (select jsonb_agg(hk) from jsonb_object_keys(v_hf) as t(hk)
                      where hk <> all (array['item','source_kind','source_id','dropped']))));
      end if;
      -- `dropped` - THE DISCARD COUNT, VALIDATED LIKE ANY OTHER CLIENT NUMBER
      -- even though it can buy nothing. A second find inside ONE settled span is
      -- thrown away by the engine (hr_apply takes one find per apply and
      -- re-derives it); before this key the discard was SILENT, which is exactly
      -- the shape of a bug nobody can see. It is journalled at (4z-h) as a
      -- rejection row - aggregated per character/code/day by
      -- hr_record_rejection, never one row per event (the game_events lesson).
      if v_hf ? 'dropped' then
        if jsonb_typeof(v_hf->'dropped') <> 'number'
           or (v_hf->>'dropped') !~ '^[0-9]+$'
           or (v_hf->>'dropped')::bigint > 99 then
          perform public.hr_reject('bad_hearthfind',
            jsonb_build_object('why', 'dropped must be a non-negative integer <= 99',
                               'dropped', v_hf->'dropped'));
        end if;
        v_hf_drop := (v_hf->>'dropped')::int;
      else
        v_hf_drop := 0;
      end if;
      v_hf_item := v_hf->>'item';
      v_hf_kind := v_hf->>'source_kind';
      v_hf_src  := v_hf->>'source_id';
      if v_hf_item is null or v_hf_kind is null or v_hf_src is null then
        perform public.hr_reject('bad_hearthfind', jsonb_build_object('why', 'missing field'));
      end if;
      -- Bounded before they are used as lookup keys, so a megabyte string can
      -- never reach an index scan or a rejection payload.
      if length(v_hf_item) > 64 or length(v_hf_kind) > 16 or length(v_hf_src) > 64 then
        perform public.hr_reject('bad_hearthfind', jsonb_build_object('why', 'field too long'));
      end if;
      -- THE PAIR, THE TROPHY AND THE ODDS, ALL IN ONE LOOKUP. A source that does
      -- not exist, a trophy that is not a trophy, and a source paying the WRONG
      -- trophy are one refusal, because they are one question: is this find a
      -- thing the catalogue says can happen?
      select s.one_in, s.expected_hours, i.title_code, i.title_name
        into v_hf_one, v_hf_hours, v_hf_title, v_hf_titlename
        from public.hr_hearthfind_sources s
        join public.hr_hearthfind_items  i on i.item_id = s.item_id
       where s.source_kind = v_hf_kind and s.source_id = v_hf_src and s.item_id = v_hf_item;
      if v_hf_one is null then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'no such source/item pair',
                             'source_kind', v_hf_kind, 'source_id', v_hf_src, 'item', v_hf_item));
      end if;
      -- THE BAND, re-asserted at RUNTIME and not only at migration time, and
      -- STATED IN HOURS because that is the unit the Designer ruled in: oneIn is
      -- per roll and roll rates span >12x across the shipped sources, so a
      -- per-roll floor said nothing comparable (it is what let the staged goblin
      -- row become the best hearthfind farm in the game). §4(a) proves the
      -- stored rows are in band today; this proves it for THE ROW BEING PAID, so
      -- an out-of-band row that somehow reached the table pays nothing instead
      -- of paying a common trophy.
      if v_hf_hours is null or v_hf_hours < 100 or v_hf_hours > 400 then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'expected_hours outside the 100-400 band',
                             'expected_hours', v_hf_hours, 'one_in', v_hf_one));
      end if;
    end if;

    -- (4a-h2) THE ONE DOOR. A hearthfind trophy may NOT be minted through the
    -- ordinary `items` delta - not by this engine, not by any future one. The
    -- hearthfind arm is the only path that creates one, and it is the path that
    -- journals and broadcasts, so "broadcast what the ledger journalled" is true
    -- by construction. (A NEGATIVE items delta is untouched: a player may still
    -- spend or lose a trophy through whatever consumes it later.)
    if p_delta ? 'items' and jsonb_typeof(p_delta->'items') = 'object' then
      if exists (
        select 1 from jsonb_each_text(p_delta->'items') as t(ik, iv)
         where coalesce(nullif(iv,'')::bigint, 0) > 0
           and exists (select 1 from public.hr_hearthfind_items h where h.item_id = t.ik)) then
        perform public.hr_reject('bad_hearthfind',
          jsonb_build_object('why', 'a hearthfind trophy cannot be minted through items'));
      end if;
    end if;

    if p_delta ? 'workers' then$anc$);

    -- 2e. THE GRANT + THE JOURNAL + THE BROADCAST (4z-h). AFTER the single
    --     journal row hr_apply always writes, still inside the protected block
    --     and still under the character lock, so the day count below cannot race
    --     a concurrent apply for the same character.
    v_def := replace(v_def,
      $anc$    v_out := public.hr_state_of(v_uid, v_slot);$anc$,
      $anc$    if p_delta ? 'hearthfind' then
      -- (0) THE DISCARD, JOURNALLED. If the engine rolled more than one find in
      --     the span it settled, it proposes the first and reports the rest
      --     here. Recorded BEFORE the clamp and unconditionally, because the
      --     question "did a player ever lose a find to the one-per-apply rule?"
      --     must be answerable from the database rather than from an argument
      --     about probability. One aggregated row per character/code/day.
      if coalesce(v_hf_drop, 0) > 0 then
        perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'hearthfind_span_discard',
          jsonb_build_object('dropped', v_hf_drop, 'kept_item', v_hf_item,
                             'kept_source_kind', v_hf_kind, 'kept_source_id', v_hf_src));
      end if;
      -- (i) THE DAILY CLAMP, counted from the append-only journal - the only
      --     durable record - under the character lock. NOTE `now() at time zone
      --     'utc'`: the UTC day, matching the accrual engine's day key, never
      --     the server's local zone and never a client's.
      select count(*) into v_hf_today
        from public.player_ledger
       where user_id = v_uid and slot = v_slot and kind = 'hearthfind'
         and at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
      if v_hf_today >= c_max_hf_per_day then
        -- DROPPED, NOT REFUSED. Refusing the apply would cost the player the
        -- whole window's accrual because they got lucky a fourth time. Recorded
        -- so a real ceiling breach is visible tomorrow, not just for a minute.
        perform public.hr_record_rejection(v_uid, v_slot, 'apply', 'hearthfind_daily_cap',
          jsonb_build_object('today', v_hf_today, 'limit', c_max_hf_per_day,
                             'item', v_hf_item, 'source_kind', v_hf_kind, 'source_id', v_hf_src));
      else
        -- (ii) THE TROPHY. One unit, always: there is no quantity anywhere in
        --      this arm to inflate. Same upsert shape as the items delta.
        select qty into v_hf_have from public.player_inventory
          where user_id = v_uid and slot = v_slot and item_id = v_hf_item for update;
        insert into public.player_inventory as pi (user_id, slot, item_id, qty)
          values (v_uid, v_slot, v_hf_item, coalesce(v_hf_have, 0) + 1)
          on conflict (user_id, slot, item_id) do update set qty = excluded.qty;

        -- (ii-b) THE GLOBAL ORDINAL, and it is computed BEFORE the journal row
        --        is written so that "Nth ever found" counts the finds that came
        --        BEFORE this one, plus one. Counting after the insert would make
        --        the same expression mean something different depending on
        --        statement order - the kind of off-by-one a player screenshots.
        --        One index probe on player_ledger_hearthfind_item_idx; the whole
        --        index holds a handful of rows per realm-week.
        select count(*) + 1 into v_hf_nth
          from public.player_ledger
         where kind = 'hearthfind' and item_id = v_hf_item;

        -- (iii) THE JOURNAL. qty_in = 1 so the trophy enters the daily item
        --       budget like any other granted unit; gold_in/xp_in are ZERO and
        --       stay zero, because a find moves no gold and no XP - which is
        --       what tests/hearthfind-mint-guard.mjs asserts.
        insert into public.player_ledger
          (user_id, slot, kind, intent, item_id, qty, gold, gold_in, xp_in, qty_in, meta)
        values
          (v_uid, v_slot, 'hearthfind', 'hearthfind', v_hf_item, 1, 0, 0, 0, 1,
           jsonb_build_object('item', v_hf_item, 'source_kind', v_hf_kind,
                              'source_id', v_hf_src, 'one_in', v_hf_one,
                              'expected_hours', v_hf_hours,
                              'nth_ever', v_hf_nth,
                              'nth_today', v_hf_today + 1));

        -- (iv) THE BROADCAST, at most one row per 30 s per character. The
        --      trophy and the journal above are already written; only the public
        --      line is suppressed, so a suppressed broadcast never costs value.
        select max(found_at) into v_hf_last from public.world_finds
         where user_id = v_uid and slot = v_slot;
        if v_hf_last is null or v_hf_last < now() - c_hf_broadcast then
          insert into public.world_finds (user_id, slot, item_id, source_kind, source_id, one_in)
            values (v_uid, v_slot, v_hf_item, v_hf_kind, v_hf_src, v_hf_one);
        end if;

        -- (iv-b) THE COSMETICS. THE ONLY THING A FIND PAYS BESIDES THE TROPHY,
        --        and they are cosmetic by construction: player_cosmetics has no
        --        numeric column, nothing joins it to a rate, and no RPC reads it
        --        to decide an outcome. Ruling §6 - "pays a moment and nothing
        --        else": no gold, no XP, no renown, no gems, no stat.
        --
        --        WRITTEN HERE AND ONLY HERE, under the character lock, from the
        --        catalogue lookup above - never from the delta. A duplicate find
        --        re-broadcasts and pays nothing, which is exactly what the
        --        ON CONFLICT DO NOTHING expresses: the unlock is idempotent, so
        --        a replayed apply cannot double-grant and a second Emberheart
        --        cannot re-unlock Emberkeeper.
        select value into v_hf_plinth   from public.hr_hearthfind_meta where key = 'plinth_code';
        select value into v_hf_settitle from public.hr_hearthfind_meta where key = 'set_title_code';
        select value into v_hf_setname  from public.hr_hearthfind_meta where key = 'set_title_name';
        v_hf_cosm := '[]'::jsonb;

        insert into public.player_cosmetics (user_id, slot, kind, code, name)
          values (v_uid, v_slot, 'title', v_hf_title, v_hf_titlename)
          on conflict (user_id, slot, kind, code) do nothing;
        if found then
          v_hf_cosm := v_hf_cosm || jsonb_build_object('kind','title','code',v_hf_title,'name',v_hf_titlename);
        end if;

        -- THE PLINTH, on the character's FIRST find of any trophy. A flag, not a
        -- count: it unlocks the homestead display, and what stands on it is
        -- derived from the trophies the character holds.
        insert into public.player_cosmetics (user_id, slot, kind, code, name)
          values (v_uid, v_slot, 'plinth', v_hf_plinth, 'Hearth Plinth')
          on conflict (user_id, slot, kind, code) do nothing;
        if found then
          v_hf_cosm := v_hf_cosm || jsonb_build_object('kind','plinth','code',v_hf_plinth,'name','Hearth Plinth');
        end if;

        -- THE FULL SET. Counted as DISTINCT trophies from the append-only
        -- journal (including the row just written) against the catalogue's own
        -- trophy count - never a stored counter, which would be a second copy of
        -- a fact the ledger already holds and would drift on any prune.
        select count(distinct item_id) into v_hf_set
          from public.player_ledger
         where user_id = v_uid and slot = v_slot and kind = 'hearthfind';
        select count(*) into v_hf_setneed from public.hr_hearthfind_items;
        if v_hf_set >= v_hf_setneed then
          insert into public.player_cosmetics (user_id, slot, kind, code, name)
            values (v_uid, v_slot, 'title', v_hf_settitle, v_hf_setname)
            on conflict (user_id, slot, kind, code) do nothing;
          if found then
            v_hf_cosm := v_hf_cosm || jsonb_build_object('kind','title','code',v_hf_settitle,'name',v_hf_setname,'set',true);
          end if;
        end if;

        -- (v) THE RECEIPT. Attached to the apply's return value below, so an
        --     AWAY find comes back on the settle receipt and the client can
        --     reveal it on return without a second round trip. Server-authored
        --     in full: every field here was looked up or derived above.
        v_hf_out := jsonb_build_object(
          'item', v_hf_item, 'source_kind', v_hf_kind, 'source_id', v_hf_src,
          'one_in', v_hf_one, 'expected_hours', v_hf_hours,
          'nth_ever', v_hf_nth, 'nth_today', v_hf_today + 1,
          -- WHAT THIS FIND UNLOCKED, so the reveal can say it without a second
          -- round trip and without the client deciding what a find is worth.
          'unlocked', v_hf_cosm,
          'set_complete', (v_hf_set >= v_hf_setneed),
          'broadcast', (v_hf_last is null or v_hf_last < now() - c_hf_broadcast),
          'at', now());
      end if;
    end if;

    v_out := public.hr_state_of(v_uid, v_slot);
    if v_hf_out is not null then
      v_out := jsonb_set(v_out, '{hearthfind}', v_hf_out);
    end if;$anc$);

    execute v_def;
  end if;
end $mig$;

-- ── 3. hr_world_finds_prune — THE RETENTION VALVE ────────────────────────────
-- Batched for the reason hr_ledger_prune is: an unbounded delete on a table left
-- alone for a month competes with live traffic. Owner-only; no client grant.
create or replace function public.hr_world_finds_prune(
  p_older interval default interval '90 days',
  p_keep  int      default 20000,
  p_limit int      default 5000)
returns int language plpgsql volatile security definer
  set search_path = public, pg_temp as $fn$
declare v_n int; v_cut bigint;
begin
  select id into v_cut from public.world_finds order by id desc offset greatest(p_keep, 0) limit 1;
  with doomed as (
    select id from public.world_finds
      where found_at < now() - p_older or (v_cut is not null and id <= v_cut)
      order by id limit greatest(p_limit, 0))
  delete from public.world_finds w using doomed d where w.id = d.id;
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;
revoke all on function public.hr_world_finds_prune(interval, int, int) from public, anon, authenticated;

-- ── 4. SELF-CHECK — properties PROVEN BY EXECUTING SQL, not by markers ───────
do $chk$
declare v_n bigint; v_apply text; v_min bigint; v_def text;
  v_hours_lo numeric; v_hours_hi numeric;
begin
  v_apply := pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure);

  -- (a) THE BAND, IN EXPECTED HOURS, against the STORED rows (Designer ruling
  --     2026-09-08 §4). The headline property of the whole feature, and the
  --     ruling's correction to the first cut of this file: a per-roll oneIn
  --     floor is not a rarity statement, because roll rates span more than 12x
  --     across the shipped sources -- 1-in-40,000 on a starter mob is one find
  --     per 11 hours, the same number on a Yew Tree is a lifetime. So EVERY
  --     source must sit between 100 and 400 expected hours AT ITS OWN ACTION
  --     RATE, and that is asserted here by executing SQL against the derived
  --     `expected_hours` column, never by reading a marker.
  select min(expected_hours) into v_hours_lo from public.hr_hearthfind_sources;
  select max(expected_hours) into v_hours_hi from public.hr_hearthfind_sources;
  if v_hours_lo is null or v_hours_lo < 100 or v_hours_hi > 400 then
    raise exception 'hearthfind self-check (a): expected hours span % .. % - the band is 100-400',
      v_hours_lo, v_hours_hi;
  end if;
  select count(*) into v_n from public.hr_hearthfind_sources
   where expected_hours is null or one_in <= 0;
  if v_n > 0 then
    raise exception 'hearthfind self-check (a2): % sources carry no usable odds', v_n;
  end if;
  select min(one_in) into v_min from public.hr_hearthfind_sources;

  -- (a3) COMBAT SOURCES ARE BOSSES ONLY (ruling §2). Proven against the
  --      catalogue, because the defect it prevents is precise and was live in
  --      the staged file: a `goblin` row made the STARTER MOB the best
  --      hearthfind farm in the game. Any monster source must be a boss, and
  --      the bosses are named by the same monster catalogue the bounty RPC uses.
  if to_regclass('public.hr_bounty_monsters') is not null then
    select count(*) into v_n from public.hr_hearthfind_sources s
     where s.source_kind = 'monster'
       and not exists (select 1 from public.hr_bounty_monsters b where b.monster_id = s.source_id);
    if v_n > 0 then
      raise exception 'hearthfind self-check (a3): % monster sources are not in the monster catalogue', v_n;
    end if;
  end if;

  -- (b) THE ALLOWLIST IS LIVE. Without this key every settle carrying a find
  --     would 409 unknown_delta_key and cost the player their night.
  if strpos(v_apply, $x$'hearthfind',$x$) = 0 then
    raise exception 'hearthfind self-check (b): c_delta_keys does not carry hearthfind';
  end if;
  if strpos(v_apply, 'bad_hearthfind') = 0 then
    raise exception 'hearthfind self-check (c): the bad_hearthfind release code is missing';
  end if;

  -- (d) THE CLAMPS ARE PRESENT IN THE BODY, each by the expression that
  --     implements it rather than by a comment.
  if strpos(v_apply, 'c_max_hf_per_day') = 0 or strpos(v_apply, 'v_hf_today >= c_max_hf_per_day') = 0 then
    raise exception 'hearthfind self-check (d): the 3-per-UTC-day clamp is missing';
  end if;
  if strpos(v_apply, $x$interval '30 seconds'$x$) = 0 or strpos(v_apply, 'now() - c_hf_broadcast') = 0 then
    raise exception 'hearthfind self-check (e): the 30-second broadcast clamp is missing';
  end if;
  -- The RUNTIME band check, by the expression that implements it. §4(a) proves
  -- the rows are in band at APPLY time; this proves hr_apply re-checks the row
  -- it is about to pay, which is the property that survives a later retune.
  if strpos(v_apply, 'expected_hours outside the 100-400 band') = 0 then
    raise exception 'hearthfind self-check (e2): hr_apply does not re-assert the hours band at runtime';
  end if;
  if strpos(v_apply, 'a hearthfind trophy cannot be minted through items') = 0 then
    raise exception 'hearthfind self-check (f): the one-door guard is missing - items could mint a trophy';
  end if;
  -- The odds must be READ, never accepted: there is no `one_in` sub-key. The
  -- allowlist is item/source_kind/source_id/dropped and NOTHING else; `dropped`
  -- is journalled, never granted, and is checked separately below.
  if strpos(v_apply, $x$array['item','source_kind','source_id','dropped']$x$) = 0 then
    raise exception 'hearthfind self-check (g): the sub-key allowlist is missing';
  end if;
  -- (c2) THE REVEAL SURVIVES A RETRY. hr_state_of must project the day's latest
  --      find, and the partial index that makes that projection cheap must
  --      exist -- an unindexed projection on the hottest read is a performance
  --      regression disguised as a feature.
  if strpos(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure),
            'hearthfind_last') = 0 then
    raise exception 'hearthfind self-check (c2): hr_state_of does not project hearthfind_last';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public'
                  and tablename = 'player_ledger'
                  and indexname = 'player_ledger_hearthfind_idx') then
    raise exception 'hearthfind self-check (c2): player_ledger_hearthfind_idx is missing';
  end if;

  -- (g2) A DROPPED SECOND FIND IS JOURNALLED, NOT VANISHED. hr_apply grants one
  --      find per apply; if the engine rolled two in one settled span the
  --      surplus is reported as `dropped` and recorded through
  --      hr_record_rejection (aggregated per character/code/day, never one row
  --      per event). Without this row the loss is invisible and the question
  --      "has anyone ever lost a find?" is unanswerable from the database.
  if strpos(v_apply, 'hearthfind_span_discard') = 0
     or strpos(v_apply, 'dropped must be a non-negative integer') = 0 then
    raise exception 'hearthfind self-check (g2): the dropped-find journal or its validation is missing';
  end if;

  -- (h) NO CLIENT WRITE PATH TO world_finds. The load-bearing property of the
  --     public board: it is readable by everyone and writable by nobody.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'world_finds' and cmd in ('INSERT','UPDATE','DELETE','ALL');
  if v_n > 0 then
    raise exception 'hearthfind self-check (h): % write policies on world_finds', v_n;
  end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'world_finds'
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES');
  if v_n > 0 then
    raise exception 'hearthfind self-check (i): % client|service write grants on world_finds', v_n;
  end if;
  select count(*) into v_n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'world_finds' and c.relrowsecurity;
  if v_n <> 1 then raise exception 'hearthfind self-check (j): RLS is not enabled on world_finds'; end if;
  -- …but it MUST be readable, or the board is invisible and the feature is a
  -- private ledger row. An absent read grant is as much a bug as a write grant.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'world_finds'
     and grantee = 'authenticated' and privilege_type = 'SELECT';
  if v_n <> 1 then raise exception 'hearthfind self-check (k): world_finds is not readable by authenticated'; end if;

  -- (l) THE TROPHIES CANNOT MINT VALUE. Proven on the database against the MAIN
  --     catalogue: every hearthfind item is untradeable (never reaches the
  --     market) and worth 0 (never reaches the vendor). This is the SQL half of
  --     tests/hearthfind-mint-guard.mjs.
  select count(*) into v_n from public.hr_hearthfind_items h
    join public.hr_items i on i.item_id = h.item_id
   where i.tradeable or i.value <> 0;
  if v_n > 0 then
    raise exception 'hearthfind self-check (l): % trophies are tradeable or vendorable', v_n;
  end if;
  -- and no trophy IS a priced currency.
  select count(*) into v_n from public.hr_hearthfind_items
   where item_id in ('hearth_token','muster_seal','dungeon_scrip');
  if v_n > 0 then
    raise exception 'hearthfind self-check (m): a priced currency is on the hearthfind allowlist';
  end if;

  -- (n) THE LEDGER KIND IS LEGAL. Without it the insert in §2 raises 23514 and
  --     the luckiest apply in the game comes back as bad_delta.
  --     ⚠ ASSERTED AGAINST THE CONSTRAINT ITSELF, not by inserting a probe row.
  --       CLAUDE.md §2: player state is never fabricated - and a probe insert
  --       into the append-only journal is a fabricated row even when it is
  --       deleted a statement later. `pg_get_constraintdef` answers the same
  --       question with no write at all, and §1b's union-widen is what makes it
  --       true rather than a hope.
  select count(*) into v_n from pg_constraint c
   where c.conname = 'player_ledger_kind_check'
     and c.conrelid = 'public.player_ledger'::regclass
     and pg_get_constraintdef(c.oid) like '%''hearthfind''%';
  if v_n <> 1 then
    raise exception 'hearthfind self-check (n): player_ledger_kind_check does not admit kind=hearthfind (%)',
      (select pg_get_constraintdef(c.oid) from pg_constraint c
        where c.conname = 'player_ledger_kind_check' and c.conrelid = 'public.player_ledger'::regclass);
  end if;
  -- …and the widen must not have DROPPED a kind another feature owns. The live
  -- constraint carried 24 before this file; it must carry 24 + hearthfind.
  select count(*) into v_n from pg_constraint c
   where c.conname = 'player_ledger_kind_check'
     and c.conrelid = 'public.player_ledger'::regclass
     and pg_get_constraintdef(c.oid) like all (array['%''accrue''%','%''worker''%','%''enchant''%','%''dungeon''%','%''renown''%','%''bank''%']);
  if v_n <> 1 then
    raise exception 'hearthfind self-check (n2): the widen dropped a pre-existing ledger kind';
  end if;

  -- (o) THE PRUNE IS NOT CLIENT-EXECUTABLE.
  select count(*) into v_n from information_schema.role_routine_grants
   where routine_schema = 'public' and routine_name = 'hr_world_finds_prune'
     and grantee in ('anon','authenticated','PUBLIC');
  if v_n > 0 then raise exception 'hearthfind self-check (o): hr_world_finds_prune is client-executable'; end if;

  -- (p) hr_apply is still executable by exactly the engine and nothing a
  --     request can arrive as. Re-asserted here because this file rewrote its
  --     body, and a rewritten body is the moment a grant is most likely to move.
  select count(*) into v_n from information_schema.role_routine_grants
   where routine_schema = 'public' and routine_name = 'hr_apply'
     and grantee in ('anon','authenticated','PUBLIC');
  if v_n > 0 then raise exception 'hearthfind self-check (p): hr_apply is client-executable'; end if;

  -- (q) THE SELF-CONFIGURING SWITCH IS PROJECTED. Without it the engine never
  --     proposes a find and the whole feature is silently inert on a database
  --     that has this migration - the worst of both halves.
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, 'hearthfind_ready') = 0 then
    raise exception 'hearthfind self-check (q): hr_state_of does not project hearthfind_ready - the engine would never propose a find';
  end if;

  -- (r) THE COSMETICS ARE SERVER-OWNED AND POWERLESS.
  --     (r1) no client write policy and no client|service write grant -- a
  --          leaked service key must not be able to hand itself Wonderkeeper;
  --     (r2) RLS on;
  --     (r3) NO NUMERIC COLUMN. This is the anti-P2W property as a SHAPE: a
  --          cosmetic table that grows an integer is one migration from being a
  --          stat, and the ruling's "no stat perk" would then rest on a
  --          convention instead of on something a reviewer can execute.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'player_cosmetics' and cmd <> 'SELECT';
  if v_n > 0 then raise exception 'hearthfind self-check (r1): % write policies on player_cosmetics', v_n; end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'player_cosmetics'
     and grantee in ('anon','authenticated','service_role','PUBLIC')
     and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_n > 0 then raise exception 'hearthfind self-check (r1): % client|service write grants on player_cosmetics', v_n; end if;
  select count(*) into v_n from pg_class
   where oid = 'public.player_cosmetics'::regclass and relrowsecurity;
  if v_n <> 1 then raise exception 'hearthfind self-check (r2): RLS is not enabled on player_cosmetics'; end if;
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'player_cosmetics'
     and data_type in ('integer','bigint','smallint','numeric','real','double precision')
     and column_name <> 'slot';
  if v_n > 0 then
    raise exception 'hearthfind self-check (r3): player_cosmetics grew % numeric column(s) - a cosmetic must never carry a number', v_n;
  end if;

  -- (s) THE GRANT PATH. The cosmetic unlocks are written by hr_apply's
  --     hearthfind arm and by nothing else, and the codes are READ FROM THE
  --     CATALOGUE rather than hand-typed into the body (the data double-copy
  --     rule -- here the copy would be what a title is called on a shareable
  --     card that outlives the retune).
  if strpos(v_apply, 'insert into public.player_cosmetics') = 0 then
    raise exception 'hearthfind self-check (s): hr_apply does not grant the cosmetic unlocks';
  end if;
  if strpos(v_apply, $x$where key = 'set_title_code'$x$) = 0
     or strpos(v_apply, $x$where key = 'plinth_code'$x$) = 0 then
    raise exception 'hearthfind self-check (s2): hr_apply hand-types a cosmetic code instead of reading hr_hearthfind_meta';
  end if;
  if strpos(v_apply, 'count(distinct item_id)') = 0 then
    raise exception 'hearthfind self-check (s3): the full-set title is not counted from the journal';
  end if;

  -- (t) THE PROJECTION. A server row nobody projects is a row the player never
  --     sees -- the residue-ahead class in reverse.
  if strpos(v_def, 'hearthfind_titles') = 0 or strpos(v_def, 'hearthfind_plinth') = 0 then
    raise exception 'hearthfind self-check (t): hr_state_of does not project the cosmetic unlocks';
  end if;

  -- (u) THE GLOBAL ORDINAL is counted from the JOURNAL, not from the public
  --     board. world_finds is suppressed by the broadcast clamp, so an ordinal
  --     counted there would drift below the truth and be re-used.
  if strpos(v_apply, 'nth_ever') = 0 then
    raise exception 'hearthfind self-check (u): the global ordinal is not computed';
  end if;
  if to_regclass('public.player_ledger_hearthfind_item_idx') is null then
    raise exception 'hearthfind self-check (u2): player_ledger_hearthfind_item_idx is missing - the ordinal would scan the ledger';
  end if;

  raise notice 'hearthfind self-check: PASS (% sources, %-% expected hours, shortest odds 1 in %)',
    (select count(*) from public.hr_hearthfind_sources), v_hours_lo, v_hours_hi, v_min;
end $chk$;
