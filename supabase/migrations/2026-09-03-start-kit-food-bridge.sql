-- 2026-09-03-start-kit-food-bridge.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- The Coordinator applies this by hand (Management API / execute_sql wrapped in
-- begin/commit). It is a THREE-ROW DATA FIX on a content catalogue. It mints
-- nothing for an existing character — hr_start_inventory is read ONCE, by
-- hr_create_character, at character creation — so it is not a money surface,
-- but it DOES change what every account created after it holds.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- THE DEFECT (Game Designer, full balance audit 2026-08-30, ahead of the beta
-- wave). The starting kit carried `shrimp: 8` — RAW shrimp, heals 3 — which is
-- 24 HP of buffer on a character whose maxHp is 10. Measured against the real
-- engine (src/core/combat-sim.js, seeded, fresh save, bronze sword, Accurate
-- style), damage taken per kill and kills survived unaided:
--
--     Slime     2.06 dmg/kill   4.8 kills      Goblin    4.94   2.0 kills
--     Wolf Cub  9.36 dmg/kill   1.1 kills      (i.e. the FIRST Wolf Cub)
--
-- Two goblins and the death sheet — 36 deaths in a measured first thirty
-- minutes of attended play. AWAY was the P0 half: `simulateSpan` BREAKS on the
-- first death, so a brand-new player who left a fight running overnight was
-- credited **30 seconds of a twelve-hour night** (0.1%, 23 XP, 0 gold). The
-- idle pillar was off by default for every new account.
--
-- THE RULING: a food BRIDGE, not a food supply.
--     shrimp         8 -> 10      (the INPUT half — `first_cook` wants 5 dishes
--                                  and cook_shrimp is the level-1 recipe)
--     cooked_shrimp  0 -> 20      (heals 8 each = 160 HP, ~34 goblin kills)
-- Enough to finish `first_blood` (5 kills), a first-contract bounty (15-25
-- kills) and ~14 minutes of a first away night without a single death; NOT
-- enough to avoid learning the loop, which is the point — it runs out inside
-- session one and the lesson "fish, then cook, then fight" lands from an empty
-- food slot rather than from a corpse.
--
-- The authoring source is src/data/start-kit.js START_INVENTORY (read the
-- ruling there); the repo's 2026-08-11-catalogue.generated.sql was regenerated
-- in the same commit so a REBUILD is correct, and smoke B338-1 binds the
-- client's fresh-`G` literal to the same three numbers.
--
-- ── WHY NOT JUST RE-APPLY 2026-08-11-catalogue.generated.sql ──────────────
-- Because that file OWNS eleven catalogues and refills every one of them
-- wholesale (`delete from hr_items` … `delete from hr_start_inventory`). On
-- production that is a 515-item, 473-activity, 275-slot-pair replacement to
-- move three rows in a four-row table — every one of which is a chance to
-- revert a hand-patched divergence the way re-applying
-- 2026-08-23-modal-goal-claims.sql would revert the b464 gold_500 fix. Narrow
-- forward migration, same shape as 2026-09-01-kill-goal-xp-hitpoints.sql.
--
-- ── FAIL CLOSED, AND IDEMPOTENT ───────────────────────────────────────────
-- §1 refuses unless the table is EXACTLY the pre-audit kit or EXACTLY the ruled
-- kit — if production has drifted to a third shape this stops rather than
-- overwriting someone else's change. Both shapes are accepted because a repo
-- rebuild applies the regenerated catalogue first, so on a rebuilt database the
-- rows are already ruled and a run-once file would break the replay chain.
-- §3 reads the rows back and raises unless the kit is exactly right, so a
-- silent no-op is impossible.
--
-- REVERSIBILITY: `update public.hr_start_inventory set qty = 8 where item_id =
-- 'shrimp'; delete from public.hr_start_inventory where item_id =
-- 'cooked_shrimp';` — and revert the two authoring numbers in
-- src/data/start-kit.js + src/legacy.js's fresh-`G` literal in lockstep.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regclass('public.hr_start_inventory') is null then
    raise exception 'hr_start_inventory missing — apply 2026-08-11-catalogue.generated.sql first';
  end if;
  if to_regclass('public.hr_items') is null then
    raise exception 'hr_items missing — apply the catalogue first';
  end if;
  -- The new id must be a REAL, HEALING item. hr_create_character copies a row
  -- into player_inventory without asking, and the away engine's auto-eat reads
  -- hr_items.heals / auto_eatable — a kit item that healed nothing would look
  -- like a fix and change nothing at all, which is the failure this whole audit
  -- item is about.
  if not exists (select 1 from public.hr_items
                  where item_id = 'cooked_shrimp' and coalesce(heals, 0) > 0) then
    raise exception 'hr_items has no ''cooked_shrimp'' row with heals > 0 — the ruled bridge item '
                    'either is not catalogued or would heal nothing';
  end if;
  if not exists (select 1 from public.hr_items where item_id = 'shrimp') then
    raise exception 'hr_items has no ''shrimp'' row';
  end if;
