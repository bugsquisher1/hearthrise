-- ════════════════════════════════════════════════════════════════════════
-- 2026-09-22-state-of-trophy-prefix.sql — `trophy:%` LEAVES THE GENERIC
-- ENVELOPE, BEFORE THERE IS ANYTHING TO PUT IN IT.
--
-- ⚠ STAGED, NOT APPLIED. Security review REQUIRED (it patches hr_state_of, the
--   highest-risk `create or replace` in this repository). The Coordinator
--   applies, one file per call, via tools/apply-migration.mjs.
--
-- ⚠⚠ THIS FILE IS A HARD PREREQUISITE OF 2026-09-22-trophy-claim.sql AND MUST
--    BE APPLIED FIRST. docs/design/BESTIARY_LADDER.md §6 names it as a
--    prerequisite and not as a follow-up, and the trophy-claim file's §0
--    refuses to install if this one has not run. Reason below.
--
-- ── WHAT IT DOES ────────────────────────────────────────────────────────────
-- Adds `and key not like 'trophy:%'` to the TWO subqueries inside hr_state_of
-- that build `progress` and `progress_truncated`. Two lines. Nothing else about
-- the envelope changes: no key is added, no key is removed, no grant moves.
--
-- ── WHY IT IS DUE NOW, AND WHY THE FAILURE IT PREVENTS IS SILENT ────────────
-- 2026-08-20-bestiary.sql's own header said the exclusion of the counter
-- prefixes was a follow-up "gated on the collection log landing, at which point
-- the two populations together approach the cap". That follow-up landed for TWO
-- of the three prefixes: the 2026-09-14 restatement already excludes
-- `ev:kill_monster:%` and `ev:loot:%`, each served by its own door
-- (hr_bestiary_of / hr_collection_of), which is the pattern hr_perks_of
-- established. `trophy:%` is the third population and it does not exist yet —
-- which is exactly why it is cheap to exclude TODAY and expensive tomorrow.
--
-- The arithmetic the design doc states: a long-term character can hold 108 kill
-- rows + up to 432 trophy rows + the collection log's own per-item rows. That is
-- past `limit 1000`, and the failure mode is NOT an error. It is
-- `progress_truncated`, silently, with the rows that fall off the end chosen by
-- an incidental `order by period_key, kind, key` — under which `kind='collection'`
-- sorts AHEAD of `kind='daily'`, `'flag'`, `'quest'` and `'stat'`. So the rows a
-- flood of trophies would push off the end are a player's QUEST state, their
-- dailies and their lifetime stats: the claim would eat the progression.
--
-- Applying this before the claim RPC exists means the cap is never breached at
-- all, not even for the duration of one deploy. A file applied in the other
-- order would be a file that fixes a truncation some players had already had.
--
-- ── THE TROPHY ROWS KEEP THEIR OWN DOOR ─────────────────────────────────────
-- Nothing is lost by the exclusion: the claimed trophies are projected by
-- `hr_trophy_of` (2026-09-22-trophy-claim.sql), beside hr_bestiary_of, and the
-- Edge ships them on the `bestiary` block of the envelope. A projection that
-- depends on an incidental ORDER BY for correctness is a projection that
-- silently loses a trophy to a player with many dailies.
--
-- ── PATCHED, NOT RESTATED ───────────────────────────────────────────────────
-- hr_state_of's live body is whatever its last toucher left (the repo chain says
-- 2026-09-14-recipe-learn.sql, which itself patched the 2026-09-14 restatement).
-- The two predicates are patched at anchors asserted to appear EXACTLY ONCE
-- each, and the patch is re-entrant: a second apply is a notice and a return. A
-- restatement would install the REPO's idea of hr_state_of over production's,
-- silently reverting whichever file patched last — the b484–b487 class — on the
-- one function every client read passes through. The two anchors differ only in
-- INDENTATION (17 spaces inside `progress`, 11 inside `progress_truncated`),
-- which is what lets each be pinned to a single occurrence instead of patching
-- "both matches" and hoping there were two.
--
-- ⚠ hr_state_of IS A LIVE-HASH-TRACKED BODY. This file patches it
--   PROGRAMMATICALLY, so the Coordinator re-seeds tests/live-hash-drift
--   .baseline.json with `--live --write` after the apply and writes the whys
--   from `--codediff`. It carries no literal `create or replace function
--   public.hr_state_of(` header and takes over no last-toucher role in the
--   derivation tools.
--
-- ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
-- It moves no value, writes no player row, grants nothing and revokes nothing
-- that was not already revoked. It cannot change what any existing character
-- HAS; only which rows one read returns — and `trophy:%` rows do not exist on
-- any database yet, so on the day it applies the envelope is byte-identical.
--
-- REVERSIBILITY: re-apply 2026-09-14-recipe-learn.sql (it patches the same
-- function from the same predecessor) or delete the two predicates by hand in a
-- follow-up patch. Nothing is destroyed either way.
-- ════════════════════════════════════════════════════════════════════════

