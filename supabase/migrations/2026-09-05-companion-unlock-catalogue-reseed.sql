-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — RESEED THE 17 NON-SHOP COMPANION ROWS INTO public.hr_unlocks
--   Closes the restore-census live-compare divergence (production 65 rows /
--   repo rebuild 82; the whole delta namespace='companion', 4 vs 21).
--
-- ── THE FINDING, MEASURED ───────────────────────────────────────────────
-- Production carries 65 hr_unlocks rows; a full repo replay produces 82. A
-- FULL-JOIN fingerprint diff of all 82 ids against production (2026-08-30,
-- read-only) returned exactly SEVENTEEN differences, all of one class:
--   MISSING_IN_PROD  companion:{badger,beaver,bunny,dragonling,forge_imp,
--     grave_wisp,hawk,heron,lichling,phoenix_chick,rock_golem,scorpion,
--     silkling,squirrel,tortoise,whelp,wolf_pup}   repo shape companion|max|unlock|1|{1}
-- Zero SHAPE_DIFF, zero EXTRA_IN_PROD. The other 65 rows match by value.
--
-- ── ROOT CAUSE: A WHOLESALE CATALOGUE OWNER WAS RE-APPLIED ──────────────
-- These 17 rows are §1 of 2026-08-22-companion-grant.sql (b453, committed
-- 2026-08-22 22:31). §2 (public.hr_companion_grants, 17 rows) and §3
-- (public.hr_companion_grant) of that same file ARE on production — so the
-- file applied, and its own §1 landed with it.
--
-- They were then DESTROYED. 2026-08-16-unlocks.generated.sql opens its seed
-- block with an unscoped `delete from public.hr_unlocks;` and refills the
-- table with only the 62 ids it owns. It was regenerated on 2026-08-23
-- (commit 59bfb31a, b459 — `trait:auto_eat_2` added, its own self-check moved
-- 61 -> 62) and re-applied. That delete took every row three LATER migrations
-- had added. Two of the three were re-applied afterwards to repair the
-- collateral damage; 2026-08-22-companion-grant.sql was not.
--
-- The evidence is in the heap, and it is unambiguous. Production's hr_unlocks
-- holds exactly THREE distinct xmin values — three writing transactions, ever:
--   xmin 472079  58 rows  every namespace the generated file owns, INCLUDING
--                         trait:auto_eat_2 (which did not exist before
--                         2026-08-23) -> this wholesale refill ran ON OR AFTER
--                         2026-08-23, i.e. AFTER b453
--   xmin 496996   3 rows  bank · plot:farm_land · worker_hire
--                         (2026-08-19-gold-spend-slices-2-3.sql, re-applied)
--   xmin 528793   4 rows  the four SHOP companions
--                         (2026-08-19-companion-unlocks.sql §4, re-applied)
-- There is no fourth transaction. Nothing on production ever re-inserted the
-- 17. hr_unlocks' autovacuum fired 2026-08-23 08:52:49Z — between the first
-- and second of those transactions — which is the delete churn itself.
--
-- ⚠ THE NEAR-MISS, RECORDED because §2(c) below is the pin for it. The
--   generated file lists the four SHOP companions as ('companion','flag',
--   'flag',null,null) while 2026-08-19-companion-unlocks.sql §4 upserts them
--   as ('companion','max','unlock',1,{1}) — the rung ladder hr_unlock_buy
--   actually sells. Between xmin 472079 and xmin 528793 production's four shop
--   companions were FLAG-shaped, i.e. unsellable-by-rung. Nobody noticed. The
--   two files disagree about the same four ids in the repo TODAY and the
--   rebuild is correct only because apply order happens to favour the second.
--
-- ── WHY THE REPO WINS THIS DIVERGENCE (the decision rule) ───────────────
-- When repo and production disagree about a seeded catalogue, the side that
-- wins is the side the ALREADY-APPLIED halves of the same change depend on.
-- Shrinking the repo is correct only when the divergent rows were authored
-- ahead of a feature whose other halves are ALSO unshipped. That is not this:
--   · public.hr_companion_grants (the 17-row security allowlist) is LIVE;
--   · public.hr_companion_grant(int,text,text,uuid) is LIVE and granted to
--     `authenticated`;
--   · src/net/goal-claim.js grantCompanion() calls it, fired from
--     src/features/companions.js maybeServerGrant();
--   · src/net/accrue.js reconcileCompanions() REPLACES G.companions from the
--     server owned-set under the capstone arm (src/net/capstone.js
--     BLOB_RETIRED = true, and isServerAccrualEnabled() defaults TRUE).
-- The 17 rows are not authored-ahead data. They are the missing third of a
-- shipped change, and their absence is load-bearing: player_progress's
-- BEFORE-INSERT trigger player_progress_unlock_guard refuses a kind='unlock'
-- row whose key is not in hr_unlocks. PROVEN on production 2026-08-30 in a
-- self-aborting DO block (synthetic uuid, nothing written):
--     companion:badger  -> 23514 / unknown_unlock: companion:badger
--     companion:sparrow -> 23503 / FK    (control: the guard PASSED)
-- hr_companion_grant has no exception handler, so every legitimate non-shop
-- acquisition raises instead of returning a machine code, writes no row, and
-- the companion is DROPPED from G.companions on the next reload — precisely
-- the player loss b453 was written to prevent. Not yet hit only because no
-- player has acquired one since 2026-08-23 (0 companion:% unlock rows, 0
-- companion_grant ledger rows, and `fox` — owned by grammar — is the only
-- equipped companion across all 35 characters).
--
-- ── WHAT THIS FILE DOES, AND WHAT IT DELIBERATELY DOES NOT ──────────────
--   DOES: insert one single-rung [1] max-merge hr_unlocks row per row of
--         public.hr_companion_grants — DERIVED from that table, not restated
--         as a literal, so the storage catalogue and the security allowlist
--         are structurally incapable of disagreeing. The derived set is then
--         pinned BY VALUE against the seventeen expected ids (b493 rule: a
--         cardinality is not a pin).
--   DOES NOT: touch any other hr_unlocks row, any grant, any policy, any
--         function, any offer, or any player row. It adds NO price and NO
--         purchasable offer — see §2(e). It is 17 INSERTs and nothing else.
--   DOES NOT: re-apply a wholesale catalogue owner. That operation is what
--         caused this, and running 2026-08-16-unlocks.generated.sql to
--         "refresh" the catalogue would destroy these 17 rows again plus the
--         three gold-ladder rows, and silently flag-shape the four shop
--         companions. tests/unlock-catalogue-ownership.mjs now replays that
--         exact operation and proves both the blast radius and the repair.
--
-- ── ECONOMY / EXPLOIT-SURFACE DELTA (for the Security pass) ─────────────
-- Seeding these rows ARMS an already-live, already-client-callable RPC that
-- is currently inert by accident. That is a real surface change and it is
-- stated rather than buried:
--   · NOT a shop-shelf change. None of the 17 has a row in hr_unlock_offers
--     (companion offers = 4, all shop). No gold or gem price is added; there
--     is nothing new to buy. §2(e) asserts that NO id is both grantable and
--     priced, so a free grant can never shadow a priced offer.
--   · The mint gate is unchanged: hr_companion_grants. A shop companion and
--     an unknown id are both refused 'not_grantable' exactly as today.
--   · What DOES become reachable: hr_companion_grant has no server-verifiable
--     precondition for 16 of the 17 (only `whelp` has req_item dragon_egg,
--     and that consume is best-effort/fail-open by that file's own design).
--     An authenticated caller can therefore obtain any of the 17 without
--     meeting the drop/skill/quest/boss condition the client checks.
--   · MEASURED magnitude of that, by evaluating src/core/companion-perk.js —
--     the ONLY companion channel the accrual prices (hr_perks_of returns
--     {id,xp} bookkeeping; accrual.js bonusFor = base(key) + comp(key)).
--     Server-priced, base -> companion-level-30:
--       lichling      allXP       0.01 -> 0.0245   (identical to the FREE
--                                                   starter fox — net 0)
--       beaver/heron/rock_golem   gatherSpeed 0.01 -> 0.0245
--       forge_imp     smithSpeed  0.01 -> 0.0245
--       phoenix_chick cookSpeed   0.01 -> 0.0245
--       grave_wisp    prayerSpeed 0.01 -> 0.0245
--       silkling      craftSpeed  0.01 -> 0.0245
--       bunny/squirrel farmYield  1    -> 2.45
--       badger · dragonling · hawk · scorpion · tortoise · whelp · wolf_pup
--                     SERVER-PRICED: NOTHING (their strB/atkB/defB/crit/
--                     rareDrop keys are not in the server perk channel), so
--                     dragonling's rareDrop 0.15 does NOT reach the drop roll
--     Exactly ONE companion equips at a time (player_state.companion_equipped
--     is a single column, written only by hr_companion_equip behind an
--     ownership check), so the ceiling per character is ONE of the above.
--   · The concrete economic bypass is therefore: a free grant of beaver /
--     heron / rock_golem substitutes for sparrow (5,000 g), phoenix_chick for
--     honeybee (8,000 g, cooking 25) and grave_wisp for owl (8,000 g,
--     prayer 50). raccoon (25,000 g, goldFind) has no free equivalent. Worst
--     case: one 8,000-gold sink bypassed, once, per character.
--   · ⚠ b453's header asserts these grants are "self-only-cosmetic (their
--     perks are not server-projected)". That is TRUE for the combat-stat and
--     rareDrop pets and FALSE for the nine speed/xp/yield pets above —
--     2026-08-20-companion-model.sql wired the companion channel into
--     hr_perks_of two days BEFORE b453 was written. The premise Security
--     passed b453 on was already stale on the day. Re-rule on the list above,
--     not on that sentence.
--   · If that surface is judged unacceptable, the correct remedy is a
--     server-verifiable precondition inside hr_companion_grant (e.g. gate
--     source_kind='skill' on hr_level_from_xp over player_skills, the exact
--     read 2026-08-19-companion-unlocks.sql's skill gate already uses) —
--     NOT withholding the storage rows, which only converts a design question
--     into a 23514 and a player-visible data loss.
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────
--   delete from public.hr_unlocks
--    where unlock_id in (select 'companion:' || companion_id
--                          from public.hr_companion_grants);
-- Nothing else changed, so that is the whole undo. It is safe while no
-- kind='unlock' companion:<id> row exists in player_progress for the 17; once
-- one does, deleting the catalogue row would strand it (hr_unlock_guard would
-- then refuse any UPDATE to it) — so undo BEFORE the first grant, or delete
-- the player rows in the same transaction.
--
-- ── APPLY AFTER ─────────────────────────────────────────────────────────
--   2026-08-11-player-state.sql            (player_progress)
--   2026-08-16-unlocks.generated.sql       (public.hr_unlocks)
--   2026-08-16-artisan-progress-model.sql  (player_progress_unlock_guard)
--   2026-08-22-companion-grant.sql         (hr_companion_grants + the RPC)
-- and it must run AFTER any re-apply of 2026-08-16-unlocks.generated.sql.
--
-- NO EDGE REDEPLOY. No src/core, src/data or supabase/functions change.
-- SAFE TO RE-RUN. Idempotent: an upsert of a fixed derived set.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ───────────────────────────────────────
do $$
declare v_n int;
begin
  if to_regclass('public.hr_unlocks') is null then
    raise exception 'hr_unlocks is absent — apply 2026-08-16-unlocks.generated.sql first';
  end if;
  if (select count(*) from public.hr_unlocks) = 0 then
    raise exception 'hr_unlocks exists but is EMPTY. This file SEEDS INTO the catalogue, it does '
                    'not create it; running it against an empty table would leave a catalogue '
                    'holding nothing but companions and every recipe/room/property permanently '
                    'locked. Re-apply 2026-08-16-unlocks.generated.sql, then the two 2026-08-19 '
                    'gold-spend files, then this.';
  end if;

  if to_regclass('public.hr_companion_grants') is null then
    raise exception 'hr_companion_grants is absent — apply 2026-08-22-companion-grant.sql first. '
                    'THIS FILE DERIVES ITS ROWS FROM THAT TABLE; without it there is nothing to '
                    'seed and a literal list here would be a second copy of the allowlist.';
  end if;
  select count(*) into v_n from public.hr_companion_grants;
  if v_n <> 17 then
    raise exception 'hr_companion_grants holds % rows, expected 17. The storage catalogue is '
                    'derived from the SECURITY allowlist, so a changed allowlist must be reviewed '
                    'before its rows are given a storable home.', v_n;
  end if;

  if to_regprocedure('public.hr_companion_grant(int,text,text,uuid)') is null then
    raise exception 'hr_companion_grant is absent — apply 2026-08-22-companion-grant.sql first. '
                    'Without that RPC these rows have no writer and this file would be decoration.';
  end if;

  -- The reason the missing rows are FATAL rather than cosmetic. If the storage
  -- guard is not attached, an uncatalogued kind='unlock' row would be accepted
  -- and this whole file would be solving a problem that does not exist — which
  -- would mean the model had changed under it.
  if not exists (select 1 from pg_trigger where tgrelid = 'public.player_progress'::regclass
                  and tgname = 'player_progress_unlock_guard' and not tgisinternal) then
    raise exception 'player_progress_unlock_guard is absent — apply '
                    '2026-08-16-artisan-progress-model.sql first. It is the trigger that refuses '
                    'a companion:<id> unlock row while its catalogue row is missing, i.e. the '
                    'entire reason this file exists.';
  end if;

  -- The four SHOP companions must already carry the rung shape hr_unlock_buy
  -- sells. If they are flag-shaped, the wholesale catalogue owner was
  -- re-applied and 2026-08-19-companion-unlocks.sql has NOT been re-applied
  -- after it — seeding on top of that would leave a half-repaired catalogue
  -- and hide the shop breakage behind a green companion count.
  -- Counted, not "no bad row exists": an ABSENT shop row would satisfy a
  -- not-exists check vacuously, and absent is the state a wholesale wipe with
  -- no refill leaves behind. Four rows, right shape, or refuse.
  select count(*) into v_n from public.hr_unlocks
   where namespace = 'companion'
     and unlock_id in ('companion:honeybee','companion:owl','companion:raccoon','companion:sparrow')
     and merge = 'max' and progress_kind = 'unlock'
     and max_value = 1 and rungs = array[1]::int[];
  if v_n <> 4 then
    raise exception 'only % of the 4 SHOP companions are rung-shaped in hr_unlocks. '
                    '2026-08-16-unlocks.generated.sql lists them as flag/flag; '
                    '2026-08-19-companion-unlocks.sql §4 upserts them to max/unlock/1/{1}, which '
                    'is what hr_unlock_buy sells. Re-apply 2026-08-19-companion-unlocks.sql '
                    'BEFORE this file.', v_n;
  end if;
end $$;

-- ── 1. THE SEED — DERIVED FROM THE ALLOWLIST, NEVER RESTATED ─────────────
-- One single-rung [1] max-merge ladder per grantable companion. Identical in
-- shape to the SHOP companions (2026-08-19-companion-unlocks.sql §4) so the
-- storage guard, hr_companion_equip's ownership gate and hr_state_of's `owned`
-- projection all recognise them without a special case.
--
-- WHY DERIVED AND NOT A LITERAL LIST: public.hr_companion_grants is itself
-- generated from src/data/companions.js by tools/gen-companion-grants.mjs and
-- is server-owned reference data with no client write path. Deriving from it
-- makes "every grantable companion has a storable home" true BY CONSTRUCTION
-- rather than by two lists agreeing. The by-value pin in §2(a) is what stops
-- that becoming a way to seed something unreviewed.
--
-- `do update` rather than `do nothing`: a row that exists with the WRONG shape
-- is the failure mode that flag-shaped the shop companions for five days, and
-- re-syncing it is the point of a re-run. Scoped to the derived set only.
insert into public.hr_unlocks (unlock_id, namespace, merge, progress_kind, max_value, rungs)
select 'companion:' || g.companion_id, 'companion', 'max', 'unlock', 1, array[1]::int[]
  from public.hr_companion_grants g
on conflict (unlock_id) do update
  set namespace     = excluded.namespace,
      merge         = excluded.merge,
      progress_kind = excluded.progress_kind,
      max_value     = excluded.max_value,
      rungs         = excluded.rungs
where (public.hr_unlocks.namespace, public.hr_unlocks.merge, public.hr_unlocks.progress_kind,
       public.hr_unlocks.max_value, public.hr_unlocks.rungs)
      is distinct from
      (excluded.namespace, excluded.merge, excluded.progress_kind,
       excluded.max_value, excluded.rungs);

-- ── 2. SELF-VERIFICATION — the load-bearing properties, asserted ─────────
do $$
declare
  v_missing text;
  v_n       int;
  v_res     text;
  v_state   text;
  v_uid     constant uuid := '00000000-0000-4000-8000-0000feed0001';  -- synthetic; never inserted
  -- (a) THE BY-VALUE PIN. b493's rule: a cardinality is not a pin. The set is
  --     derived in §1, so this is what stops a tampered/extended allowlist
  --     quietly minting storage homes for ids nobody reviewed.
  c_expect constant text[] := array[
    'companion:badger','companion:beaver','companion:bunny','companion:dragonling',
    'companion:forge_imp','companion:grave_wisp','companion:hawk','companion:heron',
    'companion:lichling','companion:phoenix_chick','companion:rock_golem','companion:scorpion',
    'companion:silkling','companion:squirrel','companion:tortoise','companion:whelp',
    'companion:wolf_pup'];
begin
  -- (a) the derived set IS the reviewed set, by value, both directions.
  select string_agg(x, ', ' order by x) into v_missing from (
    select unnest(c_expect) x
    except
    select 'companion:' || companion_id from public.hr_companion_grants) d;
  if v_missing is not null then
    raise exception '§2(a): the allowlist no longer carries: %', v_missing;
  end if;
  select string_agg(x, ', ' order by x) into v_missing from (
    select 'companion:' || companion_id x from public.hr_companion_grants
    except
    select unnest(c_expect)) d;
  if v_missing is not null then
    raise exception '§2(a): the allowlist carries ids this file was not reviewed against: %. '
                    'Seeding storage for an unreviewed grantable companion is a free perk nobody '
                    'signed off. Update c_expect deliberately, with a Security pass.', v_missing;
  end if;

  -- (b) every one of them landed, with the EXACT shape, not merely present.
  select string_agg(x, ', ' order by x) into v_missing from (
    select unnest(c_expect) x
    except
    select unlock_id from public.hr_unlocks
     where namespace = 'companion' and merge = 'max' and progress_kind = 'unlock'
       and max_value = 1 and rungs = array[1]::int[]) d;
  if v_missing is not null then
    raise exception '§2(b): these ids are absent or mis-shaped in hr_unlocks: %', v_missing;
  end if;

  -- (c) THE NEAR-MISS PIN. The four shop companions still carry the rung shape
  --     hr_unlock_buy sells. §0 checked this before the write; this checks that
  --     §1 did not disturb it.
  select count(*) into v_n from public.hr_unlocks
   where unlock_id in ('companion:honeybee','companion:owl','companion:raccoon','companion:sparrow')
     and merge = 'max' and progress_kind = 'unlock' and max_value = 1 and rungs = array[1]::int[];
  if v_n <> 4 then
    raise exception '§2(c): % of 4 shop companions carry the rung ladder hr_unlock_buy sells', v_n;
  end if;

  -- (d) the catalogue as a whole. 21 companion rows (17 grantable + 4 shop).
  --     The TOTAL is deliberately NOT pinned to 82: pinning a whole-table count
  --     in a file that owns 17 rows is exactly the mistake that let the
  --     wholesale owner's "expected 62" pass after it had destroyed 20 rows.
  select count(*) into v_n from public.hr_unlocks where namespace = 'companion';
  if v_n <> 21 then
    raise exception '§2(d): namespace=companion holds % rows, expected 21 (17 grantable + 4 shop)', v_n;
  end if;

  -- (e) THE ECONOMY INVARIANT. A companion may be GRANTABLE (free, allowlist)
  --     or PRICED (an hr_unlock_offers row hr_unlock_buy sells) — never both,
  --     or the free path silently undercuts the gold sink.
  select string_agg(o.unlock_id, ', ' order by o.unlock_id) into v_missing
    from public.hr_unlock_offers o
    join public.hr_companion_grants g on o.unlock_id = 'companion:' || g.companion_id;
  if v_missing is not null then
    raise exception '§2(e): these companions are BOTH free-grantable and sold for gold: %. '
                    'The free path makes the purchase pointless.', v_missing;
  end if;

  -- (f) NO CLIENT WRITE SURFACE was opened on the catalogue. This file writes
  --     rows; it must not have moved a policy or a grant.
  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'hr_unlocks' and cmd <> 'SELECT';
  if v_n <> 0 then
    raise exception '§2(f): hr_unlocks has % non-SELECT policies — the unlock catalogue is '
                    'server-owned reference data', v_n;
  end if;
  select string_agg(r, ', ') into v_missing
    from unnest(array['public','anon','authenticated','service_role','hr_engine']) r
   where has_table_privilege(r, 'public.hr_unlocks', 'INSERT')
      or has_table_privilege(r, 'public.hr_unlocks', 'UPDATE')
      or has_table_privilege(r, 'public.hr_unlocks', 'DELETE')
      or has_table_privilege(r, 'public.hr_unlocks', 'TRUNCATE');
  if v_missing is not null then
    raise exception '§2(f): these roles can write the unlock catalogue: %', v_missing;
  end if;

  -- (g) the WRITER of these rows is unchanged. hr_companion_grant stays
  --     authenticated-only: not anon, not service_role, and above all not
  --     hr_engine — the accrual engine must never grant a companion.
  if not has_function_privilege('authenticated',
        to_regprocedure('public.hr_companion_grant(int,text,text,uuid)'), 'execute') then
    raise exception '§2(g): hr_companion_grant is not executable by authenticated — these rows '
                    'would have no client writer';
  end if;
  select string_agg(r, ', ') into v_missing
    from unnest(array['public','anon','service_role','hr_engine']) r
   where has_function_privilege(r,
           to_regprocedure('public.hr_companion_grant(int,text,text,uuid)'), 'execute');
  if v_missing is not null then
    raise exception '§2(g): hr_companion_grant is executable by: %', v_missing;
  end if;

  -- ── (h) BEHAVIOURAL. Does the storage guard now ACCEPT what it refused?
  --    Four probes against a SYNTHETIC user id. player_progress_unlock_guard is
  --    a BEFORE INSERT trigger, so it decides before the foreign key does:
  --    reaching 23503 (FK) means the guard PASSED, and 23514 means it refused.
  --    Every probe therefore fails by design and NOTHING is ever written — no
  --    character is needed and no real player row is touched. Verified as a
  --    technique against production 2026-08-30 before this file was written.
  begin
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', 'companion:badger', '', 1);
    v_state := 'INSERTED';                            -- unreachable: the FK must fire
  exception when others then v_state := sqlstate;
  end;
  if v_state <> '23503' then
    raise exception '§2(h)(i): companion:badger is still refused by the storage guard (%) — the '
                    'seed did not take', v_state;
  end if;

  begin
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', 'companion:__not_a_companion__', '', 1);
    v_state := 'INSERTED'; v_res := '';
  exception when others then v_state := sqlstate; v_res := sqlerrm;
  end;
  if v_state <> '23514' or v_res not like 'unknown_unlock%' then
    raise exception '§2(h)(ii) NEGATIVE CONTROL: an UNCATALOGUED companion id was not refused '
                    '(% / %). The seed must open the gate for seventeen ids, not for the '
                    'namespace.', v_state, v_res;
  end if;

  begin
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'unlock', 'companion:badger', '', 2);
    v_state := 'INSERTED'; v_res := '';
  exception when others then v_state := sqlstate; v_res := sqlerrm;
  end;
  if v_state <> '23514' or v_res not like 'unlock_over_ceiling%' then
    raise exception '§2(h)(iii): a value off the single-rung ladder was not refused (% / %)',
                    v_state, v_res;
  end if;

  begin
    insert into public.player_progress (user_id, slot, kind, key, period_key, value)
      values (v_uid, 0, 'flag', 'companion:badger', '', 1);
    v_state := 'INSERTED'; v_res := '';
  exception when others then v_state := sqlstate; v_res := sqlerrm;
  end;
  if v_state <> '23514' or v_res not like 'unlock_wrong_kind%' then
    raise exception '§2(h)(iv): the merge-rule pin did not hold — companion ownership stored as a '
                    'flag would inherit hr_apply''s ADDITIVE merge (% / %)', v_state, v_res;
  end if;

  raise notice 'companion-unlock reseed PASSED: 17 grantable companions have a storable home '
               '(max/unlock/1/{1}); the 4 shop companions keep the rung ladder hr_unlock_buy '
               'sells; no id is both grantable and priced; no client write surface; '
               'hr_companion_grant still '
               'authenticated-only; the guard accepts the seventeen and still refuses an '
               'uncatalogued id, an off-ladder value and a wrong kind.';
end $$;
