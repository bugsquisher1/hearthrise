-- ════════════════════════════════════════════════════════════════════════
-- 2027-04-20-feast-call-ladder.sql — A REBUILD CARRIES PRODUCTION'S FEAST LADDER (lane/c-feast-call-drift, backend-architect,
--   2026-11-14; the first restore drill's V7 finding, tools/restore-drill.local.mjs on lane/r-restore-drill).
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit). It writes
-- NOTHING: no function, table, grant or row. It is a §4 self-check that pins, at the end of the chain, the body production already runs.
-- ORDER: last. Any position after 2027-01-18-dead-surfaces-cut.sql holds (§(d) reads the grants that file revoked).
-- EDGE: none. CLIENT: none (the clan doors are closed; no client names clan_feast_call).
--
-- ── THE DRIFT ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- clan_feast_call__ungated answered all_xp 0.01 / 0.02 / 0.03 / 0.04 on production (measured read-only 2026-11-14, normalised
-- md5 20a039c0a533d3f4ca252fcb4af47cc2) and 0.08 / 0.12 / 0.15 / 0.18 when the schema is rebuilt from the repo. Two files restate
-- clan_feast_call on 2026-08-09: 2026-08-09-clan-governance.sql (the vice gate, the OLD ladder) and 2026-08-09-bonus-rebase.sql (the vice
-- gate AND Tyler's 2026-08-09 rebase, "the % boosts across the board are way too high ... it should be like increments of 2%"). The
-- rebase's own body says "Run bonus-rebase LAST and carry BOTH", and production carries its body, so production applied it last. The
-- rebuild contract, tests/schema-apply-order.json, listed it FIRST, so every rebuild (and the restore drill) ended on the old ladder.
-- 2026-08-11-authenticated-surface-lockdown.sql then renamed whichever body was current to __ungated (the A9 gate), and
-- tests/live-hash-drift.mjs tracked only names a migration writes literally, so the renamed body was measured by nobody.
--
-- ── THE FIX ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- (1) tests/schema-apply-order.json (and tests/pglite-chain.mjs) apply clan-governance BEFORE bonus-rebase, as production did. Production
--     is not touched: it already runs the intended body.
-- (2) tests/live-hash-drift.mjs measures EVERY public function the chain builds or production carries (rule `catalog`), so a body
--     made by a rename, by schema.sql or by format() is tracked like one a migration writes.
-- (3) This file: the rebuilt body must be production's, byte for byte (normalised), and its ladder the rebased one.
--
-- WHY THE BODY STILL MATTERS: the clan doors are closed (2027-01-18-dead-surfaces-cut.sql §3 revoked execute from every client role and
-- service_role), so no player can reach it today. A rebuild that revived the clans would otherwise revive them at 4.5x the ruled XP.
--
-- REVERSIBILITY: delete this file and its order entry; nothing was written. The order swap is undone by swapping the two lines back,
-- which rebuilds the old ladder (that is the bug).
-- ════════════════════════════════════════════════════════════════════════

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED. Reads only. ─────────────────────────────────────────────────────────────────────
do $$
declare
  c_sig    constant text := 'public.clan_feast_call__ungated(uuid)';
  c_door   constant text := 'public.clan_feast_call(uuid)';
  -- production's body, measured read-only 2026-11-14 with tests/live-hash-drift.mjs's normalisation
  c_md5    constant text := '20a039c0a533d3f4ca252fcb4af47cc2';
  c_ladder constant numeric[] := array[0.01, 0.02, 0.03, 0.04];   -- tavern levels 1-3, 4-6, 7-9, 10+
  v_def    text;
  v_m      text[];
  v_got    numeric[];
  v_role   text;
  v_fn     text;
begin
  if to_regprocedure(c_sig) is null then
    raise exception 'feast-call-ladder §(a): % is missing', c_sig; end if;
  v_def := pg_get_functiondef(c_sig::regprocedure);

  -- (a) the ladder: exactly one all_xp case, rebased (Tyler 2026-08-09), rising with the Tavern level
  v_m := regexp_match(v_def,
    $re$'all_xp',[[:space:]]*case[[:space:]]+when[[:space:]]+v_lv[[:space:]]*>=[[:space:]]*10[[:space:]]+then[[:space:]]+([0-9.]+)[[:space:]]+when[[:space:]]+v_lv[[:space:]]*>=[[:space:]]*7[[:space:]]+then[[:space:]]+([0-9.]+)[[:space:]]+when[[:space:]]+v_lv[[:space:]]*>=[[:space:]]*4[[:space:]]+then[[:space:]]+([0-9.]+)[[:space:]]+else[[:space:]]+([0-9.]+)[[:space:]]+end$re$);
  if v_m is null then
    raise exception 'feast-call-ladder §(a): % has no readable all_xp ladder', c_sig; end if;
  if (select count(*) from regexp_matches(v_def, $re$'all_xp'$re$, 'g')) <> 1 then
    raise exception 'feast-call-ladder §(a): % names all_xp more than once', c_sig; end if;
  v_got := array[v_m[4]::numeric, v_m[3]::numeric, v_m[2]::numeric, v_m[1]::numeric];
  if v_got is distinct from c_ladder then
    raise exception 'feast-call-ladder §(a): the feast pays all_xp % by Tavern level, the ruled ladder is %: 2026-08-09-bonus-rebase.sql must apply AFTER 2026-08-09-clan-governance.sql',
      v_got, c_ladder; end if;

  -- (b) both 2026-08-09 changes are carried: the vice gate (governance) beside the rebased ladder
  if position('hr_clan_may_post' in v_def) = 0 then
    raise exception 'feast-call-ladder §(b): % lost the vice gate (hr_clan_may_post)', c_sig; end if;

  -- (c) the whole body is production's (whitespace collapsed by the POSIX class, as tests/live-hash-drift.mjs hashes it)
  if md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')) <> c_md5 then
    raise exception 'feast-call-ladder §(c): % is md5 %, production runs %', c_sig,
      md5(regexp_replace(v_def, '[[:space:]]+', ' ', 'g')), c_md5; end if;

  -- (d) the door stays shut: no client role and not service_role may execute either half (2027-01-18-dead-surfaces-cut.sql §3)
  foreach v_fn in array array[c_sig, c_door] loop
    if to_regprocedure(v_fn) is null then
      raise exception 'feast-call-ladder §(d): % is missing', v_fn; end if;
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if has_function_privilege(v_role, v_fn, 'execute') then
        raise exception 'feast-call-ladder §(d): % can execute %', v_role, v_fn; end if;
    end loop;
  end loop;

  raise notice 'FEAST CALL LADDER OK: all_xp 0.01-0.04 by Tavern level, vice gate kept, body = production md5 %, no client door', c_md5;
end $$;
