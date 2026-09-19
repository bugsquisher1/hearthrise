-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-18-retired-iap-catalogue-removal.sql
-- STAGED, NOT APPLIED — REVIEW ONLY. A REMOVAL, so Security reviews it before
-- the Coordinator applies. The rows are catalogue rows, not player rows.
--
-- WHAT THIS CLOSES
-- tests/restore-census.mjs --live-compare has been RED: production runs a
-- catalogue the repo cannot rebuild.
--   public.hr_unlock_offers   production 142   repo rebuild 139
--   public.hr_unlocks         production  82   repo rebuild  80
-- Measured read-only against nezapsylztqbbwuwembx on 2026-09-18 by a full-join
-- of the natural keys, the five extra rows are EXACTLY:
--   hr_unlock_offers  iap.remove_ads       -> entitlement:noAds
--   hr_unlock_offers  iap.offline_boost    -> entitlement:offlinePlus
--   hr_unlock_offers  iap.starter_bundle   -> theme:forest
--   hr_unlocks        entitlement:noAds
--   hr_unlocks        entitlement:offlinePlus
--
-- HOW THEY GOT THERE — not a hand-run SQL and not a missing migration.
-- b505 (Tyler, 2026-09-05: "Kill the starter bundle, remove ads, and both
-- offline boosts") removed the three products from src/data/shops.js, and
-- tools/gen-unlock-offers.mjs regenerated 2026-08-16-unlock-offers.generated.sql
-- from 94 owned rows to 91. THE REGENERATED FILE WAS NEVER RE-APPLIED. The repo
-- is correct; PRODUCTION IS STALE. The arithmetic confirms it exactly:
--   production  hr_unlock_offers by source = gen-unlock-offers 94 + gen-gold-ladders 48 = 142
--   repo        91 + 48 = 139
-- The client-side half of the removal IS guarded (the b505 battery in
-- src/features/smoke/rooms-items-and-economy.js asserts the products are absent
-- from IAP_CATALOG and from the generated catalogue), which is why this survived:
-- every guard watched the REPO and none compared the repo to the DATABASE. The
-- guard that does is restore-census --live-compare, and it is the one that found it.
--
-- WHY THIS FILE AND NOT A RE-APPLY OF THE GENERATED CATALOGUES
--   · 2026-08-16-unlock-offers.generated.sql refills scoped by `source`, so
--     re-applying it WOULD remove the three offer rows correctly. But it cannot
--     remove the two hr_unlocks rows: hr_unlocks has no `source` column.
--   · 2026-08-16-unlocks.generated.sql opens with an UNSCOPED
--     `delete from public.hr_unlocks;` and refills only its own 80. Re-applying
--     it would wipe the companion and gold-ladder unlocks that
--     2026-08-19-gold-spend-slices-2-3.sql, 2026-08-22-companion-grant.sql and
--     2026-09-05-companion-unlock-catalogue-reseed.sql add to the same table —
--     the precise incident 2026-08-16-unlock-offers.generated.sql's own header
--     records ("a regen of this file deleted all three gold-ladder families and
--     every one of those purchases became unknown_offer").
-- So the removal is TARGETED, by natural key, and touches nothing else.
--
-- ── SEVERITY: NOT AN ECONOMY HOLE, AND SAY SO PLAINLY ───────────────────────
-- Measured on production 2026-09-18, all three offer rows carry a `refusal` and
-- a NULL `gold`:
--   iap.remove_ads     refusal = namespace_unsupported:entitlement
--   iap.offline_boost  refusal = namespace_unsupported:entitlement
--   iap.starter_bundle refusal = multi_line_grant
-- The table's own CHECK constraints make `refusal is not null` equivalent to
-- gold/items/req_property_tier all NULL, and hr_unlock_buy fails closed on a
-- refused row, so NONE of the three is purchasable and no player could have
-- bought one. Verified: zero player_progress rows of kind='unlock' name any
-- `entitlement:%` key, and zero player_ledger rows carry intent 'unlock_buy:iap.%'
-- or meta->>'unlock' like 'entitlement:%'. NO PLAYER VALUE IS DESTROYED BY THIS
-- FILE — it is a DR/reproducibility defect (a restored database would run a
-- catalogue the repo cannot rebuild), not a live exploit. It is staged as a P2.
--
-- WHAT IS LOST IF THIS IS WRONG: three refused offer rows and two entitlement
-- namespace rows that nothing reads and nobody owns. Recreatable in full from
-- the literals in §2's rollback note.
--
-- ORDER: last. It touches no function body, is on no derivation chain and takes
-- over no last-toucher role. NO live-hash movement (no `create or replace`).
-- NO edge change, NO client change.
-- REVERSIBILITY: re-insert the five rows — the exact literals are in §2 below.
-- Re-applying this file is a no-op (delete of rows already absent).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0. Fail closed, and REFUSE TO RUN IF THE SHAPE IS NOT WHAT WAS MEASURED ─
-- A removal that runs against a database it does not recognise is how a targeted
-- delete becomes an incident. These gates are why this file is safe to hand to
-- the Coordinator.
do $$
declare v_n int;
begin
  if to_regclass('public.hr_unlock_offers') is null or to_regclass('public.hr_unlocks') is null then
    raise exception 'the unlock catalogue tables are absent — apply the 2026-08-16 generated files first';
  end if;

  -- (a) NOBODY OWNS THE TWO ENTITLEMENTS THIS FILE REMOVES. If a player has
  --     somehow acquired one since the 2026-09-18 measurement, this file must
  --     NOT run: removing the catalogue row under a live owner orphans their
  --     entitlement.
  --
  --     SECURITY REVIEW 2026-09-18 (S-IAP-1): this gate was written as
  --     `key like 'entitlement:%'`, i.e. it refused on ANY entitlement.
  --     Measured read-only on production the same day, the entitlement
  --     namespace has a THIRD member that this file keeps —
  --     `entitlement:hearthHall`, sold (refused, but catalogued) as
  --     `iap.hearth_hall_premium`, repo-produced and part of the 91 that stay.
  --     So the wildcard made a live, unrelated, correctly-catalogued purchase
  --     into a blocker for a DR cleanup, and it would have said "a player owns
  --     one of these" when they own none of these. Fail-closed in the safe
  --     direction, but a gate that can refuse for a reason that is not its
  --     subject is a gate people learn to widen. It now names its two targets.
  select count(*) into v_n from public.player_progress
   where kind = 'unlock' and key in ('entitlement:noAds', 'entitlement:offlinePlus');
  if v_n <> 0 then
    raise exception 'REFUSING: % player_progress unlock row(s) own entitlement:noAds or '
      'entitlement:offlinePlus. Re-triage before removing the catalogue rows.', v_n;
  end if;

  -- (a2) THE GATES ARE NOT VACUOUS. A zero count from an EMPTY table proves
  --      nothing, and "we checked and found none" is the sentence behind every
  --      removal incident. Measured 2026-09-18: player_progress holds 1,726
  --      rows of which 65 are kind='unlock', and player_ledger holds 22,169.
  --      This refuses if either table is empty, so the zeros above are real
  --      zeros rather than an artifact of pointing at nothing.
  --
  --      SCOPED TO "THERE IS SOMETHING TO REMOVE" (found by tests/schema-drift
  --      on the first draft, which replays the chain into a FRESH database).
  --      A DR restore has no players by definition, and the retired rows are
  --      absent there because the repo never builds them — so an unconditional
  --      emptiness check turns this file into a hole in disaster recovery,
  --      which is the exact defect it exists to close. The gate is about
  --      trusting a zero, and there is no zero to trust when the targets are
  --      already gone.
  if exists (select 1 from public.hr_unlock_offers
              where offer_id in ('iap.remove_ads','iap.offline_boost','iap.starter_bundle'))
     and ((select count(*) from public.player_progress where kind = 'unlock') = 0
       or (select count(*) from public.player_ledger) = 0) then
    raise exception 'REFUSING: player_progress/player_ledger are empty, so the ownership '
      'gates above are vacuous. This is not the database this removal was measured against.';
  end if;

  -- (a3) NOTHING ELSE POINTS AT THE TWO UNLOCKS. §2(d) catches an orphan after
  --      the fact and would abort the transaction, which is safe but late;
  --      naming it here means the file refuses instead of failing. Measured
  --      2026-09-18: the only referrers are the two offers removed below.
  select count(*) into v_n from public.hr_unlock_offers
   where unlock_id in ('entitlement:noAds', 'entitlement:offlinePlus')
     and offer_id not in ('iap.remove_ads', 'iap.offline_boost', 'iap.starter_bundle');
  if v_n <> 0 then
    raise exception 'REFUSING: % other offer(s) grant entitlement:noAds/offlinePlus. '
      'Removing the unlock would orphan a grant this file does not know about.', v_n;
  end if;

  -- (b) NOTHING WAS EVER BOUGHT THROUGH THEM.
  select count(*) into v_n from public.player_ledger
   where intent like 'unlock\_buy:iap.%' or meta->>'unlock' like 'entitlement:%';
  if v_n <> 0 then
    raise exception 'REFUSING: % ledger row(s) record a purchase of a retired IAP offer.', v_n;
  end if;

  -- (c) THE THREE OFFERS ARE REFUSED ROWS, i.e. unsellable. If any has acquired
  --     a price since the measurement, that is a different and much worse
  --     problem than a stale catalogue and it gets a human, not this file.
  select count(*) into v_n from public.hr_unlock_offers
   where offer_id in ('iap.remove_ads','iap.offline_boost','iap.starter_bundle')
     and (refusal is null or gold is not null);
  if v_n <> 0 then
    raise exception 'REFUSING: % retired IAP offer(s) are SELLABLE (priced, not refused). '
      'That is a live money surface, not a DR cleanup.', v_n;
  end if;
end $$;

-- ── §1. The removal, by natural key ──────────────────────────────────────
-- Offers first: hr_unlock_offers.unlock_id names the unlock, so removing the
-- unlock first would leave a dangling reference for the length of the
-- transaction. It is a LOGICAL reference, not a declared one — measured
-- read-only 2026-09-18, pg_constraint holds NO foreign key anywhere in the
-- database whose confrelid is hr_unlocks or hr_unlock_offers, which is also the
-- answer to "could this delete cascade into a player table": it cannot, there is
-- no cascade to follow. The ordering is still right, and §2(d) proves it.
-- Idempotent: a re-apply deletes nothing and raises nothing.
delete from public.hr_unlock_offers
 where offer_id in ('iap.remove_ads', 'iap.offline_boost', 'iap.starter_bundle');

-- `theme:forest` is deliberately NOT removed — it is a live, repo-reproduced
-- unlock that iap.starter_bundle merely pointed at. Only the two entitlement
-- namespace rows, which the repo stopped producing at b505, go.
delete from public.hr_unlocks
 where unlock_id in ('entitlement:noAds', 'entitlement:offlinePlus');

-- ── §2. SELF-CHECK — asserted by EXECUTING, not by markers ───────────────
-- ROLLBACK LITERALS (the whole of the reversal, for the review):
--   insert into public.hr_unlocks (unlock_id, namespace, merge, progress_kind, max_value, rungs)
--     values ('entitlement:noAds','entitlement',…), ('entitlement:offlinePlus','entitlement',…);
--   insert into public.hr_unlock_offers
--     (offer_id, table_name, name, unlock_id, value, gold, items, req_property_tier, refusal, source)
--     values ('iap.remove_ads','iap','Remove Ads','entitlement:noAds',1,
--             null,null,null,'namespace_unsupported:entitlement','gen-unlock-offers'),
--            ('iap.offline_boost','iap','Lifetime Offline+','entitlement:offlinePlus',1,
--             null,null,null,'namespace_unsupported:entitlement','gen-unlock-offers'),
--            ('iap.starter_bundle','iap','Starter Bundle','theme:forest',1,
--             null,null,null,'multi_line_grant','gen-unlock-offers');
do $$
declare v_n int;
begin
  -- (a) the five rows are gone
  select count(*) into v_n from public.hr_unlock_offers
   where offer_id in ('iap.remove_ads','iap.offline_boost','iap.starter_bundle');
  if v_n <> 0 then raise exception 'e1: % retired IAP offer row(s) survive', v_n; end if;

  select count(*) into v_n from public.hr_unlocks
   where unlock_id in ('entitlement:noAds','entitlement:offlinePlus');
  if v_n <> 0 then raise exception 'e2: % retired entitlement unlock row(s) survive', v_n; end if;

  -- (b) NOTHING ELSE WENT WITH THEM. This is the assertion that makes a
  --     targeted delete reviewable: the gold-ladder family and the rest of the
  --     generated catalogue must be exactly as they were.
  select count(*) into v_n from public.hr_unlock_offers where source = 'gen-gold-ladders';
  if v_n <> 48 then
    raise exception 'e3: gen-gold-ladders offers = %, expected 48 — the removal took a neighbour', v_n;
  end if;
  select count(*) into v_n from public.hr_unlock_offers where source = 'gen-unlock-offers';
  if v_n <> 91 then
    raise exception 'e4: gen-unlock-offers offers = %, expected 91 (the b505 catalogue)', v_n;
  end if;

  -- (c) THE CENSUS NUMBERS. These are the two figures restore-census
  --     --live-compare compares, and after this file production equals the
  --     repo rebuild. Asserted here so the apply itself proves the close.
  select count(*) into v_n from public.hr_unlock_offers;
  if v_n <> 139 then raise exception 'e5: hr_unlock_offers = %, expected 139', v_n; end if;
  select count(*) into v_n from public.hr_unlocks;
  if v_n <> 80 then raise exception 'e6: hr_unlocks = %, expected 80', v_n; end if;

  -- (d) no offer is left pointing at an unlock that no longer exists
  select count(*) into v_n from public.hr_unlock_offers o
   where o.unlock_id is not null
     and not exists (select 1 from public.hr_unlocks u where u.unlock_id = o.unlock_id);
  if v_n <> 0 then
    raise exception 'e7: % offer(s) reference a missing unlock — the removal orphaned a grant', v_n;
  end if;

  -- (e) theme:forest is STILL THERE (it was a neighbour, not a target)
  if not exists (select 1 from public.hr_unlocks where unlock_id = 'theme:forest') then
    raise exception 'e8: theme:forest was removed — it is a live unlock, not a retired one';
  end if;

  raise notice 'retired-iap-catalogue-removal self-check PASSED (e1-e8): 5 rows removed, '
               'offers 142->139, unlocks 82->80, no neighbour touched';
end $$;
