-- 2026-09-12-bounty-accept-bh-clamp.sql   (SA-048)
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- Security review REQUIRED before apply. The Coordinator applies it by hand as
-- one transaction (Management API / execute_sql). It adds ONE immutable lookup
-- function no client role may execute, and splices TWO anchors inside
-- hr_accept_bounty__ungated. It moves NO row, NO grant on any existing object,
-- and NO policy.
--
--   APPLY AFTER: 2026-08-23-bounty.sql (the accept body + hr_bounty_combat_level
--   + hr_bounty_unlocked_tier + hr_level_from_xp), 2026-08-29-bounty-first-
--   contract.sql and 2026-09-04-bounty-difficulty-count.sql (the last authors of
--   the accept body — this file's anchors are the difficulty-count body).
--   §0 fails closed if any precondition is absent.
--
--   ⚠ APPLY THIS FILE IN ONE TRANSACTION: begin; <this file> commit;
--     §1 creates one function with a DEFAULT ACL and §1's revoke is the NEXT
--     statement; applied statement-by-statement in autocommit there is a window
--     in which it is callable by a role that must never call it (measured on
--     nezapsylztqbbwuwembx 2026-09-04: a postgres apply exposes service_role, a
--     supabase_admin apply and PGlite expose anon+authenticated). §1c REFUSES the
--     apply if it finds itself outside a transaction. The file carries no `begin;`
--     of its own because both appliers already wrap it (tests/schema-replay.mjs
--     does `begin; <file> commit;`, and execute_sql runs the whole file as one
--     implicit transaction) — a nested `begin` would commit early and warn.
--
--   NO EDGE REDEPLOY. src/core/bounty.js is not in the hr-accrue import graph and
--   this file touches only the accept RPC.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE EXPLOIT (SA-048), and what it ACTUALLY is (corrected 2026-09-05)
-- ══════════════════════════════════════════════════════════════════════════
-- b504 armed Bounty-Hunter XP: hr_claim_bounty now credits player_skills
-- (skill_id='bountyHunter') server-side, so the bounty board became a RANKED
-- surface (hr_lb_skills carries a bountyHunter board and hr_total_level sums it).
--
-- hr_accept_bounty__ungated gates the target's TIER by the SERVER COMBAT level
-- ONLY:  v_maxtier := hr_bounty_unlocked_tier(hr_bounty_combat_level(...)); refuse
-- if v_tier > v_maxtier. There is NO Bounty-Hunter-level gate.
--
-- The FIRST draft of this file also added a BOARD-TIER clamp, on the premise
-- (stated in src/core/bounty.js's own boardTierForBountyLevel docstring) that
-- "the board posts min(combat tier, board tier)". SECURITY PROVED THAT PREMISE
-- FALSE BY EXECUTION (2026-09-05), and the removal is this file's whole change of
-- direction:
--   · generateBountyBoard (src/core/bounty.js) computes `tier =
--     unlockedTier(combatLevel)` — COMBAT LEVEL ONLY. There is no `min` with
--     boardTierForBountyLevel anywhere in board generation.
--   · boardTierForBountyLevel is reachable only through
--     window.getUnlockedBountyTier (legacy.js), which has ZERO call sites — it is
--     DEAD CODE. The docstring describes an intention that was never wired.
--   · Driving the real generator: CL70/BH1 → the board posts maxTier 6; CL70/BH20
--     → still 6. Board DEPTH does NOT move with the Bounty-Hunter level.
-- So the pre-existing combat gate already blocks a tier above the combat level —
-- exactly the depth the board offers — and a board-tier clamp would close NO gap.
-- What it WOULD do is refuse an honest CL70/BH1 player the tier-6 contracts their
-- own board legitimately shows them → a dead bounty (active locally, no server
-- row, board blocked, Marks charged to abandon at BH>=10). That is an honest
-- lockout, and it is why the clamp is GONE.
--
-- ══════════════════════════════════════════════════════════════════════════
-- WHAT REMAINS FORGEABLE — DIFFICULTY, AND ONLY DIFFICULTY
-- ══════════════════════════════════════════════════════════════════════════
-- Does hr_bounty_reward(tier,'cull',difficulty) scale the XP with difficulty, or
-- only gold/marks? IT SCALES THE XP. Measured on production 2026-09-05, tier 1
-- cull: easy 38 / normal 45 / hard 59 / elite 79 XP — the same 0.85/1.0/1.3/1.75
-- ladder BOUNTY_DIFFICULTY_MULT prices gold and marks with. Tier 6 cull: easy
-- 935 / normal 1100 / hard 1430 / elite 1925.
--
-- The board posts 'hard' (slot 3) ONLY once 'streak' unlocks (Bounty-Hunter
-- level >= 15, generateBountyBoard); below that it never offers 'hard', and
-- 'elite' is NEVER board-generated (and is already refused at the accept). So a
-- CL70/BH1 player calling the RPC directly with difficulty='hard' buys the
-- hard/normal = 1.3/1.0 = 1.3x XP multiplier on the now-RANKED bountyHunter
-- skill without the board ever having offered it. That 1.3x is the ENTIRE
-- forgeable ranked gain (the earlier "~40x" figure was an artifact of the false
-- board-tier premise — tier is honestly combat-gated, so the multiplier is all
-- that is left). This is exactly the easy/normal/hard residual the 2026-08-23
-- elite-refusal header explicitly deferred "to that follow-up"; this file is it.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE FIX — DIFFICULTY CLAMP ONLY
-- ══════════════════════════════════════════════════════════════════════════
-- DIFFICULTY CLAMP. hr_bounty_difficulty_unlocked(p_difficulty, bh_level):
--   easy/normal always board-legal; 'hard' only at BH>=15 (the 'streak' unlock in
--   unlockedTypes, which is what gates the board's slot-3 'hard'); 'elite' and
--   anything unknown/null → false (elite is already refused earlier; this is
--   defence in depth). bh_level is hr_level_from_xp(player_skills.bountyHunter.xp),
--   defaulting to 0 xp → level 1 when the row is absent (FAIL CLOSED to the
--   shallowest difficulty, never 'hard' because a read missed). A forged over-level
--   difficulty is refused as difficulty_locked.
--
-- THE TIER GATE IS LEFT EXACTLY AS IT WAS — combat level only
-- (v_maxtier := hr_bounty_unlocked_tier(v_cl)). This file adds NO board-tier
-- clamp; the combat gate already matches the depth the board offers.
--
-- HONEST PLAY IS UNCHANGED. The client only ever sends what the board generated,
-- and the board never posts a difficulty harder than this ladder allows — so
-- every honest (tier, difficulty) pair still passes, and the SUCCESS return
-- statement of the accept is byte-for-byte untouched (the splice only adds the BH
-- read and one difficulty refusal branch — the combat-tier gate below it is
-- restated verbatim). tests/bounty-accept-bh-clamp.mjs proves it by replaying the
-- chain BOTH with and without this file and asserting an honest accept's envelope
-- is identical, AND asserts the exact anti-lockout case the removed clamp would
-- have broken (honest CL70/BH1 tier-6 'normal' is ALLOWED, never tier_locked).
--
-- ══════════════════════════════════════════════════════════════════════════
-- REVERSIBILITY  (targeted create-or-replace, NEVER a file re-apply)
-- ══════════════════════════════════════════════════════════════════════════
-- The pre-patch body is PINNED: raw pg_get_functiondef md5
-- 211639b00b2dd5c1890a751c3b7fe6c4, raw len 4902 (measured on production
-- 2026-09-05). Gate the revert on the RAW md5, not a normalised one: the live
-- body carries no CRs, so a CR-strip does not reproduce the normalised value and
-- the raw pin is the reliable check. To revert, run ONE targeted `create or
-- replace function public.hr_accept_bounty__ungated(...) ... $function$;`
-- restoring exactly that body — do NOT re-apply 2026-08-23-bounty.sql (it also
-- restates hr_rpc_gate with a stale bucket case and would trigger the game-wide
-- "everything rate_limited" outage), and do NOT re-apply
-- 2026-09-04-bounty-difficulty-count.sql via file (its own splice would then
-- double-refuse to re-run). The exact pre-patch body to restore is checked in at
-- docs/design/bounty-accept-bh-clamp.md. Then
-- `drop function public.hr_bounty_difficulty_unlocked(text,integer);`, and verify
-- md5(pg_get_functiondef(...)) is back to raw 211639b0. `create or replace`
-- preserves proacl so no grant moves. After apply/revert re-pin:
-- node tests/live-hash-drift.mjs --live --write.
--
-- COST AT 100x PLAYERS: zero rows, zero bytes. One IMMUTABLE constant lookup and
-- one indexed player_skills read (pk (user_id,slot,skill_id)) per ACCEPT — a
-- rare, one-row-per-character gesture. No new index, write, or journal entry.
-- ══════════════════════════════════════════════════════════════════════════


-- ── §0. FAIL CLOSED ─────────────────────────────────────────────────────────
-- Facts about the LIVE database, not about file order: this file patches whatever
-- is installed and must refuse rather than half-apply.
do $$
begin
  if to_regprocedure('public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)') is null then
    raise exception 'hr_accept_bounty__ungated is absent — apply 2026-08-23-bounty.sql (and the '
                    'bounty chain) first; there is nothing to clamp.';
  end if;
  if to_regprocedure('public.hr_bounty_combat_level(uuid,int)') is null
     or to_regprocedure('public.hr_bounty_unlocked_tier(int)') is null then
    raise exception 'the combat-tier gate helpers are absent — apply 2026-08-23-bounty.sql first.';
  end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'hr_level_from_xp is absent — the BH-level read cannot be built.';
  end if;
  if to_regclass('public.player_skills') is null then
    raise exception 'player_skills is absent — the Bounty-Hunter XP the clamp reads has nowhere to live.';
  end if;
  -- The anchors this file splices are the DIFFICULTY-COUNT body. If they are not
  -- present the installed body predates that file, and §2 would refuse anyway —
  -- but say so here with the fix rather than an anchor-drift number.
  if position('hr_bounty_kill_range(v_tier, p_difficulty)' in
      replace(pg_get_functiondef('public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)'::regprocedure), chr(13), '')) = 0 then
    raise exception 'the installed accept body is not the difficulty-count body — apply '
                    '2026-09-04-bounty-difficulty-count.sql first, then this file.';
  end if;
end $$;


-- ── §1. THE DIFFICULTY LADDER THE SERVER NOW OWNS ───────────────────────────
-- An IMMUTABLE constant lookup. It mirrors src/core/bounty.js BY VALUE and is
-- bound to it in tests/bounty-accept-bh-clamp.mjs — the '15' below to the
-- 'streak' unlock in unlockedTypes (the level at which the board's slot-3 'hard'
-- first appears).
--
-- Which difficulties the BOARD may POST for a Bounty-Hunter level. easy/normal
-- are always board-legal (slots 1 and 2); 'hard' is slot 3 and appears only once
-- 'streak' unlocks (BH>=15); 'elite' is never board-generated (and is refused
-- earlier in the accept). Unknown/NULL → false: FAIL CLOSED.
create or replace function public.hr_bounty_difficulty_unlocked(p_difficulty text, p_bh_level integer)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $fn$
  select case p_difficulty
    when 'easy'   then true
    when 'normal' then true
    when 'hard'   then coalesce(p_bh_level, 0) >= 15
    else false
  end;
$fn$;

revoke execute on function public.hr_bounty_difficulty_unlocked(text, integer) from public;
revoke execute on function public.hr_bounty_difficulty_unlocked(text, integer) from anon, authenticated, service_role;


-- ── §1c. AUTOCOMMIT REFUSE ──────────────────────────────────────────────────
-- HOW IT KNOWS. pg_current_xact_id_if_assigned() is non-null once the current
-- transaction has WRITTEN something. §1's `create or replace function` wrote
-- pg_proc. So inside a transaction (or one implicit multi-statement one) §1's xid
-- is still ours and this reads NON-NULL — pass; in autocommit §1 committed and
-- went away, this read-only block assigned no xid of its own — NULL, refuse.
-- ⚠ NOT statement_timestamp() <> now(): a multi-statement simple query has ONE
--   statement_timestamp for the whole message, so that test reads "autocommit"
--   even inside an explicit begin/commit (measured on prod 2026-09-04).
do $$
begin
  if pg_current_xact_id_if_assigned() is null then
    raise exception 'PRECONDITION: this file is being applied in AUTOCOMMIT. §1 creates a '
                    'lookup function with a DEFAULT ACL and revokes it one statement later, '
                    'so an unwrapped apply leaves it briefly callable by a role that must not '
                    'call it. Re-run as: begin; <this file> commit;';
  end if;
end $$;


-- ── §2. THE CALL SITE ───────────────────────────────────────────────────────
-- PROGRAMMATIC, ANCHORED, EXACTLY-ONCE, CR-TOLERANT, IDEMPOTENT. Never a template
-- restatement of a body this file did not author — hr_accept_bounty__ungated has
-- been authored by 2026-08-23-bounty.sql and spliced by -first-contract and
-- -difficulty-count, so a restatement here would revert whichever ran last (the
-- b484–b487 "everything refuses" class). Two anchors, each verified at exactly 1
-- hit on production pg_get_functiondef 2026-09-05:
--   c_a1  the v_maxtier DECLARE            → add a v_bh_lvl declaration
--   c_a2  the COMBAT-LEVEL GATE block      → BH read + difficulty gate, then the
--                                            SAME combat-tier gate restated verbatim
-- proacl captured before the replace and asserted byte-identical after.
do $do$
declare
  v_src text; v_new text; v_hits int;
  v_acl_before text; v_acl_after text;
  c_sig constant text := 'public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)';
  c_a1  constant text := '  v_maxtier  int;';
  c_r1  constant text :=
       '  v_maxtier  int;' || chr(10)
    || '  v_bh_lvl   int;';
  c_a2  constant text :=
       '  -- COMBAT-LEVEL GATE: the target''s tier must be unlocked by the SERVER combat level.' || chr(10)
    || '  v_cl := public.hr_bounty_combat_level(auth.uid(), v_slot);' || chr(10)
    || '  v_maxtier := public.hr_bounty_unlocked_tier(v_cl);' || chr(10)
    || '  if v_tier > v_maxtier then' || chr(10)
    || '    return jsonb_build_object(''ok'', false, ''error'', ''tier_locked'',' || chr(10)
    || '      ''tier'', v_tier, ''unlocked_tier'', v_maxtier, ''combat_level'', v_cl);' || chr(10)
    || '  end if;';
  c_r2  constant text :=
       '  -- SA-048 BH-LEVEL READ. The Bounty-Hunter level the SERVER owns' || chr(10)
    || '  -- (player_skills.bountyHunter.xp -> hr_level_from_xp). Absent row -> 0 xp -> level 1:' || chr(10)
    || '  -- FAIL CLOSED to the shallowest difficulty, never ''hard'' because a read missed.' || chr(10)
    || '  v_bh_lvl := public.hr_level_from_xp(coalesce((' || chr(10)
    || '    select xp from public.player_skills' || chr(10)
    || '     where user_id = auth.uid() and slot = v_slot and skill_id = ''bountyHunter''), 0));' || chr(10)
    || '' || chr(10)
    || '  -- SA-048 DIFFICULTY GATE. The board posts ''hard'' only once ''streak'' unlocks' || chr(10)
    || '  -- (BH>=15, generateBountyBoard slot 3); easy/normal are always board-legal and' || chr(10)
    || '  -- ''elite'' is refused above. A forged ''hard'' at BH<15 buys the 1.3x difficulty' || chr(10)
    || '  -- multiplier on the now-RANKED bountyHunter skill. This is the ONLY forgeable ranked' || chr(10)
    || '  -- gain: the target TIER is honestly gated by the combat level below (the board offers' || chr(10)
    || '  -- exactly unlockedTier(combatLevel); there is no board-tier min to enforce).' || chr(10)
    || '  if not public.hr_bounty_difficulty_unlocked(p_difficulty, v_bh_lvl) then' || chr(10)
    || '    return jsonb_build_object(''ok'', false, ''error'', ''difficulty_locked'',' || chr(10)
    || '      ''difficulty'', p_difficulty, ''bounty_level'', v_bh_lvl);' || chr(10)
    || '  end if;' || chr(10)
    || '' || chr(10)
    || '  -- COMBAT-LEVEL GATE: the target''s tier must be unlocked by the SERVER combat level.' || chr(10)
    || '  v_cl := public.hr_bounty_combat_level(auth.uid(), v_slot);' || chr(10)
    || '  v_maxtier := public.hr_bounty_unlocked_tier(v_cl);' || chr(10)
    || '  if v_tier > v_maxtier then' || chr(10)
    || '    return jsonb_build_object(''ok'', false, ''error'', ''tier_locked'',' || chr(10)
    || '      ''tier'', v_tier, ''unlocked_tier'', v_maxtier, ''combat_level'', v_cl);' || chr(10)
    || '  end if;';
begin
  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');

  if position('hr_bounty_difficulty_unlocked(p_difficulty, v_bh_lvl)' in v_src) > 0 then
    raise notice 'hr_accept_bounty__ungated already carries the SA-048 difficulty clamp — patch skipped';
    return;
  end if;

  v_hits := (length(v_src) - length(replace(v_src, c_a1, ''))) / length(c_a1);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT (v_maxtier declare): matched % times, expected exactly 1. '
                    'Refusing to patch blind.', v_hits;
  end if;
  v_hits := (length(v_src) - length(replace(v_src, c_a2, ''))) / length(c_a2);
  if v_hits <> 1 then
    raise exception 'ANCHOR DRIFT (combat-level gate): matched % times, expected exactly 1. '
                    'Refusing to patch blind — the accept body has moved.', v_hits;
  end if;

  v_new := replace(replace(v_src, c_a1, c_r1), c_a2, c_r2);

  select coalesce(proacl::text, '') into v_acl_before from pg_proc where oid = c_sig::regprocedure;
  execute v_new;
  select coalesce(proacl::text, '') into v_acl_after  from pg_proc where oid = c_sig::regprocedure;
  if v_acl_after is distinct from v_acl_before then
    raise exception 'ACL MOVED on hr_accept_bounty__ungated (% -> %) — a body replace must never '
                    'change who may call it.', v_acl_before, v_acl_after;
  end if;

  raise notice 'patched hr_accept_bounty__ungated: difficulty is BH-gated; the tier gate is left combat-only';
end $do$;


-- ── §3. THE FILE CANNOT SUCCEED QUIETLY ─────────────────────────────────────
-- Pure-value checks on the difficulty ladder, text checks that the splice landed
-- and weakened nothing (and that NO board-tier clamp crept in), an ACL check, and
-- an EXECUTED probe in a discarded subtransaction that drives the real RPC and
-- forces a rollback.
do $$
declare
  v_src text;
  v_uid uuid := gen_random_uuid();
  v_slot int := 0;
  v_t1 text; v_t6 text;
  vhard jsonb; v6 jsonb; vh15 jsonb;
begin
  -- (a) the difficulty helper returned the ruling values.
  if public.hr_bounty_difficulty_unlocked('easy', 1)  is not true  then raise exception 'VERIFY: easy@1'; end if;
  if public.hr_bounty_difficulty_unlocked('normal', 1) is not true then raise exception 'VERIFY: normal@1'; end if;
  if public.hr_bounty_difficulty_unlocked('hard', 14)  is not false then raise exception 'VERIFY: hard@14 must be locked'; end if;
  if public.hr_bounty_difficulty_unlocked('hard', 15)  is not true  then raise exception 'VERIFY: hard@15 must unlock'; end if;
  if public.hr_bounty_difficulty_unlocked('hard', null) is not false then raise exception 'VERIFY: hard@null must fail closed'; end if;
  if public.hr_bounty_difficulty_unlocked('elite', 99) is not false then raise exception 'VERIFY: elite must never be board-legal'; end if;
  if public.hr_bounty_difficulty_unlocked('nonsense', 99) is not false then raise exception 'VERIFY: unknown difficulty must fail closed'; end if;

  -- (b) the splice landed, WEAKENED NOTHING, and added NO board-tier clamp.
  v_src := replace(pg_get_functiondef(
    'public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)'::regprocedure), chr(13), '');
  if position('''difficulty_locked''' in v_src) = 0 then
    raise exception 'VERIFY: the difficulty gate did not land';
  end if;
  if position('hr_bounty_difficulty_unlocked(p_difficulty, v_bh_lvl)' in v_src) = 0 then
    raise exception 'VERIFY: the accept does not consult the difficulty gate';
  end if;
  if position('public.hr_bounty_combat_level(auth.uid(), v_slot)' in v_src) = 0 then
    raise exception 'VERIFY: the combat-level read is gone — the tier gate lost its combat half';
  end if;
  if position('v_maxtier := public.hr_bounty_unlocked_tier(v_cl);' in v_src) = 0 then
    raise exception 'VERIFY: the tier gate is no longer the plain combat-only unlocked_tier';
  end if;
  -- The whole point of the redirect: NO board-tier clamp. If a `least(...)` or a
  -- board-tier lookup ever appears here again, the false-premise clamp is back.
  if position('hr_bounty_board_tier_for_level' in v_src) > 0 then
    raise exception 'VERIFY: a board-tier clamp is present — SA-048 removed it as a false-premise honest lockout';
  end if;
  if position('p_difficulty not in (''easy'',''normal'',''hard'')' in v_src) = 0 then
    raise exception 'VERIFY: the 2026-08-23 elite refusal is gone — this file may not open it';
  end if;
  if position('hr_bounty_kill_range(v_tier, p_difficulty)' in v_src) = 0 then
    raise exception 'VERIFY: the b497 difficulty-scaled kill range is gone — the splice clobbered it';
  end if;

  -- (c) NOBODY MAY CALL THE NEW FUNCTION. It is an internal of a SECURITY
  --     DEFINER body, reached WITHOUT a grant.
  if has_function_privilege('anon', 'public.hr_bounty_difficulty_unlocked(text,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.hr_bounty_difficulty_unlocked(text,integer)', 'execute')
     or has_function_privilege('service_role', 'public.hr_bounty_difficulty_unlocked(text,integer)', 'execute') then
    raise exception 'VERIFY: a client role can execute the new SA-048 difficulty lookup';
  end if;

  -- (d) EXECUTED behaviour, discarded subtransaction (writes player_ledger /
  --     active_bounty, whose retention guards refuse a fresh DELETE). The probe
  --     must prove BOTH halves: the forged difficulty is refused AND no honest
  --     player is locked out.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version)
      values (v_uid, v_slot, 0, 0, 1) on conflict (user_id, slot) do update set gold = 0;
    -- combat maxed (unlockedTier -> 6) so the combat half NEVER refuses tier 6 —
    -- an honest CL70/BH1 tier-6 accept MUST pass, which is the exact case the
    -- removed board-tier clamp would have broken. bountyHunter row DELIBERATELY
    -- ABSENT so the coalesce(...,0) -> level 1 fail-closed path is exercised.
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, 13034431
        from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
      on conflict do nothing;
    select monster_id into v_t1 from public.hr_bounty_monsters where tier = 1 order by monster_id limit 1;
    select monster_id into v_t6 from public.hr_bounty_monsters where tier = 6 order by monster_id limit 1;
    if v_t6 is null then raise exception 'GATE(d): no tier-6 monster to probe with'; end if;

    -- EXPLOIT: BH-1 must NOT accept a 'hard' contract (board posts hard only at BH>=15).
    vhard := public.hr_accept_bounty__ungated(v_slot, 'sa048-h', v_t1, 'cull', 'hard', 100);
    if coalesce(vhard->>'ok','') <> 'false' or vhard->>'error' <> 'difficulty_locked' then
      raise exception 'GATE(d): hard at BH-1 was not difficulty_locked: %', vhard;
    end if;

    -- ANTI-LOCKOUT: an honest CL70/BH1 tier-6 'normal' contract MUST be ALLOWED.
    -- This is the exact case the removed board-tier clamp would have refused.
    v6 := public.hr_accept_bounty__ungated(v_slot, 'sa048-6', v_t6, 'cull', 'normal', 100);
    if coalesce(v6->>'ok','') <> 'true' or (v6->>'tier')::int <> 6 then
      raise exception 'GATE(d): honest tier-6 normal at BH-1 was refused — the honest lockout the clamp removal exists to prevent: %', v6;
    end if;

    -- HONEST at the threshold: 'hard' at BH-15 MUST be ALLOWED (upserts the row).
    insert into public.player_skills (user_id, slot, skill_id, xp)
      values (v_uid, v_slot, 'bountyHunter', (select xp from public.hr_xp_table where level = 15))
      on conflict (user_id, slot, skill_id) do update set xp = excluded.xp;
    vh15 := public.hr_accept_bounty__ungated(v_slot, 'sa048-15', v_t1, 'cull', 'hard', 100);
    if coalesce(vh15->>'ok','') <> 'true' then
      raise exception 'GATE(d): honest hard at BH-15 was refused: %', vh15;
    end if;

    raise exception using errcode = 'HR048',
      message = format('RESULTS hard@BH1=%s tier6normal@BH1=%s hard@BH15=%s - rolling back SA-048 probe',
                       vhard, v6, vh15);
  exception when sqlstate 'HR048' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state  where user_id = v_uid)
     or exists (select 1 from public.active_bounty where user_id = v_uid)
     or exists (select 1 from public.player_skills where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: SA-048 probe LEAKED a row';
  end if;

  raise notice 'SA-048: difficulty is BH-gated (hard@BH1 refused, hard@BH15 allowed); the tier gate is left '
               'combat-only so honest tier-6@BH1 is ALLOWED (no board-tier clamp); ladder bound to src/core/bounty.js';
end $$;