-- ── 0. PRECONDITIONS — FAIL CLOSED ─────────────────────────────────────────
do $$
declare
  v_def text;
  -- ⚠ EACH ANCHOR IS PREFIXED WITH A NEWLINE, and that is not cosmetic. The two
  --   predicates are the same text at two indentations (17 spaces inside
  --   `progress`, 11 inside `progress_truncated`), so the SHORTER one is a
  --   substring of the LONGER one's line — measured: without the newline the
  --   11-space anchor matches both and the "exactly once" assertion below reads
  --   2 and refuses. With it, each anchor pins exactly one line.
  c_a1 constant text := E'\n                 and key not like ''ev:loot:%''';
  c_a2 constant text := E'\n           and key not like ''ev:loot:%''';
begin
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing — apply 2026-08-11-apply-engine.sql and '
                    '2026-09-14-hr-state-of-restatement.sql first';
  end if;
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');

  -- (a) THE TWO EARLIER EXCLUSIONS MUST ALREADY BE THERE. If they are not, the
  --     live body predates the 2026-09-14 restatement and is not the shape this
  --     file was derived against — and excluding a third prefix from a body that
  --     excludes neither of the first two would be patching a function nobody
  --     can account for.
  if strpos(v_def, 'ev:kill_monster:%') = 0 or strpos(v_def, 'ev:loot:%') = 0 then
    raise exception 'the LIVE hr_state_of excludes neither ev:kill_monster:%% nor ev:loot:%% — apply '
                    '2026-09-14-hr-state-of-restatement.sql first. Do NOT patch a body you cannot '
                    'account for; diff it against the repo chain.';
  end if;

  -- (b) EACH ANCHOR APPEARS EXACTLY ONCE. They are the SAME predicate at two
  --     indentations — the `progress` array's and `progress_truncated`'s — so
  --     "exactly one each" is what proves BOTH subqueries will be patched and
  --     neither twice. A count of 2 on one anchor would mean the indentation
  --     convention moved and this file is patching the wrong body.
  if (length(v_def) - length(replace(v_def, c_a1, ''))) <> length(c_a1) then
    raise exception 'the `progress` ev:loot anchor did not match exactly once in the LIVE hr_state_of';
  end if;
  if (length(v_def) - length(replace(v_def, c_a2, ''))) <> length(c_a2) then
    raise exception 'the `progress_truncated` ev:loot anchor did not match exactly once in the LIVE '
                    'hr_state_of';
  end if;

  -- (c) THE CAP IS STILL 1000 AND STILL SAYS WHEN IT CAPPED. This file exists
  --     BECAUSE of that cap; a body that no longer carries it is a body whose
  --     truncation argument has already been answered some other way, and this
  --     patch would be cargo.
  if strpos(v_def, 'limit 1000') = 0 or strpos(v_def, 'progress_truncated') = 0 then
    raise exception 'hr_state_of no longer carries the 1000-row cap or its truncation flag — the '
                    'premise of this file has changed; re-derive it before applying';
  end if;
end $$;

