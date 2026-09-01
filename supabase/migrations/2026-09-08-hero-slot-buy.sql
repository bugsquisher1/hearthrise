-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-08-hero-slot-buy.sql — hr_buy_hero_slot: THE SERVER VERB FOR A
--                                HERO SLOT, AND THE ENTITLEMENT GATE THAT
--                                MAKES ITS PRICE MEAN ANYTHING.
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. The Coordinator applies this by hand
--     (execute_sql wrapped in begin/commit, or a branch apply). It is a MONEY
--     SURFACE: it debits the server-owned GEM balance, the game's premium
--     currency. Security review required before authority moves.
--
--   Companion tests:  tests/hero-slot-buy.mjs (PGlite replay + mutation catalogue)
--   Companion client: src/net/goal-claim.js buyHeroSlot()
--                     src/net/accrue.js reconcileHeroSlots()
--                     src/multi-character.js buySlot() / unlockedCount() / slotRows()
--
-- ⚠ AFTER APPLYING: hr_state_of, hr_create_character and hr_rpc_gate are all
--   LIVE-HASH-TRACKED BODIES (tests/live-hash-drift.baseline.json). This file
--   patches all three programmatically, so the Coordinator must re-seed the
--   baseline with `node tests/live-hash-drift.mjs --live --write` after the
--   apply, or the next drift run reports three false divergences.
--
-- ── THE TWO DEFECTS THIS CLOSES (both proven on production) ─────────────────
--
-- (1) THE BUY BUTTON IS LIT AND DEAD. `public.hr_unlock_offers` carries the four
--     character_slot rows with `refusal = 'namespace_unsupported:character_slot'`
--     and `gold = null` (generated from src/data/shops.js by a predicate that
--     lives in ONE place — unlock-catalogue.js SELLABLE_NAMESPACES — because a
--     hero slot is priced in GEMS and that catalogue has a gold column and no
--     other). So hr_unlock_buy refuses the namespace by construction, and the
--     only other path — multi-character.js `unlockSlot()` — is a client-side
--     `G.gems -= cost`. Gems are SERVER-OF-RECORD and ARMED (src/net/record.js
--     SERVER_OF_RECORD carries `gems` with no dormant gate), so that debit is
--     reconciled away by the next envelope while the entitlement stays granted.
--     The player clicks through a confirm modal and nothing true happens.
--
-- (2) OWNERSHIP IS CLIENT-AUTHORED. src/multi-character.js's own header (the
--     block above `unlockedCount`) documents the live b371 incident: a 200-gem
--     purchase debited G.gems, a cloud restore handed the gems back, AND THE
--     SLOT STAYED UNLOCKED — "the purchase became free". That header ends by
--     naming this file: "THE CORRECT END STATE IS SERVER-SIDE… the real fix is
--     one server intent (`hr_buy_hero_slot`) that debits gems and records the
--     unlock in ONE transaction". This is that intent.
--
-- ── (3) THE DEFECT FOUND WHILE BUILDING IT, AND IT IS THE BIGGER ONE ────────
-- `hr_create_character(p_slot int)` is granted to `authenticated` and validates
-- `p_slot` for SHAPE ONLY — `if v_slot < 0 or v_slot > 5 then bad_slot`. It has
-- never asked whether the account OWNS that slot. So today, from any signed-in
-- browser console:
--
--     POST /rest/v1/rpc/hr_create_character  {"p_slot": 4}
--
-- mints a fifth character — full starting kit, 500 gold, a Bronze Sword, farm
-- plots and the free Auto-Eat I — for nothing, five times over. That is the
-- ENTIRE 3,100-gem hero-slot ladder plus five starting kits, free, with no
-- client modification beyond a fetch.
--
-- It also poisons this file's own read side. §3's ownership predicate treats
-- "a character already exists at slot N" as ownership (it must — see the
-- GRANDFATHER note there), so without the gate the exploit would LAUNDER into a
-- permanent, indistinguishable entitlement. A price is not a price if the thing
-- can be taken without paying it, so §8 is not scope creep — it is the other
-- half of the same property, and the two must land in one transaction.
--
-- ── WHERE THE PRICE COMES FROM (bound in three directions, not typed) ───────
-- src/multi-character.js `const SLOT_COSTS_GEMS = [0, 200, 500, 900, 1500]`
-- (index = slot index, HARD CAP 5) is the authored ladder — it is what the
-- drawer and the Home rail render. tools/gen-shops.mjs reads exactly that array
-- (`anchor: 'const SLOT_COSTS_GEMS = ['`) and generates the four
-- `character_slot.N` offers in src/data/shops.js, which is pure ESM that Node
-- and Deno import. tests/hero-slot-buy.mjs binds ALL THREE — the authored array,
-- the generated ESM catalogue and public.hr_hero_slots — and fails the build if
-- any pair disagrees in either direction. That is the hr_traits/hr_goal_rewards
-- precedent, and it is why the four rows in §1 are safe to type out.
--
-- ── THE ACCOUNT/CHARACTER SPLIT — THE DESIGN DECISION IN THIS FILE ──────────
-- A hero slot is an ACCOUNT entitlement (src/multi-character.js's storage
-- comment: "entitlements: ACCOUNT-level, not per-character"). Gems are stored
-- PER CHARACTER (`player_state.gems`, one row per (user_id, slot); both server
-- writers — hr_apply's `gems` delta key and world_event_claim — credit the slot
-- they were called for). Those two facts do not line up, and pretending they do
-- is how you get a support ticket. So this file splits them deliberately:
--
--   THE MONEY comes from the CALLING CHARACTER's row (p_slot). That is the
--     balance the topbar gem chip is showing while the player looks at the Buy
--     button — src/net/balance.js `balanceNum(G,'gems')` reads the record, which
--     is hr_state_of for the ACTIVE slot. Charging any other row would take gems
--     the player cannot see, and `insufficient_gems` would quote a number that
--     is not on their screen. Measured on production 2026-09-08: the one account
--     with two characters holds 527 gems on slot 0 and 0 on slot 1, so this is
--     not hypothetical. Every other gem sink in the game (bank.gems, cosmetics)
--     already spends the active character's gems; this one matches them.
--   THE ENTITLEMENT is written to the ACCOUNT's canonical row, slot 0, and is
--     read account-wide. player_progress has no account-level home (its PK is
--     (user_id, slot, kind, key, period_key) and it has an FK onto
--     player_state), and slot 0 is the row every account has by construction.
--     Filing the flag under the calling slot would make a slot bought on Hero 2
--     invisible from Hero 1 — a per-character entitlement, which it is not.
--
--   ⚠ RESIDUAL, STATED FOR THE REVIEWER: gems earned on Hero 2 cannot buy a
--     slot while you are standing on Hero 1. That is pre-existing and true of
--     every gem sink in the game; whether GEMS should become an account-level
--     wallet is a Designer question about currency scope, not a fix for a dead
--     button, and it is deliberately not answered here. It is NOT an exploit
--     surface: every wallet in play belongs to the same auth.uid(), so a client
--     that chose a different one of its OWN rows would move nothing across a
--     player boundary. Which of your own pockets you pay from is a UX rule.
--
-- ── THE LADDER CLAMP: WHY A FORGED slot_id OR PRICE CANNOT MINT ─────────────
-- The caller sends TWO INTEGERS AND A UUID and nothing else: which slot to buy,
-- which of its own characters to charge, and an idempotency key. There is no
-- price field, no currency field, no quantity, no timestamp and no "free" flag
-- on the wire. Every number this function writes is read under the lock from
-- public.hr_hero_slots (revoked from every client role) or from the caller's own
-- player_state row. A forged `p_slot_id`:
--   · outside 0..5           → `bad_slot`, before any catalogue read or lock;
--   · not in the catalogue   → `unknown_slot` (this is what slot 0 and slot 5
--                              answer: slot 0 is free and slot 5 is past the
--                              hard cap, so neither is for sale);
--   · already owned          → `already_owned`, and ownership includes the
--                              grandfather and premium clauses (§3);
--   · out of ladder order    → `requires_previous_slot`. Slot N requires N-1, so
--                              the 1,500-gem slot cannot be reached without the
--                              200 + 500 + 900 below it. This is what makes the
--                              ladder a ladder rather than four independent
--                              prices, and it is checked against the SERVER's
--                              owned set, never against a client claim.
--
-- ── THE OTHER WAY IN, TRACED RATHER THAN ASSUMED (read this, Security) ─────
-- The ownership row is an ordinary `player_progress` kind='flag' row, and
-- hr_apply HAS a generic progress block that writes exactly that shape:
--
--     if coalesce(v_prog->>'kind','') not in
--          ('quest','daily','bounty','stat','collection','flag') then …
--
-- with a 64-char free-text key and `add` clamped at 1,000,000. So
-- `{kind:'flag', key:'character_slot:1', add:1}` WOULD write this verb's grant
-- row, and `player_progress_unlock_guard` would permit it — that trigger polices
-- a mis-filed KIND against hr_unlocks, not an unauthorised GRANT. The question
-- is therefore whether a client can put that row into a delta. Traced, on the
-- shipped Edge Function:
--
--   · hr_apply is granted to hr_engine ONLY. The client never speaks to it.
--   · The engine's `progress` entries are all SERVER-AUTHORED: the goal counters
--     (`ev:<type>`, accrual.js) and the artisan recipe flags (`recipe:<id>`).
--     Nothing spreads a request body into the delta.
--   · The ONE verb that takes a progress kind and key FROM THE CLIENT is
--     `claim_reward` (src/net/gold.js claimReward → hr-accrue/claim-reward.js),
--     and `REWARD_KINDS` does include 'flag'. It is closed twice over:
--       (a) SHAPE. `REWARD_KEY_RE = ACTIVITY_ID_RE = CATALOGUE_ID_RE =
--           /^[a-z0-9_]{1,64}$/` — NO COLON. Every unlock id in this system is
--           `<namespace>:<id>`, so the whole id family is structurally
--           unreachable through that verb; `character_slot:1` fails the parse and
--           answers `unknown_reward` before anything is looked up.
--       (b) ALLOWLIST. claim-reward.js resolves `claimableFor(kind, key)` against
--           a server-side registry and refuses `unknown_reward` on a miss. The
--           only 'flag' member is `renown_rank`.
--     Two independent locks, either of which alone would be sufficient.
--
-- ⚠ RESIDUAL, STATED AND NOT FIXED HERE. hr_apply itself would still ACCEPT such
--   a row if an Edge Function ever proposed one — i.e. this is inside the
--   "blast radius if the engine is wrong or compromised" that the per-call clamps
--   exist for (docs/design/server-authority.md §2). It is NOT hardened in this
--   file, deliberately: hr_apply is the single highest-risk body in the tree
--   (`chain+floor+pin` — restated by three or more migrations), this change
--   already patches three tracked bodies, and the surface is closed today by the
--   two locks above. If Security wants defence in depth, the remediation is one
--   anchored addition to hr_apply's progress block, next to `bad_progress_state`:
--
--       if v_prog->>'kind' = 'flag' and v_prog->>'key' like 'character\_slot:%'
--         then perform public.hr_reject('bad_progress_key');
--       end if;
--
--   The engine has no legitimate reason to write that key, so the refusal costs
--   nothing. It is their call, not mine, and it is a follow-up rather than a
--   blocker precisely because I could not find a client path to it.
--
--   One accidental narrowing worth naming: the grant row lives on SLOT 0. A
--   forged delta submitted for slot 2 would write a flag at slot 2, which
--   hr_hero_slots_of does not read. That is a real narrowing and a weak one —
--   most players are on slot 0 — so it is stated as an observation, not a
--   control.
--
-- ── THERE IS NO FREE PATH IN THIS FUNCTION. AT ALL. ────────────────────────
-- The client today grants slots 1-3 for zero gems when
-- `profile.entitlements.hearthHall` is truthy — and `hearthrise:profile` is
-- DEVICE-LOCAL localStorage that nothing in the shipped build ever writes. One
-- line in devtools is three free slots. That waiver moves here and becomes a
-- fact about OWNERSHIP rather than a price of zero: a premium account simply
-- ALREADY OWNS the waived slots (§3 clause 3, read from a server-side
-- `entitlement:hearthHall` flag row), so hr_buy_hero_slot answers
-- `already_owned` and never runs a zero-gem grant. §10(e) SCANS this function's
-- own body and fails the migration if a code path can write the ownership row
-- without passing the debit. Stated as an absence, which is stronger than a
-- promise.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────────
--   · It does NOT stamp `accrued_to`. A purchase is not an activity change, so
--     the unpaid accrual window survives it untouched (hr_unlock_buy's rule,
--     hr_trait_buy's rule).
--   · It does NOT consult hr_day_budget_check. That ceiling is on GROSS INFLOW
--     and this transaction has none in any dimension: the currency is negative,
--     no xp, no items. A call whose result can never be non-null is decoration.
--   · It does NOT cache REFUSALS under p_idem. "You are 40 gems short" must
--     become buyable the moment the gems arrive; only a SUCCESS is replayable.
--   · It does NOT create the character. Buying the slot and creating the hero
--     in it are two gestures with two failure modes; hr_create_character stays
--     the ensure it has always been (§2a-iv of docs/design/server-authority.md)
--     and simply learns to ask whether the slot is owned.
--   · It does NOT touch player_state rows for any slot other than the one it
--     was told to charge.
--
-- ── IDEMPOTENCY + CONCURRENCY ──────────────────────────────────────────────
-- TWO advisory locks, in a canonical order, and the first one is the interesting
-- one. hr_trait_buy needs only the per-character key because everything it
-- touches lives on that character. This verb reads and writes an ACCOUNT-level
-- row (slot 0's flag) while debiting a CHARACTER-level row, so two characters of
-- one account buying the same hero slot at the same time would take two
-- DIFFERENT per-character locks, both pass `already_owned`, and both charge.
-- So it takes the slot-0 key FIRST — byte-identical to the key hr_apply takes
-- for slot 0 — and then the calling character's key if it is different. Ascending
-- slot order is canonical, so no two callers can take them in opposite orders.
-- Both are transaction-scoped (safe under the transaction pooler) and
-- re-entrant.
--
-- Then `hr_intent_replay` (2026-09-03-intent-mismatch-class.sql), from birth
-- rather than by a later patch: player_intents is ONE key namespace shared by
-- every verb in the database, so a key already claimed by another intent must be
-- REFUSED, not answered with that intent's decision. This verb is added to
-- tests/intent-mismatch.mjs GUARDED so a future template restatement of its body
-- is caught at chain end.
--
-- Then `select … for update` on the charged row. Two calls with DIFFERENT keys
-- for the same hero slot serialise on the account lock and the second is refused
-- `already_owned` — a refusal, never a silent no-op that charged.
--
-- ── PERFORMANCE / COST AT 100× PLAYERS ─────────────────────────────────────
-- Four slots exist in the entire game and each is once-per-ACCOUNT forever, so
-- the LIFETIME row cost per account is at most: 4 player_progress rows, 4
-- player_ledger rows and 4 player_intents rows (pruned at 24h). At 600 players
-- that is under 7,200 rows FOREVER, and realistically two orders of magnitude
-- less — a hero slot is the rarest purchase in the game. This is a value
-- transfer, which is what the ledger is for; it is not the per-tick journalling
-- that took game_events to 1.6M rows from six players in four days.
-- `hr_hero_slots_of` is two index lookups plus a four-row catalogue scan and is
-- called once per hr_state_of; hr_state_of is already the envelope's cost centre
-- and this adds well under a millisecond to it.
--
-- ── REVERSIBILITY ──────────────────────────────────────────────────────────
-- Additive throughout. To revert:
--   drop function public.hr_buy_hero_slot(int,int,uuid);
--   drop function public.hr_buy_hero_slot__ungated(int,int,uuid);
--   drop function public.hr_hero_slots_of(uuid);      -- AFTER re-applying the
--   drop table public.hr_hero_slots;                  -- two bodies below
--   -- re-apply 2026-08-23-trait-buy.sql to restore hr_state_of without the
--   --   `hero_slots` projection (an old client ignores the extra key), and
--   -- re-apply 2026-09-04-auto-eat-at-creation.sql to restore hr_create_character
--   --   without the entitlement gate — ⚠ WHICH RE-OPENS THE FREE-CHARACTER MINT
--   --   IN (3) ABOVE. Do not revert §8 alone to unblock something.
-- The rows it has already written are ordinary player_progress kind='flag' rows
-- — the exact shape hr_unlocks already catalogues — and survive the revert.
--
-- ⚠ IT TAKES OVER NO LAST-TOUCHER ROLE. hr_state_of, hr_rpc_gate and
--   hr_create_character are patched PROGRAMMATICALLY (pg_get_functiondef + a
--   guarded, exactly-once anchor replace — the 2026-08-28-client-state.sql
--   idiom), so this file carries no literal `create or replace function
--   public.hr_state_of(` / `…hr_rpc_gate(` / `…hr_create_character(` header and
--   is a member of NO derivation chain.
--
-- SAFE TO RE-RUN. Every step is guarded and §10's probes roll themselves back.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_def text; v_n int;
begin
  if to_regclass('public.player_state')    is null then raise exception 'player_state missing — apply 2026-08-11-player-state.sql first'; end if;
  if to_regclass('public.player_progress') is null then raise exception 'player_progress missing'; end if;
  if to_regclass('public.player_ledger')   is null then raise exception 'player_ledger missing'; end if;
  if to_regclass('public.player_intents')  is null then raise exception 'player_intents missing'; end if;

  -- The gems column is the balance this verb debits. Without it the whole
  -- currency arm of the function is unreachable.
  if (select count(*) from information_schema.columns
       where table_schema='public' and table_name='player_state' and column_name='gems') <> 1 then
    raise exception 'player_state.gems is absent — this verb has no balance to debit without it.';
  end if;

  if to_regprocedure('public.hr_rpc_gate(text)') is null then
    raise exception 'hr_rpc_gate(text) not found — apply the rate-gate chain first';
  end if;
  if to_regprocedure('public.hr_record_rejection(uuid,int,text,text,jsonb,bigint)') is null then
    raise exception 'hr_record_rejection not found — refusals would be unobservable';
  end if;

  -- THE INTENT-MISMATCH HELPER. This verb calls it directly rather than being
  -- retro-patched, so its absence is a hard stop: without it the body does not
  -- compile, and shipping a direct-client idem-carrying RPC that reads the
  -- shared cache WITHOUT the (intent, slot) comparison is the exact class
  -- 2026-09-03-intent-mismatch-class.sql closed.
  if to_regprocedure('public.hr_intent_replay(uuid,int,uuid,text)') is null then
    raise exception 'hr_intent_replay is absent — apply 2026-09-03-intent-mismatch-class.sql first. '
                    'This verb reads the shared player_intents namespace and must compare the '
                    'stored intent and slot, not merely the key.';
  end if;

  -- THE STORAGE GUARD + ITS CATALOGUE. hr_unlocks already carries the four
  -- character_slot ids as storable flags (generated by tools/gen-unlocks.mjs
  -- from src/data/shops.js); player_progress_unlock_guard refuses a mis-filed
  -- kind INDEPENDENTLY of this function.
  if to_regclass('public.hr_unlocks') is null then
    raise exception 'hr_unlocks is absent — apply 2026-08-16-unlocks.generated.sql first';
  end if;
  select count(*) into v_n from public.hr_unlocks
   where unlock_id ~ '^character_slot:[1-4]$' and progress_kind = 'flag' and merge <> 'none';
  if v_n <> 4 then
    raise exception 'hr_unlocks carries % of the 4 character_slot rows as storable flags — the '
                    'player_progress_unlock_guard trigger would refuse the row this verb writes '
                    '(unlock_wrong_kind / unlock_not_storable)', v_n;
  end if;
  -- …and the premium waiver reads a flag of its own.
  if not exists (select 1 from public.hr_unlocks
                  where unlock_id = 'entitlement:hearthHall'
                    and progress_kind = 'flag' and merge <> 'none') then
    raise exception 'hr_unlocks does not carry entitlement:hearthHall as a storable flag — the '
                    'premium waiver in hr_hero_slots_of would have no server-side home and the '
                    'device-local localStorage claim would stay the only opinion';
  end if;

  -- THE BODY §8 PATCHES. Fail closed rather than silently leaving the free
  -- character mint open on a database this file believes it hardened.
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'hr_create_character(int) is absent — apply the character-bootstrap chain first. '
                    'Without it §8 cannot close the free-character mint and this file would ship a '
                    'price for something that is already free.';
  end if;
  v_def := replace(pg_get_functiondef(to_regprocedure('public.hr_create_character(int)')), chr(13), '');
  if position('hr_hero_slots_of' in v_def) = 0
     and position('''trait:auto_eat''' in v_def) = 0 then
    raise exception 'the LIVE hr_create_character is not the b497 body (no free-Auto-Eat grant) — '
                    'apply 2026-09-04-auto-eat-at-creation.sql first, so §8 patches the body this '
                    'file was derived against';
  end if;

  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first';
  end if;
end $$;

-- ── 1. THE CATALOGUE — public.hr_hero_slots ────────────────────────────────
-- slot_id (the 0-BASED slot index, exactly as src/multi-character.js indexes
-- SLOT_COSTS_GEMS and exactly as the unlock id `character_slot:<n>` is spelled),
-- what it costs in gems, its display name, and whether Hearth Hall Premium
-- waives it.
--
-- THE HARD CAP IS THIS TABLE. src/multi-character.js MAX_SLOTS = 5 means slot
-- indexes 0..4; slot 0 is free and has no row, so the sellable ladder is 1..4
-- and a `p_slot_id` of 5 answers `unknown_slot` because no row exists — the cap
-- is data, not a constant somebody has to remember to move.
--
-- `premium_waived` is the one behavioural column and it mirrors the client's own
-- rule exactly: `free = hasPremium && i >= 1 && i <= 3` (multi-character.js
-- canUnlockNext/slotRows/unlockSlot, all three). Making it a column rather than
-- a `between 1 and 3` expression means the day the Designer changes how many
-- slots Premium includes, it is a data edit that the drift guard checks against
-- the client, not a second copy of a rule in PL/pgSQL.
create table if not exists public.hr_hero_slots (
  slot_id        int primary key check (slot_id between 1 and 4),
  name           text    not null,
  cost_gems      bigint  not null check (cost_gems > 0),
  premium_waived boolean not null default false
);

-- RLS on, NO policy, every client grant revoked: this catalogue is read by
-- SECURITY DEFINER functions only. The client already HAS these numbers (it
-- authored them — SLOT_COSTS_GEMS is what the drawer and the Home rail render),
-- so exposing the table would be a second copy of a price with no reader.
-- "revoke all", NOT "revoke insert, update, delete" (Security C1): Supabase's
-- default ACL on public also grants TRUNCATE, REFERENCES and TRIGGER, and
-- TRUNCATE bypasses row-level security entirely.
alter table public.hr_hero_slots enable row level security;
revoke all on public.hr_hero_slots from public, anon, authenticated, service_role;

-- Refilled wholesale: this file OWNS the whole table. Costs are BYTE-EQUAL to
-- src/multi-character.js `SLOT_COSTS_GEMS = [0, 200, 500, 900, 1500]` and the
-- names to the generated src/data/shops.js offers. Not one number is invented
-- here, and tests/hero-slot-buy.mjs fails the build if any of the three copies
-- disagrees in either direction.
delete from public.hr_hero_slots;
insert into public.hr_hero_slots (slot_id, name, cost_gems, premium_waived) values
  (1, 'Character slot 2',  200, true),
  (2, 'Character slot 3',  500, true),
  (3, 'Character slot 4',  900, true),
  (4, 'Character slot 5', 1500, false);

-- ── 2. player_ledger.kind must admit 'hero_slot' — PROGRAMMATIC, ADDITIVE ──
-- Inserted at an anchor rather than restating the array (the 2026-08-23-trait-buy
-- precedent), so it removes nothing by construction and cannot silently delete a
-- kind a later file added if it is ever re-applied out of order.
do $$
declare v_def text; v_new text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'public.player_ledger'::regclass and conname = 'player_ledger_kind_check';
  if v_def is null then
    raise exception 'player_ledger_kind_check is absent — this verb''s journal row would be '
                    'unconstrained, and every other writer assumes the constraint exists';
  end if;
  if position('''hero_slot''' in v_def) > 0 then
    raise notice 'player_ledger.kind already admits ''hero_slot'' — widen skipped';
    return;
  end if;
  if position('''accrue''::text' in v_def) = 0 then
    raise exception 'player_ledger_kind_check has no ''accrue''::text anchor (%) — refusing to '
                    'rewrite a constraint whose shape this file cannot account for', v_def;
  end if;
  v_new := replace(v_def, '''accrue''::text', '''hero_slot''::text, ''accrue''::text');
  execute 'alter table public.player_ledger drop constraint player_ledger_kind_check';
  execute 'alter table public.player_ledger add constraint player_ledger_kind_check ' || v_new;
  raise notice 'player_ledger.kind widened to admit ''hero_slot'' (insertion, nothing removed)';
end $$;

-- ── 3. THE OWNERSHIP PREDICATE — ONE FUNCTION, THREE READERS ───────────────
-- WHICH HERO SLOTS DOES THIS ACCOUNT OWN? Written ONCE, here, and read by
--   · hr_buy_hero_slot__ungated  → already_owned + requires_previous_slot,
--   · hr_state_of                → the client's `hero_slots` projection,
--   · hr_create_character        → the entitlement gate (§8).
-- Three readers of one rule, because a grandfather clause that exists in three
-- slightly different spellings is a grandfather clause that has three different
-- answers, and the one that disagrees is the one that hands out a free slot.
--
-- ── THE EXACT PREDICATE, CLAUSE BY CLAUSE (write this down for the reviewer) ─
-- An account owns hero slot N if and only if ANY of:
--
--   (0) N = 0. Slot 0 is free, has no catalogue row, and every account has it.
--
--   (1) GRANDFATHER — a player_state row already exists at (user, N).
--       LOAD-BEARING AND MEASURED: production carries ZERO character_slot flag
--       rows (`select count(*) … where key like 'character_slot:%'` → 0), and one
--       account (0a47ba77…) has characters on slots 0 AND 1. Without this clause
--       that player's second hero disappears from their own account the moment
--       the projection arms. The clause is safe going FORWARD because §8 makes a
--       player_state row at N > 0 impossible to create without already owning N
--       — so after this migration the clause can only ever restate a purchase,
--       a waiver, or a pre-migration character. It is also the humane answer to
--       a lapsed premium subscription: the character you made stays playable,
--       which is the same reasoning multi-character.js `activeSlot()` gives for
--       deliberately not clamping the address to the entitlement.
--
--   (2) BOUGHT — a player_progress row at SLOT 0 (the account's canonical row),
--       kind='flag', period_key='', key='character_slot:N', value > 0. That is
--       the shape hr_unlocks catalogues and player_progress_unlock_guard polices,
--       and it is the ONLY row hr_buy_hero_slot writes.
--
--   (3) PREMIUM — the catalogue says the slot is waived by Hearth Hall AND the
--       account holds a slot-0 `entitlement:hearthHall` flag. Today nothing
--       grants that flag (there is no IAP verification path yet), so this clause
--       is dormant BY DATA rather than by being unwritten — which is the point:
--       the client currently derives the same waiver from
--       `localStorage['hearthrise:profile'].entitlements.hearthHall`, a
--       device-local string nothing in the shipped build ever writes, i.e. three
--       free hero slots for anyone who types one line in devtools. Moving the
--       rule here is what closes that.
--
-- Returns a SORTED jsonb ARRAY of ints, never null, `[0]` at minimum. It is
-- deliberately not a boolean-per-slot call: the client needs the whole set to
-- render the hero list, and one round trip that answers everything is the
-- hr_trait_buy `owned` discipline.
--
-- STABLE, not VOLATILE: it only reads. §10(h) EXECUTES a read of it immediately
-- after the write inside the same transaction and asserts the new slot is in the
-- answer, so the "does a STABLE function see a write made by its VOLATILE
-- caller" question (docs/design/server-authority.md §0b: measured yes on PG17)
-- is proven by this migration rather than inherited from a note.
--
-- SECURITY INVOKER and revoked from every role: it takes an arbitrary uuid, so
-- it must not be client-reachable, and it needs no grant because it is only ever
-- called from SECURITY DEFINER bodies (a definer function's own privileges are
-- what count). Same posture as hr_intent_replay.
-- ⚠ CLAUSES (2) AND (3) READ THE FLAG ROW BY JOINING THE CATALOGUE, never by
--   parsing an int out of the key. `substring(key from 16)::int` would be a cast
--   the planner may evaluate BEFORE the filter that makes it safe, so a single
--   malformed row would turn every envelope in the game into a 22P02; and it
--   would let a `character_slot:9` row grant a slot the game does not sell. The
--   join cannot do either. (Nothing can write such a row today — hr_unlocks
--   catalogues only 1..4 and player_progress_unlock_guard polices it — which is
--   the point: two independent reasons it is safe, not one.) The catalogue is
--   only ever ADDED to, so the join can never revoke a purchase.
create or replace function public.hr_hero_slots_of(p_user uuid)
returns jsonb language sql stable security invoker set search_path = public as $fn$
  select coalesce(jsonb_agg(q.s order by q.s), '[]'::jsonb) from (
    select 0 as s
    union
    select ps.slot
      from public.player_state ps
     where ps.user_id = p_user and ps.slot > 0
    union
    select c.slot_id
      from public.hr_hero_slots c
      join public.player_progress pp
        on  pp.user_id = p_user and pp.slot = 0
        and pp.kind = 'flag' and pp.period_key = ''
        and pp.key = 'character_slot:' || c.slot_id
        and pp.value > 0
    union
    select c.slot_id
      from public.hr_hero_slots c
     where c.premium_waived
       and exists (select 1 from public.player_progress e
                    where e.user_id = p_user and e.slot = 0
                      and e.kind = 'flag' and e.period_key = ''
                      and e.key = 'entitlement:hearthHall' and e.value > 0)
  ) q
  where p_user is not null;
$fn$;
revoke execute on function public.hr_hero_slots_of(uuid) from public;
revoke execute on function public.hr_hero_slots_of(uuid) from anon, authenticated, service_role;

-- ── 4. hr_buy_hero_slot__ungated — verify, debit, grant, journal ───────────
create or replace function public.hr_buy_hero_slot__ungated(
  p_slot_id int, p_slot int, p_idem uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  -- BLAST RADIUS, not balance. Four slots exist and each is once-per-ACCOUNT
  -- forever, so this ceiling is structurally unreachable and says so out loud.
  -- It is here because the clamp is the house pattern (clan_deposit,
  -- hr_unlock_buy, hr_trait_buy) and because the day a sixth slot lands nobody
  -- will re-derive it: an account acquiring five hero slots in one day is not
  -- play, whatever the catalogue grows to.
  c_max_slots_per_day constant int := 5;

  v_uid    uuid := auth.uid();
  v_slot   int  := coalesce(p_slot, 0);
  v_cat    public.hr_hero_slots%rowtype;
  v_st     public.player_state%rowtype;
  v_owned  jsonb;
  v_cached jsonb;
  v_have   bigint;
  v_today  int;
  v_intent text;
  v_result jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  -- SHAPE FIRST, and for BOTH integers. p_slot names which of the caller's own
  -- characters pays; p_slot_id names which hero slot is bought. They are
  -- different numbers with different ranges and a transposed call must be
  -- refused rather than mis-charged.
  if p_slot is null or p_slot < 0 or p_slot > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot', p_slot);
  end if;
  if p_slot_id is null or p_slot_id < 0 or p_slot_id > 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_slot', 'slot_id', p_slot_id);
  end if;

  -- ── (1) THE CATALOGUE, BEFORE ANY LOCK. A refusal that is a fact about the
  --        CATALOGUE needs no character, no lock and no row, so a client looping
  --        on a bad id cannot contend on a real player's state row. Slot 0 (free,
  --        uncatalogued) and slot 5 (past the hard cap) both land here.
  select * into v_cat from public.hr_hero_slots where slot_id = p_slot_id;
  if v_cat.slot_id is null then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'unknown_slot',
      jsonb_build_object('slot_id', p_slot_id), 1);
    return jsonb_build_object('ok', false, 'error', 'unknown_slot', 'slot_id', p_slot_id);
  end if;
  v_intent := 'hero_slot_buy:' || v_cat.slot_id;

  -- ── (2) SERIALISE. TWO LOCKS, CANONICAL ORDER, AND THE FIRST ONE IS THE
  --        ACCOUNT. The entitlement row lives on slot 0 while the money lives on
  --        the calling character, so a per-character lock alone would let two of
  --        one account's characters buy the same hero slot simultaneously and
  --        both charge. The slot-0 key is byte-identical to the key hr_apply
  --        takes for slot 0 (`uid || ':' || slot`), so this also serialises
  --        against an accrual touching the account's progress rows.
  --        Transaction-scoped (safe under the transaction pooler) and re-entrant.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || '0', 0));
  if v_slot <> 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || v_slot::text, 0));
  end if;

  -- ── (3) IDEMPOTENCY IS PER (KEY, INTENT, SLOT), NOT PER KEY. player_intents
  --        is ONE namespace for every verb in this database, so a key claimed by
  --        another intent (or the same intent on another character) must be
  --        REFUSED, not answered with that intent's decision. Read INSIDE the
  --        lock so two simultaneous retries of one gesture cannot both miss the
  --        cache. ONLY SUCCESSES ARE CACHED (see (10)), so "you are 40 gems
  --        short" stays retryable the moment the gems arrive.
  select public.hr_intent_replay(v_uid, v_slot, p_idem, v_intent) into v_cached;
  if v_cached ->> 'error' = 'intent_mismatch' then return v_cached; end if;
  if v_cached is not null then
    return v_cached || jsonb_build_object('replayed', true);
  end if;

  -- ── (4) THE CHARGED ROW, LOCKED. This is the wallet the topbar is showing.
  select * into v_st from public.player_state
    where user_id = v_uid and slot = v_slot for update;
  if v_st.user_id is null then
    return jsonb_build_object('ok', false, 'error', 'no_character', 'slot', v_slot);
  end if;

  -- ── (5) THE ACCOUNT'S CANONICAL ROW MUST EXIST. player_progress has an FK
  --        onto player_state(user_id, slot), so the slot-0 flag row this verb
  --        writes needs a slot-0 character. Every account has one by
  --        construction — but a 23503 raised after the debit would be a 500 the
  --        client cannot tell from an outage, and a refusal that cannot be told
  --        from an outage is not a refusal (the companion-grant lesson).
  if not exists (select 1 from public.player_state where user_id = v_uid and slot = 0) then
    return jsonb_build_object('ok', false, 'error', 'no_account');
  end if;

  -- ── (6) OWNERSHIP, FROM THE ONE PREDICATE. `already_owned` covers a bought
  --        flag, a grandfathered character AND a premium waiver — which is why
  --        this function has no free path: a waived slot is refused as owned
  --        rather than granted for zero gems.
  v_owned := public.hr_hero_slots_of(v_uid);
  if v_owned @> to_jsonb(v_cat.slot_id) then
    return jsonb_build_object('ok', false, 'error', 'already_owned',
      'slot_id', v_cat.slot_id, 'hero_slots', v_owned);
  end if;

  -- ── (7) THE LADDER. Slot N requires N-1, checked against the SERVER's owned
  --        set. This is what stops the 1,500-gem slot being bought without the
  --        200 + 500 + 900 beneath it, and it is the reason a forged slot_id
  --        buys nothing: the price of slot 4 is the whole ladder.
  if not (v_owned @> to_jsonb(v_cat.slot_id - 1)) then
    return jsonb_build_object('ok', false, 'error', 'requires_previous_slot',
      'slot_id', v_cat.slot_id, 'requires', v_cat.slot_id - 1, 'hero_slots', v_owned);
  end if;

  -- ── (8) THE PER-DAY CLAMP, read from the APPEND-ONLY LEDGER rather than from
  --        a counter this function maintains (the clan_deposit pattern — a
  --        counter is a second source of truth that can be reset). ACCOUNT-WIDE
  --        (no slot filter), because the thing being bought is account-level.
  select count(*) into v_today from public.player_ledger
   where user_id = v_uid and kind = 'hero_slot'
     and at >= ((date_trunc('day', (now() at time zone 'utc'))) at time zone 'utc');
  if v_today >= c_max_slots_per_day then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'hero_slot_daily_cap',
      jsonb_build_object('used', v_today, 'limit', c_max_slots_per_day), 1);
    return jsonb_build_object('ok', false, 'error', 'hero_slot_daily_cap',
      'used', v_today, 'limit', c_max_slots_per_day);
  end if;

  -- ── (9) THE DEBIT. Computed under the lock, from the server's OWN row and the
  --        server's OWN catalogue. Nothing here is a number the caller supplied,
  --        and the balance cannot go negative: the check and the update are one
  --        statement apart inside one transaction holding the row lock.
  v_have := coalesce(v_st.gems, 0);
  if v_have < v_cat.cost_gems then
    perform public.hr_record_rejection(v_uid, v_slot, 'hero_slot_buy', 'insufficient_gems',
      jsonb_build_object('slot_id', v_cat.slot_id, 'cost', v_cat.cost_gems, 'have', v_have), 1);
    return jsonb_build_object('ok', false, 'error', 'insufficient_gems',
      'slot_id', v_cat.slot_id, 'cost', v_cat.cost_gems, 'have', v_have,
      'short_by', v_cat.cost_gems - v_have);
  end if;
  update public.player_state
     set gems = gems - v_cat.cost_gems, version = version + 1, updated_at = now()
   where user_id = v_uid and slot = v_slot;
  -- ⚠ accrued_to IS NOT TOUCHED. A purchase is not an activity change, so the
  --   unpaid accrual window survives it; stamping it here would confiscate every
  --   buyer's elapsed time, silently.

  -- ── (10) THE GRANT, ON THE ACCOUNT'S ROW. slot 0, kind='flag', period_key=''
  --         — the shape hr_unlocks catalogues and player_progress_unlock_guard
  --         independently polices. `greatest` is written out even though (6)
  --         already refuses a re-buy: (6) is the PURCHASE decision, this is the
  --         STORAGE rule.
  insert into public.player_progress as pp
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  values (v_uid, 0, 'flag', 'character_slot:' || v_cat.slot_id, 1, '', null, now())
  on conflict (user_id, slot, kind, key, period_key)
    do update set value = greatest(pp.value, excluded.value), updated_at = now();

  -- ── (11) THE JOURNAL. ONE row per purchase. gold/gold_in/xp_in/qty_in/gems_in
  --         are ZERO and written explicitly: this transaction MINTED nothing,
  --         which is a different fact from "unstamped". player_ledger has no
  --         SIGNED gems column (only the `gems_in` inflow counter), so the signed
  --         movement rides meta.gems — the same place hr_trait_buy files a marks
  --         movement, so the two cannot be summed differently.
  insert into public.player_ledger
    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)
  values
    (v_uid, v_slot, 'hero_slot', v_intent,
     0, 0, 0, 0, 0,
     jsonb_build_object('slot_id', v_cat.slot_id, 'name', v_cat.name,
                        'currency', 'gems', 'cost', v_cat.cost_gems,
                        'gems', -v_cat.cost_gems,
                        'charged_slot', v_slot, 'idem', p_idem));

  -- ── (12) THE ENVELOPE. The balance is RE-READ from the row rather than
  --         arithmetic on a pre-update snapshot, and `hero_slots` is the
  --         account's WHOLE owned set so one answer hydrates the client rather
  --         than one delta.
  select * into v_st from public.player_state where user_id = v_uid and slot = v_slot;
  v_result := jsonb_build_object(
    'ok', true, 'slot_id', v_cat.slot_id, 'name', v_cat.name,
    'currency', 'gems', 'cost', v_cat.cost_gems,
    'gems', v_st.gems, 'version', v_st.version, 'slot', v_slot,
    'hero_slots', public.hr_hero_slots_of(v_uid));

  -- ⚠ SUCCESSES ONLY. A cached refusal would make "not enough gems" permanent
  --   for that key; the client generates a fresh key per gesture, so a genuine
  --   retry of the SAME gesture still replays this envelope and debits nothing.
  if p_idem is not null then
    insert into public.player_intents (user_id, intent_id, slot, intent, result, at)
      values (v_uid, p_idem, v_slot, v_intent, v_result, now())
      on conflict (user_id, intent_id) do nothing;
  end if;

  return v_result;