end $$;

-- ── 1. ASSERT THE LIVE SHAPE BEFORE WRITING ────────────────────────────────
-- The whole table, as a sorted fingerprint. A kit is a SET, so grading it row
-- by row would accept a production table that had gained a fourth item nobody
-- reviewed and then silently keep it.
do $$
declare
  v_now text;
  c_before constant text := 'carrot_seed:3,shrimp:8,turnip_seed:5';
  c_after  constant text := 'carrot_seed:3,cooked_shrimp:20,shrimp:10,turnip_seed:5';
begin
  select coalesce(string_agg(item_id || ':' || qty::text, ',' order by item_id), '(empty)')
    into v_now from public.hr_start_inventory;
  if v_now = c_after then
    raise notice 'hr_start_inventory already carries the ruled kit — the update below is a no-op';
  elsif v_now <> c_before then
    raise exception 'hr_start_inventory is "%" — neither the pre-audit kit "%" nor the ruled kit "%". '
                    'Production has DRIFTED from what this fix was authored against, so writing it '
                    'would destroy someone else''s change. Re-read the table and re-author this file.',
      v_now, c_before, c_after;
  end if;
end $$;

-- ── 2. THE FIX — one raise, one insert ─────────────────────────────────────
update public.hr_start_inventory set qty = 10
 where item_id = 'shrimp' and qty is distinct from 10;

insert into public.hr_start_inventory (item_id, qty) values ('cooked_shrimp', 20)
on conflict (item_id) do update set qty = excluded.qty;

-- ── 3. READ BACK — the file cannot succeed quietly ─────────────────────────
do $$
declare
  v_now  text;
  v_bad  bigint;
  v_heal bigint;
begin
  select coalesce(string_agg(item_id || ':' || qty::text, ',' order by item_id), '(empty)')
    into v_now from public.hr_start_inventory;
  if v_now <> 'carrot_seed:3,cooked_shrimp:20,shrimp:10,turnip_seed:5' then
    raise exception 'VERIFY: the starting kit did not land — %', v_now;
  end if;

  -- The generated catalogue's own invariant, re-run: every kit id is an item.
  select count(*) into v_bad from public.hr_start_inventory s
   where not exists (select 1 from public.hr_items i where i.item_id = s.item_id);
  if v_bad > 0 then
    raise exception 'VERIFY: % starting-inventory item(s) are not in hr_items', v_bad;
  end if;

  -- THE PROPERTY THE RULING ACTUALLY BUYS, stated as a number rather than a
  -- promise: the kit must carry at least 120 HP of auto-eatable healing, which
  -- is the ~24-goblin floor the audit set. A future edit that swaps the bridge
  -- for a prettier item with heals 3 fails here instead of shipping.
  select coalesce(sum(s.qty * i.heals), 0) into v_heal
    from public.hr_start_inventory s
    join public.hr_items i on i.item_id = s.item_id
   where coalesce(i.heals, 0) > 0 and i.auto_eatable;
  if v_heal < 120 then
    raise exception 'VERIFY: the starting kit carries only % HP of auto-eatable food; the ruled '
                    'floor is 120 (a fresh character takes 4.94 damage per goblin kill)', v_heal;
  end if;

  raise notice 'b495 food bridge: starting kit = 20 cooked shrimp + 10 raw shrimp (% HP of healing)', v_heal;
end $$;
