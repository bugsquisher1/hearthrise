-- 2026-09-02-renown-kill-faucet.sql
--
-- ⚠⚠⚠ REVIEW ONLY — NOT AUTO-APPLIED. ⚠⚠⚠
-- ⚠ FULL SECURITY REVIEW REQUIRED before apply — this closes a MONEY + RANKED
--   faucet, and it does so by changing what a SCORE counts. The score gates
--   hr_claim_rank (1,603,000 gold + 925 gems per character across the ladder)
--   and the renownAllXp perk (+0.04 all-skill XP, which feeds the LIVE
--   total_level / combat_level boards). Read the design in
--   docs/design/renown-kill-faucet.md and the change contract in the PR body.
--
--   ⚠⚠ APPLY ORDER — THIS FILE DEPENDS ON 2026-09-01-kill-daily-credit.sql.
--   §1 patches hr_credit_kills__ungated at an anchor that exists in the body
--   THAT file installs. Applying this one first FAILS CLOSED with a named
--   error. Ship order is: kill-daily FIRST, faucet SECOND.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE DEFECT (Security R5) — PRE-EXISTING AND LIVE, NOT INTRODUCED HERE
-- ══════════════════════════════════════════════════════════════════════════
-- This is the DEPLOYED 2026-08-30-bounty-kill-credit.sql behaviour and has been
-- live since it was applied. It is called out here, in the file that fixes it,
-- rather than left in a review thread.
--
-- hr_credit_kills (bounty branch) writes three lifetime rows, and hr_renown_of
-- SCORES two of them:
--     stat/ev:kill_any               ->  0.05 renown per kill
--     stat/ev:kill_monster:<id>      ->  5    renown per kill, for is_boss ids
-- So a client-reachable verb feeds a score the client must not author.
--
-- ── THE STRUCTURAL ROOT: ONE ROW, THREE CONSUMERS ──────────────────────────
-- hr_bounty_kills — the bounty turn-in's progress source — reads
-- stat/ev:kill_monster:<target>, i.e. THE SAME ROW the bestiary displays and
-- renown scores. hr_credit_kills has to move that row to make a bounty
-- completable, so moving renown is a side effect of making the bounty work.
-- The row is not the problem; scoring the client-credited part of it is.
--
-- ── THE RATE, MEASURED ─────────────────────────────────────────────────────
-- All 108 monsters are bounty-eligible (hr_bounty_monsters is generated from
-- every MONSTERS key) and the 14 bosses are tier 6, gated only by combat level.
-- At damage level 99 the kill-time model gives max_hit_ceil 319, so a 520-HP
-- dragon needs 2 swings -> min_kill_ms 1200 -> the cap allows
--     65 boss kills/min = 325 renown/min = 19,500 renown/hour
-- against roughly 7.5 boss kills/min honest (~8 s/kill): ~8.5x, with no gear,
-- no risk, no deaths and no combat at all.
--
-- ⚠ RE-ACCEPTING IS NOT NEEDED, which is what makes it a faucet rather than a
--   burst: v_applied = max(0, baseline + credit - current) and `credit` grows
--   with elapsed_since_accept, so ONE bounty held indefinitely sustains the
--   rate. (Re-accepting is in fact WORSE for the attacker — it resets
--   accepted_at, so elapsed and therefore the cap restart at 0.)
--
-- ── WHAT THE SCORE BUYS ────────────────────────────────────────────────────
-- The renown BOARD is not the exposure: it was removed from leaderboard_ranked
-- by 2026-08-18-leaderboard-server-source.sql and declared no_server_source.
-- The two consumers that DO read hr_renown_of are:
--   · hr_claim_rank — once per rank per character, serf..highking:
--         1,603,000 gold + 925 gems   (x6 slots = 9,618,000 gold + 5,550 gems)
--     Gold feeds the `wealth` board, which IS server-sourced and live, and is
--     market purchasing power; the gems are premium currency. ~6.2 hours of
--     scripted calls reaches highking against ~53 hours of honest boss killing.
--   · hr_perks_of renownAllXp — +0.01 all-skill XP at each of squire (900),
--     baron (4,500), duke (32,000), highking (120,000) = +0.04, clamped by
--     PERMANENT_CAP. All-skill XP feeds total_level and combat_level, which ARE
--     server-sourced live boards.
--
-- ══════════════════════════════════════════════════════════════════════════
-- THE FIX — DISCOUNT THE CLIENT-CREDITED PORTION INSIDE THE SCORE
-- ══════════════════════════════════════════════════════════════════════════
-- The bounty needs the counter. Renown does not need the CREDITED PART of it.
-- So the counter keeps moving exactly as reviewed, and the score stops counting
-- the part a client verb supplied:
--
--   1. hr_credit_kills (BOUNTY BRANCH ONLY) additionally increments, by the
--      SAME v_applied it already applies to the three lifetime rows:
--          stat/ev:kill_credited:<target>   (per monster, for the boss term)
--          stat/ev:kill_credited_any        (the aggregate, for the kill term)
--   2. hr_renown_of scores
--          kill term  greatest(0, ev:kill_any - ev:kill_credited_any) x 0.05
--          boss term  sum over boss ids of
--                     greatest(0, bestiary(id) - ev:kill_credited:<id>) x 5
--
-- Client credit therefore contributes EXACTLY ZERO renown. This is not a cap or
-- a ceiling — those are fuses, and the whole point of the daily-row work was
-- that a fuse two orders of magnitude above the honest rate is not a control.
--
-- ── WHAT IS DELIBERATELY UNTOUCHED ─────────────────────────────────────────
-- hr_bounty_kills still reads the bestiary row, so the turn-in, the physical-max
-- cap, the per-day ceiling, the idempotency log, the settle-delta discipline and
-- every journal row are BYTE-FOR-BYTE the reviewed behaviour. The bestiary and
-- collection DISPLAYS stay attended-accurate. No client call form moves. No
-- grant is widened. There is no edge change and no client change: this file is
-- server-only, and hr_renown_of is read by the accrual engine alone.
--
-- ── WHY hr_credit_kills IS PATCHED AND hr_renown_of IS RESTATED ─────────────
-- Deliberate asymmetry, and it is the C3 lesson applied rather than repeated:
--   · hr_credit_kills__ungated is a WRITE path with money downstream, and this
--     file did not author its body. Restating it is how a hotfix gets silently
--     reverted (the b484–b487 class in restate-the-body form). So it is PATCHED
--     PROGRAMMATICALLY at a guarded, exactly-once anchor (pg_get_functiondef —
--     the 2026-08-24-combat-style.sql idiom). A patch cannot revert anything it
--     does not name.
--   · hr_renown_of is `stable`, `security definer`, WRITES NOTHING, is ~60 lines
--     of pure arithmetic, is granted only to hr_engine, and is changed in two
--     terms in its middle — an anchor patch on arithmetic would be less legible
--     than the body it replaces. It is restated, and §0b pins the live bytes
--     first so a restatement cannot silently revert a change made since review.
--
-- ── ⚠ RETROACTIVITY: THIS FIX IS FORWARD-ONLY, AND HERE IS EXACTLY WHAT THAT
--      LEAVES BEHIND (Security pre-build condition 2 — stated, not implied) ───
-- The credited counters start at ZERO, so renown for every existing character is
-- UNCHANGED at apply time: nobody loses a rank or a perk the moment this lands.
-- The price of that is precise and must be written down rather than left to be
-- inferred from "no backfill":
--
--   1. EVERY KILL CREDITED SINCE 2026-08-30 KEEPS SCORING, FOREVER. Those kills
--      are already inside stat/ev:kill_any and stat/ev:kill_monster:<id>, and
--      nothing distinguishes them from server-simulated ones. The renown they
--      produce is permanent.
--   2. THERE IS NO BACKFILL SOURCE, and this is structural rather than a matter
--      of effort. The only record of which kills were client-credited is
--      hr_kill_credit_log, whose retention 2026-09-01 §1 sets to TWO DAYS (and
--      whose prune this repo now schedules). Anything older is gone. A backfill
--      would have to invent the split, which is worse than admitting the gap.
--   3. ALREADY-CLAIMED RANKS ARE UNRECOVERABLE. hr_claim_rank consumes a
--      once-per-rank guard row and holds a renown HIGH-WATER with greatest(), so
--      a rank claimed on faucet-inflated renown stays claimed and its gold+gems
--      stay paid even after the live score drops. Up to 1,603,000 gold + 925
--      gems per character could already be banked and is not clawed back here.
--      ⚠ AND THE HIGH-WATER IS WORSE THAN "RANKS ALREADY TAKEN": an inflated
--      renown_high is also a STANDING CLAIM on every rank BELOW it, not only on
--      the ones already claimed. The ratchet does not decay, so a score reached
--      once by the faucet keeps every cheaper rank claimable indefinitely, long
--      after this fix stops the score from rising that way. Moot today — the
--      live maximum renown_high is 773, below even `squire` (900) — but that is
--      an observation about today's data, not a property, so the trigger is
--      recorded: if any character's renown_high is above a rank threshold it did
--      not honestly earn, this is the mechanism that keeps paying.
--   4. THE renownAllXp PERK reads the LIVE score, so it DOES self-correct — but
--      only for future credits; renown already banked from past credits keeps
--      holding the thresholds up.
--
--   THE ANSWER, STATED: the beta is WIPED at cutover (CLAUDE.md, Tyler
--   2026-08-10 — "I do not care if anything has been exploited because this beta
--   version is gonna be wiped anyway. I care about doing it correctly from this
--   point forward"). So the residue above ceases to exist at the wipe, and
--   building a forensic backfill for numbers that are about to be deleted is the
--   wrong work. THAT IS THE WHOLE JUSTIFICATION — if the wipe is ever cancelled
--   or deferred past this fix, THIS PARAGRAPH IS THE THING THAT MUST BE
--   RE-OPENED, because then the correct action becomes a renown recompute plus a
--   rank-claim audit, and neither exists.
--
-- ── STATED COST ────────────────────────────────────────────────────────────
-- Renown no longer scores attended kills that the client credited. That is a
-- deliberate UNDER-count, and it returns renown to exactly its pre-2026-08-30
-- position — no regression against the reviewed baseline, in exchange for
-- removing a faucet that is live now. The alternative is scoring them, which is
-- the faucet.
--
-- ── KEY BUDGET, AND THE TWO PROPERTIES THE DISCOUNT RESTS ON ───────────────
-- 'ev:kill_credited:' is 17 chars, so a monster id may be at most 47 before the
-- key breaks player_progress' 64-char CHECK. That is ONE CHARACTER TIGHTER than
-- the bestiary key it shadows ('ev:kill_monster:' is 16, hence BESTIARY_ID_RE's
-- 48), so a 48-char id would be legal for the bestiary and ILLEGAL here — the
-- credit RPC would start raising a check violation on a live money path. Ids are
-- <=17 today; §0 asserts the 47 ceiling against the real catalogue so the drift
-- fails at APPLY time rather than at a player's next kill (Security F5).
-- 'ev:kill_credited_any' is 20. The population is bounded by the monster
-- catalogue (108) plus one, per character.
--
--   ⚠ (i) THE CREDITED ROWS MUST NEVER BE PRUNED. They carry period_key = '',
--     the PERMANENT population, and hr_progress_prune deletes only
--     `period_key <> ''`. If a credited row could be swept while ev:kill_any
--     survives, the discount would fail OPEN and the faucet would re-open
--     silently — the worst failure mode available here, because nothing would
--     look broken.
--     ⚠ THE FIRST PROOF OF THIS WAS VACUOUS (Security C1) and the correction is
--       recorded because the shape recurs: §3(c6) called hr_progress_prune at
--       `interval '0 seconds'` on rows created microseconds earlier, but the
--       prune floors its age at `greatest(interval '7 days', p_older)`, so it
--       deleted NOTHING and the assertion passed identically whether the rows
--       were permanent or periodic. Measured: fresh → 0 deleted; backdated 400
--       days → the periodic control deleted, credited rows survive. The PROPERTY
--       was true; the PROOF was not testing it. §3(c6) now ages the probe rows
--       past the floor, plants a `period_key <> ''` CONTROL that must die, and
--       fails the FIXTURE loudly if the prune turns out to be a no-op — because
--       "nothing was deleted" is evidence only when something else WAS.
--
--   ⚠ (ii) THE INVARIANT ev:kill_credited:<id> <= ev:kill_monster:<id>. The
--     bestiary row is written ABSOLUTELY (greatest(p.value, baseline + credit))
--     while the credited row is ADDITIVE (+= v_applied), so the two use different
--     merge disciplines on numbers that must stay ordered. It holds because
--     v_applied IS the increase the bestiary row takes (v_target_val - v_current)
--     and the bestiary row never decreases — including under a concurrent settle,
--     which can only raise it further. If it ever inverted, greatest(0, …) would
--     silently UNDER-discount and the faucet would partially re-open. Asserted in
--     §3(c2) and by the guard's mutation `credited_exceeds_bestiary`.
--
-- ── READ COST (Security pre-build condition 5) ─────────────────────────────
-- hr_renown_of is on hr_perks_of's path, which the accrual engine calls on every
-- settle, so this is a hot read and the op-count analysis above (which covers
-- WRITES) does not cover it. What this file adds per call:
--   · kill term: ONE extra scalar subquery on player_progress, fully qualified on
--     (user_id, slot, kind, key, period_key) — the table's PRIMARY KEY — so it is
--     a single index probe.
--   · boss term: ONE left join whose predicate ALSO supplies the complete primary
--     key (cr.user_id, cr.slot, cr.kind, cr.key, cr.period_key), i.e. one index
--     probe per bestiary row already being scanned. The bestiary population is
--     bounded by the monster catalogue: <= 108 probes, and in practice a handful.
-- No new sequential scan and no new sort; the added work is O(bestiary rows)
-- index lookups against a key the table is already clustered on.
-- MEASURED ON PRODUCTION (Security, against a full bestiary): 2.67 ms/call, a
-- DELTA of +0.44 ms over the undiscounted body — i.e. the discount is ~20% of an
-- already-cheap read, on a call that happens once per ~90 s settle.
-- ⚠ The guard's R7 number is a PGlite figure (~3 ms, noisy) and is a PROXY, not
--   the production cost: it exists to catch a plan that collapsed into a scan
--   per bestiary row (which would read orders of magnitude higher), not to
--   benchmark. The 2.67 ms above is the number to quote.
--
-- REVERSIBILITY: re-apply 2026-08-20-renown.sql (restores the undiscounted
-- hr_renown_of) and re-apply 2026-09-01-kill-daily-credit.sql §3 (restores the
-- unpatched hr_credit_kills__ungated). The ev:kill_credited* rows may be left in
-- place, unread. Additive overall; no table, no grant, no client surface.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ─────────────────────────────────────────
do $$
declare v_ck text;
begin
  if to_regclass('public.player_state')    is null then raise exception 'player_state missing'; end if;
  if to_regclass('public.player_progress') is null then raise exception 'player_progress missing'; end if;
  if to_regclass('public.hr_activities')   is null then
    raise exception 'hr_activities missing — the boss filter has nothing to join against';
  end if;
  if to_regprocedure('public.hr_renown_of(uuid,int)') is null then
    raise exception 'hr_renown_of not found — apply 2026-08-20-renown.sql first';
  end if;
  if to_regprocedure('public.hr_lb_combat_level(int,int,int,int,int,int,int)') is null then
    raise exception 'hr_lb_combat_level not found — hr_renown_of cannot be restated without it';
  end if;
  if to_regprocedure('public.hr_level_from_xp(bigint)') is null then
    raise exception 'hr_level_from_xp not found';
  end if;
  if to_regprocedure('public.hr_credit_kills__ungated(int,text,bigint,text)') is null then
    raise exception 'hr_credit_kills__ungated not found — apply 2026-08-30-bounty-kill-credit.sql first';
  end if;

  -- ⚠ THE KEY-LENGTH CEILING (Security F5). 'ev:kill_credited:' is 17 chars
  --   against player_progress' 64-char key CHECK, so a monster id may be at most
  --   47 — ONE TIGHTER than the bestiary key this shadows ('ev:kill_monster:' is
  --   16, hence BESTIARY_ID_RE's 48). A 48-char id would therefore be legal for
  --   the bestiary and ILLEGAL here, and the first kill credited against it would
  --   raise a check violation inside a live money verb. Ids are <=17 today; this
  --   fails the APPLY instead of a player's next kill.
  if exists (select 1 from public.hr_bounty_monsters where length(monster_id) > 47) then
    raise exception 'monster id(s) longer than 47 chars exist (%) — ''ev:kill_credited:'' || id '
                    'would break player_progress'' 64-char key CHECK and hr_credit_kills would '
                    'raise on the next kill. Shorten the id or shorten the key prefix.',
                    (select string_agg(monster_id, ', ') from public.hr_bounty_monsters
                      where length(monster_id) > 47);
  end if;
  v_ck := null;   -- the credit body is pinned by hash in §0a, not probed here
end $$;

-- ── 0a. ⚠ THE ORDER DEPENDENCY, PINNED BY HASH — NOT BY A SUBSTRING ────────
-- TWO migrations one commit apart now touch hr_credit_kills__ungated. That is
-- the b484–b487 coupling living inside a single worktree, so it is pinned rather
-- than described.
--
-- ⚠ A SUBSTRING PROBE IS NOT ENOUGH, AND THAT IS MEASURED RATHER THAN ASSUMED.
--   The first revision of this block tested strpos(v_settle_delta) /
--   strpos(kills_stat) — "does it LOOK like the kill-daily body?". Security
--   proved the identical idiom in 2026-09-01 §0b waves through a HOTFIX APPLIED
--   ON TOP, because such a body still contains both substrings. That file now
--   pins two hashes; so does this one. A patch cannot revert what it does not
--   name, but it CAN silently graft itself onto a body nobody reviewed — the
--   anchor it needs may well still match.
--
--   c_expect   the body 2026-09-01-kill-daily-credit.sql installs — i.e. exactly
--              that file's own c_self. ONE number pinned in BOTH files, so they
--              cannot drift apart about what "the kill-daily body" means.
--   c_applied  this file's own output, so a re-apply is a no-op, not a refusal.
--
-- Both measured on the PGlite replay of tests/schema-apply-order.json, which was
-- verified byte-for-byte against production for the 2026-08-30 baseline.
-- '[[:space:]]+' and not '\s+': the two runtimes disagree on backslash classes
-- under standard_conforming_strings (measured).
do $$
declare
  c_expect  constant text := '31894cffe792cebf6e50a0765f65c6ed';  -- post-2026-09-01 (norm len 19236)
  c_applied constant text := '31807e6470bb0c870097490becf15338';                     -- post-THIS-FILE (norm len 20235)
  v_ck  text;
  v_md5 text;
begin
  v_ck  := pg_get_functiondef('public.hr_credit_kills__ungated(int,text,bigint,text)'::regprocedure);
  v_md5 := md5(regexp_replace(v_ck, '[[:space:]]+', ' ', 'g'));
  if v_md5 = c_expect then
    raise notice 'hr_credit_kills__ungated is the expected post-kill-daily body (%)', v_md5;
    return;
  end if;
  if v_md5 = c_applied then
    raise notice 'hr_credit_kills__ungated already carries THIS file''s patch (%) — re-apply', v_md5;
    return;
  end if;
  if position('v_settle_delta' in v_ck) = 0 or position('kills_stat' in v_ck) = 0 then
    raise exception 'hr_credit_kills__ungated does not carry the kill-daily body — apply '
                    '2026-09-01-kill-daily-credit.sql FIRST. These two ship adjacent and this one '
                    'is SECOND; it patches the body that file installs. (live md5 %)', v_md5;
  end if;
  raise exception
    'BODY DRIFT — hr_credit_kills__ungated is md5 % (normalised length %). It LOOKS like the '
    'kill-daily body but is NEITHER the reviewed post-2026-09-01 body (%) NOR this file''s own '
    'output (%) — something changed it after review, most likely a hotfix. §1 would graft a patch '
    'onto a body nobody reviewed. STOP: diff the live body, re-take the review, then update the '
    'hash DELIBERATELY. Do not edit the hash to make this pass.',
    v_md5, length(regexp_replace(v_ck, '[[:space:]]+', ' ', 'g')), c_expect, c_applied;
end $$;

-- ── 0b. THE BASELINE FINGERPRINT for the body §2 RESTATES (the C3 idiom) ────
-- §2 restates hr_renown_of in full, so the body it replaces must be the one that
-- was reviewed — otherwise this file silently reverts whatever changed it.
--
-- THE BASELINE: md5 beed1fb6221211794ee5853dfb111062 (normalised length 2931).
-- MEASURED 2026-08-29 on BOTH sides and they agree exactly:
--   · production nezapsylztqbbwuwembx (read-only pg_get_functiondef), and
--   · a full PGlite replay of tests/schema-apply-order.json,
-- so this asserts "live == the reviewed 2026-08-20-renown.sql body", not merely
-- "live == whatever was there when I looked". hr_renown_of has exactly one
-- toucher in the chain (2026-08-20-renown.sql) and is on no derivation chain;
-- THIS FILE BECOMES ITS NEW LAST TOUCHER.
--
-- ⚠ '[[:space:]]+' AND NOT '\s+'. A backslash class in a single-quoted literal
--   is parsed differently depending on standard_conforming_strings, and the two
--   runtimes this file must satisfy do NOT agree: measured 2026-08-29, the same
--   '\s+' expression normalised whitespace on production and ate every letter
--   `s` under the PGlite replay, producing two different hashes for one
--   identical body. A gate that fires differently in the harness than on
--   production is worse than no gate.
--
-- REFUSING is the correct outcome. Re-run the review against the live body, then
-- rebase §2 onto it and update this hash DELIBERATELY. Never edit the hash to
-- make the apply go through — that is the check working.
do $$
declare
  c_baseline constant text := 'beed1fb6221211794ee5853dfb111062';
  v_live text;
  v_md5  text;
begin
  v_live := pg_get_functiondef('public.hr_renown_of(uuid,int)'::regprocedure);
  v_md5  := md5(regexp_replace(v_live, '[[:space:]]+', ' ', 'g'));
  if v_md5 = c_baseline then
    raise notice 'baseline fingerprint OK (%) — the live hr_renown_of is the reviewed body', v_md5;
    return;
  end if;
  -- Recognise our own output so a re-apply is a no-op rather than a refusal.
  if position('ev:kill_credited_any' in v_live) > 0 then
    raise notice 'hr_renown_of already carries the credited discount — re-apply, fingerprint skipped';
    return;
  end if;
  raise exception
    'BASELINE DRIFT — the live hr_renown_of is md5 % (normalised length %), not the reviewed '
    'baseline % . §2 RESTATES that body in full, so applying now would silently revert whatever '
    'changed it. STOP: diff the live body against 2026-08-20-renown.sql, re-take the review, then '
    'rebase §2 and update the hash DELIBERATELY.',
    v_md5, length(regexp_replace(v_live, '[[:space:]]+', ' ', 'g')), c_baseline;
end $$;

-- ── 1. hr_credit_kills__ungated — PATCHED AT AN ANCHOR, never restated ──────
-- Appends the two CREDITED counters beside the three lifetime rows the bounty
-- branch already writes, using the SAME v_applied. The anchor is the whole
-- `kills` upsert statement — a complete statement, not one of its lines, so the
-- insertion point is unambiguous and no half-statement can be left dangling.
-- Guarded exactly-once; refuses to patch blind; NO-OP on re-apply. This file is
-- therefore a member of NO derivation chain for hr_credit_kills and takes over
-- no last-toucher role for it.
do $$
declare
  v_src text; v_new text;
  c_anchor constant text :=
    '      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)' || chr(10) ||
    '        values (v_uid, v_slot, ''stat'', ''kills'', '''', v_applied, ''active'')' || chr(10) ||
    '        on conflict (user_id, slot, kind, key, period_key)' || chr(10) ||
    '          do update set value = p.value + v_applied, updated_at = now();';
begin
  select pg_get_functiondef('public.hr_credit_kills__ungated(int,text,bigint,text)'::regprocedure) into v_src;
  v_src := replace(v_src, chr(13), '');   -- CR-tolerant (CRLF working copies)
  if position('ev:kill_credited_any' in v_src) > 0 then
    raise notice 'hr_credit_kills__ungated already writes the credited counters — patch skipped';
    return;
  end if;
  if (length(v_src) - length(replace(v_src, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_credit_kills__ungated `kills` upsert anchor did not match exactly '
                    'once — refusing to patch blind. Re-apply 2026-09-01-kill-daily-credit.sql, '
                    'then this file.';
  end if;
  v_new := replace(v_src, c_anchor, c_anchor || chr(10) || chr(10) ||
    '      -- ── THE RENOWN DISCOUNT COUNTERS (R5) ───────────────────────────' || chr(10) ||
    '      -- The SAME v_applied, recorded so hr_renown_of can subtract the part' || chr(10) ||
    '      -- of the kill counters a CLIENT supplied. Bounty branch only, which is' || chr(10) ||
    '      -- the only branch that writes the renown-bearing rows at all. These are' || chr(10) ||
    '      -- permanent rows (period_key = ''''), so hr_progress_prune never sweeps' || chr(10) ||
    '      -- them: a pruned discount would silently re-open the faucet.' || chr(10) ||
    '      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)' || chr(10) ||
    '        values (v_uid, v_slot, ''stat'', ''ev:kill_credited:'' || p_target, '''', v_applied, ''active'')' || chr(10) ||
    '        on conflict (user_id, slot, kind, key, period_key)' || chr(10) ||
    '          do update set value = p.value + v_applied, updated_at = now();' || chr(10) ||
    '      insert into public.player_progress as p (user_id, slot, kind, key, period_key, value, state)' || chr(10) ||
    '        values (v_uid, v_slot, ''stat'', ''ev:kill_credited_any'', '''', v_applied, ''active'')' || chr(10) ||
    '        on conflict (user_id, slot, kind, key, period_key)' || chr(10) ||
    '          do update set value = p.value + v_applied, updated_at = now();');
  execute v_new;
  raise notice 'hr_credit_kills__ungated patched: the credited counters are recorded';
end $$;
-- create-or-replace preserves an ACL, but be explicit (the lesson of every
-- restated body in this tree). The client surface is UNCHANGED.
revoke execute on function public.hr_credit_kills__ungated(int,text,bigint,text)
  from public, anon, authenticated, service_role;

-- ── 2. hr_renown_of — the SAME body, two terms discounted ──────────────────
-- ⚠ A FAITHFUL RESTATEMENT of 2026-08-20-renown.sql's body. Exactly two terms
--   change (the kill term and the bossKill term); every other line — totalLevel,
--   combatLevel, skill99, collection, streakBest, goldLog and the two declared
--   zeroes — is preserved verbatim, comments included, so a reviewer diffs two
--   terms rather than a whole function.
create or replace function public.hr_renown_of(p_user uuid, p_slot int)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $body$
  with ps as (
    select * from public.player_state
     where user_id = p_user and slot = coalesce(p_slot, 0)
  ),
  sk as (
    select skill_id, public.hr_level_from_xp(xp) as lv
      from public.player_skills
     where user_id = p_user and slot = coalesce(p_slot, 0)
  )
  select floor(
      -- totalLevel × 2 (sum of every skill level owned)
      coalesce((select sum(lv) from sk), 0)::float8 * 2::float8
      -- combatLevel × 2 (absent skills default to level 1, matching xp.levelOf)
    + public.hr_lb_combat_level(
        coalesce((select lv from sk where skill_id = 'attack'),    1),
        coalesce((select lv from sk where skill_id = 'strength'),  1),
        coalesce((select lv from sk where skill_id = 'defense'),   1),
        coalesce((select lv from sk where skill_id = 'hitpoints'), 1),
        coalesce((select lv from sk where skill_id = 'prayer'),    1),
        coalesce((select lv from sk where skill_id = 'ranged'),    1),
        coalesce((select lv from sk where skill_id = 'magic'),     1)
      )::float8 * 2::float8
      -- skill99 × 100 (each skill taken to 99)
    + (select count(*) from sk where lv >= 99)::float8 * 100::float8
      -- kill × 0.05 (lifetime aggregate; ev:kill_any == the stats.kills mirror)
      -- ⚠ R5: MINUS the client-credited part. hr_credit_kills adds to
      --   ev:kill_any and records the same delta under ev:kill_credited_any, so
      --   what remains is what the SERVER simulated. greatest(0, …) because the
      --   two rows are written by one statement pair but read independently.
    + greatest(0::bigint,
        coalesce((select value from public.player_progress
                   where user_id = p_user and slot = coalesce(p_slot, 0)
                     and kind = 'stat' and period_key = '' and key = 'ev:kill_any'), 0)
      - coalesce((select value from public.player_progress
                   where user_id = p_user and slot = coalesce(p_slot, 0)
                     and kind = 'stat' and period_key = '' and key = 'ev:kill_credited_any'), 0)
      )::float8
        * 0.05::float8
      -- bossKill × 5 (Slice 1 per-monster kills, filtered to is_boss monsters)
      -- ⚠ R5: PER MONSTER, minus that monster's credited count. The discount has
      --   to be per-id and not an aggregate, because only is_boss ids are scored
      --   here — subtracting a global credited total would let credits against a
      --   NON-boss target erase honest boss renown.
    + coalesce((select sum(greatest(0::bigint, pp.value - coalesce(cr.value, 0)))
                  from public.player_progress pp
                  join public.hr_activities a
                    on a.kind = 'combat' and a.is_boss
                   and a.activity_id = substring(pp.key from 17)
                  left join public.player_progress cr
                    on cr.user_id = pp.user_id and cr.slot = pp.slot
                   and cr.kind = 'stat' and cr.period_key = ''
                   and cr.key = 'ev:kill_credited:' || substring(pp.key from 17)
                 where pp.user_id = p_user and pp.slot = coalesce(p_slot, 0)
                   and pp.kind = 'stat' and pp.period_key = ''
                   and pp.key like 'ev:kill_monster:%'), 0)::float8 * 5::float8
      -- collection × 3 (Slice 2 shape: distinct looted items). No rows → 0.
    + (select count(*) from public.player_progress
        where user_id = p_user and slot = coalesce(p_slot, 0)
          and kind = 'stat' and period_key = '' and key like 'ev:loot:%'
          and value > 0)::float8 * 3::float8
      -- streakBest × 5 (Slice 3 shape: player_state.streak_days). Read via
      -- jsonb so this COMPILES AND RUNS whether or not the column exists yet;
      -- absent column → null → 0. ⚠ Slice 3 owns whether this is CURRENT or
      -- BEST streak; renown.js scores BEST. Flagged in the header.
    + coalesce((select (to_jsonb(ps.*)->>'streak_days')::float8 from ps), 0::float8) * 5::float8
      -- goldLog × 8 (only above 1,000 gold), from server-owned player_state.gold
    + case when coalesce((select gold from ps), 0) > 1000
           then (ln((select gold from ps)::float8) / ln(10::float8) - 3::float8) * 8::float8
           else 0::float8 end
      -- questDone × 25 : NO SERVER MODEL → 0 (degraded, see header)
    + 0::float8
      -- bountyDone × 2 : NO SERVER MODEL → 0 (degraded, see header)
    + 0::float8
  )::bigint
$body$;

revoke execute on function public.hr_renown_of(uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function public.hr_renown_of(uuid, int) to hr_engine;

-- ── 3. SELF-VERIFYING COMMIT GATE ──────────────────────────────────────────
do $$
declare
  v      jsonb;
  v_uid  constant uuid := '000000c8-0000-0000-0000-0000000000c8';
  v_slot constant int  := 0;
  v_boss text; v_hp int;
  v_r0 bigint; v_r1 bigint; v_r2 bigint; v_r3 bigint; v_r4 bigint;
  v_best bigint; v_cred bigint; v_life bigint;
  v_n int;
  v_day text := public.hr_utc_day_key(now());   -- (c6)'s periodic control row
begin
  -- (a) THE SCORE IS STILL ENGINE-ONLY. A client that could call it could not
  --     forge it, but it would still be an information leak about any player.
  if has_function_privilege('authenticated', 'public.hr_renown_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_renown_of(uuid,int)', 'execute')
     or has_function_privilege('service_role', 'public.hr_renown_of(uuid,int)', 'execute') then
    raise exception 'GATE(a): hr_renown_of is client-executable — it takes an ARBITRARY uuid';
  end if;
  if not has_function_privilege('hr_engine', 'public.hr_renown_of(uuid,int)', 'execute') then
    raise exception 'GATE(a): hr_engine cannot read hr_renown_of — the perk channel is dead';
  end if;
  -- …and the credit verb's client surface did not move.
  if has_function_privilege('authenticated','public.hr_credit_kills__ungated(int,text,bigint,text)','execute') then
    raise exception 'GATE(a): hr_credit_kills__ungated became client-executable';
  end if;
  if not has_function_privilege('authenticated','public.hr_credit_kills(int,text,bigint,text)','execute') then
    raise exception 'GATE(a): the hr_credit_kills wrapper is no longer callable — the feature is dead';
  end if;

  -- (b) THE PATCH TOOK, and the discount is really in the score.
  if position('ev:kill_credited_any' in
       pg_get_functiondef('public.hr_credit_kills__ungated(int,text,bigint,text)'::regprocedure)) = 0 then
    raise exception 'GATE(b): hr_credit_kills__ungated does not record the credited counters';
  end if;
  if position('ev:kill_credited_any' in
       pg_get_functiondef('public.hr_renown_of(uuid,int)'::regprocedure)) = 0
     or position('ev:kill_credited:' in
       pg_get_functiondef('public.hr_renown_of(uuid,int)'::regprocedure)) = 0 then
    raise exception 'GATE(b): hr_renown_of does not subtract the credited counters — the faucet is open';
  end if;

  -- (c) EXECUTED behaviour, discarded subtransaction.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, version, accrued_to)
      values (v_uid, v_slot, 0, 0, 1, now() - interval '60 minutes')
      on conflict (user_id, slot) do update set gold = 0, gems = 0,
        accrued_to = now() - interval '60 minutes';
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, 13034431
        from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
      on conflict (user_id, slot, skill_id) do update set xp = 13034431;

    -- A REAL boss that the renown boss-term actually scores.
    select m.monster_id, m.hp into v_boss, v_hp
      from public.hr_bounty_monsters m
      join public.hr_activities a
        on a.kind = 'combat' and a.is_boss and a.activity_id = m.monster_id
     order by m.monster_id limit 1;
    if v_boss is null then
      raise exception 'GATE(c): FIXTURE — no bounty-eligible is_boss monster exists, so the boss '
                      'term cannot be exercised and a pass would mean nothing';
    end if;

    v_r0 := public.hr_renown_of(v_uid, v_slot);

    -- ── (c1) THE HONEST CONTROL, FIRST AND DELIBERATELY SO ────────────────
    --     A SETTLE writes the bestiary + lifetime rows through hr_apply and
    --     touches NO credited counter. Renown MUST move fully. Without this the
    --     whole fix could degenerate into "renown is always 0" and every
    --     faucet assertion below would pass for the wrong reason.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:' || v_boss, 100, '', 'active'),
             (v_uid, v_slot, 'stat', 'ev:kill_any', 100, '', 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = public.player_progress.value + excluded.value;
    v_r1 := public.hr_renown_of(v_uid, v_slot);
    -- 100 boss kills x 5 + 100 kills x 0.05 = 505
    if v_r1 - v_r0 <> 505 then
      raise exception 'GATE(c1): THE HONEST CONTROL FAILED — a 100-kill SETTLE moved renown by % '
                      '(expected exactly 505 = 100x5 + 100x0.05). The discount must not touch '
                      'server-simulated kills, or this fix is just "renown is always 0".',
                      v_r1 - v_r0;
    end if;

    -- ── (c2) THE FAUCET IS CLOSED ─────────────────────────────────────────
    --     Now drive the REAL hr_credit_kills against a REAL accepted bounty on
    --     that same boss, backdated so the physical cap is generous, and require
    --     renown NOT to move at all.
    v := public.hr_accept_bounty__ungated(v_slot, 'r5', v_boss, 'cull', 'normal', 100);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(c2): FIXTURE — accept failed: %', v;
    end if;
    update public.active_bounty set accepted_at = now() - interval '60 minutes'
      where user_id = v_uid and slot = v_slot;
    v_best := coalesce((select value from public.player_progress where user_id=v_uid and slot=v_slot
                         and kind='stat' and key='ev:kill_monster:'||v_boss and period_key=''), 0);
    v := public.hr_credit_kills__ungated(v_slot, v_boss, 400, 'r5-idem-1');
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(c2): the bounty credit failed: %', v;
    end if;
    if coalesce((v->>'credited')::bigint, 0) <= 0 then
      raise exception 'GATE(c2): FIXTURE DEGENERATE — the credit applied nothing (%), so "renown '
                      'did not move" would prove nothing', v->>'credited';
    end if;
    v_r2 := public.hr_renown_of(v_uid, v_slot);
    if v_r2 <> v_r1 then
      raise exception 'GATE(c2): THE FAUCET IS OPEN — a client kill credit of % moved renown by % '
                      '(must be 0). hr_claim_rank pays 1,603,000 gold + 925 gems across the ladder '
                      'and renownAllXp feeds the live level boards.',
                      v->>'credited', v_r2 - v_r1;
    end if;

    -- …and the bestiary row DID move (containment: we did not close the faucet
    -- by breaking the counter the bounty and the bestiary display depend on).
    if coalesce((select value from public.player_progress where user_id=v_uid and slot=v_slot
                  and kind='stat' and key='ev:kill_monster:'||v_boss and period_key=''), 0) <= v_best then
      raise exception 'GATE(c2): the credit no longer moves the bestiary row — the bounty turn-in '
                      'and the bestiary display both read it';
    end if;
    -- …and the credited counter tracks it exactly.
    select value into v_cred from public.player_progress where user_id=v_uid and slot=v_slot
      and kind='stat' and key='ev:kill_credited:'||v_boss and period_key='';
    if coalesce(v_cred,0) <> (v->>'credited')::bigint then
      raise exception 'GATE(c2): the credited counter is % but the credit applied % — the discount '
                      'is not the same number', coalesce(v_cred,0), v->>'credited';
    end if;
    select value into v_life from public.player_progress where user_id=v_uid and slot=v_slot
      and kind='stat' and key='ev:kill_credited_any' and period_key='';
    if coalesce(v_life,0) <> (v->>'credited')::bigint then
      raise exception 'GATE(c2): the aggregate credited counter is % but the credit applied %',
                      coalesce(v_life,0), v->>'credited';
    end if;
    -- ⚠ THE ORDERING INVARIANT: credited <= bestiary, per monster. The bestiary
    --   row is ABSOLUTE (greatest) and the credited row is ADDITIVE, so they use
    --   different merge disciplines on numbers that must stay ordered. An
    --   inversion would make greatest(0, best - credited) UNDER-discount and
    --   partially re-open the faucet, silently.
    --   The MEANINGFUL check is (c5b) below, after a THROTTLED credit on a FRESH
    --   bounty; this one is the cheap always-on sweep.
    if exists (
      select 1
        from public.player_progress c
        left join public.player_progress b
          on b.user_id = c.user_id and b.slot = c.slot and b.kind = 'stat'
         and b.period_key = '' and b.key = 'ev:kill_monster:' || substring(c.key from 18)
       where c.user_id = v_uid and c.slot = v_slot and c.kind = 'stat'
         and c.period_key = '' and c.key like 'ev:kill_credited:%'
         and c.value > coalesce(b.value, 0)) then
      raise exception 'GATE(c2): INVARIANT BROKEN — a credited counter EXCEEDS its bestiary row, so '
                      'the discount would under-subtract and the faucet is partly open';
    end if;

    -- ── (c3) SUSTAINED SPAM STAYS AT ZERO ─────────────────────────────────
    --     One call could be a coincidence. Re-open the window repeatedly, the
    --     way a script would, and require renown to stay exactly where the
    --     honest settle left it.
    for v_n in 1..5 loop
      update public.active_bounty set accepted_at = now() - interval '60 minutes'
        where user_id = v_uid and slot = v_slot;
      update public.hr_kill_credit_log set created_at = now() - interval '30 minutes'
        where user_id = v_uid and slot = v_slot;
      perform public.hr_credit_kills__ungated(v_slot, v_boss, 400, 'r5-spam-' || v_n);
    end loop;
    v_r3 := public.hr_renown_of(v_uid, v_slot);
    if v_r3 <> v_r1 then
      raise exception 'GATE(c3): sustained credit spam moved renown by % (must be 0) — the faucet '
                      'is rate-limited, not closed', v_r3 - v_r1;
    end if;

    -- ── (c4) THE SETTLE STILL PAYS, AFTER ALL THAT ────────────────────────
    --     The discount is a subtraction, not a latch: a server-simulated kill
    --     arriving after any amount of credit must still score.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:' || v_boss, 10, '', 'active'),
             (v_uid, v_slot, 'stat', 'ev:kill_any', 10, '', 'active')
      on conflict (user_id, slot, kind, key, period_key)
        do update set value = public.player_progress.value + excluded.value;
    if public.hr_renown_of(v_uid, v_slot) - v_r3 <> 50 then
      raise exception 'GATE(c4): a 10-kill settle after the credits moved renown by % (expected 50) '
                      '— the discount latched instead of subtracting',
                      public.hr_renown_of(v_uid, v_slot) - v_r3;
    end if;

    -- ── (c5) THE BOUNTY STILL COMPLETES AND PAYS ──────────────────────────
    --     The whole point of hr_credit_kills is untouched.
    v := public.hr_claim_bounty__ungated(v_slot);
    if coalesce(v->>'ok','') <> 'true' or coalesce((v->>'credited')::boolean,false) is not true then
      raise exception 'GATE(c5): the bounty turn-in broke: %', v;
    end if;

    -- ── (c5b) ⚠ THE ORDERING INVARIANT, UNDER A *THROTTLED* CREDIT ────────
    --     credited <= bestiary is what makes greatest(0, best - credited) an
    --     honest discount. It can only be violated when v_applied < v_claimed,
    --     i.e. when the cap BITES — with a generous window the two are equal and
    --     recording the wrong one is invisible. (Measured: the first draft of
    --     this gate checked the invariant after the generous credit in (c2), and
    --     the matching mutation `credited_exceeds_bestiary` sailed straight
    --     through it.) A FRESH accept is required too: the top-up is absolute
    --     against the accept-time baseline, so a second credit on the same bounty
    --     applies nothing at all.
    v := public.hr_accept_bounty__ungated(v_slot, 'r5b', v_boss, 'cull', 'normal', 100);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(c5b): FIXTURE — the fresh accept failed: %', v;
    end if;
    update public.active_bounty set accepted_at = now() - interval '30 seconds'
      where user_id = v_uid and slot = v_slot;
    update public.hr_kill_credit_log set created_at = now() - interval '30 minutes'
      where user_id = v_uid and slot = v_slot;
    v_r4 := public.hr_renown_of(v_uid, v_slot);
    v := public.hr_credit_kills__ungated(v_slot, v_boss, 400, 'r5-throttle-1');
    if coalesce((v->>'throttled')::boolean, false) is not true then
      raise exception 'GATE(c5b): FIXTURE — a 400-kill claim over a 30-second window was not '
                      'throttled (%), so applied == claimed and the invariant cannot be violated '
                      'by any mutation', v;
    end if;
    if coalesce((v->>'credited')::bigint, 0) <= 0 then
      raise exception 'GATE(c5b): FIXTURE — the throttled credit applied nothing (%)', v->>'credited';
    end if;
    -- ⚠ THE PROPERTY, and it is stronger than the invariant below: a THROTTLED
    --   credit must move renown by EXACTLY ZERO too. The discount has to equal
    --   the credit in both directions — record too little and the faucet stays
    --   open (renown rises); record too much (e.g. the raw claim instead of the
    --   applied delta) and the discount EATS HONEST RENOWN the player earned by
    --   settling (renown falls). Only a signed equality catches both, and the
    --   fall is the sneakier failure because every "did not rise" check passes.
    --   ⚠ The baseline is taken IMMEDIATELY BEFORE the credit, not carried from
    --     (c4). The turn-in in (c5) pays gold, and renown carries a goldLog term
    --     — an earlier revision compared against v_r3 + 50 and this gate caught
    --     its own arithmetic (2902 vs 2893). Measure the delta across the ONE
    --     operation under test.
    if public.hr_renown_of(v_uid, v_slot) <> v_r4 then
      raise exception 'GATE(c5b): a THROTTLED credit moved renown by % (must be 0). Above 0 = the '
                      'faucet is open for throttled credits; BELOW 0 = the discount over-subtracts '
                      'and is destroying renown the player earned honestly through the settle.',
                      public.hr_renown_of(v_uid, v_slot) - v_r4;
    end if;
    if exists (
      select 1
        from public.player_progress c
        left join public.player_progress b
          on b.user_id = c.user_id and b.slot = c.slot and b.kind = 'stat'
         and b.period_key = '' and b.key = 'ev:kill_monster:' || substring(c.key from 18)
       where c.user_id = v_uid and c.slot = v_slot and c.kind = 'stat'
         and c.period_key = '' and c.key like 'ev:kill_credited:%'
         and c.value > coalesce(b.value, 0)) then
      raise exception 'GATE(c5b): INVARIANT BROKEN under a throttled credit — a credited counter '
                      'EXCEEDS its bestiary row, so greatest(0, best - credited) UNDER-discounts '
                      'and the faucet is partly open. The counter must record the APPLIED delta, '
                      'never the raw claim.';
    end if;

    -- ── (c6) ⚠ THE DISCOUNT MUST NOT BE PRUNABLE ──────────────────────────
    --     If a credited row could be swept while ev:kill_any / the bestiary row
    --     survives, the discount would fail OPEN — the faucet re-opening with
    --     nothing appearing broken. The credited rows carry period_key = '' (the
    --     PERMANENT population) and hr_progress_prune deletes only period_key
    --     <> ''.
    --
    --     ⚠⚠ THE FIRST VERSION OF THIS GATE WAS VACUOUS, and the shape is worth
    --     naming because it recurs. It ran hr_progress_prune(interval '0
    --     seconds') against rows created microseconds earlier and then asserted
    --     the credited rows had survived — but the prune FLOORS its age at
    --     `greatest(interval '7 days', p_older)` (2026-08-11-player-state.sql),
    --     so it deleted NOTHING and the assertion passed identically whether the
    --     rows were permanent or periodic. Measured: fresh rows → 0 deleted;
    --     backdated 400 days → the periodic control deleted, credited rows
    --     survive. The PROPERTY was true; the PROOF was not testing it.
    --     A "nothing was deleted" assertion is evidence ONLY when something else
    --     WAS deleted. So this now (a) plants a period_key <> '' CONTROL that
    --     must die, (b) ages every probe row past the 7-day floor, and (c) fails
    --     the FIXTURE loudly if the prune turns out to have been a no-op.
    if to_regprocedure('public.hr_progress_prune(interval)') is null then
      raise exception 'GATE(c6): hr_progress_prune is missing — the prune-safety claim is unprovable';
    end if;
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:prune_control', 1, v_day, 'active')
      on conflict (user_id, slot, kind, key, period_key) do update set value = 1;
    update public.player_progress set updated_at = now() - interval '400 days'
      where user_id = v_uid and slot = v_slot;
    v_n := public.hr_progress_prune(interval '0 seconds');
    if v_n < 1 then
      raise exception 'GATE(c6): FIXTURE VACUOUS — the prune deleted % row(s), so "the credited rows '
                      'survived" proves nothing. It floors its age at greatest(7 days, p_older), so '
                      'the probe rows must be aged past that floor before it can reach them.', v_n;
    end if;
    if exists (select 1 from public.player_progress where user_id=v_uid and slot=v_slot
                and kind='stat' and key='ev:prune_control') then
      raise exception 'GATE(c6): FIXTURE VACUOUS — the PERIODIC control row survived a prune that '
                      'reported % deletion(s), so the sweep is not reaching this character', v_n;
    end if;
    if not exists (select 1 from public.player_progress where user_id=v_uid and slot=v_slot
                    and kind='stat' and period_key='' and key='ev:kill_credited_any') then
      raise exception 'GATE(c6): hr_progress_prune DELETED ev:kill_credited_any — the discount is '
                      'prunable and would fail OPEN, silently re-opening the faucet';
    end if;
    if not exists (select 1 from public.player_progress where user_id=v_uid and slot=v_slot
                    and kind='stat' and period_key='' and key like 'ev:kill_credited:%') then
      raise exception 'GATE(c6): hr_progress_prune DELETED a per-monster credited row — the boss '
                      'half of the discount is prunable and would fail OPEN';
    end if;
    -- …and the row it discounts survived the SAME sweep, so the two cannot fall
    -- out of step in the other direction either.
    if not exists (select 1 from public.player_progress where user_id=v_uid and slot=v_slot
                    and kind='stat' and period_key='' and key='ev:kill_any') then
      raise exception 'GATE(c6): FIXTURE — the prune removed ev:kill_any itself, so the comparison '
                      'proves nothing';
    end if;

    raise exception using errcode = 'HR822', message = 'renown-kill-faucet §3 complete — rolling back';
  exception when sqlstate 'HR822' then
    null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state       where user_id = v_uid)
     or exists (select 1 from public.player_ledger      where user_id = v_uid)
     or exists (select 1 from public.player_progress    where user_id = v_uid)
     or exists (select 1 from public.player_skills      where user_id = v_uid)
     or exists (select 1 from public.active_bounty      where user_id = v_uid)
     or exists (select 1 from public.hr_kill_credit_log where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §3 LEAKED a probe row';
  end if;

  if to_regprocedure('public.hr_assert_grant_hygiene(boolean)') is not null then
    declare v_gh jsonb := public.hr_assert_grant_hygiene(false);
    begin
      if jsonb_array_length(v_gh->'unapproved_client_rpcs') <> 0 then
        raise exception 'GATE(d): grant-hygiene reports unapproved client rpcs: %', v_gh->'unapproved_client_rpcs';
      end if;
      if jsonb_array_length(v_gh->'ungated_client_rpcs') <> 0 then
        raise exception 'GATE(d): grant-hygiene reports ungated client rpcs: %', v_gh->'ungated_client_rpcs';
      end if;
    end;
  end if;

  raise notice 'renown-kill-faucet: a client kill credit now scores ZERO renown (sustained spam '
               'included) while a server settle still scores in full, the bestiary row and the '
               'bounty turn-in are untouched — all green';
end $$;