-- ── 1. THE PATCH ───────────────────────────────────────────────────────────
do $$
declare
  v_def text;
  -- ⚠ EACH ANCHOR IS PREFIXED WITH A NEWLINE, and that is not cosmetic. The two
  --   predicates are the same text at two indentations (17 spaces inside
  --   `progress`, 11 inside `progress_truncated`), so the SHORTER one is a
  --   substring of the LONGER one's line — measured: without the newline the
  --   11-space anchor matches both and the "exactly once" assertion below reads
  --   2 and refuses. With it, each anchor pins exactly one line.
  c_a1 constant text := E'\n                 and key not like ''ev:loot:%''';
  c_a2 constant text := E'\n           and key not like ''ev:loot:%''';
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, 'trophy:%') > 0 then
    raise notice 'hr_state_of already excludes trophy:%% — patch skipped'; return; end if;
  -- APPENDED AFTER each anchor, the convention every hr_state_of patcher
  -- follows, so the anchors of earlier and later files survive insertion.
  v_def := replace(v_def, c_a1, c_a1 || E'\n'
    || '                 -- 2026-09-22: the TROPHY population (docs/design/BESTIARY_LADDER.md'  || E'\n'
    || '                 -- §6). Claimed trophy rows are served by hr_trophy_of, beside'         || E'\n'
    || '                 -- hr_bestiary_of / hr_collection_of. 108 kills + up to 432 trophies'   || E'\n'
    || '                 -- + the collection log breach this 1000-row cap, and the failure is'   || E'\n'
    || '                 -- SILENT: kind=''collection'' sorts ahead of daily/flag/quest/stat,'   || E'\n'
    || '                 -- so what falls off the end is a player''s quest state.'               || E'\n'
    || '                 and key not like ''trophy:%''');
  v_def := replace(v_def, c_a2, c_a2 || E'\n'
    || '           -- 2026-09-22: the TROPHY population. The SAME predicate as the one'          || E'\n'
    || '           -- inside `progress` above, and it must stay the same: a flag that'           || E'\n'
    || '           -- counted rows the array excludes would report truncation that did'          || E'\n'
    || '           -- not happen, which is the read filter / prune divergence RL3 names.'        || E'\n'
    || '           and key not like ''trophy:%''');
  execute v_def;
  raise notice 'hr_state_of patched: the trophy population leaves the generic envelope';
end $$;
-- create-or-replace preserves an ACL; re-state the lockdown anyway (the repo
-- convention and the grant-hygiene lint). hr_state_of is Edge-mediated: no
-- client role may execute it.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 2. SELF-CHECK (§4) — BY EXECUTION, ON PROBE ROWS ONLY ──────────────────
-- Proven by CALLING hr_state_of as a real character and reading the envelope,
-- not by finding the words in the source. Every row this block touches is one it
-- created, under a uuid nothing else can hold; the whole probe lives in a
-- subtransaction discarded by a sentinel raise (HR845), and a leak check runs
-- after it. tests/selfcheck-no-global-dml.mjs is the standing guard on that rule
-- and the 2026-09-19 incident is why it exists.
do $$
declare
  v_def  text;
  v_env  jsonb;
  v_keys text;
  v_n    int;
  v_uid  constant uuid := '00000000-0000-4000-c000-770f180a0000';
  c_pred constant text := 'and key not like ''trophy:%''';
