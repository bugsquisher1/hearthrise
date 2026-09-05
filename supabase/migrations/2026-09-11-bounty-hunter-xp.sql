-- 2026-09-11-bounty-hunter-xp.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- ⚠ SECURITY REVIEW REQUIRED before apply. It adds a THIRD credited value to an
--   existing MONEY surface (hr_claim_bounty already pays server-owned gold and
--   Bounty Marks) and the new value lands in `player_skills`, which is RANKED —
--   `hr_lb_skills()` carries a `bountyHunter` board and `hr_total_level()` sums
--   every player_skills row. The Coordinator applies this by hand after a GO.
--
--   APPLY AFTER: 2026-08-23-bounty.sql (the sole author of the body patched
--   here). §0 fails closed if it is absent. Order against
--   2026-09-04-bounty-difficulty-count.sql does not matter — that file patches
--   hr_accept_bounty__ungated, this one patches hr_claim_bounty__ungated.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE DEFECT — A WHOLE PROGRESSION AXIS THAT HAS NEVER WORKED FOR ANYONE
-- ══════════════════════════════════════════════════════════════════════════
-- MEASURED ON PRODUCTION (nezapsylztqbbwuwembx, 2026-09-05):
--
--     select count(*), count(distinct user_id), max(xp), sum(xp)
--       from public.player_skills where skill_id = 'bountyHunter';
--     -> 36 rows, 34 players, max_xp = 0, sum_xp = 0
--
-- Not one character has ever held a point of Bounty-Hunter XP on the server.
-- The row exists — `hr_create_character` (2026-08-11-player-state.sql §9) seeds
-- 'bountyHunter' in c_start_skills at xp 0 — and NO SERVER CODE ANYWHERE EVER
-- ADDS TO IT. A grep of supabase/functions/hr-accrue/** and every migration
-- finds the id only in the catalogue (2026-08-11-catalogue.generated.sql), in
-- the leaderboard list (hr_lb_skills) and in that seed array.
--
-- The CLIENT computed it: src/legacy.js finalizeBounty wrote
-- `G.bountyHunter.xp += r.xp` and a wrapper mirrored it into
-- `G.skills.bountyHunter`. `G.skills` is SERVER_OF_RECORD (src/net/record.js —
-- SKILLS_RECORD_ARM_ENABLED is true and applyRecord does a WHOLESALE
-- `G[f] = dec.fields[f]`), so the very next envelope replaced the client's map
-- with the server's, where the row is 0. The level therefore read 1 again after
-- every settle and every reload.
--
-- ── WHY IT IS NOT COSMETIC ────────────────────────────────────────────────
-- `getUnlockedBountyTier()` (legacy.js) is keyed off the Bounty-Hunter LEVEL:
-- Lv20 -> tier 2, Lv30 -> t3, Lv40 -> t4, Lv50 -> t5, Lv60 -> t6. At a level
-- permanently pinned to 1, EVERY TIER ABOVE 1 IS UNREACHABLE FOR EVERY PLAYER,
-- FOREVER — and `getUnlockedBountyTypes()` (proof at 5, weapon at 10, streak at
-- 15, boss at 30, chain at 40) never opens either. The board is one rung tall
-- for the whole playerbase.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE FIX, AND WHY IT IS THIS SHAPE
-- ══════════════════════════════════════════════════════════════════════════
-- Credit the XP inside `hr_claim_bounty__ungated`, in the SAME TRANSACTION as
-- the gold and the Marks, from the SAME server-owned source they use.
--
-- ── THE FORMULA IS NOT A NEW DECISION ─────────────────────────────────────
-- `active_bounty.xp_reward` is already written by `hr_accept_bounty__ungated`
-- from `hr_bounty_reward(tier, 'cull', difficulty).xp`, i.e.
--
--     round(BOUNTY_BASE_REWARDS[tier].xp x BOUNTY_DIFFICULTY_MULT[difficulty])
--     base xp  45 / 95 / 180 / 340 / 620 / 1100   (tier 1..6)
--     mult     easy 0.85 · normal 1.0 · hard 1.3  ('elite' is REFUSED at accept)
--
-- bound to src/core/bounty.js by tests/bounty-drift.mjs, already returned to the
-- client as `xp`, and already journalled in the ledger's `meta.xp`. The ONLY
-- thing missing was the write. So this file introduces NO new number, NO second
-- copy of a balance table and NO new drift surface: it credits the figure the
-- server already computed, stored and published for this exact contract.
--
-- CREDITING THE STORED `xp_reward` RATHER THAN RECOMPUTING AT CLAIM IS
-- DELIBERATE, and it is the rule gold and Marks already follow: the contract the
-- player ACCEPTED is the contract that pays. A recompute would silently re-price
-- an in-flight bounty if the reward table moved between accept and turn-in —
-- the client showing one contract while the server settles another, which is the
-- precise failure this program exists to prevent.
--
-- ── NOTHING A CLIENT SENDS CAN MOVE THE AMOUNT ────────────────────────────
-- Every input to `xp_reward` is server-derived at accept time:
--   · tier        <- public.hr_bounty_monsters(target), the generated catalogue,
--                    and the target's tier is gated by the SERVER combat level
--                    (hr_bounty_combat_level over player_skills).
--   · difficulty  <- allowlisted to easy/normal/hard; anything else is refused.
--   · required    <- CLAMPED into the server's own range; it does not price xp
--                    at all, so even a forged one cannot change this number.
-- The claim itself takes ONE argument (p_slot). §2 GATE(h) proves the point by
-- accepting with an absurd forged `p_required` and asserting the credited XP is
-- still exactly the catalogue value.
--
-- ── IDEMPOTENCY AND CONCURRENCY: INHERITED, NOT REINVENTED ────────────────
-- The XP rides INSIDE the existing once-guard rather than beside it. The claim
-- takes `select ... for update` on the single `active_bounty` row, then DELETES
-- it; the credit happens after the delete's `row_count` check. A replay finds no
-- row (`no_active_bounty`) and credits nothing; two concurrent claims serialise
-- on the row lock and the loser finds it gone. That guard was reviewed and
-- shipped for gold+Marks in 2026-08-23-bounty.sql and is unchanged here — the
-- XP simply cannot be paid twice without the gold being paid twice, which is a
-- property the existing tests already hold.
--
-- The write itself is the house UPSERT (2026-08-18-skill-row-upsert.sql):
-- `insert ... on conflict (user_id, slot, skill_id) do update set xp = sk.xp +
-- excluded.xp`. A bare UPDATE would silently no-op for any character created
-- before 'bountyHunter' entered the catalogue — the `unknown_skill` incident.
--
-- ── xp_in = 0, STATED RATHER THAN INHERITED ───────────────────────────────
-- The ledger row keeps `gold_in/xp_in/qty_in/gems_in = 0`, the same posture this
-- row already had for the gold. A bounty reward is NOT accrual inflow: the
-- limiter is the once-per-accept guard plus a kill requirement the server
-- verifies from its own counter, not the shared daily budget. Same rule as the
-- muster/raid chest and the modal goal claims (b414).
--
-- ── THE LEDGER LEARNS THE SKILL, SO THE TRANSFER IS RECONSTRUCTIBLE ───────
-- `player_ledger.skill_id` and `.xp` are set on the SAME row that was already
-- written (no second row, no per-tick journalling — Law 6). After apply,
--     select sum(xp) from player_ledger
--      where kind='bounty' and skill_id='bountyHunter' and user_id=...
-- reconstructs the exact credit for any character, which is what makes the
-- change reversible by hand if it ever has to be.
--
-- ── THE RESPONSE GAINS `xp_skill`, AND IT IS LOAD-BEARING ─────────────────
-- The claim already returned `xp`. It now also returns `'xp_skill' =
-- 'bountyHunter'`. The client predicts the XP for display ONLY when it sees that
-- key, so a client shipped BEFORE this migration is applied predicts nothing and
-- shows no phantom level that snaps back at the next envelope (the b491 defect
-- class). One key makes the two halves independently shippable in either order.
--
-- ══════════════════════════════════════════════════════════════════════════
-- GRANDFATHERING: EVERYONE STARTS AT ZERO. NO BACKFILL. (explicit ruling)
-- ══════════════════════════════════════════════════════════════════════════
-- Three sources were considered and two were rejected.
--
--   · THE CLIENT RESIDUE (`G.bountyHunter.xp`) — REJECTED, and it is not close.
--     It is a client-authored, ungated, unbounded number that never crossed a
--     server verb. bountyHunter is a RANKED board and feeds hr_total_level, so
--     importing it would write exactly the class of value this whole program
--     exists to refuse straight into a leaderboard. There is no bound to put on
--     it that would make it honest.
--   · THE LEDGER (`sum((meta->>'xp')::bigint)` over kind='bounty'
--     intent='bounty_turnin:%') — HONEST but NOT WORTH IT. It is server-authored
--     and append-only, so it is a legitimate source. Measured on production
--     2026-09-05: TWELVE turn-ins in the game's history, TWO characters, 891 XP
--     total, the larger holding 815 (Bounty-Hunter level 8) and the other 76
--     (level 1). A backfill would need its own once-guard, its own journal and
--     its own verification — more moving parts than this entire fix — to hand
--     two characters a level that is nowhere near the Lv20 tier-2 gate that is
--     the actual defect, in a beta that is WIPED AT CUTOVER (CLAUDE.md, Tyler
--     explicit: no back-compat, no migration, no amnesty).
--   · ZERO — CHOSEN. Simple, unforgeable, and nothing is lost: the ledger is
--     append-only, so if Tyler ever wants those 891 XP the query above still
--     reconstructs them exactly. The option stays open; the risk does not.
--
-- ══════════════════════════════════════════════════════════════════════════
-- EXPLOIT SURFACE DELTA (for the Security review)
-- ══════════════════════════════════════════════════════════════════════════
-- NO NEW CONTROL. The XP is strictly downstream of gates that already stand in
-- front of tradeable gold on the same call. To mint 1 XP an attacker must mint
-- the gold and the Marks that ride with it, which means: hold an active_bounty
-- row written by the server, and push the SERVER's own
-- `ev:kill_monster:<target>` counter `required` above its accept-time baseline.
-- That counter's only client-facing writer is `hr_credit_kills`
-- (2026-08-30-bounty-kill-credit.sql), capped at
-- floor(1.3 x elapsed_since_accept / min_time_to_kill) and journalled when
-- throttled.
--
-- WHAT IS NEW IS THE DESTINATION, and it is ranked, so the magnitude is stated
-- rather than waved at. The richest legal contract is tier 6 hard: 1,430 XP for
-- 60 verified kills of a tier-6 monster (which itself needs server combat level
-- 70). Bounty-Hunter 99 is 13,034,431 XP ~ 9,100 turn-ins ~ 546,000 tier-6
-- kills. Against the measured honest ~7.1M combat XP per character-day from the
-- accrual engine, this is the slowest faucet in the game, and it is bounded by
-- real kills rather than by a call rate.
--
-- SECOND-ORDER, NAMED SO IT IS NOT A SURPRISE: `hr_total_level()` sums EVERY
-- player_skills row, so a rising bountyHunter level now raises total_level, a
-- ranked board. That is correct — bountyHunter is a real catalogued skill and
-- has been in hr_lb_skills and in the character seed since day one; today every
-- player contributes exactly 1 to that sum. It is a behaviour change to the
-- total-level board and belongs in the review, not in a footnote.
--
-- NO NEW GRANT, NO NEW POLICY, NO NEW TABLE, NO NEW RPC, NO NEW BUCKET. The
-- rate gate (hr_claim_bounty, 12/min) is untouched. §2 asserts the ACL of the
-- patched body is byte-identical before and after.
--
-- ══════════════════════════════════════════════════════════════════════════
-- COST AT 100x PLAYERS
-- ══════════════════════════════════════════════════════════════════════════
-- ZERO new rows and zero new bytes on the hot path. The skills write is an
-- UPSERT into a row that already exists for every character (~17 rows/character,
-- seeded at creation), so it is an in-place bigint update. The ledger row was
-- already being written; it gains a text and a bigint (~20 bytes) on a row that
-- appears once per completed bounty — twelve times in the game's history so far.
-- No index is added; none is needed (the write is by primary key).
--
-- ══════════════════════════════════════════════════════════════════════════
-- LIVE-HASH / DRIFT IMPACT
-- ══════════════════════════════════════════════════════════════════════════
-- `hr_claim_bounty__ungated` is NOT in tests/live-hash-drift.baseline.json's
-- tracked `functions` list (verified 2026-09-05: the bounty family tracks
-- hr_accept_bounty__ungated, hr_credit_kills__ungated and hr_bounty_spend__ungated,
-- but not this one), so applying this file moves NO tracked hash and no
-- --write/--live re-pin is required. It arguably SHOULD be tracked — it is the
-- money surface of the pair — and adding it is recommended as a separate,
-- one-line baseline change so it does not collide with the lane that is
-- currently editing those baselines.
-- tests/schema-drift.baseline.json is untouched: this file adds no object and
-- changes no signature (it inventories signatures, not bodies).
--
-- ══════════════════════════════════════════════════════════════════════════
-- REVERSIBILITY — THREE FILES, IN THIS ORDER. NOT ONE. (measured, not reasoned)
-- ══════════════════════════════════════════════════════════════════════════
--     1. supabase/migrations/2026-08-23-bounty.sql
--     2. supabase/migrations/2026-08-29-bounty-first-contract.sql
--     3. supabase/migrations/2026-09-04-bounty-difficulty-count.sql
--
-- ⚠ THE OBVIOUS ONE-FILE REVERT IS WRONG, AND IT IS WRONG QUIETLY. File 1 is the
-- sole author of `hr_claim_bounty__ungated`, so re-applying it does restore the
-- un-credited body — but it ALSO restates `hr_accept_bounty__ungated`, which
-- silently reverts the b487 first-contract floor AND the b497 difficulty-scaled
-- kill range with it. The board would then offer an easy 72-kill contract that
-- the server clamps up to 80, and a day-one player would be handed the 80–120
-- bracket again: the client showing one contract while the server enforces
-- another, which is the failure this program exists to prevent.
--
-- MEASURED on a full PGlite replay of the chain, 2026-09-05 (not reasoned from
-- reading the files):
--     start                       claim credits=Y  accept scaled=Y  first=Y
--     after file 1                claim credits=N  accept scaled=N  first=N   <- the trap
--     after file 2                claim credits=N  accept scaled=N  first=N
--     after file 3                claim credits=N  accept scaled=Y  first=Y   <- correct
--
-- XP ALREADY CREDITED STAYS CREDITED (a revert stops the faucet, it does not
-- claw back). The exact per-character amount to subtract, if that is ever
-- wanted, is
--     select user_id, slot, sum(xp) from public.player_ledger
--      where kind = 'bounty' and skill_id = 'bountyHunter' group by 1, 2;
-- No table, no column, no grant, no policy, no cron, no edge deploy.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHY THERE IS NO begin;/commit; IN THIS FILE, AND HOW IT IS STILL ATOMIC
-- ══════════════════════════════════════════════════════════════════════════
-- SA-040: the apply path and the replay harness EACH already wrap a file in a
-- transaction, and an inner `commit` ends the outer one early and runs the tail
-- unwrapped. So this file wraps nothing.
--
-- It does not need a clever autocommit detector either (and the obvious
-- `statement_timestamp() <> now()` one is WRONG — it detects "not the first
-- statement", not "in a transaction"). Instead the STRUCTURE carries the
-- guarantee: §0 is read-only and raises before anything is written, and §1's
-- body replace and §2's executed verification live in ONE `do $$ ... $$` block.
-- A DO block is a single statement, so even under bare autocommit either the
-- patch AND its proof land together or neither does. There is no ordering in
-- which a verification failure can leave a half-patched function behind.
-- ══════════════════════════════════════════════════════════════════════════


-- ── §0. FAIL CLOSED ────────────────────────────────────────────────────────
-- Facts about the LIVE database, not about file order.
do $$
begin
  if to_regprocedure('public.hr_claim_bounty__ungated(int)') is null then
    raise exception 'hr_claim_bounty__ungated is absent — apply 2026-08-23-bounty.sql first. '
                    'There is nothing to patch, and this file would otherwise read as shipped.';
  end if;
  if to_regprocedure('public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)') is null then
    raise exception 'hr_accept_bounty__ungated is absent — §2 cannot reach a claim without it.';
  end if;
  if to_regclass('public.active_bounty') is null then
    raise exception 'active_bounty is absent — apply 2026-08-23-bounty.sql first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='active_bounty'
                    and column_name='xp_reward') then
    raise exception 'active_bounty.xp_reward is absent — the credited amount has no server source.';
  end if;
  if to_regclass('public.player_skills') is null then
    raise exception 'player_skills is absent.';
  end if;
  -- The DESTINATION must be a REAL catalogued skill. A credit to an id that is
  -- not an hr_skills row is the phantom-'combat' defect b492 fixed for the goal
  -- claims: the write lands, nothing reads it, and the player is told they were
  -- paid. Fail closed rather than credit into a hole.
  if to_regclass('public.hr_skills') is null then
    raise exception 'hr_skills is absent — apply 2026-08-11-catalogue.generated.sql first.';
  end if;
  if not exists (select 1 from public.hr_skills where skill_id = 'bountyHunter') then
    raise exception 'hr_skills has no ''bountyHunter'' row — the credit would land on a skill '
                    'no leaderboard, level or UI reads. Regenerate the catalogue first.';
  end if;
  if to_regprocedure('public.hr_bounty_reward(int,text,text)') is null then
    raise exception 'hr_bounty_reward is absent — §2 cannot re-derive the credited amount.';
  end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'hr_level_from_xp is absent — §2 cannot prove the tier gate unlocks.';
  end if;
end $$;


-- ── §1 + §2. THE PATCH, AND THE PROOF, IN ONE STATEMENT ────────────────────
-- PROGRAMMATIC, ANCHORED, FAIL-CLOSED, IDEMPOTENT — the 2026-09-04 §4 idiom.
-- NEVER a template restatement: `hr_claim_bounty__ungated` has exactly ONE
-- author today (2026-08-23-bounty.sql §8) and a restatement would still be a
-- standing invitation for the next author to revert whichever migration ran
-- last. That is the b484–b487 "everything refuses" class.
--
-- ALL THREE ANCHORS VERIFIED 2026-09-05, in BOTH places they have to match:
--   · production `pg_get_functiondef` (CR-stripped) — 1 hit each
--   · supabase/migrations/2026-08-23-bounty.sql (the sole author, and therefore
--     what a repo REBUILD installs) — 1 hit each
-- A count other than exactly 1 raises rather than patching blind.
--
-- CR-TOLERANT: production stores several bodies with CRLF (they were applied
-- from a CRLF working copy). Stripping CR is the only normalisation done here.
do $do$
declare
  v_src text; v_new text; v_hits int;
  v_acl_before text; v_acl_after text;
  c_sig constant text := 'public.hr_claim_bounty__ungated(int)';

  -- A1 — the gold+Marks credit. The XP upsert is appended AFTER it, inside the
  -- same post-delete region, so it is governed by the same once-guard.
  c_a1 constant text :=
       '  update public.player_state' || chr(10)
    || '     set gold  = coalesce(gold, 0)  + v_ab.gold_reward,' || chr(10)
    || '         marks = coalesce(marks, 0) + v_ab.marks_reward,' || chr(10)
    || '         version = version + 1, updated_at = now()' || chr(10)
    || '   where user_id = auth.uid() and slot = v_slot;';
  c_r1 constant text :=
       '  update public.player_state' || chr(10)
    || '     set gold  = coalesce(gold, 0)  + v_ab.gold_reward,' || chr(10)
    || '         marks = coalesce(marks, 0) + v_ab.marks_reward,' || chr(10)
    || '         version = version + 1, updated_at = now()' || chr(10)
    || '   where user_id = auth.uid() and slot = v_slot;' || chr(10)
    || chr(10)
    || '  -- BOUNTY-HUNTER XP — the third component of the SAME reward, credited in' || chr(10)
    || '  -- the SAME transaction, from the SAME server-owned row. active_bounty' || chr(10)
    || '  -- .xp_reward was written at accept from hr_bounty_reward(tier,''cull'',' || chr(10)
    || '  -- difficulty); no client value reaches it and the claim takes no amount.' || chr(10)
    || '  -- UPSERT, not UPDATE: a character created before ''bountyHunter'' entered' || chr(10)
    || '  -- the catalogue has no row, and a bare UPDATE would silently pay nothing' || chr(10)
    || '  -- (the `unknown_skill` incident, 2026-08-18-skill-row-upsert.sql).' || chr(10)
    || '  -- greatest(0, ...) because this xp lands on a RANKED, monotone column;' || chr(10)
    || '  -- a negative would violate player_skills'' own check and 500 the turn-in.' || chr(10)
    || '  if coalesce(v_ab.xp_reward, 0) > 0 then' || chr(10)
    || '    insert into public.player_skills as sk (user_id, slot, skill_id, xp)' || chr(10)
    || '      values (auth.uid(), v_slot, ''bountyHunter'', greatest(0, v_ab.xp_reward)::bigint)' || chr(10)
    || '      on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;' || chr(10)
    || '  end if;';

  -- A2 — the ledger row LEARNS the transfer. Same row, no second row.
  c_a2 constant text :=
       '  insert into public.player_ledger' || chr(10)
    || '    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)' || chr(10)
    || '  values' || chr(10)
    || '    (auth.uid(), v_slot, ''bounty'', ''bounty_turnin:'' || v_ab.bounty_id,' || chr(10)
    || '     v_ab.gold_reward, 0, 0, 0, 0,';
  c_r2 constant text :=
       '  -- skill_id/xp make the XP transfer reconstructible from the journal alone' || chr(10)
    || '  -- (Law 6: journal the transfer, never the tick). xp_in stays 0 on purpose:' || chr(10)
    || '  -- a once-per-accept, server-catalogued reward is deliberately OUTSIDE the' || chr(10)
    || '  -- shared daily inflow budget, exactly as its gold already is.' || chr(10)
    || '  insert into public.player_ledger' || chr(10)
    || '    (user_id, slot, kind, intent, gold, skill_id, xp, gold_in, xp_in, qty_in, gems_in, meta)' || chr(10)
    || '  values' || chr(10)
    || '    (auth.uid(), v_slot, ''bounty'', ''bounty_turnin:'' || v_ab.bounty_id,' || chr(10)
    || '     v_ab.gold_reward, ''bountyHunter'', greatest(0, coalesce(v_ab.xp_reward, 0))::bigint,' || chr(10)
    || '     0, 0, 0, 0,';

  -- A3 — the receipt names the SKILL, so a client can tell a crediting server
  -- from a pre-patch one and predict only against the former.
  c_a3 constant text :=
       '  return jsonb_build_object(''ok'', true, ''target'', v_ab.target, ''gold'', v_ab.gold_reward,' || chr(10)
    || '    ''marks'', v_ab.marks_reward, ''xp'', v_ab.xp_reward, ''progress'', v_progress,' || chr(10)
    || '    ''slot'', v_slot, ''credited'', true);';
  c_r3 constant text :=
       '  return jsonb_build_object(''ok'', true, ''target'', v_ab.target, ''gold'', v_ab.gold_reward,' || chr(10)
    || '    ''marks'', v_ab.marks_reward, ''xp'', v_ab.xp_reward, ''progress'', v_progress,' || chr(10)
    || '    ''slot'', v_slot, ''credited'', true, ''xp_skill'', ''bountyHunter'');';

  -- ── §2 probe state ───────────────────────────────────────────────────────
  v      jsonb;
  v_uid  constant uuid := '000000b1-0000-0000-0000-0000000000b1';
  v_slot constant int  := 0;
  v_t1   text;
  v_xp0 bigint; v_xp1 bigint; v_xp2 bigint;
  v_g0 bigint; v_g1 bigint; v_m0 bigint; v_m1 bigint;
  v_want int; v_led_xp bigint; v_led_skill text; v_led_in bigint; v_led_n int;
begin
  -- ── §1. PATCH ───────────────────────────────────────────────────────────
  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');

  if position('''bountyHunter''' in v_src) > 0 then
    raise notice 'hr_claim_bounty__ungated already credits Bounty-Hunter XP — patch skipped';
    return;
  end if;

  v_hits := (length(v_src) - length(replace(v_src, c_a1, ''))) / length(c_a1);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT (gold+marks credit): matched % times, expected exactly 1. '
                    'Refusing to patch blind. Re-apply 2026-08-23-bounty.sql, then this file.', v_hits;
  end if;
  v_hits := (length(v_src) - length(replace(v_src, c_a2, ''))) / length(c_a2);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT (ledger insert): matched % times, expected exactly 1. '
                    'Refusing to patch blind. Re-apply 2026-08-23-bounty.sql, then this file.', v_hits;
  end if;
  v_hits := (length(v_src) - length(replace(v_src, c_a3, ''))) / length(c_a3);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT (receipt): matched % times, expected exactly 1. '
                    'Refusing to patch blind. Re-apply 2026-08-23-bounty.sql, then this file.', v_hits;
  end if;

  v_new := replace(replace(replace(v_src, c_a1, c_r1), c_a2, c_r2), c_a3, c_r3);

  -- THE ACL IS THE POINT OF THE PROGRAM. `create or replace` preserves proacl;
  -- this ASSERTS it rather than trusting it, and it is safer than restating the
  -- revoke/grant block (a restatement is itself a chance to widen).
  select coalesce(proacl::text, '') into v_acl_before from pg_proc where oid = c_sig::regprocedure;
  execute v_new;
  select coalesce(proacl::text, '') into v_acl_after  from pg_proc where oid = c_sig::regprocedure;
  if v_acl_after is distinct from v_acl_before then
    raise exception 'ACL MOVED on hr_claim_bounty__ungated (% -> %) — a body replace must never '
                    'change who may call it.', v_acl_before, v_acl_after;
  end if;

  -- ── §2. THE FILE CANNOT SUCCEED QUIETLY ─────────────────────────────────
  -- (a) STATIC: the three edits are actually in the installed body.
  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  if position('insert into public.player_skills as sk' in v_src) = 0 then
    raise exception 'GATE(a): the skills upsert is not in the installed body';
  end if;
  if position('on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp' in v_src) = 0 then
    raise exception 'GATE(a): the credit is not an UPSERT — a character with no bountyHunter row '
                    'would be paid nothing (the unknown_skill incident)';
  end if;
  if position('''xp_skill'', ''bountyHunter''' in v_src) = 0 then
    raise exception 'GATE(a): the receipt does not name the skill — the client cannot tell a '
                    'crediting server from a pre-patch one and would predict a phantom level';
  end if;
  -- The once-guard this credit rides inside must still be there and still be
  -- BEFORE the credit. A credit above the delete is a turn-in that pays on every
  -- retry.
  if position('delete from public.active_bounty' in v_src) = 0
     or position('for update' in v_src) = 0 then
    raise exception 'GATE(a): the once-guard (row lock + delete) is gone — the XP would be '
                    'replayable and so would the gold';
  end if;
  if position('delete from public.active_bounty' in v_src)
     > position('insert into public.player_skills as sk' in v_src) then
    raise exception 'GATE(a): the XP credit runs BEFORE the consume — every retry would pay it';
  end if;

  -- (b) EXECUTED behaviour, in a subtransaction discarded to zero residue.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, marks, version)
      values (v_uid, v_slot, 1000, 0, 0, 1)
      on conflict (user_id, slot) do update set gold = 1000, marks = 0;
    -- Combat skills maxed so the tier gate is never the thing under test.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, 13034431
        from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
      on conflict (user_id, slot, skill_id) do update set xp = 13034431;
    -- DELIBERATELY NO bountyHunter ROW. That is the pre-catalogue character the
    -- upsert exists for, and it is the state a bare UPDATE would fail silently on.
    delete from public.player_skills where user_id=v_uid and slot=v_slot and skill_id='bountyHunter';

    select monster_id into v_t1 from public.hr_bounty_monsters where tier = 1 order by monster_id limit 1;
    if v_t1 is null then raise exception 'GATE(b): no tier-1 bounty monster in the catalogue'; end if;

    -- THE AMOUNT THE CATALOGUE OWES for a tier-1 HARD cull: round(45 * 1.3) = 59.
    select xp into v_want from public.hr_bounty_reward(1, 'cull', 'hard');
    if v_want <> 59 then
      raise exception 'GATE(b): tier-1 hard cull xp is % (expected 59) — the reward table moved '
                      'and this gate''s arithmetic is no longer describing it', v_want;
    end if;

    -- ACCEPT with an ABSURD forged p_required. The clamp handles it; the point
    -- here is that NOTHING the client sends prices the XP.
    v := public.hr_accept_bounty__ungated(v_slot, 'bx', v_t1, 'cull', 'hard', 999999);
    if coalesce(v->>'ok','') <> 'true' then raise exception 'GATE(b): accept failed: %', v; end if;
    if (v->>'xp')::int <> v_want then
      raise exception 'GATE(b): the accept stored xp % for a tier-1 hard cull (expected %) — a '
                      'client value reached the amount', v->>'xp', v_want;
    end if;

    -- INCOMPLETE claim credits NOTHING. (No kills have been recorded at all.)
    v := public.hr_claim_bounty__ungated(v_slot);
    if v->>'error' <> 'incomplete' then
      raise exception 'GATE(b): an unfinished bounty was not refused: %', v;
    end if;
    if exists (select 1 from public.player_skills
                where user_id=v_uid and slot=v_slot and skill_id='bountyHunter' and xp > 0) then
      raise exception 'GATE(b): an INCOMPLETE claim credited Bounty-Hunter XP';
    end if;

    -- Record exactly `required` new kills of the target, then claim.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:'||v_t1,
              (select required from public.active_bounty where user_id=v_uid and slot=v_slot),
              '', 'active');

    select coalesce((select xp from public.player_skills
                      where user_id=v_uid and slot=v_slot and skill_id='bountyHunter'), 0)
      into v_xp0;
    select gold, marks into v_g0, v_m0 from public.player_state where user_id=v_uid and slot=v_slot;

    v := public.hr_claim_bounty__ungated(v_slot);
    if coalesce(v->>'ok','') <> 'true' then raise exception 'GATE(b): the met bounty did not pay: %', v; end if;
    if v->>'xp_skill' <> 'bountyHunter' then
      raise exception 'GATE(b): the receipt did not name the credited skill: %', v;
    end if;

    -- THE CREDIT LANDED, on a character that had NO bountyHunter row.
    select coalesce((select xp from public.player_skills
                      where user_id=v_uid and slot=v_slot and skill_id='bountyHunter'), 0)
      into v_xp1;
    if v_xp1 - v_xp0 <> v_want then
      raise exception 'GATE(b): Bounty-Hunter XP moved by % (expected %) — THE DEFECT THIS FILE '
                      'EXISTS FOR IS STILL LIVE', v_xp1 - v_xp0, v_want;
    end if;

    -- The reward it rode in on is UNCHANGED: tier-1 hard = 420 gold, 8 marks.
    select gold, marks into v_g1, v_m1 from public.player_state where user_id=v_uid and slot=v_slot;
    if v_g1 - v_g0 <> 420 then raise exception 'GATE(b): gold credit was % (expected 420)', v_g1 - v_g0; end if;
    if v_m1 - v_m0 <> 8   then raise exception 'GATE(b): marks credit was % (expected 8)', v_m1 - v_m0; end if;

    -- ONE ledger row, and it describes the XP transfer.
    select count(*) into v_led_n from public.player_ledger where user_id=v_uid and kind='bounty';
    if v_led_n <> 1 then raise exception 'GATE(b): expected exactly 1 bounty ledger row, found %', v_led_n; end if;
    select skill_id, xp, xp_in into v_led_skill, v_led_xp, v_led_in
      from public.player_ledger where user_id=v_uid and kind='bounty';
    if v_led_skill is distinct from 'bountyHunter' or v_led_xp <> v_want then
      raise exception 'GATE(b): the journal does not describe the credit (skill=%, xp=%) — the '
                      'transfer is not reconstructible', v_led_skill, v_led_xp;
    end if;
    if coalesce(v_led_in, 0) <> 0 then
      raise exception 'GATE(b): xp_in is % — a once-per-accept catalogued reward must stay OUT of '
                      'the shared daily inflow budget', v_led_in;
    end if;

    -- REPLAY: the once-guard holds for the XP exactly as it does for the gold.
    v := public.hr_claim_bounty__ungated(v_slot);
    if v->>'error' <> 'no_active_bounty' then raise exception 'GATE(b): replay not refused: %', v; end if;
    select coalesce((select xp from public.player_skills
                      where user_id=v_uid and slot=v_slot and skill_id='bountyHunter'), 0)
      into v_xp2;
    if v_xp2 <> v_xp1 then
      raise exception 'GATE(b): a REPLAY re-credited Bounty-Hunter XP (% -> %)', v_xp1, v_xp2;
    end if;

    -- (c) THE GATE THE DEFECT ACTUALLY BROKE. The board's tier-2 rung is
    --     Bounty-Hunter level 20; prove the server's own curve agrees, so the
    --     client's getUnlockedBountyTier has a reachable input.
    if public.hr_level_from_xp(v_xp1) < 1 then
      raise exception 'GATE(c): the credited xp does not resolve to a level';
    end if;
    if public.hr_level_from_xp(4470::bigint) <> 20 then
      raise exception 'GATE(c): 4,470 xp is level % on this server, not 20 — the tier-2 rung the '
                      'client gates on is not the rung this credit climbs',
                      public.hr_level_from_xp(4470::bigint);
    end if;
    if public.hr_level_from_xp(4469::bigint) >= 20 then
      raise exception 'GATE(c): the level curve is not discriminating at the tier-2 rung';
    end if;

    raise exception using errcode = 'HR819', message = 'bounty-hunter-xp §2 complete — rolling back';
  exception when sqlstate 'HR819' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from public.player_skills   where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.active_bounty   where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row';
  end if;

  -- (d) THE SECURITY POSTURE DID NOT MOVE. No new client reach, no new write
  --     surface on the tables this credit touches.
  if has_function_privilege('authenticated', c_sig, 'execute')
     or has_function_privilege('anon', c_sig, 'execute') then
    raise exception 'GATE(d): the __ungated inner is client-executable — the rate gate is decoration';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_claim_bounty(int)', 'execute') then
    raise exception 'GATE(d): the gated wrapper is not callable by authenticated — the feature is dead';
  end if;
  if exists (select 1 from information_schema.role_table_grants
              where table_schema='public' and table_name='player_skills'
                and grantee in ('anon','authenticated','service_role','PUBLIC','hr_engine')
                and privilege_type <> 'SELECT') then
    raise exception 'GATE(d): a client write grant exists on player_skills — the ranked xp this '
                    'file now credits would be directly forgeable';
  end if;
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='player_skills' and cmd <> 'SELECT') then
    raise exception 'GATE(d): player_skills grew a non-SELECT policy';
  end if;

  raise notice 'bounty-hunter-xp: hr_claim_bounty__ungated now credits player_skills.bountyHunter '
               'from active_bounty.xp_reward, upserted, once-guarded, journalled with skill_id/xp, '
               'xp_in 0, ACL unchanged, receipt names the skill';
end $do$;
