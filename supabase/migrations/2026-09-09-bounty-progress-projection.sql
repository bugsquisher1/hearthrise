-- 2026-09-09-bounty-progress-projection.sql
--
-- ⚠⚠⚠ STAGED — REVIEW ONLY, NOT AUTO-APPLIED. ⚠⚠⚠
-- ⚠ SECURITY REVIEW REQUIRED before apply. It installs NO new verb, moves NO
--   value and grants NO execute: it adds ONE READ-ONLY key to the hr_state_of
--   envelope. It is nonetheless routed through Security because the number it
--   projects is the one that gates a MARKS turn-in (hr_claim_bounty), and the
--   review has to satisfy itself that projecting it cannot become authoring it.
--
--   APPLY AFTER: 2026-08-23-bounty.sql (active_bounty, hr_bounty_kills) and the
--   whole hr_state_of patch chain (LAST in tests/schema-apply-order.json, after
--   the 2026-09-12-worker-hired-at-projection.sql position). §0 fails closed.
--   Depended on by nothing.
--
-- ══════════════════════════════════════════════════════════════════════════
-- FOUND BY PLAYING (QA account, 2026-09-09 15:50 UTC) — THE LOOP GAP
-- ══════════════════════════════════════════════════════════════════════════
-- Accepted "Normal Cull — Mandrake, defeat 20" at 15:11:55 and fought Mandrakes
-- for ~40 minutes with the tab in the BACKGROUND. Server after:
--     ev:kill_monster:mandrake   = 218   (settled / away kills — REAL kills)
--     ev:kill_credited:mandrake  =   7   (the renown double-count discount, i.e.
--                                         only 7 kills ever came through the
--                                         attended hr_credit_kills cadence)
-- and the Bounty Board still read 9/20.
--
-- ── THE DIAGNOSIS: THE SERVER RULE IS ALREADY RIGHT; THE CLIENT IS BLIND ────
-- The brief asked whether to CHANGE the completion rule to read `kill_monster`
-- minus baseline. It already does, and has since 2026-08-23:
--     hr_bounty_kills(user,slot,target) = player_progress stat
--                                         'ev:kill_monster:'||target   (lifetime)
--     hr_claim_bounty  progress := hr_bounty_kills(...) - active_bounty.baseline
-- and `baseline` is snapshotted by hr_accept_bounty at accept. The away/settle
-- path in supabase/functions/hr-accrue/accrual.js writes that very counter
-- (src/core/combat-sim.js emits updateQuest('kill_monster',1,{target})). So a
-- settled kill DOES count toward the turn-in today. `ev:kill_credited:*` is the
-- renown faucet's anti-double-count ledger (2026-09-02-renown-kill-faucet.sql)
-- and gates NOTHING about a bounty.
--
-- What is actually broken is that the CLIENT cannot see the number:
--   · the bar renders `G.bountyHunter.active.progress`, a client-local counter
--     incremented in handleBountyKill() on ATTENDED kills only (src/legacy.js);
--   · hr_state_of DELIBERATELY EXCLUDES `ev:kill_monster:%` from the `progress`
--     array (the bestiary is served by hr_bestiary_of to stay under the 1000-row
--     envelope cap), so no envelope has ever carried the counter;
--   · nothing else reads progress back except hr_credit_kills' return value,
--     which the client only calls on an attended kill.
-- Net effect for a semi-idle game: the player who leaves the fight running comes
-- back with 800 real kills and a bar frozen at 9/20, never fires the turn-in,
-- and never collects Marks the server would already have paid. The reward was
-- earned and is invisible — the worst shape a reward can take.
--
-- ── THE FIX (Designer ruling, final authority) ─────────────────────────────
-- Do NOT change the completion rule — it is correct. PROJECT it. hr_state_of
-- gains one key, `bounty`, carrying the active contract and the server's own
-- progress arithmetic:
--     progress = greatest(0, hr_bounty_kills(target) - baseline)
-- so the client renders the truth it is already being judged against, and the
-- existing two-phase turn-in fires on the return envelope instead of waiting for
-- an attended kill that may never come. NULL when there is no active bounty.
--
-- ── WHY A PROJECTION AND NOT A NEW RPC ─────────────────────────────────────
-- The number must be fresh at exactly the moment the settle lands it, which is
-- the accrue response itself. A separate read verb would be one more round trip,
-- one more rate-limit bucket and one more chance to be stale. One key on the
-- envelope the client already applies is strictly smaller.
--
-- ── ECONOMY / EXPLOIT REVIEW (mine; Security's is the binding one) ──────────
-- This file opens NO new faucet — every kill it surfaces was already counted by
-- hr_claim_bounty. What it changes is that players will now actually CLAIM the
-- bounties they finished away. That is the intended idle promise, and the Marks
-- rate stays clamped by three server-side facts:
--   1. ONE active bounty per character (active_bounty PK is (user_id, slot)), so
--      a 24 h absence completes at most ONE contract — away time does not
--      multiply Marks, it merely stops WASTING them.
--   2. Accept and claim are both manual RPCs behind hr_rpc_gate's 12/min arm;
--      there is no auto-chain that could turn an absence into N turn-ins.
--   3. The away kills themselves are SERVER-simulated (accrual.js, auto-eat-only
--      survival, real food consumption, recovery clocks) and unforgeable — the
--      client authors none of them. Nothing here touches hr_credit_kills or its
--      plausibility cap, which remains the only client-fed path into the counter.
-- Against the Elite shop (Auto-Eat II = 100 Marks), a tier-1 normal cull pays 6:
--   ~17 contracts, i.e. ~17 accept/claim cycles, unchanged by this file.
-- The one thing it must not do is let the client AUTHOR progress. It cannot:
--   active_bounty is SELECT-only to browser roles (GATE(b) of 2026-08-23), the
--   counter lives in player_progress which is RPC/engine-written, and this file
--   adds no policy, no grant and no verb. §2 asserts all three.
--
-- RESTATEMENT-DEBT-ACK: hr_state_of is now SEVENTEEN anchored patches deep since
-- the last full restatement (2026-08-26-marks-record.sql), and this file makes it
-- eighteen. The right fix is a restatement, and it is deliberately NOT done here:
-- a correct restatement must be authored from `pg_get_functiondef` of the LIVE
-- body (the only text that is actually running), which no agent can read — agents
-- never touch production, and the repo's own replay is a reconstruction, not the
-- live body. Restating from the repo would silently DELETE any projection that
-- exists live and nowhere in a file, which is exactly the drift class
-- tests/schema-drift.mjs says it is structurally blind to (blind spot A). So this
-- file takes the same route 2026-09-10-dungeon-scrip.sql and
-- 2026-09-12-worker-hired-at-projection.sql took: one programmatic, anchored,
-- exactly-once splice that RAISES rather than no-ops if the anchor is not what it
-- was derived against — the guard's stated failure mode (a patch that matches
-- nothing and no-ops in silence) cannot occur here, and §2 GATE(a) re-reads the
-- installed body to prove the key landed and the neighbours survived.
-- HANDOFF (Backend Architect, P2): restate hr_state_of once, from the live
-- functiondef, as a Coordinator-run measure-then-author pass. It is one function
-- and it is now the most-patched body in the schema.
--
-- REVERSIBILITY: re-apply the previous hr_state_of body (the projection is one
-- spliced key; removing it removes the feature and nothing else). Additive.
-- NO Edge redeploy: the accrual shell does not read `env.bounty`.
--
-- ── THE CLIENT HALF (NOT IN THIS FILE) ─────────────────────────────────────
-- src/legacy.js bountyProgressText()/renderBountyBoard()/repaintBounty() read
-- `min(b.progress, b.required)`. They must prefer the envelope's
-- `bounty.progress` when the active bounty ids match (b._serverConfirmed already
-- exists for exactly this and is only fed by the attended cadence), and the
-- envelope-apply path must schedule the existing two-phase turn-in when
-- progress >= required. Ships via lane A/B AFTER this apply; it is safe to ship
-- before, after or without it, because a missing `bounty` key reads as absent
-- and the client falls back to today's local counter.
-- ══════════════════════════════════════════════════════════════════════════