end $$;

-- ── 5. The gated wrapper ───────────────────────────────────────────────────
-- ⚠ p_slot AND p_idem CARRY DEFAULTS, AND THAT IS LOAD-BEARING. PostgREST
--   resolves an RPC by the NAMED ARGUMENTS in the POST body: a client that posts
--   {p_slot_id} against a three-argument function with no defaults gets PGRST202
--   "could not find the function" — a 404 indistinguishable from "the migration
--   was never applied". §10(c) asserts the defaults rather than trusting this
--   comment.
create or replace function public.hr_buy_hero_slot(
  p_slot_id int, p_slot int default 0, p_idem uuid default null)
returns jsonb language plpgsql volatile security definer
set search_path = public, pg_catalog as $w$
begin
  if not public.hr_rpc_gate('hr_buy_hero_slot') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited')::jsonb;
  end if;
  return public.hr_buy_hero_slot__ungated($1, $2, $3);
end $w$;

revoke execute on function public.hr_buy_hero_slot__ungated(int, int, uuid) from public;
revoke execute on function public.hr_buy_hero_slot__ungated(int, int, uuid)
  from anon, authenticated, service_role;
revoke execute on function public.hr_buy_hero_slot(int, int, uuid) from public;
revoke execute on function public.hr_buy_hero_slot(int, int, uuid)
  from anon, authenticated, service_role;
