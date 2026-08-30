-- 2026-09-04-auto-eat-at-creation.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- The Coordinator applies this by hand (Management API / execute_sql wrapped in
-- begin/commit), AFTER a Security acknowledgement. Two things need the ack:
--   §1  a GRANT-SHAPED SURFACE on hr_create_character — the one RPC in the
--       system that legitimately creates something from nothing. Direction of
--       travel: a FREE convenience trait. No gold, gems, Marks, items or XP.
--   §1b a ONE-STATEMENT patch to hr_import_apply's own verification, which §1
--       makes necessary and which is reasoned out in full at that section. It
--       is not an opportunistic edit and it is not optional: without it the
--       cutover ceremony refuses every player, and the ceremony happens once.
--
-- ⚠ APPLY §1 AND §1b TOGETHER OR NEITHER. They are one change.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES, AND WHY
-- ══════════════════════════════════════════════════════════════════════════
-- THE DEFECT (Game Designer ruling, final authority — implement, do not
-- re-litigate). The last new-player death loop. A fresh character has 10 max HP
-- and takes 4.94 damage per goblin kill (measured against the real engine by the
-- 2026-08-30 balance audit); the death sheet's own advice is "unlock Auto-Eat",
-- Auto-Eat is priced in Bounty Marks, and the cheapest route to a Mark is a
-- tier-1 cull contract of 80–120 kills. The tutorial pointed at a currency the
-- first session could not reach. Worse, the AWAY half: `simulateSpan` BREAKS on
-- the first death, so a brand-new player who left a fight running overnight was
-- credited THIRTY SECONDS of a twelve-hour night. The idle pillar was off by
-- default for every new account, and the switch that turns it on cost 15 Marks.
--
-- THE RULING: every new character starts owning `auto_eat` (tier I — eats at
-- <25%, a FIXED threshold). `auto_eat_2` (100 Marks, the SETTABLE threshold)
-- stays exactly as it is. The sink is not lost; the entry tax is.
--
-- ── HOW, AND WHY IT IS TWO STATEMENTS AND NOT A COLUMN DEFAULT ────────────
-- The trait system already has exactly one shape and one writer:
--     ownership  player_progress (kind='flag', key='trait:<id>', period_key='')
--     read by    hr_auto_eat_tier(user, slot)
--     written by hr_trait_buy__ungated §8   ← the ONLY writer, until now
--     the switch hr_set_auto_eat            ← the ONLY writer of
--                                             player_state.auto_eat_*
-- So the grant is the SAME flag row hr_trait_buy writes, and the switch is set
-- with the SAME clamp expression hr_set_auto_eat evaluates. Nothing new is
-- invented and no second copy of the entitlement rule is created.
--
-- ⚠ THE SWITCH IS WRITTEN BY THE BOOTSTRAP, **NOT** BY hr_set_auto_eat — and
--   the reason is an invariant somebody else owns. hr_set_auto_eat remains the
--   single writer of `player_state.auto_eat_*` for every LATER change. But it
--   also (a) bumps `version` and (b) writes a `set_auto_eat` player_ledger row,
--   both correctly: a settings change mid-absence must invalidate an in-flight
--   accrual, and an entitlement-gated setting that changes what a night pays
--   must be auditable. At CREATION those two side effects are exactly what
--   2026-08-17-cutover-import.sql §(e) reads as the DEFINITION of "this
--   character has already played" — `version > 0`, or any non-create_character
--   ledger row dated at/after `created_at`. hr_import_apply calls
--   hr_create_character and then applies that test, so routing the switch
--   through hr_set_auto_eat makes the CUTOVER CEREMONY REFUSE EVERY PLAYER.
--
--   MEASURED, not reasoned about: the first draft of this file did call it, and
--   a full PGlite replay turned every one of tests/cutover-import.mjs's six
--   snapshots red with `character_already_played`. Restoring `version = 0`
--   afterwards fixed half of it and the ledger row still failed the other half.
--
--   So the patch writes the two columns directly. That is the bootstrap setting
--   a column of the row it is creating, in the transaction that creates it,
--   under the advisory lock — the same thing it already does for gold, gems,
--   hp, bank_cap and accrued_to, and it can never reach an existing character.
--   §2 asserts BOTH halves: that the switch is set, and that hr_set_auto_eat is
--   NOT called here, so this cannot be quietly "tidied" back.
--
-- ⚠ THE CLAMP IS DERIVED, NEVER RESTATED:
--       auto_eat_pct = hr_auto_eat_max_pct(hr_auto_eat_tier(v_uid, v_slot))
--   which is the exact expression hr_set_auto_eat evaluates. Neither the
--   ceiling (25) nor the tier (1) is written as a literal, so the day
--   AUTO_EAT_TIERS[1] moves, both paths follow it. A literal here would pay
--   every new character at a threshold they do not own.
--
-- ── ORDER MATTERS ────────────────────────────────────────────────────────
-- The flag row is written BEFORE the switch, because the clamp reads
-- hr_auto_eat_tier, which reads the flag row. Reversed, it clamps against tier
-- 0 — an entitlement the character does not yet hold.
--
-- ── WHAT THE CLIENT NEEDS: NOTHING, TO OWN IT ────────────────────────────
-- `hr_state_of` already projects the owned trait set as a flat `traits` array
-- and `src/net/accrue.js reconcileTraits` already UNIONS it into `G.traits` on
-- every envelope. So Settings' `ownsAutoEat()`, the death sheet's
-- `autoEatOwned`, the Bounty Shop's owned-row marker and
-- `HearthriseAuto.maybeAutoEat`'s `owned` gate all light up with no client
-- change at all. The client edits that DO ship alongside this are teaching copy
-- only (src/features/death-sheet.js) — listed in the change contract.
--
-- ⚠⚠ WHO EATS, AND WHO DEBITS — THIS HEADER HAS BEEN WRONG TWICE. ⚠⚠
--
--   Two reviews have now been misled by this section, so both retracted versions
--   are quoted rather than deleted: a reader who saw an earlier draft needs to
--   recognise what they read and know it is dead.
--
--   ✗ RETRACTED #1 (original draft): "this file does not turn on the CLIENT's
--     live-combat switch (`G.autoActions.eat.enabled`, default false)".
--     FALSE for the population that matters. `DEFAULTS.eat.enabled` is false,
--     but `ensureShape()` in src/features/auto-actions.js (the b163 migration
--     branch) sets `aa.eat.enabled = true` whenever `G.foodSlot` is truthy, and
--     the fresh-`G` literal in src/legacy.js carries `foodSlot:'cooked_shrimp'`
--     — which THIS PROGRAM put there in b495 (the start-kit food bridge).
--     auto-actions.js says so in its own comment.
--
--   ✗ RETRACTED #2 (the first "correction", 2026-08-30 — mine, and it is the
--     one that fooled the review): "the server's sim only eats during AWAY
--     accrual", and therefore "§1 IS SAFE ONLY IF THE ATTENDED-EAT GATE FIX
--     SHIPS IN THE SAME BUILD".
--     ALSO FALSE, and it was an inference from the WORD "away" rather than a
--     reading of the function. Acting on it would have been worse than leaving
--     it alone: the Systems Engineer built the "fix" it demanded and measured
--     that it DESTROYS items (a double debit), 1090/1091.
--
--   ── THE TRUE MODEL, read off the source rather than reasoned about ────────
--   `computeAccrual` HAS NO PRESENCE INPUT AT ALL. There is no away/attended
--   branch inside it, which is exactly why "away accrual" was the wrong noun:
--     · supabase/functions/hr-accrue/accrual.js:1084 —
--         `const autoEatOn = inp.autoEatEnabled === true;`
--       and `eatCfg = { enabled: autoEatOn, owned: autoEatOn, … }`. The gate is
--       `auto_eat_enabled` and nothing else.
--     · accrual.js:~1200 — the eat is a REAL DEBIT that rides in the delta:
--         `bag[foodId] -= 1;  itemDelta[foodId] = (itemDelta[foodId] || 0) - 1;`
--     · src/net/accrue.js `decideSettle` — `if (!st.visible) return
--       { settle:false, reason:'hidden' }`, so the 90 s settle loop
--       (`SETTLE_INTERVAL_MS = 90000`) runs ONLY while the tab is visible. Every
--       settle it performs therefore prices an ATTENDED window.
--   Put together: with `auto_eat_enabled = true` the server prices and DEBITS
--   every attended meal at each visible settle. The client's pending-consume
--   hold drains against the server's own movement instead of expiring, so there
--   is no restock and there is no free food. `clientOwnsAutoEatDebit()` refusing
--   to send is CORRECT; sending on top would debit the same meal twice, which is
--   item LOSS — strictly worse than the bug it was meant to fix.
--
--   ── WHY §1 IS SAFE ────────────────────────────────────────────────────────
--   Not because of a gate fix — there is none, and none was ever needed. §1 is
--   safe because the server OWNS and DEBITS the attended meals it enables, at
--   every visible settle, by the two lines cited above. Applying §1 does turn
--   attended auto-eat on for every new character (see retraction #1); that is
--   the intended behaviour and it is server-accounted.
--
--   PINNED, so this premise cannot be re-asserted a third time from either end:
--   branch `fix/attended-eat-intent-gate` (2087eba3, comment-only + two guards,
--   merging in the SAME BUILD as this file) adds `attendedSettleAutoEatGuard`
--   in tests/accrual-engine.mjs — the engine eats and debits on a fresh 10-HP
--   fight — and `EAT-RESTOCK-6` block 2b in src/features/smoke-test.js, which
--   turns RED if the client is ever made to send the intent while the server is
--   eating. Verified independently here before writing this paragraph: all four
--   source claims above were read, not taken on report.
--
--   The AWAY half is unaffected by any of this and is what the ruling is
--   actually buying: `player_state.auto_eat_enabled` is what the accrual engine
--   reads for a long absence too, and this file sets it.
--
-- ── §grant-existing: TRIVIAL, IDEMPOTENT, AND GATED ──────────────────────
-- The ruling covers NEW creation. Every current beta player suffered the same
-- death loop, and for them the grant is one INSERT … ON CONFLICT DO NOTHING of
-- the exact same row — genuinely trivial and genuinely idempotent, so it is
-- offered here behind its own GUC rather than invented as new scope.
-- ⚠ IT GRANTS THE FLAG ONLY. It does NOT enable auto-eat for an existing
--   character, because hr_set_auto_eat reads `auth.uid()` and cannot be called
--   for somebody else — and writing `player_state.auto_eat_*` directly would
--   make this file a SECOND writer of the column the whole tier design exists to
--   keep single-writer. An existing player gets the entitlement (the Settings
--   row unlocks); turning it on is their gesture, through the one writer.
-- The beta is wiped at cutover, so this is a courtesy to the current cohort, not
-- a migration path. Runs only with:
--     set local hearthrise.grant_auto_eat_existing = 'yes';
-- in the same transaction. Unset = skipped with a notice (fail closed).
--
-- ── REVERSIBILITY ────────────────────────────────────────────────────────
-- Mechanical. Re-apply supabase/migrations/2026-08-14-character-bootstrap.sql
-- (the last author of hr_create_character — it restores the unpatched body).
-- To also revoke the grants — and the two `not exists` clauses are BOTH
-- required, because deleting a PURCHASED entitlement is irreversible and the
-- evidence of a purchase is not permanent:
--     delete from public.player_progress pp
--      where pp.kind = 'flag' and pp.key = 'trait:auto_eat' and pp.period_key = ''
--        -- (1) the purchase itself, while it is still in the live journal
--        and not exists (select 1 from public.player_ledger l
--                         where l.user_id = pp.user_id and l.slot = pp.slot
--                           and l.intent  = 'trait_buy:auto_eat')
--        -- (2) ...and its SHADOW after the prune. THIS CLAUSE IS THE FIX FOR
--        --     F6 (Security, 2026-08-30): hr_ledger_prune deletes rows older
--        --     than hr_ledger_config.retain_days (default 90) and rolls them
--        --     into player_ledger_rollup, which keeps (user_id, slot, month,
--        --     kind, n) and DROPS `intent`. So clause (1) alone silently stops
--        --     protecting anyone who bought Auto-Eat more than ~90 days ago —
--        --     and the row that proved they paid is exactly the row that is
--        --     gone, so the mistake would also be undiagnosable.
--        and not exists (select 1 from public.player_ledger_rollup r
--                         where r.user_id = pp.user_id and r.slot = pp.slot
--                           and r.kind = 'trait' and r.n > 0);
--
-- ⚠ CLAUSE (2) IS DELIBERATELY COARSE, and the direction is the point. The
--   rollup keeps `kind`, not `intent`, so it cannot distinguish "bought
--   Auto-Eat I" from "bought Auto-Eat II" or any future trait: a character with
--   ANY long-ago trait purchase is spared. That OVER-protects — some genuinely
--   granted flags survive a rollback — which is the correct way to be wrong when
--   the other error revokes something a player paid Marks for and cannot be
--   detected afterwards.
--
--   A dedicated marker row (`trait_granted:auto_eat`) was considered and
--   REJECTED: it costs a permanent row per character, on every envelope,
--   forever, to serve a manual operation that runs at most once — and the rollup
--   is already prune-proof by construction, because the rollup is what the prune
--   WRITES. Zero storage beat 0.3 MB of insurance.
--
-- ── COST AT 100x PLAYERS ─────────────────────────────────────────────────
-- Per character created, forever: ONE player_progress row (~80 bytes, against a
-- table that already carries dozens per character) and ZERO new ledger rows —
-- the switch is an UPDATE of the row the same statement block just inserted, so
-- the creation still journals exactly one `create_character` entry. At 3,500
-- characters that is ~0.3 MB total. Journal rule 6 (game_events: 1.6M rows /
-- 229 MB from six players in four days) is about per-TICK logging; this is
-- per-character and adds no journal row at all.
--
-- ⚠ THE AUTO-EAT ENABLE IS DELIBERATELY NOT JOURNALLED SEPARATELY. It moves no
--   value (no gold, gems, Marks, items or XP), the resulting state is visible
--   in player_state and player_progress, and the create_character ledger row
--   already dates the whole bootstrap. A second row would additionally trip the
--   cutover's residue test — see above.
-- ══════════════════════════════════════════════════════════════════════════


-- ── §0. FAIL CLOSED ────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_create_character(int)') is null then
    raise exception 'hr_create_character is absent — apply 2026-08-14-character-bootstrap.sql first.';
  end if;
  -- Not called by the patch (see the header), but REQUIRED to exist: it is the
  -- writer every later change goes through, and a grant whose switch could
  -- never be toggled afterwards is a dead end rather than a feature.
  if to_regprocedure('public.hr_set_auto_eat(int,boolean,text,int,boolean)') is null then
    raise exception 'hr_set_auto_eat is absent — nothing could ever toggle the trait this file '
                    'grants. Apply 2026-08-15-auto-eat.sql + 2026-08-29-auto-eat-tiers.sql first.';
  end if;
  if to_regprocedure('public.hr_auto_eat_tier(uuid,int)') is null then
    raise exception 'hr_auto_eat_tier is absent — nothing would READ the flag row this file writes.';
  end if;
  if to_regprocedure('public.hr_auto_eat_max_pct(int)') is null then
    raise exception 'hr_auto_eat_max_pct is absent — there would be no tier-I ceiling to clamp to, '
                    'and a new character would be enabled at the column default of 50%%.';
  end if;
  if to_regclass('public.hr_traits') is null then
    raise exception 'hr_traits is absent — apply 2026-08-23-trait-buy.sql first.';
  end if;
  -- The ruling is about a SPECIFIC trait. A catalogue without it means this file
  -- would grant a flag nothing sells, prices or describes.
  if not exists (select 1 from public.hr_traits where trait_id = 'auto_eat') then
    raise exception 'hr_traits has no ''auto_eat'' row — the ruled entry tier is not catalogued.';
  end if;
  -- THE SINK THE RULING EXPLICITLY PRESERVES. If tier II ever stops existing or
  -- stops requiring tier I, making tier I free stops being "remove the entry
  -- tax" and becomes "give the whole feature away".
  if not exists (select 1 from public.hr_traits
                  where trait_id = 'auto_eat_2' and req_trait = 'auto_eat' and cost > 0) then
    raise exception 'hr_traits.auto_eat_2 is missing, free, or no longer requires auto_eat — the '
                    'paid upgrade this ruling depends on is gone, so granting tier I free would '
                    'remove a sink rather than an entry tax.';
  end if;
  if public.hr_auto_eat_max_pct(1) >= public.hr_auto_eat_max_pct(2) then
    raise exception 'hr_auto_eat_max_pct no longer distinguishes the tiers (I=%, II=%) — the free '
                    'tier would carry the paid tier''s ceiling.',
      public.hr_auto_eat_max_pct(1), public.hr_auto_eat_max_pct(2);
  end if;
end $$;


-- ── §1. THE CALL SITE ──────────────────────────────────────────────────────
-- PROGRAMMATIC, ANCHORED, FAIL-CLOSED, IDEMPOTENT. Never a template
-- restatement of a body this file did not author (the gold_500 drift rule; the
-- b484–b487 "everything refuses" wave). hr_create_character is 7.7 KB of
-- carefully-reasoned bootstrap and this file has business with exactly one
-- statement of it.
--
-- ANCHOR VERIFIED 2026-09-04 in BOTH places it has to match:
--   · production `pg_get_functiondef` (CR-stripped) — 1 hit
--   · supabase/migrations/2026-08-14-character-bootstrap.sql, the last author
--     and therefore what a repo REBUILD installs — 1 hit
--   (the two bodies are byte-identical modulo line endings and one trailing
--    space; measured, not assumed)
--
-- CR-TOLERANT. Production stores this body with CRLF — it was applied from a
-- CRLF working copy while the repo file is LF — so an LF-joined anchor matches
-- NOTHING there. Stripping CR is the only normalisation done here.
--
-- WHERE THE GRANT GOES. Immediately before the final success return, i.e. AFTER
-- the ledger row, and it deliberately does NOT widen that row's `meta`: the
-- bootstrap journal describes the KIT, tests/character-bootstrap-guard.mjs
-- compares it field-by-field against src/data/start-kit.js, and a free trait
-- that moves no value is fully described by the two rows this block writes
-- (player_progress + the player_state columns). One journal row per creation,
-- unchanged — which is also what keeps the cutover's residue test true (§1b).
do $do$
declare
  v_src text; v_new text; v_hits int;
  v_acl_before text; v_acl_after text;
  c_sig    constant text := 'public.hr_create_character(int)';
  c_anchor constant text :=
    '  return jsonb_build_object(''ok'', true, ''slot'', v_slot, ''created'', true);';
  c_repl   constant text :=
       '  -- ── THE FREE ENTRY TRAIT (Designer ruling, b497) ──────────────────' || chr(10)
    || '  -- Auto-Eat I is granted at creation. NOT because it is generous — because' || chr(10)
    || '  -- the away engine BREAKS on the first death, so a 10-max-HP character who' || chr(10)
    || '  -- leaves a fight running is credited 30 seconds of a twelve-hour night. The' || chr(10)
    || '  -- idle pillar was off by default for every new account, behind a 15-Mark' || chr(10)
    || '  -- toll that takes ~100 kills to reach. auto_eat_2 (100 Marks, the settable' || chr(10)
    || '  -- threshold) is untouched: the sink survives, the entry tax does not.' || chr(10)
    || '  --' || chr(10)
    || '  -- THE SAME ROW hr_trait_buy §8 writes — kind=''flag'', period_key='''' — which' || chr(10)
    || '  -- is the exact shape hr_auto_eat_tier reads and the player_progress unlock' || chr(10)
    || '  -- guard polices. ON CONFLICT because creation is an ENSURE and this must be' || chr(10)
    || '  -- as re-runnable as everything above it.' || chr(10)
    || '  insert into public.player_progress as pp' || chr(10)
    || '    (user_id, slot, kind, key, value, period_key, state, updated_at)' || chr(10)
    || '  values (v_uid, v_slot, ''flag'', ''trait:auto_eat'', 1, '''', null, now())' || chr(10)
    || '  on conflict (user_id, slot, kind, key, period_key)' || chr(10)
    || '    do update set value = greatest(pp.value, excluded.value), updated_at = now();' || chr(10)
    || chr(10)
    || '  -- ⚠ SWITCHED ON BY THE BOOTSTRAP, **NOT** BY hr_set_auto_eat, AND THE' || chr(10)
    || '  -- REASON IS AN INVARIANT SOMEBODY ELSE OWNS. hr_set_auto_eat is the single' || chr(10)
    || '  -- writer of these columns for every LATER change and stays so — but it also' || chr(10)
    || '  -- (a) bumps `version` and (b) writes a set_auto_eat player_ledger row, both' || chr(10)
    || '  -- correctly, because a settings change mid-absence has to invalidate an' || chr(10)
    || '  -- in-flight accrual and has to be auditable. At CREATION those two side' || chr(10)
    || '  -- effects are read by 2026-08-17-cutover-import.sql §(e) as the DEFINITION of' || chr(10)
    || '  -- "this character has already played" (version > 0, or any non-create_character' || chr(10)
    || '  -- ledger row since created_at), so calling it here makes the cutover ceremony' || chr(10)
    || '  -- refuse EVERY player. Measured on a full PGlite replay, not reasoned about:' || chr(10)
    || '  -- the first draft of this patch turned every cutover-import snapshot red.' || chr(10)
    || '  --' || chr(10)
    || '  -- This is therefore the bootstrap writing a column of the row it is creating,' || chr(10)
    || '  -- in the transaction that creates it, under the advisory lock — the same thing' || chr(10)
    || '  -- it already does for gold, gems, hp, bank_cap and accrued_to. It can never' || chr(10)
    || '  -- touch an existing character''s settings.' || chr(10)
    || '  --' || chr(10)
    || '  -- THE CLAMP IS NOT DUPLICATED: this is the exact expression hr_set_auto_eat' || chr(10)
    || '  -- evaluates, reading the tier from the flag row written immediately above, so' || chr(10)
    || '  -- neither the ceiling NOR the tier is restated here. The day' || chr(10)
    || '  -- AUTO_EAT_TIERS[1] moves, both paths follow it.' || chr(10)
    || '  update public.player_state' || chr(10)
    || '     set auto_eat_enabled = true,' || chr(10)
    || '         auto_eat_pct     = public.hr_auto_eat_max_pct(' || chr(10)
    || '                              public.hr_auto_eat_tier(v_uid, v_slot))' || chr(10)
    || '   where user_id = v_uid and slot = v_slot;' || chr(10)
    || chr(10)
    || c_anchor;
begin
  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');

  if position('trait:auto_eat' in v_src) > 0 then
    raise notice 'hr_create_character already grants the entry trait — patch skipped';
    return;
  end if;

  v_hits := (length(v_src) - length(replace(v_src, c_anchor, ''))) / length(c_anchor);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT on hr_create_character: the success return matched % times, '
                    'expected exactly 1. Refusing to patch blind. Re-apply '
                    '2026-08-14-character-bootstrap.sql, then this file.', v_hits;
  end if;

  v_new := replace(v_src, c_anchor, c_repl);

  -- THE ACL IS THE POINT OF THE PROGRAM. hr_create_character is executable by
  -- `authenticated` and DELIBERATELY NOT by hr_engine (server-authority §2a-iv:
  -- the engine must not be able to mint characters, i.e. mint starting kits).
  -- `create or replace` preserves proacl; this asserts it rather than trusting
  -- it, and it is safer than restating the grant block.
  select coalesce(proacl::text, '') into v_acl_before from pg_proc where oid = c_sig::regprocedure;
  execute v_new;
  select coalesce(proacl::text, '') into v_acl_after  from pg_proc where oid = c_sig::regprocedure;
  if v_acl_after is distinct from v_acl_before then
    raise exception 'ACL MOVED on hr_create_character (% -> %) — a body replace must never change '
                    'who may call it.', v_acl_before, v_acl_after;
  end if;

  raise notice 'patched hr_create_character: Auto-Eat I is granted and enabled at the tier-I clamp';
end $do$;


-- ── §1b. THE CUTOVER IMPORT'S PROGRESS VERIFY ──────────────────────────────
-- ⚠ THIS IS A NECESSARY CONSEQUENCE OF §1, NOT AN OPPORTUNISTIC EDIT, and it
--   was found by REPLAYING rather than by reading: after §1 landed, every one
--   of tests/cutover-import.mjs's six snapshots failed with
--   `verify_mismatch: progress 11 <> 10`.
--
-- WHY. hr_import_apply (2026-08-17-cutover-import.sql §(m)) verifies its work by
-- comparing the envelope's PERMANENT progress-row count against `v_n_prog` — a
-- counter it increments once per row THE PLAN wrote. That equality only holds
-- while `hr_create_character` writes ZERO progress rows, which was true until
-- this file. The import calls hr_create_character (§(d), deliberately: one
-- creator, not two), so the bootstrap's `trait:auto_eat` row is in the table and
-- in the envelope and not in the counter. Off by exactly one, every player,
-- every time — and the ceremony is a one-shot event.
--
-- WHAT THIS FILE DOES ABOUT IT — and read the correction below before judging
-- it. The comparison is moved to the shape the two arms either side of it use:
-- `inventory` and `farm` compare the envelope against the TABLE, and only
-- `progress` compared it against a plan-side counter. `v_n_prog` stays exactly
-- what the receipt means by it ("rows imported") and is now reported alongside.
-- That STOPS THE FALSE FAILURE. It does not preserve the check.
--
-- ⚠⚠ IT **IS** A WEAKENING. CORRECTED 2026-08-30 (Security review). ⚠⚠
--   This paragraph used to be headed "NOT A WEAKENING" and argued that the new
--   comparison preserved the old property. The reviewer disproved it, and the
--   disproof is short enough to be checkable:
--
--     Let B = the rows the BOOTSTRAP wrote and P = the rows the PLAN wrote.
--     The table holds B + P. `hr_state_of`'s progress projection returns the
--     permanent rows it holds — and none of its filters bite here, because an
--     import plan writes no `ev:kill_monster` / `ev:loot` keys. So the envelope
--     is also B + P. The new test is therefore `B + P <> B + P`: a TAUTOLOGY.
--     It cannot fail, which means it verifies nothing at all.
--
--   The OLD comparison (`envelope <> v_n_prog`) was a real check — it caught a
--   plan row that was counted but did not land — and this file removes it. The
--   honest statement is:
--
--     **THIS FILE REMOVES player_progress IMPORT VERIFICATION.** Skills,
--     inventory and equipment are still verified value-by-value; the progress
--     arm is not verified at all after this patch. It is accepted to land
--     because §1 makes the old arm fire on every honest player and the ceremony
--     is not scheduled — NOT because the replacement is equivalent.
--
--   ⚠ BLOCKING FOLLOW-UP, and it has a precise trigger: the counting shape must
--     be restored — `insert ... on conflict ... returning (xmax = 0) into
--     v_is_new`, incrementing `v_n_prog` only on a genuine INSERT, and comparing
--     `envelope <> bootstrap_rows + v_n_prog` — **BEFORE any wipe-day ceremony**,
--     i.e. the moment `hearthrise.import_reopen` is set. Importing real players
--     with the progress arm unverified is exactly the risk 2026-08-17's own
--     header calls "THE transactional backstop".
--
--   The two alternatives considered and rejected at the time, recorded because
--   the `xmax = 0` shape supersedes both:
--     · Special-casing `trait:auto_eat` in the counter — goes stale the moment
--       any other bootstrap-written progress row exists (companions, starting
--       unlocks), and encodes this file's name into someone else's verifier.
--     · Seeding `v_n_prog` from a pre-plan baseline — the plan's `on conflict
--       do update` means a colliding plan row adds no row, so baseline +
--       plan-count OVER-counts: the same defect in the other direction. (This
--       is precisely what `xmax = 0` fixes, by counting inserts rather than
--       attempts.)
--
--   What genuinely does survive, so the residual is not overstated: a plan row
--   REFUSED by the unlock guard is still reported by name (`v_drops`, and
--   `v_n_prog` is not incremented), and the skills/inventory/equipment
--   value-by-value comparisons below are untouched.
--
-- ANCHORED, EXACTLY-ONCE, FAIL-CLOSED, IDEMPOTENT, ACL-asserted, CR-tolerant.
-- Verified 2026-09-04 at 1 hit in BOTH places it must match: production
-- `pg_get_functiondef` (body md5 17ad87f446555f33e54561ff17c8a44c, 42,153 chars
-- CR-stripped) and supabase/migrations/2026-08-17-cutover-import.sql, its only
-- author. This file does NOT become hr_import_apply's last author — it patches
-- one statement and restates nothing.
do $do$
declare
  v_src text; v_new text; v_hits int;
  v_acl_before text; v_acl_after text;
  c_sig constant text := 'public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)';
  c_anchor constant text := $a$    elsif (select count(*) from jsonb_array_elements(v_env->'progress') e
            where e->>'period' = '') is distinct from v_n_prog then
      v_bad := format('progress %s <> %s',
                      (select count(*) from jsonb_array_elements(v_env->'progress') e
                        where e->>'period' = ''), v_n_prog);$a$;
  c_repl constant text := $a$    -- ⚠ b497 — READ THIS BEFORE THE NEXT CEREMONY. This arm used to compare
    -- the envelope against v_n_prog (rows THE PLAN wrote), which equals the
    -- table only while hr_create_character writes no progress rows. Since
    -- 2026-09-04 the bootstrap grants trait:auto_eat, so the old test failed by
    -- exactly one for EVERY player. It was moved to envelope-vs-table, the shape
    -- the inventory and farm arms above use.
    -- ⚠ THAT MAKES IT A TAUTOLOGY, AND THAT IS KNOWN: the table holds
    -- bootstrap+plan, hr_state_of returns bootstrap+plan (an import plan writes
    -- no ev:kill_monster/ev:loot keys, so none of its filters bite), so this can
    -- never fail. player_progress is therefore UNVERIFIED on import. Accepted
    -- only because no ceremony is scheduled. RESTORE THE COUNTING SHAPE —
    -- `insert ... on conflict ... returning (xmax = 0)`, incrementing v_n_prog
    -- only on a real INSERT, compared against bootstrap_rows + v_n_prog —
    -- BEFORE hearthrise.import_reopen is ever set. Skills, inventory and
    -- equipment are still verified value-by-value below; only this arm is not.
    -- v_n_prog stays the receipt's "rows imported" and is reported below.
    elsif (select count(*) from jsonb_array_elements(v_env->'progress') e
            where e->>'period' = '') is distinct from
          (select count(*) from public.player_progress
            where user_id = p_user and slot = v_slot and period_key = '') then
      v_bad := format('progress env %s <> table %s (plan wrote %s)',
                      (select count(*) from jsonb_array_elements(v_env->'progress') e
                        where e->>'period' = ''),
                      (select count(*) from public.player_progress
                        where user_id = p_user and slot = v_slot and period_key = ''), v_n_prog);$a$;
begin
  if to_regprocedure(c_sig) is null then
    raise notice 'hr_import_apply is absent — the cutover import is not installed on this database, '
                 'so there is nothing to reconcile. Skipped.';
    return;
  end if;

  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');

  if position('progress env %s <> table %s' in v_src) > 0 then
    raise notice 'hr_import_apply already compares the envelope against the table — patch skipped';
    return;
  end if;

  v_hits := (length(v_src) - length(replace(v_src, c_anchor, ''))) / length(c_anchor);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT on hr_import_apply: the progress-count verify matched % times, '
                    'expected exactly 1. Refusing to patch blind. Re-apply '
                    '2026-08-17-cutover-import.sql, then this file. ⚠ DO NOT SKIP THIS: without it '
                    'every player fails the cutover with verify_mismatch on the progress count.', v_hits;
  end if;

  select coalesce(proacl::text, '') into v_acl_before from pg_proc where oid = c_sig::regprocedure;
  execute replace(v_src, c_anchor, c_repl);
  select coalesce(proacl::text, '') into v_acl_after  from pg_proc where oid = c_sig::regprocedure;
  -- hr_import_apply is executable by NOBODY (its own §3): it impersonates via
  -- request.jwt.claim.sub and writes another user's character.
  if v_acl_after is distinct from v_acl_before then
    raise exception 'ACL MOVED on hr_import_apply (% -> %) — this function must remain callable by '
                    'no role at all.', v_acl_before, v_acl_after;
  end if;

  raise notice 'patched hr_import_apply: the progress verify compares the envelope against the '
               'table, so the bootstrap-granted trait row no longer reads as a missing plan row';
end $do$;


-- ── §grant-existing. THE CURRENT COHORT, BEHIND ITS OWN GATE ───────────────
-- Flag only. See the header for why it does not touch auto_eat_*.
do $$
declare
  v_ok   text := coalesce(current_setting('hearthrise.grant_auto_eat_existing', true), '');
  v_rows bigint;
  v_have bigint;
  v_all  bigint;
begin
  if v_ok <> 'yes' then
    select count(*) into v_all from public.player_state;
    raise notice '§grant-existing SKIPPED (% existing character(s) untouched). To include them: '
                 'set local hearthrise.grant_auto_eat_existing = ''yes''; in the same transaction.',
                 v_all;
    return;
  end if;

  insert into public.player_progress
    (user_id, slot, kind, key, value, period_key, state, updated_at)
  select ps.user_id, ps.slot, 'flag', 'trait:auto_eat', 1, '', null, now()
    from public.player_state ps
  on conflict (user_id, slot, kind, key, period_key) do nothing;
  get diagnostics v_rows = row_count;

  -- READ BACK. A silent no-op is impossible: every character must now own it.
  select count(*) into v_all  from public.player_state;
  select count(*) into v_have from public.player_state ps
   where public.hr_auto_eat_tier(ps.user_id, ps.slot) >= 1;
  if v_have <> v_all then
    raise exception 'VERIFY: % of % existing characters own an auto-eat tier after the grant',
      v_have, v_all;
  end if;
  raise notice '§grant-existing: % new flag row(s); all % existing character(s) now own Auto-Eat I '
               '(enabling it stays their gesture, through hr_set_auto_eat)', v_rows, v_all;
end $$;


-- ── §2. THE FILE CANNOT SUCCEED QUIETLY ────────────────────────────────────
do $$
declare
  v_src text;
begin
  v_src := replace(pg_get_functiondef('public.hr_create_character(int)'::regprocedure), chr(13), '');

  if position('''trait:auto_eat''' in v_src) = 0 then
    raise exception 'VERIFY: hr_create_character does not write the trait flag row';
  end if;
  if position('set auto_eat_enabled = true' in v_src) = 0 then
    raise exception 'VERIFY: hr_create_character does not switch auto-eat on — the trait would be '
                    'owned but idle, and the away night this ruling exists to fix would still die '
                    'at the first death.';
  end if;
  -- ORDER. The clamp reads the tier, which reads the flag; the other way round
  -- it clamps against tier 0 and the ceiling is whatever that function says
  -- rather than what the character actually owns.
  if position('''trait:auto_eat''' in v_src) > position('set auto_eat_enabled = true' in v_src) then
    raise exception 'VERIFY: the switch is written BEFORE the flag row — the tier lookup would '
                    'read 0 and clamp against an entitlement the character does not yet hold.';
  end if;
  -- THE CLAMP MUST BE DERIVED, NOT RESTATED. Two lookups, no literals: a
  -- hard-coded 25 (or a hard-coded tier 1) is a second copy of the ceiling.
  if position('public.hr_auto_eat_max_pct(' in v_src) = 0
     or position('public.hr_auto_eat_tier(v_uid, v_slot)' in v_src) = 0 then
    raise exception 'VERIFY: the tier-I ceiling is not derived from hr_auto_eat_max_pct('
                    'hr_auto_eat_tier(...)) — a literal there is a second copy of the clamp that '
                    'stops tracking AUTO_EAT_TIERS the day it moves.';
  end if;
  -- ⚠ AND IT MUST **NOT** GO THROUGH hr_set_auto_eat. That reads like the
  --   tidier choice and it breaks the cutover: hr_set_auto_eat bumps `version`
  --   and writes a set_auto_eat player_ledger row, and 2026-08-17-cutover-
  --   import.sql §(e) reads BOTH as "this character has already played", so
  --   hr_import_apply would refuse every player at the ceremony. Measured on a
  --   full PGlite replay. This assertion is the note that stops it being
  --   "fixed" back.
  if position('hr_set_auto_eat(v_slot' in v_src) > 0 then
    raise exception 'VERIFY: hr_create_character calls hr_set_auto_eat. It bumps version and writes '
                    'a ledger row, and hr_import_apply reads both as character_already_played — '
                    'the cutover ceremony would refuse EVERY player. Write the two columns '
                    'directly, with the clamp DERIVED from hr_auto_eat_tier.';
  end if;

  -- WHO MAY CALL IT. Unchanged, and re-asserted because this file rewrote the body.
  if not has_function_privilege('authenticated', 'public.hr_create_character(integer)', 'execute') then
    raise exception 'VERIFY: authenticated lost EXECUTE on hr_create_character — nobody can make a '
                    'character.';
  end if;
  if exists (select 1 from pg_roles where rolname = 'hr_engine')
     and has_function_privilege('hr_engine', 'public.hr_create_character(integer)', 'execute') then
    raise exception 'VERIFY: hr_engine can now execute hr_create_character. server-authority §2a-iv: '
                    'the engine must never be able to mint characters (i.e. mint starting kits).';
  end if;
  if has_function_privilege('anon', 'public.hr_create_character(integer)', 'execute') then
    raise exception 'VERIFY: anon can execute hr_create_character';
  end if;

  -- §1b LANDED. Without it the cutover ceremony refuses every player with
  -- `verify_mismatch: progress N <> N-1`, and the ceremony happens once.
  if to_regprocedure('public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)') is not null
     and position('progress env %s <> table %s' in
           replace(pg_get_functiondef(
             'public.hr_import_apply(uuid,int,jsonb,jsonb,boolean)'::regprocedure), chr(13), '')) = 0 then
    raise exception 'VERIFY: hr_import_apply still verifies the progress count against the '
                    'plan-side counter. The bootstrap now writes one progress row, so every '
                    'import fails verify_mismatch by exactly one. See §1b.';
  end if;

  -- THE SINK IS STILL PRICED. Re-read after the fact, because "we kept the paid
  -- tier" is the load-bearing half of the ruling.
  if not exists (select 1 from public.hr_traits
                  where trait_id = 'auto_eat_2' and req_trait = 'auto_eat' and cost > 0) then
    raise exception 'VERIFY: auto_eat_2 is no longer a paid upgrade requiring auto_eat';
  end if;

  -- NO CLIENT WRITE POLICY may have appeared on the table this file now writes
  -- to from a definer body. The row is server-written; a client UPDATE policy on
  -- player_progress would let a browser grant itself any trait in the catalogue.
  if exists (select 1 from pg_policies
              where schemaname = 'public' and tablename = 'player_progress'
                and cmd in ('INSERT','UPDATE','DELETE','ALL')) then
    raise exception 'VERIFY: player_progress has a client write policy — a browser could grant '
                    'itself trait:auto_eat_2 (and every future trait) directly.';
  end if;

  raise notice 'b497 auto-eat at creation: the entry trait is granted and enabled at the tier-I clamp';
end $$;