-- ── 0. Preconditions — FAIL CLOSED ─────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.hr_state_of(uuid,int)') is null then
    raise exception 'hr_state_of is missing — apply the player-state chain first'; end if;
  if to_regclass('public.active_bounty') is null then
    raise exception 'active_bounty missing — apply 2026-08-23-bounty.sql first'; end if;
  if to_regprocedure('public.hr_bounty_kills(uuid,int,text)') is null then
    raise exception 'hr_bounty_kills not found — apply 2026-08-23-bounty.sql first'; end if;
  if to_regprocedure('public.hr_claim_bounty__ungated(int)') is null then
    raise exception 'hr_claim_bounty__ungated not found — apply 2026-08-23-bounty.sql first'; end if;
  if to_regprocedure('public.hr_accept_bounty__ungated(int,text,text,text,text,bigint)') is null then
    raise exception 'hr_accept_bounty__ungated not found (or its signature moved) — apply the '
                    'bounty chain first'; end if;
  if to_regclass('public.hr_bounty_monsters') is null then
    raise exception 'hr_bounty_monsters missing — apply 2026-08-23-bounty-monsters.generated.sql first';
  end if;
end $$;

-- ── 1. hr_state_of — PROJECT THE ACTIVE BOUNTY + SERVER PROGRESS ───────────
-- pg_get_functiondef + a guarded exactly-once anchor replace (the
-- 2026-09-12-worker-hired-at-projection.sql idiom), so this file never restates
-- a body it did not author and cannot delete another file's projection.
do $$
declare
  v_def text;
  c_anchor constant text := $anc$'total_level', public.hr_total_level(p_user, v_st.slot),$anc$;
