-- ════════════════════════════════════════════════════════════════════════
-- 2027-03-30-dead-writes.sql — TWO WRITES NOTHING READS STOP RIDING EVERY SETTLE (lane/c-dead-writes, reliability-engineer,
--   2026-11-10; Tyler 2026-11-09 audit priority: stop dead systems that run every settle, switch off what a plan still
--   needs, cut only what no plan uses). Evidence: .claude/coordination/hunt-path-baseline-2026-11-10.md, finding 2.
--
-- STATUS: STAGED, NOT APPLIED. The Coordinator applies (tools/apply-migration.mjs, one file, never inside begin/commit).
-- Pre-EA: applies on its passing §4. ON THE EA SECURITY LIST (hr_apply, the economy's one write path). DB-ONLY: no hr-accrue
-- change (pack-edge --hash unmoved), no client change. ORDER: after 2027-03-21-feature-switches.sql; independent of every
-- 2027-03-27 / -28 / -29 file (it reads none of them, and its anchors pin only the lines it changes).
-- RESTATEMENT-DEBT-ACK: hr_apply (158k chars, 13 splices deep since 2026-10-27-core-bodies.sql) takes three anchored edits, each matched exactly once: a whole restatement would overwrite any hr_apply splice a lane in flight lands first, and this file has to apply in either order with them. The restatement is its own lane.
--
-- ── WHAT STOPS, AND WHY (measured on production 2026-11-10 09:33 UTC, SELECT only) ──────────────
-- 1. THE RENOWN RATCHET AND ITS JOURNAL: STOPPED. hr_apply raised player_state.renown_high from hr_renown_of on every
--    apply and wrote one player_ledger row (kind renown, intent renown_ratchet) a raise: 51,802 of the ledger's 347,822
--    rows (14.9%), 2,158 in the last 24 h, on 1,823 of 1,828 member settles in the local 12 h party run. The row is the
--    audit trail of hr_claim_rank (2026-09-12, Security C2), and that claim was dropped by 2026-12-02-old-rewards-cut.sql.
--    NOTHING READS EITHER: no function, view, trigger, policy or cron job reads a renown ledger row; renown_high is
--    projected by hr_state_of and read by no file under src/ or supabase/functions/; the Leaderboards list renown as
--    unsourced (hr_lb_unsourced); the engine dropped the renown perk on 2026-10-14 (src/core/perks.js normalisePerkState).
--    No plan uses it (rulings 2026-10-22: old-client rewards come back only as a new design). Both writes go together:
--    a mark that kept rising with no journal would break C2 for whatever claim came next. The column, hr_renown_of and
--    the history stay.
-- 2. THE COLLECTION COUNTER: SWITCHED OFF, NOT CUT. The engine sends one `stat ev:loot:<item>` progress op a looted item
--    kind (src/core/goals.js collectionProgressOps): 3.6 of a lone settle's 33 row writes, 14.7 of a party's 132 (11%),
--    1,641 of player_progress's 2,477 rows and most of its 452,225 updates. Its readers are hr_collection_of (the edge
--    counts it into an answer key no client file reads) and hr_renown_of (item 1). The 2026-10-22 cut KEPT every `ev:`
--    counter for a redesigned reward, so the write goes behind a feature switch, `collection_log`, seeded OFF: hr_apply
--    still checks the op like any other and stores it only while the switch is on for the account. Turning it on is one
--    row (2027-03-21-feature-switches.sql "HOW A SWITCH MOVES"); the engine keeps counting, so nothing else has to ship.
--
-- ── WHAT DOES NOT CHANGE ───────────────────────────────────────────────────
-- Gold, Level XP, skill XP, items, the hunt bag, stamina, deaths, every other progress row, every refusal and every other
-- ledger row. Proved on the four baseline scenarios by running each commit twice from the same state, production's
-- hr_apply against this file's (tools/qa/hunt-path-baseline.local.mjs --ab): every table the commit writes is identical
-- row for row apart from the two writes above, renown_high and row ids.
-- EXISTING ROWS ARE NOT TOUCHED. No delete, no update of history: the ledger's 90-day prune (hr_ledger_prune) retires the
-- renown rows on its own schedule, and the ev:loot rows stay as the counter's starting point if the switch comes on.
--
-- ── EXPLOIT SURFACE DELTA ───────────────────────────────────────────────────
-- None added. hr_apply stays hr_engine-only; hr_feature_on is owner-only and is called from inside the definer body. A
-- switch gates a write, never a number: with it on, the op is clamped and stored exactly as before. No grant, RPC, policy
-- or table.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
-- Under hr_apply's character lock, as before; one PK read of hr_feature_switches an apply that carries a loot op. Intent
-- keys untouched. A second apply: §1 is `on conflict do nothing` (it never reverts the Coordinator's flip), §2's marker
-- skips the splice (byte-identical).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
-- Reverse §2's three anchors on hr_apply (a[i] and r[i] swapped; the pre-image is the a[] array below, whole). The switch
-- row may stay. No column, row or value moves, so nothing is lost either way; a mark restored later starts from its last
-- journalled value and the next raise journals the gap in one row.
-- COST: saves two row writes a member settle (the mark's update, its ledger row) and one hr_renown_of call, plus one
-- upsert a looted item kind. Adds one PK read. No begin/commit (CLAUDE.md §2).
-- ════════════════════════════════════════════════════════════════════════

-- ── §0 PRECONDITIONS ─────────────────────────────────────────────────────────
do $mig$
begin
  if to_regclass('public.hr_feature_switches') is null or to_regprocedure('public.hr_feature_on(text,uuid)') is null then
    raise exception 'PRECONDITION: apply 2027-03-21-feature-switches.sql first (the switch home)'; end if;
  if to_regprocedure('public.hr_apply(uuid,integer,bigint,uuid,jsonb)') is null then
    raise exception 'PRECONDITION: hr_apply is missing'; end if;
  -- The journal is safe to stop only because the claim it audits is gone, from the database and from the client surface.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname like 'hr\_claim\_rank%')
     or exists (select 1 from public.hr_client_rpc_baseline b where b.proname like 'hr\_claim\_rank%') then
    raise exception 'PRECONDITION: hr_claim_rank still exists - the renown journal is its audit trail and stays'; end if;
end $mig$;

-- ── §1 THE SWITCH (off; `on conflict do nothing`, so a re-apply never reverts the Coordinator's flip) ─────────────
insert into public.hr_feature_switches (switch_id, scope, note) values
  ('collection_log', 'off', '2027-03-30-dead-writes.sql: whose settles store the collection counter (player_progress stat ev:loot:<item>). Off: hr_apply checks the op and writes nothing. Turn it on before a collection log ships; the rows written before the switch are kept.')
  on conflict (switch_id) do nothing;

-- ── §2 hr_apply: THREE ANCHORED EDITS (a[i] is the pre-image, verbatim; r[i] replaces it) ────────────────────────
--   1  a declaration: v_collect
--   2  the progress loop: a loot op is stored only while `collection_log` is on for the account
--   3  the renown block (57 lines: the ratchet, its subtransaction, its journal row) becomes a four-line note
do $mig$
declare
  v_def text; v_n int;
  a constant text[] := array[
$a$  v_prog jsonb;
$a$,
$a$        insert into public.player_progress as pp
          (user_id, slot, kind, key, period_key, value, state, updated_at)
$a$,
$a$    -- ── THE SERVER'S COUNTED RENOWN, RATCHETED HERE (2026-09-12) ─────────
    --    introduced by 2026-09-12-renown-high-projection.sql
    -- hr_claim_rank has always ratcheted `renown_high = greatest(renown_high,
    -- hr_renown_of(...))` and then decided the rank against it. Doing it ONLY at
    -- claim time left the number dark between claims, so the envelope had
    -- nothing honest to project and the headline fell back to the last PAID
    -- rank's threshold (measured live: 400 shown, 779 counted).
    --
    -- SOURCE: hr_renown_of, server-derived, client-credited kills already
    -- subtracted. NOTHING is read from p_delta — no client value reaches this
    -- statement, and the delta the engine proposed cannot influence it.
    -- DELIBERATELY NO `version = version + 1` and NO `updated_at = now()`: the
    -- apply owns the version bump, and a second bump here would manufacture
    -- version_conflict refusals against the very client that just settled.
    --
    -- ⚠ C1 (Security, 2026-09-12) — ITS OWN SUBTRANSACTION, AND IT IS NOT
    --   ALLOWED TO FAIL THE SETTLE. Bare, this sat inside hr_apply's
    --   write-bearing block above the handlers, so ANY raise inside
    --   hr_renown_of landed in the bad_delta handler and rolled back the WHOLE
    --   delta. hr_renown_of reads `streak_days` off a by-name whole-row cast of
    --   a column Slice 3 owns; the reviewer injected the same shape on
    --   `streak_day_key` and a 7,777-gold PAID settle came back ok:false with
    --   the gold unchanged. A DISPLAY high-water must never be able to eat a
    --   player's earnings, so the block swallows its own failure and the settle
    --   proceeds with a stale — never wrong — renown figure.
    --
    -- ⚠ RAISE-ONLY IN THE WHERE, not greatest() in the SET. Same monotonic
    --   result, but now `found` means EXACTLY "the high-water moved", which is
    --   what C2's journal keys on — and it removes the write amplification of
    --   rewriting the row on every apply when nothing changed.
    begin
      declare
        v_rh bigint;
      begin
        update public.player_state ps
           set renown_high = r.v
          from (select coalesce(public.hr_renown_of(v_uid, v_slot), 0) as v) r
         where ps.user_id = v_uid and ps.slot = v_slot
           and coalesce(ps.renown_high, 0) < r.v
        returning ps.renown_high into v_rh;
        -- ⚠ C2 (Security) — ONE LEDGER ROW PER REAL RAISE, AND ONLY PER RAISE.
        --   renown_high has no lowering path anywhere (every writer is a
        --   ratchet), and hr_claim_rank pays up to 1,000,000 gold + 500 gems
        --   against it, so an inflation that is never journalled is both
        --   undetectable and irreversible. This is the audit trail. It is NOT a
        --   per-tick log: a no-op apply updates no row, `found` is false, and
        --   nothing is written — which is the whole reason the raise-only WHERE
        --   above replaced greatest().
        if found then
          insert into public.player_ledger (user_id, slot, kind, intent, meta)
          values (v_uid, v_slot, 'renown', 'renown_ratchet',
                  jsonb_build_object('to', v_rh, 'intent_id', p_intent_id));
        end if;
      end;
    exception when others then
      raise warning 'renown ratchet skipped for %/%: %', v_uid, v_slot, sqlerrm;
    end;
$a$];
  r constant text[] := array[
$a$  v_prog jsonb;
  -- DEAD-WRITES (2027-03-30-dead-writes.sql): is the collection counter stored for this account? Read once an apply, on its first loot op.
  v_collect boolean;
$a$,
$a$        -- DEAD-WRITES: the collection counter (`ev:loot:<item>`, src/core/goals.js) is stored only while the `collection_log`
        -- feature switch is on for the account. Off, the op was checked above like every other and is not written: nothing
        -- reads these rows today, and the switch brings the counter back with no deploy.
        if v_prog->>'kind' = 'stat' and left(v_prog->>'key', 8) = 'ev:loot:' then
          if v_collect is null then v_collect := public.hr_feature_on('collection_log', v_uid); end if;
          if not v_collect then continue; end if;
        end if;
        insert into public.player_progress as pp
          (user_id, slot, kind, key, period_key, value, state, updated_at)
$a$,
$a$    -- ── RENOWN: NO RATCHET AND NO JOURNAL ROW (DEAD-WRITES, 2027-03-30-dead-writes.sql) ──
    --    The 2026-09-12 block here raised player_state.renown_high on every apply and journalled each raise, as the audit
    --    trail of the rank claim. That claim was cut on 2026-12-02 and nothing reads the mark or its rows, so neither is
    --    written. The column keeps its last journalled value. A renown that returns is a new design with its own journal.
$a$];
begin
  v_def := replace(pg_get_functiondef('public.hr_apply(uuid,integer,bigint,uuid,jsonb)'::regprocedure), chr(13), '');
  if position('DEAD-WRITES' in v_def) > 0 then
    raise notice 'dead-writes §2: hr_apply already carries the edit - splice skipped'; return;
  end if;
  for i in 1 .. array_length(a, 1) loop
    v_n := (length(v_def) - length(replace(v_def, a[i], ''))) / length(a[i]);
    if v_n <> 1 then raise exception 'dead-writes §2: hr_apply anchor % matched % times (need 1): the body moved', i, v_n; end if;
    v_def := replace(v_def, a[i], r[i]);
  end loop;
  -- CREATE OR REPLACE keeps the function's grants; §3 states them again.
  execute v_def;
end $mig$;

-- ── §3 GRANTS (unchanged: the engine alone) ─────────────────────────────────
revoke all on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hr_apply(uuid, integer, bigint, uuid, jsonb) to hr_engine;

-- ── §4 SELF-CHECK (CLAUDE.md §4), EXECUTED, every probe row rolled back ──────
-- Fails on the pre-image: (a) by text, (b) a first apply raises the mark and journals it, and stores the loot op.
-- The engine-level proof on both doors (the tick = browser closed, the player's settle = hunt viewed) is
-- tests/hunt-sessions-settle.mjs DEAD-WRITES.
--   (a) the landed body: no ratchet, no journal row, no hr_renown_of call; the loot gate is there once
--   (b) switch off: an apply with a kill op and a loot op lands, the kill row is stored, the loot row is not, the mark
--       stays where it was with a score above it, and no renown row is journalled
--   (c) switch off: a loot op that breaks the clamp is refused exactly as before (the gate sits after every check)
--   (d) switch on: the same op is stored and adds up, and hr_collection_of reads it back
--   (e) grants: hr_engine alone
do $$
declare
  c_u    constant uuid := '000000d7-0000-4000-a000-0000dead0330';
  c_sig  constant text := 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)';
  v_def  text;
  v      jsonb;
  v_ver  bigint;
  v_item text;
  v_key  text;
  v_n    bigint;
  c_j    constant jsonb := jsonb_build_object('kind', 'admin', 'intent', 'probe');
begin
  -- (a)
  v_def := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), '');
  if position('renown_ratchet' in v_def) > 0 or position('hr_renown_of' in v_def) > 0 or position('set renown_high' in v_def) > 0
     or position($q$'renown'$q$ in v_def) > 0 then
    raise exception 'dead-writes §4(a): hr_apply still ratchets or journals renown'; end if;
  if (length(v_def) - length(replace(v_def, $q$public.hr_feature_on('collection_log', v_uid)$q$, ''))) / length($q$public.hr_feature_on('collection_log', v_uid)$q$) <> 1
     or position('if not v_collect then continue; end if;' in v_def) = 0 then
    raise exception 'dead-writes §4(a): hr_apply does not gate the loot op on collection_log exactly once'; end if;
  if not exists (select 1 from public.hr_feature_switches where switch_id = 'collection_log') then
    raise exception 'dead-writes §4(a): the collection_log switch row is missing'; end if;

  begin
    insert into auth.users (id) values (c_u) on conflict (id) do nothing;
    insert into public.hr_access_allowlist (user_id, note) values (c_u, 'dead-writes §4 probe') on conflict (user_id) do nothing;
    perform set_config('request.jwt.claim.sub', c_u::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception 'dead-writes §4-harness: hr_create_character refused: %', v; end if;
    update public.player_state set active_kind = 'idle', active_id = null where user_id = c_u and slot = 0;
    select i.item_id into v_item from public.hr_items i where i.item_id ~ '^[a-z0-9_]{1,56}$' order by i.item_id limit 1;
    v_key := 'ev:loot:' || v_item;
    if v_item is null or public.hr_renown_of(c_u, 0) <= coalesce((select renown_high from public.player_state where user_id = c_u and slot = 0), 0) then
      raise exception 'dead-writes §4-harness: no item id, or the probe hero scores no renown above its mark (the old ratchet would not move)'; end if;

    -- (b) OFF: the settle lands, the kill counter is stored, the loot counter is not, renown is neither raised nor journalled.
    update public.hr_feature_switches set scope = 'off', accounts = '{}' where switch_id = 'collection_log';
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('journal', c_j, 'progress', jsonb_build_array(
           jsonb_build_object('kind', 'stat', 'key', 'ev:kill_any', 'period', '', 'add', 100, 'state', 'active'),
           jsonb_build_object('kind', 'stat', 'key', v_key, 'period', '', 'add', 3, 'state', 'active'))));
    if coalesce(v->>'ok', '') <> 'true' then raise exception 'dead-writes §4(b): the apply answered %', v; end if;
    if coalesce((select value from public.player_progress where user_id = c_u and slot = 0 and kind = 'stat' and key = 'ev:kill_any' and period_key = ''), 0) <> 100 then
      raise exception 'dead-writes §4(b): the kill counter beside the loot op was not stored'; end if;
    if exists (select 1 from public.player_progress where user_id = c_u and key like 'ev:loot:%') then
      raise exception 'dead-writes §4(b): a loot counter row was written with the switch off'; end if;
    if exists (select 1 from public.player_ledger where user_id = c_u and kind = 'renown') then
      raise exception 'dead-writes §4(b): a renown row was journalled'; end if;
    if (select renown_high from public.player_state where user_id = c_u and slot = 0) <> 0 or public.hr_renown_of(c_u, 0) <= 0 then
      raise exception 'dead-writes §4(b): renown_high moved to % (score %)', (select renown_high from public.player_state where user_id = c_u and slot = 0), public.hr_renown_of(c_u, 0); end if;

    -- (c) OFF: the clamp still refuses a loot op, and nothing of the delta lands.
    select version into v_ver from public.player_state where user_id = c_u and slot = 0;
    v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('journal', c_j, 'progress', jsonb_build_array(
           jsonb_build_object('kind', 'stat', 'key', v_key, 'period', '', 'add', -1, 'state', 'active'))));
    if v->>'error' is distinct from 'progress_clamp' then raise exception 'dead-writes §4(c): a negative loot op answered %', v; end if;
    v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('journal', c_j, 'progress', jsonb_build_array(
           jsonb_build_object('kind', 'stat', 'key', v_key, 'period', '', 'add', 1, 'state', 'claimed'))));
    if v->>'error' is distinct from 'bad_progress_state' then raise exception 'dead-writes §4(c): a claimed loot op answered %', v; end if;

    -- (d) ON: the counter is back, adds up, and its read sees it.
    update public.hr_feature_switches set scope = 'everyone' where switch_id = 'collection_log';
    for i in 1 .. 2 loop
      select version into v_ver from public.player_state where user_id = c_u and slot = 0;
      v := public.hr_apply(c_u, 0, v_ver, gen_random_uuid(), jsonb_build_object('journal', c_j, 'progress', jsonb_build_array(
             jsonb_build_object('kind', 'stat', 'key', v_key, 'period', '', 'add', 3, 'state', 'active'))));
      if coalesce(v->>'ok', '') <> 'true' then raise exception 'dead-writes §4(d): the apply answered %', v; end if;
    end loop;
    select c.qty into v_n from public.hr_collection_of(c_u, 0) c where c.item_id = v_item;
    if v_n is distinct from 6 then raise exception 'dead-writes §4(d): with the switch on the loot counter reads % (expected 6)', v_n; end if;
    if exists (select 1 from public.player_ledger where user_id = c_u and kind = 'renown')
       or (select renown_high from public.player_state where user_id = c_u and slot = 0) <> 0 then
      raise exception 'dead-writes §4(d): renown moved with the switch on'; end if;
    raise exception 'dead-writes §4: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'dead-writes §4: ok' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.player_state where user_id = c_u) or exists (select 1 from public.player_progress where user_id = c_u) then
    raise exception 'dead-writes §4: LEAKED a probe row'; end if;

  -- (e)
  if has_function_privilege('anon', c_sig, 'execute') or has_function_privilege('authenticated', c_sig, 'execute')
     or has_function_privilege('service_role', c_sig, 'execute') or not has_function_privilege('hr_engine', c_sig, 'execute') then
    raise exception 'dead-writes §4(e): a grant moved on hr_apply'; end if;
  perform public.hr_assert_grant_hygiene(true);
  raise notice 'dead-writes: no renown ratchet or journal row, the collection counter stored only with collection_log on; all green';
end $$;