grant  execute on function public.hr_buy_hero_slot(int, int, uuid) to authenticated;

-- ── 6. hr_rpc_gate — PROGRAMMATIC additive patch (one bucket) ──────────────
-- The 2026-08-28-client-state.sql idiom: pg_get_functiondef + a guarded string
-- replace, so this file never restates a body it did not author and can never
-- silently delete another file's bucket. An UNKNOWN bucket fails CLOSED
-- (`else return false`), so without this the RPC would answer 429 forever and
-- the feature would deploy green and dead — which is the exact failure mode
-- this whole file exists to end.
-- 12/min: a hero slot is bought at most four times in the life of an account.
do $$
declare v_src text; v_new text;
begin
  select pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');   -- CR-tolerant (CRLF working copies)
  if position('''hr_buy_hero_slot''' in v_src) > 0 then
    raise notice 'hr_rpc_gate already admits hr_buy_hero_slot — patch skipped'; return;
  end if;
  if (length(v_src) - length(replace(v_src, 'else return false;' || chr(10) || '  end case;', '')))
     <> length('else return false;' || chr(10) || '  end case;') then
    raise exception 'hr_rpc_gate case terminator anchor did not match exactly once — refusing to '
                    'patch blind';
  end if;
  v_new := replace(v_src,
    'else return false;' || chr(10) || '  end case;',
    'when ''hr_buy_hero_slot'' then v_limit := 12;' || chr(10) ||
    '    else return false;' || chr(10) || '  end case;');
  execute v_new;
  raise notice 'hr_rpc_gate patched: hr_buy_hero_slot admitted at 12/min';