begin
  v_def := replace(pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure), chr(13), '');
  if strpos(v_def, $q$'bounty', (select jsonb_build_object($q$) > 0 then
    raise notice 'hr_state_of already projects bounty — patch skipped'; return; end if;
  if (length(v_def) - length(replace(v_def, c_anchor, ''))) <> length(c_anchor) then
    raise exception 'the LIVE hr_state_of total_level anchor did not match exactly once — its '
                    'shape is not the one this file was derived against. Do NOT patch a body you '
                    'cannot account for.';
  end if;
  v_def := replace(v_def, c_anchor, c_anchor || $new$
    -- THE ACTIVE BOUNTY, AND THE SERVER'S OWN PROGRESS ARITHMETIC (2026-09-09).
    -- `progress` is the SAME expression hr_claim_bounty judges the turn-in by:
    -- hr_bounty_kills(target) - baseline, i.e. kills since accept, counting the
    -- away/settle kills the client cannot see (ev:kill_monster:% is excluded
    -- from the `progress` array on purpose — the bestiary is hr_bestiary_of's).
    -- Display + turn-in trigger only; the client authors none of it, and
    -- active_bounty is SELECT-only to browser roles. NULL = no active contract.
    'bounty', (select jsonb_build_object(
                 'bounty_id',   b.bounty_id,
                 'b_type',      b.b_type,
                 'difficulty',  b.difficulty,
                 'target',      b.target,
                 'tier',        b.tier,
                 'required',    b.required,
                 'baseline',    b.baseline,
                 'accepted_at', b.accepted_at,
                 'kills_now',   k.v,
                 'progress',    greatest(0, k.v - b.baseline))
                 from public.active_bounty b
                 cross join lateral (select public.hr_bounty_kills(p_user, v_st.slot, b.target) as v) k
                where b.user_id = p_user and b.slot = v_st.slot),$new$);
  execute v_def;
  raise notice 'hr_state_of patched: the envelope projects the active bounty and its server progress';
end $$;
-- create-or-replace preserves an ACL; be explicit anyway. No client executes it.
revoke execute on function public.hr_state_of(uuid, int)
  from public, anon, authenticated, service_role;
grant  execute on function public.hr_state_of(uuid, int) to hr_engine;

-- ── 2. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────
-- Proves the load-bearing properties by EXECUTING them: accept → SETTLED kills
-- (written the way accrual.js writes them, straight onto ev:kill_monster, with
-- NO hr_credit_kills call anywhere) → the envelope shows the progress → the
-- turn-in pays. Apply is atomic, so a raise reverts §1. The row-writing probe
-- lives in a subtransaction discarded by a sentinel raise (HR821), so this block
-- is net-zero on production.
do $$
declare
  v_def  text;
  v_bad  text;
  v_st   jsonb;
  v_b    jsonb;
  v      jsonb;
  v_t1   text;
  v_base bigint;
  v_req  bigint;
  v_m0   bigint;
  v_m1   bigint;
  v_uid  constant uuid := '000000b1-0000-0000-0000-0000000000b1';
  v_slot constant int := 0;
begin
  -- (a) THE PROJECTION IS IN THE BODY, and the anchor it spliced into survived.
  select prosrc into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_state_of';
  if position($q$'bounty', (select jsonb_build_object($q$ in v_def) = 0 then
    raise exception 'GATE(a): hr_state_of does not project bounty'; end if;
  if position($q$'total_level', public.hr_total_level(p_user, v_st.slot)$q$ in v_def) = 0 then
    raise exception 'GATE(a): the splice DESTROYED the total_level projection'; end if;
  if position($q$'skills'$q$ in v_def) = 0 or position($q$'inventory'$q$ in v_def) = 0
     or position($q$'workers'$q$ in v_def) = 0 or position($q$'farm'$q$ in v_def) = 0 then
    raise exception 'GATE(a): the splice damaged the envelope — a core projection is gone';
  end if;

  -- (b) THE PROGRESS EXPRESSION IS THE TURN-IN'S. If these two ever diverge the
  --     bar becomes a lie again, in the OTHER direction (a full bar that will
  --     not pay), which is the b503 "completed, 0 marks" report. Both must read
  --     hr_bounty_kills and subtract active_bounty.baseline.
  if position('hr_bounty_kills' in v_def) = 0 then
    raise exception 'GATE(b): the projection does not read hr_bounty_kills — it invented a second '
                    'progress source, and the bar would stop agreeing with hr_claim_bounty';
  end if;
  select prosrc into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_claim_bounty__ungated';
  if position('hr_bounty_kills' in v_bad) = 0 or position('v_ab.baseline' in v_bad) = 0 then
    raise exception 'GATE(b): hr_claim_bounty__ungated no longer judges progress as '
                    'hr_bounty_kills - baseline; this projection would disagree with the payer';
  end if;

  -- (c) NO CLIENT WRITE SURFACE was opened on active_bounty. RLS on, and every
  --     policy reachable by a browser role is SELECT — so a forged baseline (and
  --     therefore a forged bounty completion) stays impossible. polcmd: 'r'
  --     select, 'a' insert, 'w' update, 'd' delete, '*' all; polroles '{0}' is
  --     PUBLIC.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'active_bounty' and c.relrowsecurity) then
    raise exception 'GATE(c): RLS is OFF on active_bounty — the baseline is client-forgeable';
  end if;
  select string_agg(polname || ':' || polcmd::text, ', ') into v_bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'active_bounty' and p.polcmd <> 'r'
     and (p.polroles = '{0}'::oid[]
          or p.polroles && (select coalesce(array_agg(oid), '{}'::oid[]) from pg_roles
                             where rolname in ('anon', 'authenticated', 'public')));
  if v_bad is not null then
    raise exception 'GATE(c): a NON-SELECT RLS policy on active_bounty is reachable by a browser '
                    'role (%) — the bounty baseline would be player-authored', v_bad;
  end if;
  select string_agg(grantee || ':' || privilege_type, ', ') into v_bad
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'active_bounty'
     and grantee in ('anon', 'authenticated', 'PUBLIC') and privilege_type <> 'SELECT';
  if v_bad is not null then
    raise exception 'GATE(c): a client WRITE GRANT exists on active_bounty (%)', v_bad;
  end if;

  -- (d) EXECUTED, END TO END: accept → SETTLED kills only → envelope → claim.
  begin
    perform set_config('request.jwt.claim.sub', v_uid::text, true);
    insert into auth.users (id) values (v_uid) on conflict (id) do nothing;
    insert into public.player_state (user_id, slot, gold, gems, marks, version)
      values (v_uid, v_slot, 0, 0, 0, 1)
      on conflict (user_id, slot) do update set gold = 0, marks = 0, version = 1;
    insert into public.player_skills (user_id, slot, skill_id, xp)
      select v_uid, v_slot, s, 13034431
        from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
      on conflict do nothing;
    select monster_id into v_t1 from public.hr_bounty_monsters where tier = 1 order by monster_id limit 1;

    -- 500 PRE-EXISTING lifetime kills, exactly as the QA account had. They must
    -- never leak into the projected progress.
    insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
      values (v_uid, v_slot, 'stat', 'ev:kill_monster:' || v_t1, 500, '', 'active');

    -- No bounty yet → the key is present and JSON null (never absent, never 0/0,
    -- which the client would have to guess at).
    v_st := public.hr_state_of(v_uid, v_slot);
    if not (v_st ? 'bounty') then
      raise exception 'GATE(d): the envelope omits the bounty key entirely'; end if;
    if jsonb_typeof(v_st->'bounty') <> 'null' then
      raise exception 'GATE(d): no active bounty but the envelope projected %', v_st->'bounty'; end if;

    v := public.hr_accept_bounty__ungated(v_slot, 'bpp1', v_t1, 'cull', 'easy', 999);
    if coalesce(v->>'ok','') <> 'true' then raise exception 'GATE(d): accept failed: %', v; end if;
    v_base := (v->>'baseline')::bigint;
    v_req  := (v->>'required')::bigint;
    if v_base <> 500 then raise exception 'GATE(d): baseline was % (expected 500)', v_base; end if;

    -- Freshly accepted: the projection must read 0/required, NOT the 500 lifetime.
    v_b := public.hr_state_of(v_uid, v_slot)->'bounty';
    if v_b is null or jsonb_typeof(v_b) = 'null' then
      raise exception 'GATE(d): an accepted bounty is not projected'; end if;
    if (v_b->>'progress')::bigint <> 0 then
      raise exception 'GATE(d): PRE-EXISTING kills leaked into the projected progress (% of %) — '
                      'the bar would start full', v_b->>'progress', v_req; end if;
    if (v_b->>'required')::bigint <> v_req or (v_b->>'target') <> v_t1
       or (v_b->>'baseline')::bigint <> 500 or (v_b->>'kills_now')::bigint <> 500
       or (v_b->>'bounty_id') <> 'bpp1' or (v_b->>'accepted_at') is null then
      raise exception 'GATE(d): the projected contract does not match the accepted one: %', v_b; end if;

    -- ── THE BUG THIS FILE EXISTS FOR ──────────────────────────────────────
    -- SETTLED kills: the away/accrual writer raises ev:kill_monster directly.
    -- hr_credit_kills is NOT called — this is precisely the backgrounded-tab
    -- case where the attended cadence never fires (kill_credited stayed at 7
    -- while kill_monster reached 218). Overshoot the requirement, as a real
    -- 40-minute absence does.
    update public.player_progress set value = 500 + v_req + 37
     where user_id = v_uid and slot = v_slot and kind = 'stat' and period_key = ''
       and key = 'ev:kill_monster:' || v_t1;

    v_b := public.hr_state_of(v_uid, v_slot)->'bounty';
    if (v_b->>'progress')::bigint <> v_req + 37 then
      raise exception 'GATE(d): settled kills did NOT reach the envelope — projected progress % '
                      '(expected %). This is the whole point of the file.',
                      v_b->>'progress', v_req + 37;
    end if;
    if (v_b->>'progress')::bigint < (v_b->>'required')::bigint then
      raise exception 'GATE(d): the projection would not let the client fire the turn-in'; end if;

    -- And the payer AGREES: the same state that shows a full bar pays out.
    select marks into v_m0 from public.player_state where user_id = v_uid and slot = v_slot;
    v := public.hr_claim_bounty__ungated(v_slot);
    if coalesce(v->>'ok','') <> 'true' then
      raise exception 'GATE(d): the envelope showed a complete bounty and the turn-in refused: %', v; end if;
    select marks into v_m1 from public.player_state where user_id = v_uid and slot = v_slot;
    if v_m1 <= v_m0 then raise exception 'GATE(d): turn-in paid no marks (% -> %)', v_m0, v_m1; end if;

    -- Consumed → the projection goes back to null (no ghost contract on the board).
    v_st := public.hr_state_of(v_uid, v_slot);
    if jsonb_typeof(v_st->'bounty') <> 'null' then
      raise exception 'GATE(d): the claimed bounty is still projected: %', v_st->'bounty'; end if;

    -- The rest of the envelope still works after the splice.
    if coalesce((v_st->>'ok')::boolean, false) is not true
       or (v_st->'state') is null or (v_st->'skills') is null then
      raise exception 'GATE(d): the envelope is malformed after the splice'; end if;

    raise exception using errcode = 'HR821', message = 'bounty-progress-projection §2 complete — rolling back';
  exception when sqlstate 'HR821' then null;
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  if exists (select 1 from public.active_bounty     where user_id = v_uid)
     or exists (select 1 from public.player_progress where user_id = v_uid)
     or exists (select 1 from public.player_skills   where user_id = v_uid)
     or exists (select 1 from public.player_ledger   where user_id = v_uid)
     or exists (select 1 from public.player_state    where user_id = v_uid)
     or exists (select 1 from auth.users where id = v_uid) then
    raise exception 'GATE: §2 LEAKED a probe row'; end if;

  raise notice 'bounty-progress-projection: hr_state_of carries the active bounty and the SETTLED '
               'kill progress the turn-in judges by; pre-existing kills excluded; no client write '
               'on active_bounty; envelope intact — all green';
end $$;