begin
  -- (a) THE PREDICATE INSTALLED IN *BOTH* SUBQUERIES. Two occurrences, not one:
  --     a patch that reached `progress` and missed `progress_truncated` would
  --     leave the flag counting rows the array no longer returns, so the client
  --     would be told its progress was truncated on every read forever.
  v_def := pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure);
  v_n := (length(v_def) - length(replace(v_def, c_pred, ''))) / length(c_pred);
  if v_n <> 2 then
    raise exception 'state-of trophy prefix (a): the trophy predicate appears % time(s), expected 2 '
                    '(one in `progress`, one in `progress_truncated`)', v_n;
  end if;
  -- …AND THE TWO EARLIER EXCLUSIONS SURVIVED. A patch that replaced a predicate
  -- instead of appending to it passes a check that only looks for the new one.
  if (length(v_def) - length(replace(v_def, 'ev:kill_monster:%', ''))) / length('ev:kill_monster:%') < 2
     or (length(v_def) - length(replace(v_def, 'ev:loot:%', ''))) / length('ev:loot:%') < 2 then
    raise exception 'state-of trophy prefix (a): the patch ATE an earlier exclusion — the bestiary or '
                    'collection population is back in the generic envelope';
  end if;

  -- (b) GRANTS UNCHANGED. hr_state_of is Edge-mediated; a client role that could
  --     execute it would be a second, unfiltered read over every character.
  if has_function_privilege('authenticated', 'public.hr_state_of(uuid,int)', 'execute')
     or has_function_privilege('anon', 'public.hr_state_of(uuid,int)', 'execute')
     or has_function_privilege('service_role', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'state-of trophy prefix (b): hr_state_of is client-executable';
  end if;
  if not has_function_privilege('hr_engine', 'public.hr_state_of(uuid,int)', 'execute') then
    raise exception 'state-of trophy prefix (b): hr_engine LOST execute on hr_state_of — every read '
                    'path in the game is dead';
  end if;

  -- ── THE BEHAVIOURAL HALF, ON PROBE ROWS ONLY ────────────────────────────
  -- Every row below is one this block created, under a uuid nothing else holds,
  -- and the whole probe is discarded by the HR845 sentinel. No statement here
  -- names a row by anything but v_uid. (tests/selfcheck-no-global-dml.mjs is the
  -- standing guard on that rule; the 2026-09-19 incident is why it exists.)
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    perform public.hr_create_character(0);

    insert into public.player_progress (user_id, slot, kind, key, period_key, value, state) values
      -- THE ROW THIS FILE EXCLUDES.
      (v_uid, 0, 'collection', 'trophy:slime:4',        '', 1,  'claimed'),
      -- THE DISCRIMINATING CONTROL — the SAME kind, and it must SURVIVE. A
      -- predicate written as `kind <> 'collection'` would pass a check that only
      -- asserts the trophy row is gone, and would take the whole collection-log
      -- milestone population out of the envelope with it.
      (v_uid, 0, 'collection', 'hunter10',              '', 1,  'claimed'),
      -- The two populations the 2026-09-14 restatement already excludes, seeded
      -- so this file proves it did not un-exclude them.
      (v_uid, 0, 'stat',       'ev:kill_monster:slime', '', 25, 'active'),
      (v_uid, 0, 'stat',       'ev:loot:slime_gel',     '', 9,  'active'),
      -- An ordinary permanent stat, which must always ride.
      (v_uid, 0, 'stat',       'ev:kill_any',           '', 25, 'active')
    on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value;

    v_env := public.hr_state_of(v_uid, 0);
    if coalesce(v_env->>'ok', 'false') <> 'true' then
      raise exception 'state-of trophy prefix: hr_state_of refused the probe character (%)', v_env;
    end if;
    select string_agg(e->>'key', ',' order by e->>'key') into v_keys
      from jsonb_array_elements(v_env->'progress') e;

    -- (c) THE TROPHY ROW IS GONE…
    if coalesce(v_keys, '') like '%trophy:slime:4%' then
      raise exception 'state-of trophy prefix (c): a trophy row is STILL in the generic envelope — the '
                      'cap this file exists to protect is unprotected. keys: %', v_keys;
    end if;
    -- …AND THE COLLECTION MILESTONE, THE SAME KIND, IS NOT.
    if coalesce(v_keys, '') not like '%hunter10%' then
      raise exception 'state-of trophy prefix (c): the collection-log milestone row was excluded too — '
                      'the predicate is keying on `kind`, not on the trophy prefix. keys: %', v_keys;
    end if;
    -- …and an ordinary lifetime stat still rides, the positive control that
    -- proves the envelope was not simply emptied.
    if coalesce(v_keys, '') not like '%ev:kill_any%' then
      raise exception 'state-of trophy prefix (c): the envelope lost an ordinary stat row. keys: %', v_keys;
    end if;
    -- …and the two earlier exclusions still bite (measured, not assumed).
    if coalesce(v_keys, '') like '%ev:kill_monster:%' or coalesce(v_keys, '') like '%ev:loot:%' then
      raise exception 'state-of trophy prefix (c): an earlier-excluded population is back in the '
                      'envelope. keys: %', v_keys;
    end if;

    -- (d) THE FLAG AGREES WITH THE ARRAY. Five probe rows is nowhere near 1000,
    --     so the only way this reads true is a `progress_truncated` subquery that
    --     counts rows `progress` does not return.
    if coalesce((v_env->>'progress_truncated')::boolean, true) then
      raise exception 'state-of trophy prefix (d): progress_truncated is TRUE on a character with five '
                      'progress rows — the flag and the array disagree';
    end if;

    raise exception using errcode = 'HR845', message = 'state-of trophy prefix section 2 complete — rolling back';
  exception when sqlstate 'HR845' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  -- THE LEAK CHECK. The subtransaction should have taken everything with it; if
  -- it did not, this block wrote a row it cannot account for and the apply must
  -- fail rather than leave one behind.
  if exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_state where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'state-of trophy prefix: section 2 LEAKED a probe row';
  end if;

  raise notice 'state-of trophy prefix PASSED: trophy keys are excluded from BOTH the progress array '
               'and its truncation flag, the collection-log milestones and ordinary stats still ride, '
               'the bestiary and collection exclusions survived, and no grant moved';
end $$;