end $$;
revoke execute on function public.hr_rpc_gate(text) from public;
revoke execute on function public.hr_rpc_gate(text) from anon, authenticated, service_role;

-- ── 7. hr_state_of — PROJECT the owned hero slots (programmatic, additive) ─
-- WHY THE ENVELOPE AND NOT A SECOND RPC: ownership must survive a device change,
-- and the client's only load path for it today is `G.heroSlotsUnlocked` in the
-- residue — a self-authored number a restore can rewind, which is the b371 dupe.
-- One additive top-level `hero_slots` array means the boot envelope (record.js
-- settle()) already carries it, with no extra round trip and no second thing to
-- keep in step.
--
-- ⚠ ACCOUNT-SCOPED ON PURPOSE, and that is the one way it differs from `traits`.
--   hr_state_of is called for ONE character, but a hero slot is an account
--   entitlement — so this projection is `hr_hero_slots_of(p_user)`, with no
--   `v_st.slot` in it. Every character of an account therefore reports the same
--   set, which is what makes the drawer show the same heroes whichever one you
--   are playing.
--
-- ⚠ READ UNFILTERED, exactly as `traits` is and for the same stated reason: the
--   generic `progress` array is LIMIT 1000, and a projection that truncates is a
--   projection that can silently answer "you own nothing" about an entitlement.
--
-- Patched at the `total_level` anchor — the same anchor
-- 2026-08-22-companion-record.sql and 2026-08-23-trait-buy.sql use, which
-- survives insertion because each appends AFTER the anchor text. NO-OP on
-- re-apply.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'total_level', public.hr_total_level(p_user, v_st.slot),$anc$;
begin
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if v_def is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first';
  end if;
  if strpos(v_def, $q$'hero_slots', public.hr_hero_slots_of$q$) > 0 then
    raise notice 'hr_state_of already projects hero_slots — patch skipped'; return;
  end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of total_level anchor did not match exactly once — its '
                    'shape is not the one this file was derived against. Do NOT patch a body you '
                    'cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor, c_anchor || '
    -- hero-slot-buy: the ACCOUNT''s owned hero slots, as a flat int array.
    -- ACCOUNT-scoped (no v_st.slot) because a hero slot is an account
    -- entitlement, unlike every other projection in this envelope. Written only
    -- by hr_buy_hero_slot; read by the client so ownership survives a device
    -- change without the save blob, which is the store the b371 gem dupe lived
    -- in. Never truncated — an entitlement must not become "you own nothing".
    -- `[0]` is a valid known state: a fresh account owns only the free slot.
    ''hero_slots'', public.hr_hero_slots_of(p_user),');
  execute v_def;
  raise notice 'hr_state_of patched: projects the account''s owned hero slots';
end $$;
-- create-or-replace preserves an ACL, but be explicit (the lesson of every
-- restated body in this tree). hr_state_of takes an arbitrary uuid; no client.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 8. hr_create_character — THE ENTITLEMENT GATE (programmatic, additive) ─
-- ⚠ THIS IS THE HALF THAT MAKES THE PRICE REAL. See defect (3) in the header:
--   hr_create_character is granted to `authenticated` and has only ever checked
--   `p_slot` for SHAPE, so `{"p_slot":4}` mints a fifth character with a full
--   starting kit for free. A ladder that costs 3,100 gems and a bypass that
--   costs one fetch are not two problems; they are one, and only one of them is
--   worth fixing on its own.
--
-- WHERE THE GATE GOES, AND WHY EXACTLY THERE. Immediately AFTER the fast path
-- (`the row already exists → ok, created:false`) and BEFORE the advisory lock
-- and the 6/hour creation budget:
--   · after the fast path, so an EXISTING character can never be locked out of
--     its own account — the grandfathered slot-1 hero on production, and any
--     character whose owner's premium later lapses, both return through the
--     fast path and never reach this check;
--   · before the lock and the strict budget, so a refused create costs neither.
--
-- The refusal is `slot_not_owned`, which src/net/character.js already routes
-- through its `default: refused` branch — no client change is required for the
-- gate to fail safely, and none is shipped.
--
-- Recorded at severity 1 (normal), not `incident`: a legitimate client can reach
-- this after a cloud restore rewinds the entitlement below the slot it is still
-- addressing (multi-character.js `activeSlot()` deliberately does not clamp, to
-- avoid pointing an autosave at another character's row). So it is a signal, not
-- an accusation.
do $$
declare
  v_def text; v_hits int;
  c_anchor constant text :=
    '  if exists (select 1 from public.player_state where user_id = v_uid and slot = v_slot) then'
    || chr(10) ||
    '    return jsonb_build_object(''ok'', true, ''slot'', v_slot, ''created'', false);'
    || chr(10) || '  end if;';
begin
  v_def := replace(pg_get_functiondef('public.hr_create_character(int)'::regprocedure), chr(13), '');
  if position('hr_hero_slots_of' in v_def) > 0 then
    raise notice 'hr_create_character already carries the hero-slot entitlement gate — patch skipped';
    return;
  end if;
  v_hits := (length(v_def) - length(replace(v_def, c_anchor, ''))) / length(c_anchor);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT on hr_create_character: the fast-path return matched % times, '
                    'expected exactly 1. Refusing to patch blind — re-apply '
                    '2026-09-04-auto-eat-at-creation.sql (the file that last authored this body) '
                    'and then re-apply this one.', v_hits;
  end if;
  v_def := replace(v_def, c_anchor, c_anchor || chr(10) || chr(10) ||
'  -- ── THE HERO-SLOT ENTITLEMENT GATE (2026-09-08-hero-slot-buy.sql) ────' || chr(10) ||
'  -- Until this existed, {"p_slot":4} minted a fifth character with a full' || chr(10) ||
'  -- starting kit for free — the whole 3,100-gem hero-slot ladder bypassed by' || chr(10) ||
'  -- one fetch, five times over. Slot 0 is free and always owned; every slot' || chr(10) ||
'  -- above it must be in hr_hero_slots_of (bought, grandfathered, or waived by' || chr(10) ||
'  -- Hearth Hall). Placed AFTER the fast path so an existing character can' || chr(10) ||
'  -- never be locked out of its own account, and BEFORE the advisory lock and' || chr(10) ||
'  -- the 6/hour creation budget so a refusal costs neither.' || chr(10) ||
'  if v_slot > 0 and not (public.hr_hero_slots_of(v_uid) @> to_jsonb(v_slot)) then' || chr(10) ||
'    perform public.hr_record_rejection(v_uid, v_slot, ''create_character'', ''slot_not_owned'',' || chr(10) ||
'      jsonb_build_object(''slot'', v_slot, ''owned'', public.hr_hero_slots_of(v_uid)), 1);' || chr(10) ||
'    return jsonb_build_object(''ok'', false, ''error'', ''slot_not_owned'', ''slot'', v_slot);' || chr(10) ||
'  end if;');
  execute v_def;
  raise notice 'hr_create_character patched: a character above slot 0 requires the entitlement';
end $$;
-- Explicit, for the same reason §7 is explicit. hr_create_character is the one
-- client-callable member of this trio.
revoke execute on function public.hr_create_character(int) from public;
revoke execute on function public.hr_create_character(int) from anon, service_role;
grant  execute on function public.hr_create_character(int) to authenticated;

-- ── 9. Grant-hygiene baseline (if present) ────────────────────────────────
do $$
begin
  if to_regclass('public.hr_client_rpc_baseline') is null then
    raise notice 'hr_client_rpc_baseline absent — grant-hygiene not applied; nothing to update';
    return;
  end if;
  delete from public.hr_client_rpc_baseline
   where proname = 'hr_buy_hero_slot' and grantee = 'authenticated';
  insert into public.hr_client_rpc_baseline (proname, identity_args, grantee, note) values
    ('hr_buy_hero_slot', 'p_slot_id integer, p_slot integer, p_idem uuid', 'authenticated',
     'added 2026-09-08: server-authoritative hero-slot purchase (gem debit on the calling '
     'character + the account-level kind=''flag'' character_slot:<n> grant hr_hero_slots_of '
     'reads). Price, ladder order and the Hearth Hall waiver come from public.hr_hero_slots; '
     'the caller sends two integers and an idempotency key and nothing else.');
end $$;

-- ── 10. SELF-VERIFYING COMMIT GATE ────────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them. The apply is atomic, so
-- a raise here reverts everything above it. Row-writing probes live in an
-- HR820-discarded subtransaction (player_ledger's retention guard refuses to
-- DELETE a fresh row, so a rollback is the only clean teardown).
--
-- ⚠ THE PROBES RUN AS A SYNTHETIC ACCOUNT, NOT AS A REAL ONE, AND THAT IS
--   NECESSARY RATHER THAN TIDY: the QA account on production already owns slot 1
--   by the GRANDFATHER clause, so "buy slot 2" against it would exercise a
--   different branch than a fresh account does and prove less.
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000e1-0000-0000-0000-0000000000e1';
  v_two  constant uuid := '000000e2-0000-0000-0000-0000000000e2';
  v_idem uuid;
  v_g    bigint;
  v_n    int;
  v_txt  text;
  v_def  text;
begin
  -- (a) THE CATALOGUE IS COHERENT and the ladder has no hole.
  if (select count(*) from public.hr_hero_slots) <> 4 then
    raise exception 'GATE(a): hr_hero_slots holds % rows, expected the 4 sellable slots',
      (select count(*) from public.hr_hero_slots);
  end if;
  if exists (select 1 from generate_series(1,4) g
              where not exists (select 1 from public.hr_hero_slots c where c.slot_id = g)) then
    raise exception 'GATE(a): the ladder has a HOLE — a missing rung makes every slot above it '
                    'permanently unreachable (requires_previous_slot can never be satisfied)';
  end if;
  -- Every catalogued slot must have a storable flag home in hr_unlocks, or the
  -- storage guard refuses the row AFTER the money has moved (it would roll back,
  -- but as bad_write rather than as a refusal by name).
  select string_agg(c.slot_id::text, ', ') into v_txt from public.hr_hero_slots c
   where not exists (select 1 from public.hr_unlocks u
                      where u.unlock_id = 'character_slot:' || c.slot_id
                        and u.progress_kind = 'flag' and u.merge <> 'none');
  if v_txt is not null then
    raise exception 'GATE(a): slot(s) % have no storable flag row in hr_unlocks — '
                    'player_progress_unlock_guard would refuse the grant', v_txt;
  end if;

  -- (b) GRANTS: wrapper authenticated-only, inner shut out of every client role,
  --     and NEITHER reachable by the accrual engine (the engine must never buy a
  --     premium slot for somebody).
  if to_regprocedure('public.hr_buy_hero_slot(integer,integer,uuid)') is null then
    raise exception 'GATE(b): the wrapper did not install';
  end if;
  if has_function_privilege('authenticated', 'public.hr_buy_hero_slot__ungated(integer,integer,uuid)', 'execute') then
    raise exception 'GATE(b): the __ungated inner is client-executable — the rate gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_buy_hero_slot(integer,integer,uuid)', 'execute') then
    raise exception 'GATE(b): the wrapper is not callable by authenticated — the feature is dead';
  end if;
  select string_agg(r, ',') into v_txt from unnest(array['public','anon','service_role']) r
   where has_function_privilege(r, 'public.hr_buy_hero_slot(integer,integer,uuid)', 'execute');
  if v_txt is not null then
    raise exception 'GATE(b): hr_buy_hero_slot is executable by %', v_txt;
  end if;
  if has_function_privilege('hr_engine', 'public.hr_buy_hero_slot(integer,integer,uuid)', 'execute')
     or has_function_privilege('hr_engine', 'public.hr_buy_hero_slot__ungated(integer,integer,uuid)', 'execute') then
    raise exception 'GATE(b): hr_engine can buy a premium slot for a player';
  end if;
  -- THE OWNERSHIP PREDICATE takes an arbitrary uuid. Nobody may call it.
  select string_agg(r, ',') into v_txt
    from unnest(array['public','anon','authenticated','service_role','hr_engine']) r
   where has_function_privilege(r, 'public.hr_hero_slots_of(uuid)', 'execute');
  if v_txt is not null then
    raise exception 'GATE(b): hr_hero_slots_of is executable by % — it takes a uuid ARGUMENT, so '
                    'that is "read any account''s entitlements" as that role', v_txt;
  end if;
  -- PUBLIC must hold nothing. aclexplode, because grantee = 0 IS the definition
  -- of PUBLIC and a regex over an ACL string asserts nothing.
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = to_regprocedure('public.hr_buy_hero_slot(integer,integer,uuid)')
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'GATE(b): hr_buy_hero_slot is still executable by PUBLIC';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a
              where p.oid = to_regprocedure('public.hr_hero_slots_of(uuid)')
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'GATE(b): hr_hero_slots_of is still executable by PUBLIC';
  end if;
  if (select prosecdef from pg_proc
       where oid = to_regprocedure('public.hr_buy_hero_slot__ungated(integer,integer,uuid)')) is not true then
    raise exception 'GATE(b): the inner is not SECURITY DEFINER — every statement would be denied';
  end if;
  if not exists (select 1 from unnest(coalesce((select proconfig from pg_proc
                    where oid = to_regprocedure('public.hr_buy_hero_slot__ungated(integer,integer,uuid)')),
                    array[]::text[])) c where c like 'search_path=%') then
    raise exception 'GATE(b): the inner has no pinned search_path — a SECURITY DEFINER function '
                    'without one is a search_path hijack';
  end if;
  if (select provolatile from pg_proc
       where oid = to_regprocedure('public.hr_buy_hero_slot(integer,integer,uuid)')) <> 'v' then
    raise exception 'GATE(b): hr_buy_hero_slot is not VOLATILE — PostgREST would run it in a READ '
                    'ONLY transaction and every purchase would fail';
  end if;
  -- …and hr_create_character must still be callable by the players it serves.
  if not has_function_privilege('authenticated', 'public.hr_create_character(integer)', 'execute') then
    raise exception 'GATE(b): §8 left hr_create_character uncallable by authenticated — every new '
                    'player would be unable to create a character at all';
  end if;

  -- (c) THE ONE-ARGUMENT CALL FORM RESOLVES (PGRST202 insurance).
  if coalesce((select pronargdefaults from pg_proc
                where oid = to_regprocedure('public.hr_buy_hero_slot(integer,integer,uuid)')), 0) < 2 then
    raise exception 'GATE(c): hr_buy_hero_slot has fewer than two defaulted arguments — a client '
                    'posting {p_slot_id, p_slot} would get PGRST202 and the feature ships dead';
  end if;

  -- (d) NO CLIENT WRITE SURFACE on anything this verb owns, and the price table
  --     is not client-readable in any dimension.
  select string_agg(table_name || ':' || privilege_type, ', ') into v_txt
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('player_state','player_progress','player_ledger','player_intents','hr_hero_slots')
     and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
     and privilege_type <> 'SELECT';
  if v_txt is not null then
    raise exception 'GATE(d): client/engine write grants on the tables this verb owns: %', v_txt;
  end if;
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'hr_hero_slots'
     and grantee in ('anon','authenticated','service_role','PUBLIC');
  if v_n > 0 then
    raise exception 'GATE(d): % client grant(s) on hr_hero_slots — the price would be readable and, '
                    'worse, a policy away from writable', v_n;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hr_hero_slots') then
    raise exception 'GATE(d): hr_hero_slots grew an RLS policy — it is definer-read only';
  end if;

  -- (e) THERE IS NO FREE PATH. The body must contain exactly ONE write of the
  --     ownership row, and the debit must be unconditional on the way to it.
  --     A `premium`/`free` branch that skipped the update would be a zero-gem
  --     grant reachable from a device-local localStorage claim — the exact
  --     defect the client half has today.
  v_def := pg_get_functiondef(to_regprocedure('public.hr_buy_hero_slot__ungated(integer,integer,uuid)'));
  v_n := (length(v_def) - length(replace(v_def, 'insert into public.player_progress', '')))
         / length('insert into public.player_progress');
  if v_n <> 1 then
    raise exception 'GATE(e): the body writes player_progress % times, expected exactly 1 — a '
                    'second grant path is a second chance to grant without charging', v_n;
  end if;
  v_n := (length(v_def) - length(replace(v_def, 'set gems = gems - v_cat.cost_gems', '')))
         / length('set gems = gems - v_cat.cost_gems');
  if v_n <> 1 then
    raise exception 'GATE(e): the body debits gems % times, expected exactly 1', v_n;
  end if;
  -- ORDER, which is the structural form of "there is no free path": the single
  -- debit must appear BEFORE the single grant. A waiver branch that granted
  -- without charging would have to put a grant ahead of the debit, or add a
  -- second one — and the two counts above already forbid the second. Asserted
  -- on the SHAPE of the body rather than on a comment-matching regex, which is
  -- the kind of guard that fires spuriously and then gets loosened.
  if position('set gems = gems - v_cat.cost_gems' in v_def) = 0
     or position('insert into public.player_progress' in v_def) = 0
     or position('set gems = gems - v_cat.cost_gems' in v_def)
        > position('insert into public.player_progress' in v_def) then
    raise exception 'GATE(e): the ownership grant is not downstream of the gem debit — there is a '
                    'path that can grant a hero slot without charging for it. The Hearth Hall '
                    'waiver belongs in hr_hero_slots_of as OWNERSHIP (a waived slot answers '
                    'already_owned), never here as a price of zero.';
  end if;
  -- CONTROL for the scans above: they must be able to SEE what they look for.
  if (length('insert into public.player_progress x') -
      length(replace('insert into public.player_progress x', 'insert into public.player_progress', ''))) = 0 then
    raise exception 'GATE(e): the grant scan is BLIND — it does not match a known positive';
  end if;

  -- (f) THE GATE ADMITS THE BUCKET, and the patch was ADDITIVE.
  v_def := pg_get_functiondef('public.hr_rpc_gate(text)'::regprocedure);
  if position('''hr_buy_hero_slot''' in v_def) = 0 then
    raise exception 'GATE(f): hr_rpc_gate does not admit hr_buy_hero_slot — an unknown bucket fails '
                    'closed, so every purchase would answer 429';
  end if;
  foreach v_txt in array array['hr_trait_buy','hr_bounty_spend','bank_move','client_state_put',
                               'farm_plant','hr_claim_daily','clan_deposit'] loop
    if position('''' || v_txt || '''' in v_def) = 0 then
      raise exception 'GATE(f): the hr_rpc_gate patch DELETED the ''%'' bucket — it is not additive',
        v_txt;
    end if;
  end loop;

  -- (g) THE ENVELOPE PROJECTS hero_slots, and did not lose a sibling projection.
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  if strpos(v_def, $q$'hero_slots', public.hr_hero_slots_of$q$) = 0 then
    raise exception 'GATE(g): hr_state_of does not project hero_slots';
  end if;
  foreach v_txt in array array['''total_level''','''inventory''','''skills''','''progress''',
                               '''marks''','''traits''','''auto_eat_enabled'''] loop
    if position(v_txt in v_def) = 0 then
      raise exception 'GATE(g): the hr_state_of patch DROPPED the % projection', v_txt;
    end if;
  end loop;
  -- ACCOUNT-scoped: the projection must NOT be keyed on the character's slot.
  if v_def ~ 'hr_hero_slots_of\(p_user, *v_st\.slot\)' then
    raise exception 'GATE(g): the hero_slots projection is character-scoped — a hero slot is an '
                    'ACCOUNT entitlement and every character must report the same set';
  end if;

  -- (g2) THE CREATE GATE IS PRESENT, and §8 did not eat the body it patched.
  v_def := pg_get_functiondef('public.hr_create_character(integer)'::regprocedure);
  if position('slot_not_owned' in v_def) = 0 then
    raise exception 'GATE(g2): hr_create_character carries no entitlement gate — {"p_slot":4} still '
                    'mints a fifth character with a full starting kit for free, and this file''s '
                    'entire price is decoration';
  end if;
  foreach v_txt in array array['hr_start_kit','player_skills','player_inventory','player_equipment',
                               'trait:auto_eat','create_character'] loop
    if position(v_txt in v_def) = 0 then
      raise exception 'GATE(g2): the hr_create_character patch DROPPED %', v_txt;
    end if;
  end loop;

  -- (h) EXECUTED BEHAVIOUR — discarded subtransaction, zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, marks, version)
      values (v_uid, 0, 1000, 250, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, gems = 250, version = 1;

    -- A FRESH ACCOUNT OWNS EXACTLY THE FREE SLOT.
    if public.hr_hero_slots_of(v_uid) <> '[0]'::jsonb then
      raise exception 'GATE(h): a fresh account owns %, expected [0]',
        public.hr_hero_slots_of(v_uid);
    end if;

    -- SHAPE + CATALOGUE REFUSALS, nothing moved.
    v := public.hr_buy_hero_slot__ungated(9, 0, null);
    if v->>'error' <> 'bad_slot' then
      raise exception 'GATE(h): an out-of-range slot_id was not refused: %', v;
    end if;
    v := public.hr_buy_hero_slot__ungated(0, 0, null);
    if v->>'error' <> 'unknown_slot' then
      raise exception 'GATE(h): slot 0 (free, uncatalogued) was not refused unknown_slot: %', v;
    end if;
    v := public.hr_buy_hero_slot__ungated(5, 0, null);
    if v->>'error' <> 'unknown_slot' then
      raise exception 'GATE(h): slot 5 is past the hard cap and was not refused: %', v;
    end if;

    -- THE LADDER: slot 2 before slot 1 is refused BY NAME and charges nothing.
    v := public.hr_buy_hero_slot__ungated(2, 0, null);
    if v->>'error' <> 'requires_previous_slot' or (v->>'requires')::int <> 1 then
      raise exception 'GATE(h): the ladder did not hold — slot 2 answered %', v;
    end if;
    select gems into v_g from public.player_state where user_id = v_uid and slot = 0;
    if v_g <> 250 then raise exception 'GATE(h): a refused purchase moved gems (%)', v_g; end if;

    -- THE PURCHASE: 200 gems out, EXACTLY, and the account row grows the flag.
    v_idem := gen_random_uuid();
    v := public.hr_buy_hero_slot__ungated(1, 0, v_idem);
    if coalesce(v->>'ok','') <> 'true' or (v->>'gems')::bigint <> 50 then
      raise exception 'GATE(h): slot 1 did not debit correctly (expected 250-200=50): %', v;
    end if;
    if (v->>'cost')::bigint <> 200 then
      raise exception 'GATE(h): the receipt quotes cost %, the catalogue says 200', v->>'cost';
    end if;
    if not exists (select 1 from public.player_progress
                    where user_id = v_uid and slot = 0 and kind = 'flag'
                      and key = 'character_slot:1' and period_key = '' and value > 0) then
      raise exception 'GATE(h): the ownership flag row was not written on the account row';
    end if;
    -- …and the STABLE predicate sees the write its VOLATILE caller just made.
    if public.hr_hero_slots_of(v_uid) <> '[0, 1]'::jsonb then
      raise exception 'GATE(h): after buying slot 1 the account owns %, expected [0, 1]',
        public.hr_hero_slots_of(v_uid);
    end if;
    if v->'hero_slots' <> '[0, 1]'::jsonb then
      raise exception 'GATE(h): the envelope reports hero_slots %, expected [0, 1]', v->'hero_slots';
    end if;

    -- REPLAY on the same key: the ORIGINAL envelope, no second debit.
    v := public.hr_buy_hero_slot__ungated(1, 0, v_idem);
    if coalesce((v->>'replayed')::boolean, false) is not true or coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(h): the idempotent retry did not replay the original envelope: %', v;
    end if;
    select gems into v_g from public.player_state where user_id = v_uid and slot = 0;
    if v_g <> 50 then raise exception 'GATE(h): the replay RE-DEBITED (gems=%)', v_g; end if;

    -- A DIFFERENT key for a slot already owned is refused, not silently re-sold.
    v := public.hr_buy_hero_slot__ungated(1, 0, gen_random_uuid());
    if v->>'error' <> 'already_owned' then
      raise exception 'GATE(h): a re-buy was not refused: %', v;
    end if;
    select gems into v_g from public.player_state where user_id = v_uid and slot = 0;
    if v_g <> 50 then raise exception 'GATE(h): the refused re-buy moved gems (%)', v_g; end if;

    -- SHORT OF GEMS: refused by name, nothing moved, and NOT cached.
    v_idem := gen_random_uuid();
    v := public.hr_buy_hero_slot__ungated(2, 0, v_idem);
    if v->>'error' <> 'insufficient_gems' or (v->>'cost')::bigint <> 500
       or (v->>'short_by')::bigint <> 450 then
      raise exception 'GATE(h): a short purchase was not refused by name: %', v;
    end if;
    if exists (select 1 from public.player_intents where user_id = v_uid and intent_id = v_idem) then
      raise exception 'GATE(h): a REFUSAL was cached under its idempotency key — the player could '
                      'never buy it with that key once the gems arrived';
    end if;

    -- …and it becomes buyable with the SAME key once the gems arrive.
    update public.player_state set gems = 500 where user_id = v_uid and slot = 0;
    v := public.hr_buy_hero_slot__ungated(2, 0, v_idem);
    if coalesce(v->>'ok','') <> 'true' or (v->>'gems')::bigint <> 0 then
      raise exception 'GATE(h): the once-refused purchase did not complete after topping up: %', v;
    end if;

    -- THE CREATE GATE. Slot 2 is owned now, slot 3 is not.
    v := public.hr_create_character(3);
    if v->>'error' <> 'slot_not_owned' then
      raise exception 'GATE(h): THE FREE-CHARACTER MINT IS STILL OPEN — hr_create_character(3) '
                      'answered % for an account that owns [0,1,2]', v;
    end if;
    if exists (select 1 from public.player_state where user_id = v_uid and slot = 3) then
      raise exception 'GATE(h): the refused create still inserted a character row';
    end if;
    v := public.hr_create_character(2);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(h): a slot the account OWNS could not be created: %', v;
    end if;
    -- Slot 0 is free and must never need an entitlement.
    v := public.hr_create_character(0);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(h): the free slot 0 was refused by the entitlement gate: %', v;
    end if;

    -- THE ACCOUNT/CHARACTER SPLIT, EXECUTED. Everything above bought from slot
    -- 0, where the two halves coincide and prove nothing about the split. This
    -- charges the character on slot 2 and demands that the MONEY come out of
    -- that character's wallet while the ENTITLEMENT lands on the account row —
    -- the one design decision in this file, and the one a later hand is most
    -- likely to "simplify" into a single slot.
    update public.player_state set gems = 0
     where user_id = v_uid and slot = 0;
    update public.player_state set gems = (select cost_gems from public.hr_hero_slots where slot_id = 3)
     where user_id = v_uid and slot = 2;
    v := public.hr_buy_hero_slot__ungated(3, 2, gen_random_uuid());
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(h): a purchase charged to a NON-ZERO character failed: %', v;
    end if;
    select gems into v_g from public.player_state where user_id = v_uid and slot = 2;
    if v_g <> 0 then
      raise exception 'GATE(h): the CALLING character''s wallet was not the one charged (slot 2 '
                      'holds % gems, expected 0). The topbar gem chip shows the ACTIVE '
                      'character''s balance, so charging any other row takes gems the player '
                      'cannot see.', v_g;
    end if;
    select gems into v_g from public.player_state where user_id = v_uid and slot = 0;
    if v_g <> 0 then
      raise exception 'GATE(h): slot 0''s wallet moved (%) on a purchase charged to slot 2', v_g;
    end if;
    if exists (select 1 from public.player_progress
                where user_id = v_uid and kind = 'flag'
                  and key like 'character\_slot:%' and slot <> 0) then
      raise exception 'GATE(h): an ownership flag was filed under a CHARACTER rather than the '
                      'account row. A slot bought while playing Hero 3 would then be invisible '
                      'from Hero 1 and the player would be charged for it twice.';
    end if;
    if public.hr_state_of(v_uid, 0)->'hero_slots' <> public.hr_state_of(v_uid, 2)->'hero_slots' then
      raise exception 'GATE(h): hr_state_of reports % on slot 0 and % on slot 2 — the projection '
                      'is character-scoped, so the drawer would change when you switch hero',
        public.hr_state_of(v_uid, 0)->'hero_slots', public.hr_state_of(v_uid, 2)->'hero_slots';
    end if;

    -- ONE ledger row per credited purchase, and no more.
    select count(*) into v_n from public.player_ledger
     where user_id = v_uid and kind = 'hero_slot' and intent like 'hero\_slot\_buy:%';
    if v_n <> 3 then
      raise exception 'GATE(h): expected 3 hero_slot ledger rows, found %', v_n;
    end if;
    if exists (select 1 from public.player_ledger where user_id = v_uid and kind = 'hero_slot'
                and (coalesce(gold_in,0) <> 0 or coalesce(gems_in,0) <> 0
                     or coalesce(xp_in,0) <> 0 or coalesce(qty_in,0) <> 0)) then
      raise exception 'GATE(h): a hero_slot journal row claims INFLOW — this transaction mints '
                      'nothing and must not consume the accrual inflow budget';
    end if;
    if exists (select 1 from public.player_ledger where user_id = v_uid and kind = 'hero_slot'
                and coalesce((meta->>'gems')::bigint, 0) >= 0) then
      raise exception 'GATE(h): a hero_slot journal row does not record the signed NEGATIVE gem '
                      'movement in meta.gems';
    end if;

    -- THE ENVELOPE HYDRATES OWNERSHIP, in full. (The two projections were also
    -- compared against EACH OTHER above; this pins the absolute value, so a body
    -- that answered the same wrong thing on both slots is still caught.)
    if public.hr_state_of(v_uid, 0)->'hero_slots' <> '[0, 1, 2, 3]'::jsonb then
      raise exception 'GATE(h): hr_state_of(slot 0) projects hero_slots as %, expected [0,1,2,3]',
        public.hr_state_of(v_uid, 0)->'hero_slots';
    end if;

    -- THE GRANDFATHER CLAUSE, ON A SECOND ACCOUNT: a character that exists
    -- WITHOUT a flag row is owned, answers already_owned, and can still ensure.
    -- This is the production shape (0 character_slot rows, one two-character
    -- account), so without it the projection would evict a real player's hero.
    perform set_config('request.jwt.claim.sub', v_two::text, true);
    insert into auth.users (id) values (v_two) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version) values
      (v_two, 0, 0, 5000, 1), (v_two, 1, 0, 0, 1) on conflict (user_id, slot) do nothing;
    if public.hr_hero_slots_of(v_two) <> '[0, 1]'::jsonb then
      raise exception 'GATE(h): GRANDFATHER failed — an account with an existing slot-1 character '
                      'and NO flag row owns %, expected [0, 1]', public.hr_hero_slots_of(v_two);
    end if;
    v := public.hr_buy_hero_slot__ungated(1, 0, gen_random_uuid());
    if v->>'error' <> 'already_owned' then
      raise exception 'GATE(h): a GRANDFATHERED slot was not refused already_owned: %', v;
    end if;
    select gems into v_g from public.player_state where user_id = v_two and slot = 0;
    if v_g <> 5000 then
      raise exception 'GATE(h): the grandfathered refusal charged the player (gems=%)', v_g;
    end if;
    if coalesce((public.hr_create_character(1))->>'ok','') <> 'true' then
      raise exception 'GATE(h): a GRANDFATHERED character could not be ensured — the gate locked a '
                      'real player out of their own hero';
    end if;

    -- THE PREMIUM WAIVER IS OWNERSHIP, NOT A ZERO PRICE.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, updated_at)
      values (v_two, 0, 'flag', 'entitlement:hearthHall', 1, '', now())
      on conflict (user_id, slot, kind, key, period_key) do update set value = 1;
    if public.hr_hero_slots_of(v_two) <> '[0, 1, 2, 3]'::jsonb then
      raise exception 'GATE(h): Hearth Hall did not waive slots 1-3 — the account owns %',
        public.hr_hero_slots_of(v_two);
    end if;
    v := public.hr_buy_hero_slot__ungated(3, 0, gen_random_uuid());
    if v->>'error' <> 'already_owned' then
      raise exception 'GATE(h): a premium-waived slot ran a purchase instead of answering '
                      'already_owned: %', v;
    end if;
    -- …and slot 4 is NOT waived, so it still costs 1500.
    v := public.hr_buy_hero_slot__ungated(4, 0, gen_random_uuid());
    if coalesce(v->>'ok','') <> 'true' or (v->>'cost')::bigint <> 1500
       or (v->>'gems')::bigint <> 3500 then
      raise exception 'GATE(h): slot 4 is not waived by Premium and must still cost 1500: %', v;
    end if;

    -- CONTROL: A PENNILESS ACCOUNT BUYS NOTHING. Without it, every assertion
    -- above is satisfied by a function that grants to everybody. Slot 4 is the
    -- only rung the main account does not already own, so it is the only one
    -- whose refusal can be about the MONEY rather than about ownership.
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    update public.player_state set gems = 0 where user_id = v_uid;
    v := public.hr_buy_hero_slot__ungated(4, 0, gen_random_uuid());
    if v->>'error' <> 'insufficient_gems' then
      raise exception 'GATE(h): CONTROL failed — a penniless account was sold a slot: %', v;
    end if;

    raise exception using errcode = 'HR820', message = 'hero-slot-buy §10 complete — rolling back';
  exception when sqlstate 'HR820' then
    null;   -- subtransaction discarded; every probe row above is gone
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if exists (select 1 from public.player_state    where user_id in (v_uid, v_two))
     or exists (select 1 from public.player_ledger   where user_id in (v_uid, v_two))
     or exists (select 1 from public.player_progress where user_id in (v_uid, v_two))
     or exists (select 1 from public.player_intents  where user_id in (v_uid, v_two))
     or exists (select 1 from auth.users where id in (v_uid, v_two)) then
    raise exception 'GATE: §10 LEAKED a probe row';
  end if;

  -- (i) grant-hygiene clean after the addition.
  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(i): grant-hygiene reports unapproved client rpcs: %',
          v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(i): grant-hygiene reports ungated client rpcs: %',
          v_gh->'ungated_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'baseline_rows_no_longer_live') <> 0 then
        raise exception 'GATE(i): grant-hygiene reports baseline drift: %',
          v_gh->'baseline_rows_no_longer_live';
      end if;
    end;
  end if;

  raise notice 'hero-slot-buy: catalogue bound, wrapper authenticated-only, inner + engine + the '
               'ownership predicate shut out, no client write surface, no free path in the verb, '
               'gate bucket additive, envelope projects hero_slots ACCOUNT-wide, the free-character '
               'mint is CLOSED, and the executed probes cover shape / unknown / ladder / debit / '
               'replay / already_owned / insufficient-then-buyable / grandfather / premium waiver / '
               'create-gate — all green';
end $$;
